#!/usr/bin/env npx tsx
/**
 * POSTCARD / โปสการ์ด (postcard-th) — เอากระดาษพิเศษ 7 ชนิดกลับเข้าตารางราคาชุดใหม่
 *
 *   npx tsx scripts/postcard-special-papers.mts           # ดูผลก่อน (ไม่เขียน)
 *   npx tsx scripts/postcard-special-papers.mts --write   # เขียนสินค้า
 *
 * ผู้ใช้สั่ง (31 ส.ค. 69): "มีกระดาษพิเศษ ด้วย" — หลังยกตารางราคาของ paper-art-pet มาแทนของเดิม
 * (scripts/postcard-price-from-paper-art.mts) กระดาษพิเศษของโปสการ์ดหายไป ต้องเติมกลับ
 *
 * ราคาที่ใช้: ตารางเดิมของโปสการ์ดตั้งราคากระดาษพิเศษ **ทุกชนิดเท่ากัน และเท่ากับแถว
 * "กระดาษอาร์ตมัน 300 แกรม" ของตารางใหม่เป๊ะ ๆ** (ไม่เคลือบ 80→35 · เงา/ด้าน 90→45 · พิเศษ 110→80)
 * สคริปต์จึงก๊อปแถว 300 แกรมของตารางปัจจุบันมาใช้ แล้ว assert ว่าตรงกับตารางเก่าที่สำรองไว้
 * → ราคาต้นทางขยับเมื่อไหร่ กระดาษพิเศษขยับตาม ไม่ต้องแก้เลขในสคริปต์
 *
 * กติกาที่มากับกระดาษพิเศษ (จากตารางเดิม): Canvas / Stardream Crystal / Stardream / Extra
 * **เคลือบไม่ได้** — ใส่ OptionRule ล็อกเหลือ "ไม่เคลือบ" · อีก 3 ชนิด (อาร์ตเกาหลี / 100 Pound /
 * E-Photo) เคลือบได้ตามปกติ
 *
 * ⚠️ เคลือบโฮโลแกรมของตารางเดิม (Dot / Crack Glass / Rainbow) ไม่ได้ย้ายมาเป็นตัวเลือกเคลือบ —
 *    ชุดใหม่ใช้ "เคลือบพิเศษ" (ราคาเท่ากันเป๊ะ 110→80) แล้วเลือกลายฟิล์มในกลุ่มถัดไป
 *    ลายที่มีอยู่ครอบ Dot (hologram-จุด) และ Rainbow (hologram-รุ้ง) แล้ว · Crack Glass ยังไม่มีในคลังฟิล์ม
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "postcard-th";
const BACKUP = ".cache/backup-postcard-th-2026-08-31.json";
const PAPER_GROUP = "ชนิดกระดาษ";
const COAT = "เคลือบ (เฉพาะด้านหน้า)";
const REF = "กระดาษอาร์ตมัน 300 แกรม"; // แถวอ้างอิงราคา
/** กระดาษพิเศษของโปสการ์ด + เคลือบได้ไหม (ตามกฎในตารางเดิม) */
const SPECIAL: [name: string, coatable: boolean, desc: string][] = [
  ["กระดาษอาร์ตเกาหลี 300 แกรม", true, "ผิวเรียบเนียน สีสดคมชัด"],
  ["100 Pound Paper 300 แกรม", true, "เนื้อหนาแน่น จับแล้วแข็งแรง"],
  ["E-Photo Paper 290 แกรม", true, "ผิวกึ่งมัน ให้ภาพคมเหมือนรูปถ่าย"],
  ["Canvas Paper 260 แกรม", false, "ผิวลายผ้าใบ อารมณ์งานภาพวาด · เคลือบไม่ได้"],
  ["Stardream Paper 285 แกรม", false, "ผิวมุกประกายวิบวับ · เคลือบไม่ได้"],
  ["Stardream Crystal Paper 285 แกรม", false, "ผิวมุกโทนใส ประกายละเอียด · เคลือบไม่ได้"],
  ["Extra Paper 260 แกรม", false, "ผิวสากธรรมชาติ อารมณ์งานคราฟต์ · เคลือบไม่ได้"],
];

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
const cells: Record<string, number[]> = d.pricing.cells;

const paperGroup = (d.options ?? []).find((o: any) => o.label === PAPER_GROUP);
const coatGroup = (d.options ?? []).find((o: any) => o.label === COAT);
if (!paperGroup || !coatGroup) throw new Error("ไม่เจอกลุ่มชนิดกระดาษ/เคลือบ — โครงตัวเลือกเปลี่ยน มาดูเองก่อน");
const COATS: string[] = coatGroup.choices.map((c: any) => c.name);

