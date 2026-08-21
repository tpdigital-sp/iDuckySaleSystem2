import sharp from "sharp";
const SP=process.argv[2];
const centers={H01:[144,528],H02:[384,600],H03:[398,84],H04:[384,360],H05:[672,192],H06:[676,512],H07:[144,200]};
const tiles=[];
for(const [k,[cx,cy]] of Object.entries(centers)){
  const left=Math.max(0,cx-110), top=Math.max(0,cy-100);
  const w=Math.min(220,800-left), h=Math.min(300,800-top);
  const buf=await sharp(`${SP}/chart.jpg`).extract({left,top,width:w,height:h}).resize(220,300,{fit:"contain",background:"#fff"}).png().toBuffer();
  tiles.push({input:buf,left:tiles.length*220,top:0});
}
await sharp({create:{width:220*7,height:300,channels:3,background:"#fff"}}).composite(tiles).jpeg({quality:92}).toFile(`${SP}/sheet.jpg`);
console.log("ok");
