#!/usr/bin/env node
/**
 * ชิงช้าสวรรค์อะคริลิค (acrylic-ferris-wheel) — เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบ
 *
 *   node scripts/ferris-wheel-size-option-art.mjs           (วาดภาพลง .cache/ferris-wheel/upload ดูก่อน)
 *   node scripts/ferris-wheel-size-option-art.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ใบสเปค FERRIS WHEEL (/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/10_อะคริลิค/สแตนดี้อะคริลิค/
 *   07-3-9_ชิงช้า&เรือ/P-nFerris-Pirate-01.jpg) — ชิงช้าสวรรค์มี "ขนาดเดียว" ขายเป็นชุด:
 *     • ตัวห้อย ไม่เกิน 6 ชิ้น (ราคาเท่ากัน) ขนาดไม่เกิน 4.5 cm รวมรูเจาะ · ไดคัทตามทรง
 *     • แกนกลาง 13 cm (แผ่นทรงกลม หมุนได้) · ไดคัทตามทรง
 *     • เสาค้ำ 2 ชิ้น 14.8 x 9.6 cm
 *     • ฐาน 9.5 x 5.5 cm
 *
 * เพิ่มกลุ่ม "ขนาด" display "cards" ตัวเลือกเดียว ไม่บวกราคา พร้อมภาพวาดใหม่ (900×900)
 * เป็นภาพด้านหน้า "สเกลจริง" 22 px = 1 ซม. ทุกชิ้นวัดจากใบสเปค — ตัวห้อย 6 ชิ้นห้อยรอบขอบแกนกลาง
 * เสาค้ำทรงรูกุญแจ (ตามของจริง) ตั้งบนฐาน + เส้นบอกขนาดทุกชิ้น + สูงรวมโดยประมาณ
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 300);
const MASCOT2 = await mascotDataUri("peace", 300);

const PRODUCT_ID = "acrylic-ferris-wheel";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/ferris-wheel/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "ขนาดเดียว — 1 ชุด (แกนกลาง Ø 13 ซม.)";
const SIZE_DESC = "ตัวห้อยไม่เกิน 6 ชิ้น (ไม่เกิน 4.5 ซม. รวมรูเจาะ) · แกนกลาง 13 ซม. หมุนได้ · เสาค้ำ 2 ชิ้น 14.8 × 9.6 ซม. · ฐาน 9.5 × 5.5 ซม.";
const SIZE_NOTE = "ตัวห้อยและแกนกลางไดคัทตามทรงได้ · ประกอบแล้วสูงรวมประมาณ 20 ซม.";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
const DIM = "#94a3b8";
const EDGE = "#e879a8"; // ขอบอะคริลิค (โทนชมพูตามงานจริงในใบสเปค)

// ── สเกลจริง: 22 px = 1 ซม. ───────────────────────────────────────────
const PX = 22;
const cm = (n) => n * PX;

const CX = 268;          // แกนกลางภาพวาด (กันที่ฝั่งขวาไว้ใส่ป้าย)
const GROUND = 770;      // ระดับพื้น (ใต้ฐาน)

const BASE_W = cm(9.5);  // ฐาน 9.5 ซม. (ด้านกว้าง)
const BASE_H = 16;       // ความหนาแผ่นฐานที่มองเห็นจากด้านหน้า
const BASE_TOP = GROUND - BASE_H;

const POST_H = cm(14.8); // เสาค้ำ สูง 14.8 ซม.
const POST_W = cm(9.6);  // เสาค้ำ กว้าง 9.6 ซม. (ที่ฐาน)
const POST_TOP = BASE_TOP - POST_H;
const HEAD_R = cm(2.35);  // หัวกลมของเสาค้ำ (ทรงรูกุญแจตามของจริง)
const PIVOT_Y = POST_TOP + HEAD_R; // จุดหมุน = กลางหัวกลม

const DISC_R = cm(13) / 2; // แกนกลาง Ø 13 ซม.
const HANG_R = cm(4.5) / 2; // ตัวห้อย ไม่เกิน 4.5 ซม.

const DISC_TOP = PIVOT_Y - DISC_R;

/** ตัวห้อย 6 ชิ้น — หมุดยึดที่ขอบแกนกลาง แล้วห้อยลงตรง ๆ ตามแรงโน้มถ่วง */
const HANGERS = [90, 30, -30, -90, -150, 150].map((deg, i) => {
  const a = (deg * Math.PI) / 180;
  const px = CX + DISC_R * Math.cos(a);
  const py = PIVOT_Y - DISC_R * Math.sin(a);
  return { i, px, py, cx: px, cy: py + HANG_R * 0.92 }; // หมุดอยู่ขอบบนของตัวห้อย
});