// ── ราคาอ้างอิง: แถวอาร์ตมัน 300 แกรม ของตารางปัจจุบัน ─────────────────────
const refRow: Record<string, number[]> = {};
for (const coat of COATS) {
  const v = cells[`${REF}│${coat}`];
  if (!v) throw new Error(`ตารางปัจจุบันไม่มีช่อง "${REF}│${coat}" — โครงราคาเปลี่ยน มาดูเองก่อน`);
  refRow[coat] = v;
}
// เทียบกับตารางเดิมของโปสการ์ดที่สำรองไว้ (โฮโลแกรม = เคลือบพิเศษ)
const old = JSON.parse(readFileSync(BACKUP, "utf8"));
const oldCells: Record<string, number[]> = old.pricing.cells;
const OLD_MAP: Record<string, string> = {
  ไม่เคลือบ: "ไม่เคลือบ",
  เคลือบเงา: "เคลือบเงา",
  เคลือบด้าน: "เคลือบด้าน",
  เคลือบพิเศษ: "Rainbow Hologram",
};
console.log("🧮 เทียบราคากระดาษพิเศษ (ตารางเดิมของโปสการ์ด vs แถวอ้างอิง 300 แกรมของตารางใหม่):");
for (const [coat, oldCoat] of Object.entries(OLD_MAP)) {
  const oldV = oldCells[`Canvas Paper 260 แกรม│${oldCoat}`];
  const newV = refRow[coat];
  const same = JSON.stringify(oldV) === JSON.stringify(newV);
  console.log(`   ${same ? "✓" : "✗"} ${coat.padEnd(12)} เดิม(${oldCoat}) ${JSON.stringify(oldV)} · ใหม่ ${JSON.stringify(newV)}`);
  if (!same) throw new Error(`ราคา ${coat} ไม่ตรงกับตารางเดิม — ต้องตัดสินใจเองว่าจะใช้ชุดไหน หยุดก่อนเขียน`);
}

// ── เติมกระดาษพิเศษเข้ากลุ่ม + ตารางราคา ───────────────────────────────────
const existing = new Set(paperGroup.choices.map((c: any) => c.name));
const added: string[] = [];
const petIdx = paperGroup.choices.findIndex((c: any) => /PET/.test(c.name));
const insertAt = petIdx >= 0 ? petIdx : paperGroup.choices.length; // แทรกก่อน PET ให้กระดาษอยู่ด้วยกัน
const fresh = SPECIAL.filter(([name]) => !existing.has(name)).map(([name, , desc]) => ({ name, desc }));
paperGroup.choices.splice(insertAt, 0, ...fresh);
for (const [name] of SPECIAL) {
  if (!existing.has(name)) added.push(name);
  for (const coat of COATS) cells[`${name}│${coat}`] = [...refRow[coat]];
}

// ── กฎ: กระดาษที่เคลือบไม่ได้ → ล็อกกลุ่มเคลือบเหลือ "ไม่เคลือบ" ──────────
const NO_COAT = SPECIAL.filter(([, coatable]) => !coatable).map(([name]) => name);
const NONE = COATS.find((c) => /^ไม่เคลือบ/.test(c));
if (!NONE) throw new Error("ไม่เจอตัวเลือก 'ไม่เคลือบ' ในกลุ่มเคลือบ — มาดูเองก่อน");
d.rules = (d.rules ?? []).filter((r: any) => !(r.limit.label === COAT && NO_COAT.includes(r.when.choice)));
d.rules.push({ when: { label: PAPER_GROUP, choice: NO_COAT[0], choices: NO_COAT }, limit: { label: COAT, allow: [NONE] } });
// กฎเดิม "กระดาษที่ไม่ใช่ PET → วัสดุ PET เหลือสีขาว" ต้องรวมกระดาษพิเศษด้วย (กลุ่มถูกซ่อนอยู่แล้ว แต่ให้ครบ)
for (const r of d.rules)
  if (r.when.label === PAPER_GROUP && r.limit.label === "วัสดุ PET")
    r.when.choices = [...new Set([...(r.when.choices ?? [r.when.choice]), ...SPECIAL.map(([n]) => n)])];

