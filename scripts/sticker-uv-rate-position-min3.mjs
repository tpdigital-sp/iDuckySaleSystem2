#!/usr/bin/env node
/**
 * Sticker-uv — ย้ายแผงเรทราคา + ขั้นต่ำ 3 แผ่น A3
 *
 *   node scripts/sticker-uv-rate-position-min3.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/sticker-uv-rate-position-min3.mjs --write
 *
 * ทำ 2 อย่าง:
 *   1. ลำดับกลุ่ม: เนื้อสติ๊กเกอร์ → เรทราคา → แบบไดคัท
 *      (ตั้ง rateAfterOption = "เนื้อสติ๊กเกอร์" · ถอด rateAfterOptions ที่ดันแผงเรทไปท้ายสุด)
 *      เลือกเรทก่อนถึงจะเจอกลุ่ม "ขนาดตัด" ที่ขึ้นกับเรท
 *   2. เรท "ขายแบบ ขนาด A3" เริ่มขายที่ 3 แผ่น A3 (ตารางราคาเริ่มที่ช่วง "3-9 แผ่น A3" อยู่แล้ว)
 *      ตั้ง minQty = 3 + ธง hardMinQty = ขั้นต่ำจริง กดลดต่ำกว่านี้ไม่ได้ (ไม่ใช่แค่ "เรทนี้เริ่มใช้ที่")
 *      เรทตารางเมตรไม่ตั้ง minQty — ตารางเริ่มที่ 1 ตร.ม. ตามเดิม
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "sticker-uv";
const EXPECT_NAME = "Sticker-uv";
const ANCHOR = "เนื้อสติ๊กเกอร์";
const RATE_A3 = "ขายแบบ ขนาด A3";
const MIN_A3 = 3;

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

// 1. ตำแหน่งแผงเรท — แทรกใต้กลุ่มเนื้อสติ๊กเกอร์
if (!d.options.some((o) => o.label === ANCHOR)) die(`ไม่พบกลุ่ม "${ANCHOR}" — ตั้ง rateAfterOption ไม่ได้`);
d.rateAfterOption = ANCHOR;
delete d.rateAfterOptions; // ไม่งั้นแผงเรทตกไปท้ายสุดเมื่อกลุ่มหลักถูกซ่อน

// 2. ขั้นต่ำ 3 แผ่น A3 (เฉพาะเรท A3)
const a3 = (d.priceRates ?? []).find((r) => r.label === RATE_A3);
if (!a3) die(`ไม่พบเรท "${RATE_A3}"`);
a3.minQty = MIN_A3;
d.hardMinQty = true;
// pricing ระดับสินค้าคือตารางของเรทแรกเสมอ — ต้องไม่หลุดจากกัน
if (d.priceRates[0].label === RATE_A3) d.pricing = a3.pricing;
d.savedAt = new Date().toISOString();

console.log(`ลำดับกลุ่ม: ${ANCHOR} → [เรทราคา] → ${d.options.filter((o) => o.label !== ANCHOR).map((o) => o.label).join(" / ")}`);
console.log(`ขั้นต่ำ: "${RATE_A3}" = ${MIN_A3} ${a3.pricing.unit} (hardMinQty = ขั้นต่ำจริง กดลดต่ำกว่านี้ไม่ได้)`);
for (const r of d.priceRates) console.log(`  · ${r.label}: minQty=${r.minQty ?? "—"} · ช่วงแรก "${r.pricing.tiers[0].label}"`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { data: wrote, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!wrote?.length) die("update ไม่โดนแถวไหนเลย (0 rows) — เช็ค id/สิทธิ์");

// อ่านกลับมายืนยัน — เคยเจอ update ผ่านแต่ค่าไม่ลง เลยต้องเช็คของจริงทุกครั้ง
const { data: back } = await sb.from("products").select("data").eq("id", ID);
const b = back[0].data;
const ok =
  b.rateAfterOption === ANCHOR &&
  b.rateAfterOptions === undefined &&
  b.hardMinQty === true &&
  b.priceRates.find((r) => r.label === RATE_A3)?.minQty === MIN_A3;
console.log(
  `อ่านกลับ: rateAfterOption=${JSON.stringify(b.rateAfterOption)} · rateAfterOptions=${JSON.stringify(b.rateAfterOptions)} · hardMinQty=${JSON.stringify(b.hardMinQty)} · A3 minQty=${b.priceRates.find((r) => r.label === RATE_A3)?.minQty}`
);
if (!ok) die("เขียนแล้วแต่ค่าที่อ่านกลับไม่ตรง — ยังไม่เสร็จ");
console.log("✓ เขียน Supabase แล้ว (ยืนยันจากการอ่านกลับ)");
