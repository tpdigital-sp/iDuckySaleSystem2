#!/usr/bin/env node
/**
 * ปรับกลุ่ม "ประเภทอะคริลิค" ของสินค้า Carabiner Acrylic
 *   ธรรมดา · พิเศษ  →  อะคริลิคใส · อะคริลิคขาวขุ่น C-02 · สีพิเศษ   (พร้อมภาพประกอบทั้ง 3 ตัว)
 *
 *   node scripts/carabiner-art.mjs                        # เตรียมภาพ "อะคริลิคใส" ก่อน
 *   node scripts/fix-carabiner-acrylic.mjs                # ดูผลก่อน (ไม่เขียนฐานข้อมูล)
 *   node scripts/fix-carabiner-acrylic.mjs --upload --write
 *
 * "ธรรมดา" ของสินค้านี้หมายถึงใสหรือขาวขุ่น C-02 อยู่แล้ว — ดูได้จากกฎ rules เดิมที่จำกัด
 * กลุ่ม "สีอะคริลิค" ไว้แค่สองสีนี้ จึงแตกเป็นสองตัวเลือกตรง ๆ แล้วแก้กฎให้ล็อกสีตามที่เลือก
 *
 * ⚠️ แถมแก้บั๊กที่มีมาก่อน: driverLabels เขียนไว้ 3 แกน (ประเภทอะคริลิค · ขนาด · สกรีน)
 *    แต่คีย์ในตารางราคามีแค่ 2 แกน ("ธรรมดา│5 cm") — ระบบสร้างคีย์ 3 ท่อนไปค้นแล้วไม่เจอสักช่อง
 *    ราคาจึงตกไปใช้ราคาตั้งต้น 109 บาททุกกรณี ตารางทั้งใบไม่เคยถูกใช้เลย
 *    ตัดแกน "สกรีน" ที่เกินออก ให้จำนวนแกนตรงกับคีย์จริง ตารางถึงจะทำงาน
 */
import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { acrylicColorImage } from "./acrylic-colors.mjs";

const UPLOAD = process.argv.includes("--upload");
const WRITE = process.argv.includes("--write");
const ART_DIR = (process.argv.find((a) => a.startsWith("--images=")) || "").split("=")[1] || ".cache/carabiner/upload";

const ID = "carabiner-acrylic";
const GROUP = "ประเภทอะคริลิค";
const COLOR_GROUP = "สีอะคริลิค";
// v1 วาดเป็นห่วงคาราไบเนอร์โลหะแยกชิ้น (ไม่ตรงกับของจริง) — v2 วาดใหม่ ดู scripts/carabiner-art.mjs
const ART = "clear-plain-v4";

const OLD_PLAIN = "ธรรมดา";
const OLD_SPECIAL = "พิเศษ";
const CLEAR = "อะคริลิคใส";
const C02 = "อะคริลิคขาวขุ่น C-02";
const SPECIAL = "สีพิเศษ";

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
const IMG = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${ART}.jpg`;

async function uploadArt() {
  const file = `${ART_DIR.replace(/\/$/, "")}/${ART}.jpg`;
  if (!existsSync(file)) throw new Error(`ไม่พบ ${file} — รัน node scripts/carabiner-art.mjs ก่อน`);
  const buf = await readFile(file);
  const { error } = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${ART}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(error.message);
  console.log(`⬆️  ${ART}.jpg (${Math.round(buf.length / 1024)} KB)`);
}

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่สำเร็จ: ${error.message}`);
const d = structuredClone(row.data);
const before = structuredClone(row.data);

// ── 1. ตัวเลือกในกลุ่ม ────────────────────────────────────────────────────
const opt = d.options?.find((o) => o.label === GROUP);
if (!opt) throw new Error(`ไม่เจอกลุ่ม "${GROUP}"`);
if (!opt.choices.some((c) => c.name === OLD_PLAIN)) throw new Error(`ปรับไปแล้ว หรือชื่อตัวเลือกไม่ตรงกับที่คาด`);
opt.choices = [
  { name: CLEAR, imageSrc: IMG },
  { name: C02, imageSrc: acrylicColorImage(C02) },
  { name: SPECIAL, imageSrc: acrylicColorImage("hologram-รุ้ง") },
];

