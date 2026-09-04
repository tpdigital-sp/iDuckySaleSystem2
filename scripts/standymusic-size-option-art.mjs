#!/usr/bin/env node
/**
 * สแตนดี้ฐานดนตรี (standymusic-1) — เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบ
 *
 *   node scripts/standymusic-size-option-art.mjs           (วาดลง .cache/standymusic/upload ดูก่อน)
 *   node scripts/standymusic-size-option-art.mjs --write   (+ อัปโหลด storage + ใส่กลุ่ม + อ่านกลับเทียบ)
 *
 * ผู้ใช้สั่ง 4 ก.ย. 69: สินค้าตัวนี้ "ไม่มีกลุ่มขนาดเลย" มีแต่ "เพิ่มขนาด" (เซนละ ฿10 สูงสุด +5)
 * ลูกค้าจึงไม่รู้ว่าขนาดตั้งต้นคือเท่าไหร่ → เพิ่มกลุ่มการ์ดใบเดียวบอกขนาดมาตรฐาน + วาดภาพให้เห็นของจริง
 *
 * ขนาดยกมาจากใบสเปคร้าน (ฉบับใหม่ .cache/standymusic/src/samusic.jpg — ACRYLIC MUSIC & ALBUM CD BOX):
 *   อะคริลิค 15 ซม. หนา 3 มม. สกรีน 2 ด้าน · ฐานวงกลม 7.5 ซม. (สกรีนฐาน) · เพิ่มขนาด เซนละ ฿10 · อคล.พิเศษ +20
 *   ⚠️ ใบเก่า (ST-ฐานดนตรี-01.png) เขียนเพิ่มขนาด "cm.ละ 15 บาท" — ใบใหม่กับ DB ตรงกันที่ ฿10 จึงยึด ฿10
 *
 * ภาพ: สแตนดี้อะคริลิคเสียบฐานไม้กล่องดนตรีทรงกลม + มือถือสเกลเดียวกันวางเทียบ (เครื่องทั่วไปสูง ~15.5 ซม.
 *   ≈ ตัวสแตนดี้พอดี) — ที่การ์ดโชว์แค่ 80×80 ทรงเงาสูง ๆ บนฐานกลมยังอ่านออก
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ ([[iducky-image-cache-bust]])
 *
 * ราคา: กลุ่มนี้ไม่ใช่แกนตารางราคา (driverLabels ของตัวนี้ว่าง cells มีคีย์เดียว "") และการ์ดไม่มี extra
 *   → ราคาไม่ขยับ สคริปต์เช็คซ้ำตอนอ่านกลับ ([[iducky-price-driver-trap]])
 *
 * รันซ้ำได้: ถ้ามีกลุ่ม "ขนาด" อยู่แล้วจะแก้ทับที่เดิม ไม่สร้างซ้ำ ไม่ย้ายลำดับกลุ่มอื่น
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "standymusic-1";
const VER = "v1";
const GROUP = "ขนาด";
const CHOICE = "15 ซม.";
const BADGE = "ฐานดนตรี ⌀ 7.5 ซม.";
const DESC =
  "ตัวอะคริลิคด้านยาวสุด 15 ซม. หนา 3 มม. สกรีน 2 ด้าน\nวางบนฐานไม้กล่องดนตรีทรงกลม 7.5 ซม. (สกรีนฐาน)\nอยากใหญ่กว่านี้ เลือก “เพิ่มขนาด” ด้านล่าง เซนละ ฿10 (สูงสุด +5 ซม.)";
const FILE = `size-15cm-base7.5-${VER}.jpg`;
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/standymusic/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const MASCOT = await mascotDataUri("heart", 460);

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";
const CM = 23;                 // 1 ซม. = 23 px (สเกลเดียวทั้งภาพ — สแตนดี้ ฐาน และมือถือ)
const GROUND = 636;            // เส้นพื้นที่ทุกชิ้นตั้งอยู่

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** ลูกศรวัดขนาด — เส้น + ขีดปลาย + ป้ายตัวเลขบนพื้นขาว (ทรงเดียวกับสคริปต์ขนาดตัวอื่น) */
const dim = (x1, y1, x2, y2, label) => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + 32;
  const tick = (x, y) => `<line x1="${x - (vertical ? 9 : 0)}" y1="${y - (vertical ? 0 : 9)}" x2="${x + (vertical ? 9 : 0)}" y2="${y + (vertical ? 0 : 9)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12.5 : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${esc(label)}</text>`;
};

