#!/usr/bin/env node
/**
 * ป้ายแขวนประตู (mdf) — ยกเครื่องตัวเลือกอะคริลิค + กระดาษ ตามผู้ใช้สั่ง 26 ส.ค. 69
 *
 * ฝั่งอะคริลิค (เรท r2):
 *   • "ชนิดวัสดุ" แตกอะคริลิคเป็น 3 แบบตามพวงกุญแจ: ใส / ขาวขุ่น C-02 / สีพิเศษ 44 เฉด
 *     (เซลล์ราคา: ใส = C-02 = ตาราง "อะคริลิคใส | ขาวขุ่น" เดิม · สีพิเศษ = ตาราง "อะคริลิคพิเศษ" เดิม)
 *   • เพิ่มกลุ่ม "สีอะคริลิค" 44 เฉด (ก็อปสดจาก keyring-copy-copy ตัด ใส/C-02 หัวแถวออก)
 *   • กลุ่มสกรีนของอะคริลิคแยกใหม่ "งานสกรีน" เหลือแค่ 2 ด้าน: ใต้-บน / บน-บน (+45 เท่าเดิม)
 *     + กฎเนื้อทึบสกรีนได้เฉพาะ บน-บน (ตรรกะเดียวกับ acrylic-screen-by-material.mjs)
 *   • คละลาย: 1-10 อิสระ · 11+ ลายละ 5 ชิ้น · เกินโควตาบวกลายละ 5 (extraDesignFee)
 * ฝั่งกระดาษ (เรท r3):
 *   • "PET (ใส | ขาว)" แตกเป็น "PET เนื้อใส" / "PET เนื้อขาว" (เซลล์ราคาเดิมทั้งคู่)
 *   • PET เคลือบไม่ได้ (กฎบังคับ "ไม่เคลือบ" ทั้งหน้า-หลัง ตามแบบ paper-art-pet)
 *   • กลุ่ม "เคลือบด้านหลัง" เดิม → เปลี่ยนชื่อเป็น "เคลือบด้านหน้า" (เงา/ด้าน +10 · พิเศษ +40)
 *   • เพิ่มกลุ่ม "เคลือบด้านหลัง" ใหม่ มีสวิตช์เปิด-ปิด (collapsible · ตัวแรก 0฿)
 *   • เคลือบพิเศษมีกลุ่มเลือกลายฟิล์ม (ก็อปสดจาก paper-art-pet + รูป preset-coating)
 *   • PET เนื้อใส: พิมพ์ได้ 1 ด้าน (กฎ) + กลุ่ม "พิมพ์รองขาว" ไม่รองขาว / รองขาว +20
 *   • คละลาย: 1-10 เซ็ตอิสระ · 11+ ลายละ 5 เซ็ต · เกินโควตาบวกลายละ 5 + perUnit 3 (ชุดละ 3 ชิ้น)
 *   • ทุกกลุ่มมีภาพตัวอย่าง (ยืมรูปที่มีอยู่แล้ว: paper-art-pet / washi-sticker / sticker-vacuum / acrylic-colors)
 * MDF (เรท r1): ไม่แตะ — กลุ่ม "การสกรีน" เดิมเหลือโชว์เฉพาะเรท MDF
 *
 *   node scripts/door-hanger-rework.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/door-hanger-rework.mjs --write   # บันทึกจริง (รันซ้ำได้)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "mdf";
const IMG = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products";

const RATE_MDF = "ป้ายแขวนประตู วัสดุ MDF";
const RATE_ACR = "ป้ายแขวนประตู วัสดุอะคริลิค";
const RATE_PAPER = "ป้ายแขวนประตู กระดาษ | PET (ชุดละ 3 ชิ้น)";

const ACR_CLEAR = "อะคริลิคใส";
const ACR_C02 = "อะคริลิคขาวขุ่น C-02";
const ACR_SPECIAL = "สีพิเศษ (โฮโลแกรม/กลิสเตอร์/สี)";
const PET_CLEAR = "PET เนื้อใส";
const PET_WHITE = "PET เนื้อขาว";
const PAPER_KR = "กระดาษเกาหลี";

const die = (m) => {
  console.error("✗ " + m);
  process.exit(1);
};

/* ── Supabase ─────────────────────────────────────────────────────────────── */
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

/* ── อ่านของสด 3 ตัว: ป้ายแขวนประตู + ต้นแบบ ─────────────────────────────── */
const { data: rows, error } = await sb
  .from("products")
  .select("id,name,data")
  .in("id", [ID, "keyring-copy-copy", "paper-art-pet"]);
if (error) die(error.message);
const byId = Object.fromEntries((rows ?? []).map((r) => [r.id, r]));
for (const k of [ID, "keyring-copy-copy", "paper-art-pet"]) if (!byId[k]) die(`ไม่พบสินค้า ${k}`);
const d = structuredClone(byId[ID].data);
const keyring = byId["keyring-copy-copy"].data;
const paperArt = byId["paper-art-pet"].data;

