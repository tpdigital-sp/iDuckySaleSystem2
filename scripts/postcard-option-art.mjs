#!/usr/bin/env node
/**
 * ภาพจำลองตัวเลือกของ POSTCARD / โปสการ์ด (postcard-th) — กลุ่ม "ขนาด" และ "แนวโปสการ์ด"
 *
 *   node scripts/postcard-option-art.mjs           # วาดลง scripts/assets/postcard/ (ไม่อัป ไม่เขียน)
 *   node scripts/postcard-option-art.mjs --write   # อัปขึ้น storage + ติดภาพให้ตัวเลือก
 *
 * ผู้ใช้สั่ง 31 ส.ค. 69: สองกลุ่มนี้เป็นปุ่มเปล่า ๆ ขอ "ภาพจำลองตัวอย่าง"
 * วาดสไตล์เดียวกับภาพจำลองของ Photo card Digital (scripts/photocard-digital-option-art.mjs):
 * พื้นฟ้าอ่อน · การ์ดขาว · หัวข้อน้ำเงิน + คำอธิบายเทาใต้ภาพ · ตัวเป็ดยืมจากแผ่น HOW TO PRINT ของร้าน
 *
 * ⚠️ ไม่วาดผังตัดบนแผ่น A3 — ร้านนับ "8 ใบ/A3" ตามพื้นที่ (4×6 นิ้ว = 24 ตร.นิ้ว × 8 ≈ A3)
 *    แต่วางเรียงจริงบน A3 ได้ไม่ถึง 8 ใบ ภาพผังจึงจะขัดกับของจริง — โชว์ขนาดใบจริงเทียบกันแทน
 *    (กับดักเดียวกับที่บันทึกไว้เรื่องขนาด 4 × 6 นิ้ว)
 *
 * ทั้ง 4 ภาพวาดด้วยสเกลเดียวกัน (1 นิ้ว = 46 px) — ใบ 5x7 จึงใหญ่กว่า 4x6 จริง ๆ ในภาพ
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "postcard-th";
const OUT = "scripts/assets/postcard";
const DUCK = "scripts/assets/photocard-pvc/duck.png";

const W = 800;
const H = 800;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const BG = "#eff6fe";
const BLUE = "#2f7fd4";
const SUB = "#767d85";
const LABEL = "#5b6673";
const EDGE = "#d8e3f2";
const DIM = "#9fb3c8";        // เส้นบอกขนาด
const PPI = 46;               // พิกเซลต่อนิ้ว — สเกลเดียวกันทุกภาพ

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const art = (id, from, to) => `
  <linearGradient id="${id}" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
  </linearGradient>`;

/** โปสการ์ด 1 ใบ (ลายไล่สี + เงา) */
const card = (x, y, w, h, fill) => `
  <rect x="${x + 5}" y="${y + 7}" width="${w}" height="${h}" rx="12" fill="#000" opacity="0.07"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${EDGE}" stroke-width="2"/>`;

/** กรอบประ = ขนาดอีกแบบ วางเทียบข้างกัน (ชิดขอบล่างเดียวกัน) ให้เห็นว่าใหญ่/เล็กกว่ากันแค่ไหน */
const ghost = (x, y, w, h, text) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="none" stroke="${DIM}"
        stroke-width="2" stroke-dasharray="7 6"/>
  <text x="${x + w / 2}" y="${y + h / 2 + 7}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${DIM}">${esc(text)}</text>`;

/** เส้นบอกความกว้าง (ใต้ใบ) และความสูง (ข้างใบ) */
const dims = (x, y, w, h, wTxt, hTxt) => `
  <line x1="${x}" y1="${y + h + 22}" x2="${x + w}" y2="${y + h + 22}" stroke="${DIM}" stroke-width="2"/>
  <line x1="${x}" y1="${y + h + 14}" x2="${x}" y2="${y + h + 30}" stroke="${DIM}" stroke-width="2"/>
  <line x1="${x + w}" y1="${y + h + 14}" x2="${x + w}" y2="${y + h + 30}" stroke="${DIM}" stroke-width="2"/>
  <text x="${x + w / 2}" y="${y + h + 48}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${LABEL}">${esc(wTxt)}</text>
  <line x1="${x + w + 22}" y1="${y}" x2="${x + w + 22}" y2="${y + h}" stroke="${DIM}" stroke-width="2"/>
  <line x1="${x + w + 14}" y1="${y}" x2="${x + w + 30}" y2="${y}" stroke="${DIM}" stroke-width="2"/>
  <line x1="${x + w + 14}" y1="${y + h}" x2="${x + w + 30}" y2="${y + h}" stroke="${DIM}" stroke-width="2"/>
  <text x="${x + w + 38}" y="${y + h / 2 + 7}" font-family="${TH}" font-size="21" fill="${LABEL}">${esc(hTxt)}</text>`;

/** ด้านหลังโปสการ์ด — เส้นจ่าหน้า + ช่องแสตมป์ (ใช้ในภาพกลุ่มแนว) */
const backSide = (x, y, w, h) => {
  const pad = Math.round(w * 0.08);
  const stampW = Math.round(w * 0.17);
  const stampH = Math.round(stampW * 1.25);
  const lines = [];
  const n = 4;
  const top = y + pad + stampH + Math.round(h * 0.06);
  const gap = Math.round((h - (top - y) - pad) / n);
  for (let i = 0; i < n; i++)
    lines.push(`<line x1="${x + pad + w * 0.34}" y1="${top + i * gap}" x2="${x + w - pad}" y2="${top + i * gap}"
                      stroke="${EDGE}" stroke-width="3" stroke-linecap="round"/>`);
  return `
    ${card(x, y, w, h, "#fdfdfb")}
    <line x1="${x + w * 0.3}" y1="${y + pad}" x2="${x + w * 0.3}" y2="${y + h - pad}"
          stroke="${EDGE}" stroke-width="2" stroke-dasharray="4 6"/>
    <rect x="${x + w - pad - stampW}" y="${y + pad}" width="${stampW}" height="${stampH}" rx="4"
          fill="none" stroke="${EDGE}" stroke-width="3"/>
    ${lines.join("")}`;
};

const caption = (title, lines) => `
  <text x="${W / 2}" y="620" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${BLUE}">${esc(title)}</text>
  ${lines
    .map((l, i) => `<text x="${W / 2}" y="${670 + i * 38}" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${esc(l)}</text>`)
    .join("")}`;

const duckBuf = readFileSync(DUCK);
/** เป็ดวางกลางการ์ด (สูงราวครึ่งใบ) */
async function duck(x, y, w, h, flip = false) {
  const dh = Math.round(h * 0.52);
  let img = sharp(duckBuf).resize({ height: dh });
  if (flip) img = img.flop();
  const buf = await img.toBuffer();
  const { width } = await sharp(buf).metadata();
  return { input: buf, left: Math.round(x + (w - width) / 2), top: Math.round(y + (h - dh) / 2) };
}

async function render(name, svg, overlays = []) {
  const base = sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
       <rect width="${W}" height="${H}" fill="${BG}"/>${svg}</svg>`
  ));
  const buf = await base.composite(overlays).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`✓ ${OUT}/${name}.jpg  ${Math.round(buf.length / 1024)} KB`);
  return `${name}.jpg`;
}

