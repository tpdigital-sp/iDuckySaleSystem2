"""
app.py — เว็บแอพทำเส้นไดคัท (รันในเครื่อง)

  python app.py            เปิดที่ http://localhost:8777
  python app.py --share    ให้เครื่องอื่นในวง Wi-Fi เดียวกันใช้ได้ด้วย

ในระบบ iDucky: หลังบ้าน /admin/diecut?tab=bg ฝังหน้านี้ไว้เป็นแท็บ (iframe) และเช็ค /health
เปิดเซิร์ฟเวอร์ด้วยการดับเบิลคลิก tools/cutout-py/start.command
(พอร์ต 8765 ชนกับ AdminBuddy จึงย้ายมา 8777)
"""
from __future__ import annotations  # ให้รันบน Python 3.9 ของเครื่อง (type hint แบบ X | None)

import argparse
import base64
import csv
import hashlib
import hmac
import io
import json
import os
import re
import socket
import threading
import webbrowser
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

import numpy as np
from PIL import Image, ImageOps

import cutout
import engine
import illustrator
import products
import review

HERE = Path(__file__).resolve().parent
PAGE = HERE / "web" / "index.html"
PREVIEW_MAX = 1400
MAX_IMAGES = 80

STORE: dict[str, dict] = {}
STORE_LOCK = threading.Lock()
AI_LOCK = threading.Lock()
SESSIONS: dict = {}
MODEL_NAME = "birefnet-general"   # ค่าเริ่มต้นถ้ายังไม่ได้ตั้งในหน้าตั้งค่า

# รุ่น AI ตัดพื้นหลังที่แนะนำ (ชื่อ, คำอธิบาย) — รุ่นอื่นใน rembg พิมพ์ชื่อเองได้ในหน้าตั้งค่า
AI_MODELS = [
    ("birefnet-general", "แม่นที่สุดสำหรับงานทั่วไป (ไฟล์ใหญ่ ~1 GB)"),
    ("birefnet-general-lite", "เร็วกว่า ความแม่นลดลงเล็กน้อย"),
    ("isnet-anime", "ภาพการ์ตูน / ภาพวาด / อนิเมะ"),
    ("bria-rmbg", "ภาพทั่วไป ขอบละเอียด"),
    ("birefnet-portrait", "ภาพคน / ภาพถ่ายบุคคล"),
    ("birefnet-massive", "แม่นสูงมาก แต่ช้าที่สุด"),
    ("isnet-general-use", "ทั่วไป เร็ว"),
    ("u2net", "รุ่นเก่า เร็ว ใช้เทียบ"),
]

# 🔄 โค้ดที่โหลดตอนเปิดโปรแกรม — หน้าเว็บอ่านไฟล์ใหม่ทุกครั้ง แต่โค้ด Python ไม่ (ต้องปิด-เปิดใหม่)
# เคยเจอ 12 ต.ค. 69: เพิ่มขอบรอบรูป (Stroke) แล้วหน้าเว็บมีช่องตั้งค่า แต่เซิร์ฟเวอร์ตัวเก่าเพิกเฉย = "ใช้ไม่ได้" แบบเงียบ ๆ
SRC_FILES = [HERE / n for n in ("app.py", "cutout.py", "engine.py", "review.py", "illustrator.py", "products.py")]
SRC_STAMP = max(f.stat().st_mtime for f in SRC_FILES if f.exists())


def code_stale() -> bool:
    try:
        return max(f.stat().st_mtime for f in SRC_FILES if f.exists()) > SRC_STAMP + 1
    except OSError:
        return False


def model_names() -> set:
    try:
        from rembg.sessions import sessions_class
        return {c.name() for c in sessions_class}
    except Exception:
        return {m for m, _ in AI_MODELS}


def default_model() -> str:
    return review.load_config().get("ai_model") or MODEL_NAME


def get_session(name: str):
    if name not in SESSIONS:
        if name not in model_names():
            raise ValueError(f"ไม่รู้จัก AI รุ่น '{name}' (ลองอัปเดต rembg)")
        print(f"กำลังโหลด AI รุ่น {name} ... (ครั้งแรกจะดาวน์โหลดก่อน)")
        SESSIONS[name] = cutout.make_session(name)  # บังคับ CPU — CoreML บน Mac ค้าง (ดู cutout.make_session)
    return SESSIONS[name]


