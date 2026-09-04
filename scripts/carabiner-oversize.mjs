#!/usr/bin/env node
/**
 * Carabiner Acrylic (/products/Carabiner-Acrylic · id carabiner-acrylic)
 * — เปิดขนาดใหญ่กว่ามาตรฐาน 10 ซม. ได้อีก 5 ซม. (11-15 ซม.)
 *
 *   node scripts/carabiner-art.mjs            # วาดภาพขนาด v4 ทั้งชุด 5-15 ซม. ก่อน
 *   node scripts/carabiner-oversize.mjs       # ดูผลก่อน (ไม่เขียนฐานข้อมูล)
 *   node scripts/carabiner-oversize.mjs --write
 *
 * กติการาคา — ตรงกับ **พวงกุญแจอะคริลิค (keyring-copy-copy) และสแตนดี้อะคริลิค (standy)**
 * ที่ร้านใช้อยู่แล้ว (ตรวจจากตารางราคาจริงของสองตัวนั้น ทุกเรทจำนวน):
 *   • ใส / ขาวขุ่น C-02 : ใหญ่ขึ้น 1 ซม. = +฿10          → 15 ซม. = 10 ซม. + ฿50
 *   • สีพิเศษ           : ใหญ่ขึ้น 1 ซม. = +฿15          (ค่าเนื้อพิเศษเองก็โตตามขนาด
 *     ≤10 ซม. บวก ฿10 คงที่ · 11 ซม. +฿15 · 12 ซม. +฿20 … เพิ่มขั้นละ ฿5 ต่อ ซม.)
 *     = "ราคาบวกเพิ่มตามขนาดที่สั่ง" ตามที่เจ้าของร้านสั่ง (4 ก.ย. 69)
 * ค่าเพิ่มลงไปใน **ตารางราคา** ไม่ใช่ +฿ ของตัวเลือก — เหมือนพวงกุญแจ/สแตนดี้ที่ไล่ ซม. ในตาราง
 * (ตัวเลือก +฿ ตัวเดียวคิดเรทต่างกันตามประเภทอะคริลิคไม่ได้ · ตารางยังทำให้ทุกเรทจำนวนถูกด้วย)
 *
 * ⚠️ เรทที่ 1 เก็บ 2 ที่ (data.pricing = ตัวจริง · data.priceRates[0].pricing = เงาที่หน้าร้านอ่าน)
 *    ต้องเขียนทั้งคู่ ไม่งั้นมีคนกดบันทึกจากหน้าแก้ไขแล้วตารางเก่ากลับมาทั้งดุ้น
 * รันซ้ำได้: คำนวณจากแถว 10 ซม. เสมอ · มีช่อง 11-15 อยู่แล้วก็เขียนทับด้วยค่าเดิม
 */
import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ART_DIR = (process.argv.find((a) => a.startsWith("--images=")) || "").split("=")[1] || ".cache/carabiner/upload";

const ID = "carabiner-acrylic";
const SIZE_GROUP = "ขนาด";
const TYPE_GROUP = "ประเภทอะคริลิค";
const SPECIAL = "สีพิเศษ";
const VER = "v4";

const BASE_CM = 10;   // ขนาดใหญ่สุดเดิม = ฐานที่ใช้คิดค่าเพิ่ม
const MAX_CM = 15;    // ใหญ่สุดที่รับ (เจ้าของร้านกำหนด: เพิ่มได้อีก 5 ซม.)
const PER_CM = 10;    // ฿/ซม. ของเนื้อธรรมดา
const PER_CM_SPECIAL_ADD = 5; // ฿/ซม. ที่ค่าเนื้อ "สีพิเศษ" โตขึ้นตามขนาด (รวมเป็น ฿15/ซม.)

/** ชื่อตัวเลือกขนาดใน DB — 5 ซม. สะกดมีเว้นวรรค ("5 cm") มาแต่เดิม ห้ามแก้ คีย์ตารางราคาผูกอยู่ */
const sizeName = (cm) => (cm === 5 ? "5 cm" : `${cm}cm`);
const ALL_CM = Array.from({ length: MAX_CM - 5 + 1 }, (_, i) => 5 + i);
const NEW_CM = ALL_CM.filter((cm) => cm > BASE_CM);

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
const die = (...m) => { console.error("❌", ...m); process.exit(1); };

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", ID).single();
if (readErr) die(readErr);
const data = row.data;

// ── ตรวจโครงก่อน อย่าเดา ────────────────────────────────────────────────
const sizeOpt = (data.options ?? []).find((o) => o.label === SIZE_GROUP);
const typeOpt = (data.options ?? []).find((o) => o.label === TYPE_GROUP);
if (!sizeOpt || !typeOpt) die(`ไม่เจอกลุ่ม "${SIZE_GROUP}" หรือ "${TYPE_GROUP}"`);
const TYPES = typeOpt.choices.map((c) => c.name);
if (!TYPES.includes(SPECIAL)) die(`ไม่เจอตัวเลือก "${SPECIAL}" ในกลุ่ม ${TYPE_GROUP}`);
const CLEAR_TYPES = TYPES.filter((t) => t !== SPECIAL);

