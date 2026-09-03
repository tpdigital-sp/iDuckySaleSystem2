#!/usr/bin/env node
/**
 * ภาพประกอบกลุ่ม "ขนาด" ของ "ถุงผ้าหูรูด แบบสกรีนเต็มใบ" (drawstring-bag)
 *
 *   node scripts/drawstring-bag-size-art.mjs            (วาดภาพลง .cache/drawstring-bag-size/upload)
 *   node scripts/drawstring-bag-size-art.mjs --write    (+ อัปโหลด storage + ตั้ง choice.imageSrc + อ่านกลับเทียบ)
 *
 * ทำไมต้องวาดเอง: ชื่อตัวเลือกเป็นตัวเลข "17.5x21cm / 27.5x37cm" ลูกค้านึกภาพไม่ออกว่าเล็กใหญ่แค่ไหน
 * — วาดถุงสเกลจริงเทียบกันสองการ์ด (ก้นถุงอยู่บรรทัดเดียวกัน + เงาใบใหญ่ในการ์ดใบเล็ก)
 * ทรงถุง/สไตล์การ์ดยึดตาม drawstring-bag-option-art.mjs (premiumbag-9)
 *
 * ได้ 2 ไฟล์ (900x900 — ปุ่มตัวเลือกครอปจัตุรัส):
 *   size-s.jpg   17.5 × 21 ซม. — ใบเล็ก เหมาะของชำร่วยชิ้นเล็ก
 *   size-l.jpg   27.5 × 37 ซม. — ใบใหญ่ ใส่ของได้เยอะ
 *
 * ที่มาของตัวเลข: products.drawstring-bag ใน DB (3 ก.ย. 69)
 *   priceRates r1: 17.5x21cm 160→95 · 27.5x37cm 180→115 ต่อใบ ตามช่วงจำนวน (1-10 … 200+)
 *   ผ้าดิบแคนวาสสีขาว 8 ออนซ์ สกรีนเต็มใบระบบซับลิเมชั่น
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 520);

const PRODUCT_ID = "drawstring-bag";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/drawstring-bag-size/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
/** ผ้าดิบแคนวาส "สีขาว" ตามสเปคสินค้า — ขาวนวลนิด ๆ ให้ต่างจากพื้นการ์ด + ขอบชัด */
const CLOTH = "#fdfbf5";
const CLOTH_EDGE = "#d6cbb0";
const CORD = "#b9a06f";

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
    .filter(Boolean)
    .map(
      (t, i, a) =>
        `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

/** ทรงถุงหูรูด (คัดจาก drawstring-bag-option-art.mjs) — h รวมแถบร้อยเชือกแล้ว */
const bagGeom = (cx, top, w, h) => {
  const channelH = h * 0.13;
  return { cx, top, w, h, channelH, x: cx - w / 2, bodyTop: top + channelH, bottom: top + h };
};

const bagShape = (g, { fill, edge, clipId = "" } = {}) => {
  const r = Math.min(30, g.w * 0.09);
  const pleats = Array.from({ length: 7 }, (_, i) => {
    const px = g.x + g.w * (0.14 + (i * 0.72) / 6);
    return `<line x1="${px}" y1="${g.top + 6}" x2="${px}" y2="${g.top + g.channelH - 6}" stroke="${edge}" stroke-width="2.5" opacity="0.65"/>`;
  }).join("");
  const bodyRect = `x="${g.x}" y="${g.bodyTop}" width="${g.w}" height="${g.h - g.channelH}"`;
  return `
    ${clipId ? `<clipPath id="${clipId}"><rect ${bodyRect} rx="${r}"/></clipPath>` : ""}
    <rect ${bodyRect} rx="${r}" fill="${fill}" stroke="${edge}" stroke-width="4"/>
    <rect x="${g.x + g.w * 0.05}" y="${g.top}" width="${g.w * 0.9}" height="${g.channelH}" rx="${g.channelH / 2}"
      fill="${fill}" stroke="${edge}" stroke-width="4"/>
    ${pleats}
    <!-- เชือกรูดออกสองข้าง ปลายผูกปม -->
    <path d="M${g.x + g.w * 0.06} ${g.top + g.channelH / 2} C ${g.x - g.w * 0.1} ${g.top + g.channelH} ${g.x - g.w * 0.12} ${g.top + g.h * 0.3} ${g.x - g.w * 0.06} ${g.top + g.h * 0.42}"
      fill="none" stroke="${CORD}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="${g.x - g.w * 0.06}" cy="${g.top + g.h * 0.42}" r="9" fill="${CORD}"/>
    <path d="M${g.x + g.w * 0.94} ${g.top + g.channelH / 2} C ${g.x + g.w * 1.1} ${g.top + g.channelH} ${g.x + g.w * 1.12} ${g.top + g.h * 0.3} ${g.x + g.w * 1.06} ${g.top + g.h * 0.42}"
      fill="none" stroke="${CORD}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="${g.x + g.w * 1.06}" cy="${g.top + g.h * 0.42}" r="9" fill="${CORD}"/>`;
};

