#!/usr/bin/env node
/**
 * "สติ๊กเกอร์วาชิ" (washi-sticker) — ค่าจุดไดคัทที่เกินโควตา ฿2 → ฿0.50 ต่อจุด
 *
 *   node scripts/washi-dot-fee-050.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/washi-dot-fee-050.mjs --write
 *
 * ฿2 ผิดมาตั้งแต่ต้น — สติ๊กเกอร์ตัวอื่นทุกตัว (PP/UV/โฮโลแกรม/นีออน/สะท้อนแสง/
 * ฟิล์มรุ้ง/ทอง-เงิน/Solvent) คิด ฿0.50 ต่อจุดเหมือนกันหมด วาชิเป็นตัวเดียวที่หลุด
 *
 * ตัวเลขนี้อยู่ 4 ที่ ต้องแก้พร้อมกัน ไม่งั้นราคาที่คิดจริงกับที่เขียนไว้จะไม่ตรงกัน:
 *   1. options["จำนวนจุดไดคัท"].inputFee.perUnit  ← ตัวที่คิดเงินจริง
 *   2. options["จำนวนจุดไดคัท"].note              ← บรรทัดใต้หัวข้อในหน้าสินค้า
 *   3. tabs[0].text (หมายเหตุ)                    ← แท็บรายละเอียด
 *   4. seo.faqs[].a                               ← คำถามที่พบบ่อย
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "washi-sticker";
const EXPECT_NAME = "สติ๊กเกอร์วาชิ";
const NEW_FEE = 0.5;

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
console.log("สำรองไว้ที่:", backup.pathname, "\n");

// 1) ตัวคิดเงินจริง
const dots = (d.options || []).find((g) => g.label === "จำนวนจุดไดคัท");
if (!dots?.inputFee) { console.error('ไม่พบ inputFee ของ "จำนวนจุดไดคัท"'); process.exit(1); }
console.log(`[1] inputFee.perUnit: ฿${dots.inputFee.perUnit} → ฿${NEW_FEE}`);
dots.inputFee.perUnit = NEW_FEE;

// 2-4) ข้อความที่บอกราคาไว้
const fixes = [
  ["[2] note", () => dots.note, (v) => (dots.note = v),
   "เกินจากนั้นคิดจุดละ ฿2 ต่อแผ่น A3", "เกินจากนั้นคิดจุดละ ฿0.50 ต่อแผ่น A3"],
  ["[3] tabs[0].text", () => d.tabs[0].text, (v) => (d.tabs[0].text = v),
   "เกินคิดจุดละ 2 บาท ต่อแผ่น A3", "เกินคิดจุดละ 0.50 บาท ต่อแผ่น A3"],
  ["[4] seo.faqs", () => d.seo.faqs[4].a, (v) => (d.seo.faqs[4].a = v),
   "เกินคิดเพิ่มจุดละ 2 บาท", "เกินคิดเพิ่มจุดละ 0.50 บาท"],
];
for (const [tag, get, set, from, to] of fixes) {
  const cur = get();
  if (!cur?.includes(from)) { console.error(`${tag} ⚠️ ไม่พบข้อความ: ${from}`); process.exit(1); }
  set(cur.replace(from, to));
  console.log(`${tag}: ${to}`);
}

// กันตกหล่น — ห้ามเหลือข้อความที่ยังบอก 2 บาทต่อจุด
const leftover = (JSON.stringify(d).match(/จุดละ [฿]?2 |จุดละ 2 บาท/g) || []).length;
console.log(`\nเหลือข้อความที่ยังบอก "จุดละ 2 บาท": ${leftover} จุด`);
if (leftover) { console.error("ยังเหลือ — ไม่เขียน"); process.exit(1); }

if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึกจริง)"); process.exit(0); }
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) { console.error(e2); process.exit(1); }
console.log("\n✅ บันทึกแล้ว");