// ── ราคากระจก + ข้อความ ─────────────────────────────────────────────────────
const all = Object.values(cells).flat();
d.price = Math.min(...all);
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);
const PAPER_N = paperGroup.choices.length;
d.description =
  `โปสการ์ดพิมพ์ระบบ Digital Printing เลือกกระดาษได้ ${PAPER_N} ชนิด — อาร์ตมันนำเข้าจากเกาหลี 130-400 แกรม · ` +
  "กระดาษผิวพิเศษ (อาร์ตเกาหลี · 100 Pound · E-Photo · Canvas · Stardream · Extra) · หรือแผ่นพลาสติก PET 250 แกรม (ขาว/ใส) " +
  "เลือกขนาด 4 × 6 นิ้ว หรือ 5 × 7 นิ้ว ได้ทั้งแนวนอนและแนวตั้ง พร้อมเคลือบเงา / ด้าน / เคลือบพิเศษ " +
  "· คิดราคาเป็นแผ่น A3 แบบขั้นบันได ยิ่งสั่งมากยิ่งถูก (กระดาษผิวพิเศษบางชนิดเคลือบไม่ได้ ระบบล็อกให้อัตโนมัติ)";
d.highlights = [
  "ขนาด 4 × 6 นิ้ว (8 ใบ/แผ่น A3) และ 5 × 7 นิ้ว (4 ใบ/แผ่น A3)",
  "เลือกได้ทั้งแนวนอนและแนวตั้ง ราคาเท่ากัน",
  `กระดาษให้เลือก ${PAPER_N} ชนิด — อาร์ตมัน · ผิวพิเศษ 7 แบบ · PET กันน้ำ`,
  "เคลือบเงา ด้าน หรือเคลือบพิเศษ (กลิตเตอร์ ทราย โฮโลแกรม 10 ลาย)",
];
d.seo = {
  ...d.seo,
  description:
    `รับพิมพ์โปสการ์ดลายตามสั่ง ขนาด 4 × 6 นิ้ว และ 5 × 7 นิ้ว แนวนอน/แนวตั้ง เลือกกระดาษ ${PAPER_N} ชนิด ` +
    `รวมกระดาษผิวพิเศษ Canvas / Stardream / E-Photo เคลือบเงา/ด้าน/พิเศษ คิดราคาเป็นแผ่น A3 เริ่มแผ่นละ ${d.priceMin} บาท`,
};

console.log(`\nกระดาษที่เพิ่ม (${added.length}): ${added.join(" · ") || "(ไม่มี — มีอยู่แล้ว)"}`);
console.log(`ชนิดกระดาษทั้งหมด ${PAPER_N} ชนิด · ช่องราคา ${Object.keys(cells).length} ช่อง`);
console.log(`เคลือบไม่ได้ ${NO_COAT.length} ชนิด: ${NO_COAT.join(" · ")}`);
console.log(`ราคา ${d.priceMin} – ${d.priceMax} ต่อ ${d.pricing.unit} · กฎ ${d.rules.length} ข้อ`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write ถ้าโอเค)");
  process.exit(0);
}

const { error: saveErr } = await sb.from("products").update({ data: d, price: d.price }).eq("id", ID);
if (saveErr) throw saveErr;

const { data: back, error: backErr } = await sb.from("products").select("price,data").eq("id", ID).single();
if (backErr) throw backErr;
const b: any = back.data;
const bPapers = b.options.find((o: any) => o.label === PAPER_GROUP).choices.map((c: any) => c.name);
const checks: [string, unknown, unknown][] = [
  ["price คอลัมน์", back.price, d.price],
  ["จำนวนชนิดกระดาษ", bPapers.length, PAPER_N],
  ["มีกระดาษพิเศษครบ", SPECIAL.every(([n]) => bPapers.includes(n)), true],
  ["ช่องราคา", Object.keys(b.pricing.cells).length, Object.keys(cells).length],
  ["ราคา Canvas ไม่เคลือบ", JSON.stringify(b.pricing.cells[`Canvas Paper 260 แกรม│${NONE}`]), JSON.stringify(refRow[NONE])],
  ["ราคา E-Photo เคลือบพิเศษ", JSON.stringify(b.pricing.cells["E-Photo Paper 290 แกรม│เคลือบพิเศษ"]), JSON.stringify(refRow["เคลือบพิเศษ"])],
  [
    "กฎล็อกเคลือบ",
    b.rules.filter((r: any) => r.limit.label === COAT && (r.when.choices ?? []).includes("Canvas Paper 260 แกรม")).length,
    1,
  ],
];
for (const [what, got, want] of checks) {
  if (String(got) !== String(want)) throw new Error(`อ่านกลับไม่ตรง ${what}: ได้ ${got} คาด ${want}`);
  console.log(`✓ ${what}: ${got}`);
}
console.log("\n✅ บันทึกแล้ว — โปสการ์ดมีกระดาษพิเศษ 7 ชนิดกลับมาครบ ราคาเท่าแถวอาร์ตมัน 300 แกรม");