const pill = (cx, y, text, tone = OK, bg = "#ecfeff") => {
  const w = text.length * 14.5 + 56;
  return `
    <rect x="${cx - w / 2}" y="${y - 23}" width="${w}" height="46" rx="23" fill="${bg}" stroke="${tone}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${tone}">${esc(text)}</text>`;
};

/**
 * ฐานกล่องดนตรีไม้ทรงกลม ⌀ 7.5 ซม. — ทรงกระบอกมองเฉียง (วงรีบน + ตัวถัง + จานเหล็กหมุนด้านล่าง)
 * cx = กึ่งกลาง · yBottom = ก้นฐานแตะพื้น
 */
const musicBase = (cx, yBottom) => {
  const d = 7.5 * CM;                 // เส้นผ่านศูนย์กลาง
  const bodyH = 3.2 * CM;             // ตัวถังไม้สูง ~3.2 ซม. (เทียบจากรูปงานจริงในใบสเปค)
  const ry = d * 0.155;               // ความหนาวงรีตอนมองเฉียง
  const yTop = yBottom - bodyH;
  const x = cx - d / 2;
  const discW = d * 1.06, discH = ry * 0.66;
  return `
  <g>
    <ellipse cx="${cx}" cy="${yBottom + discH * 0.9}" rx="${d * 0.62}" ry="${ry * 0.55}" fill="#0f172a" opacity="0.10"/>
    <!-- จานเหล็กหมุนใต้ฐาน -->
    <ellipse cx="${cx}" cy="${yBottom + 2}" rx="${discW / 2}" ry="${discH}" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1.5"/>
    <!-- ตัวถังไม้ -->
    <path d="M ${x} ${yTop} L ${x} ${yBottom} A ${d / 2} ${ry} 0 0 0 ${x + d} ${yBottom} L ${x + d} ${yTop} Z" fill="url(#wood)"/>
    <path d="M ${x} ${yTop} L ${x} ${yBottom} A ${d / 2} ${ry} 0 0 0 ${x + d} ${yBottom} L ${x + d} ${yTop} Z" fill="url(#woodShade)"/>
    <ellipse cx="${cx}" cy="${yTop}" rx="${d / 2}" ry="${ry}" fill="#e3c49b"/>
    <ellipse cx="${cx}" cy="${yTop}" rx="${d / 2}" ry="${ry}" fill="none" stroke="#c8a274" stroke-width="1.5"/>
    <!-- ร่องเสียบแผ่นอะคริลิคบนหน้าฐาน -->
    <rect x="${cx - d * 0.26}" y="${yTop - 3}" width="${d * 0.52}" height="6" rx="3" fill="#8b6a47" opacity="0.75"/>
    <!-- ลายไม้จาง ๆ -->
    <path d="M ${x + 8} ${yTop + bodyH * 0.34} q ${d / 2} 9 ${d - 16} 0" fill="none" stroke="#a9835c" stroke-width="2" opacity="0.35"/>
    <path d="M ${x + 12} ${yTop + bodyH * 0.66} q ${d / 2} 8 ${d - 24} 0" fill="none" stroke="#a9835c" stroke-width="2" opacity="0.28"/>
  </g>`;
};

/**
 * แผ่นอะคริลิคสแตนดี้ — ทรงโค้งบน ใส ๆ มีลายสกรีน (มาสคอต) อยู่กลาง
 * ความสูงนับทั้งแผ่น 15 ซม. รวมเดือยที่จมอยู่ในร่องฐาน (= "ด้านที่ยาวที่สุด" ตามที่ร้านวัด)
 */
