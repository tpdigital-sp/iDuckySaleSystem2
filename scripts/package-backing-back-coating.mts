/**
 * กระดาษรองหลัง (package-backing) — พิมพ์ 2 ด้าน เลือกเคลือบด้านหลังเพิ่มได้
 * (ยึดโครงเดียวกับ photocard-digital ที่ร้านสั่ง 24 ส.ค. 69 — ร้านสั่งเพิ่มหน้านี้ 25 ส.ค. 69)
 *
 *   npx tsx scripts/package-backing-back-coating.mts          # ดูก่อน (ไม่เขียน)
 *   npx tsx scripts/package-backing-back-coating.mts --write  # บันทึกลง Supabase
 *
 * ที่เปลี่ยน:
 *   1. เพิ่มกลุ่ม "เคลือบด้านหลัง" โผล่เมื่อเลือก "พิมพ์ 2 ด้าน"
 *      ไม่เคลือบด้านหลัง / เคลือบเงา +10 / เคลือบด้าน +10 / เคลือบพิเศษ +30 (เรทเดียวกับด้านหน้า)
 *   2. เลือกเคลือบพิเศษด้านหลัง → โผล่ "ผิวฟิล์มพิเศษ (ด้านหลัง)" (สำเนาชุดฟิล์มจากกลุ่มหน้า)
 *   3. ปรับข้อความ terms + แท็บ ให้บอกว่าเคลือบคิดราคาต่อด้าน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { priceRange, type Product, type ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "package-backing";

const FRONT = "เคลือบ (เฉพาะด้านหน้า)";
const FILM = "เคลือบ"; // กลุ่มลิงก์คลังตัวเลือกกลาง preset-2 (ผิวฟิล์มพิเศษด้านหน้า)
const BACK = "เคลือบด้านหลัง";
const BACK_FILM = "ผิวฟิล์มพิเศษ (ด้านหลัง)";
const SIDES = "จำนวนด้านที่พิมพ์";
const TWO_SIDES = "พิมพ์ 2 ด้าน";
const NO_BACK_COAT = "ไม่เคลือบด้านหลัง";
const BACK_SPECIAL = "เคลือบพิเศษ (ด้านหลัง)";

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

// ── 1. กลุ่มเคลือบด้านหลัง + ผิวฟิล์มด้านหลัง (โผล่เมื่อพิมพ์ 2 ด้าน) ──────
find(FRONT);
const film = find(FILM);
const sides = find(SIDES);
if (!sides.choices.some((c) => c.name === TWO_SIDES)) throw new Error(`ไม่เจอตัวเลือก "${TWO_SIDES}"`);

const back: ProductOption = {
  label: BACK,
  showWhen: { label: SIDES, choices: [TWO_SIDES] },
  note: "เฉพาะงานพิมพ์ 2 ด้าน · เคลือบเงา/ด้าน +10 บาท/แผ่น A3 · เคลือบพิเศษ +30 บาท/แผ่น A3",
  choices: [
    { name: NO_BACK_COAT },
    { name: "เคลือบเงา (ด้านหลัง)", extra: 10 },
    { name: "เคลือบด้าน (ด้านหลัง)", extra: 10 },
    { name: BACK_SPECIAL, extra: 30 },
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
d.options.splice(d.options.indexOf(sides) + 1, 0, back, backFilm);

// ── 2. ข้อความบนหน้าสินค้าให้ตรงกับกติกาใหม่ ──────────────────────────────
const OLD_TERM = "• เคลือบเงา / ด้าน / พิเศษ เคลือบเฉพาะด้านที่สกรีนเท่านั้น";
const NEW_TERM =
  "• เคลือบเงา / ด้าน / พิเศษ — เลือกเคลือบด้านหน้า · งานพิมพ์ 2 ด้านเลือกเคลือบด้านหลังเพิ่มได้ " +
  "(คิดราคาต่อด้าน: เงา/ด้าน +10 · พิเศษ +30 บาท/แผ่น A3)";
d.terms = swap(d.terms ?? "", OLD_TERM, NEW_TERM);
for (const t of d.tabs ?? []) if (t.text?.includes(OLD_TERM)) t.text = swap(t.text, OLD_TERM, NEW_TERM);

const OLD_PRICE_TAB =
  "• เคลือบเงา / เคลือบด้าน บวกเพิ่ม 10 บาท/แผ่น A3\n• เคลือบพิเศษ (กลิตเตอร์ / โฮโลแกรม) บวกเพิ่ม 30 บาท/แผ่น A3";
const NEW_PRICE_TAB =
  "• เคลือบเงา / เคลือบด้าน บวกเพิ่ม 10 บาท/แผ่น A3 (ต่อด้าน)\n" +
  "• เคลือบพิเศษ (กลิตเตอร์ / โฮโลแกรม) บวกเพิ่ม 30 บาท/แผ่น A3 (ต่อด้าน)\n" +
  "• งานพิมพ์ 2 ด้าน เลือกเคลือบด้านหลังเพิ่มได้ (เรทเดียวกับด้านหน้า)";
for (const t of d.tabs ?? []) if (t.text?.includes(OLD_PRICE_TAB)) t.text = swap(t.text, OLD_PRICE_TAB, NEW_PRICE_TAB);

// ── สรุป + บันทึก ─────────────────────────────────────────────────────────
// สินค้านี้ไม่มีตารางราคา — ต้องล้าง priceMin/priceMax เดิมก่อน ไม่งั้น priceRange คืนค่าที่ค้างไว้
const range = priceRange({ ...d, priceMin: undefined, priceMax: undefined });
const saved: Product = { ...d, priceMin: range.min, priceMax: range.max, savedAt: new Date().toISOString() };

for (const o of saved.options) {
  const cond = o.showWhen ? ` [แสดงเมื่อ ${o.showWhen.label} = ${o.showWhen.choices.join(" / ")}]` : "";
  console.log(`\n== ${o.label}${o.display ? ` (${o.display})` : ""}${cond}`);
  for (const c of o.choices) console.log("   -", c.name, c.extra ? `(+${c.extra})` : "");
}
console.log("\nterms:\n" + saved.terms);
console.log("\nช่วงราคา:", range);

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: saved }).eq("id", ID);
if (upErr) throw new Error(upErr.message);
console.log("\n✓ บันทึกแล้ว");
