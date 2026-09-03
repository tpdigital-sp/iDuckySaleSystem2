#!/usr/bin/env node
/**
 * Magnet Bookmark (magnetbookmark) — ภาพประกอบทุกกลุ่มตัวเลือก
 *
 *   node scripts/magnet-bookmark-option-art.mjs            (วาดภาพลง .cache/magnetbookmark/upload ดูก่อน)
 *   node scripts/magnet-bookmark-option-art.mjs --write    (+ อัปโหลด storage + เขียน imageSrc + อ่านกลับเทียบ)
 *
 * ที่คั่นหนังสือแม่เหล็ก: แผ่นยาว 10 ซม. (ยังไม่พับ) พับครึ่งหนีบหน้ากระดาษด้วยแม่เหล็กในตัว
 *   · รูปแบบ — SIMPLE SHAPES (แท่งมาตรฐาน กว้างไม่เกิน 2.5) / CUSTOM DIE CUT (ตัดตามทรงลาย 3-4 หรือ 5-6)
 *   · ขนาดไดคัท — 2.5 / 3-4 / 5-6 ซม. ยาว 10 ซม. (สองตัวหลังมีรูปเดิมอยู่แล้ว → แทนด้วยรุ่นวาดใหม่)
 *   · เพิ่มความยาว — ต่อ 1 ซม. +8 บาท/ชิ้น = +40 บาท/เซ็ต (1 เซ็ต 5 ชิ้น)
 *
 * แตะแค่ choice.imageSrc — desc/extra/qty ของเดิมอยู่ครบ · รันซ้ำได้ (เขียนทับ imageSrc ตัวเดิม)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const HEART = await mascotDataUri("heart", 460);

const PRODUCT_ID = "magnetbookmark";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/magnetbookmark/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const STYLE_GROUP = "รูปแบบ";
const SIZE_GROUP = "ขนาดไดคัท";
const EXTEND_GROUP = "เพิ่มความยาว";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";
const FACE = "#fefefe"; // หน้าที่พิมพ์ลาย (กระดาษเคลือบขาว)
const BACK = "#e3f3fa"; // ด้านหลัง/ครึ่งบนที่พับไปข้างหลัง
const EDGE = "#7ba6b8";

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ lighter-size-option-art) */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 30 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12.5 : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

