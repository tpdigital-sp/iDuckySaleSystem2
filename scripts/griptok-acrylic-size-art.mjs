#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือก "ขนาด" ของ "Griptok อะคริลิค (5-10cm)" (id 1-4)
 *
 *   node scripts/griptok-acrylic-size-art.mjs           # สร้างการ์ดลง .cache/griptok-acrylic/upload (ไม่อัป ไม่เขียน)
 *   node scripts/griptok-acrylic-size-art.mjs --write   # อัปขึ้น storage + ใส่ imageSrc ให้ตัวเลือกขนาดทั้ง 6
 *
 * กลุ่มตัวเลือกอื่นของสินค้านี้มีภาพครบแล้ว (งานสกรีน/สีอะคริลิค/ฐาน/เคลือบ/ติ่งห้อย)
 * ขาดแค่ "ขนาด" — การ์ดออกแบบรอบ 2 (ผู้ใช้ตีแบบแรกกลับ 25 ส.ค. 69 ว่าดูโล่ง/องค์ประกอบลอย):
 *   เทียบขนาดกับ "มือถือ" (7.2×14.7 ซม.) ที่สเกลจริงเดียวกัน วางบนเส้นพื้นเดียวกัน
 *   กรอบเส้นประ = ขนาดชิ้นงาน + เลขขนาดตัวใหญ่ (ภาพย่อบนปุ่มตัวเลือกเล็กมาก ต้องอ่านเลขออก)
 *   ไม้บรรทัดชิดใต้กรอบ · ทุกใบสเกลเดียวกัน เปิดคนละใบเทียบกันได้ด้วยตา
 *
 * ⚠️ "อะคริลิคใส" ในกลุ่มสีอะคริลิคไม่มีภาพ ทั้งระบบจงใจปล่อยว่าง (ชาร์ตสี 45 ใบไม่มีชิพใส) — อย่าเติม
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — รอบนี้ -v2 (v1 คือแบบแรกที่ถูกตีกลับ) ครั้งหน้าขึ้น v3
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "1-4";
const OUT = ".cache/griptok-acrylic/upload";
const V = "v2";
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
const ACCENT = "#0284c7";
const ACCENT_SOFT = "#bae6fd";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** px ต่อ 1 ซม. — สเกลเดียวทุกใบ (มือถือ 14.7 ซม. ต้องอยู่ในการ์ดพร้อมหัวเรื่อง) */
const PPC = 38;
const GROUND = 712; // เส้นพื้นร่วมของมือถือกับกรอบขนาด
const PHONE_CM = { w: 7.15, h: 14.7 };
const PHONE_CX = 250;
const PLATE_CX = 615;

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e0f2fe"/><stop offset="0.55" stop-color="#f8fafc"/><stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
    <linearGradient id="plate" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e0f2fe" stop-opacity="0.9"/><stop offset="1" stop-color="#bae6fd" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="30" fill="#ffffff" fill-opacity="0.72" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const header = (cm) => `
  <text x="${W / 2}" y="96" font-family="${TH}" font-size="52" font-weight="700" text-anchor="middle" fill="${INK}">ขนาดชิ้นงาน <tspan fill="${ACCENT}">${cm} cm</tspan></text>
  <text x="${W / 2}" y="142" font-family="${TH}" font-size="25" text-anchor="middle" fill="${SUB}">Griptok อะคริลิค — เทียบขนาดกับมือถือที่สเกลจริงเดียวกัน</text>`;

/** มือถือเงาอ้างอิงสเกล (7.15×14.7 ซม.) ยืนบนเส้นพื้นเดียวกับกรอบขนาด */
const phone = () => {
  const w = PHONE_CM.w * PPC;
  const h = PHONE_CM.h * PPC;
  const x = PHONE_CX - w / 2;
  const y = GROUND - h;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="34" fill="#eef2f7" stroke="#94a3b8" stroke-width="3"/>
    <rect x="${x + 12}" y="${y + 12}" width="${w - 24}" height="${h - 24}" rx="24" fill="#dbe3ee"/>
    <rect x="${x + w / 2 - 42}" y="${y + 22}" width="84" height="18" rx="9" fill="#b6c2d4"/>
    <text x="${PHONE_CX}" y="${y + h / 2 + 10}" font-family="${TH}" font-size="26" text-anchor="middle" fill="#8aa0bd">มือถือ</text>
    <text x="${PHONE_CX}" y="${GROUND + 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">มือถือทั่วไป สูง ~14.7 ซม.</text>`;
};

