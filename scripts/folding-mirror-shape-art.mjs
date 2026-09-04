#!/usr/bin/env node
/**
 * กระจกพับ (mirror-4) — ภาพตัวอย่างกลุ่ม "รูปทรง" 3 ตัวเลือก
 *
 *   node scripts/folding-mirror-shape-art.mjs            (วาดภาพลง .cache/mirror-4/upload ดูก่อน)
 *   node scripts/folding-mirror-shape-art.mjs --write    (+ อัปโหลด storage + เติม imageSrc + อ่านกลับเทียบ)
 *
 * วาดตลับกระจกพับ 3 ทรงพร้อมลูกศรวัดขนาด — สเกลเดียวกันทุกใบ (PPM คงที่) เทียบขนาดกันได้จริง:
 *   กระจกทรงสี่เหลี่ยม [ 61x95mm ] · กระจกทรงหัวใจ [70x70mm] · กระจกทรงกลม [70mm]
 * กลุ่มเป็น dropdown — ProductDetail โชว์ภาพของตัวที่เลือกข้างเมนู + เด้งแกลเลอรีตอนเปลี่ยน
 *
 * ⚠️ "รูปทรง" เป็นแกนตารางราคา (driverLabels) — สคริปต์นี้แตะแค่ imageSrc ห้ามแตะชื่อตัวเลือก
 * รันซ้ำได้: เขียนทับ imageSrc ตัวเดิม · แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ (CDN/Next แคช 30 วัน)
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const HEART = await mascotDataUri("heart", 420);

const PRODUCT_ID = "mirror-4";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/mirror-4/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SHAPE_GROUP = "รูปทรง";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const PPM = 4.2; // px ต่อ mm — คงที่ทุกใบให้เทียบขนาดกันได้
const CY = 430; // จุดกึ่งกลางแนวตั้งของชิ้นงาน

/** กรอบการ์ด + หัวเรื่อง/หมายเหตุ (ชุดเดียวกับ folding-mirror-screen-option) */
const card = (title, subtitle, body, note1 = "", note2 = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

/** ลูกศรวัดขนาด (ทรงเดียวกับ lighter-size-option-art) */
const dim = (x1, y1, x2, y2, label) => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + 30;
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12.5 : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

/** เนื้อฝาหนังขาว + ขอบ + ลายมาสคอต clip ในทรง — shapeSvg(fillAttr) คืน element ของทรงนั้น */
const lid = (shapeOf, cx, cy, artW, artH, id) => `
  <defs>
    <clipPath id="clip-${id}">${shapeOf("")}</clipPath>
    <radialGradient id="sheen-${id}" cx="0.32" cy="0.26" r="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.55" stop-color="#fdfcfa"/>
      <stop offset="1" stop-color="#eceef2"/>
    </radialGradient>
  </defs>
  ${shapeOf(`fill="url(#sheen-${id})" stroke="#d6dae1" stroke-width="3"`)}
  <image href="${HEART.uri}" x="${cx - artW / 2}" y="${cy - artH / 2}" width="${artW}" height="${artH}"
    preserveAspectRatio="xMidYMid meet" clip-path="url(#clip-${id})"/>`;

/** บานพับเงินบนสุด */
const hinge = (cx, topY, w = 66) => `
  <rect x="${cx - w / 2}" y="${topY - 14}" width="${w}" height="26" rx="9"
    fill="#9ca3af" stroke="#6b7280" stroke-width="2.5"/>
  <line x1="${cx}" y1="${topY - 12}" x2="${cx}" y2="${topY + 2}" stroke="#6b7280" stroke-width="2"/>`;

// ── ทรงสี่เหลี่ยม 61×95 มม. ──────────────────────────────────────────
function squareArt() {
  const cx = W / 2;
  const w = 61 * PPM;
  const h = 95 * PPM;
  const x = cx - w / 2;
  const y = CY - h / 2;
  const shapeOf = (a) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="34" ${a}/>`;
  const artW = w * 0.72;
  const body = `
  ${hinge(cx, y)}
  ${lid(shapeOf, cx, CY, artW, artW / HEART.ratio, "sq")}
  ${dim(x - 46, y, x - 46, y + h, "95 มม.")}
  ${dim(x, y + h + 40, x + w, y + h + 40, "61 มม.")}`;
  return card("กระจกทรงสี่เหลี่ยม 61 × 95 มม.", "ตลับกระจกพับ พิมพ์ลายตามสั่ง", body,
    "เปิดฝาด้านในเป็นกระจก · สกรีนลายได้ 1-2 ด้าน");
}

// ── ทรงหัวใจ 70×70 มม. ───────────────────────────────────────────────
function heartArt() {
  const cx = W / 2;
  const w = 70 * PPM;
  const h = 65 * PPM;
  const x = cx - w / 2;
  const yTop = CY - h / 2;
  // หัวใจทรงอวบตามของจริง (รูปงานจริงหน้า /mirror ที่ผู้ใช้ส่ง 3 ก.ย. 69):
  // ติ่งบนกลมใหญ่ · ร่องกลางตื้น · ข้างป่อง · ปลายล่างมน ไม่แหลม — หัวใจมาตรฐานร่องลึกโดนตีกลับ
  const P = (ux, uy) => `${(cx + (ux * w) / 2).toFixed(1)} ${(CY + (uy * h) / 2).toFixed(1)}`;
  // เส้นขอบเทรซจากรูปงานจริง (959b83_9e08d6a7...DSC02552) — 72 จุด สมมาตร+ลบมุมเอียงแล้ว
  // ที่มา: flood segment → ray-march ขอบแรก → แกนสมมาตร 65.5° → เฉลี่ยกระจก → aspect 1.077 = 70/65 พอดี
  const PTS = [[-0.000,-0.982],[-0.072,-0.991],[-0.146,-0.999],[-0.222,-1.000],[-0.299,-0.993],[-0.376,-0.976],[-0.455,-0.957],[-0.538,-0.935],[-0.617,-0.900],[-0.691,-0.852],[-0.763,-0.797],[-0.823,-0.729],[-0.872,-0.650],[-0.917,-0.568],[-0.963,-0.485],[-0.982,-0.391],[-0.993,-0.296],[-1.000,-0.202],[-0.975,-0.108],[-0.956,-0.017],[-0.931,0.069],[-0.900,0.152],[-0.862,0.231],[-0.821,0.305],[-0.776,0.375],[-0.729,0.442],[-0.682,0.509],[-0.632,0.573],[-0.579,0.636],[-0.520,0.692],[-0.456,0.744],[-0.390,0.794],[-0.321,0.844],[-0.249,0.892],[-0.171,0.940],[-0.088,0.982],[0.000,1.000],[0.088,0.982],[0.171,0.940],[0.249,0.892],[0.321,0.844],[0.390,0.794],[0.456,0.744],[0.520,0.692],[0.579,0.636],[0.632,0.573],[0.682,0.509],[0.729,0.442],[0.776,0.375],[0.821,0.305],[0.862,0.231],[0.900,0.152],[0.931,0.069],[0.956,-0.017],[0.975,-0.108],[1.000,-0.202],[0.993,-0.296],[0.982,-0.391],[0.963,-0.485],[0.917,-0.568],[0.872,-0.650],[0.823,-0.729],[0.763,-0.797],[0.691,-0.852],[0.617,-0.900],[0.538,-0.935],[0.455,-0.957],[0.376,-0.976],[0.299,-0.993],[0.222,-1.000],[0.146,-0.999],[0.072,-0.991]];
  const pathD = (() => {
    const q = PTS.map(([ux, uy]) => [cx + (ux * w) / 2, CY + (uy * h) / 2]);
    const nn = q.length;
    let d2 = `M ${q[0][0].toFixed(1)} ${q[0][1].toFixed(1)}`;
    for (let i = 0; i < nn; i++) {
      const p0 = q[(i - 1 + nn) % nn], p1 = q[i], p2 = q[(i + 1) % nn], p3 = q[(i + 2) % nn];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d2 += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d2 + " Z";
  })();
  const shapeOf = (a) => `<path d="${pathD}" ${a}/>`;
  // มาสคอตต้องอยู่ในแถบ 0.26h-0.78h (ใต้ร่องกลาง · เหนือช่วงปลายสอบ) ไม่งั้นโดนขอบทรง clip แหว่ง
  const artH = h * 0.5;
  const artW = artH * HEART.ratio;
  // บานพับ: ผู้ใช้สั่ง "เอาออก หรือถ้ามีต้องมีทั้ง 2 ฝั่ง" — ของจริงมีบานพับคู่บนติ่งซ้าย-ขวา
  // เปิดด้วย --hinges (ค่าเริ่มต้น = ไม่วาด)
  // บานพับทรงกระบอกเงิน 3 ข้อแบบของจริง — ชิดร่องกลาง (unit x ±0.28) เอียงตามขอบนิดเดียว
  const barrel = (bx, by, id2) => `
    <defs><linearGradient id="mtl-${id2}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f1f5f9"/><stop offset="0.45" stop-color="#cbd5e1"/>
      <stop offset="1" stop-color="#8a94a3"/></linearGradient></defs>
    <rect x="${bx - 33}" y="${by - 17}" width="66" height="30" rx="12"
      fill="url(#mtl-${id2})" stroke="#6b7280" stroke-width="2.5"/>
    <line x1="${bx - 11}" y1="${by - 16}" x2="${bx - 11}" y2="${by + 12}" stroke="#6b7280" stroke-width="2"/>
    <line x1="${bx + 11}" y1="${by - 16}" x2="${bx + 11}" y2="${by + 12}" stroke="#6b7280" stroke-width="2"/>`;
  const hy = CY - (h / 2) * 0.945; // ฝัง ~2/3 ของกระบอกลงขอบฝา ไม่ให้ลอยมีช่องว่าง
  const hx = w * 0.16;
  const hinges = process.argv.includes("--hinges")
    ? `<g transform="rotate(-6 ${cx - hx} ${hy})">${barrel(cx - hx, hy, "hl")}</g>
       <g transform="rotate(6 ${cx + hx} ${hy})">${barrel(cx + hx, hy, "hr")}</g>`
    : "";
  const body = `
  ${hinges}
  ${lid(shapeOf, cx, yTop + h * 0.52, artW, artH, "ht")}
  ${dim(x - 52, yTop, x - 52, yTop + h, "65 มม.")}
  ${dim(x, yTop + h + 40, x + w, yTop + h + 40, "70 มม.")}`;
  return card("กระจกทรงหัวใจ 70 × 65 มม.", "ตลับกระจกพับ พิมพ์ลายตามสั่ง", body,
    "เปิดฝาด้านในเป็นกระจก · สกรีนลายได้ 1-2 ด้าน");
}

// ── ทรงกลม 70 มม. ────────────────────────────────────────────────────
function roundArt() {
  const cx = W / 2;
  const R = (70 * PPM) / 2;
  const shapeOf = (a) => `<circle cx="${cx}" cy="${CY}" r="${R}" ${a}/>`;
  const artW = R * 1.15;
  const body = `
  ${hinge(cx, CY - R)}
  ${lid(shapeOf, cx, CY, artW, artW / HEART.ratio, "rd")}
  ${dim(cx - R, CY + R + 40, cx + R, CY + R + 40, "70 มม.")}`;
  return card("กระจกทรงกลม 70 มม.", "ตลับกระจกพับ พิมพ์ลายตามสั่ง — เส้นผ่านศูนย์กลาง 70 มม.", body,
    "เปิดฝาด้านในเป็นกระจก · สกรีนลายได้ 1-2 ด้าน");
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
const JOBS = [
  { file: "shape-square-v2.jpg", svg: squareArt(), choice: "กระจกทรงสี่เหลี่ยม [ 61x95mm ]" },
  // ชื่อไฟล์ผูกกับโหมดบานพับ — v6 = ไม่มีบานพับ · v7 = บานพับคู่ 2 ฝั่ง (กันรันคนละโหมดแล้วทับไฟล์กัน)
  { file: process.argv.includes("--hinges") ? "shape-heart-v8.jpg" : "shape-heart-v6.jpg", svg: heartArt(), choice: "กระจกทรงหัวใจ [70x65mm]" },
  { file: "shape-round-v2.jpg", svg: roundArt(), choice: "กระจกทรงกลม [70mm]" },
];

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${SHAPE_GROUP}: ${j.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เติม imageSrc ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const j of JOBS) {
  const key = `products/${PRODUCT_ID}/${j.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, j.buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  j.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
}
console.log(`อัปโหลดแล้ว ${JOBS.length} ไฟล์ → products/${PRODUCT_ID}/`);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(data, null, 1));

const g = (data.options ?? []).find((o) => o.label === SHAPE_GROUP);
if (!g) { console.error(`ไม่เจอกลุ่ม "${SHAPE_GROUP}"`); process.exit(1); }
for (const j of JOBS) {
  const c = g.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${SHAPE_GROUP}: ${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url;
}

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — ชื่อตัวเลือก (แกนราคา) ต้องไม่ขยับ + imageSrc ลงครบ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bg = back.data.options.find((o) => o.label === SHAPE_GROUP);
for (const j of JOBS) {
  const c = bg?.choices?.find((c) => c.name === j.choice);
  if (c?.imageSrc !== j.url) { console.error("อ่านกลับไม่ตรง!", j.choice, c); process.exit(1); }
  if (!back.data.pricing?.cells?.[j.choice]) { console.error("cell แกนราคาหาย!", j.choice); process.exit(1); }
}
console.log(`✓ ภาพตัวเลือก ${JOBS.length} ภาพ อ่านกลับตรงทุกตัว · cells แกนราคาครบ · savedAt =`, back.data.savedAt);
