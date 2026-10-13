"""
engine.py — แกนประมวลผลของเว็บแอพ (ทุกแบบในระบบเดียว)

ขั้นตอนต่อรูป:
  1) หาขอบงาน (method)   : auto -> alpha (PNG โปร่งใส) | solid (พื้นสีเรียบ) | ai (ภาพถ่าย) | none (ทั้งใบ)
  2) รูปร่างเส้นตัด (shape): contour (ตามทรง) | rect | rounded | circle | ellipse
  3) ระยะเส้นตัด (offset) : ค่าติดลบ = ตัดเข้าเนื้อ, ค่าบวก = เผื่อขอบ
  4) ขนาดจริง               : กำหนดขนาดชิ้นงานหลังตัด (ตามเส้นตัด) เป็น มม.
  5) เติมสี / ยืดสีขอบภาพออก (bleed) ถ้าต้องการ

เส้นทุกเส้นเก็บเป็น vector (Bezier) ในรูปแบบ:
  paths = [ {"start": (x, y), "segs": [("L", (x, y)) | ("C", (x1, y1), (x2, y2), (x, y)), ...]}, ... ]
"""
from __future__ import annotations

import math
import zlib
from types import SimpleNamespace

import cv2
import numpy as np
from PIL import Image, ImageColor

import cutout  # ใช้ฟังก์ชัน AI mask / clean mask / potrace ร่วมกับสคริปต์เดิม

KAPPA = 0.5522847498  # ค่าคงที่ประมาณวงกลมด้วย Bezier


# =====================================================================
# 1) ตรวจชนิดภาพ + mask ของแต่ละวิธี
# =====================================================================
def detect(rgba: np.ndarray) -> dict:
    """ดูภาพแล้วเลือกวิธีหาขอบงาน คืน {"method", "reason", "bg"}"""
    a = rgba[..., 3]
    if (a < 250).mean() > 0.005:
        return {"method": "alpha", "reason": "ไฟล์มีพื้นโปร่งใสอยู่แล้ว", "bg": None}

    rgb = rgba[..., :3].astype(np.int16)
    h, w = a.shape
    t = max(2, min(h, w) // 200)
    ring = np.concatenate([rgb[:t].reshape(-1, 3), rgb[-t:].reshape(-1, 3),
                           rgb[:, :t].reshape(-1, 3), rgb[:, -t:].reshape(-1, 3)])
    bg = np.median(ring, axis=0)
    close = np.linalg.norm(ring - bg, axis=1) < 22
    if close.mean() > 0.93:
        # พื้นสีเดียว ต้องเหลือวัตถุอยู่พอสมควร ไม่ใช่ภาพสีพื้นทั้งใบ
        bgm = solid_bg_mask(rgba, bg)
        frac = 1 - bgm.mean() / 255
        if 0.02 < frac < 0.97:
            return {"method": "solid", "reason": "ขอบภาพเป็นสีพื้นเรียบ", "bg": bg.tolist()}
    return {"method": "ai", "reason": "ภาพถ่าย/พื้นหลังซับซ้อน ใช้ AI ตัด", "bg": None}


def solid_bg_mask(rgba: np.ndarray, bg, tol: float = 30) -> np.ndarray:
    """พื้นหลังสีเรียบ = พิกเซลสีใกล้ bg ที่ต่อเนื่องถึงขอบภาพ (สีเดียวกันด้านในงานไม่ถูกลบ)"""
    rgb = rgba[..., :3].astype(np.int16)
    cand = (np.linalg.norm(rgb - np.array(bg), axis=2) < tol).astype(np.uint8)
    n, lab = cv2.connectedComponents(cand, connectivity=4)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    edge = edge[edge > 0]
    return np.isin(lab, edge).astype(np.uint8) * 255


def method_alpha(entry: dict, method: str, ai_fn, ai_model: str = "") -> np.ndarray:
    """alpha (0..255) ของวัตถุตามวิธีที่เลือก ใช้แคชในรายการรูป"""
    cache = entry.setdefault("masks", {})
    key = f"ai:{ai_model}" if method == "ai" else method   # แคชผลแยกตามรุ่น AI
    if key in cache:
        return cache[key]
    rgba = entry["rgba"]
    if method == "alpha":
        m = rgba[..., 3].copy()
    elif method == "solid":
        bg = entry["detect"]["bg"] or np.median(
            np.concatenate([rgba[0, :, :3], rgba[-1, :, :3]]), axis=0).tolist()
        m = 255 - solid_bg_mask(rgba, bg)
    elif method == "ai":
        m = ai_fn(entry, ai_model)
    elif method == "none":
        m = np.full(rgba.shape[:2], 255, np.uint8)
    else:
        raise ValueError(f"ไม่รู้จักวิธี {method}")
    cache[key] = m
    return m


# =====================================================================
# 2) เส้น vector
# =====================================================================
def from_potrace(plist) -> list:
    out = []
    for c in plist:
        segs = []
        for s in c.segments:
            if s.is_corner:
                segs.append(("L", (s.c.x, s.c.y)))
                segs.append(("L", (s.end_point.x, s.end_point.y)))
            else:
                segs.append(("C", (s.c1.x, s.c1.y), (s.c2.x, s.c2.y), (s.end_point.x, s.end_point.y)))
        out.append({"start": (c.start_point.x, c.start_point.y), "segs": segs})
    return out


def shift(paths, dx, dy):
    mv = lambda p: (p[0] + dx, p[1] + dy)
    return [{"start": mv(p["start"]),
             "segs": [(s[0],) + tuple(mv(q) for q in s[1:]) for s in p["segs"]]} for p in paths]


def rect_path(x0, y0, x1, y1, r=0.0):
    r = max(0.0, min(r, (x1 - x0) / 2, (y1 - y0) / 2))
    if r < 0.01:
        return [{"start": (x0, y0), "segs": [("L", (x1, y0)), ("L", (x1, y1)), ("L", (x0, y1)), ("L", (x0, y0))]}]
    k = r * KAPPA
    return [{"start": (x0 + r, y0), "segs": [
        ("L", (x1 - r, y0)), ("C", (x1 - r + k, y0), (x1, y0 + r - k), (x1, y0 + r)),
        ("L", (x1, y1 - r)), ("C", (x1, y1 - r + k), (x1 - r + k, y1), (x1 - r, y1)),
        ("L", (x0 + r, y1)), ("C", (x0 + r - k, y1), (x0, y1 - r + k), (x0, y1 - r)),
        ("L", (x0, y0 + r)), ("C", (x0, y0 + r - k), (x0 + r - k, y0), (x0 + r, y0)),
    ]}]


def ellipse_path(cx, cy, rx, ry):
    kx, ky = rx * KAPPA, ry * KAPPA
    return [{"start": (cx + rx, cy), "segs": [
        ("C", (cx + rx, cy + ky), (cx + kx, cy + ry), (cx, cy + ry)),
        ("C", (cx - kx, cy + ry), (cx - rx, cy + ky), (cx - rx, cy)),
        ("C", (cx - rx, cy - ky), (cx - kx, cy - ry), (cx, cy - ry)),
        ("C", (cx + kx, cy - ry), (cx + rx, cy - ky), (cx + rx, cy)),
    ]}]


def flatten(paths, scale=1.0, steps=16):
    polys = []
    for p in paths:
        pts = [p["start"]]
        for s in p["segs"]:
            if s[0] == "L":
                pts.append(s[1])
            else:
                p0, c1, c2, p3 = map(np.array, (pts[-1], s[1], s[2], s[3]))
                for t in np.linspace(0, 1, steps)[1:]:
                    u = 1 - t
                    q = u ** 3 * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t ** 3 * p3
                    pts.append((q[0], q[1]))
        polys.append(np.array(pts) * scale)
    return polys


def paths_bbox(paths):
    pts = np.concatenate(flatten(paths))
    return pts[:, 0].min(), pts[:, 1].min(), pts[:, 0].max(), pts[:, 1].max()


def paths_length(paths):
    return float(sum(np.linalg.norm(np.diff(p, axis=0), axis=1).sum() for p in flatten(paths)))


def render_mask(paths, w, h, ss=4) -> np.ndarray:
    if w * h > 12_000_000:
        ss = 2
    polys = [np.round(p).astype(np.int32) for p in flatten(paths, ss) if len(p) >= 3]
    canvas = np.zeros((h * ss, w * ss), np.uint8)
    if polys:
        cv2.fillPoly(canvas, polys, 255)  # even-odd: รูด้านในโปร่งถูกต้อง
    return cv2.resize(canvas, (w, h), interpolation=cv2.INTER_AREA)


def svg_d(paths):
    f = lambda v: f"{v:.2f}"
    out = []
    for p in paths:
        out.append(f"M{f(p['start'][0])},{f(p['start'][1])}")
        for s in p["segs"]:
            if s[0] == "L":
                out.append(f"L{f(s[1][0])},{f(s[1][1])}")
            else:
                out.append("C" + " ".join(f"{f(q[0])},{f(q[1])}" for q in s[1:]))
        out.append("Z")
    return "".join(out)


def svg_text(paths, w, h, dpi=None, color="#ff00ff"):
    if dpi:
        sw, sh = f"{w / dpi * 25.4:.3f}mm", f"{h / dpi * 25.4:.3f}mm"
    else:
        sw, sh = str(w), str(h)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{sw}" height="{sh}" viewBox="0 0 {w} {h}">\n'
            f'  <path d="{svg_d(paths)}" fill="none" stroke="{color}" stroke-width="1" fill-rule="evenodd"/>\n'
            f"</svg>\n")


