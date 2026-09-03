#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "Shoulder Bag / กระเป๋าสะพาย" (shoulder-bag)
 *
 *   node scripts/shoulder-bag-option-art.mjs            (วาดภาพลง .cache/shoulder-bag/upload)
 *   node scripts/shoulder-bag-option-art.mjs --write    (+ อัปโหลด storage + ตั้ง choice.imageSrc + อ่านกลับเทียบ)
 *
 * 3 กลุ่มตัวเลือกของสินค้านี้เดิมไม่มีภาพเลย — เติมให้ครบทั้ง 3 กลุ่มคนละวิธี:
 *
 *   สีกระเป๋า (ขาว/ดำ)      → ใช้ "รูปงานจริง" ที่อยู่ในแกลเลอรีอยู่แล้ว ไม่ต้องวาด
 *                             ตั้ง imageSrc = URL เดียวกับในแกลเลอรี กดเลือกแล้วแกลเลอรีสลับตามด้วย
 *   ขนาดปักไม่เกิน 8*4 cm   → วาดเอง เพราะไม่มีรูปเทียบ "อยู่ในกรอบ vs เกินกรอบ"
 *   สีไหมไม่เกิน 3 สี        → วาดเอง เพราะรูปงานจริงดูไม่ออกว่านับสีไหมยังไง
 *
 * ได้ 2 ไฟล์ที่วาดใหม่ (900x900 — ปุ่มตัวเลือกครอปจัตุรัส):
 *   emb-size.jpg     ขนาดงานปัก — กรอบ 8x4 ซม. รวมในราคา · เกินคิดเซนละ ฿15 (เพิ่มได้ถึง +3 ซม.)
 *   emb-colors.jpg   สีไหมปัก — 3 สีแรกรวมในราคา · เกินคิดสีละ ฿10 (เพิ่มได้ถึง 15 สี)
 *
 * ที่มาของตัวเลข: products.shoulder-bag ใน DB (3 ก.ย. 69)
 *   ปัก 8*4 cm · เกินเพิ่มเซนละ 15 (qtyMax 3) · ไหม 3 สี · เกินเพิ่มสีละ 10 (qtyMax 15)
 *   สีไหมในภาพยึดตามรูปงานจริงของกระเป๋าดำ (ฟ้า/ชมพู/เหลือง)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "shoulder-bag";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/shoulder-bag/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
const WARN = "#e11d48";
/** หนังกระเป๋า: ตัวขาวครีม (รุ่นสีขาว) — การ์ดพื้นขาวจึงต้องมีขอบเข้มพอให้เห็นทรง */
const LEATHER = "#f7f5f2";
const LEATHER_EDGE = "#c7c0b6";
const GOLD = "#d3a84c";
/** ไหม 3 สีตามรูปงานจริงของกระเป๋าดำ */
const THREADS = ["#2a9fc4", "#e8467c", "#f0c33c", "#7c5cd6", "#3fb56a"];

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

/**
 * ทรงกระเป๋าสะพาย (baguette ครึ่งวงเดือน): ขอบบนแอ่นลง มีซิป · ท้องกระเป๋าป่องลง · สายสะพายโค้งขึ้นด้านบน
 * คืน geometry ให้วางกรอบปัก/ป้ายต่อได้
 */
const bagGeom = (cx, top, w, h) => ({
  cx,
  top,
  w,
  h,
  x: cx - w / 2,
  lipY: top + h * 0.15, // ปลายซิปซ้าย/ขวา
  dipY: top + h * 0.46, // จุดต่ำสุดของขอบบน (กลางใบ)
  bottom: top + h,
});