const standee = (cx, yBottom) => {
  const h = 15 * CM;                  // 345
  const w = 10.6 * CM;                // แผ่นไดคัทกว้างประมาณนี้
  const x = cx - w / 2, y = yBottom - h;
  const r = MASCOT.ratio;
  const mh = h * 0.52, mw = mh * r;
  return `
  <g>
    <path d="M ${x} ${y + w / 2} A ${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2} L ${x + w} ${yBottom} L ${x} ${yBottom} Z"
      fill="url(#acr)" stroke="#7fb9d6" stroke-width="2.5"/>
    <!-- แสงสะท้อนบนแผ่นอะคริลิค -->
    <path d="M ${x + w * 0.13} ${y + w * 0.62} A ${w / 2} ${w / 2} 0 0 1 ${x + w * 0.42} ${y + w * 0.13} L ${x + w * 0.3} ${yBottom - 12} L ${x + w * 0.1} ${yBottom - 12} Z"
      fill="#ffffff" opacity="0.34"/>
    <image href="${MASCOT.uri}" x="${cx - mw / 2}" y="${yBottom - mh - h * 0.19}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
};

/** มือถือเทียบสัดส่วน — เครื่องทั่วไปสูง ~15.5 ซม. กว้าง ~7.5 ซม. (สเกลเดียวกับสแตนดี้) */
const phone = (cx, yBottom) => {
  const w = 7.5 * CM, h = 15.5 * CM;
  const x = cx - w / 2, y = yBottom - h;
  return `
  <g>
    <rect x="${x + 5}" y="${y + 9}" width="${w}" height="${h}" rx="${w * 0.16}" fill="#0f172a" opacity="0.08"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.16}" fill="#1e293b"/>
    <rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="${w * 0.13}" fill="url(#screen)"/>
    <rect x="${cx - 13}" y="${y + 11}" width="26" height="7" rx="3.5" fill="#1e293b" opacity="0.55"/>
    <rect x="${cx - 18}" y="${y + h - 17}" width="36" height="5" rx="2.5" fill="#1e293b" opacity="0.35"/>
  </g>`;
};

/** โน้ตดนตรีลอย ๆ ข้างฐาน — บอกว่าฐานนี้เล่นเพลงได้ */
const note = (x, y, s, op) => `
  <g opacity="${op}" transform="translate(${x} ${y}) scale(${s})">
    <path d="M 0 22 a 7 5.5 0 1 0 9 -5 V -14 l 15 -4.5 V 12 a 7 5.5 0 1 0 9 -5 V -24 L 0 -18 Z" fill="${OK}"/>
  </g>`;

const svg = () => {
  const sx = 318;   // กึ่งกลางสแตนดี้ + ฐาน
  const px = 700;   // กึ่งกลางมือถือ
  const baseTop = GROUND - 3.2 * CM;
  const acrBottom = baseTop + 8;             // เดือยจมในร่องฐานนิดหน่อย
  const acrTop = acrBottom - 15 * CM;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="acr" x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#eaf7fe"/><stop offset="0.5" stop-color="#cfeaf8"/><stop offset="1" stop-color="#aed9ef"/>
    </linearGradient>
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#c79a68"/><stop offset="0.35" stop-color="#e7c79c"/><stop offset="1" stop-color="#b98b5c"/>
    </linearGradient>
    <linearGradient id="woodShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0.06"/><stop offset="1" stop-color="#000000" stop-opacity="0.18"/>
    </linearGradient>
    <linearGradient id="screen" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="#f1f5f9"/><stop offset="1" stop-color="#dbe6f0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>

  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด 15 ซม. · ฐานดนตรี 7.5 ซม.</text>
  <text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ขนาดมาตรฐานของชุดนี้ — อะคริลิคหนา 3 มม. สกรีน 2 ด้าน + สกรีนฐาน</text>

  ${note(468, 520, 1.15, 0.34)}
  ${note(516, 596, 0.85, 0.22)}

  <!-- เส้นพื้นให้ทั้งสองชิ้นตั้งอยู่ระดับเดียวกัน = เทียบสูงกันได้จริง -->
  <line x1="120" y1="${GROUND + 26}" x2="${W - 120}" y2="${GROUND + 26}" stroke="#e2e8f0" stroke-width="2.5"/>

  ${standee(sx, acrBottom)}
  ${musicBase(sx, GROUND)}
  ${dim(sx - 10.6 * CM / 2 - 34, acrTop, sx - 10.6 * CM / 2 - 34, acrBottom, "15 ซม.")}
  ${dim(sx - 7.5 * CM / 2, GROUND + 52, sx + 7.5 * CM / 2, GROUND + 52, "7.5 ซม.")}

  ${phone(px, GROUND)}
  <text x="${px}" y="${GROUND + 58}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">มือถือทั่วไป (เทียบสเกล)</text>

  <text x="${sx}" y="${acrTop - 22}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">ตัวอะคริลิค</text>
  <text x="${px}" y="${GROUND - 15.5 * CM - 22}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="#94a3b8">~15.5 ซม.</text>

  ${pill(W / 2, 762, "ฐานไม้หมุนได้ · มีเพลงเดียว เลือกเพลงไม่ได้")}

  <text x="${W / 2}" y="822" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">วัดจากด้านที่ยาวที่สุดของชิ้นงาน (ไม่วัดแนวทแยง)</text>
  <text x="${W / 2}" y="856" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">อยากใหญ่กว่านี้ เลือก “เพิ่มขนาด” เซนละ ฿10 (สูงสุด +5 ซม.)</text>
</svg>`;
};

