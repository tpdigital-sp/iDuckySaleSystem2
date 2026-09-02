#!/usr/bin/env npx tsx
/**
 * PHOTO BOOTH (กระดาษ) — ยกราคาต่อชนิดกระดาษให้เท่ากับ POSTCARD / โปสการ์ด (postcard-th)
 *
 *   npx tsx scripts/photobooth-paper-price-from-postcard.mts           # ดูผลก่อน (ไม่เขียน)
 *   npx tsx scripts/photobooth-paper-price-from-postcard.mts --write   # เขียนสินค้า
 *
 * ผู้ใช้สั่ง (2 ก.ย. 69): "ราคากระดาษแต่ละชนิดเท่ากันสินค้า POSTCARD"
 * ตอนสร้างโฟโต้บูธ (1 ก.ย.) ยกราคามาตอนโปสการ์ดยังมี markup +10 อยู่ และกระดาษผิวพิเศษ
 * ยังไม่ได้ย้ายไปอิง texture-paper → ตอนนี้ตารางเพี้ยนจากต้นทางทั้งกระดาน
 * สคริปต์อ่านตารางโปสการ์ดสด ๆ ทุกครั้ง (รันซ้ำได้เมื่อโปสการ์ดขยับราคา)
 *
 * ชื่อกระดาษของโฟโต้บูธเปลี่ยนมาตรงกับโปสการ์ดแล้ว (2 ก.ย. 69 · rename-choice.mts):
 *    "กระดาษอาร์ตเกาหลี 300 แกรม" → "กระดาษอาร์ตมัน 300 แกรม" (กระดาษตัวเดียวกันคนละชื่อ)
 *    "100 Pound Paper 300 แกรม"  → "100 Pound Paper (หนา 300gsm)" — ⚠️ ชื่อนี้ฝั่งโปสการ์ดก็เปลี่ยนตามแล้ว
 *
 * ฝาแฝด POLAROID (new-mti1wu6o-1002) ยังเป็นตารางชุดเก่าอยู่ — ถ้าจะให้ตรงกันต้องสั่งแยก
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "new-mti1x6y4-5967";
const SRC = "postcard-th";
const PAPER_GROUP = "ชนิดกระดาษ";

/** ชนิดกระดาษของโฟโต้บูธ → แถวที่ใช้อ้างอิงในตารางโปสการ์ด */
const PAPER_MAP: Record<string, string> = {
  "กระดาษอาร์ตมัน 300 แกรม": "กระดาษอาร์ตมัน 300 แกรม",
  "กระดาษอาร์ตมัน 350 แกรม": "กระดาษอาร์ตมัน 350 แกรม",
  "กระดาษอาร์ตมัน 400 แกรม": "กระดาษอาร์ตมัน 400 แกรม",
  "Canvas Paper 260 แกรม": "Canvas Paper 260 แกรม",
  "100 Pound Paper (หนา 300gsm)": "100 Pound Paper (หนา 300gsm)",
  "E-Photo Paper 290 แกรม": "E-Photo Paper 290 แกรม",
  "Stardream Crystal Paper 285 แกรม": "Stardream Crystal Paper 285 แกรม",
  "Stardream Paper 285 แกรม": "Stardream Paper 285 แกรม",
  "Extra Paper 260 แกรม": "Extra Paper 260 แกรม",
};

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { data: rows, error } = await sb.from("products").select("id,name,data").in("id", [ID, SRC]);
if (error) throw error;
const rowOf = (id: string) => {
  const r = rows!.find((x) => x.id === id);
  if (!r) throw new Error(`ไม่เจอสินค้า ${id}`);
  return r;
};
const me = rowOf(ID);
const src = rowOf(SRC);
if (!/PHOTO BOOTH \(กระดาษ\)/.test(me.name)) throw new Error(`id ${ID} เป็นสินค้าอื่น: "${me.name}" — หยุดไว้ก่อน`);
if (!/POSTCARD|โปสการ์ด/i.test(src.name)) throw new Error(`id ${SRC} เป็นสินค้าอื่น: "${src.name}" — หยุดไว้ก่อน`);

const d: any = structuredClone(me.data);
const s: any = src.data;

// ขั้นจำนวนต้องตรงกันเป๊ะ ไม่งั้นยกตัวเลขข้ามกันไม่ได้
const myTiers = JSON.stringify((d.pricing.tiers ?? []).map((t: any) => t.upTo));
const srcTiers = JSON.stringify((s.pricing.tiers ?? []).map((t: any) => t.upTo));
if (myTiers !== srcTiers) throw new Error(`ขั้นจำนวนไม่ตรงกับโปสการ์ด (${myTiers} vs ${srcTiers}) — มาดูเองก่อน`);
if (d.pricing.unit !== s.pricing.unit) throw new Error(`หน่วยไม่ตรงกัน (${d.pricing.unit} vs ${s.pricing.unit})`);

const papers: string[] = d.options.find((o: any) => o.label === PAPER_GROUP)?.choices.map((c: any) => c.name) ?? [];
if (!papers.length) throw new Error(`ไม่เจอกลุ่ม "${PAPER_GROUP}"`);