/** กรอบการ์ดพื้นหลัง + หัวเรื่อง/หมายเหตุ ใช้ร่วมทุกภาพ */
const card = (title, subtitle, body, note1 = "", note2 = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

let uid = 0;

/**
 * เส้นรอบแผ่น — pill ตรง ๆ (simple) หรือขอบคลื่นเบา ๆ (die cut ตามทรงลาย)
 * bx,ty = มุมซ้ายบน · w,h = กว้าง/สูง px
 */
function stripPath(bx, ty, w, h, wavy) {
  const r = Math.min(w / 2, w * 0.42);
  if (!wavy) {
    const rr = w / 2;
    return `M ${bx} ${ty + rr} A ${rr} ${rr} 0 0 1 ${bx + w} ${ty + rr} L ${bx + w} ${ty + h - rr} A ${rr} ${rr} 0 0 1 ${bx} ${ty + h - rr} Z`;
  }
  // ขอบคลื่น: ไล่ลงฝั่งขวา แล้วไล่ขึ้นฝั่งซ้าย บั้มสลับเข้า-ออกทีละช่วง
  const amp = w * 0.075;
  const n = 6;
  const seg = (x, y0, y1, dir) => {
    let d = "";
    const step = (y1 - y0) / n;
    for (let i = 0; i < n; i++) {
      const bump = x + dir * (i % 2 ? amp : -amp * 0.55);
      d += ` Q ${bump} ${y0 + step * (i + 0.5)} ${x} ${y0 + step * (i + 1)}`;
    }
    return d;
  };
  return `M ${bx + r} ${ty}
    L ${bx + w - r} ${ty} Q ${bx + w} ${ty} ${bx + w} ${ty + r}
    ${seg(bx + w, ty + r, ty + h - r, 1)}
    Q ${bx + w} ${ty + h} ${bx + w - r} ${ty + h}
    L ${bx + r} ${ty + h} Q ${bx} ${ty + h} ${bx} ${ty + h - r}
    ${seg(bx, ty + h - r, ty + r, -1)}
    Q ${bx} ${ty} ${bx + r} ${ty} Z`;
}

/**
 * แผ่นที่คั่นแบบกางออก (ยังไม่พับ) — ครึ่งบนคือด้านที่พับไปหลังกระดาษ ครึ่งล่างคือหน้าที่พิมพ์ลาย
 * มีเส้นประแนวพับตรงกลาง + แถบแม่เหล็กจาง ๆ ใกล้ปลายทั้งสอง
 */
function strip(cx, ty, CM, widthCm, o = {}) {
  // foldLabel: "none" ไม่มีป้าย · "short" คำเดียว · "full" สองบรรทัด
  const { wavy = false, lenCm = 10, mascot = HEART, foldLabel = "none", magnetLabel = false, artEndCm = lenCm } = o;
  const w = widthCm * CM;
  const h = lenCm * CM;
  const bx = cx - w / 2;
  const midY = ty + h / 2;
  const id = `st${++uid}`;
  const path = stripPath(bx, ty, w, h, wavy);

  // ลายมาสคอต วางระหว่างแนวพับถึงปลายโซนลาย (ปกติ = ปลายล่าง แต่ภาพเพิ่มความยาวจำกัดไว้ที่ 10 ซม.)
  const zoneEnd = ty + artEndCm * CM - CM * 0.6;
  let aw = w - CM * 0.7;
  let ah = aw / mascot.ratio;
  const maxH = zoneEnd - midY - CM * 0.7;
  if (ah > maxH) { ah = maxH; aw = ah * mascot.ratio; }
  const artY = midY + (zoneEnd - midY - ah) / 2 + CM * 0.08;

  // แถบแม่เหล็กในตัว ใกล้ปลายบน-ล่าง
  const mag = (y) => `<rect x="${bx + w * 0.18}" y="${y}" width="${w * 0.64}" height="${CM * 0.5}" rx="${CM * 0.14}"
      fill="#94a3b8" opacity="0.35" stroke="#64748b" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  const magY1 = ty + CM * 0.55;
  const magY2 = ty + h - CM * 1.05;

  return `
  <defs><clipPath id="${id}"><path d="${path}"/></clipPath></defs>
  <path d="${path}" fill="${FACE}" stroke="${EDGE}" stroke-width="3.5"/>
  <rect x="${bx - 6}" y="${ty - 6}" width="${w + 12}" height="${midY - ty + 6}" fill="${BACK}" clip-path="url(#${id})"/>
  ${mag(magY1)}${mag(magY2)}
  <image href="${mascot.uri}" x="${cx - aw / 2}" y="${artY}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
  <line x1="${bx - 14}" y1="${midY}" x2="${bx + w + 14}" y2="${midY}" stroke="${OK}" stroke-width="3" stroke-dasharray="9 7"/>
  ${foldLabel !== "none" ? `
    <text x="${bx + w + 26}" y="${midY + (foldLabel === "full" ? -6 : 8)}" font-family="${TH}" font-size="22" font-weight="700" fill="${OK}">แนวพับครึ่ง</text>` : ""}
  ${foldLabel === "full" ? `
    <text x="${bx + w + 26}" y="${midY + 24}" font-family="${TH}" font-size="20" fill="${SUB}">ครึ่งบนพับไปหลังกระดาษ</text>` : ""}
  ${magnetLabel ? `
    <text x="${bx + w + 26}" y="${magY1 + CM * 0.42}" font-family="${TH}" font-size="20" fill="${SUB}">แผ่นแม่เหล็กในตัว</text>
    <text x="${bx + w + 26}" y="${magY2 + CM * 0.42}" font-family="${TH}" font-size="20" fill="${SUB}">แม่เหล็กปลายอีกด้าน</text>` : ""}`;
}

/** หน้ากระดาษหนังสือ (มีบรรทัดตัวหนังสือจาง ๆ) ไว้โชว์ตอนหนีบใช้งานจริง */
function page(x, y, w, h) {
  const lines = [];
  for (let ly = y + 46; ly < y + h - 20; ly += 30) {
    lines.push(`<line x1="${x + 22}" y1="${ly}" x2="${x + w - 22 - (ly % 90 === 0 ? 40 : 0)}" y2="${ly}" stroke="#cbd5e1" stroke-width="5" stroke-linecap="round"/>`);
  }
  return `
  <rect x="${x + 8}" y="${y + 10}" width="${w}" height="${h}" rx="8" fill="#eef2f7"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#ffffff" stroke="#dbe3ec" stroke-width="2"/>
  ${lines.join("")}`;
}

/** ที่คั่นตอนพับแล้วหนีบบนขอบกระดาษ — เห็นหน้าลาย + สันพับโผล่เหนือขอบนิดเดียว */
function clipped(cx, pageTop, CM, widthCm, o = {}) {
  const { wavy = false, mascot = HEART } = o;
  const w = widthCm * CM;
  const h = 5 * CM; // พับแล้วเหลือครึ่ง
  const bx = cx - w / 2;
  const ty = pageTop - CM * 0.34; // สันพับพ้นขอบกระดาษขึ้นไปเล็กน้อย
  const path = stripPath(bx, ty, w, h + CM * 0.34, wavy);
  let aw = w - CM * 0.7;
  let ah = aw / mascot.ratio;
  const maxH = h - CM * 1.0;
  if (ah > maxH) { ah = maxH; aw = ah * mascot.ratio; }
  return `
  <path d="${path}" fill="${FACE}" stroke="${EDGE}" stroke-width="3.5"/>
  <rect x="${bx - 4}" y="${ty}" width="${w + 8}" height="${CM * 0.34}" fill="${BACK}" opacity="0.9"/>
  <line x1="${bx}" y1="${pageTop}" x2="${bx + w}" y2="${pageTop}" stroke="${EDGE}" stroke-width="2" opacity="0.6"/>
  <image href="${mascot.uri}" x="${cx - aw / 2}" y="${ty + CM * 0.75}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>`;
}

/** ป้ายชื่อใต้ภาพย่อย */
const tag = (cx, y, text, on = true) => {
  const w = text.length * 14 + 44;
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="42" rx="21"
    fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2.5"/>
  <text x="${cx}" y="${y + 29}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle"
    fill="${on ? OK : SUB}">${text}</text>`;
};

// ── 1. กลุ่ม "รูปแบบ" ─────────────────────────────────────────────────
function styleSimpleArt() {
  const CM = 52;
  const lx = 268;
  const topY = 196;
  return card("SIMPLE SHAPES", "ทรงมาตรฐานแบบเดียว — พับครึ่งหนีบหน้ากระดาษด้วยแม่เหล็ก", `
  ${strip(lx, topY, CM, 2.5, { foldLabel: "full", magnetLabel: true })}
  ${tag(lx + 60, topY + 10 * CM + 26, "กางออก ยาว 10 ซม.", false)}
  ${page(576, 300, 264, 330)}
  ${clipped(660, 300, CM * 0.82, 2.5)}
  ${tag(708, 652, "พับหนีบหน้ากระดาษ")}`,
    "กว้างไม่เกิน 2.5 × ยาวไม่เกิน 10 ซม. (ขนาดก่อนพับครึ่ง)",
    "1 เซ็ต = 5 ชิ้น · 1 แบบ 1 ขนาด ต่อชุด");
}

function styleDiecutArt() {
  const CM = 52;
  const lx = 258;
  const topY = 196;
  return card("CUSTOM (DIE CUT)", "ไดคัทตามทรงลายของคุณ — ขอบตัดเลาะตามลาย", `
  ${strip(lx, topY, CM, 3.5, { wavy: true, foldLabel: "short" })}
  ${tag(lx + 60, topY + 10 * CM + 26, "กางออก ยาว 10 ซม.", false)}
  ${page(576, 300, 264, 330)}
  ${clipped(660, 300, CM * 1.06, 3.5, { wavy: true })}
  ${tag(708, 652, "พับหนีบหน้ากระดาษ")}`,
    "เลือกกว้าง 3-4 หรือ 5-6 ซม. · ยาว 10 ซม. (ก่อนพับครึ่ง)",
    "ระยะตัดตก 2-3 มม. — ขอบอาจมีขาวบ้างตามข้อจำกัดเครื่องตัด");
}

// ── 2. กลุ่ม "ขนาดไดคัท" ──────────────────────────────────────────────
function sizeArt(widthCm, widthLabel, styleName, wavy) {
  const CM = 52;
  const cx = W / 2 + 20;
  const topY = 190;
  const w = widthCm * CM;
  const h = 10 * CM;
  return card(`กว้าง ${widthLabel} × ยาว 10 ซม.`, `${styleName}`, `
  ${strip(cx, topY, CM, widthCm, { wavy, foldLabel: "short" })}
  ${dim(cx - w / 2 - 46, topY, cx - w / 2 - 46, topY + h, "10 ซม.")}
  ${dim(cx - w / 2, topY + h + 34, cx + w / 2, topY + h + 34, `${widthLabel} ซม.`)}`,
    "ด้านยาว 10 ซม. คือขนาดที่ยังไม่พับครึ่ง — พับแล้วเหลือประมาณ 5 ซม.",
    "1 เซ็ต = 5 ชิ้น · เพิ่มความยาวได้ ซม. ละ 8 บาท/ชิ้น");
}

// ── 3. กลุ่ม "เพิ่มความยาว" ───────────────────────────────────────────
function extendArt() {
  const CM = 42;
  const topY = 200;
  const lx = 290;
  const rx = 610;
  const w = 2.5 * CM;
  const extCm = 2;
  const h10 = 10 * CM;
  const hExt = (10 + extCm) * CM;
  const extTop = topY + h10;
  return card("เพิ่มความยาว (ต่อ 1 ซม.)", "ยาวกว่ามาตรฐาน 10 ซม. — สั่งเพิ่มเป็นเซนติเมตรได้", `
  ${strip(lx, topY, CM, 2.5)}
  ${tag(lx, topY + h10 + 24, "มาตรฐาน 10 ซม.", false)}
  ${strip(rx, topY, CM, 2.5, { lenCm: 10 + extCm, artEndCm: 10 })}
  <defs><clipPath id="extclip"><path d="${stripPath(rx - w / 2, topY, w, hExt, false)}"/></clipPath></defs>
  <rect x="${rx - w / 2}" y="${extTop}" width="${w}" height="${hExt - h10}" fill="${OK}" opacity="0.16" clip-path="url(#extclip)"/>
  <line x1="${rx - w / 2 - 10}" y1="${extTop}" x2="${rx + w / 2 + 10}" y2="${extTop}" stroke="${OK}" stroke-width="3" stroke-dasharray="8 6"/>
  ${dim(rx + w / 2 + 44, extTop, rx + w / 2 + 44, topY + hExt, `+${extCm} ซม.`)}
  ${tag(rx, topY + hExt + 24, `ตัวอย่าง: ยาว ${10 + extCm} ซม.`)}`,
    "คิดเพิ่ม ซม. ละ 8 บาท/ชิ้น = 40 บาท/เซ็ต (1 เซ็ต 5 ชิ้น)",
    "เลือกจำนวน ซม. ที่เพิ่มได้ในช่องนี้ — เช่น เพิ่ม 2 ซม. เลือก ×2");
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
const JOBS = [
  { file: `style-simple-${VER}.jpg`, svg: styleSimpleArt(), group: STYLE_GROUP, choice: "SIMPLE SHAPES" },
  { file: `style-diecut-${VER}.jpg`, svg: styleDiecutArt(), group: STYLE_GROUP, choice: "CUSTOM (DIE CUT)" },
  { file: `size-2-5-art-${VER}.jpg`, svg: sizeArt(2.5, "2.5", "SIMPLE SHAPES — ทรงมาตรฐาน", false), group: SIZE_GROUP, choice: "กว้าง 2.5 cm ยาว 10cm" },
  { file: `size-3-4-art-${VER}.jpg`, svg: sizeArt(3.5, "3-4", "CUSTOM (DIE CUT) — ไดคัทตามทรงลาย", true), group: SIZE_GROUP, choice: "กว้าง 3-4cm ยาว 10cm" },
  { file: `size-5-6-art-${VER}.jpg`, svg: sizeArt(5.5, "5-6", "CUSTOM (DIE CUT) — ไดคัทตามทรงลาย", true), group: SIZE_GROUP, choice: "กว้าง 5-6cm ยาว 10cm" },
  { file: `extend-per-cm-${VER}.jpg`, svg: extendArt(), group: EXTEND_GROUP, choice: "เพิ่มความยาว (ต่อ 1 cm)" },
];

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${j.group}: ${j.choice}`);
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

// แตะแค่ imageSrc ของตัวเลือกเดิม (desc/extra/qty คงเดิม)
for (const j of JOBS) {
  const g = (data.options ?? []).find((o) => o.label === j.group);
  const c = g?.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.group}: ${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url;
}

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const j of JOBS) {
  const got = back.data.options.find((o) => o.label === j.group)?.choices?.find((c) => c.name === j.choice)?.imageSrc;
  if (got !== j.url) { console.error("อ่านกลับไม่ตรง!", j.group, j.choice, got); process.exit(1); }
}
const ext = back.data.options.find((o) => o.label === EXTEND_GROUP)?.choices?.[0];
if (ext?.extra !== 40 || ext?.qty !== true || ext?.qtyMax !== 10) { console.error("ค่ากลุ่มเพิ่มความยาวหาย!", ext); process.exit(1); }
console.log(`✓ ภาพตัวเลือก ${JOBS.length} ภาพ อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
