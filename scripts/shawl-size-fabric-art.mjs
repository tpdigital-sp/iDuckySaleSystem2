#!/usr/bin/env node
/**
 * SHAWL / ผ้าคลุมไหล่ (shawl) — ภาพประกอบ 2 กลุ่มตัวเลือก + ทำเป็นการ์ด
 *
 *   node scripts/shawl-size-fabric-art.mjs           (วาดลง .cache/shawl/upload ดูก่อน)
 *   node scripts/shawl-size-fabric-art.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ของเดิมใน DB: กลุ่ม "ขนาด" (3 ตัวเลือก) กับ "ผ้า" (2 ตัวเลือก) เป็นปุ่มเปล่า ไม่มีภาพ ไม่มีคำอธิบาย
 *   กลุ่ม "สีไหมเย็บชิ้นงาน" มีภาพครบอยู่แล้ว — ไม่แตะ
 *
 * ⚠️ "ขนาด" คือแกนตารางราคา (pricing.driverLabels = ["ขนาด"] และ priceRates[0] ด้วย)
 *    ห้ามเปลี่ยนชื่อกลุ่ม/ชื่อตัวเลือกเด็ดขาด — cells ผูกกับ "70x70cm" / "100x100cm" / "140x140cm"
 *    สคริปต์นี้จึงเติมแค่ display/note/imageSrc/desc ([[iducky-price-driver-trap]])
 *
 * ภาพขนาด 3 ใบ วาด "สเกลเดียวกัน" (3 px = 1 ซม.) มีคนสูง 165 ซม. ยืนเทียบทุกใบ
 *   คน = การ์ตูนผู้หญิง 3D ใส่ผ้าคลุมไหล่ ตัดจากภาพตัวอย่างที่เจ้าของร้านส่งมา (ลบพื้นด้วย BiRefNet)
 *   แคช .cache/shawl/girl/girl.png · สำรองบน storage product-images/products/shawl/girl-165cm.png
 *   เท้าคนกับขอบล่างผืนอยู่บนพื้นเดียวกัน (FLOOR_Y)
 * ภาพเนื้อผ้า 2 ใบ ใช้ "ภาพถ่ายผ้าตัวอย่างจริง" จากใบเทียบเนื้อผ้าในไดรฟ์ ครอปเฉพาะเนื้อผ้า
 *   /Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/เนื้อผ้าต่างๆ/{6.Satin Peach,7.Satin Silk}.jpg
 *   (พิมพ์ลายเดียวกันทั้งสองเนื้อ เทียบกันได้ตรง ๆ — ใบนี้เขียนเองว่า "เหมาะสำหรับการทำผ้าคลุมไหล่")
 * ⚠️ ปุ่ม/การ์ดตัวเลือกครอปกลางภาพ (object-cover) — ป้ายชื่อกับตัวเลขจึงวางคาบกลาง 300-600 ([[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ + savedAt ([[iducky-image-cache-bust]])
 *
 * รันซ้ำได้: เขียนทับกลุ่มเดิมที่ตำแหน่งเดิม ไม่ย้ายลำดับ ไม่เพิ่มกลุ่ม
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "shawl";
const VER = "v5";   // v5 = กล่องตัวเลขกว้างพอ (v4 "100 × 100" ชนขอบกล่อง) · v4 = คนเทียบขนาดเป็นการ์ตูนผู้หญิง 3D ใส่ผ้าคลุมไหล่ (เจ้าของร้านส่งภาพตัวอย่าง 23 ต.ค. 69 "ต้องเป็นภาพแบบนี้") · เท้าแตะพื้นเดียวกับขอบล่างผืน
// v3 = คนยืนเปล่า + ผืนตั้ง (ไม่ผ่าน — เจ้าของร้านส่งภาพตัวอย่างแบบ v2 ที่เปลี่ยนคนเป็นการ์ตูน 3D)
// v2 = แก้ผ้าบนตัวคน: 70 = ผ้าพันคอผูกปม · 100/140 = พาดบ่าชายห้อย 2 ข้าง เปิดกลางลำตัว (v1 วาดปิดหน้าอกทั้งผืน ดูเป็นผ้าให้นม)
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2", PINK = "#db2777";

const frame = (body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}</defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines.filter(Boolean)
    .map((t, i, a) => `<text x="${W / 2}" y="${H - 36 - (a.length - 1 - i) * 28}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">${t}</text>`)
    .join("");

const pill = (cx, y, text, tone = "ok") => {
  const w = text.length * 16 + 64;
  const c = tone === "pink" ? PINK : tone === "mute" ? SUB : OK;
  const bg = tone === "pink" ? "#fdf2f8" : tone === "mute" ? "#f8fafc" : "#ecfeff";
  return `
    <rect x="${cx - w / 2}" y="${y - 23}" width="${w}" height="46" rx="23" fill="${bg}" stroke="${c}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${c}">${text}</text>`;
};

/** ลูกศรวัดขนาด — เส้น + ขีดปลาย + ป้ายตัวเลขบนพื้นขาว */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const right = vertical && side === "right";   // ป้ายอยู่ขวาเส้น (กันทับป้ายตัวเลขกลางผืน)
  const lx = vertical ? x1 + (right ? 14 : -14) : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 32 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 9 : 0)}" y1="${y - (vertical ? 0 : 9)}" x2="${x + (vertical ? 9 : 0)}" y2="${y + (vertical ? 0 : 9)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? (right ? 0 : label.length * 12.5) : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? (right ? "start" : "end") : "middle"}" fill="${SUB}">${label}</text>`;
};

