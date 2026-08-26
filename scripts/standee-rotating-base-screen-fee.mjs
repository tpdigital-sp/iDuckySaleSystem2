#!/usr/bin/env node
/**
 * สแตนดี้อะคริลิค หมุนได้ (standee-rotating) — ค่า "สกรีนลายฐาน" บวกเพิ่มตามขนาดฐาน
 *
 *   node scripts/standee-rotating-base-screen-fee.mjs           # ตรวจ/ดูก่อน (ไม่เขียน)
 *   node scripts/standee-rotating-base-screen-fee.mjs --write    # บันทึกจริง
 *
 * ผู้ใช้สั่ง 26 ส.ค. 69 — ยืนยันอัตราค่าสกรีนลายฐาน:
 *   ฐาน 5-6 ซม. +10 · 7-8 ซม. +15 · 9-10 ซม. +20 · 11-12 ซม. +25 บาท/ชิ้น
 *   (ฐาน "3-5 ซม. (มาตรฐาน)" นับเป็นช่วง 5-6 ซม. = +10)
 *
 * สคริปต์นี้ทำ 2 อย่าง:
 *   1) บังคับตารางราคาให้ตรงสูตร — เซลล์ "สกรีนลายฐาน" = เซลล์ "ไม่สกรีนฐาน" + ค่าตามขนาดฐาน ทุกช่วงจำนวน
 *      (ค่าสกรีนฐานเป็น "แกนที่ 3" ของตาราง ไม่ใช่ option.extra เพราะไม่เท่ากันทุกขนาดฐาน)
 *   2) เขียนอัตราให้ลูกค้าเห็นตอนเลือก — note ใต้ชื่อกลุ่ม + desc บนการ์ด "สกรีนลายฐาน"
 *      ⛔ ไม่ติดป้าย +฿ บนการ์ด เพราะเป็นส่วนต่างของแกนตารางเรท (เคย revert มาแล้ว)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "standee-rotating";
const SIZE_LABEL = "ขนาดฐาน";
const SCREEN_LABEL = "สกรีนลายฐาน";
const SCREEN_NO = "ไม่สกรีนฐาน";
const SCREEN_YES = "สกรีนลายฐาน";

/** ขนาดฐานเป็นตัวเลข ซม. — "3-5 ซม. (มาตรฐาน)" = 5 */
const baseCmOf = (name) => {
  const m = name.match(/(\d+)\s*ซม\./);
  if (!m) throw new Error(`อ่านขนาดฐานจาก "${name}" ไม่ออก — ชื่อตัวเลือกเปลี่ยน ตรวจก่อน`);
  return Number(m[1]);
};
/** อัตราค่าสกรีนลายฐาน ต่อชิ้น (เท่ากันทุกช่วงจำนวน) */
const screenFee = (cm) => (cm <= 6 ? 10 : cm <= 8 ? 15 : cm <= 10 ? 20 : 25);

const NOTE = "ค่าสกรีนลายฐานคิดตามขนาดฐาน — 5-6 ซม. +10 · 7-8 ซม. +15 · 9-10 ซม. +20 · 11-12 ซม. +25 บาท/ชิ้น";
const DESC_YES = "พิมพ์ลายของคุณลงบนฐานด้วย · คิดเพิ่ม 10-25 บาท/ชิ้น ตามขนาดฐาน";

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

const { data, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) throw new Error(`อ่าน ${ID} ไม่ได้ — ${error.message}`);
const d = structuredClone(data.data);

// ── 1) ตารางราคา ─────────────────────────────────────────────────────────────
const matrices = [d.pricing, ...(d.priceRates ?? []).map((r) => r.pricing)].filter(Boolean);
if (!matrices.length) throw new Error("ไม่มีตารางราคา — โครงสินค้าเปลี่ยน ตรวจก่อน");
let changed = 0;
const seen = new Map(); // ขนาดฐาน → ค่าที่คิดจริง (ไว้พิมพ์สรุป)
for (const m of matrices) {
  const iSize = m.driverLabels.indexOf(SIZE_LABEL);
  const iScr = m.driverLabels.indexOf(SCREEN_LABEL);
  if (iSize < 0 || iScr < 0)
    throw new Error(`แกนตาราง ${JSON.stringify(m.driverLabels)} ไม่มี "${SIZE_LABEL}"/"${SCREEN_LABEL}" — ตรวจก่อน`);
  for (const key of Object.keys(m.cells)) {
    const parts = key.split("│");
    if (parts[iScr] !== SCREEN_YES) continue;
    const off = [...parts];
    off[iScr] = SCREEN_NO;
    const base = m.cells[off.join("│")];
    if (!base) throw new Error(`ไม่มีเซลล์คู่ "${off.join("│")}" — ถอดค่าสกรีนฐานไม่ได้ ตรวจก่อน`);
    const fee = screenFee(baseCmOf(parts[iSize]));
    const want = base.map((v) => v + fee);
    seen.set(parts[iSize], fee);
    if (JSON.stringify(m.cells[key]) !== JSON.stringify(want)) {
      console.log(`  แก้ ${key}: ${JSON.stringify(m.cells[key])} → ${JSON.stringify(want)}`);
      m.cells[key] = want;
      changed++;
    }
  }
}
console.log(
  `💰 ตารางราคา: ${changed === 0 ? "ตรงสูตรอยู่แล้ว (ไม่มีเซลล์ต้องแก้)" : `แก้ ${changed} เซลล์`}\n   ` +
    [...seen.entries()].map(([n, f]) => `${n} +${f}`).join(" · ")
);

// ── 2) ข้อความบอกอัตราให้ลูกค้าเห็น ──────────────────────────────────────────
const grp = (d.options ?? []).find((o) => o.label === SCREEN_LABEL);
if (!grp) throw new Error(`ไม่มีกลุ่ม "${SCREEN_LABEL}" — ตรวจก่อน`);
const yes = grp.choices.find((c) => c.name === SCREEN_YES);
if (!yes) throw new Error(`กลุ่ม "${SCREEN_LABEL}" ไม่มีตัวเลือก "${SCREEN_YES}" — ตรวจก่อน`);
const before = { note: grp.note, desc: yes.desc };
grp.note = NOTE;
yes.desc = DESC_YES;
console.log(`📝 กลุ่ม "${SCREEN_LABEL}"`);
console.log(`   note: ${before.note ?? "(ไม่มี)"} → ${grp.note}`);
console.log(`   desc: ${before.desc ?? "(ไม่มี)"} → ${yes.desc}`);

// ช่วงราคาบนการ์ดสินค้า — คิดใหม่จากเซลล์ทุกเรท
{
  const all = matrices.flatMap((m) => Object.values(m.cells).flat()).filter((n) => n > 0);
  d.priceMin = Math.min(...all);
  d.priceMax = Math.max(...all);
  console.log(`   ช่วงราคา: ฿${d.priceMin} – ฿${d.priceMax}`);
}
d.savedAt = new Date().toISOString();

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
const up = await sb.from("products").update({ data: d, price: d.price }).eq("id", ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log(`✅ บันทึก ${ID} แล้ว`);
