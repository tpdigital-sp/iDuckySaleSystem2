import sharp from "sharp";
import { readdirSync } from "node:fs";
const dir = ".cache/wobble/upload";
const files = readdirSync(dir).filter(f=>f.startsWith(process.argv[2]||"")).sort();
const S=200, COLS=Math.min(6,files.length), ROWS=Math.ceil(files.length/COLS);
const tiles=[];
for (const [i,f] of files.entries()){
  const img = await sharp(`${dir}/${f}`).resize(S-8,S-30,{fit:"contain",background:"#fff"}).toBuffer();
  const lbl = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="24"><text x="4" y="17" font-family="monospace" font-size="14" fill="#000">${f.replace(".jpg","")}</text></svg>`);
  tiles.push({input: img, left:(i%COLS)*S+4, top: Math.floor(i/COLS)*S+4});
  tiles.push({input: lbl, left:(i%COLS)*S, top: Math.floor(i/COLS)*S+S-24});
}
await sharp({create:{width:S*COLS,height:S*ROWS,channels:3,background:"#ffffff"}}).composite(tiles).jpeg({quality:82}).toFile(".cache/wobble/sheet2.jpg");
console.log(files.length,"files");
