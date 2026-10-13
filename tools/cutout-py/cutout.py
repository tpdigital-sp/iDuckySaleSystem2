"""
cutout.py — ลบพื้นหลังแบบขอบคมเหมือน pen tool

ขั้นตอน:
  1) AI ตัดพื้นหลัง (rembg + โมเดล BiRefNet/ISNet) -> mask
  2) ทำความสะอาด mask (threshold, ปิดรู, ตัดเศษ, หดขอบตัด halo)
  3) แปลง mask เป็นเส้น vector (Potrace) -> Bezier เรียบ
  4) วาด path กลับเป็น mask คมเนียน (supersample) แล้วตัดรูปต้นฉบับ

ผลลัพธ์ต่อรูป:
  ชื่อไฟล์_cut.png   รูปพื้นใสขอบคม
  ชื่อไฟล์_path.svg  เส้น path รอบวัตถุ
  (ถ้าใส่ --border-mm) ชื่อไฟล์_sticker.png + ชื่อไฟล์_cutline.svg  สติกเกอร์มีขอบ + เส้นไดคัท

วิธีใช้:
  python cutout.py input_folder output_folder
  python cutout.py photo.jpg output_folder --model isnet-general-use --smooth 1.0
  python cutout.py in out --border-mm 2          # ขอบขาว 2 มม. + เส้นไดคัท
"""
from __future__ import annotations  # ให้รันบน Python 3.9 ของเครื่อง (type hint แบบ X | None)

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageColor, ImageDraw
import potrace
from rembg import new_session, remove

IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


def make_session(model: str):
    """โหลดโมเดลบน CPU — CoreML บน Mac ค้างตอนแปลง BiRefNet (กินแรม 11 GB ไม่ขยับ)"""
    return new_session(model, providers=["CPUExecutionProvider"])


# ---------- 1) AI mask ----------
def ai_mask(img: Image.Image, session) -> np.ndarray:
    out = remove(img, session=session, only_mask=True)
    return np.array(out.convert("L"))


# ---------- 2) clean mask ----------
def clean_mask(alpha: np.ndarray, shrink: int, min_area_ratio: float) -> np.ndarray:
    m = (alpha >= 128).astype(np.uint8) * 255

    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)  # ปิดรอยแตกเล็กๆ
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k)   # ลบจุดเศษ

    # ตัดชิ้นส่วนเล็กๆ ที่หลุดออกมา
    n, labels, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    min_area = m.size * min_area_ratio
    keep = np.zeros_like(m)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            keep[labels == i] = 255
    m = keep

    # หดขอบเข้าเพื่อตัดขอบสีพื้นหลังเดิม (halo)
    if shrink > 0:
        ks = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * shrink + 1, 2 * shrink + 1))
        m = cv2.erode(m, ks)
    return m


# ---------- 3) vectorize ----------
def trace(mask: np.ndarray, smooth: float, turdsize: int):
    # potracer ถือว่าค่า False คือส่วนที่ต้อง trace จึงต้องกลับค่า mask ก่อน
    bmp = potrace.Bitmap(~(mask > 0))
    return bmp.trace(turdsize=turdsize, alphamax=smooth, opticurve=True, opttolerance=0.2)


def path_to_svg_d(plist) -> str:
    parts = []
    for curve in plist:
        s = curve.start_point
        parts.append(f"M{s.x:.2f},{s.y:.2f}")
        for seg in curve.segments:
            if seg.is_corner:
                parts.append(f"L{seg.c.x:.2f},{seg.c.y:.2f}L{seg.end_point.x:.2f},{seg.end_point.y:.2f}")
            else:
                parts.append(
                    f"C{seg.c1.x:.2f},{seg.c1.y:.2f} {seg.c2.x:.2f},{seg.c2.y:.2f} "
                    f"{seg.end_point.x:.2f},{seg.end_point.y:.2f}"
                )
        parts.append("Z")
    return "".join(parts)


