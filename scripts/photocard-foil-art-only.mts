/**
 * Photo card Digital (photocard-digital) — เคลือบฟอยล์ได้เฉพาะ "กระดาษอาร์ตมัน 300 แกรม"
 * กระดาษเนื้อพิเศษเคลือบฟอยล์ไม่ได้ (ร้านยืนยัน 24 ส.ค. 69 — ตรงกับหน้ากระดาษ Texture Paper)
 *
 *   npx tsx scripts/photocard-foil-art-only.mts          # ดูก่อน (ไม่เขียน)
 *   npx tsx scripts/photocard-foil-art-only.mts --write
 *
 * ทำ 2 ชั้นกันพลาด:
 *   1. กลุ่ม "เคลือบฟอยล์" showWhen เหลือเรทอาร์ตมันเรทเดียว (เนื้อพิเศษ/PET ไม่ต้องถาม)
 *   2. กฎหมุดค่ากลับเป็น "ไม่เคลือบฟอยล์" เมื่ออยู่เรทเนื้อพิเศษ/PET — กลุ่มที่ถูกซ่อนยังเก็บค่าเดิมไว้
 *      ถ้าลูกค้าเลือกฟอยล์ไว้ตอนอยู่เรทอาร์ตมันแล้วสลับเรท ค่าจะค้าง (กลุ่ม "สีฟอยล์" โผล่ + คิดเงินเพิ่ม)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { priceRange, type OptionRule, type Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "photocard-digital";
const FOIL = "เคลือบฟอยล์";
const NO_FOIL = "ไม่เคลือบฟอยล์";
const RATE = "เรทราคา";
const RATE_ART = "กระดาษอาร์ตมัน 300 แกรม";
const RATE_SPECIAL = "กระดาษเนื้อพิเศษ";
const RATE_PET = "พลาสติก PET 250 ไมครอน";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error || !row) throw new Error(`หาสินค้า ${ID} ไม่เจอ: ${error?.message}`);
const d = row.data as Product;

const foil = d.options.find((o) => o.label === FOIL);
if (!foil) throw new Error(`ไม่เจอกลุ่ม "${FOIL}"`);
if (!foil.choices.some((c) => c.name === NO_FOIL)) throw new Error(`ไม่เจอตัวเลือก "${NO_FOIL}"`);

foil.showWhen = { label: RATE, choices: [RATE_ART] };
foil.note = "ทำได้เฉพาะกระดาษอาร์ตมัน 300 แกรม · กระดาษเนื้อพิเศษและ PET เคลือบฟอยล์ไม่ได้";

const rules: OptionRule[] = (d.rules ?? []).filter((r) => !(r.when.label === RATE && r.limit.label === FOIL));
rules.push({
  when: { label: RATE, choice: RATE_SPECIAL, choices: [RATE_SPECIAL, RATE_PET] },
  limit: { label: FOIL, allow: [NO_FOIL] },
});
d.rules = rules;

const swap = (text: string, pairs: [string, string][]) => {
  let out = text;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) throw new Error(`หาข้อความเดิมไม่เจอ: "${from.slice(0, 45)}…"`);
    out = out.split(from).join(to);
  }
  return out;
};

d.terms = swap(d.terms ?? "", [
  [
    "เคลือบฟอยล์ได้เฉพาะงานกระดาษ · สีฟอยล์:",
    "เคลือบฟอยล์ได้เฉพาะกระดาษอาร์ตมัน 300 แกรม — กระดาษเนื้อพิเศษและ PET เคลือบฟอยล์ไม่ได้ · สีฟอยล์:",
  ],
]);
d.highlights = (d.highlights ?? []).map((h) =>
  h === "เคลือบฟอยล์ได้ 4 สี — เงิน ทอง โรสโกลด์ โฮโลแกรม (เฉพาะงานกระดาษ)"
    ? "เคลือบฟอยล์ได้ 4 สี — เงิน ทอง โรสโกลด์ โฮโลแกรม (เฉพาะกระดาษอาร์ตมัน 300 แกรม)"
    : h
);
const special = (d.priceRates ?? []).find((r) => r.label === RATE_SPECIAL);
if (!special) throw new Error(`ไม่เจอเรท "${RATE_SPECIAL}"`);
if (!special.desc?.includes("เคลือบฟอยล์ไม่ได้")) special.desc = `${special.desc} · เคลือบฟอยล์ไม่ได้`;
for (const t of d.tabs ?? [])
  if (t.text?.includes("ขั้นตอนการเคลือบฟอยล์::"))
    t.text = swap(t.text, [["ขั้นตอนการเคลือบฟอยล์::", "ขั้นตอนการเคลือบฟอยล์ (เฉพาะกระดาษอาร์ตมัน 300 แกรม)::"]]);

const range = priceRange(d);
const saved: Product = { ...d, priceMin: range.min, priceMax: range.max, savedAt: new Date().toISOString() };

console.log(`[${FOIL}] แสดงเมื่อ ${foil.showWhen.label} = ${foil.showWhen.choices.join(" / ")}`);
console.log("\nกฎเงื่อนไข:");
for (const r of saved.rules ?? [])
  console.log(`   • ${r.when.label} = ${(r.when.choices ?? [r.when.choice]).join(" / ")}\n       → ${r.limit.label} เหลือ ${r.limit.allow.join(" / ")}`);
console.log("\nเรทเนื้อพิเศษ:", special.desc);
console.log("จุดเด่น:", saved.highlights?.find((h) => h.includes("ฟอยล์")));
console.log("ข้อควรทราบ:", saved.terms?.split("\n").find((l) => l.startsWith("เคลือบฟอยล์ได้")));
console.log("\nช่วงราคา:", range);

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: saved }).eq("id", ID);
if (upErr) throw new Error(upErr.message);
console.log("\n✓ บันทึกแล้ว");
