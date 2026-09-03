#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "MiNi FOLDER" (mini-folder) + ขนาดไซส์บนตัวเลือก เล็ก/ใหญ่
 *
 *   node scripts/mini-folder-option-art.mjs            (ครอปภาพลง .cache/mini-folder/upload)
 *   node scripts/mini-folder-option-art.mjs --write    (+ อัปโหลด storage + ตั้ง imageSrc/desc + อ่านกลับเทียบ)
 *
 * แหล่งภาพ:
 *   ขนาดเล็ก — ครอปจากรูปแกลเลอรีใบที่ 5 (คู่เล็ก-ใหญ่ 959b83_d58b866b) · ขนาดใหญ่ — ครอปจาก
 *   รูปใบใหญ่เดี่ยว (959b83_7f464ff5 — รูปคู่ครอปแล้วติดโลโก้ "folder." มุมซ้าย)
 *   สีตะขอ Z2/C — ผู้ใช้สั่งเปลี่ยน 2 รอบ (3 ก.ย. 69): รอบแรกครอปชาร์ต "ตะขอ | อะไหล่เสริม" รุ่นใหม่
 *   (959b83_952c488c... หน้า /partskeychain) แต่ช่องบนชาร์ตเล็กมาก (~100-200px) ขยายแล้วแตก
 *   → v2 ประกอบจากแหล่งคมจริง: Z2 ครอปโซ่เงินจากรูปงานจริง 4798px (959b83_cc76cec2 หน้า /keyring)
 *   · C ประกอบแถบโซ่ 13 สีจากชาร์ตสีตะขอ C ความละเอียดสูง (959b83_44f87a38 2000×1371 — ชาร์ตเดียว
 *   กับ hookchart-c ของ standee-keyring) เลี่ยงป้ายชื่อสีด้วย offset ต่อแถว
 *   ⚠️ เว็บไม่มีรูปถ่ายกลุ่ม "โซ่หลายสี/โซ่เงิน" เดี่ยว ๆ ความละเอียดสูง (ไล่ดูครบทั้ง /partskeychain
 *   และ /keyring แล้ว) และการขอไฟล์ใหญ่จาก Wix (w_2908) ได้แค่อัปสเกลฝั่งเซิร์ฟเวอร์ ไม่คมขึ้น
 *   สีโซ่ C1..C27 — คลังภาพตะขอชุดกลางที่ products/standee-keyring/ (ใช้ร่วมทุกสินค้า
 *   แบบเดียวกับ photo-fram-acrylic ไม่อัปซ้ำ) — สคริปต์ HEAD เช็คว่าไฟล์มีจริงก่อนเขียน DB
 *
 * ขนาดไซส์ (จากใบสเปคไดรฟ์ ชุดคำอธิบาย 3 ก.ย. 69 — proposals-fabric.json):
 *   เล็ก 4×4.5 ซม. รูป 1 นิ้ว ช่องใส่ภาพ 8 แผ่น · ใหญ่ 4.8×6.2 ซม. รูปไม่เกิน 2 นิ้ว ปกหน้า-หลังสอดภาพได้
 *   → ใส่เป็น choice.desc + เปลี่ยนกลุ่ม "ขนาด" เป็น display "cards" (desc โชว์เฉพาะทรงการ์ด)
 *   ⚠️ ห้ามแก้ชื่อตัวเลือก เล็ก/ใหญ่ — เป็นคีย์ของ pricing.cells ("เล็ก│ตะขอ...") และ rules
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "mini-folder";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/mini-folder/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const STORE = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images`;
/** คลังภาพตะขอชุดกลาง (วาดไว้ตอนทำ standee-keyring — ใช้ร่วมทุกสินค้า) */
const HOOKLIB = `${STORE}/products/standee-keyring`;

// ── 1) ครอปภาพขนาด เล็ก/ใหญ่ ────────────────────────────────────────
const SRC = {
  both: "https://static.wixstatic.com/media/959b83_d58b866b2fc44a94b431b1aa6019cef3~mv2.jpg", // 3494×3406
  large: "https://static.wixstatic.com/media/959b83_7f464ff533a6431ba5cb91184db077f2~mv2.jpg", // 3434×3390
  silver: "https://static.wixstatic.com/media/959b83_cc76cec20e62472180dd12252291fd60~mv2.jpg", // รูปงานจริงโซ่เงิน 4798×3741
  cchart: "https://static.wixstatic.com/media/959b83_44f87a38028f452b8420727df4a3e101~mv2.jpg", // ชาร์ตสีตะขอ C 2000×1371
};
async function srcOf(key) {
  const p = `${OUT}/_src-${key}.jpg`;
  if (!existsSync(p)) {
    const res = await fetch(SRC[key]);
    if (!res.ok) { console.error("โหลดรูปต้นฉบับไม่ได้", key, res.status); process.exit(1); }
    writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  }
  return p;
}
// พิกัดบนต้นฉบับ — จัดกรอบให้เห็นทั้งใบ+กระดุม โดยไม่ติดโลโก้ที่แปะบนภาพ
const CROPS = {
  "size-small": { src: "both", left: 190, top: 1148, width: 1900, height: 1900 },
  "size-large": { src: "large", left: 586, top: 645, width: 2300, height: 2300 },
  "hook-z2": { src: "silver", left: 2810, top: 140, width: 1470, height: 1470 },
};

/** ประกอบภาพ "โซ่ไข่ปลาหลายสี" จากชาร์ตสีตะขอ C — แถบโซ่ 13 สีเรียงเฉดเหมือนรูปหมู่ของชาร์ตใหม่
 *  [คอลัมน์ L/M ของชาร์ต, y กลางเส้นโซ่, offset หนีป้ายชื่อสีของแถวข้างเคียง] */
async function makeRainbowStack() {
  const rows = [
    ["L", 157, 6], ["L", 325, 6], ["L", 493, 12], ["L", 591, 8], ["L", 675, 8], ["L", 843, 8], ["L", 1158, 6],
    ["M", 157, 6], ["M", 321, 6], ["M", 493, 6], ["M", 752, 6], ["M", 1008, 6], ["M", 1169, 6],
  ];
  const src = await srcOf("cchart");
  // พิกัดวัดจากฉบับ 2000×1371 — ไฟล์จริงบน Wix ใหญ่กว่า (3572×2449) จึงสเกลตามขนาดที่โหลดได้
  const k = (await sharp(src).metadata()).width / 2000;
  const X = { L: Math.round(115 * k), M: Math.round(758 * k) };
  const W = Math.round(540 * k), H = Math.round(32 * k), GAP = Math.round(7 * k);
  const strips = [];
  for (const [col, y, dy] of rows) {
    strips.push(await sharp(src).extract({ left: X[col], top: Math.round((y - 16 + dy) * k), width: W, height: H }).toBuffer());
  }
  const canvasH = rows.length * (H + GAP) - GAP;
  return sharp({ create: { width: W, height: canvasH, channels: 3, background: "#f2f0ee" } })
    .composite(strips.map((buf, i) => ({ input: buf, left: 0, top: i * (H + GAP) })))
    .png().toBuffer();
}

/** ภาพครอปที่จะอัปโหลด + จุดที่เอา URL ไปตั้ง (group → choice → desc ใหม่) */
const SIZE_ART = {
  "size-small": {
    targets: [["ขนาด", "เล็ก"]],
    desc: "4 × 4.5 ซม. · สำหรับรูปขนาด 1 นิ้ว · ช่องใส่ภาพ 8 แผ่น",
    note: "ไซส์เล็ก",
  },
  "size-large": {
    targets: [["ขนาด", "ใหญ่"]],
    desc: "4.8 × 6.2 ซม. · สำหรับรูปไม่เกิน 2 นิ้ว · ปกหน้า-หลังสอดภาพได้ + ช่องด้านใน 8 แผ่น",
    note: "ไซส์ใหญ่",
  },
  "hook-z2": { targets: [["สีตะขอ", "ตะขอ Z2 โซ่ไข่ปลาสีเงิน"]], note: "โซ่ไข่ปลาสีเงิน (รูปงานจริง)" },
  "hook-c": { targets: [["สีตะขอ", "ตะขอ C โซ่ไข่ปลาหลายสี"]], note: "โซ่ไข่ปลาหลายสี (ประกอบจากชาร์ตสี C)" },
};
/** ไฟล์ที่แก้ภาพทีหลัง — ขึ้นรุ่นเฉพาะตัว (v1 โดน CDN แคชแล้ว ห้ามอัปทับ) */
const VER_OF = { "hook-z2": "v2", "hook-c": "v2" };

const files = [];
for (const [name, art] of Object.entries(SIZE_ART)) {
  const file = `${name}-${VER_OF[name] ?? VER}.jpg`;
  let base;
  if (name === "hook-c") {
    base = sharp(await makeRainbowStack());
  } else {
    const { src, ...box } = CROPS[name];
    base = sharp(await srcOf(src)).extract(box);
  }
  const buf = await base
    .resize(900, 900, name === "hook-c" ? { fit: "contain", background: "#ffffff" } : {})
    .jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${file}`, buf);
  files.push({ ...art, name, file, path: `${OUT}/${file}` });
  console.log(`🖼  ${file}  ${Math.round(buf.length / 1024)} KB — ${art.note}`);
}

