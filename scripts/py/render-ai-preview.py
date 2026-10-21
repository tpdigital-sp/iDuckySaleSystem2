"""
🖼 เรนเดอร์หน้าแรกของไฟล์ .ai/.pdf เป็น PNG ที่ความละเอียดจริง (ใช้เป็นพรีวิว/ไกด์จอออกแบบ)
  tools/cutout-py/.venv/bin/python -I scripts/py/render-ai-preview.py <ไฟล์เข้า> <png ออก> [dpi=300] [maxEdgePx=1400] [keepLayers=]
พื้นขาวทึบ ไม่ใส่ขอบ/เงา (flood fill หาเขตนอกเส้นตัดในจอออกแบบพึ่งพื้นขาวสะอาด)
keepLayers = ชื่อเลเยอร์คั่นด้วย , (เช่น "Print,Details") → เลเยอร์อื่นปิดก่อนเรนเดอร์
  (ไฟล์ผ้าหนึบบน NAS มีเลเยอร์ตัวอย่างลายเปิดค้าง — ไม่ปิด พรีวิวจะเป็นลายตัวอย่างแทนกรอบเปล่า · 21 ต.ค. 69)
พิมพ์ JSON {"widthMm","heightMm","px":[w,h],"dpi","hiddenLayers"} ออก stdout
"""
import fitz, json, sys

src, out = sys.argv[1], sys.argv[2]
dpi = float(sys.argv[3]) if len(sys.argv) > 3 else 300.0
max_edge = int(sys.argv[4]) if len(sys.argv) > 4 else 1400
keep = {k.strip() for k in (sys.argv[5] if len(sys.argv) > 5 else "").split(",") if k.strip()}
MM = 25.4 / 72
doc = fitz.open(src)
hidden = []
if keep:
    for cfg in doc.layer_ui_configs():
        if cfg["text"] not in keep and cfg["on"]:
            doc.set_layer_ui_config(cfg["number"], action=2)  # 2 = ปิด
            hidden.append(cfg["text"])
pg = doc[0]
r = pg.rect
# ไม่ให้ด้านยาวเกิน max_edge พิกเซล (อาร์ตบอร์ดใหญ่ไฟล์จะบวม)
dpi = min(dpi, max_edge / (max(r.width, r.height) / 72))
pix = pg.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72), alpha=False)  # dpi= ของ pymupdf รับ int เท่านั้น
pix.save(out)
print(json.dumps({"widthMm": round(r.width * MM, 1), "heightMm": round(r.height * MM, 1), "px": [pix.width, pix.height], "dpi": round(dpi, 1), "hiddenLayers": hidden}))
