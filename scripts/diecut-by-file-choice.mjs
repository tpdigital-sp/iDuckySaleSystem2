#!/usr/bin/env node
/**
 * ไดคัทตามทรง (ไดคัท 100%): เพิ่มกลุ่มเมนู "ขนาดไดคัท" หน้าคู่ช่องกรอก ขนาดไดคัท (กว้าง)/(สูง)
 *   📐 ระบุขนาดเอง (กรอกด้านล่าง)  ← ค่าเริ่มต้น = พฤติกรรมเดิม (ช่องกรอกโผล่)
 *   📄 ขนาดตามไฟล์ (กราฟฟิกแจ้งจำนวนตอนทำแบบ)  ← ช่องกรอกซ่อน ไม่นับชิ้น/แผ่น กราฟฟิกแจ้งตอนส่งแบบ
 * เจ้าของร้านสั่ง 11 ก.ย. 69 ต่อจากกลุ่มขนาดตัด (scripts/cut-size-by-file-choice.mjs) — "ช่วยเพิ่มที่ไดคัทตามทรงด้วย"
 *
 *   node scripts/diecut-by-file-choice.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/diecut-by-file-choice.mjs --write
 *
 * ทำอะไร: กลุ่มใหม่ display dropdown · section เดียวกับช่องกรอก · showWhen = เงื่อนไขเดิมของช่องกรอก (แบบไดคัท/การตัด/เรทราคา = ไดคัทตามทรง)
 *   ช่องกรอกทั้งคู่: showWhen → {ขนาดไดคัท: ระบุขนาดเอง} · เงื่อนไขเดิมย้ายไป showWhenAlso (ทุกตัวมีแค่ showWhen ข้อเดียว — ตรวจแล้ว ถ้ามี also/all อยู่แล้ว die)
 *   บรรทัดเก่าในตะกร้าไม่มีค่ากลุ่มใหม่ → backfillShowWhen เติมตัวเลือกแรก (ระบุขนาดเอง) ให้เอง ช่องกรอกยังโผล่เหมือนเดิม
 * ไม่แตะ: แม่เหล็ก acrylicmagnet-3/4 (ช่องขนาดไม่มีเงื่อนไขไดคัท) · ผ้าแขวนผนัง (ตัดแบ่งตามขนาด ไม่ใช่ไดคัท) · กลุ่มขนาดตัด (ทำแล้ว)
 * รันซ้ำได้ · อ่านกลับเทียบ + savedAt
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const GROUP = "ขนาดไดคัท";
const MANUAL = "📐 ระบุขนาดเอง (กรอกด้านล่าง)";
const BY_FILE = "📄 ขนาดตามไฟล์ (กราฟฟิกแจ้งจำนวนตอนทำแบบ)";
const DESC =
  "ไม่ต้องวัดขนาด — ส่งไฟล์ลายตามขนาดจริงในไฟล์มาได้เลย กราฟฟิกจัดวางบนแผ่นแล้วแจ้งจำนวนชิ้นที่ได้ต่อแผ่นตอนส่งแบบให้ตรวจ (ราคาคิดต่อแผ่นตามเรทเดิม)";
const OPT_W = "ขนาดไดคัท (กว้าง)";
const OPT_H = "ขนาดไดคัท (สูง)";

const TARGETS = {
  "paper-art-pet": "กระดาษอาร์ตมัน PET",
  "banner-artcard": "แบนเนอร์",
  "texture-paper": "กระดาษเนื้อพิเศษ",
  "paper-foil": "กระดาษเคลือบฟอยล์",
  "sticker-pp": "สติ๊กเกอร์ดิจิตอล",
  "washi-sticker": "สติ๊กเกอร์วาชิ",
  "sticker-uv": "สติ๊กเกอร์ UV",
  neon: "สติ๊กเกอร์เรืองแสง",
  "reflective-sticker": "สติ๊กเกอร์สะท้อนแสง",
  "sticker-gold-silver-rosegold": "Sticker Gold | Silver | RoseGold",
  "sticker-hologram": "สติ๊กเกอร์โฮโลแกรม",
  "sticker-solvent": "SolventPremium",
};

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};
const sameCond = (a, b) => !!a && !!b && a.label === b.label && JSON.stringify(a.choices) === JSON.stringify(b.choices);

/** สิ่งที่อยากให้เป็น — คืนรายการที่แก้ (ว่าง = ตรงแล้ว) */
function apply(d) {
  const log = [];
  const opts = d.options ?? [];
  const w = opts.find((o) => o.label === OPT_W);
  const h = opts.find((o) => o.label === OPT_H);
  if (!w || !h?.sheetYield || h.sheetYield.pairLabel !== OPT_W) die(`ไม่พบคู่ ${OPT_W}/${OPT_H} หรือ pairLabel ไม่ตรง`);
  if (opts.filter((o) => o.label === GROUP).length > 1) die(`กลุ่ม "${GROUP}" ซ้ำ`);
  let g = opts.find((o) => o.label === GROUP);
  const manualCond = { label: GROUP, choices: [MANUAL] };
  // เงื่อนไขเดิมของช่องกรอก (ก่อนเราแตะ) = showWhen ของช่อง ถ้ายังไม่ถูกย้าย · ถ้าย้ายแล้วอยู่ที่ showWhenAlso
  const baseCond = (o) => (sameCond(o.showWhen, manualCond) ? o.showWhenAlso : o.showWhen);
  const base = baseCond(w);
  if (!base?.label || !sameCond(base, baseCond(h))) die(`เงื่อนไขเดิมของช่องกว้าง/สูงไม่ตรงกัน: ${JSON.stringify([baseCond(w), baseCond(h)])}`);
  for (const o of [w, h]) {
    if (!sameCond(o.showWhen, manualCond) && (o.showWhenAlso || o.showWhenAll?.length || o.showWhenAny?.length)) die(`${o.label} มี showWhenAlso/All/Any อยู่แล้ว ต้องดูก่อน`);
  }
  if (!g) {
    g = { label: GROUP, display: "dropdown", choices: [{ name: MANUAL }, { name: BY_FILE, selectedNote: DESC }], showWhen: { ...base, choices: [...base.choices] } };
    if (w.section) g.section = w.section;
    opts.splice(opts.indexOf(w), 0, g);
    log.push(`เพิ่มกลุ่ม "${GROUP}" หน้า "${OPT_W}" (section ${w.section ?? "-"} · showWhen ${JSON.stringify(base)})`);
  } else {
    if (g.display !== "dropdown") { g.display = "dropdown"; log.push("display → dropdown"); }
    if (!sameCond(g.showWhen, base)) { g.showWhen = { ...base, choices: [...base.choices] }; log.push("แก้ showWhen กลุ่ม"); }
    if ((w.section ?? null) !== (g.section ?? null)) { g.section = w.section; log.push("แก้ section กลุ่ม"); }
    if (opts.indexOf(g) !== opts.indexOf(w) - 1) { opts.splice(opts.indexOf(g), 1); opts.splice(opts.indexOf(w), 0, g); log.push("ย้ายกลุ่มไปหน้าช่องกว้าง"); }
    if (!g.choices.some((c) => c.name === MANUAL)) { g.choices.unshift({ name: MANUAL }); log.push("เติม MANUAL"); }
    const bf = g.choices.find((c) => c.name === BY_FILE);
    if (!bf) { g.choices.push({ name: BY_FILE, selectedNote: DESC }); log.push("เติม BY_FILE"); }
    else if (bf.selectedNote !== DESC) { bf.selectedNote = DESC; log.push("อัปเดต selectedNote"); }
  }
  for (const o of [w, h]) {
    if (!sameCond(o.showWhen, manualCond)) {
      o.showWhenAlso = o.showWhen;
      o.showWhen = { label: GROUP, choices: [MANUAL] };
      log.push(`${o.label}: showWhen → ${GROUP}=ระบุขนาดเอง · เงื่อนไขเดิมย้ายไป showWhenAlso`);
    }
  }
  return log;
}
const verify = (d) => apply(JSON.parse(JSON.stringify(d))).length === 0;