// ── 2) ภาพสีโซ่จากคลังชุดกลาง (ไม่อัปโหลดซ้ำ อ้าง URL ตรง) ─────────
/** สีตะขอ C (โซ่ไข่ปลา) — จับคู่ด้วยรหัส C หน้าชื่อ ("C13 สีเขียว" → hookcolor-C13-v6.jpg) */

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log(`\n(${files.length} ภาพครอป · ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)`); process.exit(0); }

const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// อัปโหลดภาพขนาด 2 ใบ
for (const f of files) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, readFileSync(f.path), { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  f.url = `${STORE}/${key}`;
  console.log("อัปโหลดแล้ว", f.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

const want = []; // [group, choiceName, url, desc?] — เก็บไว้เทียบตอนอ่านกลับ

// กลุ่ม "ขนาด" → cards + ภาพ + desc ขนาดไซส์ · กลุ่ม "สีตะขอ" → ภาพครอปชาร์ตใหม่
const sizeGrp = (data.options ?? []).find((o) => o.label === "ขนาด");
if (!sizeGrp) { console.error('ไม่เจอกลุ่ม "ขนาด"'); process.exit(1); }
sizeGrp.display = "cards";
for (const f of files) {
  for (const [group, choice] of f.targets) {
    const grp = (data.options ?? []).find((o) => o.label === group);
    const c = grp?.choices?.find((c) => c.name === choice);
    if (!c) { console.error(`ไม่เจอตัวเลือก "${choice}" ในกลุ่ม "${group}"`); process.exit(1); }
    c.imageSrc = f.url;
    if (f.desc !== undefined) c.desc = f.desc;
    want.push([group, choice, f.url, f.desc]);
  }
}

// เช็คว่าไฟล์ในคลังชุดกลางมีจริง (HEAD) ก่อนอ้าง
async function mustExist(url) {
  const res = await fetch(url, { method: "HEAD" });
  if (!res.ok) { console.error("ไฟล์คลังกลางหาย!", url, res.status); process.exit(1); }
}

// กลุ่ม "สีตะขอ C (โซ่ไข่ปลา)" — ทุกตัวที่ขึ้นต้นด้วยรหัส C ("ไม่มีตัวเลือก" ข้าม)
const cGrp = (data.options ?? []).find((o) => o.label === "สีตะขอ C (โซ่ไข่ปลา)");
if (!cGrp) { console.error('ไม่เจอกลุ่ม "สีตะขอ C (โซ่ไข่ปลา)"'); process.exit(1); }
for (const c of cGrp.choices ?? []) {
  const m = /^(C\d+)\s/.exec(c.name ?? "");
  if (!m) continue;
  const url = `${HOOKLIB}/hookcolor-${m[1]}-v6.jpg`;
  await mustExist(url);
  c.imageSrc = url;
  want.push(["สีตะขอ C (โซ่ไข่ปลา)", c.name, url]);
}

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
let checked = 0;
for (const [group, choice, url, desc] of want) {
  const grp = back.data.options.find((o) => o.label === group);
  const c = grp?.choices?.find((c) => c.name === choice);
  if (!c || c.imageSrc !== url || (desc !== undefined && c.desc !== desc)) {
    console.error("อ่านกลับไม่ตรง!", group, choice, c?.imageSrc, c?.desc); process.exit(1);
  }
  checked++;
}
const backSize = back.data.options.find((o) => o.label === "ขนาด");
if (backSize.display !== "cards") { console.error('display กลุ่ม "ขนาด" ไม่ใช่ cards'); process.exit(1); }
console.log(`✓ ตั้ง imageSrc ครบ ${checked} จุด (ครอปใหม่ ${files.length} + คลังตะขอ ${checked - files.length}) · ขนาดไซส์ลง desc + cards แล้ว · savedAt =`, back.data.savedAt);
