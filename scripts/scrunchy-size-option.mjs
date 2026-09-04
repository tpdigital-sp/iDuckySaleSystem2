#!/usr/bin/env node
/**
 * Scrunchy / ยางรัดผมผ้าซาติน (scrunchy) — เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบ
 *
 *   node scripts/scrunchy-size-option.mjs            (วาดภาพลง .cache/scrunchy/upload ดูก่อน)
 *   node scripts/scrunchy-size-option.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ใบสเปค 40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/35_หนังยาง ผ้าคลุมไหล่ ผ้าผูก/P-nitemยางพันไหล่-01.jpg:
 *   ยางรัดผม · ผ้าซาติน อินโด · (กว้าง 5 x ยาว 45 cm) · ราคาเริ่มต้น 90.-  → มีขนาดเดียว
 *   (ตรงกับ body ในหน้าสินค้า "ขนาด กว้าง 5 x ยาว 45 cm")
 *
 * เพิ่มกลุ่ม "ขนาด" ไว้เป็นกลุ่มแรก display "cards" — ตัวเลือกเดียว ไม่บวกราคา
 * ⚠️ pricing/priceRates ของตัวนี้เป็นคอลัมน์เดียว (cells [""] · driverLabels []) — กลุ่มนี้ต้องไม่เป็นแกนราคา
 *    ห้ามใส่ชื่อกลุ่มลง driverLabels ไม่งั้นคีย์ตารางราคาไม่ตรง ราคาหล่นไป product.price ([[iducky-price-driver-trap]])
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("peace", 220);

const PRODUCT_ID = "scrunchy";
const VER = "v2";

/* v2 (4 ก.ย. 69): ผู้ใช้ขอเปลี่ยนภาพ — เลิกวาดวงยางเอง เอา "รูปงานจริง" จากแกลเลอรีสินค้ามาครอปวางกลางการ์ดแทน
   (v1 วาดวงจีบเองด้วย SVG ดูเป็นการ์ตูนเกินไป) · ครอปเอาเฉพาะวงยางบนพื้นชมพู ตัดหวี/ดอกไม้รอบ ๆ ออก */
const PHOTO_URL = `https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/${PRODUCT_ID}/3187fc25-317b-407e-b9e8-561394f5a0a9.jpg`;
const PHOTO_CROP = { left: 355, top: 150, width: 530, height: 530 };   // ภาพต้นทาง 1200×750 — วงยางอยู่กลางค่อนซ้าย
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/scrunchy/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "กว้าง 5 × ยาว 45 ซม.";
const SIZE_DESC = "ผ้าซาตินอินโด ขนาดเดียว — ผืนก่อนเย็บ กว้าง 5 ยาว 45 ซม. เย็บเป็นวงยางรัดผม พิมพ์ลายเต็มผืน";
const FILE = `size-5x45-${VER}.jpg`;

/** รูปงานจริงจากแกลเลอรีสินค้า — ครอปเฉพาะวงยาง ย่อ แล้วคืนเป็น data URI ไว้ฝังใน SVG */
async function photoDataUri() {
  const res = await fetch(PHOTO_URL);
  if (!res.ok) throw new Error(`โหลดรูปงานจริงไม่ได้ (${res.status}) ${PHOTO_URL}`);
  const src = Buffer.from(await res.arrayBuffer());
  const buf = await sharp(src).extract(PHOTO_CROP).resize(560).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}
