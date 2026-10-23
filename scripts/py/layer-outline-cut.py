"""
✂️ เส้นตัด = "เส้นขอบชิ้นงาน" ในเลเยอร์ที่ระบุ (ไฟล์ปลอกคอสัตว์เลี้ยง 23 ต.ค. 69: เลเยอร์ Print มีเส้นดำบาง ๆ วาดรอบผ้า สามเหลี่ยม/ข้าวหลามตัด)
  tools/cutout-py/.venv/bin/python -I scripts/py/layer-outline-cut.py <ไฟล์> [เลเยอร์=Print]
เลือกเส้น stroke ในเลเยอร์นั้นที่กรอบใหญ่สุด (จุดรู/เส้นประด้านในเล็กกว่าเสมอ) → ปิดเส้นให้ครบวง
พิมพ์ JSON {"widthMm","heightMm","cut":[{"s":[x,y],"g":[[c1x,c1y,c2x,c2y,x,y],...]}],"bbox":[x0,y0,x1,y1]} (มม. จากมุมซ้ายบนอาร์ตบอร์ด)
ไม่เจอเส้น / กรอบเส้นเล็กกว่า 80% ของอาร์ตบอร์ด / หลุดอาร์ตบอร์ด > 2 มม. = exit 2 (ให้ผู้เรียกหยุด ไม่เดา)
"""
import fitz, json, sys

MM = 25.4 / 72
doc = fitz.open(sys.argv[1])
layer = sys.argv[2] if len(sys.argv) > 2 else "Print"
pg = doc[0]
W, H = pg.rect.width * MM, pg.rect.height * MM

cands = [d for d in pg.get_drawings() if d.get("layer") == layer and d.get("color") is not None and d["type"] in ("s", "fs")]
if not cands:
    print(f"ไม่มีเส้น stroke ในเลเยอร์ {layer}", file=sys.stderr)
    sys.exit(2)
best = max(cands, key=lambda d: d["rect"].width * d["rect"].height)

P = lambda p: [round(p.x * MM, 3), round(p.y * MM, 3)]
segs = []
for it in best["items"]:
    k = it[0]
    if k == "l":
        a, b = it[1], it[2]
        segs.append((a, a, b, b))
    elif k == "c":
        segs.append((it[1], it[2], it[3], it[4]))
    elif k == "qu":
        q = it[1]
        pts = [q.ul, q.ur, q.lr, q.ll, q.ul]
        segs += [(a, a, b, b) for a, b in zip(pts, pts[1:])]
    elif k == "re":
        r = it[1]
        pts = [r.tl, r.tr, r.br, r.bl, r.tl]
        segs += [(a, a, b, b) for a, b in zip(pts, pts[1:])]
if not segs:
    sys.exit(2)
start, end = segs[0][0], segs[-1][3]
if abs(start.x - end.x) + abs(start.y - end.y) > 0.01:
    segs.append((end, end, start, start))  # สามเหลี่ยมในไฟล์วาด 3 ท่อนแต่ไม่ได้สั่งปิดเส้น

cut = [{"s": P(start), "g": [P(c1) + P(c2) + P(b) for _, c1, c2, b in segs]}]
xs = [v for g in cut[0]["g"] for v in (g[4],)] + [cut[0]["s"][0]]
ys = [v for g in cut[0]["g"] for v in (g[5],)] + [cut[0]["s"][1]]
bbox = [min(xs), min(ys), max(xs), max(ys)]
if bbox[0] < -2 or bbox[1] < -2 or bbox[2] > W + 2 or bbox[3] > H + 2:
    print(f"เส้นหลุดอาร์ตบอร์ด {bbox} vs {W:.1f}x{H:.1f}", file=sys.stderr)
    sys.exit(2)
if (bbox[2] - bbox[0]) < W * 0.8 or (bbox[3] - bbox[1]) < H * 0.8:
    print(f"เส้นใหญ่สุดเล็กเกิน {bbox} vs {W:.1f}x{H:.1f}", file=sys.stderr)
    sys.exit(2)
print(json.dumps({"widthMm": W, "heightMm": H, "cut": cut, "bbox": bbox}))
