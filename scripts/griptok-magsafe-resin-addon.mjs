#!/usr/bin/env node
/**
 * GRIPTOK MAGSAFE (griptok-magsafe) — เพิ่มตัวเลือก "เคลือบเรซิ่น" ของแผ่นอะคริลิค (Add On)
 *
 *   node scripts/griptok-magsafe-resin-addon.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/griptok-magsafe-resin-addon.mjs --write
 *
 * ผู้ใช้สั่ง 31 ส.ค. 69: กลุ่ม "เพิ่มแผ่นอะคริลิค (Add On)" ถ้าเลือกเพิ่มแผ่น
 * ให้มีตัวเลือกต่อว่า ไม่เคลือบเรซิ่น / เคลือบเรซิ่น (+40)
 *
 * ⚠️ ไม่รัน griptok-magsafe-apply.mjs ทับ — ข้อมูลจริงในตอนนี้ต่างจากสคริปต์นั้นแล้ว
 *    (กลุ่ม แบบ/ทรง ถูกเปลี่ยนเป็น display "cards" และไม่มี stockBearing ทีหลัง)
 *    สคริปต์นี้จึงอ่านของสดมาแก้เฉพาะจุด แล้วเขียนกลับ · รันซ้ำได้ (idempotent)
 *
 * รายชื่อขนาดใน showWhen ดึงจากกลุ่ม Add On สด ๆ — เว็บเพิ่ม/ลดขนาดเมื่อไหร่ รันซ้ำแล้วตามให้เอง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "griptok-magsafe";
const ADDON_LABEL = "เพิ่มแผ่นอะคริลิค (Add On)";
const ADDON_NONE = "ไม่เพิ่ม";
const RESIN_LABEL = "เคลือบเรซิ่นแผ่นอะคริลิค";
const RESIN_NO = "ไม่เคลือบเรซิ่น";
const RESIN_YES = "เคลือบเรซิ่น";
const RESIN_FEE = 40;
const COIL_LABEL = "Magsafe coil base";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
if (row.name !== "GRIPTOK MAGSAFE") throw new Error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
const d = structuredClone(row.data);

/* ── 1. กลุ่มใหม่ "เคลือบเรซิ่น" โผล่เฉพาะตอนเลือกเพิ่มแผ่น ───────────── */

const addonAt = (d.options ?? []).findIndex((o) => o.label === ADDON_LABEL);
if (addonAt < 0) throw new Error(`ไม่เจอกลุ่ม "${ADDON_LABEL}" — โครงตัวเลือกเปลี่ยน มาดูเองก่อน`);
const sizes = d.options[addonAt].choices.map((c) => c.name).filter((n) => n !== ADDON_NONE);
if (!sizes.length) throw new Error(`กลุ่ม "${ADDON_LABEL}" ไม่มีขนาดให้เลือกเลย (เจอแต่ "${ADDON_NONE}")`);

const RESIN = {
  label: RESIN_LABEL,
  display: "pills",
  showWhen: { label: ADDON_LABEL, choices: sizes },
  note: `เคลือบเฉพาะ**แผ่นอะคริลิคที่เพิ่ม** ผิวนูนเงา สีเข้มขึ้น — คิดเพิ่มชิ้นละ ${RESIN_FEE} บาท`,
  choices: [{ name: RESIN_NO }, { name: RESIN_YES, extra: RESIN_FEE }],
};

const had = d.options.findIndex((o) => o.label === RESIN_LABEL);
if (had >= 0) {
  d.options[had] = RESIN;
  console.log(`กลุ่ม "${RESIN_LABEL}" มีอยู่แล้ว — เขียนทับด้วยค่าล่าสุด (ลำดับที่ ${had + 1})`);
} else {
  d.options.splice(addonAt + 1, 0, RESIN);
  console.log(`เพิ่มกลุ่ม "${RESIN_LABEL}" ต่อจาก "${ADDON_LABEL}" (ก่อน "${COIL_LABEL}")`);
}
console.log(`   แสดงเมื่อ ${ADDON_LABEL} = ${sizes.join(" / ")}`);
console.log(`   ตัวเลือก: ${RESIN_NO} (0) · ${RESIN_YES} (+${RESIN_FEE}/ชิ้น)`);

/* ── 2. เติมบรรทัดในแท็บให้ตรงกัน (รันซ้ำไม่ซ้ำบรรทัด) ────────────────── */

const addLine = (title, after, line) => {
  const tab = (d.tabs ?? []).find((t) => t.title === title);
  if (!tab) throw new Error(`ไม่เจอแท็บ "${title}"`);
  if (tab.text.includes(line)) return console.log(`แท็บ "${title}" มีบรรทัดเคลือบเรซิ่นแล้ว`);
  const lines = tab.text.split("\n");
  const at = lines.findIndex((l) => after.test(l));
  if (at < 0) throw new Error(`ไม่เจอบรรทัดหลักในแท็บ "${title}" (${after}) — ข้อความเปลี่ยน มาดูเองก่อน`);
  lines.splice(at + 1, 0, line);
  tab.text = lines.join("\n");
  console.log(`แท็บ "${title}" — แทรกบรรทัดเคลือบเรซิ่นต่อจากบรรทัดแผ่นอะคริลิค`);
};
addLine(
  "รายละเอียดเพิ่มเติม",
  /^• .*แผ่นอะคริลิคไดคัท/,
  `• แผ่นอะคริลิคที่เพิ่ม เลือกเคลือบเรซิ่นได้ — ผิวนูนเงา สีเข้มขึ้น เพิ่มชิ้นละ ${RESIN_FEE} บาท`
);
addLine("ราคาแต่ละแบบ", /^• Magsafe coil base/, `• เคลือบเรซิ่นแผ่นอะคริลิค — เพิ่ม ${RESIN_FEE} บาท/ชิ้น`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียนฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw saveErr;
console.log("\n✅ บันทึกแล้ว");
