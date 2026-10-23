"""
🎀📸 เตรียมรูปผ้าผูกผมผ้าขาว สำหรับภาพตัวอย่าง 2D (components/ScarfPhoto · แบบ Scrunchy / งานปลอกคอหมา)
(เจ้าของร้านส่งรูปผ้าขาวหลายมุม 23 ต.ค. 69 ต่อจาก Scrunchy 2D)

  tools/cutout-py/.venv/bin/python -I scripts/py/scarf-photo-prep.py <ผ้าพันคอซาตินสีขาวหลายสไตล์.png> public/mock/scarf

ภาพต้นฉบับ (ชุดที่ 2 · เจ้าของร้าน "ผ้าผูกผมใช้เป็นภาพที่ 2") 1536×1024 แถวบน 6 ช่อง
  Flat (Front) / Flat (Back) / Front View / Back View / Left Side / Right Side · เส้นแบ่ง x ≈ 301 / 571 / 856 / 1124 / 1327 · ตัดเหนือป้ายชื่อ (y < 548)
ต่อมุม: <key>.webp (ขยาย ×2) + <key>-mask.png (BiRefNet) · แนวขอบผ้าแต่ละขากำหนดใน lib/scarf-photo.ts (พิกัดรูปที่ขยายแล้ว)
แถวล่างใช้ Rolled / Tied / Neck (Close Up / Tip ไม่ใช้)
"""
from __future__ import annotations

import sys

import numpy as np
from PIL import Image
from rembg import new_session, remove
from scipy import ndimage

SRC, OUT = sys.argv[1], sys.argv[2]
SCALE = 2
TILES = [
    ("flatFront", 0, 0, 300, 548),
    ("flatBack", 302, 0, 570, 548),
    ("front", 572, 0, 855, 548),
    ("back", 857, 0, 1123, 548),
    ("left", 1125, 0, 1326, 548),
    ("right", 1328, 0, 1536, 548),
    # แถวล่าง (เจ้าของร้าน "อยากได้ 3 ภาพนี้ด้วย") — ม้วน / ผูกโบว์ / ผูกคอ · ตัดเหนือป้าย (y < 946)
    ("rolled", 649, 608, 947, 946),
    ("tied", 955, 608, 1247, 946),
    ("neck", 1249, 608, 1530, 946),
]

im = Image.open(SRC).convert("RGB")
sess = new_session("birefnet-general", providers=["CPUExecutionProvider"])
for key, x0, y0, x1, y1 in TILES:
    tile = im.crop((x0, y0, x1, y1))
    tile = tile.resize((tile.width * SCALE, tile.height * SCALE), Image.LANCZOS)
    alpha = np.asarray(remove(tile, session=sess))[:, :, 3]
    m = alpha > 128
    lab, n = ndimage.label(m)
    if n > 1:  # ตัดเศษ — เก็บทุกก้อนที่ใหญ่ ≥ 20% ของก้อนใหญ่สุด (มุมวางราบมีผ้า 2 ชิ้น)
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        keep = [i + 1 for i, v in enumerate(sizes) if v >= 0.2 * sizes.max()]
        m = np.isin(lab, keep)
    Image.fromarray(np.where(m, alpha, 0).astype(np.uint8), "L").save(f"{OUT}/{key}-mask.png", optimize=True)
    tile.save(f"{OUT}/{key}.webp", quality=90)
    print(key, tile.size, "x0", x0)
print("✅", OUT)
