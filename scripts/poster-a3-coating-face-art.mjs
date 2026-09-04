#!/usr/bin/env node
/**
 * POSTER (poster-a3) — ภาพตัวเลือก "เคลือบเงา" / "เคลือบด้าน" (แยกปุ่มออกจากกัน)
 *
 *   node scripts/poster-a3-coating-face-art.mjs           (วาดลง .cache/poster-a3/upload ดูก่อน)
 *   node scripts/poster-a3-coating-face-art.mjs --write   (อัปโหลด storage อย่างเดียว — ไม่แตะ DB)
 *
 * ทำไมต้องวาดเอง: ภาพชุดกลาง coating-b (รูปงานจริง) เงากับด้าน "ต่างกันจริงแต่ต่างน้อย"
 *   วัดแล้วสว่างต่างกันเฉลี่ยแค่ ~7% ของสเกล 0-255 → ย่อเป็นปุ่ม 48 px แล้วดูเหมือนกันเป๊ะ
 *   (ผู้ใช้ทักเอง 4 ก.ย. 69) — ใบวาดนี้ใช้ "แถบแสงสะท้อนพาดแผ่น" เป็นจุดต่างที่เห็นตั้งแต่ปุ่มเล็ก
 * ⚠️ ใช้เฉพาะ 2 ตัวเลือกนี้ · "ไม่เคลือบ / เคลือบพิเศษ" และลายพิเศษทุกใบยังใช้รูปงานจริงชุดกลาง
 *    coating-b ตามเดิม (ชุดกลางทั้งร้าน — ดู [[iducky-coating-foil]] ห้ามเขียนทับ)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 520);

const PRODUCT_ID = "poster-a3";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/poster-a3/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";

/** แผ่น A3 กลางภาพ (29.7 : 42) */
const SW = 252;
const SH = Math.round((SW * 42) / 29.7);
const CY = 468;
const X0 = (W - SW) / 2;
const Y0 = CY - SH / 2;

/** สุ่มแบบมีเมล็ด — เม็ดผิวด้านตกที่เดิมทุกครั้งที่รัน */
const rnd = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const spark = (x, y, s) =>
  `<path d="M ${x} ${y - s} Q ${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q ${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q ${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q ${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s} Z" fill="#ffffff"/>`;

/** ลายที่พิมพ์บนแผ่น — ชุดเดียวกับภาพแนวกระดาษ/จำนวนด้าน ให้หน้าสินค้าดูเป็นชุดเดียวกัน */
const artwork = () => {
  const mh = SH * 0.46;
  const mw = mh * MASCOT.ratio;
  const cx = X0 + SW / 2;
  const line = (x, y, len, op = 0.75, th = 7) =>
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${len.toFixed(1)}" height="${th}" rx="${th / 2}" fill="#ffffff" opacity="${op}"/>`;
  return `
    <circle cx="${cx}" cy="${Y0 + SH * 0.34}" r="${SW * 0.38}" fill="#ffffff" opacity="0.35"/>
    <image href="${MASCOT.uri}" x="${cx - mw / 2}" y="${Y0 + SH * 0.1}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
    <rect x="${X0 + SW * 0.14}" y="${Y0 + SH * 0.63}" width="${SW * 0.72}" height="${SH * 0.075}" rx="${SH * 0.02}" fill="#ffffff" opacity="0.9"/>
    ${line(X0 + SW * 0.2, Y0 + SH * 0.755, SW * 0.6)}
    ${line(X0 + SW * 0.26, Y0 + SH * 0.815, SW * 0.48, 0.6)}
    ${line(X0 + SW * 0.32, Y0 + SH * 0.875, SW * 0.36, 0.45)}`;
};

/** เม็ดผิวด้าน — จุดจาง ๆ ทั่วแผ่น (ผิวกระจายแสง ไม่มีเงาสะท้อนเป็นแถบ) */
const grain = () => {
  const r = rnd(77);
  let s = "";
  for (let i = 0; i < 900; i++) {
    const x = X0 + r() * SW;
    const y = Y0 + r() * SH;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.6 + r() * 0.7).toFixed(1)}" fill="${r() > 0.5 ? "#ffffff" : "#0f172a"}" opacity="0.06"/>`;
  }
  return s;
};

const PICKS = [
  {
    key: "gloss",
    file: `coat-gloss-${VER}.jpg`,
    title: "เคลือบเงา (Glossy)",
    sub: "ผิวมันวาว สะท้อนแสงเป็นแถบ · สีสดจัดขึ้น",
    foot: "ฟิล์มใสผิวมัน กันรอย/กันชื้น · สีเข้มขึ้นกว่างานไม่เคลือบ",
    desc: "ฟิล์มใสผิวมัน สะท้อนแสง สีสดจัดขึ้น · กันรอย กันชื้น",
  },
  {
    key: "matte",
    file: `coat-matte-${VER}.jpg`,
    title: "เคลือบด้าน (Matte)",
    sub: "ผิวเรียบด้าน ไม่สะท้อนแสง · สีนุ่มตา ลายนิ้วมือไม่ติด",
    foot: "ฟิล์มใสผิวด้าน กันรอย/กันชื้น · ถ่ายรูปไม่มีแสงสะท้อนกวน",
    desc: "ฟิล์มใสผิวด้าน ไม่สะท้อนแสง สีนุ่มตา ลายนิ้วมือไม่ติด · กันรอย กันชื้น",
  },
];

