#!/usr/bin/env node
/**
 * ภาพประกอบกลุ่มตัวเลือกของ "คลิปหนีบอะคริลิค" (otheracrylicproducts2-5 · /products/คลิปหนีบอะคริลิค)
 *
 *   node scripts/acrylic-clip-option-art.mjs            (วาด/ครอปภาพลง .cache/acrylic-clip/upload)
 *   node scripts/acrylic-clip-option-art.mjs --write    (+ อัปโหลด storage + ตั้ง choice.imageSrc + อ่านกลับเทียบ)
 *
 * ครอบ 4 กลุ่ม:
 *   1. "ขนาดด้านยาวที่สุด" (dropdown 4-4.5 cm ทีละ 0.1) — วาดการ์ด 6 ใบ: ชิ้นงานไดคัท+คลิปหนีบ
 *      สเกลจริง 1 ซม. = 105 px + ลูกศรวัดด้านยาวสุด + เลขตัวใหญ่ (ภาพย่อบนปุ่ม 28px ต้องอ่านออก)
 *      + ไม้บรรทัด 0-5 ซม. ไฮไลต์ช่วงถึงขนาดที่เลือก
 *      ⚠️ v2: คลิปเป็น **คลิปหนีบพลาสติกขาว ติดหลังแนวตั้ง** ปากงับชี้ลง (รูปงานจริงจากเจ้าของร้าน 3 ก.ย. 69)
 *      v1 วาดเป็นขาโลหะโผล่ซ้าย-ขวา = ผิด · อะคริลิคใสวาดโปร่ง 0.72 ให้เห็นตัวคลิปทะลุหลังชิ้นงาน
 *   2. "เทคนิค" สกรีนใต้/สกรีนบน — ครอป 2 ช่องบนจากชาร์ต HOW TO PRINT ของร้าน
 *      (959b83_87c211c630db4c6397260296e75557ba — ชุดเดียวกับที่ 3d-acrylic เคยครอป)
 *   3. "ประเภท" ใส/C-02/พิเศษ — ใช้ชุดภาพมาตรฐานเดียวกับ keyring-acrylic-type-cards.mts
 *      (ใส=รูปงานจริง wix · C-02=ชิพคลังสี · พิเศษ=สวอตช์รวม special-mix-v1)
 *   4. "สีอะคริลิค" — เติมภาพให้ตัวเลือก "อะคริลิคใส" ที่ยังขาด (44 สีที่เหลือมีครบแล้ว)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 520);

const PRODUCT_ID = "otheracrylicproducts2-5";
const VER = "v2";
const OUT = ".cache/acrylic-clip/upload";
mkdirSync(OUT, { recursive: true });

const IMG = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products";
/**
 * ชุดภาพ "ประเภท" — C-02/พิเศษ ใช้ชิพคลังสีกลางชุดเดียวกับพวงกุญแจอะคริลิค
 * (keyring-acrylic-type-cards.mts) ส่วน "ใส" ใช้ **รูปงานจริงที่อยู่ในแกลเลอรีสินค้านี้อยู่แล้ว**
 * — ตรงกันเป๊ะกับ product.images[3] เลยกดเลือกแล้วภาพหลักเด้งตาม (ดู jumpToImage ใน ProductDetail)
 * ไม่ยืมรูปพวงกุญแจมาใช้ เพราะรูปนั้นมีห่วงกุญแจติดมาด้วย คนละของกับคลิปหนีบ
 */
const CLEAR_PHOTO = "https://static.wixstatic.com/media/959b83_d1fde7c83e4f48518498ee7f3e24519d~mv2.jpg/v1/fill/w_900,h_675,al_c,q_85/file.jpg";
const TYPE_ART = {
  "อะคริลิคใส": CLEAR_PHOTO,
  "อะคริลิคขาวขุ่น C-02": `${IMG}/acrylic-colors/c02-v2.jpg`,
  "อะคริลิคพิเศษ": `${IMG}/acrylic-colors/special-mix-v1.jpg`,
};

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
/** พลาสติกคลิปหนีบ — เทาอ่อนพอให้แยกออกจากกระดาษขาวและแผ่นอะคริลิคใส */
const CLIP_FILL = "#e9eef4";
const CLIP_GRIP = "#d3dbe5";
const CLIP_EDGE = "#8fa0b3";

