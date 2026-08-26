#!/usr/bin/env node
/**
 * POSTER A3 (poster-a3) — งานที่ผู้ใช้สั่ง 26 ส.ค. 69
 *
 *   node scripts/poster-a3-pet-and-two-sides.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/poster-a3-pet-and-two-sides.mjs --write
 *
 * 1) พิมพ์ 2 ด้าน +10 บาท/แผ่น (กลุ่ม "จำนวนด้านที่พิมพ์")
 * 2) กลุ่ม "เคลือบด้านหลัง" โผล่เมื่อเลือกพิมพ์ 2 ด้าน (เงา/ด้าน +10 · พิเศษ +30)
 *    — ข้อ 1-2 มีอยู่ใน DB แล้ว สคริปต์เช็ค/เติมให้ครบเฉย ๆ
 * 3) ลบ Add On "พิมพ์รองสีเงิน" ออกทั้งตัวเลือกและข้อความ
 * 4) PET: กลุ่ม "วัสดุ PET" (สีขาว | สีใส)
 *    · สีใส สกรีนได้ 1 ด้าน (กฎล็อก "จำนวนด้านที่พิมพ์")
 *    · สีใส เลือก "พิมพ์รองขาว" +20 บาท/แผ่นได้
 *    · PET เคลือบฟิล์มไม่ได้ — ด้านหน้ามีกฎเดิมอยู่แล้ว เพิ่มกฎฝั่งเคลือบด้านหลังให้ครบ
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "poster-a3";
const EXPECT_NAME = "POSTER";

const PAPER = "ชนิดกระดาษ";
const PET = "พลาสติก PET 250 แกรม";
const PET_MAT = "วัสดุ PET";
const CLEAR = "สีใส";
const WHITE = "สีขาว";
const SIDES = "จำนวนด้านที่พิมพ์";
const ONE_SIDE = "พิมพ์ 1 ด้าน";
const TWO_SIDE = "พิมพ์ 2 ด้าน";
const BACK_COAT = "เคลือบด้านหลัง";
const NO_BACK_COAT = "ไม่เคลือบด้านหลัง";
const UNDER_WHITE = "พิมพ์รองขาว";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};
const log = [];
const did = (msg) => {
  log.push(msg);
  console.log("· " + msg);
};

const { data: rows, error } = await sb.from("products").select("*").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า id=${ID}`);
if (row.name !== EXPECT_NAME) die(`ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);

const d = row.data;
const opts = (d.options ??= []);
const group = (label) => opts.find((o) => o.label === label);
const at = (label) => opts.findIndex((o) => o.label === label);

if (!group(PAPER)?.choices?.some((c) => c.name === PET)) die(`ไม่พบตัวเลือก "${PET}" ในกลุ่ม ${PAPER}`);

/* ---------- 1) พิมพ์ 2 ด้าน +10 ---------- */
let sides = group(SIDES);
if (!sides) {
  sides = { label: SIDES, choices: [{ name: ONE_SIDE }, { name: TWO_SIDE, extra: 10 }] };
  opts.push(sides);
  did(`เพิ่มกลุ่ม "${SIDES}" (${TWO_SIDE} +10)`);
} else {
  const two = sides.choices.find((c) => c.name === TWO_SIDE);
  if (!two) {
    sides.choices.push({ name: TWO_SIDE, extra: 10 });
    did(`เติมตัวเลือก "${TWO_SIDE}" +10`);
  } else if (two.extra !== 10) {
    two.extra = 10;
    did(`ตั้ง "${TWO_SIDE}" = +10 บาท/แผ่น`);
  } else {
    did(`"${TWO_SIDE}" +10 มีอยู่แล้ว — ไม่แก้`);
  }
}

/* ---------- 2) เคลือบด้านหลัง (เฉพาะพิมพ์ 2 ด้าน) ---------- */
let back = group(BACK_COAT);
if (!back) {
  back = {
    label: BACK_COAT,
    choices: [
      { name: NO_BACK_COAT },
      { name: "เคลือบเงา/ด้าน (ด้านหลัง)", extra: 10 },
      { name: "เคลือบพิเศษ (ด้านหลัง)", extra: 30 },
    ],
    showWhen: { label: SIDES, choices: [TWO_SIDE] },
  };
  opts.splice(at(SIDES) + 1, 0, back);
  did(`เพิ่มกลุ่ม "${BACK_COAT}" (โผล่เมื่อเลือก ${TWO_SIDE})`);
} else {
  back.showWhen = { label: SIDES, choices: [TWO_SIDE] };
  did(`"${BACK_COAT}" มีอยู่แล้ว (โผล่เมื่อเลือก ${TWO_SIDE}) — ไม่แก้ราคา`);
}