const groupOf = (dd, label) => (dd.options ?? []).find((o) => o.label === label);
const idxOf = (label) => (d.options ?? []).findIndex((o) => o.label === label);

/* ── กันโครงเปลี่ยน: เช็คของเดิมก่อนแตะ ───────────────────────────────────── */
{
  const mat = groupOf(d, "ชนิดวัสดุ");
  if (!mat) die('ไม่พบกลุ่ม "ชนิดวัสดุ"');
  const names = mat.choices.map((c) => c.name);
  const expect = ["MDF", "อะคริลิคใส | ขาวขุ่น", "อะคริลิคพิเศษ", "กระดาษเกาหลี", "PET (ใส | ขาว)"];
  if (JSON.stringify(names) !== JSON.stringify(expect))
    die(`"ชนิดวัสดุ" ไม่ตรงที่คาด: [${names.join(" | ")}] — DB ใหม่กว่าสคริปต์ ตรวจก่อน`);
  if (!groupOf(d, "การสกรีน")) die('ไม่พบกลุ่ม "การสกรีน"');
  if (!groupOf(d, "การพิมพ์")) die('ไม่พบกลุ่ม "การพิมพ์"');
  if (!groupOf(d, "เคลือบด้านหลัง")) die('ไม่พบกลุ่ม "เคลือบด้านหลัง" (ตัวที่จะเปลี่ยนชื่อเป็นด้านหน้า)');
  if (groupOf(d, "เคลือบด้านหน้า")) die('มีกลุ่ม "เคลือบด้านหน้า" อยู่แล้ว — รันไปแล้ว? ตรวจก่อน');
  const rates = Object.fromEntries((d.priceRates ?? []).map((r) => [r.label, r]));
  for (const l of [RATE_MDF, RATE_ACR, RATE_PAPER]) if (!rates[l]) die(`ไม่พบเรท "${l}"`);
}

/* ── วัตถุดิบจากต้นแบบ ────────────────────────────────────────────────────── */
// ประเภทอะคริลิค (ใส/C-02/สีพิเศษ) ของพวงกุญแจ — เอา desc + รูป
const krType = groupOf(keyring, "ประเภทอะคริลิค");
if (!krType) die("keyring: ไม่พบกลุ่มประเภทอะคริลิค");
const krTypeOf = (name) => {
  const c = krType.choices.find((x) => x.name === name);
  if (!c) die(`keyring: ไม่พบตัวเลือก "${name}" ในประเภทอะคริลิค`);
  return c;
};
// เมนู 44 เฉด — ตัด ใส/C-02 หัวแถว (มีเป็นการ์ดชนิดวัสดุอยู่แล้ว)
const krShade = groupOf(keyring, "สีอะคริลิค");
if (!krShade) die("keyring: ไม่พบกลุ่มสีอะคริลิค");
const shadeChoices = structuredClone(krShade.choices).filter(
  (c) => c.name !== ACR_CLEAR && c.name !== ACR_C02
);
if (shadeChoices.length !== 44) die(`เมนูเฉดได้ ${shadeChoices.length} ตัว (คาด 44) — ตรวจก่อน`);
// งานสกรีน 2 ด้าน 2 แบบของพวงกุญแจ — เอา desc + รูป
const krScreen = groupOf(keyring, "งานสกรีน");
const krScreenOf = (name) => {
  const c = (krScreen?.choices ?? []).find((x) => x.name === name);
  if (!c) die(`keyring: ไม่พบตัวเลือกสกรีน "${name}"`);
  return c;
};
// ลายฟิล์มเคลือบพิเศษของ paper-art-pet (กลิตเตอร์/ทราย/hologram + รูป preset-coating)
const paFilm = groupOf(paperArt, "เคลือบ");
if (!paFilm || paFilm.choices.length < 5) die("paper-art-pet: ไม่พบกลุ่มลายฟิล์มเคลือบ");
const filmChoices = structuredClone(paFilm.choices);
// desc การ์ดเคลือบของ paper-art-pet (ไม่เคลือบ/เงา/ด้าน/พิเศษ)
const paCoat = groupOf(paperArt, "เคลือบ (เฉพาะด้านหน้า)");
const paCoatOf = (name) => {
  const c = (paCoat?.choices ?? []).find((x) => x.name === name);
  if (!c) die(`paper-art-pet: ไม่พบตัวเลือกเคลือบ "${name}"`);
  return c;
};

// เนื้อโปร่ง/ทึบ — ตรรกะเดียวกับ acrylic-screen-by-material.mjs
const isTransparent = (n) =>
  /^อะคริลิ(ค)?ใส$/.test(n) ||
  n.startsWith("อะคริลิคกลิตเตอร์-") ||
  (n.startsWith("hologram-") && n !== "hologram-01");
const opaqueShades = shadeChoices.map((c) => c.name).filter((n) => !isTransparent(n));
if (!opaqueShades.includes("hologram-01") || opaqueShades.includes("อะคริลิคกลิตเตอร์-เงิน"))
  die("การแบ่งเนื้อโปร่ง/ทึบผิดจากที่คาด — ตรวจก่อน");

