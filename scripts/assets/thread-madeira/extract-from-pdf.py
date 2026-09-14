#!/usr/bin/env python3
"""
🧵 ครอปสวอตช์สีไหมจากชาร์ตจริงของ Madeira → scripts/assets/thread-madeira/<เบอร์>.jpg (440×120)

    python3 scripts/assets/thread-madeira/extract-from-pdf.py

ต้นฉบับอยู่บนไดรฟ์ร้าน (ต้อง mount):
  /Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานปัก/01_อาร์ม/MADEIRA_POLYNEON.pdf

วิธีทำ: อ่านตำแหน่งตัวเลขเบอร์ในไฟล์ PDF → หาแถบรูปไหมที่อยู่แถวเดียวกัน → ครอปเฉพาะเนื้อไหม
  · ตัดขอบขาวซ้าย/ขวาของรูปถ่าย (บางหน้ามีจุดสี No.60/No.75 ทับขอบซ้าย)
  · เลื่อน/ย่อกรอบอัตโนมัติจนสีในกรอบสม่ำเสมอ — กันครอปคร่อมเส้นคั่นระหว่างแถบ
ต้องมี: pip install pymupdf pillow numpy
เบอร์ที่ครอป = ไฟล์ codes.txt ข้าง ๆ (เบอร์ที่ร้านมีขาย 129 เบอร์)
"""
import fitz, re, json, os, numpy as np
from PIL import Image
DPI=600; S=DPI/72
W,H=880,240   # ขนาดไฟล์สวอตช์ที่ได้ (คมทุกขนาด เพราะวาดใหม่ ไม่ได้ขยายรูปครอป)
AMP=0.055     # ความแรงลายเนื้อไหม (วัดจากสวอตช์ชุดเก่าได้ ~5% ของความสว่าง)
HERE=os.path.dirname(os.path.abspath(__file__))
# ลายเนื้อไหม: ภาพเทา 880×240 (mean 128 · σ 40) ผสมจาก high-pass ของสวอตช์ชุดเก่า code-1866.jpg
# (ลายทแยง ~21° คาบ ~16 px) + ลายสังเคราะห์ให้คมขึ้น — ถ้าลบไฟล์นี้ทิ้ง จะได้สวอตช์สีเรียบไม่มีลาย
_TEXF=os.path.join(HERE,'_texture.png')
TEX=None
PDF=os.environ.get('MADEIRA_PDF', '/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานปัก/01_อาร์ม/MADEIRA_POLYNEON.pdf')
if not os.path.exists(PDF): raise SystemExit('✗ ไม่เจอ ' + PDF + ' — ต้อง mount ไดรฟ์ร้านก่อน')
d=fitz.open(PDF)
if os.path.exists(_TEXF):
    _t=np.asarray(Image.open(_TEXF).convert('L')).astype(float)
    TEX=(_t-_t.mean())/(_t.std() or 1)
    if TEX.shape!=(H,W): raise SystemExit('✗ _texture.png ต้องเป็น %d×%d' % (W,H))
want=set(open(os.path.join(HERE,'codes.txt')).read().split())

