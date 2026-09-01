#!/usr/bin/env npx tsx
/**
 * POSTCARD / โปสการ์ด (postcard-th) — ยกราคา + ระบบตัวเลือกมาจาก "กระดาษอาร์ตมัน | PET" (paper-art-pet)
 *
 *   npx tsx scripts/postcard-price-from-paper-art.mts           # ดูผลก่อน (ไม่เขียน)
 *   npx tsx scripts/postcard-price-from-paper-art.mts --write   # เขียนสินค้า
 *
 * ผู้ใช้สั่ง (31 ส.ค. 69): "copy ราคาจาก paper-art-pet" พร้อม 3 ข้อต่าง
 *   1. ไม่มีกลุ่ม "เรทราคา" (ตัดตามขนาด / ไดคัทตามทรง) — ใช้เรท "ตัดตามขนาด" เป็นตารางเดียวของสินค้า
 *   2. ขนาดมีแค่ 4x6 นิ้ว กับ 5x7 นิ้ว (ตัดกลุ่ม A4/A5/A6/A7 + กำหนดขนาดเอง + ช่องกรอกไดคัททิ้ง)
 *   3. เพิ่มกลุ่มแนวตั้ง / แนวนอน
 *
 * ⚠️ ของเดิมที่ถูกแทน: ตารางราคา 42 ช่องของโปสการ์ด (กระดาษพิเศษ 7 ชนิด — อาร์ตเกาหลี / Canvas /
 *    100 Pound / E-Photo / Stardream ฯลฯ + เคลือบโฮโลแกรม 3 แบบ) และกลุ่ม "ตัวเลือก: ลายเดียว/คละลาย"
 *    (paper-art-pet คิดค่าคละลายอัตโนมัติด้วย mixRule ลายละ 5 บาท ลายแรกไม่คิด — กลุ่มมือจึงซ้ำซ้อน)
 *    สำรองไฟล์เดิมไว้ที่ .cache/backup-postcard-th-*.json ก่อนรัน --write ครั้งแรก
 *
 * ราคาเป็น "ต่อแผ่น A3" เหมือนต้นทาง (+ MARKUP · ตอนนี้ 0 = เท่าต้นทางเป๊ะ) — ขนาดที่เลือกบอกว่า 1 แผ่นได้กี่ใบ (piecesPerUnit)
 * 4 × 6 นิ้ว = 8 ใบ/A3 · 5 × 7 นิ้ว = 4 ใบ/A3 (ตามป้ายเดิมของสินค้าโปสการ์ด)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "postcard-th";
const FROM = "paper-art-pet";
const RATE = "ตัดตามขนาด";
/** ส่วนบวกจากราคางานกระดาษเปล่า — ผู้ใช้สั่งบวก 10 แล้วสั่งลดกลับจนครบ (1 ก.ย. 69)
 *  ตอนนี้ 0 = โปสการ์ดคิดเท่าหน้า paper-art-pet เป๊ะ · ต้องตรงกับ MARKUP
 *  ใน scripts/postcard-price-markup.mts ไม่งั้นรันชุดใหม่แล้วราคาเด้งกลับ */
const MARKUP = 0;
const SIZE = "ขนาด";
const ORIENT = "แนวโปสการ์ด";
/** กลุ่มของต้นทางที่ไม่เอา — ผูกกับเรท/ขนาดตัดที่สินค้านี้ไม่มี */
const DROP = new Set(["ขนาดตัด", "ขนาดตัด (กว้าง)", "ขนาดตัด (สูง)", "ขนาดไดคัท (กว้าง)", "ขนาดไดคัท (สูง)"]);

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

