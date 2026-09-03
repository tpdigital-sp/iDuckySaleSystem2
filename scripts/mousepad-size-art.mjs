#!/usr/bin/env node
/**
 * Mouse Pad / แผ่นรองเมาส์ (mousepad) — ภาพประกอบตัวเลือกกลุ่ม "ขนาด" 6 ขนาด
 *
 *   node scripts/mousepad-size-art.mjs            (วาดภาพลง .cache/mousepad/upload ดูก่อน)
 *   node scripts/mousepad-size-art.mjs --write    (+ อัปโหลด storage + เขียน imageSrc + อ่านกลับเทียบ)
 *
 * กลุ่ม "ขนาด" เป็นแกนราคา (driverLabels ["ขนาด"]) — ห้ามแตะชื่อตัวเลือก เติมแค่ imageSrc
 * ขนาดตามชื่อตัวเลือก: ตัวแรก = ลึก (สูงในภาพ) · ตัวหลัง = กว้าง เช่น 30x60 = ลึก 30 กว้าง 60
 *
 * ดีไซน์: ทุกใบสเกลเดียวกัน (CM = 8.4 px/ซม.) เทียบขนาดข้ามใบได้จริง
 *  - แผ่นเล็ก (18×21, 25×30): เมาส์วางบนแผ่น คีย์บอร์ดขนาดจริงอยู่ข้าง ๆ นอกแผ่น (จาง = แค่เทียบ)
 *  - แผ่นยาว (30×60 ขึ้นไป): คีย์บอร์ด + เมาส์วางบนแผ่นเลย สื่อว่าเป็น desk mat เต็มโต๊ะ
 *  - เลขขนาดตัวใหญ่กลางภาพ (ภาพย่อบนปุ่ม/dropdown เรนเดอร์เล็กมาก ต้องอ่านออก)
 *
 * รันซ้ำได้: เขียนทับ imageSrc ตัวเดิม ไม่แตะ desc/extra/ลำดับ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "mousepad";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/mousepad/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** สเกลรวมทุกใบ — 90 ซม. (ใบใหญ่สุด) = 756 px ยังเหลือที่ให้ลูกศรวัดฝั่งขวา */
const CM = 8.4;

/** ขนาดของจริงที่ใช้เทียบ (ซม.) */
const KB_W = 36, KB_H = 13.5;   // คีย์บอร์ด TKL
const MS_W = 6.4, MS_H = 11;    // เมาส์

