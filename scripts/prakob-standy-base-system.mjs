#!/usr/bin/env node
/**
 * ระบบฐานสแตนดี้ (ขนาดฐาน / ทรงฐาน / สีอะคริลิคพิเศษของฐาน) — 2 สินค้าพร้อมกัน
 *
 *   node scripts/prakob-standy-base-system.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/prakob-standy-base-system.mjs --write   # บันทึกจริง
 *
 * ที่มา: ผู้ใช้สั่ง 26 ส.ค. 69 (ต่อจากงานอะคริลิคประกบ):
 *   • สแตนดี้ [เรทสแตนดี้ของอะคริลิคประกบ] มีขนาดฐานด้วย — ใช้ตรรกะเดียวกับ "สแตนดี้อะคริลิค" (standy)
 *   • ฐานทรงกลม / สี่เหลี่ยม ฟรี · ฐานทรงอื่นบวกเพิ่ม (ใช้ค่าตามชาร์ตร้าน: ปลีก +10 · ส่ง 11+ ชิ้น +5
 *     — ชุดเดียวกับ "ทรงฐาน" ของ standee-keyring ดู add-standee-keyring.ts "ฐานทรงพิเศษ")
 *   • ฐานเลือกเป็นสีอะคริลิคพิเศษได้ คิดเพิ่มตามขนาดฐาน ตามตาราง "Add on อะคริลิคพิเศษ สำหรับ
 *     ตัวสแตนดี้ และฐาน": ปลีก 2-10 ซม. +10 · ส่ง 2-5=5 / 6-8=8 / 9-10=10 · 11 ซม. ขึ้นไป
 *     สองเรทเท่ากัน 15 20 25 30 35 40 45 50 55 60 (ไล่ถึงฐาน 20 ซม. ตามชุด standee-keyring)
 *   • เพิ่มทั้งที่ acrylic-prakob และที่ standy (/products/สแตนดี้) ด้วย
 *
 * วิธี (ยืมของที่มีอยู่แล้วทั้งหมด ไม่สร้างภาพใหม่):
 *   ขนาดฐาน   ← กลุ่มของ standy ทั้งชุด (extra = เรทส่ง 11+ · extraBelow = ส่วนเพิ่มช่วงปลีกจาก 7cm ขึ้นไป
 *               · extraFromQty 11 · ภาพ optart-base-*)  — ใส่ให้ prakob (standy มีอยู่แล้ว)
 *   ทรงฐาน    ← กลุ่มของ standee-keyring ทั้งชุด (กลม/สี่เหลี่ยมฟรี · ทรงพิเศษ smallQtyFee 10 ช่วง 1-10
 *               · extra 5 ตั้งแต่ 11 ชิ้น · ภาพ baseshape-*) — ใส่ทั้ง 2 สินค้า
 *   สีอะคริลิคฐาน ← การ์ด 3 ใบจากกลุ่ม "สีอะคริลิค" ของ standee-keyring (ใส / C-02 / อะคริลิคพิเศษ)
 *   เลือกสีพิเศษของฐาน (ขนาดฐาน N ซม.) ×19 ← เฉดสี 44 ตัวจากกลุ่ม "เลือกสีพิเศษ" ของ standee-keyring
 *               โชว์ตาม ขนาดฐาน=Ncm และ สีอะคริลิคฐาน=อะคริลิคพิเศษ — ใส่ทั้ง 2 สินค้า
 *
 * ⚠️ ตาราง r-stand ของ prakob เดิม "ฝังค่าฐานตามขนาดตัว" ไว้ในเซลล์ (ฐานไม่สกรีน = เรทพวงกุญแจ
 *    +10/15/20/25/30 ตามขนาดตัว · สกรีนลาย +10 จากนั้น — ตรวจแล้วคงที่ทุก tier) ถ้าเพิ่มกลุ่ม
 *    ขนาดฐานทับไปเฉย ๆ จะคิดค่าฐานซ้ำ 2 ทาง → สคริปต์นี้ถอดค่าฐานออกจากเซลล์ (ฐานไม่สกรีน =
 *    เท่าเรทพวงกุญแจ · ฐานสกรีนลาย = +10 ค่าพิมพ์ฐาน) แล้วให้กลุ่ม "ขนาดฐาน" คิดค่าฐานแทน
 *    ผลข้างเคียงที่ตั้งใจ: ช่วงปลีก 1-10 ชิ้น ฐาน ≤6 ซม. ไม่บวกเพิ่มแล้ว (ตรรกะ standy) —
 *    ราคาปลีกสแตนดี้ ≤6 ซม. ถูกลง 10-15 บาทจากเดิม · เรทส่ง 11+ ราคาเท่าเดิมเมื่อฐาน = ขนาดตัว
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

// ค่าสีพิเศษของฐาน ต่อชิ้น ตามขนาดฐาน (เรทส่ง 11+ · ช่วงปลีก 1-10 ใช้ smallQtyFee 10 เมื่อถูกกว่า 10)
const SPECIAL_FEE = {
  2: 5, 3: 5, 4: 5, 5: 5,
  6: 8, 7: 8, 8: 8,
  9: 10, 10: 10,
  11: 15, 12: 20, 13: 25, 14: 30, 15: 35, 16: 40, 17: 45, 18: 50, 19: 55, 20: 60,
};
const BASE_SIZES = Object.keys(SPECIAL_FEE).map(Number);
const BASE_COLOR_LABEL = "สีอะคริลิคฐาน";
const SPECIAL_CARD = "อะคริลิคพิเศษ (สี / กลิตเตอร์ / โฮโลแกรม)";
const BASE_ON = { label: "ฐาน", choices: ["ฐานไม่สกรีน", "ฐานสกรีนลาย"] }; // เงื่อนไข "มีฐาน" ของ prakob

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
const [standy, sk, pk] = await Promise.all([get("standy"), get("standee-keyring"), get("acrylic-prakob")]);
const grp = (d, l) => (d.options ?? []).find((o) => o.label === l);

// ── ชิ้นส่วนที่ยืมจากสินค้าต้นแบบ ──────────────────────────────────────────────
const srcBaseSize = grp(standy, "ขนาดฐาน");
const srcShape = grp(sk, "ทรงฐาน");
const srcColorCards = grp(sk, "สีอะคริลิค");
const srcSpecial = (sk.options ?? []).find((o) => o.label.startsWith("เลือกสีพิเศษ (ขนาด 3"));
if (!srcBaseSize || !srcShape || !srcColorCards || !srcSpecial)
  throw new Error("ต้นแบบเปลี่ยนโครง (standy.ขนาดฐาน / sk.ทรงฐาน / sk.สีอะคริลิค / sk.เลือกสีพิเศษ) — ตรวจก่อน");
if (!srcColorCards.choices.some((c) => c.name === SPECIAL_CARD))
  throw new Error(`การ์ดสี sk ไม่มีตัวเลือก "${SPECIAL_CARD}" — ชื่อเปลี่ยน ตรวจก่อน`);

const colorNames = srcSpecial.choices.map((c) => ({ name: c.name, imageSrc: c.imageSrc }));
console.log(`🎨 เฉดสีพิเศษจาก standee-keyring: ${colorNames.length} เฉด`);

const feeText = (n) => {
  const fee = SPECIAL_FEE[n];
  if (fee < 10) return `1-10 ชิ้น +10 · 11 ชิ้นขึ้นไป +${fee} บาท/ชิ้น`;
  return `+${fee} บาท/ชิ้น`;
};
/** กลุ่มเลือกเฉดสีพิเศษของฐาน ขนาด n ซม. — extraConds = เงื่อนไข "และ" เพิ่มเติม (ของ prakob) */
const mkSpecial = (n, extraConds = []) => ({
  label: `เลือกสีพิเศษของฐาน (ขนาดฐาน ${n} ซม. · ${feeText(n)})`,
  display: "dropdown",
  stockBearing: true,
  showWhen: { label: "ขนาดฐาน", choices: [`${n}cm`] },
  showWhenAlso: { label: BASE_COLOR_LABEL, choices: [SPECIAL_CARD] },
  ...(extraConds.length ? { showWhenAll: structuredClone(extraConds) } : {}),
  ...(SPECIAL_FEE[n] < 10 ? { smallQtyFee: { fee: 10, upToQty: 10 } } : {}),
  choices: colorNames.map((c) => ({ ...c, extra: SPECIAL_FEE[n] })),
});
const mkColorCards = (showWhen) => ({
  ...structuredClone(srcColorCards),
  label: BASE_COLOR_LABEL,
  note: "ฐานเลือกเป็นอะคริลิคพิเศษได้ ค่าสีคิดตามขนาดฐาน — เลือกเฉดในเมนูที่โผล่ด้านล่าง",
  ...(showWhen ? { showWhen: structuredClone(showWhen) } : {}),
});
const mkShape = (showWhen) => ({
  ...structuredClone(srcShape),
  ...(showWhen ? { showWhen: structuredClone(showWhen) } : {}),
});
const insertAfter = (d, afterLabel, groups) => {
  const i = d.options.findIndex((o) => o.label === afterLabel);
  if (i < 0) throw new Error(`หากลุ่ม "${afterLabel}" ไม่เจอ`);
  d.options.splice(i + 1, 0, ...groups);
};

