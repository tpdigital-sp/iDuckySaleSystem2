#!/usr/bin/env node
/**
 * CARD HOLDER (พลาสติกใส) — cardholder-clear
 * เพิ่มกลุ่ม "ตะขอโซ่ไข่ปลา" (การ์ด 2 ใบ + ภาพวาด) + กลุ่ม "สีตะขอ" (23 สี ดรอปดาวน์)
 *
 *   node scripts/cardholder-clear-hook-option.mjs           (วาดภาพลง .cache/cardholder-clear/upload ดูก่อน)
 *   node scripts/cardholder-clear-hook-option.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * [ร้านสั่ง 4 ก.ย. 69: "โซ่ไข่ปลา Z1 ฟรี · โซ่ไข่ปลาสีๆ บวกเพิ่มเส้นละ 3 บาท"]
 *
 * ⚠️ รหัสอะไหล่: ชาร์ต "ตะขอ | อะไหล่เสริม" ของร้านเอง (P-ตะขอ+อะไหล่-01.jpg) เขียนไว้ว่า
 *      **Z1 = ห่วงกลม (สีเงิน)** · **Z2 = โซ่ไข่ปลา (สีเงิน)** — ทั้งคู่ FREE
 *      **C = โซ่ไข่ปลาหลายสี +3 บาท/ชิ้น** (C1-C27 · แบบเงา C29-C33 +4 บาท ยังไม่เปิดขายในตัวนี้)
 *    ของที่แถมมากับการ์ดใสคือ "โซ่ไข่ปลา" = รหัส Z2 (Z1 เป็นห่วงกลม คนละชิ้น)
 *    จึงเขียนชื่อตัวเลือกเป็น Z2 ให้ตรงชาร์ต + ตรงกับสินค้าพี่น้อง frame-card
 *
 * ราคา: กลุ่มนี้ **ไม่ใช่แกนตารางราคา** (driverLabels = ["สกรีนกี่ด้าน"] — ห้ามแตะ)
 *       บวกเพิ่มด้วย choice.extra = 3 บาท/ชิ้น ซึ่งคิดทับทุกเรท/ทุกช่วงจำนวนเอง
 *
 * ⚠️ ปุ่ม/การ์ดตัวเลือกครอปกลางภาพ (900×900 เห็นแค่ 300–600) — วงโซ่จึงอยู่กลางภาพ
 *    เงิน = ป้าย "ฟรี ไม่บวกเพิ่ม" ในวงโซ่ · แบบสี = โซ่ชมพู + แถบสวอตช์สี
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 * รันซ้ำได้: เจอกลุ่มเดิมอยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "cardholder-clear";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const HOOK_GROUP = "ตะขอโซ่ไข่ปลา";
const COLOR_GROUP = "สีตะขอ";
const SECTION = "2. ตะขอ";
const SILVER_CHOICE = "โซ่ไข่ปลาสีเงิน (Z2)";
const COLOR_CHOICE = "โซ่ไข่ปลาแบบสี";
const COLOR_EXTRA = 3;
const SCREEN_GROUP = "สกรีนกี่ด้าน";

/** 23 เฉดโซ่ไข่ปลาแบบด้านจากชาร์ต "ตะขอ C" (แบบเงา C29-C33 +4 บาท ยังไม่เปิดขาย) — ชุดเดียวกับ frame-card */
const CHAIN_COLORS = [
  "C1 สีดำ", "C2 สีเทาเข้ม", "C3 สีเทาอ่อน", "C4 สีขาว", "C5 สีน้ำตาล", "C6 สีส้มเข้ม", "C7 สีส้ม",
  "C9 สีเหลือง", "C10 สีเหลืองอ่อน", "C11 สีเขียวอ่อน", "C12 สีเขียวกรม", "C13 สีเขียว", "C15 สีเขียวมิ้นท์",
  "C16 สีฟ้าอ่อน", "C17 สีฟ้า", "C18 สีฟ้าเข้ม", "C20 สีน้ำเงินเข้ม", "C21 สีม่วงเข้ม", "C22 สีม่วงอ่อน",
  "C23 สีชมพูพีช", "C25 สีชมพู", "C26 สีชมพูบานเย็น", "C27 สีแดง",
];

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";

