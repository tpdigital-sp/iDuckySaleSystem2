#!/usr/bin/env node
/**
 * ไดคัท 100% (ไดคัทตามทรง) สติ๊กเกอร์/กระดาษ 10 ตัว — "กรอกด้านยาวสุดด้านเดียวพอ" + ตารางจำนวนชิ้นต่อ A3 ของร้าน
 *
 *   node scripts/diecut100-longest-only.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/diecut100-longest-only.mjs --write
 *
 * ที่มา (10 ก.ย. 69): พนักงานแจ้งว่าลูกค้าบอกแค่ด้านที่ยาวที่สุด ไม่ได้วัด กว้าง×สูง มา แอดมินต้องไปวัดจากไฟล์เอง
 * เจ้าของร้านสั่ง "ทำแค่เฉพาะไดคัท 100% · ใช้ตารางในภาพ · ต้องระบุว่ากราฟฟิกแจ้งตอนส่งแบบ"
 *
 * ทำอะไร (กลุ่ม "ขนาดไดคัท (สูง)" + คู่ "ขนาดไดคัท (กว้าง)" ของแต่ละตัว):
 *   - sheetYield.longestOnly = true · sheetYield.perSheetTiers = ตารางร้าน (เทียบด้านยาวสุด)
 *   - ช่อง (กว้าง) = ด้านยาวสุด: hint/placeholder ใหม่ · max 30 (ตารางถึง 30 ซม.)
 *   - ช่อง (สูง) = ไม่บังคับ (input.required:false) · hint/placeholder ใหม่
 * ไม่แตะ: ชื่อกลุ่ม (rules/showWhen อ้างชื่อ) · min · sheetW/H/gap (ยังใช้เป็นตัวสำรองตอนกรอกครบและตารางไม่ครอบ)
 * ไม่แตะวาชิ (มีตารางของตัวเอง 28×40) · แม่เหล็ก · แบนเนอร์ (แผ่น 65×30 ไม่ใช่ A3) — ดู memory iducky-diecut100-longest-only
 *
 * รันซ้ำได้ · ตรวจชื่อสินค้าก่อนเขียน · อ่านกลับเทียบทุกตัว + savedAt
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const OPT_H = "ขนาดไดคัท (สูง)";
const OPT_W = "ขนาดไดคัท (กว้าง)";
/** ตารางจากภาพเจ้าของร้าน "ขนาด+จำนวนที่ได้ใน 1 A3 — ไดคัท 100%" (เทียบด้านยาวสุด ซม.) */
const TIERS = [
  { upTo: 2, per: 180 },
  { upTo: 3, per: 96 },
  { upTo: 4, per: 60 },
  { upTo: 5, per: 40 },
  { upTo: 6, per: 24 },
  { upTo: 8, per: 15 }, // 7-8
  { upTo: 9, per: 12 },
  { upTo: 10, per: 8 },
  { upTo: 14, per: 6 }, // 11-14
  { upTo: 15, per: 4 },
  { upTo: 21, per: 2 }, // 16-21
  { per: 1 }, // 22-30
];
const MAX_LONGEST = 30;
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

const hintW = (min) =>
  `วัดด้านที่ยาวที่สุดของชิ้นงานหลังไดคัท ด้านเดียวพอ — เล็กสุด ${min} ซม. ใหญ่สุด ${MAX_LONGEST} ซม. · จำนวนชิ้นต่อแผ่น A3 ตามตารางของร้าน กราฟฟิกแจ้งจำนวนที่ได้จริงตอนส่งแบบ`;
const HINT_H = "ไม่บังคับ — กรอกเพิ่มได้ถ้าวัดมาแล้ว (จำนวนชิ้นคิดจากด้านยาวสุด)";

/** สิ่งที่อยากให้เป็น — คืน true ถ้าต้องแก้ */
function apply(d) {
  const h = (d.options ?? []).find((o) => o.label === OPT_H);
  const w = (d.options ?? []).find((o) => o.label === OPT_W);
  if (!h?.sheetYield || !w) die(`ไม่พบกลุ่ม ${OPT_H}/${OPT_W}`);
  if (h.sheetYield.pairLabel !== OPT_W) die(`pairLabel ไม่ตรง (${h.sheetYield.pairLabel})`);
  // เทียบแบบ verify (ไม่ใช้ stringify — JSONB เรียงคีย์ใหม่ตอนอ่านกลับ) จะได้รันซ้ำแล้วขึ้น "=" จริง
  const same = verify(d) && h.input?.placeholder === "ถ้าทราบ" && w.input?.placeholder === "เช่น 4";
  h.sheetYield.longestOnly = true;
  h.sheetYield.perSheetTiers = TIERS;
  h.input = { ...(h.input ?? {}), required: false, hint: HINT_H, placeholder: "ถ้าทราบ" };
  w.input = { ...(w.input ?? {}), max: MAX_LONGEST, hint: hintW(w.input?.min ?? 2), placeholder: "เช่น 4" };
  return !same;
}

function verify(d) {
  const h = (d.options ?? []).find((o) => o.label === OPT_H);
  const w = (d.options ?? []).find((o) => o.label === OPT_W);
  return (
    h?.sheetYield?.longestOnly === true &&
    // ⚠️ JSONB เรียงคีย์ใหม่ตอนอ่านกลับ ({per,upTo}) — เทียบค่าทีละข้อ ไม่เทียบ stringify ตรง ๆ
    Array.isArray(h.sheetYield.perSheetTiers) &&
    h.sheetYield.perSheetTiers.length === TIERS.length &&
    TIERS.every((t, i) => h.sheetYield.perSheetTiers[i]?.per === t.per && h.sheetYield.perSheetTiers[i]?.upTo === t.upTo) &&
    h.input?.required === false &&
    h.input?.hint === HINT_H &&
    w?.input?.max === MAX_LONGEST &&
    w.input?.hint === hintW(w.input?.min ?? 2)
  );
}

const ids = Object.keys(TARGETS);
const { data: rows, error } = await sb.from("products").select("id,name,data").in("id", ids);
if (error) die(error.message);
if (rows.length !== ids.length) die(`เจอ ${rows.length}/${ids.length} ตัว`);

const plan = [];
for (const row of rows) {
  if (row.name !== TARGETS[row.id]) die(`${row.id}: ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);
  const d = row.data;
  const changed = apply(d);
  console.log(`${changed ? "→" : "="} ${row.id} | ${row.name}${changed ? "" : " (ตรงแล้ว)"}`);
  if (changed) plan.push({ id: row.id, d });
}
if (!WRITE) {
  console.log(`\n(dry-run) ต้องแก้ ${plan.length}/${rows.length} ตัว — ใส่ --write เพื่อเขียน`);
  process.exit(0);
}

for (const { id, d } of plan) {
  d.savedAt = new Date().toISOString();
  const { data: upd, error: updErr } = await sb.from("products").update({ data: d }).eq("id", id).select("id");
  if (updErr) die(`${id}: ${updErr.message}`);
  if (!upd?.length) die(`${id}: update โดน 0 แถว`);
  const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", id).single();
  if (backErr) die(`${id}: ${backErr.message}`);
  if (!verify(back.data)) die(`${id}: อ่านกลับไม่ตรง`);
  if (back.data.savedAt !== d.savedAt) die(`${id}: savedAt อ่านกลับไม่ตรง`);
  console.log(`✓ ${id} เขียนแล้ว · savedAt ${d.savedAt}`);
}
console.log(`\n✓ เสร็จ ${plan.length} ตัว อ่านกลับตรงทุกตัว`);
