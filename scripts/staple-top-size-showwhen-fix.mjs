/**
 * 📐 กระดาษเย็บบน (package-staple-top) — ช่องกรอก "กำหนดขนาดเอง" ไม่โผล่
 *
 * เจ้าของร้านแจ้ง 21 ก.ย. 69: เลือก "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)" แล้วไม่มีช่องให้กรอกขนาด
 *
 * สาเหตุ: กลุ่มขนาดเคยชื่อ "ขนาดใบ" (ตอน scripts/add-staple-top-custom-size.mjs สร้างช่องกรอก)
 * ภายหลังเปลี่ยนชื่อกลุ่มเป็น "ขนาดแบบที่ยังไม่พับ" — driverLabels ของตารางราคาเปลี่ยนตาม
 * แต่ showWhen ของช่องกรอก "ขนาดใบ (กว้าง)/(สูง)" ยังชี้ชื่อเดิม → optionVisible() หาค่ากลุ่ม
 * "ขนาดใบ" ใน selections ไม่เจอ = ซ่อนตลอด ทั้งสองช่อง (ดูโค้ด src/lib/products.ts optionVisible)
 *
 * สคริปต์นี้ซ่อมข้อมูล: เงื่อนไขทุกข้อ (showWhen/showWhenAlso/showWhenAll/showWhenAny) + กฎ (rules)
 * + sheetYield.pairLabel + sizeInput ที่ยังอ้างชื่อกลุ่มเดิม ให้ชี้ชื่อกลุ่มปัจจุบัน
 * (โค้ดหน้าแก้ไขหลังบ้านแก้ให้ลากชื่อพวกนี้ตามตอนเปลี่ยนชื่อกลุ่มแล้วในคอมมิตเดียวกัน)
 *
 *   node scripts/staple-top-size-showwhen-fix.mjs --dry   (ดูอย่างเดียว)
 *   node scripts/staple-top-size-showwhen-fix.mjs         (เขียนจริง · idempotent · อ่านกลับเทียบ)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "package-staple-top";
const OLD_LABEL = "ขนาดใบ";                    // ชื่อกลุ่มเดิมที่ยังค้างในเงื่อนไข
const NEW_LABEL = "ขนาดแบบที่ยังไม่พับ";        // ชื่อกลุ่มจริงตอนนี้
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const FIELDS = ["ขนาดใบ (กว้าง)", "ขนาดใบ (สูง)"]; // ชื่อ "กลุ่มช่องกรอก" — ไม่เปลี่ยน แค่เงื่อนไขของมัน

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const DRY = process.argv.includes("--dry");
const die = (msg) => { console.error("✗ " + msg); process.exit(1); };

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;
const opts = p.options || [];

// กันพลาด: ต้องมีกลุ่มชื่อใหม่จริง และต้องไม่มีกลุ่มชื่อเดิมหลงเหลือ (ไม่งั้นแปลว่าเข้าใจผิด)
const group = opts.find((o) => o.label?.trim() === NEW_LABEL);
if (!group) die(`ไม่พบกลุ่ม "${NEW_LABEL}" — ชื่อกลุ่มอาจเปลี่ยนอีกรอบ ตรวจก่อน`);
if (opts.some((o) => o.label?.trim() === OLD_LABEL)) die(`ยังมีกลุ่มชื่อ "${OLD_LABEL}" อยู่จริง — หยุดก่อน`);
if (!group.choices?.some((c) => c.name === CUSTOM)) die(`ไม่พบตัวเลือก "${CUSTOM}" ในกลุ่ม ${NEW_LABEL}`);
for (const f of FIELDS) if (!opts.some((o) => o.label === f)) die(`ไม่พบกลุ่มช่องกรอก "${f}"`);

let fixed = 0;
const hit = (where) => { fixed++; console.log(`  · ${where}`); };
const fixCond = (c, where) => { if (c?.label?.trim() === OLD_LABEL) { c.label = NEW_LABEL; hit(where); } };

for (const o of opts) {
  fixCond(o.showWhen, `${o.label} → showWhen`);
  fixCond(o.showWhenAlso, `${o.label} → showWhenAlso`);
  for (const c of o.showWhenAll ?? []) fixCond(c, `${o.label} → showWhenAll`);
  for (const c of o.showWhenAny ?? []) fixCond(c, `${o.label} → showWhenAny`);
  for (const c of o.choices ?? []) {
    for (const w of c.imageWhen ?? []) for (const cond of w.when ?? []) fixCond(cond, `${o.label}/${c.name} → imageWhen`);
    for (const l of c.stockLinks ?? []) for (const cond of l.when ?? []) fixCond(cond, `${o.label}/${c.name} → stockLinks`);
  }
  for (const k of ["smallWhenLabel", "freeWhenLabel", "qtyFrom", "priceAsDriver"]) {
    if (o[k]?.trim() === OLD_LABEL) { o[k] = NEW_LABEL; hit(`${o.label} → ${k}`); }
  }
  if (o.defaultBy?.label?.trim() === OLD_LABEL) { o.defaultBy.label = NEW_LABEL; hit(`${o.label} → defaultBy`); }
  if (o.sheetYield?.pairLabel?.trim() === OLD_LABEL) { o.sheetYield.pairLabel = NEW_LABEL; hit(`${o.label} → sheetYield.pairLabel`); }
  if (o.sheetFee?.by?.trim() === OLD_LABEL) { o.sheetFee.by = NEW_LABEL; hit(`${o.label} → sheetFee.by`); }
}
for (const r of p.rules ?? []) {
  if (r.when?.label?.trim() === OLD_LABEL) { r.when.label = NEW_LABEL; hit("rules → when"); }
  if (r.limit?.label?.trim() === OLD_LABEL) { r.limit.label = NEW_LABEL; hit("rules → limit"); }
}

if (!fixed) { console.log("ไม่มีอะไรต้องแก้ (ซ่อมไปแล้ว)"); process.exit(0); }
console.log(`จุดที่ชี้ชื่อกลุ่มเดิม "${OLD_LABEL}" → "${NEW_LABEL}": ${fixed} จุด`);

p.options = opts;
p.savedAt = new Date().toISOString();
if (DRY) { console.log("(--dry ไม่บันทึก)"); process.exit(0); }

const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");

// อ่านกลับเทียบ: ช่องกรอกต้องผูกกับตัวเลือก "กำหนดขนาดเอง" ของกลุ่มชื่อใหม่ และไม่เหลือชื่อเดิมที่ไหนอีก
const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q = back?.data;
if (q?.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ");
for (const f of FIELDS) {
  const g = (q.options || []).find((o) => o.label === f);
  if (g?.showWhen?.label !== NEW_LABEL || !g.showWhen.choices?.includes(CUSTOM))
    die(`อ่านกลับ showWhen ของ "${f}" ไม่ตรง`);
}
const leftovers = JSON.stringify(q.options).includes(`"${OLD_LABEL}"`) || JSON.stringify(q.rules ?? []).includes(`"${OLD_LABEL}"`);
if (leftovers) die(`อ่านกลับ ยังเจอชื่อกลุ่มเดิม "${OLD_LABEL}" ค้างอยู่`);
const qGroup = (q.options || []).find((o) => o.label?.trim() === NEW_LABEL);
if (qGroup.choices.length !== group.choices.length) die("อ่านกลับ จำนวนตัวเลือกของกลุ่มขนาดเปลี่ยน");
console.log("✅ บันทึกแล้ว + อ่านกลับตรวจครบ");
