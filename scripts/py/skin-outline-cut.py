"""✂️ เส้นตัด = "ขอบนอกสุด" ของชิ้นงานที่วาดด้วยเส้นแดงในสกิน PNG (ส่งออก 300 dpi) → JSON TemplateCurve (มม. · y ลง)
ใช้เมื่อไฟล์ .ai ไม่มีเวกเตอร์ขอบนอก/มี PDF เก่าฝัง (Candy bag 22 ต.ค. 69 "สกรีนได้เต็มชิ้นงาน" — ขอบหยัก + หัวถุง)
วิธี: พิกเซลแดง = กำแพง → ท่วมจากขอบภาพ = นอกชิ้นงาน → ที่เหลือ = ชิ้นงาน (รวมเส้นแดง) → contour นอกสุด → approxPolyDP (เส้นตรงล้วน มุมหยักคม)
argv: <skin.png> [--window] [--min-y-mm <มม.>] [--px-per-mm 11.811] [--eps-mm 0.12] → stdout {"w","h","curves":[วงนอก],"box":[x,y,w,h],"points":n}"""
import json, sys
import cv2
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
arg = lambda k, d: float(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
S = arg("--px-per-mm", 300 / 25.4)
EPS = arg("--eps-mm", 0.12)
im = np.array(Image.open(sys.argv[1]).convert("RGBA"))
h, w = im.shape[:2]


def emit(c, note=""):
    poly = cv2.approxPolyDP(c, EPS * S, True)[:, 0, :]
    pts = [[round(float(x) / S, 3), round(float(y) / S, 3)] for x, y in poly]
    g = []
    for i in range(len(pts)):
        A, B = pts[i], pts[(i + 1) % len(pts)]
        g.append([round(A[0] + (B[0] - A[0]) / 3, 3), round(A[1] + (B[1] - A[1]) / 3, 3), round(A[0] + 2 * (B[0] - A[0]) / 3, 3), round(A[1] + 2 * (B[1] - A[1]) / 3, 3), B[0], B[1]])
    x, y, bw, bh = cv2.boundingRect(c)
    print(json.dumps({"w": round(w / S, 2), "h": round(h / S, 2), "curves": [{"s": pts[0], "g": g}], "box": [round(x / S, 2), round(y / S, 2), round(bw / S, 2), round(bh / S, 2)], "points": len(pts)}))
    sys.exit(0)


# --window: ชิ้นงานพิมพ์ได้เฉพาะ "ช่องโปร่ง" กลางสกิน (กระเป๋าโฮโลแกรม ZipLock: กรอบโฮโลทึบ + ช่องกลางโปร่ง · 22 ต.ค. 69
#   เจ้าของร้าน "ถ้าภาพวางเกินตรงกรอบ ให้ตัดทึบไปเลย") → เขตโปร่ง (alpha < 30) ที่ต่อกับจุดกลางภาพ = เส้นตัด
if "--window" in sys.argv:
    clear = (im[..., 3] < 30).astype(np.uint8)
    n, lab = cv2.connectedComponents(clear, connectivity=4)
    k = lab[h // 2, w // 2]
    if k == 0:
        print(json.dumps({"error": "กลางสกินไม่โปร่ง — ไม่มีช่องให้พิมพ์"}))
        sys.exit(0)
    region = (lab == k).astype(np.uint8) * 255
    cnts, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    emit(max(cnts, key=cv2.contourArea))
r, g, b, a = [im[..., i].astype(int) for i in range(4)]
# แดง = แดงเด่นกว่าเขียว/น้ำเงิน ≥ 60 — เส้นที่มีแผ่นเทาโปร่งทับ (หัวถุง Candy bag มุมขวาบน) สีผสมเป็น 235,144,116 เกณฑ์ g<140 เดิมหลุด น้ำท่วมเข้าหัวถุง
wall = ((a > 100) & (r > 170) & (r - g > 60) & (r - b > 60)).astype(np.uint8)
wall = cv2.dilate(wall, np.ones((3, 3), np.uint8))  # ปิดรูเล็ก ๆ ในเส้นแอนตี้เอเลียส ไม่ให้น้ำท่วมทะลุ
# ท่วมจากขอบภาพ (เติมกรอบ 1 px รอบภาพให้น้ำวิ่งรอบได้)
pad = np.pad(1 - wall, 1, constant_values=1).astype(np.uint8)
mask = np.zeros((h + 4, w + 4), np.uint8)
cv2.floodFill(pad, mask, (0, 0), 2)
outside = (pad[1:-1, 1:-1] == 2)
piece = (~outside).astype(np.uint8) * 255
# --min-y-mm: ตัดส่วนบนที่สกรีนไม่ได้ออก (Candy bag: หัวถุง + แถบซิปขาว ลายทแยง 6–18.1 มม. · เจ้าของร้าน 22 ต.ค. 69 "สกรีนไม่ได้ เป็นซิปขาว")
if "--min-y-mm" in sys.argv:
    piece[: int(round(arg("--min-y-mm", 0) * S)), :] = 0
cnts, _ = cv2.findContours(piece, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
if not cnts:
    print(json.dumps({"error": "ไม่เจอชิ้นงานในสกิน"}))
    sys.exit(0)
c = max(cnts, key=cv2.contourArea)
# เส้นแดงหนา ~3 px: contour นอกสุดอยู่ขอบนอกเส้น → หดเข้าครึ่งความหนาเส้นให้อยู่กลางเส้น
piece2 = np.zeros_like(piece)
cv2.drawContours(piece2, [c], -1, 255, -1)
piece2 = cv2.erode(piece2, np.ones((3, 3), np.uint8))
cnts2, _ = cv2.findContours(piece2, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
c = max(cnts2, key=cv2.contourArea)
poly = cv2.approxPolyDP(c, EPS * S, True)[:, 0, :]
pts = [[round(float(x) / S, 3), round(float(y) / S, 3)] for x, y in poly]
g = []
for i in range(len(pts)):
    A, B = pts[i], pts[(i + 1) % len(pts)]
    g.append([round(A[0] + (B[0] - A[0]) / 3, 3), round(A[1] + (B[1] - A[1]) / 3, 3), round(A[0] + 2 * (B[0] - A[0]) / 3, 3), round(A[1] + 2 * (B[1] - A[1]) / 3, 3), B[0], B[1]])
x, y, bw, bh = cv2.boundingRect(c)
print(json.dumps({"w": round(w / S, 2), "h": round(h / S, 2), "curves": [{"s": pts[0], "g": g}], "box": [round(x / S, 2), round(y / S, 2), round(bw / S, 2), round(bh / S, 2)], "points": len(pts)}))
