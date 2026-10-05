/**
 * ตะขอ AB / AC คิดเงินซ้ำ 2 รอบ — 5 ต.ค. 69 (OD-261005-9846 พวงกุญแจอะคริลิค 6cm เรท 2)
 *
 *   node scripts/hook-ab-ac-double-extra.mjs           # ดูผล (ไม่เขียน)
 *   node scripts/hook-ab-ac-double-extra.mjs --write   # บันทึกจริง
 *
 * เหตุ: ตะขออื่นทั้งหมด (C/G/H/I/S/T/U/W/AA/โลหะ…) ตั้งราคาไว้ที่ "สีตะขอ" ตัวตะขอ ฿0
 *   แต่ AB ห่วงเปิดได้ 45mm กับ AC ตะขอพลาสติกเล็ก ตั้ง +฿5 ไว้ที่ตัวตะขอ (คลัง preset-3 + snapshot ในสินค้า)
 *   แล้วคลัง "สีตะขอ AB" / "สีตะขอ AC" ก็ +฿5 ทุกสีอีก → ลูกค้าโดน +฿10/ชิ้น (เรท 45 → 55 แทน 50)
 * แก้: ถอด extra ของตะขอ AB/AC ออก "เฉพาะที่มีกลุ่มสีตะขอนั้นคิดเงินอยู่แล้ว" (ราคาอยู่ที่สีเหมือนตะขอตัวอื่น)
 *   - คลัง __preset_preset-3 (ตะขอ)
 *   - snapshot ทุกสินค้า (ลิงก์คลังหรือแยกตัวก็ตาม) — กลุ่มสีที่ลิงก์คลัง ดูราคาจากคลัง
 * รันซ้ำได้ · สำรองไว้ backups/ · เขียนแล้วอ่านกลับเทียบ
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const HOOKS = ["AB ห่วงเปิดได้ 45mm (หลายสี)", "AC ตะขอพลาสติกเล็ก (หลายสี)"];
const HOOK_PRESET = "__preset_preset-3";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const die = (m) => { console.error(`❌ ${m}`); process.exit(1); };

const { data: rows, error } = await sb.from("products").select("id,category,data");
if (error || !rows) die(`อ่านสินค้าไม่ได้ — ${error?.message}`);
const presets = new Map(rows.filter((r) => r.category === "__presets__").map((r) => [r.data.id, r.data]));

const choicesOf = (o) => (o.presetId && presets.get(o.presetId)?.choices) || o.choices || [];
const conds = (o) => [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? [])].filter(Boolean);

/** กลุ่มสีของตะขอนี้ (showWhen ตะขอ = hook) มีราคาอยู่แล้วไหม */
function colorPriced(options, hookLabel, hook) {
  return options.some((o) => conds(o).some((c) => c.label === hookLabel && c.choices?.includes(hook))
    && choicesOf(o).some((c) => (c.extra ?? 0) > 0));
}

const changes = []; // { row, notes[] }

// 1) คลังตะขอ — สีตะขอ AB / AC ในคลังคิดเงินทุกสี
const hookPreset = rows.find((r) => r.id === HOOK_PRESET);
if (!hookPreset) die(`ไม่เจอ ${HOOK_PRESET}`);
for (const [hook, colorPreset] of [[HOOKS[0], "hook-color-ab"], [HOOKS[1], "hook-color-ac"]]) {
  const cp = presets.get(colorPreset);
  if (!cp?.choices?.every((c) => (c.extra ?? 0) > 0)) die(`คลัง ${colorPreset} ไม่ได้คิดเงินทุกสี — หยุดก่อน ตรวจมือ`);
}
{
  const notes = [];
  for (const c of hookPreset.data.choices) if (HOOKS.includes(c.name) && (c.extra ?? 0) > 0) { notes.push(`${c.name} +${c.extra} → 0`); delete c.extra; }
  if (notes.length) changes.push({ row: hookPreset, notes });
}

// 2) สินค้า
for (const r of rows) {
  if (r.category === "__presets__" || !Array.isArray(r.data?.options)) continue;
  const notes = [];
  for (const o of r.data.options) {
    for (const c of o.choices ?? []) {
      if (!HOOKS.includes(c.name) || !((c.extra ?? 0) > 0)) continue;
      const label = o.presetId && presets.get(o.presetId)?.label ? presets.get(o.presetId).label : o.label;
      if (!colorPriced(r.data.options, label, c.name) && !colorPriced(r.data.options, o.label, c.name)) {
        console.log(`· ${r.id} ${o.label}: ${c.name} +${c.extra} — ไม่มีกลุ่มสีคิดเงิน คงไว้`);
        continue;
      }
      notes.push(`${o.label}: ${c.name} +${c.extra} → 0${o.presetId ? ` (snapshot ${o.presetId})` : ""}`);
      delete c.extra;
    }
  }
  if (notes.length) changes.push({ row: r, notes });
}

for (const { row, notes } of changes) { console.log(`\n${row.id} ${row.data.name ?? row.data.label ?? ""}`); for (const n of notes) console.log(`  - ${n}`); }
console.log(`\nรวม ${changes.length} แถว`);
if (!WRITE) { console.log("(dry-run — ใส่ --write เพื่อบันทึก)"); process.exit(0); }

mkdirSync(new URL("../backups", import.meta.url), { recursive: true });
const { data: orig } = await sb.from("products").select("id,data").in("id", changes.map((c) => c.row.id));
const bak = new URL(`../backups/hook-ab-ac-double-extra-${Date.now()}.json`, import.meta.url);
writeFileSync(bak, JSON.stringify(orig, null, 2));
console.log(`💾 สำรอง ${bak.pathname}`);

for (const { row } of changes) {
  const { error: e } = await sb.from("products").update({ data: row.data }).eq("id", row.id);
  if (e) die(`${row.id}: ${e.message}`);
}
// อ่านกลับ
const { data: back } = await sb.from("products").select("id,data").in("id", changes.map((c) => c.row.id));
let bad = 0;
for (const r of back) {
  const list = r.data.options ? r.data.options.flatMap((o) => o.choices ?? []) : r.data.choices;
  for (const c of list) if (HOOKS.includes(c.name) && (c.extra ?? 0) > 0) {
    const ch = changes.find((x) => x.row.id === r.id);
    if (ch.notes.some((n) => n.includes(c.name))) { bad++; console.log(`❌ ${r.id} ${c.name} ยัง +${c.extra}`); }
  }
}
console.log(bad ? `❌ ไม่ผ่าน ${bad}` : `✅ บันทึกแล้ว อ่านกลับตรง ${back.length} แถว`);
