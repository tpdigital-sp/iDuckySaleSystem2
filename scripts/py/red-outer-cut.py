"""✂️ เส้นไดคัท = กรอบเส้น (stroke) "วงนอกสุด" ที่เป็นทางปิด ในไฟล์ .ai/.pdf ของร้าน → JSON TemplateCurve (มม. · y ลง)
ใช้กับเทมเพลตที่ร้านวาดเส้นตัดเป็นสีแดง (แฟ้มจิ๋ว 22 ต.ค. 69) — template-cut-curves.py หาแต่เส้นเทา
argv: <ไฟล์> [--any-color] [--allow-rect] [--holes]
  --any-color  ไม่บังคับสีแดง (ZipLock วาดขอบถุงเป็นเส้นดำ)
  --allow-rect รับสี่เหลี่ยมเหลี่ยม (re/qu · ไม่มีโค้ง) เป็นวงนอกได้ (Candy bag กรอบพื้นที่สกรีน)
  --holes      เส้นปิดสีเดียวกันที่อยู่ในวงนอกทั้งเส้น = รูเจาะ (Candy bag รูร้อยโซ่ Ø5) ใส่ต่อท้าย
→ stdout {"w","h","curves":[...],"box":[x,y,w,h],"holes":n} หรือ {"error": ...}"""
import json, sys
import fitz

K = 25.4 / 72
ANY = "--any-color" in sys.argv
RECT = "--allow-rect" in sys.argv
HOLES = "--holes" in sys.argv
p = fitz.open(sys.argv[1])[0]
pt = lambda q: [round(q.x * K, 3), round(q.y * K, 3)]


def line(A, B):
    return [A[0] + (B[0] - A[0]) / 3, A[1] + (B[1] - A[1]) / 3, A[0] + 2 * (B[0] - A[0]) / 3, A[1] + 2 * (B[1] - A[1]) / 3, B[0], B[1]]


def curve_of(d):
    """แปลง items ของ pymupdf เป็น TemplateCurve ทางปิด · None = แปลงไม่ได้"""
    items = d["items"]
    if len(items) == 1 and items[0][0] in ("re", "qu"):
        it = items[0]
        if it[0] == "re":
            r = it[1]
            c = [pt(fitz.Point(r.x0, r.y0)), pt(fitz.Point(r.x1, r.y0)), pt(fitz.Point(r.x1, r.y1)), pt(fitz.Point(r.x0, r.y1))]
        else:
            q = it[1]
            c = [pt(q.ul), pt(q.ur), pt(q.lr), pt(q.ll)]
        return {"s": c[0], "g": [line(c[i], c[(i + 1) % 4]) for i in range(4)]}
    g, start = [], None
    for it in items:
        if it[0] == "l":
            if start is None:
                start = pt(it[1])
            g.append(line(pt(it[1]), pt(it[2])))
        elif it[0] == "c":
            if start is None:
                start = pt(it[1])
            g.append([*pt(it[2]), *pt(it[3]), *pt(it[4])])
        else:
            return None
    if not g:
        return None
    return {"s": start, "g": g}


def color_ok(d):
    c = d.get("color")
    if d.get("type") not in ("s", "fs") or not c:
        return False
    return ANY or (c[0] > 0.8 and c[1] < 0.35 and c[2] < 0.35)


cands = []
for d in p.get_drawings():
    if not color_ok(d):
        continue
    items = d["items"]
    is_rect = len(items) == 1 and items[0][0] in ("re", "qu")
    has_curve = any(i[0] == "c" for i in items)
    if not (has_curve and len(items) >= 4) and not (RECT and is_rect):
        continue
    cands.append(d)
if not cands:
    print(json.dumps({"error": "ไม่เจอกรอบเส้นทางปิด" + ("" if ANY else "สีแดง")}))
    sys.exit(0)
outer = max(cands, key=lambda d: d["rect"].width * d["rect"].height)
c0 = curve_of(outer)
if not c0:
    print(json.dumps({"error": "แปลงเส้นวงนอกไม่ได้"}))
    sys.exit(0)
curves = [c0]
nh = 0
if HOLES:
    R = outer["rect"]
    for d in p.get_drawings():
        if d is outer or not color_ok(d):
            continue
        r = d["rect"]
        if not (r.x0 > R.x0 and r.y0 > R.y0 and r.x1 < R.x1 and r.y1 < R.y1):
            continue
        if not any(i[0] == "c" for i in d["items"]):  # รูต้องเป็นทรงโค้งปิด (วงกลม) — เส้นตรงในกรอบไม่ใช่รู
            continue
        h = curve_of(d)
        if h:
            curves.append(h)
            nh += 1
for c in curves:
    c["g"] = [[round(v, 3) for v in s] for s in c["g"]]
r = outer["rect"]
print(json.dumps({"w": round(p.rect.width * K, 2), "h": round(p.rect.height * K, 2), "curves": curves, "box": [round(r.x0 * K, 2), round(r.y0 * K, 2), round(r.width * K, 2), round(r.height * K, 2)], "holes": nh}))
