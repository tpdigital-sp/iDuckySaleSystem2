#!/usr/bin/env node
/**
 * สแตนดี้ + คลิปหนีบ: ย้ายค่าฐานจาก "ฝังในตารางเรท" → กลุ่ม "ขนาดฐาน" คิดแบบบวกเพิ่ม (ตรรกะ standy)
 *
 *   node scripts/standee-clip-base-addon.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/standee-clip-base-addon.mjs --write   # บันทึกจริง
 *
 * ที่มา: ผู้ใช้สั่ง 26 ส.ค. 69 — เมนูเลือกขนาดฐาน (ภาพหน้าเว็บ /products/standee-clip) ไม่ขึ้นราคา
 * บวกเพิ่มข้างตัวเลือกเหมือน standy/อะคริลิคประกบที่เพิ่งทำ ทั้งที่ตารางคิดค่าฐานอยู่แล้ว
 * → แปลงให้เหมือนพี่น้อง: dropdown ขึ้น "+฿" อัตโนมัติ (ปลีกใช้ extraBelow · ส่ง 11+ ใช้ extra)
 *
 * ตรวจแล้วก่อนผ่า: ส่วนต่างในเซลล์ตรงชาร์ต "ราคาฐาน สแตนดี้" + ตรรกะ standy ทุกช่อง
 *   เรทส่ง 11+ (extra):   ฐาน 3-5 → 10 · 6-7 → 15 · 8 → 20 · 9 → 25 · 10 → 30 · 11 → 35 · 12 → 40
 *   ช่วงปลีก 1-10 (extraBelow): ฐาน ≤6 รวมในราคาแล้ว (0) · ฐาน 7 ขึ้นไป +5/ซม.
 * เซลล์ใหม่ = เซลล์ ฐาน 3-5 เดิม ลบ 10 เฉพาะ tier ส่ง (ปลีกฐาน 3-5 ไม่เคยบวก) — ราคารวมทุกช่วง
 * ทุกคอมโบเท่าเดิมเป๊ะ สคริปต์ assert ครบทุกเซลล์ทุก tier ก่อนเขียน ผิดช่องเดียว = ยกเลิกทั้งงาน
 *
 * ผลพลอยได้: ตาราง 960 → 120 ช่อง · driverLabels เหลือ 3 แกน · ป้าย +฿ ในตะกร้าติดให้ค่าฐานเอง
 * (ถูกกติกา cart fee badge — ตอนนี้ค่าฐานเป็น addOn จริง ไม่ใช่ส่วนต่างของแกนตาราง)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

const BASE_LABEL = "ขนาดฐาน";
const BASELINE = "ฐาน 3-5 ซม.";
/** ค่าฐานตามชาร์ตร้าน (extra = เรทส่ง 11+ · below = ส่วนเพิ่มช่วงปลีกเทียบฐานเล็กสุด) */
const BASE_FEE = {
  "ฐาน 3-5 ซม.": { extra: 10, below: 0 },
  "ฐาน 6 ซม.": { extra: 15, below: 0 },
  "ฐาน 7 ซม.": { extra: 15, below: 5 },
  "ฐาน 8 ซม.": { extra: 20, below: 10 },
  "ฐาน 9 ซม.": { extra: 25, below: 15 },
  "ฐาน 10 ซม.": { extra: 30, below: 20 },
  "ฐาน 11 ซม.": { extra: 35, below: 25 },
  "ฐาน 12 ซม.": { extra: 40, below: 30 },
};

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

const { data: row, error } = await sb.from("products").select("id,data").eq("id", "standee-clip").single();
if (error) throw new Error(`อ่าน standee-clip ไม่ได้ — ${error.message}`);
const d = structuredClone(row.data);

// ── 1) ผ่าตารางเรท: ตัดแกนขนาดฐาน · เซลล์ = ฐาน 3-5 หัก 10 เฉพาะ tier ส่ง ─────────
const rate = d.priceRates?.[0];
if (!rate || d.priceRates.length !== 1) throw new Error("โครงเรทเปลี่ยน (ไม่ใช่เรทเดียว) — ตรวจก่อน");
const p = rate.pricing;
const bi = p.driverLabels.indexOf(BASE_LABEL);
if (bi < 0) throw new Error(`driverLabels ไม่มี "${BASE_LABEL}" — ผ่าไปแล้วหรือโครงเปลี่ยน ไม่ต้องรันซ้ำ`);
const tierCount = p.tiers.length; // tier 0 = ปลีก 1-10 · ที่เหลือเรทส่ง

