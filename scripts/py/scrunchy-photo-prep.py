"""
🎀📸 เตรียมรูป Scrunchy ผ้าขาว 6 มุม สำหรับภาพตัวอย่าง 2D (components/ScrunchyPhoto · แบบงานปลอกคอหมา)
(เจ้าของร้านสั่ง 23 ต.ค. 69 "ทำเป็นภาพ 2D แทน · แบบงานปลอกคอหมา" แล้วส่งรูปผ้าขาวล้วน 6 มุมในภาพเดียว)

  tools/cutout-py/.venv/bin/python -I scripts/py/scrunchy-photo-prep.py <รูป 6 มุม.webp> public/mock/scrunchy

ภาพต้นฉบับ 1536×1024 = ตาราง 3×2 (เส้นแบ่งขาว x 509–511 / 1024–1026 · y 512–513) + ป้ายชื่อมุมด้านล่างแต่ละช่อง (ตัดทิ้ง)
ต่อมุม: <key>.webp (รูป ขยาย ×2) · <key>-mask.png (ผ้า · ตัดพื้นด้วย BiRefNet) · views.json = วงรีขอบนอก + วงรีรูกลาง (พิกัดรูปที่ขยายแล้ว)
  วงรีจากโมเมนต์ที่ 2 ของพื้นที่ (ขอบนอก = ผ้า+รูถมเต็ม · รู = ช่องว่างภายใน) · มุมที่มองไม่เห็นรู (ข้าง/มุมต่ำ) เดาจากวงนอก
"""
from __future__ import annotations

import json
import sys

import numpy as np
from PIL import Image
from rembg import new_session, remove
from scipy import ndimage

SRC, OUT = sys.argv[1], sys.argv[2]
SCALE = 2
# (key, x0, y0, x1, y1) — ตัดเหนือป้ายชื่อมุม
TILES = [
    ("front", 0, 0, 509, 445),
    ("top", 512, 0, 1024, 445),
    ("left", 1027, 0, 1536, 445),
    ("right", 0, 514, 509, 945),
    ("bottom", 512, 514, 1024, 945),
    ("low", 1027, 514, 1536, 945),
]

im = Image.open(SRC).convert("RGB")
sess = new_session("birefnet-general", providers=["CPUExecutionProvider"])


def ellipse(mask: np.ndarray) -> dict:
    ys, xs = np.nonzero(mask)
    cx, cy = xs.mean(), ys.mean()
    cov = np.cov(np.stack([xs - cx, ys - cy]))
    ev, evec = np.linalg.eigh(cov)
    # พื้นที่วงรีเต็ม: รัศมี = 2·sqrt(λ)
    a, b = 2 * np.sqrt(ev[1]), 2 * np.sqrt(ev[0])
    ang = float(np.arctan2(evec[1, 1], evec[0, 1]))
    return {"cx": float(cx), "cy": float(cy), "rx": float(a), "ry": float(b), "rot": ang}


views = {}
for key, x0, y0, x1, y1 in TILES:
    tile = im.crop((x0, y0, x1, y1))
    tile = tile.resize((tile.width * SCALE, tile.height * SCALE), Image.LANCZOS)
    cut = remove(tile, session=sess)
    alpha = np.asarray(cut)[:, :, 3]
    m = alpha > 128
    lab, n = ndimage.label(m)
    if n > 1:  # เก็บก้อนใหญ่สุด (ตัดเศษ)
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m = lab == (1 + int(np.argmax(sizes)))
    filled = ndimage.binary_fill_holes(m)
    hole = filled & ~m
    hl, hn = ndimage.label(hole)
    outer = ellipse(filled)
    inner = None
    if hn:
        hs = ndimage.sum(hole, hl, range(1, hn + 1))
        k = 1 + int(np.argmax(hs))
        if hs[k - 1] > 0.02 * filled.sum():
            inner = ellipse(hl == k)
    guessed = inner is None
    if guessed:
        # มุมข้าง/มุมต่ำ: รูซ่อนอยู่ — วงในขนาด ~0.42 ของวงนอก ยกขึ้นเหนือกลางนิด (ด้านบนของวงอยู่ไกลกล้อง)
        inner = {**outer, "rx": outer["rx"] * 0.42, "ry": outer["ry"] * 0.3, "cy": outer["cy"] - outer["ry"] * 0.2}
    a8 = np.where(m, np.minimum(alpha, 255), 0).astype(np.uint8)
    # ขอบนุ่ม: ใช้ alpha เดิมของ BiRefNet เฉพาะในก้อนที่เลือก
    Image.fromarray(a8, "L").save(f"{OUT}/{key}-mask.png", optimize=True)
    tile.save(f"{OUT}/{key}.webp", quality=90)
    views[key] = {"w": tile.width, "h": tile.height, "outer": outer, "inner": inner, "innerGuessed": guessed}
    print(key, tile.size, "outer", {k: round(v, 1) for k, v in outer.items()}, "inner", "guess" if guessed else {k: round(v, 1) for k, v in inner.items()})

with open(f"{OUT}/views.json", "w") as f:
    json.dump(views, f, indent=1)
print("✅", OUT)
