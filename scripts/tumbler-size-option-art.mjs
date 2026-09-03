#!/usr/bin/env node
/**
 * แก้วสแตนเลส 16/20 ออนซ์ (new-msodn3he-7357) — กลุ่ม "ขนาด" แบบการ์ด + ภาพประกอบ
 *
 *   node scripts/tumbler-size-option-art.mjs            (วาดภาพลง .cache/tumbler-16-20/upload ดูก่อน)
 *   node scripts/tumbler-size-option-art.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * กลุ่ม "รูปทรง" เดิมคือขนาดอยู่แล้ว (ทรงกรวย 16 Oz / ทรง Yeti 20 Oz) และเป็นแกนตารางราคา
 * เลยไม่เพิ่มกลุ่มใหม่ให้ซ้ำซ้อน — เปลี่ยนกลุ่มเดิมเป็นชื่อ "ขนาด" display "cards"
 * คงชื่อตัวเลือกเดิมเป๊ะ (คีย์ pricing.cells อิงชื่อตัวเลือก) แล้วอัปเดต driverLabels
 * "รูปทรง" → "ขนาด" ทั้งใน data.pricing และ priceRates[*].pricing
 *
 * ภาพการ์ด 900×900 สองใบ — วาดเป็นทรงกระบอก 3 มิติให้เหมือนรูปงานจริง:
 * ปาก/ก้นเป็นวงรี · ผิวโลหะไล่แสงโค้ง (ขอบเข้ม-กลางสว่าง) · ฝาใสมีจุกเปิด · เงาใต้แก้ว
 * ลายพิมพ์อยู่ใต้ชั้นไล่แสง จึงโค้งไปตามตัวแก้วเหมือนสกรีนจริง
 *   • ทรงกรวย 16 Oz — ปากกว้างก้นสอบ + หลอด (มีหลอดให้) ป้ายความจุ ≈470 มล.
 *   • ทรง Yeti 20 Oz — ช่วงบนตรง ช่วงล่างสอบ + ฝาใสจุกเปิด ป้ายความจุ ≈590 มล.
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" (หรือ "รูปทรง" เดิม) = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const HEART = await mascotDataUri("heart", 420);
const PEACE = await mascotDataUri("peace", 420);

const PRODUCT_ID = "new-msodn3he-7357";
const VER = "v2";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/tumbler-16-20/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const OLD_GROUP = "รูปทรง";
const CONE = "ทรงกรวย 16 Oz";
const YETI = "ทรง Yeti 20 Oz";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** อัตราส่วน ry/rx ของวงรีปาก-ก้น = มุมมองเอียงลงเล็กน้อยแบบภาพถ่ายสินค้า */
const ELL = 0.17;

