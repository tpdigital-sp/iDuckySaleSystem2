/**
 * Photo card Digital (photocard-digital) — งาน PET 250 ไมครอน: ไม่มีพิมพ์รองสีขาว และเคลือบไม่ได้
 * (ร้านสั่ง 24 ส.ค. 69 — เข้าชุดกับ paper-art-pet ที่ล็อก PET ไว้ที่ "ไม่เคลือบ")
 *
 *   npx tsx scripts/photocard-pet-no-coating.mts          # ดูก่อน (ไม่เขียน)
 *   npx tsx scripts/photocard-pet-no-coating.mts --write
 *
 *   1. กลุ่ม "พิมพ์รองพื้น (Add On)" เหลือเฉพาะเรทกระดาษเนื้อพิเศษ (ถอด PET ออกจาก showWhen)
 *   2. เรท PET → ล็อก "เคลือบ (เฉพาะด้านหน้า)" = ไม่เคลือบ และ "เคลือบด้านหลัง" = ไม่เคลือบด้านหลัง
 *      (กฎอิงกลุ่ม "เรทราคา" ซึ่งมีค่าเสมอ จึงไม่มีปัญหาค่าค้างข้ามเรทแบบกลุ่มที่ถูกซ่อน)
 *   กลุ่มที่ถูกซ่อนไม่คิดเงินอยู่แล้ว (unitPriceFor ข้าม optionActive = false) จึงไม่ต้องหมุดค่ากลุ่มติ๊ก
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { priceRange, type OptionRule, type Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "photocard-digital";
const BASE = "พิมพ์รองพื้น (Add On)";
const FRONT = "เคลือบ (เฉพาะด้านหน้า)";
const NO_COAT = "ไม่เคลือบ";
const BACK = "เคลือบด้านหลัง";
const NO_BACK_COAT = "ไม่เคลือบด้านหลัง";
const RATE = "เรทราคา";
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
const opt = (label: string) => {
  const o = d.options.find((x) => x.label === label);
  if (!o) throw new Error(`ไม่เจอกลุ่ม "${label}"`);
  return o;
};

// ── 1. พิมพ์รองสีขาว: เหลือเฉพาะเรทกระดาษเนื้อพิเศษ ──────────────────────
const base = opt(BASE);
base.showWhen = { label: RATE, choices: [RATE_SPECIAL] };
base.note = "มีเฉพาะกระดาษเนื้อพิเศษ เนื้อโฮโลแกรม/สีเงิน/สีทอง · ไม่ต้องพิมพ์รองพื้น = ไม่ต้องติ๊ก";

// ── 2. เรท PET เคลือบไม่ได้ทั้งสองด้าน ────────────────────────────────────
const petLocks: OptionRule[] = [
  { when: { label: RATE, choice: RATE_PET, choices: [RATE_PET] }, limit: { label: FRONT, allow: [NO_COAT] } },
  { when: { label: RATE, choice: RATE_PET, choices: [RATE_PET] }, limit: { label: BACK, allow: [NO_BACK_COAT] } },
];
const isPetLock = (r: OptionRule) =>
  r.when.label === RATE && (r.when.choices ?? [r.when.choice]).includes(RATE_PET) && (r.limit.label === FRONT || r.limit.label === BACK);
d.rules = [...(d.rules ?? []).filter((r) => !isPetLock(r)), ...petLocks];

// ── 3. ข้อความ ────────────────────────────────────────────────────────────
const swap = (text: string, pairs: [string, string][]) => {
  let out = text;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) throw new Error(`หาข้อความเดิมไม่เจอ: "${from.slice(0, 45)}…"`);
    out = out.split(from).join(to);
  }
  return out;
};

const pet = (d.priceRates ?? []).find((r) => r.label === RATE_PET);
if (!pet) throw new Error(`ไม่เจอเรท "${RATE_PET}"`);
pet.desc = "โดนน้ำได้ ไม่ฉีกขาด · เลือกสีขาว/สีใส · ฟรี! ไดคัทมุมมน (เคลือบ / เคลือบฟอยล์ / พิมพ์รองสีขาว ไม่ได้)";

const PET_TERM = "งาน PET 250 ไมครอน — เคลือบลามิเนต · เคลือบฟอยล์ · พิมพ์รองสีขาว ทำไม่ได้ทั้งหมด";
if (!d.terms?.includes("งาน PET 250 ไมครอน —")) {
  const lines = (d.terms ?? "").split("\n");
  const at = lines.findIndex((l) => l.startsWith("กระดาษเนื้อพิเศษ — เคลือบได้เฉพาะ"));
  lines.splice(at < 0 ? lines.length : at + 1, 0, PET_TERM);
  d.terms = lines.join("\n");
}
d.highlights = (d.highlights ?? []).map((h) =>
  h === "ฟรี! ไดคัทมุมมน + เคลือบเงา/ด้าน (หน้า-หลัง)" ? "ฟรี! ไดคัทมุมมน + เคลือบเงา/ด้าน (หน้า-หลัง) — งานกระดาษ" : h
);
for (const t of d.tabs ?? [])
  if (t.text?.includes("• พิมพ์รองสีขาว บวกเพิ่ม 20 บาท/แผ่น (เฉพาะกระดาษเนื้อพิเศษ / PET)"))
    t.text = swap(t.text, [
      [
        "• พิมพ์รองสีขาว บวกเพิ่ม 20 บาท/แผ่น (เฉพาะกระดาษเนื้อพิเศษ / PET)",
        "• พิมพ์รองสีขาว บวกเพิ่ม 20 บาท/แผ่น (เฉพาะกระดาษเนื้อพิเศษ เนื้อโฮโลแกรม/สีเงิน/สีทอง — งาน PET ไม่มี)",
      ],
    ]);

const range = priceRange(d);
const saved: Product = { ...d, priceMin: range.min, priceMax: range.max, savedAt: new Date().toISOString() };

console.log(`[${BASE}] แสดงเมื่อ ${base.showWhen.label} = ${base.showWhen.choices.join(" / ")}`);
console.log(`            และ ${base.showWhenAlso?.label} = ${base.showWhenAlso?.choices.length} เนื้อ`);
console.log("\nกฎเงื่อนไข:");
for (const r of saved.rules ?? [])
  console.log(`   • ${r.when.label} = ${(r.when.choices ?? [r.when.choice]).join(" / ")}\n       → ${r.limit.label} เหลือ ${r.limit.allow.join(" / ")}`);
console.log("\nเรท PET:", pet.desc);
console.log("\nterms:\n" + saved.terms);

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: saved }).eq("id", ID);
if (upErr) throw new Error(upErr.message);
console.log("\n✓ บันทึกแล้ว");
