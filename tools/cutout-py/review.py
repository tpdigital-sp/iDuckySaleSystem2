"""
review.py — ให้ AI (Claude) ตรวจผลงานทีละรูป ก่อนส่งผลิต

ส่งภาพไปให้ AI ดู 2 ฝั่ง: ซ้าย = ต้นฉบับ, ขวา = ผลลัพธ์บนพื้นตาราง + เส้นตัดสีชมพู
พร้อมข้อมูลงาน แล้วให้ตอบเป็น JSON: ผ่าน / ต้องให้คนดู + เหตุผล + คำแนะนำ
"""
from __future__ import annotations

import base64
import io
import json
import re
import ssl
import urllib.error
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

CONFIG = Path(__file__).resolve().parent / "config.json"
DEFAULT_MODEL = "claude-sonnet-5-5"

METHOD_TH = {"alpha": "ใช้ขอบโปร่งใสจากไฟล์", "solid": "ลบสีพื้นเรียบ", "ai": "AI ตัดพื้นหลัง", "none": "ไม่ตัด (ทั้งใบ)",
             "file": "เส้นตัดจากไฟล์ลูกค้า (.ai)"}
SHAPE_TH = {"contour": "ตามทรงวัตถุ", "rect": "สี่เหลี่ยม", "rounded": "สี่เหลี่ยมมุมมน",
            "circle": "วงกลม", "ellipse": "วงรี", "file": "ตามเลเยอร์ไดคัทในไฟล์"}


