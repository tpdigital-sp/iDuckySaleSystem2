#!/usr/bin/env node
/**
 * สติ๊กเกอร์ทั้งตระกูล — ตัดข้อความซ้ำใต้ช่อง "จำนวนจุดไดคัท"
 *
 *   node scripts/sticker-dot-note-short.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/sticker-dot-note-short.mjs --write
 *
 * ทำไม: บล็อกนี้พูดเรื่องเดียวกัน 2-3 รอบซ้อนกัน เพราะข้อความคงที่ในฐานข้อมูล
 * ไปเขียนทับสิ่งที่ระบบสร้างให้อัตโนมัติอยู่แล้ว (พร้อมตัวเลขจริงของขนาดที่เลือก)
 *
 *   note (คงที่)  : "เกินโควตาของขนาดที่เลือก คิดจุดละ ฿0.50 ต่อแผ่น A3 · สั่ง 25 แผ่น… ฟรีค่าจุด"
 *   🎁 (อัตโนมัติ) : "ขนาด A4 ฟรี 100 จุด — เกินจากนั้นจุดละ ฿0.50 / แผ่น A3"   ← พูดเรื่องเดียวกัน แต่มีตัวเลขจริง
 *   รับ 1–180 จุด  : เพดานรับงาน (อัตโนมัติ)
 *
 * เก็บไว้เฉพาะท่อนที่ระบบสร้างเองไม่ได้ = เงื่อนไข "สั่งถึงเกณฑ์แล้วฟรีค่าจุด"
 *
 * hint ใต้ช่องกรอก: "นับจุดของลาย 1 ชิ้น — วิธีนับดูจากรูปตัวอย่าง"
 * → ตัดครึ่งหลังทิ้ง เพราะมีปุ่ม "👀 กดดูรูปตัวอย่าง" อยู่ใต้บรรทัดนั้นพอดี
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));
const die = (m) => (console.error("✗ " + m), process.exit(1));

/** เก็บเฉพาะท่อน "สั่ง … ฟรีค่าจุด" — ท่อนอื่นระบบสร้างเองพร้อมตัวเลขจริงอยู่แล้ว */
const shortNote = (n) => (n.match(/สั่ง\s*[\d,.]+\s*[^·]*?ฟรีค่าจุด/) ?? [""])[0].trim();
const HINT_NEW = "นับจุดของลาย 1 ชิ้น";

const { data: rows, error } = await sb.from("products").select("id,name,data");
if (error) die(error.message);

const plan = [];
for (const r of rows ?? []) {
  for (const o of r.data?.options ?? []) {
    if (!/จุดไดคัท/.test(o.label)) continue;
    const note = (o.note ?? "").toString();
    const hint = (o.input?.hint ?? "").toString();
    const nn = note && /คิดจุดละ|จุดไดคัทฟรี/.test(note) ? shortNote(note) : null;
    const hh = hint.includes("วิธีนับ") ? HINT_NEW : null;
    if (!nn && !hh) continue;
    plan.push({ id: r.id, label: o.label, note, nn, hint, hh });
  }
}
if (!plan.length) die("ไม่พบข้อความที่ต้องย่อ — อาจแก้ไปแล้ว");

console.log(`เจอ ${plan.length} จุด ใน ${new Set(plan.map((p) => p.id)).size} สินค้า:`);
for (const p of plan) {
  console.log(`  · ${p.id} → "${p.label}"`);
  if (p.nn) console.log(`      note ${p.note.length} → ${p.nn.length} : ${p.nn || "(ว่าง)"}`);
  if (p.hh) console.log(`      hint ${p.hint.length} → ${p.hh.length} : ${p.hh}`);
}

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

for (const id of new Set(plan.map((p) => p.id))) {
  const d = rows.find((r) => r.id === id).data;
  for (const o of d.options ?? []) {
    const mine = plan.find((p) => p.id === id && p.label === o.label);
    if (!mine) continue;
    if (mine.nn !== null) o.note = mine.nn;
    if (mine.hh !== null) o.input.hint = mine.hh;
  }
  d.savedAt = new Date().toISOString();
  const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", id);
  if (e2) die(`${id}: ${e2.message}`);
  const { data: back } = await sb.from("products").select("data").eq("id", id);
  const left = (back[0].data.options ?? []).filter(
    (o) => /จุดไดคัท/.test(o.label) && /คิดจุดละ|วิธีนับ/.test((o.note ?? "") + (o.input?.hint ?? ""))
  ).length;
  if (left) die(`${id}: เขียนแล้วแต่ยังเหลือข้อความเดิม ${left} จุด`);
  console.log(`  ✓ ${id}`);
}
console.log("✓ เสร็จ");
