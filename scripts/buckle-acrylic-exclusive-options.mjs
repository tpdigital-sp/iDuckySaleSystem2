#!/usr/bin/env node
/**
 * บัคเคิ้ลอะคริลิค (buckle-acrylic) — กลุ่ม "อะคริลิค" ตั้งชุด "เลือกได้อย่างเดียว"
 *
 *   node scripts/buckle-acrylic-exclusive-options.mjs           (ดูว่าจะเปลี่ยนอะไร)
 *   node scripts/buckle-acrylic-exclusive-options.mjs --write   (เขียน DB + อ่านกลับเทียบ)
 *
 * ทำไม: กลุ่มนี้ติ๊กได้หลายอย่าง (ชิ้นตัว + ก้าน = คนละชิ้นของงานเดียวกัน สั่งพร้อมกันได้)
 * แต่ในแต่ละชิ้น "ธรรมดา / พิเศษ" คือเนื้ออะคริลิคของชิ้นเดียวกัน ติ๊กพร้อมกันไม่ได้ (บวกเงินซ้ำ)
 *   ชุด "piece" = ชิ้นตัว (ธรรมดา) / ชิ้นตัว (พิเศษ +฿10)
 *   ชุด "bar"   = ก้าน (ธรรมดา) / ก้าน (พิเศษ +฿5)
 * ติ๊กตัวหนึ่งในชุด → อีกตัวถูกปลดให้เอง (ไม่ติ๊กทั้งชุดก็ยังได้)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PRODUCT_ID = "buckle-acrylic";
const GROUP = "อะคริลิค";
/** ชื่อตัวเลือก → ป้ายชุด (ชื่อต้องตรงกับใน DB เป๊ะ) */
const SETS = {
  "ชิ้นตัว (อะคริลิคธรรมดา)": "piece",
  "ชิ้นตัว (อะคริลิคพิเศษ)": "piece",
  "ก้าน (อะคริลิคธรรมดา)": "bar",
  "ก้าน (อะคริลิคพิเศษ)": "bar",
};

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (error) { console.error(error); process.exit(1); }
const data = row.data;

// กลุ่มชื่อซ้ำกันได้ (แยกด้วย showWhen) — ต้อง filter แล้ววนทุกกลุ่ม ไม่ใช่ find กลุ่มแรก
let touched = 0;
for (const [name, tag] of Object.entries(SETS)) {
  const hits = (data.options ?? []).filter((o) => o.label === GROUP).flatMap((o) => (o.choices ?? []).filter((c) => c.name === name));
  if (!hits.length) { console.error(`ไม่เจอตัวเลือก "${name}" ในกลุ่ม "${GROUP}"`); process.exit(1); }
  for (const c of hits) { c.exclusiveWith = tag; touched++; }
  console.log(`  ${name}  →  ชุด "${tag}"  (${hits.length} จุด)`);
}

if (!process.argv.includes("--write")) { console.log(`\n(ยังไม่เขียน DB — รันด้วย --write) จะแตะ ${touched} จุด`); process.exit(0); }

data.savedAt = new Date().toISOString();   // ⚠️ ISO string เท่านั้น (ด่านกัน 409 ของหน้าแก้ไข)
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
let ok = 0;
for (const [name, tag] of Object.entries(SETS)) {
  const got = back.data.options.filter((o) => o.label === GROUP).flatMap((o) => (o.choices ?? []).filter((c) => c.name === name));
  if (!got.length || got.some((c) => c.exclusiveWith !== tag)) { console.error("อ่านกลับไม่ตรง!", name, got.map((c) => c.exclusiveWith)); process.exit(1); }
  ok += got.length;
}
if (ok !== touched) { console.error(`จำนวนจุดไม่ตรง เขียน ${touched} อ่านกลับ ${ok}`); process.exit(1); }
// กลุ่มอื่นต้องไม่หาย (กันเขียนทับข้อมูลเก่า)
const labels = back.data.options.map((o) => o.label);
for (const need of ["ขนาด (ด้านยาวสุด)", GROUP, "สีอะคริลิค"]) {
  if (!labels.includes(need)) { console.error(`กลุ่ม "${need}" หายไป!`); process.exit(1); }
}
console.log(`✓ ตั้ง exclusiveWith ครบ ${ok} จุด อ่านกลับตรงทุกตัว · กลุ่มครบ ${labels.length} กลุ่ม · savedAt =`, back.data.savedAt);
