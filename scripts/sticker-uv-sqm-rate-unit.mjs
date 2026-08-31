#!/usr/bin/env node
/**
 * Sticker-uv — แก้หน่วยขายของเรท "ขายแบบ ขนาด ตารางเมตร" จาก "แผ่น A3" → "ตร.ม."
 *
 *   node scripts/sticker-uv-sqm-rate-unit.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/sticker-uv-sqm-rate-unit.mjs --write
 *
 * ทำไม: เรทนี้ตั้ง pricing.unit = "แผ่น A3" แต่ช่วงราคาเป็น ตร.ม. ทั้งหมด (1-4 ตร.ม. …)
 * และกลุ่ม "ขนาดตัด (ตร.ม.)" ตั้ง piecesPerUnit A4 = 16 ชิ้นต่อ 1 หน่วย
 * (ถ้าหน่วยเป็นแผ่น A3 ต้องได้ 2 ชิ้น) → พิสูจน์ว่า 1 หน่วยสั่งของเรทนี้ = 1 ตร.ม. จริง
 *
 * ผลของป้ายผิด: หน้าเว็บขึ้น "จำนวน (แผ่น A3)" และ "฿950 / แผ่น A3" ทั้งที่เป็นราคาต่อ 1 ตร.ม.
 * ลูกค้าอ่านแล้วเห็นราคาเพี้ยนไป 8 เท่า (1 ตร.ม. = 8 แผ่น A3)
 *
 * ⚠️ สคริปต์นี้แก้ "ป้ายหน่วย" อย่างเดียว — ตัวเลขราคาในตารางไม่แตะเลยสักช่อง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "sticker-uv";
const EXPECT_NAME = "Sticker-uv";
const RATE_SQM = "ขายแบบ ขนาด ตารางเมตร";
const OLD_UNIT = "แผ่น A3";
const NEW_UNIT = "ตร.ม.";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

const { data: rows, error } = await sb.from("products").select("*").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า id=${ID}`);
if (row.name !== EXPECT_NAME) die(`ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);
const d = row.data;

const sqm = (d.priceRates ?? []).find((r) => r.label === RATE_SQM);
if (!sqm) die(`ไม่พบเรท "${RATE_SQM}"`);
if (sqm.pricing.unit === NEW_UNIT) {
  console.log(`เรท "${RATE_SQM}" ตั้งหน่วยเป็น "${NEW_UNIT}" อยู่แล้ว — ไม่ต้องทำอะไร`);
  process.exit(0);
}
if (sqm.pricing.unit !== OLD_UNIT) die(`หน่วยเดิมไม่ตรงที่คาด ("${sqm.pricing.unit}") — หยุดกันแก้ผิดที่`);

// กันแก้ผิดเรท: ช่วงราคาของเรทนี้ต้องพูดถึง ตร.ม. จริง ๆ
if (!sqm.pricing.tiers.every((t) => /ตร\.ม\./.test(t.label)))
  die("ช่วงราคาของเรทนี้ไม่ได้เป็น ตร.ม. ทุกช่วง — หยุดไว้ก่อน");

const before = JSON.stringify(sqm.pricing.cells);
sqm.pricing.unit = NEW_UNIT;
// pricing ระดับสินค้าคือตารางของเรทแรกเสมอ — เรทแรกคือ A3 จึงไม่ต้องแตะ แต่เช็คกันพลาด
if (d.priceRates[0].label === RATE_SQM) d.pricing = sqm.pricing;
d.savedAt = new Date().toISOString();

if (JSON.stringify(sqm.pricing.cells) !== before) die("ตัวเลขราคาถูกแตะโดยไม่ตั้งใจ — ยกเลิก");

console.log(`เรท "${RATE_SQM}"`);
console.log(`  หน่วยขาย : "${OLD_UNIT}"  →  "${NEW_UNIT}"`);
console.log(`  ช่วงราคา : ${sqm.pricing.tiers.map((t) => t.label).join(" | ")}`);
console.log(`  ตัวเลขราคา: ไม่แตะ (${Object.keys(sqm.pricing.cells).length} คู่ตัวเลือก)`);
console.log(`เรทอื่นไม่แตะ: ${d.priceRates.filter((r) => r.label !== RATE_SQM).map((r) => `"${r.label}" = ${r.pricing.unit}`).join(" · ")}`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { data: wrote, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!wrote?.length) die("update ไม่โดนแถวไหนเลย (0 rows) — เช็ค id/สิทธิ์");

// อ่านกลับมายืนยัน — เคยเจอ update ผ่านแต่ค่าไม่ลง
const { data: back } = await sb.from("products").select("data").eq("id", ID);
const b = back[0].data;
const bs = b.priceRates.find((r) => r.label === RATE_SQM);
const ok = bs?.pricing.unit === NEW_UNIT && JSON.stringify(bs.pricing.cells) === before;
console.log(`อ่านกลับ: unit=${JSON.stringify(bs?.pricing.unit)} · ตัวเลขราคาเหมือนเดิม=${JSON.stringify(bs?.pricing.cells) === before}`);
if (!ok) die("เขียนแล้วแต่ค่าที่อ่านกลับไม่ตรง — ยังไม่เสร็จ");
console.log("✓ เสร็จ");
