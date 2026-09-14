/**
 * พวงกุญแจ + อะไหล่จุกสีใส (keyring-clear-stopper · /products/พวงกุญแจ-อะไหล่จุกสีใส) — 14 ก.ย. 69
 *
 *   node scripts/keyring-stopper-drill-hole-group.mjs            # ดูผล + ตรวจ (ไม่เขียนฐานข้อมูล)
 *   node scripts/keyring-stopper-drill-hole-group.mjs --write    # บันทึกจริง
 *
 * คำสั่งเจ้าของร้าน: เพิ่มกลุ่ม "เจาะรู / ไม่เจาะรู" ให้สินค้าตัวนี้ (ตัวพี่ keyring-copy-copy มีแล้ว)
 *   → วางไว้เหนือ "รับตะขอไหม" ในชุด "3. ตะขอ" · เลือกไม่เจาะรู = ไม่ต้องถามเรื่องตะขอต่อ
 *
 * ⚠️ "เจาะรู" ของสินค้าตัวนี้หมายถึง "รูตะขอ" ที่มุมชิ้นงานเท่านั้น —
 *    แผ่นบน/แผ่นล่างยังประกบด้วยจุกสีใสตามเดิมทุกกรณี (งานนี้เป็นอะคริลิค 2 ชิ้นเสมอ)
 * ⚠️ optionVisible ไม่ไล่ซ่อนเป็นทอด ๆ (ซ่อน "รับตะขอไหม" แล้ว "ตะขอ / ห่วง" ยังโชว์เพราะ selections ค้าง)
 *    จึงต้องผูก เจาะรู=เจาะรู ให้กลุ่มลูกทุกกลุ่มโดยตรง เหมือน scripts/keyring-no-drill-hide-hook.mjs
 *
 * รันซ้ำได้ · สำรองก่อนแตะ · เขียนแล้วอ่านกลับเทียบ (ดู memory iducky-script-write-product)
 * ภาพตัวเลือกของกลุ่มนี้อยู่ที่ scripts/keyring-stopper-hook-option-art.mjs (รันต่อหลังสคริปต์นี้)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-clear-stopper";

const DRILL = "เจาะรู", DRILL_YES = "เจาะรู", DRILL_NO = "ไม่เจาะรู";
const HOOK_GATE = "รับตะขอไหม", HOOK = "ตะขอ / ห่วง";
const SECTION = "3. ตะขอ";
const COND = { label: DRILL, choices: [DRILL_YES] };

const DRILL_GROUP = {
  label: DRILL,
  section: SECTION,
  display: "cards",
  note: "เจาะรูตะขอที่มุมชิ้นงานไว้ร้อยห่วง/ตะขอ — ไม่มีค่าเจาะ · ไม่เจาะรู = ไม่มีรูตะขอ (แผ่นบน-ล่างยังประกบด้วยจุกสีใสตามเดิม)",
  choices: [{ name: DRILL_YES }, { name: DRILL_NO }],
};

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

const before = d.options.length;
console.log(`\nก่อน: ${before} กลุ่ม — ชุด "${SECTION}": ${d.options.filter((o) => o.section === SECTION).map((o) => o.label).join(" · ")}`);

// ── 1) กลุ่ม "เจาะรู" เหนือ "รับตะขอไหม" ──────────────────────────────────
const gateIdxs = d.options.map((o, i) => (o.label === HOOK_GATE ? i : -1)).filter((i) => i >= 0);
if (gateIdxs.length !== 1) die(`คาดว่ามีกลุ่ม "${HOOK_GATE}" 1 กลุ่ม แต่เจอ ${gateIdxs.length}`);
if (d.options.filter((o) => o.label === DRILL).length > 1) die(`กลุ่ม "${DRILL}" ซ้ำหลายกลุ่ม`);
const existing = d.options.findIndex((o) => o.label === DRILL);
if (existing === -1) {
  // รวมของเดิมไว้ไม่ได้ (ยังไม่มี) — ใส่กลุ่มใหม่ทั้งก้อน ภาพ/desc ค่อยเติมด้วยสคริปต์ภาพ
  d.options.splice(gateIdxs[0], 0, structuredClone(DRILL_GROUP));
  console.log(`➕ เพิ่มกลุ่ม "${DRILL}" ที่ตำแหน่ง ${gateIdxs[0]} (ก่อน "${HOOK_GATE}")`);
} else {
  // รันซ้ำ: อัปเดตหัวกลุ่มอย่างเดียว ไม่ทับ choices (imageSrc/desc ที่สคริปต์ภาพเติมไว้ต้องอยู่ต่อ)
  const g = d.options[existing];
  Object.assign(g, { section: SECTION, display: "cards", note: DRILL_GROUP.note });
  for (const nm of [DRILL_YES, DRILL_NO]) {
    if (!g.choices?.some((c) => c.name === nm)) die(`กลุ่ม "${DRILL}" ที่มีอยู่ไม่มีตัวเลือก "${nm}"`);
  }
  console.log(`= กลุ่ม "${DRILL}" มีอยู่แล้ว (อัปเดตหัวกลุ่มให้ตรง · คง ${g.choices.length} ตัวเลือกเดิม)`);
}

// ── 2) กลุ่มตะขอทุกกลุ่มต้องผูก เจาะรู=เจาะรู ──────────────────────────────
const same = (a, b) => a?.label === b.label && JSON.stringify(a?.choices) === JSON.stringify(b.choices);
const hasCond = (o) => [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? [])].some((c) => same(c, COND));
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

// ── จำลอง optionVisible (ตรรกะเดียวกับ src/lib/products.ts) ────────────────
const visible = (o, sel) => {
  const pass = (s) => !s?.label || !s.choices?.length || s.choices.includes(sel[s.label]);
  const any = (o.showWhenAny ?? []).filter((s) => s?.label && s.choices?.length);
  return (!any.length || any.some((s) => s.choices.includes(sel[s.label]))) && pass(o.showWhen) && pass(o.showWhenAlso) && (o.showWhenAll ?? []).every(pass);
};
const base = { [HOOK_GATE]: "รับตะขอ", [HOOK]: "Z1 ห่วงกลม (สีเงิน) — แถมฟรี" };
const shownNo = targets.filter((o) => visible(o, { ...base, [DRILL]: DRILL_NO })).map((o) => o.label);
const shownYes = targets.filter((o) => visible(o, { ...base, [DRILL]: DRILL_YES })).map((o) => o.label);
console.log(`\nจำลอง "${DRILL_NO}": โชว์ ${shownNo.length} กลุ่ม ${shownNo.join(", ") || "(ไม่มี ✓)"}`);
console.log(`จำลอง "${DRILL_YES}": โชว์ ${shownYes.join(" · ")}`);
if (shownNo.length) die("ยังมีกลุ่มตะขอโชว์ตอนไม่เจาะรู");
if (!shownYes.includes(HOOK_GATE) || !shownYes.includes(HOOK)) die("เจาะรูแล้วกลุ่มตะขอหาย");
/* กลุ่มที่ไม่เกี่ยวกับตะขอต้องไม่โดนซ่อนตาม (ขนาด/สกรีน/สี) */
const others = d.options.filter((o) => !targets.includes(o) && o.label !== DRILL);
const hiddenOthers = others.filter((o) => !visible(o, { ...base, [DRILL]: DRILL_NO }) && visible(o, { ...base, [DRILL]: DRILL_YES }));
if (hiddenOthers.length) die(`กลุ่มที่ไม่ใช่ตะขอโดนซ่อนด้วย: ${hiddenOthers.map((o) => o.label).join(", ")}`);
/* กันเผลอ: showWhen ทุกอันต้องชี้กลุ่ม/ตัวเลือกที่มีจริง */
for (const o of d.options) {
  for (const w of [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? []), ...(o.showWhenAny ?? [])]) {
    if (!w?.label) continue;
    const parent = d.options.find((x) => x.label === w.label);
    if (!parent) die(`showWhen ของ "${o.label}" ชี้กลุ่มที่ไม่มี: ${w.label}`);
    for (const nm of w.choices ?? []) if (!parent.choices?.some((c) => c.name === nm)) die(`showWhen ของ "${o.label}" ชี้ตัวเลือกที่ไม่มี: ${w.label} / ${nm}`);
  }
}
console.log(`ชุด "${SECTION}" หลังแก้: ${d.options.filter((o) => o.section === SECTION).map((o) => o.label).join(" · ")}`);

