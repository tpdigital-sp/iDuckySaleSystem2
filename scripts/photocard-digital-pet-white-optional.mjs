#!/usr/bin/env node
/**
 * Photo card Digital (photocard-digital) — PET สีใส: รองพื้นขาวเป็นตัวเลือก ไม่บังคับ
 *
 *   node scripts/photocard-digital-pet-white-optional.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/photocard-digital-pet-white-optional.mjs --write
 *
 * ผู้ใช้สั่ง 26 ส.ค. 69 (แก้จากรอบก่อนหน้าที่บวก 20 อัตโนมัติ):
 *   PET สีใส มีให้เลือกว่าจะ "พิมพ์รองพื้นขาว +20" หรือ "ไม่รองพื้นขาว"
 *   → ถอด extra 20 ออกจากตัวเลือก PET สีใส แล้วเพิ่มกลุ่มใหม่ให้เลือกเอง
 *     (โชว์เฉพาะ เรท PET + เลือก PET สีใส — ใส่ showWhenAlso กันค่าที่ค้างจากเรทอื่น)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "photocard-digital";
const EXPECT_NAME = "Photo card Digital";

const G_RATE = "เรทราคา";
const G_PET = "สี PET";
const G_WHITE = "พิมพ์รองพื้นขาว (PET สีใส)"; // กลุ่มใหม่
const RATE_PET = "พลาสติก PET 250 ไมครอน";
const PET_CLEAR = "PET สีใส";
const FEE = 20;

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

const petIdx = (d.options ?? []).findIndex((o) => o.label === G_PET);
if (petIdx < 0) die(`ไม่พบกลุ่ม "${G_PET}"`);
const petG = d.options[petIdx];
const petClear = petG.choices.find((c) => c.name === PET_CLEAR);
if (!petClear) die(`ไม่พบตัวเลือก "${PET_CLEAR}"`);
if (petClear.extra !== FEE) die(`extra ของ ${PET_CLEAR} ไม่ใช่ ${FEE} (${petClear.extra}) — สภาพ DB ไม่ตรงที่คาด`);
if ((d.options ?? []).some((o) => o.label === G_WHITE)) die(`มีกลุ่ม "${G_WHITE}" อยู่แล้ว — สคริปต์นี้รันไปแล้ว?`);

// 1. ถอดค่าบังคับ 20 ออกจากตัวเลือก PET สีใส
delete petClear.extra;
petClear.desc = "พิมพ์ลายได้ 1 ด้านเท่านั้น · เลือกพิมพ์รองพื้นขาวได้ +20 บาท";
petG.note = "PET สีใส พิมพ์ลายได้ 1 ด้าน · เลือกพิมพ์รองพื้นขาวได้ +20 บาท";

// 2. กลุ่มใหม่ให้ลูกค้าเลือกเอง — ต่อท้ายกลุ่มสี PET
d.options.splice(petIdx + 1, 0, {
  label: G_WHITE,
  note: "งานเนื้อใสถ้าไม่รองพื้นขาว สีที่พิมพ์จะโปร่งแสงตามเนื้อวัสดุ",
  showWhen: { label: G_PET, choices: [PET_CLEAR] },
  showWhenAlso: { label: G_RATE, choices: [RATE_PET] },
  choices: [{ name: "ไม่รองพื้นขาว" }, { name: "พิมพ์รองพื้นขาว", extra: FEE }],
});

// 3. แท็บ "รายละเอียดเพิ่มเติม" ให้ตรงกติกาใหม่
const tab = (d.tabs ?? []).find((t) => t.title === "รายละเอียดเพิ่มเติม");
if (!tab) die('ไม่พบแท็บ "รายละเอียดเพิ่มเติม"');
const rep = (from, to) => {
  if (!tab.text.includes(from)) die(`ไม่พบข้อความเดิมในแท็บ: ${from.slice(0, 60)}…`);
  tab.text = tab.text.replace(from, to);
};
rep(
  "PET สีใส จำเป็นต้องรองพื้นขาว ระบบบวก 20 บาทให้อัตโนมัติเมื่อเลือก)",
  "PET สีใส เลือกพิมพ์รองพื้นขาวได้เช่นกัน)"
);
rep(
  "• PET สีใส พิมพ์ลายได้ 1 ด้านเท่านั้น · มีค่าพิมพ์รองพื้นขาว 20 บาท (รวมให้อัตโนมัติเมื่อเลือก PET สีใส)",
  "• PET สีใส พิมพ์ลายได้ 1 ด้านเท่านั้น · เลือกได้ว่าจะพิมพ์รองพื้นขาว (บวกเพิ่ม 20 บาท) หรือไม่รองพื้นขาว — ไม่รองพื้นขาว สีที่พิมพ์จะโปร่งแสงตามเนื้อวัสดุ"
);

d.savedAt = new Date().toISOString();

console.log(`PET สีใส: extra=${petClear.extra ?? "(ไม่มีแล้ว)"} · desc=${petClear.desc}`);
console.log(`กลุ่มใหม่ "${G_WHITE}": ไม่รองพื้นขาว 0฿ · พิมพ์รองพื้นขาว +${FEE}฿ (โชว์เฉพาะเรท PET + PET สีใส)`);

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
const bPet = b.options.find((o) => o.label === G_PET).choices.find((c) => c.name === PET_CLEAR);
const bW = b.options.find((o) => o.label === G_WHITE);
const ok =
  bPet.extra === undefined &&
  !!bW &&
  bW.choices.length === 2 &&
  bW.choices[1].extra === FEE &&
  bW.showWhenAlso?.label === G_RATE &&
  b.tabs.find((t) => t.title === "รายละเอียดเพิ่มเติม").text.includes("เลือกได้ว่าจะพิมพ์รองพื้นขาว");
console.log(
  `อ่านกลับ: PET ใส extra=${JSON.stringify(bPet.extra)} · กลุ่มรองขาว=${bW ? bW.choices.map((c) => `${c.name}${c.extra ? ` +${c.extra}` : ""}`).join(" | ") : "❌"}`
);
if (!ok) die("เขียนแล้วแต่ค่าที่อ่านกลับไม่ตรง — ยังไม่เสร็จ");
console.log("✓ เขียน Supabase แล้ว (ยืนยันจากการอ่านกลับ)");
