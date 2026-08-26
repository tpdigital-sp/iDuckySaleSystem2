#!/usr/bin/env node
/**
 * Photo card Digital — เรียงลำดับ: ขนาดตัด → เรทราคา → กลุ่มที่เหลือ
 *
 *   node scripts/photocard-digital-size-before-rate.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/photocard-digital-size-before-rate.mjs --write
 *
 * ผู้ใช้สั่ง 26 ส.ค. 69: ให้กลุ่ม "ขนาดตัด" ขึ้นก่อน แล้วค่อยแผงเลือกเรทราคา
 *   → ย้าย "ขนาดตัด" ไปเป็นกลุ่มแรกสุด + ตั้ง rateAfterOption = "ขนาดตัด"
 *     (แผงเรทแทรกใต้กลุ่มที่ระบุ — กลไกเดียวกับสติ๊กเกอร์ UV) · กลุ่มอื่นลำดับเดิม
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "photocard-digital";
const EXPECT_NAME = "Photo card Digital";
const G_SIZE = "ขนาดตัด";

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

const idx = (d.options ?? []).findIndex((o) => o.label === G_SIZE);
if (idx < 0) die(`ไม่พบกลุ่ม "${G_SIZE}"`);
const [sizeG] = d.options.splice(idx, 1);
d.options.unshift(sizeG);
d.rateAfterOption = G_SIZE;
d.savedAt = new Date().toISOString();

console.log("ลำดับใหม่: " + G_SIZE + " → [แผงเรทราคา] → " + d.options.slice(1, 4).map((o) => o.label).join(" → ") + " → …");

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { data: wrote, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!wrote?.length) die("update ไม่โดนแถวไหนเลย (0 rows)");

const { data: back } = await sb.from("products").select("data").eq("id", ID);
const b = back[0].data;
const ok = b.options[0]?.label === G_SIZE && b.rateAfterOption === G_SIZE;
console.log(`อ่านกลับ: กลุ่มแรก=${b.options[0]?.label} · rateAfterOption=${b.rateAfterOption}`);
if (!ok) die("เขียนแล้วแต่ค่าที่อ่านกลับไม่ตรง — ยังไม่เสร็จ");
console.log("✓ เขียน Supabase แล้ว (ยืนยันจากการอ่านกลับ)");
