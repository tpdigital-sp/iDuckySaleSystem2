#!/usr/bin/env node
/**
 * นาฬิกาน้ำ (otheracrylicproducts3-3) — เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบ
 *
 *   node scripts/water-clock-size-option.mjs            (วาดภาพลง .cache/water-clock/upload ดูก่อน)
 *   node scripts/water-clock-size-option.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ตามใบสเปค WATER TIMER (/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/10_อะคริลิค/นาฬิกาน้ำ-กรอบรูปน้ำ-อคลเฟรม/P-nนาฬิกาน้ำ-01.jpg):
 * นาฬิกาน้ำมี "แบบเดียว" ทรงหกเหลี่ยม 2 ชั้น (ใบสเปคไม่ระบุขนาดเป็นซม.)
 * จับเวลาได้ 5 นาที · สกรีนลายได้ 1 ด้าน เลือกด้านบนหรือด้านล่าง
 * มีก้อนเมฆและกลิตเตอร์ข้างใน เอาออกไม่ได้ · เปลี่ยนสีน้ำไม่ได้ · พิมพ์ลายระบบ UV
 *
 * เพิ่มกลุ่ม "ขนาด" display "cards" ตัวเลือกเดียว ไม่บวกราคา พร้อมภาพวาดใหม่ (900×900)
 * โชว์ตัวเรือนหกเหลี่ยม 2 ชั้นซ้อน น้ำฟ้าหยดจากชั้นบนลงชั้นล่าง + ก้อนเมฆ + กลิตเตอร์
 * มาสคอตแทนลายลูกค้าบนหน้าชั้นล่าง + ป้ายจับเวลา 5 นาที
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 360);

const PRODUCT_ID = "otheracrylicproducts3-3";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/water-clock/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "ทรงหกเหลี่ยม 2 ชั้น — แบบเดียว";
const SIZE_DESC = "จับเวลาได้ 5 นาที · มีก้อนเมฆและกลิตเตอร์ข้างใน (เอาออกไม่ได้) · เปลี่ยนสีน้ำไม่ได้";
const SIZE_NOTE = "สกรีนลายได้ 1 ด้าน เลือกด้านบนหรือด้านล่าง";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
const WATER = "#38bdf8";
const WATER_DK = "#0ea5e9";

/** หกเหลี่ยมแบนบน-ล่าง (flat-top) จุดยอดซ้าย-ขวา — คืน points ของ polygon */
const hexPoints = (cx, cy, rw, rh) => {
  // rw = รัศมีแนวนอน (ถึงจุดยอดซ้าย/ขวา), rh = ครึ่งความสูง (ขอบแบนบน/ล่างกว้าง rw)
  const half = rw * 0.5;
  return [
    [cx - half, cy - rh], [cx + half, cy - rh], [cx + rw, cy],
    [cx + half, cy + rh], [cx - half, cy + rh], [cx - rw, cy],
  ].map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
};

/** ก้อนเมฆลอยน้ำ (วงกลมซ้อน) */
const cloud = (cx, cy, s = 1) => `
  <g transform="translate(${cx} ${cy}) scale(${s})">
    <ellipse cx="0" cy="6" rx="34" ry="18" fill="#ffffff" stroke="#dbe7f0" stroke-width="2"/>
    <circle cx="-14" cy="-4" r="15" fill="#ffffff" stroke="#dbe7f0" stroke-width="2"/>
    <circle cx="6" cy="-9" r="18" fill="#ffffff" stroke="#dbe7f0" stroke-width="2"/>
    <circle cx="20" cy="0" r="12" fill="#ffffff" stroke="#dbe7f0" stroke-width="2"/>
    <circle cx="-8" cy="4" r="2.6" fill="#334155"/>
    <circle cx="8" cy="4" r="2.6" fill="#334155"/>
    <path d="M -4 10 Q 0 13 4 10" fill="none" stroke="#334155" stroke-width="2" stroke-linecap="round"/>
    <circle cx="-15" cy="9" r="3.6" fill="#fbc4d4" opacity="0.85"/>
    <circle cx="15" cy="9" r="3.6" fill="#fbc4d4" opacity="0.85"/>
  </g>`;

