#!/usr/bin/env node
/**
 * ผ้าผูกผม | ผ้าผูกกระเป๋า (scarf) — เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบ
 *
 *   node scripts/scarf-size-option.mjs           (วาดภาพลง .cache/scarf/upload ดูก่อน)
 *   node scripts/scarf-size-option.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ของเดิมใน DB: มีกลุ่มเดียวคือ "สีไหมเย็บชิ้นงาน" — ขนาดอยู่แค่ในบล็อกเนื้อหา (body)
 *   "ขนาด กว้าง 5 x ยาว 100 cm"
 *
 * ยืนยันขนาดจากใบวางแบบของร้านเอง (แท็บ "ตัวอย่างการวางแบบ" ของสินค้าตัวนี้):
 *   หัวเรื่องเขียน "ผ้าผูกผม และผ้าพันกระเป๋า (ขนาด 5x100cm)"
 *   ผืนพิมพ์เป็นแถบยาว มีเส้นประกลาง + ป้าย "พับครึ่ง" → พิมพ์ผืนเดียวพับครึ่งตามยาวแล้วเย็บ
 *   ปลายผืนตัดเป็นมุมแหลม (ซ้ายเว้าเป็น V · ขวาแหลมออก) พอพับครึ่งแล้ว = **ปลายตัดเฉียงทั้งสองด้าน**
 *   หมายเหตุในใบ: "การตัดเย็บแต่ละชิ้นอาจจะมีความคลาดเคลื่อน 2-5cm" (terms ในเว็บเขียน 0.5-1 cm)
 *
 * ⚠️ ร้านมี **ขนาดเดียว** — กลุ่มนี้จึงมีการ์ดใบเดียว ไม่บวกราคา (extra 0)
 *    ใส่ไว้เพื่อให้ลูกค้าเห็นขนาดจริงตั้งแต่หน้าเลือกซื้อ แนวเดียวกับ
 *    [[iducky-silicone-coaster]] / [[iducky-placemat]] / [[iducky-hologram-bag]]
 *
 * ราคา: pricing.driverLabels = [] (ทั้งใบหลักและ priceRates) — ตั้งชื่อกลุ่มว่า "ขนาด"
 *   จึงไม่ชนแกนตารางราคา ดู [[iducky-price-driver-trap]]
 *
 * ภาพ 900×900: แถบผ้าวาด **สเกลจริง** 7.2 px = 1 ซม. (100 ซม. = 720 px · 5 ซม. = 36 px)
 *   + ลูกศรวัด + ตัวเลขขนาดตัวโตกลางภาพ + ภาพใช้งานจริง 2 แบบ (ผูกผม / ผูกหูกระเป๋า)
 * ⚠️ ปุ่มตัวเลือกครอปกลางภาพ 62×62 (พิกัด 300-600) — ตัวเลข "5 × 100" จึงวางคาบกลางภาพ
 *    ([[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "scarf";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const GROUP = "ขนาด";
const CHOICE = "5 × 100 ซม.";
const FILE = `size-5x100-${VER}.jpg`;

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";

const PX_PER_CM = 7.2;          // สเกลจริง — 100 ซม. = 720 px พอดีหน้ากว้างการ์ด
const LEN = 100, WIDE = 5;
const STRIP_L = 90;             // ขอบซ้ายผืนผ้า
const STRIP_R = STRIP_L + LEN * PX_PER_CM;   // 810
const STRIP_TOP = 214;
const STRIP_H = WIDE * PX_PER_CM;            // 36
const STRIP_BOT = STRIP_TOP + STRIP_H;
const TAPER = 8 * PX_PER_CM;    // ระยะปลายตัดเฉียง ~8 ซม. (วัดจากใบวางแบบ)

/** ลูกศรวัดขนาด — เส้น + ขีดปลาย + ป้ายตัวเลขบนพื้นขาว */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 34 : -16);
  const tick = (x, y) => `<line x1="${x - (vertical ? 9 : 0)}" y1="${y - (vertical ? 0 : 9)}" x2="${x + (vertical ? 9 : 0)}" y2="${y + (vertical ? 0 : 9)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12.5 : (label.length * 12.5) / 2)}" y="${ly - 25}"
      width="${label.length * 12.5}" height="32" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="25" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

const pill = (cx, y, text, tone = "ok") => {
  const w = text.length * 14 + 56;
  const c = tone === "mute" ? SUB : OK;
  const bg = tone === "mute" ? "#f8fafc" : "#ecfeff";
  return `
    <rect x="${cx - w / 2}" y="${y - 23}" width="${w}" height="46" rx="23" fill="${bg}" stroke="${c}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${c}">${text}</text>`;
};

// ── ลายบนผ้า: พื้นซาตินฟ้าพาสเทล + ดาว/ดอกไม้/โบว์เล็ก ๆ ─────────────
/** จุดตกแต่งกระจายทั้งผืน — ตำแหน่งกำหนดตายตัว ไม่สุ่ม จะได้เรนเดอร์ซ้ำได้เหมือนเดิม */
const confetti = (x0, y0, w0, h0, n, size = 1) => {
  const cols = ["#f7a8c4", "#f6c453", "#7ec9c0", "#ffffff", "#c3a6e8"];
  let out = "";
  for (let i = 0; i < n; i++) {
    const fx = ((i * 37) % 101) / 101;
    const fy = ((i * 53) % 29) / 29;
    const x = x0 + 6 + fx * (w0 - 12), y = y0 + 4 + fy * (h0 - 8);
    const r = (2.2 + ((i * 5) % 3) * 1.1) * size;
    const c = cols[i % cols.length];
    out += (i % 3 === 0)
      // ดาว 4 แฉกเล็ก
      ? `<path d="M ${x} ${y - r * 1.7} Q ${x + r * 0.4} ${y - r * 0.4} ${x + r * 1.7} ${y} Q ${x + r * 0.4} ${y + r * 0.4} ${x} ${y + r * 1.7} Q ${x - r * 0.4} ${y + r * 0.4} ${x - r * 1.7} ${y} Q ${x - r * 0.4} ${y - r * 0.4} ${x} ${y - r * 1.7} Z" fill="${c}" opacity="0.9"/>`
      : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${c}" opacity="0.9"/>`;
  }
  return out;
};

