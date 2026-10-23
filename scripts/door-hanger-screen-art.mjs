#!/usr/bin/env node
/**
 * 🚪 ภาพประจำตัวเลือก "การสกรีน" ของป้ายแขวนประตู (mdf) — 23 ต.ค. 69 (เจ้าของร้านสั่ง "สร้างภาพที่กลุ่มตัวเลือกนี้ให้หน่อย")
 *
 *   node scripts/door-hanger-screen-art.mjs            # วาด 2 ภาพลง .cache/door-hanger/upload (ดูก่อน ไม่เขียนฐาน)
 *   node scripts/door-hanger-screen-art.mjs --write    # อัปเข้า storage + ตั้ง imageSrc 2 การ์ด แล้วอ่านกลับเทียบ + ล้างแคชหน้าเว็บจริง
 *
 * สไตล์เดียวกับ scripts/hand-fan-uv-screen-art.mjs: ป้ายด้านหน้า/ด้านหลังตามที่ลูกค้าเห็นจริง + ป้ายใหญ่ "1 ด้าน" / "2 ด้าน +฿45"
 *   • ทรงป้าย = เส้นตัดจริงของเทมเพลต "ป้ายแขวนประตู อะคริลิค 2" (ทรงตะขอ · cutCurves จาก scripts/door-hanger-template-link.mts)
 *     ด้านหลังกลับซ้าย-ขวา (ตะขออยู่อีกฝั่ง) เหมือนไกด์ด้านหลังในจอออกแบบ
 *   • ลาย = มาสคอตเป็ดเหลือง 3D ของร้าน (scripts/iducky-assets.mjs) บนพื้นไล่สี — 2 ด้าน ด้านหลังเป็นคนละลาย (peace คนละสีพื้น)
 * กลุ่มนี้โชว์เฉพาะเรท MDF/อะคริลิค → วาดเนื้อป้ายกลาง ๆ ไม่ระบุวัสดุ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ครั้งหน้าขึ้น v2
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const ID = "mdf";
const EXPECT_NAME = "ป้ายแขวนประตู (Door Hanger)";
const GROUP = "การสกรีน";
const SHAPE_TPL = "tpl-nkwfrtlwk";
const V = "v1";
const OUT = ".cache/door-hanger/upload";
mkdirSync(OUT, { recursive: true });

const ONE = "สกรีนด้านเดียว";
const TWO = "สกรีน 2 ด้าน";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

/* ── ทรงป้ายจากเส้นตัดจริง (มม.) → path ที่ย้ายมุมกรอบไป (0,0) ─────────── */
const { data: trow, error: te } = await sb.from("products").select("data").eq("id", `__template_${SHAPE_TPL}`).single();
if (te || !trow) die(`อ่านชุด ${SHAPE_TPL} ไม่ได้: ${te?.message}`);
const front = (trow.data.files ?? []).find((f) => !f.backGuide && f.cutCurves?.length) ?? die(`ชุด ${SHAPE_TPL} ยังไม่มีเส้นตัด — รัน door-hanger-template-link.mts ก่อน`);
const curves = front.cutCurves;
const xs = curves.flatMap((c) => [c.s[0], ...c.g.flatMap((g) => [g[0], g[2], g[4]])]);
const ys = curves.flatMap((c) => [c.s[1], ...c.g.flatMap((g) => [g[1], g[3], g[5]])]);
const X0 = Math.min(...xs);
const Y0 = Math.min(...ys);
const SW = Math.max(...xs) - X0;
const SH = Math.max(...ys) - Y0;
const n = (v) => (Math.round(v * 100) / 100).toString();
const SHAPE_D = curves
  .map((c) => `M ${n(c.s[0] - X0)} ${n(c.s[1] - Y0)} ` + c.g.map((g) => `C ${n(g[0] - X0)} ${n(g[1] - Y0)} ${n(g[2] - X0)} ${n(g[3] - Y0)} ${n(g[4] - X0)} ${n(g[5] - Y0)}`).join(" ") + " Z")
  .join(" ");

const HEART = await mascotDataUri("heart", 460);
const PEACE = await mascotDataUri("peace", 460);

