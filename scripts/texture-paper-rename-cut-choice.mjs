#!/usr/bin/env node
/**
 * กระดาษ Texture Paper — เปลี่ยนชื่อตัวเลือก
 *   "ตัดตามขนาด (A4 / A5 / A6 / A7)"  →  "ตัดตามขนาด"
 *
 *   node scripts/texture-paper-rename-cut-choice.mjs           # ดูก่อน
 *   node scripts/texture-paper-rename-cut-choice.mjs --write
 *
 * ⚠️ "การตัด" เป็นแกนของตารางราคา (pricing.driverLabels) — ชื่อตัวเลือกไปโผล่ใน
 *    คีย์ของ pricing.cells ("ชนิดกระดาษ│การตัด") ด้วย 13 คีย์ ถ้าเปลี่ยนแค่ชื่อปุ่ม
 *    ระบบจะหาช่องราคาไม่เจอแล้วหล่นไปใช้ product.price เงียบ ๆ
 *    สคริปต์นี้จึงเปลี่ยนชื่อ "ทุกที่" ในก้อน data (ชื่อตัวเลือก · showWhen/showWhenAlso · คีย์ตาราง)
 *    ข้อความบรรยายในแท็บ/จุดเด่นเขียนคนละแบบ ("A4 A5 A6 A7" ไม่มี /) จึงไม่โดนแตะ
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "texture-paper";
const OLD = "ตัดตามขนาด (A4 / A5 / A6 / A7)";
const NEW = "ตัดตามขนาด";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) { console.error(error); process.exit(1); }
const before = row.data;

let values = 0, keys = 0;
const rename = (v) => {
  if (typeof v === "string") { if (v.includes(OLD)) values++; return v.split(OLD).join(NEW); }
  if (Array.isArray(v)) return v.map(rename);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (k.includes(OLD)) keys++;
      out[k.split(OLD).join(NEW)] = rename(x);
    }
    return out;
  }
  return v;
};
const d = rename(JSON.parse(JSON.stringify(before)));

/* ---------- ตรวจว่าตารางราคายังครบ ---------- */
const cells = Object.keys(d.pricing.cells);
const papers = d.options.find((o) => o.label === "ชนิดกระดาษ").choices.map((c) => c.name);
const cuts = d.options.find((o) => o.label === "การตัด").choices.map((c) => c.name);
const missing = [];
for (const p of papers) for (const c of cuts) if (!cells.includes(`${p}│${c}`)) missing.push(`${p}│${c}`);

console.log(`เปลี่ยนชื่อ "${OLD}" → "${NEW}"`);
console.log(`  ค่าในข้อมูล ${values} จุด (ชื่อตัวเลือก + showWhen) · คีย์ตารางราคา ${keys} คีย์`);
console.log("\nตัวเลือกกลุ่ม \"การตัด\":", cuts.join(" · "));
console.log("ช่องราคาทั้งหมด:", cells.length, "คีย์");
console.log(missing.length ? `⛔ ขาดช่องราคา ${missing.length} ช่อง:\n   ${missing.join("\n   ")}` : "✓ ตารางราคาครบทุกคู่ (กระดาษ × การตัด)");
console.log("\nกลุ่มที่อ้างชื่อนี้:");
for (const o of d.options) {
  for (const [tag, cond] of [["showWhen", o.showWhen], ["showWhenAlso", o.showWhenAlso]])
    if (cond?.choices?.includes(NEW)) console.log(`   "${o.label}" ${tag} = ${cond.label} → ${cond.choices.join(", ")}`);
}

if (values !== 4 || keys !== 13 || missing.length) { console.error("\n⛔ ผลไม่ตรงที่คาด — ไม่เขียน"); process.exit(1); }
if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึกจริง)"); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`../.backup-texture-paper-${stamp}.json`, import.meta.url), JSON.stringify({ id: ID, data: before }, null, 2));
console.log(`\nสำรองของเดิมไว้ที่ .backup-texture-paper-${stamp}.json`);

d.savedAt = new Date().toISOString();
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) { console.error(e2); process.exit(1); }
console.log("✅ บันทึกแล้ว");