mkdirSync(OUT, { recursive: true });

// ── กลุ่ม "ขนาด" — โชว์ใบจริงตามสเกล + กรอบประของอีกขนาดเทียบ ───────────────
const in46 = { w: 6 * PPI, h: 4 * PPI }; // 4 × 6 นิ้ว วางแนวนอน
const in57 = { w: 7 * PPI, h: 5 * PPI }; // 5 × 7 นิ้ว วางแนวนอน
const CY = 200;

/** วางใบจริง + กรอบประของอีกขนาด ชิดขอบล่างเดียวกัน ไม่ทับกัน (ทั้งชุดจัดกลางภาพ) */
const CGAP = 34;
const layout = (main, other) => {
  const bottom = CY + Math.max(main.h, other.h);
  const totalW = main.w + CGAP + other.w;
  const x = Math.round((W - totalW) / 2);
  return { mx: x, my: bottom - main.h, ox: x + main.w + CGAP, oy: bottom - other.h };
};

const L46 = layout(in46, in57);
await render(
  "size-4x6",
  `<defs>${art("g1", "#cfe6ff", "#ffe1ef")}</defs>
   ${card(L46.mx, L46.my, in46.w, in46.h, "url(#g1)")}
   ${ghost(L46.ox, L46.oy, in57.w, in57.h, "5 × 7 นิ้ว")}
   ${dims(L46.mx, L46.my, in46.w, in46.h, "6 นิ้ว (15.2 ซม.)", "4 นิ้ว")}
   ${caption("ขนาด 4 × 6 นิ้ว", ["10.2 × 15.2 ซม. — ขนาดโปสการ์ดมาตรฐาน", "ได้ 8 ใบ ต่อกระดาษ 1 แผ่น A3"])}`,
  [await duck(L46.mx, L46.my, in46.w, in46.h)]
);

const L57 = layout(in57, in46);
await render(
  "size-5x7",
  `<defs>${art("g2", "#d8f3e4", "#ffeccc")}</defs>
   ${card(L57.mx, L57.my, in57.w, in57.h, "url(#g2)")}
   ${ghost(L57.ox, L57.oy, in46.w, in46.h, "4 × 6 นิ้ว")}
   ${dims(L57.mx, L57.my, in57.w, in57.h, "7 นิ้ว (17.8 ซม.)", "5 นิ้ว")}
   ${caption("ขนาด 5 × 7 นิ้ว", ["12.7 × 17.8 ซม. — ใหญ่กว่าแบบมาตรฐาน", "ได้ 4 ใบ ต่อกระดาษ 1 แผ่น A3"])}`,
  [await duck(L57.mx, L57.my, in57.w, in57.h)]
);

