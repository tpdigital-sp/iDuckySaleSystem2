#!/usr/bin/env node
/**
 * "สแตนดี้อะคริลิค+จุกใส" — แก้ราคาแผ่นบน (อะคริลิคใสติดจุกใส) ให้คงที่ทุกช่วงจำนวน
 *
 *   node scripts/standee-clear-stopper-topplate-flat.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/standee-clear-stopper-topplate-flat.mjs --write   # เขียนจริง
 *
 * ผู้ใช้แจ้ง 2 ก.ย. 69 พร้อมใบเสนอราคาจริง: สั่ง 11 เซ็ต ตัว 6cm + แผ่นบน 2cm + ฐาน 3cm
 *   ตัวสแตนดี้ 69 + แผ่นบน 20 + ฐาน 10 + จุกใส 10 = 109 บาท/ชิ้น
 * แต่ระบบคิด 104 เพราะตอนสร้างสินค้ายกสูตรแผ่นบนมาจาก "พวงกุญแจ + อะไหล่จุกสีใส"
 * ซึ่งคิดแบบ "ติ่งห้อย" คือลดตามจำนวน (1-10 = 20 · 11-29 = 15 · 30 ขึ้นไป = 12)
 *
 * ของจริงแผ่นบน "ไม่ลดตามจำนวน" — 2 ซม. = 20 บาททุกช่วง แล้วบวกเพิ่มเซนละ 10 เหมือนเดิม
 * (3 ซม. = 30 · 4 ซม. = 40 … 10 ซม. = 100 ทุกช่วงจำนวน)
 *
 * วิธีแก้: บวกส่วนต่างของแต่ละช่วงจำนวนกลับเข้าไปในทุกช่อง — ส่วนต่างไม่ขึ้นกับขนาดแผ่นบน
 * (ค่าเซนละ 10 เท่าเดิมทุกช่วงอยู่แล้ว) จึงเป็นค่าคงที่ต่อช่วง: [0, +5, +8, +8, +8, +8]
 *
 * ⚠️ ไม่แตะ keyring-clear-stopper (ผู้ใช้สั่งให้แก้ตัวสแตนดี้ก่อนตัวเดียว 2 ก.ย. 69)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "new-mt1k6h3q-6601";
const NAME = "สแตนดี้อะคริลิค+จุกใส";
const DRIVERS = ["ขนาดตัวสแตนดี้ (แผ่นล่าง)", "งานสกรีน (แผ่นล่าง)", "ขนาดแผ่นบน (อะคริลิคใส)"];
/** ราคาแผ่นบนเดิมต่อช่วงจำนวน (ที่ขนาด 2 ซม.) → ของใหม่คงที่ 20 ทุกช่วง */
const OLD_TOP = [20, 15, 12, 12, 12, 12];
const NEW_TOP = 20;
const DELTA = OLD_TOP.map((v) => NEW_TOP - v); // [0, 5, 8, 8, 8, 8]
/** ช่องตัวอย่างจากใบเสนอราคาในภาพ — ไว้ตรวจก่อน/หลัง */
const SAMPLE = "6 ซม.│สกรีน 1 ด้าน (ใต้)│2 ซม.";
const SAMPLE_BEFORE = [170, 94, 87, 82, 77, 72];
const SAMPLE_AFTER = [170, 99, 95, 90, 85, 80];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("id,name,price,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่ได้ — ${error.message}`);
if (row.name !== NAME) throw new Error(`id ${ID} ตอนนี้เป็นสินค้า "${row.name}" ไม่ใช่ "${NAME}" — หยุดก่อน`);
const d = structuredClone(row.data);

/* ── ตรวจโครงตารางก่อนแตะ ─────────────────────────────────────── */
const matrices = [d.pricing, ...(d.priceRates ?? []).map((r) => r.pricing)].filter(Boolean);
if (matrices.length !== 2) throw new Error(`เจอตารางราคา ${matrices.length} ชุด (คาด 2: pricing + priceRates[0]) — ตรวจก่อน`);
for (const m of matrices) {
  if (JSON.stringify(m.driverLabels) !== JSON.stringify(DRIVERS))
    throw new Error(`แกนตารางเปลี่ยนแล้ว: ${JSON.stringify(m.driverLabels)} — ตรวจก่อน`);
  if (m.tiers?.length !== DELTA.length)
    throw new Error(`ช่วงจำนวนมี ${m.tiers?.length} ขั้น (คาด ${DELTA.length}) — ตรวจก่อน`);
  for (const [k, v] of Object.entries(m.cells))
    if (v.length !== DELTA.length) throw new Error(`ช่อง "${k}" มี ${v.length} ค่า (คาด ${DELTA.length}) — ตรวจก่อน`);
  if (JSON.stringify(m.cells[SAMPLE]) !== JSON.stringify(SAMPLE_BEFORE))
    throw new Error(`ช่องตัวอย่าง "${SAMPLE}" = ${JSON.stringify(m.cells[SAMPLE])} ไม่ใช่ ${JSON.stringify(SAMPLE_BEFORE)} — อาจถูกแก้ไปแล้ว หยุดก่อน`);
}

/* ── บวกส่วนต่างกลับเข้าไปทุกช่อง ──────────────────────────────── */
let n = 0;
for (const m of matrices) {
  for (const k of Object.keys(m.cells)) {
    m.cells[k] = m.cells[k].map((v, i) => v + DELTA[i]);
    n++;
  }
}
const all = Object.values(d.pricing.cells).flat();
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);

console.log(`📦 ${NAME} (${ID})`);
console.log(`   ส่วนต่างต่อช่วงจำนวน: ${d.pricing.tiers.map((t, i) => `${t.label} +${DELTA[i]}`).join(" · ")}`);
console.log(`   แก้ ${n} ช่อง (${matrices.length} ตาราง)`);
console.log(`   ช่องตัวอย่าง ${SAMPLE}`);
console.log(`     ก่อน: ${SAMPLE_BEFORE.join(", ")}`);
console.log(`     หลัง: ${d.pricing.cells[SAMPLE].join(", ")}`);
if (JSON.stringify(d.pricing.cells[SAMPLE]) !== JSON.stringify(SAMPLE_AFTER))
  throw new Error(`ผลลัพธ์ไม่ตรงที่คาด (${JSON.stringify(SAMPLE_AFTER)}) — หยุดก่อน`);
console.log(`   ✅ 11 ชิ้น: ตัว 69 + แผ่นบน 20 + จุกใส 10 = 99 · + ฐาน 3cm 10 = 109 บาท/ชิ้น (ตรงใบเสนอราคา)`);
console.log(`   ราคาต่ำสุด/สูงสุด: ${row.data.priceMin}/${row.data.priceMax} → ${d.priceMin}/${d.priceMax}`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}
const { error: e2 } = await sb.from("products").update({ data: d, price: d.priceMin }).eq("id", ID);
if (e2) throw new Error(`บันทึกไม่ได้ — ${e2.message}`);
console.log("\n💾 บันทึกแล้ว");
