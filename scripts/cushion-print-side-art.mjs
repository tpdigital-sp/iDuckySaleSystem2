#!/usr/bin/env node
/**
 * หมอนอิงยัดใย (cushion) — ภาพประกอบตัวเลือกกลุ่ม "พิมพ์ลาย" (พิมพ์ 1 ด้าน / 2 ด้าน)
 *
 *   node scripts/cushion-print-side-art.mjs           (วาดภาพลง .cache/cushion/upload ดูก่อน)
 *   node scripts/cushion-print-side-art.mjs --write   (+ อัปโหลด storage + เขียน imageSrc/desc + อ่านกลับเทียบ)
 *
 * ตัวเลือกใน DB (ห้ามแก้ชื่อโดยไม่จำเป็น — ตะกร้า/ออเดอร์เก่าอ้างชื่อนี้):
 *   "ด้านเดียว / ด้านหลังสีขาว"  ฿0
 *   "สองด้าน เพิ่ม"              extra 30
 * กลุ่มนี้ **ไม่ใช่แกนตารางราคา** (driverLabels = ["ขนาด"]) ค่า +฿30 บวกผ่าน groupAddOf ตามปกติ
 *
 * ดีไซน์ (ชุดเดียวกับ pillow-keychain: หมอน 2 ใบ = หน้า/หลังของใบเดียวกัน + ป้ายเลขด้านกลางภาพ):
 *   ซ้าย = ด้านหน้า มีลายเสมอ · ขวา = ด้านหลัง (ขาวเปล่า / มีลาย)
 *   ทรงหมอน + ลายพิมพ์ใช้สูตรเดียวกับ scripts/cushion-size-option-art.mjs เพื่อให้ภาพทั้งหน้าสินค้าเป็นชุดเดียวกัน
 * ⚠️ ปุ่ม/การ์ดตัวเลือกครอปกลางภาพ (300–600) — วงกลม "1 ด้าน / 2 ด้าน" จึงคร่อมกลางภาพไว้
 *    ([[iducky-option-thumb-crop]]) ความต่างของสองใบต้องอ่านออกตั้งแต่ภาพย่อ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const HEART = await mascotDataUri("heart", 460); // ลายด้านหน้า (ชุดเดียวกับการ์ดขนาด)
const PEACE = await mascotDataUri("peace", 460); // ลายด้านหลัง — คนละลายได้ จึงวาดคนละตัว

const PRODUCT_ID = "cushion";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const GROUP = "พิมพ์ลาย";
const ONE = "ด้านเดียว / ด้านหลังสีขาว";
const TWO = "สองด้าน เพิ่ม";
const EXTRA = 30;

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** กรอบการ์ด + หัวเรื่อง/หมายเหตุ (ชุดเดียวกับสคริปต์ภาพตัวเลือกตัวอื่นของร้าน) */
const card = (title, subtitle, body, note1 = "", note2 = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="print" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6fd6ce"/>
      <stop offset="1" stop-color="#d3f4ee"/>
    </linearGradient>
    <linearGradient id="print2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffc9d8"/>
      <stop offset="1" stop-color="#fff1e6"/>
    </linearGradient>
    <pattern id="weave" width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M 0 4 H 8" stroke="#ffffff" stroke-width="1" opacity="0.2"/>
      <path d="M 4 0 V 8" stroke="#0f172a" stroke-width="0.7" opacity="0.05"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="21" text-anchor="middle" fill="#94a3b8">${note2}</text>` : ""}
</svg>`;

/** ป้ายชื่อใต้ชิ้นงาน */
const tag = (cx, y, text, on = true) => {
  const w = text.length * 13.5 + 46;
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="42" rx="21"
    fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2.5"/>
  <text x="${cx}" y="${y + 29}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle"
    fill="${on ? OK : SUB}">${text}</text>`;
};

/** ทรงหมอนหลังยัดใย — มุมจิก ขอบเว้าเข้าเพราะใยดันตรงกลาง (สูตรเดียวกับการ์ดขนาด) */
const cushionPath = (cx, cy, size, pad = 0) => {
  const h = size / 2 - pad;
  const x0 = cx - h, x1 = cx + h, y0 = cy - h, y1 = cy + h;
  const inset = size * 0.038;
  return `M ${x0} ${y0}
    Q ${cx} ${y0 + inset} ${x1} ${y0}
    Q ${x1 - inset} ${cy} ${x1} ${y1}
    Q ${cx} ${y1 - inset} ${x0} ${y1}
    Q ${x0 + inset} ${cy} ${x0} ${y0} Z`;
};

/** ลายพิมพ์บนผ้า (แทนลายของลูกค้า) — พื้นไล่สี + ดอกไม้ + มาสคอต */
function artwork(cx, cy, size, mascot, grad, band) {
  const h = size / 2;
  const x0 = cx - h, y0 = cy - h;
  let mh = size * 0.44;
  let mw = mh * mascot.ratio;
  if (mw > size * 0.62) { mw = size * 0.62; mh = mw / mascot.ratio; }
  const flowers = [[0.14, 0.84], [0.3, 0.9], [0.5, 0.85], [0.7, 0.9], [0.86, 0.83]]
    .map(([fx, fy], i) => {
      const px = x0 + size * fx, py = y0 + size * fy, r = Math.max(2.6, size * 0.024 - (i % 3) * 0.8);
      const petal = ["#ffffff", "#fef3c7", "#ffe4f0"][i % 3];
      return `<g>${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="${px}" cy="${py - r * 1.25}" rx="${r * 0.62}" ry="${r * 1.05}" fill="${petal}" transform="rotate(${a} ${px} ${py})"/>`).join("")}<circle cx="${px}" cy="${py}" r="${r * 0.5}" fill="#fbbf24"/></g>`;
    })
    .join("");
  return `
    <rect x="${x0}" y="${y0}" width="${size}" height="${size}" fill="url(#${grad})"/>
    <path d="M ${x0} ${y0 + size} L ${x0} ${y0 + size * 0.82} Q ${cx} ${y0 + size * 0.7} ${x0 + size} ${y0 + size * 0.8} L ${x0 + size} ${y0 + size} Z" fill="${band}" opacity="0.7"/>
    ${flowers}
    <image href="${mascot.uri}" x="${cx - mw / 2}" y="${y0 + size * 0.16}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>`;
}

