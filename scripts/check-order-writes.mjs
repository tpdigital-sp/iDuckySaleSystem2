/**
 * 🚦 ด่านกันของเก่ากลับมา — ห้ามเขียนตาราง orders ตรง ๆ ต้องผ่าน src/lib/server/order-write.ts เท่านั้น
 *
 * ทำไม (เจ้าของร้านทัก 14 ก.ย. 69 "ส่วนลดในชม. ขึ้นบ้างไม่ขึ้นบ้าง"):
 * กติกาที่ต้องคิดตอนบันทึกออเดอร์ (ส่วนลดโอนไว) เคยกระจายอยู่ตามทางเข้าทีละทาง พอมีทางเข้าใหม่
 * คนเขียนก๊อป sb.from("orders").update(...) ไปวาง กติกาก็หายไปเงียบ ๆ — หลุดมาแล้ว 2 รอบ
 * ตัวนี้ทำให้ "ลืม" กลายเป็น build error ตั้งแต่ในเครื่อง ไม่ต้องรอลูกค้าทัก
 *
 * รันเอง:  node scripts/check-order-writes.mjs
 * รันอัตโนมัติ: npm run build (ผ่าน prebuild) — Netlify จึง build ไม่ผ่านถ้ามีคนยิงตรง
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "src";
const ALLOW = ["src/lib/server/order-write.ts"]; // ประตูเดียวที่เขียนได้
const WRITE = /\.from\(\s*["']orders["']\s*\)[\s\S]{0,200}?\.(insert|update|upsert|delete)\s*\(/g;

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
})(ROOT);

const bad = [];
for (const f of files) {
  if (ALLOW.includes(f.split(path.sep).join("/"))) continue;
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(WRITE)) {
    const line = src.slice(0, m.index).split("\n").length;
    bad.push(`${f}:${line}  ${m[0].replace(/\s+/g, " ").trim()}…`);
  }
}

if (bad.length) {
  console.error("\n⛔ เขียนตาราง orders ตรง ๆ ไม่ได้ — ต้องผ่าน insertOrder()/updateOrder() ใน src/lib/server/order-write.ts\n");
  for (const b of bad) console.error("   " + b);
  console.error(
    "\n   เหตุผล: กติกาที่ต้องคิดตอนบันทึก (ส่วนลดโอนไว ฯลฯ) อยู่ในประตูนั้น — ยิงตรง = ใบนั้นไม่ได้ส่วนลดโดยไม่มีใครรู้" +
      "\n   แก้: import { updateOrder } from \"@/lib/server/order-write\"  แล้วเรียก  await updateOrder(sb, order)\n"
  );
  process.exit(1);
}
console.log(`✓ order writes: ผ่านประตูเดียวครบ (ตรวจ ${files.length} ไฟล์)`);
