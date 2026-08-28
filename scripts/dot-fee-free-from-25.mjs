#!/usr/bin/env node
/**
 * เปิดใช้กติกา "สั่ง 25 แผ่น A3 ขึ้นไปต่อ 1 ลาย = ฟรีค่าจุดไดคัทที่เกินโควตา"
 *
 *   node scripts/dot-fee-free-from-25.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/dot-fee-free-from-25.mjs --write
 *
 * กติกานี้เขียนไว้ในหน้าสินค้า/FAQ ของสติ๊กเกอร์ทุกตัวมานานแล้ว แต่ระบบไม่เคยคิดให้จริง
 * (inputFeeOf ไม่รู้จักจำนวนที่สั่งเลย) — ลูกค้าสั่ง 25 แผ่นก็ยังโดนค่าจุดเต็ม ๆ
 * ตัวคิดเงินรองรับแล้วผ่าน InputFee.freeFromQtyPerDesign · สคริปต์นี้ตั้งค่าให้สินค้าที่ประกาศไว้
 *
 * ⚠️ ตั้งเฉพาะกลุ่มที่ขายเป็น "แผ่น A3" — กลุ่มที่ขายเป็น ตร.ม. (sticker-uv) เกณฑ์ 25 เป็นคนละหน่วย
 *    ต้องรู้ก่อนว่าร้านคิดที่กี่ ตร.ม. ถึงจะตั้งได้ จึงข้ามไว้
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const THRESHOLD = 25;
const GROUP = "จำนวนจุดไดคัท";   // ตรงตัวเท่านั้น — "จำนวนจุดไดคัท (ตร.ม.)" ไม่เข้าข่าย

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const { data: rows, error } = await sb.from("products").select("id,data");
if (error) { console.error(error); process.exit(1); }

const targets = [];
for (const p of rows) {
  const promises = /ฟรีค่าจุด/.test(JSON.stringify(p.data));
  const g = (p.data?.options ?? []).find((o) => o.label === GROUP && o.inputFee);
  if (!promises || !g) continue;
  const skipped = (p.data.options ?? []).filter((o) => o.inputFee && o.label !== GROUP).map((o) => o.label);
  targets.push({ id: p.id, data: p.data, group: g, skipped });
}

console.log(`สินค้าที่ประกาศกติกานี้ไว้ และมีกลุ่ม "${GROUP}": ${targets.length} ตัว\n`);
for (const t of targets) {
  const cur = t.group.inputFee.freeFromQtyPerDesign;
  console.log(`  ${t.id.padEnd(32)} ${cur == null ? "(ยังไม่ตั้ง)" : `เดิม ${cur}`} → ${THRESHOLD} แผ่น/ลาย` +
    (t.skipped.length ? `   [ข้าม: ${t.skipped.join(", ")}]` : ""));
}

if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึกจริง)"); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`../.backup-dotfee-${stamp}.json`, import.meta.url),
  JSON.stringify(targets.map((t) => ({ id: t.id, data: t.data })), null, 2));
console.log(`\nสำรองไว้ที่ .backup-dotfee-${stamp}.json`);

for (const t of targets) {
  const d = JSON.parse(JSON.stringify(t.data));
  d.options.find((o) => o.label === GROUP).inputFee.freeFromQtyPerDesign = THRESHOLD;
  const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", t.id);
  if (e2) { console.error(t.id, e2); process.exit(1); }
  console.log("  ✓", t.id);
}
console.log("\n✅ บันทึกแล้ว");
