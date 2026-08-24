/**
 * Photo card Digital (photocard-digital) — กลุ่ม "ชนิดกระดาษเนื้อพิเศษ" ยึดชุดเดียวกับ
 * กระดาษ Texture Paper (`texture-paper`) ทั้งรายการเนื้อกระดาษ และตรรกะ "เคลือบ / พิมพ์รองสีขาว"
 * (ร้านสั่ง 24 ส.ค. 69)
 *
 *   npx tsx scripts/photocard-special-papers-follow-texture.mts          # ดูก่อน (ไม่เขียน)
 *   npx tsx scripts/photocard-special-papers-follow-texture.mts --write
 *
 * อ่านของจริงจากหน้า texture-paper มาเลย (ไม่ hard-code) — แก้หน้านั้นแล้วรันซ้ำได้ ชุดจะตรงกันเสมอ:
 *   • รายการเนื้อกระดาษ = กลุ่ม "ชนิดกระดาษ" (พร้อมรูปประจำเนื้อ)
 *   • เนื้อที่เคลือบได้   = showWhen ของกลุ่ม "เคลือบ (ด้านหน้า)"
 *   • เนื้อที่รองขาวได้   = showWhen ของกลุ่ม "พิมพ์รองสีขาว"
 *
 * ⚠️ กฎ (OptionRule) ไม่สนใจว่ากลุ่มถูกซ่อนอยู่ไหม — กลุ่มเนื้อกระดาษโผล่เฉพาะเรท "กระดาษเนื้อพิเศษ"
 *    แต่ค่าที่ลูกค้าเคยเลือกยังค้างใน selections อยู่ ถ้าปล่อยไว้ เลือก Canvas แล้วสลับไปเรทอาร์ตมัน
 *    จะกลายเป็น "เคลือบไม่ได้" ทั้งที่อาร์ตมันเคลือบได้ → ใส่กฎ "หมุดกลับ" ให้เรทอื่นบังคับเนื้อเป็น
 *    เนื้อตัวแรกที่ทั้งเคลือบได้และรองขาวได้ (SeaSand) กฎเนื้อกระดาษจึงไม่มีผลข้ามเรท
 *    (วิธีเดียวกับ paper-art-pet ที่หมุดกลุ่ม "วัสดุ PET" ไว้ที่สีขาวเวลาเลือกกระดาษ)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { priceRange, type OptionRule, type Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "photocard-digital";
const SRC = "texture-paper";

const PAPER = "ชนิดกระดาษเนื้อพิเศษ"; // กลุ่มบนหน้า photocard
const SRC_PAPER = "ชนิดกระดาษ"; // กลุ่มบนหน้า texture-paper
const SRC_COAT = "เคลือบ (ด้านหน้า)";
const SRC_WHITE = "พิมพ์รองสีขาว";
const FRONT = "เคลือบ (เฉพาะด้านหน้า)";
const NO_COAT = "ไม่เคลือบ";
const BACK = "เคลือบด้านหลัง";
const NO_BACK_COAT = "ไม่เคลือบด้านหลัง";
const BASE = "พิมพ์รองพื้น (Add On)";
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

const grab = async (id: string) => {
  const { data, error } = await sb.from("products").select("data").eq("id", id).single();
  if (error || !data) throw new Error(`หาสินค้า ${id} ไม่เจอ: ${error?.message}`);
  return data.data as Product;
};
const src = await grab(SRC);
const d = await grab(ID);

const srcOpt = (label: string) => {
  const o = src.options.find((x) => x.label === label);
  if (!o) throw new Error(`[${SRC}] ไม่เจอกลุ่ม "${label}" — หน้าต้นแบบเปลี่ยนไปแล้ว ตรวจก่อน`);
  return o;
};
const opt = (label: string) => {
  const o = d.options.find((x) => x.label === label);
  if (!o) throw new Error(`[${ID}] ไม่เจอกลุ่ม "${label}"`);
  return o;
};

const PAPERS = srcOpt(SRC_PAPER).choices.map((c) => ({ name: c.name, ...(c.imageSrc ? { imageSrc: c.imageSrc } : {}) }));
const COATABLE = srcOpt(SRC_COAT).showWhen?.choices ?? [];
const WHITE_OK = srcOpt(SRC_WHITE).showWhen?.choices ?? [];
if (!COATABLE.length || !WHITE_OK.length) throw new Error(`[${SRC}] กลุ่มเคลือบ/พิมพ์รองสีขาวไม่มี showWhen — ตรวจก่อน`);
const names = PAPERS.map((p) => p.name);
for (const n of [...COATABLE, ...WHITE_OK]) if (!names.includes(n)) throw new Error(`เนื้อ "${n}" ไม่อยู่ในรายการกระดาษ`);
/** เนื้อที่ใช้ "หมุด" กลุ่มนี้ไว้เวลาอยู่เรทอื่น — ต้องทั้งเคลือบได้และรองขาวได้ กฎเลยไม่ไปกวนเรทอื่น */
const PIN = names.find((n) => COATABLE.includes(n) && WHITE_OK.includes(n));
if (!PIN) throw new Error("ไม่มีเนื้อที่ทั้งเคลือบได้และรองขาวได้ — หมุดกลุ่มไม่ได้ ตรวจก่อน");