// ── ต้นทาง ────────────────────────────────────────────────────────────────────
const { data: src, error: srcErr } = await sb.from("products").select("name,data").eq("id", FROM).single();
if (srcErr) throw srcErr;
const s: any = src.data;
const rate = (s.priceRates ?? []).find((r: any) => r.label === RATE);
if (!rate?.pricing?.cells) throw new Error(`${FROM} ไม่มีเรท "${RATE}" แล้ว — โครงต้นทางเปลี่ยน มาดูเองก่อน`);
const cells: Record<string, number[]> = rate.pricing.cells;
const tiers = rate.pricing.tiers;
console.log(
  `📋 ต้นทาง ${src.name} · เรท "${RATE}": ${Object.keys(cells).length} ช่อง × ${tiers.length} ขั้น · หน่วย ${rate.pricing.unit}`
);
console.log(`   แกนราคา: ${rate.pricing.driverLabels.join(" × ")}`);

// ── ปลายทาง ───────────────────────────────────────────────────────────────────
const { data: row, error } = await sb.from("products").select("name,category,data").eq("id", ID).single();
if (error) throw error;
if (!/POSTCARD|โปสการ์ด/i.test(row.name)) throw new Error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
const d: any = structuredClone(row.data);

// 1) ราคา: เรทเดียว ไม่มีตัวเลือกเรท
d.pricing = structuredClone(rate.pricing);
for (const k of Object.keys(d.pricing.cells)) d.pricing.cells[k] = d.pricing.cells[k].map((v: number) => v + MARKUP);
d.priceMarkup = MARKUP; // ธงกันบวกซ้ำของ postcard-price-markup.mts
delete d.priceRates;
delete d.rateAfterOptions;
delete d.rateAfterGroup;
const all = Object.values(d.pricing.cells).flat() as number[];
d.price = Math.min(...all);
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);

// 2) ตัวเลือก: ยกของต้นทางมา ตัดกลุ่มที่ผูกกับเรท/ขนาดตัด แล้วเสียบ ขนาด + แนว ไว้บนสุด
const carried = (s.options ?? []).filter((o: any) => !DROP.has(o.label)).map((o: any) => structuredClone(o));
for (const g of carried) {
  // showWhen ที่อ้างกลุ่ม "เรทราคา" ใช้ไม่ได้แล้ว (ไม่มีเรทให้เลือก) — ปลดออก ไม่งั้นกลุ่มจะซ่อนตลอด
  for (const key of ["showWhen", "showWhenAlso"] as const)
    if (g[key]?.label === "เรทราคา") delete g[key];
  if (g.showWhenAll?.length) g.showWhenAll = g.showWhenAll.filter((c: any) => c.label !== "เรทราคา");
  delete g.rateId;
}
const sizeGroup = {
  label: SIZE,
  note: "ราคาคิดเป็นแผ่น A3 — 1 แผ่นตัดได้หลายใบตามขนาดที่เลือก",
  choices: [
    { name: "4 × 6 นิ้ว", badge: "ได้ 8 ใบ / แผ่น A3", piecesPerUnit: 8 },
    { name: "5 × 7 นิ้ว", badge: "ได้ 4 ใบ / แผ่น A3", piecesPerUnit: 4 },
  ],
};
const orientGroup = {
  label: ORIENT,
  note: "ราคาเท่ากันทั้งสองแนว — เลือกตามลายที่ออกแบบ",
  choices: [{ name: "แนวนอน" }, { name: "แนวตั้ง" }],
};
d.options = [sizeGroup, orientGroup, ...carried];

// 3) กติกา/ค่าคละ/คละลายด้านหลัง ยกมาทั้งชุด (เป็นส่วนหนึ่งของระบบราคาต้นทาง)
d.rules = structuredClone(s.rules ?? []);
d.mixRule = structuredClone(s.mixRule);
if (s.backDesign) d.backDesign = structuredClone(s.backDesign);
else delete d.backDesign;
d.terms = s.terms;

// กฎต้องอ้างเฉพาะกลุ่มที่มีจริง ไม่งั้นล็อกตัวเลือกเพี้ยนเงียบ ๆ
const haveLabels = new Set(d.options.map((o: any) => o.label));
for (const r of d.rules)
  for (const label of [r.when.label, r.limit.label])
    if (!haveLabels.has(label)) throw new Error(`กฎอ้างกลุ่ม "${label}" ที่สินค้านี้ไม่มี — มาดูเองก่อน`);
