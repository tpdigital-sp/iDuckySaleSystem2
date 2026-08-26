#!/usr/bin/env node
/**
 * standee-frame-card: กลุ่มฐานสแตนดี้ → ตรรกะเดียวกับสินค้า "สแตนดี้อะคริลิค" (standy)
 *
 *   node scripts/frame-card-standy-base.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/frame-card-standy-base.mjs --write   # บันทึกจริง
 *
 * ที่มา: ผู้ใช้สั่ง 26 ส.ค. 69 (ต่อจากงานระบบฐาน prakob+standy — prakob-standy-base-system.mjs):
 *   https://iduckystore.com/products/standee-frame-card กลุ่มฐานสแตนดี้ ใช้ตรรกะเดียวกับสินค้าสแตนดี้
 *
 * ของเดิมบน standee-frame-card:
 *   • "ขนาดฐาน" เป็นแกนตารางราคา 6 ตัว (ฐาน 6-7 … 12 ซม.) ค่าฐานฝังในเซลล์เฉพาะ tier ส่ง
 *     (ช่วงปลีก 1-10 ชิ้น ราคาแบนตามขนาดตัว ไม่บวกฐาน/สกรีนฐานเลย)
 *   • "ฐานสแตนดี้" (ไม่สกรีนฐาน/สกรีนลายฐาน) ก็เป็นแกนตาราง — สกรีนลายฐานฝัง +10 เฉพาะ tier ส่ง
 *   • "ทรงฐาน" มีแล้วและตรงชุด standy อยู่แล้ว (กลม/สี่เหลี่ยมฟรี · พิเศษ ปลีก10/ส่ง5) — ไม่แตะ
 *   • ยังไม่มี สีอะคริลิคฐาน + เลือกสีพิเศษของฐาน
 *
 * ที่ทำ (ตรรกะ standy):
 *   1) ถอด "ขนาดฐาน" + "ฐานสแตนดี้" ออกจากแกนตาราง — เซลล์ใหม่ = เซลล์ฐาน 6-7 ซม.·ไม่สกรีนฐาน
 *      โดยหักค่าฐานฝัง 15 บาทออกจาก tier ส่ง (ค่าฐาน 6-7 ซม. ตามชุด standy: 6cm/7cm = extra 15)
 *   2) "ขนาดฐาน" กลายเป็นกลุ่มบวกเพิ่มชุดเดียวกับ standy: 2-20 ซม. · extraFromQty 11 ·
 *      ปลีกฟรีถึง 6 ซม. แล้ว +5/ซม. (extraBelow) · ส่งตามตาราง extra 10…80 — ขนาด 6-12 ใช้ภาพ
 *      bespoke ของ frame-card เดิม (base-N-v4) ขนาดอื่นใช้ภาพ standy (optart-base-N-v1)
 *   3) "ฐานสแตนดี้" → สกรีนลายฐาน extra 10 แบนทุกช่วง (แบบ standy/prakob)
 *   4) เพิ่ม "สีอะคริลิคฐาน" (การ์ด 3 ใบ) + "เลือกสีพิเศษของฐาน" ×19 ขนาด (เฉด 44 สี)
 *      โคลนจาก standy ทั้งชุด — showWhen ขนาดฐาน=Ncm ตรงกับชื่อตัวเลือกกลุ่มใหม่พอดี
 *
 * รันซ้ำได้ — แต่ละขั้นเช็คก่อนว่าทำไปแล้วหรือยัง (ครั้งแรกเขียนแต่เงา priceRates[0] แล้วโดน
 * การกดบันทึกจากหน้าแก้ไขสินค้าทับกลับ จึงต้องรันซ้ำได้และเขียน data.pricing ด้วย)
 *
 * ผลข้างเคียงที่ตั้งใจ (ตรรกะ standy):
 *   • ช่วงปลีก 1-10 ชิ้น: ฐาน 7 ซม.ขึ้นไปเริ่มบวก extraBelow (เดิมปลีกไม่บวกฐานเลย) และ
 *     สกรีนลายฐานบวก +10 (เดิมปลีกไม่บวก) — เรทส่ง 11+ ราคาเท่าเดิมทุกช่วงที่ตารางเดิมมี
 *   • ขนาดฐานเลือกได้กว้างขึ้น 2-20 ซม. (เดิม 6-12) — ถ้าขนาดเล็กไม่เหมาะกับตัว 15-20 ซม.
 *     ค่อยตัดตัวเลือกออกทีหลังได้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

// ค่าฐานที่ฝังใน tier ส่งของตารางเดิม (= extra ชุด standy ของขนาดนั้น) — ใช้ตรวจ+ถอด
const EMBED = {
  "ฐาน 6-7 ซม.": 15,
  "ฐาน 8 ซม.": 20,
  "ฐาน 9 ซม.": 25,
  "ฐาน 10 ซม.": 30,
  "ฐาน 11 ซม.": 35,
  "ฐาน 12 ซม.": 40,
};
const REF_BASE = "ฐาน 6-7 ซม.";
const PLAIN = "ไม่สกรีนฐาน";
const PRINTED = "สกรีนลายฐาน";
// ภาพ bespoke ของ frame-card เดิม ต่อขนาดฐานใหม่ (6cm/7cm ใช้ภาพ ฐาน 6-7 ร่วมกัน)
const KEEP_IMG = { "6cm": REF_BASE, "7cm": REF_BASE, "8cm": "ฐาน 8 ซม.", "9cm": "ฐาน 9 ซม.", "10cm": "ฐาน 10 ซม.", "11cm": "ฐาน 11 ซม.", "12cm": "ฐาน 12 ซม." };
const BASE_COLOR_LABEL = "สีอะคริลิคฐาน";

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

const get = async (id) => {
  const { data, error } = await sb.from("products").select("id,data").eq("id", id).single();
  if (error) throw new Error(`อ่าน ${id} ไม่ได้ — ${error.message}`);
  return structuredClone(data.data);
};
const [standy, fc] = await Promise.all([get("standy"), get("standee-frame-card")]);
const grp = (d, l) => (d.options ?? []).find((o) => o.label === l);

// ── ต้นแบบจาก standy ──────────────────────────────────────────────────────────
const srcBaseSize = grp(standy, "ขนาดฐาน");
const srcColorCards = grp(standy, BASE_COLOR_LABEL);
const srcSpecials = (standy.options ?? []).filter((o) => o.label.startsWith("เลือกสีพิเศษของฐาน (ขนาดฐาน "));
if (!srcBaseSize || srcBaseSize.extraFromQty !== 11 || !srcColorCards || srcSpecials.length !== 19)
  throw new Error("ต้นแบบ standy เปลี่ยนโครง (ขนาดฐาน extraFromQty 11 / สีอะคริลิคฐาน / เลือกสีพิเศษของฐาน ×19) — ตรวจก่อน");

// ── 1) ถอดขนาดฐาน+ฐานสแตนดี้ออกจากเซลล์ (ตรวจทุกเซลล์ก่อนว่าสูตรถอดลงตัวเป๊ะ) ────
/**
 * ⚠️ ตารางของ "เรทที่ 1" เก็บไว้ 2 ที่: data.pricing = ตัวจริงที่หน้าแก้ไขสินค้าใช้ ·
 * priceRates[0].pricing = เงาที่หน้าร้านอ่าน (ProductEditor สร้างเงาจากตัวจริงทุกครั้งที่กดบันทึก)
 * แก้ที่เดียวไม่พอ — ครั้งแรกแก้แต่เงา พอมีคนกดบันทึกจากหน้าแก้ไข ตารางเก่ากลับมาทั้งดุ้น
 */