/**
 * หมอน 1 ใบ
 *   mascot = null → ผ้าสีขาวเปล่า (ด้านหลังของงานพิมพ์ 1 ด้าน)
 *   grad          → ชุดสีของลายด้านนั้น (หน้า/หลังคนละลายได้)
 */
function cushion({ cx, cy, size, id, mascot = null, grad = "print", band = "#7fd8c3" }) {
  const outline = cushionPath(cx, cy, size);
  return `
  <ellipse cx="${cx + 6}" cy="${cy + size / 2 + 14}" rx="${size * 0.5}" ry="${Math.max(9, size * 0.042)}" fill="#0f172a" opacity="0.09"/>
  <clipPath id="cut${id}"><path d="${outline}"/></clipPath>
  <path d="${outline}" fill="#ffffff"/>
  <g clip-path="url(#cut${id})">
    ${mascot ? artwork(cx, cy, size, mascot, grad, band) : ""}
    <rect x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" fill="url(#weave)"/>
    <ellipse cx="${cx - size * 0.12}" cy="${cy - size * 0.12}" rx="${size * 0.42}" ry="${size * 0.4}" fill="#ffffff" opacity="0.13"/>
    <path d="${outline}" fill="none" stroke="#0f172a" stroke-width="${size * 0.1}" opacity="0.08"/>
  </g>
  <path d="${cushionPath(cx, cy, size, size * 0.035)}" fill="none" stroke="${mascot ? "#ffffff" : "#cbd5e1"}" stroke-width="2" stroke-dasharray="7 6" opacity="${mascot ? 0.75 : 0.9}"/>
  <path d="${outline}" fill="none" stroke="#94a3b8" stroke-width="2.2"/>`;
}

