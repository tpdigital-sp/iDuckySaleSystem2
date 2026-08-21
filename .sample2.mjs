import sharp from "sharp";
const SP=process.argv[2];
const { data, info } = await sharp(`${SP}/chart.jpg`).raw().toBuffer({ resolveWithObject: true });
const px=(x,y)=>{const i=(y*info.width+x)*info.channels;return [data[i],data[i+1],data[i+2]];};
const centers={H01:[144,528],H02:[384,600],H03:[398,84],H04:[384,360],H05:[672,192],H06:[676,512],H07:[144,200]};
const out={};
for(const [k,[cx,cy]] of Object.entries(centers)){
  const pts=[];
  for(let dy=24;dy<=40;dy+=3) for(let dx=-26;dx<=26;dx+=3) pts.push(px(cx+dx,cy+dy));
  const med=(i)=>{const a=pts.map(p=>p[i]).sort((x,y)=>x-y);return a[Math.floor(a.length/2)];};
  const c=[med(0),med(1),med(2)];
  out[k]=`#${c.map(v=>v.toString(16).padStart(2,"0")).join("")}`;
  console.log(k, out[k]);
}
// swatch strip to eyeball
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${7*160}" height="160">${Object.entries(out).map(([k,c],i)=>`<rect x="${i*160}" y="0" width="160" height="160" fill="${c}"/><text x="${i*160+80}" y="150" font-size="20" text-anchor="middle" fill="#888">${k} ${c}</text>`).join("")}</svg>`;
await sharp(Buffer.from(svg)).jpeg().toFile(`${SP}/swatch.jpg`);
