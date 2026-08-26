#!/usr/bin/env node
/**
 * rotating-stand: เพิ่มกลุ่ม "สกรีนฐาน" + "ทรงฐาน" — ตรรกะชุดเดียวกับสินค้าสแตนดี้ (standy)
 *
 *   node scripts/rotating-stand-base-shape-screen.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/rotating-stand-base-shape-screen.mjs --write   # บันทึกจริง
 *
 * ที่มา: ผู้ใช้สั่ง 26 ส.ค. 69 (ต่อจาก rotating-stand-diecut-base.mjs)
 *   "ทรงฐาน และ สกรีนฐาน อยากให้ใช้ตรรกะเดียวกับสินค้าสแตนดี้ แต่ราคาคงตามที่แจ้งไป"
 *
 * ตรรกะที่ยกมาจาก standy:
 *   • ทรงฐาน — การ์ด 3 ใบ: ทรงกลม/ทรงสี่เหลี่ยม ฟรี · ทรงพิเศษ (ไดคัทตามทรง) extra 5
 *     + smallQtyFee 10 ถึง 10 ชิ้น (ยกเว้นกลม/สี่เหลี่ยม) = ปลีก 1-10 ชิ้น +10 · ส่ง 11+ +5
 *     (smallQtyFee คิด "แทน" extra ไม่ใช่บวกซ้ำ — ดู groupAddOf)
 *   • สกรีนฐาน — การ์ด 2 ใบ (ไม่สกรีนฐาน / สกรีนลายฐาน) แบบกลุ่ม "ฐานสแตนดี้" ของ standy
 *
 * ต่างจาก standy ตรงราคาสกรีนฐาน: standy คิด +10 แต่สินค้านี้ "ฐาน 3-4 ซม. ราคารวมสกรีนลายฐานแล้ว"
 * ตามที่แจ้งลูกค้าไว้ → ทั้งสองใบ 0 บาท และให้ "สกรีนลายฐาน" เป็นค่าเริ่มต้น (ใบแรก) เพราะรวมมาในราคาแล้ว
 *
 * ภาพใช้ร่วมกับชุดสแตนดี้ (standee-keyring / standy) แบบเดียวกับที่ acrylic-prakob ยืมไปใช้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "rotating-stand";
const SCREEN_LABEL = "สกรีนฐาน";
const SHAPE_LABEL = "ทรงฐาน";
const PRINTED = "สกรีนลายฐาน";
const PLAIN = "ไม่สกรีนฐาน";
const ROUND = "ทรงกลม";
const SQUARE = "ทรงสี่เหลี่ยม";
const SPECIAL = "ทรงพิเศษ (ไดคัทตามทรง)";

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
const [p, standy] = await Promise.all([get(ID), get("standy")]);
const grp = (d, l) => (d.options ?? []).find((o) => o.label === l);

// ── ต้นแบบจาก standy (ตรวจว่าโครงยังตรงก่อนโคลน) ─────────────────────────────
const srcShape = grp(standy, SHAPE_LABEL);
const srcScreen = grp(standy, "ฐานสแตนดี้");
if (!srcShape || srcShape.display !== "cards" || srcShape.choices.length !== 3 || srcShape.smallQtyFee?.fee !== 10)
  throw new Error("ต้นแบบ standy: กลุ่มทรงฐานเปลี่ยนโครง — ตรวจก่อน");
if (!srcScreen || srcScreen.choices.length !== 2) throw new Error("ต้นแบบ standy: กลุ่มฐานสแตนดี้เปลี่ยนโครง — ตรวจก่อน");
const img = (o, name) => o.choices.find((c) => c.name === name)?.imageSrc;

// ── กันรันซ้ำ / กันชนแกนตารางราคา ────────────────────────────────────────────
for (const l of [SCREEN_LABEL, SHAPE_LABEL]) if (grp(p, l)) throw new Error(`มีกลุ่ม "${l}" แล้ว — ไม่ต้องรันซ้ำ`);
if (!grp(p, "ขนาดฐาน")) throw new Error("ยังไม่มีกลุ่มขนาดฐาน — รัน rotating-stand-diecut-base.mjs ก่อน");
for (const pr of [...(p.priceRates ?? []).map((r) => r.pricing), p.pricing].filter(Boolean))
  for (const d of pr.driverLabels ?? [])
    if (d === SCREEN_LABEL || d === SHAPE_LABEL) throw new Error(`"${d}" เป็นแกนตารางราคาอยู่ — ตรวจก่อน`);

// ── 1) สกรีนฐาน — โครง standy · ราคา 0 ทั้งคู่ (รวมมาในราคาชุดแล้ว) ────────────
const screen = {
  label: SCREEN_LABEL,
  display: "cards",
  note: "ฐานขนาดเริ่มต้น 3-4 ซม. ราคารวมสกรีนลายฐานแล้ว — ไม่สกรีนฐานก็ได้ ราคาเท่ากัน",
  choices: [
    {
      name: PRINTED,
      desc: "พิมพ์ลายของคุณลงบนฐานด้วย",
      badge: "รวมในราคาแล้ว",
      imageSrc: img(srcScreen, "สกรีนฐาน"),
    },
    { name: PLAIN, desc: "ฐานอะคริลิคเปล่า ไม่พิมพ์ลาย", imageSrc: img(srcScreen, PLAIN) },
  ],
};

// ── 2) ทรงฐาน — ชุด standy ทั้งดุ้น (ปลีก 1-10 ชิ้น +10 · 11 ชิ้นขึ้นไป +5) ─────
const shape = {
  label: SHAPE_LABEL,
  display: "cards",
  note: "ทรงกลม/ทรงสี่เหลี่ยมไม่บวกเพิ่ม · ทรงพิเศษไดคัทตามทรง 1-10 ชิ้น +10 บาท · 11 ชิ้นขึ้นไป +5 บาท/ชิ้น",
  choices: [
    { name: ROUND, imageSrc: img(srcShape, ROUND) },
    { name: SQUARE, imageSrc: img(srcShape, SQUARE) },
    { name: SPECIAL, extra: 5, imageSrc: img(srcShape, SPECIAL) },
  ],
  smallQtyFee: { fee: 10, upToQty: 10, freeChoices: [ROUND, SQUARE] },
};

p.options = [...(p.options ?? []), screen, shape];

// ── 3) เงื่อนไขใต้สินค้า ──────────────────────────────────────────────────────
const lines = String(p.terms ?? "").split("\n");
const shapeLine = "*ทรงฐาน กลม/สี่เหลี่ยม ไม่บวกเพิ่ม · ทรงพิเศษไดคัทตามทรง 1-10 ชิ้น +10 บาท · 11 ชิ้นขึ้นไป +5 บาท/ชิ้น";
if (!lines.includes(shapeLine)) {
  const i = lines.findIndex((l) => l.includes("ขนาดฐานสูงสุด"));
  lines.splice(i < 0 ? lines.length : i + 1, 0, shapeLine);
}
p.terms = lines.join("\n");
p.savedAt = new Date().toISOString();

// ── สรุป ─────────────────────────────────────────────────────────────────────
console.log(`📦 ${p.name} (${ID})`);
for (const o of [screen, shape]) {
  const fee = o.smallQtyFee;
  console.log(
    `   [${o.label}] ` +
      o.choices
        .map((c) => {
          const small = fee && !fee.freeChoices.includes(c.name) ? ` (1-${fee.upToQty} ชิ้น +${fee.fee}฿)` : "";
          return `${c.name}${c.extra ? ` +${c.extra}฿` : " ฟรี"}${small}`;
        })
        .join(" · ")
  );
}
console.log(`   กลุ่มทั้งหมด: ${p.options.map((o) => o.label).join(" · ")}`);
console.log(`   รูปครบทุกใบ: ${[...screen.choices, ...shape.choices].every((c) => c.imageSrc) ? "✅" : "❌ ขาดรูป"}`);
console.log("\nเงื่อนไข:\n" + p.terms);

if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}

const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", ID);
if (upErr) throw new Error(`บันทึกไม่สำเร็จ: ${upErr.message}`);
console.log(`\n✅ บันทึกแล้ว: ${ID}`);
