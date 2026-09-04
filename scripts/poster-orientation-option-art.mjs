#!/usr/bin/env node
/**
 * POSTER (poster-a3) — ภาพประกอบกลุ่มตัวเลือก "แนวกระดาษ" (แนวตั้ง / แนวนอน) + แสดงเป็นการ์ด
 *
 *   node scripts/poster-orientation-option-art.mjs           (วาดภาพลง .cache/poster-a3/upload ดูก่อน)
 *   node scripts/poster-orientation-option-art.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * กระดาษ A3 = 29.7 × 42 ซม. — สองตัวเลือกคือ "วางตั้ง" กับ "วางนอน" ของแผ่นเดียวกัน
 * ดีไซน์: ทั้งสองใบสเกลเดียวกัน (CM = 6.2 px/ซม.) + มีเงา A4 เทียบขนาดข้าง ๆ ให้เห็นว่า A3 ใหญ่แค่ไหน
 *
 * ⚠️ ปุ่ม/การ์ดครอปกลางภาพ (48×48 จาก 900×900 = พิกัด 300–600) — ดู [[iducky-option-thumb-crop]]
 *    ทั้งแผ่นจึงถูกย่อให้อยู่ในกรอบกลางครบใบ เงาขอบ "สูง vs กว้าง" คือจุดต่างที่ต้องเห็นตอนย่อ
 *    เส้นลูกศรวัด/เงา A4 ถูกผลักออกนอกกรอบ 300–600 ไม่ให้รกตอนย่อ
 * ⚠️ กลุ่มนี้ไม่ใช่แกนราคา (pricing.driverLabels = ชนิดกระดาษ│เคลือบ) แต่ห้ามแก้ชื่อตัวเลือกอยู่ดี
 *    — สคริปต์เติมแค่ imageSrc + desc + display cards ([[iducky-price-driver-trap]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 520);

const PRODUCT_ID = "poster-a3";
const VER = "v1";
const GROUP = "แนวกระดาษ";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/poster-a3/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
/** สเกลร่วมสองใบ: 1 ซม. = 6.2 px → A3 ด้านยาว 42 ซม. = 260 px (ทั้งใบอยู่ในกรอบครอป 300–600) */
const CM = 6.2;
const A3 = { w: 29.7, h: 42 };
const A4 = { w: 21, h: 29.7 };
const CX = 450;
const CY = 452;
/** เส้นลูกศรวัดตำแหน่งคงที่ทั้งสองใบ — อยู่นอกกรอบครอปกลาง */
const DIM_Y = 650;
const DIM_X = 262;

const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";

/** ตัวเลือกทั้งสอง — name = ชื่อในฐานข้อมูล ห้ามแก้ */
const PICKS = [
  {
    name: "A3 | แนวตั้ง",
    file: `orientation-portrait-${VER}.jpg`,
    portrait: true,
    title: "A3 แนวตั้ง (Portrait)",
    sub: "กว้าง 29.7 × สูง 42 ซม. — ลายวางตามแนวสูง",
    desc: "กระดาษ A3 วางตั้ง · กว้าง 29.7 × สูง 42 ซม. — เหมาะกับลายคนเต็มตัว โปสเตอร์ตัวละคร ปฏิทิน/ประกาศแนวสูง",
  },
  {
    name: "A3 | แนวนอน",
    file: `orientation-landscape-${VER}.jpg`,
    portrait: false,
    title: "A3 แนวนอน (Landscape)",
    sub: "กว้าง 42 × สูง 29.7 ซม. — ลายวางตามแนวกว้าง",
    desc: "กระดาษ A3 วางนอน · กว้าง 42 × สูง 29.7 ซม. — เหมาะกับภาพหมู่ ภาพวิว แบนเนอร์ หรือลายแนวกว้าง",
  },
];

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับสคริปต์ขนาดตัวอื่น) */
const dim = (x1, y1, x2, y2, label) => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + 32;
  const tick = (x, y) =>
    `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12 : (label.length * 12) / 2)}" y="${ly - 24}"
      width="${label.length * 12}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

/** เส้นบอกแนวจาง ๆ จากขอบแผ่นไปหาเส้นลูกศร (เส้นลูกศรอยู่ตำแหน่งคงที่ทั้งสองใบ) */
const guide = (x1, y1, x2, y2) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6 6"/>`;