function art(p) {
  const glossy = p.key === "gloss";
  /* แถบแสงพาดแผ่น = จุดต่างหลัก (เงามีแถบคมชัด · ด้านไม่มี มีแค่ไล่แสงจาง ๆ ทั้งผืน) */
  const band = glossy
    ? `<g clip-path="url(#sheet)">
         <polygon points="${X0 - 30},${Y0 + SH * 0.72} ${X0 + SW * 0.72},${Y0 - 20} ${X0 + SW + 30},${Y0 - 20} ${X0 - 30},${Y0 + SH * 0.99}" fill="url(#shine)"/>
         <polygon points="${X0 - 30},${Y0 + SH * 1.06} ${X0 + SW * 0.3},${Y0 + SH * 0.66} ${X0 + SW * 0.44},${Y0 + SH * 0.66} ${X0 - 30},${Y0 + SH * 1.16}" fill="#ffffff" opacity="0.45"/>
       </g>`
    : `<g clip-path="url(#sheet)">
         <rect x="${X0}" y="${Y0}" width="${SW}" height="${SH}" fill="url(#soft)"/>
         ${grain()}
       </g>`;

  /* แสงตกกระทบ: เงาสะท้อนกลับเป็นลำเดียว · ด้านกระจายเป็นหลายเส้นสั้น */
  const lamp = 156;
  const lampY = 250;
  const rays = glossy
    ? `<line x1="${lamp + 26}" y1="${lampY + 26}" x2="${X0 + SW * 0.24}" y2="${Y0 + SH * 0.13}" stroke="#fbbf24" stroke-width="5" stroke-linecap="round"/>
       <line x1="${X0 + SW * 0.24}" y1="${Y0 + SH * 0.13}" x2="${W - 150}" y2="${Y0 - 26}" stroke="#fbbf24" stroke-width="5" stroke-linecap="round"/>
       <path d="M ${W - 168} ${Y0 - 38} l 20 6 -16 12 z" fill="#fbbf24"/>`
    : `<line x1="${lamp + 26}" y1="${lampY + 26}" x2="${X0 + SW * 0.24}" y2="${Y0 + SH * 0.13}" stroke="#fbbf24" stroke-width="5" stroke-linecap="round"/>
       ${[-38, -16, 8, 32, 58]
         .map((a) => {
           const rad = ((a - 32) * Math.PI) / 180;
           const x1 = X0 + SW * 0.24;
           const y1 = Y0 + SH * 0.13;
           return `<line x1="${x1}" y1="${y1}" x2="${(x1 + Math.cos(rad) * 82).toFixed(1)}" y2="${(y1 + Math.sin(rad) * 82).toFixed(1)}" stroke="#fbbf24" stroke-width="4" stroke-linecap="round" opacity="0.8"/>`;
         })
         .join("")}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="print" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${glossy ? "#0ea5e9" : "#7dd3fc"}"/>
      <stop offset="0.55" stop-color="${glossy ? "#06b6d4" : "#67e8f9"}"/>
      <stop offset="1" stop-color="${glossy ? "#818cf8" : "#c7d2fe"}"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.15"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.82"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.35"/>
    </linearGradient>
    <linearGradient id="soft" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.04"/>
    </linearGradient>
    <clipPath id="sheet"><rect x="${X0}" y="${Y0}" width="${SW}" height="${SH}" rx="4"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="120" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${p.title}</text>
  <text x="${W / 2}" y="162" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${p.sub}</text>

  <!-- หลอดไฟ + ลำแสง -->
  <circle cx="${lamp}" cy="${lampY}" r="27" fill="#fde68a" stroke="#fbbf24" stroke-width="4"/>
  <circle cx="${lamp}" cy="${lampY}" r="13" fill="#fbbf24"/>

  <!-- แผ่นงานพิมพ์ -->
  <rect x="${X0 + 7}" y="${Y0 + 11}" width="${SW}" height="${SH}" rx="4" fill="#0f172a" opacity="0.12"/>
  <rect x="${X0}" y="${Y0}" width="${SW}" height="${SH}" rx="4" fill="url(#print)" stroke="#94a3b8" stroke-width="2"/>
  <g clip-path="url(#sheet)">${artwork()}</g>
  ${band}
  ${rays}
  ${glossy ? `${spark(X0 + SW * 0.2, Y0 + SH * 0.2, 16)}${spark(X0 + SW * 0.78, Y0 + SH * 0.5, 11)}` : ""}

  <!-- ป้ายสรุปผิวเคลือบ -->
  <rect x="${W / 2 - 132}" y="${Y0 + SH + 26}" width="264" height="56" rx="16" fill="${glossy ? "#0f172a" : "#ffffff"}" stroke="${glossy ? "#0f172a" : "#cbd5e1"}" stroke-width="2"/>
  <text x="${W / 2}" y="${Y0 + SH + 63}" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${glossy ? "#ffffff" : INK}">${glossy ? "ผิวมัน สะท้อนแสง" : "ผิวด้าน ไม่สะท้อน"}</text>

  <text x="${W / 2}" y="${H - 56}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${p.foot}</text>
</svg>`;
}

const built = [];
for (const p of PICKS) {
  const buf = await sharp(Buffer.from(art(p))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${p.file}`, buf);
  await sharp(buf).resize(48, 48).toFile(`${OUT}/_thumb-${p.file}`);
  built.push({ ...p, buf });
  console.log(`🖼  ${OUT}/${p.file}  ${Math.round(buf.length / 1024)} KB — ${p.title} (+ _thumb ขนาดปุ่มจริง 48px)`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่อัปโหลด — รันด้วย --write เมื่อภาพผ่านตา · การเขียน DB อยู่ที่ poster-a3-coating-split.mjs)"); process.exit(0); }

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
for (const p of built) {
  const key = `products/${PRODUCT_ID}/${p.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, p.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  console.log("อัปโหลดแล้ว", `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`);
}
console.log("\n→ ต่อด้วย: node scripts/poster-a3-coating-split.mjs --write");
