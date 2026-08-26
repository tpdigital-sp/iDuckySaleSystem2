#!/usr/bin/env node
/**
 * สติ๊กเกอร์สูญญากาศ (sticker-vacuum) — กำหนดขนาดเอง คิดราคาจาก "ด้านที่ยาวที่สุด"
 *
 *   node scripts/sticker-vacuum-custom-longest.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/sticker-vacuum-custom-longest.mjs --write
 *
 * ผู้ใช้สั่ง 26 ส.ค. 69:
 *   1. กำหนดขนาดเองได้ ราคาอิงด้านที่ยาวที่สุด — สั่ง 3×14 ซม. คิดราคาเท่าขนาด 14×14 ซม.
 *   2. ใหญ่กว่า 15 ซม. บวกเพิ่ม ซม. ละ 3 บาท/ชิ้น (อิงด้านยาวสุด) · ใหญ่สุดไม่เกิน A3
 *   (พิมพ์ 2 ด้าน ที่เกิน 15 ซม. ยังบวก ซม. ละ 2.5 ตามกติกาเดิม → ส่วนเกินรวมเป็น ซม. ละ 5.5)
 *
 * ใช้กลไกใหม่ custom.mode = "longest" (ดู longestSizePlan ใน src/lib/products.ts)
 * เดิมโหมดเป็น "quote" = ลูกค้ากรอกขนาดแล้วรอแอดมินตีราคา ตอนนี้ระบบคิดให้เองทันที
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "sticker-vacuum";
const EXPECT_NAME = "สติ๊กเกอร์สูญญากาศ";
const SIZE_LABEL = "ขนาด";
const SIDES_LABEL = "พิมพ์กี่ด้าน";
const TWO_SIDES = "พิมพ์ 2 ด้าน";
const OVER_RATE = 3; // ใหญ่กว่าแถวสุดท้าย (15 ซม.) ซม. ละ 3 บาท/ชิ้น
const OVER_TWO_SIDES = 2.5; // พิมพ์ 2 ด้าน ส่วนที่เกิน 15 ซม. บวกอีก ซม. ละ 2.5
const MAX_LONGEST = 42; // A3 ด้านยาว
const MAX_SHORTEST = 29.7; // A3 ด้านสั้น
const LABEL = "กำหนดขนาดเอง";
const NOTE =
  "ราคาคิดตามด้านที่ยาวที่สุด — สั่ง 3×14 ซม. คิดราคาเท่าขนาด 14×14 ซม. · " +
  "ใหญ่กว่า 15 ซม. บวกเพิ่ม ซม. ละ 3 บาท/ชิ้น (พิมพ์ 2 ด้าน บวกอีก ซม. ละ 2.5) · " +
  "ขนาดใหญ่สุดไม่เกินกระดาษ A3 (29.7 × 42 ซม.)";

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

// ── ตรวจโครงสร้างที่กลไกใหม่ต้องใช้ก่อนเขียน ──
const sizeOpt = (d.options ?? []).find((o) => o.label.trim() === SIZE_LABEL);
if (!sizeOpt) die(`ไม่พบกลุ่ม "${SIZE_LABEL}"`);
const sidesOpt = (d.options ?? []).find((o) => o.label.trim() === SIDES_LABEL);
if (!sidesOpt) die(`ไม่พบกลุ่ม "${SIDES_LABEL}"`);
if (!sidesOpt.choices.some((c) => c.name === TWO_SIDES)) die(`ไม่พบตัวเลือก "${TWO_SIDES}"`);
const drivers = d.pricing?.driverLabels ?? [];
if (!drivers.includes(SIZE_LABEL)) die(`"${SIZE_LABEL}" ไม่ใช่แกนตารางราคา (driverLabels: ${drivers.join(", ")})`);
const sizeCm = (n) => {
  const m = String(n).match(/\d+(?:\.\d+)?/g);
  return m?.length ? Math.max(...m.map(Number)) : null;
};
const rowsCm = sizeOpt.choices.map((c) => sizeCm(c.name)).filter((n) => n != null).sort((a, b) => a - b);
if (rowsCm.length !== sizeOpt.choices.length) die("มีตัวเลือกขนาดที่อ่านตัวเลข ซม. ไม่ได้");
const MAX_ROW = rowsCm[rowsCm.length - 1];
console.log(`แถวขนาดในตาราง: ${rowsCm.join(" · ")} ซม. (แถวใหญ่สุด ${MAX_ROW} ซม.)`);

// ── ตั้งค่างานกำหนดขนาดเอง ──
d.custom = {
  enabled: true,
  label: LABEL,
  mode: "longest",
  unit: "ซม.",
  sizeLabel: SIZE_LABEL,
  overRate: OVER_RATE,
  overRateWhen: [{ label: SIDES_LABEL, choices: [TWO_SIDES], add: OVER_TWO_SIDES }],
  maxLongest: MAX_LONGEST,
  maxShortest: MAX_SHORTEST,
  keepOptions: [SIDES_LABEL],
  note: NOTE,
};

// ── ข้อความให้ตรงกติกาใหม่ ──
const TERMS_OLD = "สั่งทำขนาดใหญ่กว่า 15 ซม. บวกเพิ่ม ซม. ละ 3 บาท/ชิ้น (อิงขนาดจากด้านที่ยาวที่สุด)";
const TERMS_NEW =
  "กำหนดขนาดเองได้ ราคาอิงด้านที่ยาวที่สุด — สั่ง 3×14 ซม. คิดราคาเท่าขนาด 14×14 ซม.\n" +
  "ขนาดใหญ่กว่า 15 ซม. บวกเพิ่ม ซม. ละ 3 บาท/ชิ้น (อิงด้านที่ยาวที่สุด) · ใหญ่สุดไม่เกินกระดาษ A3 (29.7 × 42 ซม.)";
if (d.terms?.includes(TERMS_NEW)) console.log("terms: ตรงอยู่แล้ว");
else if (d.terms?.includes(TERMS_OLD)) d.terms = d.terms.replace(TERMS_OLD, TERMS_NEW);
else die(`ไม่พบบรรทัด terms เดิมที่คาด — เช็คข้อความก่อนเขียนทับ:\n${d.terms}`);

const tDetail = (d.tabs ?? []).find((t) => t.title === "รายละเอียดเพิ่มเติม");
if (!tDetail) die('ไม่พบแท็บ "รายละเอียดเพิ่มเติม"');
const DETAIL_OLD =
  'ขนาดใหญ่กว่า 15 ซม.::\n• สั่งทำได้ คิดเพิ่ม ซม. ละ 3 บาท/ชิ้น (อิงขนาดจากด้านที่ยาวที่สุด) — ติ๊ก "กำหนดขนาดเอง" ในหน้าสินค้าแล้วแจ้งขนาดไว้ แอดมินจะตีราคาให้';
const DETAIL_NEW =
  "กำหนดขนาดเอง::\n" +
  '• ติ๊ก "กำหนดขนาดเอง" ในหน้าสินค้า แล้วกรอกกว้าง × ยาว — ระบบคิดราคาให้ทันที ไม่ต้องรอตีราคา\n' +
  "• ราคาอิงด้านที่ยาวที่สุด — สั่ง 3×14 ซม. คิดราคาเท่าขนาด 14×14 ซม.\n" +
  "• ใหญ่กว่า 15 ซม. คิดจากราคาขนาด 15×15 ซม. + ส่วนที่เกิน ซม. ละ 3 บาท/ชิ้น (พิมพ์ 2 ด้าน บวกอีก ซม. ละ 2.5)\n" +
  "• ขนาดใหญ่สุดไม่เกินกระดาษ A3 (29.7 × 42 ซม.)";
if (tDetail.text.includes(DETAIL_NEW)) console.log("แท็บรายละเอียด: ตรงอยู่แล้ว");
else if (tDetail.text.includes(DETAIL_OLD)) tDetail.text = tDetail.text.replace(DETAIL_OLD, DETAIL_NEW);
else die('ไม่พบหัวข้อ "ขนาดใหญ่กว่า 15 ซม.::" เดิมในแท็บรายละเอียดเพิ่มเติม');

const HL_OLD = "ขนาดใหญ่กว่า 15 ซม. สั่งทำได้ — แจ้งขนาดแล้วแอดมินตีราคาให้";
const HL_NEW = "กำหนดขนาดเองได้ถึง A3 — ราคาคิดอัตโนมัติจากด้านที่ยาวที่สุด";
const hi = (d.highlights ?? []).indexOf(HL_OLD);
if (hi >= 0) d.highlights[hi] = HL_NEW;
else if (!(d.highlights ?? []).includes(HL_NEW)) die("ไม่พบบรรทัด highlights เดิมที่คาด");

d.savedAt = new Date().toISOString();

// ── จำลองราคาด้วยกติกาเดียวกับเว็บ (กันตั้งค่าแล้วคิดเงินไม่ตรง) ──
const cellOf = (cm, sides, tierIdx = 0) => d.pricing.cells[`${cm}×${cm} ซม.│${sides}`]?.[tierIdx];
const simulate = (w, h, sides) => {
  const longest = Math.ceil(Math.max(w, h) - 1e-9);
  const rowCm = rowsCm.find((c) => longest <= c) ?? MAX_ROW;
  const over = Math.max(0, longest - rowCm);
  const rate = over > 0 ? OVER_RATE + (sides === TWO_SIDES ? OVER_TWO_SIDES : 0) : 0;
  return { rowCm, over, price: cellOf(rowCm, sides) + over * rate };
};
console.log("\nจำลองราคา (ช่วง 20-30 ชิ้น):");
for (const [w, h, sides] of [[3, 14, "พิมพ์ 1 ด้าน"], [3, 14, TWO_SIDES], [10, 20, "พิมพ์ 1 ด้าน"], [10, 20, TWO_SIDES], [29, 42, TWO_SIDES]]) {
  const r = simulate(w, h, sides);
  console.log(
    `  ${w}×${h} ซม. ${sides} → ฐาน ${r.rowCm}×${r.rowCm} ซม.${r.over ? ` + เกิน ${r.over} ซม.` : ""} = ฿${r.price}/ชิ้น`
  );
}
console.log(`\nขนาดที่รับได้: ด้านยาวสุด ≤ ${MAX_LONGEST} ซม. · อีกด้าน ≤ ${MAX_SHORTEST} ซม. (A3)`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { data: wrote, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("id");
if (e2) die(e2.message);
if (!wrote?.length) die("update ไม่โดนแถวไหนเลย (0 rows) — เช็ค id/สิทธิ์");

const { data: back } = await sb.from("products").select("data").eq("id", ID);
const b = back[0].data;
const bc = b.custom;
const ok =
  bc?.mode === "longest" &&
  bc.sizeLabel === SIZE_LABEL &&
  bc.overRate === OVER_RATE &&
  bc.overRateWhen?.[0]?.add === OVER_TWO_SIDES &&
  bc.maxLongest === MAX_LONGEST &&
  bc.maxShortest === MAX_SHORTEST &&
  bc.keepOptions?.includes(SIDES_LABEL) &&
  b.terms.includes(TERMS_NEW) &&
  b.highlights.includes(HL_NEW);
console.log(
  `อ่านกลับ: mode=${bc?.mode} · sizeLabel=${bc?.sizeLabel} · overRate=${bc?.overRate} (+${bc?.overRateWhen?.[0]?.add} เมื่อ ${bc?.overRateWhen?.[0]?.choices?.join("/")}) · max ${bc?.maxLongest}×${bc?.maxShortest} · terms ${b.terms.includes(TERMS_NEW) ? "ใหม่แล้ว" : "❌ ยังเก่า"}`
);
if (!ok) die("เขียนแล้วแต่ค่าที่อ่านกลับไม่ตรง — ยังไม่เสร็จ");
console.log("✓ เขียน Supabase แล้ว (ยืนยันจากการอ่านกลับ)");