out={}; bad=[]
for pi in range(11):
    p=d[pi]
    spans=[]
    for b in p.get_text('dict')['blocks']:
        for l in b.get('lines',[]):
            for s in l['spans']:
                t=s['text'].strip()
                if re.fullmatch(r'\d{4}',t) and 8.5<s['size']<10.5: spans.append((t,s['bbox']))
    if not spans: continue
    strips=sorted(set((round(r.x0,2),round(r.y0,2),round(r.x1,2),round(r.y1,2))
        for r in [p.get_image_bbox(x,transform=False) for x in p.get_images(full=True)]
        if r.width>20 and r.height>10))
    pix=p.get_pixmap(dpi=DPI)
    arr=np.frombuffer(pix.samples,dtype=np.uint8).reshape(pix.height,pix.width,pix.n)[:,:,:3].astype(int)
    cols={}
    for st in strips:                                  # content columns of each strip
        a=arr[int(st[1]*S)+2:int(st[3]*S)-2, int(st[0]*S):int(st[2]*S)]
        white=(a>238).all(axis=2).mean(axis=0)
        ok=np.where(white<0.6)[0]
        if len(ok)<10: cols[st]=None; continue
        # largest contiguous run
        runs=np.split(ok, np.where(np.diff(ok)>1)[0]+1)
        r=max(runs,key=len)
        pad=max(2,int(0.04*len(r)))
        cols[st]=(int(st[0]*S)+r[0]+pad, int(st[0]*S)+r[-1]-pad)
    for code,bb in spans:
        if code not in want or code in out: continue
        cy=(bb[1]+bb[3])/2
        cand=[s for s in strips if s[2]>bb[2] and s[1]-1<=cy<=s[3]+1 and cols[s]]
        if not cand: continue
        st=min(cand,key=lambda s:s[0]); x0,x1=cols[st]
        lo,hi=int(st[1]*S), int(st[3]*S)
        pick=None
        for hpt in (12,11,10,9,8,7,6,5):
            h=int(hpt*S); best=None
            for dy in range(-int(9*S), int(9*S)+1, 3):
                y=int((cy-hpt/2)*S)+dy
                if y<lo or y+h>hi: continue
                c=arr[y:y+h, x0:x1]
                med=np.median(c.reshape(-1,3),axis=0)
                sc=float(np.abs(c.mean(axis=1)-med).max())+0.4*abs(dy)/S
                if best is None or sc<best[0]: best=(sc,y,h)
            if best and best[0]<=22: pick=(best,hpt); break
            if best and (pick is None or best[0]<pick[0][0]): pick=(best,hpt)
        if not pick: continue
        (sc,y,h),hpt=pick
        crop=arr[y:y+h, x0:x1].astype(np.uint8)
        med=np.median(crop.reshape(-1,3),axis=0)
        if sc>25: bad.append((code,pi,round(sc),hpt))
        out[code]={'page':pi,'hex':'#%02X%02X%02X'%tuple(med.astype(int)),'dev':round(sc),'hpt':hpt}
        # 🪄 วาดใหม่เป็นแถบไล่เฉดเรียบ ๆ แทนการขยายรูปครอป (ต้นฉบับในไฟล์ PDF มีแค่ ~116×33 px ต่อสี
        #    ขยายเป็น 440 px แล้วเห็นเป็นตารางหยาบ ๆ) — เก็บ "แสงเงาบนเส้นไหม" ไว้ด้วยการเฉลี่ยสีทีละแถว
        prof = crop.astype(float).mean(axis=1)
        k = max(3, int(len(prof) * 0.12)) // 2 * 2 + 1
        ker = np.ones(k) / k
        prof = np.stack([np.convolve(np.pad(prof[:, c], (k // 2, k // 2), mode="edge"), ker, mode="valid")[: len(prof)]
                         for c in range(3)], axis=1)
        cut = max(1, int(len(prof) * 0.06))           # ตัดหัว-ท้ายกันเงาเส้นคั่นติดมา
        prof = prof[cut : len(prof) - cut]
        grad = np.stack([np.interp(np.linspace(0, len(prof) - 1, H), np.arange(len(prof)), prof[:, c])
                         for c in range(3)], axis=1)
        img = np.repeat(grad[:, None, :], W, axis=1)
        if TEX is not None:
            # 🧵 ลายเนื้อไหมเฉียง ๆ แบบเดียวกับสวอตช์ชุดเก่า — ทาทับทุกเบอร์ให้เหมือนกัน
            #    สีเฉลี่ยไม่เปลี่ยน (ลายมีค่าเฉลี่ยเป็นศูนย์) · สีเข้มให้ลายอ่อนลงตามจริง
            lum = grad.mean(axis=1)
            scale = (0.35 + 0.65 * lum / 255.0) * 255.0 * AMP
            img = img + TEX[:, :, None] * scale[:, None, None]
        img = np.clip(img, 0, 255).astype(np.uint8)
        Image.fromarray(img).save(os.path.join(HERE, f'{code}.jpg'), quality=95, subsampling=0)
print(len(out),'extracted; missing:',sorted(want-set(out)))
print('suspect:',bad)
json.dump(out,open(os.path.join(HERE,'index.json'),'w'),indent=1)
