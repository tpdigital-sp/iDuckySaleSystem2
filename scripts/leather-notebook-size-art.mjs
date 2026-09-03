#!/usr/bin/env node
/**
 * สมุดหนัง (otheracrylicproducts2-9) — ภาพประกอบกลุ่ม "ขนาด" (Size A6 / Size A5) + เปิดโหมดการ์ด
 *
 *   node scripts/leather-notebook-size-art.mjs            (วาดภาพลง .cache/leather-notebook/upload ดูก่อน)
 *   node scripts/leather-notebook-size-art.mjs --write    (+ อัปโหลด storage + เขียน imageSrc/desc/display + อ่านกลับเทียบ)
 *
 * กลุ่ม "ขนาด" เป็นแกนราคา (driverLabels ["ขนาด"] คีย์ "Size A5"/"Size A6") — ห้ามแตะชื่อตัวเลือก
 * เติมแค่ imageSrc + desc และตั้ง display: "cards" ที่ตัวกลุ่ม
 *
 * ดีไซน์: ทุกใบสเกลเดียวกัน (CM px/ซม.) เทียบขนาดข้ามใบได้จริง
 *  - สมุดปกหนังวางมองบน มีแพทช์ลายพิมพ์ (มาสคอต) แปะบนปก ตามงานจริง "ปกหนังแปะลายงานพิมพ์"
 *  - ปากกาขนาดจริง (จาง) วางข้าง ๆ ให้ลูกค้ากะขนาดออก
 *  - ตัวอักษร A6/A5 ใหญ่กลางภาพ (ภาพย่อบนการ์ด/ปุ่มเล็ก ต้องอ่านออก)
 *
 * รันซ้ำได้: เขียนทับ imageSrc/desc ตัวเดิม ไม่แตะชื่อ/ลำดับ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "otheracrylicproducts2-9";
const VER = "v3"; // v1 แพทช์กลางปก → v2 พิมพ์เต็มปก → v3 ปกสีขาว (ผู้ใช้สั่ง 3 ก.ย. 69)
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/leather-notebook/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** สเกลรวมทุกใบ — A5 สูง 21 ซม. + ลูกศร/ป้ายยังอยู่ในการ์ด */
const CM = 21;

/** ปากกาเทียบขนาดจริง ~14.5 ซม. */
const PEN_L = 14.5, PEN_W = 1.1;

