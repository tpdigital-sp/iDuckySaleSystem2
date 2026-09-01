#!/usr/bin/env npx tsx
/**
 * POSTCARD / โปสการ์ด (postcard-th) — บวกราคาทุกชนิดกระดาษ +10 บาท/แผ่น A3
 *
 *   npx tsx scripts/postcard-price-markup.mts           # ดูผลก่อน (ไม่เขียน)
 *   npx tsx scripts/postcard-price-markup.mts --write   # เขียนสินค้า
 *
 * ผู้ใช้สั่ง (1 ก.ย. 69): "ปรับราคา บวก10บาท ทุกชนิดกระดาษ"
 * — ตารางโปสการ์ดยกมาจาก paper-art-pet (งานตัดตามขนาด) ราคาโปสการ์ดแพงกว่างานกระดาษเปล่า 10 บาท/แผ่น
 *
 * บวกทุกช่อง = ทุกชนิดกระดาษ × ทุกการเคลือบ × ทุกขั้นจำนวน (ราคาต่อแผ่น A3 ทั้งตาราง)
 *
 * ⚠️ กันบวกซ้ำ: เก็บยอดที่บวกไว้ใน `data.priceMarkup` — รันซ้ำแล้วเห็นว่าบวกครบแล้วจะไม่บวกทับ
 *    (สั่งเพิ่มทีหลังให้แก้ MARKUP เป็นยอดรวมใหม่ สคริปต์จะบวกเฉพาะส่วนต่าง)
 * ⚠️ สคริปต์ต้นน้ำ postcard-price-from-paper-art.mts บวก MARKUP เดียวกันนี้ตอนก๊อปตารางอยู่แล้ว
 *    ลำดับรันทั้งชุด: price-from-paper-art → special-papers → paper-group-tidy → price-markup → option-art
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "postcard-th";
const MARKUP = 10;

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
if (!/POSTCARD|โปสการ์ด/i.test(row.name)) throw new Error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
const d: any = structuredClone(row.data);

const done: number = d.priceMarkup ?? 0;
const add = MARKUP - done;
console.log(`บวกไว้แล้ว ${done} บาท · เป้าหมาย ${MARKUP} บาท → รอบนี้บวกอีก ${add} บาท`);
if (add === 0) {
  console.log("✅ ราคาบวกครบตามเป้าแล้ว ไม่ต้องแก้อะไร");
  process.exit(0);
}
if (add < 0) throw new Error(`ตารางบวกไว้เกินเป้า (${done} > ${MARKUP}) — ลดราคาต้องมาดูเองก่อน`);

const cells: Record<string, number[]> = d.pricing.cells;
const sample = Object.keys(cells).slice(0, 3);
const beforeSample = sample.map((k) => `${k} ${JSON.stringify(cells[k])}`);
for (const k of Object.keys(cells)) cells[k] = cells[k].map((v) => v + add);
d.priceMarkup = MARKUP;

const all = Object.values(cells).flat();
d.price = Math.min(...all);
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);
if (d.seo?.description) d.seo.description = d.seo.description.replace(/เริ่มแผ่นละ \d+ บาท/, `เริ่มแผ่นละ ${d.priceMin} บาท`);
if (d.seo?.faqs)
  d.seo.faqs = d.seo.faqs.map((f: any) => ({ ...f, a: f.a.replace(/เริ่มแผ่นละ \d+ บาท/, `เริ่มแผ่นละ ${d.priceMin} บาท`) }));

console.log(`\nตัวอย่างก่อน/หลัง (${Object.keys(cells).length} ช่อง ทุกช่องบวกเท่ากัน):`);
sample.forEach((k, i) => console.log(`   ${beforeSample[i]}\n   → ${k} ${JSON.stringify(cells[k])}`));
console.log(`\nราคา ${d.priceMin} – ${d.priceMax} ต่อ ${d.pricing.unit}`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write ถ้าโอเค)");
  process.exit(0);
}

const { error: saveErr } = await sb.from("products").update({ data: d, price: d.price }).eq("id", ID);
if (saveErr) throw saveErr;

const { data: back, error: backErr } = await sb.from("products").select("price,data").eq("id", ID).single();
if (backErr) throw backErr;
const b: any = back.data;
const oldCells: Record<string, number[]> = row.data.pricing.cells;
const allUp = Object.keys(oldCells).every((k) =>
  b.pricing.cells[k]?.every((v: number, i: number) => v === oldCells[k][i] + add)
);
const checks: [string, unknown, unknown][] = [
  ["ทุกช่องบวกครบ", allUp, true],
  ["จำนวนช่องเท่าเดิม", Object.keys(b.pricing.cells).length, Object.keys(oldCells).length],
  ["price คอลัมน์", back.price, d.price],
  ["ธงกันบวกซ้ำ", b.priceMarkup, MARKUP],
];
for (const [what, got, want] of checks) {
  if (String(got) !== String(want)) throw new Error(`อ่านกลับไม่ตรง ${what}: ได้ ${got} คาด ${want}`);
  console.log(`✓ ${what}: ${got}`);
}
console.log(`\n✅ บันทึกแล้ว — ทุกชนิดกระดาษ +${MARKUP} บาท/แผ่น A3 (ราคา ${d.priceMin} – ${d.priceMax})`);
