#!/usr/bin/env node
/**
 * กระดาษรองหลัง (package-backing) — ภาพประกอบตัวเลือกกลุ่ม "เจาะรู"
 *
 *   node scripts/backing-paper-hole-art.mjs           (วาดลง .cache/package-backing/upload ดูก่อน)
 *   node scripts/backing-paper-hole-art.mjs --write   (+ อัปโหลด storage + เขียน imageSrc/desc + อ่านกลับเทียบ)
 *
 * กลุ่มมี 2 ตัวเลือกอยู่แล้วใน DB (ไม่แตะชื่อ/ค่าเพิ่ม แตะแค่ imageSrc + desc + note):
 *   "ไม่เจาะรู"              — ไม่มี extra (รวมในราคาแล้ว)
 *   "เจาะรู (สำหรับแขวน)"    — extra 10 · หน่วยขายของสินค้านี้คือ "แผ่น A3" → +฿10 ต่อแผ่น A3
 *     (เทียบกลุ่มเคลือบของสินค้าเดียวกันที่จดไว้ว่า "+10 บาท/แผ่น A3")
 *
 * ภาพ 900×900 ทั้งสองใบใช้ "อาร์ตบนกระดาษรองหลังชุดเดียวกันเป๊ะ" (ฟ้า+เมฆ+รุ้ง แบบรูปงานจริงในแกลเลอรี)
 * ต่างกันจุดเดียวคือรูเจาะ — ลูกค้าเทียบสองใบแล้วเห็นความต่างทันที
 *
 * ⚠️ ปุ่มตัวเลือกครอปกลางภาพ 300-600 เหลือ 62×62 ([[iducky-option-thumb-crop]])
 *    จึงวาดเป็น "ภาพโคลสอัพขอบบนของใบงาน" สเกล 100 px = 1 ซม.
 *    ขอบบนใบงานอยู่ y=318 · รูอยู่กลางภาพพอดี (450, 378) เส้นผ่านศูนย์กลาง 60 px
 *    → ในปุ่มย่อ รูกลายเป็นวงกลมชัด ๆ กลางปุ่ม ส่วนใบ "ไม่เจาะรู" เป็นพื้นเรียบ
 *    ของประกอบ (ใบจำลองแขวนตะขอ / ใบในซองใส) วางไว้นอกกรอบครอปทั้งหมด
 *
 * ไม่ใส่ตัวเลข "รูกว้างกี่ มม. ห่างขอบเท่าไร" ลงภาพ เพราะใบสเปคกระดาษรองหลังไม่ได้ระบุไว้
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ ([[iducky-image-cache-bust]])
 * รันซ้ำได้: เขียนทับ imageSrc/desc ของตัวเลือกเดิม ไม่เพิ่ม/ลบตัวเลือก
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "package-backing";
const VER = "v1";
const GROUP = "เจาะรู";
const NO = "ไม่เจาะรู";
const YES = "เจาะรู (สำหรับแขวน)";
const EXTRA = 10; // บาท / แผ่น A3

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const MASCOT = await mascotDataUri("peace", 420);

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";

const CARD_X = 75, CARD_W = 750;   // ใบงานกว้าง 7.5 ซม. ที่สเกล 100 px/ซม. (ขนาด 7.5 × 10 ซม. ในกลุ่ม "ขนาด")
const TOP = 318;                   // ขอบบนใบงาน
const HOLE = { cx: 450, cy: 378, r: 30 };
const FADE0 = 640, FADE1 = 770;    // ใบงานจางหายลงล่าง = สื่อว่าเป็นภาพโคลสอัพ ใบจริงยาวกว่านี้

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines.filter(Boolean)
    .map((t, i, a) => `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`)
    .join("");

const pill = (cx, y, text, tone = OK) => {
  const w = text.length * 14.5 + 56;
  return `
    <rect x="${cx - w / 2}" y="${y - 23}" width="${w}" height="46" rx="23" fill="${tone === OK ? "#ecfeff" : "#f1f5f9"}" stroke="${tone}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${tone}">${text}</text>`;
};

/** ลูกศรโค้งชี้จากข้อความไปยังจุดบนใบงาน — หัวลูกศรหันตามทิศทางปลายเส้นจริง */
const callout = (text, x, y, tx, ty) => {
  const c = { x: x + 70, y: y + 44 };                       // จุดควบคุมของเส้นโค้ง
  const ang = (Math.atan2(ty - c.y, tx - c.x) * 180) / Math.PI;
  return `
  <text x="${x}" y="${y}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="end" fill="${INK}">${text}</text>
  <path d="M ${x - 26} ${y + 15} Q ${c.x} ${c.y} ${tx} ${ty}" fill="none" stroke="${SUB}" stroke-width="3" stroke-linecap="round"/>
  <g transform="translate(${tx} ${ty}) rotate(${ang.toFixed(1)})">
    <path d="M 2 0 L -19 7 L -19 -7 Z" fill="${SUB}"/>
  </g>`;
};

