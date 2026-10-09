#!/usr/bin/env python3
"""
การ์ด "เข็มกลัดกระจก" ของกลุ่ม "รูปแบบงาน" — สินค้าอะคริลิคกระจก (new-mt2rqayf-7835)

    python3 scripts/acrylic-mirror-brooch-art.py

ร้านยังไม่มีรูปถ่ายเข็มกลัดเนื้อกระจกจริง (ไดรฟ์ 07-1_อคลกระจก/ตย มีแต่พวงกุญแจ + Griptok)
จึงประกอบจากของจริง 2 ชิ้น:
  • ด้านหน้า  = ตัวชิ้นงานกลมเนื้อกระจกจากการ์ดพวงกุญแจ (scripts/assets/acrylic-mirror/form-keyring.jpg)
               ตัดเป็นวงกลมพอดีขอบ — ติ่งห่วงตะขอด้านบนหลุดไปเอง
  • ด้านหลัง = แผ่นหลังสีเงิน + รูปถ่ายอะไหล่ P1 ของร้าน (.cache/brooch-acrylic/parts/part-p1-v1.jpg)
ได้ scripts/assets/acrylic-mirror/form-brooch.jpg → acrylic-mirror-brooch.mjs อัปขึ้นคลังต่อ
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "scripts/assets/acrylic-mirror"
FONTS = ROOT / ".cache/fonts"
CARD = 900
S = 3                         # วาดใหญ่ x3 แล้วย่อ = ขอบเนียน
W = CARD * S

# วงกลมชิ้นงานใน form-keyring.jpg (900×900): จุดกึ่งกลาง + รัศมี (หดเข้าเล็กน้อยไม่ให้ติดพื้นหลัง)
KEY_CX, KEY_CY, KEY_R = 420, 535, 266
# กรอบตัวอะไหล่ในรูป P1 (ตัดแถบชื่อดำด้านล่างทิ้ง)
PIN_BOX = (60, 262, 840, 470)


def circle_mask(d):
    m = Image.new("L", (d, d), 0)
    ImageDraw.Draw(m).ellipse((0, 0, d - 1, d - 1), fill=255)
    return m


def drop_shadow(im, mask, xy, off, blur, alpha):
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).bitmap((xy[0] + off, xy[1] + off), mask, fill=(15, 23, 42, alpha))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)))


im = Image.new("RGBA", (W, W), (255, 255, 255, 255))
bg = ImageDraw.Draw(im)
for y in range(W):
    t = y / W
    bg.line((0, y, W, y), fill=(int(238 + 17 * t), int(245 + 10 * t), int(251 + 4 * t), 255))

# ── ด้านหลัง: แผ่นเงิน + อะไหล่ P1 (วางก่อน ให้ด้านหน้าซ้อนทับมุม) ──
BD = int(W * 0.40)
bx, by = int(W * 0.53), int(W * 0.40)
back = Image.new("RGBA", (BD, BD))
gd = ImageDraw.Draw(back)
for i in range(BD * 2):
    t = i / (BD * 2 - 1)
    c = int(200 + 40 * abs(0.5 - t) * 2)
    gd.line((i, 0, i - BD, BD), fill=(c - 6, c, c + 8, 255))
bmask = circle_mask(BD)
drop_shadow(im, bmask, (bx, by), 8 * S, 10 * S, 60)
im.paste(back, (bx, by), bmask)
ImageDraw.Draw(im).ellipse((bx, by, bx + BD, by + BD), outline=(255, 255, 255, 230), width=3 * S)

pin = Image.open(ROOT / ".cache/brooch-acrylic/parts/part-p1-v1.jpg").convert("RGB").crop(PIN_BOX)
# พื้นขาว → โปร่งใส (ไล่ตามความสว่าง ขอบไม่แข็ง)
gray = pin.convert("L")
alpha = gray.point(lambda v: 0 if v > 246 else (255 if v < 225 else int((246 - v) / 21 * 255)))
pin = pin.convert("RGBA")
pin.putalpha(alpha)
pw = int(BD * 0.86)
pin = pin.resize((pw, int(pin.height * pw / pin.width)), Image.LANCZOS)
px, py = bx + (BD - pw) // 2, by + (BD - pin.height) // 2
drop_shadow(im, pin.split()[3], (px, py), 4 * S, 4 * S, 70)
im.alpha_composite(pin, (px, py))

# ── ด้านหน้า: ชิ้นงานเนื้อกระจก ──
FD = int(W * 0.56)
fx, fy = int(W * 0.07), int(W * 0.08)
key = Image.open(OUT / "form-keyring.jpg").convert("RGB")
front = key.crop((KEY_CX - KEY_R, KEY_CY - KEY_R, KEY_CX + KEY_R, KEY_CY + KEY_R)).resize((FD, FD), Image.LANCZOS)
fmask = circle_mask(FD)
drop_shadow(im, fmask, (fx, fy), 10 * S, 12 * S, 70)
im.paste(front, (fx, fy), fmask)
ImageDraw.Draw(im).ellipse((fx, fy, fx + FD, fy + FD), outline=(255, 255, 255, 240), width=4 * S)

card = im.convert("RGB").resize((CARD, CARD), Image.LANCZOS)
cd = ImageDraw.Draw(card)
tag = ImageFont.truetype(str(FONTS / "Mitr-Medium.ttf"), 30)
for text, (x, y) in (("ด้านหน้า", (110, 560)), ("ด้านหลัง", (650, 405))):
    w = cd.textlength(text, font=tag)
    cd.rounded_rectangle((x - 14, y - 6, x + w + 14, y + 42), 20, fill=(36, 46, 62))
    cd.text((x, y), text, font=tag, fill=(255, 255, 255))
cap = ImageFont.truetype(str(FONTS / "Mitr-Medium.ttf"), 34)
text = "หน้ากระจกเงา + อะไหล่เข็มกลัดติดหลัง"  # PIL ไม่มี raqm: เลี่ยงคำที่สระ+วรรณยุกต์ซ้อน (ชิ้น/เนื้อ) ไม่งั้นวรรณยุกต์หาย
cd.text(((CARD - cd.textlength(text, font=cap)) / 2, CARD - 96), text, font=cap, fill=(71, 85, 105))

card.save(OUT / "form-brooch.jpg", quality=90, subsampling=1)
print("   form-brooch.jpg", card.size)