def flatten(plist, scale: float, steps: int = 16):
    """แปลง Bezier เป็น polygon สำหรับวาด mask"""
    polys = []
    for curve in plist:
        pts = [(curve.start_point.x, curve.start_point.y)]
        for seg in curve.segments:
            p0 = np.array(pts[-1])
            if seg.is_corner:
                pts.append((seg.c.x, seg.c.y))
                pts.append((seg.end_point.x, seg.end_point.y))
            else:
                c1 = np.array([seg.c1.x, seg.c1.y])
                c2 = np.array([seg.c2.x, seg.c2.y])
                p3 = np.array([seg.end_point.x, seg.end_point.y])
                for t in np.linspace(0, 1, steps)[1:]:
                    u = 1 - t
                    p = u**3 * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t**3 * p3
                    pts.append((p[0], p[1]))
        polys.append([(x * scale, y * scale) for x, y in pts])
    return polys


# ---------- 4) render clean alpha ----------
def mask_bbox(mask: np.ndarray, margin: int = 2):
    """กรอบสี่เหลี่ยมรอบวัตถุ (x0, y0, x1, y1) เผื่อขอบ margin px"""
    ys, xs = np.nonzero(mask)
    h, w = mask.shape
    return (max(0, xs.min() - margin), max(0, ys.min() - margin),
            min(w, xs.max() + 1 + margin), min(h, ys.max() + 1 + margin))


def render_alpha(plist, w: int, h: int, ss: int = 4) -> np.ndarray:
    """วาด path เป็น mask ขอบเนียน: เติมที่ความละเอียด ss เท่า แล้วย่อแบบเฉลี่ยพื้นที่"""
    if w * h > 12_000_000:  # ภาพใหญ่มาก ลด supersample กันแรมเต็ม
        ss = 2
    polys = [np.round(np.array(p)).astype(np.int32) for p in flatten(plist, ss) if len(p) >= 3]
    canvas = np.zeros((h * ss, w * ss), np.uint8)
    if polys:
        # fillPoly เติมแบบ even-odd: รูด้านใน (เช่น ตรงกลางตัว O) ออกมาโปร่งถูกต้อง
        cv2.fillPoly(canvas, polys, 255)
    return cv2.resize(canvas, (w, h), interpolation=cv2.INTER_AREA)


def process(src: Path, out_dir: Path, session, args):
    img = Image.open(src).convert("RGB")
    w, h = img.size

    alpha = ai_mask(img, session)
    mask = clean_mask(alpha, args.shrink, args.min_area)
    if mask.max() == 0:
        print(f"  ! {src.name}: ไม่พบวัตถุ ข้ามไป")
        return

    plist = trace(mask, args.smooth, args.turdsize)
    write_svg(out_dir / f"{src.stem}_path.svg", plist, w, h)

    clean_alpha = render_alpha(plist, w, h)
    rgba = img.copy()
    rgba.putalpha(Image.fromarray(clean_alpha))
    rgba.save(out_dir / f"{src.stem}_cut.png", optimize=True, dpi=(args.dpi, args.dpi))
    (out_dir / f"{src.stem}_cut.ai").write_bytes(ai_bytes(rgba, plist, args.dpi))

    if args.debug:
        Image.fromarray(alpha).save(out_dir / f"{src.stem}_dbg_ai_mask.png")
        Image.fromarray(mask).save(out_dir / f"{src.stem}_dbg_clean_mask.png")

    note = ""
    border_px = border_size_px(args)
    if border_px > 0:
        make_sticker(rgba, clean_alpha, border_px, src.stem, out_dir, args)
        note = f" + ขอบ {border_px}px"

    print(f"  ✓ {src.name}  ({len(plist)} path{note})")


# ---------- 5) sticker border + cut line ----------
def border_size_px(args) -> int:
    if args.border is not None:
        return max(0, int(args.border))
    return max(0, round(args.border_mm / 25.4 * args.dpi))


def fill_holes(m: np.ndarray) -> np.ndarray:
    h, w = m.shape
    flood = m.copy()
    ff_mask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(flood, ff_mask, (0, 0), 255)  # เติมพื้นหลังจากมุม
    return m | cv2.bitwise_not(flood)            # ส่วนที่เติมไม่ถึง = รูข้างใน