/** ขนาดทั้ง 2 — name = ชื่อตัวเลือกใน DB (แกนราคา ห้ามเปลี่ยน) */
const SIZES = [
  {
    name: "Size A6", code: "A6", w: 10.5, h: 14.8,
    use: "ขนาดพกพา ใส่กระเป๋าได้สบาย",
    desc: "10.5 × 14.8 ซม. พกพาง่าย เริ่มต้นเล่มละ 180.-",
  },
  {
    name: "Size A5", code: "A5", w: 14.8, h: 21,
    use: "ขนาดยอดนิยม หน้ากว้างเขียนสบาย",
    desc: "14.8 × 21 ซม. เขียนสบาย เริ่มต้นเล่มละ 200.-",
  },
];

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข */
const dim = (x1, y1, x2, y2, label) => {
  const vertical = x1 === x2;
  const lx = vertical ? Math.min(x1, W - 78) : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + 30;
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (label.length * 12.5) / 2}" y="${ly - 24}" width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${SUB}">${label}</text>`;
};

/** ป้ายกำกับปากกา — ข้อความเล็ก 2 บรรทัดใต้ปากกา (ไม่มีพิลล์ กันชนป้ายวัดขนาด) */
const penTag = (cx, y) => `
  <text x="${cx}" y="${y}" font-family="${TH}" font-size="20" font-weight="600" text-anchor="middle" fill="${SUB}">ปากกา</text>
  <text x="${cx}" y="${y + 26}" font-family="${TH}" font-size="18" text-anchor="middle" fill="${SUB}">เทียบขนาดจริง</text>`;

/** ปากกามองบน ยาว 14.5 ซม. (แนวตั้ง หัวขึ้น) — ของเทียบขนาดจริง */
function pen(cx, yTop, faded = true) {
  const L = PEN_L * CM, Wp = PEN_W * CM;
  const tip = 1.6 * CM, grip = 2.4 * CM;
  return `<g opacity="${faded ? 0.5 : 1}">
    <rect x="${cx - Wp / 2 + 3}" y="${yTop + 6}" width="${Wp}" height="${L}" rx="${Wp / 2}" fill="#0f172a" opacity="0.12"/>
    <!-- ปลอกบน + คลิปหนีบ -->
    <rect x="${cx - Wp / 2}" y="${yTop}" width="${Wp}" height="${L - tip}" rx="${Wp / 2}" fill="#334155" stroke="#1e293b" stroke-width="2"/>
    <rect x="${cx + Wp / 2 - 4}" y="${yTop + 0.5 * CM}" width="7" height="${3 * CM}" rx="3.5" fill="#1e293b"/>
    <!-- ด้ามจับ -->
    <rect x="${cx - Wp / 2}" y="${yTop + L - tip - grip}" width="${Wp}" height="${grip}" fill="#475569"/>
    <!-- หัวปากกา -->
    <path d="M ${cx - Wp / 2} ${yTop + L - tip} L ${cx + Wp / 2} ${yTop + L - tip} L ${cx + 2.5} ${yTop + L - 4} L ${cx - 2.5} ${yTop + L - 4} Z" fill="#94a3b8"/>
    <rect x="${cx - 2.5}" y="${yTop + L - 6}" width="5" height="6" rx="2" fill="#64748b"/>
  </g>`;
}

/** สมุดปกขาวมองบน w×h ซม. — ลายพิมพ์เต็มปก (full bleed) บนปกสีขาว + สันซ้าย + เดินตะเข็บ + ยางรัด */
function notebook(x0, y0, wcm, hcm, id) {
  const w = wcm * CM, h = hcm * CM;
  const spine = 0.9 * CM;
  // ลายลูกค้ากินเต็มปก — มาสคอตวางกลางปก (เว้นสันซ้าย) สูงราว 46% ของเล่ม
  const faceX = x0 + spine, faceW = w - spine;
  let ah = h * 0.46, aw = ah * MASCOT.ratio;
  if (aw > faceW * 0.82) { aw = faceW * 0.82; ah = aw / MASCOT.ratio; }
  const acx = faceX + faceW / 2, acy = y0 + h * 0.44;
  return `
  <defs>
    <!-- ปกสีขาว: ไล่เฉดอ่อน ๆ ให้เห็นเป็นวัตถุจริง ไม่จมพื้นการ์ด -->
    <linearGradient id="cov-${id}" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.62" stop-color="#fbfcfe"/>
      <stop offset="1" stop-color="#eef2f7"/>
    </linearGradient>
    <!-- ลายพิมพ์เต็มปก: จุดตกแต่งโทนร้านบนพื้นขาว -->
    <pattern id="dot-${id}" width="58" height="58" patternUnits="userSpaceOnUse">
      <circle cx="13" cy="13" r="4" fill="#22d3ee" opacity="0.3"/>
      <circle cx="42" cy="36" r="2.6" fill="#0891b2" opacity="0.24"/>
      <circle cx="24" cy="49" r="1.8" fill="#67e8f9" opacity="0.35"/>
    </pattern>
  </defs>
  <!-- เงาใต้เล่ม 2 ชั้น — ปกขาวบนพื้นอ่อน ต้องมีเงาถึงจะลอยออกมา -->
  <rect x="${x0 + 14}" y="${y0 + 22}" width="${w}" height="${h}" rx="14" fill="#334155" opacity="0.13"/>
  <rect x="${x0 + 7}" y="${y0 + 11}" width="${w}" height="${h}" rx="13" fill="#334155" opacity="0.16"/>
  <!-- กระดาษด้านใน (โผล่ขอบขวาเล็กน้อยให้รู้ว่าเป็นเล่ม) -->
  <rect x="${x0 + w * 0.02}" y="${y0 + h * 0.012}" width="${w}" height="${h - h * 0.024}" rx="8" fill="#f8fafc" stroke="#b4c0cf" stroke-width="2"/>
  <!-- ปกขาว: ลายพิมพ์เต็มแผ่นถึงขอบ -->
  <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="12" fill="url(#cov-${id})" stroke="#7b8a9c" stroke-width="3"/>
  <clipPath id="clip-${id}"><rect x="${x0 + 2}" y="${y0 + 2}" width="${w - 4}" height="${h - 4}" rx="10"/></clipPath>
  <g clip-path="url(#clip-${id})">
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#dot-${id})"/>
    <!-- ลายลูกค้ากินเต็มหน้าปก -->
    <image href="${MASCOT.uri}" x="${acx - aw / 2}" y="${acy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
    <text x="${acx}" y="${y0 + h * 0.78}" font-family="${TH}" font-size="${Math.max(16, faceW * 0.115)}" font-weight="700" text-anchor="middle" fill="#0e7490">ลายของคุณ</text>
    <text x="${acx}" y="${y0 + h * 0.855}" font-family="${TH}" font-size="${Math.max(12, faceW * 0.075)}" text-anchor="middle" fill="${SUB}">พิมพ์เต็มปก</text>
    <!-- สันเย็บเล่มฝั่งซ้าย (ปกขาวเหมือนกัน ใช้เงาบอกรอยพับ) -->
    <rect x="${x0}" y="${y0}" width="${spine}" height="${h}" fill="#0f172a" opacity="0.06"/>
    <line x1="${x0 + spine}" y1="${y0}" x2="${x0 + spine}" y2="${y0 + h}" stroke="#94a3b8" stroke-width="2" opacity="0.6"/>
  </g>
  <!-- เส้นเย็บขอบโดยรอบ -->
  <rect x="${x0 + 7}" y="${y0 + 7}" width="${w - 14}" height="${h - 14}" rx="8" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="7 6" opacity="0.6"/>
  <!-- ยางรัดเล่มฝั่งขวา -->
  <rect x="${x0 + w - 1.4 * CM}" y="${y0 - 3}" width="${0.5 * CM}" height="${h + 6}" rx="${0.25 * CM}" fill="#64748b" opacity="0.85"/>`;
}

/** การ์ดขนาดหนึ่งใบ */
function sizeArt(s) {
  const nw = s.w * CM, nh = s.h * CM;
  const penGap = 2.2 * CM;
  const total = PEN_W * CM + penGap + nw;
  const left = W / 2 - total / 2;
  const baseY = 706; // แนวขอบล่างของทุกชิ้น (วางบนโต๊ะเดียวกัน) — A5 สูง 441px ยอดอยู่ 265 ไม่ชนป้ายใหญ่
  const penX = left + (PEN_W * CM) / 2;
  const x0 = left + PEN_W * CM + penGap;
  const y0 = baseY - nh;

  const body = `
    ${pen(penX, baseY - PEN_L * CM)}
    ${notebook(x0, y0, s.w, s.h, s.code)}
    ${dim(x0, baseY + 40, x0 + nw, baseY + 40, `${s.w} ซม.`)}
    ${dim(x0 + nw + 40, y0, x0 + nw + 40, baseY, `${s.h} ซม.`)}
    ${penTag(penX, baseY + 34)}`;

  // ตัวอักษรขนาดใหญ่เหนือฉาก — ภาพย่อบนการ์ดเล็ก ต้องอ่านออก
  const bigLabel = `
  <g>
    <rect x="${W / 2 - 120}" y="158" width="240" height="92" rx="24" fill="#ffffff" opacity="0.93" stroke="#a5f3fc" stroke-width="2.5"/>
    <text x="${W / 2}" y="230" font-family="${TH}" font-size="84" font-weight="800" text-anchor="middle" fill="${OK}">${s.code}</text>
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- พื้นการ์ดไล่เฉดเทาอ่อน — สมุด "ปกขาว" ต้องมีพื้นหลังเข้มกว่าเล็กน้อยถึงจะไม่จมหาย -->
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#e8eef5"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f1f5f9"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="url(#bg)" stroke="#dbe3ec" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด ${s.code} (${s.w} × ${s.h} ซม.)</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${s.use}</text>
  ${body}
  ${bigLabel}
  <text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ทุกภาพสเกลเดียวกัน เทียบขนาดข้ามตัวเลือกได้จริง</text>
  <text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ปกสีขาว พิมพ์ลายเต็มปกตามสั่ง · เหมาะทำของขวัญ ของพรีเมี่ยมองค์กร</text>