/** งานไดคัทตามลายลูกค้า รูปทรงไม่ตายตัว — วาดเป็น "กรอบขนาด" ของขนาดที่สั่ง */
const plate = (cm) => {
  const s = cm * PPC;
  const x = PLATE_CX - s / 2;
  const y = GROUND - s;
  const numSize = Math.max(64, Math.round(s * 0.34));
  return `
    <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${Math.round(s * 0.16)}" fill="url(#plate)" stroke="${ACCENT}" stroke-width="4" stroke-dasharray="12 8"/>
    <text x="${PLATE_CX}" y="${y + s / 2 + numSize * 0.34}" font-family="${TH}" font-size="${numSize}" font-weight="800" text-anchor="middle" fill="${ACCENT}">${cm}<tspan font-size="${Math.round(numSize * 0.45)}" font-weight="700"> cm</tspan></text>
    <line x1="${x}" y1="${y - 26}" x2="${x + s}" y2="${y - 26}" stroke="${ACCENT}" stroke-width="2"/>
    <line x1="${x}" y1="${y - 33}" x2="${x}" y2="${y - 19}" stroke="${ACCENT}" stroke-width="2"/>
    <line x1="${x + s}" y1="${y - 33}" x2="${x + s}" y2="${y - 19}" stroke="${ACCENT}" stroke-width="2"/>
    <text x="${PLATE_CX}" y="${y - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${ACCENT}">ด้านที่ยาวที่สุด ${cm} ซม.</text>`;
};

/** ไม้บรรทัดชิดใต้กรอบขนาด (1 ช่อง = 1 ซม.) */
const ruler = (cm) => {
  const s = cm * PPC;
  const x0 = PLATE_CX - s / 2;
  const y = GROUND + 16;
  const ticks = Array.from({ length: cm + 1 }, (_, i) => `<line x1="${x0 + i * PPC}" y1="${y}" x2="${x0 + i * PPC}" y2="${y + (i % 5 === 0 ? 16 : 10)}" stroke="#94a3b8" stroke-width="2"/>`).join("");
  return `<line x1="${x0}" y1="${y}" x2="${x0 + s}" y2="${y}" stroke="#94a3b8" stroke-width="2.5"/>${ticks}
    <text x="${PLATE_CX}" y="${y + 44}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">1 ช่อง = 1 ซม.</text>`;
};

const groundLine = () => `<line x1="70" y1="${GROUND}" x2="${W - 70}" y2="${GROUND}" stroke="${LINE}" stroke-width="2"/>`;

const foot = () => `
  <rect x="80" y="806" width="${W - 160}" height="62" rx="16" fill="#f1f5f9"/>
  <text x="${W / 2}" y="832" font-family="${TH}" font-size="21" text-anchor="middle" fill="#475569">รูปทรงไดคัทตามลายที่ส่งมา · กรอบเส้นประคือขนาดที่สั่ง (สเกลจริง)</text>
  <text x="${W / 2}" y="858" font-family="${TH}" font-size="21" text-anchor="middle" fill="#475569">ขนาดนับจากด้านที่ยาวที่สุด ไม่วัดแนวทแยง · ตัดตกจากขนาดจริงด้านละ 3mm</text>`;

console.log(`🎨 การ์ดขนาด Griptok อะคริลิค (${V}) → ${OUT}`);
const files = [];
for (const cm of [5, 6, 7, 8, 9, 10]) {
  const svg = frame(`${header(cm)}${groundLine()}${phone()}${plate(cm)}${ruler(cm)}${foot()}`);
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
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
