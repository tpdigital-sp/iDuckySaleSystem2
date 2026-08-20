import sharp from "sharp";
import { readdirSync } from "node:fs";
const files = Array.from({length:11},(_,i)=>`.cache/wobble/g${i+1}.jpg`);
const S=300, COLS=4, ROWS=3;
const tiles = await Promise.all(files.map(async (f,i)=>({
  input: await sharp(f).resize(S,S,{fit:"contain",background:"#fff"}).jpeg().toBuffer(),
  left: (i%COLS)*S, top: Math.floor(i/COLS)*S
})));
await sharp({create:{width:S*COLS,height:S*ROWS,channels:3,background:"#ffffff"}}).composite(tiles).jpeg({quality:82}).toFile(".cache/wobble/sheet.jpg");
console.log("ok");
