#!/usr/bin/env node
/**
 * 🏷 พวงกุญแจเขย่า — ชื่อกลุ่มตะขอตามที่เจ้าของร้านสั่ง 14 ก.ย. 69 + ซ่อมสายที่ชี้กลุ่มให้ถูก
 *
 *   กลุ่มประตู (รับตะขอ / เจาะรู / ไม่เจาะรู)        → "ตะขอ"      (เดิม "รับตะขอไหม")
 *   กลุ่มอะไหล่ 31 แบบ (ลิงก์คลังกลาง preset-3)     → "แบบตะขอ"   (เดิม "ตะขอ")
 *
 *   node scripts/shake-shake-hook-label.mjs            # ดูก่อน
 *   node scripts/shake-shake-hook-label.mjs --write    # เขียน + อ่านกลับเทียบ
 *
 * เฉพาะสินค้าตัวนี้ (เจ้าของร้านเลือก) — อีก 9 สินค้าที่ใช้ชื่อ "รับตะขอไหม" ไม่แตะ · คลังกลางไม่แตะ
 *
 * 🔁 รันซ้ำได้ และ **ซ่อมสภาพพังครึ่ง ๆ ได้ด้วย** — หากลุ่มจาก "ตัวตน" (presetId / รายชื่อตัวเลือก)
 *    ไม่ใช่จากชื่อ แล้วไล่ชี้เงื่อนไขทุกอัน (showWhen / showWhenAlso / freeWhen / rules) ไปยัง
 *    "กลุ่มที่เป็นเจ้าของตัวเลือกในเงื่อนไขนั้นจริง ๆ" จึงไม่พังแม้ชื่อจะเพี้ยนไปแล้ว
 *
 * ⚠️ ที่ทำได้เพราะ resolveOptions มีกติกา "ชื่อคลังชนกับกลุ่มที่สินค้าเป็นเจ้าของ → คงชื่อเดิมของสินค้า"
 *    (option-presets.ts ~82) · หน้าแก้ไขสินค้าเคยไม่มีกติกานี้ เซฟทีไรดันชื่อคลังกลับทุกที
 *    จนกลุ่มชื่อซ้ำ เมนูว่างเปล่า (14 ก.ย. 69) — แก้ที่ syncLinkedDraft ใน ProductEditor แล้ว
 * ⚠️ ออเดอร์/ใบเสนอราคาเก่าเก็บ selections ด้วยชื่อเดิม — ของเก่าโชว์ตามที่บันทึกไว้ ไม่แก้ย้อนหลัง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ID = "new-mt2rp5i3-9488";
const PRESET_ID = "preset-3";
const GATE_LABEL = "ตะขอ";
const KIND_LABEL = "แบบตะขอ";
const GATE_MARK = "รับตะขอ"; // ตัวเลือกที่มีเฉพาะในกลุ่มประตู — ใช้ระบุตัวกลุ่มแทนชื่อ
const WRITE = process.argv.includes("--write");
const die = (m) => { console.error("✗ " + m); process.exit(1); };

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) die(error.message);
const data = row.data;
const BEFORE = JSON.stringify(data); // ถ่ายรูปไว้ก่อนแตะ — data กับ row.data เป็นก้อนเดียวกัน เทียบทีหลังไม่ได้
const opts = data.options ?? [];
const names = (o) => (o.choices ?? []).map((c) => c.name);

/* ── 1. หากลุ่มจากตัวตน ไม่ใช่จากชื่อ ─────────────────────────────────────── */
const kinds = opts.filter((o) => o.presetId === PRESET_ID);
if (kinds.length !== 1) die(`กลุ่มที่ลิงก์คลัง ${PRESET_ID} พบ ${kinds.length} กลุ่ม — โครงสินค้าเปลี่ยน ตรวจก่อน`);
const gates = opts.filter((o) => !o.presetId && names(o).includes(GATE_MARK));
if (gates.length !== 1) die(`กลุ่มประตู (มีตัวเลือก "${GATE_MARK}") พบ ${gates.length} กลุ่ม — ตรวจก่อน`);
const PLAN = [{ g: gates[0], to: GATE_LABEL }, { g: kinds[0], to: KIND_LABEL }];

// ชื่อใหม่ต้องไม่ชนกันเอง ไม่ชนกลุ่มอื่น และไม่ชนแกนตารางราคา (ดู [[iducky-price-driver-trap]])
const final = opts.map((o) => PLAN.find((p) => p.g === o)?.to ?? o.label);
const dup = final.filter((l, i) => final.indexOf(l) !== i);
if (dup.length) die(`เปลี่ยนแล้วจะมีชื่อกลุ่มซ้ำ: ${[...new Set(dup)].join(", ")}`);
const drivers = new Set([data.pricing, ...(data.priceRates ?? [])
  .map((r) => r.pricing)].flatMap((p) => p?.driverLabels ?? []));
for (const p of PLAN) if (drivers.has(p.to)) die(`"${p.to}" ชนแกนตารางราคา`);

for (const p of PLAN) {
  if (p.g.label === p.to) continue;
  console.log(`【${p.g.label}】→【${p.to}】${p.g.presetId ? ` (ลิงก์คลัง ${p.g.presetId})` : ""}`);
  p.g.label = p.to;
}

