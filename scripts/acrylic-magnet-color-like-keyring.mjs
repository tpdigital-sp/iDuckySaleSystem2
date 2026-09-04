#!/usr/bin/env node
/**
 * แม่เหล็กอะคริลิค (acrylicmagnet-1) — จัดกลุ่ม "สีอะคริลิค" ให้เหมือนสินค้าพวงกุญแจ (keyring-copy-copy)
 *
 *   node scripts/acrylic-magnet-color-like-keyring.mjs           ดูก่อนว่าจะเปลี่ยนอะไร (ไม่เขียน)
 *   node scripts/acrylic-magnet-color-like-keyring.mjs --write   เขียนจริง + อ่านกลับ + จำลองการเลือกทั้งวง
 *
 * ของเดิม (ทิศกฎกลับด้าน): "สีอะคริลิค" 46 เฉดกางอยู่ตลอด แล้วดัน "ชนิดอะคริลิค" (แกนราคา) ให้เหลือ 1
 *   → หน้าร้านวาดชนิดอะคริลิคเป็นชิป 🔒 ไม่มีรูป ไม่มีการ์ด (ProductDetail เส้น locked)
 * ของใหม่ (ทิศเดียวกับพวงกุญแจ): เลือก "ชนิดอะคริลิค" ก่อน → กลุ่มเฉดสีโผล่เฉพาะตอนเลือก "อะคริลิคพิเศษ"
 *
 * ⛔ ห้ามให้กฎ 2 ทิศอยู่พร้อมกัน (สี→ชนิด คู่กับ ชนิด→สี) เด็ดขาด — เคยทำให้พวงกุญแจล็อกตาย
 *    กดชนิด "ใส" แล้วสีที่ค้างอยู่ดันชนิดกลับไปเป็นพิเศษทันที (ดู memory iducky-keyring-acrylic-type)
 * ลำดับกลุ่มสำคัญ: resolveSelections ไล่ตามลำดับ options → "ชนิดอะคริลิค" ต้องอยู่ก่อน "สีอะคริลิค"
 * รันซ้ำได้ (ทำครบแล้วจะบอกว่าไม่มีอะไรต้องแก้)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "acrylicmagnet-1";
const EXPECT_NAME = "แม่เหล็กอะคริลิค";
const TYPE_GROUP = "ชนิดอะคริลิค";
const COLOR_GROUP = "สีอะคริลิค";
const SPECIAL_TYPE = "อะคริลิคพิเศษ";
/** ข้อความกำกับกลุ่ม — ถ้อยคำชุดเดียวกับพวงกุญแจ */
const TYPE_NOTE = "เนื้ออะคริลิคที่ใช้ทำตัวชิ้นงาน — ราคาต่อชิ้นคิดตามแบบที่เลือก (ดูตารางราคาด้านล่าง)";
const COLOR_NOTE = "เฉดของอะคริลิคสีพิเศษ — ราคาเท่ากันทุกเฉด";

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

const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
if (row.name !== EXPECT_NAME) die(`id "${ID}" ตอนนี้ชื่อ "${row.name}" ไม่ใช่ "${EXPECT_NAME}"`);
const data = row.data;
const options = data.options ?? [];
const typeGroup = options.find((o) => o.label === TYPE_GROUP) ?? die(`ไม่เจอกลุ่ม "${TYPE_GROUP}"`);
const colorGroup = options.find((o) => o.label === COLOR_GROUP) ?? die(`ไม่เจอกลุ่ม "${COLOR_GROUP}"`);
const typeNames = typeGroup.choices.map((c) => c.name);
const colorNames = colorGroup.choices.map((c) => c.name);

/**
 * เฉดไหนคู่กับชนิดไหน — อ่านจากกฎเดิม (สี → ชนิด) ที่กำลังจะถูกลบ
 * รันรอบสองจะไม่มีกฎเดิมแล้ว จึงอ่านจากกฎทิศใหม่แทน
 */
const oldRules = (data.rules ?? []).filter((r) => r.when?.label === COLOR_GROUP && r.limit?.label === TYPE_GROUP);
const newRulesNow = (data.rules ?? []).filter((r) => r.when?.label === TYPE_GROUP && r.limit?.label === COLOR_GROUP);
const colorsOfType = new Map();
if (oldRules.length) {
  for (const r of oldRules) {
    const allow = r.limit.allow ?? [];
    if (allow.length !== 1) die(`กฎเดิมชี้ชนิดได้มากกว่า 1 (${allow.join("/")}) — โครงไม่ตรงที่คาด`);
    const list = r.when.choices?.length ? r.when.choices : [r.when.choice];
    colorsOfType.set(allow[0], [...(colorsOfType.get(allow[0]) ?? []), ...list]);
  }
} else if (newRulesNow.length) {
  for (const r of newRulesNow) {
    const t = (r.when.choices?.length ? r.when.choices : [r.when.choice])[0];
    colorsOfType.set(t, r.limit.allow ?? []);
  }
} else {
  die("ไม่เจอกฎจับคู่ สี↔ชนิด เลย — หยุดก่อน (ต้องรู้ว่าเฉดไหนเป็นของชนิดไหน)");
}

