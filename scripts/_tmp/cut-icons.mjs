import sharp from "sharp";
import fs from "node:fs";
const SRC = process.argv[2], OUTDIR = process.argv[3], SHEET = process.argv[4];
const IDS = ["acrylic","standee","phone-gadget","cat-mssijpgu","sticker-paper","banner","cat-mt2bpoyj","fabric","gifts","cat-msrdpxqn","apparel","bag","cat-mssnwupp"];
const PER_ROW = [5,5,3];
const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, N = W*H;
const R = i => data[i*3], G = i => data[i*3+1], B = i => data[i*3+2];
// พิกเซล "หน้าตาเหมือนพื้นตาราง": เทากลาง ๆ ไม่มีสี
const bgLike = new Uint8Array(N);
for (let i=0;i<N;i++){ const r=R(i),g=G(i),b=B(i); const mx=Math.max(r,g,b),mn=Math.min(r,g,b); const v=(r+g+b)/3;
  if (mx-mn<=16 && v>=118 && v<=218) bgLike[i]=1; }
// flood fill จากขอบภาพ
const bg = new Uint8Array(N); const stack=[];
const push=(x,y)=>{ if(x<0||y<0||x>=W||y>=H) return; const i=y*W+x; if(bg[i]||!bgLike[i]) return; bg[i]=1; stack.push(i); };
for (let x=0;x<W;x++){ push(x,0); push(x,H-1);} for (let y=0;y<H;y++){ push(0,y); push(W-1,y);} 
while(stack.length){ const i=stack.pop(); const x=i%W,y=(i-x)/W; push(x+1,y);push(x-1,y);push(x,y+1);push(x,y-1); }
// เกาะพื้นตารางที่ถูกไอคอนล้อมไว้ (ระหว่างหูกระเป๋า/ในวงปลอกคอ/ห่วงสายคล้อง) flood fill จากขอบเข้าไม่ถึง
// → ก้อน bgLike ที่ใหญ่พอ (≥120 px) และมีทั้งเทาอ่อน+เทาเข้มปนกัน (= ลายตารางจริง ไม่ใช่เงาเทาเรียบของไอคอน) ถือเป็นพื้นด้วย
{ const seen=new Uint8Array(N); for(let s=0;s<N;s++){ if(!bgLike[s]||bg[s]||seen[s]) continue; const comp=[s]; seen[s]=1; let light=0,dark=0;
    for(let k=0;k<comp.length;k++){ const i=comp[k]; const v=(R(i)+G(i)+B(i))/3; if(v>170) light++; else if(v<160) dark++; const x=i%W,y=(i-x)/W;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue; const j=ny*W+nx; if(bgLike[j]&&!bg[j]&&!seen[j]){seen[j]=1;comp.push(j);} } }
    const n=comp.length; if(n>=120 && light/n>0.2 && dark/n>0.2) for(const i of comp) bg[i]=1; } }
