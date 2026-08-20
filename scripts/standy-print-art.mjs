#!/usr/bin/env node
/**
 * ภาพประกอบกลุ่ม "งานสกรีน" ของสินค้าสแตนดี้อะคริลิค (Acrylic Standee) — id: standy
 *
 *   node scripts/standy-print-art.mjs                    # ครอปไว้ดูก่อน (ไม่แตะคลัง/ฐานข้อมูล)
 *   node scripts/standy-print-art.mjs --upload --write   # อัปขึ้นคลัง + ชี้ตัวเลือกมาที่ภาพชุดนี้
 *
 * ครอปมาจากแผ่น "HOW TO PRINT" ของร้านโดยตรง (งานฝ่าย Content — ดู scripts/acrylic-howto-print.mjs)
 * ไม่วาดใหม่ เพราะแผ่นนี้คือภาษาภาพที่ร้านใช้อธิบายลูกค้าอยู่แล้ว ลูกค้าเห็นแล้วตรงกับที่แอดมินอธิบาย
 *
 * ⚠️ ชุดก่อนหน้า:
 *    -v5 ครอปจากแผ่นเดียวกันแต่ครอปเบี้ยว หัวป้ายแหว่ง ขนาดไม่เท่ากันสักใบ (460×340/310/295/282)
 *    -v6 วาดใหม่เป็นสไตล์เว็บ (เป็ด iDucky 3D) — สวยแต่ไม่ตรงกับแผ่นที่ร้านใช้อธิบาย
 *    -v7 (ชุดนี้) ครอปจากแผ่นจริงให้ตรงกรอบ แล้ววางบนพื้น 700×700 เท่ากันทุกใบ
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ขึ้นรุ่นใหม่ให้ขยับ REV
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const UPLOAD = process.argv.includes("--upload");
const WRITE = process.argv.includes("--write");

const ID = "standy";
const GROUP = "งานสกรีน";
const REV = "v7";
const OUT = ".cache/standy/print";

/** ต้นฉบับแผ่น HOW TO PRINT — แคชไว้ที่เดียวกับ scripts/acrylic-howto-print.mjs */
const SOURCES = [
  "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/10_อะคริลิค/พวงกุญแจแผ่นอะคริลิค/howto-Print_Mesa de trabajo 1.jpg",
  ".cache/acrylic-howto/source.jpg",
];

/**
 * พิกัดกรอบภาพบนแผ่นต้นฉบับ (2867×5000) — วัดจากการครอปทดลอง
 * แผ่นวาง 2 คอลัมน์ × 3 แถว · ครอปเอา "หัวป้าย + กรอบภาพ" ไม่เอาคำอธิบายใต้กรอบ
 * (คำอธิบายตัวเล็ก ย่อเป็นภาพชิปแล้วอ่านไม่ออกอยู่ดี — ลูกค้าดูฉบับเต็มได้ในแท็บ)
 */
const COL = [170, 1522];
const ROW = [500, 1950, 3320];
const PANEL_W = 1200;
const PANEL_H = 1030;

/** ตัวเลือกในกลุ่ม → กรอบที่ครอป (บางตัวครอปสองกรอบมาต่อกัน) */
const SHOTS = {
  // "สกรีน 1 ด้าน" ของสินค้านี้ยังไม่ได้แยกใต้/บน — ครอปทั้งแถวให้เห็นทั้งสองแบบในใบเดียว
  [`print-1side-${REV}`]: { left: COL[0], top: ROW[0], width: COL[1] - COL[0] + PANEL_W, height: PANEL_H },
  [`print-2side-under-top-${REV}`]: { left: COL[0], top: ROW[1], width: PANEL_W, height: PANEL_H },
  [`print-2side-top-top-${REV}`]: { left: COL[1], top: ROW[1], width: PANEL_W, height: PANEL_H },
  [`print-3layer-${REV}`]: { left: COL[0], top: ROW[2], width: PANEL_W, height: PANEL_H },
  [`print-4layer-${REV}`]: { left: COL[1], top: ROW[2], width: PANEL_W, height: PANEL_H },
};

/** ชื่อตัวเลือกในกลุ่ม → ชื่อไฟล์ภาพ (ลำดับนี้คือลำดับที่จะโชว์ในหน้าสินค้า) */
const CHOICES = [
  ["สกรีน 1 ด้าน", `print-1side-${REV}`],
  ["สกรีน 2 ด้าน (ใต้-บน)", `print-2side-under-top-${REV}`],
  ["สกรีน 2 ด้าน (บน-บน)", `print-2side-top-top-${REV}`],
  ["สกรีน 3 เลเยอร์", `print-3layer-${REV}`],
  ["สกรีน 4 เลเยอร์", `print-4layer-${REV}`],
];

const SIZE = 700;
const PAD = 24;
/** สีพื้นของแผ่นต้นฉบับ — วางกรอบที่ครอปบนพื้นสีเดียวกัน ภาพจะดูต่อเนื่องเป็นชุดเดียว */
const BG = { r: 255, g: 239, b: 205 };

const src = SOURCES.find((f) => existsSync(f));
if (!src) throw new Error(`ไม่พบต้นฉบับ — ต่อไดรฟ์ร้านก่อน หรือรัน node scripts/acrylic-howto-print.mjs ให้แคชไฟล์ไว้`);
mkdirSync(OUT, { recursive: true });