const bagShape = (g, { fill = LEATHER, edge = LEATHER_EDGE, clipId = "" } = {}) => {
  const body = `M${g.x} ${g.lipY} Q ${g.cx} ${g.dipY} ${g.x + g.w} ${g.lipY}
    C ${g.x + g.w * 1.02} ${g.top + g.h * 0.62} ${g.x + g.w * 0.78} ${g.bottom} ${g.cx} ${g.bottom}
    C ${g.x + g.w * 0.22} ${g.bottom} ${g.x - g.w * 0.02} ${g.top + g.h * 0.62} ${g.x} ${g.lipY} Z`;
  // ซิปทองตามขอบบน + หัวซิปห้อยกลางใบ
  const zip = `M${g.x + 6} ${g.lipY + 2} Q ${g.cx} ${g.dipY + 2} ${g.x + g.w - 6} ${g.lipY + 2}`;
  return `
    ${clipId ? `<clipPath id="${clipId}"><path d="${body}"/></clipPath>` : ""}
    <!-- สายสะพายอยู่หลังตัวกระเป๋า -->
    <path d="M${g.x + g.w * 0.08} ${g.lipY + 6} C ${g.x + g.w * 0.16} ${g.top - g.h * 0.42} ${g.x + g.w * 0.84} ${g.top - g.h * 0.42} ${g.x + g.w * 0.92} ${g.lipY + 6}"
      fill="none" stroke="${fill}" stroke-width="11" stroke-linecap="round"/>
    <path d="M${g.x + g.w * 0.08} ${g.lipY + 6} C ${g.x + g.w * 0.16} ${g.top - g.h * 0.42} ${g.x + g.w * 0.84} ${g.top - g.h * 0.42} ${g.x + g.w * 0.92} ${g.lipY + 6}"
      fill="none" stroke="${edge}" stroke-width="11" stroke-linecap="round" opacity="0.35"/>
    <circle cx="${g.x + g.w * 0.08}" cy="${g.lipY + 6}" r="8" fill="none" stroke="${GOLD}" stroke-width="5"/>
    <circle cx="${g.x + g.w * 0.92}" cy="${g.lipY + 6}" r="8" fill="none" stroke="${GOLD}" stroke-width="5"/>
    <path d="${body}" fill="${fill}" stroke="${edge}" stroke-width="4"/>
    <path d="${zip}" fill="none" stroke="${GOLD}" stroke-width="7" stroke-linecap="round"/>
    <path d="${zip}" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="3 6" opacity="0.75"/>
    <rect x="${g.cx - 7}" y="${g.dipY + 6}" width="14" height="22" rx="5" fill="${GOLD}"/>`;
};

/** ลูกศรวัดขนาด — เส้นบาง + หัวลูกศรสองข้าง + ป้ายตัวเลข */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 12 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 7 : y2 + (side === "below" ? 27 : -12);
  const tick = (x, y) => `<line x1="${x - (vertical ? 7 : 0)}" y1="${y - (vertical ? 0 : 7)}" x2="${x + (vertical ? 7 : 0)}" y2="${y + (vertical ? 0 : 7)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 11 : (label.length * 11) / 2)}" y="${ly - 21}"
      width="${label.length * 11}" height="27" rx="6" fill="#ffffff" opacity="0.92"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="21" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

/** ป้ายสถานะใต้ภาพ — เขียว/แดงตามว่ารวมในราคาหรือคิดเพิ่ม */
const pill = (cx, y, text, tone) => {
  const w = text.length * 15 + 56;
  const bg = tone === "ok" ? "#ecfeff" : "#fff1f2";
  const bd = tone === "ok" ? OK : WARN;
  return `
    <rect x="${cx - w / 2}" y="${y}" width="${w}" height="46" rx="23" fill="${bg}" stroke="${bd}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 31}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${bd}">${text}</text>`;
};

/** ลายที่ปัก — มาสคอตเป็ดของฝ่าย Content (แทนลายลูกค้า) วางให้พอดีกรอบปัก */
const artwork = (cx, cy, boxW, boxH) => {
  const r = MASCOT.ratio; // กว้าง/สูง
  let aw = boxH * r;
  let ah = boxH;
  if (aw > boxW) { aw = boxW; ah = boxW / r; }
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>`;
};