// ── อาร์ตบนกระดาษรองหลัง (เหมือนกันทั้งสองใบ) ────────────────────────
const CARD_DEFS = `
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#e6f4fe"/>
    <stop offset="1" stop-color="#b9e2f7"/>
  </linearGradient>
  <!-- มาสก์จางล่าง: ใบงานจริงยาวกว่าที่เห็น ภาพนี้เป็นโคลสอัพขอบบน -->
  <linearGradient id="fadeGrad" gradientUnits="userSpaceOnUse" x1="0" y1="${FADE0}" x2="0" y2="${FADE1}">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="1" stop-color="#000000"/>
  </linearGradient>
  <mask id="fade"><rect x="0" y="0" width="${W}" height="${H}" fill="url(#fadeGrad)"/></mask>
  <radialGradient id="holeShade" cx="0.42" cy="0.34" r="0.78">
    <stop offset="0" stop-color="#7c8b9c"/>
    <stop offset="0.55" stop-color="#c3ced9"/>
    <stop offset="1" stop-color="#eef2f6"/>
  </radialGradient>`;

const cloud = (cx, cy, s, op = 0.95) => `
  <g opacity="${op}" transform="translate(${cx} ${cy}) scale(${s})">
    <ellipse cx="-34" cy="6" rx="34" ry="21" fill="#ffffff"/>
    <ellipse cx="4" cy="-8" rx="42" ry="28" fill="#ffffff"/>
    <ellipse cx="42" cy="8" rx="32" ry="20" fill="#ffffff"/>
    <rect x="-66" y="2" width="132" height="20" rx="10" fill="#ffffff"/>
  </g>`;

/** ลายที่พิมพ์ลงกระดาษรองหลัง — ฟ้า เมฆ รุ้ง (ล้อรูปงานจริงในแกลเลอรีสินค้า) */
const printArt = () => {
  const arc = (r, color, w) => {
    const cx = 450, cy = 812;
    const a0 = Math.PI * 0.99, a1 = Math.PI * 0.01;
    const p = (a) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy - r * Math.sin(a)).toFixed(1)}`;
    return `<path d="M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
  };
  const r = MASCOT.ratio, mh = 168, mw = mh * r;
  return `
    <rect x="${CARD_X}" y="${TOP}" width="${CARD_W}" height="${H - TOP}" fill="url(#sky)"/>
    ${arc(348, "#fbcfe8", 26)}
    ${arc(322, "#fde9a9", 26)}
    ${arc(296, "#bfe3fb", 26)}
    <circle cx="742" cy="392" r="40" fill="#fde68a" opacity="0.9"/>
    <circle cx="742" cy="392" r="40" fill="none" stroke="#fcd34d" stroke-width="3"/>
    ${cloud(190, 452, 0.86)}
    ${cloud(690, 512, 0.7, 0.9)}
    ${cloud(300, 640, 1.0)}
    ${cloud(660, 690, 0.8)}
    <g opacity="0.55">
      <circle cx="560" cy="420" r="5" fill="#ffffff"/>
      <circle cx="330" cy="360" r="4" fill="#ffffff"/>
      <circle cx="620" cy="352" r="4" fill="#ffffff"/>
      <circle cx="150" cy="560" r="5" fill="#ffffff"/>
    </g>
    <image href="${MASCOT.uri}" x="${560 - mw / 2}" y="560" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
    <text x="${CARD_X + 26}" y="${FADE0 + 20}" font-family="${TH}" font-size="22" font-weight="700" fill="#7ec3e5">iducky</text>`;
};