def svg_text(plist, w: int, h: int, color: str = "#ff00ff", dpi: float | None = None) -> str:
    d = path_to_svg_d(plist)
    if dpi:  # ใส่ขนาดจริงเป็น มม. ให้ Illustrator เปิดได้ขนาดถูกต้อง
        sw, sh = f"{w / dpi * 25.4:.3f}mm", f"{h / dpi * 25.4:.3f}mm"
    else:
        sw, sh = str(w), str(h)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{sw}" height="{sh}" viewBox="0 0 {w} {h}">\n'
        f'  <path d="{d}" fill="none" stroke="{color}" stroke-width="1" fill-rule="evenodd"/>\n'
        f"</svg>\n"
    )


def ai_bytes(img: Image.Image, plist, dpi: int, spot: str = "CutContour") -> bytes:
    """สร้างไฟล์ .ai (แบบ PDF-compatible ที่ Illustrator เปิดได้) ภายในมี
    รูป + เส้นไดคัท vector สีพิเศษ (spot) ชื่อ CutContour ขนาดจริงตาม dpi"""
    import zlib
    w, h = img.size
    k = 72.0 / dpi                      # px -> pt
    Wpt, Hpt = w * k, h * k
    rgba = img.convert("RGBA")
    rgb = zlib.compress(rgba.convert("RGB").tobytes(), 6)
    alpha = zlib.compress(rgba.getchannel("A").tobytes(), 6)

    # เส้นไดคัท: พิกัด px, พลิกแกน y ด้วย cm
    f = lambda v: f"{v:.3f}"
    ops = []
    for curve in plist:
        sp = curve.start_point
        ops.append(f"{f(sp.x)} {f(sp.y)} m")
        for seg in curve.segments:
            if seg.is_corner:
                ops.append(f"{f(seg.c.x)} {f(seg.c.y)} l {f(seg.end_point.x)} {f(seg.end_point.y)} l")
            else:
                ops.append(f"{f(seg.c1.x)} {f(seg.c1.y)} {f(seg.c2.x)} {f(seg.c2.y)} "
                           f"{f(seg.end_point.x)} {f(seg.end_point.y)} c")
        ops.append("h")
    content = (
        f"q {f(Wpt)} 0 0 {f(Hpt)} 0 0 cm /Im0 Do Q\n"
        f"q {k:.6f} 0 0 {-k:.6f} 0 {f(Hpt)} cm /CS0 CS 1 SCN {0.25 / k:.4f} w 1 j\n"
        + "\n".join(ops) + "\nS Q\n"
    ).encode()
    content_z = zlib.compress(content, 6)

    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {f(Wpt)} {f(Hpt)}] "
         f"/TrimBox [0 0 {f(Wpt)} {f(Hpt)}] /Contents 4 0 R "
         f"/Resources << /XObject << /Im0 5 0 R >> /ColorSpace << /CS0 7 0 R >> >> >>").encode(),
        b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(content_z) + content_z + b"\nendstream",
        (f"<< /Type /XObject /Subtype /Image /Width {w} /Height {h} /ColorSpace /DeviceRGB "
         f"/BitsPerComponent 8 /Filter /FlateDecode /SMask 6 0 R /Length {len(rgb)} >>\nstream\n").encode()
        + rgb + b"\nendstream",
        (f"<< /Type /XObject /Subtype /Image /Width {w} /Height {h} /ColorSpace /DeviceGray "
         f"/BitsPerComponent 8 /Filter /FlateDecode /Length {len(alpha)} >>\nstream\n").encode()
        + alpha + b"\nendstream",
        (f"[/Separation /{spot} /DeviceCMYK << /FunctionType 2 /Domain [0 1] "
         f"/C0 [0 0 0 0] /C1 [0 1 0 0] /N 1 >>]").encode(),
    ]
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


def write_svg(path: Path, plist, w: int, h: int, color: str = "#ff00ff"):
    path.write_text(svg_text(plist, w, h, color), encoding="utf-8")