const matrices = [data.pricing, ...(data.priceRates ?? []).map((r) => r.pricing)].filter(Boolean);
if (matrices.length !== 2) die("คาดว่ามีตารางราคา 2 ที่ (pricing + priceRates[0]) แต่เจอ", matrices.length);
for (const m of matrices) {
  if (JSON.stringify(m.driverLabels) !== JSON.stringify([TYPE_GROUP, SIZE_GROUP]))
    die("แกนตารางราคาไม่ใช่ [ประเภทอะคริลิค, ขนาด] —", JSON.stringify(m.driverLabels));
}
const key = (type, cm) => `${type}│${sizeName(cm)}`;
const OPT_COUNT = (data.options ?? []).length;   // เก็บไว้ก่อนแก้ ไว้เทียบตอนอ่านกลับว่ากลุ่มไม่หาย

// แถวฐาน 10 ซม. ต้องมีครบทุกประเภท และ "สีพิเศษ" ต้องบวกจากใสเท่ากันทุกเรท (+฿10 ตามกติกาบ้าน)
const base = {};
for (const t of TYPES) {
  const v = data.pricing.cells[key(t, BASE_CM)];
  if (!Array.isArray(v) || !v.length) die(`ไม่เจอแถวฐาน ${key(t, BASE_CM)}`);
  base[t] = v;
}
const N = base[TYPES[0]].length;
if (TYPES.some((t) => base[t].length !== N)) die("จำนวนเรทของแต่ละประเภทไม่เท่ากัน");
for (const t of CLEAR_TYPES) {
  const diff = base[SPECIAL].map((v, i) => v - base[t][i]);
  if (diff.some((d) => d !== 10)) die(`ที่ ${BASE_CM} ซม. "${SPECIAL}" ควรบวกจาก "${t}" ฿10 ทุกเรท แต่ได้ ${diff.join(",")}`);
}

/** ราคาแถวขนาด cm ของประเภทหนึ่ง — ต่อยอดจากแถว 10 ซม. ตามกติกาพวงกุญแจ/สแตนดี้ */
function cellsFor(type, cm) {
  const up = cm - BASE_CM;
  const perCm = PER_CM + (type === SPECIAL ? PER_CM_SPECIAL_ADD : 0);
  return base[type].map((v) => v + perCm * up);
}

console.log(`ตารางราคาที่จะเพิ่ม (${NEW_CM[0]}-${MAX_CM} ซม. · ${N} เรทจำนวน)`);
for (const t of TYPES) {
  console.log(`  ${t}`);
  console.log(`    ${String(BASE_CM).padStart(2)} ซม. (เดิม) ${JSON.stringify(base[t])}`);
  for (const cm of NEW_CM) console.log(`    ${String(cm).padStart(2)} ซม.        ${JSON.stringify(cellsFor(t, cm))}`);
}
console.log("\nค่าเนื้อ 'สีพิเศษ' ที่บวกจากอะคริลิคใส (ต้องโตขึ้น ซม.ละ ฿5 จาก 10 ซม.):");
for (const cm of [BASE_CM, ...NEW_CM]) {
  const c = cm === BASE_CM ? base[CLEAR_TYPES[0]] : cellsFor(CLEAR_TYPES[0], cm);
  const s = cm === BASE_CM ? base[SPECIAL] : cellsFor(SPECIAL, cm);
  console.log(`  ${String(cm).padStart(2)} ซม. → +฿${s[0] - c[0]} (เรทแรก ใส ฿${c[0]} · พิเศษ ฿${s[0]})`);
}

// ── ภาพขนาด v4 ทั้งชุด 11 ใบ (สเกลเดียวกัน เทียบกันได้) ──────────────────
const files = ALL_CM.map((cm) => ({ cm, name: `size-${cm}-${VER}.jpg` }));
const missing = files.filter((f) => !existsSync(`${ART_DIR}/${f.name}`));
if (missing.length) die(`ไม่เจอไฟล์ภาพ ${missing.map((m) => m.name).join(", ")} ใน ${ART_DIR} — รัน scripts/carabiner-art.mjs ก่อน`);

if (!WRITE) {
  console.log(`\nภาพพร้อมอัป ${files.length} ใบ จาก ${ART_DIR}`);
  console.log("(ยังไม่เขียน DB — รันด้วย --write)");
  process.exit(0);
}

const urls = {};
for (const f of files) {
  const path = `products/${ID}/${f.name}`;
  const buf = await readFile(`${ART_DIR}/${f.name}`);
  const { error } = await sb.storage.from("product-images").upload(path, buf, { contentType: "image/jpeg", upsert: true });
  if (error) die("อัปโหลดพัง", path, error);
  urls[f.cm] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
  console.log("อัปโหลดแล้ว", urls[f.cm]);
}
if (ALL_CM.some((cm) => typeof urls[cm] !== "string" || !urls[cm].startsWith("https://"))) die("url ภาพไม่ครบ");