/** ขนาดทั้ง 6 — key = ชื่อตัวเลือกใน DB (แกนราคา ห้ามเปลี่ยน) */
const SIZES = [
  { name: "18x21cm", d: 18, w: 21, use: "ขนาดเล็ก กะทัดรัด — เมาส์อย่างเดียว", onPad: false },
  { name: "25x30cm", d: 25, w: 30, use: "ขนาดมาตรฐานยอดนิยม — เมาส์อย่างเดียว", onPad: false },
  { name: "30x60cm", d: 30, w: 60, use: "แผ่นยาว วางคีย์บอร์ด + เมาส์ได้", onPad: true },
  { name: "30x80cm", d: 30, w: 80, use: "แผ่นยาว วางคีย์บอร์ด + เมาส์ได้", onPad: true },
  { name: "40x80cm", d: 40, w: 80, use: "แผ่นใหญ่เต็มโต๊ะ ลึกพิเศษ 40 ซม.", onPad: true },
  { name: "40x90cm", d: 40, w: 90, use: "แผ่นใหญ่สุด เต็มโต๊ะทำงาน/เกมมิ่ง", onPad: true },
];

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (แนวตั้งป้ายคร่อมกลางเส้น) */
const dim = (x1, y1, x2, y2, label) => {
  const vertical = x1 === x2;
  /* ป้ายแนวตั้งคร่อมเส้น แต่หนีบไม่ให้ตกขอบการ์ดขวา (ใบ 90 ซม. เส้นชิดขอบ) */
  const lx = vertical ? Math.min(x1, W - 70) : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + 30;
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (label.length * 12.5) / 2}" y="${ly - 24}" width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${SUB}">${label}</text>`;
};

/** คีย์บอร์ด TKL มองบน 36×13.5 ซม. — กรอบเข้ม + ปุ่มเรียงแถว */
function keyboard(x0, y0, id = "kb", faded = false) {
  const w = KB_W * CM, h = KB_H * CM;
  const pad = 0.55 * CM;
  const rows = 5, cols = 15;
  const kw = (w - pad * 2 - (cols - 1) * 3) / cols;
  const kh = (h - pad * 2 - (rows - 1) * 3) / rows;
  let keys = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // แถวล่างสุดทำ spacebar ยาวกลาง
      if (r === rows - 1 && c >= 4 && c <= 9) {
        if (c === 4) keys += `<rect x="${x0 + pad + 4 * (kw + 3)}" y="${y0 + pad + r * (kh + 3)}" width="${kw * 6 + 15}" height="${kh}" rx="3.5" fill="#475569"/>`;
        continue;
      }
      keys += `<rect x="${x0 + pad + c * (kw + 3)}" y="${y0 + pad + r * (kh + 3)}" width="${kw}" height="${kh}" rx="3.5" fill="#475569"/>`;
    }
  }
  return `<g opacity="${faded ? 0.45 : 1}">
    <rect x="${x0 + 4}" y="${y0 + 8}" width="${w}" height="${h}" rx="10" fill="#0f172a" opacity="0.12"/>
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="10" fill="#1e293b" stroke="#0f172a" stroke-width="2.5"/>
    ${keys}
  </g>`;
}

/** เมาส์มองบน 6.4×11 ซม. — ตัวรี ปุ่มแยกสองฝั่ง + ล้อเลื่อน */
function mouse(cx, cy, faded = false) {
  const w = MS_W * CM, h = MS_H * CM;
  return `<g opacity="${faded ? 0.45 : 1}">
    <ellipse cx="${cx + 3}" cy="${cy + 7}" rx="${w / 2}" ry="${h / 2}" fill="#0f172a" opacity="0.14"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2.5"/>
    <path d="M ${cx - w / 2} ${cy - h * 0.13} Q ${cx} ${cy - h * 0.02} ${cx + w / 2} ${cy - h * 0.13}" fill="none" stroke="#94a3b8" stroke-width="2"/>
    <line x1="${cx}" y1="${cy - h * 0.46}" x2="${cx}" y2="${cy - h * 0.1}" stroke="#94a3b8" stroke-width="2"/>
    <rect x="${cx - 5}" y="${cy - h * 0.33}" width="10" height="${h * 0.16}" rx="5" fill="#64748b"/>
  </g>`;
}

/** ป้ายกำกับเล็กใต้ของเทียบขนาด */
const tag = (cx, y, text, on = false) => {
  const w = text.length * 12.5 + 36;
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="36" rx="18" fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2"/>
  <text x="${cx}" y="${y + 25}" font-family="${TH}" font-size="20" font-weight="600" text-anchor="middle" fill="${on ? OK : SUB}">${text}</text>`;
};