// ── 1. รายการเนื้อกระดาษ ──────────────────────────────────────────────────
const paper = opt(PAPER);
paper.choices = PAPERS;
paper.note = "ชุดเดียวกับหน้ากระดาษ Texture Paper · บางเนื้อเคลือบไม่ได้ / พิมพ์รองสีขาวไม่ได้";

// ── 2. พิมพ์รองสีขาว: โผล่เฉพาะเนื้อที่รองขาวได้ (งาน PET ยังได้ตามเดิม) ──
const base = opt(BASE);
base.showWhenAlso = { label: PAPER, choices: WHITE_OK };

// ── 3. กฎ: เนื้อที่เคลือบไม่ได้ → ล็อกทั้งเคลือบหน้าและเคลือบหลัง ─────────
const NOT_COATABLE = names.filter((n) => !COATABLE.includes(n));
const keep = (r: OptionRule) => r.when.label !== PAPER && r.limit.label !== PAPER;
const rules: OptionRule[] = (d.rules ?? []).filter(keep);
rules.push(
  {
    when: { label: RATE, choice: RATE_ART, choices: [RATE_ART, RATE_PET] },
    limit: { label: PAPER, allow: [PIN] },
  },
  {
    when: { label: PAPER, choice: NOT_COATABLE[0], choices: NOT_COATABLE },
    limit: { label: FRONT, allow: [NO_COAT] },
  },
  {
    when: { label: PAPER, choice: NOT_COATABLE[0], choices: NOT_COATABLE },
    limit: { label: BACK, allow: [NO_BACK_COAT] },
  }
);
d.rules = rules;

// ── 4. ข้อความบนหน้าสินค้า ────────────────────────────────────────────────
const swap = (text: string, pairs: [string, string][]) => {
  let out = text;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) throw new Error(`หาข้อความเดิมไม่เจอ: "${from.slice(0, 45)}…"`);
    out = out.split(from).join(to);
  }
  return out;
};
const SHORT = "โฮโลแกรม SeaSand/Rainbow · สีเงิน/สีทอง (ผิวเงา/ผิวด้าน) · Canvas · 100 Pond · Extra White · E-Photo · STARDREAM 2 เนื้อ";

d.description = swap(d.description ?? "", [
  ["กระดาษเนื้อพิเศษ (โฮโลแกรม / Canvas / 100 Pond / Extra White)", `กระดาษเนื้อพิเศษ (${SHORT})`],
]);