// ── ตัวการ์ด (สเกลเล็กกว่าภาพกลุ่ม "ขนาด" เพราะต้องเว้นที่ให้วงโซ่) ──
const CM = 33;                       // 1 ซม. = 33 px
const BW = 6.5 * CM, BH = 10.5 * CM; // 214.5 × 346.5
const CX = 450, TOP = 448;
const L = CX - BW / 2, R = CX + BW / 2, BOT = TOP + BH;
const RAD = 0.15 * CM;

/** ช่องร้อยโซ่บนสุด 14.9 × 4.4 มม. ห่างขอบบน 4.3 มม. (วัดจากเทมเพลต Card holder ใส -.ai) */
const SLOT_W = 1.49 * CM, SLOT_H = 0.44 * CM, SLOT_Y = TOP + 0.43 * CM;
const SLOT_CY = SLOT_Y + SLOT_H / 2;

/** ช่องใสตรงกลาง (สัดส่วนเดียวกับภาพกลุ่ม "ขนาด") */
const WL = L + 0.18 * BW, WR = R - 0.18 * BW, WT = TOP + 0.15 * BH, WB = BOT - 0.06 * BH;
const WW = WR - WL, WH = WB - WT;

// ── โซ่ไข่ปลา: ห่วงหยดน้ำ ปลายทั้งสองมุดเข้าช่องร้อยโซ่ (วาดก่อนตัวการ์ด = ปลายโซ่อยู่หลังการ์ด) ──
const BEAD_R = 9.5;
const HOLE = [CX, SLOT_CY];
const TIP = [CX, 250];                 // จุดบรรจบด้านบน (หัวล็อกโซ่)

/** จุดบนเส้นเบซิเยร์ระยะเท่า ๆ กัน (เม็ดโซ่ต้องห่างเท่ากันตลอดเส้น) */
function beadsOn(p0, p1, p2, p3, step) {
  const at = (t) => {
    const u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
  };
  const out = [];
  let prev = at(0), acc = 0;
  out.push(prev);
  for (let i = 1; i <= 1200; i++) {
    const p = at(i / 1200);
    acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    if (acc >= step) { out.push(p); acc = 0; }
    prev = p;
  }
  return out;
}

function strand(beads, id) {
  const links = [];
  for (let i = 1; i < beads.length; i++) {
    const [ax, ay] = beads[i - 1], [bx, by] = beads[i];
    links.push(`<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="url(#${id}-bar)" stroke-width="${BEAD_R * 0.5}" stroke-linecap="round"/>`);
  }
  const balls = beads.map(([cx, cy]) => `
    <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${BEAD_R}" fill="url(#${id}-ball)"/>
    <circle cx="${(cx - BEAD_R * 0.3).toFixed(1)}" cy="${(cy - BEAD_R * 0.34).toFixed(1)}" r="${BEAD_R * 0.27}" fill="#ffffff" opacity="0.7"/>`).join("");
  return links.join("") + balls;
}

const ballChain = (id) =>
  strand(beadsOn(HOLE, [268, 430], [268, 282], TIP, 20), id) +
  strand(beadsOn(HOLE, [632, 430], [632, 282], TIP, 20), id);

/** หัวล็อกโซ่ (ปลอกโลหะทรงแคปซูล) วางที่จุดบรรจบด้านบน */
const clasp = (id) => `<g transform="translate(${TIP[0]} ${TIP[1] - 4})">
  <rect x="-29" y="-11" width="58" height="22" rx="11" fill="url(#${id}-ball)" stroke="#ffffff" stroke-width="1.6" stroke-opacity="0.55"/>
  <line x1="-7" y1="-8" x2="-7" y2="8" stroke="#ffffff" stroke-width="1.8" stroke-opacity="0.6"/>
</g>`;

