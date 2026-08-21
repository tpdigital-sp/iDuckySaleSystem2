#!/usr/bin/env node
/**
 * ซ่อมกฎตัวเลือกของ "พวงกุญแจอะคริลิค" ที่ค้างชื่อเก่าไว้หลังแยก "ใส / ขาวขุ่น C-02"
 *
 *   node scripts/fix-keyring-acrylic-rules.mjs            # ดูผลก่อน (ไม่เขียนฐานข้อมูล)
 *   node scripts/fix-keyring-acrylic-rules.mjs --write    # บันทึกจริง
 *
 * อาการที่เจอ (http://localhost:3005/products/keyring):
 *   ในกลุ่ม "สีอะคริลิค" ไม่มี "อะคริลิคใส" กับ "อะคริลิคขาวขุ่น C-02" ให้เลือก
 *   แถมราคาที่โชว์เป็นเรทสีพิเศษ (฿90) ทั้งที่ยังไม่ได้เลือกสีพิเศษ (เรทใสคือ ฿80)
 *
 * ต้นเหตุ — scripts/split-acrylic-clear-c02.mjs แยกชื่อตัวเลือกกับกางช่องราคาให้ แต่ไม่ได้แก้ `rules`:
 *   1) กฎ "หนา 3mm → ประเภทอะคริลิค ได้แค่ [ใส / ขาวขุ่น C-02, สีพิเศษ]" — ชื่อแรกไม่มีอยู่จริงแล้ว
 *      เหลืออนุญาตตัวเดียวคือ "สีพิเศษ" → กลุ่มนี้ (ซึ่งเป็นแกนราคา) ถูกบังคับเป็นสีพิเศษตลอด
 *   2) กฎ "ประเภทอะคริลิค = สีพิเศษ → สีอะคริลิค ได้แค่ 44 สีพิเศษ" จึงทำงานตลอดเวลา
 *      → ใส กับ C-02 หายไปจากรายการสี
 *   3) กฎ "ประเภทอะคริลิค = ใส / ขาวขุ่น C-02 → สีอะคริลิค ได้แค่ [ใส, C-02]" กลายเป็นกฎตาย
 *
 * วิธีซ่อม — กลับทิศให้ "สีอะคริลิค" (กลุ่มที่ลูกค้าเห็นจริง) เป็นตัวกำหนด "ประเภทอะคริลิค" (แกนราคา)
 *   กลุ่ม "ประเภทอะคริลิค" ถูกซ่อนถาวรอยู่แล้ว (showWhen ชี้ชื่อ "สกรีน 1 ด้าน / สกรีน 2 ด้าน"
 *   ซึ่งกลุ่มงานสกรีนเปลี่ยนเป็น "สกรีน 1 ด้าน (ใต้)" ฯลฯ ไปนานแล้ว) — ปล่อยให้ซ่อนต่อ
 *   แล้วให้ระบบเลือกช่องราคาให้เองจากสีที่ลูกค้าเลือก จะได้ไม่ต้องให้ลูกค้าเลือกวัสดุซ้ำสองที่
 *
 *   ⚠️ ห้ามคงกฎ "ประเภท = สีพิเศษ → สีอะคริลิค ได้แค่ 44 สี" ไว้คู่กัน — จะวนกันเอง
 *      (เลือกสีพิเศษ → ประเภทเป็นสีพิเศษ → รายการสีเหลือ 44 → กดกลับมาที่ใสไม่ได้อีก)
 *
 * ที่ไม่ได้แก้ในนี้ (ของเดิมเป็นแบบนี้อยู่ก่อนแล้ว คนละเรื่องกับที่แจ้งมา):
 *   • กลุ่ม "สรีนด้าน" ซ่อนถาวรเหมือนกัน — ตอนนี้ข้อมูลด้านสกรีนไปอยู่ในชื่อของกลุ่ม "งานสกรีน" แล้ว
 *   • กฎสีตะขอที่ชี้กลุ่มชื่อ "ตะขอ E " / "สีตะขอ" ซึ่งไม่มีอยู่จริง (สีตะขอใช้ showWhen แทน กฎพวกนี้ตายอยู่)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-copy-copy"; // ลิงก์หน้าร้านคือ /products/keyring (slug)

const CLEAR = "อะคริลิคใส";
const C02 = "อะคริลิคขาวขุ่น C-02";
const CLEAR_ONLY = "ใสเท่านั้น"; // ช่องราคาของงานหนา 1mm/2mm (ทำได้เฉพาะอะคริลิคใส)
const SPECIAL = "สีพิเศษ (โฮโลแกรม/กลิสเตอร์/สี)";
const MERGED = "ใส / ขาวขุ่น C-02"; // ชื่อเดิมก่อนแยก — ไม่มีอยู่ในตัวเลือกแล้ว
const TYPE = "ประเภทอะคริลิค";
const COLOR = "สีอะคริลิค";

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

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw new Error(`อ่าน ${ID} ไม่สำเร็จ — ${error.message}`);
const d = structuredClone(row.data);
console.log(`📦 ${d.name} (${ID})`);

const names = (label) => (d.options?.find((o) => o.label === label)?.choices ?? []).map((c) => c.name);
const typeNames = names(TYPE);
const colorNames = names(COLOR);
for (const [label, list] of [[TYPE, typeNames], [COLOR, colorNames]]) {
  if (!list.length) throw new Error(`ไม่เจอกลุ่ม "${label}"`);
}
for (const n of [CLEAR, C02, CLEAR_ONLY, SPECIAL]) {
  if (!typeNames.includes(n)) throw new Error(`กลุ่ม "${TYPE}" ไม่มีตัวเลือก "${n}" — ข้อมูลไม่ตรงกับที่คาดไว้`);
}
for (const n of [CLEAR, C02]) {
  if (!colorNames.includes(n)) throw new Error(`กลุ่ม "${COLOR}" ไม่มีตัวเลือก "${n}" — ยังไม่ได้แยกใส/C-02?`);
}

/** สีพิเศษ = ทุกสีในกลุ่ม "สีอะคริลิค" ที่ไม่ใช่ใส/C-02 (อ่านจากของจริง ไม่ฮาร์ดโค้ดลิสต์ 44 สี) */
const specialColors = colorNames.filter((n) => n !== CLEAR && n !== C02);
const rule = (whenLabel, whenChoices, limitLabel, allow) => ({
  when: { label: whenLabel, choice: whenChoices[0], choices: whenChoices },
  limit: { label: limitLabel, allow },
});

