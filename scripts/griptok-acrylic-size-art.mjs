#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือก "ขนาด" ของ "Griptok อะคริลิค (5-10cm)" (id 1-4)
 *
 *   node scripts/griptok-acrylic-size-art.mjs           # สร้างการ์ดลง .cache/griptok-acrylic/upload (ไม่อัป ไม่เขียน)
 *   node scripts/griptok-acrylic-size-art.mjs --write   # อัปขึ้น storage + ใส่ imageSrc ให้ตัวเลือกขนาดทั้ง 6
 *
 * กลุ่มตัวเลือกอื่นของสินค้านี้มีภาพครบแล้ว (งานสกรีน/สีอะคริลิค/ฐาน/เคลือบ/ติ่งห้อย)
 * ขาดแค่ "ขนาด" — ดีไซน์รอบ 3 (ตามคำสั่งผู้ใช้ 25 ส.ค. 69 "ออกแบบให้ไปแปะที่หลังมือถือ"):
 *   วาดมือถือด้านหลัง (เห็นกล้อง) ที่สเกลจริง แล้ววางกรอบขนาดชิ้นงานทับกลางฝาหลัง
 *   พร้อมวงฐาน Griptok ตรงกลาง — ขนาด 8cm ขึ้นไปเห็นชัดว่ากว้างกว่าตัวเครื่อง (ล้นขอบ)
 *   เลขขนาดตัวใหญ่ (ภาพย่อบนปุ่มตัวเลือกเล็กมาก ต้องอ่านเลขออก) · ไม้บรรทัดชิดใต้เครื่อง
 *   ทุกใบสเกลเดียวกัน เปิดคนละใบเทียบกันได้ด้วยตา
 *
 * ประวัติดีไซน์: v1 กรอบลอย+ไม้บรรทัดแยก (ตีกลับ "ดูโล่ง") · v2 มือถือยืนข้างกรอบ (ตีกลับ ให้แปะบนเครื่อง)
 * ⚠️ "อะคริลิคใส" ในกลุ่มสีอะคริลิคไม่มีภาพ ทั้งระบบจงใจปล่อยว่าง (ชาร์ตสี 45 ใบไม่มีชิพใส) — อย่าเติม
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — รอบนี้ -v3 ครั้งหน้าขึ้น v4
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "1-4";
const OUT = ".cache/griptok-acrylic/upload";
const V = "v3";
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
const ACCENT = "#0284c7";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** px ต่อ 1 ซม. — สเกลเดียวทุกใบ (มือถือ 14.7 ซม. + หัวเรื่อง + ไม้บรรทัดต้องอยู่ในการ์ด) */
const PPC = 36;
const PHONE_CM = { w: 7.15, h: 14.7 };
const CX = 450; // แกนกลางร่วมของมือถือและชิ้นงาน
const PHONE_BOTTOM = 700;
const PHONE_W = PHONE_CM.w * PPC;
const PHONE_H = PHONE_CM.h * PPC;
const PHONE_TOP = PHONE_BOTTOM - PHONE_H;
const PLATE_CY = PHONE_TOP + PHONE_H * 0.54; // จุดแปะ Griptok กลางฝาหลัง ค่อนลงจากกล้องนิดหน่อย

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e0f2fe"/><stop offset="0.55" stop-color="#f8fafc"/><stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
    <linearGradient id="back" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eef2f7"/><stop offset="1" stop-color="#d8e0ea"/>
    </linearGradient>
    <linearGradient id="plate" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e0f2fe" stop-opacity="0.92"/><stop offset="1" stop-color="#bae6fd" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="30" fill="#ffffff" fill-opacity="0.72" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const header = (cm) => `
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="50" font-weight="700" text-anchor="middle" fill="${INK}">ขนาดชิ้นงาน <tspan fill="${ACCENT}">${cm} cm</tspan></text>
  <text x="${W / 2}" y="136" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">Griptok อะคริลิค แปะหลังมือถือ — ภาพตามสเกลจริง (มือถือสูง ~14.7 ซม.)</text>`;

/** มือถือด้านหลัง (เห็นโมดูลกล้องมุมบนซ้าย) ที่สเกลจริง */
const phoneBack = () => {
  const x = CX - PHONE_W / 2;
  const y = PHONE_TOP;
  const camX = x + 18;
  const camY = y + 18;
  return `
    <rect x="${x + 8}" y="${y + 14}" width="${PHONE_W}" height="${PHONE_H}" rx="34" fill="#0f172a" fill-opacity="0.08"/>
    <rect x="${x}" y="${y}" width="${PHONE_W}" height="${PHONE_H}" rx="34" fill="url(#back)" stroke="#94a3b8" stroke-width="3"/>
    <rect x="${camX}" y="${camY}" width="86" height="86" rx="24" fill="#c3cddb" stroke="#9fb0c6" stroke-width="2"/>
    <circle cx="${camX + 26}" cy="${camY + 26}" r="13" fill="#7e93ad"/><circle cx="${camX + 60}" cy="${camY + 60}" r="13" fill="#7e93ad"/>
    <circle cx="${camX + 26}" cy="${camY + 26}" r="5" fill="#5a708c"/><circle cx="${camX + 60}" cy="${camY + 60}" r="5" fill="#5a708c"/>`;
};

