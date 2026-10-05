import numpy as np, json
from PIL import Image
from scipy import ndimage
im = np.asarray(Image.open("chart.jpg").convert("RGB")).astype(int)
bg = np.array([184,217,236])
notbg = np.abs(im-bg).sum(2) > 30
notbg[:390]=False; notbg[3870:]=False
notbg = ndimage.binary_opening(notbg, iterations=4)
lab,n = ndimage.label(notbg)
cards=[]
for s in ndimage.find_objects(lab):
    y0,y1,x0,x1=s[0].start,s[0].stop,s[1].start,s[1].stop
    if (x1-x0)>300 and (y1-y0)>350: cards.append((y0,x0,y1,x1))
cards.sort(key=lambda c:(round(c[0]/300),c[1]))
codes=[["Z1","Z2"],["A","B"],["C"],["D"],["E"],["F"],["G"],["H"],["I"],["J"],["K"],["L"],["M"],["N"],["O"],["P"],["Q"],["R"],["S"],["T"],["U"],["V"],["W"],["X"],["AA"],["AB"],["AC"],["BB"],["BC"]]
assert len(cards)==len(codes), len(cards)
teal=np.array([128,198,208])
out={}
for (y0,x0,y1,x1),cs in zip(cards,codes):
    sub=im[y0:y1,x0:x1]
    nt = np.abs(sub-teal).sum(2) > 45
    nt = ndimage.binary_opening(nt, iterations=3)
    l,k = ndimage.label(nt)
    comps=[]
    for i,s in enumerate(ndimage.find_objects(l)):
        h=s[0].stop-s[0].start; w=s[1].stop-s[1].start
        if h>140 and w>140:
            m=(l[s]==i+1)
            rows=m.sum(1); cols=m.sum(0)
            rr=np.where(rows>=0.8*rows.max())[0]
            mm=m[rr[0]:rr[-1]+1]; cols=mm.mean(0); cc=np.where(cols>=0.7)[0]
            comps.append((x0+s[1].start+cc[0], y0+s[0].start+rr[0], x0+s[1].start+cc[-1], y0+s[0].start+rr[-1]))
    # drop white price bar (very bottom, pure white) — keep comps whose mean is not ~255
    comps=[c for c in comps if im[c[1]:c[3],c[0]:c[2]].mean()<245 and 200<c[3]-c[1]<400]
    comps.sort()
    if len(comps)!=len(cs): print("MISMATCH",cs,comps)
    for c,b in zip(cs,comps): out[c]=[int(v) for v in b]
out['F']=[279,1114,779,1369]
json.dump(out,open("boxes.json","w"),indent=0)
for k,v in out.items(): print(k,v,v[2]-v[0],v[3]-v[1])
