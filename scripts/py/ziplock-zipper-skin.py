# -*- coding: utf-8 -*-
u"""🤐 กระเป๋าโฮโลแกรม: เติมแถบซิปด้านบนลงสกิน + พรีวิวของ ZipLock.ai (เจ้าของร้านสั่ง 22 ต.ค. 69 "สร้างภาพให้หน่อย เติมซิปด้านบนให้หน่อย" + รูปถุงจริง)
argv: <skin.png 300dpi> <preview.png> <outdir> <white|black> [--zip-mm 10]
  แถบซิป = ในขอบถุง (flood fill จากกลางสกิน) ช่วงบนสุด zip-mm มม. · ทึบ alpha 255 → จอ (skinOpaque) วางทับลายแบบทึบ
stdout {"skin","preview","zipTopMm","zipMm"}"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw
import cv2

skin_p, prev_p, outdir, color = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
zip_mm = float(sys.argv[sys.argv.index("--zip-mm") + 1]) if "--zip-mm" in sys.argv else 10.0
skin = Image.open(skin_p).convert("RGBA")
W, H = skin.size
PX = W / 210.0  # px ต่อ มม. (อาร์ตบอร์ด 210 มม.)
a = np.array(skin)[:, :, 3]
# ด้านในถุง = พื้นโปร่งที่ต่อกับจุดกลาง (เส้นขอบกั้น)
wall = (a > 40).astype(np.uint8) * 255
ff = wall.copy()
mask = np.zeros((H + 2, W + 2), np.uint8)
cv2.floodFill(ff, mask, (W // 2, H // 2), 128)
inside = (ff == 128)
ys = np.where(inside.any(axis=1))[0]
top = int(ys[0])
zh = int(round(zip_mm * PX))
band = np.zeros_like(inside)
band[top - 2: top + zh, :] = True  # -2 = คลุมใต้เส้นขอบนิดหน่อยไม่ให้มีช่อง
inside_d = cv2.dilate(inside.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
zmask = band & inside_d

pal = {
    "white": dict(base=(246, 247, 249), shade=(226, 229, 234), rib=(232, 234, 238), track=(196, 200, 207), hi=(255, 255, 255), edge=(178, 182, 190)),
    "black": dict(base=(40, 41, 45), shade=(26, 27, 30), rib=(52, 53, 58), track=(12, 12, 14), hi=(86, 88, 94), edge=(8, 8, 10)),
}[color]
z = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(z)
y0, y1 = top - 2, top + zh
for y in range(y0, y1):  # ไล่เฉดบน→ล่าง
    t = (y - y0) / max(1, y1 - y0)
    c = tuple(int(pal["base"][i] * (1 - t * 0.6) + pal["shade"][i] * t * 0.6) for i in range(3))
    d.line([(0, y), (W, y)], fill=c + (255,))
step = max(3, int(0.55 * PX))  # ลายริ้วแนวตั้งเหมือนแถบซิปจริง
for x in range(0, W, step):
    d.line([(x, y0), (x, y1)], fill=pal["rib"] + (255,), width=max(1, int(0.12 * PX)))
lw = max(2, int(0.35 * PX))
for f in (0.42, 0.62):  # ร่องล็อกซิป 2 เส้น
    yy = int(y0 + (y1 - y0) * f)
    d.line([(0, yy), (W, yy)], fill=pal["track"] + (255,), width=lw)
    d.line([(0, yy + lw), (W, yy + lw)], fill=pal["hi"] + (255,), width=max(1, lw // 2))
d.line([(0, y1 - lw), (W, y1 - lw)], fill=pal["edge"] + (255,), width=lw)  # ขอบล่างแถบซิป
za = np.array(z)
za[~zmask] = 0
z = Image.fromarray(za)

out_skin = Image.alpha_composite(skin, z)
out_skin = Image.alpha_composite(out_skin, Image.fromarray(np.dstack([np.array(skin)[:, :, :3], np.where(a > 40, a, 0).astype(np.uint8)])))  # เส้นขอบอยู่บนสุด
sp = f"{outdir}/ziplock-zip-{color}-skin.png"
out_skin.save(sp, optimize=True)

prev = Image.open(prev_p).convert("RGBA")
pv = Image.alpha_composite(prev, z.resize(prev.size, Image.LANCZOS))
pv = Image.alpha_composite(pv, skin.resize(prev.size, Image.LANCZOS))
pp = f"{outdir}/ziplock-zip-{color}-preview.png"
pv.convert("RGB").save(pp, optimize=True)
print(json.dumps({"skin": sp, "preview": pp, "zipTopMm": round(top / PX, 2), "zipMm": zip_mm}))