// ── ตรวจความครบถ้วนก่อนแตะอะไร ────────────────────────────────────────────
for (const t of typeNames) if (!colorsOfType.has(t)) die(`ชนิด "${t}" ไม่มีเฉดจับคู่ในกฎ`);
const mapped = [...colorsOfType.values()].flat();
const dup = mapped.filter((n, i) => mapped.indexOf(n) !== i);
if (dup.length) die(`เฉดซ้ำในหลายชนิด: ${dup.join(", ")}`);
const missing = colorNames.filter((n) => !mapped.includes(n));
if (missing.length) die(`เฉดที่ยังไม่รู้ว่าเป็นชนิดไหน: ${missing.join(", ")}`);
const ghost = mapped.filter((n) => !colorNames.includes(n));
if (ghost.length) die(`กฎอ้างเฉดที่ไม่มีในกลุ่มแล้ว: ${ghost.join(", ")}`);
if (!colorsOfType.get(SPECIAL_TYPE)?.length) die(`ชนิด "${SPECIAL_TYPE}" ไม่มีเฉดเลย`);

console.log(`สินค้า: ${row.name} (${ID})`);
for (const t of typeNames) console.log(`  ${t} → ${colorsOfType.get(t).length} เฉด`);

// ── ปั้นโครงใหม่ ──────────────────────────────────────────────────────────
/* 1) กฎทิศใหม่: ชนิด → กรองรายการเฉด (ทิศเดียว ห้ามมีขากลับ) */
const keptRules = (data.rules ?? []).filter(
  (r) => !(r.when?.label === COLOR_GROUP && r.limit?.label === TYPE_GROUP) && !(r.when?.label === TYPE_GROUP && r.limit?.label === COLOR_GROUP)
);
data.rules = [
  ...keptRules,
  ...typeNames.map((t) => ({
    when: { label: TYPE_GROUP, choice: t, choices: [t] },
    limit: { label: COLOR_GROUP, allow: colorsOfType.get(t) },
  })),
];

/* 2) กลุ่มเฉดโผล่เฉพาะตอนเลือกเนื้อพิเศษ (เหมือนพวงกุญแจ) */
colorGroup.showWhen = { label: TYPE_GROUP, choices: [SPECIAL_TYPE] };
colorGroup.note = COLOR_NOTE;
typeGroup.note = TYPE_NOTE;

/* 3) ชนิดต้องมาก่อนสี — resolveSelections ไล่ตามลำดับกลุ่ม (ทั้งคู่อยู่ชุด "เนื้อวัสดุ" เดียวกัน ลำดับชุดไม่เปลี่ยน) */
const ti = options.indexOf(typeGroup);
const ci = options.indexOf(colorGroup);
if (ti > ci) {
  options.splice(ti, 1);
  options.splice(options.indexOf(colorGroup), 0, typeGroup);
}
data.options = options;
console.log(`  ลำดับกลุ่มใหม่: ${options.map((o) => o.label).join(" → ")}`);

// ── จำลองการเลือกแบบเดียวกับหน้าร้าน (allowedChoices + optionVisible ย่อ) ──
const matchAny = (cur, list) => !!cur && list.includes(cur);
const visible = (opt, sel) => {
  const pass = (s) => !s?.label || !s.choices?.length || matchAny(sel[s.label], s.choices);
  return pass(opt.showWhen) && pass(opt.showWhenAlso) && (opt.showWhenAll ?? []).every(pass);
};
const allowedOf = (label, sel) => {
  const g = options.find((o) => o.label === label);
  let allowed = g.choices.map((c) => c.name);
  for (const rule of data.rules ?? []) {
    if (rule.limit.label !== label) continue;
    const whenGroup = options.find((o) => o.label === rule.when.label);
    if (whenGroup && !visible(whenGroup, sel)) continue;
    if (matchAny(sel[rule.when.label], rule.when.choices?.length ? rule.when.choices : [rule.when.choice]))
      allowed = allowed.filter((n) => rule.limit.allow.includes(n));
  }
  return allowed.length ? allowed : g.choices.map((c) => c.name);
};
/** ไล่กลุ่มตามลำดับเหมือน resolveSelections — ค่าที่ใช้ไม่ได้แล้วจะถูกสลับเป็นตัวแรกที่อนุญาต */
const resolve = (sel) => {
  const out = {};
  for (const opt of options) {
    if (opt.multi || opt.display === "multi" || !opt.choices?.length) {
      out[opt.label] = sel[opt.label] ?? "";
      continue;
    }
    const allowed = allowedOf(opt.label, { ...sel, ...out });
    const cur = sel[opt.label];
    out[opt.label] = cur && allowed.includes(cur) ? cur : allowed[0];
  }
  return out;
};