const DEFS = `<defs>
    <!-- ผิวสแตนเลสเคลือบขาวทรงกระบอก: ขอบซ้าย-ขวาเป็นเงาเทาอมฟ้า กลางสว่าง = ดูโค้งทึบ -->
    <linearGradient id="steel3d" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#93a6bd"/>
      <stop offset="0.04" stop-color="#b8c7d8"/>
      <stop offset="0.11" stop-color="#dae3ed"/>
      <stop offset="0.22" stop-color="#f4f8fb"/>
      <stop offset="0.34" stop-color="#ffffff"/>
      <stop offset="0.5" stop-color="#ffffff"/>
      <stop offset="0.66" stop-color="#f7fafc"/>
      <stop offset="0.8" stop-color="#e4ebf3"/>
      <stop offset="0.9" stop-color="#cbd7e4"/>
      <stop offset="0.97" stop-color="#a9bacd"/>
      <stop offset="1" stop-color="#8fa3ba"/>
    </linearGradient>
    <!-- ชั้นไล่แสงทับลายพิมพ์ ให้ลายจมโค้งไปกับผิวแก้วเหมือนสกรีนจริง -->
    <linearGradient id="curve" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#1e2f45" stop-opacity="0.42"/>
      <stop offset="0.06" stop-color="#1e2f45" stop-opacity="0.2"/>
      <stop offset="0.14" stop-color="#1e2f45" stop-opacity="0.05"/>
      <stop offset="0.26" stop-color="#ffffff" stop-opacity="0.3"/>
      <stop offset="0.4" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="0.62" stop-color="#1e2f45" stop-opacity="0.03"/>
      <stop offset="0.78" stop-color="#1e2f45" stop-opacity="0.1"/>
      <stop offset="0.9" stop-color="#1e2f45" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#1e2f45" stop-opacity="0.45"/>
    </linearGradient>
    <!-- ไล่แสงชั้นบางที่ทับลายสกรีน (เบากว่า curve เพื่อไม่กลบสีลาย) -->
    <linearGradient id="curveSoft" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#1e2f45" stop-opacity="0.34"/>
      <stop offset="0.08" stop-color="#1e2f45" stop-opacity="0.13"/>
      <stop offset="0.2" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="0.42" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="0.68" stop-color="#1e2f45" stop-opacity="0.02"/>
      <stop offset="0.85" stop-color="#1e2f45" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#1e2f45" stop-opacity="0.36"/>
    </linearGradient>
    <!-- ปากแก้วด้านใน (มองเห็นเป็นวงรีเข้มใต้ฝา) -->
    <linearGradient id="mouth" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#94a3b8"/>
      <stop offset="1" stop-color="#cbd5e1"/>
    </linearGradient>
    <!-- ฝาพลาสติกใส -->
    <linearGradient id="lid" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#cfe0f0" stop-opacity="0.9"/>
      <stop offset="0.26" stop-color="#fbfdff" stop-opacity="0.85"/>
      <stop offset="0.62" stop-color="#f0f7fd" stop-opacity="0.82"/>
      <stop offset="1" stop-color="#c8dbee" stop-opacity="0.9"/>
    </linearGradient>
    <linearGradient id="lidTop" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fdfeff"/>
      <stop offset="1" stop-color="#e8f2fa"/>
    </linearGradient>
    <!-- ฉากหลังฟ้าจาง: ให้ตัวแก้วขาวเด่นออกมาแทนที่จะกลืนพื้นการ์ด -->
    <radialGradient id="backdrop" cx="0.5" cy="0.45" r="0.62">
      <stop offset="0" stop-color="#e3eefa"/>
      <stop offset="0.6" stop-color="#eef4fb"/>
      <stop offset="1" stop-color="#f8fafc" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

/**
 * เส้นรอบตัวแก้ว (มองด้านข้าง): ปากวงรีด้านบน → ข้างซ้าย → ก้นวงรีด้านล่าง → ข้างขวา
 * straight = สัดส่วนความสูงช่วงบนที่ยังตรงก่อนสอบเข้าหาก้น (0 = สอบตั้งแต่ปาก แบบทรงกรวย)
 */
function cupPath(cx, top, tw, bw, bh, straight) {
  const trx = tw / 2;
  const brx = bw / 2;
  const bry = brx * ELL;
  const bot = top + bh;
  const my = top + bh * straight;          // จุดเริ่มสอบ
  const mrx = trx;                          // ช่วงบนกว้างเท่าปาก
  // ด้านข้างโค้งเข้าเล็กน้อย (คุมด้วย quadratic) ให้ไม่เป็นกรวยตรงแข็ง ๆ
  const ctrl = (x1, x2) => x1 + (x2 - x1) * 0.62;
  return `M ${cx - trx} ${top}
    L ${cx - mrx} ${my}
    Q ${cx - ctrl(mrx, brx)} ${my + (bot - my) * 0.55} ${cx - brx} ${bot}
    A ${brx} ${bry} 0 0 0 ${cx + brx} ${bot}
    Q ${cx + ctrl(mrx, brx)} ${my + (bot - my) * 0.55} ${cx + mrx} ${my}
    L ${cx + trx} ${top}
    A ${trx} ${trx * ELL} 0 0 0 ${cx - trx} ${top} Z`;
}

/** ลายสกรีน — มาสคอต + จุดสีประกอบ (วาดก่อนชั้นไล่แสง จึงโค้งไปกับตัวแก้ว) */
function printArt(cx, cy, wAvail, hAvail, mascot) {
  const r = mascot.ratio;
  let ah = hAvail;
  let aw = ah * r;
  if (aw > wAvail) { aw = wAvail; ah = aw / r; }
  return `
    <circle cx="${cx - wAvail * 0.44}" cy="${cy - hAvail * 0.3}" r="7" fill="#ef4444"/>
    <circle cx="${cx + wAvail * 0.42}" cy="${cy - hAvail * 0.4}" r="5.5" fill="#eab308"/>
    <circle cx="${cx + wAvail * 0.4}" cy="${cy + hAvail * 0.4}" r="6.5" fill="#2563eb"/>
    <circle cx="${cx - wAvail * 0.38}" cy="${cy + hAvail * 0.46}" r="4.5" fill="#ef4444"/>
    <image href="${mascot.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>`;
}