def ai_fn(entry: dict, model: str = "") -> np.ndarray:
    model = model or default_model()
    with AI_LOCK:  # โมเดลทำงานทีละรูป
        return cutout.ai_mask(Image.fromarray(entry["rgba"][..., :3]), get_session(model))


# ---------------- images ----------------
def put(key: str, entry: dict):
    with STORE_LOCK:
        STORE[key] = entry
        while len(STORE) > MAX_IMAGES:
            STORE.pop(next(iter(STORE)))


def add_image(data: bytes, name: str) -> list:
    """เพิ่มรูป 1 ไฟล์ — คืนลิสต์ (ไฟล์ .ai/.pdf หลายหน้า = หลายรายการ หน้าละรายการ)"""
    if is_vector_file(data, name):
        return add_vector(data, name)
    return [add_raster(data, name)]


def add_raster(data: bytes, name: str) -> dict:
    key = hashlib.sha1(data).hexdigest()[:16]
    with STORE_LOCK:
        if key in STORE:
            return info(key)
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
    rgba = np.array(im.convert("RGBA"))
    det = engine.detect(rgba)
    entry = {"name": name, "rgba": rgba, "detect": det, "masks": {}}
    if det["method"] == "ai":  # ตัดล่วงหน้าเลย จะได้ไม่ต้องรอตอนเปิดดู
        dm = default_model()
        m = ai_fn(entry, dm)
        entry["masks"][f"ai:{dm}"] = m  # แคชแยกตามรุ่น AI (engine.method_alpha)
        frac = (m >= 128).mean()
        if frac < 0.01:
            det.update(method="none", reason="AI ไม่พบวัตถุเด่น ใช้ภาพทั้งใบ")
        elif frac > 0.95:
            det.update(method="none", reason="วัตถุเต็มภาพ ใช้ภาพทั้งใบ")
    put(key, entry)
    return info(key)


# ---------------- ไฟล์ .ai / .pdf ----------------
# เลเยอร์ที่ไม่ใช่ตัวงาน — ซ่อนก่อนวาด ไม่งั้นพื้นหลัง/เส้นตัดเดิมกลายเป็นส่วนหนึ่งของรูป
SKIP_LAYER = re.compile(r"guide|cut|contour|die|crop|trim|mark|ไดคัท|เส้นตัด|ตัดตก|ไกด์", re.I)
# เลเยอร์เส้นไดคัทที่ลูกค้า/กราฟฟิกวาดมาเอง — เอาเส้นนี้ไปใช้ตรง ๆ แทนการสร้างเส้นใหม่จากรูปทรงลาย
CUT_LAYER = re.compile(r"cut|contour|die|ไดคัท|เส้นตัด", re.I)
VECTOR_MAX_PX = 6000  # ด้านยาวสุดของภาพที่วาดจากไฟล์ vector (กันแรมเต็มกับแผ่นใหญ่)


def is_vector_file(data: bytes, name: str) -> bool:
    return data[:1024].lstrip().startswith(b"%PDF") or Path(name).suffix.lower() in (".ai", ".pdf")


