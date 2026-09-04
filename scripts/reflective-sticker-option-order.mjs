#!/usr/bin/env node
/**
 * สติ๊กเกอร์สะท้อนแสง (reflective-sticker) — เรียงลำดับกลุ่มตัวเลือกให้ตรงกับ NEON
 *
 *   node scripts/reflective-sticker-option-order.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/reflective-sticker-option-order.mjs --write
 *
 * ทำไม: แถวนี้เป็นตัวเดียวในตระกูลสติ๊กเกอร์ที่ลำดับกลุ่มสลับกันมั่ว —
 *   ช่อง "ขนาดตัด (กว้าง/สูง)" กับ "จำนวนจุดไดคัท" โผล่ก่อนเมนู "ขนาดตัด" ที่เป็นตัวขับ
 *   ลูกค้าเลยเห็น "ขนาด A4 ฟรี 100 จุด" ตั้งแต่ยังไม่เห็นเมนูขนาดเลย
 *   และ "ขนาดไดคัท (สูง)" หลุดไปอยู่ท้ายสุด แยกจาก "ขนาดไดคัท (กว้าง)"
 *
 * ลำดับที่ต้องการ = อ่านสดจากแถว `neon` (โครงเดียวกันเป๊ะ: ขายแบบ + ไดคัท 50/100%)
 *   ขายแบบ > แบบไดคัท > ขอบไดคัท > ขนาดตัด > ขนาดตัด (กว้าง) > ขนาดตัด (สูง)
 *   > จำนวนจุดไดคัท > ขนาดไดคัท (กว้าง) > ขนาดไดคัท (สูง)
 *
 * ปลอดภัย: เรียงใหม่อย่างเดียว ไม่แตะเนื้อในกลุ่ม · เช็คว่าชุด label ก่อน/หลังเท่ากันเป๊ะ
 *   ก่อนยอมเขียน (กันกลุ่มหาย ดู memory: iducky-option-group-loss-guard)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));
const die = (m) => (console.error("x " + m), process.exit(1));

const TARGET = "reflective-sticker";
const MODEL = "neon";

const { data: rows, error } = await sb.from("products").select("id,name,data").in("id", [TARGET, MODEL]);
if (error) die(error.message);
const target = rows.find((r) => r.id === TARGET) || die(`ไม่เจอแถว ${TARGET}`);
const model = rows.find((r) => r.id === MODEL) || die(`ไม่เจอแถว ${MODEL}`);

const opts = target.data?.options ?? [];
if (!opts.length) die("สินค้าไม่มีกลุ่มตัวเลือก");

/** ลำดับอ้างอิงจาก NEON — กลุ่มที่ NEON ไม่มี ให้ต่อท้ายโดยคงลำดับเดิม */
const rank = new Map((model.data?.options ?? []).map((o, i) => [o.label, i]));
const before = opts.map((o) => o.label);
const sorted = opts
  .map((o, i) => ({ o, i, r: rank.has(o.label) ? rank.get(o.label) : 1e6 + i }))
  .sort((a, b) => a.r - b.r || a.i - b.i)
  .map((x) => x.o);
const after = sorted.map((o) => o.label);

const extra = before.filter((l) => !rank.has(l));
if (extra.length) console.log("กลุ่มที่ NEON ไม่มี (ต่อท้ายไว้): " + extra.join(" · "));

// กันกลุ่มหาย/งอก: จำนวนเท่ากัน และชุด label เหมือนกันทุกตัว (รวมตัวซ้ำ)
const key = (a) => [...a].sort().join(" ");
if (sorted.length !== opts.length || key(before) !== key(after)) die("ชุดกลุ่มเปลี่ยน — ไม่เขียน");

console.log(`\n${target.name} (${TARGET})`);
console.log("\n  เดิม:");
before.forEach((l, i) => console.log(`   ${String(i).padStart(2)}. ${l}`));
console.log("\n  ใหม่:");
after.forEach((l, i) => console.log(`   ${String(i).padStart(2)}. ${l}${before[i] === l ? "" : "   << ย้าย"}`));

if (before.join("|") === after.join("|")) {
  console.log("\nลำดับตรงอยู่แล้ว ไม่ต้องแก้");
  process.exit(0);
}
if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}

const saved = { ...target.data, options: sorted, savedAt: new Date().toISOString() };
const { error: upErr } = await sb.from("products").update({ data: saved }).eq("id", TARGET);
if (upErr) die(upErr.message);

// อ่านกลับยืนยัน
const { data: back } = await sb.from("products").select("data").eq("id", TARGET).single();
const now = (back?.data?.options ?? []).map((o) => o.label);
if (now.join("|") !== after.join("|")) die("อ่านกลับแล้วลำดับไม่ตรง");
console.log("\nบันทึกแล้ว · อ่านกลับยืนยันตรง");