/**
 * แก้วสแตนเลสทรงกระบอก 3 มิติ + ฝาใสจุกเปิด (+ หลอดถ้าสั่ง)
 * id = คีย์ clipPath (การ์ดละใบ ห้ามชนกัน)
 */
function tumbler(cx, top, { tw, bw, bh, straight, mascot, id, straw = false }) {
  const trx = tw / 2;
  const try_ = trx * ELL;
  const brx = bw / 2;
  const bot = top + bh;
  const lrx = trx + 9;                 // ฝาครอบกว้างกว่าปากเล็กน้อย
  const lry = lrx * ELL;
  const lidH = 40;
  const lidTop = top - lidH;
  const d = cupPath(cx, top, tw, bw, bh, straight);

  return `
  <!-- ฉากหลังฟ้าจางหลังแก้ว -->
  <ellipse cx="${cx}" cy="${top + bh * 0.48}" rx="${trx * 2.15}" ry="${bh * 0.68}" fill="url(#backdrop)"/>

  <!-- เงาใต้แก้ว (ซ้อนวงรีจาง ๆ แทนฟิลเตอร์เบลอ ให้ผลนิ่งกับทุก renderer) -->
  <ellipse cx="${cx}" cy="${bot + 16}" rx="${brx * 1.5}" ry="${brx * 0.26}" fill="#0f172a" opacity="0.05"/>
  <ellipse cx="${cx}" cy="${bot + 12}" rx="${brx * 1.16}" ry="${brx * 0.19}" fill="#0f172a" opacity="0.07"/>
  <ellipse cx="${cx}" cy="${bot + 7}" rx="${brx * 0.9}" ry="${brx * 0.13}" fill="#0f172a" opacity="0.08"/>

  <!-- ปากแก้วด้านใน โผล่ใต้ฝานิดเดียว (ฝาครอบเกือบมิดเหมือนของจริง) -->
  <ellipse cx="${cx}" cy="${top}" rx="${trx}" ry="${try_}" fill="url(#mouth)"/>

  <!-- ตัวแก้ว: ขาวทึบ → เนื้อโลหะไล่โค้ง → ลายสกรีน (คลิปในทรง) → ชั้นไล่แสง → เส้นขอบ -->
  <clipPath id="cup-${id}"><path d="${d}"/></clipPath>
  <path d="${d}" fill="#ffffff"/>
  <path d="${d}" fill="url(#steel3d)"/>
  <g clip-path="url(#cup-${id})">
    <!-- ชั้นแสงเงาของผิวโลหะ วาด "ใต้ลาย" — ลายสกรีนจึงทึบเหมือนพิมพ์บนผิวขาว ไม่ใช่แก้วใส -->
    <path d="${d}" fill="url(#curve)"/>
    <!-- ไฮไลต์แถบยาวด้านซ้าย = แสงสะท้อนบนผิวโค้ง -->
    <path d="M ${cx - trx * 0.62} ${top + 22} L ${cx - brx * 0.56} ${bot - 26}
             L ${cx - brx * 0.36} ${bot - 26} L ${cx - trx * 0.44} ${top + 22} Z"
      fill="#ffffff" opacity="0.8"/>
    ${printArt(cx, top + bh * (straight ? 0.5 : 0.52), (brx + trx) * 0.86, bh * 0.4, mascot)}
    <!-- ไล่แสงบางอีกชั้นทับลาย = ลายจมโค้งไปกับตัวแก้ว -->
    <path d="${d}" fill="url(#curveSoft)"/>
    <!-- ขอบฐาน: วงแหวนก้นแก้วแบบของจริง -->
    <ellipse cx="${cx}" cy="${bot - brx * 0.26}" rx="${brx}" ry="${brx * ELL}" fill="none" stroke="#8ba0b8" stroke-width="2.5" opacity="0.55"/>
    <ellipse cx="${cx}" cy="${bot - brx * 0.1}" rx="${brx}" ry="${brx * ELL}" fill="none" stroke="#8ba0b8" stroke-width="2" opacity="0.3"/>
  </g>
  <path d="${d}" fill="none" stroke="#8ea1b8" stroke-width="3" stroke-linejoin="round"/>

  ${straw ? `
  <!-- หลอด: เอียงออกจากรูฝา ท่อนบนสว่างกว่าท่อนล่าง -->
  <g transform="rotate(13 ${cx + 26} ${lidTop + 8})">
    <rect x="${cx + 14}" y="${lidTop - 132}" width="25" height="150" rx="12.5" fill="#a5dcf7" stroke="#7cc6ea" stroke-width="2.5"/>
    <rect x="${cx + 19}" y="${lidTop - 124}" width="8" height="134" rx="4" fill="#e6f6fe" opacity="0.9"/>
  </g>` : ""}

  <!-- ฝาใส: ผนังฝา + ขอบล่าง + หน้าฝาด้านบน + จุกเปิด -->
  <path d="M ${cx - lrx} ${lidTop} L ${cx - lrx} ${lidTop + lidH}
           A ${lrx} ${lry} 0 0 0 ${cx + lrx} ${lidTop + lidH}
           L ${cx + lrx} ${lidTop}
           A ${lrx} ${lry} 0 0 0 ${cx - lrx} ${lidTop} Z" fill="url(#lid)"/>
  <path d="M ${cx - lrx} ${lidTop + lidH} A ${lrx} ${lry} 0 0 0 ${cx + lrx} ${lidTop + lidH}"
    fill="none" stroke="#9dc0dd" stroke-width="2.5"/>
  <ellipse cx="${cx}" cy="${lidTop}" rx="${lrx}" ry="${lry}" fill="url(#lidTop)" stroke="#a9c8e2" stroke-width="2.5"/>
  <ellipse cx="${cx}" cy="${lidTop}" rx="${lrx - 12}" ry="${lry - 4}" fill="#eef7ff" opacity="0.85"/>
  ${straw
    ? `<ellipse cx="${cx + 26}" cy="${lidTop + 1}" rx="17" ry="${Math.max(5, lry * 0.42)}" fill="#8fb6d4" opacity="0.75"/>`
    : `<g>
         <rect x="${cx - 6}" y="${lidTop - 20}" width="58" height="17" rx="8" fill="#ffffff" stroke="#c2d6e6" stroke-width="2.5"/>
         <ellipse cx="${cx + 6}" cy="${lidTop + 2}" rx="30" ry="${Math.max(6, lry * 0.5)}" fill="#b9d2e6" opacity="0.6"/>
       </g>`}
  <line x1="${cx - lrx + 12}" y1="${lidTop + 9}" x2="${cx - lrx + 12}" y2="${lidTop + lidH - 6}"
    stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity="0.75"/>`;
}

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${DEFS}
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, s) => `
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${s}</text>`;