const special = (d.priceRates ?? []).find((r) => r.label === RATE_SPECIAL);
if (!special) throw new Error(`ไม่เจอเรท "${RATE_SPECIAL}"`);
special.desc = `${SHORT} · ฟรี! ไดคัทมุมมน + เคลือบเงา/ด้าน (เฉพาะเนื้อที่เคลือบได้)`;

/** ชื่อเนื้อแบบสั้น (ตัดน้ำหนักกระดาษออก) — ใช้ในบรรทัดข้อความยาว ๆ ให้อ่านง่าย */
const short = (n: string) => n.replace(/\s*\(\d+\s*แกรม\)/, "");
const PAPER_TERM =
  `กระดาษเนื้อพิเศษ — เคลือบได้เฉพาะ ${COATABLE.map(short).join(" · ")} · ` +
  `พิมพ์รองสีขาวได้เฉพาะ ${WHITE_OK.map(short).join(" · ")} · ` +
  `ที่เหลือ (${names.filter((n) => !WHITE_OK.includes(n)).map(short).join(" · ")}) เคลือบไม่ได้และพิมพ์รองสีขาวไม่ได้`;
if (!d.terms?.includes("กระดาษเนื้อพิเศษ — เคลือบได้เฉพาะ")) {
  const lines = (d.terms ?? "").split("\n");
  const at = lines.findIndex((l) => l.startsWith("เคลือบเงา | ด้าน | พิเศษ"));
  lines.splice(at < 0 ? lines.length : at + 1, 0, PAPER_TERM);
  d.terms = lines.join("\n");
}

const OLD_LIST =
  "• กระดาษเนื้อโฮโลแกรม หนา 300 แกรม (ด้านหน้าโฮโลแกรม-ด้านหลังสีขาว)\n" +
  "• กระดาษเนื้อ Canvas หนา 260 แกรม\n" +
  "• กระดาษเนื้อ Extra White หนา 260 แกรม\n" +
  "• กระดาษเนื้อ 100 Pond หนา 300 แกรม";
const NEW_LIST = names
  .map((n) => `• ${n} — ${COATABLE.includes(n) ? "เคลือบได้" : "เคลือบไม่ได้"} · ${WHITE_OK.includes(n) ? "พิมพ์รองสีขาวได้" : "พิมพ์รองสีขาวไม่ได้"}`)
  .join("\n");
for (const t of d.tabs ?? []) if (t.text?.includes(OLD_LIST)) t.text = swap(t.text, [[OLD_LIST, NEW_LIST]]);

// ── สรุป + บันทึก ─────────────────────────────────────────────────────────
const range = priceRange(d);
const saved: Product = { ...d, priceMin: range.min, priceMax: range.max, savedAt: new Date().toISOString() };

console.log(`ชุดเนื้อกระดาษจาก ${SRC}: ${PAPERS.length} เนื้อ · เคลือบได้ ${COATABLE.length} · รองขาวได้ ${WHITE_OK.length} · หมุดที่ "${PIN}"`);
for (const n of names) console.log(`   - ${n}  ${COATABLE.includes(n) ? "เคลือบได้" : "เคลือบไม่ได้"} · ${WHITE_OK.includes(n) ? "รองขาวได้" : "รองขาวไม่ได้"}`);
console.log(`\n[${BASE}] แสดงเมื่อ ${base.showWhen?.label} = ${base.showWhen?.choices.join(" / ")}`);
console.log(`            และ ${base.showWhenAlso.label} = ${base.showWhenAlso.choices.length} เนื้อ`);
console.log("\nกฎเงื่อนไข:");
for (const r of saved.rules ?? [])
  console.log(`   • ${r.when.label} = ${(r.when.choices ?? [r.when.choice]).join(" / ")}\n       → ${r.limit.label} เหลือ ${r.limit.allow.join(" / ")}`);
console.log("\nterms:\n" + saved.terms);
console.log("\nช่วงราคา:", range);

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: saved }).eq("id", ID);
if (upErr) throw new Error(upErr.message);
console.log("\n✓ บันทึกแล้ว");
