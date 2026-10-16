"""
📱 เรนเดอร์สกิน/พรีวิวเทมเพลต Case Frame Card (ธรรมดา + Magsafe) จากไฟล์ .ai ของร้าน
  tools/cutout-py/.venv/bin/python -I scripts/py/case-frame-card-skins.py <โฟลเดอร์ออก>
อาร์ตบอร์ดทุกไฟล์ = 99.9×179.3 มม. แต่เส้นไดคัทจริงอยู่ใน ArtBox (ต่างกันตามรุ่น)
→ ครอปตาม ArtBox: <key>-<type>-skin.png (พื้นโปร่ง · ใช้เป็นไกด์จอออกแบบ ต้องตรงขนาด widthMm×heightMm)
                  <key>-<type>-preview.png (พื้นขาว + ขอบ 4%)
"""
import fitz, os, sys, json
BASE = "/Volumes/iDuckyShop/All Template/3. Case เคส/3.0 เคสมือถือ/iPhone"
SRC = {"plain": "case frame", "ms": "case frame ms/case frame ms"}
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
MM = 25.4 / 72
sizes = {}
for typ, sub in SRC.items():
    for fn in sorted(os.listdir(os.path.join(BASE, sub))):
        if not fn.endswith(".ai") or fn.startswith("ex"):
            continue
        key = fn.replace(" ms.ai", "").replace(".ai", "").replace("+", "plus").lower()
        d = fitz.open(os.path.join(BASE, sub, fn)); pg = d[0]
        ab = pg.artbox
        clip = fitz.Rect(ab.x0 - 1, ab.y0 - 1, ab.x1 + 1, ab.y1 + 1)  # เผื่อความหนาเส้น 1pt
        pix = pg.get_pixmap(dpi=300, clip=clip, alpha=True)
        pix.save(os.path.join(out, f"{key}-{typ}-skin.png"))
        pad = max(ab.width, ab.height) * 0.04
        pix2 = pg.get_pixmap(dpi=200, clip=fitz.Rect(ab.x0 - pad, ab.y0 - pad, ab.x1 + pad, ab.y1 + pad), alpha=False)
        pix2.save(os.path.join(out, f"{key}-{typ}-preview.png"))
        sizes[f"{key}-{typ}"] = {"file": fn, "widthMm": round(clip.width * MM, 1), "heightMm": round(clip.height * MM, 1)}
        print(f"{typ:5s} {key:10s} {fn:20s} {sizes[f'{key}-{typ}']['widthMm']}×{sizes[f'{key}-{typ}']['heightMm']}")
json.dump(sizes, open(os.path.join(out, "sizes.json"), "w"), ensure_ascii=False, indent=1)