/** กลิตเตอร์ (ดาวเล็ก+จุด ตำแหน่งตายตัว ไม่สุ่ม) */
const glitter = (x0, y0, w0, h0, n, seedStep, color = "#fde68a") => {
  let out = "";
  for (let i = 0; i < n; i++) {
    const fx = ((i * seedStep) % 97) / 97;
    const fy = ((i * (seedStep + 13)) % 89) / 89;
    const x = x0 + fx * w0;
    const y = y0 + fy * h0;
    const s = 3 + ((i * 7) % 4);
    out += i % 3 === 0
      ? `<path d="M ${x} ${y - s} L ${x + s * 0.35} ${y - s * 0.35} L ${x + s} ${y} L ${x + s * 0.35} ${y + s * 0.35} L ${x} ${y + s} L ${x - s * 0.35} ${y + s * 0.35} L ${x - s} ${y} L ${x - s * 0.35} ${y - s * 0.35} Z" fill="${color}" opacity="0.9"/>`
      : `<circle cx="${x}" cy="${y}" r="${s * 0.45}" fill="${i % 3 === 1 ? "#ffffff" : color}" opacity="0.85"/>`;
  }
  return out;
};

/**
 * ภาพ "นาฬิกาน้ำ" — ตัวเรือนหกเหลี่ยม 2 ชั้นซ้อน (ชั้นบนน้ำหยดลงชั้นล่าง)
 * ชั้นบน = น้ำฟ้า + เมฆลอย + กลิตเตอร์ · ชั้นล่าง = น้ำรับหยด + มาสคอตแทนลายลูกค้าพิมพ์ UV
 */