/* ── ตารางราคา: แตกเซลล์ตามตัวเลือกใหม่ + กติกาคละ ─────────────────────────── */
const rateOf = (label) => d.priceRates.find((r) => r.label === label);
{
  const r2 = rateOf(RATE_ACR);
  const clear = r2.pricing.cells["อะคริลิคใส | ขาวขุ่น"];
  const special = r2.pricing.cells["อะคริลิคพิเศษ"];
  if (!clear || !special) die("เซลล์ราคาอะคริลิคไม่ตรงที่คาด");
  r2.pricing.cells = {
    [ACR_CLEAR]: [...clear],
    [ACR_C02]: [...clear],
    [ACR_SPECIAL]: [...special],
  };
  r2.extraDesignFee = 5; // 11+ ชิ้น โควตาลายละ 5 ชิ้น (minPerDesign 5 เดิม) · เกินบวกลายละ 5
  r2.desc =
    "ขนาด 10x24cm · งานพิมพ์ UV · งานสกรีน 2 ด้านทุกชิ้น +45.- (ใต้-บน / บน-บน) · เลือกเนื้อ อะคริลิคใส / ขาวขุ่น C-02 / สีพิเศษ 44 เฉด (+45/อัน)";

  const r3 = rateOf(RATE_PAPER);
  const paper = r3.pricing.cells["กระดาษเกาหลี"];
  const pet = r3.pricing.cells["PET (ใส | ขาว)"];
  if (!paper || !pet) die("เซลล์ราคากระดาษ/PET ไม่ตรงที่คาด");
  r3.pricing.cells = {
    [PAPER_KR]: [...paper],
    [PET_CLEAR]: [...pet],
    [PET_WHITE]: [...pet],
  };
  r3.extraDesignFee = 5; // 11+ เซ็ต โควตาลายละ 5 เซ็ต · เกินบวกลายละ 5
  r3.desc =
    "ขายเป็นชุด ชุดละ 3 ชิ้น · งานพิมพ์ Digital · พิมพ์ 2 ด้าน +10.-/ชุด · เคลือบหน้า/หลัง เงา-ด้าน +10 · เคลือบพิเศษ +40 · PET เคลือบไม่ได้ · PET เนื้อใสพิมพ์ได้ 1 ด้าน (รองขาว +20)";
}

/* ── กลุ่มตัวเลือกชุดใหม่ ─────────────────────────────────────────────────── */
// 1) ชนิดวัสดุ — การ์ดมีรูปทุกตัว · ตัวเลือกโชว์ตามเรทอัตโนมัติ (กรองด้วยเซลล์ราคาของเรท)
{
  const mat = groupOf(d, "ชนิดวัสดุ");
  mat.display = "cards";
  mat.choices = [
    {
      name: "MDF",
      desc: "แผ่นไม้ MDF ขนาด 10x23cm งานพิมพ์ UV — พื้นผิวส่วนที่ไม่สกรีนมีความเงา",
      imageSrc: `${IMG}/door-hanger/hanger-mdf-main.jpg`,
    },
    {
      name: ACR_CLEAR,
      desc: krTypeOf(ACR_CLEAR).desc,
      popular: true,
      imageSrc: krTypeOf(ACR_CLEAR).imageSrc,
    },
    {
      name: ACR_C02,
      desc: krTypeOf(ACR_C02).desc,
      imageSrc: krTypeOf(ACR_C02).imageSrc,
    },
    {
      name: ACR_SPECIAL,
      desc: "กลิตเตอร์ · โฮโลแกรม · กระจก · อะคริลิคสีทึบ รวม 44 เฉด (เลือกเฉดได้หลังกดแบบนี้) — บวกเพิ่ม ฿45/อัน",
      imageSrc: krTypeOf(ACR_SPECIAL).imageSrc,
    },
    {
      name: PAPER_KR,
      desc: "กระดาษเกาหลีเนื้อหนา งานพิมพ์ Digital — ขายเป็นชุด ชุดละ 3 ชิ้น ราคาเริ่มต้น",
      imageSrc: `${IMG}/door-hanger/hanger-paper-main.jpg`,
      perUnit: 3,
    },
    {
      name: PET_CLEAR,
      desc: "แผ่นพลาสติก PET เนื้อใส มองทะลุได้ เหนียว กันน้ำ — พิมพ์ได้ 1 ด้าน (รองขาว +20) · ชุดละ 3 ชิ้น",
      imageSrc: `${IMG}/mobile-phone-hanging-diecut/pet-clear-v1.jpg`,
      perUnit: 3,
    },
    {
      name: PET_WHITE,
      desc: "แผ่นพลาสติก PET เนื้อขาว เหนียว กันน้ำ ลายสีสดทึบ — ชุดละ 3 ชิ้น",
      imageSrc: `${IMG}/mobile-phone-hanging-diecut/pet-white-v1.jpg`,
      perUnit: 3,
    },
  ];
}

