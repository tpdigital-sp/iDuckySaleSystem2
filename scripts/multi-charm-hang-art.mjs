#!/usr/bin/env node
/**
 * ภาพการ์ดกลุ่ม "รูปแบบการห้อย" ของพวงกุญแจ หลายชิ้นใน 1 พวง (keyring-multi-charm)
 *
 *   node scripts/multi-charm-hang-art.mjs             # วาดลง .cache/multi-charm/upload (ไม่อัป)
 *   node scripts/multi-charm-hang-art.mjs --upload    # อัปขึ้น Supabase Storage ด้วย
 *
 * ได้ 3 ใบ:
 *   hang-side-v1     ห้อยด้านข้าง — ทุกชิ้นเกี่ยวห่วงหลักเดียวกัน เรียงข้างกัน
 *   hang-stack-v1    ห้อยต่อ ๆ กันลงมา — ร้อยชิ้นต่อกันเป็นสายแนวตั้ง
 *   hang-custom-v1   แบบอื่น ๆ — ผังพิเศษ แจ้งแอดมินก่อนสั่ง
 *
 * ⚠️ อัปทับ "ชื่อไฟล์เดิม" ไม่ได้ — CDN/Next แคชของเก่าไว้ ต้องขึ้นเลขรุ่นใหม่เสมอ
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { mascotDataUri } from "./iducky-assets.mjs";

const UPLOAD = process.argv.includes("--upload");
const REV = "v1";
const BUCKET = "product-images";
const DIR = "products/keyring-multi-charm";
const OUT = ".cache/multi-charm/upload";
mkdirSync(OUT, { recursive: true });

const HEART = await mascotDataUri("heart", 520);
const PEACE = await mascotDataUri("peace", 520);
const HELLO = await mascotDataUri("hello", 520);

const W = 700;
const H = 700;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const LINE = "#94a3b8";
const CYAN = "#0891b2";
const GLASS = "#e8f6fd";
const GLASS_EDGE = "#7dd3fc";
const METAL = "#94a3b8";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="76" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="116" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines
    .map(
      (t, i) =>
        `<text x="${W / 2}" y="${H - 40 - (lines.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

/** ตะขอสปริงด้านบนสุดของพวง (แบบย่อ) — ปลายล่างจบที่ (cx, y2) ให้ห่วงหลักมาคล้อง */
const hookTop = (cx, y1, y2) => `
  <path d="M${cx} ${y2} L${cx} ${y1 + 26} A20 20 0 1 1 ${cx + 32} ${y1 + 18}"
    fill="none" stroke="${METAL}" stroke-width="9" stroke-linecap="round"/>
  <path d="M${cx} ${y2} L${cx} ${y1 + 26} A20 20 0 1 1 ${cx + 32} ${y1 + 18}"
    fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" opacity="0.7"/>`;

/** ห่วงวงกลม (ห่วงหลัก/ห่วงเชื่อม) */
const ring = (cx, cy, r, sw = 8, color = METAL) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ffffff" stroke-width="${(sw * 0.3).toFixed(1)}" opacity="0.7"/>`;

/** โซ่ข้อเล็ก ๆ จากจุด (x1,y1) → (x2,y2) */
function chain(x1, y1, x2, y2, links = 3) {
  let out = "";
  for (let i = 1; i <= links; i++) {
    const t = i / (links + 1);
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    out += ring(x, y, 8, 5);
  }
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${LINE}" stroke-width="2.5" stroke-dasharray="1 6" stroke-linecap="round"/>${out}`;
}

/**
 * ชิ้นอะคริลิค 1 ชิ้น — แผ่นโค้งมนเนื้อใส มีรูเจาะบน (และรูล่างเมื่อ holeBottom)
 * คืนพิกัดรูไว้ให้คนเรียกลากโซ่/ห่วงมาเกี่ยว
 */
