#!/usr/bin/env node
/**
 * กลุ่ม "สีไหมเย็บชิ้นงาน" → หน้าตาเดียวกับผ้าแขวนผนัง (การ์ด + รูปหลอดไหม 13 สี + ชาร์ตเต็ม)
 *
 *   node scripts/thread-color-cards.mjs --only=20x34-5cm,collar-animal            # ดูก่อน
 *   node scripts/thread-color-cards.mjs --only=20x34-5cm,collar-animal --write    # เขียนจริง
 *   node scripts/thread-color-cards.mjs --all --write                             # ทุกสินค้าที่มีกลุ่มนี้
 *
 * ต้นแบบ: fabric-poster กลุ่ม "สีไหมเย็บขอบ" (display cards · imageSrc หลอดไหม ·
 * note + noteImageSrc = ชาร์ต MADEIRA เต็มใบ กดปุ่ม 👀 ดูได้)
 *
 * 📦 รูป = คลังกลางทั้งร้าน `products/thread-colors/` (แพทเทิร์นเดียวกับคลังภาพเคลือบ coating-a/b)
 *    ต้นทางคือไฟล์ที่ครอปไว้แล้วของ fabric-poster — ก๊อปข้ามครั้งแรกครั้งเดียว
 *
 * ⚠️ กลุ่มนี้ของสินค้าเกือบทุกตัว **ลิงก์คลังตัวเลือกกลาง `preset-4`** และ resolveOptions
 *    เอา `preset.choices` ทับ choices ของสินค้าเสมอ → **รูปต้องเขียนลงคลัง** ไม่งั้นหน้าร้านไม่เห็น
 *    (เขียน snapshot ในสินค้าด้วย เผื่อคลังถูกลบ) · display/note/noteImageSrc อยู่ที่ตัวสินค้า
 * ⚠️ เขียนคลังต้องคง `stockItemId` ของทุกสี (ผูกสต๊อกไหมไว้)
 * ⚠️ ไม่แตะราคา/ชื่อกลุ่ม/ชื่อตัวเลือก — ชื่อกลุ่มเป็นคีย์ selections และเป็นเป้า showWhen (collar-animal)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ALL = process.argv.includes("--all");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const V = "v2"; // ⚠️ ชุด v1 เบลอ (116×370) — เลิกใช้แล้ว ดู scripts/thread-color-art.mjs
const LIB = "products/thread-colors";
const PRESET_ROW = "__preset_preset-4";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const sb = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});
const PUB = `${SUPA}/storage/v1/object/public/product-images`;
const SRC_DIR = `${PUB}/products/fabric-poster`; // (ไม่ใช้แล้วกับ v2 — คลังภาพสร้างโดย thread-color-art.mjs)
const die = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};

if (!ALL && !ONLY.length) die("ต้องระบุ --only=<id,id> หรือ --all");

/* ── 13 สี MADEIRA — รหัสในวงเล็บของชื่อตัวเลือกคือคีย์จับคู่รูป ── */
const CODES = ["1803", "1816", "1637", "1866", "1521", "1702", "1851", "1827", "1742", "1711", "1614", "1658", "1800"];
const NOTE =
  "ไหมปัก MADEIRA จากประเทศเยอรมนี โพลีเอสเตอร์ 100% เส้นไหมเรียบเงา ทนต่อการซักฟอก — " +
  "เลือกได้ 1 สีต่องาน **ไม่มีค่าใช้จ่ายเพิ่ม** · กดที่รูปเพื่อดูชาร์ตสีเต็ม";
const imgOf = (code) => `${PUB}/${LIB}/thread-${code}-${V}.jpg`;
const CHART = `${PUB}/${LIB}/thread-chart-${V}.jpg`;
const codeOf = (name) => CODES.find((c) => name.includes(c));

/* ── 1) คลังภาพกลาง: ก๊อปจาก fabric-poster ถ้ายังไม่มี ── */
const need = [...CODES.map((c) => `thread-${c}-${V}.jpg`), `thread-chart-${V}.jpg`];
const { data: listed, error: lsErr } = await sb.storage.from("product-images").list(LIB, { limit: 100 });
if (lsErr && !/not found|does not exist/i.test(lsErr.message)) die(`list คลังภาพไม่ได้: ${lsErr.message}`);
const have = new Set((listed || []).map((f) => f.name));
const missing = need.filter((n) => !have.has(n));

if (missing.length) {
  die(
    `คลังภาพ ${LIB} ขาด ${missing.length}/${need.length} ไฟล์ (${missing.slice(0, 3).join(", ")}…)\n` +
      `  → สร้างก่อนด้วย: node scripts/thread-color-art.mjs --write`
  );
} else {
  console.log(`📦 คลังภาพ ${LIB} ครบ ${need.length} ไฟล์แล้ว`);
}

/* ── 2) คลังตัวเลือกกลาง preset-4 — ใส่รูปให้ทั้ง 13 สี (คง stockItemId) ── */
const { data: presetRow, error: prErr } = await sb
  .from("products")
  .select("id,data")
  .eq("id", PRESET_ROW)
  .maybeSingle();