// 2) สีอะคริลิค 44 เฉด — โชว์เมื่อเลือกสีพิเศษ (ห้ามมีกฎย้อนทิศ สี→ประเภท)
const shadeGroup = {
  label: "สีอะคริลิค",
  note: "44 เฉดของอะคริลิคสีพิเศษ — ราคาเท่ากันทุกเฉด",
  display: "dropdown",
  showWhen: { label: "ชนิดวัสดุ", choices: [ACR_SPECIAL] },
  choices: shadeChoices,
};

// 3) การสกรีน (MDF) — เดิมโชว์ทั้ง MDF+อะคริลิค → เหลือ MDF อย่างเดียว
{
  const scr = groupOf(d, "การสกรีน");
  scr.showWhen = { label: "เรทราคา", choices: [RATE_MDF] };
}

// 4) งานสกรีน (อะคริลิค) — เหลือแค่สกรีน 2 ด้าน 2 แบบตามพวงกุญแจ (+45 เท่าราคาเดิม)
const acrScreenGroup = {
  label: "งานสกรีน",
  note: "ป้ายแขวนประตูอะคริลิคเป็นงานสกรีน 2 ด้านทุกชิ้น (+฿45) — เนื้อทึบสกรีนแบบ **บน-บน** เท่านั้น",
  display: "cards",
  showWhen: { label: "เรทราคา", choices: [RATE_ACR] },
  choices: [
    {
      name: "สกรีน 2 ด้าน (ใต้-บน)",
      desc: krScreenOf("สกรีน 2 ด้าน (ใต้-บน)").desc,
      extra: 45,
      popular: true,
      imageSrc: krScreenOf("สกรีน 2 ด้าน (ใต้-บน)").imageSrc,
    },
    {
      name: "สกรีน 2 ด้าน (บน-บน)",
      desc: krScreenOf("สกรีน 2 ด้าน (บน-บน)").desc,
      extra: 45,
      imageSrc: krScreenOf("สกรีน 2 ด้าน (บน-บน)").imageSrc,
    },
  ],
};

// 5) การพิมพ์ (กระดาษ/PET) — เติมรูป+desc (PET เนื้อใสโดนกฎเหลือ 1 ด้าน)
{
  const pr = groupOf(d, "การพิมพ์");
  pr.display = "cards";
  pr.choices = [
    {
      name: "พิมพ์ด้านเดียว",
      desc: "พิมพ์ลายด้านหน้าด้านเดียว",
      imageSrc: `${IMG}/sticker-vacuum/sides-1.png`,
    },
    {
      name: "พิมพ์ 2 ด้าน",
      desc: "พิมพ์ลายทั้งสองด้าน หน้า-หลังคนละลายได้",
      extra: 10,
      imageSrc: `${IMG}/sticker-vacuum/sides-2.png`,
    },
  ];
}

// 6) เคลือบด้านหลัง (เดิม) → เคลือบด้านหน้า: เงา/ด้าน +10 · พิเศษ 30→40 · การ์ดมีรูป
{
  const coat = groupOf(d, "เคลือบด้านหลัง");
  coat.label = "เคลือบด้านหน้า";
  coat.display = "cards";
  coat.note = "PET เคลือบไม่ได้ (เคลือบได้เฉพาะกระดาษเกาหลี)";
  coat.choices = [
    { name: "ไม่เคลือบ", desc: paCoatOf("ไม่เคลือบ").desc, imageSrc: paCoatOf("ไม่เคลือบ").imageSrc },
    { name: "เคลือบเงา", desc: paCoatOf("เคลือบเงา").desc, extra: 10, imageSrc: paCoatOf("เคลือบเงา").imageSrc },
    { name: "เคลือบด้าน", desc: paCoatOf("เคลือบด้าน").desc, extra: 10, imageSrc: paCoatOf("เคลือบด้าน").imageSrc },
    { name: "เคลือบพิเศษ", desc: paCoatOf("เคลือบพิเศษ").desc, extra: 40, imageSrc: paCoatOf("เคลือบพิเศษ").imageSrc },
  ];
}

// 7) เคลือบด้านหลัง (ใหม่) — สวิตช์เปิด-ปิด (collapsible · ตัวแรก 0฿)
const backCoatGroup = {
  label: "เคลือบด้านหลัง",
  display: "cards",
  collapsible: true,
  showWhen: { label: "เรทราคา", choices: [RATE_PAPER] },
  choices: [
    {
      name: "ไม่เคลือบด้านหลัง",
      desc: "ด้านหลังเป็นงานพิมพ์เปลือย ไม่เคลือบฟิล์ม",
      imageSrc: paCoatOf("ไม่เคลือบ").imageSrc,
    },
    {
      name: "เคลือบเงา (ด้านหลัง)",
      desc: "เคลือบฟิล์มเงาด้านหลังด้วย กันรอยครบสองหน้า",
      extra: 10,
      imageSrc: paCoatOf("เคลือบเงา").imageSrc,
    },
    {
      name: "เคลือบด้าน (ด้านหลัง)",
      desc: "เคลือบฟิล์มด้านนุ่มที่ด้านหลังด้วย",
      extra: 10,
      imageSrc: paCoatOf("เคลือบด้าน").imageSrc,
    },
    {
      name: "เคลือบพิเศษ (ด้านหลัง)",
      desc: "ฟิล์มลายพิเศษด้านหลัง กลิตเตอร์ / ทราย / โฮโลแกรม",
      extra: 40,
      imageSrc: paCoatOf("เคลือบพิเศษ").imageSrc,
    },
  ],
};