/* ---------- 3) ลบ Add On "พิมพ์รองสีเงิน" ---------- */
let silver = 0;
for (const o of [...opts]) {
  const before = o.choices?.length ?? 0;
  if (!before) continue;
  o.choices = o.choices.filter((c) => !c.name?.includes("รองสีเงิน"));
  silver += before - o.choices.length;
  // กลุ่มที่เหลือศูนย์ตัวเลือก (Add On มีแต่พิมพ์รองสีเงิน) = ถอดทั้งกลุ่ม
  if (o.choices.length === 0 && before > 0 && !o.display?.includes("input") && !o.input) {
    opts.splice(opts.indexOf(o), 1);
    did(`ถอดกลุ่ม "${o.label}" (ไม่เหลือตัวเลือก)`);
  }
}
did(silver ? `ลบตัวเลือกพิมพ์รองสีเงิน ${silver} รายการ` : "ไม่มีพิมพ์รองสีเงินให้ลบแล้ว");

/* ---------- 4) PET: วัสดุ ใส/ขาว + รองขาว + ห้ามเคลือบ ---------- */
if (!group(PET_MAT)) {
  opts.splice(at(PAPER) + 1, 0, {
    label: PET_MAT,
    choices: [
      { name: WHITE, desc: "เนื้อขาวทึบ พิมพ์สีได้เหมือนกระดาษ · สกรีนได้ 2 ด้าน" },
      { name: CLEAR, desc: "เนื้อใสมองทะลุ · สกรีนได้ 1 ด้าน · เพิ่มพิมพ์รองขาวให้สีทึบขึ้นได้" },
    ],
    showWhen: { label: PAPER, choices: [PET] },
  });
  did(`เพิ่มกลุ่ม "${PET_MAT}" (${WHITE} | ${CLEAR}) โผล่เมื่อเลือก ${PET}`);
} else {
  did(`"${PET_MAT}" มีอยู่แล้ว — ไม่แก้`);
}

if (!group(UNDER_WHITE)) {
  opts.splice(at(PET_MAT) + 1, 0, {
    label: UNDER_WHITE,
    choices: [
      { name: "ไม่พิมพ์รองขาว" },
      { name: "พิมพ์รองขาว", extra: 20, desc: "พิมพ์สีขาวรองใต้ลาย สีทึบขึ้น ไม่จมไปกับพื้นใส" },
    ],
    showWhen: { label: PET_MAT, choices: [CLEAR] },
    // กันค้าง: ถ้าลูกค้าเปลี่ยนกลับไปใช้กระดาษ กลุ่ม "วัสดุ PET" ซ่อนแต่ค่ายังค้างเป็นสีใส
    showWhenAlso: { label: PAPER, choices: [PET] },
  });
  did(`เพิ่มกลุ่ม "${UNDER_WHITE}" +20 บาท/แผ่น (เฉพาะ PET ${CLEAR})`);
} else {
  did(`"${UNDER_WHITE}" มีอยู่แล้ว — ไม่แก้`);
}

const rules = (d.rules ??= []);
const hasRule = (whenLabel, limitLabel) =>
  rules.some((r) => r.when?.label === whenLabel && r.limit?.label === limitLabel);

if (!hasRule(PET_MAT, SIDES)) {
  rules.push({
    when: { label: PET_MAT, choice: CLEAR, choices: [CLEAR] },
    limit: { label: SIDES, allow: [ONE_SIDE] },
  });
  did(`กฎ: PET ${CLEAR} → สกรีนได้เฉพาะ ${ONE_SIDE}`);
}
if (!hasRule(PAPER, BACK_COAT)) {
  rules.push({
    when: { label: PAPER, choice: PET, choices: [PET] },
    limit: { label: BACK_COAT, allow: [NO_BACK_COAT] },
  });
  did(`กฎ: ${PET} → เคลือบด้านหลังไม่ได้`);
}
// กฎเดิม (PET → เคลือบด้านหน้าได้แค่ "ไม่เคลือบ") ต้องยังอยู่
if (!hasRule(PAPER, "เคลือบ (เฉพาะด้านหน้า)")) die("กฎ PET ห้ามเคลือบด้านหน้าหายไป — ผิดคาด หยุดก่อน");

