#!/usr/bin/env npx tsx
/**
 * POSTCARD / โปสการ์ด (postcard-th) — ย้ายฐานราคา "กระดาษผิวพิเศษ" ไปอิงหน้า
 * กระดาษ Texture Paper (`texture-paper`) เรท **"ตัดตามขนาด"**
 *
 *   npx tsx scripts/postcard-special-papers-from-texture.mts           # ดูผลก่อน (ไม่เขียน)
 *   npx tsx scripts/postcard-special-papers-from-texture.mts --write   # เขียนสินค้า
 *
 * ผู้ใช้สั่ง (1 ก.ย. 69): "ให้อิงราคาตามสินค้าตัวนี้ paper-art-pet, Texture-Paper แบบตัดตามขนาด"
 * — อาร์ตมัน/PET อิง paper-art-pet (เรทตัดตามขนาด) อยู่แล้วจาก postcard-price-from-paper-art.mts
 *   ส่วนกระดาษผิวพิเศษเดิมตั้งเท่าแถว "อาร์ตมัน 300 แกรม" ไปก่อน (postcard-special-papers.mts)
 *   รอบนี้ให้ไปอิงราคาจริงของกระดาษเนื้อนั้น ๆ บนหน้า texture-paper แทน
 *
 * สูตรต่อช่อง:  ราคาโปสการ์ด = [texture-paper · ชนิดกระดาษ × "ตัดตามขนาด"] + MARKUP + ส่วนต่างค่าเคลือบ
 *   • MARKUP = 0 — ผู้ใช้สั่ง (1 ก.ย. 69 รอบสอง) "ราคาต้องลดลงมา 10 บาท เฉพาะกระดาษผิวพิเศษ 6 ชนิด"
 *     → กระดาษผิวพิเศษคิด **เท่าราคาหน้า texture-paper เป๊ะ ๆ** ไม่บวก 10 บาท/แผ่นเหมือนอาร์ตมัน/PET
 *     (อาร์ตมัน/PET ยังบวก 10 ตาม data.priceMarkup เหมือนเดิม — ดู postcard-price-markup.mts)
 *   • ส่วนต่างค่าเคลือบ = คอลัมน์เคลือบลบคอลัมน์ไม่เคลือบ ของแถว "อาร์ตมัน 300 แกรม" ในตารางโปสการ์ดเอง
 *     (เงา/ด้าน +10 ทุกขั้น · เคลือบพิเศษ +30 แล้วค้างเพดานที่ขั้น 100-499 เหมือนตารางร้าน)
 *     → เปลี่ยนแค่ "ฐานราคากระดาษ" ค่าเคลือบยังคิดเท่าเดิมทุกชนิด
 *
 * อ่านต้นทางสดทุกครั้ง ไม่ฝังเลข — ราคาหน้า texture-paper ขยับเมื่อไหร่ รันซ้ำได้ตลอด (idempotent)
 *
 * ⚠️ postcard-price-markup.mts บวก markup ให้ **ทุกช่องในตาราง** รวมกระดาษผิวพิเศษด้วย —
 *    ถ้าวันหลังขยับ markup ต้องรันตัวนี้ปิดท้ายเสมอ กระดาษผิวพิเศษจะถูกดึงกลับมาเท่าหน้าต้นทาง
 *
 * ⚠️ "กระดาษอาร์ตเกาหลี 300 แกรม" ไม่มีบนหน้า texture-paper → คงราคาเดิม (อิงแถวอาร์ตมัน 300 แกรม)
 * ⚠️ ลำดับรันทั้งชุด: price-from-paper-art → special-papers → **special-papers-from-texture** →
 *    paper-group-tidy → price-markup → option-art
 *    (postcard-special-papers.mts เขียนราคากระดาษพิเศษ = แถวอาร์ตมัน 300 ต้องรันตัวนี้ตามหลังเสมอ)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "postcard-th";
const SRC = "texture-paper";
const SRC_RATE = "ตัดตามขนาด"; // ค่าในแกน "การตัด" ของ texture-paper
const PAPER_GROUP = "ชนิดกระดาษ";
const COAT = "เคลือบ (เฉพาะด้านหน้า)";
const NONE = "ไม่เคลือบ";
const REF = "กระดาษอาร์ตมัน 300 แกรม"; // แถวที่ใช้ดูส่วนต่างค่าเคลือบ

/** กระดาษผิวพิเศษของโปสการ์ด → เนื้อเดียวกันบนหน้า texture-paper */
const MAP: Record<string, string> = {
  "100 Pound Paper 300 แกรม": "เนื้อ 100 Pond (300 แกรม)",
  "E-Photo Paper 290 แกรม": "เนื้อ E-Photo (270 แกรม)",
  "Canvas Paper 260 แกรม": "เนื้อ Canvas (260 แกรม)",
  "Stardream Paper 285 แกรม": "STARDREAM เนื้อมุกขาว (285 แกรม)",
  "Stardream Crystal Paper 285 แกรม": "STARDREAM Crystal เนื้อมุกคริสตัล (285 แกรม)",
  "Extra Paper 260 แกรม": "เนื้อ Extra White (260 แกรม)",
};
/** ไม่มีคู่บนหน้า texture-paper — ปล่อยไว้ตามเดิม */
const KEEP = ["กระดาษอาร์ตเกาหลี 300 แกรม"];

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const grab = async (id: string) => {
  const { data, error } = await sb.from("products").select("name,data").eq("id", id).single();
  if (error || !data) throw new Error(`หาสินค้า ${id} ไม่เจอ: ${error?.message}`);
  return data as { name: string; data: any };
};

