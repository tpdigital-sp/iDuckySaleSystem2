#!/usr/bin/env node
/**
 * ช่องกรอกขนาดไดคัท + จำนวนโดยประมาณต่อแผ่น (คำนวณตามโปรแกรม Print-Fit ของร้าน)
 *
 *   node scripts/sticker-diecut-size-inputs.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/sticker-diecut-size-inputs.mjs --write
 *
 * ทำ 2 อย่าง:
 *   1. sticker-uv (สลัก Sticker-UV) + sticker-pp (สลัก Sticker-PP-Digital):
 *      เพิ่มช่องกรอก "ขนาดไดคัท (กว้าง)/(สูง)" ต่อท้ายกลุ่ม "แบบไดคัท"
 *      (ทั้งสองตัวทุกตัวเลือกเป็นงานไดคัท 50%/100% — showWhen ผูกไว้กับสองตัวเลือกนี้
 *       เผื่อวันหน้ามีตัวเลือกตัดแบบอื่นเพิ่ม ช่องจะได้ไม่โผล่ผิดที่)
 *   2. paper-art-pet: อัปเดต sheetYield ให้ใช้พื้นที่ชีทเดียวกับ Print-Fit
 *
 * พื้นที่วางจริงจาก Print-Fit (~/Desktop/Print-Fit/js/print-fit.js):
 *   ชีท Dicut 100% = 48.26 × 33.02 ซม. · พื้นที่พิมพ์ (safe area จากจุดรีจิสเตอร์) = 44.76 × 29.89
 *   หักขอบเผื่อมาตรฐาน 0.5 ซม. รอบด้าน → 43.76 × 28.89 · ระยะห่างระหว่างชิ้น 0.5 ซม.
 *   (ตัวจัดวางฝั่งเว็บพอร์ต MaxRects มาจากโปรแกรมเดียวกัน — 5×5 ซม. = 40 ชิ้น ตรงกัน)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const DIE_LABEL = "แบบไดคัท";
const DIE_W_LABEL = "ขนาดไดคัท (กว้าง)";
const DIE_H_LABEL = "ขนาดไดคัท (สูง)";
const SHEET = { sheetW: 43.76, sheetH: 28.89, gap: 0.5, sheetName: "แผ่น A3" };

const dieInput = (label, hint, extra = {}) => (showChoices) => ({
  label,
  choices: [],
  display: "input",
  standardInput: true,
  input: { kind: "number", unit: "ซม.", min: 1, max: 42, placeholder: "เช่น 5", ...(hint ? { hint } : {}) },
  showWhen: { label: DIE_LABEL, choices: showChoices },
  ...extra,
});
const makeW = dieInput(DIE_W_LABEL, "ขนาดชิ้นงานหลังไดคัท วัดด้านที่กว้างที่สุด");
const makeH = dieInput(DIE_H_LABEL, undefined, { sheetYield: { pairLabel: DIE_W_LABEL, ...SHEET } });

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

const TARGETS = [
  { id: "sticker-uv", expectName: "Sticker-uv" },
  { id: "sticker-pp", expectName: "สติ๊กเกอร์" },
];

for (const t of TARGETS) {
  const { data: rows, error } = await sb.from("products").select("*").eq("id", t.id);
  if (error) die(error.message);
  const row = rows?.[0];
  if (!row) die(`ไม่พบสินค้า id=${t.id}`);
  if (row.name !== t.expectName) die(`${t.id}: ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);
  const d = row.data;

  for (const label of [DIE_W_LABEL, DIE_H_LABEL]) {
    if (d.options.some((o) => o.label === label)) die(`${t.id}: มีกลุ่ม ${label} อยู่แล้ว — สคริปต์นี้รันซ้ำไม่ได้`);
  }
  const at = d.options.findIndex((o) => o.label === DIE_LABEL);
  if (at < 0) die(`${t.id}: ไม่พบกลุ่ม ${DIE_LABEL}`);
  const dieChoices = d.options[at].choices.map((c) => c.name);
  if (dieChoices.length !== 2 || !dieChoices.every((n) => n.includes("ไดคัท"))) {
    die(`${t.id}: ตัวเลือกแบบไดคัทไม่ตรงที่คาด (${dieChoices.join(", ")})`);
  }
  d.options.splice(at + 1, 0, makeW(dieChoices), makeH(dieChoices));
  d.savedAt = new Date().toISOString();

  console.log(`${t.id}: แทรกช่องกรอกหลัง "${DIE_LABEL}" (โผล่เมื่อเลือก ${dieChoices.join(" / ")})`);
  console.log(`  กลุ่มทั้งหมด: ${d.options.map((o) => o.label).join(" / ")}`);

  if (WRITE) {
    const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", t.id);
    if (e2) die(e2.message);
    console.log(`  ✓ เขียน Supabase แล้ว`);
  }
}

/* ---------- paper-art-pet: อัปเดตพื้นที่ชีทให้ตรง Print-Fit ---------- */
{
  const { data: rows, error } = await sb.from("products").select("*").eq("id", "paper-art-pet");
  if (error) die(error.message);
  const row = rows?.[0];
  if (!row) die("ไม่พบสินค้า paper-art-pet");
  const d = row.data;
  const opt = d.options.find((o) => o.label === DIE_H_LABEL);
  if (!opt?.sheetYield) die("paper-art-pet: ไม่พบกลุ่มขนาดไดคัท (สูง) ที่มี sheetYield");
  opt.sheetYield = { pairLabel: opt.sheetYield.pairLabel, ...SHEET };
  d.savedAt = new Date().toISOString();
  console.log(`paper-art-pet: sheetYield → ${JSON.stringify(opt.sheetYield)}`);
  if (WRITE) {
    const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", "paper-art-pet");
    if (e2) die(e2.message);
    console.log("  ✓ เขียน Supabase แล้ว");
  }
}

if (!WRITE) console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