/* ---------- ข้อความให้ตรงกับตัวเลือก ---------- */
const SILVER_TERM = "• งานพิมพ์รองสีเงินผลิตอาทิตย์ละ 1 รอบ จัดส่งทุกวันศุกร์";
const PET_TERM_OLD = "• แผ่นพลาสติก PET เคลือบเพิ่มไม่ได้ (ตัววัสดุกันน้ำอยู่แล้ว)";
const PET_TERM_NEW =
  "• แผ่นพลาสติก PET เลือกได้ทั้งสีขาวและสีใส · เคลือบฟิล์มเพิ่มไม่ได้ทั้งสองด้าน (ตัววัสดุกันน้ำอยู่แล้ว)\n• PET สีใส สกรีนได้ 1 ด้าน · เลือกพิมพ์รองขาวเพิ่มได้ แผ่นละ 20 บาท";
if (typeof d.terms === "string") {
  const before = d.terms;
  d.terms = d.terms
    .split("\n")
    .filter((l) => l.trim() !== SILVER_TERM)
    .join("\n")
    .replace(PET_TERM_OLD, PET_TERM_NEW);
  if (d.terms !== before) did("แก้ข้อความ terms");
}

const TAB_EDITS = [
  ["• Add On พิมพ์รองสีเงิน บวกเพิ่ม 20 บาท/แผ่น", "• PET สีใส เลือกพิมพ์รองขาวได้ บวกเพิ่ม 20 บาท/แผ่น"],
  [
    "• ขนาดมาตรฐาน A3 (29.7 × 42 ซม.) แนวตั้งหรือแนวนอน",
    "• ขนาดมาตรฐาน A3 (29.7 × 42 ซม.) แนวตั้งหรือแนวนอน\n• แผ่นพลาสติก PET 250 แกรม เลือกได้ 2 แบบ — สีขาว (สกรีน 2 ด้านได้) / สีใส (สกรีน 1 ด้าน)",
  ],
  [
    "• เคลือบเงา / ด้าน / พิเศษ เคลือบเฉพาะด้านที่สกรีนเท่านั้น",
    "• เคลือบเงา / ด้าน / พิเศษ เคลือบเฉพาะด้านที่สกรีนเท่านั้น\n• แผ่นพลาสติก PET เคลือบฟิล์มเพิ่มไม่ได้ทั้งด้านหน้าและด้านหลัง (ตัววัสดุกันน้ำอยู่แล้ว)\n• PET สีใส สกรีนได้ 1 ด้าน — เลือกพิมพ์รองขาวเพิ่มได้ แผ่นละ 20 บาท ให้สีทึบไม่จมไปกับพื้นใส",
  ],
];
const SILVER_TAB_LINE = "• งานพิมพ์รองสีเงิน จัดส่งทุกวันศุกร์";
let tabFix = 0;
for (const tab of d.tabs ?? []) {
  if (typeof tab.text !== "string") continue;
  const before = tab.text;
  tab.text = tab.text
    .split("\n")
    .filter((l) => !l.trim().startsWith(SILVER_TAB_LINE))
    .join("\n");
  for (const [from, to] of TAB_EDITS) {
    if (tab.text.includes(from) && !tab.text.includes(to)) tab.text = tab.text.replace(from, to);
  }
  if (tab.text !== before) tabFix++;
}
if (tabFix) did(`แก้ข้อความแท็บ ${tabFix} แท็บ`);

const HL_OLD = "แผ่นพลาสติก PET หนา 250 แกรม — กันน้ำ ไม่ฉีกขาด รักษ์โลก";
const HL_NEW = "แผ่นพลาสติก PET หนา 250 แกรม สีขาว / สีใส — กันน้ำ ไม่ฉีกขาด รักษ์โลก";
if (Array.isArray(d.highlights)) {
  const i = d.highlights.indexOf(HL_OLD);
  if (i >= 0) {
    d.highlights[i] = HL_NEW;
    did("แก้ highlight ของ PET");
  }
}

/* ---------- เขียน ---------- */
console.log("\nกลุ่มตัวเลือกหลังแก้:");
for (const o of opts) {
  const cond = [o.showWhen, o.showWhenAlso].filter(Boolean).map((c) => `${c.label}=${c.choices.join("/")}`);
  console.log(
    `  ${o.label}${cond.length ? " [" + cond.join(" & ") + "]" : ""} → ` +
      o.choices.map((c) => c.name + (c.extra ? ` +${c.extra}` : "")).join(" | ")
  );
}
if (!WRITE) {
  console.log("\n(dry run — เติม --write เพื่อบันทึกจริง)");
  process.exit(0);
}
d.savedAt = new Date().toISOString();
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) die(e2.message);
console.log("\n✓ บันทึกลง DB แล้ว");