/** ลูกศรโค้ง "พลิกอีกด้าน" ระหว่างสองใบ — บอกว่าเป็นหมอนใบเดียวกัน ไม่ใช่สองใบ */
const flipArrow = (cx, y) => `
  <path d="M ${cx - 92} ${y} Q ${cx} ${y - 62} ${cx + 92} ${y}" fill="none" stroke="#cbd5e1" stroke-width="3" stroke-dasharray="9 8"/>
  <path d="M ${cx + 92} ${y} l -16 -12 l 3 15 Z" fill="#94a3b8"/>
  <text x="${cx}" y="${y - 70}" font-family="${TH}" font-size="20" text-anchor="middle" fill="#94a3b8">หมอนใบเดียวกัน พลิกอีกด้าน</text>`;

/** การ์ด 1 ใบต่อ 1 ตัวเลือก */
function sideArt(sides) {
  const one = sides === 1;
  const size = 300;
  const cy = 470;
  const lx = 218;
  const rx = 682;
  const body = `
  ${flipArrow(W / 2, cy - size / 2 - 26)}
  ${cushion({ cx: lx, cy, size, id: "fr", mascot: HEART, grad: "print" })}
  ${cushion({ cx: rx, cy, size, id: "bk", mascot: one ? null : PEACE, grad: "print2", band: "#ff9fbd" })}
  ${one ? `<text x="${rx}" y="${cy + 10}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="#aeb8c3">ผ้าสีขาวเปล่า</text>` : ""}
  <!-- ป้ายเลขด้านกลางภาพ — โซนที่ปุ่ม/การ์ดตัวเลือกครอปเห็น -->
  <circle cx="${W / 2}" cy="${cy - 6}" r="76" fill="#ffffff" stroke="${OK}" stroke-width="4"/>
  <text x="${W / 2}" y="${cy - 6}" font-family="${TH}" font-size="64" font-weight="800" text-anchor="middle" fill="${OK}">${sides}</text>
  <text x="${W / 2}" y="${cy + 38}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${OK}">ด้าน</text>
  ${one ? "" : `<rect x="${W / 2 - 62}" y="${cy + 96}" width="124" height="48" rx="24" fill="#fffbeb" stroke="#b45309" stroke-width="2.5"/>
  <text x="${W / 2}" y="${cy + 129}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="#b45309">+฿${EXTRA}</text>`}
  ${tag(lx, cy + size / 2 + 62, "ด้านหน้า — มีลาย")}
  ${tag(rx, cy + size / 2 + 62, one ? "ด้านหลัง — สีขาวเรียบ" : "ด้านหลัง — มีลาย", !one)}`;
  return one
    ? card("พิมพ์ลายด้านเดียว", "พิมพ์ด้านหน้า — ด้านหลังเป็นผ้าสีขาวเรียบ", body,
      "ราคามาตรฐาน ไม่มีค่าเพิ่ม · เหมาะกับงานที่วางพิงผนังหรือโซฟา",
      "งานพิมพ์ซับลิเมชั่น สีซึมเข้าเนื้อผ้า ไม่ลอกไม่แตก · ภาพวาดจำลอง ลายเป็นตัวอย่าง")
    : card("พิมพ์ลายสองด้าน", `พิมพ์ทั้งด้านหน้าและด้านหลัง — เพิ่มใบละ ฿${EXTRA}`, body,
      `+฿${EXTRA} ต่อใบ · หน้า-หลังใช้คนละลายได้ ส่งไฟล์มา 2 ไฟล์`,
      "งานพิมพ์ซับลิเมชั่น สีซึมเข้าเนื้อผ้า ไม่ลอกไม่แตก · ภาพวาดจำลอง ลายเป็นตัวอย่าง");
}

// ── วาดลงแคช ─────────────────────────────────────────────────────────
const JOBS = [
  {
    file: `print-1side-${VER}.jpg`, svg: sideArt(1), choice: ONE,
    desc: "พิมพ์ลายเฉพาะด้านหน้า ด้านหลังเป็นผ้าสีขาวเรียบ — ราคามาตรฐาน ไม่มีค่าเพิ่ม",
  },
  {
    file: `print-2side-${VER}.jpg`, svg: sideArt(2), choice: TWO,
    desc: `พิมพ์ลายทั้งสองด้าน หน้า-หลังใช้คนละลายได้ — เพิ่มใบละ ฿${EXTRA}`,
  },
];

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  // ครอปกลาง 300–600 ไว้ตรวจว่าที่เห็นบนปุ่มตัวเลือกยังบอกความต่างได้
  await sharp(j.buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/_thumb-${j.file}`);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${GROUP}: ${j.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน imageSrc ─────────────────────────────────
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

// อ่าน DB สดก่อนเขียนเสมอ (อาจมีคนแก้สินค้าตัวเดียวกันอยู่)
const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
// สคริปต์เขียนตรงไม่ผ่าน API = ไม่เก็บ product_revisions — dump สภาพเดิมกันเหนียวก่อน
writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(data, null, 1));

