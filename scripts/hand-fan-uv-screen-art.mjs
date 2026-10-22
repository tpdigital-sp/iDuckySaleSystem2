#!/usr/bin/env node
/**
 * 🪭 ภาพประจำตัวเลือก "การสกรีน" ของพัดพลาสติกใส (hand-fan-uv) — ออกแบบใหม่ 22 ต.ค. 69 (เจ้าของร้านสั่ง "ออกแบบภาพให้ใหม่หน่อย")
 *
 *   node scripts/hand-fan-uv-screen-art.mjs            # วาด 3 ภาพลง .cache/hand-fan-uv/upload (ดูก่อน ไม่เขียนฐาน)
 *   node scripts/hand-fan-uv-screen-art.mjs --write    # อัปเข้า storage + ตั้ง imageSrc 3 การ์ด × 2 กลุ่มขนาด + แท็บ "ข้อควรทราบ" แล้วอ่านกลับเทียบ
 *
 * เดิม (scripts/hand-fan-uv-art.mjs side-1/side-2): การ์ด "ใต้พัด" กับ "บนพัด" ใช้ภาพเดียวกัน ลูกค้าแยกไม่ออกว่าต่างกันตรงไหน
 * ใหม่ 3 ภาพแยกกัน — สไตล์เดียวกับภาพตัวเลือกสินค้าอื่นของร้าน (ต้นแบบ: scripts/banner-print-sides-art.mjs "พิมพ์ 2 ด้าน"):
 *   • ลายบนพัด = มาสคอตเป็ดเหลือง 3D ของร้าน (scripts/iducky-assets.mjs) บนพื้นไล่สี — ด้านหน้า heart · งาน 2 ด้าน ด้านหลัง peace คนละสีพื้น
 *   • พัดด้านหน้า/ด้านหลัง ตามที่ลูกค้าเห็นจริง (ใต้พัด: หน้าเงา หลังเห็นลายกลับด้าน · บนพัด: หน้ากึ่งด้าน หลังมองทะลุจาง ๆ · 2 ด้าน: คนละลาย)
 *   • ป้ายใหญ่ "1 ด้าน · ใต้พัด" / "1 ด้าน · บนพัด" / "2 ด้าน +฿" สีต่างกัน (ฟ้า/ส้ม/เขียว) — อ่านออกตั้งแต่รูปย่อในปุ่มตัวเลือก
 *   • ภาคตัดขวางย่อ: ชั้นหมึก UV อยู่บน/ล่าง/ทั้งสองด้านของเนื้อพลาสติก
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — v1 ลูกเจี๊ยบวาดเอง · v2 เป็ดขาววาดเอง · v3 มาสคอตจริง ครั้งหน้าขึ้น v4
 * หลัง --write: npx tsx scripts/revalidate-live-products.mts hand-fan-uv (หน้าเว็บจริงแคช 1 ชม.)
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const WRITE = process.argv.includes("--write");
const ID = "hand-fan-uv";
const EXPECT_NAME = "พัดพลาสติกใส";
const V = "v3";
const OUT = ".cache/hand-fan-uv/upload";
mkdirSync(OUT, { recursive: true });

const UNDER = "สกรีน 1 ด้าน (ด้านใต้พัด)";
const TOP = "สกรีน 1 ด้าน (ด้านบนพัด)";
const BOTH = "สกรีน 2 ด้าน (ด้านบนพัดทั้ง 2 ด้าน)";
const GROUPS = ["การสกรีน (พัดอันเล็ก)", "การสกรีน (พัดอันใหญ่)"];
const NOTE_TAB = "ข้อควรทราบ";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const HEART = await mascotDataUri("heart", 460);
const PEACE = await mascotDataUri("peace", 460);

const DEFS = `
<linearGradient id="bgA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset="1" stop-color="#0e7490"/></linearGradient>
<linearGradient id="bgB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbcfe8"/><stop offset="1" stop-color="#fb923c"/></linearGradient>
<linearGradient id="plastic" x1="0" y1="0" x2="0.4" y2="1">
  <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="55%" stop-color="#e8f4f8" stop-opacity="0.75"/><stop offset="100%" stop-color="#d8ecf3" stop-opacity="0.9"/>
</linearGradient>
<linearGradient id="gloss" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="#ffffff" stop-opacity="0.75"/><stop offset="50%" stop-color="#ffffff" stop-opacity="0.06"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<linearGradient id="inkband" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0%" stop-color="#67e8f9"/><stop offset="50%" stop-color="#facc15"/><stop offset="100%" stop-color="#fb923c"/>
</linearGradient>
<pattern id="clear" width="22" height="22" patternUnits="userSpaceOnUse">
  <rect width="22" height="22" fill="#ffffff"/><rect width="11" height="11" fill="#eef2f6"/><rect x="11" y="11" width="11" height="11" fill="#eef2f6"/>
</pattern>
<pattern id="matte" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="0.8" fill="#ffffff" fill-opacity="0.22"/></pattern>
<marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#475569"/></marker>`;

/** ลายที่พิมพ์บนจานพัด: พื้นไล่สี + มาสคอต (เหมือนป้ายพิมพ์ 2 ด้าน) · mirror = มองจากอีกด้าน */
function print(cx, cy, r, { bg = "bgA", m = HEART, mirror = false } = {}) {
  const h = r * 1.5;
  const w = h * m.ratio;
  const sparkle = (x, y, s, o) =>
    `<path d="M ${x} ${y - s} L ${x + s * 0.3} ${y - s * 0.3} L ${x + s} ${y} L ${x + s * 0.3} ${y + s * 0.3} L ${x} ${y + s} L ${x - s * 0.3} ${y + s * 0.3} L ${x - s} ${y} L ${x - s * 0.3} ${y - s * 0.3} Z" fill="#ffffff" opacity="${o}"/>`;
  return `<g${mirror ? ` transform="translate(${2 * cx} 0) scale(-1 1)"` : ""}>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${bg})"/>
    ${sparkle(cx - r * 0.62, cy - r * 0.42, r * 0.11, 0.6)}${sparkle(cx + r * 0.6, cy - r * 0.5, r * 0.08, 0.5)}${sparkle(cx + r * 0.66, cy + r * 0.3, r * 0.1, 0.4)}
    <image href="${m.uri}" x="${cx - w / 2}" y="${cy - h / 2 + r * 0.06}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
}

/**
 * พัด 1 อัน — จานกลมพลาสติกใส + ก้าน
 * art = { bg, m, mirror, opacity } หรือ null · finish: "gloss" (เงาเหมือนเคลือบ) | "matte" (กึ่งด้าน) | undefined
 */
function fan(cx, top, d, len, { art, finish, id }) {
  const r = d / 2;
  const cy = top + r;
  const hw = d * 0.13;
  const hTop = cy + r - d * 0.06;
  return `<g>
    <rect x="${cx + 6 - hw / 2}" y="${top + 10}" width="${hw}" height="${len}" rx="${hw / 2}" fill="#0f172a" opacity="0.06"/>
    <circle cx="${cx + 6}" cy="${cy + 9}" r="${r}" fill="#0f172a" opacity="0.08"/>
    <rect x="${cx - hw / 2}" y="${hTop}" width="${hw}" height="${top + len - hTop}" rx="${hw / 2}" fill="url(#plastic)" stroke="#9fb8c4" stroke-width="2"/>
    <clipPath id="c-${id}"><circle cx="${cx}" cy="${cy}" r="${r - 1}"/></clipPath>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#clear)"/>
    <g clip-path="url(#c-${id})">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#plastic)"/>
      ${art ? `<g opacity="${art.opacity ?? 1}">${print(cx, cy, r * 0.9, art)}</g>` : ""}
      ${finish === "matte" && art ? `<circle cx="${cx}" cy="${cy}" r="${r * 0.9}" fill="url(#matte)"/>` : ""}
      ${finish === "gloss" ? `<ellipse cx="${cx - r * 0.28}" cy="${cy - r * 0.42}" rx="${r * 0.7}" ry="${r * 0.38}" fill="url(#gloss)" transform="rotate(-28 ${cx - r * 0.28} ${cy - r * 0.42})"/>` : ""}
    </g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#8fb0bf" stroke-width="3"/>
  </g>`;
}

/** ป้ายใต้พัด (สไตล์ tag ของป้ายพิมพ์ 2 ด้าน) */
const tag = (cx, y, text, color) => {
  const w = [...text].filter((c) => !/[ัิ-ฺ็-๎]/.test(c)).length * 13 + 44;
  return `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="40" rx="20" fill="${color.soft}" stroke="${color.main}" stroke-width="2"/>
  <text x="${cx}" y="${y + 27}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${color.main}">${esc(text)}</text>`;
};

/** ป้ายใหญ่บอกตัวเลือก — ตัวชี้ขาดในรูปย่อ */
function badge(x, y, w, h, color, big, unit, sub) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="#ffffff" stroke="${color.main}" stroke-width="4"/>
  <text x="${x + 62}" y="${y + h / 2 + 26}" font-family="${TH}" font-size="78" font-weight="800" text-anchor="middle" fill="${color.main}">${esc(big)}</text>
  <text x="${x + 116}" y="${y + h / 2 - 4}" font-family="${TH}" font-size="34" font-weight="800" fill="${INK}">${esc(unit)}</text>
  <text x="${x + 116}" y="${y + h / 2 + 32}" font-family="${TH}" font-size="23" font-weight="700" fill="${color.main}">${esc(sub)}</text>`;
}