/** ลายสกรีนเต็มใบ (ซับลิเมชั่น): พื้นฟ้าจาง + หัวใจ/จุดชนขอบ + มาสคอตกลาง — อยู่ใต้ clip ตัวถุง */
const fullPrint = (g) => {
  const dots = [];
  const cols = 5, rows = 6;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const px = g.x + g.w * ((c + (r % 2 ? 0.5 : 0)) / (cols - 0.5));
      const py = g.bodyTop + (g.h - g.channelH) * ((r + 0.4) / rows);
      dots.push(
        r % 2 === c % 2
          ? `<circle cx="${px}" cy="${py}" r="${g.w * 0.026}" fill="#7dd3fc" opacity="0.55"/>`
          : `<g transform="translate(${px} ${py}) scale(${g.w / 430})"><path d="M0 8 c -10 -9 -16 -16 -8 -23 c 5 -4 8 -1 8 2 c 0 -3 3 -6 8 -2 c 8 7 2 14 -8 23 z" fill="#f9a8d4" opacity="0.6"/></g>`
      );
    }
  const box = g.w * 0.52;
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  const cy = g.bodyTop + (g.h - g.channelH) * 0.52;
  return `<g clip-path="url(#${g.clip})">
    <rect x="${g.x}" y="${g.bodyTop}" width="${g.w}" height="${g.h}" fill="#eaf6fd"/>
    ${dots.join("")}
    <image href="${MASCOT.uri}" x="${g.cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet" opacity="0.92"/>
  </g>`;
};

/** เส้นบอกขนาด ลูกศรสองหัว + ตัวเลข */
const dim = (x1, y1, x2, y2, label, vertical = false) => {
  const cap = 12;
  const caps = vertical
    ? `<line x1="${x1 - cap}" y1="${y1}" x2="${x1 + cap}" y2="${y1}" stroke="${CYAN}" stroke-width="3"/>
       <line x1="${x2 - cap}" y1="${y2}" x2="${x2 + cap}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>`
    : `<line x1="${x1}" y1="${y1 - cap}" x2="${x1}" y2="${y1 + cap}" stroke="${CYAN}" stroke-width="3"/>
       <line x1="${x2}" y1="${y2 - cap}" x2="${x2}" y2="${y2 + cap}" stroke="${CYAN}" stroke-width="3"/>`;
  const tx = vertical ? x1 + 16 : (x1 + x2) / 2;
  const ty = vertical ? (y1 + y2) / 2 + 8 : y1 + 38;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${CYAN}" stroke-width="3"/>
    ${caps}
    <text x="${tx}" y="${ty}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="${vertical ? "start" : "middle"}" fill="${CYAN}">${label}</text>`;
};

