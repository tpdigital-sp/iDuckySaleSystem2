#!/usr/bin/env node
/**
 * กระดาษ Texture Paper (texture-paper) — ภาพประกอบกลุ่ม "การตัด" (3 ตัวเลือก) + แสดงเป็นการ์ด
 *
 *   node scripts/texture-paper-cut-option-art.mjs           (วาดลง .cache/texture-paper/upload ดูก่อน)
 *   node scripts/texture-paper-cut-option-art.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ดีไซน์: เล่าเป็น "แผ่น A3 ที่พิมพ์ → ชิ้นงานที่ลูกค้าได้รับ" ซ้าย-ขวา มีลูกศรคั่น
 *   ไม่ไดคัท    → ลายเดียวเต็มแผ่น ไม่มีแนวตัด      · ได้แผ่นเต็ม A3 (ลูกค้าไปตัดเอง)
 *   ตัดตามขนาด  → เรียงลายเป็นตาราง เส้นประตรงคั่น   · ได้ชิ้นสี่เหลี่ยมขอบตรง
 *   ไดคัทตามทรง → เรียงลายบนแผ่น เส้นประอ้อมรอบลาย  · ได้ชิ้นตามทรงของลาย (ขอบโค้ง)
 *   ⚠️ เส้นตัดต้อง "อ้อมลาย" ไม่ใช่ผ่ากลางลาย — ของจริงคือวางหลายชิ้นในแผ่นเดียวแล้วค่อยตัด
 *   จุดต่างที่อ่านออกตั้งแต่ปุ่ม 62px = แผ่นซ้าย (ลายใหญ่ใบเดียว / ตาราง 6 ช่อง / ก้อนทรงโค้ง)
 *   (ภาพจัตุรัส 900×900 เท่าช่อง object-cover ของปุ่ม จึงเห็นเต็มใบ ไม่ถูกครอป)
 *
 * ⚠️ "การตัด" เป็นแกนที่ 2 ของตารางราคา (driverLabels) — ห้ามแก้ชื่อตัวเลือกเด็ดขาด
 *    และยังถูกอ้างด้วย showWhen ของกลุ่ม "ตัดเป็นขนาด" / "ขนาดไดคัท (กว้าง|สูง)"
 * ⚠️ ไม่ใส่ตัวเลขราคาลงในภาพ — ราคาต่อช่องอยู่ในตารางราคา หน้าเว็บคิดให้เอง
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 460);

const PRODUCT_ID = "texture-paper";
const GROUP = "การตัด";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/texture-paper/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CUT = "#f43f5e"; // สีแนวตัด — ให้เห็นชัดว่าเป็น "เส้นตัด" ไม่ใช่ลาย

/** แผ่น A3 ย่อ (ซ้าย) — อัตราส่วนจริง 29.7 : 42 */
const SW = 244;
const SH = Math.round((SW * 42) / 29.7); // 345
const CY = 498;
const LX = 116;
const SY = CY - SH / 2;
const RC = 640; // จุดกึ่งกลางฝั่งขวา (ชิ้นงานที่ได้)

const GRAD = (id) => `url(#${id})`;

/** ประกายผิวกระดาษพิเศษ — แถบแสงเฉียง (ชุดเดียวกับภาพกลุ่ม "จำนวนด้านที่พิมพ์") */
const shimmer = (x, y, w, h, op = 0.55) => `
  <g opacity="${op}">
    <path d="M ${x - 20} ${y + h * 0.34} L ${x + w * 0.62} ${y - 20} L ${x + w * 0.86} ${y - 20} L ${x - 20} ${y + h * 0.62} Z" fill="#ffffff" opacity="0.34"/>
    <path d="M ${x + w * 0.34} ${y + h + 20} L ${x + w + 20} ${y + h * 0.46} L ${x + w + 20} ${y + h * 0.66} L ${x + w * 0.7} ${y + h + 20} Z" fill="#ffffff" opacity="0.22"/>
  </g>`;

