#!/usr/bin/env node
/**
 * คลิปหนีบอะคริลิค (otheracrylicproducts2-5) — ซ่อนกลุ่ม "สีอะคริลิค" ไว้ให้โผล่เฉพาะอะคริลิคพิเศษ
 *
 *   node scripts/acrylic-clip-color-special-only.mjs            # ดูผลอย่างเดียว ไม่เขียน DB
 *   node scripts/acrylic-clip-color-special-only.mjs --write    # เขียนจริง + อ่านกลับเทียบ
 *
 * เจ้าของร้านสั่ง (3 ก.ย. 69): "ประเภท: อะคริลิคใส / อะคริลิคขาวขุ่น C-02 ไม่ต้องมีกลุ่มตัวเลือก สีอะคริลิค
 * กลุ่มตัวเลือก สีอะคริลิค มีแต่เมื่อเลือก ประเภท: อะคริลิคพิเศษ"
 * — ใส/C-02 มีเฉดเดียวอยู่แล้ว ถามซ้ำในเมนู 46 เฉดไม่มีประโยชน์ (แพทเทิร์นเดียวกับพวงกุญแจอะคริลิค
 *   scripts/keyring-acrylic-type-cards.mts)
 *
 * ⚠️ กับดัก: กฎ "เทคนิค" ของเดิมผูกไว้กับกลุ่ม **สีอะคริลิค** (สีทึบ → สกรีนบนอย่างเดียว)
 * พอซ่อนกลุ่มสี allowedChoices จะ **ข้ามกฎนั้นทิ้ง** (products.ts:5506 — กลุ่มต้นทางถูกซ่อน = ค่าที่ค้าง
 * เป็นแค่ default ห้ามเอามาตัดตัวเลือก) → C-02 จะเลือก "สกรีนใต้" ได้ทั้งที่เนื้อทึบทำไม่ได้
 * จึงต้องเพิ่มกฎคู่ขนานที่ผูกกับกลุ่ม **ประเภท** แทน ให้ครอบเคสใส/C-02
 * (กฎเดิมที่ผูกกับสีอะคริลิคยังอยู่ ใช้ตอนเลือกอะคริลิคพิเศษ ซึ่งกลุ่มสีโผล่แล้ว)
 *
 * เขียนให้รันซ้ำได้ — เช็คทีละขั้นว่าทำไปแล้วหรือยัง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ID = "otheracrylicproducts2-5";
const WRITE = process.argv.includes("--write");

const TYPE = "ประเภท";
const COLOR = "สีอะคริลิค";
const TECH = "เทคนิค";
const CLEAR = "อะคริลิคใส";
const C02 = "อะคริลิคขาวขุ่น C-02";
const SPECIAL = "อะคริลิคพิเศษ";
const UNDER = "สกรีนใต้";
const TOP = "สกรีนบน";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const die = (msg) => { console.error("✗", msg); process.exit(1); };

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) die(`อ่าน ${ID} ไม่สำเร็จ — ${error.message}`);
const d = structuredClone(row.data);

const optOf = (label) => (d.options ?? []).find((o) => o.label === label);
for (const l of [TYPE, COLOR, TECH]) if (!optOf(l)) die(`ไม่เจอกลุ่ม "${l}"`);
for (const [label, names] of [[TYPE, [CLEAR, C02, SPECIAL]], [TECH, [UNDER, TOP]]]) {
  const have = optOf(label).choices.map((c) => c.name);
  for (const n of names) if (!have.includes(n)) die(`กลุ่ม "${label}" ไม่มีตัวเลือก "${n}" (มี: ${have.join(", ")})`);
}

/* ── 1. กลุ่มสีโผล่เฉพาะอะคริลิคพิเศษ ─────────────────────────────── */
optOf(COLOR).showWhen = { label: TYPE, choices: [SPECIAL] };