// ── ตัวเลือกขนาด: 5-15 ซม. เรียงเล็ก→ใหญ่ + ภาพ v4 ทั้งชุด ───────────────
const oldChoice = new Map(sizeOpt.choices.map((c) => [c.name, c]));
sizeOpt.choices = ALL_CM.map((cm) => ({ ...(oldChoice.get(sizeName(cm)) ?? {}), name: sizeName(cm), imageSrc: urls[cm] }));
sizeOpt.note =
  `วัดจากด้านที่ยาวที่สุดของชิ้นงาน · มาตรฐานถึง ${BASE_CM} ซม. — ใหญ่กว่านั้นคิดเพิ่ม ซม.ละ ฿${PER_CM} ` +
  `(เนื้อสีพิเศษ ซม.ละ ฿${PER_CM + PER_CM_SPECIAL_ADD}) รับได้ถึง ${MAX_CM} ซม. · ราคาต่อชิ้นดูได้จากตารางราคาด้านบน`;

// ── ตารางราคา: เขียนทั้งตัวจริงและเงา ────────────────────────────────────
for (const m of matrices) {
  for (const t of TYPES) for (const cm of NEW_CM) m.cells[key(t, cm)] = cellsFor(t, cm);
}

// ช่วงราคาที่หน้ารายการ/หน้าแรกใช้ — คิดแบบเดียวกับ priceRange() (มี priceRates = ใช้ของ priceRates)
const all = (data.priceRates ?? []).flatMap((r) => Object.values(r.pricing.cells).flat()).filter((n) => n > 0);
data.priceMin = Math.min(...all);
data.priceMax = Math.max(...all);
if (typeof data.description === "string") data.description = data.description.replace(/เลือกขนาด 5-10 ซม\./, `เลือกขนาด 5-${MAX_CM} ซม.`);
data.savedAt = new Date().toISOString();   // ⚠️ ISO string เท่านั้น (ด่านกัน 409 ของหน้าแก้ไข)

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", ID).select("data");
if (updErr || !upd?.length) die("update พัง/0 แถว", updErr);

// ── อ่านกลับมาเทียบ อย่าเชื่อว่าไม่ error = สำเร็จ ────────────────────────
const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", ID).single();
if (backErr) die(backErr);
const b = back.data;
const bSize = (b.options ?? []).find((o) => o.label === SIZE_GROUP);
const bMatrices = [b.pricing, ...(b.priceRates ?? []).map((r) => r.pricing)];
const same = (a, c) => JSON.stringify(a) === JSON.stringify(c);
const fails = [
  [bSize?.choices?.length === ALL_CM.length, `จำนวนตัวเลือกขนาดไม่ใช่ ${ALL_CM.length}`],
  [ALL_CM.every((cm, i) => bSize.choices[i]?.name === sizeName(cm)), "ชื่อ/ลำดับตัวเลือกขนาดไม่ตรง"],
  [ALL_CM.every((cm, i) => bSize.choices[i]?.imageSrc === urls[cm] && String(urls[cm]).includes(`size-${cm}-${VER}.jpg`)), "ภาพขนาดไม่ตรง"],
  [bMatrices.length === 2, "ตารางราคาหายไปที่ใดที่หนึ่ง"],
  [bMatrices.every((m) => TYPES.every((t) => NEW_CM.every((cm) => same(m.cells[key(t, cm)], cellsFor(t, cm))))), "ช่องราคาใหม่ไม่ตรง"],
  [bMatrices.every((m) => TYPES.every((t) => same(m.cells[key(t, BASE_CM)], base[t]))), "แถวเดิม 10 ซม. เพี้ยน"],
  [bMatrices.every((m) => Object.keys(m.cells).length === TYPES.length * ALL_CM.length), "จำนวนช่องในตารางไม่ครบ 3 ประเภท × 11 ขนาด"],
  [NEW_CM.every((cm) => b.pricing.cells[key(SPECIAL, cm)][0] - b.pricing.cells[key(CLEAR_TYPES[0], cm)][0] === 10 + PER_CM_SPECIAL_ADD * (cm - BASE_CM)), "ค่าเนื้อสีพิเศษไม่โตตามขนาด"],
  [b.priceMax === Math.max(...all) && b.priceMin === Math.min(...all), "ช่วงราคาไม่ตรง"],
  [(b.options ?? []).length === OPT_COUNT, "จำนวนกลุ่มตัวเลือกเปลี่ยน (กลุ่มหาย)"],
  [typeof b.savedAt === "string", "savedAt ไม่ใช่ ISO string"],
  [typeof b.terms === "string" && b.terms.length > 10, "terms โดนล้าง"],
].filter(([ok]) => !ok);
if (fails.length) die("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · "));

console.log(`\n✓ เปิดขนาด ${NEW_CM[0]}-${MAX_CM} ซม. แล้ว · ช่วงราคา ฿${b.priceMin}-฿${b.priceMax} · savedAt =`, b.savedAt);
console.log(`  ตัวอย่าง 13 ซม.: ใส ฿${b.pricing.cells[key(CLEAR_TYPES[0], 13)][0]} · สีพิเศษ ฿${b.pricing.cells[key(SPECIAL, 13)][0]} (เรท 1-10 ชิ้น)`);
