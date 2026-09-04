#!/usr/bin/env node
/**
 * วัดขนาดชิ้นงานจริงจากไฟล์เทมเพลตอาร์ตเวิร์ก .ai ของร้าน
 *
 *   node scripts/ai-template-bbox.mjs "/Volumes/iDuckyShop/All Template/24 Card Holder - Card PVC/CARD -.ai"
 *
 * ใบราคา/ใบสเปคของร้านมักไม่เขียนขนาด แต่ `/Volumes/iDuckyShop/All Template/<หมวด>/*.ai`
 * มีเส้นไดคัทจริง — .ai เป็นไฟล์ PDF-compatible จึงแกะได้ตรง ๆ:
 *   หาสตรีม FlateDecode → zlib.inflateSync → อ่าน operator พาธ (m / l / c / re) → วัด bbox ของแต่ละ subpath
 * แล้วรายงานกรอบใหญ่สุดเรียงลงมา (1 pt = 0.352778 มม.)
 *
 * ⚠️ `%%HiResBoundingBox` = อาร์ตบอร์ด (รวมเลือดตก) **ไม่ใช่ตัวชิ้นงาน** — ให้ดูที่ subpath ใหญ่สุดแทน
 * ⚠️ กรอบรอง ๆ มักเป็นเส้นไกด์ของอาร์ตเวิร์ก (ขอบพลาสติกใส / กรอบแดง "ส่วนสำคัญ") ไม่ใช่ขนาดสินค้า
 *
 * เช็คความแม่นแล้ว (4 ก.ย. 69):
 *   Card holder ใส -.ai → 184.855 × 298.439 pt = 65.2 × 105.3 มม. (data.body เขียน "65x105 mm" ✓)
 *   CARD -.ai          → 196.441 × 313.229 pt = 69.3 × 110.5 มม. (data.body เขียน "69x110 mm" ✓)
 *   FrameCard ใส -.ai  → 69.5 × 99.5 มม. = FRAME CARD 7 × 10 ซม. ✓
 */
import { readFileSync } from "node:fs";
import zlib from "node:zlib";
const PT = 0.352778; // 1 pt = มม.
const buf = readFileSync(process.argv[2]);
const hi = /%%HiResBoundingBox:\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(buf.toString("latin1"));
if (hi) {
  const [, x0, y0, x1, y1] = hi.map(Number);
  console.log(`อาร์ตบอร์ด (HiResBoundingBox) ${(x1 - x0).toFixed(2)} × ${(y1 - y0).toFixed(2)} pt = ${((x1 - x0) * PT).toFixed(1)} × ${((y1 - y0) * PT).toFixed(1)} มม.`);
}
// เก็บทุก subpath จากทุกสตรีมที่ inflate ได้
const boxes = [];
let i = 0;
while ((i = buf.indexOf("stream", i)) >= 0) {
  let s = i + 6;
  if (buf[s] === 13) s++;
  if (buf[s] === 10) s++;
  const e = buf.indexOf("endstream", s);
  if (e < 0) break;
  i = e + 9;
  let txt;
  try { txt = zlib.inflateSync(buf.subarray(s, e)).toString("latin1"); } catch { continue; }
  let cur = null;
  const push = () => { if (cur && cur.n >= 3) boxes.push(cur); cur = null; };
  // ops: x y m | x y l | x1 y1 x2 y2 x3 y3 c | x y w h re
  const re = /(-?[\d.]+(?:\s+-?[\d.]+)*)\s+(m|l|c|re)\b/g;
  let m;
  while ((m = re.exec(txt))) {
    const nums = m[1].trim().split(/\s+/).map(Number);
    const op = m[2];
    const pts = [];
    if (op === "m") { push(); pts.push([nums.at(-2), nums.at(-1)]); }
    else if (op === "l") pts.push([nums.at(-2), nums.at(-1)]);
    else if (op === "c") for (let k = nums.length - 6; k < nums.length; k += 2) pts.push([nums[k], nums[k + 1]]);
    else if (op === "re") { push(); const [x, y, w, h] = nums.slice(-4); pts.push([x, y], [x + w, y + h]); }
    if (!cur) cur = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, n: 0 };
    for (const [x, y] of pts) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      cur.x0 = Math.min(cur.x0, x); cur.y0 = Math.min(cur.y0, y);
      cur.x1 = Math.max(cur.x1, x); cur.y1 = Math.max(cur.y1, y); cur.n++;
    }
  }
  push();
}
const seen = new Set();
const rows = boxes
  .map((b) => ({ w: b.x1 - b.x0, h: b.y1 - b.y0, n: b.n }))
  .filter((b) => b.w > 20 && b.h > 20 && b.w < 2000 && b.h < 2000)
  .sort((a, b) => b.w * b.h - a.w * a.h)
  .filter((b) => { const k = `${b.w.toFixed(2)}x${b.h.toFixed(2)}`; if (seen.has(k)) return false; seen.add(k); return true; })
  .slice(0, 12);
for (const b of rows)
  console.log(`  ${b.w.toFixed(3)} × ${b.h.toFixed(3)} pt = ${(b.w * PT).toFixed(1)} × ${(b.h * PT).toFixed(1)} มม.  (จุด ${b.n})`);
