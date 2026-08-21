import sharp from "sharp";
const SP=process.argv[2];
const centers={H01:[144,528],H02:[384,600],H03:[398,84],H04:[384,360],H05:[672,192],H06:[676,512],H07:[144,200]};
const tiles=[];let i=0;
for(const [k,[cx,cy]] of Object.entries(centers)){
  const buf=await sharp(`${SP}/chart.jpg`).extract({left:cx-72,top:cy-72,width:144,height:232}).resize(190,306).png().toBuffer();
  tiles.push({input:buf,left:(i++)*190,top:0});
}
await sharp({create:{width:190*7,height:306,channels:3,background:"#fff"}}).composite(tiles).jpeg({quality:92}).toFile(`${SP}/sheet2.jpg`);
console.log("ok");