def load_config() -> dict:
    try:
        return json.loads(CONFIG.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_config(cfg: dict):
    CONFIG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        CONFIG.chmod(0o600)  # คีย์ API อ่านได้เฉพาะเจ้าของเครื่อง
    except OSError:
        pass


def compose(original: np.ndarray, art: Image.Image, cut_polys, size=640) -> bytes:
    """ภาพ 2 ฝั่งสำหรับให้ AI ดู"""
    def fit(im: Image.Image):
        im = im.copy()
        im.thumbnail((size, size))
        return im

    left = fit(Image.fromarray(original).convert("RGBA"))
    # ผลลัพธ์บนพื้นตารางหมากรุก + เส้นตัด
    a = art.copy()
    sc = min(size / a.width, size / a.height, 1.0)
    a = a.resize((max(1, round(a.width * sc)), max(1, round(a.height * sc))), Image.LANCZOS)
    chk = Image.new("RGBA", a.size, (255, 255, 255, 255))
    d = ImageDraw.Draw(chk)
    for y in range(0, a.height, 16):
        for x in range(0, a.width, 16):
            if (x // 16 + y // 16) % 2:
                d.rectangle((x, y, x + 15, y + 15), fill=(205, 205, 205, 255))
    chk.alpha_composite(a)
    arr = np.array(chk)
    for p in cut_polys:
        cv2.polylines(arr, [np.round(p * sc).astype(np.int32)], True, (255, 0, 200, 255), 2, cv2.LINE_AA)
    right = Image.fromarray(arr)

    W = left.width + right.width + 30
    H = max(left.height, right.height) + 10
    sheet = Image.new("RGB", (W, H), (255, 255, 255))
    sheet.paste(left.convert("RGB"), (5, 5), left)
    sheet.paste(right.convert("RGB"), (left.width + 25, 5))
    ImageDraw.Draw(sheet).line((left.width + 12, 0, left.width + 12, H), fill=(0, 0, 0), width=2)
    buf = io.BytesIO()
    sheet.save(buf, "PNG")
    return buf.getvalue()


PROMPT = """คุณเป็นช่างตรวจไฟล์ก่อนผลิตของร้านพิมพ์ (สติกเกอร์ อะคริลิก การ์ด) ร้านใช้โปรแกรมหาขอบงานและสร้างเส้นไดคัทอัตโนมัติ
หน้าที่ของคุณคือตรวจว่าผลลัพธ์พร้อมส่งผลิตหรือไม่

ภาพที่แนบ: ฝั่งซ้าย = ภาพต้นฉบับจากลูกค้า, ฝั่งขวา = ผลลัพธ์ (พื้นตารางหมากรุก = โปร่งใส, เส้นสีชมพู = เส้นตัด)

ข้อมูลงาน:
{info}

หมายเหตุ: ส่วนเสริมตามสินค้าเป็นสิ่งที่ตั้งใจ ไม่ใช่ข้อผิดพลาด เช่น ติ่งพร้อมรูห่วงด้านบน (พวงกุญแจ)
ขาเสียบด้านล่าง และชิ้นฐานที่มีร่องวางแยกทางขวา (สแตนดี้) ส่วนงานกระดาษจะครอปภาพให้พอดีขนาดมาตรฐาน
และการแก้มุมแหลม (สติกเกอร์): ปลายแหลมถูกตัดให้มนเล็กน้อย หรือเส้นเผื่อขอบออกรอบปลายที่แหลมมาก เพื่อให้ใบมีดตัดได้

ตรวจสิ่งเหล่านี้:
1. วัตถุหลักครบถ้วนไหม (เช่น ผม มือ หู หาง ข้อความ ไม่ขาดหาย) และไม่มีพื้นหลังเดิมหลงเหลือ
2. วิธีหาขอบงานเหมาะกับภาพไหม เช่น ภาพที่ควรเก็บทั้งใบ (การ์ด รูปถ่ายเต็มเฟรม) แต่ถูกตัดตามวัตถุ หรือกลับกัน
3. เส้นตัดอยู่ในตำแหน่งที่สมเหตุสมผล ไม่ตัดผ่านส่วนสำคัญ (ข้อความ ใบหน้า) โดยไม่ตั้งใจ มีส่วนบาง/แหลมที่มีดตัดยากไหม
4. ความละเอียดพอสำหรับขนาดพิมพ์

ตัดสินแบบช่างที่ระมัดระวัง: ถ้าไม่แน่ใจให้ "review" มากกว่า "pass"
ตอบเป็น JSON อย่างเดียว ไม่มีข้อความอื่น ตามรูปแบบนี้:
{{"verdict": "pass" หรือ "review",
 "confidence": ตัวเลข 0-1,
 "issues": ["ปัญหาที่พบ สั้นๆ ภาษาไทย", ...],
 "suggest": {{"method": null หรือ "ai"|"alpha"|"solid"|"none", "shape": null หรือ "contour"|"rect"|"rounded"|"circle"|"ellipse"}},
 "summary": "สรุปหนึ่งประโยคภาษาไทย"}}
ใส่ค่าใน suggest เฉพาะเมื่อควรเปลี่ยนจากที่ใช้อยู่ ถ้าดีแล้วให้เป็น null"""


def ask_claude(png: bytes, info: str, cfg: dict) -> dict:
    key = cfg.get("anthropic_api_key", "").strip()
    if not key:
        raise RuntimeError("ยังไม่ได้ใส่ API key (กดปุ่มตั้งค่า AI ตรวจงาน)")
    body = {
        "model": cfg.get("model") or DEFAULT_MODEL,
        "max_tokens": 700,
        "messages": [{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/png",
                                         "data": base64.b64encode(png).decode()}},
            {"type": "text", "text": PROMPT.format(info=info)},
        ]}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode(),
        headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90, context=ssl.create_default_context()) as r:
            resp = json.load(r)
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="ignore")[:300]
        if e.code == 401:
            raise RuntimeError("API key ไม่ถูกต้อง") from None
        raise RuntimeError(f"AI ตอบกลับผิดพลาด ({e.code}): {detail}") from None
    except urllib.error.URLError as e:
        raise RuntimeError(f"ต่ออินเทอร์เน็ตไม่ได้: {e.reason}") from None

    text = "".join(b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text")
    return parse(text)


def parse(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return {"verdict": "review", "confidence": 0, "issues": ["อ่านคำตอบ AI ไม่ได้"], "suggest": {}, "summary": text[:200]}
    try:
        j = json.loads(m.group(0))
    except json.JSONDecodeError:
        return {"verdict": "review", "confidence": 0, "issues": ["อ่านคำตอบ AI ไม่ได้"], "suggest": {}, "summary": text[:200]}
    v = j.get("verdict")
    sug = j.get("suggest") or {}
    return {
        "verdict": v if v in ("pass", "review") else "review",
        "confidence": float(j.get("confidence") or 0),
        "issues": [str(x) for x in (j.get("issues") or [])][:6],
        "suggest": {k: sug.get(k) for k in ("method", "shape")
                    if sug.get(k) in {"method": METHOD_TH, "shape": SHAPE_TH}[k] and sug.get(k) != "file"},
        "summary": str(j.get("summary") or ""),
    }


def job_info(r: dict, p) -> str:
    return "\n".join([
        f"- วิธีหาขอบงาน: {METHOD_TH.get(r['method'], r['method'])}" + (f" (รุ่น {r['ai_model']})" if r.get("ai_model") else ""),
        f"- รูปร่างเส้นตัด: {SHAPE_TH.get(r['shape'], r['shape'])}",
        f"- ระยะเส้นตัด: {p.offset_mm:+.1f} มม. ({'ตัดเข้าเนื้อ' if p.offset_mm < 0 else 'เผื่อขอบ' if p.offset_mm > 0 else 'ชิดขอบงาน'})",
        f"- ขนาดชิ้นงานหลังตัด: {r['cut_w_mm']:.1f} × {r['cut_h_mm']:.1f} มม. ที่ความละเอียด {r['dpi']:.0f} dpi",
        f"- สินค้า: {_product_name(p) or 'ไม่ระบุ'}",
        f"- ชนิดเส้นตัด: {r.get('cut_type', 'Cut100')}",
    ] + [f"- ส่วนเสริม: {x}" for x in r.get("extras", [])])


def _product_name(p):
    try:
        import products
        return products.name_of(getattr(p, "product", ""))
    except Exception:
        return ""
