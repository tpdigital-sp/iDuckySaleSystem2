/**
 * 🔍 ด่านตรวจ — สแตนดี้อะคริลิค (standy): "ขนาดเกินที่ตารางเรทนั้นกำหนด = แอดมินตีราคา"
 *
 *   npx tsx scripts/standy-size-quote-check.mts
 *
 * เรียกฟังก์ชันจริงจาก src/lib/products.ts บนข้อมูลจริงใน Supabase
 * กติกาที่ตรวจ (14 ก.ย. 69 — เจ้าของร้านสั่ง "ขนาดเกินที่กำหนดให้แอดมินตีราคา"):
 *   • เรทที่ 1 (คละดีเทล/ปลีก) มีราคาถึง 20 ซม. → กรอก 21 ซม. ขึ้นไป = 💬 รอตีราคา (ราคา 0)
 *   • เรทที่ 2 (ไม่คละดีเทล 50 ชิ้น+) มีราคาถึง 30 ซม. → 21-30 ซม. ยังคิดราคาเองได้
 *   • ห้ามหล่นไปที่ราคาตั้งต้นของสินค้า (product.price) เงียบ ๆ อีก
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import {
  RATE_LABEL,
  needsQuote,
  sizeInputPlan,
  unitPriceFor,
  type Product,
} from "../src/lib/products";

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a: Record<string, string>, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await sb.from("products").select("data").eq("id", "standy").maybeSingle();
if (error || !data) { console.error("✗ อ่านสินค้าไม่ได้: " + error?.message); process.exit(1); }
const p = data.data as Product;

const RATE1 = "เรทที่ 1 (สั่งแบบคละดีเทล)";
const RATE2 = "เรทที่ 2 (สั่งแบบไม่คละดีเทล)";
const size = (p.options ?? []).find((o) => o.sizeInput);
if (!size?.sizeInput) { console.error("✗ สแตนดี้ยังไม่ได้ตั้ง sizeInput"); process.exit(1); }
const CUSTOM = size.sizeInput.choice;
const FIELD = size.sizeInput.widthLabel;

const base: Record<string, string> = {
  "งานสกรีน": "สกรีน 1 ด้าน (บน)",
  "สีอะคริลิค": "อะคริลิคใส",
  "ฐานสแตนดี้": "ไม่สกรีนฐาน",
  "ขนาดฐาน": "5cm",
  "ทรงฐาน": "ทรงกลม",
  "สีอะคริลิคฐาน": "อะคริลิคใส",
};
const selOf = (rate: string, cm: string) => ({ ...base, [RATE_LABEL]: rate, [size.label]: CUSTOM, [FIELD]: cm });

let bad = 0;
const ok = (cond: boolean, msg: string, extra = "") => {
  console.log((cond ? "✅ " : "❌ ") + msg + (extra ? " " + extra : ""));
  if (!cond) bad++;
};

console.log("── เรทที่ 1 (ปลีก/คละดีเทล · ตารางถึง 20 ซม.) ──");
for (const cm of ["21", "25", "30", "31"]) {
  const sel = selOf(RATE1, cm);
  const pl = sizeInputPlan(p, sel);
  ok(
    pl?.quote === true && needsQuote(p, sel) && unitPriceFor(p, sel, 5) === 0 && unitPriceFor(p, sel, 100) === 0,
    `${cm} ซม. = รอแอดมินตีราคา (ไม่หล่นไปราคาตั้งต้น ฿${p.price})`,
    `แถว=${pl?.choice} ฿5ชิ้น=${unitPriceFor(p, sel, 5)} ฿100ชิ้น=${unitPriceFor(p, sel, 100)}`
  );
}
for (const [cm, row] of [["20", "20cm"], ["20.5", "20cm"], ["12.5", "12cm"]] as const) {
  const sel = selOf(RATE1, cm);
  const pl = sizeInputPlan(p, sel);
  ok(pl?.choice === row && !pl.quote && unitPriceFor(p, sel, 5) > 0, `${cm} ซม. ยังเกาะแถว ${row} ตามเดิม`, `฿${unitPriceFor(p, sel, 5)}`);
}

console.log("\n── เรทที่ 2 (ไม่คละดีเทล 50 ชิ้น+ · ตารางถึง 30 ซม.) ──");
for (const [cm, row] of [["21", "21cm"], ["25", "25cm"], ["30", "30cm"]] as const) {
  const sel = selOf(RATE2, cm);
  const pl = sizeInputPlan(p, sel);
  const price = unitPriceFor(p, sel, 50);
  ok(pl?.choice === row && !pl.quote && price > p.price, `${cm} ซม. เกาะแถว ${row} คิดราคาได้เอง`, `฿${price}/ชิ้น`);
}
{
  const sel = selOf(RATE2, "31");
  ok(needsQuote(p, sel) && unitPriceFor(p, sel, 50) === 0, "31 ซม. (เกินตารางทุกเรท) = รอแอดมินตีราคา");
}

console.log("\n── เมนูขนาดหน้าร้าน ──");
{
  // เรทที่ 1 ไม่มีราคาแถว 21-30 → เมนูซ่อนแถวพวกนั้นอยู่แล้ว เหลือทางเดียวคือช่องกำหนดขนาดเอง
  const { allowedChoices, activeMatrix, matrixChoiceAvailable } = await import("../src/lib/products");
  const sel = { ...base, [RATE_LABEL]: RATE1 };
  const m = activeMatrix(p, sel)!;
  const shown = allowedChoices(p, sel, size.label).filter((n) => n !== CUSTOM && matrixChoiceAvailable(m, size.label, n));
  ok(shown.includes("20cm") && !shown.includes("21cm"), "เรทที่ 1 เมนูมีถึง 20cm (ไม่มี 21cm ที่ไม่มีราคา)", `${shown.length} ตัวเลือก`);
}

console.log(bad === 0 ? "\n✅ ผ่านครบทุกข้อ" : `\n❌ ไม่ผ่าน ${bad} ข้อ`);
process.exit(bad === 0 ? 0 : 1);