/**
 * ลายตัวอย่างที่พิมพ์เต็มแผ่น — จัดวางคนละแบบตามแนวกระดาษ
 * แนวตั้ง: มาสคอตอยู่บน หัวเรื่อง+บรรทัดข้อความอยู่ล่าง
 * แนวนอน: มาสคอตอยู่ซ้าย หัวเรื่อง+บรรทัดข้อความอยู่ขวา
 */
function artwork(x0, y0, w, h, portrait) {
  const line = (x, y, len, op = 0.75, th = 6) =>
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${len.toFixed(1)}" height="${th}" rx="${th / 2}" fill="#ffffff" opacity="${op}"/>`;

  if (portrait) {
    const mh = h * 0.46;
    const mw = mh * MASCOT.ratio;
    const cx = x0 + w / 2;
    return `
      <circle cx="${cx}" cy="${y0 + h * 0.34}" r="${w * 0.38}" fill="#ffffff" opacity="0.35"/>
      <image href="${MASCOT.uri}" x="${cx - mw / 2}" y="${y0 + h * 0.1}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
      <rect x="${x0 + w * 0.14}" y="${y0 + h * 0.63}" width="${w * 0.72}" height="${h * 0.075}" rx="${h * 0.02}" fill="#ffffff" opacity="0.9"/>
      ${line(x0 + w * 0.2, y0 + h * 0.755, w * 0.6)}
      ${line(x0 + w * 0.26, y0 + h * 0.815, w * 0.48, 0.6)}
      ${line(x0 + w * 0.32, y0 + h * 0.875, w * 0.36, 0.45)}`;
  }
  const mh = h * 0.68;
  const mw = mh * MASCOT.ratio;
  return `
    <circle cx="${x0 + w * 0.28}" cy="${y0 + h * 0.5}" r="${h * 0.36}" fill="#ffffff" opacity="0.35"/>
    <image href="${MASCOT.uri}" x="${x0 + w * 0.28 - mw / 2}" y="${y0 + h * 0.16}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
    <rect x="${x0 + w * 0.54}" y="${y0 + h * 0.26}" width="${w * 0.34}" height="${h * 0.11}" rx="${h * 0.028}" fill="#ffffff" opacity="0.9"/>
    ${line(x0 + w * 0.54, y0 + h * 0.47, w * 0.34)}
    ${line(x0 + w * 0.54, y0 + h * 0.57, w * 0.28, 0.6)}
    ${line(x0 + w * 0.54, y0 + h * 0.67, w * 0.2, 0.45)}`;
}

