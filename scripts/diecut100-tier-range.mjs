#!/usr/bin/env node
/**
 * 📋 ตารางจำนวนชิ้น/แผ่น A3 ของไดคัท 100% — ใส่ "ช่วงขนาดของแต่ละแถว" (perSheetTiers[].from)
 *
 *   node scripts/diecut100-tier-range.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/diecut100-tier-range.mjs --write
 *
 * ที่มา (15 ก.ย. 69): เจ้าของร้านทักว่า 5.5 × 5.5 ซม. เว็บบอก 24 ชิ้น แต่ Print-Fit วางได้ 28
 * เพราะ 5.5 ไม่มีในภาพ โค้ดเลยปัดขึ้นไปใช้แถว "6x6 = 24" → บอกต่ำกว่าจริง
 * เจ้าของร้านเคาะ: **ขนาดที่อยู่ในภาพใช้เลขในภาพ · ขนาดอื่นใช้ Print-Fit**
 *
 * ทำอะไร: เติม from ให้ทุกแถวตามภาพ "ขนาด+จำนวนที่ได้ใน 1 A3"
 *   แถวที่ระบุขนาดตรง ๆ → from = upTo (4x4 = {from:4,upTo:4}) · แถวที่เป็นช่วง → ตามช่วง (7-8 · 11-14 · 16-21 · 22-30)
 *   แถวสุดท้าย 22-30 ไม่ใส่ upTo (จัตุรัสใหญ่กว่า 30 กรอกไม่ได้อยู่แล้ว — ช่องกว้าง max 30)
 * ไม่แตะ: per (ตัวเลขในภาพเหมือนเดิม) · วาชิ (ตารางของตัวเอง ไม่มี from = ใช้พฤติกรรมเดิม)
 * รันซ้ำได้ · ตรวจชื่อสินค้าก่อนเขียน · อ่านกลับเทียบทุกตัว + savedAt
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const OPT_H = "ขนาดไดคัท (สูง)";
/** ตารางจากภาพเจ้าของร้าน — [เล็กสุด, ใหญ่สุด (null = ไม่จำกัด), จำนวนต่อแผ่น] */
const TIERS = [
  { from: 2, upTo: 2, per: 180 },
  { from: 3, upTo: 3, per: 96 },
  { from: 4, upTo: 4, per: 60 },
  { from: 5, upTo: 5, per: 40 },
  { from: 6, upTo: 6, per: 24 },
  { from: 7, upTo: 8, per: 15 },
  { from: 9, upTo: 9, per: 12 },
  { from: 10, upTo: 10, per: 8 },
  { from: 11, upTo: 14, per: 6 },
  { from: 15, upTo: 15, per: 4 },
  { from: 16, upTo: 21, per: 2 },
  { from: 22, per: 1 },
];
const TARGETS = {
  "paper-art-pet": "กระดาษอาร์ตมัน PET",
  "texture-paper": "กระดาษเนื้อพิเศษ",
  "paper-foil": "กระดาษเคลือบฟอยล์",
  "sticker-pp": "สติ๊กเกอร์ดิจิตอล",
  "sticker-uv": "สติ๊กเกอร์ UV",
  neon: "สติ๊กเกอร์เรืองแสง",
  "reflective-sticker": "สติ๊กเกอร์สะท้อนแสง",
  "sticker-gold-silver-rosegold": "Sticker Gold | Silver | RoseGold",
  "sticker-hologram": "สติ๊กเกอร์โฮโลแกรม",
  "sticker-solvent": "SolventPremium",
};

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

/** ⚠️ JSONB เรียงคีย์ใหม่ตอนอ่านกลับ — เทียบค่าทีละข้อ ห้าม stringify */
const verify = (d) => {
  const t = (d.options ?? []).find((o) => o.label === OPT_H)?.sheetYield?.perSheetTiers;
  return (
    Array.isArray(t) &&
    t.length === TIERS.length &&
    TIERS.every((x, i) => t[i]?.per === x.per && t[i]?.from === x.from && (t[i]?.upTo ?? null) === (x.upTo ?? null))
  );
};

function apply(d) {
  const h = (d.options ?? []).find((o) => o.label === OPT_H);
  if (!h?.sheetYield?.perSheetTiers?.length) die(`ไม่พบตารางในกลุ่ม ${OPT_H}`);
  if (!h.sheetYield.longestOnly) die(`${OPT_H} ไม่ได้ตั้ง longestOnly — ไม่ใช่ตัวที่ใช้ตารางไดคัท 100%`);
  const old = h.sheetYield.perSheetTiers;
  // กันเขียนทับตารางคนละชุด (วาชิ ฯลฯ): ตัวเลข per ต้องตรงกับภาพทุกแถว
  if (old.length !== TIERS.length || !TIERS.every((x, i) => old[i]?.per === x.per))
    die(`ตารางไม่ตรงกับภาพ (${old.map((t) => t.per).join(",")}) — หยุดกันเขียนผิดตัว`);
  const same = verify(d);
  h.sheetYield.perSheetTiers = TIERS.map((t) => ({ ...t }));
  return !same;
}

const ids = Object.keys(TARGETS);
const { data: rows, error } = await sb.from("products").select("id,name,data").in("id", ids);
if (error) die(error.message);
if (rows.length !== ids.length) die(`เจอ ${rows.length}/${ids.length} ตัว`);

const plan = [];
for (const row of rows) {
  if (row.name !== TARGETS[row.id]) die(`${row.id}: ชื่อไม่ตรงที่คาด (${row.name})`);
  const changed = apply(row.data);
  console.log(`${changed ? "→" : "="} ${row.id} | ${row.name}${changed ? "" : " (ตรงแล้ว)"}`);
  if (changed) plan.push({ id: row.id, d: row.data });
}
if (!WRITE) {
  console.log(`\n(dry-run) ต้องแก้ ${plan.length}/${rows.length} ตัว — ใส่ --write เพื่อเขียน`);
  process.exit(0);
}
for (const { id, d } of plan) {
  d.savedAt = new Date().toISOString();
  const { data: upd, error: e1 } = await sb.from("products").update({ data: d }).eq("id", id).select("id");
  if (e1) die(`${id}: ${e1.message}`);
  if (!upd?.length) die(`${id}: update โดน 0 แถว`);
  const { data: back, error: e2 } = await sb.from("products").select("data").eq("id", id).single();
  if (e2) die(`${id}: ${e2.message}`);
  if (!verify(back.data)) die(`${id}: อ่านกลับไม่ตรง`);
  console.log(`✓ ${id} เขียนแล้ว · savedAt ${d.savedAt}`);
}
console.log(`\n✓ เสร็จ ${plan.length} ตัว อ่านกลับตรงทุกตัว`);
