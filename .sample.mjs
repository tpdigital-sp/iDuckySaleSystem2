import sharp from "sharp";
const SP=process.argv[2];
const img = sharp(`${SP}/chart.jpg`);
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const px=(x,y)=>{const i=(y*info.width+x)*info.channels;return [data[i],data[i+1],data[i+2]];};
const centers={H07:[144,200],H03:[398,84],H05:[672,192],H04:[384,360],H01:[144,528],H02:[384,600],H06:[676,512]};
for(const [k,[cx,cy]] of Object.entries(centers)){
  // sample a ring above the text label
  const pts=[];
  for(let dy=-46;dy<=-24;dy+=4) for(let dx=-24;dx<=24;dx+=4) pts.push(px(cx+dx,cy+dy));
  const med=(i)=>{const a=pts.map(p=>p[i]).sort((x,y)=>x-y);return a[Math.floor(a.length/2)];};
  const [r,g,b]=[med(0),med(1),med(2)];
  console.log(k, `#${[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("")}`, r,g,b);
}
