#!/usr/bin/env node
/**
 * เตรียมภาพของสินค้า "Rotating Stand" (ชุดกรอบอะคริลิค + ตัวสแตนดี้แขวนหมุนในกรอบ)
 * ตารางราคา 350/320/310/300 ของหน้า iduckyofficial-pricelists.com/acrylicrotatingstand
 *
 *   node scripts/rotating-stand-frame-art.mjs [--out=<dir>]
 *
 * ⚠️ คนละสินค้ากับ "สแตนดี้อะคริลิค หมุนได้" (ตาราง 170/95/…) — ดู scripts/standee-rotating-art.mjs
 *
 * ได้ 2 ชุด แล้วให้ scripts/add-rotating-stand-frame.ts --upload อัปขึ้น Supabase Storage:
 *   gallery-1..6    ภาพงานจริงจากหน้าเว็บ (ชุดกรอบ + ตัวแขวนหมุน · ภาพแยกชิ้นเห็นกรอบกับตัว)
 *   sizeadd-0..5    ภาพเทียบ "เพิ่มขนาดอะคริลิค" 0-5 ซม. (เส้นประ = ขนาดมาตรฐาน) + ราคาที่บวก
 *   acrylic-clear | acrylic-special   ชนิดอะคริลิค (วาดเองทั้งคู่) · color-chart ตารางสีอะคริลิคของร้าน
 * ⚠️ อัปทับ "ชื่อไฟล์เดิม" ไม่ได้ — CDN/Next แคชของเก่าไว้ ต้องตั้งชื่อไฟล์ใหม่เสมอ
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
// ตัวสแตนดี้ที่แขวนหมุนอยู่กลางกรอบ = มาสคอตเป็ด iDucky ของฝ่าย Content (น่ารักกว่าวาดเอง)
import { mascotDataUri } from "./iducky-assets.mjs";

let MASCOT = null;
const loadMascot = async () => (MASCOT ??= await mascotDataUri("heart", 560));
await loadMascot();

/** วางมาสคอตให้พอดีกรอบ (w × h) โดยคงสัดส่วน */
const mascotArt = (cx, cy, w, h) => {
  const box = Math.min(w, h);
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>`;
};

const OUT = (
  (process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/rot/upload-frame"
).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 700;
const H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const LINE = "#94a3b8";
const CYAN = "#0891b2";
const GLASS = "rgba(56,189,248,0.20)";
const GLASS_EDGE = "#38bdf8";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="72" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="112" font-family="${TH}" font-size="25" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const dimH = (y, x1, x2, label) => `
  <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x1}" y1="${y - 12}" x2="${x1}" y2="${y + 12}" stroke="${CYAN}" stroke-width="3"/>
  <line x1="${x2}" y1="${y - 12}" x2="${x2}" y2="${y + 12}" stroke="${CYAN}" stroke-width="3"/>
  <text x="${(x1 + x2) / 2}" y="${y + 42}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${CYAN}">${label}</text>`;

/**
 * ชุด Rotating Stand — กรอบอะคริลิคทรงตั้ง + ตัวสแตนดี้แขวนบนแกนกลางในกรอบ + ฐานเสียบ
 * addCm = เพิ่มขนาดจากมาตรฐานกี่ ซม. (สเกลภาพ 26px ต่อ ซม.)
 */
function frameSet(addCm) {
  const PX = 16;
  const baseW = 190; // กรอบขนาดมาตรฐานในภาพ
  const w = baseW + addCm * PX;
  const h = w * 1.3;
  const cx = 350;
  const bottom = 520;
  const top = bottom - h;
  const stdW = baseW;
  const stdH = stdW * 1.3;
  const fee = addCm * 20;
  const inner = 22 + addCm;
  return frame(`
    ${title(
      addCm === 0 ? "ขนาดมาตรฐาน" : `เพิ่มขนาด +${addCm} ซม.`,
      addCm === 0 ? "ราคาตามตาราง ไม่บวกเพิ่ม" : `บวกเพิ่ม ซม.ละ 20 บาท = +${fee} บาท/ชิ้น`
    )}
    ${addCm > 0 ? `<rect x="${cx - stdW / 2}" y="${bottom - stdH}" width="${stdW}" height="${stdH}" rx="14" fill="none" stroke="#e2e8f0" stroke-width="3" stroke-dasharray="8 8"/>` : ""}
    <!-- กรอบอะคริลิค (สกรีน 2 ด้าน) -->
    <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="16" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
    <rect x="${cx - w / 2 + inner}" y="${top + inner}" width="${w - inner * 2}" height="${h - inner * 2}" rx="${(w - inner * 2) / 2}"
      fill="#ffffff" stroke="#bae6fd" stroke-width="3"/>
    <!-- แกนแขวนกลางกรอบ + ตัวสแตนดี้หมุน -->
    <line x1="${cx}" y1="${top + inner + 6}" x2="${cx}" y2="${top + h * 0.34}" stroke="${LINE}" stroke-width="4"/>
    <rect x="${cx - 34}" y="${top + h * 0.3}" width="68" height="16" rx="6" fill="#e2e8f0" stroke="${LINE}" stroke-width="2"/>
    ${mascotArt(cx, top + h * 0.58, w * 0.54, h * 0.38)}
    <line x1="${cx}" y1="${top + h * 0.72}" x2="${cx}" y2="${bottom - inner - 6}" stroke="${LINE}" stroke-width="4"/>
    <!-- ฐานสกรีน 3-4 ซม. -->
    <path d="M${cx - 92} ${bottom + 4} v16 a92 23 0 0 0 184 0 v-16 z" fill="rgba(148,197,255,0.28)" stroke="#7dd3fc" stroke-width="3"/>
    <ellipse cx="${cx}" cy="${bottom + 4}" rx="92" ry="23" fill="rgba(148,197,255,0.28)" stroke="#7dd3fc" stroke-width="3"/>
    ${dimH(bottom + 72, cx - w / 2, cx + w / 2, addCm === 0 ? "ขนาดมาตรฐาน" : `+${addCm} ซม. จากมาตรฐาน`)}
    <text x="${W / 2}" y="${H - 26}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">กรอบ + ตัวสแตนดี้ สกรีน 2 ด้าน · ฐานสกรีน 3-4 ซม.</text>`);
}

const acrylicClear = frame(`
  ${title("อะคริลิคใส (มาตรฐาน)", "หนาประมาณ 3 มม. · ราคาตามตาราง")}
  <rect x="215" y="170" width="270" height="378" rx="16" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
  <rect x="245" y="200" width="210" height="318" rx="105" fill="#ffffff" stroke="#bae6fd" stroke-width="3"/>
  <text x="${W / 2}" y="360" font-family="${TH}" font-size="30" text-anchor="middle" fill="${LINE}">ใส มองทะลุ</text>
  <text x="${W / 2}" y="${H - 60}" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">พิมพ์ระบบ UV สกรีน 2 ด้าน ทั้งกรอบและตัวสแตนดี้</text>`);

