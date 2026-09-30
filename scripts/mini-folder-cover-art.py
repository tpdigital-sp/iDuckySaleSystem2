# ภาพประจำตัวเลือก "แบบปก" ของ MiNi FOLDER (mini-folder) — 30 ก.ย. 69
#   python3 scripts/mini-folder-cover-art.py   (รันในโฟลเดอร์ที่มี size-large-v1.jpg = รูปการ์ดขนาดใหญ่ของสินค้านี้)
#   → cover-clear-v1.jpg (รูปจริงปกใส เดิม) + cover-glitter-v2.jpg (สังเคราะห์: เกล็ดเงินละเอียด+ประกายเล็ก เฉพาะบริเวณปก · v1 หลากสี/หนาเกิน เจ้าของร้านส่งรูปอ้างอิงมาแก้)
#   ร้านยังไม่มีรูปกลิสเตอร์จริง — ได้รูปจริงเมื่อไหร่ให้อัปเป็น v2 แล้วรัน scripts/mini-folder-cover-art.mjs --write ใหม่
#   จากนั้นอัปโหลด+ผูก imageSrc ด้วย node scripts/mini-folder-cover-art.mjs --write
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import random, math
random.seed(7)
base = Image.open("size-large-v1.jpg").convert("RGB")
W,H = base.size

# mask ปกแฟ้ม (rounded rect) + ปิดฝา
mask = Image.new("L",(W,H),0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle((165,38,765,768), radius=34, fill=255)
md.rounded_rectangle((548,338,782,518), radius=40, fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(3))

# v2 (30 ก.ย. 69) — เจ้าของร้านส่งรูปอ้างอิง: กลิสเตอร์ของจริงเป็น "เกล็ดเงินละเอียด" โปรยในพลาสติกใส
# ไม่มีสีรุ้ง ไม่หนา → เอาฟิล์มโฮโลออก ใช้เกล็ดขาว/เงินเม็ดเล็กจำนวนมาก + ประกายเล็ก ๆ ไม่กี่จุด
out = base.copy()
fl = Image.new("RGBA",(W,H),(0,0,0,0))
fd = ImageDraw.Draw(fl)
silver = [(255,255,255),(245,247,250),(228,232,240),(210,216,226),(238,240,236)]
mp = mask.load()
n=0
while n<1500:
    x=random.randint(150,790); y=random.randint(30,780)
    if mp[x,y] < 128: continue
    r = random.choice([1,1.2,1.4,1.6,1.8,2,2,2.2,2.6])
    c = random.choice(silver); a = random.randint(110,255)
    if random.random()<0.4:
        ang=random.random()*math.pi; pts=[(x+r*1.25*math.cos(ang+k*math.pi/3), y+r*1.25*math.sin(ang+k*math.pi/3)) for k in range(6)]
        fd.polygon(pts, fill=c+(a,))
    else:
        fd.ellipse((x-r,y-r,x+r,y+r), fill=c+(a,))
    n+=1
# เม็ดสว่างจัดบางเม็ด (สะท้อนแสง)
for _ in range(30):
    while True:
        x=random.randint(150,790); y=random.randint(30,780)
        if mp[x,y]>=128: break
    r=random.uniform(2.5,3.5)
    fd.ellipse((x-r,y-r,x+r,y+r), fill=(255,255,255,255))
# เงาเทาจาง ๆ ใต้เม็ดใหญ่ ให้เห็นว่าเป็นเกล็ดในเนื้อพลาสติก ไม่ใช่จุดขาวลอย
sh = Image.new("RGBA",(W,H),(0,0,0,0)); sd0=ImageDraw.Draw(sh)
random.seed(11)
for _ in range(200):
    while True:
        x=random.randint(150,790); y=random.randint(30,780)
        if mp[x,y]>=128: break
    r=random.uniform(1,2.2)
    sd0.ellipse((x-r,y-r,x+r,y+r), fill=(120,130,145,random.randint(60,120)))
out.paste(sh,(0,0),sh)
out.paste(fl,(0,0),fl)

# ประกายดาวเล็ก ๆ ไม่กี่จุด (พอให้เห็นว่า "วิบวับ" ตอนย่อ แต่ไม่โดดจากของจริง)
sp = Image.new("RGBA",(W,H),(0,0,0,0)); sd=ImageDraw.Draw(sp)
def star(cx,cy,R,w,a=255,col=(255,255,255)):
    sd.polygon([(cx,cy-R),(cx+w,cy-w),(cx+R,cy),(cx+w,cy+w),(cx,cy+R),(cx-w,cy+w),(cx-R,cy),(cx-w,cy-w)], fill=col+(a,))
    sd.ellipse((cx-w*1.5,cy-w*1.5,cx+w*1.5,cy+w*1.5), fill=col+(a,))
for cx,cy,R,w in [(300,130,16,2),(690,640,14,2),(240,560,11,2)]:
    star(cx,cy,R,w,255)
sp_glow = sp.filter(ImageFilter.GaussianBlur(3))
out.paste(sp_glow,(0,0),sp_glow); out.paste(sp,(0,0),sp)
out.save("cover-glitter-v3.jpg", quality=92)
base.save("cover-clear-v1.jpg", quality=92)

# เทียบตอนย่อ 62px และ 48px
sheet = Image.new("RGB",(900*2+30, 900+140),"white")
sheet.paste(base,(0,0)); sheet.paste(out,(930,0))
for i,im in enumerate([base,out]):
    for j,s in enumerate([62,48]):
        t=im.resize((s,s),Image.LANCZOS).resize((s*2,s*2),Image.NEAREST)
        sheet.paste(t,(i*930+j*140, 910))
sheet.save("compare.png")