if (!WRITE) { console.log("\n(ยังไม่บันทึก — ใส่ --write)"); process.exit(0); }

d.savedAt = new Date().toISOString();
const save = await sb.from("products").update({ data: d, name: d.name, category: d.category, price: d.price }).eq("id", ID).select("id");
if (save.error) die(`บันทึกไม่สำเร็จ — ${save.error.message}`);
if (!save.data?.length) die("update โดน 0 แถว");

// ── อ่านกลับมาเทียบ ─────────────────────────────────────────────────────────
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back.data;
const bDrill = b.options.find((o) => o.label === DRILL);
const bTargets = b.options.filter((o) => targets.some((t) => t.label === o.label));
const checks = [
  ["savedAt ตรง", b.savedAt === d.savedAt],
  [`มีกลุ่ม "${DRILL}" 1 กลุ่ม`, b.options.filter((o) => o.label === DRILL).length === 1],
  ["อยู่ก่อน รับตะขอไหม", b.options.findIndex((o) => o.label === DRILL) === b.options.findIndex((o) => o.label === HOOK_GATE) - 1],
  ["เป็นการ์ด + อยู่ชุด 3. ตะขอ", bDrill?.display === "cards" && bDrill?.section === SECTION],
  ["มี เจาะรู/ไม่เจาะรู ครบ", [DRILL_YES, DRILL_NO].every((n) => bDrill?.choices?.some((c) => c.name === n))],
  ["กลุ่มตะขอผูกเจาะรูครบ", bTargets.length === targets.length && bTargets.every(hasCond)],
  ["ไม่เจาะรู → ซ่อนกลุ่มตะขอหมด", !bTargets.some((o) => visible(o, { ...base, [DRILL]: DRILL_NO }))],
  ["จำนวนกลุ่มเพิ่มตามที่ตั้งใจ", b.options.length === before + (existing === -1 ? 1 : 0)],
];
let ok = true;
for (const [n, p] of checks) { console.log(`${p ? "✓" : "✗"} ${n}`); ok &&= p; }
if (!ok) die("อ่านกลับไม่ตรง");
console.log(`\n✅ บันทึกแล้ว อ่านกลับตรงทุกข้อ (แก้ ${changed} กลุ่มลูก) — ต่อด้วย node scripts/keyring-stopper-hook-option-art.mjs --write เพื่อเติมภาพ`);