/** ตัวแผ่นรองเมาส์ พิมพ์ลายเต็มแผ่น + เย็บขอบ — มุมบนซ้ายที่ (x0,y0) ขนาด w×h px */
function pad(x0, y0, w, h, id = "p", artTop = false) {
  // มาสคอต = ลายลูกค้า วางค่อนซ้ายของแผ่น · artTop = ยกขึ้นค่อนบน (แผ่นยาวมีคีย์บอร์ดคาดล่าง)
  let ah = h * (artTop ? 0.56 : 0.66);
  let aw = ah * MASCOT.ratio;
  if (aw > w * 0.42) { aw = w * 0.42; ah = aw / MASCOT.ratio; }
  const mx = x0 + Math.max(aw / 2 + h * 0.12, w * 0.2);
  const my = artTop ? y0 + h * 0.06 + ah / 2 : y0 + h / 2;
  return `
  <defs>
    <linearGradient id="fab-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0e7490"/>
      <stop offset="0.55" stop-color="#155e75"/>
      <stop offset="1" stop-color="#164e63"/>
    </linearGradient>
    <pattern id="dot-${id}" width="64" height="64" patternUnits="userSpaceOnUse">
      <circle cx="14" cy="14" r="4" fill="#67e8f9" opacity="0.35"/>
      <circle cx="46" cy="40" r="2.6" fill="#a5f3fc" opacity="0.3"/>
      <circle cx="26" cy="54" r="1.7" fill="#cffafe" opacity="0.3"/>
    </pattern>
  </defs>
  <rect x="${x0 + 6}" y="${y0 + 12}" width="${w}" height="${h}" rx="14" fill="#0f172a" opacity="0.16"/>
  <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="14" fill="url(#fab-${id})" stroke="#0c4a5e" stroke-width="3"/>
  <clipPath id="clip-${id}"><rect x="${x0 + 3}" y="${y0 + 3}" width="${w - 6}" height="${h - 6}" rx="11"/></clipPath>
  <g clip-path="url(#clip-${id})">
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#dot-${id})"/>
    <image href="${MASCOT.uri}" x="${mx - aw / 2}" y="${my - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet" opacity="0.95"/>
  </g>
  <!-- เส้นเย็บขอบโดยรอบ -->
  <rect x="${x0 + 9}" y="${y0 + 9}" width="${w - 18}" height="${h - 18}" rx="9" fill="none" stroke="#67e8f9" stroke-width="2.5" stroke-dasharray="9 7" opacity="0.85"/>`;
}

