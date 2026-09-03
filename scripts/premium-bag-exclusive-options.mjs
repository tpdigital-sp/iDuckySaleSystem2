#!/usr/bin/env node
/**
 * ตั้งชุด "เลือกได้อย่างเดียว" ในกลุ่ม OPTION ของ Premium Bag (premium-bag)
 *
 *   node scripts/premium-bag-exclusive-options.mjs           (ดูว่าจะเปลี่ยนอะไร)
 *   node scripts/premium-bag-exclusive-options.mjs --write   (เขียน DB + อ่านกลับเทียบ)
 *
 * ทำไม: กลุ่ม OPTION เป็นแบบติ๊กได้หลายอย่าง แต่บางคู่เป็น "ของชิ้นเดียวกัน ต่างกันแค่สกรีน/ไม่สกรีน"
 * ติ๊กพร้อมกันแล้วบวกเงินซ้ำ (เช่น +฿15 และ +฿20 ทั้งที่ได้ช่องเดียว) — ตั้ง choice.exclusiveWith
 * ให้หน้าสินค้าติ๊กตัวหนึ่งแล้วปลดอีกตัวในชุดเดียวกันให้เอง (ไม่ติ๊กเลยก็ยังได้)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PRODUCT_ID = "premium-bag";
const GROUP = "OPTION";
/** ชื่อตัวเลือก → ป้ายชุด (ชื่อต้องตรงกับใน DB เป๊ะ) */
const SETS = {
  "กระเป๋าเล็กด้านใน (ไม่สกรีน)": "inner-pocket",
  "กระเป๋าเล็กด้านใน (สกรีน)": "inner-pocket",
  "ผ้าร่ม ซับด้านใน (สีขาว)": "lining",
  "ผ้าร่ม ซับด้านใน (สกรีนลาย)": "lining",
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

data.savedAt = new Date().toISOString();
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
console.log(`✓ ตั้ง exclusiveWith ครบ ${ok} จุด อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