/** สเกลจริง — 1 ซม. = 95 px (4.5 ซม. = 428 px) ทุกใบสเกลเดียวกัน */
const CM = 95;
const GROUND = 578; // เส้นฐานก้นชิ้นงาน (ใต้ลงไปเป็นปากคลิป + กระดาษ)
const CHARM_CX = 270;

/** ขนาด 6 ตัวเลือกจาก DB — key = choice.name เป๊ะ ๆ */
const SIZES = [
  { choice: "4 cm", cm: 4.0, file: "size-4-0" },
  { choice: "4.1 cm", cm: 4.1, file: "size-4-1" },
  { choice: "4.2 cm", cm: 4.2, file: "size-4-2" },
  { choice: "4.3 cm", cm: 4.3, file: "size-4-3" },
  { choice: "4.4 cm", cm: 4.4, file: "size-4-4" },
  { choice: "4.5 cm", cm: 4.5, file: "size-4-5" },
];

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines
    .map(
      (t, i, a) =>
        `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

/** ลูกศรวัดแนวตั้ง — ขีดปลายสองข้าง + ป้ายหมุน 90° แนบเส้น (dx = ป้ายอยู่ซ้าย/ขวาของเส้น) */
const dimV = (x, y1, y2, label, dx = 26) => {
  const lw = label.length * 12;
  const lx = x + dx;
  return `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    <line x1="${x - 8}" y1="${y1}" x2="${x + 8}" y2="${y1}" stroke="${SUB}" stroke-width="3"/>
    <line x1="${x - 8}" y1="${y2}" x2="${x + 8}" y2="${y2}" stroke="${SUB}" stroke-width="3"/>
    <g transform="rotate(-90 ${lx} ${(y1 + y2) / 2})">
      <rect x="${lx - lw / 2}" y="${(y1 + y2) / 2 - 15}" width="${lw}" height="30" rx="7" fill="#ffffff" opacity="0.92"/>
      <text x="${lx}" y="${(y1 + y2) / 2 + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>
    </g>`;
};

/**
 * ระดับสำคัญของฉาก (คิดจากก้นชิ้นงาน) — คลิปติดหลังแนวตั้ง ปากงับชี้ลง งับขอบบนของกระดาษ
 * ขอบกระดาษต้องอยู่ "ใน" ช่วงปากคลิป แล้ววาดปากคลิปทับกระดาษ (แขนหน้าของคลิปบังขอบไว้จริง ๆ)
 */
const paperEdgeY = (groundY, h) => groundY + h * 0.13;
const jawTopY = (groundY, h) => groundY - h * 0.03;
const jawBotY = (groundY, h) => groundY + h * 0.27;

/** กระดาษ/รูปที่ถูกหนีบ — ขอบบนแผ่นโผล่สองข้างปากคลิป ตรงกลางถูกปากคลิปงับบังไว้ */
const sheet = (cx, groundY, hcm) => {
  const h = hcm * CM;
  const edgeY = paperEdgeY(groundY, h);
  const x = cx - 200;
  const w = 400;
  const bottom = groundY + h * 0.27 + 74;
  return `
    <rect x="${x + 10}" y="${edgeY + 9}" width="${w}" height="${bottom - edgeY}" rx="8" fill="#e6ecf3" opacity="0.65"/>
    <rect x="${x}" y="${edgeY}" width="${w}" height="${bottom - edgeY}" rx="8" fill="#ffffff" stroke="#d6dee8" stroke-width="3"/>
    <line x1="${x + 30}" y1="${bottom - 40}" x2="${x + w - 56}" y2="${bottom - 40}" stroke="#e6ebf1" stroke-width="9" stroke-linecap="round"/>
    <line x1="${x + 30}" y1="${bottom - 18}" x2="${x + w - 148}" y2="${bottom - 18}" stroke="#eff3f7" stroke-width="9" stroke-linecap="round"/>`;
};

/**
 * คลิปหนีบพลาสติกขาว ติดหลังชิ้นงาน **แนวตั้ง** ปากงับชี้ลง (ตามรูปงานจริงที่เจ้าของร้านส่งมา 3 ก.ย. 69)
 * แยกเป็น 2 ชิ้นเพราะลำดับการวาดต่างกัน:
 *   back — ตัวคลิป+หมุดสปริงที่อยู่ "หลัง" แผ่นอะคริลิค (วาดก่อนชิ้นงาน เห็นจาง ๆ ทะลุเนื้อใส)
 *   jaw  — ปากงับที่โผล่พ้นก้นชิ้นงานลงมา (วาด "หลังกระดาษ" เพื่อบังขอบกระดาษไว้ = งับอยู่จริง)
 */
const clipBack = (cx, groundY, hcm) => {
  const h = hcm * CM;
  const cw = h * 0.24;
  const topY = groundY - h * 0.62;
  const pivotY = groundY - h * 0.26;
  return `
    <rect x="${cx - cw / 2}" y="${topY}" width="${cw}" height="${groundY + h * 0.06 - topY}" rx="${cw * 0.34}"
      fill="${CLIP_FILL}" stroke="${CLIP_EDGE}" stroke-width="3"/>
    <circle cx="${cx}" cy="${pivotY}" r="${cw * 0.2}" fill="${CLIP_GRIP}" stroke="${CLIP_EDGE}" stroke-width="2.5"/>
    <circle cx="${cx}" cy="${pivotY}" r="${cw * 0.07}" fill="${CLIP_EDGE}"/>`;
};

/** เงาคลิปที่เห็นทะลุแผ่นอะคริลิคใส — วาดทับชิ้นงาน เส้นประจาง ๆ ให้รู้ว่าคลิปวางแนวตั้งยาวตลอดตัว */
const clipGhost = (cx, groundY, hcm) => {
  const h = hcm * CM;
  const cw = h * 0.24;
  const topY = groundY - h * 0.62;
  const pivotY = groundY - h * 0.26;
  return `
    <g opacity="0.42">
      <rect x="${cx - cw / 2}" y="${topY}" width="${cw}" height="${groundY + h * 0.06 - topY}" rx="${cw * 0.34}"
        fill="none" stroke="${CLIP_EDGE}" stroke-width="3" stroke-dasharray="9 7"/>
      <circle cx="${cx}" cy="${pivotY}" r="${cw * 0.2}" fill="none" stroke="${CLIP_EDGE}" stroke-width="2.5"/>
    </g>`;
};

const clipJaw = (cx, groundY, hcm) => {
  const h = hcm * CM;
  const jw = h * 0.28;
  const top = jawTopY(groundY, h);
  const bot = jawBotY(groundY, h);
  return `
    <!-- ปากคลิป: แขนตรง ไม่บาน (บานแล้วดูเป็นฐานแจกัน) วางทับขอบกระดาษ = งับอยู่จริง -->
    <rect x="${cx - jw / 2}" y="${top}" width="${jw}" height="${bot - top}" rx="${jw * 0.2}"
      fill="${CLIP_FILL}" stroke="${CLIP_EDGE}" stroke-width="3.5"/>
    <!-- รอยต่อแขนคลิป 2 ข้าง -->
    <line x1="${cx}" y1="${top + 10}" x2="${cx}" y2="${bot - jw * 0.34}" stroke="${CLIP_EDGE}" stroke-width="2.5" opacity="0.55"/>
    <!-- ริมยางกันลื่นตรงปากงับ -->
    <rect x="${cx - jw / 2}" y="${bot - jw * 0.3}" width="${jw}" height="${jw * 0.3}" rx="${jw * 0.15}"
      fill="${CLIP_GRIP}" stroke="${CLIP_EDGE}" stroke-width="3"/>`;
};

/** ชิ้นงานไดคัท — บอดี้ขอบขาวทรงหยดตามซิลูเอตเป็ด + ลายเป็ดสกรีน (อะคริลิคใสจึงโปร่ง เห็นคลิปหลังจาง ๆ) */
const charm = (cx, groundY, hcm) => {
  const h = hcm * CM;
  const w = h * 0.82;
  const top = groundY - h;
  const cy = top + h / 2;
  // ขอบไดคัทเป็นทรงหยดมน (กว้างล่าง แคบบน) พอให้รู้ว่าไดคัทตามลาย ไม่ใช่สี่เหลี่ยม
  const blob = `M ${cx} ${top}
    C ${cx + w * 0.34} ${top} ${cx + w / 2} ${cy - h * 0.22} ${cx + w / 2} ${cy + h * 0.08}
    C ${cx + w / 2} ${groundY - h * 0.1} ${cx + w * 0.3} ${groundY} ${cx} ${groundY}
    C ${cx - w * 0.3} ${groundY} ${cx - w / 2} ${groundY - h * 0.1} ${cx - w / 2} ${cy + h * 0.08}
    C ${cx - w / 2} ${cy - h * 0.22} ${cx - w * 0.34} ${top} ${cx} ${top} Z`;
  return `
    <!-- แผ่นอะคริลิคใส โปร่งพอให้เห็นคลิปด้านหลัง -->
    <path d="${blob}" fill="#ffffff" opacity="0.72"/>
    <path d="${blob}" fill="#e8f4fb" opacity="0.45" stroke="#cbd5e1" stroke-width="4"/>
    ${(() => {
      const r = MASCOT.ratio;
      let ah = h * 0.82;
      let aw = ah * r;
      if (aw > w * 0.86) { aw = w * 0.86; ah = aw / r; }
      return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2 + h * 0.03}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>`;
    })()}
    <!-- ไฮไลต์ผิวอะคริลิคเงา -->
    <path d="M ${cx - w * 0.34} ${top + h * 0.1} Q ${cx - w * 0.44} ${cy} ${cx - w * 0.3} ${groundY - h * 0.14}"
      fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity="0.65"/>`;
};

/** เส้นชี้ + ป้ายกำกับ ชี้จากซ้ายไปขวา (ป้ายอยู่ปลายขวา) */
const callout = (x1, y1, x2, y2, text) => `
  <path d="M ${x1} ${y1} L ${x2} ${y2}" fill="none" stroke="${SUB}" stroke-width="2.5"/>
  <circle cx="${x1}" cy="${y1}" r="5" fill="${SUB}"/>
  <text x="${x2 + 10}" y="${y2 + 8}" font-family="${TH}" font-size="22" font-weight="700" fill="${SUB}">${text}</text>`;

/** ไม้บรรทัด 0-5 ซม. สเกลเดียวกับชิ้นงาน + ไฮไลต์ช่วง 0→ขนาดที่เลือก */
const ruler = (y, selCm) => {
  const x0 = 188;
  const len = 5 * CM;
  let ticks = "";
  for (let mm = 0; mm <= 50; mm += 1) {
    const x = x0 + (mm / 10) * CM;
    const big = mm % 10 === 0;
    const mid = mm % 5 === 0;
    ticks += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + (big ? 26 : mid ? 18 : 10)}" stroke="${big ? INK : "#94a3b8"}" stroke-width="${big ? 3 : 1.5}"/>`;
    if (big) ticks += `<text x="${x}" y="${y + 52}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">${mm / 10}</text>`;
  }
  const selX = x0 + selCm * CM;
  return `
    <rect x="${x0}" y="${y - 12}" width="${selCm * CM}" height="12" rx="4" fill="${OK}" opacity="0.25"/>
    <rect x="${x0}" y="${y}" width="${len}" height="0" />
    <line x1="${x0}" y1="${y}" x2="${x0 + len}" y2="${y}" stroke="${INK}" stroke-width="3"/>
    ${ticks}
    <line x1="${selX}" y1="${y - 34}" x2="${selX}" y2="${y + 26}" stroke="${OK}" stroke-width="3.5"/>
    <circle cx="${selX}" cy="${y - 34}" r="7" fill="${OK}"/>
    <text x="${x0 + len + 34}" y="${y + 30}" font-family="${TH}" font-size="20" fill="${SUB}">ซม.</text>`;
};

// ── การ์ดขนาด — ชิ้นงานหนีบกระดาษด้านซ้าย + เลขตัวใหญ่ขวา + ไม้บรรทัดล่าง ────
function sizeArt(sel) {
  const h = sel.cm * CM;
  const w = h * 0.82;
  const top = GROUND - h;
  const halfW = w / 2;
  const body = `
    ${title(`ขนาดด้านยาวที่สุด ${sel.cm} ซม.`, "วัดด้านที่ยาวที่สุดของชิ้นงานไดคัท · ทุกใบสเกลเดียวกัน")}
    ${clipBack(CHARM_CX, GROUND, sel.cm)}
    ${charm(CHARM_CX, GROUND, sel.cm)}
    ${clipGhost(CHARM_CX, GROUND, sel.cm)}
    ${sheet(CHARM_CX, GROUND, sel.cm)}
    ${clipJaw(CHARM_CX, GROUND, sel.cm)}
    ${dimV(CHARM_CX - halfW - 34, top, GROUND, `${sel.cm} ซม.`, -26)}
    <text x="700" y="330" font-family="${TH}" font-size="150" font-weight="800" text-anchor="middle" fill="${OK}">${sel.cm}</text>
    <text x="700" y="386" font-family="${TH}" font-size="36" font-weight="700" text-anchor="middle" fill="${SUB}">ซม.</text>
    ${callout(CHARM_CX + h * 0.15, GROUND + h * 0.2, 560, GROUND + h * 0.2 + 6, "คลิปหนีบแนวตั้ง ติดด้านหลัง")}
    <text x="700" y="452" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">หนีบรูป · โน้ต · เมนู</text>
    <text x="700" y="486" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">อะคริลิคหนา 3 มม. พิมพ์ UV</text>
    <text x="700" y="520" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ไดคัทตามลาย</text>
    ${ruler(800, sel.cm)}`;
  return frame(body);
}

// ── วาดการ์ดขนาด 6 ใบ ────────────────────────────────────────────────
const files = [];
for (const s of SIZES) {
  const buf = await sharp(Buffer.from(sizeArt(s))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const file = `${s.file}-${VER}.jpg`;
  writeFileSync(`${OUT}/${file}`, buf);
  files.push({ group: "ขนาดด้านยาวที่สุด", choice: s.choice, file, path: `${OUT}/${file}` });
  console.log(`🖼  ${file}  ${Math.round(buf.length / 1024)} KB — ${s.choice}`);
}

// ── ครอปชาร์ต HOW TO PRINT → สกรีนใต้ / สกรีนบน ─────────────────────
// ชาร์ตเต็ม 2867×5000 เรียง 2 คอลัมน์ · แถวบนสุด = สกรีน 1 ด้าน (ใต้) ซ้าย · (บน) ขวา
const CHART_URL = "https://static.wixstatic.com/media/959b83_87c211c630db4c6397260296e75557ba~mv2.jpg";
const chart = Buffer.from(await (await fetch(CHART_URL)).arrayBuffer());
const CROPS = [
  { choice: "สกรีนใต้", file: `screen-under-${VER}.jpg`, box: { left: 145, top: 505, width: 1280, height: 1015 } },
  { choice: "สกรีนบน", file: `screen-top-${VER}.jpg`, box: { left: 1445, top: 505, width: 1280, height: 1015 } },
];
for (const c of CROPS) {
  const buf = await sharp(chart).extract(c.box).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${c.file}`, buf);
  files.push({ group: "เทคนิค", choice: c.choice, file: c.file, path: `${OUT}/${c.file}` });
  console.log(`🖼  ${c.file}  ${Math.round(buf.length / 1024)} KB — ${c.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + ตั้ง choice.imageSrc ───────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const f of files) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, readFileSync(f.path), { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  f.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", f.url);
}

// รายการ imageSrc ที่จะตั้ง: ไฟล์ที่เพิ่งอัป + ชุดภาพ "ประเภท"/สีใส ที่มีอยู่แล้ว
const assigns = [
  ...files.map((f) => ({ group: f.group, choice: f.choice, url: f.url })),
  ...Object.entries(TYPE_ART).map(([choice, url]) => ({ group: "ประเภท", choice, url })),
  { group: "สีอะคริลิค", choice: "อะคริลิคใส", url: TYPE_ART["อะคริลิคใส"] },
];

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

for (const a of assigns) {
  const grp = (data.options ?? []).find((o) => o.label === a.group);
  if (!grp) { console.error(`ไม่เจอกลุ่ม "${a.group}"`); process.exit(1); }
  const c = grp.choices?.find((c) => c.name === a.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${a.choice}" ในกลุ่ม "${a.group}"`); process.exit(1); }
  c.imageSrc = a.url;
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const a of assigns) {
  const got = back.data.options.find((o) => o.label === a.group)?.choices?.find((c) => c.name === a.choice)?.imageSrc;
  if (got !== a.url) { console.error("อ่านกลับไม่ตรง!", a.group, a.choice, got); process.exit(1); }
}
console.log(`✓ ตั้ง imageSrc ครบ ${assigns.length} ตัวเลือก อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
