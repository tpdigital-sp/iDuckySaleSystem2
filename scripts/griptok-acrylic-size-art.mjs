#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือก "ขนาด" ของ "Griptok อะคริลิค (5-10cm)" (id 1-4)
 *
 *   node scripts/griptok-acrylic-size-art.mjs           # สร้างการ์ดลง .cache/griptok-acrylic/upload (ไม่อัป ไม่เขียน)
 *   node scripts/griptok-acrylic-size-art.mjs --write   # อัปขึ้น storage + ใส่ imageSrc ให้ตัวเลือกขนาดทั้ง 6
 *
 * กลุ่มตัวเลือกอื่นของสินค้านี้มีภาพครบแล้ว (งานสกรีน/สีอะคริลิค/ฐาน/เคลือบ/ติ่งห้อย)
 * ขาดแค่ "ขนาด" — ทำเป็นการ์ดสเกลจริงแบบเดียวกับแผ่นอะคริลิคเสริมของ griptok-magsafe:
 * กรอบเส้นประขนาดจริง + ไม้บรรทัด 1 ช่อง = 1 ซม. + รูปงานจริงประกอบ (acrylic-1.jpg ของสินค้าเอง)
 * ทุกขนาดวางกรอบชิดขอบบนเดียวกัน เปิดการ์ดคนละใบเทียบขนาดกันได้ด้วยตา
 *
 * ⚠️ "อะคริลิคใส" ในกลุ่มสีอะคริลิคไม่มีภาพ ทั้งระบบจงใจปล่อยว่าง (ชาร์ตสี 45 ใบไม่มีชิพใส) — อย่าเติม
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ครั้งหน้าขึ้น v2
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "1-4";
const OUT = ".cache/griptok-acrylic/upload";
const V = "v1";
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/griptok-acrylic`;

const W = 900;
const H = 900; // จัตุรัส — แกลเลอรีหน้าสินค้าครอปเป็นจัตุรัส (object-cover)
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const LINE = "#cbd5e1";
const ACCENT = "#0ea5e9";
const PAPER = "#f8fafc";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="46" font-weight="700" text-anchor="middle" fill="${INK}">${esc(t)}</text>
  ${sub ? `<text x="${W / 2}" y="134" font-family="${TH}" font-size="26" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>` : ""}`;

const foot = (lines) =>
  lines
    .map((l, i) => `<text x="${W / 2}" y="${800 + i * 34}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${esc(l)}</text>`)
    .join("");

/** px ต่อ 1 ซม. — 10 ซม. = 460px ยังเหลือที่ให้ไม้บรรทัดใต้กรอบ (สเกลเดียวกับการ์ด magsafe) */
const PPC = 46;
const PLATE_TOP = 200;
const PLATE_CX = 530;

/** งานไดคัทตามลายลูกค้า รูปทรงไม่ตายตัว — วาดเป็น "กรอบขนาด" ของขนาดที่สั่ง */
const plateBox = (cm, cx, cy) => {
  const s = cm * PPC;
  return `
    <rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" rx="${Math.round(s * 0.18)}"
          fill="#e0f2fe" fill-opacity="0.55" stroke="${ACCENT}" stroke-width="3" stroke-dasharray="10 7"/>
    <text x="${cx}" y="${cy + 12}" font-family="${TH}" font-size="${Math.max(26, Math.round(s * 0.13))}"
          font-weight="700" text-anchor="middle" fill="${ACCENT}">${cm} cm</text>`;
};

const ruler = (cm, cx, y) => {
  const s = cm * PPC;
  const x0 = cx - s / 2;
  const ticks = Array.from({ length: cm + 1 }, (_, i) => `<line x1="${x0 + i * PPC}" y1="${y - 7}" x2="${x0 + i * PPC}" y2="${y + 7}" stroke="${LINE}" stroke-width="2"/>`).join("");
  return `<line x1="${x0}" y1="${y}" x2="${x0 + s}" y2="${y}" stroke="${LINE}" stroke-width="2"/>${ticks}
    <text x="${cx}" y="${y + 38}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">สเกลจริง 1 ช่อง = 1 ซม.</text>`;
};

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`โหลด ${url} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

console.log(`🎨 การ์ดขนาด Griptok อะคริลิค → ${OUT}`);
const example = await sharp(await get(`${BASE}/acrylic-1.jpg`)).resize({ width: 250 }).toBuffer();
const exampleMeta = await sharp(example).metadata();

const files = [];
for (const cm of [5, 6, 7, 8, 9, 10]) {
  const svg = frame(
    `${title(`ขนาด ${cm} cm`, "ขนาดชิ้นงาน Griptok อะคริลิค — นับจากด้านที่ยาวที่สุด")}
     ${plateBox(cm, PLATE_CX, PLATE_TOP + (cm * PPC) / 2)}
     ${ruler(cm, PLATE_CX, 706)}
     <text x="152" y="${205 + exampleMeta.height + 34}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ตัวอย่างงานจริง</text>
     ${foot(["รูปทรงไดคัทตามลายที่ส่งมา · กรอบเส้นประคือขนาดที่สั่ง (สเกลจริง)", "ขนาดนับจากด้านที่ยาวที่สุด ไม่วัดแนวทแยง · ตัดตกจากขนาดจริงด้านละ 3mm"])}`
  );
  const buf = await sharp(Buffer.from(svg))
    .composite([{ input: example, left: 27, top: 205 }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  const name = `size-${cm}-${V}.jpg`;
  writeFileSync(`${OUT}/${name}`, buf);
  console.log(`   ${name}  ${Math.round(buf.length / 1024)} KB`);
  files.push({ cm, name, buf });
}

if (!WRITE) {
  console.log("\n(ยังไม่อัป/ไม่เขียนฐานข้อมูล — เปิดไฟล์ดูก่อน แล้วใส่ --write)");
  process.exit(0);
}

/* ── อัปขึ้น storage + ใส่ imageSrc ให้ตัวเลือกขนาด ─────────────────── */
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
for (const f of files) {
  const { error } = await sb.storage.from("product-images").upload(`products/griptok-acrylic/${f.name}`, f.buf, { contentType: "image/jpeg", upsert: false });
  if (error && !/already exists|Duplicate/i.test(error.message)) throw error;
  console.log(`⬆️  ${f.name} ${error ? "(มีอยู่แล้ว ใช้ของเดิม)" : "อัปแล้ว"}`);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", ID).single();
if (readErr) throw readErr;
const d = row.data;
const sizeOpt = (d.options || []).find((o) => o.label === "ขนาด");
if (!sizeOpt) throw new Error('ไม่เจอกลุ่มตัวเลือก "ขนาด" — โครงข้อมูลเปลี่ยน');
for (const c of sizeOpt.choices) {
  const cm = parseInt(c.name, 10);
  const f = files.find((x) => x.cm === cm);
  if (!f) throw new Error(`ตัวเลือกขนาด "${c.name}" ไม่ตรงกับการ์ดที่สร้าง (5-10)`);
  c.imageSrc = `${BASE}/${f.name}`;
}
const { error: writeErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (writeErr) throw writeErr;
console.log(`\n✅ ใส่ภาพให้ตัวเลือกขนาดทั้ง ${sizeOpt.choices.length} ตัวแล้ว (id ${ID})`);