const CAM_BOTTOM = PHONE_TOP + 18 + 86;

/**
 * ชิ้นงานแปะกลางฝาหลัง — กรอบเส้นประ = ขนาดที่สั่ง (งานไดคัทตามลาย รูปทรงไม่ตายตัว)
 * + วงฐาน Griptok (~3.5 ซม.) ตรงกลางให้รู้ว่าคือ Griptok ไม่ใช่สติ๊กเกอร์
 */
const plate = (cm) => {
  const s = cm * PPC;
  const x = CX - s / 2;
  const y = PLATE_CY - s / 2;
  const numSize = Math.max(60, Math.round(s * 0.3));
  const baseR = (3.5 * PPC) / 2;
  const over = s > PHONE_W; // 8cm ขึ้นไปกว้างกว่าตัวเครื่อง (ล้นขอบ)
  // ใบใหญ่กรอบขึ้นไปถึงโซนกล้อง — ป้ายบอกขนาดย้ายไปใต้กรอบแทน ไม่งั้นตัวหนังสือทับกล้อง
  const labelBelow = y - 38 < CAM_BOTTOM + 12;
  const dimY = labelBelow ? y + s + 24 : y - 24;
  const dimLabel = `ด้านที่ยาวที่สุด ${cm} ซม.${over ? " — กว้างกว่าตัวเครื่อง ชิ้นงานล้นขอบมือถือ" : ""}`;
  return `
    <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${Math.round(s * 0.16)}" fill="url(#plate)" stroke="${ACCENT}" stroke-width="4" stroke-dasharray="12 8"/>
    <circle cx="${CX}" cy="${PLATE_CY}" r="${baseR}" fill="none" stroke="${ACCENT}" stroke-opacity="0.45" stroke-width="3"/>
    <circle cx="${CX}" cy="${PLATE_CY}" r="${baseR * 0.55}" fill="none" stroke="${ACCENT}" stroke-opacity="0.35" stroke-width="2.5"/>
    <text x="${CX}" y="${y + Math.max(58, Math.round(s * 0.3))}" font-family="${TH}" font-size="${numSize}" font-weight="800" text-anchor="middle" fill="${ACCENT}">${cm}<tspan font-size="${Math.round(numSize * 0.45)}" font-weight="700"> cm</tspan></text>
    <line x1="${x}" y1="${dimY}" x2="${x + s}" y2="${dimY}" stroke="${ACCENT}" stroke-width="2"/>
    <line x1="${x}" y1="${dimY - 7}" x2="${x}" y2="${dimY + 7}" stroke="${ACCENT}" stroke-width="2"/>
    <line x1="${x + s}" y1="${dimY - 7}" x2="${x + s}" y2="${dimY + 7}" stroke="${ACCENT}" stroke-width="2"/>
    <text x="${CX}" y="${labelBelow ? dimY + 34 : dimY - 14}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${over ? "#b45309" : ACCENT}">${esc(dimLabel)}</text>`;
};

/** ไม้บรรทัดใต้เครื่อง กว้างเท่าชิ้นงาน (1 ช่อง = 1 ซม.) */
const ruler = (cm) => {
  const s = cm * PPC;
  const x0 = CX - s / 2;
  const y = PHONE_BOTTOM + 20;
  const ticks = Array.from({ length: cm + 1 }, (_, i) => `<line x1="${x0 + i * PPC}" y1="${y}" x2="${x0 + i * PPC}" y2="${y + (i % 5 === 0 ? 15 : 9)}" stroke="#94a3b8" stroke-width="2"/>`).join("");
  return `<line x1="${x0}" y1="${y}" x2="${x0 + s}" y2="${y}" stroke="#94a3b8" stroke-width="2.5"/>${ticks}
    <text x="${CX}" y="${y + 42}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">1 ช่อง = 1 ซม.</text>`;
};

const foot = () => `
  <rect x="80" y="806" width="${W - 160}" height="62" rx="16" fill="#f1f5f9"/>
  <text x="${W / 2}" y="832" font-family="${TH}" font-size="21" text-anchor="middle" fill="#475569">รูปทรงไดคัทตามลายที่ส่งมา · กรอบเส้นประคือขนาดที่สั่ง · วงกลาง = ฐาน Griptok</text>
  <text x="${W / 2}" y="858" font-family="${TH}" font-size="21" text-anchor="middle" fill="#475569">ขนาดนับจากด้านที่ยาวที่สุด ไม่วัดแนวทแยง · ตัดตกจากขนาดจริงด้านละ 3mm</text>`;

console.log(`🎨 การ์ดขนาด Griptok อะคริลิค (${V}) → ${OUT}`);
const files = [];
for (const cm of [5, 6, 7, 8, 9, 10]) {
  const svg = frame(`${header(cm)}${phoneBack()}${plate(cm)}${ruler(cm)}${foot()}`);
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