// ════════════════════════════════════════════════════════════════════
// 1) กลุ่ม "ขนาด" — การ์ด 3 ใบ สเกลเดียวกัน + คนสูง 165 ซม. ยืนเทียบ
// ════════════════════════════════════════════════════════════════════
const S = 3;            // px ต่อ 1 ซม. — ใช้ร่วมกันทั้ง 3 ใบ ห้ามแยกสเกล ไม่งั้นเทียบขนาดไม่ได้
const FLOOR_Y = 670;    // พื้น — เท้าคนกับขอบล่างผืนตรงกันทุกใบ
const SQ_CX = 505;      // กลางผืน (ให้กลางผืนตกในกรอบครอป 300-600)
const MAN_CX = 168;     // กลางตัวคนเทียบขนาด
const MAN_CM = 165;     // ส่วนสูงคนอ้างอิง

const CLOTH_DEFS = `
  <linearGradient id="cloth" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#dff5ee"/><stop offset="0.45" stop-color="#fdeef4"/><stop offset="1" stop-color="#e4f0fd"/>
  </linearGradient>
  <pattern id="print" width="64" height="64" patternUnits="userSpaceOnUse">
    <rect width="64" height="64" fill="url(#cloth)"/>
    <g fill="#f7b6cd">${[0, 1, 2, 3, 4].map((i) => `<circle cx="${16 + 5.5 * Math.cos((i * 72 * Math.PI) / 180)}" cy="${17 + 5.5 * Math.sin((i * 72 * Math.PI) / 180)}" r="4.2"/>`).join("")}</g>
    <circle cx="16" cy="17" r="3.2" fill="#fbd97a"/>
    <path d="M 46 34 c -5 -6 -13 -1 -9 5 l 9 10 l 9 -10 c 4 -6 -4 -11 -9 -5 z" fill="#f59db5" opacity="0.85"/>
    <g fill="#8fd4bd">${[0, 1, 2, 3, 4].map((i) => `<circle cx="${52 + 5 * Math.cos((i * 72 * Math.PI) / 180)}" cy="${12 + 5 * Math.sin((i * 72 * Math.PI) / 180)}" r="3.6"/>`).join("")}</g>
    <circle cx="52" cy="12" r="2.6" fill="#ffffff"/>
    <circle cx="10" cy="48" r="3" fill="#f6c9a0"/>
    <circle cx="30" cy="56" r="2.4" fill="#a9d8f2"/>
    <circle cx="34" cy="8" r="2.2" fill="#f7b6cd"/>
  </pattern>`;

/** การ์ตูนผู้หญิง 3D (PNG พื้นใส) — แคชในเครื่อง ไม่มีก็ดึงจาก storage */
const GIRL_CACHE = `.cache/${PRODUCT_ID}/girl/girl.png`;
const GIRL_URL = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/shawl/girl-165cm.png";
if (!existsSync(GIRL_CACHE)) {
  const res = await fetch(GIRL_URL);
  if (!res.ok) throw new Error(`ดึงภาพการ์ตูนผู้หญิงไม่ได้ (${res.status}) — ${GIRL_URL}`);
  mkdirSync(`.cache/${PRODUCT_ID}/girl`, { recursive: true });
  writeFileSync(GIRL_CACHE, Buffer.from(await res.arrayBuffer()));
}
const girlBuf = await sharp(GIRL_CACHE).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
const GIRL = { uri: `data:image/png;base64,${girlBuf.data.toString("base64")}`, ratio: girlBuf.info.width / girlBuf.info.height };

