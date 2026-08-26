/**
 * การ์ดสเปรย์แอลกอฮอล์ (new-mt2s1we8-1325) — เรท 20 ml: เคลือบสติ๊กเกอร์แยกหน้า/หลัง
 *
 * ผู้ใช้สั่ง 26 ส.ค. 69: "ถ้าสติ๊กเกอร์ 2 ด้าน ก็จะมีตัวเลือกเคลือบสติ๊กเกอร์ ด้านหลังด้วย"
 * และยืนยันว่า **ด้านหลังคิดเพิ่มเท่าด้านหน้า** (เงา/ด้าน +฿1 · พิเศษ +฿3 ต่อชิ้น)
 *   → แปะ 2 ด้าน เคลือบพิเศษทั้งคู่ = +฿6/ชิ้น
 *
 *   • "เคลือบสติ๊กเกอร์" เดิม → เปลี่ยนชื่อเป็น "เคลือบสติ๊กเกอร์ (ด้านหน้า)" (ราคาเท่าเดิม)
 *     พร้อมกลุ่มลูก "ผิวเคลือบ (ด้านหน้า)" / "ลายฟิล์มเคลือบพิเศษ (ด้านหน้า)"
 *   • เพิ่ม "เคลือบสติ๊กเกอร์ (ด้านหลัง)" แบบสวิตช์เปิด-ปิด (collapsible · ตัวแรก 0฿)
 *     โชว์เมื่อเลือก "สติ๊กเกอร์ 2 ด้าน" เท่านั้น + กลุ่มลูกผิวเคลือบ/ลายฟิล์มของด้านหลัง
 *   (แบบเดียวกับป้ายแขวนประตู — ดู scripts/door-hanger-rework.mjs ข้อ 6-8)
 *
 * รันซ้ำได้ — node scripts/spray-card-back-coating.mjs [--dry]
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ID = "new-mt2s1we8-1325";
const RATE_20 = "20 ml · สติ๊กเกอร์แปะบนการ์ด (Digital)";
const SIDES = "จำนวนด้านที่แปะสติ๊กเกอร์";
const TWO_SIDES = "สติ๊กเกอร์ 2 ด้าน";
const COAT_F = "เคลือบสติ๊กเกอร์ (ด้านหน้า)";
const COAT_B = "เคลือบสติ๊กเกอร์ (ด้านหลัง)";
const SKIN_F = "ผิวเคลือบ (ด้านหน้า)";
const SKIN_B = "ผิวเคลือบ (ด้านหลัง)";
const FILM_F = "ลายฟิล์มเคลือบพิเศษ (ด้านหน้า)";
const FILM_B = "ลายฟิล์มเคลือบพิเศษ (ด้านหลัง)";
const GLOSS = "เคลือบเงา / ด้าน";
const SPECIAL = "เคลือบพิเศษ";
const DRY = process.argv.includes("--dry");

const die = (m) => {
  console.error("⛔", m);
  process.exit(1);
};
const groupOf = (d, label) => (d.options ?? []).find((o) => o.label === label);

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const d = row.data;

/* ── 1) กลุ่มเดิม → ติดป้าย (ด้านหน้า) ────────────────────────────────────── */
const coatF = groupOf(d, "เคลือบสติ๊กเกอร์") ?? groupOf(d, COAT_F);
if (!coatF) die('ไม่พบกลุ่มเคลือบสติ๊กเกอร์ — DB เปลี่ยนไปจากที่สคริปต์คาด ตรวจก่อน');
const sides = groupOf(d, SIDES);
if (!sides) die(`ไม่พบกลุ่ม "${SIDES}"`);
if (!sides.choices.some((c) => c.name === TWO_SIDES)) die(`ไม่พบตัวเลือก "${TWO_SIDES}"`);

const skinF = groupOf(d, "ผิวเคลือบ") ?? groupOf(d, SKIN_F);
const filmF = groupOf(d, "ลายฟิล์มเคลือบพิเศษ") ?? groupOf(d, FILM_F);
if (!skinF || !filmF) die("ไม่พบกลุ่มลูกผิวเคลือบ/ลายฟิล์มของด้านหน้า");

coatF.label = COAT_F;
coatF.note = "ค่าเคลือบคิดต่อชิ้น แยกด้านหน้า-ด้านหลัง — แปะ 2 ด้านแล้วอยากเคลือบทั้งคู่ เลือกด้านหลังเพิ่มด้านล่าง";
skinF.label = SKIN_F;
skinF.showWhen = { label: COAT_F, choices: [GLOSS] };
filmF.label = FILM_F;
filmF.showWhen = { label: COAT_F, choices: [SPECIAL] };

// รูป/คำอธิบายของด้านหลัง ยืมจากการ์ดด้านหน้าชุดเดิม (สวอตช์กลาง preset-coating)
const fOf = (name) => coatF.choices.find((c) => c.name === name) ?? die(`ไม่พบตัวเลือก "${name}" ในกลุ่มเคลือบ`);