const problems = [];
let sel = resolve({});
for (const t of typeNames) {
  sel = resolve({ ...sel, [TYPE_GROUP]: t });
  const gotType = sel[TYPE_GROUP];
  const colorAllowed = allowedOf(COLOR_GROUP, sel);
  const colorShown = visible(colorGroup, sel);
  const typeAllowed = allowedOf(TYPE_GROUP, sel);
  if (gotType !== t) problems.push(`เลือกชนิด "${t}" แล้วเด้งไปเป็น "${gotType}" (ล็อกตาย)`);
  if (typeAllowed.length !== typeNames.length) problems.push(`ชนิดเหลือให้เลือกแค่ ${typeAllowed.length} แบบตอนอยู่ที่ "${t}" — จะกลายเป็นชิป 🔒 อีก`);
  if (t === SPECIAL_TYPE && !colorShown) problems.push("เลือกเนื้อพิเศษแล้วกลุ่มเฉดไม่โผล่");
  if (t !== SPECIAL_TYPE && colorShown) problems.push(`เลือก "${t}" แล้วกลุ่มเฉดยังโผล่อยู่`);
  if (!colorsOfType.get(t).includes(sel[COLOR_GROUP])) problems.push(`ชนิด "${t}" ได้เฉด "${sel[COLOR_GROUP]}" ที่ไม่ใช่ของชนิดนี้`);
  console.log(
    `  ▸ เลือก "${t}" → เฉด ${colorShown ? `โผล่ ${colorAllowed.length} เฉด` : "ซ่อน"} · ค่าเฉด = ${sel[COLOR_GROUP]} · ชนิดยังเลือกได้ ${typeAllowed.length} แบบ`
  );
}
/* ครบวง: พิเศษ → ใส → พิเศษ ต้องกลับมาได้ (กับดักล็อกตายของพวงกุญแจ) */
let cyc = resolve({ ...sel, [TYPE_GROUP]: SPECIAL_TYPE });
cyc = resolve({ ...cyc, [TYPE_GROUP]: typeNames[0] });
cyc = resolve({ ...cyc, [TYPE_GROUP]: SPECIAL_TYPE });
if (cyc[TYPE_GROUP] !== SPECIAL_TYPE) problems.push("สลับ พิเศษ → ใส → พิเศษ แล้วกลับมาไม่ได้");
console.log(`  ▸ ครบวง พิเศษ→ใส→พิเศษ = ${cyc[TYPE_GROUP]}`);

if (problems.length) {
  console.log("");
  for (const p of problems) console.log("⛔", p);
  process.exit(1);
}
console.log("✓ จำลองผ่านทุกข้อ");

if (!WRITE) {
  console.log("\n(ยังไม่เขียนฐานข้อมูล — ใส่ --write ถ้าจะเขียนจริง)");
  process.exit(0);
}

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", ID).select("data");
if (updErr || !upd?.length) die(`update พัง/0 แถว ${updErr?.message ?? ""}`);

// อ่านกลับมาเทียบ — update ที่ไม่ error ไม่ได้แปลว่าค่าลงจริง
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const bOpts = back.data.options;
const bColor = bOpts.find((o) => o.label === COLOR_GROUP);
const bRules = back.data.rules ?? [];
if (bOpts.findIndex((o) => o.label === TYPE_GROUP) > bOpts.findIndex((o) => o.label === COLOR_GROUP)) die("ลำดับกลุ่มไม่ลง (ชนิดยังอยู่หลังสี)");
if (bColor.showWhen?.label !== TYPE_GROUP || !bColor.showWhen.choices.includes(SPECIAL_TYPE)) die("showWhen ของกลุ่มเฉดไม่ลง");
if (bRules.some((r) => r.when?.label === COLOR_GROUP && r.limit?.label === TYPE_GROUP)) die("กฎทิศเก่า (สี→ชนิด) ยังอยู่ — อันตราย ล็อกตาย");
for (const t of typeNames) {
  const r = bRules.find((x) => x.when?.label === TYPE_GROUP && x.limit?.label === COLOR_GROUP && x.when.choices?.[0] === t);
  if (!r || r.limit.allow.length !== colorsOfType.get(t).length) die(`กฎทิศใหม่ของชนิด "${t}" ไม่ลง`);
}
console.log(`\n✓ เขียนแล้ว · กลุ่มเฉดโผล่เฉพาะ "${SPECIAL_TYPE}" · กฎเหลือทิศเดียว ชนิด→สี · savedAt = ${back.data.savedAt}`);
