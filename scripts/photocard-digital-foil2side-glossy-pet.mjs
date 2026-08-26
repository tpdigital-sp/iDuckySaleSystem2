#!/usr/bin/env node
/**
 * Photo card Digital (photocard-digital) — ฟอยล์ 2 ด้าน · กติกาเคลือบกระดาษเนื้อพิเศษ · PET ใส
 *
 *   node scripts/photocard-digital-foil2side-glossy-pet.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/photocard-digital-foil2side-glossy-pet.mjs --write
 *
 * ผู้ใช้สั่ง 26 ส.ค. 69:
 *   1. กระดาษอาร์ตมัน 300 แกรม — พิมพ์ 2 ด้าน ปั๊มฟอยล์ได้ 2 ด้าน ราคาด้านหลังเท่าด้านหน้า
 *      → กลุ่มใหม่ "เคลือบฟอยล์ด้านหลัง" (+40/+60) + "สีฟอยล์ (ด้านหลัง)" (โฮโลแกรม +10)
 *        โชว์เฉพาะ เรทอาร์ตมัน + พิมพ์ 2 ด้าน · ล็อกเคลือบด้านหลังเป็น "มากับงานฟอยล์"
 *        แบบเดียวกับกติกาฟอยล์ด้านหน้าที่ใช้อยู่
 *   2. เนื้อพิเศษ โฮโลแกรม / ทอง (เงา) / เงิน (เงา) — ด้านหน้าเคลือบได้แค่เคลือบเงา
 *      · พิมพ์ 2 ด้าน ด้านหลังเคลือบได้ทุกแบบ (เดิมไม่จำกัดอยู่แล้ว — คงไว้)
 *   3. เนื้อพิเศษ ทอง (ด้าน) / เงิน (ด้าน) — พิมพ์ 2 ด้าน ด้านหลังเคลือบได้ทุกแบบ
 *      (ถอดสองตัวนี้ออกจากกฎเดิมที่ล็อกด้านหลังเป็น "ไม่เคลือบ" · ด้านหน้ายังเคลือบไม่ได้เหมือนเดิม)
 *   4. PET สีใส — พิมพ์ลายได้ 1 ด้านเท่านั้น + ค่ารองพื้นขาว 20 บาท (บวกอัตโนมัติเมื่อเลือก)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "photocard-digital";
const EXPECT_NAME = "Photo card Digital";

const IMG = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/photocard-digital";

// ชื่อกลุ่ม/ตัวเลือกที่อ้างถึง (ของเดิมใน DB — ห้ามพิมพ์ผิด สคริปต์เช็คก่อนเขียน)
const G_RATE = "เรทราคา";
const G_PAPER = "ชนิดกระดาษเนื้อพิเศษ";
const G_PET = "สี PET";
const G_SIDES = "พิมพ์กี่ด้าน";
const G_COAT_F = "เคลือบ (เฉพาะด้านหน้า)";
const G_COAT_B = "เคลือบด้านหลัง";
const G_FOIL_F = "เคลือบฟอยล์";
const G_FOIL_B = "เคลือบฟอยล์ด้านหลัง"; // กลุ่มใหม่
const G_FOILCOLOR_B = "สีฟอยล์ (ด้านหลัง)"; // กลุ่มใหม่

const RATE_ART = "กระดาษอาร์ตมัน 300 แกรม";
const RATE_SPECIAL = "กระดาษเนื้อพิเศษ";

const GLOSSY_PAPERS = [
  "โฮโลแกรม SeaSand (300 แกรม)",
  "โฮโลแกรม Rainbow (300 แกรม)",
  "กระดาษสีเงิน ผิวเงา (250 แกรม)",
  "กระดาษสีทอง ผิวเงา (250 แกรม)",
];
const MATTE_METAL_PAPERS = ["กระดาษสีเงิน ผิวด้าน (250 แกรม)", "กระดาษสีทอง ผิวด้าน (250 แกรม)"];

const COAT_B_NORMAL = ["ไม่เคลือบด้านหลัง", "เคลือบเงา (ด้านหลัง)", "เคลือบด้าน (ด้านหลัง)", "เคลือบพิเศษ (ด้านหลัง)"];
const COAT_B_FOIL = "เคลือบด้าน (ด้านหลัง · มากับงานฟอยล์)"; // ตัวล็อก 0฿ แบบเดียวกับด้านหน้า
const FOIL_B_NONE = "ไม่เคลือบฟอยล์ด้านหลัง";
const FOIL_B_1 = "พิมพ์ 1 เลเยอร์ (ด้านหลัง)";
const FOIL_B_2 = "พิมพ์ 2 เลเยอร์ (ด้านหลัง)";
const PET_CLEAR = "PET สีใส";
const PET_WHITE_FEE = 20;

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

const { data: rows, error } = await sb.from("products").select("*").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า id=${ID}`);
if (row.name !== EXPECT_NAME) die(`ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);
const d = row.data;

const group = (label) => {
  const g = (d.options ?? []).find((o) => o.label === label);
  if (!g) die(`ไม่พบกลุ่ม "${label}"`);
  return g;
};
const mustHave = (g, names) => {
  for (const n of names) if (!g.choices.some((c) => c.name === n)) die(`กลุ่ม "${g.label}" ไม่มีตัวเลือก "${n}"`);
};

// ── ตรวจของเดิมให้ตรงที่คาดก่อนแตะอะไร ─────────────────────────────
mustHave(group(G_PAPER), [...GLOSSY_PAPERS, ...MATTE_METAL_PAPERS]);
mustHave(group(G_PET), [PET_CLEAR]);
mustHave(group(G_SIDES), ["พิมพ์ 1 ด้าน", "พิมพ์ 2 ด้าน"]);
mustHave(group(G_COAT_F), ["ไม่เคลือบ", "เคลือบเงา"]);
mustHave(group(G_COAT_B), COAT_B_NORMAL);
mustHave(group(G_FOIL_F), ["ไม่เคลือบฟอยล์", "พิมพ์ 1 เลเยอร์ / 1 ด้าน", "พิมพ์ 2 เลเยอร์ / 1 ด้าน"]);
if ((d.options ?? []).some((o) => o.label === G_FOIL_B)) die(`มีกลุ่ม "${G_FOIL_B}" อยู่แล้ว — สคริปต์นี้รันไปแล้ว?`);

// ══ 1. ปั๊มฟอยล์ด้านหลัง (เรทอาร์ตมัน + พิมพ์ 2 ด้าน) ═══════════════
const foilBackGroup = {
  label: G_FOIL_B,
  display: "cards",
  note: "เฉพาะงานพิมพ์ 2 ด้าน บนกระดาษอาร์ตมัน 300 แกรม · ราคาเท่ากับปั๊มฟอยล์ด้านหน้า · งานฟอยล์ด้านหลังมีเคลือบด้านรวมในขั้นตอนแล้ว ไม่คิดเพิ่ม",
  showWhen: { label: G_RATE, choices: [RATE_ART] },
  showWhenAlso: { label: G_SIDES, choices: ["พิมพ์ 2 ด้าน"] },
  choices: [
    { name: FOIL_B_NONE },
    { name: FOIL_B_1, extra: 40, imageSrc: `${IMG}/foil-1layer-info.jpg` },
    { name: FOIL_B_2, extra: 60, imageSrc: `${IMG}/foil-2layer-info.jpg` },
  ],
};
const foilBackColorGroup = {
  label: G_FOILCOLOR_B,
  display: "cards",
  showWhen: { label: G_FOIL_B, choices: [FOIL_B_1, FOIL_B_2] },
  choices: [
    { name: "สีเงิน", imageSrc: `${IMG}/foil-silver.jpg` },
    { name: "สีทอง", imageSrc: `${IMG}/foil-gold.jpg` },
    { name: "สีโรสโกลด์", imageSrc: `${IMG}/foil-rosegold.jpg` },
    { name: "สีโฮโลแกรม", extra: 10, imageSrc: `${IMG}/foil-hologram.jpg` },
  ],
};
// แทรกต่อท้าย "สีฟอยล์" ให้หมวดฟอยล์อยู่ติดกัน
const foilColorIdx = d.options.findIndex((o) => o.label === "สีฟอยล์");
if (foilColorIdx < 0) die('ไม่พบกลุ่ม "สีฟอยล์"');
d.options.splice(foilColorIdx + 1, 0, foilBackGroup, foilBackColorGroup);

// ตัวล็อกเคลือบด้านหลังของงานฟอยล์ (0฿) — แบบเดียวกับ "เคลือบด้าน (มากับงานฟอยล์)" ด้านหน้า
const coatB = group(G_COAT_B);
coatB.choices.push({ name: COAT_B_FOIL });
coatB.note = (coatB.note ?? "") + " — งานปั๊มฟอยล์ด้านหลังล็อกเป็นเคลือบด้าน (มากับงานฟอยล์)";

// note กลุ่มฟอยล์ด้านหน้า: บอกว่าพิมพ์ 2 ด้านปั๊มหลังเพิ่มได้
const foilF = group(G_FOIL_F);
foilF.note = (foilF.note ?? "") + " · งานพิมพ์ 2 ด้าน ปั๊มฟอยล์ด้านหลังเพิ่มได้ ราคาเท่าด้านหน้า";

// ══ 2-3. กติกาเคลือบกระดาษเนื้อพิเศษ ═══════════════════════════════
// กฎเดิม: ล็อกเคลือบด้านหลังของกระดาษกลุ่มผิวด้าน/เนื้ออื่นเป็น "ไม่เคลือบด้านหลัง"
// → ถอด ทอง(ด้าน)/เงิน(ด้าน) ออก (พิมพ์ 2 ด้าน ด้านหลังเคลือบได้ทุกแบบแล้ว)
const backLockRule = (d.rules ?? []).find(
  (r) =>
    r.limit.label === G_COAT_B &&
    r.when.label === G_PAPER &&
    (r.when.choices ?? []).includes(MATTE_METAL_PAPERS[0])
);
if (!backLockRule) die("ไม่พบกฎเดิมที่ล็อกเคลือบด้านหลังของกระดาษเนื้อพิเศษ");
backLockRule.when.choices = backLockRule.when.choices.filter((c) => !MATTE_METAL_PAPERS.includes(c));
backLockRule.when.choice = backLockRule.when.choices[0];
if (!backLockRule.when.choices.length) die("กฎล็อกด้านหลังไม่เหลือกระดาษเลย — ผิดคาด");

const newRules = [
  // เนื้อเงา (โฮโลแกรม/ทองเงา/เงินเงา): ด้านหน้าเคลือบได้แค่เคลือบเงา (หรือไม่เคลือบ)
  {
    when: { label: G_PAPER, choice: GLOSSY_PAPERS[0], choices: GLOSSY_PAPERS },
    limit: { label: G_COAT_F, allow: ["ไม่เคลือบ", "เคลือบเงา"] },
  },
  // เรทเนื้อพิเศษไม่มีงานฟอยล์ → ตัวล็อก "มากับงานฟอยล์" ต้องไม่โผล่ในเคลือบด้านหลัง
  {
    when: { label: G_RATE, choice: RATE_SPECIAL, choices: [RATE_SPECIAL] },
    limit: { label: G_COAT_B, allow: COAT_B_NORMAL },
  },
  // ══ 4. PET สีใส พิมพ์ได้ด้านเดียว ══
  {
    when: { label: G_PET, choice: PET_CLEAR, choices: [PET_CLEAR] },
    limit: { label: G_SIDES, allow: ["พิมพ์ 1 ด้าน"] },
  },
  // กติกาฟอยล์ด้านหลัง — กระจกเงาของกฎฟอยล์ด้านหน้าที่ใช้อยู่
  {
    when: { label: G_FOIL_B, choice: FOIL_B_1, choices: [FOIL_B_1, FOIL_B_2] },
    limit: { label: G_COAT_B, allow: [COAT_B_FOIL] },
  },
  {
    when: {
      label: G_COAT_B,
      choice: "เคลือบเงา (ด้านหลัง)",
      choices: ["เคลือบเงา (ด้านหลัง)", "เคลือบด้าน (ด้านหลัง)", "เคลือบพิเศษ (ด้านหลัง)"],
    },
    limit: { label: G_FOIL_B, allow: [FOIL_B_NONE] },
  },
  {
    when: { label: G_FOIL_B, choice: FOIL_B_NONE, choices: [FOIL_B_NONE] },
    limit: { label: G_COAT_B, allow: COAT_B_NORMAL },
  },
];
d.rules = [...(d.rules ?? []), ...newRules];

// ══ 4. PET สีใส — ค่ารองพื้นขาว 20 บาท บวกอัตโนมัติ ═══════════════
const petG = group(G_PET);
const petClear = petG.choices.find((c) => c.name === PET_CLEAR);
petClear.extra = PET_WHITE_FEE;
petClear.desc = "พิมพ์ลายได้ 1 ด้านเท่านั้น · รวมค่าพิมพ์รองพื้นขาว +20 บาท (จำเป็นสำหรับเนื้อใส)";
petG.note = "PET สีใส พิมพ์ลายได้ 1 ด้าน · มีค่าพิมพ์รองพื้นขาว +20 บาท (รวมให้แล้วเมื่อเลือก)";

// note กลุ่มกระดาษเนื้อพิเศษ: สรุปกติกาใหม่สั้น ๆ
const paperG = group(G_PAPER);
paperG.note =
  "ชุดเดียวกับหน้ากระดาษ Texture Paper · บางเนื้อเคลือบไม่ได้ / พิมพ์รองสีขาวไม่ได้ · เนื้อโฮโลแกรม/สีเงิน/สีทอง พิมพ์ 2 ด้าน ด้านหลังเคลือบได้ทุกแบบ";

// ══ แท็บ "รายละเอียดเพิ่มเติม" ให้ตรงกติกาใหม่ ═══════════════════════
const tab = (d.tabs ?? []).find((t) => t.title === "รายละเอียดเพิ่มเติม");
if (!tab) die('ไม่พบแท็บ "รายละเอียดเพิ่มเติม"');
const rep = (from, to) => {
  if (!tab.text.includes(from)) die(`ไม่พบข้อความเดิมในแท็บ: ${from.slice(0, 60)}…`);
  tab.text = tab.text.replace(from, to);
};
rep(
  "• งานเคลือบฟอยล์ทุกงานต้องมีการเคลือบด้านร่วมด้วย (รวมอยู่ในขั้นตอนงานฟอยล์แล้ว ไม่คิดเพิ่ม)",
  "• งานเคลือบฟอยล์ทุกงานต้องมีการเคลือบด้านร่วมด้วย (รวมอยู่ในขั้นตอนงานฟอยล์แล้ว ไม่คิดเพิ่ม)\n• งานพิมพ์ 2 ด้าน (กระดาษอาร์ตมัน 300 แกรม) ปั๊มฟอยล์ได้ทั้ง 2 ด้าน — ค่าปั๊มฟอยล์ด้านหลังคิดเท่ากับด้านหน้า"
);
for (const p of GLOSSY_PAPERS)
  rep(`• ${p} — เคลือบได้ · พิมพ์รองสีขาวได้`, `• ${p} — ด้านหน้าเคลือบเงาได้อย่างเดียว · พิมพ์รองสีขาวได้`);
for (const p of MATTE_METAL_PAPERS)
  rep(`• ${p} — เคลือบไม่ได้ · พิมพ์รองสีขาวได้`, `• ${p} — ด้านหน้าเคลือบไม่ได้ · พิมพ์รองสีขาวได้`);
rep(
  "\n\nAdd On งานพิมพ์รองสีขาว::",
  "\n• เนื้อโฮโลแกรม / สีเงิน / สีทอง (ผิวเงาและผิวด้าน) — งานพิมพ์ 2 ด้าน ด้านหลังเคลือบได้ทุกแบบ\n\nAdd On งานพิมพ์รองสีขาว::"
);
rep(
  "• พิมพ์รองสีขาว บวกเพิ่ม 20 บาท/แผ่น (เฉพาะกระดาษเนื้อพิเศษ เนื้อโฮโลแกรม/สีเงิน/สีทอง — งาน PET ไม่มี)",
  "• พิมพ์รองสีขาว บวกเพิ่ม 20 บาท/แผ่น (กระดาษเนื้อพิเศษ เนื้อโฮโลแกรม/สีเงิน/สีทอง เลือกติ๊กเองได้ · PET สีใส จำเป็นต้องรองพื้นขาว ระบบบวก 20 บาทให้อัตโนมัติเมื่อเลือก)"
);
rep(
  "\n\nขั้นตอนการเคลือบฟอยล์",
  "\n\nงาน PET::\n• PET สีใส พิมพ์ลายได้ 1 ด้านเท่านั้น · มีค่าพิมพ์รองพื้นขาว 20 บาท (รวมให้อัตโนมัติเมื่อเลือก PET สีใส)\n\nขั้นตอนการเคลือบฟอยล์"
);

d.savedAt = new Date().toISOString();

// ── สรุปให้ดูก่อนเขียน ───────────────────────────────────────────────
console.log(`กลุ่มใหม่: "${G_FOIL_B}" (${foilBackGroup.choices.map((c) => `${c.name}${c.extra ? ` +${c.extra}` : ""}`).join(" · ")})`);
console.log(`           "${G_FOILCOLOR_B}" (4 สี · โฮโลแกรม +10)`);
console.log(`เคลือบด้านหลัง: เพิ่ม "${COAT_B_FOIL}" (0฿)`);
console.log(`กฎล็อกด้านหลังเนื้อพิเศษ เหลือ: ${backLockRule.when.choices.join(" | ")}`);
console.log(`กฎใหม่ ${newRules.length} ข้อ · รวมทั้งหมด ${d.rules.length} ข้อ`);
console.log(`PET สีใส: extra=${petClear.extra} · ${petClear.desc}`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { data: wrote, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!wrote?.length) die("update ไม่โดนแถวไหนเลย (0 rows) — เช็ค id/สิทธิ์");

// อ่านกลับมายืนยัน
const { data: back } = await sb.from("products").select("data").eq("id", ID);
const b = back[0].data;
const bg = b.options.find((o) => o.label === G_FOIL_B);
const bPet = b.options.find((o) => o.label === G_PET).choices.find((c) => c.name === PET_CLEAR);
const ok =
  !!bg &&
  bg.choices.length === 3 &&
  b.options.some((o) => o.label === G_FOILCOLOR_B) &&
  b.options.find((o) => o.label === G_COAT_B).choices.some((c) => c.name === COAT_B_FOIL) &&
  bPet.extra === PET_WHITE_FEE &&
  b.rules.some((r) => r.limit.label === G_SIDES && r.when.choice === PET_CLEAR) &&
  b.rules.some((r) => r.limit.label === G_COAT_F && (r.when.choices ?? []).includes(GLOSSY_PAPERS[2])) &&
  !b.rules.some((r) => r.limit.label === G_COAT_B && (r.when.choices ?? []).includes(MATTE_METAL_PAPERS[0])) &&
  b.tabs.find((t) => t.title === "รายละเอียดเพิ่มเติม").text.includes("ปั๊มฟอยล์ได้ทั้ง 2 ด้าน");
console.log(
  `อ่านกลับ: ฟอยล์หลัง=${bg ? "มี" : "❌"} · สีฟอยล์หลัง=${b.options.some((o) => o.label === G_FOILCOLOR_B) ? "มี" : "❌"} · PET ใส extra=${bPet.extra} · rules=${b.rules.length}`
);
if (!ok) die("เขียนแล้วแต่ค่าที่อ่านกลับไม่ตรง — ยังไม่เสร็จ");
console.log("✓ เขียน Supabase แล้ว (ยืนยันจากการอ่านกลับ)");
