#!/usr/bin/env python3
"""
ภาพประกอบตัวเลือก "ตำแหน่งสกรีน" ของ Photo card pvc (photocard-pvc-uv)

    python3 scripts/photocard-pvc-screen-art.py        # วาดลง scripts/assets/photocard-pvc/

ภาพจำลองแบบเดียวกับแผ่น "HOW TO PRINT" ของสินค้าพวงกุญแจอะคริลิค (ผู้ใช้สั่ง 31 ส.ค. 69):
พื้นครีม · ป้ายหัวข้อส้ม · กรอบมนสีกรมท่า · เลเยอร์เหลื่อมกันขึ้นไปทางขวา + เส้นชี้บอกว่าชั้นไหนคืออะไร
ต่างกันที่รูปทรง — ของเราเป็น "บัตร" ไม่ใช่ชิ้นไดคัท และวัสดุเขียนว่า "บัตร PVC ใส"

ทำไมไม่ยืมชุดกลาง acrylic-howto/screen-*.jpg ที่สินค้าอะคริลิคใช้ร่วมกันตรง ๆ:
  ในภาพเขียนกำกับว่า "อะคริลิค" และตัวงานเป็นชิ้นไดคัท — เอามาแปะบนหน้าบัตร PVC แล้วผิดทั้งชื่อวัสดุและรูปทรง
  แต่ "ลายสกรีน" ในภาพยืมเป็ดจากแผ่นนั้นมาใช้ (ตัดพื้นหลังเก็บไว้ที่ assets/photocard-pvc/duck.png)
  ลายในภาพจะได้เป็นตัวเดียวกับที่ลูกค้าเห็นในสินค้าอื่นของร้าน

⚠️ PIL ไม่มี raqm — วางวรรณยุกต์ซ้อนสระบนไม่ได้ (เช่น "เนื้อ" "ที่" "นี้")
   ข้อความในภาพเลยเลี่ยงคำพวกนี้ทั้งหมด แก้ข้อความเมื่อไหร่ให้เช็คด้วย
⚠️ ฟอนต์ Mitr (ฟอนต์หัวเรื่องของเว็บ) เก็บไว้ที่ .cache/fonts/ — ไม่มีก็โหลดใหม่ได้จาก
   https://github.com/google/fonts/raw/main/ofl/mitr/Mitr-{SemiBold,Medium}.ttf
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "scripts/assets/photocard-pvc"
FONTS = ROOT / ".cache/fonts"

# โทนสีดูดมาจากแผ่น HOW TO PRINT ของร้าน (acrylic-howto/screen-1side-top-v1.jpg)
CREAM = (255, 239, 205)
PANEL = (255, 248, 230)
NAVY = (11, 42, 91)
ORANGE = (236, 118, 18)
INK = (43, 43, 43)
CARD_BG = (238, 246, 254)      # พื้นลายบนบัตร (ด้านหน้า)
CARD_BG_BACK = (255, 240, 244)  # พื้นลายอีกด้าน — คนละสีให้เห็นว่าหน้า-หลังคนละลายได้
CARD_EDGE_BACK = (240, 170, 190)
BLANK_FILL = (252, 252, 250)   # บัตรเปล่า ยังไม่พิมพ์ลาย
CHECK_A = (187, 221, 243)      # พื้นหลังลายตาราง — ใช้โชว์ว่าบัตรใส "ทะลุ" บัตรขาว "ทึบ"
CHECK_B = (232, 244, 252)
CARD_EDGE = (150, 196, 232)
CLEAR_FILL = (255, 255, 255, 150)   # บัตรใส — โปร่งพอให้เห็นชั้นที่อยู่หลัง
CLEAR_EDGE = (176, 190, 197, 235)

W, H = 900, 830
FRAME = (46, 152, 854, 782)
CW, CH = 214, 341               # บัตร 5.4×8.6 ซม. ตามสัดส่วนจริง
DX, DY = 112, -34               # ระยะเหลื่อมของแต่ละชั้น (ไล่ขึ้นไปทางขวา เหมือนแผ่นของร้าน)
RADIUS = 18


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


DUCK = Image.open(OUT / "duck.png").convert("RGBA")


def art_layer(mirror=False, back=False):
    """ชั้น "ลายสกรีน" — บัตรที่พิมพ์ลายแล้ว (ยืมเป็ดจากแผ่น HOW TO PRINT ของร้าน)"""
    im = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, CW - 1, CH - 1), radius=RADIUS,
                        fill=CARD_BG_BACK if back else CARD_BG, outline=INK, width=4)
    d.rounded_rectangle((14, 14, CW - 15, CH - 15), radius=RADIUS - 6,
                        outline=CARD_EDGE_BACK if back else CARD_EDGE, width=3)
    duck = DUCK.transpose(Image.FLIP_LEFT_RIGHT) if mirror else DUCK
    scale = (CH * 0.56) / duck.height
    duck = duck.resize((round(duck.width * scale), round(duck.height * scale)), Image.LANCZOS)
    im.alpha_composite(duck, ((CW - duck.width) // 2, (CH - duck.height) // 2))
    return im


def clear_layer():
    """ชั้น "บัตร PVC ใส" — โปร่งแสง มีแถบไฮไลต์ให้ดูเป็นเนื้อใสเงา"""
    im = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, CW - 1, CH - 1), radius=RADIUS, fill=CLEAR_FILL, outline=CLEAR_EDGE, width=4)
    d.line((26, 40, CW - 26, 40), fill=(255, 255, 255, 220), width=8)
    d.line((26, 62, CW - 70, 62), fill=(255, 255, 255, 160), width=5)
    return im


def blank_layer():
    """บัตรเปล่า — ด้านที่ไม่ได้พิมพ์ลาย"""
    im = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, CW - 1, CH - 1), radius=RADIUS, fill=BLANK_FILL, outline=INK, width=4)
    return im


def frame_of(d):
    """พื้นครีม + กรอบมนกรมท่า — โครงร่วมของทุกใบ"""
    d.rounded_rectangle(FRAME, radius=44, fill=PANEL, outline=NAVY, width=6)


def pill(img, d, title):
    """ป้ายหัวข้อส้ม — วาดทีหลังสุด ให้ทับขอบกรอบเหมือนแผ่นของร้าน"""
    f = font("Mitr-SemiBold.ttf", 46)
    tw = d.textbbox((0, 0), title, font=f)[2]
    d.rounded_rectangle(((W - tw) / 2 - 44, 44, (W + tw) / 2 + 44, 142), radius=49, fill=ORANGE)
    d.text(((W - tw) / 2, 58), title, font=f, fill=(255, 255, 255))


def material(title, clear, caption):
    """ภาพ "ชนิดบัตร" — วางบัตรบนลายตาราง: บัตรขาวบังมิด · บัตรใสมองทะลุเห็นลายตารางได้"""
    img = Image.new("RGBA", (W, H), CREAM + (255,))
    d = ImageDraw.Draw(img)
    f_lab = font("Mitr-Medium.ttf", 30)
    frame_of(d)

    pw, ph = CW + 150, CH + 92
    px = FRAME[0] + (FRAME[2] - FRAME[0] - pw) // 2
    py = FRAME[1] + (FRAME[3] - FRAME[1] - ph - 62) // 2

    patch = Image.new("RGBA", (pw, ph), CHECK_B + (255,))
    pd = ImageDraw.Draw(patch)
    step = 38
    for gy in range(0, ph, step):                   # พื้นลายตารางใต้บัตร
        for gx in range(0, pw, step):
            if (gx // step + gy // step) % 2 == 0:
                pd.rectangle((gx, gy, gx + step - 1, gy + step - 1), fill=CHECK_A)
    rounded = Image.new("L", (pw, ph), 0)
    ImageDraw.Draw(rounded).rounded_rectangle((0, 0, pw - 1, ph - 1), radius=26, fill=255)
    patch.putalpha(rounded)
    img.alpha_composite(patch, (px, py))
    d.rounded_rectangle((px, py, px + pw - 1, py + ph - 1), radius=26, outline=(150, 190, 220), width=3)

    card = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle((0, 0, CW - 1, CH - 1), radius=RADIUS,
                         fill=(255, 255, 255, 46) if clear else (255, 255, 255, 255), outline=INK, width=4)
    if clear:
        cd.line((26, 40, CW - 26, 40), fill=(255, 255, 255, 210), width=8)
    duck = DUCK.copy()
    scale = (CH * 0.56) / duck.height
    duck = duck.resize((round(duck.width * scale), round(duck.height * scale)), Image.LANCZOS)
    card.alpha_composite(duck, ((CW - duck.width) // 2, (CH - duck.height) // 2))
    img.alpha_composite(card, (px + (pw - CW) // 2, py + (ph - CH) // 2))

    tw = d.textbbox((0, 0), caption, font=f_lab)[2]
    d.text(((W - tw) / 2, py + ph + 22), caption, font=f_lab, fill=INK)

    pill(img, d, title)
    return img.convert("RGB")


def faces(title, cards):
    """ภาพ "กี่ด้าน" — วางบัตร 2 ใบเรียงข้างกัน (ด้านหน้า / ด้านหลัง) พร้อมป้ายใต้ใบ"""
    img = Image.new("RGBA", (W, H), CREAM + (255,))
    d = ImageDraw.Draw(img)
    f_lab = font("Mitr-Medium.ttf", 30)
    frame_of(d)

    gap = 92
    total = len(cards) * CW + (len(cards) - 1) * gap
    x = FRAME[0] + (FRAME[2] - FRAME[0] - total) // 2
    y = FRAME[1] + (FRAME[3] - FRAME[1] - CH - 62) // 2
    for card, text in cards:
        img.alpha_composite(card, (x, y))
        tw = d.textbbox((0, 0), text, font=f_lab)[2]
        d.text((x + (CW - tw) / 2, y + CH + 22), text, font=f_lab, fill=INK)
        x += CW + gap

    pill(img, d, title)
    return img.convert("RGB")


def sheet(title, layers):
    """layers = [(ชั้น, ป้ายกำกับ), ...] เรียงจาก "หน้าสุด" ไป "หลังสุด" (ซ้าย→ขวา)"""
    img = Image.new("RGBA", (W, H), CREAM + (255,))
    d = ImageDraw.Draw(img)
    f_lab = font("Mitr-Medium.ttf", 30)

    frame_of(d)

    n = len(layers)
    total_w, total_h = CW + (n - 1) * DX, CH + (n - 1) * -DY
    x0 = FRAME[0] + 74
    y0 = FRAME[1] + (FRAME[3] - FRAME[1] - total_h) // 2 + (n - 1) * -DY   # ชั้นหน้าสุดอยู่ล่างสุด
    spots = [(x0 + i * DX, y0 + i * DY) for i in range(n)]

    for (x, y), (layer, _) in reversed(list(zip(spots, layers))):   # วาดจากชั้นหลังสุดมาหน้าสุด
        img.alpha_composite(layer, (x, y))

    # ป้ายกำกับ: ชั้นหน้าสุดอยู่บรรทัดล่างสุด ไล่ขึ้นไปทีละชั้น — ชั้นเหลื่อมกันแค่ 34 px
    # ถ้าปล่อยให้ป้ายอยู่ระดับเดียวกับชั้น ตัวหนังสือจะชนกันเอง
    for i, ((x, y), (_, text)) in enumerate(zip(spots, layers)):
        ax = x + round(CW * 0.72)
        ly = FRAME[3] - 46 - i * 52
        d.line((ax, y + CH, ax + 28, ly - 8), fill=INK, width=3)
        d.text((ax + 40, ly - f_lab.size * 0.78), text, font=f_lab, fill=INK)

    pill(img, d, title)
    return img.convert("RGB")


CLEAR = "บัตร PVC ใส"
SHEETS = [
    ("screen-under", "สกรีนใต้", [(clear_layer(), CLEAR), (art_layer(), "ลายสกรีน")]),
    ("screen-top", "สกรีนบน", [(art_layer(), "ลายสกรีน"), (clear_layer(), CLEAR)]),
    ("screen-under-top", "หน้าใต้ - หลังบน",
     [(clear_layer(), CLEAR), (art_layer(), "ลายด้านหน้า"), (art_layer(mirror=True), "ลายด้านหลัง")]),
    ("screen-top-top", "บน-บน",
     [(art_layer(), "ลายด้านหน้า"), (clear_layer(), CLEAR), (art_layer(mirror=True), "ลายด้านหลัง")]),
]

# กลุ่ม "สกรีนกี่ด้าน" — ภาพจำลองหน้า/หลังของบัตร (คนละแบบกับกองเลเยอร์ด้านบน)
FACES = [
    ("sides-1", "สกรีน 1 ด้าน", [(art_layer(), "ด้านหน้า"), (blank_layer(), "ด้านหลัง (ไม่พิมพ์ลาย)")]),
    ("sides-2", "สกรีน 2 ด้าน",
     [(art_layer(), "ด้านหน้า"), (art_layer(mirror=True, back=True), "ด้านหลัง (คนละลายได้)")]),
]

# กลุ่ม "ชนิดบัตร PVC" — บัตรวางบนพื้นลายตาราง ให้เห็นความต่างของทึบ/ใส
MATERIALS = [
    ("card-white", "PVC สีขาว", False, "บัตรทึบ — ลายเด่นเต็มใบ ไม่เห็นของด้านหลัง"),
    ("card-clear", "PVC สีใส", True, "บัตรใส — มองทะลุเห็นของด้านหลังได้"),
]

OUT.mkdir(parents=True, exist_ok=True)
for name, title, layers in SHEETS:
    p = OUT / f"{name}.jpg"
    sheet(title, layers).save(p, quality=92)
    print(f"✓ {p.relative_to(ROOT)}")
for name, title, cards in FACES:
    p = OUT / f"{name}.jpg"
    faces(title, cards).save(p, quality=92)
    print(f"✓ {p.relative_to(ROOT)}")
for name, title, clear, caption in MATERIALS:
    p = OUT / f"{name}.jpg"
    material(title, clear, caption).save(p, quality=92)
    print(f"✓ {p.relative_to(ROOT)}")