const PHOTO = await photoDataUri();

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ placemat-size-option) */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 30 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (label.length * 12.5) / 2}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="middle" fill="${SUB}">${label}</text>`;
};

/**
 * ภาพ "ขนาดยางรัดผม" — รูปงานจริงครอปวางกลางภาพ (ตรงกับกรอบที่ปุ่มการ์ดครอป 300–600)
 * + ผืนผ้าก่อนเย็บ 5 × 45 ซม. พร้อมลูกศรวัดสองแกน ให้เห็นที่มาของตัวเลขขนาด
 */
function sizeArt() {
  const cx = W / 2;
  /* กรอบรูปงานจริง 320×320 วางกลางภาพพอดี (290–610) — ปุ่มการ์ดครอปกลาง 300–600 จะเห็นวงยางเกือบเต็มรูป */
  const PS = 320;
  const px = cx - PS / 2;
  const py = 450 - PS / 2;

  /* ผืนผ้าก่อนเย็บ — 1 ซม. = 14 px → 45×5 ซม. = 630×70 px */
  const CM = 14;
  const SW = 45 * CM;
  const SH = 5 * CM;
  const sx = cx - SW / 2;
  const sy = 676;
  const mh = SH * 0.78;
  const mw = mh * MASCOT.ratio;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="satinFlat" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#9fe0ea"/>
      <stop offset="0.22" stop-color="#f2fdff"/>
      <stop offset="0.5" stop-color="#5ccbdc"/>
      <stop offset="0.78" stop-color="#fdf2f8"/>
      <stop offset="1" stop-color="#f9a8d4"/>
    </linearGradient>
    <!-- ลายพิมพ์ซับลิเมชั่นบนผืนผ้าตัวอย่าง (จุดโทนแบรนด์) -->
    <pattern id="dots" width="54" height="54" patternUnits="userSpaceOnUse">
      <circle cx="12" cy="12" r="4.5" fill="#0369a1" opacity="0.42"/>
      <circle cx="38" cy="32" r="3" fill="#db2777" opacity="0.40"/>
      <circle cx="22" cy="45" r="2" fill="#0369a1" opacity="0.35"/>
    </pattern>
    <clipPath id="photo"><rect x="${px}" y="${py}" width="${PS}" height="${PS}" rx="30"/></clipPath>
    <clipPath id="strip"><rect x="${sx}" y="${sy}" width="${SW}" height="${SH}" rx="${SH / 2}"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${cx}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด กว้าง 5 × ยาว 45 ซม.</text>
  <text x="${cx}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">ผ้าซาตินอินโด พิมพ์ซับลิเมชั่นเต็มผืน — ขนาดเดียว</text>

  <!-- รูปงานจริง (ครอปจากแกลเลอรีสินค้า) -->
  <rect x="${px + 6}" y="${py + 12}" width="${PS}" height="${PS}" rx="30" fill="#0f172a" opacity="0.10"/>
  <image href="${PHOTO}" x="${px}" y="${py}" width="${PS}" height="${PS}" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)"/>
  <rect x="${px}" y="${py}" width="${PS}" height="${PS}" rx="30" fill="none" stroke="#e2e8f0" stroke-width="3"/>
  <!-- ผืนผ้าก่อนเย็บ 5 × 45 ซม. -->
  <text x="${cx}" y="${sy - 22}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${SUB}">ผืนผ้าก่อนเย็บ — พิมพ์ลายเต็มผืนแล้วเย็บเป็นวง</text>
  <rect x="${sx}" y="${sy + 8}" width="${SW}" height="${SH}" rx="${SH / 2}" fill="#0f172a" opacity="0.06"/>
  <rect x="${sx}" y="${sy}" width="${SW}" height="${SH}" rx="${SH / 2}" fill="url(#satinFlat)" stroke="#7cc6d3" stroke-width="2.5"/>
  <g clip-path="url(#strip)">
    <rect x="${sx}" y="${sy}" width="${SW}" height="${SH}" fill="url(#dots)"/>
    ${[0.16, 0.5, 0.84].map((t) => `<image href="${MASCOT.uri}" x="${(sx + SW * t - mw / 2).toFixed(1)}" y="${(sy + (SH - mh) / 2).toFixed(1)}" width="${mw.toFixed(1)}" height="${mh.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`).join("")}
    <!-- ตะเข็บเย็บริมบน-ล่าง -->
    <line x1="${sx}" y1="${sy + 9}" x2="${sx + SW}" y2="${sy + 9}" stroke="#2b93a6" stroke-width="2" stroke-dasharray="9 6" opacity="0.6"/>
    <line x1="${sx}" y1="${sy + SH - 9}" x2="${sx + SW}" y2="${sy + SH - 9}" stroke="#2b93a6" stroke-width="2" stroke-dasharray="9 6" opacity="0.6"/>
  </g>

  <!-- ลูกศรวัดสองแกนของผืนผ้า -->
  ${dim(sx, sy + SH + 40, sx + SW, sy + SH + 40, "45 ซม.")}
  ${dim(sx - 40, sy, sx - 40, sy + SH, "5 ซม.")}

  <text x="${cx}" y="${H - 34}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">เนื้อนุ่มลื่นไม่ทำร้ายเส้นผม · เลือกสีไหมเย็บได้ 13 สี · ไม่มีขั้นต่ำ</text>
</svg>`;
}

const buf = await sharp(Buffer.from(sizeArt())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/${FILE}`, buf);
/* ครอปกลาง 300–600 ไว้ตรวจว่าที่เห็นบนปุ่มการ์ด (48×48 object-cover) ยังอ่านออกว่าเป็นยางรัดผม */
await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/_thumb-${FILE}`);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ยางรัดผม 5 × 45 ซม. (+ _thumb ครอปกลาง)`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const key = `products/${PRODUCT_ID}/${FILE}`;
const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
const sizeUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", sizeUrl);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

// กลุ่ม "ขนาด" — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกไว้เป็นกลุ่มแรก
const sizeGroup = {
  label: SIZE_GROUP,
  display: "cards",
  note: "ยางรัดผมผ้าซาตินมีขนาดเดียว — ผืนก่อนเย็บ กว้าง 5 × ยาว 45 ซม. (ตามใบสเปคร้าน)",
  choices: [{ name: SIZE_CHOICE, desc: SIZE_DESC, imageSrc: sizeUrl }],
};
const atSize = options.findIndex((o) => o.label === SIZE_GROUP);
if (atSize >= 0) options[atSize] = sizeGroup;
else options.splice(0, 0, sizeGroup);

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === SIZE_GROUP);
const got = g?.choices?.[0];
if (g?.display !== "cards" || got?.name !== SIZE_CHOICE || got?.imageSrc !== sizeUrl || got?.desc !== SIZE_DESC) {
  console.error("อ่านกลับกลุ่มขนาดไม่ตรง!", g); process.exit(1);
}
/* กันเผลอ: กลุ่มนี้ต้องไม่กลายเป็นแกนตารางราคา (ราคาเป็นคอลัมน์เดียว คีย์ "") */
for (const p of [back.data.pricing, ...(back.data.priceRates ?? []).map((rr) => rr.pricing)]) {
  if ((p?.driverLabels ?? []).includes(SIZE_GROUP) || !p?.cells?.[""]) { console.error("ตารางราคาเพี้ยน!", p?.driverLabels, Object.keys(p?.cells ?? {})); process.exit(1); }
}
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (${SIZE_CHOICE}) เป็นการ์ด + ภาพ · ตารางราคาไม่ถูกแตะ · savedAt =`, back.data.savedAt);
