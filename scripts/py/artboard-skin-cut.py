"""🛂 ต่ออาร์ตบอร์ด: สกิน (เฉพาะเลเยอร์เส้น พื้นโปร่ง) + พรีวิว (ทุกเลเยอร์) + เส้นตัดสีแดง → JSON
ใช้กับไฟล์เทมเพลตหลายอาร์ตบอร์ด (Passport.ai / (2ด้าน)Passport.ai · 22 ต.ค. 69)
argv: <ไฟล์> <หน้า 0..> <outdir> <stem> [--skin-layers Template] [--near x,y,w,h] [--any-color]
  --near  เลือกเส้นแดงทางปิดที่กรอบใกล้ค่านี้ที่สุด (มม.) แทน "ใหญ่สุด" — ด้านในของ Passport พิมพ์ได้แค่ช่องซ้าย 76.5×123
stdout {"widthMm","heightMm","skin","preview","curves":[...],"box":[x,y,w,h]} หรือ {"error"}"""
import json, sys
import fitz

K = 25.4 / 72
src, page_no, outdir, stem = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
arg = lambda k, d="": sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
skin_layers = {s.strip() for s in arg("--skin-layers", "Template").split(",") if s.strip()}
near = [float(v) for v in arg("--near").split(",")] if "--near" in sys.argv else None
ANY = "--any-color" in sys.argv  # เส้นขอบไม่ใช่สีแดง (ZipLock ขอบถุงเส้นดำ · 22 ต.ค. 69)

doc = fitz.open(src)
pg = doc[page_no]
W, H = pg.rect.width * K, pg.rect.height * K

# ── พรีวิว: ทุกเลเยอร์ (พื้นเทา/หนังตัวอย่าง + ตัวหนังสือ) ≤ 1400 px
dpi = min(300, 1400 / (max(pg.rect.width, pg.rect.height) / 72))
pv = f"{outdir}/{stem}-p{page_no}-preview.png"
pg.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72), alpha=False).save(pv)

# ── สกิน: เปิดเฉพาะเลเยอร์เส้น · 300 dpi · พื้นโปร่ง
cfgs = doc.layer_ui_configs()
for c in cfgs:
    doc.set_layer_ui_config(c["number"], action=0 if c["text"] in skin_layers else 2)
pg = doc[page_no]
sk = f"{outdir}/{stem}-p{page_no}-skin.png"
pg.get_pixmap(matrix=fitz.Matrix(300 / 72, 300 / 72), alpha=True).save(sk)

# ── เส้นตัด: เส้นแดงทางปิดที่มีโค้ง
pt = lambda q: [round(q.x * K, 3), round(q.y * K, 3)]
def line(A, B):
    return [round(A[0] + (B[0] - A[0]) / 3, 3), round(A[1] + (B[1] - A[1]) / 3, 3), round(A[0] + 2 * (B[0] - A[0]) / 3, 3), round(A[1] + 2 * (B[1] - A[1]) / 3, 3), B[0], B[1]]
cands = []
for d in pg.get_drawings():
    c = d.get("color")
    if d.get("type") not in ("s", "fs") or not c or not (ANY or (c[0] > 0.8 and c[1] < 0.35 and c[2] < 0.35)):
        continue
    if not any(i[0] == "c" for i in d["items"]) or len(d["items"]) < 4:
        continue
    cands.append(d)
if not cands:
    print(json.dumps({"error": f"หน้า {page_no}: ไม่เจอเส้นแดงทางปิดมุมมน"}))
    sys.exit(0)
if near:
    nx, ny, nw, nh = near
    score = lambda d: abs(d["rect"].x0 * K - nx) + abs(d["rect"].y0 * K - ny) + abs(d["rect"].width * K - nw) + abs(d["rect"].height * K - nh)
    best = min(cands, key=score)
    if score(best) > 3:
        print(json.dumps({"error": f"หน้า {page_no}: ไม่มีเส้นแดงใกล้ {near} (ใกล้สุดคลาด {score(best):.1f} มม.)"}))
        sys.exit(0)
else:
    best = max(cands, key=lambda d: d["rect"].width * d["rect"].height)
g, start = [], None
for it in best["items"]:
    if it[0] == "l":
        start = start or pt(it[1])
        g.append(line(pt(it[1]), pt(it[2])))
    elif it[0] == "c":
        start = start or pt(it[1])
        g.append([*pt(it[2]), *pt(it[3]), *pt(it[4])])
r = best["rect"]
print(json.dumps({"widthMm": round(W, 2), "heightMm": round(H, 2), "skin": sk, "preview": pv, "curves": [{"s": start, "g": g}], "box": [round(r.x0 * K, 2), round(r.y0 * K, 2), round(r.width * K, 2), round(r.height * K, 2)]}))
