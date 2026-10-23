"""
🧽 ลบลายทแยงแดงออกจากสกินเทมเพลต — วงขอบที่เคยเป็น "ขาวทึบ + ขีดแดง" กลายเป็นโปร่งเหมือนหน้างาน (ลายเต็มถึงเส้นตัด)
(ปลอกคอสัตว์เลี้ยง 23 ต.ค. 69 เจ้าของร้านสั่ง "ไม่ต้องมีเส้นขีดๆสีแดงๆ")
  tools/cutout-py/.venv/bin/python -I scripts/py/skin-clear-red.py <สกินเข้า.png> <สกินออก.png>
① พิกเซลอมแดง (R − max(G,B) > 15) → โปร่ง
② เขตขาว/โปร่งที่ต่อกับหน้างานเดิม (พิกเซล alpha 0 ของสกินเดิม) → โปร่งทั้งเขต · เส้นเทา/ดำ (เส้นตัด เส้นประ) คงไว้
   นอกเส้นตัดเป็นขาวทึบไม่ต่อกับหน้างาน (เส้นตัดทึบกั้น) = คงเดิม
พิมพ์ JSON {"px":[w,h],"redPx","clearedPx","outsideOpaque"} ออก stdout · นอกเส้นตัดโดนล้างด้วย (เส้นตัดรั่ว) = exit 2
"""
import json, sys

import cv2
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert("RGBA")).copy()
r, g, b, al = (a[..., i].astype(int) for i in range(4))
red = (r - np.maximum(g, b) > 15) & (al > 0)
fill = (al == 0) | red | ((np.minimum(np.minimum(r, g), b) > 235) & (al > 0))
n, lab = cv2.connectedComponents(fill.astype(np.uint8), connectivity=4)
face = np.unique(lab[(al == 0) & fill])
face = face[face > 0]
clear = np.isin(lab, face) | red
h, w = al.shape
corners = [clear[2, 2], clear[2, w - 3], clear[h - 3, 2], clear[h - 3, w - 3]]
outside_opaque = sum(1 for c, v in zip(corners, [al[2, 2], al[2, w - 3], al[h - 3, 2], al[h - 3, w - 3]]) if v == 255 and not c)
if any(c and v == 255 for c, v in zip(corners, [al[2, 2], al[2, w - 3], al[h - 3, 2], al[h - 3, w - 3]])):
    print("เขตนอกเส้นตัดโดนล้าง (เส้นตัดรั่ว)", file=sys.stderr)
    sys.exit(2)
a[clear] = [255, 255, 255, 0]
Image.fromarray(a).save(out, optimize=True)
print(json.dumps({"px": [w, h], "redPx": int(red.sum()), "clearedPx": int(clear.sum()), "outsideOpaque": outside_opaque}))