/**
 * รูเจาะทะลุกระดาษ — เห็นพื้นขาวลอดผ่าน + เงาที่ขอบบนในรู (แสงมาจากบนซ้าย)
 * วาดด้วยเส้นโค้งครึ่งวงบน/ล่างแทนการเบลอ เพราะ librsvg เรนเดอร์ฟิลเตอร์ไม่แน่นอน
 */
const hole = () => {
  const { cx, cy, r } = HOLE;
  const half = (rr, up) => `M ${cx - rr} ${cy} a ${rr} ${rr} 0 0 ${up ? 1 : 0} ${rr * 2} 0`;
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#e7ecf1"/>
    <path d="${half(r - 4, 1)}" fill="none" stroke="#5f7183" stroke-width="9" opacity="0.62"/>
    <path d="${half(r - 10, 1)}" fill="none" stroke="#8b9bab" stroke-width="7" opacity="0.42"/>
    <path d="${half(r - 4, 0)}" fill="none" stroke="#ffffff" stroke-width="6" opacity="0.92"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#55677a" stroke-width="3.5"/>`;
};

/** ใบงาน: กระดาษอาร์ตมัน 250 แกรม — ขอบบนอยู่ในกรอบครอปปุ่ม, ล่างจางหาย */
const cardTop = (withHole) => `
  <g mask="url(#fade)">
    <!-- เงาใต้ใบงาน -->
    <rect x="${CARD_X + 5}" y="${TOP + 8}" width="${CARD_W}" height="${H - TOP}" rx="8" fill="#0f172a" opacity="0.08"/>
    <clipPath id="cardClip"><rect x="${CARD_X}" y="${TOP}" width="${CARD_W}" height="${H - TOP}" rx="8"/></clipPath>
    <g clip-path="url(#cardClip)">${printArt()}</g>
    <rect x="${CARD_X}" y="${TOP}" width="${CARD_W}" height="${H - TOP}" rx="8" fill="none" stroke="#9db6c7" stroke-width="3"/>
    <!-- ผิวกระดาษอาร์ตมัน: แสงพาดบาง ๆ -->
    <path d="M ${CARD_X} ${TOP + 150} L ${CARD_X + CARD_W} ${TOP + 40} L ${CARD_X + CARD_W} ${TOP + 96} L ${CARD_X} ${TOP + 206} Z"
      fill="#ffffff" opacity="0.16" clip-path="url(#cardClip)"/>
    ${withHole ? hole() : ""}
  </g>`;

// ── ของประกอบมุมขวาบน (นอกกรอบครอปปุ่ม) ─────────────────────────────
/** ใบงานย่อแขวนอยู่บนตะขอชั้นวาง */
const miniHung = (cx, top) => {
  const w = 78, h = 104, x = cx - w / 2, y = top + 34;
  return `
  <g>
    <rect x="${cx - 46}" y="${top - 4}" width="92" height="7" rx="3.5" fill="#cbd5e1"/>
    <path d="M ${cx + 28} ${top + 4} L ${cx} ${top + 45}" stroke="#94a3b8" stroke-width="7" stroke-linecap="round"/>
    <rect x="${x + 3}" y="${y + 5}" width="${w}" height="${h}" rx="5" fill="#0f172a" opacity="0.08"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="#dcf0fb" stroke="#9db6c7" stroke-width="2"/>
    <path d="M ${x + 8} ${y + 74} q 31 -34 62 -8" fill="none" stroke="#fbcfe8" stroke-width="6"/>
    <path d="M ${x + 12} ${y + 82} q 27 -30 54 -7" fill="none" stroke="#bfe3fb" stroke-width="6"/>
    <circle cx="${cx}" cy="${y + 11}" r="6" fill="#f8fafc" stroke="#5b6b7c" stroke-width="2"/>
    <text x="${cx}" y="${y + h + 30}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">แขวนโชว์ได้</text>
  </g>`;
};

