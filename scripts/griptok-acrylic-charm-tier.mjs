/**
 * Griptok อะคริลิค (id 1-4) — ราคาติ่งห้อยแบบขั้นจำนวน 3 ขั้น (ผู้ใช้สั่ง 26 ส.ค. 69):
 *
 *   1-10 ชิ้น   ชิ้นละ 20 บาท   → smallQtyFee { fee: 20, upToQty: 10 } (คิดแทนราคาตัวเลือก)
 *   11-29 ชิ้น  ชิ้นละ 15 บาท   → extraBelow: 15 (กลุ่มตั้ง extraFromQty: 30)
 *   30 ชิ้นขึ้นไป ชิ้นละ 12 บาท → extra: 12
 *
 * ของเดิม: extra 12 + smallQtyFee { fee: 15, upToQty: 29 } = 1-29 ชิ้นเหมา 15 · 30+ = 12
 * (ช่วง 1-10 เดิมคิด 15 → ขึ้นเป็น 20 ตามที่สั่ง · ช่วง 11-29 กับ 30+ เท่าเดิม)
 * แก้บรรทัด Add On ติ่งห้อย ใน tabs (เงื่อนไข) ให้ตรงราคาใหม่ + เติม note ท้ายกลุ่ม
 *
 *   node scripts/griptok-acrylic-charm-tier.mjs            # ดูสิ่งที่จะแก้ (ไม่เขียนจริง)
 *   node scripts/griptok-acrylic-charm-tier.mjs --write    # เขียนลง Supabase
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "1-4";
const GROUP = "ติ่งห้อย";
const CHARM = "เพิ่มติ่งห้อย";
const NONE = "ไม่เพิ่ม";
const TERMS_OLD = "• Add On ติ่งห้อย: 11-29 ชิ้น ชิ้นละ 15 บาท · 30 ชิ้นขึ้นไป ชิ้นละ 12 บาท";
const TERMS_NEW =
  "• Add On ติ่งห้อย: 1-10 ชิ้น ชิ้นละ 20 บาท · 11-29 ชิ้น ชิ้นละ 15 บาท · 30 ชิ้นขึ้นไป ชิ้นละ 12 บาท";
const NOTE = "ติ่งห้อยคิดตามจำนวน: 1-10 ชิ้น ชิ้นละ 20 บาท · 11-29 ชิ้น ชิ้นละ 15 บาท · 30 ชิ้นขึ้นไป ชิ้นละ 12 บาท";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE || env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const data = row.data;
const opt = (data.options ?? []).find((o) => o.label === GROUP);
if (!opt) throw new Error(`❌ ไม่เจอกลุ่ม "${GROUP}" ในสินค้า ${ID}`);

// --- 1) ขั้นราคา (รันซ้ำได้ — อัปค่าทับ) --------------------------------------
const before = JSON.stringify({
  extraFromQty: opt.extraFromQty,
  smallQtyFee: opt.smallQtyFee,
  charm: opt.choices.find((c) => c.name === CHARM),
});
opt.extraFromQty = 30; // ต่ำกว่า 30 ใช้ extraBelow · 30 ขึ้นไปใช้ extra
opt.smallQtyFee = { fee: 20, upToQty: 10, freeChoices: [NONE] }; // 1-10 ชิ้น เหมาชิ้นละ 20 (คิดแทน extra)
const charm = opt.choices.find((c) => c.name === CHARM);
if (!charm) throw new Error(`❌ ไม่เจอตัวเลือก "${CHARM}" ในกลุ่ม "${GROUP}"`);
charm.extra = 12; // 30 ชิ้นขึ้นไป
charm.extraBelow = 15; // 11-29 ชิ้น (ช่วง 1-10 โดน smallQtyFee คิดแทนก่อนถึงตัวนี้)

// --- 2) ข้อความ: แท็บเงื่อนไข + note ท้ายกลุ่ม ---------------------------------
let termsHit = 0;
for (const tab of data.tabs ?? []) {
  if (typeof tab.text === "string" && tab.text.includes(TERMS_OLD)) {
    tab.text = tab.text.replace(TERMS_OLD, TERMS_NEW);
    termsHit++;
  } else if (typeof tab.text === "string" && tab.text.includes(TERMS_NEW)) {
    termsHit++; // รันซ้ำ — แก้ไปแล้ว
  }
}
const noteBefore = opt.note ?? "";
if (!noteBefore.includes("ติ่งห้อยคิดตามจำนวน")) opt.note = noteBefore ? noteBefore + " · " + NOTE : NOTE;

console.log(`สินค้า ${ID} · กลุ่ม "${GROUP}"`);
console.log(`  ก่อน: ${before}`);
console.log(
  `  หลัง: ${JSON.stringify({ extraFromQty: opt.extraFromQty, smallQtyFee: opt.smallQtyFee, charm })}`
);
console.log(`  แท็บเงื่อนไข: ${termsHit ? `แก้บรรทัด Add On ติ่งห้อย (${termsHit} ที่)` : "⚠️ ไม่เจอบรรทัดเดิม — เช็คเอง"}`);
console.log(`  note: ${opt.note === noteBefore ? "คงเดิม (มีอยู่แล้ว)" : JSON.stringify(opt.note)}`);

if (WRITE) {
  const { error: e } = await sb.from("products").update({ data }).eq("id", ID);
  if (e) throw e;
}
console.log(WRITE ? "✅ เขียนเรียบร้อย" : "👀 dry-run — เติม --write เพื่อเขียนจริง");
