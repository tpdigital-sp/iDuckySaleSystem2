#!/usr/bin/env node
/**
 * ภาพประกอบ "งานสกรีน" ชุดกลางของสินค้าอะคริลิคทั้งหมด — ครอปจากแผ่น HOW TO PRINT ของร้าน
 *
 *   node scripts/acrylic-screen-art.mjs                    # ครอป + ดูแผนว่าจะแตะสินค้าไหนบ้าง
 *   node scripts/acrylic-screen-art.mjs --upload --write   # อัปขึ้นคลังกลาง + ใส่ให้สินค้าจริง
 *   node scripts/acrylic-screen-art.mjs --write --replace  # ทับภาพเดิมด้วย (ไม่ใส่ = เติมเฉพาะตัวที่ยังไม่มีภาพ)
 *
 * เก็บไว้ที่โฟลเดอร์กลาง acrylic-howto/ ไฟล์ชุดเดียวใช้ได้ทุกสินค้า — งานสกรีนอะคริลิคอธิบายเหมือนกันหมด
 * ไม่ต้องก๊อปไฟล์เดียวกันไปไว้ใต้โฟลเดอร์ของสินค้าทีละตัว (แบบเดียวกับชาร์ตสีกลาง acrylic-colors.mjs)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ขึ้นรุ่นใหม่ให้ขยับ REV
 * ⚠️ ไม่แตะ mdf (ป้ายแขวนไม้ MDF) · cardholder / cardholder-clear (สายคล้อง/พลาสติกใส) — ไม่ใช่งานอะคริลิค
 * ⚠️ ไม่แตะ otheracrylicproducts2-2 (กล่องดินสอ) — "3 ด้าน/4 ด้าน" ของตัวนั้นคือด้านของกล่อง ไม่ใช่เลเยอร์สกรีน
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const UPLOAD = process.argv.includes("--upload");
const WRITE = process.argv.includes("--write");
const REPLACE = process.argv.includes("--replace");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1];

const REV = "v1";
const OUT = ".cache/acrylic-howto";
const SOURCES = [
  "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/10_อะคริลิค/พวงกุญแจแผ่นอะคริลิค/howto-Print_Mesa de trabajo 1.jpg",
  `${OUT}/source.jpg`,
];

/** พิกัดกรอบภาพบนแผ่นต้นฉบับ 2867×5000 (2 คอลัมน์ × 3 แถว) */
const COL = [170, 1522];
const ROW = [500, 1950, 3320];
const PW = 1200;
const PH = 1030;
const pair = (top) => ({ left: COL[0], top, width: COL[1] - COL[0] + PW, height: PH });

const CROPS = {
  [`screen-1side-under-${REV}`]: { left: COL[0], top: ROW[0], width: PW, height: PH },
  [`screen-1side-top-${REV}`]: { left: COL[1], top: ROW[0], width: PW, height: PH },
  [`screen-1side-${REV}`]: pair(ROW[0]),
  [`screen-2side-under-top-${REV}`]: { left: COL[0], top: ROW[1], width: PW, height: PH },
  [`screen-2side-top-top-${REV}`]: { left: COL[1], top: ROW[1], width: PW, height: PH },
  [`screen-2side-${REV}`]: pair(ROW[1]),
  [`screen-3layer-${REV}`]: { left: COL[0], top: ROW[2], width: PW, height: PH },
  [`screen-4layer-${REV}`]: { left: COL[1], top: ROW[2], width: PW, height: PH },
};

/**
 * ชื่อตัวเลือก → ภาพที่ใช้ · ไล่จากบนลงล่าง เจอตัวแรกที่ตรงก็ใช้เลย
 * ชื่อของแต่ละสินค้าเขียนไม่เหมือนกัน (สกรีน 1 ด้าน · 1 ด้าน · สกรีนด้านเดียว · ราคาสกรีน 1 ด้าน)
 */
const MATCH = [
  [/3\s*เลเยอร์|3\s*layer/i, `screen-3layer-${REV}`],
  [/4\s*เลเยอร์|4\s*layer/i, `screen-4layer-${REV}`],
  [/2\s*ด้าน.*ใต้\s*-\s*บน/, `screen-2side-under-top-${REV}`],
  [/2\s*ด้าน.*บน\s*-\s*บน/, `screen-2side-top-top-${REV}`],
  [/ด้านใต้อะคริลิค|สกรีนใต้/, `screen-1side-under-${REV}`],
  [/ด้านบนอะคริลิค|สกรีนบน/, `screen-1side-top-${REV}`],
  [/2\s*ด้าน|สองด้าน/, `screen-2side-${REV}`],
  [/1\s*ด้าน|ด้านเดียว/, `screen-1side-${REV}`],
];

/** สินค้าที่ให้ใส่ภาพชุดนี้ + แท็บที่จะแนบแผ่นเต็ม (ไม่ระบุ tab = ไม่แนบแผ่น) */
const TARGETS = [
  { id: "3d-acrylic", tab: "การเตรียมไฟล์" },
  { id: "acrylic-prakob", tab: "การเตรียมไฟล์" },
  { id: "carabiner-acrylic", tab: "การเตรียมไฟล์" },
  { id: "clipboard-acrylic", tab: "การเตรียมไฟล์" },
  { id: "keyring", tab: "รายละเอียดงานสกรีน/ไฟล์" },
  { id: "keyring-clear-stopper", tab: "ขนาดและงานสกรีน" },
  { id: "keyring-copy", tab: "รายละเอียดงานสกรีน/ไฟล์" },
  { id: "keyring-copy-copy", tab: "รายละเอียดงานสกรีน/ไฟล์" },
  { id: "new-mszjfv14-2341", tab: "การเตรียมไฟล์" },
  { id: "standee-clip", tab: "ขนาดและสเปกงาน" },
  { id: "standee-frame-card", tab: "ขนาดและสเปกงาน" },
  { id: "standee-keyring", tab: "ขนาดและสเปกงาน" },
  { id: "standee-spring", tab: "การเตรียมไฟล์" },
  { id: "1-4", tab: "การเตรียมไฟล์" }, // Griptok อะคริลิค
  { id: "1-3", tab: "การเตรียมไฟล์" }, // สแตนดี้ฐานไฟ — ตัวเลือกคือสกรีนบน/ใต้อะคริลิค
  { id: "photoframe-4", tab: "การเตรียมไฟล์" },
  { id: "standy", tab: null }, // ทำไปแล้วรอบก่อน (ใช้ไฟล์ใต้โฟลเดอร์ตัวเอง) — เว้นไว้
];