/** ผืนผ้าเต็มความยาว วาดสเกลจริง — ปลายตัดเฉียงคนละทิศตามใบวางแบบ (พับครึ่งแล้วเย็บ) */
const strip = () => {
  const d = `M ${STRIP_L} ${STRIP_BOT} L ${STRIP_L + TAPER} ${STRIP_TOP} L ${STRIP_R} ${STRIP_TOP} L ${STRIP_R - TAPER} ${STRIP_BOT} Z`;
  return `
  <defs>
    <linearGradient id="satin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#dcefff"/><stop offset="0.45" stop-color="#bfe0fa"/>
      <stop offset="0.55" stop-color="#eaf6ff"/><stop offset="1" stop-color="#b9dcf8"/>
    </linearGradient>
    <clipPath id="stripClip"><path d="${d}"/></clipPath>
  </defs>
  <path d="${d}" fill="url(#satin)"/>
  <g clip-path="url(#stripClip)">
    ${confetti(STRIP_L, STRIP_TOP, STRIP_R - STRIP_L, STRIP_H, 74)}
    <!-- ไฮไลต์ผิวซาติน -->
    <rect x="${STRIP_L}" y="${STRIP_TOP + 7}" width="${STRIP_R - STRIP_L}" height="6" fill="#ffffff" opacity="0.45"/>
  </g>
  <path d="${d}" fill="none" stroke="#7fb3d9" stroke-width="2.2"/>
  <!-- เส้นด้ายเย็บริมผืน -->
  <line x1="${STRIP_L + TAPER + 6}" y1="${STRIP_TOP + 5}" x2="${STRIP_R - 8}" y2="${STRIP_TOP + 5}" stroke="#ffffff" stroke-width="1.4" stroke-dasharray="6 5" opacity="0.85"/>
  <line x1="${STRIP_L + 8}" y1="${STRIP_BOT - 5}" x2="${STRIP_R - TAPER - 6}" y2="${STRIP_BOT - 5}" stroke="#ffffff" stroke-width="1.4" stroke-dasharray="6 5" opacity="0.85"/>`;
};

