#!/usr/bin/env node
/**
 * สแตนดี้อะคริลิค (standy) — ช่วงปลีก 1-10 ชิ้น ฐานตั้งแต่ 7 ซม. ขึ้นไป คิด ซม. ละ 5 บาท
 *
 *   node scripts/standy-base-retail-fee.mjs           # ดูผลก่อน (ไม่เขียนฐานข้อมูล)
 *   node scripts/standy-base-retail-fee.mjs --write   # บันทึกจริง
 *
 * เดิมกลุ่ม "ขนาดฐาน" ตั้ง extraFromQty = 11 → ช่วง 1-10 ชิ้นไม่คิดค่าฐานเลย (รวมในราคาแล้ว)
 * ส่วน 11 ชิ้นขึ้นไปคิดตามตาราง extra ของแต่ละขนาด
 *
 * ทางร้านแจ้งใหม่: ช่วงปลีกก็ต้องคิดค่าฐานถ้าฐานใหญ่เกิน 6 ซม. — ซม. ละ 5 บาท
 *   6 ซม. ลงมา = ไม่คิด (รวมในราคาแล้ว)
 *   7 ซม. = +5 · 8 ซม. = +10 · … · 20 ซม. = +70   (5 × (ขนาด − 6))
 *
 * เก็บที่ choice.extraBelow ซึ่งเป็น "+฿ ของช่วงที่ยังไม่ถึง extraFromQty"
 * (ฟิลด์ใหม่ ดู src/lib/products.ts — ของเดิม extra ยังเป็นเรทส่งเหมือนเดิม ไม่แตะ)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

const ID = "standy";
const GROUP = "ขนาดฐาน";
/** ฐานเล็กกว่านี้ไม่คิดเพิ่มในช่วงปลีก */
const FREE_UP_TO_CM = 6;
const BAHT_PER_CM = 5;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่สำเร็จ: ${error.message}`);
const d = structuredClone(row.data);

const opt = (d.options ?? []).find((o) => o.label === GROUP);
if (!opt) throw new Error(`ไม่เจอกลุ่ม "${GROUP}"`);
if (!opt.extraFromQty) throw new Error(`กลุ่ม "${GROUP}" ไม่ได้ตั้ง extraFromQty — เรทช่วงปลีกจะไม่ถูกใช้`);

console.log(`📦 ${d.name} (${ID}) · กลุ่ม "${GROUP}" คิดเรทส่งตั้งแต่ ${opt.extraFromQty} ชิ้นขึ้นไป`);
console.log(`   ช่วงปลีก (1-${opt.extraFromQty - 1} ชิ้น): ฐานเกิน ${FREE_UP_TO_CM} ซม. คิด ซม. ละ ${BAHT_PER_CM} บาท\n`);
console.log("   ขนาดฐาน   ปลีก 1-10 ชิ้น   ส่ง 11+ ชิ้น");
for (const c of opt.choices) {
  const cm = Number((c.name.match(/(\d+)\s*cm/i) ?? [])[1]);
  if (!Number.isFinite(cm)) throw new Error(`อ่านขนาดจากชื่อ "${c.name}" ไม่ออก — ไม่บันทึก`);
  const below = cm > FREE_UP_TO_CM ? (cm - FREE_UP_TO_CM) * BAHT_PER_CM : 0;
  if (below) c.extraBelow = below;
  else delete c.extraBelow;
  console.log(
    `   ${c.name.padEnd(9)} ${(below ? `+${below}` : "ไม่คิด").padStart(12)}   ${(c.extra ? `+${c.extra}` : "-").padStart(10)}`
  );
}

// แท็บที่อธิบายค่าฐาน — เขียนให้ตรงกับที่คิดจริง
const tab = (d.tabs ?? []).find((t) => t.title === "Add-on / อุปกรณ์เสริม");
const LINE = `• ช่วงปลีก 1-${opt.extraFromQty - 1} ชิ้น: ฐานไม่เกิน ${FREE_UP_TO_CM} ซม. รวมในราคาแล้ว · ตั้งแต่ ${FREE_UP_TO_CM + 1} ซม. ขึ้นไป คิดเพิ่ม ซม. ละ ${BAHT_PER_CM} บาท (ระบบคิดให้แล้ว)`;
if (tab && !tab.text.includes(LINE)) {
  const lines = tab.text.split("\n");
  const at = lines.findIndex((l) => /ราคาในตารางรวมแล้ว/.test(l));
  lines.splice(at >= 0 ? at + 1 : lines.length, 0, LINE);
  tab.text = lines.join("\n");
  console.log(`\n   แท็บ "${tab.title}": เพิ่มบรรทัดอธิบายค่าฐานช่วงปลีก`);
}

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw new Error(`บันทึกไม่สำเร็จ: ${saveErr.message}`);
console.log(`\n✅ บันทึกแล้ว: ${ID}`);
