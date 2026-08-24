#!/usr/bin/env node
/**
 * "Photo card Digital" (photocard-digital) — กลุ่ม "ขนาดตัด" แบบเดียว
 * (ร้านสั่ง 24 ส.ค. 69 — เอากลุ่มขนาดตัดกลับมา แต่ไม่ต้องมีตัดตามขนาด/ไดคัทตามทรง)
 *
 *   node scripts/photocard-cut-size-group.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/photocard-cut-size-group.mjs --write
 *
 * กลุ่ม "ขนาดตัด" มีตัวเลือกเดียว "ตัดขนาดโฟโต้การ์ด 5.5×8.5 ซม. (20 ใบ/เซ็ต)"
 * ตั้ง piecesPerUnit = 20 → หน้าเว็บสรุปให้ว่า "สั่ง 3 เซ็ต (20 ใบ) = ได้ 60 ชิ้น"
 *
 * ⚠️ กลุ่มตัวเลือกเดียวเคยโชว์เป็นป้ายล็อก 🔒 "ถูกกำหนดอัตโนมัติตามตัวเลือกอื่น" ซึ่งไม่จริง —
 *    แก้ที่ ProductDetail.tsx แล้ว (ล็อกเฉพาะกลุ่มที่ "มีหลายตัวเลือกแล้วถูกกฎบีบเหลือตัวเดียว")
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "photocard-digital";
const EXPECT_NAME = "Photo card Digital";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const LABEL = "ขนาดตัด";
const CHOICE = "ตัดขนาดโฟโต้การ์ด 5.5×8.5 ซม. (20 ใบ/เซ็ต)";
const PER_SET = 20;
const UNIT = "เซ็ต (20 ใบ)";
const AFTER_LABEL = "พิมพ์กี่ด้าน"; // แทรกไว้ก่อนกลุ่มนี้

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

if (d.options.some((o) => o.label === LABEL)) die(`มีกลุ่ม "${LABEL}" อยู่แล้ว — สคริปต์นี้รันซ้ำไม่ได้`);
const units = new Set([d.pricing?.unit, ...(d.priceRates ?? []).map((r) => r.pricing?.unit)].filter(Boolean));
if (units.size !== 1 || !units.has(UNIT)) die(`หน่วยขายไม่ใช่ "${UNIT}" ทั้งหมด (${[...units].join(" / ")})`);
const at = d.options.findIndex((o) => o.label === AFTER_LABEL);
if (at < 0) die(`ไม่พบกลุ่ม "${AFTER_LABEL}" — โครงสร้างเปลี่ยน หยุดก่อน`);

d.options.splice(at, 0, { label: LABEL, choices: [{ name: CHOICE, piecesPerUnit: PER_SET }] });
d.savedAt = new Date().toISOString();

console.log(`เพิ่มกลุ่ม "${LABEL}": ${CHOICE} (piecesPerUnit ${PER_SET} ต่อ 1 ${UNIT})`);
console.log(`กลุ่มทั้งหมด: ${d.options.map((o) => o.label).join(" / ")}`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) die(e2.message);
console.log("✓ เขียน Supabase แล้ว (สินค้ายังเป็นฉบับร่าง hidden ตามเดิม)");