def add_stroke(cut: Image.Image, cut_alpha: np.ndarray, s: int, color: str, args):
    """ขอบรอบรูป (Stroke) แบบ Photoshop "Outside": ขยายรูปทรงออก s px เติมสีทึบ แล้ววางรูปทับ
    คืนค่า (ภาพ RGBA ที่มีขอบ, alpha ใหม่, เส้นรอบนอก plist, กว้าง, สูง)
    เส้นรอบนอกถูก trace ใหม่ให้ขอบสีเรียบคมเหมือนตัวรูป และใช้เป็นเส้นไดคัท "ชิดขอบ" ต่อได้เลย"""
    pad = s + 4
    w, h = cut.size
    W, H = w + 2 * pad, h + 2 * pad
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.paste(cut, (pad, pad))
    base = np.zeros((H, W), np.uint8)
    base[pad:pad + h, pad:pad + w] = (cut_alpha >= 128).astype(np.uint8) * 255

    # รูด้านใน (เช่น ตัวหนังสือ knockout ในไฟล์ .ai) ไม่ใช่ขอบงาน — ขอบไปรอบนอกอย่างเดียว ไม่ไหลเข้าไปเติมสีในรู
    # เจอ 12 ต.ค. 69: "NO.1" สีขาวในไฟล์ Roomba เป็นรูโปร่งใส ใส่ขอบแดงแล้วตัวหนังสือกลายเป็นแดง
    # ติ๊ก "เว้นรูด้านใน" = ขอบเดินรอบรูด้วย (แบบ Photoshop)
    keep_holes = getattr(args, "keep_holes", False)
    filled = base if keep_holes else fill_holes(base)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * s + 1, 2 * s + 1))
    smask = cv2.dilate(filled, k)  # วงกลม = มุมขอบมน เหมือน stroke ของ Illustrator/Photoshop
    holes = ((filled > 0) & (base == 0)).astype(np.uint8)
    if holes.any():  # ขยายเผื่อขอบเนียน (anti-alias) ของรู ไม่ให้สีขอบซึมเป็นเส้นบาง ๆ — แต่ไม่แตะขอบนอก
        k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        holes = cv2.dilate(holes, k3) & cv2.erode(filled, k3)
    holes = holes > 0

    x0, y0, x1, y1 = mask_bbox(smask, 2)
    smask = np.ascontiguousarray(smask[y0:y1, x0:x1])
    holes = holes[y0:y1, x0:x1]
    canvas = canvas.crop((x0, y0, x1, y1))
    W, H = canvas.size

    splist = trace(smask, args.smooth, args.turdsize)
    salpha = render_alpha(splist, W, H)
    salpha[holes] = 0
    out = Image.new("RGBA", (W, H), ImageColor.getrgb(color)[:3] + (255,))
    out.putalpha(Image.fromarray(salpha))
    out.alpha_composite(canvas)
    return out, np.array(out.getchannel("A")), splist, W, H


def build_sticker(cut: Image.Image, cut_alpha: np.ndarray, b: int, args):
    """คืนค่า (ภาพสติกเกอร์ RGBA, เส้นไดคัท plist, กว้าง, สูง)"""
    kc_size = max(3, int(b * args.bridge) * 2 + 1)
    # เผื่อพื้นที่ทำงานให้พอ ไม่อย่างนั้นการถมร่องจะลามชนขอบผืนผ้าใบแล้วทำให้เส้นใหญ่เกินจริง
    pad = b + kc_size // 2 + 4
    w, h = cut.size
    W, H = w + 2 * pad, h + 2 * pad

    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.paste(cut, (pad, pad))
    base = np.zeros((H, W), np.uint8)
    base[pad:pad + h, pad:pad + w] = (cut_alpha >= 128).astype(np.uint8) * 255

    # ขยายออกด้วยวงกลม = offset เส้นแบบมุมมน
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * b + 1, 2 * b + 1))
    bmask = cv2.dilate(base, k)
    # ปิดร่องแคบๆ ระหว่างส่วนต่างๆ ให้มีดไดคัทวิ่งได้ลื่น
    kc = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kc_size, kc_size))
    bmask = cv2.morphologyEx(bmask, cv2.MORPH_CLOSE, kc, borderType=cv2.BORDER_CONSTANT, borderValue=0)
    if not args.keep_holes:
        bmask = fill_holes(bmask)

    # ครอปให้พอดีเส้นไดคัท
    x0, y0, x1, y1 = mask_bbox(bmask, 2)
    bmask = np.ascontiguousarray(bmask[y0:y1, x0:x1])
    canvas = canvas.crop((x0, y0, x1, y1))
    W, H = canvas.size

    bplist = trace(bmask, args.smooth, args.turdsize)
    balpha = render_alpha(bplist, W, H)

    if str(args.border_color).lower() in ("none", "transparent", ""):
        sticker = canvas  # ไม่เติมสี: เว้นระยะโปร่งใส มีแค่เส้นไดคัทอยู่ห่างออกไป
    else:
        color = ImageColor.getrgb(args.border_color)
        sticker = Image.new("RGBA", (W, H), color + (255,))
        sticker.putalpha(Image.fromarray(balpha))
        sticker.alpha_composite(canvas)
    return sticker, bplist, W, H


