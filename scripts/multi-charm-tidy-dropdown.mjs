#!/usr/bin/env node
/**
 * พวงกุญแจ หลายชิ้นใน 1 พวง — จัดหน้าให้กระชับ (ผู้ใช้ทัก 7 ก.ย. 69 ว่าหน้ารก)
 *
 *   node scripts/multi-charm-tidy-dropdown.mjs           # ดูก่อนว่าจะแก้อะไร
 *   node scripts/multi-charm-tidy-dropdown.mjs --write   # เขียนลงฐานข้อมูล
 *
 * 1. "รูปแบบการห้อย" + "รับตะขอไหม" การ์ด → เมนูเลื่อน (display: "dropdown")
 *    คำอธิบายของแต่ละตัวเลือกย้ายไป selectedNote — โชว์เฉพาะตัวที่เลือกเป็นกล่องใต้เมนู
 *    (desc เดิมคงไว้ เผื่อวันหลังสลับกลับเป็นการ์ด · การ์ดไม่โชว์ selectedNote ซ้ำ)
 * 2. ชุด "ติ่งห้อย ชิ้นที่ 1-9" ติดธง sectionClosed = เริ่มแบบหุบ
 *    (หัวชุดยังโชว์ค่าที่เลือกครบ กดกางได้ · กางหมดพร้อมกัน 9 ชุดแล้วหน้ายาวมาก)
 * ⚠️ ต้อง deploy โค้ด sectionClosed (products.ts/ProductDetail/ProductEditor) ก่อนข้อ 2 จะเห็นผลบน live
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-multi-charm";
const TO_DROPDOWN = ["รูปแบบการห้อย", "รับตะขอไหม"];
const CLOSED_SECTION = /^ติ่งห้อย ชิ้นที่ \d+$/;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (msg) => {
  console.error("⛔", msg);
  process.exit(1);
};

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const p = row.data;
const log = [];

// ── 1. การ์ด → เมนูเลื่อน + คำอธิบายตัวที่เลือกใต้เมนู ──
for (const label of TO_DROPDOWN) {
  const o = p.options.find((x) => x.label === label);
  if (!o) die(`ไม่พบกลุ่ม "${label}"`);
  if (o.display !== "dropdown") {
    log.push(`"${label}": display ${o.display ?? "(default)"} → dropdown`);
    o.display = "dropdown";
  }
  for (const c of o.choices) {
    if (c.desc && c.selectedNote !== c.desc) {
      c.selectedNote = c.desc;
      log.push(`  - "${c.name}": selectedNote ← desc (${c.desc.slice(0, 30)}…)`);
    }
  }
}

// ── 2. ชุดติ่งห้อยเริ่มแบบหุบ ──
for (const o of p.options) {
  if (o.section && CLOSED_SECTION.test(o.section) && !o.sectionClosed) {
    o.sectionClosed = true;
    log.push(`"${o.label}" [${o.section}]: sectionClosed = true`);
  }
}

if (!log.length) {
  console.log("✓ ไม่มีอะไรต้องแก้ — ค่าลงครบแล้ว");
  process.exit(0);
}
console.log(log.join("\n"));
if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

p.savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (e2) throw e2;
if (!upd?.length) die("update โดน 0 แถว");

// ── อ่านกลับเทียบรูปร่างของค่าจริง (อย่าเชื่อว่าไม่มี error = สำเร็จ) ──
const { data: back, error: e3 } = await sb.from("products").select("data").eq("id", ID).single();
if (e3) throw e3;
const b = back.data;
for (const label of TO_DROPDOWN) {
  const o = b.options.find((x) => x.label === label);
  if (o?.display !== "dropdown") die(`อ่านกลับ: "${label}" display ยังเป็น ${o?.display}`);
  for (const c of o.choices)
    if (c.desc && !(typeof c.selectedNote === "string" && c.selectedNote.length > 0))
      die(`อ่านกลับ: "${label}" → "${c.name}" ไม่มี selectedNote`);
}
const closedCount = b.options.filter((o) => o.section && CLOSED_SECTION.test(o.section) && o.sectionClosed === true).length;
const shouldClose = b.options.filter((o) => o.section && CLOSED_SECTION.test(o.section)).length;
if (closedCount !== shouldClose || shouldClose === 0) die(`อ่านกลับ: sectionClosed ${closedCount}/${shouldClose} กลุ่ม`);
if (b.savedAt !== p.savedAt) die(`อ่านกลับ: savedAt ไม่ตรง (${b.savedAt})`);
console.log(`\n✓ เขียนแล้ว + อ่านกลับตรงทุกข้อ (sectionClosed ${closedCount} กลุ่ม · savedAt ${p.savedAt})`);