/** คนสูง 165 ซม. ยืนบนพื้น FLOOR_Y — สูงเท่ากันทุกใบ */
const person = (cx) => {
  const h = MAN_CM * S, w = h * GIRL.ratio, top = FLOOR_Y - h;
  const lx = cx - w / 2 - 16;
  return `
  <ellipse cx="${cx}" cy="${FLOOR_Y - 2}" rx="${w * 0.36}" ry="7" fill="#0f172a" opacity="0.07"/>
  <image href="${GIRL.uri}" x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>
  <!-- เส้นบอกส่วนสูงคน -->
  <line x1="${lx}" y1="${top}" x2="${lx}" y2="${FLOOR_Y}" stroke="${SUB}" stroke-width="2" stroke-dasharray="7 6"/>
  <line x1="${lx - 8}" y1="${top}" x2="${lx + 8}" y2="${top}" stroke="${SUB}" stroke-width="2.5"/>
  <line x1="${lx - 8}" y1="${FLOOR_Y}" x2="${lx + 8}" y2="${FLOOR_Y}" stroke="${SUB}" stroke-width="2.5"/>
  <text x="${cx}" y="${FLOOR_Y + 34}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${SUB}">คนสูง 165 ซม.</text>
  <text x="${cx}" y="${FLOOR_Y + 60}" font-family="${TH}" font-size="19" text-anchor="middle" fill="#94a3b8">(ไว้เทียบขนาด)</text>`;
};

const MASCOT = await mascotDataUri("heart", 300);

/** การ์ดขนาด 1 ใบ — ผืนวางแบน (สเกลจริง) + คนสวมผ้าผืนนั้น + ป้ายตัวเลขกลางภาพ */
function sizeArt({ cm, use, prices }) {
  const side = cm * S;
  const left = SQ_CX - side / 2, right = SQ_CX + side / 2;
  const bottom = FLOOR_Y, top = FLOOR_Y - side;
  const cy = top + side / 2;
  const fs = cm <= 70 ? 44 : 58;
  const bw = Math.max(fs * 5.7, 196), bh = fs + 62;
  const labelCY = bottom - 18;                 // ป้ายคาบขอบล่างผืน — กลางป้ายยังอยู่ในกรอบครอป 300-600
  const mw = side * 0.44, mh = mw / MASCOT.ratio;
  return frame(`
    ${title(`ขนาด ${cm} × ${cm} ซม.`, `ผืนละ ฿${prices[0]} (1-10 ผืน) · สั่ง 5,000 ผืนขึ้นไป ฿${prices[1]}`)}
    ${person(MAN_CX)}
    <!-- ผืนผ้าวางแบน ขนาดจริงตามสเกล 1 ซม. = ${S} px -->
    <rect x="${left + 5}" y="${top + 7}" width="${side}" height="${side}" rx="10" fill="#0f172a" opacity="0.07"/>
    <rect x="${left}" y="${top}" width="${side}" height="${side}" rx="10" fill="url(#print)" stroke="#dbe3ec" stroke-width="2"/>
    <image href="${MASCOT.uri}" x="${SQ_CX - mw / 2}" y="${top + side * 0.05}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
    ${dim(left, bottom + 46, right, bottom + 46, `${cm} ซม.`, "below")}
    ${dim(right + 42, top, right + 42, bottom, `${cm} ซม.`, "right")}
    <!-- ป้ายตัวเลขกลางผืน — ต้องอ่านออกตอนย่อเป็นปุ่ม/การ์ด ([[iducky-option-thumb-crop]]) -->
    <rect x="${SQ_CX - bw / 2}" y="${labelCY - bh / 2}" width="${bw}" height="${bh}" rx="20" fill="#ffffff" opacity="0.94" stroke="#e2e8f0" stroke-width="2"/>
    <text x="${SQ_CX}" y="${labelCY + 4}" font-family="${TH}" font-size="${fs}" font-weight="700" text-anchor="middle" fill="${INK}">${cm} × ${cm}</text>
    <text x="${SQ_CX}" y="${labelCY + 38}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${SUB}">เซนติเมตร</text>
    ${pill(W / 2, 792, use, "pink")}
    ${foot([
      "ภาพทั้ง 3 ขนาดวาดสเกลเดียวกัน · คนในภาพสูง 165 ซม. เท่ากันทุกใบ",
      "ขนาดจริงอาจคลาดเคลื่อน 2-5 ซม. เพราะผ้าแต่ละผืนตัดมาไม่เท่ากันเป๊ะ",
    ])}`, CLOTH_DEFS);
}

