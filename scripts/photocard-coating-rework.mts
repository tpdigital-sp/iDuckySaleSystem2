/**
 * Photo card Digital (photocard-digital) — ปรับ "กติกาการเคลือบ" ให้เป็นชุดเดียวกับงานกระดาษตัวอื่น
 * (ยึดโครงเดียวกับ `paper-art-pet` และ `hand-fan-paper` — ร้านสั่ง 24 ส.ค. 69)
 *
 *   npx tsx scripts/photocard-coating-rework.mts          # ดูก่อน (ไม่เขียน)
 *   npx tsx scripts/photocard-coating-rework.mts --write  # บันทึกลง Supabase
 *
 * ที่เปลี่ยน:
 *   1. กลุ่ม "เคลือบ (เฉพาะด้านที่สกรีน)" → "เคลือบ (เฉพาะด้านหน้า)"
 *      ไม่เคลือบ / เคลือบเงา / เคลือบด้าน / เคลือบพิเศษ (+30)
 *      (เดิมเป็น "เคลือบพิเศษ 1 ด้าน +30" กับ "2 ด้าน +60" และไม่มีตัวเลือก "ไม่เคลือบ")
 *   2. เลือก "พิมพ์ 2 ด้าน" → โผล่กลุ่ม "เคลือบด้านหลัง" (เงา/ด้าน ฟรี · พิเศษ +30)
 *      และ "ผิวฟิล์มพิเศษ (ด้านหลัง)" เมื่อเลือกเคลือบพิเศษด้านหลัง
 *      → เคลือบพิเศษ 2 ด้าน = 30 + 30 = 60 เท่าราคาเดิม
 *   3. เคลือบฟอยล์ทำร่วมกับลามิเนตไม่ได้ — กฎสองทาง (ต้อง "ไม่เคลือบ" ถึงเลือกฟอยล์ได้ และกลับกัน)
 *   4. "พิมพ์รองพื้น (Add On)" ถอดตัวเลือก "ไม่พิมพ์รอง" ออก แล้วเปลี่ยนเป็นกลุ่มติ๊กเลือก
 *      (ไม่ติ๊ก = ไม่พิมพ์รอง — ถ้าเป็นปุ่มเลือก 1 อย่างจะบังคับให้ทุกคนจ่าย +20 เพราะไม่มีทางไม่เลือก)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { priceRange, type OptionRule, type Product, type ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "photocard-digital";

const OLD_FRONT = "เคลือบ (เฉพาะด้านที่สกรีน)";
const FRONT = "เคลือบ (เฉพาะด้านหน้า)";
const FILM = "เคลือบ"; // กลุ่มลิงก์คลังตัวเลือกกลาง preset-2 (ผิวฟิล์มพิเศษด้านหน้า)
const BACK = "เคลือบด้านหลัง";
const BACK_FILM = "ผิวฟิล์มพิเศษ (ด้านหลัง)";
const SIDES = "พิมพ์กี่ด้าน";
const TWO_SIDES = "พิมพ์ 2 ด้าน";
const FOIL = "เคลือบฟอยล์";
const NO_FOIL = "ไม่เคลือบฟอยล์";
const FOIL_1 = "พิมพ์ 1 เลเยอร์ / 1 ด้าน";
const FOIL_2 = "พิมพ์ 2 เลเยอร์ / 1 ด้าน";
const BASE = "พิมพ์รองพื้น (Add On)";
const NO_BASE = "ไม่พิมพ์รอง";

const NO_COAT = "ไม่เคลือบ";
const SPECIAL = "เคลือบพิเศษ";
const NO_BACK_COAT = "ไม่เคลือบด้านหลัง";
const BACK_SPECIAL = "เคลือบพิเศษ (ด้านหลัง)";
/** เคลือบพิเศษคิดด้านละ 30 บาท (ตารางราคาเว็บ) · เคลือบเงา/ด้าน ฟรีทั้งสองด้านตามเรทของสินค้านี้ */
const SPECIAL_FEE = 30;

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