// ═══ 1) acrylic-prakob ═══════════════════════════════════════════════════════
if (grp(pk, "ขนาดฐาน") || grp(pk, "ทรงฐาน") || grp(pk, BASE_COLOR_LABEL))
  throw new Error("prakob มีกลุ่มฐานอยู่แล้ว — เพิ่มไปแล้ว ไม่ต้องรันซ้ำ");

// 1.1 ถอดค่าฐานที่ฝังในเซลล์ r-stand (ให้กลุ่มขนาดฐานคิดแทน)
const r1 = pk.priceRates.find((r) => r.id === "r1");
const rs = pk.priceRates.find((r) => r.id === "r-stand");
if (!r1 || !rs) throw new Error("prakob ไม่มีเรท r1/r-stand — โครงเปลี่ยน ตรวจก่อน");
let cellsFixed = 0;
for (const key of Object.keys(rs.pricing.cells)) {
  const [size, scr, base] = key.split("│");
  const twin = r1.pricing.cells[`${size}│${scr}│ไม่มีฐาน (พวงกุญแจ)`];
  if (!twin) throw new Error(`ไม่มีเซลล์คู่ฝั่งพวงกุญแจของ "${key}" — ถอดค่าฐานไม่ได้ ตรวจก่อน`);
  const old = rs.pricing.cells[key];
  const embed = old[0] - twin[0] - (base === "ฐานสกรีนลาย" ? 10 : 0);
  // ค่าฐานที่ฝังต้องคงที่ทุก tier (ตรวจแล้วตอนสำรวจ — กันข้อมูลถูกแก้ไประหว่างทาง)
  old.forEach((v, i) => {
    const e = v - twin[i] - (base === "ฐานสกรีนลาย" ? 10 : 0);
    if (e !== embed) throw new Error(`ค่าฐานฝังใน "${key}" ไม่คงที่ (${e} ≠ ${embed}) — ตรวจก่อน`);
  });
  rs.pricing.cells[key] = twin.map((v) => v + (base === "ฐานสกรีนลาย" ? 10 : 0));
  cellsFixed++;
}
console.log(`📦 ${pk.name}: ถอดค่าฐานออกจากเซลล์ r-stand ${cellsFixed} ช่อง (ฐานไม่สกรีน = เรทพวงกุญแจ · สกรีนลาย +10)`);