// ── กลุ่ม "แนวโปสการ์ด" — ด้านหน้ามีลาย + ด้านหลังจ่าหน้า วางตามแนวที่เลือก ──
const LGAP = 40;
const land = { w: 6 * PPI, h: 4 * PPI };
const lx = Math.round((W - (land.w * 2 + LGAP)) / 2);
await render(
  "orient-landscape",
  `<defs>${art("g1", "#cfe6ff", "#ffe1ef")}</defs>
   ${card(lx, CY + 20, land.w, land.h, "url(#g1)")}
   ${backSide(lx + land.w + LGAP, CY + 20, land.w, land.h)}
   <text x="${lx + land.w / 2}" y="${CY + land.h + 62}" font-family="${TH}" font-size="22" font-weight="600" text-anchor="middle" fill="${LABEL}">ด้านหน้า (ลายของคุณ)</text>
   <text x="${lx + land.w + LGAP + land.w / 2}" y="${CY + land.h + 62}" font-family="${TH}" font-size="22" font-weight="600" text-anchor="middle" fill="${LABEL}">ด้านหลัง (จ่าหน้า)</text>
   ${caption("แนวนอน", ["ด้านยาวอยู่แนวนอน เหมาะกับลายวิว/ภาพหมู่", "ราคาเท่ากับแนวตั้ง"])}`,
  [await duck(lx, CY + 20, land.w, land.h)]
);

const port = { w: 4 * PPI, h: 6 * PPI };
const px = Math.round((W - (port.w * 2 + LGAP)) / 2);
await render(
  "orient-portrait",
  `<defs>${art("g1", "#cfe6ff", "#ffe1ef")}</defs>
   ${card(px, CY - 40, port.w, port.h, "url(#g1)")}
   ${backSide(px + port.w + LGAP, CY - 40, port.w, port.h)}
   <text x="${px + port.w / 2}" y="${CY + port.h + 2}" font-family="${TH}" font-size="22" font-weight="600" text-anchor="middle" fill="${LABEL}">ด้านหน้า (ลายของคุณ)</text>
   <text x="${px + port.w + LGAP + port.w / 2}" y="${CY + port.h + 2}" font-family="${TH}" font-size="22" font-weight="600" text-anchor="middle" fill="${LABEL}">ด้านหลัง (จ่าหน้า)</text>
   ${caption("แนวตั้ง", ["ด้านยาวอยู่แนวตั้ง เหมาะกับลายตัวละคร/โปสเตอร์", "ราคาเท่ากับแนวนอน"])}`,
  [await duck(px, CY - 40, port.w, port.h)]
);

if (!WRITE) {
  console.log(`\n(ยังไม่อัป/ไม่เขียน — เปิดดูภาพใน ${OUT} แล้วรัน --write ถ้าโอเค)`);
  process.exit(0);
}

// ── อัปขึ้น storage + ติดภาพให้ตัวเลือก ──────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}`;

const MAP = {
  ขนาด: { "4 × 6 นิ้ว": "size-4x6.jpg", "5 × 7 นิ้ว": "size-5x7.jpg" },
  แนวโปสการ์ด: { แนวนอน: "orient-landscape.jpg", แนวตั้ง: "orient-portrait.jpg" },
};
for (const file of Object.values(MAP).flatMap((m) => Object.values(m))) {
  const buf = readFileSync(`${OUT}/${file}`);
  const { error } = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/opt-${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  console.log(`⬆️  opt-${file} (${Math.round(buf.length / 1024)} KB)`);
}

const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
if (!/POSTCARD|โปสการ์ด/i.test(row.name)) throw new Error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
const d = structuredClone(row.data);
for (const [label, files] of Object.entries(MAP)) {
  const g = (d.options ?? []).find((o) => o.label === label);
  if (!g) throw new Error(`ไม่เจอกลุ่ม "${label}" — โครงตัวเลือกเปลี่ยน มาดูเองก่อน`);
  g.display = "cards"; // ปุ่มเปล่าโชว์รูปไม่ได้ ต้องเป็นการ์ด
  for (const c of g.choices) {
    const file = files[c.name];
    if (!file) throw new Error(`ไม่รู้จะใช้ภาพไหนกับตัวเลือก "${c.name}" ในกลุ่ม ${label} — มาดูเองก่อน`);
    c.imageSrc = `${BASE}/opt-${file}`;
  }
}
const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (saveErr) throw saveErr;

const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", ID).single();
if (backErr) throw backErr;
for (const [label, files] of Object.entries(MAP)) {
  const g = back.data.options.find((o) => o.label === label);
  if (g.display !== "cards") throw new Error(`กลุ่ม ${label} ยังไม่ใช่การ์ด`);
  for (const c of g.choices) {
    const want = `${BASE}/opt-${files[c.name]}`;
    if (c.imageSrc !== want) throw new Error(`อ่านกลับไม่ตรง ${label}/${c.name}: ${c.imageSrc}`);
    const res = await fetch(want, { method: "HEAD" });
    if (res.status !== 200) throw new Error(`ไฟล์ ${want} เปิดไม่ได้: HTTP ${res.status}`);
    console.log(`✓ ${label} · ${c.name} → opt-${files[c.name]}`);
  }
}
console.log("\n✅ บันทึกแล้ว — กลุ่มขนาด/แนวโปสการ์ดเป็นการ์ดมีภาพจำลองครบทุกตัวเลือก");
