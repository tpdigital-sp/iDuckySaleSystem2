#!/usr/bin/env node
/**
 * "สติ๊กเกอร์วาชิ" (washi-sticker) — เอาตัวเลือกขนาดตัด "ครึ่ง A4/A5/A6 แนวตั้ง" ออก
 *
 *   node scripts/washi-remove-half-cut-sizes.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/washi-remove-half-cut-sizes.mjs --write
 *
 * แตะ 3 ที่ที่อ้างชื่อพวกนี้ (ถ้าเอาออกแค่ที่แรก จะเหลือเงื่อนไขค้างชี้ชื่อที่ไม่มีแล้ว):
 *   1. options["ขนาดตัด"].choices           — ตัวเลือกที่ลูกค้าเห็น
 *   2. options["จำนวนจุดไดคัท"].inputFee.rates[].when.choices — โควตาจุดไดคัทฟรีรายขนาด
 *   3. tabs[0].text                         — บรรทัดสรุปสเปกที่ไล่ชื่อขนาดไว้
 * สำรอง data เดิมลงไฟล์ก่อนเขียนทุกครั้ง
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "washi-sticker";
const EXPECT_NAME = "สติ๊กเกอร์วาชิ";
const DROP = ["ครึ่ง A4 แนวตั้ง", "ครึ่ง A5 แนวตั้ง", "ครึ่ง A6 แนวตั้ง"];

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) { console.error(error); process.exit(1); }
const d = JSON.parse(JSON.stringify(row.data));
if (d.name !== EXPECT_NAME) { console.error(`ชื่อสินค้าไม่ตรง: ${d.name}`); process.exit(1); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = new URL(`../.backup-${ID}-${stamp}.json`, import.meta.url);
writeFileSync(backup, JSON.stringify(row.data, null, 2));
console.log("สำรองไว้ที่:", backup.pathname);

// 1) ตัวเลือก "ขนาดตัด"
const cut = (d.options || []).find((g) => g.label === "ขนาดตัด");
if (!cut) { console.error('ไม่พบกลุ่ม "ขนาดตัด"'); process.exit(1); }
const before = cut.choices.map((c) => c.name);
cut.choices = cut.choices.filter((c) => !DROP.includes(c.name));
console.log("\n[1] ขนาดตัด");
console.log("    ก่อน:", before.join(" | "));
console.log("    หลัง:", cut.choices.map((c) => c.name).join(" | "));

// 2) โควตาจุดไดคัทฟรี — เอาชื่อออกจากเงื่อนไข when (เรทยังอยู่ครบ ผูกกับ A4/A5/A6/A7 เหมือนเดิม)
const dots = (d.options || []).find((g) => g.label === "จำนวนจุดไดคัท");
console.log("\n[2] จำนวนจุดไดคัท · inputFee.rates");
for (const r of dots?.inputFee?.rates || []) {
  const b = r.when?.choices || [];
  const a = b.filter((n) => !DROP.includes(n));
  if (b.length !== a.length) console.log(`    [${b.join(", ")}] → [${a.join(", ")}]`);
  if (r.when) r.when.choices = a;
}

// 3) บรรทัดสรุปสเปก
console.log("\n[3] tabs[0].text");
const fixes = [
  ["• จุดไดคัท (ไดคัท 50%) ฟรีตามขนาด — A4 100 จุด / A5 · ครึ่ง A4 50 จุด / A6 · ครึ่ง A5 25 จุด / A7 · ครึ่ง A6 12 จุด",
   "• จุดไดคัท (ไดคัท 50%) ฟรีตามขนาด — A4 100 จุด / A5 50 จุด / A6 25 จุด / A7 12 จุด"],
  ["• ไดคัท 50% — A4 = 1 แผ่น · A5 = 2 · A6 = 4 · A7 = 9 · ครึ่ง A4 แนวตั้ง = 2 · ครึ่ง A5 แนวตั้ง = 4 · ครึ่ง A6 แนวตั้ง = 8",
   "• ไดคัท 50% — A4 = 1 แผ่น · A5 = 2 · A6 = 4 · A7 = 9"],
];
for (const [from, to] of fixes) {
  if (!d.tabs[0].text.includes(from)) { console.error("    ⚠️ ไม่พบบรรทัด:", from.slice(0, 50)); continue; }
  d.tabs[0].text = d.tabs[0].text.replace(from, to);
  console.log("    ✓", to);
}

const left = (JSON.stringify(d).match(/ครึ่ง A[456]/g) || []).length;
console.log(`\nเหลือคำว่า "ครึ่ง A4/A5/A6" ในข้อมูลสินค้า: ${left} จุด`);
if (left) { console.error("ยังเหลือ — ไม่เขียน"); process.exit(1); }

if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึกจริง)"); process.exit(0); }
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) { console.error(e2); process.exit(1); }
console.log("\n✅ บันทึกแล้ว");
