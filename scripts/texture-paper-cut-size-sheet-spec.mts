#!/usr/bin/env -S node --import tsx
/**
 * กระดาษ Texture Paper — ช่องกรอกขนาด "ตัดตามขนาด" คิดจำนวนชิ้น/แผ่น A3 ผิด
 *
 *   node_modules/.bin/tsx scripts/texture-paper-cut-size-sheet-spec.mts           # ดูก่อน
 *   node_modules/.bin/tsx scripts/texture-paper-cut-size-sheet-spec.mts --write
 *
 * คู่ช่องกรอก "ขนาดตัด (กว้าง/สูง)" (โหมดตัดตามขนาด) ถูกก๊อปสเปกของงาน "ไดคัท" มา
 * (43.76 × 28.89 gap 0.5 = พื้นที่วางที่ต้องเว้นช่องไฟให้ใบมีด) → กรอก A4 21×29.7 ได้ 1 ชิ้น
 * ทั้งที่ปุ่ม "A4" ข้าง ๆ ในกลุ่มเดียวกันเขียนว่าได้ 2 ชิ้น/แผ่น A3
 *
 * ตัดตามขนาด = หั่นแผ่น ไม่ต้องเว้นช่องไฟ → ต้องคิดบน **แผ่น A3 เต็ม 42 × 29.7 gap 0**
 * (กติกาเดียวกับ sticker-pp · sticker-uv ที่แก้ไปแล้ว 26 ส.ค. 69)
 * ส่วนคู่ "ขนาดไดคัท (กว้าง/สูง)" (ไดคัทตามทรง) สเปกถูกอยู่แล้ว แก้แค่เพดานด้านกว้าง
 *
 * เพดานช่องกรอกทั้ง 2 คู่: กว้าง ≤ 29.7 · สูง ≤ 42 (เดิมกว้างรับถึง 42 = กรอก 42×42 ได้ ทั้งที่ใหญ่เกินแผ่น)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { sheetYieldCount, type Product, type ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "texture-paper";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k: string) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL")!, pick("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) { console.error(error); process.exit(1); }
const before = row!.data as Product;
const d = JSON.parse(JSON.stringify(before)) as Product;

const g = (label: string): ProductOption => {
  const o = d.options.find((x) => x.label === label);
  if (!o) { console.error(`หากลุ่ม "${label}" ไม่เจอ — หยุด`); process.exit(1); }
  return o;
};
const cutW = g("ขนาดตัด (กว้าง)"), cutH = g("ขนาดตัด (สูง)");
const cutSizes = g("ตัดเป็นขนาด");
const dieW = g("ขนาดไดคัท (กว้าง)"), dieH = g("ขนาดไดคัท (สูง)");

/* ---------- 1) ตัดตามขนาด: คิดบนแผ่น A3 เต็ม ---------- */
cutH.sheetYield = { pairLabel: cutW.label, sheetW: 42, sheetH: 29.7, gap: 0, sheetName: "แผ่น A3" };
cutW.input = { ...cutW.input!, max: 29.7, hint: "ขนาดชิ้นงานหลังตัด ใหญ่สุดเท่าแผ่น A3 (29.7 × 42 ซม.) — งานแนวนอนกรอกด้านยาวลงช่อง “สูง” ได้" };
cutH.input = { ...cutH.input!, max: 42 };

/* ---------- 2) ไดคัทตามทรง: สเปกเดิม แก้แค่เพดานด้านกว้าง ---------- */
dieW.input = { ...dieW.input!, max: 29.7, hint: "ขนาดชิ้นงานหลังไดคัท วัดด้านที่กว้างที่สุด — ใหญ่สุดเท่าแผ่น A3 (29.7 × 42 ซม.)" };
dieH.input = { ...dieH.input!, max: 42 };

/* ---------- ตรวจผลจริงด้วยตัวคำนวณของระบบ ---------- */
const count = (opt: ProductOption, pair: ProductOption, w: number, h: number) =>
  sheetYieldCount(d, opt, { [pair.label]: String(w), [opt.label]: String(h) });

const FIXED: [string, number, number, number][] = [
  ["A4", 21, 29.7, 2], ["A5", 14.85, 21, 4], ["A6", 10.5, 14.85, 8], ["A7", 7.4, 10.5, 16],
];
console.log('▸ "ตัดตามขนาด" — กรอกขนาดเอง ต้องได้เท่ากับปุ่มขนาดตายตัวข้าง ๆ');
let bad = 0;
for (const [name, w, h, want] of FIXED) {
  const got = count(cutH, cutW, w, h);
  const badge = cutSizes.choices?.find((c) => c.name.startsWith(name))?.badge ?? "";
  const ok = got === want;
  if (!ok) bad++;
  console.log(`   ${ok ? "✓" : "⛔"} ${name} ${w}×${h} = ${got} ชิ้น (ปุ่ม ${name}: ${badge})`);
}
console.log(`   · เต็มแผ่น 29.7×42 = ${count(cutH, cutW, 29.7, 42)} ชิ้น · 10×10 = ${count(cutH, cutW, 10, 10)} ชิ้น · 5×5 = ${count(cutH, cutW, 5, 5)} ชิ้น`);
console.log('\n▸ "ไดคัทตามทรง" — เว้นช่องไฟใบมีด 5 มม. (สเปกเดียวกับ sticker-pp ไดคัท 100%)');
for (const [w, h] of [[5, 5], [10, 10], [21, 29.7]] as [number, number][])
  console.log(`   · ${w}×${h} = ${count(dieH, dieW, w, h)} ชิ้น`);
console.log("\nเพดานช่องกรอกหลังแก้:");
for (const o of [cutW, cutH, dieW, dieH]) console.log(`   ${o.label.padEnd(20)} ${o.input!.min}–${o.input!.max} ซม.`);

if (bad) { console.error("\n⛔ จำนวนชิ้นยังไม่ตรงกับปุ่มขนาดตายตัว — ไม่เขียน"); process.exit(1); }
if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึกจริง)"); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`../.backup-texture-paper-${stamp}.json`, import.meta.url), JSON.stringify({ id: ID, data: before }, null, 2));
console.log(`\nสำรองของเดิมไว้ที่ .backup-texture-paper-${stamp}.json`);

(d as Product & { savedAt: string }).savedAt = new Date().toISOString();
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) { console.error(e2); process.exit(1); }
console.log("✅ บันทึกแล้ว");