const group = (data.options ?? []).find((o) => o.label === GROUP);
if (!group) { console.error(`ไม่เจอกลุ่ม "${GROUP}"`); process.exit(1); }
for (const j of JOBS) {
  const c = group.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url; // แตะแค่ imageSrc/desc — ชื่อ/extra เดิมคงไว้
  c.desc = j.desc;
}
group.note = `พิมพ์ซับลิเมชั่น ด้านหน้ามีลายเสมอ · เลือก "สองด้าน" ถ้าอยากให้ด้านหลังมีลายด้วย (เพิ่มใบละ ฿${EXTRA} หน้า-หลังคนละลายได้)`;
/* การ์ด: มีแค่ 2 ตัวเลือกจึงไม่เข้าโหมด dense (CARDS_DENSE_FROM = 6) → ได้ภาพ 48px + คำอธิบายใต้ชื่อ
   ถ้าอยากได้ปุ่มกลมแบบเดิม ลบบรรทัดนี้ทิ้งแล้วรันใหม่ (ภาพยังอยู่ แต่ย่อเหลือวงกลม 28px และไม่โชว์ desc) */
group.display = "cards";

data.savedAt = new Date().toISOString(); // กันแคชรูปเดิม ([[iducky-image-cache-bust]])
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bg = back.data.options.find((o) => o.label === GROUP);
const fails = [
  [bg?.choices?.length === 2, "จำนวนตัวเลือกเปลี่ยน"],
  [bg?.display === "cards", "กลุ่มไม่ใช่การ์ด"],
  ...JOBS.map((j) => {
    const c = bg?.choices?.find((c) => c.name === j.choice);
    return [c?.imageSrc === j.url && c?.desc === j.desc, `ตัวเลือก "${j.choice}" ไม่ตรง (ภาพ/คำอธิบาย)`];
  }),
  [(bg?.choices?.find((c) => c.name === TWO)?.extra ?? 0) === EXTRA, `ค่าเพิ่ม 2 ด้านไม่ใช่ ฿${EXTRA}`],
  [(bg?.choices?.find((c) => c.name === ONE)?.extra ?? 0) === 0, "ตัวเลือก 1 ด้านมีค่าเพิ่มโผล่มา"],
  // กลุ่มนี้ต้องไม่ใช่แกนตารางราคา ไม่งั้นราคาหล่นไป product.price
  [!(back.data.pricing?.driverLabels ?? []).includes(GROUP), "กลุ่มไปชนแกนตารางราคา"],
  [(back.data.priceRates ?? []).every((r) => !(r.pricing?.driverLabels ?? []).includes(GROUP)), "กลุ่มไปชนแกนตารางราคาของเรท"],
  [back.data.priceMin === 175 && back.data.priceMax === 345, "ช่วงราคาสินค้าเปลี่ยนไป"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`✓ imageSrc+desc ${JOBS.length} ตัวเลือกกลุ่ม "${GROUP}" อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);
