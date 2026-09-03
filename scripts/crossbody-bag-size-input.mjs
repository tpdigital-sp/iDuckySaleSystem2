#!/usr/bin/env node
/**
 * Crossbody Bag (crossbody-bag) — เปลี่ยน "ขนาดปัก" จากช่องนับเซนที่เกิน เป็น "ช่องพิมพ์ขนาดจริง"
 *
 *   node scripts/crossbody-bag-size-input.mjs            (ดูก่อนว่าจะเปลี่ยนอะไร ไม่เขียน DB)
 *   node scripts/crossbody-bag-size-input.mjs --write    (เขียน DB + อ่านกลับเทียบ)
 *
 * เดิม: กลุ่ม "ขนาดปักไม่เกิน 8*4 cm" มีตัวเลือกเดียว "เกินเพิ่มเซนละ" (qty) — ลูกค้าต้อง
 *      คำนวณเองว่าลายตัวเองเกินกรอบกี่เซนแล้วพิมพ์เลขนั้น (พิมพ์ 3 = +฿45) ผิดง่ายมาก
 * ใหม่: ช่องพิมพ์ขนาดจริง 2 ช่อง (กว้าง / สูง เป็น ซม.) — พิมพ์ 11 กับ 4 แล้วระบบคิด +฿45 ให้เอง
 *
 * คิดเงินเท่าเดิมทุกบาท ใช้ `ProductOption.inputFee` (ดู products.ts `inputFeeOf`):
 *   กว้าง { perUnit: 15, free: 8 }  ·  สูง { perUnit: 15, free: 4 }
 *   → ค่าบริการ = (ค่าที่กรอก − โควตาฟรี) × 15 · ไม่เกินกรอบ = 0
 *   inputFeeOf ถูกบวกใน groupAddOf ช่องเดียวกับ extra ของกลุ่มเดิม → ตัวคูณต่อจำนวนใบคงเดิม
 *
 * ⚠️ ตีความกติกา "เกินเพิ่มเซนละ ฿15" ว่า **คิดแยกทีละด้าน แล้วรวมกัน**
 *    (ลาย 11×6 = เกินกว้าง 3 + เกินสูง 2 = 5 ซม. = +฿75)
 *    ของเดิมเป็นเลขเดียวที่ลูกค้าพิมพ์เอง จึงไม่มีคำตอบตายตัวว่านับยังไง — ถ้าร้านคิดจาก
 *    "ด้านที่ยาวสุดด้านเดียว" ให้ลบ inputFee ออกจากช่องสูง (เหลือเป็นช่องบันทึกขนาดเฉย ๆ)
 *
 * ⚠️ เพดาน: ร้านยืนยัน (3 ก.ย. 69) รับปักได้สูงสุด 17 × 14 ซม.
 *    → กว้างไม่เกิน 17 · สูงไม่เกิน 14 (เดิมเคยตั้ง 23/19 ตาม qtyMax 15 ของกลุ่มเก่า)
 *
 * ช่องเป็น "ไม่บังคับกรอก" (input.required false) — ลูกค้าที่ปักตามขนาดมาตรฐาน 8×4
 * หรือยังไม่รู้ขนาด เว้นว่างแล้วกดสั่งได้ (standardInput ปกติบังคับกรอกเสมอ ดู ProductDetail:1282)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PRODUCT_ID = "crossbody-bag";
const OLD_LABEL = "ขนาดปักไม่เกิน 8*4 cm";
const W_LABEL = "ขนาดลายปัก · ด้านกว้าง";
const H_LABEL = "ขนาดลายปัก · ด้านสูง";
const RATE = 15;
const FREE_W = 8;
const FREE_H = 4;
const MAX_W = 17; // ขนาดปักสูงสุดที่ร้านรับ 17 × 14 ซม.
const MAX_H = 14;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const before = data.options ?? [];
// รันซ้ำได้: ครั้งแรกเจอกลุ่มนับเซนเดิม · ครั้งถัด ๆ ไปเจอช่องกรอกที่ตัวเองเคยเขียนไว้แล้ว
// (ตัดทิ้งแล้ววางใหม่ ไม่งั้นรันซ้ำจะได้ช่องซ้ำสองชุด = คิดเงินสองรอบ)
const OLD_LABELS = [OLD_LABEL, W_LABEL, H_LABEL];
const at = before.findIndex((o) => OLD_LABELS.includes(o.label));
if (at < 0) { console.error(`ไม่เจอทั้งกลุ่มเดิม "${OLD_LABEL}" และช่องกรอกที่เคยเขียนไว้ — หยุดก่อน อย่าเดาตำแหน่ง`); process.exit(1); }
const replaced = before.filter((o) => OLD_LABELS.includes(o.label));
// การ์ดอธิบายกรอบ 8×4 ที่วาดไว้ใน crossbody-bag-option-art.mjs — ย้ายมาอยู่กับช่องกว้าง
const noteImageSrc = replaced.map((o) => o.noteImageSrc).find(Boolean);

/** ช่องกรอกขนาด 1 ด้าน — พิมพ์ขนาดจริง ระบบคิดเฉพาะส่วนที่เกินกรอบ */
const sizeField = (label, free, max, sideWord) => ({
  label,
  // ⚠️ ต้องมี choices: [] เสมอแม้เป็นช่องกรอก — โค้ดหลายที่เรียก opt.choices.map/[0] ตรง ๆ
  // ไม่มีแล้วหน้าสินค้า 500 ("Cannot read properties of undefined (reading 'map')")
  choices: [],
  display: "input",
  standardInput: true,
  input: {
    kind: "number",
    unit: "ซม.",
    min: 1,
    max,
    required: false,
    placeholder: String(free),
    hint: `${sideWord}ไม่เกิน ${free} ซม. รวมในราคาแล้ว — เกินจากนี้คิดเพิ่ม ซม. ละ ฿${RATE} (รับได้ถึง ${max} ซม.) · ไม่รู้ขนาดเว้นว่างไว้ได้`,
  },
  inputFee: { perUnit: RATE, free },
  ...(free === FREE_W ? { note: "พิมพ์ขนาดลายปักจริงลงไปได้เลย — ระบบคิดค่าส่วนที่เกินกรอบ 8 × 4 ซม. ให้เอง ไม่ต้องบวกลบเอง", ...(noteImageSrc ? { noteImageSrc } : {}) } : {}),
});

