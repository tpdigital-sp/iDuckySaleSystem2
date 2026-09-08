/**
 * พวงกุญแจอะคริลิค (keyring-copy-copy · /products/พวงกุญแจอะคริลิค-Acrylic-Keyring) — 8 ก.ย. 69
 *
 *   node scripts/keyring-no-drill-hide-hook.mjs            # ดูผล + ตรวจ (ไม่เขียนฐานข้อมูล)
 *   node scripts/keyring-no-drill-hide-hook.mjs --write    # บันทึกจริง
 *
 * คำสั่งเจ้าของร้าน: เลือก "ไม่เจาะรู" แล้ว ไม่ต้องมีตัวเลือกตะขอ
 *   → กลุ่ม "รับตะขอไหม" / "ตะขอ" / "สีตะขอ …" ทุกกลุ่ม ต้องซ่อนเมื่อ เจาะรู ≠ เจาะรู
 *
 * ⚠️ optionVisible ไม่ไล่ซ่อนเป็นทอด ๆ (ซ่อน "รับตะขอไหม" แล้ว "ตะขอ" ยังโชว์เพราะ selections ค้าง "รับตะขอ")
 *   จึงต้องผูกเงื่อนไข เจาะรู=เจาะรู ให้ทุกกลุ่มลูกโดยตรง:
 *   - รับตะขอไหม (ไม่มีเงื่อนไข)           → showWhen
 *   - ตะขอ (มี showWhen)                   → showWhenAlso
 *   - สีตะขอ … (มี showWhen+showWhenAlso)   → showWhenAll
 * รันซ้ำได้ · เขียนแล้วอ่านกลับเทียบ (ดู memory iducky-script-write-product)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-copy-copy";
const DRILL = "เจาะรู", DRILL_YES = "เจาะรู", DRILL_NO = "ไม่เจาะรู";
const HOOK_GATE = "รับตะขอไหม", HOOK = "ตะขอ";
const COND = { label: DRILL, choices: [DRILL_YES] };

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const die = (m) => { console.error(`❌ ${m}`); process.exit(1); };

const { data: row, error } = await sb.from("products").select("id,name,category,price,data").eq("id", ID).single();
if (error || !row) die(`อ่านสินค้าไม่ได้ — ${error?.message}`);
const d = row.data;
if (!Array.isArray(d.options)) die("data.options ไม่ใช่ array");

mkdirSync(new URL("../backups", import.meta.url), { recursive: true });
const bak = new URL(`../backups/${ID}-${Date.now()}.json`, import.meta.url);
writeFileSync(bak, JSON.stringify(row, null, 2));
console.log(`💾 สำรองไว้ที่ ${bak.pathname}`);

const drill = d.options.find((o) => o.label === DRILL);
if (!drill) die(`ไม่มีกลุ่ม "${DRILL}" — รัน keyring-drill-hole-remove-charm.mjs ก่อน`);
if (!drill.choices.some((c) => c.name === DRILL_YES) || !drill.choices.some((c) => c.name === DRILL_NO)) die(`กลุ่ม ${DRILL} ไม่มี ${DRILL_YES}/${DRILL_NO}`);

const same = (a, b) => a?.label === b.label && JSON.stringify(a?.choices) === JSON.stringify(b.choices);
const hasCond = (o) => [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? [])].some((c) => same(c, COND));

// กลุ่มเป้าหมาย = รับตะขอไหม + ตะขอ + ทุกกลุ่มที่ผูกกับ "ตะขอ"/"รับตะขอไหม" อยู่แล้ว (สีตะขอ …)
const refsHook = (o) => [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? []), ...(o.showWhenAny ?? [])]
  .some((c) => c && (c.label === HOOK || c.label === HOOK_GATE));
const targets = d.options.filter((o) => o.label === HOOK_GATE || o.label === HOOK || refsHook(o));
if (!targets.some((o) => o.label === HOOK_GATE) || !targets.some((o) => o.label === HOOK)) die(`หากลุ่ม ${HOOK_GATE}/${HOOK} ไม่เจอ`);

let changed = 0;
for (const o of targets) {
  if (hasCond(o)) { console.log(`= ${o.label}: ผูก ${DRILL}=${DRILL_YES} อยู่แล้ว`); continue; }
  let slot;
  if (!o.showWhen?.label) { o.showWhen = structuredClone(COND); slot = "showWhen"; }
  else if (!o.showWhenAlso?.label) { o.showWhenAlso = structuredClone(COND); slot = "showWhenAlso"; }
  else { o.showWhenAll = [...(o.showWhenAll ?? []), structuredClone(COND)]; slot = "showWhenAll"; }
  changed++;
  console.log(`🔗 ${o.label}: เพิ่ม ${slot} = ${DRILL}=${DRILL_YES}`);
}
console.log(`\nกลุ่มเป้าหมาย ${targets.length} กลุ่ม · แก้ ${changed} กลุ่ม`);

// จำลอง optionVisible (ตรรกะเดียวกับ src/lib/products.ts)
const visible = (o, sel) => {
  const pass = (s) => !s?.label || !s.choices?.length || s.choices.includes(sel[s.label]);
  const any = (o.showWhenAny ?? []).filter((s) => s?.label && s.choices?.length);
  return (!any.length || any.some((s) => s.choices.includes(sel[s.label]))) && pass(o.showWhen) && pass(o.showWhenAlso) && (o.showWhenAll ?? []).every(pass);
};
const base = { [HOOK_GATE]: "รับตะขอ", [HOOK]: "C โซ่ไข่ปลา (หลายสี)" };
const shownNo = targets.filter((o) => visible(o, { ...base, [DRILL]: DRILL_NO })).map((o) => o.label);
const shownYes = targets.filter((o) => visible(o, { ...base, [DRILL]: DRILL_YES })).map((o) => o.label);
console.log(`จำลอง ${DRILL_NO}: โชว์ ${shownNo.length} กลุ่ม ${shownNo.join(", ") || "(ไม่มี ✓)"}`);
console.log(`จำลอง ${DRILL_YES}: โชว์ ${shownYes.join(" · ")}`);
if (shownNo.length) die("ยังมีกลุ่มตะขอโชว์ตอนไม่เจาะรู");
if (!shownYes.includes(HOOK_GATE) || !shownYes.includes(HOOK) || !shownYes.includes("สีตะขอ C (โซ่ไข่ปลา)")) die("เจาะรูแล้วกลุ่มตะขอหาย");

if (!WRITE) { console.log("\n(ยังไม่บันทึก — ใส่ --write)"); process.exit(0); }
if (!changed) { console.log("ไม่มีอะไรต้องเขียน"); process.exit(0); }

d.savedAt = new Date().toISOString();
const save = await sb.from("products").update({ data: d, name: d.name, category: d.category, price: d.price }).eq("id", ID).select("id");
if (save.error) die(`บันทึกไม่สำเร็จ — ${save.error.message}`);
if (!save.data?.length) die("update โดน 0 แถว");

const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back.data;
const bt = b.options.filter((o) => targets.some((t) => t.label === o.label));
const checks = [
  ["savedAt ตรง", b.savedAt === d.savedAt],
  [`กลุ่มเป้าหมายครบ ${targets.length}`, bt.length === targets.length],
  ["ทุกกลุ่มผูกเจาะรู", bt.every(hasCond)],
  ["ไม่เจาะรู → ซ่อนหมด", !bt.some((o) => visible(o, { ...base, [DRILL]: DRILL_NO }))],
  ["จำนวนกลุ่มเท่าเดิม", b.options.length === d.options.length],
];
let ok = true;
for (const [n, p] of checks) { console.log(`${p ? "✓" : "✗"} ${n}`); ok &&= p; }
if (!ok) die("อ่านกลับไม่ตรง");
console.log("\n✅ บันทึกแล้ว อ่านกลับตรงทุกข้อ");