</svg>`;
}

// ── วาดทั้งหมดลงแคช ───────────────────────────────────────────────────
const JOBS = SIZES.map((s) => ({ file: `size-${s.code.toLowerCase()}-${VER}.jpg`, svg: sizeArt(s), choice: s.name, desc: s.desc }));

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${SIZE_GROUP}: ${j.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน imageSrc/desc + display cards ────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const j of JOBS) {
  const key = `products/leather-notebook/${j.file}`;
  const { error: upErr } = await sb.storage.from("product-images").upload(key, j.buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
  j.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
}
console.log(`อัปโหลดแล้ว ${JOBS.length} ไฟล์ → products/leather-notebook/`);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
// สคริปต์เขียนตรงไม่ผ่าน API = ไม่เก็บ product_revisions — dump สภาพเดิมกันเหนียวก่อน
writeFileSync(`${OUT}/../backup-${Date.now()}.json`, JSON.stringify(data, null, 1));

const group = (data.options ?? []).find((o) => o.label === SIZE_GROUP);
if (!group) { console.error(`ไม่เจอกลุ่ม "${SIZE_GROUP}"`); process.exit(1); }
group.display = "cards";
for (const j of JOBS) {
  const c = group.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.choice}" ในกลุ่ม "${SIZE_GROUP}"`); process.exit(1); }
  c.imageSrc = j.url; // แตะแค่ imageSrc/desc — ชื่อเป็นคีย์แกนราคา ห้ามเปลี่ยน
  c.desc = j.desc;
}

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const backGroup = back.data.options.find((o) => o.label === SIZE_GROUP);
if (backGroup?.display !== "cards") { console.error("display ไม่ลง!", backGroup?.display); process.exit(1); }
for (const j of JOBS) {
  const c = backGroup?.choices?.find((c) => c.name === j.choice);
  if (c?.imageSrc !== j.url || c?.desc !== j.desc) { console.error("อ่านกลับไม่ตรง!", j.choice, c?.imageSrc, c?.desc); process.exit(1); }
}
// แกนราคาต้องไม่สะเทือน — ชื่อตัวเลือกยังตรงคีย์ cells ครบ
const cellKeys = Object.keys(back.data.pricing?.cells ?? {});
for (const c of backGroup.choices) {
  if (!cellKeys.includes(c.name)) { console.error("ชื่อตัวเลือกหลุดจากคีย์ตาราง!", c.name); process.exit(1); }
}
console.log(`✓ display cards + imageSrc/desc ${JOBS.length} ตัว อ่านกลับตรงทุกตัว · คีย์ตารางครบ · savedAt =`, back.data.savedAt);
