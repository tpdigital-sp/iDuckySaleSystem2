"""✂️ เส้นไดคัท = กรอบเส้นแดง (stroke) "วงนอกสุด" ที่เป็นทางปิด ในไฟล์ .ai/.pdf ของร้าน → JSON TemplateCurve (มม. · y ลง)
ใช้กับเทมเพลตที่ร้านวาดเส้นตัดเป็นสีแดง (แฟ้มจิ๋ว 22 ต.ค. 69) — template-cut-curves.py หาแต่เส้นเทา
argv: <ไฟล์> → stdout {"w":มม.,"h":มม.,"curves":[...],"box":[x,y,w,h]} หรือ {"error": ...}"""
import json, sys
import fitz

K = 25.4 / 72
p = fitz.open(sys.argv[1])[0]
best = None
for d in p.get_drawings():
    c = d.get("color")
    if d.get("type") != "s" or not c or not (c[0] > 0.8 and c[1] < 0.35 and c[2] < 0.35):
        continue
    items = d["items"]
    if len(items) < 4 or not any(i[0] == "c" for i in items):  # ต้องเป็นทรงมุมมน (มีโค้ง) ไม่ใช่เส้นตรง/สี่เหลี่ยมสัน
        continue
    area = d["rect"].width * d["rect"].height
    if best is None or area > best[0]:
        best = (area, d)
if not best:
    print(json.dumps({"error": "ไม่เจอกรอบเส้นแดงมุมมน"}))
    sys.exit(0)
d = best[1]
pt = lambda q: [round(q.x * K, 3), round(q.y * K, 3)]
g = []
start = None
for it in d["items"]:
    if it[0] == "l":
        a, b = it[1], it[2]
        if start is None:
            start = pt(a)
        A, B = pt(a), pt(b)
        g.append([A[0] + (B[0] - A[0]) / 3, A[1] + (B[1] - A[1]) / 3, A[0] + 2 * (B[0] - A[0]) / 3, A[1] + 2 * (B[1] - A[1]) / 3, B[0], B[1]])
    elif it[0] == "c":
        a, c1, c2, b = it[1], it[2], it[3], it[4]
        if start is None:
            start = pt(a)
        g.append([*pt(c1), *pt(c2), *pt(b)])
g = [[round(v, 3) for v in s] for s in g]
r = d["rect"]
print(json.dumps({"w": round(p.rect.width * K, 2), "h": round(p.rect.height * K, 2), "curves": [{"s": start, "g": g}], "box": [round(r.x0 * K, 2), round(r.y0 * K, 2), round(r.width * K, 2), round(r.height * K, 2)]}))
