#!/usr/bin/env python3
"""
ภาพจำลองตัวเลือก "สกรีน 2 เลเยอร์" ของ Acrylic Coaster (/products/acrylic-coaster)

    python3 scripts/coaster-screen-2layer-art.py        # วาดลง scripts/assets/acrylic-coaster/

ผู้ใช้สั่ง 1 ก.ย. 69: เพิ่มงานสกรีน 2 เลเยอร์ + "ทำภาพจำลองให้ด้วย"
แผ่น HOW TO PRINT ของร้าน (products/acrylic-howto/howto-print-v1.jpg) มีแค่
1 ด้าน ใต้/บน · 2 ด้าน ใต้-บน/บน-บน · 3 เลเยอร์ · 4 เลเยอร์ — ไม่มีช่อง 2 เลเยอร์ให้ครอป
จึงวาดใหม่ทรงเดียวกับแผ่นนั้น (พื้นครีม · กรอบมนกรมท่า · ป้ายหัวข้อส้ม · กองเลเยอร์เหลื่อมขวา)
แบบเดียวกับที่ทำให้ Photo card pvc ไว้แล้ว — ดู scripts/photocard-pvc-screen-art.py
ต่างกันตรงรูปทรง: ของเราเป็นแผ่นรองแก้วจัตุรัส 10×10 ซม. และวัสดุเขียนว่า "อะคริลิค"

2 เลเยอร์ = ลายหลักสกรีนใต้ (มีรองขาวทับหลังลาย) + ลายอีกชุดสกรีนบนผิวหน้า
"บน-ใต้ ลายหันฝั่งเดียวกัน" (ผู้ใช้ย้ำ 1 ก.ย. 69) — ทั้งสองชั้นดูจากหน้าเดียวกัน
ระยะห่างของสองชั้นงานคือความหนาอะคริลิค ลายเลยดูมีมิติ — คนละแบบกับ "สกรีน 2 ด้าน"
ที่เป็นคนละลายมองจากคนละฝั่ง (ภาพจึงวางเป็ดหันทางเดียวกันซ้อนกัน ไม่ใช่เป็ดกลับข้าง)

⚠️ PIL ไม่มี raqm — วางวรรณยุกต์ซ้อนสระบนไม่ได้ (เช่น "ชั้น" "พื้น" "ที่" "นี้")
   ข้อความในภาพเลยเลี่ยงคำพวกนี้ทั้งหมด แก้ข้อความเมื่อไหร่ให้เช็คด้วย
⚠️ ฟอนต์ Mitr อยู่ที่ .cache/fonts/ — ไม่มีก็โหลดใหม่ได้จาก
   https://github.com/google/fonts/raw/main/ofl/mitr/Mitr-{SemiBold,Medium}.ttf
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "scripts/assets/acrylic-coaster"
FONTS = ROOT / ".cache/fonts"
DUCK_SRC = ROOT / "scripts/assets/photocard-pvc/duck.png"   # เป็ดตัวเดียวกับแผ่น HOW TO PRINT ของร้าน

# โทนสีดูดมาจากแผ่น HOW TO PRINT ของร้าน (acrylic-howto/screen-1side-top-v1.jpg)
CREAM = (255, 239, 205)
PANEL = (255, 248, 230)
NAVY = (11, 42, 91)
ORANGE = (236, 118, 18)
INK = (43, 43, 43)
ART_BG = (238, 246, 254)            # พื้นลายบนแผ่น (ชนงานสกรีน)
ART_EDGE = (150, 196, 232)
WHITE_BACK = (255, 255, 255)        # รองขาว — ทับหลังลายสกรีนใต้ ไม่ให้ลายโปร่ง
CLEAR_FILL = (255, 255, 255, 130)   # อะคริลิคใส — โปร่งพอให้เห็นชนงานที่อยู่หลัง
CLEAR_EDGE = (176, 190, 197, 235)
DASH = (168, 178, 190)              # ขอบชั้นงาน "หมึกสกรีน" ที่ไม่มีเนื้อวัสดุของตัวเอง

W, H = 900, 900
FRAME = (46, 150, 854, 856)
SIDE = 258                          # แผ่นรองแก้วจัตุรัส 10×10 ซม.
RADIUS = 24
DX, DY = 104, -36                   # ระยะเหลื่อมของแต่ละชั้น (ไล่ขึ้นไปทางขวา เหมือนแผ่นของร้าน)


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def fit(texts, room, size, name="Mitr-Medium.ttf"):
    """ฟอนต์ที่ใหญ่ที่สุดที่ยังวางข้อความยาวสุดในความกว้าง room ได้ — กันป้ายล้นกรอบเวลาแก้ข้อความ"""
    if isinstance(texts, str):
        texts = [texts]
    probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    while size > 14:
        f = font(name, size)
        if max(probe.textbbox((0, 0), t, font=f)[2] for t in texts) <= room:
            return f
        size -= 1
    return font(name, size)


DUCK = Image.open(DUCK_SRC).convert("RGBA")


def duck_on(im, scale=0.58, dy=0):
    """วางเป็ดกลางแผ่น — ลายเดียวกันทุกชั้น ให้ดูออกว่าเป็นลายเดิมพิมพ์ซ้อนกัน"""
    d = DUCK.resize(
        (round(DUCK.width * SIDE * scale / DUCK.height), round(SIDE * scale)), Image.LANCZOS
    )
    im.alpha_composite(d, ((SIDE - d.width) // 2, (SIDE - d.height) // 2 + dy))


def under_layer():
    """Layer1 — ลายหลักสกรีนใต้ + รองขาวทับหลังลาย (แผ่นทึบ มองไม่ทะลุ)"""
    im = Image.new("RGBA", (SIDE, SIDE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, SIDE - 1, SIDE - 1), radius=RADIUS, fill=WHITE_BACK, outline=INK, width=4)
    d.rounded_rectangle((16, 16, SIDE - 17, SIDE - 17), radius=RADIUS - 8, fill=ART_BG, outline=ART_EDGE, width=3)
    duck_on(im)
    return im


def clear_layer():
    """อะคริลิคใส — ความหนาของแผ่นคือระยะห่างของสองชั้นงาน"""
    im = Image.new("RGBA", (SIDE, SIDE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, SIDE - 1, SIDE - 1), radius=RADIUS, fill=CLEAR_FILL, outline=CLEAR_EDGE, width=4)
    # แถบไฮไลต์เนื้อใส — วาดสั้น ๆ ชิดซ้าย ให้อยู่บนพื้นครีม ไม่พาดข้ามแผ่นที่ซ้อนอยู่ข้างหลัง
    d.line((34, 50, 122, 50), fill=(255, 255, 255, 220), width=9)
    d.line((34, 76, 90, 76), fill=(255, 255, 255, 160), width=6)
    return im


def top_layer():
    """Layer2 — ลายสกรีนทับบนผิวหน้า: หมึกลายอย่างเดียว ขอบเลยเป็นเส้นประ ไม่ใช่แผ่นทึบ"""
    im = Image.new("RGBA", (SIDE, SIDE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for x in range(0, SIDE, 26):        # ขอบเส้นประ — บอกว่าชั้นนี้เป็นหมึกสกรีน ไม่มีแผ่นของตัวเอง
        d.line((x, 0, min(x + 14, SIDE - 1), 0), fill=DASH, width=4)
        d.line((x, SIDE - 2, min(x + 14, SIDE - 1), SIDE - 2), fill=DASH, width=4)
    for y in range(0, SIDE, 26):
        d.line((0, y, 0, min(y + 14, SIDE - 1)), fill=DASH, width=4)
        d.line((SIDE - 2, y, SIDE - 2, min(y + 14, SIDE - 1)), fill=DASH, width=4)
    duck_on(im)
    return im


def sheet(title, layers, caption):
    """layers = [(ชั้น, ป้ายกำกับ), ...] เรียงจาก "หน้าสุด" ไป "หลังสุด" (ซ้าย→ขวา)"""
    img = Image.new("RGBA", (W, H), CREAM + (255,))
    d = ImageDraw.Draw(img)

    d.rounded_rectangle(FRAME, radius=44, fill=PANEL, outline=NAVY, width=6)

    n = len(layers)
    total_h = SIDE + (n - 1) * -DY
    x0 = FRAME[0] + 42
    y0 = FRAME[1] + (FRAME[3] - FRAME[1] - total_h - 168) // 2 + (n - 1) * -DY   # ชั้นหน้าสุดอยู่ล่างสุด
    spots = [(x0 + i * DX, y0 + i * DY) for i in range(n)]

    for (x, y), (layer, _) in reversed(list(zip(spots, layers))):   # วาดจากชั้นหลังสุดมาหน้าสุด
        img.alpha_composite(layer, (x, y))

    # ป้ายกำกับเรียงเป็นคอลัมน์เดียว ขอบซ้ายตรงกันหมด — ชั้นเหลื่อมกันแค่ 36 px
    # ถ้าปล่อยให้ป้ายอยู่ระดับเดียวกับชั้น ตัวหนังสือจะชนกันเอง
    text_x = max(x + round(SIDE * 0.74) for x, _ in spots) + 44
    room = FRAME[2] - 26 - text_x
    f_lab = fit(text_x and [t for _, t in layers], room, 30)     # ย่อฟอนต์ให้ป้ายยาวสุดไม่ล้นกรอบ
    for i, ((x, y), (_, text)) in enumerate(zip(spots, layers)):
        ax = x + round(SIDE * 0.74)
        ly = FRAME[3] - 132 - i * 52
        d.line((ax, y + SIDE, text_x - 12, ly - 8), fill=INK, width=3)
        d.text((text_x, ly - f_lab.size * 0.78), text, font=f_lab, fill=INK)

    f_cap = fit(caption, FRAME[2] - FRAME[0] - 64, 30)
    cw = d.textbbox((0, 0), caption, font=f_cap)[2]
    d.text(((W - cw) / 2, FRAME[3] - 78), caption, font=f_cap, fill=NAVY)

    # ป้ายหัวข้อส้ม — วาดทีหลังสุด ให้ทับขอบกรอบเหมือนแผ่นของร้าน
    f_title = font("Mitr-SemiBold.ttf", 46)
    tw = d.textbbox((0, 0), title, font=f_title)[2]
    d.rounded_rectangle(((W - tw) / 2 - 44, 42, (W + tw) / 2 + 44, 140), radius=49, fill=ORANGE)
    d.text(((W - tw) / 2, 56), title, font=f_title, fill=(255, 255, 255))
    return img.convert("RGB")


OUT.mkdir(parents=True, exist_ok=True)
img = sheet(
    "สกรีน 2 เลเยอร์ (บน-ใต้)",
    [
        (top_layer(), "Layer2 — สกรีนบน (ลายทับหน้า)"),
        (clear_layer(), "อะคริลิค"),
        (under_layer(), "Layer1 — สกรีนใต้ + รองขาว"),
    ],
    "ลายบนกับลายใต้หันไปทางเดียวกัน — มองด้านหน้าเห็นลายซ้อนมีมิติ",
)
path = OUT / "screen-2layer.jpg"
img.save(path, quality=92)
print(f"✓ {path.relative_to(ROOT)}  {path.stat().st_size // 1024} KB")