const find = (label: string): ProductOption => {
  const o = d.options.find((x) => x.label === label);
  if (!o) throw new Error(`ไม่เจอกลุ่ม "${label}" — ข้อมูลเปลี่ยนไปแล้ว ตรวจก่อนรันทับ`);
  return o;
};
/** แทนที่ข้อความแบบต้องเจอจริง — เจอไม่ครบให้หยุด ไม่ใช่เขียนทับเงียบ ๆ */
const swap = (text: string, from: string, to: string) => {
  if (!text.includes(from)) throw new Error(`หาข้อความเดิมไม่เจอ: "${from.slice(0, 40)}…"`);
  return text.split(from).join(to);
};

// ── 1. กลุ่มเคลือบด้านหน้า ────────────────────────────────────────────────
const front = find(d.options.some((o) => o.label === FRONT) ? FRONT : OLD_FRONT);
const oldImg = new Map(front.choices.map((c) => [c.name, c.imageSrc]));
const img = (name: string) => (oldImg.get(name) ? { imageSrc: oldImg.get(name) } : {});
front.label = FRONT;
front.note =
  "เคลือบเงา/เคลือบด้าน ฟรี (รวมในราคาแล้ว) · เคลือบพิเศษบวกเพิ่มด้านละ 30 บาท — " +
  'งานเคลือบฟอยล์ต้องเลือก "ไม่เคลือบ"';
front.choices = [
  { name: NO_COAT, ...img(NO_COAT) },
  { name: "เคลือบเงา", ...img("เคลือบเงา") },
  { name: "เคลือบด้าน", ...img("เคลือบด้าน") },
  { name: SPECIAL, extra: SPECIAL_FEE, ...img("เคลือบพิเศษ 1 ด้าน") },
];

// ── 2. กลุ่มผิวฟิล์ม (ด้านหน้า) ผูกกับ "เคลือบพิเศษ" ชื่อใหม่ ──────────────
const film = find(FILM);
film.showWhen = { label: FRONT, choices: [SPECIAL] };

// ── 3. กลุ่มเคลือบด้านหลัง + ผิวฟิล์มด้านหลัง (โผล่เมื่อพิมพ์ 2 ด้าน) ──────
const sides = find(SIDES);
if (!sides.choices.some((c) => c.name === TWO_SIDES)) throw new Error(`ไม่เจอตัวเลือก "${TWO_SIDES}"`);

const back: ProductOption = {
  label: BACK,
  showWhen: { label: SIDES, choices: [TWO_SIDES] },
  note: "เฉพาะงานพิมพ์ 2 ด้าน · เคลือบเงา/ด้าน ฟรี · เคลือบพิเศษด้านหลังบวกเพิ่ม 30 บาท",
  choices: [
    { name: NO_BACK_COAT },
    { name: "เคลือบเงา (ด้านหลัง)" },
    { name: "เคลือบด้าน (ด้านหลัง)" },
    { name: BACK_SPECIAL, extra: SPECIAL_FEE },
  ],
};
const backFilm: ProductOption = {
  label: BACK_FILM,
  showWhen: { label: BACK, choices: [BACK_SPECIAL] },
  display: film.display,
  // สำเนาชุดฟิล์มจากกลุ่มด้านหน้า (ลิงก์คลังกลางซ้ำกันไม่ได้ — presetId จะไปทับชื่อกลุ่ม)
  choices: film.choices.map((c) => ({ ...c })),
};

d.options = d.options.filter((o) => o.label !== BACK && o.label !== BACK_FILM);
d.options.splice(d.options.indexOf(film) + 1, 0, back, backFilm);

// ── 4. พิมพ์รองพื้น: ถอด "ไม่พิมพ์รอง" → กลุ่มติ๊ก (ไม่ติ๊ก = ไม่พิมพ์รอง) ──
const base = find(BASE);
base.choices = base.choices.filter((c) => c.name !== NO_BASE);
base.display = "multi";
base.note = "ไม่ต้องพิมพ์รองพื้น = ไม่ต้องติ๊ก";