const chainDefs = (id, c) => `
  <radialGradient id="${id}-ball" cx="0.34" cy="0.3" r="0.8">
    <stop offset="0" stop-color="${c.light}"/><stop offset="0.55" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.dark}"/>
  </radialGradient>
  <linearGradient id="${id}-bar" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.dark}"/>
  </linearGradient>`;

const SILVER = { light: "#ffffff", mid: "#cbd5e1", dark: "#8194a8" };
const PINK = { light: "#ffe3ee", mid: "#f472a4", dark: "#bd4c7c" };

/** เฉดตัวอย่างจากชาร์ต "ตะขอ C" (ของจริงเลือกได้ 23 สีในกลุ่ม "สีตะขอ") */
const SWATCHES = ["#111827", "#8b5a2b", "#f0863c", "#f6d43a", "#7cc242", "#3fb59a", "#4aa8e8", "#3f57b5", "#8b6ee0", "#f06fa8", "#e0343a"];

// ── ลายสกรีนบนกรอบ (แทนลายลูกค้า) ───────────────────────────────────
const star = (cx, cy, r, fill, op = 1) => {
  const p = Array.from({ length: 10 }, (_, i) => {
    const a = (-90 + i * 36) * Math.PI / 180, rr = i % 2 ? r * 0.45 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return `<polygon points="${p}" fill="${fill}" opacity="${op}"/>`;
};
const heart = (cx, cy, s, fill, op = 1) => `<path d="M ${cx} ${cy + s * 0.75}
  C ${cx - s * 1.2} ${cy - s * 0.1} ${cx - s * 0.5} ${cy - s * 0.95} ${cx} ${cy - s * 0.25}
  C ${cx + s * 0.5} ${cy - s * 0.95} ${cx + s * 1.2} ${cy - s * 0.1} ${cx} ${cy + s * 0.75} Z"
  fill="${fill}" opacity="${op}"/>`;

/** ลายเรียงเฉพาะ "แถบกรอบ" รอบช่องใส (u,v = สัดส่วนของตัวการ์ด) */
function printMotifs() {
  const WHITE = "#ffffff", YEL = "#ffe08a", PINK2 = "#ffb3cd", SKY = "#8ad2ef";
  const spots = [
    [0.088, 0.20, "s", 9, YEL], [0.086, 0.32, "h", 7, PINK2], [0.09, 0.44, "d", 3.5, WHITE],
    [0.086, 0.56, "s", 8, WHITE], [0.09, 0.68, "h", 7, SKY], [0.086, 0.79, "s", 8.5, YEL],
    [0.912, 0.19, "h", 7, PINK2], [0.914, 0.31, "s", 8.5, WHITE], [0.91, 0.43, "d", 3.5, WHITE],
    [0.914, 0.55, "s", 9, YEL], [0.91, 0.67, "h", 7, PINK2], [0.914, 0.79, "s", 8, SKY],
    [0.19, 0.075, "s", 8, WHITE], [0.33, 0.055, "h", 6.5, PINK2], [0.67, 0.055, "s", 7.5, YEL], [0.81, 0.075, "h", 6.5, SKY],
    [0.22, 0.965, "h", 6.5, PINK2], [0.4, 0.955, "s", 7.5, WHITE], [0.6, 0.958, "d", 3.5, WHITE], [0.78, 0.965, "s", 7.5, YEL],
  ];
  return spots.map(([u, v, k, s, c]) => {
    const x = L + u * BW, y = TOP + v * BH;
    return k === "s" ? star(x, y, s, c, 0.92) : k === "h" ? heart(x, y, s, c, 0.9)
      : `<circle cx="${x}" cy="${y}" r="${s}" fill="${c}" opacity="0.85"/>`;
  }).join("");
}

const pill = (cx, y, text, on = true) => {
  const w = text.length * 12.5 + 50;
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="44" rx="22" fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2.5"/>
  <text x="${cx}" y="${y + 30}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${on ? OK : SUB}">${text}</text>`;
};

/** ตัวการ์ด + บัตรที่สอดอยู่ (ย่อจากภาพกลุ่ม "ขนาด" ให้เหลือแค่ที่อ่านออกในสเกลนี้) */
function cardBody() {
  const PHOTO = Math.min(WW - 30, 78);
  const r = MASCOT.ratio;
  let ah = PHOTO - 10, aw = ah * r;
  if (aw > PHOTO - 8) { aw = PHOTO - 8; ah = aw / r; }
  const photoY = WT + 26;
  return `
  <rect x="${L + 4}" y="${TOP + 9}" width="${BW}" height="${BH}" rx="${RAD}" fill="#0f172a" opacity="0.08"/>
  <g clip-path="url(#bodyClip)">
    <rect x="${L}" y="${TOP}" width="${BW}" height="${BH}" fill="url(#print)"/>
    ${printMotifs()}
    <rect x="${L}" y="${TOP}" width="${BW}" height="${BH}" rx="${RAD}" fill="none" stroke="#ffffff" stroke-width="9" opacity="0.38"/>
  </g>
  <rect x="${L}" y="${TOP}" width="${BW}" height="${BH}" rx="${RAD}" fill="none" stroke="#8fbccb" stroke-width="2.5"/>

  <rect x="${WL}" y="${WT}" width="${WW}" height="${WH}" rx="6" fill="url(#card)" stroke="#cbd5e1" stroke-width="2"/>
  <rect x="${CX - PHOTO / 2}" y="${photoY}" width="${PHOTO}" height="${PHOTO}" rx="8" fill="#f0f9ff" stroke="#dbeafe" stroke-width="2"/>
  <image href="${MASCOT.uri}" x="${CX - aw / 2}" y="${photoY + (PHOTO - ah) / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
  ${[0, 1, 2].map((i) => `
    <rect x="${WL + 12}" y="${photoY + PHOTO + 22 + i * 22}" width="24" height="7" rx="3.5" fill="#cbd5e1"/>
    <rect x="${WL + 43}" y="${photoY + PHOTO + 24 + i * 22}" width="${WW - 56}" height="4" rx="2" fill="#e2e8f0"/>`).join("")}
  <g>${Array.from({ length: 16 }, (_, i) => `<rect x="${WL + 20 + i * 6}" y="${WB - 34}" width="${i % 3 === 0 ? 3.2 : 1.6}" height="20" fill="#94a3b8"/>`).join("")}</g>

  <rect x="${CX - SLOT_W / 2}" y="${SLOT_Y}" width="${SLOT_W}" height="${SLOT_H}" rx="${SLOT_H / 2}" fill="#eef2f6" stroke="#8fbccb" stroke-width="2"/>
  <g clip-path="url(#bodyClip)">
    <path d="M ${L - 24} ${BOT} L ${L + 54} ${TOP - 24} L ${L + 84} ${TOP - 24} L ${L + 6} ${BOT} Z" fill="#ffffff" opacity="0.13"/>
  </g>`;
}

function hookArt(kind) {
  const id = kind === "color" ? "cch" : "sch";
  const head = kind === "color"
    ? [COLOR_CHOICE, "โซ่ทั้งเส้นเป็นสีที่เลือก — เลือกเฉดในกลุ่ม “สีตะขอ”"]
    : [SILVER_CHOICE, "โซ่ไข่ปลาสีเงินที่แถมมากับการ์ด (รหัส Z2)"];
  const inside = kind === "color"
    ? `${pill(CX, 298, `+${COLOR_EXTRA} บาท / เส้น`)}
       <text x="${CX}" y="388" font-family="${TH}" font-size="20" font-weight="600" text-anchor="middle" fill="${SUB}">มีให้เลือก ${CHAIN_COLORS.length} สี</text>
       ${SWATCHES.map((c, i) => `<circle cx="${CX - (SWATCHES.length - 1) * 10 + i * 20}" cy="420" r="8.5" fill="${c}" stroke="#ffffff" stroke-width="1.8"/>`).join("")}`
    : pill(CX, 336, "ฟรี ไม่บวกเพิ่ม");
  const notes = kind === "color"
    ? ["โซ่ไข่ปลาแบบสี — เลือกเฉดต่อในกลุ่ม “สีตะขอ” ที่จะโผล่ขึ้นมาให้เลือก", "สีจริงอาจเข้ม-อ่อนต่างจากชาร์ตราว 5% ตามล็อตของโรงงาน"]
    : ["โซ่ไข่ปลาสีเงิน ร้อยผ่านช่องบนสุดของการ์ด — ห้อยกระเป๋า/ทำพวงกุญแจได้", "แถมมากับการ์ดใสทุกใบ ไม่บวกเพิ่ม"];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    ${chainDefs(id, kind === "color" ? PINK : SILVER)}
    <linearGradient id="print" x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#ffc3dc"/><stop offset="0.45" stop-color="#bfe3fb"/><stop offset="1" stop-color="#77cfe8"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f1f5f9"/>
    </linearGradient>
    <clipPath id="bodyClip"><rect x="${L}" y="${TOP}" width="${BW}" height="${BH}" rx="${RAD}"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${CX}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${head[0]}</text>
  <text x="${CX}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${head[1]}</text>

  ${ballChain(id)}
  ${clasp(id)}
  ${inside}
  ${cardBody()}

  <text x="${CX}" y="${H - 68}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${notes[0]}</text>
  <text x="${CX}" y="${H - 36}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${notes[1]}</text>
</svg>`;
}

const JOBS = [
  { file: `hook-z2-silver-${VER}.jpg`, kind: "silver", choice: SILVER_CHOICE,
    desc: "โซ่ไข่ปลาสีเงิน (Z2) ที่แถมมากับการ์ด ร้อยช่องบนสุด — ไม่บวกเพิ่ม" },
  { file: `hook-color-${VER}.jpg`, kind: "color", choice: COLOR_CHOICE,
    desc: `โซ่ไข่ปลาแบบสี ทั้งเส้นเป็นสีที่เลือก — เพิ่มเส้นละ ${COLOR_EXTRA} บาท (เลือกเฉดได้ ${CHAIN_COLORS.length} สีด้านล่าง)`,
    extra: COLOR_EXTRA },
];

for (const j of JOBS) {
  const buf = await sharp(Buffer.from(hookArt(j.kind))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, buf);
  j.local = `${OUT}/${j.file}`;
  await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/_thumb-${j.file}`);
  console.log(`🖼  ${j.file}  ${Math.round(buf.length / 1024)} KB (+ _thumb ครอปกลาง 300–600)`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log(`\n(ยังไม่เขียน DB — เปิดดูที่ ${OUT} แล้วรันด้วย --write เมื่อภาพผ่านตา)`); process.exit(0); }

// ── อัปโหลด storage + เขียน options + อ่านกลับเทียบ ───────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

/* 🔒 กันพัง: กลุ่มใหม่ต้อง "ไม่ใช่แกนตารางราคา" ไม่งั้นคีย์ cells จะเพี้ยนทั้งตาราง */
for (const m of [data.pricing, ...(data.priceRates ?? []).map((r) => r.pricing)].filter(Boolean)) {
  const dl = (m.driverLabels ?? []).join("│");
  if (dl !== SCREEN_GROUP) { console.error("แกนตารางราคาไม่ใช่", SCREEN_GROUP, "แต่เป็น:", dl); process.exit(1); }
}
/* 🔒 กลุ่มเดิมต้องอยู่ครบ (กันกลุ่มตัวเลือกหาย) */
/** เทียบโครงสร้างแบบไม่สนลำดับคีย์ — Supabase (jsonb) เรียงคีย์ใหม่ตอนอ่านกลับ */
const stable = (v) => Array.isArray(v) ? v.map(stable)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

const KEEP = ["ขนาด", SCREEN_GROUP];
const before = options.filter((o) => KEEP.includes(o.label));
if (options.filter((o) => KEEP.includes(o.label)).length !== KEEP.length) { console.error("กลุ่มเดิมไม่ครบ", options.map((o) => o.label)); process.exit(1); }

for (const j of JOBS) {
  const key = `products/${PRODUCT_ID}/${j.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, readFileSync(j.local), { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  j.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", j.url);
}

const hookGroup = {
  label: HOOK_GROUP,
  display: "cards",
  section: SECTION,
  choices: JOBS.map((j) => ({ name: j.choice, desc: j.desc, imageSrc: j.url, ...(j.extra ? { extra: j.extra } : {}) })),
};
const colorGroup = {
  label: COLOR_GROUP,
  display: "dropdown",
  section: SECTION,
  choices: CHAIN_COLORS.map((name) => ({ name })),
  showWhen: { label: HOOK_GROUP, choices: [COLOR_CHOICE] },
};
for (const g of [hookGroup, colorGroup]) {
  const at = options.findIndex((o) => o.label === g.label);
  if (at >= 0) options[at] = g; else options.push(g);
}
data.options = options;

/* เงื่อนไขท้ายหน้า: บอกให้ตรงกับตัวเลือกใหม่ (ของเดิมเขียนแค่ "มีโซ่ไข่ปลาสีเงิน") */
const TERM_OLD = "*มีโซ่ไข่ปลาสีเงิน";
const TERM_NEW = `*แถมโซ่ไข่ปลาสีเงิน (Z2) ฟรี · เปลี่ยนเป็นโซ่ไข่ปลาแบบสีได้ เพิ่มเส้นละ ${COLOR_EXTRA} บาท (มี ${CHAIN_COLORS.length} สี)`;
if (typeof data.terms === "string" && data.terms.includes(TERM_OLD)) data.terms = data.terms.replace(TERM_OLD, TERM_NEW);

data.savedAt = new Date().toISOString(); // ⏱ กันแคชรูป (?v=savedAt)
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bo = back.data.options ?? [];
if (!same(bo.filter((o) => KEEP.includes(o.label)), before)) { console.error("กลุ่มเดิมเปลี่ยนไป!"); process.exit(1); }
const gh = bo.filter((o) => o.label === HOOK_GROUP);
const gc = bo.filter((o) => o.label === COLOR_GROUP);
if (gh.length !== 1 || gc.length !== 1) { console.error("กลุ่มใหม่ซ้ำ/หาย", gh.length, gc.length); process.exit(1); }
if (!same(gh[0], hookGroup) || !same(gc[0], colorGroup)) {
  console.error("อ่านกลับไม่ตรง!", JSON.stringify(gh[0]), JSON.stringify(gc[0])); process.exit(1);
}
if (!back.data.terms.includes(TERM_NEW)) { console.error("เงื่อนไขไม่ได้อัปเดต"); process.exit(1); }
const dl = back.data.pricing?.driverLabels?.join(",");
console.log(`✓ เพิ่มกลุ่ม "${HOOK_GROUP}" (${gh[0].choices.length} การ์ด · แบบสี +${COLOR_EXTRA}/ชิ้น) + "${COLOR_GROUP}" (${gc[0].choices.length} สี)`);
console.log(`  แกนราคายังเป็น [${dl}] · เงื่อนไขอัปเดตแล้ว · savedAt =`, back.data.savedAt);
