#!/usr/bin/env node
/**
 * 🔓 พวงกุญแจเขย่า — เลือก "วิธีปิดกรอบ" ได้ทั้ง 2 แบบเสมอ ไม่ว่าจะเลือกตะขอแบบไหน
 *
 * เดิมมีกติกา (rules) ล็อกไว้ว่า เลือก "ไม่เจาะรูตะขอ" แล้วเหลือ "ติดกาวปิดถาวร" อย่างเดียว
 * → หน้าสินค้ายุบกลุ่มเป็นป้าย 🔒 "ตัวเลือกนี้ถูกกำหนดอัตโนมัติ…" แทนการ์ดให้เลือก
 * เจ้าของร้านสั่ง 14 ก.ย. 69 ให้โชว์การ์ดครบทั้ง 2 แบบเหมือนตอนเลือกตะขอแบบอื่น
 *
 *   node scripts/shake-shake-closure-any-hook.mjs            # ดูก่อน
 *   node scripts/shake-shake-closure-any-hook.mjs --write    # เขียน + อ่านกลับเทียบ
 *
 * รันซ้ำได้ · แตะเฉพาะกติกาที่จำกัดกลุ่ม "วิธีปิดกรอบ" — กติกาของกลุ่มอื่น (ถ้ามีทีหลัง) ไม่ยุ่ง
 * ⚠️ กติกาชุดนี้ตั้งจากหน้าแก้ไขสินค้า ไม่มีสคริปต์ไหนสร้าง — ตั้งกลับได้ที่หลังบ้านถ้าเปลี่ยนใจ
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ID = "new-mt2rp5i3-9488";
const LABEL = "วิธีปิดกรอบ";
const WRITE = process.argv.includes("--write");
const die = (m) => { console.error("✗ " + m); process.exit(1); };

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) die(error.message);
const data = row.data;
const group = (data.options ?? []).filter((o) => o.label === LABEL);
if (group.length !== 1) die(`กลุ่ม "${LABEL}" พบ ${group.length} กลุ่ม — ตรวจก่อน`);
const all = (group[0].choices ?? []).map((c) => c.name);
if (all.length < 2) die(`กลุ่ม "${LABEL}" มีตัวเลือก ${all.length} ตัว — ไม่มีอะไรให้ปลดล็อก`);

const rules = data.rules ?? [];
const hit = rules.filter((r) => r.limit?.label === LABEL);
const keep = rules.filter((r) => r.limit?.label !== LABEL);
if (!hit.length) { console.log(`ทำไปแล้ว — ไม่มีกติกาที่จำกัด "${LABEL}"`); process.exit(0); }

console.log(`กติกาที่จะเอาออก ${hit.length} ข้อ (กลุ่ม "${LABEL}" มี ${all.length} แบบ: ${all.join(" | ")})`);
for (const r of hit)
  console.log(`  ↳ เลือก "${r.when?.label}" = ${(r.when?.choices ?? []).join(" / ")} → เหลือ ${(r.limit?.allow ?? []).join(" / ")}`);
console.log(`เหลือกติกาอื่น ${keep.length} ข้อ`);
if (!WRITE) { console.log("\n👀 dry-run — เติม --write เพื่อเขียนจริง"); process.exit(0); }

const savedAt = new Date().toISOString();
const next = { ...data, savedAt };
if (keep.length) next.rules = keep; else delete next.rules;
const { data: upd, error: e2 } = await sb.from("products").update({ data: next }).eq("id", ID).select("data");
if (e2 || !upd?.length) die("update พัง/0 แถว " + (e2?.message ?? ""));

const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const left = (back.data.rules ?? []).filter((r) => r.limit?.label === LABEL);
if (left.length) die(`อ่านกลับยังเจอกติกาที่จำกัด "${LABEL}" ${left.length} ข้อ`);
const g = (back.data.options ?? []).find((o) => o.label === LABEL);
if ((g?.choices ?? []).length !== all.length) die("อ่านกลับ: ตัวเลือกในกลุ่มไม่ครบเท่าเดิม");
console.log(`✓ เขียนแล้ว อ่านกลับตรง · "${LABEL}" เลือกได้ครบ ${all.length} แบบทุกกรณี · savedAt = ${back.data.savedAt}`);
