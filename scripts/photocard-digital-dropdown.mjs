#!/usr/bin/env node
/**
 * โฟโต้การ์ด (photocard-digital) — เปลี่ยนกลุ่มตัวเลือกแบบการ์ด/ปุ่ม ให้เป็นเมนูเลื่อน (dropdown)
 * [เจ้าของร้านสั่ง 9 ก.ย. 69: "กลุ่มตัวเลือกดูรกไปหน่อย อยากได้ dropdown"]
 *
 *   node scripts/photocard-digital-dropdown.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/photocard-digital-dropdown.mjs --write   # เขียน + อ่านกลับเทียบ
 *
 * แตะเฉพาะ ProductOption.display: "cards" / "pills" (หรือไม่ตั้ง) → "dropdown"
 *   คงกลุ่ม multi (ติ๊กของเสริม) · input (ช่องกรอก) · dropdown อยู่แล้ว ไว้ตามเดิม
 * เมนูเลื่อนโชว์ภาพของตัวเลือกที่เลือกอยู่ข้างช่อง ภาพ/desc ในข้อมูลยังอยู่ครบ (desc ไม่โชว์ในเมนู)
 * ⚠️ ไม่แตะชื่อกลุ่ม/ตัวเลือก/ราคา/showWhen/section — คีย์ราคาและกฎอ้างด้วยชื่อ
 * รันซ้ำได้ ผลเหมือนเดิม
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "photocard-digital";
const FROM = new Set(["cards", "pills", undefined]);

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw error;
const d = row.data;
console.log(`${ID} · ${d.name} · ${d.options.length} กลุ่ม`);
const changed = [];
for (const o of d.options) {
  const before = o.display;
  if (FROM.has(o.display)) { o.display = "dropdown"; changed.push(o.label); }
  console.log(`  ${changed.includes(o.label) ? "→" : " "} [${o.section}] ${o.label}: ${before ?? "(pills)"}${changed.includes(o.label) ? " → dropdown" : ""} (${o.choices.length} ตัวเลือก)`);
}
console.log(`เปลี่ยน ${changed.length} กลุ่ม`);
if (!WRITE) { console.log("(dry-run — ใส่ --write เพื่อเขียนจริง)"); process.exit(0); }
if (!changed.length) { console.log("ไม่มีอะไรต้องเขียน"); process.exit(0); }

d.savedAt = new Date().toISOString();
const { error: updErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (updErr) throw updErr;
const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", ID).single();
if (backErr) throw backErr;
const bad = back.data.options.filter((o, i) => o.display !== d.options[i].display || o.label !== d.options[i].label);
if (bad.length) { console.error("❌ อ่านกลับไม่ตรง", bad.map((o) => o.label)); process.exit(1); }
console.log(`✓ บันทึก + อ่านกลับตรวจครบ · savedAt = ${back.data.savedAt}`);