const before = JSON.stringify(d.rules);
const kept = [];
let fixed3mm = false;
let droppedTypeToColor = 0;
for (const r of d.rules ?? []) {
  // 1) กฎแกนราคาของงานหนา 3mm — เปลี่ยนชื่อรวมเดิมเป็นสองชื่อที่แยกแล้ว
  if (r.limit?.label === TYPE && r.limit.allow?.includes(MERGED)) {
    r.limit.allow = r.limit.allow.flatMap((n) => (n === MERGED ? [CLEAR, C02] : [n]));
    fixed3mm = true;
    console.log(`   [กฎ] ${r.when.label}=${(r.when.choices ?? []).join("/")} → ${TYPE}: ${r.limit.allow.join(" | ")}`);
  }
  // 2) กฎที่ให้ "ประเภทอะคริลิค" ไปตัดรายการสี — ถอดทิ้ง แล้วสร้างกฎกลับทิศแทนด้านล่าง
  if (r.when?.label === TYPE && r.limit?.label === COLOR) {
    droppedTypeToColor++;
    console.log(`   [ถอดกฎ] ${TYPE}=${(r.when.choices ?? []).join("/")} → ตัด ${COLOR} เหลือ ${r.limit.allow.length} สี`);
    continue;
  }
  kept.push(r);
}
if (!fixed3mm) console.log(`   (กฎ ${TYPE} ไม่มีชื่อเก่า "${MERGED}" ค้างอยู่ — ข้าม)`);