// แกนตารางราคาต้องมีกลุ่มรองรับครบ (ขาดกลุ่มไหน ราคาหล่นไป product.price เงียบ ๆ)
for (const label of d.pricing.driverLabels)
  if (!haveLabels.has(label)) throw new Error(`แกนราคา "${label}" ไม่มีกลุ่มตัวเลือกรองรับ — หยุดก่อนเขียน`);

// 4) ข้อความหน้าสินค้า — ของเดิมพูดถึงกระดาษ 8 ชนิด/โฮโลแกรม ซึ่งไม่ใช่ชุดนี้แล้ว
const PAPERS = (carried.find((o: any) => o.label === "ชนิดกระดาษ")?.choices ?? []).map((c: any) => c.name);
d.description =
  "โปสการ์ดพิมพ์ระบบ Digital Printing บนกระดาษอาร์ตมันนำเข้าจากเกาหลี (130 / 150 / 300 / 350 / 400 แกรม) " +
  "หรือแผ่นพลาสติก PET 250 แกรม (สีขาว / สีใส) เลือกขนาด 4 × 6 นิ้ว หรือ 5 × 7 นิ้ว ได้ทั้งแนวนอนและแนวตั้ง " +
  "พร้อมเคลือบเงา / ด้าน / เคลือบพิเศษ · คิดราคาเป็นแผ่น A3 แบบขั้นบันได ยิ่งสั่งมากยิ่งถูก";
d.highlights = [
  "ขนาด 4 × 6 นิ้ว (8 ใบ/แผ่น A3) และ 5 × 7 นิ้ว (4 ใบ/แผ่น A3)",
  "เลือกได้ทั้งแนวนอนและแนวตั้ง ราคาเท่ากัน",
  "กระดาษอาร์ตมันเกาหลี 130-400 แกรม หรือ PET 250 แกรม (ขาว/ใส)",
  "เคลือบเงา ด้าน หรือเคลือบพิเศษ (กลิตเตอร์ ทราย โฮโลแกรม 10 ลาย)",
];
d.seo = {
  ...(d.seo ?? {}),
  title: "รับพิมพ์โปสการ์ด 4x6 / 5x7 นิ้ว พิมพ์ลายตามสั่ง | iDucky Prints",
  description:
    `รับพิมพ์โปสการ์ดลายตามสั่ง ขนาด 4 × 6 นิ้ว และ 5 × 7 นิ้ว แนวนอน/แนวตั้ง เลือกกระดาษ ${PAPERS.length} ชนิด ` +
    `เคลือบเงา/ด้าน/พิเศษ คิดราคาเป็นแผ่น A3 เริ่มแผ่นละ ${d.priceMin} บาท สั่งเยอะลดตามขั้น`,
  faqs: [
    {
      q: "โปสการ์ดคิดราคายังไง 1 แผ่นได้กี่ใบ?",
      a:
        `คิดเป็นแผ่น A3 ตามชนิดกระดาษและการเคลือบ เริ่มแผ่นละ ${d.priceMin} บาท — ` +
        "ขนาด 4 × 6 นิ้ว ได้ 8 ใบต่อแผ่น A3 · ขนาด 5 × 7 นิ้ว ได้ 4 ใบต่อแผ่น A3 · สั่งเยอะราคาต่อแผ่นลดตามขั้น",
    },
    {
      q: "โปสการ์ดคละลายในแผ่นเดียวกันได้ไหม?",
      a: "ได้ครับ 1 แผ่น A3 ต่อ 1 ลาย · คละหลายลายได้ ค่าคละลายละ 5 บาท ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ) · พิมพ์ 2 ด้านคละลายด้านหลังได้อีกชุด",
    },
    ...((d.seo?.faqs ?? []).filter((f: any) => !/ราคา|คละ/.test(f.q))),
  ],
};