// ── โบว์ผ้า 1 ตัว (ใช้ทั้งฉากผูกผมและฉากผูกกระเป๋า) ────────────────────
const SILK = "#bfe0fa", SILK_DK = "#93c4e8", SILK_LT = "#e6f3ff";
/**
 * โบว์ + หางสองเส้นปลายตัดเฉียง — cx,cy = จุดผูก · s = สเกล · flip = สลับข้างหาง
 * วาดในสเปซ 100 หน่วย แล้ว scale ตอนใช้
 */
const bow = (cx, cy, s, tail = 150) => `
  <g transform="translate(${cx} ${cy}) scale(${s})">
    <!-- หางสองเส้น ปลายตัดเฉียง -->
    <path d="M -16 6 C -30 ${tail * 0.35} -34 ${tail * 0.6} -22 ${tail} L 4 ${tail * 0.94} C -4 ${tail * 0.6} -2 ${tail * 0.3} 4 8 Z" fill="${SILK}" stroke="${SILK_DK}" stroke-width="2"/>
    <path d="M 12 6 C 26 ${tail * 0.3} 32 ${tail * 0.62} 24 ${tail * 1.12} L -2 ${tail * 1.04} C 8 ${tail * 0.62} 6 ${tail * 0.3} -2 8 Z" fill="${SILK_LT}" stroke="${SILK_DK}" stroke-width="2"/>
    ${confetti(-34, 10, 66, tail, 16, 1.1)}
    <!-- ห่วงโบว์ซ้าย-ขวา -->
    <path d="M -4 0 C -34 -30 -66 -22 -60 4 C -55 26 -24 20 -4 6 Z" fill="${SILK}" stroke="${SILK_DK}" stroke-width="2"/>
    <path d="M 4 0 C 34 -30 66 -22 60 4 C 55 26 24 20 4 6 Z" fill="${SILK_LT}" stroke="${SILK_DK}" stroke-width="2"/>
    <!-- ปมกลาง -->
    <ellipse cx="0" cy="3" rx="11" ry="10" fill="${SILK}" stroke="${SILK_DK}" stroke-width="2"/>
  </g>`;

/**
 * ฉากซ้าย: มัดผมหางม้าแล้วผูกโบว์ที่โคนหาง
 * วาดในพิกัดท้องถิ่น (0,0 = กลาง-บนสุดของศีรษะ) แล้วค่อย translate/scale ตอนใช้
 */
const HAIR = "#4a3b47", HAIR_LT = "#6b5563", HAIR_DK = "#3d3039";
const hairScene = (cx, top, s) => `
  <g transform="translate(${cx} ${top}) scale(${s})">
    <!-- ไหล่ + คอ (ให้อ่านออกว่าเป็นคน มองจากด้านหลัง) -->
    <rect x="-15" y="92" width="30" height="34" rx="12" fill="#f0cdb0"/>
    <path d="M -108 224 C -104 162 -46 128 0 128 C 46 128 104 162 108 224 L 108 240 L -108 240 Z" fill="#e3ebf5" stroke="#cdd8e6" stroke-width="2.5"/>
    <!-- ศีรษะ + ผมรวบ -->
    <ellipse cx="0" cy="54" rx="54" ry="56" fill="${HAIR}"/>
    <path d="M -44 26 C -20 8 24 12 44 34" fill="none" stroke="${HAIR_LT}" stroke-width="3.5" opacity="0.65"/>
    <path d="M -30 14 C -10 2 16 4 34 18" fill="none" stroke="${HAIR_LT}" stroke-width="3" opacity="0.5"/>
    <!-- โคนหางม้า -->
    <path d="M -22 96 C -14 116 14 116 22 96 Z" fill="${HAIR_DK}"/>
    <!-- หางผมสยายลงล่าง (อยู่หลังโบว์) -->
    <path d="M -24 108 C -46 164 -34 214 -8 250 C 20 216 42 162 24 108 Z" fill="${HAIR}"/>
    <path d="M -6 122 C -18 166 -14 200 -4 232" fill="none" stroke="${HAIR_LT}" stroke-width="3.5" opacity="0.55"/>
    <path d="M 10 124 C 16 162 10 194 0 220" fill="none" stroke="${HAIR_LT}" stroke-width="3" opacity="0.4"/>
    ${bow(0, 108, 0.52, 150)}
  </g>`;

