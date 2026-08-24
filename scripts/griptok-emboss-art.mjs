#!/usr/bin/env node
/**
 * ภาพแกลเลอรี + ภาพประกอบตัวเลือกของ "GRIPTOK อะคริลิค ปั๊มนูน" (griptok-emboss)
 *
 *   node scripts/griptok-emboss-art.mjs [--out=<dir>]
 *
 * ได้ไฟล์ลง .cache/griptok-emboss/upload — ที่มาทั้งหมดคือบล็อก
 * "GRIPTOK อะคริลิค ปั๊มนูน UV Printing" หน้า https://www.iduckyofficial-pricelists.com/griptok
 *
 * 1) รูปงานจริง (แถบตัวอย่างข้างตารางราคา) → แกลเลอรี 5 ใบ ใช้ตรง ๆ ไม่ใส่กรอบ
 * 2) ภาพหน้าปกวิดีโอ 4 ใบใต้ Add On (ร้านเขียนกำกับเอง: ใส่ตัวน้อยเขย่าเพิ่ม / Fimo ดาว /
 *    Fimo ไข่มุก / Fimo เส้น) → การ์ดตัวเลือก Add On
 * 3) การ์ดสเกลขนาด 5-10 ซม. ประกอบเอง (กรอบเส้นประ + ไม้บรรทัด สไตล์เดียวกับ griptok-magsafe)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ครั้งหน้าขึ้น v2
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/griptok-emboss/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900; // จัตุรัส — แกลเลอรีหน้าสินค้าครอปเป็นจัตุรัส (object-cover)
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const LINE = "#cbd5e1";
const ACCENT = "#0ea5e9";
const PAPER = "#f8fafc";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="46" font-weight="700" text-anchor="middle" fill="${INK}">${esc(t)}</text>
  ${sub ? `<text x="${W / 2}" y="134" font-family="${TH}" font-size="26" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>` : ""}`;

const foot = (lines) =>
  lines
    .map((l, i) => `<text x="${W / 2}" y="${800 + i * 34}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${esc(l)}</text>`)
    .join("");

const save = (name, buf) => {
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`   ${name}.jpg  ${Math.round(buf.length / 1024)} KB`);
};
const saveSvg = async (name, svg) =>
  save(name, await sharp(Buffer.from(svg)).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer());

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } });
  if (!res.ok) throw new Error(`โหลด ${url} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** wix id → ภาพต้นฉบับกว้างสุด 1200 (รูปแนวตั้งหน้าปกวิดีโอจะได้ ~506x900) */
const wix = (id) => `https://static.wixstatic.com/media/959b83_${id}.jpg/v1/fit/w_1200,h_1200/x.jpg`;

/** id เดิมบนเว็บ กำกับไว้ให้ตรวจย้อนได้ */
const SRC = {
  // แถบตัวอย่างงานจริงข้างตารางราคา (แนวนอน 900x675)
  photoPearlPink: "b717c88a2f6e4174ae4eabb2b1111d31~mv2", // กระเปาะไข่มุก ลายผมชมพู
  photoStarBoy: "120115dbb82743ff93c02a3ca1fb0735~mv2", // ดาวพาสเทลบนลายเด็กผมส้ม
  photoStarDog: "ac97a7a8efaa4bd2b59ab0b5f039b458~mv2", // ดาวพาสเทล ลายหมา
  photoPearlLion: "43cd3b0c5acb498b9a68947c4d8096c3~mv2", // ไข่มุก ลายสิงโต
  photoSideAngle: "d2cde06709ad452d94bbcd0d36c20795~mv2", // มุมเฉียงเห็นความนูนของกระเปาะ
  // หน้าปกวิดีโอใต้ Add On — ร้านเขียนคำกำกับใต้ภาพบนหน้าเว็บเอง (แนวตั้ง ~506x900)
  vidCharm: "784d42f73427413aa52e6b04a7dd9871f003", // "ใส่ตัวน้อยเขย่าเพิ่ม" (ในภาพเขียน ปั๊มนูน + เพิ่มตัวเขย่า)
  vidFimoStar: "abd8f21c85bd4db6a9d54c0427e8ad64f003", // "Fimo ดาว"
  vidFimoPearl: "45a666ecf89b4235bd4bef1d41dfcc96f003", // "Fimo ไข่มุก"
  vidFimoStrand: "66a8d8dc002946c082c6aeb6864f1af7f003", // "Fimo เส้น"
};