SPOT_CMYK = {"Cut100": (0, 1, 0, 0), "Cut50": (1, 0, 0, 0), "White": (0.15, 0, 0, 0)}


def ai_bytes(img: Image.Image, lines, dpi: float) -> bytes:
    """ไฟล์ .ai (PDF-compatible) : ภาพ + เส้น vector สีพิเศษแยกชื่อ (Cut100 / Cut50 / White) ขนาดจริง
    lines = [(ชื่อสี, paths, "stroke"|"fill"), ...]  หรือ paths เฉยๆ (= Cut100)"""
    if lines and isinstance(lines[0], dict):
        lines = [("Cut100", lines, "stroke")]
    w, h = img.size
    k = 72.0 / dpi
    Wpt, Hpt = w * k, h * k
    rgba = img.convert("RGBA")
    rgb = zlib.compress(rgba.convert("RGB").tobytes(), 6)
    alpha = zlib.compress(rgba.getchannel("A").tobytes(), 6)
    f = lambda v: f"{v:.3f}"

    def path_ops(paths):
        ops = []
        for pth in paths:
            ops.append(f"{f(pth['start'][0])} {f(pth['start'][1])} m")
            for sg in pth["segs"]:
                if sg[0] == "L":
                    ops.append(f"{f(sg[1][0])} {f(sg[1][1])} l")
                else:
                    ops.append(" ".join(f"{f(q[0])} {f(q[1])}" for q in sg[1:]) + " c")
            ops.append("h")
        return "\n".join(ops)

    # รองขาว (fill) ไว้ล่างสุด, ภาพ, แล้วเส้นตัดไว้บนสุด
    order = [l for l in lines if l[2] == "fill"] + [None] + [l for l in lines if l[2] != "fill"]
    body, cs = [], {}
    for item in order:
        if item is None:
            body.append(f"q {f(Wpt)} 0 0 {f(Hpt)} 0 0 cm /Im0 Do Q")
            continue
        name, paths, mode = item
        if not paths:
            continue
        key = f"CS{len(cs)}"
        cs[key] = name
        if mode == "fill":
            body.append(f"q {k:.6f} 0 0 {-k:.6f} 0 {f(Hpt)} cm /{key} cs 1 scn\n{path_ops(paths)}\nf* Q")
        else:
            body.append(f"q {k:.6f} 0 0 {-k:.6f} 0 {f(Hpt)} cm /{key} CS 1 SCN {0.25 / k:.4f} w 1 j\n"
                        f"{path_ops(paths)}\nS Q")
    cz = zlib.compress(("\n".join(body) + "\n").encode(), 6)

    n_cs = len(cs)
    cs_refs = " ".join(f"/{key} {7 + i} 0 R" for i, key in enumerate(cs))
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {f(Wpt)} {f(Hpt)}] /TrimBox [0 0 {f(Wpt)} {f(Hpt)}] "
         f"/Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> /ColorSpace << {cs_refs} >> >> >>").encode(),
        b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(cz) + cz + b"\nendstream",
        (f"<< /Type /XObject /Subtype /Image /Width {w} /Height {h} /ColorSpace /DeviceRGB /BitsPerComponent 8 "
         f"/Filter /FlateDecode /SMask 6 0 R /Length {len(rgb)} >>\nstream\n").encode() + rgb + b"\nendstream",
        (f"<< /Type /XObject /Subtype /Image /Width {w} /Height {h} /ColorSpace /DeviceGray /BitsPerComponent 8 "
         f"/Filter /FlateDecode /Length {len(alpha)} >>\nstream\n").encode() + alpha + b"\nendstream",
    ]
    for key, name in cs.items():
        c, m_, y, kk = SPOT_CMYK.get(name, (0, 1, 0, 0))
        objs.append((f"[/Separation /{name} /DeviceCMYK << /FunctionType 2 /Domain [0 1] "
                     f"/C0 [0 0 0 0] /C1 [{c} {m_} {y} {kk}] /N 1 >>]").encode())
    out = bytearray(b"%PDF-1.5\n%\xe2\xe3\xcf\xd3\n")
    offs = []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for o in offs:
        out += f"{o:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