/**
 * ภาพประกอบตัวเลือก "อะคริลิคพิเศษ (สี/กลิตเตอร์/โฮโลแกรม)"
 * วาดเองให้เข้าชุดกับ acrylic-clear / sizeadd-* (ของเดิมเป็นภาพถ่ายจากเว็บตารางราคา
 * ที่ติดลายน้ำของหน้านั้นมาด้วย และย่อเป็นชิปเล็กแล้วดูไม่ออกว่าคืออะไร)
 * โชว์กรอบ Rotating Stand 3 ใบ = เนื้ออะคริลิค 3 แบบที่เลือกได้
 */
const specialKinds = [
  {
    key: "สี",
    note: "ทึบทั้งแผ่น",
    fill: "rgba(244,114,182,0.34)",
    edge: "#f472b6",
    label: "#be185d",
    deco: "",
  },
  {
    key: "กลิตเตอร์",
    note: "มีเกล็ดวิบวับ",
    fill: "rgba(167,139,250,0.28)",
    edge: "#a78bfa",
    label: "#6d28d9",
    deco: "glitter",
  },
  {
    key: "โฮโลแกรม",
    note: "เหลือบรุ้ง",
    fill: "url(#holo)",
    edge: "#22d3ee",
    label: "#0e7490",
    deco: "",
  },
];