// 8) ลายฟิล์มเคลือบพิเศษ หน้า/หลัง (ก็อปลายจาก paper-art-pet)
const filmFront = {
  label: "ลายเคลือบพิเศษ (ด้านหน้า)",
  display: "pills",
  showWhen: { label: "เคลือบด้านหน้า", choices: ["เคลือบพิเศษ"] },
  choices: structuredClone(filmChoices),
};
const filmBack = {
  label: "ลายเคลือบพิเศษ (ด้านหลัง)",
  display: "pills",
  showWhen: { label: "เคลือบด้านหลัง", choices: ["เคลือบพิเศษ (ด้านหลัง)"] },
  choices: structuredClone(filmChoices),
};

// 9) พิมพ์รองขาว (PET เนื้อใส) — แทนกลุ่ม multi เดิม "รองขาว (PET เนื้อใส)"
const whiteBaseGroup = {
  label: "พิมพ์รองขาว (PET เนื้อใส)",
  display: "cards",
  showWhen: { label: "เรทราคา", choices: [RATE_PAPER] },
  showWhenAlso: { label: "ชนิดวัสดุ", choices: [PET_CLEAR] },
  choices: [
    {
      name: "ไม่รองขาว",
      desc: "หมึกพิมพ์ลงบนเนื้อใสตรง ๆ ลายโปร่งแสง มองทะลุได้",
      imageSrc: `${IMG}/washi-sticker/04-white-none.jpg`,
    },
    {
      name: "รองขาว",
      desc: "พิมพ์รองพื้นขาวใต้ลาย สีสดทึบ อ่านชัด ไม่ทะลุ",
      extra: 20,
      imageSrc: `${IMG}/washi-sticker/05-white-yes.jpg`,
    },
  ],
};

/* ── ประกอบ options ใหม่ (เรียงตามลำดับหน้าจอ) ────────────────────────────── */
{
  const opts = d.options;
  // ถอดกลุ่ม multi รองขาวเดิม
  const oldWhite = idxOf("รองขาว (PET เนื้อใส)");
  if (oldWhite < 0) die('ไม่พบกลุ่มเดิม "รองขาว (PET เนื้อใส)"');
  opts.splice(oldWhite, 1);
  // แทรกสีอะคริลิคถัดจากชนิดวัสดุ
  opts.splice(idxOf("ชนิดวัสดุ") + 1, 0, shadeGroup);
  // งานสกรีนอะคริลิค ถัดจากการสกรีน MDF
  opts.splice(idxOf("การสกรีน") + 1, 0, acrScreenGroup);
  // รองขาว ถัดจากการพิมพ์ (ก่อนเคลือบ)
  opts.splice(idxOf("การพิมพ์") + 1, 0, whiteBaseGroup);
  // ลายฟิล์มหน้า ถัดจากเคลือบด้านหน้า
  opts.splice(idxOf("เคลือบด้านหน้า") + 1, 0, filmFront);
  // เคลือบด้านหลัง + ลายฟิล์มหลัง ต่อท้าย
  opts.push(backCoatGroup, filmBack);
}

/* ── กฎทิศเดียว ───────────────────────────────────────────────────────────── */
const mkRule = (whenLabel, whenChoices, limitLabel, allow) => ({
  when: { label: whenLabel, choice: whenChoices[0], choices: whenChoices },
  limit: { label: limitLabel, allow },
});
d.rules = [
  // เนื้อทึบ → สกรีนได้เฉพาะ บน-บน (C-02 ตัดสินที่กลุ่มชนิดวัสดุ · สีพิเศษไปตัดสินที่กลุ่มเฉด)
  mkRule("ชนิดวัสดุ", [ACR_C02], "งานสกรีน", ["สกรีน 2 ด้าน (บน-บน)"]),
  mkRule("สีอะคริลิค", opaqueShades, "งานสกรีน", ["สกรีน 2 ด้าน (บน-บน)"]),
  // PET เคลือบไม่ได้ (ทั้งหน้าและหลัง)
  mkRule("ชนิดวัสดุ", [PET_CLEAR, PET_WHITE], "เคลือบด้านหน้า", ["ไม่เคลือบ"]),
  mkRule("ชนิดวัสดุ", [PET_CLEAR, PET_WHITE], "เคลือบด้านหลัง", ["ไม่เคลือบด้านหลัง"]),
  // PET เนื้อใส พิมพ์ได้ด้านเดียว
  mkRule("ชนิดวัสดุ", [PET_CLEAR], "การพิมพ์", ["พิมพ์ด้านเดียว"]),
];

