#!/usr/bin/env node
/**
 * ย่อคำอธิบายกลุ่ม "สีไหมเย็บชิ้นงาน" ให้สั้นลง 1 บรรทัด
 *
 *   node scripts/thread-color-note-short.mjs                 # dry-run เฉพาะ semi-bag
 *   node scripts/thread-color-note-short.mjs --write         # บันทึก semi-bag
 *   node scripts/thread-color-note-short.mjs --all --write   # บันทึกทุกสินค้าที่ใช้ข้อความเดิมเป๊ะ ๆ
 *
 * ตัดออก: "จากประเทศ", "เส้นไหมเรียบเงา", "ต่อการ", และท่อน "กดที่รูปเพื่อดูชาร์ตสีเต็ม"
 * (ท่อนสุดท้ายซ้ำกับปุ่ม "👀 กดดูรูปตัวอย่าง" ที่อยู่ข้าง ๆ อยู่แล้ว)
 * ⚠️ แตะเฉพาะกลุ่มที่ note ตรงกับข้อความเดิมทุกตัวอักษร — สินค้าที่เขียนกติกาสีเอง (ปักไม่เกิน 3 สี ฯลฯ) ไม่โดน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const WRITE = process.argv.includes("--write");
const ALL = process.argv.includes("--all");

const OLD = "ไหมปัก MADEIRA จากประเทศเยอรมนี โพลีเอสเตอร์ 100% เส้นไหมเรียบเงา ทนต่อการซักฟอก — เลือกได้ 1 สีต่องาน **ไม่มีค่าใช้จ่ายเพิ่ม** · กดที่รูปเพื่อดูชาร์ตสีเต็ม";
const NEW = "ไหมปัก MADEIRA เยอรมนี · โพลีเอสเตอร์ 100% ทนซักฟอก — เลือก 1 สีต่องาน **ไม่มีค่าใช้จ่ายเพิ่ม**";

const { data: rows, error } = await sb.from("products").select("id,name,data");
if (error) throw error;

let hit = 0;
for (const p of rows) {
  if (!ALL && p.id !== "semi-bag") continue;
  let touched = false;
  for (const g of p.data?.options ?? []) {
    if ((g.note ?? "").trim() !== OLD) continue;
    g.note = NEW;
    touched = true;
  }
  if (!touched) continue;
  hit++;
  console.log(`${WRITE ? "✏️" : "·"}  ${p.id} — ${p.name}`);
  if (WRITE) {
    const { error: e2 } = await sb.from("products").update({ data: p.data }).eq("id", p.id);
    if (e2) throw e2;
  }
}

console.log(`\nเดิม: ${OLD}\nใหม่: ${NEW}`);
console.log(`\n${hit} สินค้า${WRITE ? " — บันทึกแล้ว ✅" : ` (dry-run${ALL ? "" : " · เติม --all เพื่อรวมสินค้าอื่นที่ใช้ข้อความเดียวกัน"} — เติม --write เพื่อบันทึกจริง)`}`);
