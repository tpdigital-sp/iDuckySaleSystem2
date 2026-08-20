#!/usr/bin/env node
/**
 * แยกตัวเลือก "อะคริลิคใส / ขาวขุ่น C-02" ของสินค้าสแตนดี้โยกเยก ออกเป็น 2 ตัว
 *
 *   node scripts/standee-wobble-part-art.mjs          # เตรียมภาพชุด -v5 ก่อน
 *   node scripts/split-wobble-acrylic.mjs             # ดูผลก่อน (ไม่เขียนฐานข้อมูล)
 *   node scripts/split-wobble-acrylic.mjs --upload --write
 *
 * ทำไมต้องมีสคริปต์นี้แยกต่างหาก (ไม่แก้ที่ scripts/add-standee-wobble.ts แล้วรันทับ):
 *   ข้อมูลจริงในฐานข้อมูลเดินหน้าไปไกลกว่าสคริปต์ add- แล้ว — ของจริงแยกฐานเป็น "ซ้าย/ขวา"
 *   คนละกลุ่ม และภาพลงท้าย -v4 ส่วนสคริปต์ยังเป็นกลุ่ม "ฐานโยกเยก" เดียวกับภาพ -v1
 *   รันสคริปต์ add- ทับตอนนี้ = กลุ่มซ้าย/ขวาหายทั้งหมด จึงแก้เฉพาะจุดที่ของจริงแทน
 *
 * ⚠️ ชนิดอะคริลิคของสินค้านี้เป็น "แกนของตารางราคา" (driverLabels) ด้วย
 *    แยก 1 ตัวเป็น 2 ตัว = ช่องราคาต้องกางตามทุกคู่ผสม ไม่งั้นลูกค้าเลือกแล้วหาราคาไม่เจอ
 */
import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { acrylicColorImage } from "./acrylic-colors.mjs";

const UPLOAD = process.argv.includes("--upload");
const WRITE = process.argv.includes("--write");
const ART_DIR = (process.argv.find((a) => a.startsWith("--images=")) || "").split("=")[1] || ".cache/wobble/parts";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const ID = "new-mszsx3ql-5569";
/** ภาพชุดใหม่ — ชุดเดิมในฐานข้อมูลคือ -v4 (อัปทับชื่อเดิมไม่ได้ CDN แคชไว้) */
const REV = "v5";
const IMG = (name) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}-${REV}.jpg`;

/** ชื่อเดิมที่รวม 2 ชนิดไว้ในตัวเลือกเดียว → แยกเป็นสองชื่อนี้ (ราคาเท่ากัน คนละเนื้อวัสดุ) */
const MERGED = "อะคริลิคใส / ขาวขุ่น C-02";
const CLEAR = "อะคริลิคใส";
const C02 = "อะคริลิคขาวขุ่น C-02";

/** กลุ่มที่ต้องแยก → ชื่อไฟล์ภาพของชิ้นนั้น (ตัวเลือก "ใส" ใช้ภาพชิ้นงาน · C-02 ใช้สวอตช์จากชาร์ตสีกลาง) */
const PARTS = {
  "ตัวกลาง": "figure",
  "ฐานโยกเยก (ซ้าย)": "baseL",
  "ฐานโยกเยก (ขวา)": "baseR",
};
const ART_FILES = Object.values(PARTS).flatMap((p) => [`part-${p}-plain`, `part-${p}-special`]);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function uploadArt() {
  for (const name of ART_FILES) {
    const file = `${ART_DIR.replace(/\/$/, "")}/${name}-${REV}.jpg`;
    if (!existsSync(file)) throw new Error(`ไม่พบ ${file} — รัน node scripts/standee-wobble-part-art.mjs ก่อน`);
    const buf = await readFile(file);
    const { error } = await sb.storage
      .from("product-images")
      .upload(`products/${ID}/${name}-${REV}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`${name}: ${error.message}`);
    console.log(`⬆️  ${name}-${REV}.jpg (${Math.round(buf.length / 1024)} KB)`);
  }
}