# =====================================================================
# 3) ประมวลผลหลัก
# =====================================================================
def params(d: dict) -> SimpleNamespace:
    g = lambda k, v: d.get(k, v)
    fnum = lambda k, v: float(g(k, v) or 0)
    return SimpleNamespace(
        method=g("method", "auto"),
        shape=g("shape", "contour"),
        radius_mm=fnum("radius_mm", 3),
        offset_mm=fnum("offset_mm", 0),
        fill=g("fill", "none"),
        extend=str(g("extend", "0")) in ("1", "true", "True"),
        bleed_mm=fnum("bleed_mm", 1),
        bridge=fnum("bridge", 1),
        holes=str(g("holes", "0")) in ("1", "true", "True"),
        smooth=fnum("smooth", 1),
        shrink=int(fnum("shrink", 1)),
        size_axis=g("size_axis", ""),
        size_mm=fnum("size_mm", 0),
        dpi=fnum("dpi", 300) or 300,
        material=str(g("material", ""))[:40],
        product=str(g("product", ""))[:40],
        ai_model=str(g("ai_model", "") or "")[:60],
        edits=_edits(g("edits", [])),
        plus_mm=min(max(fnum("plus_mm", 3), 0.5), 30),   # ความมนของจุด + (รัศมีการถมร่อง มม.)
        cut_type="Cut50" if g("cut_type", "Cut100") == "Cut50" else "Cut100",
        white=g("white", "none"),                 # none | full
        white_choke_mm=fnum("white_choke_mm", 0.1),
        hole=str(g("hole", "0")) in ("1", "true", "True"),
        hole_mm=fnum("hole_mm", 1.5),             # เส้นผ่านศูนย์กลางรู
        ring_mm=fnum("ring_mm", 2.0),             # เนื้อรอบรู
        hole_gap_mm=fnum("hole_gap_mm", 1.5),     # ระยะจากขอบรูถึงเนื้องาน
        hole_x_mm=float(g("hole_x_mm", 0) or 0),  # เลื่อนรูซ้าย(-)/ขวา(+)
        hole_style="circle",  # ติ่งแบบวงกลมวางทับเส้นเสมอ (ต่อคอให้เองเฉพาะกรณีวงกลมไม่ถึงเส้นตัด)
        stand=str(g("stand", "0")) in ("1", "true", "True"),
        tab_w_mm=fnum("tab_w_mm", 0),             # 0 = อัตโนมัติ
        tab_h_mm=fnum("tab_h_mm", 6),
        base_d_mm=fnum("base_d_mm", 25),
        thick_mm=fnum("thick_mm", 3),
        slot_clear_mm=fnum("slot_clear_mm", 0.1),
        fixed_w_mm=fnum("fixed_w_mm", 0),
        fixed_h_mm=fnum("fixed_h_mm", 0),
        # ขอบรอบรูป (Stroke) — ขอบสีทึบรอบวัตถุ เส้นตัด/ระยะเผื่อนับต่อจากขอบนี้ (12 ต.ค. 69)
        stroke_mm=fnum("stroke_mm", 0),
        stroke=str(g("stroke", "#ffffff") or "#ffffff"),
        # ไฟล์ .ai/.pdf ที่มีเลเยอร์เส้นตัดมาแล้ว → ใช้เส้นของลูกค้าตรง ๆ (ค่าเริ่มต้น = ใช้)
        filecut=str(g("filecut", "1")) in ("1", "true", "True"),
    )


