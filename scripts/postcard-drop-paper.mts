#!/usr/bin/env npx tsx
/**
 * POSTCARD / โปสการ์ด (postcard-th) — ถอดกระดาษ 1 ชนิดออกจากสินค้าให้ครบทุกที่
 *
 *   npx tsx scripts/postcard-drop-paper.mts "กระดาษอาร์ตมัน 150 แกรม"           # ดูผลก่อน
 *   npx tsx scripts/postcard-drop-paper.mts "กระดาษอาร์ตมัน 150 แกรม" --write   # เขียนสินค้า
 *
 * (ต่อจาก postcard-drop-korean-art-300.mts ที่ถอดชื่อซ้ำ — ตัวนี้ทำแบบทั่วไป รับชื่อทางอาร์กิวเมนต์)
 *
 * ถอดตัวเลือกต้องเก็บกวาดพร้อมกัน ไม่งั้นค้างเป็นขยะ/กฎเพี้ยน:
 *   1. ตัวเลือกในกลุ่ม "ชนิดกระดาษ"
 *   2. ช่องราคาของแถวนั้นทุกการเคลือบ
 *   3. ชื่อกระดาษใน rules (when.choices) และใน showWhen / showWhenAlso / showWhenAll ของกลุ่มอื่น
 *   4. ข้อความที่นับจำนวนชนิด/ช่วงแกรม/ราคาเริ่มต้น (description · highlights · seo · faq)
 * ชื่อกระดาษที่ตายไปแล้ว (ไม่มีในกลุ่ม) ที่ยังค้างอยู่ในเงื่อนไข จะถูกกวาดออกด้วย
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const DROP = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!DROP) throw new Error('ใส่ชื่อกระดาษที่จะถอดด้วย เช่น "กระดาษอาร์ตมัน 150 แกรม"');
const ID = "postcard-th";
const PAPER_GROUP = "ชนิดกระดาษ";

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

const group = (d.options ?? []).find((o: any) => o.label === PAPER_GROUP);
if (!group) throw new Error(`ไม่เจอกลุ่ม "${PAPER_GROUP}" — โครงตัวเลือกเปลี่ยน มาดูเองก่อน`);
if (!group.choices.some((c: any) => c.name === DROP)) console.log(`(ไม่มี "${DROP}" ในกลุ่มอยู่แล้ว — ตรวจส่วนที่เหลือต่อ)`);

group.choices = group.choices.filter((c: any) => c.name !== DROP);
if (!group.choices.length) throw new Error("ถอดแล้วไม่เหลือกระดาษเลย — หยุดไว้ก่อน");
const alive = new Set<string>(group.choices.map((c: any) => c.name));

const killedCells = Object.keys(d.pricing.cells).filter((k) => k.startsWith(`${DROP}│`));
for (const k of killedCells) delete d.pricing.cells[k];

// เงื่อนไขทุกแบบที่อ้างชื่อกระดาษ — rules + showWhen/showWhenAlso/showWhenAll ของกลุ่มอื่น
const touched: string[] = [];
const sweep = (cond: any, where: string) => {
  if (!cond || cond.label !== PAPER_GROUP) return;
  const list: string[] = cond.choices ?? (cond.choice ? [cond.choice] : []);
  const kept = list.filter((n) => alive.has(n));
  if (kept.length === list.length) return;
  if (!kept.length) throw new Error(`เงื่อนไข ${where} เหลือว่างหลังถอด — มาดูเองก่อน`);
  const gone = list.filter((n) => !alive.has(n));
  cond.choices = kept;
  if (cond.choice !== undefined) cond.choice = kept[0];
  touched.push(`${where} (ตัด ${gone.join(" · ")})`);
};
for (const r of d.rules ?? []) sweep(r.when, `กฎ ${r.when.label} → ${r.limit?.label}`);
for (const o of d.options ?? []) {
  sweep(o.showWhen, `showWhen ของ "${o.label}"`);
  sweep(o.showWhenAlso, `showWhenAlso ของ "${o.label}"`);
  (o.showWhenAll ?? []).forEach((c: any, i: number) => sweep(c, `showWhenAll[${i}] ของ "${o.label}"`));
}

const n = group.choices.length;
const special = group.choices.filter((c: any) => /Paper|Pound/.test(c.name)).length;
const grams = group.choices
  .filter((c: any) => c.name.startsWith("กระดาษอาร์ตมัน"))
  .map((c: any) => Number(c.name.match(/(\d+) แกรม/)?.[1]))
  .sort((a: number, b: number) => a - b);
const all = Object.values(d.pricing.cells).flat() as number[];
const oldMin = d.priceMin;
d.price = Math.min(...all);
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);

const retext = (s: string) =>
  s
    .replace(/เลือกกระดาษ(ได้)? \d+ ชนิด/, (m) => m.replace(/\d+/, String(n)))
    .replace(/กระดาษให้เลือก \d+ ชนิด/, `กระดาษให้เลือก ${n} ชนิด`)
    .replace(/ผิวพิเศษ \d+ แบบ/, `ผิวพิเศษ ${special} แบบ`)
    .replace(/\d+-\d+ แกรม/, `${grams[0]}-${grams[grams.length - 1]} แกรม`)
    .replace(new RegExp(`เริ่มแผ่นละ ${oldMin} บาท`, "g"), `เริ่มแผ่นละ ${d.priceMin} บาท`);
d.description = retext(d.description);
d.highlights = d.highlights.map(retext);
d.seo = {
  ...d.seo,
  description: retext(d.seo.description),
  faqs: (d.seo.faqs ?? []).map((f: any) => ({ ...f, a: retext(f.a) })),
};

console.log(`ถอด: ${DROP}`);
console.log(`ชนิดกระดาษเหลือ ${n} ชนิด:\n   ${group.choices.map((c: any) => c.name).join(" · ")}`);
console.log(`ช่องราคาที่ลบ ${killedCells.length}: ${killedCells.join(" | ") || "(ไม่มี)"}`);
console.log(`เงื่อนไขที่แก้ ${touched.length}:${touched.length ? "\n   " + touched.join("\n   ") : " (ไม่มี)"}`);
console.log(`ราคา ${d.priceMin} – ${d.priceMax} ต่อ ${d.pricing.unit} (เดิมเริ่ม ${oldMin}) · ช่องราคาที่เหลือ ${Object.keys(d.pricing.cells).length}`);
console.log(`description: ${d.description.slice(0, 150)}…`);
console.log(`highlights: ${d.highlights.join(" | ")}`);
console.log(`seo.description: ${d.seo.description}`);
console.log(`faq[0]: ${d.seo.faqs?.[0]?.a ?? "(ไม่มี)"}`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write ถ้าโอเค)");
  process.exit(0);
}

const { error: saveErr } = await sb.from("products").update({ data: d, price: d.price }).eq("id", ID);
if (saveErr) throw saveErr;

const { data: back, error: backErr } = await sb.from("products").select("price,data").eq("id", ID).single();
if (backErr) throw backErr;
const b: any = back.data;
const names: string[] = b.options.find((o: any) => o.label === PAPER_GROUP).choices.map((c: any) => c.name);
const stale = JSON.stringify(b.options) + JSON.stringify(b.rules ?? []);
const checks: [string, unknown, unknown][] = [
  ["ไม่มีชื่อในตัวเลือก", names.includes(DROP), false],
  ["ไม่มีชื่อในตารางราคา", Object.keys(b.pricing.cells).some((k) => k.startsWith(`${DROP}│`)), false],
  ["ไม่มีชื่อค้างในกฎ/เงื่อนไข", stale.includes(DROP), false],
  ["จำนวนชนิดกระดาษ", names.length, n],
  ["price คอลัมน์", back.price, d.price],
];
for (const [what, got, want] of checks) {
  if (String(got) !== String(want)) throw new Error(`อ่านกลับไม่ตรง ${what}: ได้ ${got} คาด ${want}`);
  console.log(`✓ ${what}: ${got}`);
}
console.log(`\n✅ บันทึกแล้ว — ถอด ${DROP} ออกครบทั้งตัวเลือก/ตารางราคา/เงื่อนไข/ข้อความ`);