/** ลายเต็มแผ่น — มาสคอตใหญ่ + บรรทัดข้อความ (ใช้กับ "ไม่ไดคัท" และชิ้นแผ่นเต็มฝั่งขวา) */
const bigArt = (x, y, w, h) => {
  const mh = h * 0.5;
  const mw = mh * MASCOT.ratio;
  const cx = x + w / 2;
  return `
    <circle cx="${cx}" cy="${y + h * 0.38}" r="${Math.min(w, h) * 0.3}" fill="#ffffff" opacity="0.32"/>
    <image href="${MASCOT.uri}" x="${cx - mw / 2}" y="${y + h * 0.12}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
    <rect x="${x + w * 0.18}" y="${y + h * 0.7}" width="${w * 0.64}" height="${h * 0.07}" rx="${h * 0.02}" fill="#ffffff" opacity="0.88"/>
    <rect x="${x + w * 0.26}" y="${y + h * 0.83}" width="${w * 0.48}" height="${h * 0.045}" rx="${h * 0.02}" fill="#ffffff" opacity="0.6"/>`;
};

/** ลายย่อยหนึ่งชิ้น — มาสคอต + ขีดข้อความหนึ่งเส้น (วางในกรอบ w×h ได้พอดี ไม่ต้อง clip) */
const miniArt = (cx, cy, w, h) => {
  const mh = h * 0.6;
  const mw = mh * MASCOT.ratio;
  return `
    <image href="${MASCOT.uri}" x="${cx - mw / 2}" y="${cy - h * 0.42}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
    <rect x="${cx - w * 0.3}" y="${cy + h * 0.24}" width="${w * 0.6}" height="${Math.max(4, h * 0.09)}" rx="${h * 0.045}" fill="#ffffff" opacity="0.88"/>`;
};