function charm(cx, top, h, { art = HEART, holeBottom = false, tone = GLASS, edge = GLASS_EDGE } = {}) {
  const w = h * 0.82;
  const r = h * 0.16;
  const holeR = Math.max(6, h * 0.05);
  const topHole = { x: cx, y: top + h * 0.1 };
  const botHole = { x: cx, y: top + h * 0.9 };
  const aw = art.ratio >= 1 ? w * 0.72 : h * 0.62 * art.ratio;
  const ah = art.ratio >= 1 ? (w * 0.72) / art.ratio : h * 0.62;
  const acy = top + h * (holeBottom ? 0.5 : 0.55);
  return {
    topHole,
    botHole,
    svg: `
    <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="${r}" fill="${tone}" stroke="${edge}" stroke-width="3.5"/>
    <rect x="${cx - w / 2 + 5}" y="${top + 5}" width="${w - 10}" height="${h - 10}" rx="${r * 0.8}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.8"/>
    <image href="${art.uri}" x="${cx - aw / 2}" y="${acy - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
    <circle cx="${topHole.x}" cy="${topHole.y}" r="${holeR}" fill="#ffffff" stroke="${edge}" stroke-width="3"/>
    ${holeBottom ? `<circle cx="${botHole.x}" cy="${botHole.y}" r="${holeR}" fill="#ffffff" stroke="${edge}" stroke-width="3"/>` : ""}`,
  };
}

// ── 1) ห้อยด้านข้าง — ทุกชิ้นเกี่ยวห่วงหลักเดียวกัน เรียงข้างกัน ──────────────
function sideArt() {
  const RING = { x: 350, y: 224, r: 42 };
  // 3 ชิ้น เรียงข้างกัน ชิ้นกลางต่ำสุด — โซ่ลากจากห่วงหลักถึงห่วงบนของแต่ละชิ้น
  const a = charm(210, 334, 162, { art: PEACE });
  const b = charm(350, 370, 182, { art: HEART });
  const c = charm(490, 334, 162, { art: PEACE });
  const link = (ch, ax, ay) =>
    chain(ax, ay, ch.topHole.x, ch.topHole.y - 18, 2) + ring(ch.topHole.x, ch.topHole.y - 5, 13, 6);
  return frame(`
    ${title("ห้อยด้านข้าง", "ทุกชิ้นเกี่ยวกับห่วงหลักเดียวกัน เรียงข้างกัน")}
    ${hookTop(350, 142, RING.y - RING.r - 2)}
    ${ring(RING.x, RING.y, RING.r, 10)}
    ${link(a, RING.x - RING.r * 0.72, RING.y + RING.r * 0.62)}
    ${link(b, RING.x, RING.y + RING.r * 0.95)}
    ${link(c, RING.x + RING.r * 0.72, RING.y + RING.r * 0.62)}
    ${a.svg}${b.svg}${c.svg}
    ${foot([
      "แต่ละชิ้นมีห่วงของตัวเอง เกี่ยวรวมที่ห่วงหลัก 1 วง",
      "จำนวนชิ้นตามที่เลือกในหน้าสั่งซื้อ (ภาพตัวอย่าง 3 ชิ้น)",
    ])}`);
}

// ── 2) ห้อยต่อ ๆ กันลงมา — ร้อยชิ้นต่อกันเป็นสายแนวตั้ง ─────────────────────
function stackArt() {
  const cx = 350;
  const sizes = [118, 108, 98];
  let body = hookTop(cx, 134, 192) + ring(cx, 212, 21, 8);
  let prev = null;
  let y = 224; // ชิ้นแรกเกี่ยวห่วงบนสุดตรง ๆ (รูบนซ้อนกับห่วง)
  for (let i = 0; i < sizes.length; i++) {
    const h = sizes[i];
    const ch = charm(cx, y, h, { art: i % 2 ? PEACE : HEART, holeBottom: i < sizes.length - 1 });
    // ชิ้นถัดไปมีห่วงเชื่อมเล็ก ๆ คั่นระหว่างรูล่างของชิ้นบนกับรูบนของชิ้นนี้
    if (prev) body += ring(cx, (prev.botHole.y + ch.topHole.y) / 2, 12, 6);
    body += ch.svg;
    prev = ch;
    y += h + 22;
  }
  return frame(`
    ${title("ห้อยต่อ ๆ กันลงมา", "ร้อยชิ้นงานต่อกันเป็นสายยาวแนวตั้ง")}
    ${body}
    ${foot([
      "แต่ละชิ้นเจาะรูบน-ล่าง ร้อยห่วงต่อกันเป็นสาย",
      "จำนวนชิ้นตามที่เลือกในหน้าสั่งซื้อ (ภาพตัวอย่าง 3 ชิ้น)",
    ])}`);
}