const foot = (lines) => lines
  .map((t, i) => `<text x="${W / 2}" y="${H - 72 + i * 32}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${t}</text>`)
  .join("");

/** ป้ายความจุด้านข้างแก้ว */
const capBadge = (cx, cy, big, small) => `
  <g transform="translate(${cx} ${cy})">
    <rect x="-118" y="-62" width="236" height="124" rx="18" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
    <text x="0" y="-14" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${OK}">${big}</text>
    <text x="0" y="22" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${small[0]}</text>
    <text x="0" y="50" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${small[1] ?? ""}</text>
  </g>`;

const FOOT_LINES = [
  "สแตนเลสเก็บอุณหภูมิ พิมพ์ลายตามสั่งงานทรานเฟอร์ความร้อน",
  "ลายในภาพเป็นตัวอย่างตำแหน่งพิมพ์ · สกรีนเต็มใบไม่ได้",
];

// ── การ์ด 1 — ทรงกรวย 16 Oz (มีหลอด) ────────────────────────────────
const coneArt = () => frame(`
  ${title("ทรงกรวย 16 ออนซ์", "ปากกว้างก้นสอบ · มีหลอดให้พร้อมฝา")}
  ${tumbler(352, 300, { tw: 226, bw: 140, bh: 404, straight: 0, mascot: HEART, id: "cone", straw: true })}
  ${capBadge(676, 468, "ความจุ 16 ออนซ์", ["≈ 470 มล.", "มีหลอดให้"])}
  ${foot(FOOT_LINES)}`);

// ── การ์ด 2 — ทรง Yeti 20 Oz ────────────────────────────────────────
const yetiArt = () => frame(`
  ${title("ทรง Yeti 20 ออนซ์", "ทรงเยติสุดฮิต ช่วงบนตรง ช่วงล่างสอบ · ฝาใสกันหก")}
  ${tumbler(352, 292, { tw: 232, bw: 168, bh: 428, straight: 0.44, mascot: PEACE, id: "yeti" })}
  ${capBadge(680, 468, "ความจุ 20 ออนซ์", ["≈ 590 มล.", "เก็บอุณหภูมิได้ดี"])}
  ${foot(FOOT_LINES)}`);