const r1 = (fc.priceRates ?? []).find((r) => r.id === "r1");
if (!r1) throw new Error("frame-card ไม่มีเรท r1 — โครงเปลี่ยน ตรวจก่อน");
const OLD_DRIVERS = ["ขนาดตัวสแตนดี้", "ขนาดฐาน", "ฐานสแตนดี้", "งานสกรีน"];
const NEW_DRIVERS = ["ขนาดตัวสแตนดี้", "งานสกรีน"];
const drivers = (m) => JSON.stringify(m.driverLabels);
if (drivers(fc.pricing) !== drivers(r1.pricing))
  throw new Error("ตารางตัวจริง (data.pricing) กับเงา (priceRates[0]) แกนไม่ตรงกัน — ตรวจก่อน");

if (drivers(fc.pricing) === JSON.stringify(NEW_DRIVERS)) {
  console.log(`📦 ${fc.name}: ตารางแปลงแล้ว (${Object.keys(fc.pricing.cells).length} ช่อง) — ข้ามขั้นถอดฐาน`);
} else {
  if (drivers(fc.pricing) !== JSON.stringify(OLD_DRIVERS))
    throw new Error(`แกนตารางไม่ตรงที่คาด (${fc.pricing.driverLabels.join(",")}) — โครงเปลี่ยน ตรวจก่อน`);
  const oldCells = fc.pricing.cells;
  const newCells = {};
  let checked = 0;
  for (const key of Object.keys(oldCells)) {
    const [body, base, screen, print] = key.split("│");
    if (!(base in EMBED) || (screen !== PLAIN && screen !== PRINTED))
      throw new Error(`คีย์เซลล์ไม่เข้าสูตร "${key}" — ตรวจก่อน`);
    const ref = oldCells[[body, REF_BASE, PLAIN, print].join("│")];
    if (!ref) throw new Error(`ไม่มีเซลล์อ้างอิง ${REF_BASE}·${PLAIN} ของ "${key}" — ตรวจก่อน`);
    const bare = ref.map((v, i) => (i === 0 ? v : v - EMBED[REF_BASE]));
    oldCells[key].forEach((v, i) => {
      // ช่วงปลีก (tier แรก) เดิมแบนไม่บวกฐาน/สกรีนฐาน · tier ส่งฝังค่าฐาน+สกรีน 10 คงที่
      const expect = i === 0 ? bare[0] : bare[i] + EMBED[base] + (screen === PRINTED ? 10 : 0);
      if (v !== expect)
        throw new Error(`เซลล์ "${key}" tier ${i} ไม่เข้าสูตรถอดฐาน (${v} ≠ ${expect}) — ตรวจก่อน`);
    });
    newCells[[body, print].join("│")] = bare;
    checked++;
  }
  fc.pricing = { ...fc.pricing, driverLabels: [...NEW_DRIVERS], cells: newCells };
  r1.pricing = structuredClone(fc.pricing);
  console.log(`📦 ${fc.name}: ตรวจ ${checked} เซลล์ผ่าน → ตารางใหม่ ${Object.keys(newCells).length} ช่อง (แกน ขนาดตัว×งานสกรีน) · เขียนทั้ง data.pricing และ priceRates[0]`);
}