def file_cut_paths(page, k: float) -> list:
    """เส้นจากเลเยอร์ไดคัทในไฟล์ → [{"start": (x, y), "segs": [("L", p) | ("C", c1, c2, p)]}] หน่วย px (k = px ต่อ pt)
    ทำไม (12 ต.ค. 69 · งานคุณตี๋): ชิ้น NEW ในไฟล์วางชิดกันจนลายต่อเป็นผืนเดียว เส้นที่สร้างจากรูปทรงลายเลยเป็นกรอบใหญ่กรอบเดียว
    แต่ลูกค้าวาดเส้นตัดแยกทุกชิ้นมาในเลเยอร์ Cut แล้ว (หน้า 1 = 32 + 15 ชิ้น)"""
    P = lambda q: (q.x * k, q.y * k)
    curves = []
    for d in page.get_drawings():
        if not d.get("color") or not CUT_LAYER.search(str(d.get("layer") or "")):
            continue  # เฉพาะเส้น stroke ในเลเยอร์ไดคัท
        cur = None
        for it in d["items"]:
            op = it[0]
            if op in ("re", "qu"):
                q = it[1].quad if op == "re" else it[1]
                pts = [P(q.ul), P(q.ur), P(q.lr), P(q.ll)]
                curves.append({"start": pts[0], "segs": [("L", x) for x in pts[1:] + pts[:1]]})
                cur = None
                continue
            a = P(it[1])
            if cur is None or abs(cur["end"][0] - a[0]) > 0.5 or abs(cur["end"][1] - a[1]) > 0.5:
                cur = {"start": a, "segs": [], "end": a}
                curves.append(cur)
            if op == "l":
                cur["segs"].append(("L", P(it[2])))
                cur["end"] = P(it[2])
            elif op == "c":
                cur["segs"].append(("C", P(it[2]), P(it[3]), P(it[4])))
                cur["end"] = P(it[4])
    for c in curves:
        c.pop("end", None)
    return [c for c in curves if c["segs"]]