const SIZES = [
  { name: "70x70cm", cm: 70, use: "ผูกคอ · พันผม · ผูกกระเป๋า", prices: [250, 170] },
  { name: "100x100cm", cm: 100, use: "คลุมไหล่ · คลุมกันแดด · แต่งลุค", prices: [400, 280] },
  { name: "140x140cm", cm: 140, use: "คลุมทั้งตัว · ห่มกันหนาว · ผ้าคลุมยาว", prices: [600, 540] },
];
for (const s of SIZES) {
  s.file = `size-${s.cm}-${VER}.jpg`;
  s.buf = await sharp(Buffer.from(sizeArt(s))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${s.file}`, s.buf);
  await sharp(s.buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/thumb-${s.file}`);
  console.log(`🖼  ${OUT}/${s.file}  ${Math.round(s.buf.length / 1024)} KB — ${s.name}`);
}

// ════════════════════════════════════════════════════════════════════
// 2) กลุ่ม "ผ้า" — การ์ด 2 ใบ จากภาพถ่ายผ้าตัวอย่างจริงในไดรฟ์
// ════════════════════════════════════════════════════════════════════
const SWATCH_DIR = "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/เนื้อผ้าต่างๆ";
const SWATCH_CACHE = `.cache/${PRODUCT_ID}/swatch`;
mkdirSync(SWATCH_CACHE, { recursive: true });

/** ครอปเฉพาะเนื้อผ้าจากใบเทียบเนื้อผ้า (ต้นฉบับ 1970×1970 · ครึ่งบนเป็นรูป ครึ่งล่างเป็นข้อความ) */
async function swatchUri(file) {
  const cached = `${SWATCH_CACHE}/${file}.jpg`;
  if (!existsSync(cached)) {
    const src = `${SWATCH_DIR}/${file}.jpg`;
    if (!existsSync(src)) throw new Error(`หาไฟล์ผ้าตัวอย่าง "${file}" ไม่เจอ — ต่อไดรฟ์ iDuckyShop ก่อน (แคชอยู่ที่ ${SWATCH_CACHE})`);
    await sharp(src).extract({ left: 420, top: 520, width: 760, height: 760 }).resize(560).jpeg({ quality: 92 }).toFile(cached);
  }
  return `data:image/jpeg;base64,${readFileSync(cached).toString("base64")}`;
}

const PHOTO = { x: 210, y: 158, s: 480 };

function fabricArt({ name, en, sub, uri, bullets }) {
  return frame(`
    ${title(`ผ้า${name}`, sub)}
    <clipPath id="ph"><rect x="${PHOTO.x}" y="${PHOTO.y}" width="${PHOTO.s}" height="${PHOTO.s}" rx="24"/></clipPath>
    <rect x="${PHOTO.x + 5}" y="${PHOTO.y + 8}" width="${PHOTO.s}" height="${PHOTO.s}" rx="24" fill="#0f172a" opacity="0.08"/>
    <image href="${uri}" x="${PHOTO.x}" y="${PHOTO.y}" width="${PHOTO.s}" height="${PHOTO.s}"
      preserveAspectRatio="xMidYMid slice" clip-path="url(#ph)"/>
    <rect x="${PHOTO.x}" y="${PHOTO.y}" width="${PHOTO.s}" height="${PHOTO.s}" rx="24" fill="none" stroke="#e2e8f0" stroke-width="3"/>
    <!-- ป้ายชื่อเนื้อผ้าคาบกลางภาพ — ปุ่ม/การ์ดครอปกลาง ต้องเห็นว่าเนื้อไหน ([[iducky-option-thumb-crop]]) -->
    <rect x="${W / 2 - 155}" y="${536}" width="310" height="58" rx="29" fill="#ffffff" opacity="0.95" stroke="#e2e8f0" stroke-width="2"/>
    <text x="${W / 2}" y="${567}" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${INK}">${name}</text>
    <text x="${W / 2}" y="${PHOTO.y + PHOTO.s + 34}" font-family="${TH}" font-size="21" text-anchor="middle" fill="#94a3b8">ภาพถ่ายผ้าตัวอย่างจริง (${en}) · ลายพิมพ์เดียวกันทั้ง 2 เนื้อ</text>
    ${bullets.map((b, i) => `
      <circle cx="176" cy="${712 + i * 38 - 7}" r="5" fill="${PINK}"/>
      <text x="196" y="${712 + i * 38}" font-family="${TH}" font-size="24" fill="${INK}">${b}</text>`).join("")}
    ${foot(["เลือกเนื้อผ้าได้ ราคาเท่ากันทุกเนื้อ · งานพิมพ์ซับลิเมชั่นสีอาจคลาดเคลื่อน 5-15%"])}`);
}