/** แยกตัวเลือกในกลุ่มชนิดอะคริลิคของชิ้นหนึ่ง — ลำดับ: ใส · ขาวขุ่น C-02 · พิเศษ */
function splitGroup(opt, part) {
  const rest = opt.choices.filter((c) => c.name !== MERGED);
  return {
    ...opt,
    choices: [
      { name: CLEAR, imageSrc: IMG(`part-${part}-plain`) },
      { name: C02, imageSrc: acrylicColorImage(C02) },
      ...rest.map((c) => (c.name.startsWith("อะคริลิคพิเศษ") ? { ...c, imageSrc: IMG(`part-${part}-special`) } : c)),
    ],
  };
}

/**
 * กางช่องราคา — คีย์คือค่าของแต่ละแกนต่อกันด้วย "│"
 * ช่องไหนที่แกนชนิดอะคริลิคเป็นชื่อรวม ให้แตกเป็นทุกคู่ผสมของ [ใส, C-02] ราคาเท่าเดิมทุกช่อง
 */
function expandCells(cells, driverLabels) {
  const axes = driverLabels.map((l) => l in PARTS);
  const out = {};
  for (const [key, value] of Object.entries(cells)) {
    const parts = key.split("│");
    let combos = [[]];
    parts.forEach((p, i) => {
      const options = axes[i] && p === MERGED ? [CLEAR, C02] : [p];
      combos = combos.flatMap((c) => options.map((o) => [...c, o]));
    });
    for (const combo of combos) out[combo.join("│")] = value;
  }
  return out;
}

const { data: row, error } = await sb.from("products").select("*").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่สำเร็จ: ${error.message}`);
const d = structuredClone(row.data);

const touched = [];
d.options = (d.options ?? []).map((o) => {
  const part = PARTS[o.label];
  if (!part || !o.choices?.some((c) => c.name === MERGED)) return o;
  touched.push(o.label);
  return splitGroup(o, part);
});
if (touched.length !== Object.keys(PARTS).length) {
  throw new Error(`เจอกลุ่มที่ต้องแยกแค่ ${touched.length}/${Object.keys(PARTS).length} กลุ่ม: ${touched.join(", ")}`);
}

const before = Object.keys(d.pricing.cells).length;
d.pricing.cells = expandCells(d.pricing.cells, d.pricing.driverLabels);
for (const rate of d.priceRates ?? []) {
  if (rate.pricing?.cells) rate.pricing.cells = expandCells(rate.pricing.cells, rate.pricing.driverLabels);
}

console.log(`📦 ${d.name} (${ID})`);
console.log(`   แยกตัวเลือกในกลุ่ม: ${touched.join(" · ")}`);
console.log(`   ช่องราคา: ${before} → ${Object.keys(d.pricing.cells).length} ช่อง`);
for (const label of Object.keys(PARTS)) {
  const o = d.options.find((x) => x.label === label);
  console.log(`   [${label}] ${o.choices.map((c) => c.name).join(" | ")}`);
}
// ตรวจว่าทุกคู่ผสมที่ลูกค้าเลือกได้จริง มีช่องราคารองรับครบ
const sizes = d.options.find((o) => o.label === d.pricing.driverLabels[0]).choices.map((c) => c.name);
const kinds = [CLEAR, C02, "อะคริลิคพิเศษ (สี · กลิตเตอร์ · โฮโลแกรม)"];
const missing = [];
for (const s of sizes)
  for (const a of kinds)
    for (const b of kinds)
      for (const c of kinds) if (!d.pricing.cells[`${s}│${a}│${b}│${c}`]) missing.push(`${s}│${a}│${b}│${c}`);
console.log(`   ช่องที่ยังขาด: ${missing.length}${missing.length ? ` — ${missing[0]}` : " ✅"}`);
if (missing.length) throw new Error("ตารางราคายังไม่ครบทุกคู่ผสม — ไม่บันทึก");

if (UPLOAD) await uploadArt();
if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw new Error(`บันทึกไม่สำเร็จ: ${saveErr.message}`);
console.log(`\n✅ บันทึกแล้ว: ${ID}`);