/** ลูกศรบอกขนาดแนวนอน */
const dimH = (x1, x2, y, label, color = DIM, bw = 156) => `
  <g stroke="${color}" stroke-width="2">
    <line x1="${x1}" y1="${y - 7}" x2="${x1}" y2="${y + 7}"/>
    <line x1="${x2}" y1="${y - 7}" x2="${x2}" y2="${y + 7}"/>
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>
    <path d="M ${x1} ${y} l 10 -5 v 10 z" fill="${color}" stroke="none"/>
    <path d="M ${x2} ${y} l -10 -5 v 10 z" fill="${color}" stroke="none"/>
  </g>
  <rect x="${(x1 + x2) / 2 - bw / 2}" y="${y - 16}" width="${bw}" height="32" rx="10" fill="#ffffff" opacity="0.95"/>
  <text x="${(x1 + x2) / 2}" y="${y + 8}" font-family="${TH}" font-size="22" font-weight="700"
    text-anchor="middle" fill="${color === DIM ? SUB : color}">${label}</text>`;

/** ลูกศรบอกขนาดแนวตั้ง (ไม่ใส่ตัวหนังสือหมุน — ภาษาไทยหมุนแล้วอ่านยาก ใช้ป้ายแนวนอนโยงแทน) */
const dimV = (y1, y2, x, color = DIM) => `
  <g stroke="${color}" stroke-width="2">
    <line x1="${x - 8}" y1="${y1}" x2="${x + 8}" y2="${y1}"/>
    <line x1="${x - 8}" y1="${y2}" x2="${x + 8}" y2="${y2}"/>
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/>
    <path d="M ${x} ${y1} l -5 10 h 10 z" fill="${color}" stroke="none"/>
    <path d="M ${x} ${y2} l -5 -10 h 10 z" fill="${color}" stroke="none"/>
  </g>`;

/** ป้ายชี้ฝั่งขวา (เส้นโยง + หัวข้อ + คำบรรยายไม่เกิน 2 บรรทัด) */
const callout = (fromX, fromY, boxY, title, subs, tone = "#f0f9ff", edge = "#bae6fd", ink = OK) => {
  const bx = 496;
  const bw = 372;
  const bh = 34 + subs.length * 26;
  return `
  <line x1="${fromX}" y1="${fromY}" x2="${bx - 12}" y2="${boxY + bh / 2}" stroke="#cbd5e1" stroke-width="2.5"/>
  <circle cx="${fromX}" cy="${fromY}" r="5" fill="${ink}"/>
  <rect x="${bx}" y="${boxY}" width="${bw}" height="${bh}" rx="16" fill="${tone}" stroke="${edge}" stroke-width="2"/>
  <text x="${bx + 20}" y="${boxY + 30}" font-family="${TH}" font-size="23" font-weight="700" fill="${ink}">${title}</text>
  ${subs.map((t, i) => `<text x="${bx + 20}" y="${boxY + 56 + i * 26}" font-family="${TH}" font-size="19" fill="${SUB}">${t}</text>`).join("")}`;
};

/**
 * ภาพ "ชิงช้าสวรรค์อะคริลิค 1 ชุด" — มองจากด้านหน้า สเกลจริง 22 px = 1 ซม.
 * ฐาน → เสาค้ำทรงรูกุญแจ → แกนกลางกลม 13 ซม. หมุนรอบหัวเสา → ตัวห้อย 6 ชิ้นห้อยรอบขอบ
 */