// 3) กฎกลับทิศ: สีที่ลูกค้าเลือก → ช่องราคาที่ต้องใช้
//    (กฎความหนาที่มีอยู่เดิมจะตัดซ้ำอีกที เช่น 1mm/2mm เหลือ "ใสเท่านั้น")
const added = [
  rule(COLOR, [CLEAR], TYPE, [CLEAR, CLEAR_ONLY]),
  rule(COLOR, [C02], TYPE, [C02]),
  rule(COLOR, specialColors, TYPE, [SPECIAL]),
];
const sameRule = (a, b) =>
  a.when.label === b.when.label &&
  a.limit.label === b.limit.label &&
  JSON.stringify(a.when.choices) === JSON.stringify(b.when.choices) &&
  JSON.stringify(a.limit.allow) === JSON.stringify(b.limit.allow);
for (const r of added) {
  if (kept.some((k) => sameRule(k, r))) continue;
  kept.push(r);
  console.log(`   [เพิ่มกฎ] ${COLOR}=${r.when.choices.length > 3 ? `สีพิเศษ ${r.when.choices.length} สี` : r.when.choices.join("/")} → ${TYPE}: ${r.limit.allow.join(" | ")}`);
}
d.rules = kept;

if (JSON.stringify(d.rules) === before) {
  console.log("\n(ไม่มีอะไรต้องแก้)");
  process.exit(0);
}

/**
 * ตรวจผลก่อนบันทึก — จำลอง resolveSelections แบบย่อ: ไล่กลุ่มตามลำดับ ตัดด้วยกฎ
 * แล้วเช็คว่า (ก) รายการสีมีใส/C-02 อยู่ (ข) ช่องราคาที่ได้ตรงกับสีที่เลือก
 */
const ruleMatches = (r, sel) => {
  const cur = sel[r.when.label];
  return !!cur && (r.when.choices?.length ? r.when.choices : [r.when.choice]).includes(cur);
};
const allowedFor = (label, sel) => {
  const all = names(label);
  let allowed = all;
  for (const r of d.rules) {
    if (r.limit.label !== label || !ruleMatches(r, sel)) continue;
    allowed = allowed.filter((n) => r.limit.allow.includes(n));
  }
  return allowed.length ? allowed : all;
};
const cellPrice = (sel) =>
  d.pricing.cells[d.pricing.driverLabels.map((l) => sel[l]).join("│")];

console.log("\n🔍 ตรวจผล (หนา 3mm · 2cm · สกรีน 1 ด้าน (ใต้)):");
let bad = 0;
for (const color of [CLEAR, C02, "hologram-01", "อะคริลิคสีดำ (BK)"]) {
  const base = { ความหนาอะคริลิค: "3mm", ขนาด: "2cm", งานสกรีน: "สกรีน 1 ด้าน (ใต้)", [COLOR]: color };
  const colorList = allowedFor(COLOR, base);
  const type = allowedFor(TYPE, base)[0];
  const price = cellPrice({ ...base, [TYPE]: type });
  const want = color === CLEAR ? CLEAR : color === C02 ? C02 : SPECIAL;
  const ok = type === want && Array.isArray(price) && colorList.includes(CLEAR) && colorList.includes(C02);
  if (!ok) bad++;
  console.log(`   ${ok ? "✅" : "❌"} เลือก "${color}" → ช่องราคา "${type}" · ฿${price?.[0] ?? "?"}/ชิ้น (1-10) · รายการสี ${colorList.length} ตัว`);
}
for (const thick of ["1mm", "2mm"]) {
  const base = { ความหนาอะคริลิค: thick, ขนาด: "2cm", งานสกรีน: "สกรีน 1 ด้าน (ใต้)", [COLOR]: CLEAR };
  const colorList = allowedFor(COLOR, base);
  const type = allowedFor(TYPE, base)[0];
  const ok = type === CLEAR_ONLY && colorList.length === 1 && colorList[0] === CLEAR;
  if (!ok) bad++;
  console.log(`   ${ok ? "✅" : "❌"} หนา ${thick} → ช่องราคา "${type}" · รายการสี ${colorList.join(", ")}`);
}
if (bad) throw new Error(`ผลตรวจไม่ผ่าน ${bad} ข้อ — ไม่บันทึก`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw new Error(`บันทึกไม่สำเร็จ — ${saveErr.message}`);
console.log("\n✅ บันทึกแล้ว");