/** ใบงานย่อในซองใส (ซองแถมฟรีตามขนาด) */
const miniBagged = (cx, top) => {
  const w = 78, h = 104, x = cx - w / 2, y = top + 34;
  return `
  <g>
    <rect x="${x - 11}" y="${y - 13}" width="${w + 22}" height="${h + 26}" rx="7" fill="#e8f4fb" opacity="0.85" stroke="#bcd7e6" stroke-width="2"/>
    <path d="M ${x - 11} ${y - 2} h ${w + 22}" stroke="#bcd7e6" stroke-width="2"/>
    <rect x="${x + 3}" y="${y + 5}" width="${w}" height="${h}" rx="5" fill="#0f172a" opacity="0.07"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="#dcf0fb" stroke="#9db6c7" stroke-width="2"/>
    <path d="M ${x + 8} ${y + 74} q 31 -34 62 -8" fill="none" stroke="#fbcfe8" stroke-width="6"/>
    <path d="M ${x + 12} ${y + 82} q 27 -30 54 -7" fill="none" stroke="#bfe3fb" stroke-width="6"/>
    <path d="M ${x + 14} ${y + 20} h 50" stroke="#9db6c7" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
    <text x="${cx}" y="${y + h + 30}" font-family="${TH}" font-size="19" text-anchor="middle" fill="${SUB}">ขอบบนเรียบ</text>
  </g>`;
};

// ── สองภาพ ───────────────────────────────────────────────────────────
const artNoHole = () => frame(`
  <defs>${CARD_DEFS}</defs>
  ${title("ไม่เจาะรู", "ขอบบนเรียบเต็มใบ — ไดคัทตามขนาดแล้วใส่ซองที่แถมได้เลย")}
  ${miniBagged(748, 132)}
  ${cardTop(false)}
  ${callout("ขอบบนเรียบ ไม่มีรู", 340, 232, 424, 352)}
  ${pill(W / 2, 772, "รวมในราคาแล้ว ไม่มีค่าเพิ่ม")}
  ${foot([
    "กระดาษอาร์ตมัน 250 แกรม พิมพ์ Digital · ไดคัทตามขนาดที่เลือก",
    "เหมาะกับงานที่แพ็คใส่ซองแล้วส่ง ไม่ต้องแขวนโชว์",
  ])}`);

const artHole = () => frame(`
  <defs>${CARD_DEFS}</defs>
  ${title("เจาะรู (สำหรับแขวน)", "เจาะรูกลม กลางขอบบนของใบงาน")}
  ${miniHung(748, 140)}
  ${cardTop(true)}
  ${callout("รูสำหรับร้อยเชือก / แขวนตะขอ", 340, 232, HOLE.cx - 40, HOLE.cy - 26)}
  ${pill(W / 2, 772, `เพิ่มแผ่น A3 ละ ฿${EXTRA}`)}
  ${foot([
    "กระดาษอาร์ตมัน 250 แกรม พิมพ์ Digital · ไดคัทตามขนาดที่เลือก",
    "ภาพจำลอง — ทางร้านเจาะรูให้อย่างเดียว ไม่รวมเชือกหรือตะขอ",
  ])}`);

