#!/usr/bin/env node
/**
 * แผ่นแม่เหล็กติดรถยนต์ (acrylicmagnet-4): ค่าคละลายคิดเหมือนสติ๊กเกอร์ — ผู้ใช้สั่ง 26 ส.ค. 69
 *   ของเดิม: คละ 2-3 ลายฟรี เกินนั้นลายละ 5 ({baseFee:0, includedDesigns:3, extraFee:5})
 *   ของใหม่: ตรรกะเดียวกับ sticker-uv/pp = ลายละ 5 บาท/แผ่น A3 ลายแรกของแผ่นไม่คิด
 *            ({baseFee:5, includedDesigns:2, extraFee:5} → แผ่นที่มี n ลาย จ่าย (n-1)×5)
 *            ระบบกระจายลายลงแผ่นแบบถูกสุดให้อัตโนมัติ (mixSpread) เหมือนสติ๊กเกอร์ทุกอย่าง
 *   + แก้บรรทัด terms ให้ตรงกติกาใหม่
 *
 *   node scripts/car-magnet-mix-sticker.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/car-magnet-mix-sticker.mjs --write
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const ID = "acrylicmagnet-4";
// รูปเดียวกับ sticker-uv/pp เป๊ะ (รวมทรง tiers ที่หน้าแก้ไขสินค้าใช้)
const MIX = {
  tiers: [{ baseFee: 5, fromQty: 1, extraFee: 5, includedDesigns: 2 }],
  baseFee: 5,
  extraFee: 5,
  includedDesigns: 2,
};

const TERMS_OLD = "*คละลายได้ 2-3 ลาย มากกว่านั้น บวกเพิ่มลายละ 5 บาท";
const TERMS_NEW = "*คละลายใน 1 แผ่น A3: ค่าคละลายละ 5 บาท ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ)";

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

const { data: rows, error } = await sb.from("products").select("*").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า id=${ID}`);
if (row.name !== "แผ่นแม่เหล็กติดรถยนต์") die(`ชื่อไม่ตรงที่คาด (${row.name})`);
const d = row.data;

// terms — เจอของใหม่อยู่แล้ว = รอบก่อนแทนไปแล้ว (รันซ้ำได้) · ไม่เจอทั้งคู่ = โครงสร้างเปลี่ยน หยุดก่อน
if (d.terms?.includes(TERMS_NEW)) {
  console.log("terms: เป็นข้อความใหม่อยู่แล้ว");
} else if (d.terms?.includes(TERMS_OLD)) {
  d.terms = d.terms.replaceAll(TERMS_OLD, TERMS_NEW);
  console.log(`terms: "${TERMS_OLD}" → "${TERMS_NEW}"`);
} else {
  die("ไม่พบบรรทัดค่าคละใน terms (ทั้งแบบเก่าและแบบใหม่) — เช็คก่อน");
}

const before = JSON.stringify(d.mixRule);
d.mixRule = { ...MIX, tiers: MIX.tiers.map((t) => ({ ...t })) };
d.savedAt = new Date().toISOString();
console.log(`mixRule ${before ?? "—"} → ${JSON.stringify(d.mixRule)}`);

if (WRITE) {
  const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
  if (e2) die(e2.message);
  console.log("✓ เขียนแล้ว");
} else {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
}