/* ── 2. กฎ: ประเภท → ตัวเลือกที่อนุญาต (เขียนทับข้อเดิมที่ชี้กลุ่มเดียวกัน) ──
 * ใส/C-02 ล็อกค่ากลุ่มสีที่ซ่อนอยู่ให้ตรงกับประเภท (ค่าที่ค้างไว้จะได้ไม่ขัดกันตอนอ่านย้อนหลัง)
 * และคุมงานสกรีนแทนกฎที่ผูกกับกลุ่มสี ซึ่งใช้ไม่ได้แล้วเมื่อกลุ่มสีถูกซ่อน           */
const rule = (whenChoice, limitLabel, allow) => ({
  when: { label: TYPE, choice: whenChoice, choices: [whenChoice] },
  limit: { label: limitLabel, allow },
});
const WANT = [
  rule(CLEAR, COLOR, [CLEAR]),
  rule(C02, COLOR, [C02]),
  rule(CLEAR, TECH, [UNDER, TOP]), // เนื้อใส สกรีนได้ทั้งใต้และบน
  rule(C02, TECH, [TOP]),          // เนื้อทึบ สกรีนใต้แล้วมองไม่เห็นลาย
];
const sameTarget = (r, w) =>
  r.when?.label === w.when.label &&
  (r.when.choices?.[0] ?? r.when.choice) === w.when.choices[0] &&
  r.limit?.label === w.limit.label;

d.rules = [
  ...(d.rules ?? []).filter((r) => !WANT.some((w) => sameTarget(r, w))),
  ...WANT,
];

// กฎเดิมที่ผูกกับกลุ่มสี (สีใส/กลิตเตอร์/โฮโล → สกรีนได้ 2 แบบ · สีทึบ → สกรีนบน) ต้องยังอยู่
// ใช้ตอนเลือกอะคริลิคพิเศษ ซึ่งกลุ่มสีโผล่ให้เลือกจริง
const colorTechRules = d.rules.filter((r) => r.when?.label === COLOR && r.limit?.label === TECH);
if (colorTechRules.length !== 2) die(`กฎ "สี → เทคนิค" ควรเหลือ 2 ข้อ แต่เจอ ${colorTechRules.length} ข้อ`);
// กฎ "ประเภทพิเศษ → จำกัดรายการสี" ต้องยังอยู่ ไม่งั้นเมนูสีจะโชว์ ใส/C-02 ปนมาด้วย
if (!d.rules.some((r) => r.when?.label === TYPE && (r.when.choices?.[0] ?? r.when.choice) === SPECIAL && r.limit?.label === COLOR))
  die(`หายไป: กฎ "${TYPE} = ${SPECIAL}" → จำกัดรายการ "${COLOR}"`);

console.log(`กลุ่ม "${COLOR}" showWhen =`, JSON.stringify(optOf(COLOR).showWhen));
console.log(`กฎทั้งหมด ${d.rules.length} ข้อ:`);
for (const r of d.rules)
  console.log(`  • ${r.when.label} = ${(r.when.choices ?? [r.when.choice]).join("/").slice(0, 40)} → ${r.limit.label} เหลือ ${r.limit.allow.length} ตัว${r.limit.allow.length <= 3 ? ` (${r.limit.allow.join(", ")})` : ""}`);

if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write)"); process.exit(0); }

d.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (updErr || !upd?.length) die(`update พัง/0 แถว — ${updErr?.message ?? "ไม่มีแถวถูกแก้"}`);

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back.data;
if (b.options.find((o) => o.label === COLOR)?.showWhen?.choices?.[0] !== SPECIAL) die("อ่านกลับ: showWhen ไม่ลง");
for (const w of WANT)
  if (!(b.rules ?? []).some((r) => sameTarget(r, w) && r.limit.allow.join("│") === w.limit.allow.join("│")))
    die(`อ่านกลับ: ไม่เจอกฎ ${w.when.choices[0]} → ${w.limit.label}`);
console.log(`\n✓ เขียนแล้ว อ่านกลับตรงทุกข้อ · savedAt = ${b.savedAt}`);