/** ภาคตัดขวางย่อ — แผ่นพลาสติก + ชั้นหมึก + ตาที่มอง (ป้ายอยู่ขวาทั้งหมด) */
function section(x, y, ink) {
  const w = 170;
  const ph = 30;
  const t = 10;
  const top = ink === "top" || ink === "both";
  const under = ink === "under" || ink === "both";
  const py = y + (top ? t : 0);
  const band = (yy) => `<rect x="${x}" y="${yy}" width="${w}" height="${t}" rx="2" fill="url(#inkband)" stroke="#1f2937" stroke-width="1.2"/>
    <text x="${x + w + 12}" y="${yy + t}" font-family="${TH}" font-size="18" font-weight="700" fill="${INK}">หมึก UV</text>`;
  const eye = (ex, ey) => `<g transform="translate(${ex} ${ey})"><path d="M -18 0 Q 0 -15 18 0 Q 0 15 -18 0 Z" fill="#fff" stroke="#475569" stroke-width="2.5"/><circle r="5.5" fill="#475569"/></g>`;
  return `
    ${eye(x + w / 2, y - 34)}<path d="M ${x + w / 2} ${y - 18} L ${x + w / 2} ${y - 4}" stroke="#475569" stroke-width="2.5" marker-end="url(#arr)"/>
    <text x="${x + w / 2 + 28}" y="${y - 28}" font-family="${TH}" font-size="17" fill="${SUB}">ด้านที่มอง</text>
    ${top ? band(y) : ""}
    <rect x="${x}" y="${py}" width="${w}" height="${ph}" fill="url(#plastic)" stroke="#8fb0bf" stroke-width="2"/>
    <text x="${x + w / 2}" y="${py + ph / 2 + 6}" font-family="${TH}" font-size="16" font-weight="700" text-anchor="middle" fill="#0e7490">พลาสติกใส</text>
    ${under ? band(py + ph) : ""}`;
}