/* ── ข้อความ: แท็บรายละเอียด + FAQ + คำโปรย ───────────────────────────────── */
{
  const tab = (d.tabs ?? []).find((t) => t.title === "รายละเอียดเพิ่มเติม");
  if (!tab) die('ไม่พบแท็บ "รายละเอียดเพิ่มเติม"');
  tab.text = [
    "• MDF ขนาด 10x23cm · อะคริลิคขนาด 10x24cm · กระดาษ/PET ขายเป็นชุด ชุดละ 3 ชิ้น",
    "• MDF: สกรีน 2 ด้าน บวกเพิ่ม 45 บาท · 1-10 อันคละลายอิสระ · 11 อันขึ้นไปคละลายขั้นต่ำลายละ 5 อัน",
    "• อะคริลิค: งานสกรีน 2 ด้านทุกชิ้น (+45 บาท เลือกใต้-บน หรือ บน-บน) · เลือกเนื้อได้ อะคริลิคใส / ขาวขุ่น C-02 / สีพิเศษ 44 เฉด (+45 บาท/อัน) · เนื้อทึบสกรีนแบบ บน-บน เท่านั้น",
    "• อะคริลิค: 1-10 ชิ้นคละลายอิสระ · 11 ชิ้นขึ้นไปคละได้ลายละ 5 ชิ้น เกินโควตาบวกเพิ่มลายละ 5 บาท",
    "• กระดาษ/PET: พิมพ์ 2 ด้าน บวกชุดละ 10 บาท · เคลือบหน้า-หลังเลือกได้ทีละด้าน เงา/ด้าน +10 บาท · เคลือบพิเศษ +40 บาท",
    "• PET เคลือบไม่ได้ · PET เนื้อใสพิมพ์ได้ 1 ด้าน ต้องการรองขาวบวกเพิ่ม 20 บาท",
    "• กระดาษ/PET: 1-10 เซ็ตคละลายอิสระ · 11 เซ็ตขึ้นไปคละได้ลายละ 5 เซ็ต เกินโควตาบวกเพิ่มลายละ 5 บาท",
    "• อะคริลิคพิเศษหนาประมาณ 2.5-3mm · พื้นผิว MDF ส่วนที่ไม่สกรีนจะมีความเงา",
    "• ไฟล์ นามสกุล .Ai .Psd .Png หรือพื้นหลังใส",
    "• ทางร้านใช้สี RGB สีงานพิมพ์อาจสว่างกว่าหรือดรอปลง ±5-15% ตามไฟล์งาน",
  ].join("\n");

  d.seo.faqs = [
    {
      q: "ป้ายแขวนประตูมีวัสดุอะไรให้เลือกบ้าง?",
      a: "มี 3 กลุ่ม: MDF (10x23cm) · อะคริลิค (10x24cm) เลือกเนื้อได้ อะคริลิคใส / ขาวขุ่น C-02 / สีพิเศษ 44 เฉด · กระดาษเกาหลีหรือ PET (เนื้อใส/เนื้อขาว) ขายเป็นชุด ชุดละ 3 ชิ้น พร้อมภาพตัวอย่างของแต่ละแบบในหน้าสินค้า",
    },
    {
      q: "ราคาเท่าไหร่?",
      a: "กระดาษเกาหลีเริ่มชุดละ 90 บาท (3 ชิ้น) · MDF เริ่มอันละ 170 บาท · อะคริลิคเริ่มอันละ 250 บาท ยิ่งสั่งเยอะยิ่งถูก ดูตารางราคาของแต่ละวัสดุได้ในหน้าสินค้า",
    },
    {
      q: "สกรีน 2 ด้านได้ไหม?",
      a: "ได้ครับ MDF บวกเพิ่ม 45 บาท · อะคริลิคเป็นงานสกรีน 2 ด้านทุกชิ้น (+45 บาท เลือกใต้-บน หรือ บน-บน — เนื้อทึบสกรีนแบบ บน-บน) · กระดาษ/PET พิมพ์ 2 ด้านบวกชุดละ 10 บาท ยกเว้น PET เนื้อใสพิมพ์ได้ 1 ด้าน (ต้องการรองขาว +20 บาท)",
    },
    {
      q: "เคลือบได้ไหม?",
      a: "กระดาษเกาหลีเคลือบได้ทั้งด้านหน้าและด้านหลัง เลือกทีละด้าน — เงาหรือด้าน +10 บาท · เคลือบพิเศษ (กลิตเตอร์/ทราย/โฮโลแกรม) +40 บาท ต่อด้าน · PET เคลือบไม่ได้",
    },
    {
      q: "คละลายได้ไหม?",
      a: "จำนวน 1-10 ชิ้น/เซ็ตคละลายได้อิสระ · อะคริลิคและกระดาษ/PET 11 ขึ้นไปคละได้ลายละ 5 เกินโควตาบวกเพิ่มลายละ 5 บาท · MDF 11 อันขึ้นไปคละลายขั้นต่ำลายละ 5 อัน",
    },
  ];

  d.description =
    "ป้ายแขวนประตูพิมพ์ลายตามสั่ง เลือกวัสดุได้ 3 กลุ่ม: MDF · อะคริลิค (ใส/ขาวขุ่น C-02/สีพิเศษ 44 เฉด) · กระดาษเกาหลี/PET (ชุดละ 3 ชิ้น) พร้อมภาพตัวอย่างของแต่ละแบบ";
}

