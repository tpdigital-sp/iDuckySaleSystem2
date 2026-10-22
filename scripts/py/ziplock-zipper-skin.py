# -*- coding: utf-8 -*-
u"""🤐 กระเป๋าโฮโลแกรม: ภาพแถบซิป "เหนือกรอบงาน" (TemplateFile.aboveUrl) — ไม่ทับพื้นที่สกรีน
(เจ้าของร้านสั่ง 22 ต.ค. 69 "เติมซิปด้านบน" → "ซิปควรอยู่ตรงกรอบแดง เพราะไม่งั้นจะไปทับกับเทมเพลตตำแหน่งที่สกรีนภาพได้")
argv: <outdir> <white|black> [--w-mm 210] [--zip-mm 10] [--x-mm 3] [--r-mm 3]
  ภาพกว้างเท่าอาร์ตบอร์ด (w-mm) สูง zip-mm · แถบซิปอยู่ช่วง x-mm..w−x-mm (ตรงขอบถุง) มุมบนมน r-mm · ขอบล่างตรง ชนขอบบนผืนงาน · 300 dpi
stdout {"strip","wMm","hMm"}"""
import json, sys
from PIL import Image, ImageDraw

outdir, color = sys.argv[1], sys.argv[2]
arg = lambda k, d: float(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
w_mm, zip_mm, x_mm, r_mm = arg("--w-mm", 210.0), arg("--zip-mm", 10.0), arg("--x-mm", 3.0), arg("--r-mm", 3.0)
PX = 300 / 25.4
W, H = int(round(w_mm * PX)), int(round(zip_mm * PX))
x0, x1, r = int(round(x_mm * PX)), W - int(round(x_mm * PX)), int(round(r_mm * PX))

pal = {
    "white": dict(base=(246, 247, 249), shade=(222, 225, 231), rib=(232, 234, 238), track=(196, 200, 207), hi=(255, 255, 255), edge=(170, 175, 184)),
    "black": dict(base=(44, 45, 49), shade=(24, 25, 28), rib=(56, 57, 62), track=(12, 12, 14), hi=(90, 92, 98), edge=(8, 8, 10)),
}[color]
z = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(z)
for y in range(H):  # ไล่เฉดบน→ล่าง
    t = y / max(1, H - 1)
    d.line([(x0, y), (x1, y)], fill=tuple(int(pal["base"][i] * (1 - t * 0.6) + pal["shade"][i] * t * 0.6) for i in range(3)) + (255,))
step = max(3, int(0.55 * PX))  # ริ้วแนวตั้งเหมือนแถบซิปจริง
for x in range(x0, x1, step):
    d.line([(x, 0), (x, H)], fill=pal["rib"] + (255,), width=max(1, int(0.12 * PX)))
lw = max(2, int(0.35 * PX))
for f in (0.42, 0.62):  # ร่องล็อกซิป 2 เส้น
    yy = int(H * f)
    d.line([(x0, yy), (x1, yy)], fill=pal["track"] + (255,), width=lw)
    d.line([(x0, yy + lw), (x1, yy + lw)], fill=pal["hi"] + (255,), width=max(1, lw // 2))
d.line([(x0, H - lw), (x1, H - lw)], fill=pal["edge"] + (255,), width=lw)  # ขอบล่างแถบซิป
# มุมบนมน + เส้นขอบรอบแถบ
m = Image.new("L", (W, H), 0)
ImageDraw.Draw(m).rounded_rectangle([x0, 0, x1 - 1, H + r], radius=r, fill=255)
a = z.getchannel("A")
z.putalpha(Image.composite(a, Image.new("L", (W, H), 0), m))
ImageDraw.Draw(z).rounded_rectangle([x0, 0, x1 - 1, H + r], radius=r, outline=pal["edge"] + (255,), width=max(2, int(0.25 * PX)))
p = f"{outdir}/ziplock-zip-{color}-strip.png"
z.save(p, optimize=True)
print(json.dumps({"strip": p, "wMm": w_mm, "hMm": zip_mm}))
