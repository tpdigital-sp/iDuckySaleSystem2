/**
 * 📏 เทสตัวอ่านขนาดไฟล์งาน — npx tsx --tsconfig tsconfig.json scripts/design-file-size-test.mts [ไฟล์จริง...]
 *
 * ไม่ส่งไฟล์ = สร้างไฟล์สังเคราะห์ (.psd/.psb/.eps/.ai) ในโฟลเดอร์ชั่วคราวแล้วเทียบกับขนาดที่รู้
 * ส่งไฟล์จริงของร้านมา = พิมพ์ผลอ่านทีละไฟล์ (ไว้วัดว่าอ่านงานจริงได้กี่ %)
 */
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { fromBuffer, readDesignInfo, setPdfjs, sizeText } from "../src/lib/design-file-size";

setPdfjs(pdfjs);
const PT = 72 / 25.4;

/* ── สร้างไฟล์ทดสอบ ── */
/** alpha = สี่เหลี่ยมทึบ (px) บนผืนโปร่ง → ไฟล์ 4 ช่อง RGB+A พร้อมภาพรวม raw หรือ RLE */
function makePsd(w: number, h: number, dpi: number | null, psb = false, alpha?: { x: number; y: number; w: number; h: number; rle?: boolean }, cmyk = false): Uint8Array {
  const header = new Uint8Array(26);
  const dv = new DataView(header.buffer);
  header.set([0x38, 0x42, 0x50, 0x53]); // 8BPS
  dv.setUint16(4, psb ? 2 : 1);
  const baseCh = cmyk ? 4 : 3;
  dv.setUint16(12, alpha ? baseCh + 1 : baseCh);
  dv.setUint32(14, h);
  dv.setUint32(18, w);
  dv.setUint16(22, 8);
  dv.setUint16(24, cmyk ? 4 : 3);
  const colorMode = new Uint8Array(4); // len 0
  const blocks: Uint8Array[] = [];
  // resource แปลกปลอมมาก่อน (ชื่อ pascal ยาวคี่) ให้ตัวเดินบล็อกต้องข้ามให้ถูก
  blocks.push(resBlock(1010, "abc", new Uint8Array([1, 2, 3])));
  if (dpi !== null) {
    const d = new Uint8Array(16);
    const v = new DataView(d.buffer);
    v.setUint32(0, Math.round(dpi * 65536));
    v.setUint16(4, 1);
    v.setUint16(6, 1);
    v.setUint32(8, Math.round(dpi * 65536));
    v.setUint16(12, 1);
    v.setUint16(14, 1);
    blocks.push(resBlock(1005, "", d));
  }
  const resLen = blocks.reduce((n, b) => n + b.length, 0);
  const resHead = new Uint8Array(4);
  new DataView(resHead.buffer).setUint32(0, resLen);
  const layerLen = new Uint8Array(psb ? 8 : 4); // layer & mask section ว่าง
  if (!alpha) return concat([header, colorMode, resHead, ...blocks, layerLen, new Uint8Array(2)]);
  // ภาพรวม 4 ระนาบ: RGB ทึบ + อัลฟาเป็นสี่เหลี่ยม
  const plane = w * h;
  const a = new Uint8Array(plane);
  for (let y = alpha.y; y < alpha.y + alpha.h; y++) a.fill(255, y * w + alpha.x, y * w + alpha.x + alpha.w);
  const rgb = new Uint8Array(plane).fill(200);
  const planes = cmyk ? [rgb, rgb, rgb, rgb, a] : [rgb, rgb, rgb, a];
  const comp = new Uint8Array(2);
  if (!alpha.rle) return concat([header, colorMode, resHead, ...blocks, layerLen, comp, ...planes]);
  comp[1] = 1;
  const rows: Uint8Array[] = [];
  const counts: number[] = [];
  for (const ch of planes) {
    for (let y = 0; y < h; y++) {
      const packed = packBits(ch.subarray(y * w, (y + 1) * w));
      rows.push(packed);
      counts.push(packed.length);
    }
  }
  const table = new Uint8Array(counts.length * (psb ? 4 : 2));
  const tv = new DataView(table.buffer);
  counts.forEach((c, i) => (psb ? tv.setUint32(i * 4, c) : tv.setUint16(i * 2, c)));
  return concat([header, colorMode, resHead, ...blocks, layerLen, comp, table, ...rows]);
}
/** PackBits แบบง่าย: run ซ้ำ ≥3 → replicate · ที่เหลือ literal */
function packBits(row: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < row.length) {
    let run = 1;
    while (i + run < row.length && row[i + run] === row[i] && run < 128) run++;
    if (run >= 3) {
      out.push(257 - run, row[i]);
      i += run;
      continue;
    }
    let lit = i;
    while (lit < row.length && lit - i < 128 && !(lit + 2 < row.length && row[lit] === row[lit + 1] && row[lit] === row[lit + 2])) lit++;
    out.push(lit - i - 1, ...row.subarray(i, lit));
    i = lit;
  }
  return new Uint8Array(out);
}
function resBlock(id: number, name: string, data: Uint8Array): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const nameField = new Uint8Array(1 + nameBytes.length + ((1 + nameBytes.length) % 2));
  nameField[0] = nameBytes.length;
  nameField.set(nameBytes, 1);
  const head = new Uint8Array(6);
  head.set([0x38, 0x42, 0x49, 0x4d]); // 8BIM
  new DataView(head.buffer).setUint16(4, id);
  const size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, data.length);
  const pad = new Uint8Array(data.length % 2);
  return concat([head, nameField, size, data, pad]);
}
function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
async function makeAi(sizesMm: [number, number][], bleedMm = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const [w, h] of sizesMm) {
    const page = doc.addPage([(w + bleedMm * 2) * PT, (h + bleedMm * 2) * PT]);
    if (bleedMm) page.setTrimBox(bleedMm * PT, bleedMm * PT, w * PT, h * PT);
  }
  return doc.save({ useObjectStreams: false });
}
async function makeAiNoCompat(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.drawText("This is an Adobe Illustrator file that was saved without PDF Content.", { x: 40, y: 700, size: 12 });
  return doc.save({ useObjectStreams: false });
}
const makeEps = (w: number, h: number) =>
  new TextEncoder().encode(`%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 ${Math.round(w * PT)} ${Math.round(h * PT)}\n%%HiResBoundingBox: 0 0 ${w * PT} ${h * PT}\n%%EndComments\n`);