const DEFS = `
<linearGradient id="bgA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset="1" stop-color="#0e7490"/></linearGradient>
<linearGradient id="bgB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbcfe8"/><stop offset="1" stop-color="#fb923c"/></linearGradient>
<linearGradient id="board" x1="0" y1="0" x2="0.5" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef2f6"/></linearGradient>
<linearGradient id="gloss" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="#ffffff" stop-opacity="0.6"/><stop offset="45%" stop-color="#ffffff" stop-opacity="0.05"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
</linearGradient>
<path id="shape" d="${SHAPE_D}"/>`;

/**
 * ป้าย 1 อัน สูง h px · mirror = มองจากด้านหลัง (ตะขออยู่อีกฝั่ง)
 * art = { bg, m, label: [บรรทัด] } หรือ null (ด้านที่ไม่สกรีน = เนื้อป้ายเปล่า)
 */
function hanger(cx, top, h, { art, mirror, id }) {
  const k = h / SH;
  const w = SW * k;
  const x = cx - w / 2;
  const flip = mirror ? ` translate(${SW} 0) scale(-1 1)` : "";
  const bodyTop = SH * 0.6; // ใต้ช่องตะขอ (ช่องลงไปถึง ~0.5 ของความสูง) — ตรงที่วางลายหลัก
  const mh = SH * 0.34;
  const mw = art ? mh * art.m.ratio : 0;
  return `<g transform="translate(${x} ${top}) scale(${k})">
    <use href="#shape" transform="translate(${5 / k} ${8 / k})${flip}" fill="#0f172a" opacity="0.08"/>
    <clipPath id="c-${id}"><use href="#shape" transform="${flip || "translate(0 0)"}"/></clipPath>
    <g clip-path="url(#c-${id})">
      <rect width="${SW}" height="${SH}" fill="${art ? `url(#${art.bg})` : "url(#board)"}"/>
      ${
        art
          ? `<image href="${art.m.uri}" x="${(SW - mw) / 2}" y="${bodyTop + (SH - bodyTop - mh) / 2}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
             ${art.label.map((l, i) => `<text x="${SW / 2}" y="${bodyTop - 9 + i * 12}" font-family="${TH}" font-size="10.5" font-weight="800" text-anchor="middle" fill="#ffffff">${esc(l)}</text>`).join("")}`
          : `<text x="${SW / 2}" y="${SH * 0.7}" font-family="${TH}" font-size="11" font-weight="700" text-anchor="middle" fill="#94a3b8">ไม่สกรีน</text>`
      }
      <rect width="${SW}" height="${SH * 0.6}" fill="url(#gloss)"/>
    </g>
    <use href="#shape" transform="${flip || "translate(0 0)"}" fill="none" stroke="#94a3b8" stroke-width="${2 / k}"/>
  </g>`;
}

/** ป้ายใต้ชิ้นงาน */
const tag = (cx, y, text, color) => {
  const w = [...text].filter((c) => !/[ัิ-ฺ็-๎]/.test(c)).length * 13 + 44;
  return `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="40" rx="20" fill="${color.soft}" stroke="${color.main}" stroke-width="2"/>
  <text x="${cx}" y="${y + 27}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${color.main}">${esc(text)}</text>`;
};

/** ป้ายใหญ่บอกตัวเลือก — ตัวชี้ขาดในรูปย่อ */
function badge(x, y, w, h, color, big, unit, sub) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="#ffffff" stroke="${color.main}" stroke-width="4"/>
  <text x="${x + 70}" y="${y + h / 2 + 28}" font-family="${TH}" font-size="84" font-weight="800" text-anchor="middle" fill="${color.main}">${esc(big)}</text>
  <text x="${x + 130}" y="${y + h / 2 - 6}" font-family="${TH}" font-size="38" font-weight="800" fill="${INK}">${esc(unit)}</text>
  <text x="${x + 130}" y="${y + h / 2 + 32}" font-family="${TH}" font-size="24" font-weight="700" fill="${color.main}">${esc(sub)}</text>`;
}

const BLUE = { main: "#1d4ed8", soft: "#eff6ff" };
const GREEN = { main: "#15803d", soft: "#f0fdf4" };
const GRAY = { main: SUB, soft: "#f1f5f9" };

function card(c) {
  const h = 430;
  const top = 160;
  const L = 300;
  const R = 600;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${DEFS}</defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="88" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${esc(c.name)}</text>
  <text x="${W / 2}" y="128" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${esc(c.sub)}</text>
  ${hanger(L, top, h, { art: c.front, id: "front" })}
  ${hanger(R, top, h, { art: c.back, mirror: true, id: "back" })}
  ${tag(L, top + h + 16, c.frontTag, c.color)}
  ${tag(R, top + h + 16, c.backTag, c.back ? c.color : GRAY)}
  ${badge(150, 678, 600, 120, c.color, c.big, c.unit, c.badgeSub)}
  <text x="${W / 2}" y="842" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${esc(c.foot)}</text>
</svg>`;
}

const CARDS = [
  {
    file: "screen-1side",
    choice: ONE,
    name: "สกรีนด้านเดียว",
    sub: "พิมพ์ลายด้านหน้า ด้านหลังเป็นเนื้อป้ายเปล่า",
    color: BLUE,
    front: { bg: "bgA", m: HEART, label: ["DO NOT", "DISTURB"] },
    back: null,
    frontTag: "ด้านหน้า · มีลาย",
    backTag: "ด้านหลัง · เปล่า",
    big: "1",
    unit: "ด้าน",
    badgeSub: "รวมในราคาแล้ว",
    foot: "ลายบนภาพเป็นตัวอย่าง — พิมพ์ตามแบบที่ลูกค้าส่งมา",
  },
  {
    file: "screen-2side",
    choice: TWO,
    name: "สกรีน 2 ด้าน",
    sub: "พิมพ์ทั้งหน้า-หลัง คนละลายได้ (เช่น ห้ามรบกวน / เชิญทำความสะอาด)",
    color: GREEN,
    front: { bg: "bgA", m: HEART, label: ["DO NOT", "DISTURB"] },
    back: { bg: "bgB", m: PEACE, label: ["PLEASE", "CLEAN"] },
    frontTag: "ด้านหน้า · ลายที่ 1",
    backTag: "ด้านหลัง · ลายที่ 2",
    big: "2",
    unit: "ด้าน",
    badgeSub: "+฿45 /อัน · ออกแบบหน้า-หลังบนเว็บได้",
    foot: "ส่งลายเดียวทั้ง 2 ด้านก็ได้ · ลายบนภาพเป็นตัวอย่าง",
  },
];

/* ── วาด ──────────────────────────────────────────────────────────── */
console.log(`🖼  วาดการ์ดการสกรีน 2 ใบ (ทรงป้าย ${n(SW)}×${n(SH)} มม. จาก ${SHAPE_TPL})`);
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
const url = (file) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/door-hanger/${file}`;
const art = {};
for (const c of CARDS) {
  const file = `${c.file}-${V}.jpg`;
  const up = await sb.storage.from("product-images").upload(`products/door-hanger/${file}`, bufs[c.file], { contentType: "image/jpeg", upsert: true });
  if (up.error) die(`อัป ${file}: ${up.error.message}`);
  art[c.choice] = url(file);
  console.log(`   ⬆ ${file}`);
}

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) die(`อ่าน ${ID} ไม่สำเร็จ — ${error.message}`);
const d = structuredClone(row.data);
if (d.name !== EXPECT_NAME) die(`ชื่อสินค้าไม่ตรงที่คาด: "${d.name}" — หยุด`);
const grp = (d.options ?? []).find((o) => o.label === GROUP) ?? die(`ไม่พบกลุ่ม "${GROUP}"`);
for (const c of grp.choices) {
  if (!art[c.name]) die(`กลุ่ม "${GROUP}" มีการ์ด "${c.name}" ที่ไม่รู้จัก`);
  c.imageSrc = art[c.name];
}
d.savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(`เขียนไม่สำเร็จ — ${e2.message}`);
if (!upd?.length) die("update ไม่โดนแถวไหนเลย");

const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const bg = (back?.data?.options ?? []).find((o) => o.label === GROUP);
for (const c of bg?.choices ?? []) if (c.imageSrc !== art[c.name]) die(`อ่านกลับแล้วการ์ด "${c.name}" ภาพไม่ตรง: ${c.imageSrc}`);
console.log(`\n✓ เขียนแล้ว อ่านกลับตรง — กลุ่ม "${GROUP}" 2 การ์ด · savedAt ${back.data.savedAt}`);
await revalidateLive(env, { productIds: [ID] });