// ── 5. กฎเงื่อนไข ─────────────────────────────────────────────────────────
const rules: OptionRule[] = (d.rules ?? []).filter(
  (r) => r.limit.label !== FOIL && r.limit.label !== FRONT && r.limit.label !== OLD_FRONT
);
// กฎเดิม (อาร์ตมันมีแต่พิมพ์รองสีเงิน) — ตัดชื่อตัวเลือกที่ถอดออกไปแล้ว
for (const r of rules) if (r.limit.label === BASE) r.limit.allow = r.limit.allow.filter((n) => n !== NO_BASE);
// งานฟอยล์ทำร่วมกับลามิเนตไม่ได้ — ใส่กฎทั้งสองทาง (ปลดข้างที่เลือกไว้ก่อน อีกข้างถึงปลดล็อก)
rules.push(
  {
    when: { label: FRONT, choice: SPECIAL, choices: ["เคลือบเงา", "เคลือบด้าน", SPECIAL] },
    limit: { label: FOIL, allow: [NO_FOIL] },
  },
  {
    when: { label: FOIL, choice: FOIL_1, choices: [FOIL_1, FOIL_2] },
    limit: { label: FRONT, allow: [NO_COAT] },
  }
);
d.rules = rules;

// ── 6. ข้อความบนหน้าสินค้าให้ตรงกับกติกาใหม่ ──────────────────────────────
const OLD_TERM = "เคลือบเงา | ด้าน | พิเศษ — เคลือบเฉพาะด้านที่สกรีนเท่านั้น";
const NEW_TERM =
  "เคลือบเงา | ด้าน | พิเศษ — เลือกเคลือบด้านหน้า · งานพิมพ์ 2 ด้านเลือกเคลือบด้านหลังเพิ่มได้ " +
  "(เงา/ด้าน ฟรี · เคลือบพิเศษบวกเพิ่มด้านละ 30 บาท)";
const FOIL_TERM = 'งานเคลือบฟอยล์ทำร่วมกับงานเคลือบลามิเนตไม่ได้ — ต้องเลือก "ไม่เคลือบ" ที่กลุ่มเคลือบด้านหน้าก่อน';
d.terms = swap(d.terms ?? "", OLD_TERM, NEW_TERM);
if (!d.terms.includes(FOIL_TERM)) {
  const lines = d.terms.split("\n");
  const at = lines.findIndex((l) => l.startsWith("เคลือบฟอยล์ได้เฉพาะงานกระดาษ"));
  lines.splice(at < 0 ? lines.length : at + 1, 0, FOIL_TERM);
  d.terms = lines.join("\n");
}

const OLD_TAB = "• เคลือบเงา | ด้าน | พิเศษ เคลือบเฉพาะด้านที่สกรีนเท่านั้น";
const NEW_TAB =
  "• เคลือบเงา | ด้าน | พิเศษ — เคลือบด้านหน้า · งานพิมพ์ 2 ด้านเลือกเคลือบด้านหลังเพิ่มได้ (เคลือบพิเศษด้านละ 30 บาท)\n" +
  '• งานเคลือบฟอยล์ทำร่วมกับงานเคลือบลามิเนตไม่ได้ — เลือกฟอยล์ได้เฉพาะงานที่ "ไม่เคลือบ"';
for (const t of d.tabs ?? []) if (t.text?.includes(OLD_TAB)) t.text = swap(t.text, OLD_TAB, NEW_TAB);

// ── สรุป + บันทึก ─────────────────────────────────────────────────────────
const range = priceRange(d);
const saved: Product = { ...d, priceMin: range.min, priceMax: range.max, savedAt: new Date().toISOString() };

for (const o of saved.options) {
  const cond = o.showWhen ? ` [แสดงเมื่อ ${o.showWhen.label} = ${o.showWhen.choices.join(" / ")}]` : "";
  console.log(`\n== ${o.label}${o.display ? ` (${o.display})` : ""}${cond}`);
  for (const c of o.choices) console.log("   -", c.name, c.extra ? `(+${c.extra})` : "");
}
console.log("\nกฎเงื่อนไข:");
for (const r of saved.rules ?? [])
  console.log(`   • ${r.when.label} = ${(r.when.choices ?? [r.when.choice]).join(" / ")} → ${r.limit.label} เหลือ ${r.limit.allow.join(" / ")}`);
console.log("\nterms:\n" + saved.terms);
console.log("\nช่วงราคา:", range);

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: saved }).eq("id", ID);
if (upErr) throw new Error(upErr.message);
console.log("\n✓ บันทึกแล้ว");
