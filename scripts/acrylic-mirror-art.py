#!/usr/bin/env python3
"""
ภาพประกอบตัวเลือกของสินค้า "อะคริลิคกระจก" (new-mt2rqayf-7835)

    python3 scripts/acrylic-mirror-art.py

อ่านภาพต้นฉบับที่โหลดไว้ใน .cache/acrylic-mirror/orig/ (ภาพงานจริงจากหน้า
https://www.iduckyofficial-pricelists.com/อคลกระจก) แล้วตัด/ย่อเป็นชุดภาพการ์ด
ลง scripts/assets/acrylic-mirror/ ให้ acrylic-mirror-build.mts อัปขึ้นคลังต่อ

ชุดที่ได้:
  form-keyring / form-standee   การ์ด "รูปแบบงาน" — ครอปงานจริงให้ชิ้นงานเต็มการ์ด
  size-4 / size-5 / size-6      การ์ด "ขนาด" — ตัดเฉพาะตัวชิ้นงานออกจากภาพเทียบขนาดของร้าน
                                แล้ววางบนการ์ดที่ "1 ซม. = จำนวนพิกเซลเท่ากันทุกใบ"
                                ชิ้นงานในการ์ดจึงโตขึ้นตามขนาดจริง เทียบด้วยตาได้เลย
  gal-1..gal-5                  แกลเลอรีหน้าสินค้า
  tab-*                         ภาพในแท็บ (เทียบขนาดของร้าน 2 ใบ + แผ่นอธิบายงานสกรีน)

⚠️ ภาพเทียบขนาด (x3/x4) เป็นงานอะคริลิคใส ไม่ใช่เนื้อกระจก — ใช้บอก "สเกล" เท่านั้น
   คำอธิบายใต้การ์ดเขียนกำกับไว้แล้ว
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / ".cache/acrylic-mirror/orig"
OUT = ROOT / "scripts/assets/acrylic-mirror"
FONTS = ROOT / ".cache/fonts"
OUT.mkdir(parents=True, exist_ok=True)

CARD = 900          # ด้านของการ์ดตัวเลือก (px)
GAL = 1600          # ด้านยาวของภาพแกลเลอรี (px)
INK = (36, 46, 62)


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def load(name):
    return Image.open(SRC / f"{name}.jpg").convert("RGB")


def save(im, name, quality=90):
    im.save(OUT / f"{name}.jpg", quality=quality, subsampling=1)
    print(f"   {name}.jpg  {im.width}×{im.height}")


# ── การ์ด "รูปแบบงาน" ───────────────────────────────────────────────────────
# พวงกุญแจ = ครอปงานจริงจากหน้าเว็บ (ไฟล์ต้นทาง, จุดกึ่งกลางกรอบ, ด้านของกรอบ — สัดส่วนของความกว้าง)
FORM = {
    "form-keyring": ("g4", 0.385, 0.60, 0.58),   # พวงกุญแจกลมเนื้อกระจก + ก้ามปู
}
print("🖼  การ์ดรูปแบบงาน")
for name, (src, fx, fy, fs) in FORM.items():
    im = load(src)
    side = int(min(im.width * fs, im.width, im.height))
    x = int(min(max(im.width * fx - side / 2, 0), im.width - side))
    y = int(min(max(im.height * fy - side / 2, 0), im.height - side))
    save(im.crop((x, y, x + side, y + side)).resize((CARD, CARD), Image.LANCZOS), name)

# สแตนดี้ = วาดเอง — ทั้งเว็บ pricelists และไดรฟ์รูปงานจริงของร้าน (10_อะคริลิค/สแตนดี้อะคริลิค/
# 07-1_อคลกระจก) ไม่มีรูป "สแตนดี้กระจกเสียบฐาน" สักใบ มีแต่พวงกุญแจกับ Griptok
# (ของเดิมเคยหยิบภาพชิ้นงานทรงโค้งมาใช้ — ผู้ใช้ทักว่านั่นคือ Griptok 1 ก.ย. 69)
# สไตล์เดียวกับการ์ดอธิบายของร้าน (products/standee-keyring/hero-v6.jpg): แผ่นอะคริลิคเสียบฐานวงรี
# ต่างตรงเนื้อแผ่นไล่เป็นสีกระจกเงิน + แถบสะท้อนแสงทแยง ให้รู้ว่าเป็นงานเนื้อกระจก


def mirror_standee_card():
    S = 3                                    # วาดใหญ่ x3 แล้วย่อ = ขอบเนียน (PIL ไม่มี antialias ตอนวาด)
    W = CARD * S
    im = Image.new("RGB", (W, W), (255, 255, 255))
    d = ImageDraw.Draw(im, "RGBA")
    # พื้นหลังไล่สีฟ้าอ่อน → ขาว (โทนเดียวกับการ์ดอธิบายของร้าน)
    for y in range(W):
        t = y / W
        d.line((0, y, W, y), fill=(int(238 + 17 * t), int(245 + 10 * t), int(251 + 4 * t)))

    cx = W // 2
    panel_w, panel_h = int(W * 0.40), int(W * 0.50)
    px, py = cx - panel_w // 2, int(W * 0.20)
    base_cy = py + panel_h + int(W * 0.035)

    # ── ฐานอะคริลิควงรี (โปร่งใส ฟ้าอ่อน) + ร่องเสียบ ──
    bw, bh = int(W * 0.50), int(W * 0.115)
    bx, by = cx - bw // 2, base_cy - bh // 2
    d.ellipse((bx + 14 * S, by + 10 * S, bx + bw + 14 * S, by + bh + 10 * S), fill=(15, 23, 42, 26))  # เงาใต้ฐาน
    d.ellipse((bx, by, bx + bw, by + bh), fill=(219, 238, 250, 235), outline=(125, 190, 225), width=3 * S)
    slot_w = int(panel_w * 0.62)
    d.rounded_rectangle(
        (cx - slot_w // 2, base_cy - 5 * S, cx + slot_w // 2, base_cy + 5 * S), 5 * S,
        fill=(255, 255, 255, 220), outline=(125, 190, 225), width=2 * S,
    )

    # ── แผ่นชิ้นงานเนื้อกระจก (ทรงโค้งด้านบน แบบงานจริงของร้าน) ──
    panel = Image.new("RGBA", (panel_w, panel_h), (0, 0, 0, 0))
    pd = ImageDraw.Draw(panel)
    r = panel_w // 2
    pd.pieslice((0, 0, panel_w, panel_w), 180, 360, fill=(255, 255, 255, 255))
    pd.rectangle((0, r, panel_w, panel_h), fill=(255, 255, 255, 255))
    shape = panel.split()[3]                 # เก็บทรงไว้เป็นมาสก์
    # ไล่สีเนื้อกระจก (เงิน) แนวทแยง
    grad = Image.new("RGB", (panel_w, panel_h))
    gd = ImageDraw.Draw(grad)
    stops = [(0.0, (246, 249, 252)), (0.30, (146, 160, 178)), (0.46, (214, 223, 233)), (0.68, (101, 117, 139)), (0.86, (176, 189, 205)), (1.0, (129, 144, 164))]
    for i in range(panel_w + panel_h):
        t = i / (panel_w + panel_h - 1)
        a, b = next((a, b) for a, b in zip(stops, stops[1:]) if a[0] <= t <= b[0])
        k = 0 if b[0] == a[0] else (t - a[0]) / (b[0] - a[0])
        gd.line((i, 0, i - panel_h, panel_h), fill=tuple(round(a[1][j] + (b[1][j] - a[1][j]) * k) for j in range(3)))
    panel = Image.composite(grad.convert("RGBA"), Image.new("RGBA", (panel_w, panel_h), (0, 0, 0, 0)), shape)
    pd = ImageDraw.Draw(panel, "RGBA")
    # แถบสะท้อนแสงทแยง
    sheen = Image.new("RGBA", (panel_w, panel_h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sd.polygon([(-panel_w * 0.1, panel_h), (panel_w * 0.24, panel_h), (panel_w * 0.62, 0), (panel_w * 0.28, 0)], fill=(255, 255, 255, 92))
    sd.polygon([(panel_w * 0.42, panel_h), (panel_w * 0.52, panel_h), (panel_w * 0.86, 0), (panel_w * 0.76, 0)], fill=(255, 255, 255, 66))
    panel.alpha_composite(Image.composite(sheen, Image.new("RGBA", (panel_w, panel_h), (0, 0, 0, 0)), shape))

    # ลายสกรีนบนผิว — แมวดำโผล่หน้า (motif เดียวกับงานตัวอย่างของร้าน)
    hd = ImageDraw.Draw(panel, "RGBA")
    hw = int(panel_w * 0.44)
    hx, hy = (panel_w - hw) // 2, int(panel_h * 0.46)
    ear = int(hw * 0.30)
    hd.polygon([(hx + int(hw * 0.06), hy + ear), (hx + int(hw * 0.14), hy - int(ear * 0.55)), (hx + int(hw * 0.40), hy + int(ear * 0.5))], fill=(24, 24, 27))
    hd.polygon([(hx + hw - int(hw * 0.06), hy + ear), (hx + hw - int(hw * 0.14), hy - int(ear * 0.55)), (hx + hw - int(hw * 0.40), hy + int(ear * 0.5))], fill=(24, 24, 27))
    hd.rounded_rectangle((hx, hy, hx + hw, hy + int(hw * 0.92)), int(hw * 0.34), fill=(24, 24, 27))
    eye = int(hw * 0.085)
    for ex in (hx + int(hw * 0.30), hx + int(hw * 0.70)):
        hd.ellipse((ex - eye, hy + int(hw * 0.34) - eye, ex + eye, hy + int(hw * 0.34) + eye), fill=(255, 255, 255))
    hd.ellipse((hx + int(hw * 0.44), hy + int(hw * 0.48), hx + int(hw * 0.56), hy + int(hw * 0.57)), fill=(251, 191, 36))
    # ขอบแผ่น
    edge = Image.new("RGBA", (panel_w, panel_h), (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    ed.arc((2 * S, 2 * S, panel_w - 2 * S, panel_w - 2 * S), 180, 360, fill=(255, 255, 255, 235), width=3 * S)
    ed.line((2 * S, r, 2 * S, panel_h), fill=(255, 255, 255, 235), width=3 * S)
    ed.line((panel_w - 2 * S, r, panel_w - 2 * S, panel_h), fill=(255, 255, 255, 235), width=3 * S)
    panel.alpha_composite(Image.composite(edge, Image.new("RGBA", (panel_w, panel_h), (0, 0, 0, 0)), shape))

    shadow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).bitmap((px + 8 * S, py + 8 * S), shape, fill=(15, 23, 42, 42))
    im.paste(Image.alpha_composite(im.convert("RGBA"), shadow.filter(ImageFilter.GaussianBlur(9 * S))).convert("RGB"), (0, 0))
    im.paste(panel, (px, py), panel)

    # คำกำกับใต้ฐาน
    card = im.resize((CARD, CARD), Image.LANCZOS)
    cd = ImageDraw.Draw(card)
    f = font("Mitr-Medium.ttf", 34)
    cap = "ตัวสแตนดี้เนื้อกระจก + ฐานอะคริลิค"
    cd.text(((CARD - cd.textlength(cap, font=f)) / 2, CARD - 96), cap, font=f, fill=(71, 85, 105))
    return card


save(mirror_standee_card(), "form-standee")

# ── การ์ด "ขนาด" — สเกลจริง เทียบกันได้ ────────────────────────────────────
# ภาพเทียบขนาดของร้าน 2 ใบ (x3 = 2/4/6/8/10 ซม. · x4 = 3/5/7/9 ซม.)
# กรอบชิ้นงาน (ไม่รวมห่วง/โซ่) วัดจากภาพต้นฉบับ + พิกเซลต่อ 1 ซม. ของภาพนั้น
PIECE = {
    #        ต้นทาง  px/ซม.  กรอบชิ้นงาน (x0, y0, x1, y1)
    4: ("x3", 133.0, (869, 2107, 1380, 2639)),
    5: ("x4", 151.5, (1180, 1874, 1939, 2633)),
    6: ("x3", 133.0, (1535, 1838, 2338, 2641)),
}
FOV_CM = 8.6        # การ์ดทุกใบเป็นกรอบกว้าง 8.6 ซม. ของจริง → 6 ซม. เต็มการ์ดพอดี
PPC = CARD / FOV_CM  # พิกเซลต่อ 1 ซม. บนการ์ด
FEATHER = 26        # ฟุ้งขอบภาพที่แปะ ให้กลืนกับพื้นการ์ด

print("🖼  การ์ดขนาด (สเกลเดียวกันทุกใบ · กรอบ %.1f ซม.)" % FOV_CM)
f_tag = font("Mitr-SemiBold.ttf", 42)
for cm, (src, ppc, box) in PIECE.items():
    im = load(src)
    x0, y0, x1, y1 = box
    pad = int((x1 - x0) * 0.10)          # เผื่อขอบรอบชิ้นงานนิดหน่อย
    crop = im.crop((x0 - pad, y0 - pad, x1 + pad, y1 + pad))
    # ย่อให้ 1 ซม. ของจริง = PPC พิกเซลบนการ์ด (เท่ากันทุกใบ = เทียบขนาดกันได้)
    k = PPC / ppc
    crop = crop.resize((max(1, int(crop.width * k)), max(1, int(crop.height * k))), Image.LANCZOS)
    # พื้นการ์ด = สีพื้นหลังของภาพต้นทาง (เฉลี่ยมุมบนซ้าย) → รอยต่อแทบมองไม่เห็น
    bg = im.crop((60, 60, 460, 460)).resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    card = Image.new("RGB", (CARD, CARD), bg)
    mask = Image.new("L", crop.size, 0)
    ImageDraw.Draw(mask).rectangle((FEATHER, FEATHER, crop.width - FEATHER, crop.height - FEATHER), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(FEATHER / 2))
    card.paste(crop, ((CARD - crop.width) // 2, (CARD - crop.height) // 2 - 26), mask)
    # แถบสเกล 1 ซม. — บอกว่าการ์ดทุกใบใช้สเกลเดียวกัน
    d = ImageDraw.Draw(card, "RGBA")
    x, y = 62, CARD - 76
    d.rounded_rectangle((x - 22, y - 48, x + PPC + 132, y + 30), 20, fill=(255, 255, 255, 226))
    d.line((x, y, x + PPC, y), fill=INK, width=5)
    for tick in (x, x + PPC):
        d.line((tick, y - 14, tick, y + 14), fill=INK, width=5)
    d.text((x + PPC + 16, y - 33), "1 ซม.", font=f_tag, fill=INK)
    save(card, f"size-{cm}")

# ── การ์ด "กำหนดขนาดเอง" — วาดเอง (ไม่มีภาพงานจริงของสิ่งที่ยังไม่ได้สั่ง) ─────
print("🖼  การ์ดกำหนดขนาดเอง")
card = Image.new("RGB", (CARD, CARD), (243, 245, 248))
d = ImageDraw.Draw(card)
f_big = font("Mitr-SemiBold.ttf", 62)
f_mid = font("Mitr-Medium.ttf", 40)
f_sm = font("Mitr-Medium.ttf", 34)
BOX = (168, 250, 732, 660)
d.rounded_rectangle(BOX, 34, fill=(255, 255, 255), outline=(148, 163, 184), width=6)
# ลูกศรบอกด้านกว้าง/สูง
ax, ay = BOX[0] + 46, BOX[3] - 58
d.line((ax, ay, BOX[2] - 46, ay), fill=(2, 132, 199), width=6)
d.line((ax + 6, ay, ax + 30, ay - 18), fill=(2, 132, 199), width=6)
d.line((ax + 6, ay, ax + 30, ay + 18), fill=(2, 132, 199), width=6)
d.line((BOX[2] - 52, ay, BOX[2] - 76, ay - 18), fill=(2, 132, 199), width=6)
d.line((BOX[2] - 52, ay, BOX[2] - 76, ay + 18), fill=(2, 132, 199), width=6)
bx = BOX[2] - 58
d.line((bx, BOX[1] + 46, bx, ay - 30), fill=(2, 132, 199), width=6)
d.line((bx, ay - 36, bx - 18, ay - 60), fill=(2, 132, 199), width=6)
d.line((bx, ay - 36, bx + 18, ay - 60), fill=(2, 132, 199), width=6)
d.line((bx, BOX[1] + 52, bx - 18, BOX[1] + 76), fill=(2, 132, 199), width=6)
d.line((bx, BOX[1] + 52, bx + 18, BOX[1] + 76), fill=(2, 132, 199), width=6)
d.text((BOX[0] + 62, BOX[1] + 96), "ก. × ส.", font=f_big, fill=INK)
d.text((BOX[0] + 62, BOX[1] + 194), "ระบุเอง", font=f_mid, fill=(2, 132, 199))
d.text((100, 104), "กำหนดขนาดเอง", font=f_big, fill=INK)
d.text((100, 186), "ราคาคิดจากด้านที่ยาวที่สุด", font=f_sm, fill=(100, 116, 139))
d.rounded_rectangle((92, 692, CARD - 92, 856), 26, fill=(255, 255, 255))
d.text((124, 704), "ไม่เกิน 6 ซม. = ราคาตามตาราง", font=f_sm, fill=(71, 85, 105))
d.text((124, 750), "เกิน 6 ซม. บวก ซม. ละ 15 บาท", font=f_sm, fill=(2, 132, 199))
d.text((124, 796), "ใหญ่กว่า 20 ซม. แอดมินตีราคา", font=f_sm, fill=(71, 85, 105))
save(card, "size-custom")

# ── แกลเลอรี ───────────────────────────────────────────────────────────────
print("🖼  แกลเลอรี")
for i, src in enumerate(["g4", "g9", "g2", "g1", "g7"], 1):
    im = load(src)
    im.thumbnail((GAL, GAL), Image.LANCZOS)
    save(im, f"gal-{i}", quality=88)

# ── ภาพในแท็บ ──────────────────────────────────────────────────────────────
print("🖼  ภาพในแท็บ")
for src, name in [("x3", "tab-size-2-4-6-8-10"), ("x4", "tab-size-3-5-7-9"), ("x2", "tab-screen-top")]:
    im = load(src)
    im.thumbnail((GAL, GAL), Image.LANCZOS)
    save(im, name, quality=88)

print(f"\n✅ เขียนลง {OUT.relative_to(ROOT)}")
