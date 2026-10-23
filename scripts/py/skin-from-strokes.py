"""
✏️ วาดสกินจอออกแบบใหม่จากเส้นเวกเตอร์ในไฟล์ .ai — เส้นประ/เส้นตัดหนาและเข้มพอเห็นบนจอ
(ปลอกคอสัตว์เลี้ยง 23 ต.ค. 69 เจ้าของร้านแจ้ง "เส้นปะมันควรชัด" — สกินเดิมเป็นภาพเรนเดอร์เส้น 0.25pt ย่อบนจอแล้วจาง
 + ช่วงที่เคยทับขีดแดงขาดหายไปหลังล้างแดงด้วย skin-clear-red.py)
  tools/cutout-py/.venv/bin/python -I scripts/py/skin-from-strokes.py <ไฟล์.ai> <สกินออก.png> <กว้างpx> <สูงpx>
ผลลัพธ์ (โครงเดียวกับสกินเดิม): นอกเส้นตัด = ขาวทึบ · ในเส้นตัด = โปร่ง
  + เส้น stroke ทุกเส้นในไฟล์ (เส้นตัด ทึบ · เส้นประพับ/ระยะ ตามแพตเทิร์นในไฟล์) + จุดกลมถมเล็ก (≤ 15 มม. เช่น จุดกระดุม · ตัวหนังสือไม่เอา)
  ความหนาเส้น = ด้านยาวอาร์ตบอร์ด / 650 (ไม่ต่ำกว่า 0.35 มม.) → บนจอหนาราว 1.5 px ทุกขนาด · ช่วงประยืดตามความหนา
เส้นตัด = เส้น stroke กรอบใหญ่สุดในเลเยอร์ Print (เหมือน layer-outline-cut.py)
พิมพ์ JSON {"px":[w,h],"lineMm","strokes","dots"} ออก stdout
"""
import json, math, sys

import fitz
from PIL import Image, ImageDraw

src, out, W, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
MM = 25.4 / 72
pg = fitz.open(src)[0]
wMm, hMm = pg.rect.width * MM, pg.rect.height * MM
sx, sy = W / wMm, H / hMm
P = lambda p: (p.x * MM * sx, p.y * MM * sy)
lineMm = max(max(wMm, hMm) / 650, 0.35)
lw = max(2, round(lineMm * sx))
INK_CUT = (55, 55, 55, 255)
INK_DASH = (85, 85, 85, 255)


def pts_of(items):
    """ท่อนของเส้น → รายการโพลีไลน์ [(x,y),...] (โค้งสุ่ม 24 จุด)"""
    lines, cur = [], []
    for it in items:
        k = it[0]
        if k == "l":
            a, b = P(it[1]), P(it[2])
            if cur and math.dist(cur[-1], a) > 0.5:
                lines.append(cur)
                cur = []
            cur = cur or [a]
            cur.append(b)
        elif k == "c":
            p0, c1, c2, p3 = (P(x) for x in it[1:5])
            if cur and math.dist(cur[-1], p0) > 0.5:
                lines.append(cur)
                cur = []
            cur = cur or [p0]
            for i in range(1, 25):
                t = i / 24
                u = 1 - t
                cur.append(tuple(u**3 * p0[j] + 3 * u * u * t * c1[j] + 3 * u * t * t * c2[j] + t**3 * p3[j] for j in range(2)))
        elif k in ("qu", "re"):
            if cur:
                lines.append(cur)
                cur = []
            q = it[1] if k == "qu" else it[1].quad
            lines.append([P(q.ul), P(q.ur), P(q.lr), P(q.ll), P(q.ul)])
    if cur:
        lines.append(cur)
    return lines


def dash_pattern(d):
    """"[ 5.015 5.015 ] 0" → [ยาวpx, เว้นpx] (ยืดตามความหนาเส้น ไม่งั้นเส้นหนาประถี่จนติดกัน)"""
    if not d:
        return None
    try:
        nums = [float(x) for x in d.split("]")[0].strip("[ ").split()]
    except ValueError:
        return None
    if not nums:
        return None
    on, off = nums[0] * MM * sx, (nums[1] if len(nums) > 1 else nums[0]) * MM * sx
    return [max(on, lw * 4), max(off, lw * 3)]


def draw_dashed(dr, pts, pat, fill):
    """เส้นประตามระยะสะสมตลอดโพลีไลน์ (ช่วงประต่อเนื่องข้ามมุม)"""
    on, off = pat
    period = on + off
    walked = 0.0
    for a, b in zip(pts, pts[1:]):
        L = math.dist(a, b)
        if L < 1e-6:
            continue
        k = math.floor(walked / period)
        while True:
            s, e = k * period - walked, k * period + on - walked  # ช่วงประที่ k เทียบต้นท่อนนี้
            if s >= L:
                break
            s, e = max(s, 0.0), min(e, L)
            if e > s:
                at = lambda t: (a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L)
                dr.line([at(s), at(e)], fill=fill, width=lw)
            k += 1
        walked += L


drawings = pg.get_drawings()
cands = [d for d in drawings if d.get("layer") == "Print" and d.get("color") is not None and d["type"] in ("s", "fs")]
if not cands:
    print("ไม่มีเส้นตัดในเลเยอร์ Print", file=sys.stderr)
    sys.exit(2)
cut = max(cands, key=lambda d: d["rect"].width * d["rect"].height)
cut_poly = [p for line in pts_of(cut["items"]) for p in line]

img = Image.new("RGBA", (W, H), (255, 255, 255, 255))
mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).polygon(cut_poly, fill=255)
img.paste((255, 255, 255, 0), mask=mask)
dr = ImageDraw.Draw(img)

strokes = dots = 0
for d in drawings:
    if d is cut:
        continue
    r = d["rect"]
    if d["type"] == "f":
        # เฉพาะจุดกลม (โค้งล้วน กว้าง≈สูง) — ตัวหนังสือที่ outline แล้ว ("12in" ใน Dog XL) เป็นรูปถมเล็กเหมือนกัน ไม่เอา
        round_dot = all(it[0] == "c" for it in d["items"]) and 0.8 <= r.width / max(r.height, 1e-6) <= 1.25
        if round_dot and r.width * MM <= 15 and d.get("fill") and max(d["fill"]) < 0.3:
            for line in pts_of(d["items"]):
                if len(line) > 2:
                    dr.polygon(line, fill=(0, 0, 0, 255))
            dots += 1
        continue
    if d.get("color") is None:
        continue
    pat = dash_pattern(d.get("dashes"))
    for line in pts_of(d["items"]):
        if len(line) < 2:
            continue
        if pat:
            draw_dashed(dr, line, pat, INK_DASH)
        else:
            dr.line(line, fill=INK_DASH, width=lw, joint="curve")
    strokes += 1

dr.line(cut_poly + [cut_poly[0]], fill=INK_CUT, width=lw, joint="curve")
img.save(out, optimize=True)
print(json.dumps({"px": [W, H], "lineMm": round(lineMm, 2), "strokes": strokes, "dots": dots}))
