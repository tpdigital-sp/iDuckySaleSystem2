#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "GRIPTOK MAGSAFE" (griptok-magsafe)
 *
 *   node scripts/griptok-magsafe-art.mjs [--out=<dir>]
 *
 * ได้ 14 ไฟล์ ลง .cache/griptok-magsafe/upload — ที่มาแยกเป็น 2 ทาง:
 *
 * 1) ครอปรูปงานจริงจากบล็อก "GRIPTOK MAGSAFE UV Printing" หน้า pricelists
 *    mode-a / mode-b     ครอปจากภาพเทียบ "ตัวอย่าง แบบ A | แบบ B" ของร้าน (959b83_c1f74e1d…)
 *                        ภาพเดียวกันถ่ายลายเดียวกัน ต่างกันแค่ A ประกบตาย B แยกได้ — เทียบกันตรง ๆ
 *    shape-circle        รูปงานจริง ฐานทรงกลมบนมือถือ (959b83_d89a8ca1…)
 *    shape-oval          รูปงานจริง ฐานทรงรีบนมือถือ (959b83_4cb94956…) — ลายเป็ดลายเดียวกับทรงกลม
 *    addon-none          รูปงานจริง Griptok + ฐาน Magsafe เปล่า ๆ (ไม่มีแผ่นอะคริลิคเสริม)
 *    griptok-yes         ครอปแบบ B ครบชุด
 *
 * 2) ประกอบเอง (การ์ดอธิบาย ไม่ใช่รูปถ่าย — เขียนกำกับไว้บนการ์ดทุกใบ)
 *    addon-5 … addon-10  แผ่นอะคริลิคเสริมวาดตามสเกลจริง (5-10 ซม.) + รูปงานจริงที่ใส่แผ่นแล้วเป็นภาพประกอบ
 *    size-chart          ซ้อนทั้ง 6 ขนาดตามสเกลจริงในใบเดียว (ใช้ในแท็บ)
 *    griptok-no          ภาพแบบ B ที่ทำเครื่องหมายกากบาททับตัว Griptok — อธิบาย "ไม่รับตัว Griptok ลด 15 บาท"
 *    coil-base           ไดอะแกรมแผ่น Magsafe coil base ที่ติดหลังเคส (ร้านไม่มีรูปถ่ายของชิ้นนี้บนหน้าเว็บ)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ตอนอัป ครั้งหน้าขึ้น v2
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/griptok-magsafe/upload").replace(/\/$/, "");
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

/** wix id → ภาพต้นฉบับกว้าง 900 (สเกลเดียวกับตัวเลขครอปด้านล่าง อย่าเปลี่ยน) */
const wix = (id) => `https://static.wixstatic.com/media/${id}~mv2.jpg/v1/fit/w_900,h_900/x.jpg`;

/** รูปงานจริงในบล็อก "GRIPTOK MAGSAFE" (id เดิมบนเว็บ กำกับไว้ให้ตรวจย้อนได้) */
const SRC = {
  compare: "959b83_c1f74e1d98324df0a2a0cd92555e3ccd", // เทียบ แบบ A | แบบ B (900x616)
  circle: "959b83_d89a8ca1f2b24de8990afd5cea349a3a", // ฐานทรงกลมบนมือถือ (900x596)
  oval: "959b83_4cb9495629f04f32baae7b5548a784b0", // ฐานทรงรีบนมือถือ ลายเดียวกัน (900x612)
  plate: "959b83_424bedc250a0408dbae119e2a8800265", // งานที่เสริมแผ่นอะคริลิคไดคัทด้านหลัง (900x697)
  plain: "959b83_85f9f3237f4444f580a2a6334b8df44d", // ฐานทรงรีบนมือถือ ไม่มีแผ่นอะคริลิคเสริม (900x598)
};

const cache = new Map();
const src = async (key) => {
  if (!cache.has(key)) cache.set(key, await get(wix(SRC[key])));
  return cache.get(key);
};