def _close_dt(src: np.ndarray, R: float) -> np.ndarray:
    """closing ด้วยวงกลมรัศมี R (ใช้ distance transform: เร็วเท่ากันทุกขนาด) — src ต้องมีขอบว่างรอบพอ
    คืนค่าระยะ (float): > 0 = อยู่ในผลลัพธ์ (ใช้ขยายภาพให้ขอบเนียนได้)"""
    d_out = cv2.distanceTransform((src == 0).astype(np.uint8), cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    dil = (d_out <= R).astype(np.uint8)
    d_in = cv2.distanceTransform(dil, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
    return d_in - R


def _fillet(m_raw, m, seed, span_px, r_min):
    """ถมร่องตรงจุดที่จิ้มให้เป็นโค้งที่กว้างประมาณ span_px (ตามแนวขอบงาน)
    คืน mask (bool ขนาดเท่า m) ของส่วนที่ต้องถมเพิ่ม หรือ None ถ้าตรงนั้นไม่มีร่อง"""
    H, W = m.shape
    ys, xs = np.nonzero(seed)
    r_max_hi = max(r_min * 2, span_px * 6)
    # ตัดเฉพาะบริเวณรอบจุดที่จิ้ม (โค้งรัศมี R ขึ้นกับงานในระยะ ~2R)
    half = int(2 * r_max_hi + span_px) + 4
    x0, x1 = max(0, xs.min() - half), min(W, xs.max() + half + 1)
    y0, y1 = max(0, ys.min() - half), min(H, ys.max() + half + 1)
    # คำนวณที่ความละเอียดต่ำ (โค้งกว้าง ~48 px) แล้วขยายกลับ -> เร็วเท่ากันทุกขนาดไฟล์
    f = min(1.0, 96.0 / max(span_px, 1.0))
    cw, chh = max(1, int(round((x1 - x0) * f))), max(1, int(round((y1 - y0) * f)))
    down = lambda a: cv2.resize(a, (cw, chh), interpolation=cv2.INTER_AREA) > 127
    span, r_lo, r_hi = span_px * f, max(r_min * f, 1.0), r_max_hi * f
    pad = int(r_hi) + 4
    src = np.pad(down(m_raw[y0:y1, x0:x1]).astype(np.uint8), pad)
    base = np.pad(down(m[y0:y1, x0:x1]), pad)
    sd = np.pad(down(seed[y0:y1, x0:x1]) | (cv2.resize(seed[y0:y1, x0:x1], (cw, chh),
                interpolation=cv2.INTER_NEAREST) > 0), pad)

    def piece(R):
        closed = _close_dt(src, R)
        add = ((closed > 0) & ~base).astype(np.uint8)
        n, lab = cv2.connectedComponents(add, connectivity=8)
        hit = np.unique(lab[sd & (add > 0)])
        hit = hit[hit > 0]
        if not hit.size:
            return None, 0.0
        sel = np.isin(lab, hit)
        pts = np.column_stack(np.nonzero(sel)[::-1]).astype(np.float32)
        (_, _), (w, h), _ = cv2.minAreaRect(pts)
        return (sel, closed), max(w, h)

    lo, hi = r_lo, r_hi
    best, size = piece(hi)
    if best is None:
        return None, 0
    if size > span:             # หารัศมีเล็กสุดที่ได้โค้งกว้างถึงค่าที่ตั้ง
        for _ in range(12):
            mid = (lo + hi) / 2
            got, sz = piece(mid)
            if got is not None and sz >= span:
                hi, best = mid, got
            else:
                lo = mid
            if hi - lo < 0.5:
                break
    sel = best[0][pad:pad + chh, pad:pad + cw].astype(np.uint8)
    field = best[1][pad:pad + chh, pad:pad + cw]
    # ขยายกลับ: ขอบโค้งจากค่าระยะ (ละเอียดกว่าพิกเซล) เฉพาะรอบก้อนที่ถม แล้วผู้เรียกเชื่อมรอยต่อด้วย _merge_local
    size_hi = (x1 - x0, y1 - y0)
    reg = cv2.resize(cv2.dilate(sel, np.ones((3, 3), np.uint8)) * 255, size_hi, interpolation=cv2.INTER_NEAREST) > 0
    up = (cv2.resize(field, size_hi, interpolation=cv2.INTER_LINEAR) > 0) & reg
    out = np.zeros((H, W), np.uint8)
    out[y0:y1, x0:x1] = up * 255
    return out, max(1, int(round(1.5 / f)))


def _merge_local(m: np.ndarray, add: np.ndarray, k: int) -> np.ndarray:
    """รวมรูปทรงเสริมเข้ากับเส้นเดิม แล้วลบมุมหักตรงรอยต่อ (เฉพาะบริเวณรอบส่วนเสริม)"""
    u = np.maximum(m, add)
    if k < 2:
        return u
    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * k + 1, 2 * k + 1))
    closed = cv2.morphologyEx(u, cv2.MORPH_CLOSE, ker, borderType=cv2.BORDER_CONSTANT, borderValue=0)
    near = cv2.dilate(add, ker) > 0
    u[near] = closed[near]
    return u


def _edits(v):
    """จุดแก้เฉพาะที่: [[x, y, r_mm, sign], ...] โดย x, y เป็นสัดส่วนของภาพต้นฉบับ (0-1), sign +1 = มน, -1 = ชิด"""
    out = []
    for e in (v or [])[:200]:
        try:
            x, y, r, sg = float(e[0]), float(e[1]), float(e[2]), float(e[3])
            out.append((min(max(x, -0.5), 1.5), min(max(y, -0.5), 1.5), min(max(r, 0.5), 30.0), 1 if sg > 0 else -1))
        except Exception:
            pass
    return out