// ── ภาพ "ขนาด" — สเกลจริงตาม ซม. ก้นถุงบรรทัดเดียวกันทุกการ์ด ─────────
const PX_PER_CM = 12.6; // 27.5x37 → ถุง 347x466px พอดีการ์ด
const GROUND = 668;
const SIZES = {
  s: { wcm: 17.5, hcm: 21, price: ["เริ่มต้น ฿160/ใบ (1-10 ใบ) · 200 ใบขึ้นไปเหลือ ฿95/ใบ", "ใบเล็กกะทัดรัด — ของชำร่วย ถุงของขวัญชิ้นเล็ก"] },
  l: { wcm: 27.5, hcm: 37, price: ["เริ่มต้น ฿180/ใบ (1-10 ใบ) · 200 ใบขึ้นไปเหลือ ฿115/ใบ", "ใบใหญ่จุของ — ของแจกงานอีเวนต์ ถุงใส่ของหลายชิ้น"] },
};

function sizeArt(key) {
  const s = SIZES[key];
  const w = s.wcm * PX_PER_CM, h = s.hcm * PX_PER_CM;
  const g = bagGeom(W / 2, GROUND - h, w, h);
  g.clip = `clip-${key}`;
  const big = SIZES.l;
  const bw = big.wcm * PX_PER_CM, bh = big.hcm * PX_PER_CM;
  const ghost =
    key === "l"
      ? ""
      : `<rect x="${W / 2 - bw / 2}" y="${GROUND - bh + bh * 0.13}" width="${bw}" height="${bh - bh * 0.13}" rx="30"
           fill="none" stroke="#cbd5e1" stroke-width="3" stroke-dasharray="12 10"/>
         <text x="${W / 2 - bw / 2 + 4}" y="${GROUND - bh - 12}" font-family="${TH}" font-size="19" fill="#94a3b8">เทียบขนาดใบ 27.5 × 37 ซม.</text>`;
  const body = `
    ${title(`ขนาด ${s.wcm} × ${s.hcm} ซม.`, "ผ้าดิบแคนวาสสีขาว 8 ออนซ์ — สกรีนเต็มใบระบบซับลิเมชั่น")}
    ${ghost}
    ${bagShape(g, { fill: CLOTH, edge: CLOTH_EDGE, clipId: g.clip })}
    ${fullPrint(g)}
    ${dim(g.x, GROUND + 30, g.x + g.w, GROUND + 30, `${s.wcm} ซม.`)}
    ${dim(g.x + g.w + (key === "s" ? (bw - w) / 2 + 44 : 44), g.top, g.x + g.w + (key === "s" ? (bw - w) / 2 + 44 : 44), GROUND, `${s.hcm} ซม.`, true)}
    ${foot(s.price)}`;
  return frame(body);
}

const ART = {
  "size-s": { svg: sizeArt("s"), choice: "17.5x21cm", group: "ขนาด", note: "17.5 × 21 ซม. — ใบเล็ก" },
  "size-l": { svg: sizeArt("l"), choice: "27.5x37cm", group: "ขนาด", note: "27.5 × 37 ซม. — ใบใหญ่" },
};

const files = [];
for (const [name, art] of Object.entries(ART)) {
  const buf = await sharp(Buffer.from(art.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const file = `${name}-${VER}.jpg`;
  writeFileSync(`${OUT}/${file}`, buf);
  files.push({ ...art, name, file, path: `${OUT}/${file}` });
  console.log(`🖼  ${file}  ${Math.round(buf.length / 1024)} KB — ${art.note}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + ตั้ง choice.imageSrc (แบบ drawstring-bag-option-art.mjs) ──
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

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
for (const f of files) {
  const grp = (data.options ?? []).find((o) => o.label === f.group);
  const c = grp?.choices?.find((c) => c.name === f.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${f.choice}" ในกลุ่ม "${f.group}"`); process.exit(1); }
  c.imageSrc = f.url;
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const f of files) {
  const got = back.data.options.find((o) => o.label === f.group)?.choices?.find((c) => c.name === f.choice)?.imageSrc;
  if (got !== f.url) { console.error("อ่านกลับไม่ตรง!", f.choice, got); process.exit(1); }
}
console.log("✓ ตั้ง imageSrc ครบ 2 ตัวเลือก อ่านกลับตรงทุกตัว · savedAt =", back.data.savedAt);