// ── 2) กลุ่มขนาดฐาน = ชุด standy (คงภาพ bespoke 6-12 ซม. + stockBearing เดิม) ────
const fcBaseOld = grp(fc, "ขนาดฐาน");
if (!fcBaseOld) throw new Error("frame-card ไม่มีกลุ่มขนาดฐาน — ตรวจก่อน");
if (fcBaseOld.extraFromQty === 11) {
  console.log(`   ขนาดฐาน: เป็นชุด standy อยู่แล้ว (${fcBaseOld.choices.length} ตัว) — ข้าม`);
} else {
  const oldImg = Object.fromEntries(fcBaseOld.choices.map((c) => [c.name, c.imageSrc]));
  const newBase = structuredClone(srcBaseSize);
  newBase.stockBearing = true;
  for (const c of newBase.choices) if (KEEP_IMG[c.name] && oldImg[KEEP_IMG[c.name]]) c.imageSrc = oldImg[KEEP_IMG[c.name]];
  fc.options[fc.options.indexOf(fcBaseOld)] = newBase;
  console.log(`   ขนาดฐาน: ${fcBaseOld.choices.length} ตัว (แกนตาราง) → ${newBase.choices.length} ตัว 2-20 ซม. (extraFromQty 11 · ปลีก +5/ซม. จาก 7 ซม.)`);
}

// ── 3) ฐานสแตนดี้: สกรีนลายฐาน +10 แบนทุกช่วง ────────────────────────────────
const fcScreen = grp(fc, "ฐานสแตนดี้");
const printed = fcScreen?.choices.find((c) => c.name === PRINTED);
if (!printed) throw new Error(`ไม่พบตัวเลือก "${PRINTED}" ในกลุ่มฐานสแตนดี้ — ตรวจก่อน`);
printed.extra = 10;
console.log(`   ฐานสแตนดี้: ${PRINTED} = +10 บาท/ชิ้นทุกช่วง (เดิมฝังในตารางเฉพาะเรทส่ง)`);

// ── 4) สีอะคริลิคฐาน + เลือกสีพิเศษของฐาน ×19 (โคลนจาก standy ทั้งชุด) ─────────
if (grp(fc, BASE_COLOR_LABEL)) {
  console.log(`   ${BASE_COLOR_LABEL} + เลือกสีพิเศษของฐาน: มีอยู่แล้ว — ข้าม`);
} else {
  fc.options.push(structuredClone(srcColorCards), ...srcSpecials.map((o) => structuredClone(o)));
  console.log(`   + ${BASE_COLOR_LABEL} (${srcColorCards.choices.length}) · เลือกสีพิเศษของฐาน ×${srcSpecials.length} (เฉด ${srcSpecials[0].choices.length} สี)`);
}

// ── ช่วงราคาบนการ์ดสินค้า (สูตรเดียวกับ prakob-standy-base-system) ─────────────
{
  const all = fc.priceRates.flatMap((r) => Object.values(r.pricing.cells).flat()).filter((n) => n > 0);
  fc.priceMin = Math.min(...all);
  fc.priceMax = Math.max(...all);
  fc.price = fc.priceMin;
}
fc.savedAt = new Date().toISOString();
console.log(`   ช่วงราคาใหม่: ฿${fc.priceMin} – ฿${fc.priceMax} · รวมกลุ่มตัวเลือก ${fc.options.length}`);

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
const up = await sb.from("products").update({ data: fc, price: fc.price }).eq("id", "standee-frame-card");
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log("✅ บันทึก standee-frame-card แล้ว (data + คอลัมน์กระจก price)");
