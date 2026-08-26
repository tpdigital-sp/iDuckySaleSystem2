#!/usr/bin/env node
/**
 * สแตนดี้อะคริลิค หมุนได้ (standee-rotating) — แยกฐานมาตรฐานเป็นทีละขนาด 3 / 4 / 5 ซม.
 *
 *   node scripts/standee-rotating-art.mjs --only=basesize-split --out=.cache/rot/split   # เตรียมภาพก่อน
 *   node scripts/standee-rotating-basesize-split.mjs                                     # ดูก่อน (ไม่เขียน)
 *   node scripts/standee-rotating-basesize-split.mjs --write --images=.cache/rot/split    # อัปภาพ + บันทึกจริง
 *
 * ผู้ใช้สั่ง 26 ส.ค. 69: "แยก 5cm ออกจาก 3-5" — เลือกแบบแยกทุกขนาด
 *   ตัวเลือกเดิม "3-5 ซม. (มาตรฐาน)" → "3 ซม. (มาตรฐาน)" · "4 ซม. (มาตรฐาน)" · "5 ซม. (มาตรฐาน)"
 *
 * ราคาไม่เปลี่ยน — ฐาน 3-5 ซม. เป็นขนาดมาตรฐาน ไม่บวกค่าฐาน (baseOverFee = 0 ทั้งสามขนาด)
 * และค่าสกรีนลายฐาน +10 เท่ากันทั้งสามขนาด (ช่วง 5-6 ซม.) → เซลล์ราคาของตัวเดิมถูก "ก๊อป" ไปทั้ง 3 ตัว
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const IMAGES_DIR = ((process.argv.find((a) => a.startsWith("--images=")) || "").split("=")[1] || "").replace(/\/$/, "");
const ID = "standee-rotating";
const SIZE_LABEL = "ขนาดฐาน";
const OLD = "3-5 ซม. (มาตรฐาน)";
/** ตัวเลือกใหม่: ชื่อ → ไฟล์ภาพ (ชุด v3 จาก standee-rotating-art.mjs --only=basesize-split) */
const NEW = [
  ["3 ซม. (มาตรฐาน)", "basesize-3-v3"],
  ["4 ซม. (มาตรฐาน)", "basesize-4-v3"],
  ["5 ซม. (มาตรฐาน)", "basesize-5-v3"],
];
const NOTE =
  "ฐาน 3-5 ซม. เป็นขนาดมาตรฐาน รวมในราคาตารางแล้ว — ใหญ่กว่านั้นบวกเพิ่มตาม ซม. (1-10 ชิ้น ซม.ละ 15 · 11 ชิ้นขึ้นไป ซม.ละ 10)";

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
const IMG = (name) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}.jpg`;

const { data, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) throw new Error(`อ่าน ${ID} ไม่ได้ — ${error.message}`);
const d = structuredClone(data.data);

// ── 1) กลุ่มตัวเลือก ─────────────────────────────────────────────────────────
const grp = (d.options ?? []).find((o) => o.label === SIZE_LABEL);
if (!grp) throw new Error(`ไม่มีกลุ่ม "${SIZE_LABEL}" — ตรวจก่อน`);
const at = grp.choices.findIndex((c) => c.name === OLD);
if (at < 0) {
  if (grp.choices.some((c) => c.name === NEW[0][0])) throw new Error("แยกไปแล้ว — ไม่ต้องรันซ้ำ");
  throw new Error(`ไม่มีตัวเลือก "${OLD}" — ชื่อเปลี่ยน ตรวจก่อน`);
}
const old = grp.choices[at];
grp.choices.splice(at, 1, ...NEW.map(([name, img]) => ({ ...old, name, imageSrc: IMG(img) })));
grp.note = NOTE;
console.log(`🎛️  ${SIZE_LABEL}: ${grp.choices.length} ตัวเลือก — ${grp.choices.map((c) => c.name).join(" · ")}`);

// ── 2) ตารางราคา — ก๊อปเซลล์ของตัวเดิมไปทั้ง 3 ตัว (ราคาเท่ากัน) ────────────
const matrices = [d.pricing, ...(d.priceRates ?? []).map((r) => r.pricing)].filter(Boolean);
if (!matrices.length) throw new Error("ไม่มีตารางราคา — โครงสินค้าเปลี่ยน ตรวจก่อน");
for (const m of matrices) {
  const i = m.driverLabels.indexOf(SIZE_LABEL);
  if (i < 0) throw new Error(`แกนตาราง ${JSON.stringify(m.driverLabels)} ไม่มี "${SIZE_LABEL}" — ตรวจก่อน`);
  const before = Object.keys(m.cells).length;
  const cells = {};
  for (const [key, val] of Object.entries(m.cells)) {
    const parts = key.split("│");
    if (parts[i] !== OLD) {
      cells[key] = val;
      continue;
    }
    for (const [name] of NEW) {
      const k = [...parts];
      k[i] = name;
      cells[k.join("│")] = [...val];
    }
  }
  m.cells = cells;
  console.log(`💰 ตาราง ${JSON.stringify(m.driverLabels)}: ${before} → ${Object.keys(cells).length} ช่อง`);
}

// ── 3) ข้อความที่อ้างชื่อตัวเลือกเดิม (คำอธิบาย / SEO / FAQ) ─────────────────
const NEW_LIST = NEW.map(([n]) => n.replace(" (มาตรฐาน)", "")).join(", ") + " (มาตรฐาน)";
d.description = d.description?.replace("เลือกขนาดฐาน 3-5 ซม. ถึง 12 ซม.", "เลือกขนาดฐาน 3 ถึง 12 ซม.");
if (d.seo?.keywords) d.seo.keywords = d.seo.keywords.map((k) => (k === OLD ? NEW[0][0] : k));
for (const f of d.seo?.faqs ?? []) if (f.a?.includes(OLD)) f.a = f.a.replace(OLD, NEW_LIST);
console.log(`📝 คำอธิบาย/SEO/FAQ: อัปชื่อตัวเลือกเดิม "${OLD}" → "${NEW_LIST}"`);

{
  const all = matrices.flatMap((m) => Object.values(m.cells).flat()).filter((n) => n > 0);
  d.priceMin = Math.min(...all);
  d.priceMax = Math.max(...all);
  console.log(`   ช่วงราคา: ฿${d.priceMin} – ฿${d.priceMax} (ไม่ควรเปลี่ยนจากเดิม)`);
}
d.savedAt = new Date().toISOString();

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write --images=<โฟลเดอร์ภาพ>)");
  process.exit(0);
}
if (!IMAGES_DIR) throw new Error("ต้องระบุ --images=<โฟลเดอร์> (รัน standee-rotating-art.mjs --only=basesize-split ก่อน)");
for (const [, name] of NEW) {
  const buf = await readFile(`${IMAGES_DIR}/${name}.jpg`);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${name}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`${name}: ${up.error.message}`);
  console.log(`⬆️  ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
}
const up = await sb.from("products").update({ data: d }).eq("id", ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log(`✅ บันทึก ${ID} แล้ว`);