const cache = new Map();
const src = async (key) => {
  if (!cache.has(key)) cache.set(key, await get(wix(SRC[key])));
  return cache.get(key);
};

/** การ์ด "รูปงานจริง 1 ใบ + หัวข้อ + หมายเหตุ" */
async function photoCard(name, photo, { head, sub, notes }) {
  const meta = await sharp(photo).metadata();
  const svg = frame(`${title(head, sub)}${foot(notes)}`);
  const top = 170;
  const boxH = 600;
  const buf = await sharp(Buffer.from(svg))
    .composite([{ input: photo, left: Math.round((W - meta.width) / 2), top: top + Math.round((boxH - meta.height) / 2) }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  save(name, buf);
}

console.log(`🎨 ภาพ GRIPTOK อะคริลิค ปั๊มนูน → ${OUT}`);

/* ── 1. แกลเลอรี — รูปงานจริงใช้ตรง ๆ ─────────────────────────────── */

const GALLERY = [
  ["gallery-1-v1", "photoPearlPink"],
  ["gallery-2-v1", "photoStarBoy"],
  ["gallery-3-v1", "photoStarDog"],
  ["gallery-4-v1", "photoPearlLion"],
  ["gallery-5-v1", "photoSideAngle"],
];
for (const [name, key] of GALLERY) {
  save(name, await sharp(await src(key)).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer());
}

/* ── 2. การ์ด Add On จากหน้าปกวิดีโอของร้าน — v2 ภาพเต็มใบ (ผู้ใช้สั่ง 24 ส.ค. 69) ──
 * พื้นหลัง = รูปเดียวกันเบลอถมเต็มการ์ด · รูปชัดวางกลางสูง ~86% ของการ์ด
 * ข้อความทับบนสคริมมืดบน-ล่าง อ่านออกบนรูปทุกโทน */

const scrim = (extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0f172a" stop-opacity="0.62"/><stop offset="1" stop-color="#0f172a" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0f172a" stop-opacity="0"/><stop offset="1" stop-color="#0f172a" stop-opacity="0.66"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${W}" height="210" fill="url(#top)"/>
  <rect x="0" y="${H - 170}" width="${W}" height="170" fill="url(#bot)"/>
  ${extra}
</svg>`;

const overlayText = (head, sub, note) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="50" font-weight="700" text-anchor="middle" fill="#ffffff">${esc(head)}</text>
  ${sub ? `<text x="${W / 2}" y="136" font-family="${TH}" font-size="27" text-anchor="middle" fill="#e2e8f0">${esc(sub)}</text>` : ""}
  ${note ? `<text x="${W / 2}" y="${H - 42}" font-family="${TH}" font-size="23" text-anchor="middle" fill="#e2e8f0">${esc(note)}</text>` : ""}`;

/** การ์ดภาพเต็มใบ: ครอปรูปเดียวถมเต็มการ์ด (ไม่มีพื้นหลังซ้อน — ผู้ใช้สั่ง 24 ส.ค. 69) + ข้อความบนสคริม */
async function fullCard(name, key, { head, sub, note }) {
  const orig = await src(key);
  const bg = await sharp(orig).resize(W, H, { fit: "cover", position: "attention" }).toBuffer();
  const buf = await sharp(bg)
    .composite([{ input: Buffer.from(scrim(overlayText(head, sub, note))), left: 0, top: 0 }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  save(name, buf);
}

await fullCard("addon-mini-v3", "vidCharm", {
  head: "เพิ่มอะคริลิคตัวน้อย",
  sub: "ขนาด 1.5-2 ซม. หนา 1.5 mm ใส่ในกระเปาะเขย่าได้ · +15 บาท/ตัว",
  note: "ภาพจากคลิป “ใส่ตัวน้อยเขย่าเพิ่ม” ของร้าน",
});
await fullCard("fimo-star-v3", "vidFimoStar", {
  head: "Fimo ดาว",
  sub: "ตัวน้อยเขย่าในกระเปาะ (ฟรี)",
  note: "Fimo กำหนดปริมาณไม่ได้ · ภาพจากคลิปของร้าน",
});
await fullCard("fimo-pearl-v3", "vidFimoPearl", {
  head: "Fimo ไข่มุก",
  sub: "ตัวน้อยเขย่าในกระเปาะ (ฟรี)",
  note: "Fimo กำหนดปริมาณไม่ได้ · ภาพจากคลิปของร้าน",
});
await fullCard("fimo-strand-v3", "vidFimoStrand", {
  head: "Fimo เส้น",
  sub: "ตัวน้อยเขย่าในกระเปาะ (ฟรี)",
  note: "Fimo กำหนดปริมาณไม่ได้ · ภาพจากคลิปของร้าน",
});

/** ใบรวม 3 แบบ v2 — ภาพเต็มใบ 3 คอลัมน์ชิดกัน + ป้ายชื่อคาดใต้ภาพ */
{
  const keys = ["vidFimoStar", "vidFimoPearl", "vidFimoStrand"];
  const labels = ["ดาว", "ไข่มุก", "เส้น"];
  const colW = W / 3; // 300
  const shots = await Promise.all(
    keys.map(async (k) => sharp(await src(k)).resize(Math.ceil(colW), H, { fit: "cover", position: "attention" }).toBuffer())
  );
  const captions = labels
    .map((l, i) => {
      const cx = colW * i + colW / 2;
      return `<rect x="${colW * i + colW / 2 - 84}" y="${H - 128}" width="168" height="52" rx="26" fill="#0f172a" fill-opacity="0.55"/>
        <text x="${cx}" y="${H - 92}" font-family="${TH}" font-size="29" font-weight="700" text-anchor="middle" fill="#ffffff">${esc(l)}</text>`;
    })
    .join("");
  const seams = [1, 2].map((i) => `<line x1="${colW * i}" y1="0" x2="${colW * i}" y2="${H}" stroke="#ffffff" stroke-width="4"/>`).join("");
  const overlay = scrim(`${seams}${overlayText("Fimo ตัวน้อยเขย่า (ฟรี)", "มี 3 แบบ — เลือกได้ หรือให้ร้านคละให้", "Fimo กำหนดปริมาณไม่ได้ · ภาพจากคลิปของร้าน")}${captions}`);
  const buf = await sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
    .composite([
      ...shots.map((input, i) => ({ input, left: Math.round(colW * i), top: 0 })),
      { input: Buffer.from(overlay), left: 0, top: 0 },
    ])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  save("fimo-mix-v2", buf);
}

/* ── 3. การ์ดสเกลขนาด 5-10 ซม. — v2 ออกแบบใหม่ (ผู้ใช้สั่ง 24 ส.ค. 69) ──
 * เทียบขนาดจริงบน "หลังมือถือ" ที่วาดตามสเกลจริง (7.15×14.67 ซม. ขนาดมือถือมาตรฐาน)
 * ลูกค้าเห็นทันทีว่า Griptok ขนาดที่เลือกใหญ่แค่ไหนเมื่อติดหลังเครื่อง
 * + แถบจุดบอกตำแหน่งขนาดในไลน์ 5-10 · เหรียญรูปงานจริงมุมขวาบน · ไม้บรรทัดใต้เครื่อง */

/** px ต่อ 1 ซม. ของการ์ดสเกล v2 — มือถือสูง 14.67 ซม. ต้องไม่ล้นการ์ด */
const PPC = 38;
const PH_W = Math.round(7.15 * PPC); // 272
const PH_H = Math.round(14.67 * PPC); // 558
const PH_CX = 450;
const PH_Y = 176;

/** หลังมือถือตามสเกลจริง (มีโมดูลกล้องเหมือนรูปถ่ายงานจริง) */
const phoneBack = () => {
  const x = PH_CX - PH_W / 2;
  return `
    <rect x="${x}" y="${PH_Y}" width="${PH_W}" height="${PH_H}" rx="44" fill="#eef2f7" stroke="#94a3b8" stroke-width="3"/>
    <rect x="${x + 16}" y="${PH_Y + 16}" width="76" height="76" rx="22" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="2"/>
    <circle cx="${x + 40}" cy="${PH_Y + 42}" r="12" fill="#cbd5e1"/>
    <circle cx="${x + 68}" cy="${PH_Y + 70}" r="12" fill="#cbd5e1"/>
    <text x="${PH_CX}" y="${PH_Y + PH_H - 22}" font-family="${TH}" font-size="19" text-anchor="middle" fill="#94a3b8">มือถือมาตรฐาน 7.1 × 14.7 ซม.</text>`;
};

/** ตัว Griptok ขนาดที่สั่ง — วงกลมเส้นประกลางหลังเครื่อง + เส้นวัดเส้นผ่านศูนย์กลาง */
const griptokCircle = (cm) => {
  const r = (cm * PPC) / 2;
  const cy = PH_Y + Math.round(PH_H * 0.46);
  const dim = `
    <line x1="${PH_CX - r}" y1="${cy + r + 24}" x2="${PH_CX + r}" y2="${cy + r + 24}" stroke="${ACCENT}" stroke-width="2.5"/>
    <line x1="${PH_CX - r}" y1="${cy + r + 16}" x2="${PH_CX - r}" y2="${cy + r + 32}" stroke="${ACCENT}" stroke-width="2.5"/>
    <line x1="${PH_CX + r}" y1="${cy + r + 16}" x2="${PH_CX + r}" y2="${cy + r + 32}" stroke="${ACCENT}" stroke-width="2.5"/>`;
  return `
    <circle cx="${PH_CX}" cy="${cy}" r="${r}" fill="#e0f2fe" fill-opacity="0.75" stroke="${ACCENT}" stroke-width="3.5" stroke-dasharray="11 8"/>
    <circle cx="${PH_CX}" cy="${cy}" r="${Math.max(14, r * 0.16)}" fill="#ffffff" stroke="${ACCENT}" stroke-width="2" stroke-opacity="0.5"/>
    <text x="${PH_CX}" y="${cy - Math.max(20, r * 0.28)}" font-family="${TH}" font-size="${Math.max(30, Math.round(r * 0.42))}"
          font-weight="700" text-anchor="middle" fill="${ACCENT}">${cm} ซม.</text>
    ${dim}`;
};

/** แถบจุด 5-10 — เห็นว่าขนาดที่เลือกอยู่ตรงไหนของไลน์ (เทียบข้ามการ์ดได้) */
const sizeStrip = (cur) =>
  [5, 6, 7, 8, 9, 10]
    .map((cm, i) => {
      const x = 285 + i * 66;
      const on = cm === cur;
      return `
      <circle cx="${x}" cy="768" r="20" fill="${on ? ACCENT : "#ffffff"}" stroke="${on ? ACCENT : LINE}" stroke-width="2"/>
      <text x="${x}" y="776" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${on ? "#ffffff" : SUB}">${cm}</text>`;
    })
    .join("") + `<text x="${PH_CX + 250}" y="776" font-family="${TH}" font-size="20" text-anchor="start" fill="${SUB}">6 ขนาด (ซม.)</text>`;

/** ไม้บรรทัดกำกับความกว้างตัว Griptok (แนวตั้ง ซ้ายของเครื่อง — เลยระยะวง 10 ซม. เพื่อไม่ให้ชนกัน) */
const sideRuler = (cm) => {
  const s = cm * PPC;
  const x = PH_CX - (10 * PPC) / 2 - 42;
  const y0 = PH_Y + Math.round(PH_H * 0.46) - s / 2;
  const ticks = Array.from({ length: cm + 1 }, (_, i) => `<line x1="${x - 7}" y1="${y0 + i * PPC}" x2="${x + 7}" y2="${y0 + i * PPC}" stroke="${LINE}" stroke-width="2"/>`).join("");
  return `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + s}" stroke="${LINE}" stroke-width="2"/>${ticks}
    <text x="${x}" y="${y0 - 16}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">1 ช่อง = 1 ซม.</text>`;
};

/** เหรียญรูปงานจริง (คลิปเป็นวงกลม) มุมขวาบน */
const badgeSize = 180;
const badgePhoto = await sharp(await src("photoPearlPink"))
  .resize(badgeSize, badgeSize, { fit: "cover", position: "attention" })
  .composite([
    {
      input: Buffer.from(
        `<svg width="${badgeSize}" height="${badgeSize}"><circle cx="${badgeSize / 2}" cy="${badgeSize / 2}" r="${badgeSize / 2}" fill="#fff"/></svg>`
      ),
      blend: "dest-in",
    },
  ])
  .png()
  .toBuffer();
const BADGE_X = 682;
const BADGE_Y = 178;

for (const cm of [5, 6, 7, 8, 9, 10]) {
  const svg = frame(
    `${title(`ขนาด ${cm} ซม.`, "เทียบขนาดจริงเมื่อติดหลังมือถือ — กรอบเส้นประคือขนาดที่สั่ง")}
     ${phoneBack()}
     ${griptokCircle(cm)}
     ${sideRuler(cm)}
     ${sizeStrip(cm)}
     <circle cx="${BADGE_X + badgeSize / 2}" cy="${BADGE_Y + badgeSize / 2}" r="${badgeSize / 2 + 4}" fill="none" stroke="${LINE}" stroke-width="2"/>
     <text x="${BADGE_X + badgeSize / 2}" y="${BADGE_Y + badgeSize + 30}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">งานจริง</text>
     <text x="${W / 2}" y="838" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ขนาดนับจากด้านที่ยาวที่สุด ไม่วัดแนวทแยง · รูปทรงไดคัทตามลายที่ส่งมา</text>`
  );
  const buf = await sharp(Buffer.from(svg))
    .composite([{ input: badgePhoto, left: BADGE_X, top: BADGE_Y }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  save(`size-${cm}-v2`, buf);
}

/* ── 4. คลิปงานจริง (ผู้ใช้ส่งลิงก์ pgid มาให้ 24 ส.ค. 69) ─────────────
 * item fc7cb8e2-ed95-40ca-a231-a03992fe97a5 ในโปรแกลเลอรีหน้า /griptok
 * = วิดีโอ 959b83_45a666ecf89b4235bd4bef1d41dfcc96 (โชว์กระเปาะปั๊มนูน/Fimo)
 * โหลดไฟล์ 720p + ภาพปกเฟรมแรก (f000) มาเก็บเพื่ออัปเข้าคลังของเราเอง */
{
  const VID = "959b83_45a666ecf89b4235bd4bef1d41dfcc96";
  const mp4 = await get(`https://video.wixstatic.com/video/${VID}/720p/mp4/file.mp4`);
  writeFileSync(`${OUT}/clip-emboss-v1.mp4`, mp4);
  console.log(`   clip-emboss-v1.mp4  ${Math.round(mp4.length / 1024)} KB`);
  const poster = await get(`https://static.wixstatic.com/media/${VID}f000.jpg/v1/fit/w_1200,h_1200/x.jpg`);
  save("clip-emboss-poster-v1", await sharp(poster).jpeg({ quality: 90 }).toBuffer());
}

console.log(`\n✅ เสร็จ — อัป + เขียนสินค้าต่อด้วย: npx tsx scripts/add-griptok-emboss.ts --write`);