// ── 3) แบบอื่น ๆ — ติดต่อแอดมิน ─────────────────────────────────────────────
function customArt() {
  // เงาผังแบบอิสระ (เส้นประ) ให้เห็นว่าจัดแบบไหนก็คุยได้ + เป็ดชวนทักแชท
  const ghost = (cx, top, h, rot = 0) => {
    const w = h * 0.82;
    return `<g transform="rotate(${rot} ${cx} ${top + h / 2})">
      <rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="${h * 0.16}"
        fill="#f1f5f9" stroke="${LINE}" stroke-width="3" stroke-dasharray="9 8"/>
      <circle cx="${cx}" cy="${top + h * 0.1}" r="${h * 0.05}" fill="#ffffff" stroke="${LINE}" stroke-width="2.5" stroke-dasharray="4 4"/>
      <text x="${cx}" y="${top + h * 0.62}" font-family="${TH}" font-size="${h * 0.34}" text-anchor="middle" fill="${LINE}">?</text>
    </g>`;
  };
  const aw = HELLO.ratio >= 1 ? 240 : 240 * HELLO.ratio;
  const ah = HELLO.ratio >= 1 ? 240 / HELLO.ratio : 240;
  return frame(`
    ${title("การห้อยแบบอื่น ๆ", "มีผังในใจ จัดแบบพิเศษได้ — แจ้งแอดมินก่อนสั่ง")}
    ${hookTop(255, 146, 224)}
    ${ring(255, 254, 32, 9)}
    ${ghost(165, 300, 128, -10)}
    ${ghost(300, 316, 148, 6)}
    ${ghost(212, 470, 118, -4)}
    <g>
      <rect x="392" y="300" width="252" height="112" rx="26" fill="#ecfeff" stroke="${CYAN}" stroke-width="3"/>
      <path d="M468 410 L458 448 L516 410 Z" fill="#ecfeff" stroke="${CYAN}" stroke-width="3" stroke-linejoin="round"/>
      <rect x="466" y="404" width="52" height="10" fill="#ecfeff"/>
      <text x="518" y="346" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${CYAN}">อยากห้อยแบบไหน</text>
      <text x="518" y="382" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="${CYAN}">ทักมาคุยได้เลย!</text>
    </g>
    <image href="${HELLO.uri}" x="${470 - aw / 2}" y="${610 - ah}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
    ${foot(["แนบภาพร่าง/ตัวอย่างที่อยากได้ในแชทได้เลย ทีมงานจัดผังให้ก่อนผลิตจริง"])}`);
}

/**
 * ── การ์ดของ "ติ่งห้อย" โดยเฉพาะ ────────────────────────────────────────────
 * ต่างจากการ์ดชุดบน: ติ่งห้อยเป็นอะคริลิคตัวเล็กที่ห้อยเสริมกับชิ้นงานหลัก
 * จึงต้องเห็นชิ้นใหญ่ 1 ชิ้น + ติ่งเล็ก ๆ ว่าเกาะตรงไหน (ข้าง ๆ หรือต่อลงมา)
 */