const FABRICS = [
  {
    name: "ซาตินซิลค์", en: "Satin Silk", file: "7.Satin Silk",
    sub: "ลายไหมทอละเอียด ผิวลื่นมันวาว พลิ้วไหว",
    bullets: ["เนื้อทอลายไหมละเอียด ผิวลื่น มันวาว", "พลิ้วไหว น้ำหนักเบา ผ้าทิ้งตัวสวย", "ซักง่าย แห้งเร็ว ไม่ต้องรีด"],
  },
  {
    name: "ซาตินพีช", en: "Satin Peach", file: "6.Satin Peach",
    sub: "ผิวเรียบเนียน ลื่นมันวาว ยืดหยุ่นดี",
    bullets: ["เนื้อเรียบเนียน ผิวลื่น มันวาว", "น้ำหนักเบา ทิ้งตัวดี ยืดหยุ่นได้ดี", "ซักง่าย แห้งเร็ว ไม่ต้องรีด"],
  },
];
for (const f of FABRICS) {
  f.uri = await swatchUri(f.file);
  f.out = `fabric-${f.en.toLowerCase().replace(/\s+/g, "-")}-${VER}.jpg`;
  f.buf = await sharp(Buffer.from(fabricArt(f))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${f.out}`, f.buf);
  await sharp(f.buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/thumb-${f.out}`);
  console.log(`🖼  ${OUT}/${f.out}  ${Math.round(f.buf.length / 1024)} KB — ${f.name}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const c of [...SIZES.map((s) => ({ file: s.file, buf: s.buf, ref: s })), ...FABRICS.map((f) => ({ file: f.out, buf: f.buf, ref: f }))]) {
  const key = `products/${PRODUCT_ID}/${c.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, c.buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  c.ref.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", c.ref.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
const dump = `${OUT}/../before-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

const SIZE_DESC = {
  "70x70cm": "ผืนเล็ก ผูกคอ พันผม ผูกกระเป๋า พกง่าย — เริ่มผืนละ ฿250 สั่งเยอะลดถึงผืนละ ฿170",
  "100x100cm": "คลุมไหล่ / คลุมกันแดดได้พอดีตัว — เริ่มผืนละ ฿400 สั่งเยอะลดถึงผืนละ ฿280",
  "140x140cm": "ผืนใหญ่ คลุมได้ทั้งตัว ห่มกันหนาวได้ — เริ่มผืนละ ฿600 สั่งเยอะลดถึงผืนละ ฿540",
};
const FABRIC_DESC = {
  "ซาตินซิลค์": "เนื้อทอลายไหมละเอียด ผิวลื่นมันวาว พลิ้วไหว น้ำหนักเบา ผ้าทิ้งตัวสวย ซักง่าย แห้งเร็วไม่ต้องรีด",
  "ซาตินพีช": "เนื้อเรียบเนียน ผิวลื่นมันวาว น้ำหนักเบา ผ้าทิ้งตัวดี ยืดหยุ่นได้ดี ซักง่าย แห้งเร็วไม่ต้องรีด",
};
const IMG = {
  ...Object.fromEntries(SIZES.map((s) => [s.name, s.url])),
  ...Object.fromEntries(FABRICS.map((f) => [f.name, f.url])),
};

// แก้เฉพาะ 2 กลุ่มนี้ "ที่ตำแหน่งเดิม" — กลุ่มอื่น (สีไหมเย็บชิ้นงาน) ไม่แตะ ([[iducky-option-group-loss-guard]])
let touched = 0;
data.options = (data.options ?? []).map((o) => {
  if (o.label === "ขนาด") {
    touched++;
    return {
      ...o, display: "cards",
      note: "ผืนสี่เหลี่ยมจัตุรัส วัดด้านละ ซม. — เลือกขนาดแล้วราคาต่อผืนเปลี่ยนตามตาราง · ขนาดจริงคลาดเคลื่อนได้ 2-5 ซม. เพราะผ้าแต่ละผืนตัดมาไม่เท่ากันเป๊ะ",
      choices: o.choices.map((c) => ({ ...c, imageSrc: IMG[c.name] ?? c.imageSrc, desc: SIZE_DESC[c.name] ?? c.desc })),
    };
  }
  if (o.label === "ผ้า") {
    touched++;
    return {
      ...o, display: "cards",
      note: "เลือกได้ 2 เนื้อ ราคาเท่ากัน — ทั้งคู่พิมพ์ซับลิเมชั่นเต็มผืน ผิวลื่นมันวาว น้ำหนักเบา ซักง่าย แห้งเร็ว · ภาพในการ์ดถ่ายจากผ้าตัวอย่างจริง ลายพิมพ์เดียวกันทั้งคู่",
      choices: o.choices.map((c) => ({ ...c, imageSrc: IMG[c.name] ?? c.imageSrc, desc: FABRIC_DESC[c.name] ?? c.desc })),
    };
  }
  return o;
});
if (touched !== 2) { console.error(`หากลุ่ม "ขนาด"/"ผ้า" ไม่ครบ (เจอ ${touched}) — ไม่เขียน`); process.exit(1); }
data.savedAt = new Date().toISOString();   // ให้ ?v=savedAt ล้างแคชรูป ([[iducky-image-cache-bust]])

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const gSize = got.find((o) => o.label === "ขนาด");
const gFab = got.find((o) => o.label === "ผ้า");
const cells = back.data.pricing?.cells ?? {};
const fails = [
  [got.length === (row.data.options ?? []).length, "จำนวนกลุ่มตัวเลือกเปลี่ยน"],
  ...["ขนาด", "ผ้า", "สีไหมเย็บชิ้นงาน"].map((l) => [got.filter((o) => o.label === l).length === 1, `กลุ่ม "${l}" หาย/ซ้ำ`]),
  [got.find((o) => o.label === "สีไหมเย็บชิ้นงาน")?.choices?.length === 13, "สีไหม 13 สีไม่ครบ"],
  [gSize?.display === "cards" && gFab?.display === "cards", "ยังไม่เป็นการ์ด"],
  // ชื่อตัวเลือกขนาดคือ "คีย์" ของตารางราคา ห้ามเพี้ยน ([[iducky-price-driver-trap]])
  ...SIZES.map((s) => [gSize?.choices?.some((c) => c.name === s.name && c.imageSrc === s.url && c.desc), `ขนาด ${s.name} ไม่ตรง (ชื่อ/ภาพ/คำอธิบาย)`]),
  ...SIZES.map((s) => [Array.isArray(cells[s.name]) && cells[s.name].length === 8, `ตารางราคาไม่มีคีย์ ${s.name}`]),
  ...FABRICS.map((f) => [gFab?.choices?.some((c) => c.name === f.name && c.imageSrc === f.url && c.desc), `ผ้า ${f.name} ไม่ตรง (ชื่อ/ภาพ/คำอธิบาย)`]),
  [gSize?.choices?.every((c) => !c.extra) && gFab?.choices?.every((c) => !c.extra), "มีค่า extra โผล่มา (ราคาต้องมาจากตารางล้วน)"],
  [(back.data.pricing?.driverLabels ?? []).join() === "ขนาด", "แกนตารางราคาเปลี่ยน"],
  [(back.data.priceRates ?? []).every((r) => (r.pricing?.driverLabels ?? []).join() === "ขนาด"), "แกนตารางราคาของเรทเปลี่ยน"],
  [back.data.priceMin === 170 && back.data.priceMax === 600, "ช่วงราคาสินค้าเปลี่ยนไป"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "ขนาด" 3 การ์ด + "ผ้า" 2 การ์ด พร้อมภาพ/คำอธิบาย อ่านกลับตรงทุกข้อ · savedAt = ${back.data.savedAt}`);