const ids = Object.keys(TARGETS);
const { data: rows, error } = await sb.from("products").select("id,name,data").in("id", ids);
if (error) die(error.message);
if (rows.length !== ids.length) die(`เจอ ${rows.length}/${ids.length} ตัว`);
const plan = [];
for (const row of rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))) {
  if (row.name !== TARGETS[row.id]) die(`${row.id}: ชื่อไม่ตรงที่คาด (${row.name})`);
  const log = apply(row.data);
  console.log(`${log.length ? "→" : "="} ${row.id} | ${row.name}${log.length ? "" : " (ตรงแล้ว)"}`);
  for (const l of log) console.log(`     ${l}`);
  if (log.length) plan.push({ id: row.id, d: row.data });
}
if (!WRITE) {
  console.log(`\n(dry-run) ต้องแก้ ${plan.length}/${rows.length} ตัว — ใส่ --write เพื่อเขียน`);
  process.exit(0);
}
for (const { id, d } of plan) {
  d.savedAt = new Date().toISOString();
  const { data: upd, error: updErr } = await sb.from("products").update({ data: d }).eq("id", id).select("id");
  if (updErr) die(`${id}: ${updErr.message}`);
  if (!upd?.length) die(`${id}: update โดน 0 แถว`);
  const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", id).single();
  if (backErr) die(`${id}: ${backErr.message}`);
  if (!verify(back.data)) die(`${id}: อ่านกลับไม่ตรง`);
  if (back.data.savedAt !== d.savedAt) die(`${id}: savedAt อ่านกลับไม่ตรง`);
  console.log(`✓ ${id} เขียนแล้ว · savedAt ${d.savedAt}`);
}
console.log(`\n✓ เสร็จ ${plan.length} ตัว อ่านกลับตรงทุกตัว`);