const files = {};
for (const [name, box] of Object.entries(SHOTS)) {
  const inner = SIZE - PAD * 2;
  const panel = await sharp(src)
    .extract(box)
    .resize(inner, inner, { fit: "contain", background: BG })
    .toBuffer();
  const buf = await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: BG } })
    .composite([{ input: panel, left: PAD, top: PAD }])
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
    .toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  files[name] = buf;
  console.log(`🎨 ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
}
console.log(`\n✅ ไฟล์ทั้งหมดอยู่ที่ ${OUT}`);

if (!UPLOAD && !WRITE) {
  console.log("\n(ยังไม่อัปขึ้นคลัง/ไม่แตะฐานข้อมูล — ใส่ --upload --write ถ้าต้องการใช้จริง)");
  process.exit(0);
}

const { readFileSync } = await import("node:fs");
const { createClient } = await import("@supabase/supabase-js");
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
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}.jpg`;

if (UPLOAD) {
  for (const [name, buf] of Object.entries(files)) {
    const { error } = await sb.storage
      .from("product-images")
      .upload(`products/${ID}/${name}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`${name}: ${error.message}`);
    console.log(`⬆️  ${name}.jpg`);
  }
}
if (!WRITE) process.exit(0);

// ── แยก "สกรีน 2 ด้าน" เป็นใต้-บน / บน-บน แล้วชี้ทุกตัวมาที่ภาพชุดใหม่ ─────
const OLD_2SIDE = "สกรีน 2 ด้าน";
const NEW_2SIDE = ["สกรีน 2 ด้าน (ใต้-บน)", "สกรีน 2 ด้าน (บน-บน)"];

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่สำเร็จ: ${error.message}`);
const d = structuredClone(row.data);
const before = structuredClone(row.data);

const opt = d.options?.find((o) => o.label === GROUP);
if (!opt) throw new Error(`ไม่เจอกลุ่ม "${GROUP}"`);
const known = new Set(CHOICES.map(([n]) => n));
const extra = opt.choices.filter((c) => c.name !== OLD_2SIDE && !known.has(c.name));
if (extra.length) throw new Error(`มีตัวเลือกที่ไม่รู้จักในกลุ่ม: ${extra.map((c) => c.name).join(" · ")} — ไม่บันทึก`);
opt.choices = CHOICES.map(([name, file]) => ({
  ...(opt.choices.find((c) => c.name === name) ?? {}),
  name,
  imageSrc: IMG(file),
}));

/** ตารางราคา — "สกรีน 2 ด้าน" เป็นแกนราคา แตกเป็นสองชื่อ ราคาเท่าเดิมทั้งคู่ (งานสองด้านเหมือนกัน) */
for (const m of [d.pricing, ...(d.priceRates ?? []).map((r) => r.pricing)]) {
  if (!m?.cells || !(m.driverLabels ?? []).includes(GROUP)) continue;
  const at = m.driverLabels.indexOf(GROUP);
  const cells = {};
  for (const [k, v] of Object.entries(m.cells)) {
    const parts = k.split("│");
    if (parts[at] !== OLD_2SIDE) cells[k] = v;
    else for (const n of NEW_2SIDE) cells[parts.map((p, i) => (i === at ? n : p)).join("│")] = v;
  }
  m.cells = cells;
}

/** กฎที่ระบุชื่อ "สกรีน 2 ด้าน" ไว้ในลิสต์ที่อนุญาต — ต้องเปลี่ยนเป็นสองชื่อใหม่ */
for (const r of d.rules ?? []) {
  if (r.limit?.label === GROUP && r.limit.allow.includes(OLD_2SIDE))
    r.limit.allow = r.limit.allow.flatMap((n) => (n === OLD_2SIDE ? NEW_2SIDE : [n]));
  if (r.when?.label === GROUP) {
    const list = r.when.choices ?? [r.when.choice];
    if (list.includes(OLD_2SIDE)) r.when.choices = list.flatMap((n) => (n === OLD_2SIDE ? NEW_2SIDE : [n]));
  }
}

/** คำถามที่พบบ่อยไล่ชื่อตัวเลือกไว้ — ให้ตรงกับของจริง */
for (const f of d.seo?.faqs ?? []) {
  if (f.a?.includes(`${GROUP}:`))
    f.a = f.a.replace(new RegExp(`(${GROUP}:\\s*)([^·]*)`), `$1${opt.choices.map((c) => c.name).join(", ")}`);
}

console.log(`\n📦 ${d.name} (${ID})`);
opt.choices.forEach((c) => console.log(`   ${c.name.padEnd(24)} → ${c.imageSrc.split("/").pop()}`));
for (const [label, m, b] of [
  ["ตารางหลัก", d.pricing, before.pricing],
  ...(d.priceRates ?? []).map((r, i) => [`เรท ${r.id}`, r.pricing, before.priceRates[i].pricing]),
]) {
  if (!m?.cells) continue;
  console.log(`   ${label}: ${Object.keys(b.cells).length} → ${Object.keys(m.cells).length} ช่อง`);
  const at = (m.driverLabels ?? []).indexOf(GROUP);
  const bad = Object.entries(m.cells).filter(([k, v]) => {
    const parts = k.split("│");
    const old = at >= 0 && NEW_2SIDE.includes(parts[at]) ? parts.map((p, i) => (i === at ? OLD_2SIDE : p)).join("│") : k;
    return JSON.stringify(b.cells[old]) !== JSON.stringify(v);
  });
  if (bad.length) throw new Error(`${label}: ราคาเพี้ยน ${bad.length} ช่อง เช่น ${bad[0][0]} — ไม่บันทึก`);
  console.log(`   ${label}: ราคาตรงกับของเดิมทุกช่อง ✅`);
}

const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw new Error(`บันทึกไม่สำเร็จ: ${saveErr.message}`);
console.log(`✅ บันทึกแล้ว: ${ID}`);
