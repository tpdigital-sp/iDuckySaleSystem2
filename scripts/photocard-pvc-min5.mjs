#!/usr/bin/env node
/**
 * Photo card pvc (photocard-pvc-uv) — ขั้นต่ำจริง 5 ใบ + กติกาคละลาย
 *
 *   node scripts/photocard-pvc-min5.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/photocard-pvc-min5.mjs --write
 *
 * ผู้ใช้สั่ง 26 ส.ค. 69:
 *   1. จำนวนสั่งเริ่มต้นที่ 5 ใบ — ตั้งธง hardMinQty (minQty=5 มีอยู่แล้วแต่เป็นแค่
 *      "เรทนี้เริ่มใช้ที่" หน้าเว็บยังให้เริ่มที่ 1) → ช่องจำนวนเริ่มที่ 5 กดลดต่ำกว่านี้ไม่ได้
 *   2. คละลาย 5 ใบ ต่อ 1 ลาย เกินจากนั้นลายละ 5 บาท — minPerDesign=5 + extraDesignFee=5
 *      (มีอยู่แล้ว ตั้งซ้ำกันหลุด) + แก้บรรทัด terms ให้ตรงกติกา
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "photocard-pvc-uv";
const EXPECT_NAME = "Photo card pvc";
const MIN_QTY = 5;
const PER_DESIGN = 5;
const DESIGN_FEE = 5;
const TERMS_OLD = "• ขั้นต่ำ 1 ลาย สั่ง 5 ใบขึ้นไป · คละลายเกินโควตา คิดเพิ่มลายละ 5 บาท";
const TERMS_NEW = "• สั่งขั้นต่ำ 5 ใบ · คละลายได้ 5 ใบต่อ 1 ลาย เกินจากนั้นคิดเพิ่มลายละ 5 บาท";

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

// 1. ขั้นต่ำจริง 5 ใบ
const r1 = (d.priceRates ?? [])[0];
if (!r1) die("ไม่พบ priceRates[0]");
r1.minQty = MIN_QTY;
d.hardMinQty = true;

// 2. กติกาคละลาย 5 ใบ/ลาย · เกินโควตาลายละ 5 บาท (ไม่บล็อก จ่ายเพิ่มได้)
r1.minPerDesign = PER_DESIGN;
r1.extraDesignFee = DESIGN_FEE;

// 3. บรรทัด terms ให้ตรงกติกา
if (d.terms?.includes(TERMS_OLD)) d.terms = d.terms.replace(TERMS_OLD, TERMS_NEW);
else if (!d.terms?.includes(TERMS_NEW)) die(`ไม่พบบรรทัด terms เดิมที่คาด — เช็คข้อความก่อนเขียนทับ:\n${d.terms}`);

// pricing ระดับสินค้าคือตารางของเรทแรกเสมอ — ต้องไม่หลุดจากกัน
d.pricing = r1.pricing;
d.savedAt = new Date().toISOString();

console.log(`ขั้นต่ำ: ${MIN_QTY} ${r1.pricing.unit} (hardMinQty = ช่องจำนวนเริ่มที่ ${MIN_QTY} กดลดต่ำกว่านี้ไม่ได้)`);
console.log(`คละลาย: ${PER_DESIGN} ใบ/ลาย · เกินโควตาลายละ ${DESIGN_FEE} บาท`);
console.log(`terms: ${d.terms.split("\n").find((l) => l.includes("คละลาย"))}`);

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
const br = b.priceRates[0];
const ok =
  b.hardMinQty === true &&
  br.minQty === MIN_QTY &&
  br.minPerDesign === PER_DESIGN &&
  br.extraDesignFee === DESIGN_FEE &&
  b.terms.includes(TERMS_NEW);
console.log(
  `อ่านกลับ: hardMinQty=${JSON.stringify(b.hardMinQty)} · minQty=${br.minQty} · minPerDesign=${br.minPerDesign} · extraDesignFee=${br.extraDesignFee} · terms ${b.terms.includes(TERMS_NEW) ? "ใหม่แล้ว" : "❌ ยังเก่า"}`
);
if (!ok) die("เขียนแล้วแต่ค่าที่อ่านกลับไม่ตรง — ยังไม่เสร็จ");
console.log("✓ เขียน Supabase แล้ว (ยืนยันจากการอ่านกลับ)");
