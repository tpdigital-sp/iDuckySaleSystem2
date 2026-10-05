import numpy as np, json
from PIL import Image, ImageFilter
from scipy import ndimage
src = np.asarray(Image.open("chart.jpg").convert("RGB")).astype(float)
B = json.load(open("boxes.json"))
VARIANTS = {"D":2,"F":4,"J":4,"K":4,"L":4,"M":4,"N":4,"O":4,"R":3,"V":3,"X":2}
TITLE = {k:0.31 for k in "JKLMNO"}; TITLE["P"]=0.30
OUT=800; INSET=8

def clean_box(k, variant=False):
    x0,y0,x1,y1=B[k]; a=src[y0+INSET:y1-INSET, x0+INSET:x1-INSET].copy()
    h,w,_=a.shape
    ring=np.concatenate([a[16:22,40:-40].reshape(-1,3), a[-22:-16,40:-40].reshape(-1,3),
                         a[40:-40,16:22].reshape(-1,3), a[40:-40,-22:-16].reshape(-1,3)])
    lum=ring.mean(1); ring=ring[(lum>np.percentile(lum,30))&(lum<np.percentile(lum,90))]
    bgc=np.median(ring,0)
    d=lambda c: np.abs(a-np.array(c)).sum(2)
    bad=np.zeros((h,w),bool)
    # teal rounded corners: thin edge band + corner squares only
    edge=np.zeros((h,w),bool); edge[:12]=True; edge[-12:]=True; edge[:,:12]=True; edge[:,-12:]=True
    for cy in (0,h-36):
        for cx in (0,w-36): edge[cy:cy+36,cx:cx+36]=True
    bad|=edge&(d([128,198,208])<80)
    # yellow code circle (and its black letters) hanging over the top edge: only the blob touching row 0
    yel=d([248,216,113])<90; yel[90:]=False
    l,n=ndimage.label(ndimage.binary_closing(yel,iterations=3))
    for i,sl in enumerate(ndimage.find_objects(l)):
        if sl[0].start<=3 and (l[sl]==i+1).sum()>30:
            blob=np.zeros((h,w),bool); blob[sl]=l[sl]==i+1
            blob=ndimage.binary_fill_holes(ndimage.binary_closing(blob,iterations=6))
            bad|=ndimage.binary_dilation(blob,iterations=5)
    if k=="F":  # HOT badge corner
        hot=(a[...,0]>170)&(a[...,1]<140); hot[70:]=False; hot[:,70:]=False
        corner=(np.arange(h)[:,None]<80)&(np.arange(w)[None,:]<80)
        bad|=ndimage.binary_dilation(hot,iterations=10)&corner
    if k in TITLE:  # title text: small blobs that stay in the top band
        cm=ndimage.binary_dilation(np.abs(a-bgc).sum(2)>55,iterations=2)
        l,n=ndimage.label(cm)
        for i,sl in enumerate(ndimage.find_objects(l)):
            if sl[0].stop<h*0.40 and sl[0].stop-sl[0].start<60: bad[sl]|=l[sl]==i+1
    if variant and k in ("D","F"):  # size text ("23mm", "12x35mm") straddles two hooks
        dark=a.max(2)<80; dark[:int(h*.78)]=False
        l,n=ndimage.label(ndimage.binary_dilation(dark,iterations=3))
        for i,sl in enumerate(ndimage.find_objects(l)):
            if sl[0].stop-sl[0].start<50 and sl[1].stop-sl[1].start<160: bad[sl]|=l[sl]==i+1
    a[bad]=bgc
    return a,bgc

def content_mask(a,bgc):
    m=np.abs(a-bgc).sum(2)>55
    m=ndimage.binary_opening(m,iterations=1)
    return ndimage.binary_dilation(m,iterations=2)

def square(a,bgc,m,colmask=None,margin=0.12):
    h,w,_=a.shape
    ys,xs=np.where(m)
    cy0,cy1,cx0,cx1=ys.min(),ys.max(),xs.min(),xs.max()
    side=int(max(cy1-cy0,cx1-cx0)*(1+2*margin))
    cx,cy=(cx0+cx1)//2,(cy0+cy1)//2
    canvas=np.empty((side,side,3)); canvas[:]=bgc
    al=np.ones((h,w))
    if colmask is not None: al=al*colmask[None,:]
    f=18
    yy=np.arange(h)[:,None]*np.ones((1,w)); xx=np.ones((h,1))*np.arange(w)[None,:]
    ramp=np.clip(np.minimum.reduce([yy,h-1-yy,xx,w-1-xx])/f,0,1)
    al=al*ramp
    ox,oy=side//2-cx, side//2-cy
    sx0,sy0=max(0,-ox),max(0,-oy); sx1,sy1=min(w,side-ox),min(h,side-oy)
    region=canvas[sy0+oy:sy1+oy, sx0+ox:sx1+ox]
    A=al[sy0:sy1,sx0:sx1,None]
    canvas[sy0+oy:sy1+oy, sx0+ox:sx1+ox]=region*(1-A)+a[sy0:sy1,sx0:sx1]*A
    img=Image.fromarray(np.clip(canvas,0,255).astype(np.uint8))
    img=img.resize((OUT,OUT),Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.6,percent=60,threshold=2))
    return img, side

report=[]
for k in B:
    a,bgc=clean_box(k); m=content_mask(a,bgc)
    img,side=square(a,bgc,m); img.save(f"out/hook-{k}-v2.jpg",quality=90,optimize=True); report.append((k,side))
    if k in VARIANTS:
        n=VARIANTS[k]; a,bgc=clean_box(k,True); m=content_mask(a,bgc); h,w,_=a.shape
        prof=ndimage.uniform_filter1d(m.sum(0).astype(float),9)
        cuts=[0]
        for i in range(1,n):
            c=int(w*i/n); r=int(w/(2.5*n))
            cuts.append(c-r+int(np.argmin(prof[c-r:c+r])))
        cuts.append(w)
        for i in range(n):
            cm=np.zeros(w); cm[cuts[i]:cuts[i+1]]=1
            cm=ndimage.uniform_filter1d(cm,9)
            mm=m*(cm[None,:]>0.5)
            img,side=square(a,bgc,mm,cm,margin=0.10); img.save(f"out/hook-{k}-{i+1}-v2.jpg",quality=90,optimize=True); report.append((f"{k}-{i+1}",side))
print(report)