const buf = await sharp(Buffer.from(svg())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/${FILE}`, buf);
await sharp(buf).resize(80, 80).toFile(`${OUT}/thumb-${FILE}`); // = ที่ลูกค้าเห็นบนการ์ดจริง (80×80)
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ${CHOICE}`);

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + ใส่กลุ่ม "ขนาด" ────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const key = `products/${PRODUCT_ID}/${FILE}`;
const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", url);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const before = JSON.parse(JSON.stringify(data));

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
const dump = `${OUT}/../before-size-${VER}.json`;
writeFileSync(dump, JSON.stringify(before, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

// กันชื่อกลุ่มไปชนแกนตารางราคา ([[iducky-price-driver-trap]]) — ตัวนี้ driverLabels ว่างอยู่แล้ว
const drivers = [data.pricing?.driverLabels ?? [], ...(data.priceRates ?? []).map((r) => r.pricing?.driverLabels ?? [])].flat();
if (drivers.includes(GROUP)) { console.error(`ชื่อกลุ่ม "${GROUP}" ชนแกนตารางราคา — หยุดก่อน`); process.exit(1); }

data.options ??= [];
const dup = data.options.filter((o) => o.label === GROUP);
if (dup.length > 1) { console.error(`มีกลุ่มชื่อ "${GROUP}" ซ้ำ ${dup.length} กลุ่ม — หยุดก่อน ([[iducky-duplicate-group-label]])`); process.exit(1); }

const card = { name: CHOICE, badge: BADGE, desc: DESC, imageSrc: url };
if (dup.length === 1) {
  // รันซ้ำ: แก้ทับที่เดิม ไม่ย้ายลำดับ
  dup[0].display = "cards";
  dup[0].choices = [{ ...(dup[0].choices?.[0] ?? {}), ...card }];
} else {
  data.options.unshift({ label: GROUP, display: "cards", choices: [card] });
}
data.savedAt = new Date().toISOString(); // ISO เท่านั้น ([[iducky-script-write-product]] ข้อ 8) + บัสต์แคชรูป

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ ([[iducky-script-write-product]] ข้อ 4)
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const gb = got.filter((o) => o.label === GROUP);
const oldLabels = (before.options ?? []).map((o) => o.label);
const fails = [
  [gb.length === 1, `กลุ่ม "${GROUP}" ในฐานข้อมูลมี ${gb.length} กลุ่ม`],
  [got.length === oldLabels.length + (dup.length ? 0 : 1), "จำนวนกลุ่มตัวเลือกเพี้ยน (กลุ่มหาย/งอก) ([[iducky-option-group-loss-guard]])"],
  [oldLabels.every((l) => got.some((o) => o.label === l)), "กลุ่มเดิมบางกลุ่มหายไป"],
  [gb[0]?.display === "cards", "กลุ่มขนาดไม่ใช่การ์ด"],
  [gb[0]?.choices?.length === 1 && gb[0].choices[0].name === CHOICE, "การ์ดขนาดไม่ตรง"],
  [gb[0]?.choices?.[0]?.imageSrc === url, "ภาพการ์ดไม่ตรง"],
  [gb[0]?.choices?.[0]?.badge === BADGE && gb[0].choices[0].desc === DESC, "ป้าย/คำอธิบายการ์ดไม่ตรง"],
  [!gb[0]?.choices?.[0]?.extra && !gb[0]?.choices?.[0]?.qty, "การ์ดขนาดเดียวต้องไม่บวกราคา"],
  [back.data.priceMin === before.priceMin && back.data.priceMax === before.priceMax, "ช่วงราคาสินค้าเปลี่ยนไป"],
  [JSON.stringify(back.data.pricing) === JSON.stringify(before.pricing), "ตารางราคา (data.pricing) เปลี่ยนไป"],
  [JSON.stringify(back.data.priceRates) === JSON.stringify(before.priceRates), "ตารางราคาเงา (priceRates) เปลี่ยนไป"],
  [JSON.stringify(back.data.rules) === JSON.stringify(before.rules), "กติกาตัวเลือก (rules) เปลี่ยนไป"],
  [typeof back.data.savedAt === "string", "savedAt ไม่ใช่ ISO string (หน้าแก้ไขจะติด 409)"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "${GROUP}" การ์ด ${CHOICE} + ภาพ อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);
console.log("  ลำดับกลุ่มตอนนี้:", got.map((o) => o.label).join(" → "));