const srcRow = await grab(SRC);
const row = await grab(ID);
if (!/POSTCARD|โปสการ์ด/i.test(row.name)) throw new Error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
if (!/Texture/i.test(srcRow.name)) throw new Error(`id ${SRC} เป็นสินค้าอื่น: "${srcRow.name}" — หยุดไว้ก่อน`);

// ── ต้นทาง: ตาราง texture-paper (แกน ชนิดกระดาษ × การตัด) ──────────────────
const src = srcRow.data;
const srcDrivers: string[] = src.pricing?.driverLabels ?? [];
if (srcDrivers[0] !== PAPER_GROUP || srcDrivers.length !== 2)
  throw new Error(`[${SRC}] แกนตารางเปลี่ยนไปแล้ว (${JSON.stringify(srcDrivers)}) — ตรวจก่อนเขียน`);
const srcCells: Record<string, number[]> = src.pricing.cells;
const srcSteps: number = src.pricing.tiers.length;

const d: any = structuredClone(row.data);
const cells: Record<string, number[]> = d.pricing.cells;
const coatGroup = (d.options ?? []).find((o: any) => o.label === COAT);
const paperGroup = (d.options ?? []).find((o: any) => o.label === PAPER_GROUP);
if (!coatGroup || !paperGroup) throw new Error("ไม่เจอกลุ่มชนิดกระดาษ/เคลือบบนโปสการ์ด — โครงตัวเลือกเปลี่ยน มาดูเองก่อน");
const COATS: string[] = coatGroup.choices.map((c: any) => c.name);
const papers: string[] = paperGroup.choices.map((c: any) => c.name);
if (d.pricing.tiers.length !== srcSteps)
  throw new Error(`ขั้นจำนวนไม่เท่ากัน (โปสการ์ด ${d.pricing.tiers.length} · ${SRC} ${srcSteps}) — เทียบราคาตรง ๆ ไม่ได้`);
for (const [name] of Object.entries(MAP)) if (!papers.includes(name)) throw new Error(`โปสการ์ดไม่มีกระดาษ "${name}" — รัน postcard-special-papers.mts ก่อน`);

/** กระดาษผิวพิเศษไม่บวกส่วนต่างจากหน้าต้นทาง (ต่างจากอาร์ตมัน/PET ที่บวก data.priceMarkup) */
const MARKUP = 0;
console.log(`อาร์ตมัน/PET บวกจากงานกระดาษเปล่าอยู่ ${d.priceMarkup ?? 0} บาท · กระดาษผิวพิเศษรอบนี้บวก ${MARKUP} บาท (เท่าหน้า ${SRC} เป๊ะ)`);