function sizeArt() {
  const postPath = `
    M ${CX - POST_W / 2} ${BASE_TOP}
    L ${CX - HEAD_R * 0.62} ${PIVOT_Y + HEAD_R * 0.78}
    A ${HEAD_R} ${HEAD_R} 0 1 1 ${CX + HEAD_R * 0.62} ${PIVOT_Y + HEAD_R * 0.78}
    L ${CX + POST_W / 2} ${BASE_TOP} Z`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="acr" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fdf2f8"/>
      <stop offset="1" stop-color="#fbcfe8"/>
    </linearGradient>
    <linearGradient id="post" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fbcfe8"/>
      <stop offset="1" stop-color="#f9a8d4"/>
    </linearGradient>
    <radialGradient id="disc" cx="0.42" cy="0.34" r="0.78">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.55" stop-color="#fce7f3"/>
      <stop offset="1" stop-color="#f9a8d4"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>

  <text x="46" y="82" font-family="${TH}" font-size="38" font-weight="700" fill="${INK}">ชิงช้าสวรรค์อะคริลิค — มีขนาดเดียว</text>
  <text x="46" y="122" font-family="${TH}" font-size="23" fill="${SUB}">ขายเป็นชุด 1 ชุด · ภาพนี้วาดตามสเกลจริงของทุกชิ้น</text>

  <!-- ไม้บรรทัดสเกล 1 ซม. มุมขวาบน -->
  <g transform="translate(${W - 66 - cm(5)} 96)">
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${cm(i)}" y="0" width="${cm(1)}" height="14" fill="${i % 2 ? "#e2e8f0" : "#cbd5e1"}"/>`).join("")}
    <rect x="0" y="0" width="${cm(5)}" height="14" fill="none" stroke="#94a3b8" stroke-width="1.5"/>
    <text x="${cm(2.5)}" y="34" font-family="${TH}" font-size="18" text-anchor="middle" fill="${SUB}">5 ซม.</text>
  </g>

  <!-- เสาค้ำ 2 ชิ้น 14.8 × 9.6 ซม. (ชิ้นหลังเยื้องให้เห็นว่ามี 2 แผ่นประกบ) -->
  <g transform="translate(13 -9)" opacity="0.45">
    <path d="${postPath}" fill="url(#post)" stroke="${EDGE}" stroke-width="3"/>
  </g>
  <path d="${postPath}" fill="url(#post)" stroke="${EDGE}" stroke-width="3"/>
  <path d="M ${CX - POST_W / 2 + 20} ${BASE_TOP - 6} L ${CX - 12} ${PIVOT_Y + HEAD_R * 0.5}"
    stroke="#ffffff" stroke-width="7" stroke-linecap="round" opacity="0.6"/>

  <!-- ฐาน 9.5 × 5.5 ซม. (มองด้านหน้า เห็นความหนา + เงาแผ่นลึก 5.5 ซม.) -->
  <path d="M ${CX - BASE_W / 2 + 16} ${BASE_TOP - 13} h ${BASE_W - 4} l 16 13 h -${BASE_W} Z"
    fill="#fce7f3" stroke="${EDGE}" stroke-width="2" opacity="0.85"/>
  <rect x="${CX - BASE_W / 2}" y="${BASE_TOP}" width="${BASE_W}" height="${BASE_H}" rx="6"
    fill="url(#acr)" stroke="${EDGE}" stroke-width="3"/>
  <rect x="${CX - POST_W / 2 - 6}" y="${BASE_TOP + 3}" width="${POST_W + 12}" height="7" rx="3.5"
    fill="#ffffff" opacity="0.85"/>

  <!-- แกนกลาง Ø 13 ซม. (แผ่นทรงกลม หมุนได้) -->
  <circle cx="${CX}" cy="${PIVOT_Y}" r="${DISC_R}" fill="url(#disc)" stroke="${EDGE}" stroke-width="3.5" opacity="0.95"/>
  <circle cx="${CX}" cy="${PIVOT_Y}" r="${DISC_R - 13}" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.9"/>
  ${HANGERS.map((h) => `<line x1="${CX}" y1="${PIVOT_Y}" x2="${h.px}" y2="${h.py}" stroke="#ffffff" stroke-width="4" opacity="0.75"/>`).join("")}
  ${(() => {
    const ah = 74;
    const aw = ah * MASCOT.ratio;
    return `<image href="${MASCOT.uri}" x="${CX - aw / 2}" y="${PIVOT_Y - ah / 2 - 4}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet" opacity="0.95"/>`;
  })()}
  <circle cx="${CX}" cy="${PIVOT_Y}" r="13" fill="#ffffff" stroke="${EDGE}" stroke-width="2.5"/>
  <circle cx="${CX}" cy="${PIVOT_Y}" r="5" fill="${EDGE}"/>

  <!-- ลูกศรหมุน (แกนกลางหมุนได้จริง) -->
  <g fill="none" stroke="${OK}" stroke-width="3.5" stroke-linecap="round">
    <path d="M ${CX + 44} ${PIVOT_Y - 30} A 54 54 0 0 1 ${CX + 44} ${PIVOT_Y + 30}"/>
  </g>
  <path d="M ${CX + 44} ${PIVOT_Y + 30} l -3 -13 l 14 5 z" fill="${OK}"/>

  <!-- ตัวห้อย 6 ชิ้น ไม่เกิน 4.5 ซม. (รวมรูเจาะ) -->
  ${HANGERS.map((h) => {
    const art = h.i % 2 === 0 ? MASCOT : MASCOT2;
    const ah = HANG_R * 1.25;
    const aw = ah * art.ratio;
    return `
    <line x1="${h.px}" y1="${h.py}" x2="${h.cx}" y2="${h.cy - HANG_R * 0.9}" stroke="${EDGE}" stroke-width="3"/>
    <circle cx="${h.cx}" cy="${h.cy}" r="${HANG_R}" fill="#ffffff" stroke="${EDGE}" stroke-width="3"/>
    <circle cx="${h.cx}" cy="${h.cy}" r="${HANG_R - 7}" fill="#fdf2f8"/>
    <image href="${art.uri}" x="${h.cx - aw / 2}" y="${h.cy - ah / 2 + 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
    <circle cx="${h.px}" cy="${h.py}" r="7" fill="#ffffff" stroke="${EDGE}" stroke-width="2.5"/>`;
  }).join("")}

  <!-- เส้นบอกขนาด -->
  ${dimH(CX - DISC_R, CX + DISC_R, DISC_TOP - 32, "แกนกลาง 13 ซม.", OK)}
  ${dimH(CX - BASE_W / 2, CX + BASE_W / 2, GROUND + 34, "ฐาน 9.5 ซม.")}
  ${dimV(DISC_TOP, GROUND, 92)}
  ${(() => {
    const h = HANGERS[5]; // ตัวห้อยซ้ายบน — วัดกว้าง 4.5 ซม. (ที่ว่างข้างแกนกลาง)
    return dimH(h.cx - HANG_R, h.cx + HANG_R, h.cy - HANG_R - 24, "4.5 ซม.", "#be185d", 104);
  })()}

  <!-- ป้ายสูงรวม (แนวนอน โยงลงลูกศรแนวตั้งฝั่งซ้าย) -->
  <line x1="92" y1="${DISC_TOP}" x2="92" y2="248" stroke="#cbd5e1" stroke-width="2.5" stroke-dasharray="6 6"/>
  <rect x="46" y="216" width="290" height="46" rx="23" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2"/>
  <text x="72" y="247" font-family="${TH}" font-size="22" font-weight="700" fill="${SUB}">↕</text>
  <text x="96" y="247" font-family="${TH}" font-size="22" font-weight="700" fill="${SUB}">ประกอบแล้วสูงประมาณ 20 ซม.</text>

  <!-- ป้ายชี้ -->
  ${callout(HANGERS[1].cx + HANG_R * 0.72, HANGERS[1].cy - HANG_R * 0.5, 300,
    "ตัวห้อย ไม่เกิน 6 ชิ้น", ["ชิ้นละไม่เกิน 4.5 ซม. (รวมรูเจาะ)", "ไดคัทตามทรงได้"], "#fdf2f8", "#fbcfe8", "#be185d")}
  ${callout(CX + DISC_R * Math.cos(1.082), PIVOT_Y - DISC_R * Math.sin(1.082), 424,
    "แกนกลาง Ø 13 ซม.", ["แผ่นทรงกลม หมุนได้จริง", "ไดคัทตามทรงได้"])}
  ${callout(CX + POST_W * 0.3, BASE_TOP - POST_H * 0.3, 548,
    "เสาค้ำ 2 ชิ้น", ["ชิ้นละ 14.8 × 9.6 ซม.", "ประกบหน้า-หลังตัวแกนกลาง"])}
  ${callout(CX + BASE_W / 2 - 12, BASE_TOP + 7, 672,
    "ฐาน 9.5 × 5.5 ซม.", ["แผ่นเสียบตั้งโต๊ะ 1 ชิ้น"])}

  <text x="46" y="${H - 44}" font-family="${TH}" font-size="21" fill="${SUB}">พิมพ์ลายตามสั่งระบบ UV Printing · ทุกชิ้นในชุดเลือกอะคริลิคสีพิเศษ / สกรีน 2 ด้านเพิ่มได้</text>
</svg>`;
}

const svg = sizeArt();
const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
const FILE = `size-set-${VER}.jpg`;
writeFileSync(`${OUT}/${FILE}`, buf);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ชิงช้าสวรรค์ 1 ชุด สเกลจริง`);

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
const before = options.length;

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

// กันกลุ่มตัวเลือกหาย — จำนวนกลุ่มต้องเท่าเดิม (เขียนทับ) หรือ +1 (เพิ่มใหม่) เท่านั้น
const expect = atSize >= 0 ? before : before + 1;
if (options.length !== expect) { console.error("จำนวนกลุ่มเพี้ยน", before, "→", options.length); process.exit(1); }

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
if (back.data.options.length !== expect) { console.error("อ่านกลับแล้วกลุ่มหาย!", back.data.options.map((o) => o.label)); process.exit(1); }
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (cards · 1 ตัวเลือก) อ่านกลับตรง · ${back.data.options.length} กลุ่ม · savedAt =`, back.data.savedAt);