/* ── 2) กลุ่มเคลือบด้านหลัง (ใหม่) — โชว์เฉพาะตอนแปะ 2 ด้าน ───────────────── */
const onlyTwoSides = [
  { label: SIDES, choices: [TWO_SIDES] },
  { label: "เรทราคา", choices: [RATE_20] }, // กันค่าค้างตอนสลับไปเรท 40 ml (กลุ่มที่ซ่อนยังเก็บค่าเดิมไว้)
];
const coatBack = {
  label: COAT_B,
  display: "cards",
  collapsible: true, // ⚠️ ตัวเลือกแรกต้อง 0฿ — ปิดสวิตช์แล้วระบบเด้งกลับตัวแรก
  note: "ราคาเท่าด้านหน้า — เงา/ด้าน +฿1 · พิเศษ +฿3 ต่อชิ้น (เคลือบพิเศษทั้งสองด้าน = +฿6/ชิ้น)",
  showWhenAll: onlyTwoSides,
  choices: [
    { name: "ไม่เคลือบด้านหลัง", desc: "สติ๊กเกอร์ด้านหลังแปะเลย ไม่เคลือบฟิล์ม", imageSrc: fOf("ไม่เคลือบ").imageSrc },
    {
      name: "เคลือบเงา / ด้าน (ด้านหลัง)",
      desc: "เคลือบฟิล์มใสที่ด้านหลังด้วย เลือกผิวเงาหรือด้านได้",
      extra: 1,
      imageSrc: fOf(GLOSS).imageSrc,
    },
    {
      name: "เคลือบพิเศษ (ด้านหลัง)",
      desc: "ฟิล์มลายพิเศษที่ด้านหลัง กลิตเตอร์ / ทราย / โฮโลแกรม",
      extra: 3,
      imageSrc: fOf(SPECIAL).imageSrc,
    },
  ],
};

const skinBack = {
  label: SKIN_B,
  showWhen: { label: COAT_B, choices: ["เคลือบเงา / ด้าน (ด้านหลัง)"] },
  showWhenAll: onlyTwoSides,
  choices: structuredClone(skinF.choices),
};
const filmBack = {
  label: FILM_B,
  showWhen: { label: COAT_B, choices: ["เคลือบพิเศษ (ด้านหลัง)"] },
  showWhenAll: onlyTwoSides,
  choices: structuredClone(filmF.choices),
};

/* ── 3) เรียงกลุ่ม: ...ด้านหน้า → จำนวนด้านที่แปะ → ...ด้านหลัง ──────────── */
const opts = d.options.filter((o) => ![COAT_B, SKIN_B, FILM_B].includes(o.label));
const at = opts.findIndex((o) => o.label === SIDES);
opts.splice(at + 1, 0, coatBack, skinBack, filmBack);
d.options = opts;

/* ── 4) ข้อความให้ตรงกติกาใหม่ ────────────────────────────────────────────── */
const COAT_LINE =
  "• เคลือบสติ๊กเกอร์คิดแยกด้านหน้า-ด้านหลัง ด้านละ: เงา/ด้าน +1 บาท/ชิ้น · พิเศษ +3 บาท/ชิ้น (แปะ 2 ด้านถึงจะเลือกเคลือบด้านหลังได้)";
for (const t of d.tabs ?? []) {
  if (!t?.text?.includes("::20 ml")) continue;
  t.text = t.text.replace(/• เคลือบเงา\/ด้าน บวกเพิ่ม[^\n]*/, COAT_LINE).replace(/• เคลือบสติ๊กเกอร์คิดแยก[^\n]*/, COAT_LINE);
}
const FAQ_Q = "แปะสติ๊กเกอร์ 2 ด้าน เคลือบได้ทั้งสองด้านไหม?";
if (d.seo) {
  d.seo.faqs = (d.seo.faqs ?? []).filter((f) => f.q !== FAQ_Q);
  d.seo.faqs.push({
    q: FAQ_Q,
    a: "ได้ครับ เลือก สติ๊กเกอร์ 2 ด้าน แล้วจะมีกลุ่ม เคลือบสติ๊กเกอร์ (ด้านหลัง) ขึ้นมาให้เลือกเพิ่ม ราคาเท่าด้านหน้า คือ เคลือบเงา/ด้าน +1 บาทต่อชิ้น · เคลือบพิเศษ +3 บาทต่อชิ้น เลือกผิวเคลือบและลายฟิล์มของแต่ละด้านแยกกันได้",
  });
}
d.savedAt = new Date().toISOString();

/* ── ตรวจก่อนเขียน ────────────────────────────────────────────────────────── */
if (coatBack.choices[0].extra) die("ตัวเลือกแรกของกลุ่ม collapsible ต้องเป็น 0฿");
for (const g of [coatBack, skinBack, filmBack]) {
  if (!g.choices.length) die(`กลุ่ม "${g.label}" ไม่มีตัวเลือก`);
  if (!g.choices.every((c) => c.imageSrc)) console.warn(`⚠️ กลุ่ม "${g.label}" มีตัวเลือกที่ไม่มีรูป`);
}
if (groupOf(d, "เคลือบสติ๊กเกอร์")) die("ยังมีกลุ่มชื่อเดิมค้างอยู่");

console.log("กลุ่มตัวเลือกหลังแก้ (เรียงตามหน้าร้าน):");
for (const o of d.options) {
  const when = [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? [])].filter(Boolean).map((s) => `${s.label}=${s.choices.join("/")}`);
  console.log(`  - ${o.label} (${o.choices.length})${o.collapsible ? " [สวิตช์]" : ""}${when.length ? "  ← " + when.join(" & ") : ""}`);
}
console.log("\nค่าเคลือบต่อชิ้น: หน้า เงา/ด้าน +1 · พิเศษ +3 | หลัง เงา/ด้าน +1 · พิเศษ +3 (พิเศษทั้งคู่ = +6)");

if (DRY) {
  console.log("\n(dry run — ไม่ได้เขียนลง DB)");
  process.exit(0);
}
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) throw e2;
console.log("\n✅ เขียนลง DB แล้ว");
