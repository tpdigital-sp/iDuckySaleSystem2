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

/* ── 2. การ์ด Add On จากหน้าปกวิดีโอของร้าน ───────────────────────── */

const tall = async (key) => sharp(await src(key)).resize({ height: 560 }).toBuffer();

await photoCard("addon-mini-v1", await tall("vidCharm"), {
  head: "เพิ่มอะคริลิคตัวน้อย",
  sub: "ตัวน้อยขนาด 1.5-2 ซม. ใส่ในกระเปาะเขย่าได้ · บวกเพิ่มชิ้นละ 15 บาท",
  notes: ["แผ่นอะคริลิคตัวน้อย หนา 1.5 mm", "ภาพจากคลิป “ใส่ตัวน้อยเขย่าเพิ่ม” ของร้าน"],
});

await photoCard("fimo-star-v1", await tall("vidFimoStar"), {
  head: "Fimo ดาว",
  sub: "ตัวน้อยเขย่าในกระเปาะ (ฟรี)",
  notes: ["Fimo กำหนดปริมาณไม่ได้ · ภาพจากคลิปของร้าน"],
});
await photoCard("fimo-pearl-v1", await tall("vidFimoPearl"), {
  head: "Fimo ไข่มุก",
  sub: "ตัวน้อยเขย่าในกระเปาะ (ฟรี)",
  notes: ["Fimo กำหนดปริมาณไม่ได้ · ภาพจากคลิปของร้าน"],
});
await photoCard("fimo-strand-v1", await tall("vidFimoStrand"), {
  head: "Fimo เส้น",
  sub: "ตัวน้อยเขย่าในกระเปาะ (ฟรี)",
  notes: ["Fimo กำหนดปริมาณไม่ได้ · ภาพจากคลิปของร้าน"],
});

/** ใบรวม 3 แบบ — ใช้กับตัวเลือก "รับ Fimo (ร้านคละให้)" */
{
  const shots = await Promise.all(
    ["vidFimoStar", "vidFimoPearl", "vidFimoStrand"].map(async (k) => sharp(await src(k)).resize({ height: 480 }).toBuffer())
  );
  const metas = await Promise.all(shots.map((b) => sharp(b).metadata()));
  const labels = ["ดาว", "ไข่มุก", "เส้น"];
  const gap = 24;
  const totalW = metas.reduce((s, m) => s + m.width, 0) + gap * (metas.length - 1);
  let x = Math.round((W - totalW) / 2);
  const composites = [];
  const captions = [];
  for (let i = 0; i < shots.length; i++) {
    composites.push({ input: shots[i], left: x, top: 200 });
    captions.push(
      `<text x="${x + metas[i].width / 2}" y="726" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${INK}">${esc(labels[i])}</text>`
    );
    x += metas[i].width + gap;
  }
  const svg = frame(
    `${title("Fimo ตัวน้อยเขย่า (ฟรี)", "มี 3 แบบ — ดาว | ไข่มุก | เส้น · ร้านคละให้")}${captions.join("")}
     ${foot(["Fimo ไม่สามารถกำหนดปริมาณได้ · หากไม่รับ Fimo รบกวนแจ้ง", "ภาพจากคลิปของร้านทั้ง 3 ใบ"])}`
  );
  save(
    "fimo-mix-v1",
    await sharp(Buffer.from(svg)).composite(composites).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer()
  );
}

/* ── 3. การ์ดสเกลขนาด 5-10 ซม. (สไตล์เดียวกับ griptok-magsafe) ────── */

/** px ต่อ 1 ซม. — 10 ซม. = 460 px ยังเหลือที่ให้ไม้บรรทัดใต้กรอบ */
const PPC = 46;
const PLATE_TOP = 200;
const PLATE_CX = 530;

const plateBox = (cm, cx, cy) => {
  const s = cm * PPC;
  return `
    <rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" rx="${Math.round(s * 0.18)}"
          fill="#e0f2fe" fill-opacity="0.55" stroke="${ACCENT}" stroke-width="3" stroke-dasharray="10 7"/>
    <text x="${cx}" y="${cy + 12}" font-family="${TH}" font-size="${Math.max(26, Math.round(s * 0.13))}"
          font-weight="700" text-anchor="middle" fill="${ACCENT}">${cm} cm</text>`;
};

const ruler = (cm, cx, y) => {
  const s = cm * PPC;
  const x0 = cx - s / 2;
  const ticks = Array.from({ length: cm + 1 }, (_, i) => `<line x1="${x0 + i * PPC}" y1="${y - 7}" x2="${x0 + i * PPC}" y2="${y + 7}" stroke="${LINE}" stroke-width="2"/>`).join("");
  return `<line x1="${x0}" y1="${y}" x2="${x0 + s}" y2="${y}" stroke="${LINE}" stroke-width="2"/>${ticks}
    <text x="${cx}" y="${y + 38}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">สเกลจริง 1 ช่อง = 1 ซม.</text>`;
};

const sizeExample = await sharp(await src("photoSideAngle")).resize({ width: 250 }).toBuffer();
const sizeExampleMeta = await sharp(sizeExample).metadata();

for (const cm of [5, 6, 7, 8, 9, 10]) {
  const svg = frame(
    `${title(`ขนาด ${cm} cm`, "Griptok อะคริลิคปั๊มนูน — กรอบเส้นประคือขนาดที่สั่ง")}
     ${plateBox(cm, PLATE_CX, PLATE_TOP + (cm * PPC) / 2)}
     ${ruler(cm, PLATE_CX, 706)}
     <text x="152" y="${205 + sizeExampleMeta.height + 34}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ตัวอย่างงานจริง</text>
     ${foot(["ขนาดนับจากด้านที่ยาวที่สุด ไม่วัดแนวทแยง · ไดคัทตามลายที่ส่งมา", "ภาพประกอบตามสเกลจริง ไม่ใช่รูปถ่าย"])}`
  );
  const buf = await sharp(Buffer.from(svg))
    .composite([{ input: sizeExample, left: 27, top: 205 }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  save(`size-${cm}-v1`, buf);
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
