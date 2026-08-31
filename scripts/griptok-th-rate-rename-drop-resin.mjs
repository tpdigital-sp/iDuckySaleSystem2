#!/usr/bin/env node
/**
 * กริ๊บต๊อก UV (id griptok-th · slug GripTok-uv) — ย้ายเรซิ่นไปอยู่ในเรทราคา
 *
 *   node scripts/griptok-th-rate-rename-drop-resin.mjs           # ซ้อม (ไม่เขียน)
 *   node scripts/griptok-th-rate-rename-drop-resin.mjs --write   # เขียนจริง
 *
 * ทำ 3 อย่าง:
 *   1) เรทที่ 1 → "GripTok UV แบบปกติ"
 *   2) เรทที่ 2 → "GripTok UV แบบเคลือบเรซิ่น"
 *   3) ถอดกลุ่ม "เคลือบเรซิ่น (Add On)" ออก (ราคาส่วนเคลือบอยู่ในเรทที่ 2 แล้ว)
 *      + ลบบรรทัด terms ที่อธิบายราคา Add On ตัวเดิม (30/15 บาทต่อชิ้น) ซึ่งจะค้างผิดความจริง
 *
 * ก่อนเขียนจะเก็บ data ปัจจุบันลง product_revisions (ถ้ามีตาราง) กู้คืนได้ด้วย
 * scripts/product-revisions.mjs griptok-th
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "griptok-th";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) throw error;
const d = structuredClone(row.data);
console.log(`🛒 ${row.name} (id ${ID})`);

/* 1-2) เปลี่ยนชื่อเรท */
const RATE_LABELS = { r1: "GripTok UV แบบปกติ", "r2-ve8ue": "GripTok UV แบบเคลือบเรซิ่น" };
for (const rate of d.priceRates || []) {
  const next = RATE_LABELS[rate.id];
  if (!next) throw new Error(`เจอเรทไม่รู้จัก id=${rate.id} (${rate.label}) — หยุดก่อน`);
  console.log(`  เรท ${rate.id}: "${rate.label}" → "${next}"`);
  rate.label = next;
}
if ((d.priceRates || []).length !== 2) throw new Error(`คาดว่ามี 2 เรท แต่เจอ ${(d.priceRates || []).length}`);

/* 3) ถอดกลุ่มเคลือบเรซิ่น */
const GROUP = "เคลือบเรซิ่น (Add On)";
const before = d.options.length;
const target = d.options.find((o) => o.label === GROUP);
if (!target) throw new Error(`ไม่เจอกลุ่ม "${GROUP}" — อาจถูกถอดไปแล้ว`);
if ((target.choices || []).length !== 1 || target.choices[0]?.name !== "เคลือบเรซิ่น")
  throw new Error(`หน้าตากลุ่ม "${GROUP}" ไม่ตรงที่คาด: ${JSON.stringify(target.choices)}`);
// กันพลาด: ต้องไม่มี rule หรือ showWhen ของกลุ่มอื่นอ้างถึงกลุ่มนี้
const refs = JSON.stringify({ rules: d.rules, options: d.options.filter((o) => o !== target) });
if (refs.includes(GROUP)) throw new Error(`มีกฎ/เงื่อนไขอ้างถึงกลุ่ม "${GROUP}" — ตรวจก่อนถอด`);
d.options = d.options.filter((o) => o !== target);
console.log(`  ถอดกลุ่ม "${GROUP}" (${before} → ${d.options.length} กลุ่ม)`);

/* 3b) ลบบรรทัด terms ราคา Add On เดิม (แทนที่แบบเป๊ะทั้งบรรทัด ไม่กรองรายบรรทัด) */
const TERM_LINE = "*เคลือบเรซิ่น (Add On) 1-10 ชิ้น บวกเพิ่มชิ้นละ 30 บาท · ตั้งแต่ 11 ชิ้นขึ้นไป บวกเพิ่มชิ้นละ 15 บาท\n";
if (typeof d.terms !== "string" || !d.terms.includes(TERM_LINE))
  throw new Error("ไม่เจอบรรทัด terms ราคา Add On ที่จะลบ — ตรวจ terms ก่อน");
d.terms = d.terms.replace(TERM_LINE, "");
console.log(`  ลบบรรทัด terms ราคา Add On เดิม · terms เหลือ ${d.terms.length} ตัวอักษร`);

if (!WRITE) {
  console.log("\n(ซ้อมเฉย ๆ — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

/* เก็บประวัติก่อนทับ */
const { error: revErr } = await sb
  .from("product_revisions")
  .insert({ product_id: ID, data: row.data, action: "save", editor: "script", editor_name: "griptok-th-rate-rename-drop-resin.mjs" });
if (revErr) console.log(`  ⚠️ เก็บ product_revisions ไม่ได้ (${revErr.message}) — เขียนต่อ`);
else console.log("  📜 เก็บเวอร์ชันเดิมลง product_revisions แล้ว");

d.savedAt = new Date().toISOString();
const { error: upErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (upErr) throw upErr;
console.log("✅ เขียนเรียบร้อย");