def add_vector(data: bytes, name: str) -> list:
    """.ai (บันทึกแบบ PDF Compatible ซึ่งเป็นค่าเริ่มต้นของ Illustrator) / .pdf
    - ซ่อนเลเยอร์ไกด์/เส้นตัด แล้ววาดพื้นโปร่งใส → engine.detect เห็นเป็น "ขอบโปร่งใสจากไฟล์" ไม่ต้องให้ AI เดา
      (AI เดาบนแผ่นงานเต็มแผ่นแล้วเจาะรูกลางลาย — งานคุณตี๋ 12 ต.ค. 69)
    - มีเลเยอร์ไดคัท = เก็บเส้นไว้ใช้ตรง ๆ (engine.process_file_cut)
    - ขนาดจริงตามหน้ากระดาษในไฟล์ (เก็บ dpi ของภาพที่วาด)"""
    import fitz  # PyMuPDF

    if not data[:1024].lstrip().startswith(b"%PDF"):
        raise ValueError("ไฟล์ .ai นี้ไม่ได้บันทึกแบบ PDF Compatible — ใน Illustrator กด Save As แล้วติ๊ก “Create PDF Compatible File”")
    raw = fitz.open(stream=data, filetype="pdf")  # สำเนาไว้อ่านเส้นไดคัท (อีกตัวซ่อนเลเยอร์ไว้วาดภาพ)
    doc = fitz.open(stream=data, filetype="pdf")
    hidden = []
    for c in doc.layer_ui_configs():
        if c.get("type") == "checkbox" and SKIP_LAYER.search(c.get("text", "")):
            doc.set_layer_ui_config(c["number"], action=2)  # 2 = ปิด
            hidden.append(c["text"])
    base = hashlib.sha1(data).hexdigest()[:14]
    stem_ = Path(name).stem or "file"
    out = []
    for i, page in enumerate(doc):
        key = f"{base}{i:02d}"
        with STORE_LOCK:
            if key in STORE:
                out.append(info(key))
                continue
        r = page.rect
        dpi = int(min(300, VECTOR_MAX_PX // (max(r.width, r.height) / 72)))
        pix = page.get_pixmap(dpi=dpi, alpha=True)
        im = Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)
        rgba = np.array(im)
        if rgba[..., 3].max() == 0:
            continue  # หน้าว่าง (ทุกอย่างอยู่ในเลเยอร์ที่ซ่อน)
        # ส่วนโปร่งใสเติมขาวใน RGB (alpha คงเดิม) — กันสีดำของพิกเซลโปร่งไปโผล่ตอนยืดสีขอบ/ภาพย่อ
        a = rgba[..., 3:4].astype(np.float32) / 255
        rgba[..., :3] = (rgba[..., :3] * a + 255 * (1 - a)).astype(np.uint8)
        det = engine.detect(rgba)
        entry = {"name": f"{stem_} · หน้า {i + 1}" if doc.page_count > 1 else stem_,
                 "rgba": rgba, "detect": det, "masks": {}, "dpi": dpi,
                 "thumb": thumb_of(im), "hidden": hidden, "cutpaths": file_cut_paths(raw[i], dpi / 72)}
        if det["method"] == "ai":  # ทึบทั้งหน้า = ไม่รู้ว่าตรงไหนพื้นหลัง → ตัดล่วงหน้าเหมือนรูปทั่วไป
            dm = default_model()
            entry["masks"][f"ai:{dm}"] = ai_fn(entry, dm)
        put(key, entry)
        out.append(info(key))
    if not out:
        raise ValueError("ไม่พบลายในไฟล์ (ทุกหน้าว่าง)")
    return out


def thumb_of(im: Image.Image) -> str:
    t = im.copy()
    t.thumbnail((120, 120))
    bg = Image.new("RGB", t.size, (255, 255, 255))
    bg.paste(t, mask=t.getchannel("A"))
    buf = io.BytesIO()
    bg.save(buf, "JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def info(key):
    e = STORE[key]
    h, w = e["rgba"].shape[:2]
    r = {"id": key, "name": e["name"], "w": w, "h": h,
         "detect": {"method": e["detect"]["method"], "reason": e["detect"]["reason"]}}
    if e.get("thumb"):
        r["thumb"] = e["thumb"]
    if e.get("cutpaths"):
        r["filecut"] = len(e["cutpaths"])
    if e.get("hidden"):
        r["hidden"] = e["hidden"]
    if e.get("dpi"):
        r["file_dpi"] = e["dpi"]
    return r


def get(key):
    if key not in STORE:
        raise KeyError("รูปหมดอายุ กรุณาเพิ่มรูปใหม่")
    return STORE[key]


def run(key, pdict, preview: bool):
    e = get(key)
    p = engine.params(products.apply(pdict))   # กฎของสินค้า: เปิด/ปิดโมดูล + ช่องที่ล็อก/ซ่อน (ทำฝั่งเซิร์ฟเวอร์เสมอ)
    if not p.ai_model:
        p.ai_model = default_model()   # รูปที่ไม่ได้เลือกรุ่นเอง ใช้รุ่นค่าเริ่มต้น
    scale = 1.0
    if preview:
        h, w = e["rgba"].shape[:2]
        scale = min(1.0, PREVIEW_MAX / max(w, h))
    return engine.process(e, p, scale, ai_fn), p, scale


def png_bytes(im: Image.Image, dpi=None) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "PNG", **({"dpi": (dpi, dpi)} if dpi else {}))
    return buf.getvalue()


def stem(key):
    return Path(get(key)["name"]).stem or "image"


def files_for(key, pdict, layered=False):
    r, p, _ = run(key, pdict, preview=False)
    s = stem(key)
    ai = engine.ai_bytes(r["art"], r["lines"], r["dpi"])  # Cut100/Cut50 + รองขาว White แยกสีพิเศษ
    if layered:  # ให้ Illustrator ในเครื่องแปลงเป็น .ai แท้ แยกเลเยอร์ Artwork / CutContour
        ai = illustrator.layered([ai])[0]
    return r, [
        (f"{s}.ai", ai),
        (f"{s}.png", png_bytes(r["art"], r["dpi"])),
        (f"{s}_cutline.svg", engine.svg_text(r["cut"], r["w"], r["h"], dpi=r["dpi"]).encode()),
    ]


def summary(r):
    return {
        "method": r["method"], "shape": r["shape"], "dpi": r["dpi"],
        "cut_w_mm": r["cut_w_mm"], "cut_h_mm": r["cut_h_mm"],
        "cut_len_mm": r["cut_len_mm"], "warnings": r["warnings"],
        "extras": r["extras"], "cut_type": r["cut_type"], "ai_model": r.get("ai_model", ""),
        "map": r.get("map"), "dpp": r["dpp"], "marks": r.get("marks", []),
        "filecut": r.get("filecut", 0), "stale": code_stale(),
    }


# ---------------- http ----------------
# 🔑 รหัสเข้าใช้ — ตั้งเมื่อรันบนเซิร์ฟเวอร์สาธารณะ (Hugging Face Space: Settings > Secrets > CUTOUT_KEY) · 22 ต.ค. 69
# ไม่ตั้ง = เปิดให้ทุกคำขอเหมือนเดิม (เครื่องร้าน localhost) · หน้าหลังบ้านส่งรหัสมากับ ?key= แล้วหน้าเว็บแนบ X-Cutout-Key ทุกคำขอ
ACCESS_KEY = os.environ.get("CUTOUT_KEY", "").strip()
OPEN_PATHS = {"/health", "/calendar-ai"}   # หน้าหลังบ้านเช็คสถานะก่อนรู้รหัส · /calendar-ai ไม่มี Illustrator บนเซิร์ฟเวอร์อยู่แล้ว
LOCKED_PAGE = ("<!doctype html><meta charset=utf-8><title>ทำเส้นไดคัท</title>"
               "<body style='font:16px system-ui;padding:40px;color:#334'>"
               "<h2>🔒 ต้องเปิดจากหลังบ้าน iDucky</h2><p>เมนู ไดคัท &gt; แท็บ ตัดพื้นหลัง AI</p>").encode()


def authorized(handler) -> bool:
    if not ACCESS_KEY:
        return True
    u = urlparse(handler.path)
    if u.path in OPEN_PATHS:
        return True
    got = handler.headers.get("X-Cutout-Key") or parse_qs(u.query).get("key", [""])[0]
    return bool(got) and hmac.compare_digest(got.encode(), ACCESS_KEY.encode())


def guard(fn):
    def wrap(self):
        if not authorized(self):
            if urlparse(self.path).path == "/" and self.command == "GET":
                return self.send(401, LOCKED_PAGE, "text/html; charset=utf-8")
            return self.json({"error": "ต้องมีรหัสเข้าใช้ (เปิดจากหลังบ้าน)"}, 401)
        try:
            fn(self)
        except KeyError as ex:
            self.json({"error": str(ex).strip("'\"")}, 404)
        except Exception as ex:
            self.json({"error": str(ex)}, 500)
    return wrap


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body: bytes, ctype, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def json(self, obj, code=200):
        self.send(code, json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def attach(self, name, body, ctype):
        self.send(200, body, ctype, {"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"})

    def body_json(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n) or b"{}")

    # 🗓 จอสร้างปฏิทินบนเว็บ (localhost:3016 / เว็บจริง) เรียกข้ามโดเมน — ต้องตอบ CORS เอง
    CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Private-Network": "true"}

    def do_OPTIONS(self):
        self.send(204, b"", "text/plain", {**self.CORS, "Access-Control-Allow-Methods": "GET, POST",
                                           "Access-Control-Allow-Headers": "content-type"})

    def calendar_ai(self):
        """POST /calendar-ai — ชั้นของปฏิทินจากเว็บ (PNG ทีละชั้น) → .ai แท้แยกเลเยอร์ (Illustrator ในเครื่อง)"""
        try:
            j = self.body_json()
            data = illustrator.calendar_ai(j)
            name = (str(j.get("title") or "calendar") + ".ai").replace("/", "-")
            return self.send(200, data, "application/postscript",
                             {**self.CORS, "Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"})
        except Exception as ex:
            import traceback
            print("calendar-ai ไม่สำเร็จ:", ex, flush=True)  # ลง cutout-py.log (Windows เปิดแบบไม่มีหน้าต่าง)
            traceback.print_exc()
            body = json.dumps({"error": str(ex)}, ensure_ascii=False).encode()
            return self.send(500, body, "application/json; charset=utf-8", self.CORS)

    @guard
    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/calendar-ai":  # เว็บเช็คก่อนว่าใช้ Illustrator ได้ไหม
            body = json.dumps({"ok": True, "illustrator": illustrator.available()}).encode()
            return self.send(200, body, "application/json", self.CORS)
        if u.path == "/health":  # หน้าหลังบ้านเช็คว่าเปิดเซิร์ฟเวอร์อยู่ไหม + รันโค้ดล่าสุดหรือยัง
            body = json.dumps({"ok": bool(SESSIONS), "stale": code_stale()}).encode()
            return self.send(200, body, "application/json", {"Access-Control-Allow-Origin": "*"})
        if u.path == "/":
            return self.send(200, PAGE.read_bytes(), "text/html; charset=utf-8")
        if u.path == "/download":
            key, kind = q["id"][0], q.get("kind", ["ai"])[0]
            pdict = json.loads(q.get("p", ["{}"])[0])
            layered = kind == "ai" and q.get("layered", ["0"])[0] == "1"
            _, files = files_for(key, pdict, layered)
            name, data = {"ai": files[0], "png": files[1], "svg": files[2]}[kind]
            ctype = {"ai": "application/postscript", "png": "image/png", "svg": "image/svg+xml"}[kind]
            return self.attach(name, data, ctype)
        if u.path == "/products":
            return self.json(products.payload())   # สินค้า + โมดูล + นิยามช่อง (หน้าเว็บวาดฟอร์มจากตรงนี้)
        if u.path == "/config":
            cfg = review.load_config()
            return self.json({"has_key": bool(cfg.get("anthropic_api_key")),
                              "model": cfg.get("model") or review.DEFAULT_MODEL,
                              "illustrator": illustrator.available(),
                              "ai_model": default_model(), "ai_models": AI_MODELS,
                              "ai_all": sorted(model_names())})
        self.send(404, b"not found", "text/plain")

    @guard
    def do_POST(self):
        u = urlparse(self.path)
        if u.path == "/calendar-ai":
            return self.calendar_ai()
        if u.path == "/upload":
            n = int(self.headers.get("Content-Length", 0))
            data = self.rfile.read(n)
            name = parse_qs(u.query).get("name", ["image"])[0]
            try:
                return self.json({"items": add_image(data, name)})
            except Exception as ex:
                return self.json({"error": f"เปิดรูปไม่ได้: {ex}"}, 400)

        if u.path == "/render":
            j = self.body_json()
            r, p, _ = run(j["id"], j.get("p", {}), preview=True)
            res = summary(r)
            res.update(art="data:image/png;base64," + base64.b64encode(png_bytes(r["art"])).decode(),
                       cut_svg=engine.svg_text(r["cut"], r["w"], r["h"]), w=r["w"], h=r["h"],
                       white_svg=(engine.svg_text(r["white"], r["w"], r["h"]) if r["white"] else ""))
            return self.json(res)

        if u.path == "/review":
            j = self.body_json()
            r, p, _ = run(j["id"], j.get("p", {}), preview=True)
            png = review.compose(get(j["id"])["rgba"], r["art"], engine.flatten(r["cut"]))
            out = review.ask_claude(png, review.job_info(r, p), review.load_config())
            # คำเตือนจากโปรแกรมเอง (ความละเอียด / วัตถุชนขอบภาพ) นับเป็นปัญหาด้วย
            for w in r["warnings"]:
                if w not in out["issues"]:
                    out["issues"].insert(0, w)
                    out["verdict"] = "review"
            return self.json(out)

        if u.path == "/zip":
            j = self.body_json()
            buf = io.BytesIO()
            rows, used = [], set()
            built = [files_for(it["id"], it.get("p", {})) for it in j.get("items", [])]
            if j.get("layered"):  # Illustrator เปิดครั้งเดียว แปลงทุกไฟล์รวดเดียว
                conv = illustrator.layered([files[0][1] for _, files in built])
                for (r, files), data in zip(built, conv):
                    files[0] = (files[0][0], data)
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
                for it, (r, files) in zip(j.get("items", []), built):
                    for name, data in files:
                        n, i = name, 2
                        while n in used:
                            pth = Path(name)
                            n = f"{pth.stem}-{i}{pth.suffix}"
                            i += 1
                        used.add(n)
                        z.writestr(n, data)
                    rows.append([get(it["id"])["name"], products.name_of(it.get("p", {}).get("product", "")),
                                 r["shape"], r["cut_type"], f"{r['cut_w_mm']:.1f}", f"{r['cut_h_mm']:.1f}",
                                 f"{r['cut_len_mm']:.0f}", f"{r['dpi']:.0f}", " / ".join(r["extras"]),
                                 it.get("status", "")])
                sio = io.StringIO()
                w = csv.writer(sio)
                w.writerow(["ไฟล์", "สินค้า", "รูปร่าง", "ชนิดเส้น", "กว้าง(มม.)", "สูง(มม.)",
                            "ความยาวเส้นตัด(มม.)", "dpi", "ส่วนเสริม", "สถานะตรวจ"])
                w.writerows(rows)
                z.writestr("รายการงาน.csv", "﻿" + sio.getvalue())
            return self.send(200, buf.getvalue(), "application/zip")

        if u.path == "/products":  # จัดการสินค้า (products.json): ค่าเริ่มต้น / เพิ่ม-แก้ / ลบ / คืนสินค้าตั้งต้น
            j = self.body_json()
            act = j.get("action", "defaults")
            if act == "defaults":
                items = products.save_defaults(j["id"], j.get("p", {}))
            elif act == "upsert":
                items = products.upsert(j.get("product") or {})
            elif act == "delete":
                items = products.delete(j["id"])
            elif act == "restore":
                items = products.restore_defaults()
            else:
                return self.json({"error": "ไม่รู้จักคำสั่งนี้"}, 400)
            return self.json({**products.payload(), "products": items})

        if u.path == "/config":
            j = self.body_json()
            cfg = review.load_config()
            if "api_key" in j:
                cfg["anthropic_api_key"] = j["api_key"].strip()
            if j.get("model"):
                cfg["model"] = j["model"].strip()
            if j.get("ai_model"):
                name = j["ai_model"].strip()
                if name not in model_names():
                    return self.json({"error": f"ไม่รู้จัก AI รุ่น '{name}'"}, 400)
                cfg["ai_model"] = name
            review.save_config(cfg)
            return self.json({"ok": True, "has_key": bool(cfg.get("anthropic_api_key")),
                              "model": cfg.get("model") or review.DEFAULT_MODEL,
                              "ai_model": default_model()})

        self.send(404, b"not found", "text/plain")


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "?"


def main():
    global MODEL_NAME
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8777)
    ap.add_argument("--model", default=os.environ.get("CUTOUT_AI_MODEL") or "birefnet-general", help="AI ตัดพื้นหลังเริ่มต้น (ถ้ายังไม่ได้ตั้งในหน้าเว็บ)")
    ap.add_argument("--share", action="store_true")
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()
    MODEL_NAME = a.model

    try:
        srv = ThreadingHTTPServer(("0.0.0.0" if a.share else "127.0.0.1", a.port), Handler)
    except OSError:
        # เปิดซ้ำ (เปิดเองตอนเปิดเครื่องแล้ว + กด start.bat/เว็บสั่งเปิดอีก) — ตัวแรกยังทำงานอยู่ ตัวนี้ปิดตัวเอง
        print(f"พอร์ต {a.port} มีโปรแกรมเปิดอยู่แล้ว — ใช้ตัวที่เปิดอยู่ได้เลย")
        return
    """
    🚀 เปิดพอร์ตก่อน แล้วค่อยโหลด AI ตัดพื้นหลังเบื้องหลัง (19 ต.ค. 69)
    เดิมโหลดโมเดล BiRefNet (~1 GB · ครั้งแรกต้องดาวน์โหลด) ก่อนเปิดพอร์ต → เว็บที่สั่งเปิดโปรแกรมเอง (iducky-cutout:)
    ต้องรอเป็นนาทีทั้งที่ทำ .ai (/calendar-ai) ไม่ใช้ AI · /health ยังตอบ ok=false จนโมเดลพร้อม (หน้าตัดพื้นหลังรอเหมือนเดิม)
    """
    def preload():
        try:
            with AI_LOCK:
                get_session(default_model())
            print("✓ AI ตัดพื้นหลังพร้อม")
        except Exception as ex:
            print(f"โหลด AI ตัดพื้นหลังไม่สำเร็จ: {ex}")
    threading.Thread(target=preload, daemon=True).start()
    url = f"http://localhost:{a.port}"
    print(f"\n✓ พร้อมใช้งาน: {url}")
    if a.share:
        print(f"  เครื่องอื่นในวง Wi-Fi เดียวกันเปิด: http://{lan_ip()}:{a.port}")
    print("  (ปิดหน้าต่างนี้ = ปิดแอพ)\n")
    if not a.no_browser:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