if (prErr) die(`อ่านคลังตัวเลือกไม่ได้: ${prErr.message}`);
if (!presetRow) die(`ไม่เจอแถวคลังตัวเลือก ${PRESET_ROW}`);

const presetData = structuredClone(presetRow.data);
if ((presetData.choices || []).length !== CODES.length)
  die(`คลัง ${PRESET_ROW} มี ${presetData.choices?.length} ตัวเลือก (คาด ${CODES.length}) — โครงคลังเปลี่ยน`);
let presetNeedsWrite = false;
presetData.choices = presetData.choices.map((c) => {
  const code = codeOf(c.name);
  if (!code) die(`คลัง: ตัวเลือก "${c.name}" ไม่มีรหัสสีไหม`);
  if (c.imageSrc !== imgOf(code)) presetNeedsWrite = true;
  return { ...c, imageSrc: imgOf(code) };
});
console.log(presetNeedsWrite ? "🎨 คลังตัวเลือก preset-4 — ต้องใส่รูป 13 สี" : "🎨 คลังตัวเลือก preset-4 มีรูปครบแล้ว");

if (WRITE && presetNeedsWrite) {
  const { data: back, error } = await sb
    .from("products")
    .update({ data: presetData })
    .eq("id", PRESET_ROW)
    .select("data");
  if (error) die(`เขียนคลังไม่ได้: ${error.message}`);
  if (!back?.length) die("เขียนคลังโดน 0 แถว");
  for (const c of back[0].data.choices) {
    if (c.imageSrc !== imgOf(codeOf(c.name))) die(`คลัง: imageSrc ของ "${c.name}" ไม่ลง`);
    if (!c.stockItemId) die(`คลัง: stockItemId ของ "${c.name}" หาย`);
  }
  console.log("   ✓ คลังอ่านกลับตรง (stockItemId ครบ)");
}

/* ── 3) สินค้าเป้าหมาย ── */
const { data: rows, error } = await sb.from("products").select("id,name,data").neq("category", "__presets__").limit(3000);
if (error) die(error.message);

const isThreadGroup = (o) => {
  if (!/สีไหม/.test(o?.label || "")) return false;
  const names = (o.choices || []).map((c) => (typeof c === "string" ? c : c.name));
  if (names.length !== CODES.length) return false;
  return CODES.every((code) => names.some((n) => n.includes(code)));
};

const targets = rows.filter((p) => {
  if (ONLY.length && !ONLY.includes(p.id)) return false;
  return (p.data?.options || []).some(isThreadGroup);
});
if (ONLY.length) {
  const missed = ONLY.filter((id) => !targets.some((t) => t.id === id));
  if (missed.length) die(`ไม่เจอกลุ่มสีไหม 13 สีในสินค้า: ${missed.join(", ")}`);
}
console.log(`🎯 สินค้าเป้าหมาย ${targets.length} รายการ`);

let changed = 0;
for (const p of targets) {
  const data = structuredClone(p.data);
  let touched = 0;
  for (const o of data.options || []) {
    if (!isThreadGroup(o)) continue;
    o.display = "cards";
    o.note = NOTE;
    o.noteImageSrc = CHART;
    o.choices = o.choices.map((c) => {
      const ch = typeof c === "string" ? { name: c } : { ...c };
      const code = codeOf(ch.name);
      if (!code) die(`${p.id}: ตัวเลือก "${ch.name}" ไม่มีรหัสสีไหม`);
      return { ...ch, imageSrc: imgOf(code) };
    });
    touched++;
  }
  if (!touched) continue;
  changed++;
  console.log(`  · ${p.id} (${p.name}) — ${touched} กลุ่ม → การ์ด + รูป 13 สี + ชาร์ต`);
  if (!WRITE) continue;

  data.savedAt = new Date().toISOString();
  const { data: back, error: upErr } = await sb.from("products").update({ data }).eq("id", p.id).select("data");
  if (upErr) die(`${p.id}: เขียนไม่ได้ ${upErr.message}`);
  if (!back?.length) die(`${p.id}: update โดน 0 แถว`);

  const groups = (back[0].data.options || []).filter(isThreadGroup);
  if (!groups.length) die(`${p.id}: อ่านกลับแล้วไม่เจอกลุ่มสีไหม`);
  for (const g of groups) {
    if (g.display !== "cards") die(`${p.id}: display ไม่ลง (${g.display})`);
    if (g.noteImageSrc !== CHART) die(`${p.id}: noteImageSrc ไม่ลง`);
    for (const c of g.choices) if (c.imageSrc !== imgOf(codeOf(c.name))) die(`${p.id}: imageSrc "${c.name}" ไม่ลง`);
  }
  console.log("    ✓ อ่านกลับตรงทุกช่อง");
}

console.log(WRITE ? `\n✅ เขียนแล้ว ${changed} สินค้า` : `\n(dry-run) จะแก้ ${changed} สินค้า — ใส่ --write เพื่อเขียนจริง`);
