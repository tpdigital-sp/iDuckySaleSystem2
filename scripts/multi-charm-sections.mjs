#!/usr/bin/env node
/**
 * พวงกุญแจ หลายชิ้นใน 1 พวง — จัดกลุ่มตัวเลือกของแต่ละชิ้นให้เป็น "ชุด" มีกรอบ+หัวชุด
 * (ผู้ใช้สั่ง 29 ส.ค. 69: เลือกหลายชิ้นแล้วรายการตัวเลือกเรียงแบนเป็นพืด ดูงงและหลายตา)
 *
 *   node scripts/multi-charm-sections.mjs           # ดูก่อนว่าจะแก้อะไร
 *   node scripts/multi-charm-sections.mjs --write   # เขียนลงฐานข้อมูล
 *
 * ตั้ง ProductOption.section = "ชิ้นที่ k" ให้ทุกกลุ่มของชิ้นนั้น (ขนาด/ประเภท/สี/งานสกรีน)
 * หน้าสินค้าจะจับกลุ่มที่ชุดเดียวกันและอยู่ติดกันใส่กรอบเดียว พร้อมหัวชุด
 * และตัดชื่อชุดที่ซ้ำท้ายชื่อกลุ่มออกตอนแสดง ("ขนาดชิ้นที่ 2" → "ขนาด")
 * ⚠️ ชื่อกลุ่มเต็มไม่เปลี่ยน — ตะกร้า/ออเดอร์/ใบงาน/แกนตารางราคา ยังอ้างชื่อเดิมทั้งหมด
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-multi-charm";
const MAX_PIECES = 10;
/** กลุ่มของ "ชิ้นที่ k" = ชื่อกลุ่มที่ลงท้ายด้วยชื่อชุดพอดี */
const SECTION = (k) => `ชิ้นที่ ${k}`;

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

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const p = row.data;
const log = [];

let tagged = 0;
for (const o of p.options) {
  // ชิ้นที่ 10 ต้องเทียบก่อนชิ้นที่ 1 ไม่งั้น "ขนาดชิ้นที่ 10" จะไปเข้าชุด "ชิ้นที่ 1" ไม่ได้ (ไม่ลงท้ายพอดี)
  const k = [...Array(MAX_PIECES)].map((_, i) => MAX_PIECES - i).find((n) => o.label.endsWith(SECTION(n)));
  if (!k) {
    if (o.section) delete o.section; // เผื่อรันรอบก่อนติดผิดไว้
    continue;
  }
  o.section = SECTION(k);
  tagged++;
}
log.push(`ติดชุดให้ ${tagged} กลุ่ม (ชิ้นที่ 1-${MAX_PIECES})`);

/**
 * หัวกรอบบอกอยู่แล้วว่าชิ้นไหน — คำอธิบายที่พูดซ้ำว่า "ของชิ้นที่ k" ทุกกลุ่มกลายเป็นกำแพงตัวหนังสือ
 * (3 บรรทัด × 10 ชุด) เก็บคำอธิบายไว้เฉพาะชุดแรกที่ลูกค้าอ่านครั้งเดียวแล้วเข้าใจทั้งหน้า
 */
const NOTE1 = {
  "ขนาดชิ้นที่ 1": "วัดจากด้านที่ยาวที่สุด · เลือกได้ 2-10cm ต่อชิ้น",
  "ประเภทอะคริลิค ชิ้นที่ 1": "เนื้ออะคริลิคของชิ้นนี้ — ราคาคิดตามแบบที่เลือก",
  "งานสกรีน ชิ้นที่ 1": "แต่ละชิ้นในพวงเลือกไม่เหมือนกันได้ ราคาคิดตามสเปคของชิ้นนั้น ๆ",
};
let trimmed = 0;
for (const o of p.options) {
  if (!o.section) continue;
  if (NOTE1[o.label] !== undefined) {
    o.note = NOTE1[o.label];
    continue;
  }
  // ชุดที่ 2 เป็นต้นไป: ตัดคำอธิบายที่ซ้ำกับชุดแรกทิ้ง (ยกเว้นกลุ่มสีที่มีข้อมูลของตัวเอง)
  if (!o.section.endsWith(" 1") && !o.label.startsWith("สีอะคริลิค") && o.note) {
    delete o.note;
    trimmed++;
  }
}
log.push(`ตัดคำอธิบายที่ซ้ำในชุดที่ 2 ขึ้นไป ${trimmed} บรรทัด · เขียนคำอธิบายชุดแรกใหม่ให้สั้นลง`);

// สรุปว่าแต่ละชุดมีกลุ่มอะไรบ้าง + ชื่อที่จะโชว์ในกรอบ
const short = (o) => (o.section && o.label.endsWith(o.section) ? o.label.slice(0, -o.section.length).trim() || o.label : o.label);
for (const k of [1, 2, MAX_PIECES]) {
  const set = p.options.filter((o) => o.section === SECTION(k));
  log.push(`  ↳ ${SECTION(k)}: ${set.map(short).join(" · ")}`);
}

// ── ตรวจก่อนเขียน ──
const checks = [];
const ok = (name, pass) => checks.push(`${pass ? "✅" : "❌"} ${name}`);
const labels = p.options.map((o) => o.label);
ok("ทุกกลุ่มที่มีชุด อยู่ติดกันเป็นบล็อกเดียว (ไม่โดนกลุ่มอื่นคั่น)", (() => {
  const seen = new Set();
  let prev = null;
  for (const o of p.options) {
    if (o.section !== prev && o.section) {
      if (seen.has(o.section)) return false; // ชุดนี้เคยจบไปแล้ว แล้วโผล่ซ้ำ = โดนคั่น
      seen.add(o.section);
    }
    prev = o.section;
  }
  return true;
})());
ok(`ทุกชิ้น 1-${MAX_PIECES} มีชุดครบ`, [...Array(MAX_PIECES)].every((_, i) => p.options.some((o) => o.section === SECTION(i + 1))));
ok("ชื่อที่โชว์ในกรอบไม่ว่างและไม่ซ้ำกันในชุดเดียวกัน", [...Array(MAX_PIECES)].every((_, i) => {
  const names = p.options.filter((o) => o.section === SECTION(i + 1)).map(short);
  return names.every(Boolean) && new Set(names).size === names.length;
}));
ok("ชื่อกลุ่มเต็ม (ที่ตะกร้า/ตารางราคาอ้าง) ไม่ถูกแตะ", labels.includes("ขนาดชิ้นที่ 1") && p.pricing.driverLabels.every((d) => labels.includes(d)));
ok("กลุ่มนอกชุด (ตะขอ/ติ่งห้อย/รูปแบบการห้อย) ไม่ติดชุด",
  ["ตะขอ", "ติ่งห้อย", "รูปแบบการห้อย", "ความหนาอะคริลิค", "จำนวนชิ้นใน 1 พวง"].every((l) => !p.options.find((o) => o.label === l)?.section));

console.log(log.map((l) => "• " + l).join("\n"));
console.log("\n" + checks.join("\n"));
if (checks.some((c) => c.startsWith("❌"))) throw new Error("ตรวจไม่ผ่าน — ไม่เขียน");

p.savedAt = new Date().toISOString();
if (!WRITE) {
  console.log("\n👀 dry-run — เติม --write เพื่อเขียนจริง");
  process.exit(0);
}
const { error: wErr } = await sb.from("products").update({ data: p }).eq("id", ID);
if (wErr) throw wErr;
console.log(`\n✅ เขียน ${ID} แล้ว (ยังเป็นฉบับร่าง)`);
