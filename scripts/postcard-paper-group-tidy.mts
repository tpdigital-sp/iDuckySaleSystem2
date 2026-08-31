#!/usr/bin/env npx tsx
/**
 * POSTCARD / โปสการ์ด (postcard-th) — เก็บกวาดกลุ่ม "ชนิดกระดาษ" ที่ยกมาจาก paper-art-pet
 *
 *   npx tsx scripts/postcard-paper-group-tidy.mts           # ดูผลก่อน (ไม่เขียน)
 *   npx tsx scripts/postcard-paper-group-tidy.mts --write   # เขียนสินค้า
 *
 * ผู้ใช้สั่ง (31 ส.ค. 69) สองข้อ:
 *   1. ถอด "กระดาษอาร์ตมัน 130 แกรม" — โปสการ์ดไม่ขายกระดาษบางขนาดนี้
 *      (ติดมาตอนยกตารางราคา paper-art-pet มา · งานกระดาษยังขาย 130 แกรมตามปกติ ไม่แตะ)
 *   2. เอารูปเล็กที่ติดหน้าตัวเลือกออก — มีแค่ 3 ใน 13 ชนิดที่มีรูป (300 / 400 / PET ของ paper-art-pet)
 *      โผล่ไม่ครบดูเลอะ และเป็นรูปของสินค้าอื่น ไม่ใช่เนื้อกระดาษโปสการ์ด
 *      (กลุ่มเคลือบมีรูปครบ 4/4 ทุกตัว ไม่แตะ)
 *
 * การถอดตัวเลือกต้องเก็บกวาด 3 ที่พร้อมกัน ไม่งั้นค้างเป็นขยะ/กฎเพี้ยน:
 *   1. ตัวเลือกในกลุ่ม "ชนิดกระดาษ"   2. ช่องราคาของแถวนั้นทุกการเคลือบ
 *   3. ชื่อกระดาษที่ไปโผล่ใน rules (กฎจำกัดจำนวนด้าน / วัสดุ PET) — ลบชื่อออกจาก when.choices
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "postcard-th";
const DROP = "กระดาษอาร์ตมัน 130 แกรม";
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
const before = group.choices.length;
group.choices = group.choices.filter((c: any) => c.name !== DROP);
if (group.choices.length === before) console.log(`(ไม่มี "${DROP}" ในกลุ่มอยู่แล้ว — ตรวจส่วนที่เหลือต่อ)`);

// รูปเล็กหน้าตัวเลือก (ของ paper-art-pet) — ถอดออกทั้งกลุ่มให้หน้าตาเสมอกัน
const hadImg = group.choices.filter((c: any) => c.imageSrc || c.videoSrc).map((c: any) => c.name);
for (const c of group.choices) {
  delete c.imageSrc;
  delete c.videoSrc;
}

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

const all = Object.values(d.pricing.cells).flat() as number[];
d.price = Math.min(...all);
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);
d.description = d.description.replace(/130-400 แกรม/g, "150-400 แกรม");
d.highlights = d.highlights.map((h: string) =>
  h.replace(/130-400 แกรม/g, "150-400 แกรม").replace(/กระดาษให้เลือก \d+ ชนิด/, `กระดาษให้เลือก ${group.choices.length} ชนิด`)
);
d.seo = { ...d.seo, description: d.seo.description.replace(/เลือกกระดาษ \d+ ชนิด/, `เลือกกระดาษ ${group.choices.length} ชนิด`) };

console.log(`ชนิดกระดาษเหลือ ${group.choices.length} ชนิด:`);
console.log("   " + group.choices.map((c: any) => c.name).join(" · "));
console.log(`รูปหน้าตัวเลือกที่ถอด ${hadImg.length}: ${hadImg.join(" · ") || "(ไม่มี)"}`);
console.log(`ช่องราคาที่ลบ ${killedCells.length}: ${killedCells.join(" | ") || "(ไม่มี)"}`);
console.log(`กฎที่แก้ ${touchedRules.length}: ${touchedRules.join(" · ") || "(ไม่มี)"}`);
console.log(`ราคา ${d.priceMin} – ${d.priceMax} ต่อ ${d.pricing.unit} · ช่องราคาที่เหลือ ${Object.keys(d.pricing.cells).length}`);

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
  ["ไม่มี 130 แกรมในตัวเลือก", names.includes(DROP), false],
  ["ไม่มี 130 แกรมในตารางราคา", Object.keys(b.pricing.cells).some((k) => k.startsWith(`${DROP}│`)), false],
  ["ไม่มี 130 แกรมในกฎ", inRules, false],
  ["จำนวนชนิดกระดาษ", names.length, group.choices.length],
  ["price คอลัมน์", back.price, d.price],
  ["ไม่มีรูปค้างในกลุ่มกระดาษ", b.options.find((o: any) => o.label === PAPER_GROUP).choices.some((c: any) => c.imageSrc), false],
];
for (const [what, got, want] of checks) {
  if (String(got) !== String(want)) throw new Error(`อ่านกลับไม่ตรง ${what}: ได้ ${got} คาด ${want}`);
  console.log(`✓ ${what}: ${got}`);
}
console.log(`\n✅ บันทึกแล้ว — ถอด ${DROP} ออกครบทั้งตัวเลือก/ตารางราคา/กฎ + ล้างรูปหน้าตัวเลือกทั้งกลุ่ม`);