/** เกล็ดกลิตเตอร์แบบสุ่มค้างที่ (LCG) — รันกี่ครั้งก็ได้ภาพเดิม */
function glitterDots(x, y, w, h) {
  let seed = 20260820;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let out = "";
  for (let i = 0; i < 46; i++) {
    const cx = x + rnd() * w;
    const cy = y + rnd() * h;
    const r = 1.6 + rnd() * 2.6;
    out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="#ffffff" opacity="${(0.55 + rnd() * 0.45).toFixed(2)}"/>`;
  }
  return out;
}

/** กรอบ Rotating Stand ใบย่อ 1 ใบ (ใช้โชว์เนื้ออะคริลิคแต่ละแบบ) */
function miniFrame(cx, bottom, w, kind) {
  const h = w * 1.3;
  const top = bottom - h;
  const inner = 16;
  return `
    <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="14" fill="${kind.fill}" stroke="${kind.edge}" stroke-width="4"/>
    ${kind.deco === "glitter" ? glitterDots(cx - w / 2, top, w, h) : ""}
    <rect x="${cx - w / 2 + inner}" y="${top + inner}" width="${w - inner * 2}" height="${h - inner * 2}" rx="${(w - inner * 2) / 2}"
      fill="#ffffff" opacity="0.82" stroke="${kind.edge}" stroke-width="2"/>
    <line x1="${cx}" y1="${top + inner + 4}" x2="${cx}" y2="${top + h * 0.34}" stroke="${LINE}" stroke-width="3"/>
    <rect x="${cx - 24}" y="${top + h * 0.3}" width="48" height="12" rx="5" fill="#e2e8f0" stroke="${LINE}" stroke-width="2"/>
    ${mascotArt(cx, top + h * 0.58, w * 0.5, h * 0.36)}
    <line x1="${cx}" y1="${top + h * 0.72}" x2="${cx}" y2="${bottom - inner - 4}" stroke="${LINE}" stroke-width="3"/>
    <path d="M${cx - 62} ${bottom + 3} v11 a62 16 0 0 0 124 0 v-11 z" fill="${kind.fill}" stroke="${kind.edge}" stroke-width="3"/>
    <ellipse cx="${cx}" cy="${bottom + 3}" rx="62" ry="16" fill="${kind.fill}" stroke="${kind.edge}" stroke-width="3"/>
    <text x="${cx}" y="${bottom + 78}" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${kind.label}">${kind.key}</text>
    <text x="${cx}" y="${bottom + 110}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${kind.note}</text>`;
}

const acrylicSpecial = frame(`
  <defs>
    <linearGradient id="holo" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#f0abfc" stop-opacity="0.55"/>
      <stop offset="0.3" stop-color="#a5b4fc" stop-opacity="0.5"/>
      <stop offset="0.55" stop-color="#67e8f9" stop-opacity="0.5"/>
      <stop offset="0.78" stop-color="#86efac" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#fde68a" stop-opacity="0.6"/>
    </linearGradient>
  </defs>
  ${title("อะคริลิคพิเศษ", "สี · กลิตเตอร์ · โฮโลแกรม · หนาประมาณ 2.5-3 มม.")}
  ${specialKinds.map((k, i) => miniFrame(160 + i * 190, 452, 132, k)).join("")}
  <text x="${W / 2}" y="${H - 62}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">บวกราคาเพิ่มตามขนาด — เลือกสีที่ต้องการได้ในหน้าสั่งซื้อ</text>
  <text x="${W / 2}" y="${H - 30}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ทางร้านตีราคาให้ก่อนเริ่มผลิต</text>`);

async function render(name, svg) {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`🎨 ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
}

// ภาพงานจริงจากหน้าเว็บตารางราคา (บล็อกบนสุดของหน้า = ชุดกรอบ)
const PHOTOS = {
  "gallery-1": "959b83_fbd4a99790c549f4928fe83b4b43b243~mv2",
  "gallery-2": "959b83_44cd87b1ec6147668ef4906fad0e165df003",
  "gallery-3": "959b83_998c990f7f9d40c18074d856b3b7fd1d~mv2",
  "gallery-4": "959b83_33d72717017e43269363fac33cd8ced3~mv2",
  "gallery-5": "959b83_28f1892b61a842d4875bd40ab12ffaf0~mv2",
  "gallery-6": "959b83_15dd04a582434f598b56bcef2abed3fd~mv2",
  "color-chart": "959b83_ece384645d784b25ab624c67f2cbd4d8~mv2",
};

async function photos() {
  for (const [name, id] of Object.entries(PHOTOS)) {
    const url = `https://static.wixstatic.com/media/${id}.jpg/v1/fill/w_1200,h_1200,al_c,q_90/file.jpg`;
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const out = await sharp(buf)
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    writeFileSync(`${OUT}/${name}.jpg`, out);
    console.log(`📷 ${name}.jpg (${Math.round(out.length / 1024)} KB)`);
  }
}

await photos();
for (let cm = 0; cm <= 5; cm++) await render(`sizeadd-${cm}`, frameSet(cm));
await render("acrylic-clear", acrylicClear);
await render("acrylic-special", acrylicSpecial);
console.log(`\n✅ ไฟล์ทั้งหมดอยู่ที่ ${OUT}`);