/** ฉากขวา: ผูกที่หูกระเป๋า — พิกัดท้องถิ่น (0,0 = กลาง-บนสุดของหูกระเป๋า) */
const bagScene = (cx, top, s) => `
  <g transform="translate(${cx} ${top}) scale(${s})">
    <!-- หูกระเป๋า -->
    <path d="M -54 96 C -50 8 50 8 54 96" fill="none" stroke="#d8c8b4" stroke-width="14" stroke-linecap="round"/>
    <!-- ตัวกระเป๋า -->
    <path d="M -96 96 L 96 96 L 82 224 C 78 240 -78 240 -82 224 Z" fill="#f2ece2" stroke="#dbcfbd" stroke-width="2.5"/>
    <path d="M -96 96 L 96 96 L 94 112 L -94 112 Z" fill="#e8dfd1"/>
    ${bow(-34, 42, 0.5, 168)}
  </g>`;

// ── การ์ดขนาด ─────────────────────────────────────────────────────────
function sizeArt() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด กว้าง 5 × ยาว 100 ซม.</text>
  <text x="${W / 2}" y="128" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ผ้าซาตินโรม่า ขนาดเดียว — ปลายตัดเฉียงทั้งสองด้าน</text>

  <!-- ผืนผ้าเต็มความยาว วาดสเกลจริง 1 ซม. = ${PX_PER_CM} px -->
  <text x="${W / 2}" y="182" font-family="${TH}" font-size="21" text-anchor="middle" fill="${OK}">ภาพนี้วาดสเกลจริง — ยาวเต็มผืน 1 เมตร</text>
  ${strip()}
  ${dim(STRIP_L, STRIP_BOT + 32, STRIP_R, STRIP_BOT + 32, `${LEN} ซม. (1 เมตร)`)}
  ${dim(STRIP_L + TAPER - 22, STRIP_TOP, STRIP_L + TAPER - 22, STRIP_BOT, `${WIDE} ซม.`)}

  <!-- ตัวเลขขนาดตัวโตกลางภาพ — ต้องอ่านออกตอนย่อเป็นปุ่ม 62×62 -->
  <text x="${W / 2}" y="380" font-family="${TH}" font-size="26" text-anchor="middle" fill="${SUB}">กว้าง × ยาว</text>
  <text x="${W / 2}" y="464" font-family="${TH}" font-size="72" font-weight="700" text-anchor="middle" fill="${INK}">5 × 100</text>
  <text x="${W / 2}" y="510" font-family="${TH}" font-size="30" font-weight="700" text-anchor="middle" fill="${SUB}">เซนติเมตร</text>
  ${pill(W / 2, 566, "ขนาดเดียว รวมในราคาแล้ว")}

  <!-- ใช้งานจริง 2 แบบ -->
  ${hairScene(250, 596, 0.63)}
  ${bagScene(642, 602, 0.67)}
  <text x="252" y="782" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">ผูกผม · มัดจุก</text>
  <text x="640" y="782" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">ผูกหูกระเป๋า</text>

  <text x="${W / 2}" y="${H - 60}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">พิมพ์ลายของคุณเต็มผืน ระบบซับลิเมชั่น · พับครึ่งเย็บ เห็นลายทั้งสองด้าน</text>
  <text x="${W / 2}" y="${H - 28}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">งานตัดเย็บด้วยมือ ขนาดแต่ละชิ้นอาจคลาดเคลื่อนเล็กน้อย</text>