function sizeArt() {
  const cx = 318; // แกนกลางตัวเรือน (เผื่อที่ป้ายฝั่งขวา)
  const rw = 172; // รัศมีแนวนอนหกเหลี่ยม
  const rh = 130; // ครึ่งความสูงหกเหลี่ยม (ทรงป้อมตามของจริง)
  const topCy = 306;
  const botCy = topCy + rh * 2 + 34; // ชั้นล่างต่อใต้ชั้นบน (มีคอเชื่อมสั้น)
  const neckY1 = topCy + rh;
  const neckY2 = botCy - rh;

  // ระดับน้ำ: ชั้นบนเหลือน้ำ ~ครึ่ง, ชั้นล่างรับน้ำแล้ว ~ครึ่ง
  const topWaterY = topCy + 8;
  const botWaterY = botCy + 6;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${WATER}"/>
      <stop offset="1" stop-color="${WATER_DK}"/>
    </linearGradient>
    <clipPath id="hexTop"><polygon points="${hexPoints(cx, topCy, rw, rh)}"/></clipPath>
    <clipPath id="hexBot"><polygon points="${hexPoints(cx, botCy, rw, rh)}"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">นาฬิกาน้ำ — แบบเดียว</text>
  <text x="${W / 2}" y="128" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ตัวเรือนใสทรงหกเหลี่ยม 2 ชั้น · จับเวลาได้ 5 นาที</text>

  <!-- ชั้นบน: น้ำเหลือครึ่ง + เมฆลอย + กลิตเตอร์ -->
  <g clip-path="url(#hexTop)">
    <rect x="${cx - rw}" y="${topCy - rh}" width="${rw * 2}" height="${rh * 2}" fill="#f0f9ff"/>
    <rect x="${cx - rw}" y="${topWaterY}" width="${rw * 2}" height="${rh * 2}" fill="url(#water)"/>
    <path d="M ${cx - rw} ${topWaterY} Q ${cx - rw / 2} ${topWaterY - 10} ${cx} ${topWaterY} T ${cx + rw} ${topWaterY} V ${topWaterY + 14} H ${cx - rw} Z" fill="#7dd3fc"/>
    ${glitter(cx - rw + 30, topWaterY + 12, rw * 2 - 60, rh - 30, 16, 41)}
  </g>
  ${cloud(cx - 62, topWaterY - 12, 1)}
  ${cloud(cx + 74, topWaterY - 4, 0.72)}
  <polygon points="${hexPoints(cx, topCy, rw, rh)}" fill="none" stroke="#94a3b8" stroke-width="4"/>
  <polygon points="${hexPoints(cx, topCy, rw - 12, rh - 9)}" fill="none" stroke="#e2e8f0" stroke-width="2"/>

  <!-- คอเชื่อม + หยดน้ำไหลลง -->
  <rect x="${cx - 20}" y="${neckY1 - 6}" width="40" height="${neckY2 - neckY1 + 12}" rx="9" fill="#f0f9ff" stroke="#94a3b8" stroke-width="3"/>
  ${[0.3, 0.78].map((t, i) => {
    const y = neckY1 + (neckY2 - neckY1) * t;
    const r = 8 - i * 2.4;
    return `<path d="M ${cx} ${y - r * 1.9} C ${cx + r} ${y - r * 0.3} ${cx + r} ${y + r} ${cx} ${y + r} C ${cx - r} ${y + r} ${cx - r} ${y - r * 0.3} ${cx} ${y - r * 1.9} Z" fill="${WATER_DK}" opacity="${0.95 - i * 0.2}"/>`;
  }).join("")}

  <!-- ชั้นล่าง: น้ำรับหยด + กลิตเตอร์ + มาสคอตแทนลายลูกค้า (พิมพ์ UV บนหน้าตัวเรือน) -->
  <g clip-path="url(#hexBot)">
    <rect x="${cx - rw}" y="${botCy - rh}" width="${rw * 2}" height="${rh * 2}" fill="#f0f9ff"/>
    <rect x="${cx - rw}" y="${botWaterY}" width="${rw * 2}" height="${rh * 2}" fill="url(#water)"/>
    <path d="M ${cx - rw} ${botWaterY} Q ${cx - rw / 2} ${botWaterY - 10} ${cx} ${botWaterY} T ${cx + rw} ${botWaterY} V ${botWaterY + 14} H ${cx - rw} Z" fill="#7dd3fc"/>
    <circle cx="${cx}" cy="${botWaterY - 2}" r="9" fill="#bae6fd" opacity="0.9"/>
    ${glitter(cx - rw + 30, botWaterY + 12, rw * 2 - 60, rh - 32, 14, 29)}
  </g>
  ${cloud(cx - 84, botWaterY - 10, 0.66)}
  <polygon points="${hexPoints(cx, botCy, rw, rh)}" fill="none" stroke="#94a3b8" stroke-width="4"/>
  <polygon points="${hexPoints(cx, botCy, rw - 12, rh - 9)}" fill="none" stroke="#e2e8f0" stroke-width="2"/>

  <!-- ลายลูกค้า (มาสคอตแทน) สกรีน UV บนผิวหน้าตัวเรือน — กรอบเส้นประให้เห็นว่าเป็นลาย ไม่ใช่ของลอยในน้ำ -->
  ${(() => {
    const ah = 96;
    const aw = ah * MASCOT.ratio;
    const ax = cx + 16;
    const ay = botCy - 34;
    return `
    <rect x="${ax - 12}" y="${ay - 12}" width="${aw + 24}" height="${ah + 24}" rx="14"
      fill="#ffffff" opacity="0.55" stroke="#0891b2" stroke-width="2" stroke-dasharray="7 6"/>
    <image href="${MASCOT.uri}" x="${ax}" y="${ay}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
    <rect x="${ax + aw / 2 - 55}" y="${ay + ah + 10}" width="110" height="30" rx="15" fill="#ffffff" opacity="0.95"/>
    <text x="${ax + aw / 2}" y="${ay + ah + 31}" font-family="${TH}" font-size="19" font-weight="700"
      text-anchor="middle" fill="${OK}">ลายของคุณ</text>`;
  })()}

  <!-- ป้ายชี้ฝั่งขวา -->
  <g font-family="${TH}" font-size="22" font-weight="700">
    <line x1="${cx + rw + 8}" y1="${topWaterY - 26}" x2="${cx + rw + 60}" y2="${topWaterY - 46}" stroke="#cbd5e1" stroke-width="2.5"/>
    <rect x="${cx + rw + 62}" y="${topWaterY - 76}" width="222" height="60" rx="14" fill="#f0f9ff" stroke="#bae6fd" stroke-width="2"/>
    <text x="${cx + rw + 173}" y="${topWaterY - 51}" text-anchor="middle" fill="${SUB}">ก้อนเมฆ + กลิตเตอร์</text>
    <text x="${cx + rw + 173}" y="${topWaterY - 24}" text-anchor="middle" fill="${SUB}">ข้างใน (เอาออกไม่ได้)</text>

    <line x1="${cx + rw - 30}" y1="${botCy + 30}" x2="${cx + rw + 60}" y2="${botCy + 52}" stroke="#cbd5e1" stroke-width="2.5"/>
    <rect x="${cx + rw + 62}" y="${botCy + 24}" width="222" height="60" rx="14" fill="#fdf2f8" stroke="#fbcfe8" stroke-width="2"/>
    <text x="${cx + rw + 173}" y="${botCy + 49}" text-anchor="middle" fill="#be185d">สกรีนลายได้ 1 ด้าน</text>
    <text x="${cx + rw + 173}" y="${botCy + 76}" text-anchor="middle" fill="#be185d">เลือกด้านบนหรือล่าง</text>
  </g>

  <!-- ป้ายจับเวลา 5 นาที (วางระหว่าง 2 ชั้น ฝั่งขวา) -->
  <g transform="translate(${cx + rw + 175} ${(neckY1 + neckY2) / 2})">
    <rect x="-112" y="-31" width="224" height="62" rx="31" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
    <circle cx="-76" cy="0" r="17" fill="none" stroke="${OK}" stroke-width="3"/>
    <line x1="-76" y1="0" x2="-76" y2="-11" stroke="${OK}" stroke-width="3" stroke-linecap="round"/>
    <line x1="-76" y1="0" x2="-67" y2="5" stroke="${OK}" stroke-width="3" stroke-linecap="round"/>
    <text x="24" y="9" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${OK}">จับเวลา 5 นาที</text>
  </g>

  <text x="${W / 2}" y="${H - 100}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">พิมพ์ลายตามสั่งระบบ UV Printing บนตัวเรือนใส</text>
  <text x="${W / 2}" y="${H - 66}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">มีแบบเดียว เปลี่ยนสีน้ำไม่ได้ · เหมาะตั้งโต๊ะทำงาน จับเวลาพักสายตา</text>
</svg>`;
}

const svg = sizeArt();
const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
const FILE = `size-hex-2tier-${VER}.jpg`;
writeFileSync(`${OUT}/${FILE}`, buf);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — นาฬิกาน้ำหกเหลี่ยม 2 ชั้น`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const key = `products/${PRODUCT_ID}/${FILE}`;
const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
const sizeUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", sizeUrl);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

// กลุ่ม "ขนาด" แบบการ์ด — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกไว้หน้าสุด
const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  note: SIZE_NOTE,
  choices: [{ name: SIZE_CHOICE, desc: SIZE_DESC, imageSrc: sizeUrl }],
};
const atSize = options.findIndex((o) => o.label === SIZE_GROUP);
if (atSize >= 0) options[atSize] = sizeGroup;
else options.unshift(sizeGroup);

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const gotGroup = back.data.options.find((o) => o.label === SIZE_GROUP);
const got = gotGroup?.choices?.[0];
if (gotGroup?.display !== "cards" || got?.name !== SIZE_CHOICE || got?.desc !== SIZE_DESC || got?.imageSrc !== sizeUrl) {
  console.error("อ่านกลับกลุ่มขนาดไม่ตรง!", JSON.stringify(gotGroup)); process.exit(1);
}
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (cards · ${SIZE_CHOICE}) อ่านกลับตรง · savedAt =`, back.data.savedAt);
