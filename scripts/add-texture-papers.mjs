/**
 * เพิ่ม "กระดาษผิวพิเศษ" อีก 6 ชนิดจากหน้า กระดาษ Texture Paper (`texture-paper`)
 * เข้ากลุ่ม "ชนิดกระดาษ" ของ โปสการ์ด / โพลารอยด์ / โฟโต้บูธ (กระดาษ)
 *   โฮโลแกรม SeaSand · โฮโลแกรม Rainbow · สีเงิน ผิวเงา/ผิวด้าน · สีทอง ผิวเงา/ผิวด้าน
 *   (Egg Shell 280 ไม่เอา — เลิกขายแล้ว)
 *
 * ใช้ตรรกะเดียวกับหน้า texture-paper ทุกอย่าง:
 *   • ราคา  = ช่อง [ชนิดกระดาษ × "ตัดตามขนาด"] ของ texture-paper (อ่านสด ไม่ฝังเลข)
 *             + ส่วนต่างค่าเคลือบของแถว "อาร์ตมัน 300 แกรม" ในตารางสินค้านั้นเอง
 *             ยกเว้น "เคลือบเงา" ของ 4 เนื้อผิวเงา = ฟรี (เท่าไม่เคลือบ) เหมือนหน้า texture-paper
 *   • เคลือบ: SeaSand / Rainbow / เงินผิวเงา / ทองผิวเงา → ไม่เคลือบ หรือ เคลือบเงา เท่านั้น
 *             เงินผิวด้าน / ทองผิวด้าน → ไม่เคลือบ อย่างเดียว
 *   • กลุ่ม "พิมพ์รองสีขาว (ด้านหน้า)" (+20 · การ์ด 2 ใบ) โผล่เฉพาะ 6 เนื้อนี้
 *   • โปสการ์ด: เปิดเคลือบด้านหลังให้ 6 เนื้อนี้ด้วย (เหมือน texture-paper) + ล็อกวัสดุ PET ไว้เหมือนกระดาษอื่น
 *
 *   node scripts/add-texture-papers.mjs           # ดูผลก่อน ไม่เขียน
 *   node scripts/add-texture-papers.mjs --write   # เขียนจริง
 * รันซ้ำได้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SRC = "texture-paper";
const SRC_RATE = "ตัดตามขนาด";
const PAPER = "ชนิดกระดาษ";
const COAT = "เคลือบ (เฉพาะด้านหน้า)";
const BACK_COAT = "เคลือบ (เฉพาะด้านหลัง)";
const BACK_SPECIAL = "เคลือบพิเศษ (ด้านหลัง)";
const NONE = "ไม่เคลือบ";
const GLOSS = "เคลือบเงา";
const REF = "กระดาษอาร์ตมัน 300 แกรม";
const WHITE_BASE = "พิมพ์รองสีขาว (ด้านหน้า)";

/** เนื้อที่เคลือบเงาได้ (ผิวเงา) — ผิวด้านเคลือบไม่ได้เลย ตามหน้า texture-paper */
const GLOSSY = ["โฮโลแกรม SeaSand (300 แกรม)", "โฮโลแกรม Rainbow (300 แกรม)", "กระดาษสีเงิน ผิวเงา (250 แกรม)", "กระดาษสีทอง ผิวเงา (250 แกรม)"];
const MATTE = ["กระดาษสีเงิน ผิวด้าน (250 แกรม)", "กระดาษสีทอง ผิวด้าน (250 แกรม)"];
const NEW = [...GLOSSY.slice(0, 2), "กระดาษสีเงิน ผิวเงา (250 แกรม)", "กระดาษสีเงิน ผิวด้าน (250 แกรม)", "กระดาษสีทอง ผิวเงา (250 แกรม)", "กระดาษสีทอง ผิวด้าน (250 แกรม)"];

const IDS = ["postcard-th", "new-mti1wu6o-1002", "new-mti1x6y4-5967"];

const grab = async (id) => {
  const { data, error } = await sb.from("products").select("id,name,data").eq("id", id).single();
  if (error || !data) throw new Error(`หาสินค้า ${id} ไม่เจอ: ${error?.message}`);
  return data;
};

// ── ต้นทาง ────────────────────────────────────────────────────────────────
const srcRow = await grab(SRC);
if (!/Texture/i.test(srcRow.name)) throw new Error(`${SRC} เป็นสินค้าอื่น: ${srcRow.name}`);
const src = srcRow.data;
if (src.pricing?.driverLabels?.[0] !== PAPER || src.pricing.driverLabels[1] !== "การตัด")
  throw new Error(`[${SRC}] แกนตารางเปลี่ยน: ${JSON.stringify(src.pricing?.driverLabels)}`);
const srcPaper = src.options.find((o) => o.label === PAPER);
const srcWhite = src.options.find((o) => o.label === WHITE_BASE);
if (!srcPaper || !srcWhite) throw new Error(`[${SRC}] ไม่เจอกลุ่ม ${PAPER} / ${WHITE_BASE}`);
for (const n of NEW) {
  if (!srcPaper.choices.some((c) => c.name === n)) throw new Error(`[${SRC}] ไม่มีเนื้อ "${n}"`);
  if (!src.pricing.cells[`${n}│${SRC_RATE}`]) throw new Error(`[${SRC}] ไม่มีช่องราคา "${n}│${SRC_RATE}"`);
}