const JOBS = [
  { choice: NO, file: `hole-none-${VER}.jpg`, svg: artNoHole(),
    desc: "ขอบบนเรียบเต็มใบ ไม่มีรู — ไดคัทตามขนาดแล้วใส่ซองที่แถมส่งได้เลย (รวมในราคาแล้ว)" },
  { choice: YES, file: `hole-punch-${VER}.jpg`, svg: artHole(),
    desc: `เจาะรูกลมกลางขอบบน สำหรับร้อยเชือกหรือแขวนตะขอโชว์ — เพิ่มแผ่น A3 ละ ฿${EXTRA} (ไม่รวมเชือก/ตะขอ)` },
];

for (const j of JOBS) {
  j.buf = await sharp(Buffer.from(j.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${j.file}`, j.buf);
  // ครอปกลาง 300-600 = สิ่งที่ลูกค้าเห็นจริงบนปุ่มตัวเลือก 62×62
  await sharp(j.buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/thumb-${j.file}`);
  console.log(`🖼  ${OUT}/${j.file}  ${Math.round(j.buf.length / 1024)} KB — ${j.choice}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน imageSrc/desc ────────────────────────────
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
// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
const dump = `${OUT}/../before-hole-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 1));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

const group = (data.options ?? []).find((o) => o.label === GROUP);
if (!group) { console.error(`ไม่เจอกลุ่ม "${GROUP}"`); process.exit(1); }
for (const j of JOBS) {
  const c = group.choices?.find((c) => c.name === j.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${j.choice}"`); process.exit(1); }
  c.imageSrc = j.url; // แตะแค่ imageSrc/desc — ชื่อ/ค่าเพิ่มเดิมคงไว้
  c.desc = j.desc;
}
group.display = "cards"; // มี 2 ตัวเลือก ไม่เข้าโหมด dense → ได้ภาพ + คำอธิบายใต้ชื่อ
group.note = `ค่าเจาะรูคิดเพิ่มแผ่น A3 ละ ฿${EXTRA} · ทางร้านเจาะรูให้อย่างเดียว ไม่รวมเชือก/ตะขอ`;

data.savedAt = new Date().toISOString(); // กันแคชรูปเดิม ([[iducky-image-cache-bust]])
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bg = (back.data.options ?? []).find((o) => o.label === GROUP);
const fails = [
  [(back.data.options ?? []).filter((o) => o.label === GROUP).length === 1, "กลุ่มเจาะรูซ้ำ/หาย"],
  [bg?.choices?.length === 2, "จำนวนตัวเลือกเปลี่ยน"],
  [bg?.display === "cards", "กลุ่มไม่ใช่การ์ด"],
  ...JOBS.map((j) => {
    const c = bg?.choices?.find((c) => c.name === j.choice);
    return [c?.imageSrc === j.url && c?.desc === j.desc, `ตัวเลือก "${j.choice}" ไม่ตรง (ภาพ/คำอธิบาย)`];
  }),
  [(bg?.choices?.find((c) => c.name === YES)?.extra ?? 0) === EXTRA, `ค่าเจาะรูไม่ใช่ ฿${EXTRA}`],
  [(bg?.choices?.find((c) => c.name === NO)?.extra ?? 0) === 0, "ตัวเลือกไม่เจาะรูมีค่าเพิ่มโผล่มา"],
  // กลุ่มนี้ต้องไม่ใช่แกนตารางราคา ไม่งั้นราคาหล่นไป product.price ([[iducky-price-driver-trap]])
  [!(back.data.pricing?.driverLabels ?? []).includes(GROUP), "กลุ่มไปชนแกนตารางราคา"],
  [(back.data.priceRates ?? []).every((r) => !(r.pricing?.driverLabels ?? []).includes(GROUP)), "กลุ่มไปชนแกนตารางราคาของเรท"],
  [(back.data.options ?? []).length === (data.options ?? []).length, "จำนวนกลุ่มตัวเลือกเปลี่ยน ([[iducky-option-group-loss-guard]])"],
  [back.data.priceMin === 45 && back.data.priceMax === 45, "ช่วงราคาสินค้าเปลี่ยนไป"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "${GROUP}" 2 ตัวเลือก + ภาพ/คำอธิบาย อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);
