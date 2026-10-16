"""
🖼 เรนเดอร์หน้าแรกของไฟล์ .ai/.pdf เป็น PNG ที่ความละเอียดจริง (ใช้เป็นพรีวิว/ไกด์จอออกแบบ)
  tools/cutout-py/.venv/bin/python -I scripts/py/render-ai-preview.py <ไฟล์เข้า> <png ออก> [dpi=300] [maxEdgePx=1400]
พื้นขาวทึบ ไม่ใส่ขอบ/เงา (flood fill หาเขตนอกเส้นตัดในจอออกแบบพึ่งพื้นขาวสะอาด)
พิมพ์ JSON {"widthMm","heightMm","px":[w,h],"dpi"} ออก stdout
"""
import fitz, json, sys

src, out = sys.argv[1], sys.argv[2]
dpi = float(sys.argv[3]) if len(sys.argv) > 3 else 300.0
max_edge = int(sys.argv[4]) if len(sys.argv) > 4 else 1400
MM = 25.4 / 72
doc = fitz.open(src)
pg = doc[0]
r = pg.rect
# ไม่ให้ด้านยาวเกิน max_edge พิกเซล (อาร์ตบอร์ดใหญ่ไฟล์จะบวม)
dpi = min(dpi, max_edge / (max(r.width, r.height) / 72))
pix = pg.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72), alpha=False)  # dpi= ของ pymupdf รับ int เท่านั้น
pix.save(out)
print(json.dumps({"widthMm": round(r.width * MM, 1), "heightMm": round(r.height * MM, 1), "px": [pix.width, pix.height], "dpi": round(dpi, 1)}))