// รูปเทากลางที่หลงเป็น fg เล็ก ๆ ในทะเล bg (noise) → ลบ fg ที่ไม่ติดกับก้อนใหญ่ โดยตัดก้อนเล็ก < 60 px
const fg = new Uint8Array(N); for(let i=0;i<N;i++) fg[i]=bg[i]?0:1;
{ const seen=new Uint8Array(N); for(let s=0;s<N;s++){ if(!fg[s]||seen[s]) continue; const comp=[s]; seen[s]=1; for(let k=0;k<comp.length;k++){ const i=comp[k]; const x=i%W,y=(i-x)/W; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue; const j=ny*W+nx; if(fg[j]&&!seen[j]){seen[j]=1;comp.push(j);} } } if(comp.length<60) for(const i of comp) fg[i]=0; } }
// แถว: projection แนวนอน
const rowHas = new Uint8Array(H); for(let y=0;y<H;y++){ for(let x=0;x<W;x++) if(fg[y*W+x]){rowHas[y]=1;break;} }
const bands=[]; let y0=-1; for(let y=0;y<=H;y++){ const on=y<H&&rowHas[y]; if(on&&y0<0) y0=y; if(!on&&y0>=0){ if(y-y0>40) bands.push([y0,y]); y0=-1; } }
// รวมแถบที่ห่างกันน้อย (ชิ้นเดียวกันขาดเป็นสองท่อน)
const rows=[]; for(const b of bands){ const last=rows[rows.length-1]; if(last && b[0]-last[1]<10) last[1]=b[1]; else rows.push([...b]); }
if(rows.length!==3) { console.error("rows", rows); throw new Error("expected 3 rows"); }
const items=[]; 
rows.forEach(([ya,yb],ri)=>{ const colHas=new Uint8Array(W); for(let x=0;x<W;x++){ for(let y=ya;y<yb;y++) if(fg[y*W+x]){colHas[x]=1;break;} }
  const segs=[]; let x0=-1; for(let x=0;x<=W;x++){ const on=x<W&&colHas[x]; if(on&&x0<0) x0=x; if(!on&&x0>=0){ segs.push([x0,x]); x0=-1; } }
  // ต้องได้ PER_ROW ชิ้น: รวม segment ที่ช่องว่างแคบสุดเข้าด้วยกันจนเหลือครบ
  while(segs.length>PER_ROW[ri]){ let bi=0,bg_=1e9; for(let i=0;i<segs.length-1;i++){ const gap=segs[i+1][0]-segs[i][1]; if(gap<bg_){bg_=gap;bi=i;} } segs[bi][1]=segs[bi+1][1]; segs.splice(bi+1,1); }
  if(segs.length!==PER_ROW[ri]) throw new Error("row "+ri+" segs "+segs.length);
  for(const [xa,xb] of segs){ // bbox แน่น ๆ ในช่องนี้
    let minY=H,maxY=0; for(let y=ya;y<yb;y++) for(let x=xa;x<xb;x++) if(fg[y*W+x]){ if(y<minY)minY=y; if(y>maxY)maxY=y; }
    items.push({x0:xa,x1:xb,y0:minY,y1:maxY+1}); }
});
if(items.length!==IDS.length) throw new Error("items "+items.length);
// สร้าง RGBA: alpha จาก fg + ขอบนุ่ม 1px + ล้างสีเทาที่ปนตรงขอบ (ยืมสีจากพิกเซลด้านใน)
const rgba = Buffer.alloc(N*4);
const interior = new Uint8Array(N);
for(let i=0;i<N;i++){ if(!fg[i]) continue; const x=i%W,y=(i-x)/W; let ok=1; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H||!fg[ny*W+nx]){ok=0;break;} } interior[i]=ok; }
for(let i=0;i<N;i++){ const x=i%W,y=(i-x)/W; let r=R(i),g=G(i),b=B(i);
  if(fg[i]&&!interior[i]){ let sr=0,sg=0,sb=0,c=0; for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){ const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue; const j=ny*W+nx; if(interior[j]){sr+=R(j);sg+=G(j);sb+=B(j);c++;} } if(c){r=sr/c|0;g=sg/c|0;b=sb/c|0;} }
  rgba[i*4]=r;rgba[i*4+1]=g;rgba[i*4+2]=b;rgba[i*4+3]=fg[i]?255:0; }
// alpha blur เบา ๆ ให้ขอบไม่หยัก
// ⚠️ sharp คืน raw หลัง blur เป็น 3 ช่องแม้ input 1 ช่อง — ต้องอ่านตาม channels จริง
const bl = await sharp(Buffer.from(Array.from({length:N},(_,i)=>rgba[i*4+3])),{raw:{width:W,height:H,channels:1}}).blur(0.6).raw().toBuffer({resolveWithObject:true});
const ch = bl.info.channels; for(let i=0;i<N;i++) rgba[i*4+3]=bl.data[i*ch];
const full = sharp(rgba,{raw:{width:W,height:H,channels:4}}).png();
const fullBuf = await full.toBuffer();
fs.mkdirSync(OUTDIR,{recursive:true});
const SIZE=320, tiles=[];
for(let k=0;k<items.length;k++){ const it=items[k]; const w=it.x1-it.x0,h=it.y1-it.y0; const side=Math.ceil(Math.max(w,h)*1.08); const cx=(it.x0+it.x1)/2, cy=(it.y0+it.y1)/2;
  const left=Math.max(0,Math.round(cx-side/2)), top=Math.max(0,Math.round(cy-side/2)); const cw=Math.min(side,W-left), ch=Math.min(side,H-top);
  const buf = await sharp(fullBuf).extract({left,top,width:cw,height:ch}).resize(SIZE,SIZE,{fit:"contain",background:{r:0,g:0,b:0,alpha:0}}).webp({quality:92,alphaQuality:95}).toBuffer();
  const file=`${OUTDIR}/cat-ico2-${String(k+1).padStart(2,"0")}.webp`; fs.writeFileSync(file,buf); tiles.push(buf);
  console.log(IDS[k], `${w}x${h}`, file.split("/").pop()); }
// contact sheet บนพื้นขาว+ฟ้าอ่อน ไว้ตรวจขอบ
const T=150; const comp=tiles.map((b,i)=>({input:b,left:(i%7)*T+10,top:Math.floor(i/7)*T+10}));
const resized = await Promise.all(tiles.map(b=>sharp(b).resize(T-20,T-20).png().toBuffer()));
await sharp({create:{width:7*T+20,height:2*T+20,channels:3,background:"#E2F3FE"}}).composite(resized.map((b,i)=>({input:b,left:(i%7)*T+20,top:Math.floor(i/7)*T+20}))).png().toFile(SHEET);
console.log("sheet", SHEET);