def make_sticker(cut: Image.Image, cut_alpha: np.ndarray, b: int, stem: str, out_dir: Path, args):
    sticker, bplist, W, H = build_sticker(cut, cut_alpha, b, args)
    sticker.save(out_dir / f"{stem}_sticker.png", optimize=True, dpi=(args.dpi, args.dpi))
    write_svg(out_dir / f"{stem}_cutline.svg", bplist, W, H)
    (out_dir / f"{stem}_sticker.ai").write_bytes(ai_bytes(sticker, bplist, args.dpi))


def main():
    ap = argparse.ArgumentParser(description="ลบพื้นหลังขอบคมแบบ pen tool")
    ap.add_argument("input", help="ไฟล์รูป หรือโฟลเดอร์")
    ap.add_argument("output", help="โฟลเดอร์ผลลัพธ์")
    ap.add_argument("--model", default="birefnet-general",
                    help="birefnet-general (แม่นสุด, ช้า) | isnet-general-use | u2net (เร็ว)")
    ap.add_argument("--smooth", type=float, default=1.0,
                    help="ความโค้งมนของเส้น 0=เหลี่ยม 1=ปกติ 1.3=มนมาก")
    ap.add_argument("--shrink", type=int, default=1, help="หดขอบเข้า (px) เพื่อตัด halo")
    ap.add_argument("--turdsize", type=int, default=10, help="ไม่ trace จุดที่เล็กกว่านี้ (px)")
    ap.add_argument("--min-area", type=float, default=0.001,
                    help="ตัดชิ้นที่เล็กกว่าสัดส่วนนี้ของภาพ")
    ap.add_argument("--debug", action="store_true", help="บันทึก mask ระหว่างทางด้วย")
    # ขอบสติกเกอร์
    ap.add_argument("--border-mm", type=float, default=0,
                    help="ความหนาขอบสติกเกอร์ (มม.) 0 = ไม่ใส่ขอบ")
    ap.add_argument("--border", type=int, default=None, help="ความหนาขอบเป็นพิกเซล (แทน --border-mm)")
    ap.add_argument("--border-color", default="#ffffff", help="สีขอบ เช่น #ffffff หรือ black")
    ap.add_argument("--dpi", type=int, default=300, help="ความละเอียดงานพิมพ์ ใช้แปลง มม. เป็นพิกเซล")
    ap.add_argument("--bridge", type=float, default=1.0,
                    help="ปิดร่องแคบระหว่างส่วนต่างๆ 0=ตามรูปเป๊ะ 1=ปกติ 2=มนมาก")
    ap.add_argument("--keep-holes", action="store_true",
                    help="ไม่ถมรูข้างใน (ปกติขอบสติกเกอร์จะถมรูให้ตัดง่าย)")
    args = ap.parse_args()

    src = Path(args.input)
    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    files = [src] if src.is_file() else sorted(p for p in src.iterdir() if p.suffix.lower() in IMG_EXT)
    if not files:
        sys.exit("ไม่พบไฟล์รูป")

    print(f"โหลดโมเดล {args.model} (ครั้งแรกจะดาวน์โหลดอัตโนมัติ)...")
    session = make_session(args.model)
    for f in files:
        try:
            process(f, out_dir, session, args)
        except Exception as e:
            print(f"  ✗ {f.name}: {e}")
    print(f"เสร็จแล้ว -> {out_dir.resolve()}")


if __name__ == "__main__":
    main()