</svg>`;
}

const buf = await sharp(Buffer.from(sizeArt())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/${FILE}`, buf);
// ครอปกลาง 300-600 เก็บไว้ดูด้วย — คือสิ่งที่ลูกค้าเห็นบนปุ่มตัวเลือกจริง
await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/thumb-${FILE}`);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ${CHOICE}`);

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
const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", url);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
// รันซ้ำแล้วอย่าเขียนทับไฟล์สำรอง ไม่งั้นของ "ก่อนแก้จริง" หายไปตั้งแต่รอบสอง
const dump = `${OUT}/../before-${VER}.json`;
if (existsSync(dump)) console.log("มีไฟล์สำรองอยู่แล้ว ไม่เขียนทับ:", dump);
else { writeFileSync(dump, JSON.stringify(data, null, 2)); console.log("สำรองข้อมูลเดิมไว้ที่", dump); }

const sizeGroup = {
  label: GROUP,
  display: "cards",
  note: `ร้านทำขนาดเดียว กว้าง ${WIDE} × ยาว ${LEN} ซม. ปลายตัดเฉียงทั้งสองด้าน — พิมพ์ลายเต็มผืนระบบซับลิเมชั่น พับครึ่งเย็บ เห็นลายทั้งสองด้าน · งานตัดเย็บด้วยมือ ขนาดแต่ละชิ้นอาจคลาดเคลื่อนเล็กน้อย`,
  choices: [{
    name: CHOICE,   // มีการ์ดใบเดียว จึงไม่ติดป้าย "นิยม" — ไม่มีอะไรให้เทียบ
    imageSrc: url,
    desc: "ขนาดมาตรฐานขนาดเดียวของร้าน รวมในราคาแล้ว — ใช้ผูกผม มัดจุก หรือผูกหูกระเป๋าก็ได้",
  }],
};

// รันซ้ำได้: มีกลุ่มเดิม = เขียนทับที่เดิม · ยังไม่มี = แทรกไว้หน้าสุด
const options = data.options ?? [];
const at = options.findIndex((o) => o.label === GROUP);
if (at >= 0) options[at] = sizeGroup; else options.unshift(sizeGroup);
data.options = options;
data.savedAt = new Date().toISOString();

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const g = got.find((o) => o.label === GROUP);
const fails = [
  [got.filter((o) => o.label === GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [g?.display === "cards", "กลุ่มขนาดไม่ใช่การ์ด"],
  [g?.choices?.length === 1, "จำนวนการ์ดไม่ใช่ 1"],
  [g?.choices?.[0]?.name === CHOICE, "ชื่อการ์ดไม่ตรง"],
  [g?.choices?.[0]?.imageSrc === url, "ภาพการ์ดไม่ตรง"],
  [!g?.choices?.[0]?.extra, "การ์ดไปมีค่าบวกราคา"],
  [!!g?.choices?.[0]?.desc, "การ์ดขาดคำอธิบาย"],
  [!g?.choices?.[0]?.popular, 'การ์ดใบเดียวไม่ควรติดป้าย "นิยม"'],
  // กลุ่มเดิมต้องอยู่ครบ ([[iducky-option-group-loss-guard]])
  [got.some((o) => o.label === "สีไหมเย็บชิ้นงาน"), 'กลุ่ม "สีไหมเย็บชิ้นงาน" หาย'],
  [got.find((o) => o.label === "สีไหมเย็บชิ้นงาน")?.choices?.length === 13, "สีไหมไม่ครบ 13 สี"],
  // กันกับดักราคา: ชื่อกลุ่มใหม่ต้องไม่ไปตรงกับแกนตารางราคา ไม่งั้นราคาหล่นไป product.price
  [!(back.data.pricing?.driverLabels ?? []).includes(GROUP), "ชื่อกลุ่มไปชนแกนตารางราคา (driverLabels)"],
  [(back.data.priceRates ?? []).every((r) => !(r.pricing?.driverLabels ?? []).includes(GROUP)), "ชื่อกลุ่มไปชนแกนตารางราคาของเรท"],
  [back.data.priceMin === 60 && back.data.priceMax === 120, "ช่วงราคาสินค้าเปลี่ยนไป"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "${GROUP}" การ์ด 1 ใบ (${CHOICE}) + ภาพ อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);
console.log("  ราคาต่อชิ้นเท่าเดิม:", (back.data.pricing?.cells?.[""] ?? []).join(" / "));
