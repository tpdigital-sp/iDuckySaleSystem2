#!/usr/bin/env node
/**
 * สติ๊กเกอร์ทั้งตระกูล — ย่อคำอธิบายใต้กลุ่ม "ขนาดตัด" ให้สั้นลงครึ่งหนึ่ง
 *
 *   node scripts/sticker-cut-size-note-short.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/sticker-cut-size-note-short.mjs --write
 *
 * เดิม (174 ตัวอักษร — ยาวจนล้น 3 บรรทัดบนมือถือ):
 *   วางลายห่างกันอย่างน้อย 2 มม. · จุดไดคัทฟรีตามขนาดที่เลือก (รวมในราคาแล้ว)
 *   — เกินจากนั้นคิดเพิ่มจุดละ ฿0.50 ต่อแผ่น A3 จนถึงจำนวนสูงสุดของขนาดนั้น (กรอกจำนวนจุดในช่องด้านล่าง)
 *
 * ใหม่ (~90 ตัวอักษร):
 *   วางลายห่างกัน 2 มม.ขึ้นไป · จุดไดคัทฟรีตามโควตาของขนาดที่เลือก เกินโควตาจุดละ ฿0.50 / แผ่น A3
 *
 * ตัดออกเพราะซ้ำ/ไม่จำเป็น:
 *   • "(รวมในราคาแล้ว)" — คำว่า "ฟรี" บอกอยู่แล้ว
 *   • "จนถึงจำนวนสูงสุดของขนาดนั้น" — เพดานมีบอกอยู่ในบรรทัดเกณฑ์ของช่องกรอกอยู่แล้ว
 *   • "(กรอกจำนวนจุดในช่องด้านล่าง)" — ช่องกรอกอยู่ใต้บรรทัดนี้พอดี มีป้ายชื่อของตัวเอง
 *
 * ประโยคนี้ถูกโคลนข้ามสินค้าทั้งตระกูล — แก้ทีเดียวทุกตัวให้ข้อความตรงกัน
 * (ถ้าแก้ตัวเดียวจะกลายเป็นสินค้าพี่น้องเขียนคนละแบบ)
 * ส่วนท้าย "· วิธีนับจุดดูจากรูปตัวอย่าง —" ของบางตัวเก็บไว้ เพราะชี้ไปรูปประกอบจริง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));
const die = (m) => (console.error("✗ " + m), process.exit(1));

const OLD =
  "วางลายห่างกันอย่างน้อย 2 มม. · จุดไดคัทฟรีตามขนาดที่เลือก (รวมในราคาแล้ว) — เกินจากนั้นคิดเพิ่มจุดละ ฿0.50 ต่อแผ่น A3 จนถึงจำนวนสูงสุดของขนาดนั้น (กรอกจำนวนจุดในช่องด้านล่าง)";
const NEW = "วางลายห่างกัน 2 มม.ขึ้นไป · จุดไดคัทฟรีตามโควตาของขนาดที่เลือก เกินโควตาจุดละ ฿0.50 / แผ่น A3";

const { data: rows, error } = await sb.from("products").select("id,name,data");
if (error) die(error.message);

const hits = [];
for (const r of rows ?? []) {
  for (const o of r.data?.options ?? []) {
    const note = (o.note ?? "").toString();
    if (!note.startsWith(OLD)) continue;
    hits.push({ id: r.id, name: r.name, label: o.label, tail: note.slice(OLD.length), before: note.length });
  }
}
if (!hits.length) die("ไม่พบข้อความเดิมสักจุด — อาจถูกแก้ไปแล้ว");

console.log(`เจอ ${hits.length} จุด ใน ${new Set(hits.map((h) => h.id)).size} สินค้า:`);
for (const h of hits)
  console.log(`  · ${h.id} → "${h.label}" · ${h.before} → ${NEW.length + h.tail.length} ตัวอักษร${h.tail ? ` (เก็บท้าย "${h.tail.trim()}")` : ""}`);
console.log(`\nเดิม : ${OLD}\nใหม่ : ${NEW}`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

let done = 0;
for (const id of new Set(hits.map((h) => h.id))) {
  const row = rows.find((r) => r.id === id);
  const d = row.data;
  let touched = 0;
  for (const o of d.options ?? []) {
    const note = (o.note ?? "").toString();
    if (!note.startsWith(OLD)) continue;
    o.note = NEW + note.slice(OLD.length);
    touched++;
  }
  d.savedAt = new Date().toISOString();
  const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", id);
  if (e2) die(`${id}: ${e2.message}`);
  // อ่านกลับมายืนยันทีละตัว
  const { data: back } = await sb.from("products").select("data").eq("id", id);
  const left = (back[0].data.options ?? []).filter((o) => (o.note ?? "").startsWith(OLD)).length;
  if (left) die(`${id}: เขียนแล้วแต่ยังเหลือข้อความเดิม ${left} จุด`);
  console.log(`  ✓ ${id} — แก้ ${touched} จุด`);
  done += touched;
}
console.log(`✓ เสร็จ — แก้ทั้งหมด ${done} จุด`);