/* ── ตรวจผลก่อนบันทึก ─────────────────────────────────────────────────────── */
// จำลอง allowedChoices (ข้ามกฎจากกลุ่มที่ซ่อน) — แบบเดียวกับ acrylic-screen-by-material.mjs
const visible = (g, sel) => {
  const pass = (w) => !w?.label || !w.choices?.length || (sel[w.label] && w.choices.includes(sel[w.label]));
  return pass(g.showWhen) && pass(g.showWhenAlso) && (g.showWhenAll ?? []).every(pass);
};
const allowedSim = (sel, label) => {
  const g = groupOf(d, label);
  let allowed = g.choices.map((c) => c.name);
  for (const r of d.rules ?? []) {
    if (r.limit.label !== label) continue;
    const wg = groupOf(d, r.when.label);
    if (wg && !visible(wg, sel)) continue;
    const cur = sel[r.when.label];
    if (!cur || !(r.when.choices?.length ? r.when.choices : [r.when.choice]).includes(cur)) continue;
    allowed = allowed.filter((n) => r.limit.allow.includes(n));
  }
  return allowed.length ? allowed : g.choices.map((c) => c.name);
};
let bad = 0;
const check = (label, sel, group, want) => {
  const got = allowedSim(sel, group);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`   ${ok ? "✅" : "❌"} ${label} → [${got.join(" | ")}]`);
};
console.log("🔍 ตรวจกฎ:");
check("C-02 → งานสกรีน", { ชนิดวัสดุ: ACR_C02 }, "งานสกรีน", ["สกรีน 2 ด้าน (บน-บน)"]);
check(
  "สีพิเศษ + hologram-01 → งานสกรีน",
  { ชนิดวัสดุ: ACR_SPECIAL, สีอะคริลิค: "hologram-01" },
  "งานสกรีน",
  ["สกรีน 2 ด้าน (บน-บน)"]
);
check(
  "สีพิเศษ + กลิตเตอร์-เงิน (โปร่ง) → งานสกรีน",
  { ชนิดวัสดุ: ACR_SPECIAL, สีอะคริลิค: "อะคริลิคกลิตเตอร์-เงิน" },
  "งานสกรีน",
  ["สกรีน 2 ด้าน (ใต้-บน)", "สกรีน 2 ด้าน (บน-บน)"]
);
check(
  "ใส (เฉดทึบค้างในกลุ่มซ่อน) → งานสกรีน",
  { ชนิดวัสดุ: ACR_CLEAR, สีอะคริลิค: "hologram-01" },
  "งานสกรีน",
  ["สกรีน 2 ด้าน (ใต้-บน)", "สกรีน 2 ด้าน (บน-บน)"]
);
check("PET เนื้อใส → เคลือบด้านหน้า", { ชนิดวัสดุ: PET_CLEAR }, "เคลือบด้านหน้า", ["ไม่เคลือบ"]);
check("PET เนื้อขาว → เคลือบด้านหลัง", { ชนิดวัสดุ: PET_WHITE }, "เคลือบด้านหลัง", ["ไม่เคลือบด้านหลัง"]);
check("PET เนื้อใส → การพิมพ์", { ชนิดวัสดุ: PET_CLEAR }, "การพิมพ์", ["พิมพ์ด้านเดียว"]);
check("PET เนื้อขาว → การพิมพ์", { ชนิดวัสดุ: PET_WHITE }, "การพิมพ์", ["พิมพ์ด้านเดียว", "พิมพ์ 2 ด้าน"]);
check("กระดาษเกาหลี → เคลือบด้านหน้า", { ชนิดวัสดุ: PAPER_KR }, "เคลือบด้านหน้า", [
  "ไม่เคลือบ",
  "เคลือบเงา",
  "เคลือบด้าน",
  "เคลือบพิเศษ",
]);

