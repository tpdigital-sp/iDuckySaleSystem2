#!/usr/bin/env node
/**
 * "กระดาษอาร์ตมัน | PET" (paper-art-pet) — ถอดกลุ่มตัวเลือก "Add On" (พิมพ์รองสีเงิน / สีขาว) ออกทั้งชุด
 *
 *   node scripts/paper-art-pet-remove-addon.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/paper-art-pet-remove-addon.mjs --write
 *
 * ถอด 4 ที่ (ถ้าเหลือค้างไว้ ลูกค้าจะเจอข้อความโฆษณาของที่เลือกไม่ได้แล้ว):
 *   1. กลุ่ม "Add On" ใน options
 *   2. กฎ 2 ข้อที่กรอง Add On ตามวัสดุ PET (สีขาว→พิมพ์รองสีเงิน · สีใส→พิมพ์รองสีขาว) — กฎกำพร้า
 *   3. ข้อความใน data.terms 2 บรรทัด (วงเล็บ Add On ท้ายบรรทัด PET + บรรทัดรอบผลิตงานพิมพ์รอง)
 *   4. ข้อความในแท็บ "รายละเอียดงานพิมพ์" 1 บรรทัด
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "paper-art-pet";
const EXPECT_NAME = "กระดาษอาร์ตมัน | PET";
const ADDON = "Add On";

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

/* 1. กลุ่ม Add On */
const grp = d.options.find((o) => o.label === ADDON);
if (!grp) die(`ไม่พบกลุ่ม "${ADDON}" — ถอดไปแล้วหรือชื่อเปลี่ยน`);
console.log(`1. ถอดกลุ่ม "${ADDON}": ${grp.choices.map((c) => `${c.name}${c.extra ? ` +฿${c.extra}` : ""}`).join(" · ")}`);
d.options = d.options.filter((o) => o.label !== ADDON);

/* กลุ่มอื่นต้องไม่ได้ผูก showWhen ไว้กับ Add On (ไม่งั้นจะโผล่ค้างโดยไม่มีเงื่อนไข) */
const orphanShow = d.options.filter((o) => [o.showWhen?.label, o.showWhenAlso?.label].includes(ADDON));
if (orphanShow.length) die(`มีกลุ่มผูก showWhen ไว้กับ ${ADDON}: ${orphanShow.map((o) => o.label).join(", ")} — ต้องจัดการก่อน`);

/* 2. กฎที่อ้าง Add On */
const killRules = (d.rules ?? []).filter((r) => r.limit?.label === ADDON);
console.log(`2. ถอดกฎ ${killRules.length} ข้อ:`);
for (const r of killRules) console.log(`   · ${r.when.label} = ${(r.when.choices ?? [r.when.choice]).join("/")} → ${r.limit.allow.join("/")}`);
d.rules = (d.rules ?? []).filter((r) => r.limit?.label !== ADDON);

/* 3. ข้อความ "ข้อควรทราบ" (data.terms) */
const TERMS_EDITS = [
  // ตัดแค่วงเล็บท้ายบรรทัด — ตัวเลือกวัสดุ PET ขาว/ใส ยังมีอยู่จริง
  {
    from: "• PET เลือกวัสดุได้ 2 แบบ — สีขาว / สีใส (PET สีใส เพิ่ม Add On พิมพ์รองสีขาว +฿20)",
    to: "• PET เลือกวัสดุได้ 2 แบบ — สีขาว / สีใส",
  },
  // รอบผลิต/วันส่งของงานพิมพ์รองโดยเฉพาะ — ไม่ขายแล้วก็ไม่มีความหมาย
  { from: "• งานพิมพ์รอง (สีเงิน / สีขาว) ผลิตอาทิตย์ละ 1 รอบ จัดส่งทุกวันศุกร์", to: null },
];
let termLines = String(d.terms ?? "").split("\n");
console.log("3. แก้ข้อความ data.terms:");
for (const e of TERMS_EDITS) {
  const at = termLines.indexOf(e.from);
  if (at < 0) die(`ไม่เจอบรรทัดที่จะแก้ใน terms:\n   "${e.from}"`);
  console.log(`   · ${e.to === null ? "ลบบรรทัด" : "แก้"}: ${e.from}`);
  if (e.to === null) termLines.splice(at, 1);
  else termLines[at] = e.to;
}
d.terms = termLines.join("\n");

/* 4. ข้อความในแท็บ */
console.log("4. แก้ข้อความในแท็บ:");
let tabHits = 0;
for (const tab of d.tabs ?? []) {
  if (typeof tab.text !== "string" || !tab.text.includes(ADDON)) continue;
  const keep = tab.text.split("\n").filter((ln) => {
    if (!ln.includes(ADDON)) return true;
    console.log(`   · แท็บ "${tab.title}" ลบบรรทัด: ${ln}`);
    tabHits++;
    return false;
  });
  tab.text = keep.join("\n");
}
if (tabHits === 0) console.log("   (ไม่มี)");

/* กันตกหล่น — ต้องไม่เหลือคำว่า Add On ที่ไหนอีก */
const leftover = JSON.stringify(d).includes(ADDON);
if (leftover) die(`ยังเหลือคำว่า "${ADDON}" ในข้อมูลอยู่ — เช็คก่อนเขียน`);
d.savedAt = new Date().toISOString();

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { data: wrote, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!wrote?.length) die("update ไม่โดนแถวไหนเลย (0 rows)");

// อ่านกลับมายืนยัน — เคยเจอ update ผ่านแต่ค่าไม่ลงจริง
const { data: back } = await sb.from("products").select("data").eq("id", ID);
const b = back[0].data;
if (JSON.stringify(b).includes(ADDON)) die(`เขียนแล้วแต่ยังเจอ "${ADDON}" ตอนอ่านกลับ — ยังไม่เสร็จ`);
console.log(`\nอ่านกลับ: ไม่เหลือ "${ADDON}" · กลุ่มคงเหลือ ${b.options.length} กลุ่ม · กฎคงเหลือ ${b.rules.length} ข้อ`);
console.log("✓ เขียน Supabase แล้ว (ยืนยันจากการอ่านกลับ)");