const FILES = [
  { file: `size-cone-16oz-${VER}.jpg`, svg: coneArt(), choice: CONE },
  { file: `size-yeti-20oz-${VER}.jpg`, svg: yetiArt(), choice: YETI },
];
const bufs = {};
for (const f of FILES) {
  const buf = await sharp(Buffer.from(f.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  bufs[f.file] = buf;
  writeFileSync(`${OUT}/${f.file}`, buf);
  console.log(`🖼  ${OUT}/${f.file}  ${Math.round(buf.length / 1024)} KB`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const urls = {};
for (const f of FILES) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, bufs[f.file], { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  urls[f.choice] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", urls[f.choice]);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

// กลุ่ม "ขนาด" — ชื่อตัวเลือกต้องตรงเดิมเป๊ะ (คีย์ pricing.cells อิงชื่อนี้)
const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  note: "ราคาเท่ากันทั้ง 2 ขนาด — ดูตารางราคาตามจำนวนด้านบน",
  choices: [
    {
      name: CONE,
      popular: true,
      desc: "ปากกว้างก้นสอบ ความจุ 16 ออนซ์ (≈470 มล.) · มีหลอดให้",
      imageSrc: urls[CONE],
    },
    {
      name: YETI,
      desc: "ทรงเยติสุดฮิต ความจุ 20 ออนซ์ (≈590 มล.) · ฝาใสกันหก",
      imageSrc: urls[YETI],
    },
  ],
};

// รันซ้ำได้: แทนที่กลุ่ม "รูปทรง" เดิม (หรือ "ขนาด" ถ้าเคยรันแล้ว) ตรงตำแหน่งเดิม
const at = options.findIndex((o) => o.label === SIZE_GROUP || o.label === OLD_GROUP);
if (at < 0) { console.error(`ไม่เจอกลุ่ม "${OLD_GROUP}"/"${SIZE_GROUP}" — หยุดก่อน อย่าเดาตำแหน่ง`); process.exit(1); }
options[at] = sizeGroup;
data.options = options;

// แกนตารางราคาอิงชื่อกลุ่ม — เปลี่ยน "รูปทรง" → "ขนาด" ทุกที่ (pricing หลัก + priceRates)
const renameDriver = (pricing) => {
  if (!pricing?.driverLabels) return;
  pricing.driverLabels = pricing.driverLabels.map((l) => (l === OLD_GROUP ? SIZE_GROUP : l));
};
renameDriver(data.pricing);
for (const r of data.priceRates ?? []) renameDriver(r.pricing);

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options;
const gSize = got.find((o) => o.label === SIZE_GROUP);
const cells = back.data.pricing?.cells ?? {};
const fails = [
  [got.filter((o) => o.label === SIZE_GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [!got.some((o) => o.label === OLD_GROUP), `กลุ่ม "${OLD_GROUP}" เดิมยังค้างอยู่`],
  [gSize?.display === "cards", "display ไม่ใช่ cards"],
  [gSize?.choices?.[0]?.name === CONE && gSize?.choices?.[0]?.imageSrc === urls[CONE], "การ์ด 16 Oz ไม่ตรง"],
  [gSize?.choices?.[1]?.name === YETI && gSize?.choices?.[1]?.imageSrc === urls[YETI], "การ์ด 20 Oz ไม่ตรง"],
  [gSize?.choices?.every((c) => c.imageSrc?.includes(`-${VER}.jpg`)), `ภาพยังไม่ใช่รุ่น ${VER} (เบราว์เซอร์จะเห็นของเก่า)`],
  [back.data.pricing?.driverLabels?.includes(SIZE_GROUP) && !back.data.pricing?.driverLabels?.includes(OLD_GROUP), "driverLabels หลักยังไม่เปลี่ยน"],
  [(back.data.priceRates ?? []).every((r) => r.pricing?.driverLabels?.includes(SIZE_GROUP) && !r.pricing?.driverLabels?.includes(OLD_GROUP)), "driverLabels ใน priceRates ยังไม่เปลี่ยน"],
  [!!cells[CONE] && !!cells[YETI], "คีย์ pricing.cells หลุด (ชื่อตัวเลือกไม่ตรง)"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "${SIZE_GROUP}" (การ์ด 2 ใบ+ภาพ ${VER}) + driverLabels ย้ายจาก "${OLD_GROUP}" ครบทั้ง pricing/priceRates · savedAt =`, back.data.savedAt);