const newCells = {};
let checked = 0;
for (const key of Object.keys(p.cells)) {
  const parts = key.split("│");
  const base = parts[bi];
  const fee = BASE_FEE[base];
  if (!fee) throw new Error(`เจอขนาดฐานนอกชาร์ต "${base}" ในเซลล์ "${key}" — ตรวจก่อน`);
  const slim = parts.filter((_, i) => i !== bi).join("│");
  const ref = p.cells[key.split("│").map((v, i) => (i === bi ? BASELINE : v)).join("│")];
  if (!ref) throw new Error(`ไม่มีเซลล์ฐานอ้างอิง (${BASELINE}) คู่กับ "${key}" — ตรวจก่อน`);
  const cell = ref.map((v, i) => v - (i === 0 ? BASE_FEE[BASELINE].below : BASE_FEE[BASELINE].extra));
  // ราคารวมต้องเท่าเดิมทุก tier: เซลล์เดิม = เซลล์ใหม่ + ค่าฐานของช่วงนั้น
  const old = p.cells[key];
  if (old.length !== tierCount || cell.length !== tierCount)
    throw new Error(`จำนวน tier ในเซลล์ "${key}" ไม่ตรง (${old.length}) — ตรวจก่อน`);
  old.forEach((v, i) => {
    const rebuilt = cell[i] + (i === 0 ? fee.below : fee.extra);
    if (v !== rebuilt)
      throw new Error(`ราคาไม่ตรงที่ "${key}" tier ${p.tiers[i].label}: เดิม ${v} ≠ ประกอบใหม่ ${rebuilt} — ยกเลิก`);
  });
  const seen = newCells[slim];
  if (seen && seen.join() !== cell.join())
    throw new Error(`เซลล์ยุบแล้วชนกันที่ "${slim}" (${seen.join()} ≠ ${cell.join()}) — ยกเลิก`);
  newCells[slim] = cell;
  checked++;
}
console.log(`🔬 ตรวจครบ ${checked} เซลล์ × ${tierCount} tier — ราคารวมเท่าเดิมทุกช่อง`);
console.log(`📉 ตาราง ${Object.keys(p.cells).length} → ${Object.keys(newCells).length} ช่อง`);
p.cells = newCells;
p.driverLabels = p.driverLabels.filter((l) => l !== BASE_LABEL);
console.log(`   driverLabels: ${JSON.stringify(p.driverLabels)}`);

// ── 2) กลุ่มขนาดฐาน → บวกเพิ่มแบบ standy (ชื่อ/รูป/ลำดับเดิมทุกตัว) ─────────────────
const grp = (d.options ?? []).find((o) => o.label === BASE_LABEL);
if (!grp) throw new Error(`ไม่มีกลุ่ม "${BASE_LABEL}" — ตรวจก่อน`);
const names = grp.choices.map((c) => c.name);
const expected = Object.keys(BASE_FEE);
if (names.join("|") !== expected.join("|"))
  throw new Error(`ตัวเลือกขนาดฐานไม่ตรงชาร์ต (${names.join(", ")}) — ตรวจก่อน`);
grp.extraFromQty = 11;
grp.choices = grp.choices.map((c) => ({
  ...c,
  extra: BASE_FEE[c.name].extra,
  ...(BASE_FEE[c.name].below ? { extraBelow: BASE_FEE[c.name].below } : {}),
}));
console.log(`🏷️ ${BASE_LABEL}: extraFromQty 11 · ` + grp.choices.map((c) => `${c.name} +${c.extra}${c.extraBelow ? `/ปลีก ${c.extraBelow}` : ""}`).join(" · "));

// ── 3) ข้อความที่อ้างว่า "ค่าฐานรวมในตารางแล้ว" ───────────────────────────────────
const oldDesc = rate.desc;
rate.desc = "อะคริลิคใส / ขาวขุ่น C-02 หนา 3 มม. · ราคารวมคลิปหนีบแล้ว — ค่าฐานบวกตามขนาดฐานที่เลือก";
console.log(`✏️ desc เรท: "${oldDesc}" → "${rate.desc}"`);

const tab = (d.tabs ?? []).find((t) => (t.text ?? "").includes("รวมฐานถึง 6"));
if (!tab) throw new Error("หาแท็บที่อธิบายค่าฐานไม่เจอ — ข้อความเปลี่ยน ตรวจก่อน");
tab.text = tab.text
  .replace(
    "ฐาน 7 ซม. ขึ้นไป เพิ่ม ซม. ละ 5 บาท · สกรีนลายฐานเพิ่ม 10 บาท/ชิ้น (ระบบคิดให้ในตารางแล้ว)",
    "ฐาน 7 ซม. ขึ้นไป เพิ่ม ซม. ละ 5 บาท (ระบบบวกให้เมื่อเลือกขนาดฐาน) · สกรีนลายฐานเพิ่ม 10 บาท/ชิ้น (ระบบคิดให้ในตารางแล้ว)"
  )
  .replace(
    "ไม่สกรีนฐาน 10-40 บาท · สกรีนลายฐาน 20-50 บาท (ระบบรวมให้ในตารางแล้ว)",
    "ไม่สกรีนฐาน 10-40 บาท · สกรีนลายฐาน 20-50 บาท (ระบบบวกให้เมื่อเลือกขนาดฐาน)"
  );
if (tab.text.includes("ระบบรวมให้ในตารางแล้ว")) throw new Error("แก้ข้อความแท็บไม่เข้า — ข้อความต้นทางเปลี่ยน ตรวจก่อน");
console.log("✏️ แท็บขนาดและสเปกงาน: ปรับหมายเหตุค่าฐาน 2 จุด");

// ── 4) ช่วงราคาการ์ดสินค้า (สูตรเดียวกับ priceRange จากเซลล์ — แบบเดียวกับ standy/prakob) ──
const all = d.priceRates.flatMap((r) => Object.values(r.pricing.cells).flat()).filter((n) => n > 0);
const [oldMin, oldMax] = [d.priceMin, d.priceMax];
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);
console.log(`💰 ช่วงราคา: ฿${oldMin}–฿${oldMax} → ฿${d.priceMin}–฿${d.priceMax} (ค่าฐานไปโชว์เป็น +฿ เหมือน standy)`);

d.savedAt = new Date().toISOString();

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
const up = await sb.from("products").update({ data: d }).eq("id", "standee-clip");
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log("✅ บันทึก standee-clip แล้ว");
