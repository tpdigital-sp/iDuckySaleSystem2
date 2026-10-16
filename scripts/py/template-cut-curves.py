"""
✂️ ดึง "เส้นไดคัทจริง" (เวกเตอร์) ออกจากไฟล์เทมเพลต .ai/.pdf — เส้นขอบนอกสุดสีเทากลาง (ไม่ใช่เส้นแดง/ลายทแยง)
  tools/cutout-py/.venv/bin/python -I scripts/py/template-cut-curves.py <ไฟล์>
พิมพ์ JSON {"widthMm","heightMm","cut":[{"s":[x,y],"g":[[c1x,c1y,c2x,c2y,x,y],...],"open"?:true}],"face":[...],"bbox":[x0,y0,x1,y1]}
พิกัด มม. นับจากมุมซ้ายบนของอาร์ตบอร์ด (หน้าแรก) · เส้นตรงแปลงเป็นเบซิเยร์ (จุดคุม = ปลายเส้น)
หลักเลือก (เทมเพลตเข็มกลัดของร้าน 16 ต.ค. 69): เส้น stroke สีเทากลาง (R≈G≈B 0.55–0.85) — วงนอกสุด = เส้นตัด · วงถัดเข้าไป = หน้างาน (face)
  ไม่เจอเส้นเทา หรือเส้นนอกหลุดอาร์ตบอร์ด > 1 มม. = exit 2 (ให้ผู้เรียกหยุด ไม่เดา)
"""
import fitz, json, sys

MM = 25.4 / 72
doc = fitz.open(sys.argv[1])
pg = doc[0]
W, H = pg.rect.width * MM, pg.rect.height * MM


def gray(c):
    return c and len(c) == 3 and max(c) - min(c) < 0.06 and 0.55 <= sum(c) / 3 <= 0.85


def subpaths(items):
    """แยกรายการท่อนเป็นเส้นย่อย (ปลายท่อนก่อน ≠ ต้นท่อนถัดไป = เส้นใหม่) → [(start, [seg6...])]"""
    out, cur, last = [], None, None
    for it in items:
        k = it[0]
        if k == "re":
            r = it[1]
            pts = [r.tl, r.tr, r.br, r.bl, r.tl]
            segs = [(a, a, b, b) for a, b in zip(pts, pts[1:])]
            out.append((pts[0], segs))
            cur, last = None, None
            continue
        if k == "l":
            a, b = it[1], it[2]
            seg = (a, a, b, b)
        elif k == "c":
            a, c1, c2, b = it[1], it[2], it[3], it[4]
            seg = (a, c1, c2, b)
        elif k == "qu":
            q = it[1]
            pts = [q.ul, q.ur, q.lr, q.ll, q.ul]
            out.append((pts[0], [(a, a, b, b) for a, b in zip(pts, pts[1:])]))
            cur, last = None, None
            continue
        else:
            continue
        if cur is None or last is None or abs(last.x - seg[0].x) > 0.05 or abs(last.y - seg[0].y) > 0.05:
            cur = (seg[0], [])
            out.append(cur)
        cur[1].append(seg)
        last = seg[3]
    return out


def to_mm(start, segs):
    p = lambda v: [round(v.x * MM, 4), round(v.y * MM, 4)]
    g = [p(s[1]) + p(s[2]) + p(s[3]) for s in segs]
    closed = abs(segs[-1][3].x - start.x) < 0.2 and abs(segs[-1][3].y - start.y) < 0.2
    return {"s": p(start), "g": g, **({} if closed else {"open": True})}


def on_bbox(c):
    xs = [c["s"][0]] + [g[4] for g in c["g"]]
    ys = [c["s"][1]] + [g[5] for g in c["g"]]
    return min(xs), min(ys), max(xs), max(ys)


paths = []
for d in pg.get_drawings():
    if d.get("type") not in ("s", "fs") or not gray(d.get("color")):
        continue
    for start, segs in subpaths(d["items"]):
        if len(segs) < 2:
            continue
        c = to_mm(start, segs)
        x0, y0, x1, y1 = on_bbox(c)
        if (x1 - x0) < 3 or (y1 - y0) < 3:
            continue
        paths.append((c, (x0, y0, x1, y1), (x1 - x0) * (y1 - y0)))

if not paths:
    print(json.dumps({"error": "ไม่เจอเส้นเทา (เส้นตัด) ในไฟล์"}, ensure_ascii=False))
    sys.exit(2)
paths.sort(key=lambda p: -p[2])
cut, bb, _ = paths[0]
if bb[0] < -1 or bb[1] < -1 or bb[2] > W + 1 or bb[3] > H + 1:
    print(json.dumps({"error": f"เส้นนอกสุดหลุดอาร์ตบอร์ด {bb} vs {W:.1f}x{H:.1f}"}, ensure_ascii=False))
    sys.exit(2)
face = [p[0] for p in paths[1:] if p[1][0] > bb[0] and p[1][2] < bb[2]][:1]
print(json.dumps({"widthMm": round(W, 2), "heightMm": round(H, 2), "cut": [cut], "face": face, "bbox": [round(v, 2) for v in bb]}, ensure_ascii=False))