// ── ภาพ "ขนาดงานปัก" — กรอบ 8x4 ซม. เทียบกับกรอบที่เกินมา ────────────
function sizeArt() {
  const bagW = 348, bagH = 212, top = 306;
  const left = bagGeom(238, top, bagW, bagH);
  const right = bagGeom(W - 238, top, bagW, bagH);
  /** 1 ซม. = 16 px — กรอบ 11x4 ซม. (ใหญ่สุด) จึงยังอยู่ในตัวกระเป๋าไม่โดนขอบตัด */
  const CM = 16;

  const panel = (g, cmW, tone, headline, clipId) => {
    const bw = cmW * CM, bh = 4 * CM;
    const by = g.top + g.h * 0.58; // กึ่งกลางกรอบปัก อยู่ท้องกระเป๋า
    const bd = tone === "ok" ? OK : WARN;
    return `
      ${bagShape(g, { clipId })}
      <g clip-path="url(#${clipId})">
        <rect x="${g.cx - bw / 2}" y="${by - bh / 2}" width="${bw}" height="${bh}" rx="8"
          fill="${tone === "ok" ? "#ecfeff" : "#fff1f2"}" fill-opacity="0.75" stroke="${bd}" stroke-width="3" stroke-dasharray="9 7"/>
        ${artwork(g.cx, by, bw - 16, bh - 14)}
      </g>
      ${dim(g.cx - bw / 2, by + bh / 2 + 22, g.cx + bw / 2, by + bh / 2 + 22, `${cmW} ซม.`)}
      ${dim(g.cx - bw / 2 - 26, by - bh / 2, g.cx - bw / 2 - 26, by + bh / 2, "4 ซม.")}
      <text x="${g.cx}" y="${g.bottom + 92}" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${INK}">${headline}</text>
      ${pill(g.cx, g.bottom + 112, tone === "ok" ? "รวมในราคาแล้ว" : "คิดเพิ่ม ฿45 ต่อใบ", tone)}`;
  };

  const body = `
    ${title("ขนาดงานปัก", "ปักได้ไม่เกิน 8 × 4 ซม. — เกินจากกรอบคิดเพิ่มเซนละ ฿15")}
    ${panel(left, 8, "ok", "8 × 4 ซม.", "bagL")}
    ${panel(right, 11, "over", "11 × 4 ซม. (เกิน 3 ซม.)", "bagR")}
    <line x1="${W / 2}" y1="300" x2="${W / 2}" y2="646" stroke="#e2e8f0" stroke-width="2"/>
    ${foot(["เกินได้สูงสุด 3 ซม. — เกิน 1 ซม. +฿15 · 2 ซม. +฿30 · 3 ซม. +฿45", "วัดจากด้านที่ยาวที่สุดของลาย · ราคาคิดต่อใบ"])}`;
  return frame(body);
}