/* ── 2. ไล่ชี้เงื่อนไขไปยังกลุ่มที่เป็นเจ้าของตัวเลือกนั้นจริง ─────────────── */
/**
 * กลุ่มนี้ "เป็นเจ้าของ" ตัวเลือกที่เงื่อนไขอ้างถึงกี่ตัว — ใช้นับแทนการเทียบครบทุกตัว
 * เพราะบางเงื่อนไขอ้างชื่อที่คลังเลิกใช้แล้ว (เช่น "C โซ่ไข่ปลา (หลายสี · แบบเงา)" ที่ไม่มีใน preset-3)
 */
const score = (o, list) => list.filter((n) => names(o).includes(n)).length;
const owns = (o, list) => list.length > 0 && score(o, list) > 0;
const fixes = [];
const repair = (node, path) => {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((n, i) => repair(n, `${path}[${i}]`)); return; }
  const isGroup = opts.includes(node);
  const list = Array.isArray(node.choices) ? node.choices : Array.isArray(node.allow) ? node.allow : null;
  if (!isGroup && typeof node.label === "string" && list) {
    const cur = opts.filter((o) => o.label === node.label);
    if (!(cur.length === 1 && owns(cur[0], list))) {
      const ranked = opts.map((o) => [o, score(o, list)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
      if (!ranked.length) die(`${path}: หากลุ่มเจ้าของตัวเลือก ${JSON.stringify(list).slice(0, 80)} ไม่เจอ`);
      if (ranked.length > 1 && ranked[0][1] === ranked[1][1])
        die(`${path}: ตัวเลือก ${JSON.stringify(list).slice(0, 80)} ตรงกับหลายกลุ่มเท่ากัน (${ranked.slice(0, 3).map(([o]) => o.label).join(", ")})`);
      const win = ranked[0][0];
      if (win.label !== node.label) fixes.push(`${path}: "${node.label}" → "${win.label}"`);
      node.label = win.label;
    }
  }
  for (const [k, v] of Object.entries(node)) {
    if (isGroup && (k === "label" || k === "choices")) continue;
    if (v && typeof v === "object") repair(v, `${path}.${k}`);
  }
};
repair(data, "data");
if (fixes.length) { console.log(`\nซ่อมเงื่อนไขที่ชี้ผิดกลุ่ม ${fixes.length} จุด:`); for (const f of fixes) console.log(`  ↳ ${f}`); }

if (JSON.stringify(data) === BEFORE) { console.log("ทำไปแล้ว — ชื่อกลุ่มและเงื่อนไขตรงหมด"); process.exit(0); }
console.log(`\nลำดับกลุ่ม: ${opts.map((o) => o.label).join(" › ")}`);
if (!WRITE) { console.log("\n👀 dry-run — เติม --write เพื่อเขียนจริง"); process.exit(0); }

const savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: { ...data, options: opts, savedAt } }).eq("id", ID).select("data");
if (e2 || !upd?.length) die("update พัง/0 แถว " + (e2?.message ?? ""));

/* ── 3. อ่านกลับเทียบ — "ไม่ error" ไม่ได้แปลว่าค่าลงจริง ─────────────────── */
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back.data.options ?? [];
const bGate = b.filter((o) => o.label === GATE_LABEL);
const bKind = b.filter((o) => o.label === KIND_LABEL);
if (bGate.length !== 1 || bGate[0].presetId) die(`อ่านกลับ: กลุ่ม "${GATE_LABEL}" ไม่ใช่กลุ่มประตูกลุ่มเดียว`);
if (bKind.length !== 1 || bKind[0].presetId !== PRESET_ID) die(`อ่านกลับ: กลุ่ม "${KIND_LABEL}" ไม่ใช่กลุ่มคลัง ${PRESET_ID} กลุ่มเดียว`);
if (bKind[0].showWhen?.label !== GATE_LABEL) die("อ่านกลับ: showWhen ของกลุ่มอะไหล่ไม่ชี้กลุ่มประตู");
if (bKind[0].freeWhen?.when?.label !== GATE_LABEL) die("อ่านกลับ: freeWhen ของกลุ่มอะไหล่ไม่ชี้กลุ่มประตู");
const colors = b.filter((o) => /^สีตะขอ/.test(o.label));
const bad = colors.filter((o) => o.showWhen?.label !== KIND_LABEL || o.showWhenAlso?.label !== GATE_LABEL);
if (colors.length !== 13 || bad.length) die(`อ่านกลับ: กลุ่มสีตะขอ ${colors.length} กลุ่ม ชี้ผิด ${bad.length} กลุ่ม`);
if ((back.data.rules ?? []).some((r) => r.when?.label !== GATE_LABEL)) die("อ่านกลับ: rules ไม่ได้ชี้กลุ่มประตู");
console.log(`✓ เขียนแล้ว อ่านกลับตรง · สีตะขอ 13 กลุ่มชี้ "${KIND_LABEL}" · rules + showWhenAlso ชี้ "${GATE_LABEL}" · savedAt = ${back.data.savedAt}`);