// ── 2. ตารางราคา — คีย์ขึ้นต้นด้วยชื่อประเภท · "ธรรมดา" แตกเป็นสองชื่อ ราคาเท่าเดิมทั้งคู่ ──
const rename = (key) => {
  const [kind, ...rest] = key.split("│");
  if (kind === OLD_PLAIN) return [[CLEAR, ...rest].join("│"), [C02, ...rest].join("│")];
  if (kind === OLD_SPECIAL) return [[SPECIAL, ...rest].join("│")];
  return [key];
};
for (const m of [d.pricing, ...(d.priceRates ?? []).map((r) => r.pricing)]) {
  if (!m?.cells) continue;
  const cells = {};
  for (const [k, v] of Object.entries(m.cells)) for (const nk of rename(k)) cells[nk] = v;
  m.cells = cells;
  // แกนต้องมีเท่ากับจำนวนท่อนในคีย์จริง ไม่งั้นค้นไม่เจอสักช่อง (ดูหมายเหตุหัวไฟล์)
  const arity = Object.keys(cells)[0].split("│").length;
  if (m.driverLabels.length > arity) {
    console.log(`   ตัดแกนที่เกินออก: ${JSON.stringify(m.driverLabels)} → ${JSON.stringify(m.driverLabels.slice(0, arity))}`);
    m.driverLabels = m.driverLabels.slice(0, arity);
  }
}

// ── 3. กฎจำกัดสี — เลือกประเภทไหน ก็ล็อกกลุ่ม "สีอะคริลิค" ให้เหลือสีของประเภทนั้น ──
const specialRule = (d.rules ?? []).find((r) => r.when.label === GROUP && r.when.choice === OLD_SPECIAL);
d.rules = [
  { when: { label: GROUP, choice: CLEAR, choices: [CLEAR] }, limit: { label: COLOR_GROUP, allow: [CLEAR] } },
  { when: { label: GROUP, choice: C02, choices: [C02] }, limit: { label: COLOR_GROUP, allow: [C02] } },
  ...(specialRule
    ? [{ when: { label: GROUP, choice: SPECIAL, choices: [SPECIAL] }, limit: specialRule.limit }]
    : []),
  ...(d.rules ?? []).filter((r) => r.when.label !== GROUP),
];

// ── ตรวจก่อนบันทึก ────────────────────────────────────────────────────────
console.log(`📦 ${d.name} (${ID})`);
console.log(`   [${GROUP}] → ${opt.choices.map((c) => c.name).join(" | ")}`);
console.log(`   ภาพประกอบ: ${opt.choices.filter((c) => c.imageSrc).length}/${opt.choices.length} ตัว`);
console.log(`   ช่องราคา ${Object.keys(before.pricing.cells).length} → ${Object.keys(d.pricing.cells).length} · แกน ${JSON.stringify(d.pricing.driverLabels)}`);

// ราคาต้องไม่เปลี่ยน — ย้อนชื่อใหม่กลับเป็นชื่อเดิมแล้วเทียบทีละช่อง
const back = (k) => {
  const [kind, ...rest] = k.split("│");
  return [kind === CLEAR || kind === C02 ? OLD_PLAIN : kind === SPECIAL ? OLD_SPECIAL : kind, ...rest].join("│");
};
const bad = Object.entries(d.pricing.cells).filter(
  ([k, v]) => JSON.stringify(before.pricing.cells[back(k)]) !== JSON.stringify(v)
);
if (bad.length) throw new Error(`ราคาเพี้ยน ${bad.length} ช่อง เช่น ${bad[0][0]} — ไม่บันทึก`);
console.log("   ราคาตรงกับของเดิมทุกช่อง ✅");

// ทุกคู่ผสมที่ลูกค้ากดได้ ต้องมีราคา
const sizes = d.options.find((o) => o.label === d.pricing.driverLabels[1]).choices.map((c) => c.name);
const miss = opt.choices.flatMap((c) => sizes.map((s) => `${c.name}│${s}`)).filter((k) => !d.pricing.cells[k]);
if (miss.length) throw new Error(`ยังขาดช่องราคา ${miss.length} ช่อง เช่น "${miss[0]}" — ไม่บันทึก`);
console.log(`   ครบทุกคู่ (ประเภท × ขนาด) = ${opt.choices.length * sizes.length} ช่อง ✅`);
console.log(`   กฎจำกัดสี: ${d.rules.map((r) => `${r.when.choice}→${r.limit.allow.length} สี`).join(" · ")}`);

if (UPLOAD) await uploadArt();
if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw new Error(`บันทึกไม่สำเร็จ: ${saveErr.message}`);
console.log(`\n✅ บันทึกแล้ว: ${ID}`);