console.log(`\nกลุ่มตัวเลือกหลังแก้ (${d.options.length} กลุ่ม):`);
for (const g of d.options)
  console.log(
    ` - "${g.label}" (${g.display ?? "pills"})${g.showWhen ? ` [โชว์เมื่อ ${g.showWhen.label}=${g.showWhen.choices.join("/")}]` : ""}: ` +
      (g.choices ?? []).map((c: any) => `${c.name}${c.extra ? ` +${c.extra}` : ""}${c.piecesPerUnit ? ` [${c.piecesPerUnit} ใบ/A3]` : ""}`).join(" · ")
  );
console.log(`ราคา: ${d.priceMin} – ${d.priceMax} ต่อ ${d.pricing.unit} · ${Object.keys(d.pricing.cells).length} ช่อง × ${tiers.length} ขั้น · กฎ ${d.rules.length} ข้อ`);
console.log(`ค่าคละลาย: ${JSON.stringify(d.mixRule)} · คละลายด้านหลัง: ${d.backDesign ? "มี" : "ไม่มี"}`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write ถ้าโอเค)");
  process.exit(0);
}

const { error: saveErr } = await sb.from("products").update({ data: d, price: d.price }).eq("id", ID);
if (saveErr) throw saveErr;

const { data: back, error: backErr } = await sb.from("products").select("price,data").eq("id", ID).single();
if (backErr) throw backErr;
const b: any = back.data;
const gOf = (label: string) => b.options.find((o: any) => o.label === label);
const checks: [string, unknown, unknown][] = [
  ["price คอลัมน์", back.price, d.price],
  ["ไม่มีกลุ่มเรทราคา", b.priceRates === undefined, true],
  ["ช่องราคา", Object.keys(b.pricing.cells).length, Object.keys(cells).length],
  ["ขั้นจำนวน", b.pricing.tiers.length, tiers.length],
  [
    "ราคาช่องอ้างอิง (อาร์ต 300 ไม่เคลือบ · บวก markup แล้ว)",
    JSON.stringify(b.pricing.cells["กระดาษอาร์ตมัน 300 แกรม│ไม่เคลือบ"]),
    JSON.stringify(cells["กระดาษอาร์ตมัน 300 แกรม│ไม่เคลือบ"].map((v: number) => v + MARKUP)),
  ],
  ["ขนาด", gOf(SIZE)?.choices.map((c: any) => c.name).join(" | "), "4 × 6 นิ้ว | 5 × 7 นิ้ว"],
  ["ใบต่อ A3 (4x6)", gOf(SIZE)?.choices[0].piecesPerUnit, 8],
  ["ใบต่อ A3 (5x7)", gOf(SIZE)?.choices[1].piecesPerUnit, 4],
  ["แนว", gOf(ORIENT)?.choices.map((c: any) => c.name).join(" | "), "แนวนอน | แนวตั้ง"],
  ["ชนิดกระดาษ", gOf("ชนิดกระดาษ")?.choices.length, PAPERS.length],
  ["ไม่มีกลุ่มขนาดตัดเดิม", b.options.some((o: any) => DROP.has(o.label)), false],
  ["กฎ", b.rules.length, s.rules.length],
  ["ค่าคละลาย", JSON.stringify(b.mixRule), JSON.stringify(s.mixRule)],
];
for (const [what, got, want] of checks) {
  if (String(got) !== String(want)) throw new Error(`อ่านกลับไม่ตรง ${what}: ได้ ${got} คาด ${want}`);
  console.log(`✓ ${what}: ${got}`);
}
console.log(`\n✅ บันทึกแล้ว — ${ID} ใช้ตารางราคา "${RATE}" ของ ${FROM} · ขนาด 4x6/5x7 + แนวนอน/แนวตั้ง (ยังเป็นฉบับร่าง)`);