// ── ภาพ "สีไหมปัก" — 3 สีแรกรวมในราคา ที่เกินคิดสีละ ฿10 ─────────────
function colorArt() {
  const g = bagGeom(W / 2, 252, 396, 232);

  /** ลายปักบนกระเป๋า — วงกลม 3 สีเรียงกัน (ยึดตามรูปงานจริงของกระเป๋าดำ) */
  const stitchDots = THREADS.slice(0, 3)
    .map((c, i) => {
      const cx = g.cx + (i - 1) * 66;
      const cy = g.top + g.h * 0.76;
      return `
        <circle cx="${cx}" cy="${cy}" r="27" fill="${c}"/>
        <circle cx="${cx}" cy="${cy}" r="27" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="4 5" opacity="0.85"/>
        <circle cx="${cx - 9}" cy="${cy - 9}" r="7" fill="#fff" opacity="0.85"/>`;
    })
    .join("");

  /** หลอดไหม — แกนม้วน + เส้นไหมพัน + ป้ายลำดับสี */
  const spool = (cx, cy, color, n, extra) => `
    <rect x="${cx - 34}" y="${cy - 58}" width="68" height="14" rx="6" fill="#e2e8f0"/>
    <rect x="${cx - 34}" y="${cy + 44}" width="68" height="14" rx="6" fill="#e2e8f0"/>
    <rect x="${cx - 27}" y="${cy - 46}" width="54" height="92" rx="9" fill="${color}"/>
    ${Array.from({ length: 5 }, (_, i) => `<line x1="${cx - 27}" y1="${cy - 34 + i * 18}" x2="${cx + 27}" y2="${cy - 28 + i * 18}" stroke="#fff" stroke-width="2" opacity="0.45"/>`).join("")}
    ${extra ? `<rect x="${cx - 38}" y="${cy - 62}" width="76" height="124" rx="14" fill="none" stroke="${WARN}" stroke-width="3" stroke-dasharray="8 6"/>` : ""}
    <text x="${cx}" y="${cy + 88}" font-family="${TH}" font-size="22" font-weight="700" text-anchor="middle" fill="${extra ? WARN : INK}">สีที่ ${n}</text>
    <text x="${cx}" y="${cy + 114}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${extra ? WARN : OK}">${extra ? "+฿10" : "ฟรี"}</text>`;

  const spools = [0, 1, 2, 3, 4].map((i) => spool(190 + i * 130, 668, THREADS[i], i + 1, i >= 3)).join("");

  const body = `
    ${title("สีไหมปัก", "ไหมไม่เกิน 3 สี รวมในราคาแล้ว — เกินจากนี้คิดเพิ่มสีละ ฿10")}
    ${bagShape(g, { clipId: "bagC" })}
    <g clip-path="url(#bagC)">${stitchDots}</g>
    ${pill(g.cx, g.bottom + 20, "ลายนี้ใช้ไหม 3 สี — รวมในราคา", "ok")}
    <line x1="60" y1="${g.bottom + 96}" x2="${W - 60}" y2="${g.bottom + 96}" stroke="#e2e8f0" stroke-width="2"/>
    ${spools}
    ${foot(["นับตาม “จำนวนสีไหม” ในลาย ไม่ใช่จำนวนจุดที่ปัก", "เพิ่มได้สูงสุด 15 สี · ราคาคิดต่อใบ"])}`;
  return frame(body);
}

// ── รายการภาพ ────────────────────────────────────────────────────────
/** วาดใหม่ + อัปโหลด */
const ART = {
  "emb-size": { svg: sizeArt(), group: "ขนาดปักไม่เกิน 8*4 cm", choice: "เกินเพิ่มเซนละ", note: "ขนาดปัก — 8x4 ซม. vs เกิน 3 ซม." },
  "emb-colors": { svg: colorArt(), group: "สีไหมไม่เกิน 3  สี", choice: "เกินเพิ่มสีละ", note: "สีไหม — 3 สีฟรี vs สีที่ 4 ขึ้นไป" },
};

/** ใช้รูปงานจริงในแกลเลอรี (index ใน data.images) — ไม่ต้องอัปโหลดใหม่ */
const FROM_GALLERY = [
  { group: "สีกระเป๋า", choice: "สีขาว", imageIndex: 2, note: "กระเป๋าขาวเต็มใบ + สายสะพาย" },
  { group: "สีกระเป๋า", choice: "สีดำ", imageIndex: 1, note: "กระเป๋าดำ ปักไหม 3 สี" },
];

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

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

const targets = [
  ...files,
  ...FROM_GALLERY.map((t) => {
    const src = data.images?.[t.imageIndex]?.src;
    if (!src) { console.error(`ไม่เจอรูปแกลเลอรีลำดับ ${t.imageIndex}`); process.exit(1); }
    return { ...t, url: src };
  }),
];

for (const t of targets) {
  const grp = (data.options ?? []).find((o) => o.label === t.group);
  const c = grp?.choices?.find((c) => c.name === t.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${t.choice}" ในกลุ่ม "${t.group}"`); process.exit(1); }
  c.imageSrc = t.url;
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const t of targets) {
  const got = back.data.options.find((o) => o.label === t.group)?.choices?.find((c) => c.name === t.choice)?.imageSrc;
  if (got !== t.url) { console.error("อ่านกลับไม่ตรง!", t.choice, got); process.exit(1); }
}
console.log(`✓ ตั้ง imageSrc ครบ ${targets.length} ตัวเลือก อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
