#!/usr/bin/env npx tsx
/**
 * POSTCARD / โปสการ์ด (postcard-th) — ถอด "กระดาษอาร์ตเกาหลี 300 แกรม" ที่ซ้ำกับ "กระดาษอาร์ตมัน 300 แกรม"
 *
 *   npx tsx scripts/postcard-drop-korean-art-300.mts           # ดูผลก่อน (ไม่เขียน)
 *   npx tsx scripts/postcard-drop-korean-art-300.mts --write   # เขียนสินค้า
 *
 * ผู้ใช้ทัก (2 ก.ย. 69): เมนูชนิดกระดาษมีกระดาษ 300 ซ้ำ ให้เอาออก 1 อัน
 * อาร์ตมันของร้านคือ "อาร์ตมันนำเข้าจากเกาหลี" อยู่แล้ว (ดู description) และราคาทั้ง 4 การเคลือบ
 * ของแถว "อาร์ตเกาหลี 300" เท่ากับแถว "อาร์ตมัน 300" เป๊ะ ๆ → เป็นชนิดเดียวกันที่ติดมาสองชื่อ
 * เก็บชื่อในตระกูลหลัก (อาร์ตมัน 150/300/350/400) ไว้ ถอดชื่อซ้ำออก
 *
 * ถอดตัวเลือกต้องเก็บกวาด 3 ที่พร้อมกัน ไม่งั้นค้างเป็นขยะ/กฎเพี้ยน:
 *   1. ตัวเลือกในกลุ่ม "ชนิดกระดาษ"   2. ช่องราคาของแถวนั้นทุกการเคลือบ
 *   3. ชื่อกระดาษที่ไปโผล่ใน rules (กฎวัสดุ PET) — ลบชื่อออกจาก when.choices
 * แล้วตามแก้ข้อความที่นับจำนวนชนิดกระดาษ (description / highlights / seo)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "postcard-th";
const DROP = "กระดาษอาร์ตเกาหลี 300 แกรม";
const TWIN = "กระดาษอาร์ตมัน 300 แกรม";
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

// ยืนยันว่าซ้ำจริงก่อนถอด — ราคาทุกช่องของสองแถวต้องเท่ากัน
const cellsOf = (paper: string) =>
  Object.fromEntries(
    Object.entries(d.pricing.cells)
      .filter(([k]) => k.startsWith(`${paper}│`))
      .map(([k, v]) => [k.split("│").slice(1).join("│"), v])
  );
const dropCells = cellsOf(DROP);
const twinCells = cellsOf(TWIN);
if (Object.keys(dropCells).length && JSON.stringify(dropCells) !== JSON.stringify(twinCells))
  throw new Error(`ราคา "${DROP}" ไม่เท่า "${TWIN}" — ไม่ใช่ของซ้ำ มาดูเองก่อน`);

const before = group.choices.length;
group.choices = group.choices.filter((c: any) => c.name !== DROP);
if (group.choices.length === before) console.log(`(ไม่มี "${DROP}" ในกลุ่มอยู่แล้ว — ตรวจส่วนที่เหลือต่อ)`);

const killedCells = Object.keys(d.pricing.cells).filter((k) => k.startsWith(`${DROP}│`));
for (const k of killedCells) delete d.pricing.cells[k];

const touchedRules: string[] = [];
for (const r of d.rules ?? []) {
  const list: string[] = r.when.choices ?? [r.when.choice];
  if (!list.includes(DROP)) continue;
  const kept = list.filter((n) => n !== DROP);
  if (!kept.length) throw new Error(`กฎ "${r.when.label} → ${r.limit.label}" เหลือเงื่อนไขว่างหลังถอด — มาดูเองก่อน`);
  r.when.choices = kept;
  r.when.choice = kept[0];
  touchedRules.push(`${r.when.label} → ${r.limit.label}`);
}

const n = group.choices.length;
const special = group.choices.filter((c: any) => /Paper|Pound/.test(c.name)).length;
const all = Object.values(d.pricing.cells).flat() as number[];
d.price = Math.min(...all);
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);
d.description = d.description
  .replace(/เลือกกระดาษได้ \d+ ชนิด/, `เลือกกระดาษได้ ${n} ชนิด`)
  .replace(/อาร์ตเกาหลี · /, "");
d.highlights = d.highlights.map((h: string) =>
  h
    .replace(/กระดาษให้เลือก \d+ ชนิด/, `กระดาษให้เลือก ${n} ชนิด`)
    .replace(/ผิวพิเศษ \d+ แบบ/, `ผิวพิเศษ ${special} แบบ`)
);
d.seo = { ...d.seo, description: d.seo.description.replace(/เลือกกระดาษ \d+ ชนิด/, `เลือกกระดาษ ${n} ชนิด`) };

console.log(`ชนิดกระดาษเหลือ ${n} ชนิด:`);
console.log("   " + group.choices.map((c: any) => c.name).join(" · "));
console.log(`ช่องราคาที่ลบ ${killedCells.length}: ${killedCells.join(" | ") || "(ไม่มี)"}`);
console.log(`กฎที่แก้ ${touchedRules.length}: ${touchedRules.join(" · ") || "(ไม่มี)"}`);
console.log(`ราคา ${d.priceMin} – ${d.priceMax} ต่อ ${d.pricing.unit} · ช่องราคาที่เหลือ ${Object.keys(d.pricing.cells).length}`);
console.log(`description: ${d.description.slice(0, 160)}…`);
console.log(`highlights: ${d.highlights.join(" | ")}`);
console.log(`seo.description: ${d.seo.description}`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write ถ้าโอเค)");
  process.exit(0);
}

const { error: saveErr } = await sb.from("products").update({ data: d, price: d.price }).eq("id", ID);
if (saveErr) throw saveErr;

const { data: back, error: backErr } = await sb.from("products").select("price,data").eq("id", ID).single();
if (backErr) throw backErr;
const b: any = back.data;
const names = b.options.find((o: any) => o.label === PAPER_GROUP).choices.map((c: any) => c.name);
const inRules = (b.rules ?? []).some((r: any) => (r.when.choices ?? [r.when.choice]).includes(DROP));
const checks: [string, unknown, unknown][] = [
  ["ไม่มีชื่อซ้ำในตัวเลือก", names.includes(DROP), false],
  ["ยังมีแถวอาร์ตมัน 300", names.includes(TWIN), true],
  ["ไม่มีชื่อซ้ำในตารางราคา", Object.keys(b.pricing.cells).some((k) => k.startsWith(`${DROP}│`)), false],
  ["ไม่มีชื่อซ้ำในกฎ", inRules, false],
  ["จำนวนชนิดกระดาษ", names.length, n],
  ["ช่องราคาครบทุกแถว", Object.keys(b.pricing.cells).length, (names.length - 0) * 4],
  ["price คอลัมน์", back.price, d.price],
];
for (const [what, got, want] of checks) {
  if (String(got) !== String(want)) throw new Error(`อ่านกลับไม่ตรง ${what}: ได้ ${got} คาด ${want}`);
  console.log(`✓ ${what}: ${got}`);
}
console.log(`\n✅ บันทึกแล้ว — ถอด ${DROP} ออกครบทั้งตัวเลือก/ตารางราคา/กฎ`);
