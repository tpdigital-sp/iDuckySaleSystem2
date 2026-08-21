import { readdirSync } from "node:fs";
import sharp from "sharp";
const DIR="/private/tmp/claude-501/-Users-iduckshop-Desktop-iDuckySaleSystem2/2c5afb1d-eac4-4239-8f95-3027bb2af6cc/scratchpad/pics";
const files=readdirSync(DIR).filter(f=>f.endsWith(".jpg")).sort((a,b)=>+a.split("-")[0]-+b.split("-")[0]);
const S=300,COLS=6,ROWS=Math.ceil(files.length/COLS),PAD=26;
const comps=[];
for(let i=0;i<files.length;i++){
  const x=(i%COLS)*S, y=Math.floor(i/COLS)*(S+PAD)+PAD;
  comps.push({input:await sharp(`${DIR}/${files[i]}`).resize(S,S,{fit:"cover"}).toBuffer(),left:x,top:y});
  comps.push({input:Buffer.from(`<svg width="${S}" height="${PAD}"><rect width="${S}" height="${PAD}" fill="#fff"/><text x="6" y="19" font-size="16" font-family="sans-serif" fill="#000">${files[i].replace(".jpg","")}</text></svg>`),left:x,top:y-PAD});
}
await sharp({create:{width:COLS*S,height:ROWS*(S+PAD)+PAD,channels:3,background:"#ffffff"}}).composite(comps).jpeg({quality:82}).toFile(`${DIR}/sheet.jpg`);
console.log("sheet ok", files.length);