/* ── รัน ── */
let fail = 0;
async function check(name: string, bytes: Uint8Array, expect: string) {
  const info = await readDesignInfo(name, fromBuffer(bytes));
  const got = sizeText(info);
  const ok = got === expect;
  if (!ok) fail++;
  console.log(`${ok ? "✅" : "❌"} ${name.padEnd(22)} ${got}${ok ? "" : `   (คาด: ${expect})`}${info.note ? `\n     ↳ ${info.note}` : ""}`);
}

async function synthetic() {
  const dir = mkdtempSync(join(tmpdir(), "dfs-"));
  console.log("ไฟล์สังเคราะห์ที่", dir);
  await check("card-300dpi.psd", makePsd(1181, 591, 300), "100 × 50 มม.");
  await check("big.psb", makePsd(3543, 2362, 300, true), "300 × 200 มม.");
  await check("web-72dpi.psd", makePsd(720, 360, 72), "254 × 127 มม.");
  await check("no-dpi.psd", makePsd(500, 500, null), "500 × 500 px");
  // ผืน 100×100 มม. ตัวงาน 1158×1171 px = 98.0×99.1 มม. (เคสจริง 16 ก.ย. 69: ผืน 10 ซม. ตัวงาน 9.81×9.92)
  await check("object-raw.psd", makePsd(1182, 1182, 300, false, { x: 10, y: 5, w: 1158, h: 1171 }), "98 × 99.1 มม. (ผืน 100.1 × 100.1)");
  await check("object-rle.psd", makePsd(1182, 1182, 300, false, { x: 10, y: 5, w: 1158, h: 1171, rle: true }), "98 × 99.1 มม. (ผืน 100.1 × 100.1)");
  await check("object-rle.psb", makePsd(600, 300, 300, true, { x: 0, y: 0, w: 300, h: 300, rle: true }), "25.4 × 25.4 มม. (ผืน 50.8 × 25.4)");
  await check("cmyk-alpha.psd", makePsd(600, 300, 300, false, { x: 0, y: 0, w: 300, h: 300, rle: true }, true), "25.4 × 25.4 มม. (ผืน 50.8 × 25.4)");
  await check("full-alpha.psd", makePsd(300, 300, 300, false, { x: 0, y: 0, w: 300, h: 300, rle: true }), "25.4 × 25.4 มม.");
  await check("logo.eps", makeEps(50, 70), "50 × 70 มม.");
  await check("one-board.ai", await makeAi([[50, 70]]), "50 × 70 มม.");
  await check("three-boards.ai", await makeAi([[50, 70], [100, 100], [210, 297]]), "50 × 70 มม. · 100 × 100 มม. · 210 × 297 มม.");
  await check("bleed-3mm.ai", await makeAi([[90, 55]], 3), "96 × 61 มม. (ตัดจริง 90 × 55)");
  await check("no-compat.ai", await makeAiNoCompat(), "อ่านขนาดไม่ได้");
  await check("old-ps.ai", makeEps(30, 30), "30 × 30 มม.");
  await check("garbage.psd", new TextEncoder().encode("hello world, not a psd at all"), "อ่านขนาดไม่ได้");
  await check("empty.ai", new Uint8Array(0), "อ่านขนาดไม่ได้");
  await check("unknown.docx", new Uint8Array([1, 2, 3]), "อ่านขนาดไม่ได้");
  // เขียนไฟล์ไว้ให้ลากทดสอบในหน้าเว็บด้วย
  writeFileSync(join(dir, "card-300dpi.psd"), makePsd(1181, 591, 300));
  writeFileSync(join(dir, "three-boards.ai"), await makeAi([[50, 70], [100, 100], [210, 297]]));
  writeFileSync(join(dir, "bleed-3mm.ai"), await makeAi([[90, 55]], 3));
  writeFileSync(join(dir, "no-compat.ai"), await makeAiNoCompat());
  writeFileSync(join(dir, "logo.eps"), makeEps(50, 70));
  console.log(fail ? `\n❌ พลาด ${fail} เคส` : "\n✅ ผ่านทุกเคส");
  if (fail) process.exit(1);
}

async function real(paths: string[]) {
  let ok = 0;
  for (const p of paths) {
    if (!existsSync(p)) {
      console.log(`❌ ${p}\n     ไม่มีไฟล์นี้ — เช็คพาธ/ชื่อไฟล์ (ลากไฟล์จาก Finder มาวางในเทอร์มินัลจะได้พาธถูก)`);
      continue;
    }
    const info = await readDesignInfo(p, fromBuffer(new Uint8Array(readFileSync(p))));
    if (info.ok) ok++;
    console.log(`${info.ok ? "✅" : "❌"} ${p}\n     ${sizeText(info)}${info.px ? ` · ${info.px.w}×${info.px.h}px${info.dpi ? ` @${info.dpi}dpi` : ""}` : ""}${info.note ? `\n     ↳ ${info.note}` : ""}`);
  }
  console.log(`\nอ่านได้ ${ok}/${paths.length} ไฟล์`);
}

const args = process.argv.slice(2);
void (args.length ? real(args) : synthetic());
