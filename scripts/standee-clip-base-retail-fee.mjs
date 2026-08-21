#!/usr/bin/env node
/**
 * สแตนดี้ + คลิปหนีบ (standee-clip) — ค่าฐานในช่วงราคาปลีก 1-10 ชิ้น (ทางร้านแจ้งใหม่)
 *
 *   node scripts/standee-clip-art.mjs --out=.cache/clip/v5              # เตรียมภาพฐานชุดใหม่
 *   node scripts/standee-clip-base-retail-fee.mjs --upload --images=.cache/clip/v5
 *   node scripts/standee-clip-base-retail-fee.mjs                       # ดูผลก่อน (ไม่เขียนฐานข้อมูล)
 *   node scripts/standee-clip-base-retail-fee.mjs --write               # บันทึกจริง
 *
 * ⛔ ห้ามแก้ด้วยการรัน scripts/add-standee-clip.ts --write ทับ — ของจริงใน DB เดินหน้าไปแล้ว
 *    (กลุ่ม "งานสกรีน" ถูกแยกเป็น 4 ตัวโดย scripts/split-screen-sides.mjs · ป้ายรูปในแกลเลอรีถูกแก้จากหน้าแอดมิน)
 *
 * กฎใหม่ 2 ข้อ (เฉพาะช่วงปลีก 1-10 ชิ้น · เรทส่ง 11 ชิ้นขึ้นไป คิดตามตารางเดิมไม่แตะ):
 *   1. สกรีนลายฐาน +10 บาท/ชิ้น   (เดิมช่วงปลีกไม่คิด — เทียบกับสินค้า "สแตนดี้อะคริลิค" ที่คิด 10 บาทมาตลอด)
 *   2. ฐาน 7 ซม. ขึ้นไป คิด ซม. ละ 5 บาท (6 ซม. ลงมารวมในราคาแล้ว) → 7=+5 · 8=+10 · … · 12=+30
 *      กฎเดียวกับ scripts/standy-base-retail-fee.mjs ของสินค้าสแตนดี้อะคริลิค
 *
 * ⚠️ ตัวเลือกขนาดฐานเดิมมีช่อง "ฐาน 6-7 ซม." รวมกัน (ตามตารางราคาส่งที่รวม 6-7 ไว้ช่องเดียว)
 *    กฎข้อ 2 คิดทีละ ซม. จึงต้องแยกเป็น "ฐาน 6 ซม." กับ "ฐาน 7 ซม." (ผู้ใช้เลือกให้แยก)
 *    ราคาส่งของทั้งสองช่องเท่ากันทุกช่วง (15/25 บาท) — คัดลอกค่าเดิมมาตรง ๆ แล้วตรวจทีละช่อง
 *
 * ⚠️ ภาพฐาน/สกรีนฐานเขียนราคาไว้บนภาพ — ข้อความเปลี่ยน อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้)
 *    จึงขึ้นรุ่นใหม่เป็น -v5 เฉพาะ base-* กับ basescreen-* (ไฟล์อื่นยังเป็น v4 ตามเดิม)
 *
 * รันซ้ำได้ — ถ้าแก้ไปแล้วจะข้ามเอง (ตรวจราคาทุกช่องว่าตรงกับสูตรเก่าหรือสูตรใหม่เท่านั้น)
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const UPLOAD = process.argv.includes("--upload");
const IMAGES_DIR = (process.argv.find((a) => a.startsWith("--images=")) || "").split("=")[1];

const ID = "standee-clip";
const REV = "v5";
const BASE_LABEL = "ขนาดฐาน";
const BASE_SCREEN_LABEL = "ฐานสแตนดี้";
const SIZE_LABEL = "ขนาดตัวสแตนดี้";
const SCREEN_LABEL = "งานสกรีน";
const SCREEN_BASE_YES = "สกรีนลายฐาน";

/** ช่องเดิมที่ต้องแยก → ชื่อใหม่ 2 ช่อง (ราคาส่งเท่ากัน คัดลอกค่าเดิมไปทั้งคู่) */
const SPLIT_FROM = "ฐาน 6-7 ซม.";
const SPLIT_TO = ["ฐาน 6 ซม.", "ฐาน 7 ซม."];

/** เรทปลีก 1-10 ชิ้น: ฐานไม่เกิน 6 ซม. รวมในราคาแล้ว · เกินจากนั้น ซม. ละ 5 บาท */
const FREE_UP_TO_CM = 6;
const BAHT_PER_CM = 5;
/** เรทปลีก 1-10 ชิ้น: สกรีนลายฐานคิดเพิ่มต่อชิ้น */
const BASE_SCREEN_RETAIL_FEE = 10;

