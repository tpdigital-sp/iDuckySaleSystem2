#!/usr/bin/env node
/**
 * ภาพประจำตัวเลือกชุด "ตะขอ" + "สีตะขอ *" ของพวงกุญแจ หลายชิ้นใน 1 พวง (keyring-multi-charm)
 *
 *   node scripts/multi-charm-hook-images.mjs            # ดูอย่างเดียว (dry-run) ว่าจะเติมรูปให้ตัวไหนบ้าง
 *   node scripts/multi-charm-hook-images.mjs --write    # เขียน DB + อ่านกลับเทียบ
 *
 * ไม่ต้องวาดใหม่ — ชุดตะขอเดียวกันเป๊ะกับ standee-keyring (พวงกุญแจสแตนดี้) ที่ถ่ายรูปครบแล้ว
 * 220 ตัวเลือก (ตะขอ 31 + สีตะขอ 11 กลุ่ม) จึงก๊อป imageSrc มาตรง ๆ ตามชื่อตัวเลือก
 *
 * จับคู่ชื่อ: ตรงเป๊ะก่อน → ถ้าไม่ตรงใช้ "รหัสหน้าชื่อ" (Z1 / AA / C ...) เพราะต้นทางมี " — ฟรี" ต่อท้าย 2 ตัว
 * ⚠️ แตะแค่ imageSrc — ห้ามแก้ชื่อตัวเลือก (เป็นเงื่อนไข showWhen ของกลุ่มสีตะขอ และเป็นคีย์ราคาส่วนเสริม)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const DST = "keyring-multi-charm";
const SRC = "standee-keyring";
const isHookGroup = (label) => /^ตะขอ$|^สีตะขอ/.test(label);
/** รหัสหน้าชื่อตัวเลือกตะขอ — "Z1 ห่วงกลม (สีเงิน)" → "Z1" (ชื่อสีไม่มีรหัส คืนทั้งชื่อ) */
const code = (name) => (name.match(/^([A-Z]{1,2}\d?)\s/) ?? [])[1] ?? name;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: rows, error } = await sb.from("products").select("id,data").in("id", [DST, SRC]);
if (error) { console.error(error); process.exit(1); }
const src = rows.find((r) => r.id === SRC);
const dst = rows.find((r) => r.id === DST);
if (!src || !dst) { console.error("ไม่เจอสินค้าต้นทาง/ปลายทาง"); process.exit(1); }

/** ตาราง imageSrc ของต้นทาง: กลุ่ม → (ชื่อเต็ม|รหัส) → url */
const bank = new Map();
for (const o of src.data.options ?? []) {
  if (!isHookGroup(o.label)) continue;
  const m = new Map();
  for (const c of o.choices ?? []) {
    if (!c.imageSrc) continue;
    m.set(c.name, c.imageSrc);
    if (!m.has(code(c.name))) m.set(code(c.name), c.imageSrc);
  }
  bank.set(o.label, m);
}

const data = dst.data;
const plan = [];   // { group, name, url }
const missing = [];
for (const o of data.options ?? []) {
  if (!isHookGroup(o.label)) continue;
  const m = bank.get(o.label);
  if (!m) { missing.push(`ทั้งกลุ่ม "${o.label}" (ต้นทางไม่มีกลุ่มนี้)`); continue; }
  for (const c of o.choices ?? []) {
    const url = m.get(c.name) ?? m.get(code(c.name));
    if (!url) { missing.push(`${o.label} / ${c.name}`); continue; }
    if (c.imageSrc === url) continue;             // มีอยู่แล้วและตรงกัน — ข้าม (รันซ้ำได้)
    plan.push({ group: o.label, name: c.name, url });
  }
}

for (const p of plan) console.log(`+ ${p.group} / ${p.name}`);
if (missing.length) { console.log(`\n⚠️ หารูปไม่เจอ ${missing.length} รายการ:`); for (const s of missing) console.log("   " + s); }
console.log(`\nจะเติมรูป ${plan.length} ตัวเลือก · หาไม่เจอ ${missing.length}`);

if (!plan.length) { console.log("ไม่มีอะไรต้องทำ (เติมครบแล้ว)"); process.exit(0); }
if (!WRITE) { console.log("(dry-run — ใส่ --write เพื่อเขียนจริง)"); process.exit(0); }
if (missing.length) { console.error("❌ ยังมีตัวที่หารูปไม่เจอ — แก้ให้ครบก่อนค่อยเขียน"); process.exit(1); }

for (const o of data.options ?? []) {
  if (!isHookGroup(o.label)) continue;
  const m = bank.get(o.label);
  for (const c of o.choices ?? []) c.imageSrc = m.get(c.name) ?? m.get(code(c.name)) ?? c.imageSrc;
}
data.savedAt = new Date().toISOString();                    // ISO เท่านั้น — ตัวเลขทำให้หน้าแก้ไขติด 409 ตลอด

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", DST).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — "ไม่ error" ไม่ได้แปลว่าค่าลงจริง
const { data: back } = await sb.from("products").select("data").eq("id", DST).single();
for (const p of plan) {
  const g = back.data.options.find((o) => o.label === p.group);
  const c = g?.choices?.find((x) => x.name === p.name);
  if (c?.imageSrc !== p.url) { console.error("อ่านกลับไม่ตรง:", p.group, p.name, c?.imageSrc); process.exit(1); }
}
console.log(`✓ เติมรูปตะขอ ${plan.length} ตัวเลือก อ่านกลับตรงทั้งหมด · savedAt = ${back.data.savedAt}`);