// ── ส่วนต่างค่าเคลือบ: อ่านจากแถวอาร์ตมัน 300 แกรม ของตารางโปสการ์ดเอง ────
const refBase = cells[`${REF}│${NONE}`];
if (!refBase) throw new Error(`ไม่เจอช่อง "${REF}│${NONE}" — โครงราคาเปลี่ยน มาดูเองก่อน`);
const coatDelta: Record<string, number[]> = {};
for (const coat of COATS) {
  const v = cells[`${REF}│${coat}`];
  if (!v) throw new Error(`ไม่เจอช่อง "${REF}│${coat}"`);
  coatDelta[coat] = v.map((n, i) => n - refBase[i]);
}
console.log("ส่วนต่างค่าเคลือบที่ยกมาจากแถว " + REF + ":");
for (const coat of COATS) console.log(`   ${coat.padEnd(12)} ${JSON.stringify(coatDelta[coat])}`);

// ── เขียนราคาใหม่ ────────────────────────────────────────────────────────────
console.log("\n🧮 ฐานราคาใหม่ (texture-paper · " + SRC_RATE + " + " + MARKUP + "):");
let changed = 0;
for (const [name, srcName] of Object.entries(MAP)) {
  const base = srcCells[`${srcName}│${SRC_RATE}`];
  if (!base) throw new Error(`[${SRC}] ไม่เจอช่อง "${srcName}│${SRC_RATE}" — ชื่อเนื้อกระดาษ/เรทเปลี่ยน ตรวจก่อน`);
  const nowBase = cells[`${name}│${NONE}`];
  console.log(`   ${name}`);
  console.log(`      ← ${srcName}  ${JSON.stringify(base)}`);
  for (const coat of COATS) {
    const key = `${name}│${coat}`;
    const next = base.map((n, i) => n + MARKUP + coatDelta[coat][i]);
    const before = cells[key];
    if (JSON.stringify(before) !== JSON.stringify(next)) changed++;
    console.log(
      `      ${coat.padEnd(12)} ${JSON.stringify(before)} → ${JSON.stringify(next)}` +
        (JSON.stringify(before) === JSON.stringify(next) ? "  (เท่าเดิม)" : "")
    );
    cells[key] = next;
  }
  void nowBase;
}
for (const name of KEEP) console.log(`\n(คงเดิม) ${name} — ไม่มีบนหน้า ${SRC} · ${JSON.stringify(cells[`${name}│${NONE}`])} (อิงแถว ${REF})`);

// ── ราคากระจก + ข้อความ ─────────────────────────────────────────────────────
const all = Object.values(cells).flat();
d.price = Math.min(...all);
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);
if (d.seo?.description) d.seo.description = d.seo.description.replace(/เริ่มแผ่นละ \d+ บาท/, `เริ่มแผ่นละ ${d.priceMin} บาท`);

console.log(`\nช่องที่ราคาขยับ ${changed} ช่อง · ช่องราคาทั้งหมด ${Object.keys(cells).length} ช่อง`);
console.log(`ราคา ${d.priceMin} – ${d.priceMax} ต่อ ${d.pricing.unit}`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write ถ้าโอเค)");
  process.exit(0);
}

const { error: saveErr } = await sb.from("products").update({ data: d, price: d.price }).eq("id", ID);
if (saveErr) throw saveErr;

const { data: back, error: backErr } = await sb.from("products").select("price,data").eq("id", ID).single();
if (backErr) throw backErr;
const b: any = back.data;
const checks: [string, unknown, unknown][] = [
  ["price คอลัมน์", back.price, d.price],
  ["ช่องราคา", Object.keys(b.pricing.cells).length, Object.keys(cells).length],
  ...Object.keys(MAP).map(
    (name) => [`${name} · ${NONE}`, JSON.stringify(b.pricing.cells[`${name}│${NONE}`]), JSON.stringify(cells[`${name}│${NONE}`])] as [string, unknown, unknown]
  ),
  ["ชนิดกระดาษ", b.options.find((o: any) => o.label === PAPER_GROUP).choices.length, papers.length],
];
for (const [what, got, want] of checks) {
  if (String(got) !== String(want)) throw new Error(`อ่านกลับไม่ตรง ${what}: ได้ ${got} คาด ${want}`);
  console.log(`✓ ${what}: ${got}`);
}
console.log(`\n✅ บันทึกแล้ว — กระดาษผิวพิเศษ ${Object.keys(MAP).length} ชนิดอิงราคา ${SRC} เรท "${SRC_RATE}" แล้ว`);