/** ราคาแผ่นอะคริลิคช่วง 1-10 ชิ้น ตามขนาด (เรทที่ 1 — ตรงกับ SHEET ใน add-standee-clip.ts) */
const SHEET_RETAIL = {
  6: 140, 7: 150, 8: 160, 9: 170, 10: 180, 11: 190, 12: 200, 13: 210,
  14: 220, 15: 230, 16: 240, 17: 250, 18: 260, 19: 270, 20: 280,
};
/** ค่าสกรีน 2 ด้านตามขนาดชิ้นงาน */
const TWO_SIDE_FEE = {
  6: 15, 7: 15, 8: 25, 9: 25, 10: 25, 11: 30, 12: 30, 13: 30,
  14: 35, 15: 35, 16: 35, 17: 40, 18: 45, 19: 50, 20: 55,
};
/** คลิปหนีบ — บวกทุกชิ้นทุกช่วงจำนวน */
const CLIP_FEE = 10;

/** ภาพที่ข้อความบนภาพเปลี่ยน → ต้องอัปใหม่เป็น -v5 */
const FILES = ["base-3", "base-6", "base-7", "base-8", "base-9", "base-10", "base-11", "base-12", "basescreen-no", "basescreen-yes"];

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
const IMG = (name) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}-${REV}.jpg`;

/** ขนาดฐานที่ใช้คิดค่าฐานเรทปลีก = ตัวเลขตัวท้ายในชื่อช่อง ("ฐาน 3-5 ซม." → 5) */
const baseCm = (name) => {
  const n = (name.match(/\d+/g) ?? []).map(Number).pop();
  if (!Number.isFinite(n)) throw new Error(`อ่านขนาดฐานจากชื่อ "${name}" ไม่ออก — ไม่บันทึก`);
  return n;
};
const retailBaseFee = (name) => Math.max(0, baseCm(name) - FREE_UP_TO_CM) * BAHT_PER_CM;

if (UPLOAD) {
  if (!IMAGES_DIR) throw new Error("ต้องระบุ --images=<โฟลเดอร์> (รัน scripts/standee-clip-art.mjs ก่อน)");
  for (const name of FILES) {
    const buf = await readFile(`${IMAGES_DIR.replace(/\/$/, "")}/${name}.jpg`);
    const { error } = await sb.storage
      .from("product-images")
      .upload(`products/${ID}/${name}-${REV}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`${name}: ${error.message}`);
    console.log(`⬆️  ${name}-${REV}.jpg (${Math.round(buf.length / 1024)} KB)`);
  }
  console.log("");
}

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่สำเร็จ: ${error.message}`);
const d = structuredClone(row.data);
console.log(`📦 ${d.name} (${ID})`);

// ── 1. แยกช่อง "ฐาน 6-7 ซม." เป็น 6 ซม. / 7 ซม. ───────────────────────────
const baseOpt = (d.options ?? []).find((o) => o.label === BASE_LABEL);
if (!baseOpt) throw new Error(`ไม่เจอกลุ่ม "${BASE_LABEL}"`);
const at = baseOpt.choices.findIndex((c) => c.name === SPLIT_FROM);
if (at >= 0) {
  const old = baseOpt.choices[at];
  baseOpt.choices = [
    ...baseOpt.choices.slice(0, at),
    ...SPLIT_TO.map((name) => ({ ...old, name })),
    ...baseOpt.choices.slice(at + 1),
  ];
  console.log(`   แยกตัวเลือก: ${SPLIT_FROM} → ${SPLIT_TO.join(" · ")}`);
} else if (SPLIT_TO.every((n) => baseOpt.choices.some((c) => c.name === n))) {
  console.log(`   แยกตัวเลือก: ข้าม (แยกเป็น ${SPLIT_TO.join(" · ")} ไปแล้ว)`);
} else {
  throw new Error(`ไม่เจอช่อง "${SPLIT_FROM}" และยังไม่มีช่องที่แยกแล้ว — ไม่บันทึก`);
}
const BASE_NAMES = baseOpt.choices.map((c) => c.name);

// ── 2. ภาพประจำตัวเลือกฐาน/สกรีนฐาน → รุ่น v5 (ข้อความราคาบนภาพเปลี่ยน) ────
for (const c of baseOpt.choices) c.imageSrc = IMG(`base-${baseCm(c.name) === 5 ? 3 : baseCm(c.name)}`);
const screenOpt = (d.options ?? []).find((o) => o.label === BASE_SCREEN_LABEL);
if (!screenOpt) throw new Error(`ไม่เจอกลุ่ม "${BASE_SCREEN_LABEL}"`);
for (const c of screenOpt.choices) c.imageSrc = IMG(c.name === SCREEN_BASE_YES ? "basescreen-yes" : "basescreen-no");
console.log(`   ภาพฐาน/สกรีนฐาน: ชี้ไปรุ่น ${REV} (${FILES.length} ไฟล์)`);

// ── 3. ตารางราคา: กางช่องที่แยก + คิดค่าฐานช่วงปลีกใหม่ ────────────────────
let cellCount = 0;
let changed = 0;
for (const m of [d.pricing, ...(d.priceRates ?? []).map((r) => r.pricing)]) {
  if (!m?.cells) continue;
  const labels = m.driverLabels ?? [];
  const iSize = labels.indexOf(SIZE_LABEL);
  const iBase = labels.indexOf(BASE_LABEL);
  const iBaseScreen = labels.indexOf(BASE_SCREEN_LABEL);
  const iScreen = labels.indexOf(SCREEN_LABEL);
  if ([iSize, iBase, iBaseScreen, iScreen].some((i) => i < 0))
    throw new Error(`ตารางราคาไม่มีแกนครบตามที่คาด (${labels.join(" · ")}) — ไม่บันทึก`);

  // กางช่องของฐานที่แยกใหม่ (ราคาส่งเท่ากันทั้งสองช่อง → คัดลอกค่าเดิม)
  const cells = {};
  for (const [k, v] of Object.entries(m.cells)) {
    const parts = k.split("│");
    if (parts[iBase] !== SPLIT_FROM) cells[k] = v;
    else for (const n of SPLIT_TO) cells[parts.map((p, j) => (j === iBase ? n : p)).join("│")] = [...v];
  }

  // ราคาช่วงปลีก (ช่องแรก) คิดใหม่จากสูตร — ช่วงอื่นไม่แตะ
  for (const [k, v] of Object.entries(cells)) {
    const parts = k.split("│");
    const cm = Number(parts[iSize].match(/\d+/)[0]);
    const sheet = SHEET_RETAIL[cm];
    const twoSide = /2\s*ด้าน/.test(parts[iScreen]) ? TWO_SIDE_FEE[cm] : 0;
    if (!sheet) throw new Error(`ไม่มีราคาแผ่นของขนาด ${cm} ซม. ในสูตร — ไม่บันทึก`);
    const before = sheet + twoSide + CLIP_FEE; // สูตรเดิม: ช่วงปลีกไม่คิดค่าฐานเลย
    const after = before + retailBaseFee(parts[iBase]) + (parts[iBaseScreen] === SCREEN_BASE_YES ? BASE_SCREEN_RETAIL_FEE : 0);
    if (v[0] !== before && v[0] !== after)
      throw new Error(`ราคาช่วงปลีกของ "${k}" คือ ${v[0]} ไม่ตรงทั้งสูตรเดิม (${before}) และสูตรใหม่ (${after}) — ไม่บันทึก`);
    if (v[0] !== after) changed++;
    v[0] = after;
    cellCount++;
  }
  m.cells = cells;
}
console.log(`   ตารางราคา: ${cellCount} ช่อง (ทุกเรท) · แก้ราคาช่วงปลีก ${changed} ช่อง`);

// ตัวอย่างให้เทียบด้วยตาเปล่า
const sample = (cm, base, bs, sc) => {
  const k = `${cm} ซม.│${base}│${bs}│${sc}`;
  return `${k} → ${d.pricing.cells[k].join(" / ")}`;
};
const screenChoices = (d.options.find((o) => o.label === SCREEN_LABEL)?.choices ?? []).map((c) => c.name);
console.log(`   ตัวอย่าง ${sample(6, "ฐาน 3-5 ซม.", "ไม่สกรีนฐาน", screenChoices[0])}`);
console.log(`   ตัวอย่าง ${sample(15, "ฐาน 6 ซม.", "ไม่สกรีนฐาน", screenChoices[0])}`);
console.log(`   ตัวอย่าง ${sample(15, "ฐาน 7 ซม.", SCREEN_BASE_YES, screenChoices[0])}`);
console.log(`   ตัวอย่าง ${sample(20, "ฐาน 12 ซม.", SCREEN_BASE_YES, screenChoices[screenChoices.length - 1])}`);

// ── 4. ข้อความที่บอกว่าช่วงปลีก "ไม่คิดค่าฐาน" — เขียนใหม่ให้ตรงกับที่คิดจริง ─
const RULE_SHORT = `ฐาน ${FREE_UP_TO_CM + 1} ซม. ขึ้นไป เพิ่ม ซม. ละ ${BAHT_PER_CM} บาท`;
const TEXT_FIXES = [
  {
    from: "1-10 ชิ้น ราคารวมตัวสแตนดี้ + ฐาน + คลิปหนีบครบ ไม่บวกค่าฐานเพิ่ม",
    to: `1-10 ชิ้น ราคารวมตัวสแตนดี้ + ฐาน + คลิปหนีบ (${RULE_SHORT})`,
  },
  {
    from: "• เลือกขนาดฐานได้ 3-5 · 6-7 · 8 · 9 · 10 · 11 · 12 ซม. —",
    to: "• เลือกขนาดฐานได้ 3-5 · 6 · 7 · 8 · 9 · 10 · 11 · 12 ซม. —",
  },
  {
    from: "• ช่วง 1-10 ชิ้น ราคาในตารางรวมค่าฐานมาแล้ว (เลือกขนาดฐาน/สกรีนฐานได้โดยไม่บวกเพิ่ม)",
    to:
      `• ช่วง 1-10 ชิ้น ราคาในตารางรวมฐานถึง ${FREE_UP_TO_CM} ซม. มาแล้ว — ${RULE_SHORT} · ` +
      `สกรีนลายฐานเพิ่ม ${BASE_SCREEN_RETAIL_FEE} บาท/ชิ้น (ระบบคิดให้ในตารางแล้ว)`,
  },
  {
    from: "เลือกฐาน 3-5 ถึง 12 ซม. · ทรงกลม/สี่เหลี่ยม/ไดคัทตามทรง · สกรีนลายฐานได้",
    to: "เลือกฐาน 3-5 ถึง 12 ซม. · ทรงกลม/สี่เหลี่ยม/ไดคัทตามทรง · สกรีนลายฐานได้ (+10 บาท)",
  },
];
// ⚠️ ข้อความใหม่บางอันมีข้อความเดิมอยู่ข้างใน (ต่อท้ายเฉย ๆ) — ต้องเช็ค to ก่อน ไม่งั้นรันซ้ำแล้วต่อท้ายซ้อน
const walk = (v) =>
  typeof v === "string"
    ? TEXT_FIXES.reduce(
        (s, f) => (!s.includes(f.to) && s.includes(f.from) ? (fixed.add(f.from), s.replaceAll(f.from, f.to)) : s),
        v
      )
    : Array.isArray(v)
      ? v.map(walk)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
        : v;
const fixed = new Set();
const patched = walk(d);
Object.assign(d, patched);
for (const f of TEXT_FIXES) {
  const hit = fixed.has(f.from);
  const already = !hit && JSON.stringify(d).includes(f.to);
  if (!hit && !already) console.log(`   ⚠️ ไม่เจอข้อความให้แก้: "${f.from.slice(0, 48)}…"`);
}
console.log(`   ข้อความ: แก้ ${fixed.size}/${TEXT_FIXES.length} จุด`);

// ── 5. ช่วงราคาที่โชว์บนการ์ดสินค้า ────────────────────────────────────────
const all = [
  ...(d.priceRates ?? []).flatMap((r) => Object.values(r.pricing.cells).flat()),
  ...(d.priceRates?.length ? [] : Object.values(d.pricing?.cells ?? {}).flat()),
].filter((n) => n > 0);
const [min, max] = [Math.min(...all), Math.max(...all)];
console.log(`   ช่วงราคา: ${d.priceMin}-${d.priceMax} → ${min}-${max} บาท/ชิ้น`);
d.priceMin = min;
d.priceMax = max;
d.savedAt = new Date().toISOString();

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write ถ้าต้องการบันทึกจริง)");
  process.exit(0);
}
const { error: saveErr } = await sb.from("products").update({ data: d, price: min }).eq("id", ID);
if (saveErr) throw new Error(`บันทึกไม่สำเร็จ: ${saveErr.message}`);
console.log(`\n✅ บันทึกแล้ว: ${ID}`);