/** ภาพหนึ่งแนว — แผ่น A3 กลางภาพ + เงา A4 เทียบขนาด + ลูกศรวัดสองแกน */
function art(p) {
  const w = (p.portrait ? A3.w : A3.h) * CM;
  const h = (p.portrait ? A3.h : A3.w) * CM;
  const x0 = CX - w / 2;
  const y0 = CY - h / 2;

  /* เงา A4 เทียบขนาด — วางฝั่งขวา นอกกรอบครอป 300–600 (ไม่ให้รกตอนย่อเป็นปุ่ม) */
  const aw = (p.portrait ? A4.w : A4.h) * CM;
  const ah = (p.portrait ? A4.h : A4.w) * CM;
  const ax = 690 - aw / 2;
  const ay = y0 + h - ah; // วางชิดฐานเดียวกับแผ่น A3 เทียบสูงได้ทันที

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="print" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#38bdf8"/>
      <stop offset="0.55" stop-color="#22d3ee"/>
      <stop offset="1" stop-color="#a5b4fc"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="sheet"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="4"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${CX}" y="176" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${p.title}</text>
  <text x="${CX}" y="218" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${p.sub}</text>

  <!-- เงา A4 เทียบขนาด (ไม่ใช่ตัวเลือก — ไว้ให้เห็นว่า A3 ใหญ่เป็น 2 เท่าของ A4) -->
  <rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" rx="4" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="7 6"/>
  <text x="${ax + aw / 2}" y="${ay + ah / 2 - 4}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="#94a3b8">A4</text>
  <text x="${ax + aw / 2}" y="${ay + ah / 2 + 24}" font-family="${TH}" font-size="18" text-anchor="middle" fill="#94a3b8">เทียบขนาด</text>

  <!-- แผ่น A3 พิมพ์เต็มแผ่น -->
  <rect x="${x0 + 6}" y="${y0 + 10}" width="${w}" height="${h}" rx="4" fill="#0f172a" opacity="0.13"/>
  <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="4" fill="url(#print)" stroke="#94a3b8" stroke-width="2"/>
  <g clip-path="url(#sheet)">
    ${artwork(x0, y0, w, h, p.portrait)}
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#sheen)"/>
  </g>

  <!-- ลูกศรวัดสองแกน (ตำแหน่งคงที่ + เส้นบอกแนวจาง ๆ จากขอบแผ่น) -->
  ${guide(x0, y0 + h, x0, DIM_Y)}${guide(x0 + w, y0 + h, x0 + w, DIM_Y)}
  ${dim(x0, DIM_Y, x0 + w, DIM_Y, `${p.portrait ? A3.w : A3.h} ซม.`)}
  ${guide(x0, y0, DIM_X, y0)}${guide(x0, y0 + h, DIM_X, y0 + h)}
  ${dim(DIM_X, y0, DIM_X, y0 + h, `${p.portrait ? A3.h : A3.w} ซม.`)}

  <text x="${CX}" y="${H - 92}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">กระดาษแผ่นเดียวกัน ต่างกันที่แนววางลาย</text>
  <text x="${CX}" y="${H - 56}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ส่งไฟล์ลายมาตามแนวนี้ · พิมพ์เต็มแผ่นถึงขอบ</text>
</svg>`;
}

const built = [];
for (const p of PICKS) {
  const buf = await sharp(Buffer.from(art(p))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${p.file}`, buf);
  /* ครอปกลาง 300–600 ไว้ตรวจว่าที่เห็นบนปุ่มการ์ดยังบอกแนวกระดาษได้ */
  await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/_thumb-${p.file}`);
  built.push({ ...p, buf });
  console.log(`🖼  ${OUT}/${p.file}  ${Math.round(buf.length / 1024)} KB — ${p.title} (+ _thumb ครอปกลาง)`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const p of built) {
  const key = `products/${PRODUCT_ID}/${p.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, p.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  p.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", p.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];
const at = options.findIndex((o) => o.label === GROUP);
if (at < 0) { console.error(`ไม่เจอกลุ่ม "${GROUP}"`); process.exit(1); }

/* เติมภาพ/คำอธิบายทับตัวเดิม โดยคงชื่อและฟิลด์อื่นของตัวเลือกไว้ครบ */
const group = options[at];
group.display = "cards";
group.choices = group.choices.map((c) => {
  const p = built.find((b) => b.name === c.name);
  if (!p) { console.error("เจอตัวเลือกที่ไม่มีในสคริปต์ (ชื่ออาจถูกแก้):", c.name); process.exit(1); }
  return { ...c, imageSrc: p.url, desc: p.desc };
});
if (group.choices.length !== built.length) { console.error("จำนวนตัวเลือกไม่ตรงกับภาพที่วาด", group.choices.map((c) => c.name)); process.exit(1); }

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === GROUP);
if (g?.display !== "cards") { console.error("อ่านกลับ display ไม่เป็น cards", g?.display); process.exit(1); }
for (const p of built) {
  const c = g.choices.find((x) => x.name === p.name);
  if (c?.imageSrc !== p.url || c?.desc !== p.desc) { console.error("อ่านกลับตัวเลือกไม่ตรง!", p.name, c); process.exit(1); }
}
/* กันเผลอ: กลุ่มตัวเลือกอื่นต้องอยู่ครบเท่าเดิม ([[iducky-option-group-loss-guard]]) */
if (back.data.options.length !== options.length) { console.error("จำนวนกลุ่มตัวเลือกเปลี่ยน!", back.data.options.length, options.length); process.exit(1); }
console.log(`✓ กลุ่ม "${GROUP}" เป็นการ์ด + ภาพ ${built.length} ใบ · กลุ่มครบ ${back.data.options.length} · savedAt =`, back.data.savedAt);