// กับดักแกนตารางราคา: ทุกตัวเลือกชนิดวัสดุต้องมีเซลล์ในสักเรท และทุกเซลล์ต้องมีตัวเลือก
{
  const mat = groupOf(d, "ชนิดวัสดุ").choices.map((c) => c.name);
  const cellKeys = d.priceRates.flatMap((r) => Object.keys(r.pricing.cells));
  for (const n of mat)
    if (!cellKeys.includes(n)) {
      bad++;
      console.log(`   ❌ "${n}" ไม่มีเซลล์ราคาในเรทไหนเลย`);
    }
  for (const k of cellKeys)
    if (!mat.includes(k)) {
      bad++;
      console.log(`   ❌ เซลล์ "${k}" ไม่มีตัวเลือกในชนิดวัสดุ`);
    }
  // root pricing (กระจก MDF) ต้องยังชี้ MDF
  if (!d.pricing?.cells?.MDF) {
    bad++;
    console.log("   ❌ root pricing ไม่มีเซลล์ MDF");
  }
}
// collapsible: ตัวแรกต้อง 0฿
if (backCoatGroup.choices[0].extra) {
  bad++;
  console.log("   ❌ เคลือบด้านหลัง ตัวแรกไม่ใช่ 0฿");
}
// กติกาคละ
for (const [label, r] of [
  [RATE_ACR, rateOf(RATE_ACR)],
  [RATE_PAPER, rateOf(RATE_PAPER)],
]) {
  const ok = r.minPerDesign === 5 && r.freeMixBelowQty === 11 && r.extraDesignFee === 5;
  if (!ok) bad++;
  console.log(
    `   ${ok ? "✅" : "❌"} ${label}: minPerDesign=${r.minPerDesign} freeMixBelowQty=${r.freeMixBelowQty} extraDesignFee=${r.extraDesignFee}`
  );
}
// รูปภาพ: ทุกกลุ่มที่แตะต้องมีรูปครบทุกตัวเลือก
for (const label of [
  "ชนิดวัสดุ",
  "สีอะคริลิค",
  "งานสกรีน",
  "การพิมพ์",
  "พิมพ์รองขาว (PET เนื้อใส)",
  "เคลือบด้านหน้า",
  "เคลือบด้านหลัง",
  "ลายเคลือบพิเศษ (ด้านหน้า)",
  "ลายเคลือบพิเศษ (ด้านหลัง)",
]) {
  const g = groupOf(d, label);
  if (!g) {
    bad++;
    console.log(`   ❌ ไม่พบกลุ่ม "${label}"`);
    continue;
  }
  const miss = g.choices.filter((c) => !c.imageSrc).map((c) => c.name);
  // เมนูเฉดพวงกุญแจบางตัวไม่มีรูปมาแต่เดิม — ยอมรับเฉพาะกลุ่มนั้น
  const ok = miss.length === 0 || (label === "สีอะคริลิค" && miss.length <= 2);
  if (!ok) bad++;
  console.log(`   ${ok ? "✅" : "❌"} รูปกลุ่ม "${label}": ${g.choices.length - miss.length}/${g.choices.length}${miss.length ? ` (ขาด: ${miss.join(", ")})` : ""}`);
}
// รูปที่อ้างจาก storage ของเราต้องมีไฟล์จริง
{
  const urls = new Set();
  for (const o of d.options)
    for (const c of o.choices) if (c.imageSrc?.startsWith(IMG)) urls.add(c.imageSrc);
  const byFolder = {};
  for (const u of urls) {
    const rel = u.slice(IMG.length + 1);
    const folder = "products/" + rel.split("/").slice(0, -1).join("/");
    (byFolder[folder] ??= new Set()).add(rel.split("/").pop());
  }
  for (const [folder, names] of Object.entries(byFolder)) {
    const { data: files, error: e } = await sb.storage.from("product-images").list(folder, { limit: 500 });
    if (e) die(`ลิสต์ storage ${folder} ไม่ได้ — ${e.message}`);
    const have = new Set((files ?? []).map((f) => f.name));
    for (const n of names)
      if (!have.has(n)) {
        bad++;
        console.log(`   ❌ ไม่พบไฟล์ ${folder}/${n} ใน storage`);
      }
  }
  console.log(`   ✅ เช็คไฟล์รูปใน storage แล้ว ${urls.size} รายการ`);
}

if (bad) die(`ผลตรวจไม่ผ่าน ${bad} ข้อ — ไม่บันทึก`);

/* ── สรุป + บันทึก ────────────────────────────────────────────────────────── */
console.log("\n📋 กลุ่มตัวเลือกใหม่ตามลำดับ:");
for (const o of d.options)
  console.log(
    `   - ${o.label} (${o.choices.length} ตัว)${o.display ? ` display=${o.display}` : ""}${o.collapsible ? " collapsible" : ""}${o.showWhen ? ` ← ${o.showWhen.label}` : ""}${o.showWhenAlso ? ` +${o.showWhenAlso.label}` : ""}`
  );
console.log(`   rules ${d.rules.length} ข้อ`);

const outPath =
  process.env.PREVIEW_DIR
    ? `${process.env.PREVIEW_DIR}/door-hanger-preview.json`
    : new URL("../.door-hanger-preview.json", import.meta.url).pathname;
writeFileSync(outPath, JSON.stringify(d, null, 2));
console.log(`\n(เขียนพรีวิวไว้ที่ ${outPath})`);

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
d.savedAt = new Date().toISOString();
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) die(`บันทึกไม่สำเร็จ — ${e2.message}`);
console.log("✅ บันทึกลง Supabase แล้ว");