const GROUP_RE = /^(งานสกรีน|สกรีน|การสกรีน)$/;
const CHART = `howto-print-v1`;
const NOTE =
  "• ดูแผ่น “HOW TO PRINT” ด้านล่าง — เทียบให้เห็นครบทุกแบบ (สกรีนใต้/บน · 2 ด้าน ใต้-บน/บน-บน · 3 และ 4 เลเยอร์)";

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
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/acrylic-howto/${name}.jpg`;

// ── 1. ครอปภาพชุดกลาง ─────────────────────────────────────────────────────
const src = SOURCES.find((f) => existsSync(f));
if (!src) throw new Error("ไม่พบแผ่นต้นฉบับ — ต่อไดรฟ์ร้าน หรือรัน scripts/acrylic-howto-print.mjs ให้แคชไว้ก่อน");
mkdirSync(OUT, { recursive: true });

const SIZE = 700;
const PAD = 24;
const BG = { r: 255, g: 239, b: 205 }; // สีพื้นของแผ่นต้นฉบับ
const files = {};
for (const [name, box] of Object.entries(CROPS)) {
  const inner = SIZE - PAD * 2;
  const panel = await sharp(src).extract(box).resize(inner, inner, { fit: "contain", background: BG }).toBuffer();
  files[name] = await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: BG } })
    .composite([{ input: panel, left: PAD, top: PAD }])
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
    .toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, files[name]);
}
console.log(`🎨 ครอปชุดกลาง ${Object.keys(files).length} ใบ → ${OUT}`);

if (UPLOAD) {
  for (const [name, buf] of Object.entries(files)) {
    const { error } = await sb.storage
      .from("product-images")
      .upload(`products/acrylic-howto/${name}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`${name}: ${error.message}`);
  }
  console.log(`⬆️  อัปขึ้นคลังกลาง products/acrylic-howto/ แล้ว`);
}

// ── 2. ใส่ให้สินค้าแต่ละตัว ────────────────────────────────────────────────
console.log(`\nโหมด: ${REPLACE ? "ทับภาพเดิมทั้งหมด" : "เติมเฉพาะตัวเลือกที่ยังไม่มีภาพ"}${WRITE ? "" : " (ดูผลอย่างเดียว)"}\n`);
let touched = 0;
for (const t of TARGETS) {
  if (t.tab === null && !ONLY) continue;
  if (ONLY && t.id !== ONLY) continue;
  const { data: row, error } = await sb.from("products").select("data").eq("id", t.id).single();
  if (error) throw new Error(`${t.id}: อ่านไม่สำเร็จ — ${error.message}`);
  const d = structuredClone(row.data);
  const opt = (d.options ?? []).find((o) => GROUP_RE.test(o.label));
  if (!opt) throw new Error(`${t.id}: ไม่เจอกลุ่มงานสกรีน`);

  const changes = [];
  for (const c of opt.choices) {
    const hit = MATCH.find(([re]) => re.test(c.name));
    if (!hit) {
      console.log(`   ⚠️ ${t.id}: ไม่รู้ว่า "${c.name}" ใช้ภาพไหน — ข้ามตัวนี้`);
      continue;
    }
    if (c.imageSrc && !REPLACE) continue;
    const next = IMG(hit[1]);
    if (c.imageSrc === next) continue;
    changes.push(`${c.name} → ${hit[1]}`);
    c.imageSrc = next;
  }

  let tabNote = "";
  const tab = t.tab ? d.tabs?.find((x) => x.title === t.tab) : null;
  if (t.tab && !tab) throw new Error(`${t.id}: ไม่เจอแท็บ "${t.tab}"`);
  if (tab && !(tab.images ?? []).includes(IMG(CHART))) {
    tab.images = [...(tab.images ?? []), IMG(CHART)];
    tab.imageSize = "lg";
    if (!tab.text.includes("HOW TO PRINT")) tab.text = `${tab.text.trimEnd()}\n${NOTE}`;
    tabNote = ` · แนบแผ่นเข้าแท็บ "${t.tab}"`;
  }

  if (!changes.length && !tabNote) {
    console.log(`📦 ${t.id.padEnd(24)} (ไม่มีอะไรต้องแก้)`);
    continue;
  }
  console.log(`📦 ${t.id.padEnd(24)} "${d.name}"${tabNote}`);
  changes.forEach((c) => console.log(`      ${c}`));
  touched++;
  if (!WRITE) continue;
  const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", t.id);
  if (saveErr) throw new Error(`${t.id}: บันทึกไม่สำเร็จ — ${saveErr.message}`);
}
console.log(WRITE ? `\n✅ แก้ไป ${touched} สินค้า` : `\n(ยังไม่บันทึก — ใส่ --upload --write · จะแตะ ${touched} สินค้า)`);
