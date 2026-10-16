"""
🧩 ทำสกิน (PNG พื้นใส) ของเทมเพลตจากเส้นเวกเตอร์ในไฟล์ .ai ล้วน — ไม่เอาภาพเงา/emboss ที่ฝังในไฟล์
  tools/cutout-py/.venv/bin/python -I scripts/py/template-line-skin.py <ไฟล์ .ai> <png ออก> [dpi=300]
(16 ต.ค. 69 เจ้าของร้านแจ้ง กรอบรูป+จิ๊กซอว์ "ช่วยปรับ skin ให้หน่อย มันทำให้ดูไม่น่าซื้อ" — สกินเดิมเส้นตัวจิ๊กซอว์มีเงาเทาฟุ้งหนา วางบนรูปแล้วขุ่น)
เส้นที่วาดใหม่:
  · เส้นเทากลาง (ตัวจิ๊กซอว์ / กรอบ) → เทาเข้มบาง 0.6pt โปร่ง 45%  — จอออกแบบวางแบบ multiply = เส้นจางบนรูปสว่าง
    และมาสก์เส้นของจอ (guideLines) ทำเป็นเส้นขาวเองบนรูปเข้ม
  · เส้นมีสีในไฟล์ = ลวดลายต้นแบบ (pattern tile) ที่วางนอกหน้า ไม่ใช่ของจริง → ไม่วาด
  · แถบตัดตก = ลายทแยงแดงบาง วาดเองในช่องระหว่างขอบอาร์ตบอร์ดกับเส้นตัด (กรอบเทาเส้น ≥ 0.9pt ที่ใหญ่สุด · สกินเดิมเป็นภาพฝังในไฟล์)
พิมพ์ JSON {"widthMm","heightMm","px":[w,h],"strokes":{"gray":n,"color":n}} ออก stdout
"""
import fitz, json, sys

src, out = sys.argv[1], sys.argv[2]
dpi = float(sys.argv[3]) if len(sys.argv) > 3 else 300.0
MM = 25.4 / 72
doc = fitz.open(src)
pg = doc[0]
W, H = pg.rect.width, pg.rect.height

nd = fitz.open()
np_ = nd.new_page(width=W, height=H)
counts = {"gray": 0, "color": 0}
for d in pg.get_drawings():
    if d.get("type") not in ("s", "fs"):
        continue
    col = d.get("color")
    if not col:
        continue
    neutral = max(col) - min(col) < 0.08
    sh = np_.new_shape()
    for it in d["items"]:
        k = it[0]
        if k == "l":
            sh.draw_line(it[1], it[2])
        elif k == "c":
            sh.draw_bezier(it[1], it[2], it[3], it[4])
        elif k == "re":
            sh.draw_rect(it[1])
        elif k == "qu":
            sh.draw_quad(it[1])
    if not neutral:
        counts["color"] += 1  # ลวดลายต้นแบบนอกหน้า — ข้าม
        continue
    sh.finish(color=(0.22, 0.22, 0.24), width=0.6, stroke_opacity=0.45, closePath=False, lineCap=1, lineJoin=1)
    counts["gray"] += 1
    sh.commit()

# ── แถบตัดตก: ลายทแยงแดงระหว่างขอบอาร์ตบอร์ดกับเส้นตัด ──
trim = None
for d in pg.get_drawings():
    c = d.get("color")
    if d.get("type") in ("s", "fs") and c and max(c) - min(c) < 0.08 and (d.get("width") or 0) >= 0.9:
        r = d["rect"]
        if trim is None or r.width * r.height > trim.width * trim.height:
            trim = r
hatch = 0
if trim is not None and trim.x0 > 0.5 and trim.y0 > 0.5:
    def clip(p0, p1, r):
        # Liang–Barsky: ตัดเส้น p0→p1 ให้อยู่ในสี่เหลี่ยม r
        x0, y0 = p0; dx, dy = p1[0] - x0, p1[1] - y0
        t0, t1 = 0.0, 1.0
        for p, q in ((-dx, x0 - r.x0), (dx, r.x1 - x0), (-dy, y0 - r.y0), (dy, r.y1 - y0)):
            if p == 0:
                if q < 0:
                    return None
            else:
                t = q / p
                if p < 0:
                    if t > t1: return None
                    t0 = max(t0, t)
                else:
                    if t < t0: return None
                    t1 = min(t1, t)
        if t0 >= t1:
            return None
        return (x0 + dx * t0, y0 + dy * t0), (x0 + dx * t1, y0 + dy * t1)
    strips = [
        fitz.Rect(0, 0, W, trim.y0), fitz.Rect(0, trim.y1, W, H),
        fitz.Rect(0, trim.y0, trim.x0, trim.y1), fitz.Rect(trim.x1, trim.y0, W, trim.y1),
    ]
    step = 1.4 / MM  # ระยะห่างลายทแยง 1.4 มม.
    sh = np_.new_shape()
    k = -H
    while k < W + H:
        a, b = (k, H), (k + H, 0)  # เส้น 45°
        for r in strips:
            seg = clip(a, b, r)
            if seg:
                sh.draw_line(fitz.Point(*seg[0]), fitz.Point(*seg[1]))
                hatch += 1
        k += step
    sh.finish(color=(0.93, 0.11, 0.14), width=0.3, stroke_opacity=0.7, lineCap=0)
    sh.commit()
counts["hatch"] = hatch

pix = np_.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72), alpha=True)
pix.save(out)
print(json.dumps({"widthMm": round(W * MM, 2), "heightMm": round(H * MM, 2), "px": [pix.width, pix.height], "strokes": counts}))