def nearest_fill(rgb: np.ndarray, src: np.ndarray, region: np.ndarray) -> np.ndarray:
    """เติมสีพิกเซลใน region ด้วยสีของพิกเซลต้นทาง (src) ที่ใกล้ที่สุด = ยืดสีขอบภาพออก"""
    inp = np.where(src, 0, 1).astype(np.uint8)
    if inp.min() == 1:
        return rgb
    _, labels = cv2.distanceTransformWithLabels(inp, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(inp == 0)  # ลำดับเดียวกับการติดป้ายของ OpenCV (ไล่แถว)
    out = rgb.copy()
    sel = region & ~src
    lab = labels[sel] - 1
    out[sel] = rgb[ys[lab], xs[lab]]
    return out


def process(entry: dict, p: SimpleNamespace, scale: float, ai_fn) -> dict:
    """ประมวลผลหนึ่งรูป scale<1 = พรีวิว (ย่อ) คืนภาพ เส้น ขนาดจริง และคำเตือน"""
    rgba_full = entry["rgba"]
    if p.filecut and entry.get("cutpaths"):
        return process_file_cut(entry, p, scale)
    method = entry["detect"]["method"] if p.method == "auto" else p.method
    warnings = []
    fixed = p.fixed_w_mm > 0 and p.fixed_h_mm > 0
    if fixed:
        # งานกระดาษขนาดมาตรฐาน: ใช้ภาพทั้งใบ ครอปกลางให้พอดีสัดส่วน + เผื่อตัดเข้าเนื้อ
        p = SimpleNamespace(**vars(p))
        method = "none"
        FW, FH = p.fixed_w_mm, p.fixed_h_mm
        h0, w0 = rgba_full.shape[:2]
        if (w0 > h0) != (FW > FH):
            FW, FH = FH, FW                       # หมุนตามแนวภาพอัตโนมัติ
        inset = max(0.0, -p.offset_mm)
        aspect = (FW + 2 * inset) / (FH + 2 * inset)
        if w0 / h0 > aspect:
            nw = round(h0 * aspect); x0 = (w0 - nw) // 2
            rgba_full = rgba_full[:, x0:x0 + nw]
        else:
            nh = round(w0 / aspect); y0 = (h0 - nh) // 2
            rgba_full = rgba_full[y0:y0 + nh, :]
        lost = 1 - rgba_full.shape[0] * rgba_full.shape[1] / (h0 * w0)
        if lost > 0.08:
            warnings.append(f"ภาพถูกครอปออก {lost * 100:.0f}% ให้พอดีขนาด {FW:g}×{FH:g} มม.")
        p.size_axis, p.size_mm = "w", FW
        if p.shape not in ("rect", "rounded"):
            p.shape = "rect"
        p.hole = p.stand = False
        alpha_full = np.full(rgba_full.shape[:2], 255, np.uint8)
    else:
        alpha_full = method_alpha(entry, method, ai_fn, p.ai_model)

    rgba, alpha = rgba_full, alpha_full
    if scale < 1.0:
        h0, w0 = rgba_full.shape[:2]
        size = (max(1, round(w0 * scale)), max(1, round(h0 * scale)))
        rgba = np.array(Image.fromarray(rgba_full).resize(size, Image.LANCZOS))
        alpha = np.array(Image.fromarray(alpha_full).resize(size, Image.BILINEAR))
    H0, W0 = alpha.shape

    # --- mask วัตถุ ---
    if method == "none":
        mask = np.full((H0, W0), 255, np.uint8)
    else:
        mask = cutout.clean_mask(alpha, max(0, round(p.shrink * scale)) if method != "alpha" else 0, 0.001)
    if mask.max() == 0:
        if method == "ai":
            raise ValueError(f"AI รุ่น {p.ai_model or 'นี้'} หาวัตถุในรูปนี้ไม่เจอ ลองเปลี่ยนรุ่น AI หรือวิธีหาขอบงาน")
        raise ValueError("ไม่พบวัตถุในรูปนี้ ลองเปลี่ยนวิธีหาขอบงาน")
    tx0, ty0, tx1, ty1 = cutout.mask_bbox(mask, 0)
    if method in ("ai", "solid") and (tx0 == 0 or ty0 == 0 or tx1 == W0 or ty1 == H0):
        warnings.append("วัตถุชนขอบภาพ อาจถูกตัดขาดบางส่วน")

    # --- เส้นรอบวัตถุ (ใช้ทำภาพขอบคม) ---
    turd = max(2, round(10 * scale * scale))
    obj_paths = None
    if method in ("ai", "solid"):
        obj_paths = from_potrace(cutout.trace(mask, p.smooth, turd))
        obj_alpha = render_mask(obj_paths, W0, H0)
    elif method == "alpha":
        obj_alpha = alpha  # ใช้ขอบจากไฟล์ต้นฉบับตรงๆ
    else:
        obj_alpha = mask

    # --- เรขาคณิตของรูปร่าง (ที่ระยะ 0) และขนาดฐานสำหรับคำนวณ dpi ---
    bw, bh = tx1 - tx0, ty1 - ty0
    cx, cy = (tx0 + tx1) / 2, (ty0 + ty1) / 2
    shape = p.shape
    if method == "none" and shape == "contour":
        shape = "rect"  # ภาพทั้งใบ: ขอบคือสี่เหลี่ยมพอดี ใช้เส้น vector ตรงๆ
    geo = {}
    if shape == "circle":
        if method == "none":
            r = min(bw, bh) / 2
        else:
            cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            (cx, cy), r = cv2.minEnclosingCircle(np.concatenate(cnts))
        geo = {"cx": cx, "cy": cy, "rx": r, "ry": r}
        base_w = base_h = 2 * r
    elif shape == "ellipse":
        rx, ry = bw / 2, bh / 2
        if method != "none":  # ขยายวงรีให้ครอบวัตถุทั้งหมด
            ys, xs = np.nonzero(mask[::2, ::2])
            s = np.max(((xs * 2 - cx) / rx) ** 2 + ((ys * 2 - cy) / ry) ** 2)
            rx, ry = rx * math.sqrt(max(1, s)), ry * math.sqrt(max(1, s))
        geo = {"cx": cx, "cy": cy, "rx": rx, "ry": ry}
        base_w, base_h = 2 * rx, 2 * ry
    else:
        base_w, base_h = bw, bh

    # --- ความละเอียดจริง (dpi) จากขนาดชิ้นงานหลังตัด ---
    full = lambda px: px / scale
    dpi = entry.get("dpi") or p.dpi  # ไฟล์ .ai/.pdf รู้ขนาดจริงจากหน้ากระดาษ
    if p.size_mm > 0 and p.size_axis in ("w", "h"):
        base = full(base_w if p.size_axis == "w" else base_h)
        avail = p.size_mm - 2 * p.offset_mm
        if avail <= 0.5:
            raise ValueError("ขนาดที่กำหนดเล็กกว่าระยะเส้นตัด")
        dpi = base * 25.4 / avail
    dpp = dpi * scale                       # dpi ของภาพที่กำลังประมวลผล
    mm2px = lambda mm: mm / 25.4 * dpp
    st = int(round(mm2px(p.stroke_mm))) if p.stroke_mm > 0 and p.stroke.lower() not in ("none", "") else 0
    b = mm2px(p.offset_mm)                  # ระยะเส้นตัด (px, มีเครื่องหมาย)
    bi = int(round(b))
    bleed = int(round(mm2px(p.bleed_mm))) if p.extend else 0

    # --- ผืนผ้าใบทำงาน: เผื่อพื้นที่ให้ขยายเส้น/การถมร่อง/bleed ---
    kc = max(3, int(abs(bi) * p.bridge) * 2 + 1) if abs(bi) > 0 else 1
    hole_r = mm2px(p.hole_mm) / 2
    ring_R = hole_r + mm2px(p.ring_mm)
    extra = 0
    if p.hole:
        extra = max(extra, int(ring_R * 2 + mm2px(p.hole_gap_mm)) + 6)
    if p.stand:
        extra = max(extra, int(mm2px(p.tab_h_mm)) + 4)
    # ความมนของจุด + : ไม่น้อยกว่าการถมร่องทั่วไป (ไม่อย่างนั้นจิ้มแล้วจะไม่เห็นผล)
    plus_r = (kc // 2 + int(round(mm2px(p.plus_mm)))) if p.edits else 0   # บวกเพิ่มจากการถมร่องทั่วไป
    pad = max(0, bi) + max(kc // 2, plus_r) + bleed + st + 6 + extra
    X0, Y0 = max(0, tx0 - 2), max(0, ty0 - 2)
    X1, Y1 = min(W0, tx1 + 2), min(H0, ty1 + 2)
    if method == "none" or shape in ("rect", "rounded", "circle", "ellipse"):
        X0, Y0, X1, Y1 = 0, 0, W0, H0  # เก็บทั้งภาพไว้ (ใช้เป็น bleed)
    cw, ch = X1 - X0 + 2 * pad, Y1 - Y0 + 2 * pad
    ox, oy = pad - X0, pad - Y0       # พิกัดภาพ -> พิกัดผืนผ้าใบ

    def place(a2d):
        c = np.zeros((ch, cw), a2d.dtype)
        c[pad:pad + Y1 - Y0, pad:pad + X1 - X0] = a2d[Y0:Y1, X0:X1]
        return c

    obj_m = place(mask)
    obj_a = place(obj_alpha)
    rgb_c = np.zeros((ch, cw, 3), np.uint8)
    rgb_c[pad:pad + Y1 - Y0, pad:pad + X1 - X0] = rgba[Y0:Y1, X0:X1, :3]

    # --- ขอบรอบรูป (Stroke): ขยายรูปทรงออก st px เติมสีทึบใต้ภาพ แล้วถือว่าขอบนอกนี้คือ "ขอบงาน" ใหม่ ---
    # รูด้านใน (ตัวหนังสือ knockout ในไฟล์ .ai) ไม่เติมสี เว้นแต่ติ๊ก "เว้นรูด้านใน" (ดู cutout.add_stroke)
    if st > 0 and shape == "contour":
        filled = obj_m if p.holes else cutout.fill_holes(obj_m)
        smask = cv2.dilate(filled, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * st + 1, 2 * st + 1)))
        spaths = from_potrace(cutout.trace(smask, p.smooth, turd))
        sa = render_mask(spaths, cw, ch).astype(np.float32) / 255
        holes = ((filled > 0) & (obj_m == 0)).astype(np.uint8)
        if holes.any():
            k5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            sa[(cv2.dilate(holes, k5) & cv2.erode(filled, k5)) > 0] = 0
        col = np.array(ImageColor.getrgb(p.stroke)[:3], np.float32)
        oa = (obj_a.astype(np.float32) / 255)[..., None]
        sa3 = sa[..., None]
        tot = oa + sa3 * (1 - oa)
        mix = rgb_c * oa + col * sa3 * (1 - oa)
        rgb_c = np.where(tot > 0, mix / np.maximum(tot, 1e-6), 0).clip(0, 255).astype(np.uint8)
        obj_a = (tot[..., 0] * 255).astype(np.uint8)
        obj_m = smask
        ys, xs = np.nonzero(smask)
        tx0, ty0, tx1, ty1 = xs.min() - ox, ys.min() - oy, xs.max() + 1 - ox, ys.max() + 1 - oy


    # --- เส้นตัด ---
    if shape == "contour":
        m = obj_m.copy()
        if bi > 0:
            m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * bi + 1, 2 * bi + 1)))
        m_raw = m.copy()
        if kc > 1 and p.bridge > 0:
            k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kc, kc))
            m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k, borderType=cv2.BORDER_CONSTANT, borderValue=0)
        if p.edits:
            # แก้เฉพาะจุดที่จิ้ม: + = ถมร่องมากขึ้น (มน), - = ไม่ถม เส้นวิ่งตามซอกงาน (ชิด)
            # ความมน (มม.) = ขนาดของส่วนโค้ง: โค้งจะกินยาวไปตามขอบงานประมาณ 2 เท่าของค่านี้
            # หารัศมีลูกกลิ้งที่ให้โค้งขนาดนั้นจริง (มุมป้านต้องใช้รัศมีใหญ่กว่ามุมแคบมาก)
            minus = np.zeros_like(m)
            for fx, fy, r_mm, sg in p.edits:
                cxp, cyp = int(round(fx * W0 + ox)), int(round(fy * H0 + oy))
                rr = mm2px(r_mm) + max(bi, 0) + (0 if sg > 0 else kc // 2)
                if sg < 0:   # จุด - : วงแปรง = พื้นที่ที่ให้เส้นวิ่งตามซอก
                    cv2.circle(minus, (cxp, cyp), max(1, int(round(rr))), 255, -1)
                    continue
                seed = np.zeros_like(m)  # จุด + : วงแปรงใช้แค่ "เลือกร่อง" ที่จิ้ม
                cv2.circle(seed, (cxp, cyp), max(1, int(round(rr))), 255, -1)
                fill, kk = _fillet(m_raw, m, seed, mm2px(p.plus_mm) * 2, max(kc / 2, 1.0))
                if fill is not None:
                    m = _merge_local(m, fill, kk)
            m = np.where(minus > 0, m_raw, m).astype(np.uint8)
        if not p.holes:
            m = cutout.fill_holes(m)
        if bi < 0:
            m = cv2.erode(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * -bi + 1, 2 * -bi + 1)))
            if m.max() == 0:
                raise ValueError("ตัดเข้าเนื้อมากเกินไป งานหายหมด")
        cut = from_potrace(cutout.trace(m, p.smooth, turd))
    elif shape in ("rect", "rounded"):
        r = mm2px(p.radius_mm) if shape == "rounded" else 0
        cut = rect_path(tx0 + ox - b, ty0 + oy - b, tx1 + ox + b, ty1 + oy + b, max(0, r))
    else:
        rx, ry = geo["rx"] + b, geo["ry"] + b
        if rx <= 1 or ry <= 1:
            raise ValueError("ตัดเข้าเนื้อมากเกินไป")
        cut = ellipse_path(geo["cx"] + ox, geo["cy"] + oy, rx, ry)

    body_bb = paths_bbox(cut)  # ขนาดตัวชิ้นงาน (ไม่รวมติ่ง/ขาเสียบ/ฐาน)
    # --- ส่วนเสริมตามสินค้า: ติ่งรูห่วง / ขาเสียบสแตนดี้ ---
    extras = []
    hole_path = []
    hole_sharp = False
    if p.hole or p.stand:
        m = (render_mask(cut, cw, ch) >= 128).astype(np.uint8) * 255
        ys, xs = np.nonzero(m)
        if p.hole:
            # วางรูเหนือเนื้องาน: ขอบรูห่างจากงานอย่างน้อย hole_gap_mm (วัดจากเนื้องานจริง ไม่ใช่เส้นตัด)
            art_m = (obj_a >= 128) if obj_a.max() else (m > 0)
            ays, axs = np.nonzero(art_m)
            yt = ays.min()
            xt = float(axs[ays <= yt + max(2, int(mm2px(1)))].mean()) + mm2px(p.hole_x_mm)
            gap = mm2px(p.hole_gap_mm)
            dist = cv2.distanceTransform((~art_m).astype(np.uint8), cv2.DIST_L2, 5)
            cy = float(yt) - gap - hole_r
            # เลื่อนรูขึ้นจนห่างงานครบระยะทุกจุด (กันกรณีงานยื่นขึ้นมาข้างๆ รู)
            for _ in range(int(ring_R * 4 + gap * 2) + 20):
                ix, iy = int(round(xt)), int(round(cy))
                if iy < 0 or not (0 <= ix < dist.shape[1]):
                    break
                if iy >= dist.shape[0] or dist[min(iy, dist.shape[0] - 1), ix] >= gap + hole_r - 0.5:
                    break
                cy -= 1
            cy = max(cy, ring_R + 2)
            c = (xt, cy)
            add = np.zeros_like(m)
            ci = (int(round(c[0])), int(round(c[1])))
            cv2.circle(add, ci, int(round(ring_R)), 255, -1)
            touches = bool((cv2.dilate(add, np.ones((3, 3), np.uint8)) & m).any())
            if p.hole_style == "circle" and touches:
                # วางวงกลมทับเส้นตัดแล้วรวมเส้นตรงๆ (แบบ Pathfinder > Unite) รอยต่อเป็นมุมหัก
                m = np.maximum(m, add)
                hole_sharp = True
            else:
                # มีคอเชื่อมติ่งลงมาหาตัวงาน + ลบมุมรอยต่อ (หรือวงกลมลอยไม่ถึงเส้นตัด)
                col = m[:, max(0, min(m.shape[1] - 1, ci[0]))]
                below = np.nonzero(col[ci[1]:])[0]
                ylink = ci[1] + (int(below[0]) + int(mm2px(1)) if below.size else int(gap + ring_R))
                cv2.rectangle(add, (int(ci[0] - ring_R), ci[1]), (int(ci[0] + ring_R), ylink), 255, -1)
                m = _merge_local(m, add, int(ring_R * 1.2))
                if p.hole_style == "circle":
                    extras.append("ติ่งวงกลมไม่ถึงเส้นตัด จึงต่อคอให้")
            hole_path = ellipse_path(c[0], c[1], hole_r, hole_r)
            extras.append(f"รูห่วง Ø{p.hole_mm:g} มม.")
        tab = None
        if p.stand:
            ys, xs = np.nonzero(m)
            yb = ys.max()
            xm = float(np.median(xs[ys >= yb - 2]))
            cut_w_px = xs.max() - xs.min()
            tw = mm2px(p.tab_w_mm) if p.tab_w_mm > 0 else min(max(cut_w_px * 0.4, mm2px(8)), mm2px(30))
            th = mm2px(p.tab_h_mm)
            add = np.zeros_like(m)
            x0t, x1t = int(round(xm - tw / 2)), int(round(xm + tw / 2))
            cv2.rectangle(add, (x0t, int(yb - mm2px(3))), (x1t, int(yb + th)), 255, -1)
            m = _merge_local(m, add, int(mm2px(2)))
            tab = (x1t - x0t, th)
        m = cutout.fill_holes(m)
        # แบบวงกลมทับ: ลดการลบมุม ให้รอยต่อวงกลมกับเส้นตัดเป็นมุมหักชัดเจน
        cut = from_potrace(cutout.trace(m, min(p.smooth, 0.8 if hole_sharp else 1.0), turd))
    cut_main = cut + hole_path
    cut_m = render_mask(cut_main, cw, ch)

    # --- ภาพผลลัพธ์ ---
    art_rgb = rgb_c
    art_a = obj_a.copy()
    if p.extend:
        region = cut_m > 0
        if bleed > 0:
            region = cv2.dilate(region.astype(np.uint8),
                                cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * bleed + 1, 2 * bleed + 1))) > 0
        art_rgb = nearest_fill(rgb_c, obj_a >= 128, region)
        art_a = np.maximum(art_a, region.astype(np.uint8) * 255)
    elif p.fill and p.fill != "none":
        col = np.array(ImageColor.getrgb(p.fill), np.float32)
        fa = (cut_m.astype(np.float32) / 255)[..., None]
        oa = (obj_a.astype(np.float32) / 255)[..., None]
        art_rgb = (rgb_c * oa + col * fa * (1 - oa)).clip(0, 255)
        tot = oa + fa * (1 - oa)
        art_rgb = np.where(tot > 0, art_rgb / np.maximum(tot, 1e-6), 0).astype(np.uint8)
        art_a = (tot[..., 0] * 255).astype(np.uint8)

    # ครอปอาร์ตบอร์ดพอดี (ภาพที่มองเห็น + เส้นตัด)
    vis = (art_a > 0) | (cut_m > 0)
    ax0, ay0, ax1, ay1 = cutout.mask_bbox(vis.astype(np.uint8), 1)
    cx0, cy0, cx1, cy1 = paths_bbox(cut)
    ax0, ay0 = min(ax0, int(math.floor(cx0)) - 1), min(ay0, int(math.floor(cy0)) - 1)
    ax1, ay1 = max(ax1, int(math.ceil(cx1)) + 2), max(ay1, int(math.ceil(cy1)) + 2)
    ax0, ay0, ax1, ay1 = max(0, ax0), max(0, ay0), min(cw, ax1), min(ch, ay1)
    ax0, ay0, ax1, ay1 = int(ax0), int(ay0), int(ax1), int(ay1)

    # --- รองขาว: ตามเนื้อภาพที่อยู่ในเส้นตัด หดเข้าเล็กน้อยกันขาวโผล่ ---
    white = []
    if p.white == "full":
        wm = ((art_a >= 128) & (cut_m >= 128)).astype(np.uint8) * 255
        ck = int(round(mm2px(p.white_choke_mm)))
        if ck > 0:
            wm = cv2.erode(wm, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * ck + 1, 2 * ck + 1)))
        if wm.max() > 0:
            white = shift(from_potrace(cutout.trace(wm, p.smooth, turd)), -ax0, -ay0)
            extras.append("รองขาวเต็มรูปทรง")

    art = np.dstack([art_rgb[ay0:ay1, ax0:ax1], art_a[ay0:ay1, ax0:ax1]])
    cut = shift(cut_main, -ax0, -ay0)
    AW, AH = ax1 - ax0, ay1 - ay0
    main_bbox = paths_bbox(cut)

    # --- ฐานสแตนดี้: ชิ้นแยก วางทางขวา ร่องกว้างเท่าขาเสียบ สูงเท่าความหนาแผ่น ---
    base = []
    if p.stand and tab:
        tw_px, _ = tab
        bw_px = max(tw_px + mm2px(20), (main_bbox[2] - main_bbox[0]) * 0.6)
        bd_px = mm2px(p.base_d_mm)
        gap = mm2px(5)
        bx0 = main_bbox[2] + gap
        by1 = main_bbox[3]
        by0 = by1 - bd_px
        if by0 < 0:
            by0, by1 = 0.0, bd_px
        base = rect_path(bx0, by0, bx0 + bw_px, by1, mm2px(5))
        sw = tw_px + mm2px(p.slot_clear_mm)
        sh = mm2px(p.thick_mm + p.slot_clear_mm)
        scx, scy = bx0 + bw_px / 2, (by0 + by1) / 2
        base += rect_path(scx - sw / 2, scy - sh / 2, scx + sw / 2, scy + sh / 2)
        newW = int(math.ceil(bx0 + bw_px)) + 2
        newH = max(AH, int(math.ceil(by1)) + 2)
        if newW > AW or newH > AH:
            big = np.zeros((newH, max(newW, AW), 4), np.uint8)
            big[:AH, :AW] = art
            art, AW, AH = big, big.shape[1], big.shape[0]
        to_mm0 = lambda px: px / dpp * 25.4
        extras.append(f"ขาเสียบ {to_mm0(tw_px):.1f} มม. · ฐาน {to_mm0(bw_px):.0f}×{p.base_d_mm:g} มม. "
                      f"ร่อง {to_mm0(sw):.1f}×{p.thick_mm + p.slot_clear_mm:.1f} มม.")

    # --- ขนาดจริง + คำเตือน ---
    to_mm = lambda px: px / dpp * 25.4
    bx0, by0, bx1, by1 = body_bb
    cut_w_mm, cut_h_mm = to_mm(bx1 - bx0), to_mm(by1 - by0)
    if p.hole or p.stand:
        tb = paths_bbox(cut + base)
        extras.append(f"รวมทั้งชิ้น {to_mm(tb[2] - tb[0]) / 10:.2f} × {to_mm(tb[3] - tb[1]) / 10:.2f} ซม.")
    if dpi < 100:
        warnings.append(f"ความละเอียดต่ำมาก ({dpi:.0f} dpi) ภาพจะแตก")
    elif dpi < 150:
        warnings.append(f"ความละเอียดค่อนข้างต่ำ ({dpi:.0f} dpi)")
    if p.offset_mm < 0 and shape == "contour" and method == "alpha" and not p.extend:
        pass  # ตัดเข้าเนื้อบน PNG: ภาพยื่นออกนอกเส้นเองอยู่แล้ว

    lines = [(p.cut_type, cut + base, "stroke")]
    if white:
        lines.append(("White", white, "fill"))
    return {
        "art": Image.fromarray(np.ascontiguousarray(art), "RGBA"),
        "cut": cut + base, "lines": lines, "white": white, "extras": extras, "cut_type": p.cut_type,
        "w": AW, "h": AH, "dpi": float(dpi), "dpp": float(dpp),
        "map": {"dx": float(ox - ax0), "dy": float(oy - ay0), "W0": int(W0), "H0": int(H0)},
        "method": method, "shape": shape, "ai_model": p.ai_model if method == "ai" else "",
        "cut_w_mm": float(cut_w_mm), "cut_h_mm": float(cut_h_mm),
        "obj_w_mm": float(to_mm(bw)), "obj_h_mm": float(to_mm(bh)),
        "cut_len_mm": float(to_mm(paths_length(cut + base))),
        "warnings": warnings,
    }