const wField = sizeField(W_LABEL, FREE_W, MAX_W, "ด้านกว้าง");
const hField = sizeField(H_LABEL, FREE_H, MAX_H, "ด้านสูง");
const options = [
  ...before.slice(0, at).filter((o) => !OLD_LABELS.includes(o.label)),
  wField,
  hField,
  ...before.slice(at + 1).filter((o) => !OLD_LABELS.includes(o.label)),
];

const money = (w, h) => (Math.max(0, w - FREE_W) + Math.max(0, h - FREE_H)) * RATE;
console.log("กลุ่มก่อนแก้ :", before.map((o) => o.label).join("  ·  "));
console.log("กลุ่มหลังแก้:", options.map((o) => o.label).join("  ·  "));
console.log("\nตัวอย่างค่าบริการ (ต่อใบ):");
for (const [w, h] of [[8, 4], [11, 4], [8, 6], [11, 6], [17, 14]])
  console.log(`  ${String(w).padStart(2)} × ${String(h).padStart(2)} ซม.  →  +฿${money(w, h)}`);

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write)"); process.exit(0); }

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("id");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options;
const w = got.find((o) => o.label === W_LABEL);
const h = got.find((o) => o.label === H_LABEL);
const fails = [
  [got.length === options.length, `จำนวนกลุ่มไม่ตรง (${got.length} ≠ ${options.length})`],
  [!got.some((o) => o.label === OLD_LABEL), "กลุ่มนับเซนเดิมยังอยู่ (คิดเงินซ้ำ)"],
  [got.filter((o) => o.label === W_LABEL).length === 1 && got.filter((o) => o.label === H_LABEL).length === 1, "ช่องกรอกซ้ำมากกว่าชุดเดียว (คิดเงินซ้ำ)"],
  [w?.inputFee?.perUnit === RATE && w.inputFee.free === FREE_W, "ช่องกว้างตั้งค่าบริการไม่ถูก"],
  [h?.inputFee?.perUnit === RATE && h.inputFee.free === FREE_H, "ช่องสูงตั้งค่าบริการไม่ถูก"],
  [w?.input?.required === false && h?.input?.required === false, "ช่องกลายเป็นบังคับกรอก"],
  [w?.input?.max === MAX_W && h?.input?.max === MAX_H, "เพดานไม่ตรง 17×14"],
  [!noteImageSrc || w?.noteImageSrc === noteImageSrc, "การ์ดอธิบายกรอบ 8×4 หลุดไปตอนย้ายกลุ่ม"],
  [Array.isArray(w?.choices) && Array.isArray(h?.choices), "ช่องกรอกขาด choices: [] (หน้าสินค้าจะ 500)"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }
console.log("\n✓ เขียนแล้ว อ่านกลับตรงทุกข้อ · savedAt =", back.data.savedAt);