const BLUE = { main: "#1d4ed8", soft: "#eff6ff" };
const ORANGE = { main: "#c2410c", soft: "#fff7ed" };
const GREEN = { main: "#15803d", soft: "#f0fdf4" };

function card(c) {
  const d = 250;
  const len = 372;
  const top = 166;
  const L = 262;
  const R = 638;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${DEFS}</defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="90" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${esc(c.name)}</text>
  <text x="${W / 2}" y="130" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${esc(c.sub)}</text>
  ${fan(L, top, d, len, { ...c.front, id: "front" })}
  ${fan(R, top, d, len, { ...c.back, id: "back" })}
  ${tag(L, top + len + 16, c.frontTag, c.color)}
  ${tag(R, top + len + 16, c.backTag, { main: SUB, soft: "#f1f5f9" })}
  ${badge(64, 618, 436, 128, c.color, c.big, c.unit, c.badgeSub)}
  <rect x="528" y="618" width="310" height="128" rx="22" fill="#f1f5f9"/>
  ${section(552, c.ink === "both" ? 676 : 686, c.ink)}
  ${c.feet.map((l, i) => `<text x="${W / 2}" y="${800 + i * 34}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${esc(l)}</text>`).join("")}
</svg>`;
}

const CARDS = [
  {
    file: "screen-under",
    choice: UNDER,
    name: "สกรีน 1 ด้าน · ด้านใต้พัด",
    sub: "หมึกอยู่ใต้พัด มองผ่านพลาสติกใส — รวมในราคาแล้ว",
    color: BLUE,
    front: { art: { bg: "bgA", m: HEART }, finish: "gloss" },
    back: { art: { bg: "bgA", m: HEART, mirror: true, opacity: 0.55 } },
    frontTag: "ด้านหน้า · งานเงา",
    backTag: "ด้านหลัง · ลายกลับด้าน",
    big: "1",
    unit: "ด้าน · ใต้พัด",
    badgeSub: "งานเงา ลายไม่โดนถลอก",
    ink: "under",
    feet: ["ราคาในตารางคือแบบสกรีน 1 ด้าน", "ลายบนภาพเป็นตัวอย่าง — พิมพ์ตามไฟล์ที่ลูกค้าส่งมา"],
  },
  {
    file: "screen-top",
    choice: TOP,
    name: "สกรีน 1 ด้าน · ด้านบนพัด",
    sub: "หมึกอยู่ผิวด้านบน สัมผัสเนื้อลายได้ — รวมในราคาแล้ว",
    color: ORANGE,
    front: { art: { bg: "bgA", m: HEART }, finish: "matte" },
    back: { art: { bg: "bgA", m: HEART, mirror: true, opacity: 0.28 } },
    frontTag: "ด้านหน้า · กึ่งด้าน",
    backTag: "ด้านหลัง · เห็นลายจาง ๆ",
    big: "1",
    unit: "ด้าน · บนพัด",
    badgeSub: "ผิวกึ่งด้าน ไม่สะท้อนแสง",
    ink: "top",
    feet: ["ราคาในตารางคือแบบสกรีน 1 ด้าน · ลายอยู่ผิวนอก ระวังรอยขีดข่วน", "ลายบนภาพเป็นตัวอย่าง — พิมพ์ตามไฟล์ที่ลูกค้าส่งมา"],
  },
  {
    file: "screen-both",
    choice: BOTH,
    name: "สกรีน 2 ด้าน",
    sub: "ติดด้านบนพัดทั้ง 2 ด้าน — หน้า-หลังคนละลายได้",
    color: GREEN,
    front: { art: { bg: "bgA", m: HEART }, finish: "matte" },
    back: { art: { bg: "bgB", m: PEACE }, finish: "matte" },
    frontTag: "ด้านหน้า · ลายที่ 1",
    backTag: "ด้านหลัง · ลายที่ 2",
    big: "2",
    unit: "ด้าน",
    badgeSub: "เล็ก +฿10 · ใหญ่ +฿15 /อัน",
    ink: "both",
    feet: ["ส่งไฟล์มา 2 ลาย หรือลายเดียวทั้งหน้า-หลังก็ได้ · ติดใต้พัดไม่ได้", "ลายบนภาพเป็นตัวอย่าง — พิมพ์ตามไฟล์ที่ลูกค้าส่งมา"],
  },
];

/* ── วาด ──────────────────────────────────────────────────────────── */
console.log("🖼  วาดการ์ดการสกรีน 3 ใบ");
const bufs = {};
for (const c of CARDS) {
  const buf = await sharp(Buffer.from(card(c))).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
  writeFileSync(`${OUT}/${c.file}-${V}.jpg`, buf);
  bufs[c.file] = buf;
  console.log(`   ${c.file}-${V}.jpg  ${Math.round(buf.length / 1024)} KB`);
}
if (!WRITE) {
  console.log(`\n(ดูภาพใน ${OUT} ก่อน — ใส่ --write เพื่ออัปและตั้งในสินค้า)`);
  process.exit(0);
}

/* ── อัป + เขียนฐาน ────────────────────────────────────────────────── */
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => {
  console.error("✗", m);
  process.exit(1);
};
const url = (file) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

const art = {};
for (const c of CARDS) {
  const file = `${c.file}-${V}.jpg`;
  const up = await sb.storage.from("product-images").upload(`products/${ID}/${file}`, bufs[c.file], { contentType: "image/jpeg", upsert: true });
  if (up.error) die(`อัป ${file}: ${up.error.message}`);
  art[c.choice] = url(file);
  console.log(`   ⬆ ${file}`);
}

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) die(`อ่าน ${ID} ไม่สำเร็จ — ${error.message}`);
const d = structuredClone(row.data);
if (d.name !== EXPECT_NAME) die(`ชื่อสินค้าไม่ตรงที่คาด: "${d.name}" — หยุด`);

for (const label of GROUPS) {
  const grp = (d.options ?? []).find((o) => o.label === label);
  if (!grp) die(`ไม่พบกลุ่ม "${label}"`);
  for (const c of grp.choices) {
    if (!art[c.name]) die(`กลุ่ม "${label}" มีการ์ด "${c.name}" ที่ไม่รู้จัก`);
    c.imageSrc = art[c.name];
  }
}
// แท็บ "ข้อควรทราบ" เคยแปะ side-1/side-2 — เปลี่ยนเป็นชุดใหม่ 3 ภาพ (คงภาพอื่นในแท็บไว้)
const tab = (d.tabs ?? []).find((t) => t.title === NOTE_TAB);
if (tab) {
  // ตัดทั้งชุดเก่า side-1/side-2 และ screen-*-v รุ่นก่อน (รันซ้ำตอนขึ้นเวอร์ชันใหม่จะได้ไม่ซ้อน)
  const keep = (tab.images ?? []).filter((u) => !/\/(side-[12]|screen-(under|top|both))-v\d+\.jpg$/.test(u));
  tab.images = [art[UNDER], art[TOP], art[BOTH], ...keep];
  tab.imageSize = "sm";
}
d.savedAt = new Date().toISOString();

const { data: upd, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(`เขียนไม่สำเร็จ — ${e2.message}`);
if (!upd?.length) die("update ไม่โดนแถวไหนเลย");

const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const bd = back?.data ?? {};
for (const label of GROUPS) {
  const grp = (bd.options ?? []).find((o) => o.label === label);
  for (const c of grp?.choices ?? []) if (c.imageSrc !== art[c.name]) die(`อ่านกลับแล้วกลุ่ม "${label}" การ์ด "${c.name}" ภาพไม่ตรง: ${c.imageSrc}`);
}
if (tab) {
  const bt = (bd.tabs ?? []).find((t) => t.title === NOTE_TAB);
  if (JSON.stringify(bt?.images) !== JSON.stringify(tab.images)) die(`อ่านกลับแล้วแท็บ "${NOTE_TAB}" ภาพไม่ตรง`);
}
if (bd.savedAt !== d.savedAt) die(`savedAt ไม่ลง (${bd.savedAt})`);
console.log(`\n✓ เขียนแล้ว อ่านกลับตรง — 2 กลุ่ม × 3 การ์ด${tab ? ` + แท็บ "${NOTE_TAB}" ${tab.images.length} ภาพ` : ""} · savedAt ${bd.savedAt}`);
console.log("   ต่อไป: npx tsx scripts/revalidate-live-products.mts hand-fan-uv");