function charmSideArt() {
  const RING = { x: 350, y: 214, r: 40 };
  const main = charm(350, 320, 190, { art: HEART });
  const c1 = charm(196, 330, 96, { art: PEACE });
  const c2 = charm(504, 330, 96, { art: PEACE });
  const link = (ch, ax, ay) =>
    chain(ax, ay, ch.topHole.x, ch.topHole.y - 16, 2) + ring(ch.topHole.x, ch.topHole.y - 5, 11, 5);
  return frame(`
    ${title("ห้อยด้านข้าง", "ติ่งห้อยเกาะห่วงหลัก อยู่ข้างชิ้นงานหลัก")}
    ${hookTop(350, 132, RING.y - RING.r - 2)}
    ${ring(RING.x, RING.y, RING.r, 10)}
    ${link(c1, RING.x - RING.r * 0.8, RING.y + RING.r * 0.6)}
    ${link(main, RING.x, RING.y + RING.r * 0.95)}
    ${link(c2, RING.x + RING.r * 0.8, RING.y + RING.r * 0.6)}
    ${c1.svg}${main.svg}${c2.svg}
    <text x="196" y="465" font-family="${TH}" font-size="19" text-anchor="middle" fill="${CYAN}">ติ่งห้อย</text>
    <text x="504" y="465" font-family="${TH}" font-size="19" text-anchor="middle" fill="${CYAN}">ติ่งห้อย</text>
    <text x="350" y="545" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">ชิ้นงานหลัก</text>
    ${foot(["ติ่งห้อยมีห่วงของตัวเอง เกี่ยวรวมที่ห่วงหลัก", "จำนวน/ขนาดติ่งห้อยตามที่เลือกไว้ด้านบน"])}`);
}

function charmStackArt() {
  const cx = 350;
  const main = charm(cx, 220, 150, { art: HEART, holeBottom: true });
  const c1 = charm(cx, 396, 78, { art: PEACE, holeBottom: true });
  const c2 = charm(cx, 500, 78, { art: PEACE });
  return frame(`
    ${title("ห้อยต่อ ๆ กันลงมา", "ติ่งห้อยร้อยต่อจากชิ้นงานหลักลงมาเป็นสาย")}
    ${hookTop(cx, 132, 190)}
    ${ring(cx, 210, 20, 8)}
    ${main.svg}
    ${ring(cx, (main.botHole.y + c1.topHole.y) / 2, 11, 5)}
    ${c1.svg}
    ${ring(cx, (c1.botHole.y + c2.topHole.y) / 2, 11, 5)}
    ${c2.svg}
    <text x="${cx + 122}" y="300" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">ชิ้นงานหลัก</text>
    <text x="${cx + 108}" y="442" font-family="${TH}" font-size="19" text-anchor="middle" fill="${CYAN}">ติ่งห้อย</text>
    <text x="${cx + 108}" y="546" font-family="${TH}" font-size="19" text-anchor="middle" fill="${CYAN}">ติ่งห้อย</text>
    ${foot(["ติ่งห้อยเจาะรูร้อยต่อกันลงมาจากชิ้นหลัก", "จำนวน/ขนาดติ่งห้อยตามที่เลือกไว้ด้านบน"])}`);
}

// ── เรนเดอร์ + อัป ───────────────────────────────────────────────────────────
const FILES = [
  ["hang-side", sideArt()],
  ["hang-stack", stackArt()],
  ["hang-custom", customArt()],
  ["charm-side", charmSideArt()],
  ["charm-stack", charmStackArt()],
];

const outNames = [];
for (const [name, svg] of FILES) {
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
  const file = `${name}-${REV}.jpg`;
  writeFileSync(`${OUT}/${file}`, buf);
  outNames.push(file);
  console.log(`🎨 ${OUT}/${file} (${Math.round(buf.length / 1024)} KB)`);
}

if (!UPLOAD) {
  console.log("(ยังไม่อัป — ใส่ --upload ถ้าต้องการขึ้น Storage)");
  process.exit(0);
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
for (const file of outNames) {
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(`${DIR}/${file}`, readFileSync(`${OUT}/${file}`), { contentType: "image/jpeg", upsert: false });
  if (error && !`${error.message}`.includes("already exists")) throw new Error(`อัป ${file} ไม่สำเร็จ — ${error.message}`);
  console.log(`✅ https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/${BUCKET}/${DIR}/${file}${error ? " (มีอยู่แล้ว — ไม่อัปทับ)" : ""}`);
}
