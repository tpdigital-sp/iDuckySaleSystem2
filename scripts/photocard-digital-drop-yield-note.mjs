#!/usr/bin/env node
/**
 * Photo card Digital — เอากล่องสรุป "ได้ 20 ชิ้น ต่อ 1 เซ็ต …" ใต้ขนาดตัดออก
 *
 *   node scripts/photocard-digital-drop-yield-note.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/photocard-digital-drop-yield-note.mjs --write
 *
 * ผู้ใช้สั่ง 26 ส.ค. 69: กล่องสรุปจำนวนชิ้น (unitYieldOf จาก choice.piecesPerUnit) รก ไม่ต้องมี
 *   → ถอด piecesPerUnit ออกจากตัวเลือกขนาดตัด (ตัวเลขบอกทางเฉย ๆ ไม่มีผลราคา/โควตา/ตะกร้า
 *     และกลุ่มนี้ไม่ได้ตั้ง capDesigns) · "(20 ใบ/เซ็ต)" ยังอยู่ในชื่อตัวเลือกตามเดิม
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
if (row.name !== EXPECT_NAME) die(`ชื่อไม่ตรงที่คาด (${row.name})`);
const d = row.data;

const g = (d.options ?? []).find((o) => o.label === G_SIZE);
if (!g) die(`ไม่พบกลุ่ม "${G_SIZE}"`);
if (g.capDesigns) die("กลุ่มนี้ตั้ง capDesigns ไว้ — piecesPerUnit มีผลกับเพดานลาย ห้ามถอดเฉย ๆ");
const c = g.choices.find((x) => x.piecesPerUnit != null);
if (!c) die("ไม่มีตัวเลือกไหนตั้ง piecesPerUnit อยู่แล้ว — สคริปต์นี้รันไปแล้ว?");
delete c.piecesPerUnit;
d.savedAt = new Date().toISOString();

console.log(`ถอด piecesPerUnit ออกจาก "${c.name}" (กล่องสรุปจำนวนชิ้นจะไม่ขึ้นแล้ว)`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { data: wrote, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!wrote?.length) die("update ไม่โดนแถวไหนเลย (0 rows)");

const { data: back } = await sb.from("products").select("data").eq("id", ID);
const bc = back[0].data.options.find((o) => o.label === G_SIZE).choices[0];
console.log(`อ่านกลับ: piecesPerUnit=${JSON.stringify(bc.piecesPerUnit)}`);
if (bc.piecesPerUnit !== undefined) die("เขียนแล้วแต่ค่ายังอยู่ — ยังไม่เสร็จ");
console.log("✓ เขียน Supabase แล้ว (ยืนยันจากการอ่านกลับ)");