# =====================================================================
# 4) ไฟล์ .ai/.pdf ที่มีเส้นตัดของลูกค้ามาแล้ว
# =====================================================================
def process_file_cut(entry: dict, p: SimpleNamespace, scale: float) -> dict:
    """✂️ ใช้ลายเต็ม (รวมตัดตก) + เส้นตัดจากเลเยอร์ไดคัทในไฟล์ตรง ๆ ไม่สร้างเส้นใหม่
    ทำไม (12 ต.ค. 69 · งานคุณตี๋): ชิ้นงานวางชิดกันจนลายต่อเป็นผืนเดียว เส้นที่สร้างจากรูปทรงลายเลยเป็นกรอบใหญ่กรอบเดียว
    รูปร่าง/ระยะเส้นตัด/ขอบรอบรูป ไม่มีผลในโหมดนี้ — เส้นตายตัวตามไฟล์"""
    rgba = entry["rgba"]
    if scale < 1.0:
        h0, w0 = rgba.shape[:2]
        rgba = np.array(Image.fromarray(rgba).resize((max(1, round(w0 * scale)), max(1, round(h0 * scale))), Image.LANCZOS))
    H0, W0 = rgba.shape[:2]
    cut = [{"start": (c["start"][0] * scale, c["start"][1] * scale),
            "segs": [(sg[0],) + tuple((q[0] * scale, q[1] * scale) for q in sg[1:]) for sg in c["segs"]]}
           for c in entry["cutpaths"]]
    a = rgba[..., 3]
    vis = (a > 0).astype(np.uint8)
    mx0, my0, mx1, my1 = cutout.mask_bbox(vis, 0) if vis.any() else (0, 0, W0, H0)
    cx0, cy0, cx1, cy1 = paths_bbox(cut)
    x0, y0 = max(0, int(min(mx0, math.floor(cx0))) - 2), max(0, int(min(my0, math.floor(cy0))) - 2)
    x1, y1 = min(W0, int(max(mx1, math.ceil(cx1))) + 3), min(H0, int(max(my1, math.ceil(cy1))) + 3)
    art = Image.fromarray(np.ascontiguousarray(rgba[y0:y1, x0:x1]), "RGBA")
    cut = shift(cut, -x0, -y0)

    dpi = entry.get("dpi") or p.dpi
    if p.size_mm > 0 and p.size_axis in ("w", "h"):
        base = (cx1 - cx0 if p.size_axis == "w" else cy1 - cy0) / scale
        dpi = base * 25.4 / p.size_mm
    dpp = dpi * scale
    to_mm = lambda px: px / dpp * 25.4
    return {
        "art": art, "cut": cut, "w": art.width, "h": art.height, "dpi": float(dpi), "dpp": float(dpp),
        "method": "file", "shape": "file",
        "cut_w_mm": float(to_mm(cx1 - cx0)), "cut_h_mm": float(to_mm(cy1 - cy0)),
        "obj_w_mm": float(to_mm(mx1 - mx0)), "obj_h_mm": float(to_mm(my1 - my0)),
        "cut_len_mm": float(to_mm(paths_length(cut))),
        "warnings": [], "filecut": len(cut),
        # รูปแบบเดียวกับ process() — ai_bytes ใช้ lines · เส้นจากไฟล์ = ตัดขาด (Cut100 หรือ Cut50 ตามที่เลือก)
        "lines": [(p.cut_type, cut, "stroke")], "white": [], "extras": [f"เส้นตัดจากไฟล์ลูกค้า {len(cut)} เส้น"],
        "cut_type": p.cut_type, "map": None, "ai_model": "",
    }