/** เส้นขอบชิ้นงาน "ตามทรง" — วงกลมบิดเป็นก้อนออร์แกนิก (n จุด สลับยุบ-นูน) */
function blob(cx, cy, rx, ry, n = 11, wob = 0.1) {
  const pt = (i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const k = 1 + (i % 2 ? -wob : wob);
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
  };
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const f = ([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  let d = `M ${f(mid(pt(n - 1), pt(0)))}`;
  for (let i = 0; i < n; i++) d += ` Q ${f(pt(i))} ${f(mid(pt(i), pt((i + 1) % n)))}`;
  return `${d} Z`;
}

const arrow = `
  <path d="M ${LX + SW + 30} ${CY} h 72" fill="none" stroke="#94a3b8" stroke-width="5" stroke-linecap="round"/>
  <path d="M ${LX + SW + 104} ${CY - 11} l 18 11 -18 11 z" fill="#94a3b8"/>
  <text x="${LX + SW + 76}" y="${CY - 26}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">ได้เป็น</text>`;

/** เงาใต้ชิ้นงาน */
const shadowRect = (x, y, w, h, r = 3) => `<rect x="${x + 4}" y="${y + 7}" width="${w}" height="${h}" rx="${r}" fill="#0f172a" opacity="0.12"/>`;

/* ── ตัวเลือกที่ 1: ไม่ไดคัท — ลายเดียวเต็มแผ่น ไม่มีแนวตัด ─────────── */
const noCut = {
  name: "ไม่ไดคัท (เต็มแผ่น A3)",
  file: `cut-full-${VER}.jpg`,
  title: "ไม่ไดคัท (เต็มแผ่น A3)",
  sub: "พิมพ์แล้วส่งเป็นแผ่นเต็ม ไม่ตัดแบ่ง",
  foot: "ได้แผ่น A3 เต็ม 29.7 × 42 ซม. · ไปตัดเองได้ตามใจ",
  hint: "ไม่มีแนวตัด",
  desc: "ส่งเป็นแผ่น A3 เต็ม ไม่ตัดแบ่งให้ · เหมาะกับงานที่จะไปตัดเอง",
  sheet: () => `
    <rect x="${LX}" y="${SY}" width="${SW}" height="${SH}" rx="4" fill="${GRAD("sheet")}" stroke="#94a3b8" stroke-width="2"/>
    <g clip-path="url(#clip-sheet)">${bigArt(LX, SY, SW, SH)}${shimmer(LX, SY, SW, SH)}</g>`,
  right: () => {
    const w = 176;
    const h = Math.round((w * 42) / 29.7);
    const x = RC - w / 2;
    const y = CY - h / 2;
    return `
      ${shadowRect(x, y, w, h, 4)}
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${GRAD("sheet")}" stroke="#94a3b8" stroke-width="2"/>
      <g clip-path="url(#clip-right)">${bigArt(x, y, w, h)}${shimmer(x, y, w, h)}</g>
      <text x="${RC}" y="${y + h + 40}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">แผ่นเต็ม 1 แผ่น</text>`;
  },
};

/* ── ตัวเลือกที่ 2: ตัดตามขนาด — เรียงลายเป็นตาราง ตัดตรงตามเส้น ────── */
const COLS = 2;
const ROWS = 3;
const bySize = {
  name: "ตัดตามขนาด",
  file: `cut-size-${VER}.jpg`,
  title: "ตัดตามขนาด",
  sub: "เรียงลายลงแผ่น แล้วตัดตรงเป็นสี่เหลี่ยม",
  foot: "เลือกขนาดสำเร็จ (A4/A5/A6/A7/4×6 นิ้ว) หรือกรอกขนาดเอง",
  hint: "เส้นประ = แนวที่ตัด (ตัดตรง)",
  desc: "เรียงลายลงแผ่นแล้วตัดตรงเป็นสี่เหลี่ยมตามขนาดที่เลือก · เลือกขนาดสำเร็จหรือกรอก ก.×ส. เองได้",
  sheet: () => {
    const cw = SW / COLS;
    const ch = SH / ROWS;
    let cells = "";
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        cells += miniArt(LX + cw * (c + 0.5), SY + ch * (r + 0.5), cw * 0.82, ch * 0.82);
    let lines = "";
    for (let c = 1; c < COLS; c++)
      lines += `<line x1="${LX + cw * c}" y1="${SY}" x2="${LX + cw * c}" y2="${SY + SH}" stroke="${CUT}" stroke-width="3" stroke-dasharray="9 7"/>`;
    for (let r = 1; r < ROWS; r++)
      lines += `<line x1="${LX}" y1="${SY + ch * r}" x2="${LX + SW}" y2="${SY + ch * r}" stroke="${CUT}" stroke-width="3" stroke-dasharray="9 7"/>`;
    return `
      <rect x="${LX}" y="${SY}" width="${SW}" height="${SH}" rx="4" fill="${GRAD("sheet")}" stroke="#94a3b8" stroke-width="2"/>
      <g clip-path="url(#clip-sheet)">${shimmer(LX, SY, SW, SH, 0.4)}${cells}${lines}</g>`;
  },
  right: () => {
    const w = 128;
    const h = Math.round((w * 148) / 105); // สัดส่วน A6
    const set = [
      { x: RC - w / 2 - 34, y: CY - h / 2 - 26, rot: -8 },
      { x: RC - w / 2 + 2, y: CY - h / 2 + 4, rot: 4 },
      { x: RC - w / 2 + 34, y: CY - h / 2 + 32, rot: 12 },
    ];
    return set
      .map(
        (s) => `
      <g transform="rotate(${s.rot} ${s.x + w / 2} ${s.y + h / 2})">
        ${shadowRect(s.x, s.y, w, h)}
        <rect x="${s.x}" y="${s.y}" width="${w}" height="${h}" rx="3" fill="${GRAD("sheet")}" stroke="#94a3b8" stroke-width="2"/>
        ${miniArt(s.x + w / 2, s.y + h / 2, w * 0.86, h * 0.86)}
      </g>`
      )
      .join("") +
      `<text x="${RC}" y="${CY + h / 2 + 92}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">ชิ้นสี่เหลี่ยม ขอบตรง</text>`;
  },
};

/* ── ตัวเลือกที่ 3: ไดคัทตามทรง — เส้นตัดอ้อมรอบลายแต่ละชิ้น ────────── */
const byShape = {
  name: "ไดคัทตามทรง",
  file: `cut-shape-${VER}.jpg`,
  title: "ไดคัทตามทรง",
  sub: "ตัดอ้อมตามรูปทรงของลาย ขอบโค้งได้",
  foot: "ระบุขนาดไดคัท (กว้าง × สูง) ของชิ้นที่ต้องการ",
  hint: "เส้นประ = แนวที่ตัด (อ้อมลาย)",
  desc: "ตัดอ้อมตามรูปทรงของลาย ได้ชิ้นขอบโค้ง · ระบุขนาดไดคัท ก.×ส. ที่ต้องการ",
  sheet: () => {
    const rx = SW * 0.2;
    const ry = SH * 0.13;
    const spots = [
      { cx: LX + SW * 0.29, cy: SY + SH * 0.2 },
      { cx: LX + SW * 0.72, cy: SY + SH * 0.38 },
      { cx: LX + SW * 0.3, cy: SY + SH * 0.58 },
      { cx: LX + SW * 0.71, cy: SY + SH * 0.79 },
    ];
    const items = spots
      .map(
        (s) => `
      <path d="${blob(s.cx, s.cy, rx, ry)}" fill="${GRAD("sheet")}"/>
      ${miniArt(s.cx, s.cy, rx * 1.5, ry * 1.5)}
      <path d="${blob(s.cx, s.cy, rx * 1.13, ry * 1.16)}" fill="none" stroke="${CUT}" stroke-width="3" stroke-dasharray="9 7"/>`
      )
      .join("");
    return `
      <rect x="${LX}" y="${SY}" width="${SW}" height="${SH}" rx="4" fill="${GRAD("bare")}" stroke="#94a3b8" stroke-width="2"/>
      <g clip-path="url(#clip-sheet)">${shimmer(LX, SY, SW, SH, 0.9)}${items}</g>`;
  },
  right: () => {
    const rx = 84;
    const ry = 66;
    const set = [
      { cx: RC - 52, cy: CY - 96 },
      { cx: RC + 34, cy: CY - 2 },
      { cx: RC - 40, cy: CY + 92 },
    ];
    return set
      .map((s) => {
        const d = blob(s.cx, s.cy, rx, ry);
        return `
      <path d="${d}" transform="translate(4 7)" fill="#0f172a" opacity="0.12"/>
      <path d="${d}" fill="${GRAD("sheet")}" stroke="#94a3b8" stroke-width="2"/>
      ${miniArt(s.cx, s.cy, rx * 1.5, ry * 1.4)}`;
      })
      .join("") +
      `<text x="${RC}" y="${CY + 196}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">ชิ้นตามทรงของลาย</text>`;
  },
};

const PICKS = [noCut, bySize, byShape];

function svg(p) {
  const rw = 176;
  const rh = Math.round((rw * 42) / 29.7);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sheet" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#38bdf8"/><stop offset="0.55" stop-color="#22d3ee"/><stop offset="1" stop-color="#a5b4fc"/>
    </linearGradient>
    <!-- ผิวกระดาษพิเศษที่ยังไม่พิมพ์ (พื้นที่ส่วนเกินรอบชิ้นไดคัท) -->
    <linearGradient id="bare" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f1f5f9"/><stop offset="0.34" stop-color="#dbe3ec"/>
      <stop offset="0.62" stop-color="#eef2f7"/><stop offset="1" stop-color="#cbd5e1"/>
    </linearGradient>
    <clipPath id="clip-sheet"><rect x="${LX}" y="${SY}" width="${SW}" height="${SH}" rx="4"/></clipPath>
    <clipPath id="clip-right"><rect x="${RC - rw / 2}" y="${CY - rh / 2}" width="${rw}" height="${rh}" rx="4"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="176" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${p.title}</text>
  <text x="${W / 2}" y="218" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${p.sub}</text>

  <!-- ซ้าย: แผ่น A3 ที่พิมพ์แล้ว + แนวตัด -->
  ${shadowRect(LX, SY, SW, SH, 4)}
  ${p.sheet()}
  <text x="${LX + SW / 2}" y="${SY + SH + 40}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">แผ่น A3 ที่พิมพ์</text>
  <text x="${LX + SW / 2}" y="${SY + SH + 72}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${p === noCut ? SUB : CUT}">${p.hint}</text>

  ${arrow}

  <!-- ขวา: ชิ้นงานที่ได้รับ -->
  ${p.right()}

  <text x="${W / 2}" y="${H - 62}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${p.foot}</text>
</svg>`;
}

const built = [];
for (const p of PICKS) {
  const buf = await sharp(Buffer.from(svg(p))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${p.file}`, buf);
  await sharp(buf).resize(62, 62).toFile(`${OUT}/_thumb-${p.file}`);
  built.push({ ...p, buf });
  console.log(`🖼  ${OUT}/${p.file}  ${Math.round(buf.length / 1024)} KB — ${p.title} (+ _thumb ขนาดปุ่มจริง 62px)`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const p of built) {
  const key = `products/${PRODUCT_ID}/${p.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, p.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  p.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", p.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];
const group = options.find((o) => o.label === GROUP);
if (!group) { console.error(`ไม่เจอกลุ่ม "${GROUP}"`); process.exit(1); }
const before = options.length;
if (data.pricing?.driverLabels?.[1] !== GROUP) { console.error("แกนตารางราคาเปลี่ยน!", data.pricing?.driverLabels); process.exit(1); }

group.display = "cards";
group.choices = group.choices.map((c) => {
  const p = built.find((b) => b.name === c.name);
  if (!p) { console.error("เจอตัวเลือกที่ไม่มีในสคริปต์ (ชื่ออาจถูกแก้):", c.name); process.exit(1); }
  return { ...c, imageSrc: p.url, desc: p.desc }; // คงชื่อ/ฟิลด์อื่นไว้ครบ (ชื่อ = คีย์ราคา)
});
if (group.choices.length !== built.length) { console.error("จำนวนตัวเลือกไม่ตรงกับภาพที่วาด", group.choices.map((c) => c.name)); process.exit(1); }

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === GROUP);
if (g?.display !== "cards") { console.error("อ่านกลับ display ไม่เป็น cards", g?.display); process.exit(1); }
for (const p of built) {
  const c = g.choices.find((x) => x.name === p.name);
  if (c?.imageSrc !== p.url || c?.desc !== p.desc) { console.error("อ่านกลับตัวเลือกไม่ตรง!", p.name, c); process.exit(1); }
}
/* กันเผลอ: ชื่อตัวเลือก = คีย์ตารางราคา + คีย์ showWhen ของกลุ่มขนาด ต้องครบเหมือนเดิม */
if (back.data.pricing.driverLabels[1] !== GROUP) { console.error("แกนตารางราคาหลังเขียนเพี้ยน!"); process.exit(1); }
const linked = back.data.options.filter((o) => o.showWhen?.label === GROUP);
for (const n of ["ตัดตามขนาด", "ไดคัทตามทรง"]) {
  if (!linked.some((o) => o.showWhen.choices.includes(n))) { console.error(`ไม่มีกลุ่มไหนอ้าง showWhen "${n}" แล้ว!`); process.exit(1); }
}
if (back.data.options.length !== before) { console.error("จำนวนกลุ่มตัวเลือกเปลี่ยน!", back.data.options.length, before); process.exit(1); }
console.log(`✓ กลุ่ม "${GROUP}" เป็นการ์ด + ภาพ ${built.length} ใบ · แกนราคายังเป็น ${JSON.stringify(back.data.pricing.driverLabels)} · กลุ่มที่อ้าง showWhen ${linked.length} กลุ่ม · savedAt =`, back.data.savedAt);