for (const id of IDS) {
  const row = await grab(id);
  const d = row.data;
  console.log(`\n===== ${id} · ${row.name}`);

  const paperGroup = (d.options || []).find((o) => o.label === PAPER);
  const coatGroup = (d.options || []).find((o) => o.label === COAT);
  if (!paperGroup || !coatGroup) throw new Error(`${id}: ไม่เจอกลุ่ม ${PAPER}/${COAT}`);
  const COATS = coatGroup.choices.map((c) => c.name);
  const cells = d.pricing.cells;
  if (d.pricing.tiers.length !== src.pricing.tiers.length) throw new Error(`${id}: ขั้นจำนวนไม่เท่าต้นทาง`);

  // ส่วนต่างค่าเคลือบจากแถวอาร์ตมัน 300 ของสินค้านั้นเอง
  const refBase = cells[`${REF}│${NONE}`];
  if (!refBase) throw new Error(`${id}: ไม่เจอช่อง "${REF}│${NONE}"`);
  const delta = {};
  for (const c of COATS) {
    const v = cells[`${REF}│${c}`];
    if (!v) throw new Error(`${id}: ไม่เจอช่อง "${REF}│${c}"`);
    delta[c] = v.map((n, i) => n - refBase[i]);
  }

  // 1) เพิ่มตัวเลือกกระดาษ + ราคา
  for (const name of NEW) {
    const base = src.pricing.cells[`${name}│${SRC_RATE}`];
    if (!paperGroup.choices.some((c) => c.name === name)) {
      const srcC = srcPaper.choices.find((c) => c.name === name);
      const at = paperGroup.choices.findIndex((c) => /PET/i.test(c.name));
      const choice = { name, ...(srcC.imageSrc ? { imageSrc: srcC.imageSrc } : {}) };
      if (at >= 0) paperGroup.choices.splice(at, 0, choice); else paperGroup.choices.push(choice);
    }
    for (const c of COATS) {
      const val = c === NONE || (c === GLOSS && GLOSSY.includes(name)) ? [...base] : base.map((b, i) => b + delta[c][i]);
      cells[`${name}│${c}`] = val;
    }
    console.log(`   ${name}  ${NONE} ${JSON.stringify(base)}${GLOSSY.includes(name) ? ` · ${GLOSS} ฟรี` : ""}`);
  }

  // 2) กลุ่มพิมพ์รองสีขาว
  let white = (d.options || []).find((o) => o.label === WHITE_BASE);
  if (!white) {
    white = { ...structuredClone(srcWhite) };
    const at = d.options.findIndex((o) => o.label === COAT);
    d.options.splice(at >= 0 ? at : d.options.length, 0, white);
    console.log(`   + กลุ่ม "${WHITE_BASE}" (${white.choices.map((c) => c.name + (c.extra ? ` +${c.extra}` : "")).join(" · ")})`);
  }
  white.showWhen = { label: PAPER, choices: [...NEW] };

  // 3) กฎเคลือบ
  d.rules = d.rules || [];
  const findLimit = (allow) => d.rules.find((r) => r?.when?.label === PAPER && r?.limit?.label === COAT &&
    JSON.stringify(r.limit.allow) === JSON.stringify(allow));
  // 3.1 ผิวด้าน → ไม่เคลือบ (เติมเข้ากฎเดิม)
  const noCoat = findLimit([NONE]) && d.rules.find((r) => r?.when?.label === PAPER && r?.limit?.label === COAT &&
    JSON.stringify(r.limit.allow) === JSON.stringify([NONE]) && !(r.when.choices || []).some((c) => /PET/i.test(c)));
  if (!noCoat) throw new Error(`${id}: ไม่เจอกฎ "${COAT} = ${NONE}" ของกระดาษผิวพิเศษ`);
  for (const n of MATTE) if (!noCoat.when.choices.includes(n)) noCoat.when.choices.push(n);
  noCoat.when.choice = noCoat.when.choices[0];
  // 3.2 ผิวเงา → ไม่เคลือบ / เคลือบเงา
  let glossRule = findLimit([NONE, GLOSS]);
  if (!glossRule) {
    glossRule = { when: { label: PAPER, choice: GLOSSY[0], choices: [] }, limit: { label: COAT, allow: [NONE, GLOSS] } };
    d.rules.push(glossRule);
  }
  glossRule.when.choices = [...GLOSSY];
  glossRule.when.choice = GLOSSY[0];

  // 4) เฉพาะโปสการ์ด — ล็อกวัสดุ PET + เปิดเคลือบด้านหลังให้เนื้อใหม่ (เหมือน texture-paper)
  const petRule = d.rules.find((r) => r?.when?.label === PAPER && r?.limit?.label === "วัสดุ PET");
  if (petRule) { for (const n of NEW) if (!petRule.when.choices.includes(n)) petRule.when.choices.push(n); }
  for (const label of [BACK_COAT, BACK_SPECIAL]) {
    const g = (d.options || []).find((o) => o.label === label);
    if (!g) continue;
    for (const gate of [g.showWhenAlso, ...(g.showWhenAll || [])]) {
      if (gate?.label === PAPER) for (const n of NEW) if (!gate.choices.includes(n)) gate.choices.push(n);
    }
    console.log(`   ↳ เปิด "${label}" ให้เนื้อใหม่ด้วย`);
  }

  if (!WRITE) { console.log("   (ยังไม่เขียน — ใส่ --write)"); continue; }
  const { error } = await sb.from("products").update({ data: d }).eq("id", id);
  if (error) throw error;
  console.log(`   ✓ บันทึกแล้ว — กระดาษ ${paperGroup.choices.length} ชนิด · ช่องราคา ${Object.keys(cells).length}`);
}
