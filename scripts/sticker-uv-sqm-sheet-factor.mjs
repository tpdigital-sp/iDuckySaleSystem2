#!/usr/bin/env node
/**
 * Sticker-uv — ตัวคูณ "1 ตร.ม. = 8 แผ่น A3" ให้ช่องขนาดไดคัท (sheetYield.unitSheets)
 *
 *   node scripts/sticker-uv-sqm-sheet-factor.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/sticker-uv-sqm-sheet-factor.mjs --write
 *
 * ที่มา: ไดคัท 100% กรอกขนาดเอง ระบบคำนวณ "ได้กี่ชิ้นต่อ 1 แผ่น A3" (จัดวางแบบ Print-Fit)
 * เรทตารางเมตรจึงคูณจำนวนที่สั่งตรง ๆ ไม่ได้ เพราะ 1 ตร.ม. ไม่ใช่ 1 แผ่น → เก็บตัวคูณไว้ให้
 * (8 แผ่น คือเลขที่ร้านใช้จริง เขียนไว้ทั้งในคำอธิบายเรท / FAQ / ป้ายกลุ่มขนาดตัด A4 = 2×8 = 16 ชิ้น
 *  — อย่าเปลี่ยนไปคำนวณจากพื้นที่เอง A3 = 0.1247 ตร.ม. ปัดแล้วได้ 8.02 ไม่ตรงกับที่คิดเงิน)
 *
 * รันซ้ำได้ · ตรวจชื่อสินค้า/หน่วยขาย/ชื่อแผ่นก่อนเขียน กันโครงสร้างเปลี่ยนแล้วเขียนผิดที่
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "sticker-uv";
const EXPECT_NAME = "Sticker-uv";
const SALE_UNIT = "ตร.ม."; // หน่วยขายของเรทตารางเมตร (ต้องตรงกับ pricing.unit ของเรทนั้น)
const SHEETS_PER_UNIT = 8; // 1 ตร.ม. = 8 แผ่น A3
const SHEET_NAME = "แผ่น A3";

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

// หน่วยขายต้องมีจริง ไม่งั้นตัวคูณไม่มีวันถูกใช้ (unitYieldOf จับคู่ด้วยชื่อหน่วยขายเป๊ะ ๆ)
const units = (d.priceRates ?? []).map((r) => r.pricing?.unit);
if (!units.includes(SALE_UNIT)) die(`ไม่พบเรทที่ขายเป็น "${SALE_UNIT}" (มี: ${units.join(" / ")})`);

const targets = (d.options ?? []).filter((o) => o.sheetYield);
if (!targets.length) die("ไม่พบกลุ่มที่ตั้ง sheetYield — โครงสร้างเปลี่ยน หยุดก่อน");
for (const o of targets) {
  const name = o.sheetYield.sheetName ?? "แผ่น";
  if (name !== SHEET_NAME) die(`${o.label}: ชื่อแผ่นคือ "${name}" ไม่ใช่ "${SHEET_NAME}" — ตัวคูณอาจไม่ใช่ ${SHEETS_PER_UNIT}`);
  const before = o.sheetYield.unitSheets?.[SALE_UNIT];
  o.sheetYield.unitSheets = { ...(o.sheetYield.unitSheets ?? {}), [SALE_UNIT]: SHEETS_PER_UNIT };
  console.log(
    `- ${o.label}: 1 ${SALE_UNIT} = ${SHEETS_PER_UNIT} ${SHEET_NAME}` +
      (before === SHEETS_PER_UNIT ? " (เท่าเดิม)" : before ? ` (เดิม ${before})` : "")
  );
}
d.savedAt = new Date().toISOString();

console.log(`\nผลที่หน้าสินค้า (เรท "${SALE_UNIT}" + ไดคัท 100%):`);
console.log(`  5×5 ซม. = 40 ชิ้น/${SHEET_NAME} → ${40 * SHEETS_PER_UNIT} ชิ้น/${SALE_UNIT} → สั่ง 3 ${SALE_UNIT} = ${40 * SHEETS_PER_UNIT * 3} ชิ้น`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) die(e2.message);

// อ่านกลับมายืนยัน — เคยเจอ update ผ่านแต่ค่าไม่ลงจริง
const { data: after } = await sb.from("products").select("data").eq("id", ID);
const ok = (after?.[0]?.data.options ?? []).filter((o) => o.sheetYield?.unitSheets?.[SALE_UNIT] === SHEETS_PER_UNIT);
if (ok.length !== targets.length) die(`เขียนแล้วแต่อ่านกลับได้ ${ok.length}/${targets.length} กลุ่ม`);
console.log(`✓ เขียน Supabase แล้ว (ยืนยัน ${ok.length} กลุ่ม)`);
