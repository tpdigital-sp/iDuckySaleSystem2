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
 *   acrylic-clear | acrylic-special   ชนิดอะคริลิค · color-chart ตารางสีอะคริลิคของร้าน
 * ⚠️ อัปทับ "ชื่อไฟล์เดิม" ไม่ได้ — CDN/Next แคชของเก่าไว้ ต้องตั้งชื่อไฟล์ใหม่เสมอ
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

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
    <g>
      <ellipse cx="${cx}" cy="${top + h * 0.58}" rx="${w * 0.27}" ry="${h * 0.19}" fill="#fde68a" stroke="#f59e0b" stroke-width="4"/>
      <circle cx="${cx - w * 0.09}" cy="${top + h * 0.54}" r="7" fill="#0f172a"/>
      <circle cx="${cx + w * 0.09}" cy="${top + h * 0.54}" r="7" fill="#0f172a"/>
      <path d="M${cx - w * 0.07} ${top + h * 0.63} q${w * 0.07} ${h * 0.05} ${w * 0.14} 0" stroke="#ea580c" stroke-width="6" fill="none" stroke-linecap="round"/>
    </g>
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
  "acrylic-special": "959b83_30c3f7908505422e8fae6ee06e6c9dd9~mv2",
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
console.log(`\n✅ ไฟล์ทั้งหมดอยู่ที่ ${OUT}`);