/** การ์ดขนาดหนึ่งใบ */
function sizeArt(s) {
  const pw = s.w * CM, ph = s.d * CM;
  const kw = KB_W * CM, kh = KB_H * CM;
  let body = "";
  let sceneBottom;

  if (s.onPad) {
    // ── แผ่นยาว: แผ่นกลางการ์ด คีย์บอร์ด+เมาส์วางบนแผ่น ──
    const x0 = W / 2 - pw / 2;
    const cy = 465;
    const y0 = cy - ph / 2;
    // คีย์บอร์ดค่อนซ้าย-ล่างของแผ่น · เมาส์ขวา
    const kbx = x0 + pw * (s.w >= 80 ? 0.44 : 0.48) - kw / 2;
    const kby = y0 + ph - kh - 0.9 * CM;
    const msx = kbx + kw + Math.min(2.2 * CM + (pw - kw) * 0.12, 4 * CM) + (MS_W * CM) / 2;
    const msy = kby + kh / 2 - 0.2 * CM;
    body = `
    ${pad(x0, y0, pw, ph, s.name, true)}
    ${keyboard(kbx, kby, "kb", false)}
    ${mouse(msx, msy, false)}
    ${dim(x0, y0 + ph + 44, x0 + pw, y0 + ph + 44, `${s.w} ซม.`)}
    ${dim(x0 + pw + 36, y0, x0 + pw + 36, y0 + ph, `${s.d} ซม.`)}
    ${tag(W / 2, y0 + ph + 78, "วางคีย์บอร์ด + เมาส์บนแผ่นได้เลย", true)}`;
    sceneBottom = y0 + ph + 78;
  } else {
    // ── แผ่นเล็ก: คีย์บอร์ดขนาดจริง (จาง) อยู่ซ้าย · แผ่น+เมาส์ขวา แบบบนโต๊ะจริง ──
    const gap = 3 * CM;
    const total = kw + gap + pw;
    const left = W / 2 - total / 2;
    const baseY = 560; // แนวขอบล่างของทุกชิ้น (วางบนโต๊ะเดียวกัน)
    const kbx = left, kby = baseY - kh;
    const x0 = left + kw + gap;
    const y0 = baseY - ph;
    const msx = x0 + pw / 2, msy = y0 + ph / 2 - 0.4 * CM;
    body = `
    ${keyboard(kbx, kby, "kb", true)}
    ${pad(x0, y0, pw, ph, s.name)}
    ${mouse(msx, msy, false)}
    ${dim(x0, baseY + 44, x0 + pw, baseY + 44, `${s.w} ซม.`)}
    ${dim(x0 + pw + 36, y0, x0 + pw + 36, baseY, `${s.d} ซม.`)}
    ${tag(kbx + kw / 2, baseY + 26, "คีย์บอร์ด — เทียบขนาดจริง")}`;
    sceneBottom = baseY + 78;
  }

  // เลขขนาดตัวใหญ่กลางภาพ — ภาพย่อบนปุ่ม/แถว dropdown เล็กมาก ต้องอ่านออก
  const big = `${s.d}×${s.w}`;
  const bw = big.length * 46 + 150;
  const bigY = s.onPad ? 262 : 300;
  const bigLabel = `
  <g>
    <rect x="${W / 2 - bw / 2}" y="${bigY - 62}" width="${bw}" height="96" rx="24" fill="#ffffff" opacity="0.93" stroke="#a5f3fc" stroke-width="2.5"/>
    <text x="${W / 2 - 42}" y="${bigY + 8}" font-family="${TH}" font-size="84" font-weight="800" text-anchor="middle" fill="${OK}">${big}</text>
    <text x="${W / 2 + bw / 2 - 58}" y="${bigY + 6}" font-family="${TH}" font-size="30" font-weight="700" text-anchor="middle" fill="${SUB}">ซม.</text>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด ${s.d} × ${s.w} ซม.</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${s.use}</text>
  ${body}
  ${bigLabel}
  <text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ทุกภาพสเกลเดียวกัน เทียบขนาดข้ามตัวเลือกได้จริง</text>
  <text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">พิมพ์ลายเต็มแผ่นระบบซับลิเมชั่น · ผิวผ้าลื่น ฐานยางกันลื่น · เย็บขอบโดยรอบ</text>
</svg>`;
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
const JOBS = SIZES.map((s) => ({ file: `size-${s.name.replace("cm", "")}-${VER}.jpg`, svg: sizeArt(s), choice: s.name }));

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${SIZE_GROUP}: ${j.choice}`);
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

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
// สคริปต์เขียนตรงไม่ผ่าน API = ไม่เก็บ product_revisions — dump สภาพเดิมกันเหนียวก่อน
writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(data, null, 1));

const group = (data.options ?? []).find((o) => o.label === SIZE_GROUP);
if (!group) { console.error(`ไม่เจอกลุ่ม "${SIZE_GROUP}"`); process.exit(1); }
for (const j of JOBS) {
  const c = group.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.choice}" ในกลุ่ม "${SIZE_GROUP}"`); process.exit(1); }
  c.imageSrc = j.url; // แตะแค่ imageSrc — ชื่อเป็นคีย์แกนราคา ห้ามเปลี่ยน
}

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const backGroup = back.data.options.find((o) => o.label === SIZE_GROUP);
for (const j of JOBS) {
  const got = backGroup?.choices?.find((c) => c.name === j.choice)?.imageSrc;
  if (got !== j.url) { console.error("อ่านกลับไม่ตรง!", j.choice, got); process.exit(1); }
}
// แกนราคาต้องไม่สะเทือน — ชื่อตัวเลือกยังตรงคีย์ cells ครบ
const cellKeys = Object.keys(back.data.pricing?.cells ?? {});
for (const c of backGroup.choices) {
  if (!cellKeys.includes(c.name)) { console.error("ชื่อตัวเลือกหลุดจากคีย์ตาราง!", c.name); process.exit(1); }
}
console.log(`✓ imageSrc ${JOBS.length} ภาพ อ่านกลับตรงทุกตัว · คีย์ตารางครบ · savedAt =`, back.data.savedAt);
