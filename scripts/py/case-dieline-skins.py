"""
📱 เรนเดอร์สกิน/พรีวิวจากไฟล์เส้นไดคัทเคสพรีเมี่ยม (NAS โฟลเดอร์ 11–17) — ใช้คู่กับ scripts/case-dieline-replace.mts
  tools/cutout-py/.venv/bin/python -I scripts/py/case-dieline-skins.py <โฟลเดอร์ปลายทาง> <key>=<path.ai> ...
ได้ <key>-skin.png (พื้นโปร่ง · ทั้งอาร์ตบอร์ด) + <key>-preview.png (พื้นขาว) + พิมพ์ขนาดอาร์ตบอร์ด มม.
"""
import sys, fitz
PT = 25.4 / 72
out = sys.argv[1]
for arg in sys.argv[2:]:
    key, path = arg.split("=", 1)
    doc = fitz.open(path); p = doc[0]; r = p.rect
    z = 2000 / max(r.width, r.height); m = fitz.Matrix(z, z)
    p.get_pixmap(matrix=m, alpha=True).save(f"{out}/{key}-skin.png")
    p.get_pixmap(matrix=m, alpha=False).save(f"{out}/{key}-preview.png")
    print(f"{key}\t{r.width*PT:.1f}\t{r.height*PT:.1f}")