const changes: string[] = [];
for (const key of Object.keys(d.pricing.cells)) {
  const [paper, ...rest] = key.split("│");
  const coat = rest.join("│");
  const srcPaper = PAPER_MAP[paper];
  if (!srcPaper) throw new Error(`ยังไม่ได้จับคู่กระดาษ "${paper}" กับแถวของโปสการ์ด — เติมใน PAPER_MAP ก่อน`);
  const srcCell = s.pricing.cells[`${srcPaper}│${coat}`];
  if (!srcCell) throw new Error(`โปสการ์ดไม่มีช่อง "${srcPaper}│${coat}" — มาดูเองก่อน`);
  const before = JSON.stringify(d.pricing.cells[key]);
  const after = JSON.stringify(srcCell);
  if (before !== after) changes.push(`${key.padEnd(46)} ${before} → ${after}`);
  d.pricing.cells[key] = structuredClone(srcCell);
}
for (const p of papers)
  if (!["ไม่เคลือบ", "เคลือบเงา", "เคลือบด้าน", "เคลือบพิเศษ"].every((c) => d.pricing.cells[`${p}│${c}`]))
    throw new Error(`ช่องราคาของ "${p}" ไม่ครบ 4 การเคลือบ — มาดูเองก่อน`);

const all = Object.values(d.pricing.cells).flat() as number[];
d.price = Math.min(...all);
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);

// กระดาษถูกสุด = ตัวที่โชว์เป็นราคาเริ่มต้นในข้อความต่าง ๆ
const startOf = (p: string) => d.pricing.cells[`${p}│ไม่เคลือบ`][0];
const cheapest = papers.slice().sort((a, b) => startOf(a) - startOf(b))[0];
const startPrice = startOf(cheapest);
const tier2Price = d.pricing.cells[`${cheapest}│ไม่เคลือบ`][1];
const floorPrice = d.priceMin;

// รายการราคาต่อชนิดกระดาษในแท็บ "รายละเอียดงานพิมพ์"
const tab = d.tabs.find((t: any) => /ชนิดกระดาษ/.test(t.text ?? ""));
if (!tab) throw new Error("ไม่เจอแท็บที่ลิสต์ราคากระดาษ — มาดูเองก่อน");
let listed = 0;
tab.text = tab.text
  .split("\n")
  .map((line: string) => {
    const m = line.match(/^• (.+?) — \d+ บาท\/แผ่น A3 \((.+)\)$/);
    if (!m || !papers.includes(m[1])) return line;
    listed++;
    return `• ${m[1]} — ${startOf(m[1])} บาท/แผ่น A3 (${m[2]})`;
  })
  .join("\n");
if (listed !== papers.length) throw new Error(`แท็บลิสต์ราคากระดาษได้ ${listed}/${papers.length} บรรทัด — มาดูเองก่อน`);

d.highlights = d.highlights.map((h: string) =>
  h.replace(
    /เริ่ม \d+ บาท\/แผ่น A3 — สั่งเยอะเหลือแผ่นละ \d+ บาท/,
    `เริ่ม ${startPrice} บาท/แผ่น A3 — สั่งเยอะเหลือแผ่นละ ${floorPrice} บาท`
  )
);
d.seo = {
  ...d.seo,
  description: d.seo.description.replace(/เริ่ม \d+ บาท/, `เริ่ม ${startPrice} บาท`),
  faqs: d.seo.faqs.map((f: any) => ({
    ...f,
    a: f.a
      .replace(/เริ่มแผ่นละ \d+ บาท/, `เริ่มแผ่นละ ${startPrice} บาท`)
      .replace(/เหลือแผ่นละ \d+ บาท/, `เหลือแผ่นละ ${tier2Price} บาท`),
  })),
};

console.log(`ช่องราคาที่เปลี่ยน ${changes.length}/${Object.keys(d.pricing.cells).length}:`);
for (const c of changes) console.log("   " + c);
console.log(`\nราคาเริ่มต้น ${startPrice} (${cheapest}) · ขั้น 2 ${tier2Price} · ต่ำสุด ${floorPrice} · สูงสุด ${d.priceMax}`);
console.log("\n" + tab.text.split("::")[4]);
console.log(`highlights: ${d.highlights[4]}`);
console.log(`faq[0]: ${d.seo.faqs[0].a}`);
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
const mismatched = Object.keys(b.pricing.cells).filter(
  (k) => JSON.stringify(b.pricing.cells[k]) !== JSON.stringify(s.pricing.cells[`${PAPER_MAP[k.split("│")[0]]}│${k.split("│").slice(1).join("│")}`])
);
const checks: [string, unknown, unknown][] = [
  ["ทุกช่องตรงกับโปสการ์ด", mismatched.length, 0],
  ["จำนวนช่องราคา", Object.keys(b.pricing.cells).length, papers.length * 4],
  ["price คอลัมน์", back.price, d.price],
  ["priceMin", b.priceMin, d.priceMin],
  ["priceMax", b.priceMax, d.priceMax],
  ["ชนิดกระดาษยังครบ", b.options.find((o: any) => o.label === PAPER_GROUP).choices.length, papers.length],
];
for (const [what, got, want] of checks) {
  if (String(got) !== String(want)) throw new Error(`อ่านกลับไม่ตรง ${what}: ได้ ${got} คาด ${want}`);
  console.log(`✓ ${what}: ${got}`);
}
console.log(`\n✅ บันทึกแล้ว — ราคาทุกชนิดกระดาษเท่ากับ ${src.name}`);