// 1.2 กลุ่มฐานทั้งชุด — โชว์เฉพาะตอนเลือกมีฐาน (เรทสแตนดี้)
const pkBaseSize = { ...structuredClone(srcBaseSize), showWhen: structuredClone(BASE_ON) };
insertAfter(pk, "ฐาน", [
  pkBaseSize,
  mkShape(BASE_ON),
  mkColorCards(BASE_ON),
  ...BASE_SIZES.map((n) => mkSpecial(n, [BASE_ON])),
]);
// ช่วงราคาบนการ์ดสินค้า (ใช้เมื่อส่งข้อมูลแบบเบา) — คิดใหม่จากเซลล์ทุกเรท ตามสูตร priceRange
{
  const all = pk.priceRates.flatMap((r) => Object.values(r.pricing.cells).flat()).filter((n) => n > 0);
  pk.priceMin = Math.min(...all);
  pk.priceMax = Math.max(...all);
}
pk.savedAt = new Date().toISOString();
console.log(`   + ขนาดฐาน (${pkBaseSize.choices.length}) · ทรงฐาน (${srcShape.choices.length}) · ${BASE_COLOR_LABEL} (3) · เลือกสีพิเศษของฐาน ×${BASE_SIZES.length}`);
console.log(`   ช่วงราคาใหม่: ฿${pk.priceMin} – ฿${pk.priceMax} · รวมกลุ่มตัวเลือก ${pk.options.length}`);

// ═══ 2) standy ═══════════════════════════════════════════════════════════════
if (grp(standy, "ทรงฐาน") || grp(standy, BASE_COLOR_LABEL))
  throw new Error("standy มีทรงฐาน/สีอะคริลิคฐานอยู่แล้ว — เพิ่มไปแล้ว ไม่ต้องรันซ้ำ");
insertAfter(standy, "ฐานสแตนดี้", [mkShape(null)]);
insertAfter(standy, "สีอะคริลิค", [mkColorCards(null), ...BASE_SIZES.map((n) => mkSpecial(n, []))]);
standy.savedAt = new Date().toISOString();
console.log(`📦 ${standy.name}: + ทรงฐาน (หลังฐานสแตนดี้) · ${BASE_COLOR_LABEL} + เลือกสีพิเศษของฐาน ×${BASE_SIZES.length} (หลังสีอะคริลิค)`);
console.log(`   รวมกลุ่มตัวเลือก ${standy.options.length}`);

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
for (const [id, d] of [["acrylic-prakob", pk], ["standy", standy]]) {
  const up = await sb.from("products").update({ data: d }).eq("id", id);
  if (up.error) throw new Error(`บันทึก ${id} ไม่สำเร็จ — ${up.error.message}`);
  console.log(`✅ บันทึก ${id} แล้ว`);
}