/** ครอปจากรูปต้นฉบับกว้าง 900 → กล่อง box (ไม่ยืด) */
const crop = async (key, box, { left, top, width, height }) =>
  sharp(await src(key))
    .extract({ left, top, width, height })
    .resize({ width: box, height: box, fit: "inside" })
    .toBuffer();

/** การ์ด "รูปงานจริง 1 ใบ + หัวข้อ + หมายเหตุ" */
async function photoCard(name, photo, { head, sub, notes }) {
  const meta = await sharp(photo).metadata();
  const svg = frame(`${title(head, sub)}${foot(notes)}`);
  const top = 190;
  const boxH = 560;
  const buf = await sharp(Buffer.from(svg))
    .composite([{ input: photo, left: Math.round((W - meta.width) / 2), top: top + Math.round((boxH - meta.height) / 2) }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  save(name, buf);
}

console.log(`🎨 ภาพประกอบตัวเลือก GRIPTOK MAGSAFE → ${OUT}`);

/* ── 1. แบบ A / แบบ B — ครอปจากภาพเทียบของร้าน ────────────────────── */

await photoCard("mode-a", await crop("compare", 520, { left: 45, top: 150, width: 330, height: 400 }), {
  head: "แบบ A — สำเร็จรูป",
  sub: "ตัว Griptok ประกบติดกับฐาน Magsafe มาแล้ว",
  notes: ["แกะแยกตัว Griptok ออกจากฐานไม่ได้", "ครอปจากภาพเทียบแบบ A | แบบ B ของร้าน"],
});

await photoCard("mode-b", await crop("compare", 520, { left: 470, top: 140, width: 370, height: 395 }), {
  head: "แบบ B — แยกชิ้น",
  sub: "ตัว Griptok แยกกับฐาน Magsafe",
  notes: ["ถอดตัว Griptok ออกจากฐานได้ · ราคาสูงกว่าแบบ A ตามตาราง", "ครอปจากภาพเทียบแบบ A | แบบ B ของร้าน"],
});

/* ── 2. ทรงกลม / ทรงรี — รูปงานจริง ลายเป็ดลายเดียวกันทั้งสองทรง ──── */

await photoCard("shape-circle", await sharp(await src("circle")).resize({ width: 700 }).toBuffer(), {
  head: "ทรงกลม (Circle)",
  sub: "ฐาน Magsafe พิมพ์ลาย ทรงกลม",
  notes: ["รูปงานจริงของร้าน — ลายเดียวกับภาพทรงรี เทียบทรงกันได้ตรง ๆ"],
});

await photoCard("shape-oval", await sharp(await src("oval")).resize({ width: 700 }).toBuffer(), {
  head: "ทรงรี (Oval)",
  sub: "ฐาน Magsafe พิมพ์ลาย ทรงรี (พื้นที่ลายมากกว่าทรงกลม)",
  notes: ["รูปงานจริงของร้าน — ลายเดียวกับภาพทรงกลม เทียบทรงกันได้ตรง ๆ", "ทรงรีคิดราคาสูงกว่าทรงกลม ดูตารางราคา"],
});

/* ── 3. Add On แผ่นอะคริลิค — การ์ดสเกลจริง 5-10 ซม. ──────────────── */

/** px ต่อ 1 ซม. ของการ์ดสเกล — 10 ซม. = 460 px ยังเหลือที่ให้ไม้บรรทัดใต้กรอบ */
const PPC = 46;
/** ขอบบนของกรอบขนาด — ทุกขนาดชิดขอบบนเดียวกัน เทียบขนาดกันได้ด้วยตาจากการ์ดคนละใบ */
const PLATE_TOP = 200;
const PLATE_CX = 530;

/**
 * แผ่นอะคริลิคของร้านไดคัทตามลายที่ลูกค้าส่งมา รูปทรงจึงไม่ตายตัว
 * การ์ดนี้วาดเป็น "กรอบขนาด" (bounding box) ของขนาดที่สั่ง — ขนาดนับจากด้านที่ยาวที่สุด
 */
const plateBox = (cm, cx, cy) => {
  const s = cm * PPC;
  return `
    <rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" rx="${Math.round(s * 0.18)}"
          fill="#e0f2fe" fill-opacity="0.55" stroke="${ACCENT}" stroke-width="3" stroke-dasharray="10 7"/>
    <text x="${cx}" y="${cy + 12}" font-family="${TH}" font-size="${Math.max(26, Math.round(s * 0.13))}"
          font-weight="700" text-anchor="middle" fill="${ACCENT}">${cm} cm</text>`;
};

/** ไม้บรรทัดใต้กรอบขนาด */
const ruler = (cm, cx, y) => {
  const s = cm * PPC;
  const x0 = cx - s / 2;
  const ticks = Array.from({ length: cm + 1 }, (_, i) => `<line x1="${x0 + i * PPC}" y1="${y - 7}" x2="${x0 + i * PPC}" y2="${y + 7}" stroke="${LINE}" stroke-width="2"/>`).join("");
  return `<line x1="${x0}" y1="${y}" x2="${x0 + s}" y2="${y}" stroke="${LINE}" stroke-width="2"/>${ticks}
    <text x="${cx}" y="${y + 38}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">สเกลจริง 1 ช่อง = 1 ซม.</text>`;
};

const plateExample = await sharp(await src("plate")).resize({ width: 250 }).toBuffer();
const plateExampleMeta = await sharp(plateExample).metadata();

for (const cm of [5, 6, 7, 8, 9, 10]) {
  const svg = frame(
    `${title(`เพิ่มแผ่นอะคริลิค ${cm} cm`, "แผ่นอะคริลิคไดคัทตามลาย ประกบหลังฐาน Magsafe")}
     ${plateBox(cm, PLATE_CX, PLATE_TOP + (cm * PPC) / 2)}
     ${ruler(cm, PLATE_CX, 706)}
     <text x="152" y="${205 + plateExampleMeta.height + 34}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">ตัวอย่างงานที่เสริมแผ่นแล้ว</text>
     ${foot(["ขนาดนับจากด้านที่ยาวที่สุด · รูปทรงไดคัทตามลายที่ส่งมา", "กรอบเส้นประคือขนาดที่สั่ง (ภาพประกอบตามสเกลจริง ไม่ใช่รูปถ่าย)"])}`
  );
  const buf = await sharp(Buffer.from(svg))
    .composite([{ input: plateExample, left: 27, top: 205 }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  save(`addon-${cm}`, buf);
}

await photoCard("addon-none", await sharp(await src("plain")).resize({ width: 700 }).toBuffer(), {
  head: "ไม่เพิ่มแผ่นอะคริลิค",
  sub: "ได้ตัว Griptok + ฐาน Magsafe พิมพ์ลาย ตามราคาในตาราง",
  notes: ["เลือกข้อนี้ = ไม่มีแผ่นอะคริลิคไดคัทประกบด้านหลัง"],
});

/** ใบเทียบขนาดรวม — ซ้อน 6 ขนาดจากใหญ่ไปเล็กที่มุมเดียวกัน */
await saveSvg(
  "size-chart",
  frame(
    `${title("แผ่นอะคริลิคเสริม 6 ขนาด", "เทียบขนาดตามสเกลจริง (ซ้อนมุมเดียวกัน)")}
     ${[10, 9, 8, 7, 6, 5]
       .map((cm) => {
         const s = cm * PPC;
         const x = 180;
         const y = 200;
         return `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${Math.round(s * 0.18)}"
             fill="none" stroke="${ACCENT}" stroke-width="3" stroke-opacity="${0.35 + (10 - cm) * 0.11}"/>
           <text x="${x + s - 12}" y="${y + s - 14}" font-family="${TH}" font-size="24" font-weight="700"
             text-anchor="end" fill="${ACCENT}">${cm}</text>`;
       })
       .join("")}
     ${foot(["ตัวเลขมุมล่างขวาของแต่ละกรอบ = ขนาดเป็นเซนติเมตร", "ขนาดนับจากด้านที่ยาวที่สุด ไม่วัดแนวทแยง"])}`
  )
);

/* ── 4. แบบ B: รับ / ไม่รับตัว Griptok ─────────────────────────────── */

const bCrop = await crop("compare", 520, { left: 470, top: 140, width: 370, height: 395 });

await photoCard("griptok-yes", bCrop, {
  head: "รับตัว Griptok ด้วย",
  sub: "ได้ครบชุด — ตัว Griptok + ฐาน Magsafe พิมพ์ลาย",
  notes: ["คิดราคาตามตารางแบบ B ตามปกติ"],
});

{
  const meta = await sharp(bCrop).metadata();
  const left = Math.round((W - meta.width) / 2);
  const top = 190 + Math.round((560 - meta.height) / 2);
  // ตัว Griptok อยู่ค่อนไปทางซ้ายบนของครอป — วงกากบาททับตรงนั้น
  const gx = left + Math.round(meta.width * 0.42);
  const gy = top + Math.round(meta.height * 0.3);
  const r = Math.round(meta.width * 0.26);
  const svg = frame(
    `${title("ไม่รับตัว Griptok", "ได้เฉพาะฐาน Magsafe พิมพ์ลาย — ลด 15 บาท/ชิ้น")}
     ${foot(["ทำเครื่องหมายบนรูปงานจริงเพื่ออธิบาย ไม่ใช่รูปถ่ายของจริง", "เลือกได้เฉพาะแบบ B (แบบ A แกะแยกไม่ได้)"])}`
  );
  const mark = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <circle cx="${gx}" cy="${gy}" r="${r}" fill="#ffffff" fill-opacity="0.62" stroke="#e11d48" stroke-width="6" stroke-dasharray="14 10"/>
      <line x1="${gx - r * 0.6}" y1="${gy - r * 0.6}" x2="${gx + r * 0.6}" y2="${gy + r * 0.6}" stroke="#e11d48" stroke-width="9" stroke-linecap="round"/>
      <line x1="${gx + r * 0.6}" y1="${gy - r * 0.6}" x2="${gx - r * 0.6}" y2="${gy + r * 0.6}" stroke="#e11d48" stroke-width="9" stroke-linecap="round"/>
      <text x="${gx}" y="${gy + r + 40}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="#e11d48">ไม่รวมตัว Griptok</text>
    </svg>`;
  const buf = await sharp(Buffer.from(svg))
    .composite([{ input: bCrop, left, top }, { input: Buffer.from(mark), left: 0, top: 0 }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  save("griptok-no", buf);
}

/* ── 5. Magsafe coil base — ไดอะแกรม (ร้านไม่มีรูปถ่ายชิ้นนี้บนหน้าเว็บ) ─ */

await saveSvg(
  "coil-base",
  frame(
    `${title("Magsafe coil base", "แผ่นแม่เหล็กติดด้านในเคส สำหรับเคสที่ยังไม่รองรับ Magsafe")}
     <g transform="translate(450,440)">
       <rect x="-215" y="-265" width="430" height="530" rx="56" fill="#f1f5f9" stroke="${LINE}" stroke-width="3"/>
       <text x="0" y="-215" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">เคสมือถือ (ด้านใน)</text>
       ${[168, 140, 112]
         .map((r, i) => `<circle cx="0" cy="30" r="${r}" fill="none" stroke="${ACCENT}" stroke-width="${10 - i * 2}" stroke-opacity="${0.85 - i * 0.2}"/>`)
         .join("")}
       <circle cx="0" cy="30" r="78" fill="#e0f2fe" stroke="${ACCENT}" stroke-width="4"/>
       <text x="0" y="40" font-family="${TH}" font-size="30" font-weight="700" text-anchor="middle" fill="${ACCENT}">coil</text>
     </g>
     <text x="${W / 2}" y="748" font-family="${TH}" font-size="27" font-weight="600" text-anchor="middle" fill="${INK}">อันละ 15 บาท</text>
     ${foot(["ติดไว้ในเคส แล้วดูด Griptok Magsafe เข้ากับเคสได้เลย", "ภาพนี้เป็นไดอะแกรมอธิบาย ไม่ใช่รูปถ่ายสินค้า"])}`
  )
);

console.log(`\n✅ เสร็จ — เอาไปอัปต่อด้วย: node scripts/griptok-magsafe-apply.mjs --write`);
