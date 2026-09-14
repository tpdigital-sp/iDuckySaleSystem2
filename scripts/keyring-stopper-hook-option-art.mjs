#!/usr/bin/env node
/**
 * ภาพตัวอย่างกลุ่ม "เจาะรู" และ "รับตะขอไหม" ของพวงกุญแจ + อะไหล่จุกสีใส (keyring-clear-stopper)
 * (/products/พวงกุญแจ-อะไหล่จุกสีใส)
 *
 *   node scripts/keyring-stopper-hook-option-art.mjs           # วาดลง .cache/keyring-clear-stopper/upload (ไม่แตะ DB)
 *   node scripts/keyring-stopper-hook-option-art.mjs --write   # + อัป storage + ตั้ง imageSrc/desc + อ่านกลับเทียบ
 *
 * 4 ใบ — ทั้ง 2 กลุ่มเป็นคำถามใช่/ไม่ใช่ จึงตั้ง display:"cards" เหมือนพวงกุญแจอะคริลิคตัวพี่
 * (scripts/keyring-hole-hook-option-art.mjs) ภาพตัวเลือกทั้งร้านจะได้เป็นชุดเดียวกัน
 *   hole-yes  เจาะรู      มีรูตะขอที่มุมชิ้นงาน (มีเลนส์ขยายให้เห็นขอบชัด)
 *   hole-no   ไม่เจาะรู   ขอบเรียบไม่มีรูตะขอ — แต่ยังประกบ 2 แผ่นด้วยจุกสีใส
 *   hook-yes  รับตะขอ     ได้ตะขอ/ห่วงคล้องรูมาให้พร้อมห้อย (Z1/Z2 แถมฟรี)
 *   hook-no   ไม่รับตะขอ  ได้เฉพาะชิ้นงาน 2 แผ่น + จุกสีใส (รูเจาะมาให้แล้ว)
 *
 * ทรงชิ้นงานยกชุดจาก scripts/keyring-stopper-plates-art.mjs — สินค้าตัวเดียวกัน ภาพขนาดกับภาพตะขอจะได้ทรงเดียวกัน
 * ⚠️ งานนี้เป็นอะคริลิค 2 ชิ้นเสมอ (แผ่นล่างมีลาย + แผ่นบนใส) ประกบด้วยจุกสีใส — ทั้ง 2 ใบต้องวาดครบ
 * ⚠️ จุกสีใสได้มาทุกใบอยู่แล้ว (ค่าจุกรวมในราคาแล้ว) — "ไม่เจาะรู" คือไม่มีรูตะขอเท่านั้น ไม่ใช่ไม่มีจุก
 * ⚠️ ห้ามแก้ชื่อกลุ่ม/ชื่อตัวเลือก — "เจาะรู"/"รับตะขอไหม" เป็นเป้า showWhen ของกลุ่มตะขอ
 *    (โครงกลุ่มสร้างด้วย scripts/keyring-stopper-drill-hole-group.mjs — รันตัวนั้นก่อนตัวนี้)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้น VER ใหม่
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "keyring-clear-stopper";
const VER = "v1";
const OUT = ".cache/keyring-clear-stopper/upload";
mkdirSync(OUT, { recursive: true });

const MASCOT = await mascotDataUri("heart", 560);

const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", LINE = "#94a3b8", CYAN = "#0891b2";
const GLASS = "rgba(56,189,248,0.20)", GLASS_EDGE = "#38bdf8";
const CLEAR = "rgba(226,232,240,0.55)", CLEAR_EDGE = "#7dd3fc";
const METAL = "#94a3b8";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="30" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="82" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="126" font-family="${TH}" font-size="25" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) => lines.map((t, i) =>
  `<text x="${W / 2}" y="${H - 44 - (lines.length - 1 - i) * 34}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${t}</text>`).join("");

/** แถบสรุปใต้ภาพ — ประโยคที่ลูกค้าต้องอ่านออกก่อนใคร */
const pill = (text, { tone = "ok", y = 700, w = 460 } = {}) => {
  const bg = tone === "ok" ? "#ecfeff" : "#f8fafc";
  const st = tone === "ok" ? CYAN : LINE;
  const fg = tone === "ok" ? CYAN : SUB;
  return `
  <rect x="${W / 2 - w / 2}" y="${y}" width="${w}" height="66" rx="20" fill="${bg}" stroke="${st}" stroke-width="3"/>
  <text x="${W / 2}" y="${y + 44}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${fg}">${text}</text>`;
};

/** ลายที่สกรีนบนชิ้นงาน — มาสคอตเป็ดของฝ่าย Content (ชุดเดียวกับภาพขนาดแผ่น) */
const artwork = (cx, cy, w, h, opacity = 1) => {
  const box = Math.min(w, h * 0.98);
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
    preserveAspectRatio="xMidYMid meet" opacity="${opacity}"/>`;
};

/** จุกสีใส — แกนกลางที่ยึดแผ่นบนกับแผ่นล่างไว้ด้วยกัน (หมุนได้) */
const stopper = (cx, cy, r) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(241,245,249,0.9)" stroke="#94a3b8" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.5}" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <path d="M${cx - r * 0.72} ${cy - r * 0.28} a${r} ${r} 0 0 1 ${r * 0.68} -${r * 0.6}" stroke="#ffffff" stroke-width="3" fill="none" opacity="0.9"/>`;

const ring = (cx, cy, r, sw = 9, color = METAL) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ffffff" stroke-width="${(sw * 0.3).toFixed(1)}" opacity="0.7"/>`;

/** ตะขอสปริงย่อ — ปลายล่างจบที่ (cx,y2) ให้ห่วงมาคล้อง */
const hookTop = (cx, y1, y2) => `
  <path d="M${cx} ${y2} L${cx} ${y1 + 26} A20 20 0 1 1 ${cx + 32} ${y1 + 18}" fill="none" stroke="${METAL}" stroke-width="9" stroke-linecap="round"/>
  <path d="M${cx} ${y2} L${cx} ${y1 + 26} A20 20 0 1 1 ${cx + 32} ${y1 + 18}" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" opacity="0.7"/>`;

/* ── ชิ้นงานจริงของสินค้านี้: แผ่นล่างมีลาย + แผ่นบนใส ประกบด้วยจุกสีใส ── */
const RATIO = 0.78;                       // กว้าง : ยาว (ทรงเดียวกับภาพขนาดแผ่น)
const PLATE_CX = 452, PLATE_TOP = 322, PLATE_H = 358;

function piece({ cx = PLATE_CX, top = PLATE_TOP, h = PLATE_H, hole: drilled = true } = {}) {
  const w = h * RATIO;
  const b = { x: cx - w / 2, y: top, w, h, cx, r: 30 };
  const holeR = 20;
  /* รูเจาะอยู่มุมบนขวา ชิดขอบพอให้ห่วงที่คล้องโผล่พ้นขอบชิ้นงาน = เห็นชัดว่า "ร้อยรูมาแล้ว" */
  const hole = { x: b.x + b.w - holeR * 2.0, y: b.y + holeR * 1.6, r: holeR };
  /* จุดบนขอบชิ้นงานที่เลนส์ขยายจะไปส่อง (มีรู = ตรงรู · ไม่มีรู = มุมขวาบนที่เรียบ) */
  const zoom = drilled ? { x: hole.x + hole.r, y: hole.y - hole.r } : { x: b.x + b.w - 28, y: b.y + 14 };
  const tH = 178, tW = tH * RATIO;
  const t = { x: b.cx - tW / 2, y: b.y + b.h * 0.94 - tH, w: tW, h: tH, cx: b.cx, r: 22 };
  return {
    b, hole, t, zoom, drilled,
    svg: `
      <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.r}" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="4"/>
      ${artwork(b.cx, b.y + b.h * 0.34, b.w * 0.62, b.h * 0.38)}
      <rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" rx="${t.r}" fill="${CLEAR}" stroke="${CLEAR_EDGE}" stroke-width="4"/>
      ${artwork(t.cx, t.y + t.h * 0.64, t.w * 0.6, t.h * 0.42, 0.9)}
      ${stopper(t.cx, t.y + t.h * 0.27, 22)}
      ${drilled ? `<circle cx="${hole.x}" cy="${hole.y}" r="${hole.r}" fill="#ffffff" stroke="${GLASS_EDGE}" stroke-width="4"/>
      <circle cx="${hole.x}" cy="${hole.y}" r="${hole.r * 0.55}" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="3"/>` : ""}`,
  };
}

/** ป้ายชี้ชิ้นส่วน — เส้นโยงจากจุดบนชิ้นงานไปหาข้อความทางซ้าย */
const tag = (from, tx, ty, text, color = LINE) => `
  <line x1="${from.x}" y1="${from.y}" x2="${tx + 14}" y2="${ty - 8}" stroke="${color}" stroke-width="3" stroke-dasharray="8 7"/>
  <text x="${tx}" y="${ty + 12}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="end" fill="${color}">${text}</text>`;


/**
 * เลนส์ขยายขอบชิ้นงาน — วงกลมโตที่โชว์ว่า "ตรงนี้มีรู / ตรงนี้เรียบ"
 * รูจริงเล็กแค่ ~10 px ในรูปย่อบนการ์ด 80px มองไม่เห็นเลย เลนส์จึงเป็นตัวเล่าแทน
 * from = จุดบนชิ้นงานที่กำลังขยาย (ลากเส้นโยงไปหา) — ยกชุดจาก scripts/keyring-hole-hook-option-art.mjs
 */
function lens(cx, cy, r, { hole = true, from } = {}) {
  const id = hole ? "lensHole" : "lensFlat";
  const sheetTop = cy - r * 0.52;
  const inner = `
    <rect x="${cx - r * 1.25}" y="${sheetTop}" width="${r * 2.5}" height="${r * 2}" rx="${r * 0.34}" fill="${GLASS}"/>
    <path d="M ${cx - r * 1.25} ${sheetTop + r * 0.34} q 0 ${-r * 0.34} ${r * 0.34} ${-r * 0.34} h ${r * 1.82} q ${r * 0.34} 0 ${r * 0.34} ${r * 0.34}"
      fill="none" stroke="${GLASS_EDGE}" stroke-width="7"/>
    ${hole
      ? `<circle cx="${cx}" cy="${cy + r * 0.3}" r="${r * 0.33}" fill="#ffffff" stroke="${GLASS_EDGE}" stroke-width="7"/>
         <circle cx="${cx}" cy="${cy + r * 0.3}" r="${r * 0.33}" fill="none" stroke="${CYAN}" stroke-width="3" stroke-dasharray="7 6"/>`
      : `<circle cx="${cx}" cy="${cy + r * 0.3}" r="${r * 0.33}" fill="none" stroke="${LINE}" stroke-width="4" stroke-dasharray="9 8"/>
         <line x1="${cx - r * 0.3}" y1="${cy + r * 0.02}" x2="${cx + r * 0.3}" y2="${cy + r * 0.58}" stroke="#ef4444" stroke-width="7" stroke-linecap="round"/>`}`;
  const leader = from ? `<line x1="${from.x}" y1="${from.y}" x2="${cx - r * 0.72}" y2="${cy - r * 0.72}"
      stroke="${LINE}" stroke-width="3" stroke-dasharray="9 8"/>` : "";
  return `
    ${leader}
    <clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"/>
    <g clip-path="url(#${id})">${inner}</g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${hole ? CYAN : LINE}" stroke-width="6"/>
    <text x="${cx}" y="${cy + r + 40}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${hole ? CYAN : SUB}">ขยายมุมบน</text>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) เจาะรู — มีรูตะขอที่มุมชิ้นงาน vs ขอบเรียบไม่มีรู (จุกสีใสประกบ 2 แผ่นเหมือนเดิมทั้งคู่)
// ─────────────────────────────────────────────────────────────────────────────
const HOLE_CX = 330;

function holeYesCard() {
  const p = piece({ cx: HOLE_CX, h: 330, top: 300 });
  return frame(`
    ${title("เจาะรู", "เจาะรูตะขอที่มุมชิ้นงาน ไว้ร้อยห่วง/ตะขอ")}
    ${p.svg}
    ${lens(690, 330, 126, { hole: true, from: p.zoom })}
    ${pill("เจาะให้ฟรี ไม่คิดเพิ่ม", { w: 420 })}
    ${foot(["รูขนาดมาตรฐานของร้าน ใส่ห่วง/โซ่/ตะขอทั่วไปได้ทุกแบบ"])}`);
}

function holeNoCard() {
  const p = piece({ cx: HOLE_CX, h: 330, top: 300, hole: false });
  return frame(`
    ${title("ไม่เจาะรู", "ขอบเรียบทั้งชิ้น ไม่มีรูตะขอ")}
    ${p.svg}
    ${lens(690, 330, 126, { hole: false, from: p.zoom })}
    ${pill("เหมาะเก็บสะสม / ตั้งโชว์", { tone: "off", w: 470 })}
    ${foot([
      "ไม่มีรูแล้วห้อยตะขอไม่ได้ — ถ้าจะห้อยกระเป๋า/กุญแจ เลือก “เจาะรู”",
      "แผ่นบน-ล่างยังประกบด้วยจุกสีใส หมุนได้ตามเดิม",
    ])}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) รับตะขอไหม — ได้ตะขอ/ห่วงมาด้วย vs ได้เฉพาะชิ้นงาน
// ─────────────────────────────────────────────────────────────────────────────
function hookYesCard() {
  const p = piece();
  const cx = p.hole.x;
  return frame(`
    ${title("รับตะขอ", "ได้ตะขอ + ห่วง คล้องรูมาให้พร้อมห้อย")}
    ${hookTop(cx, 152, 256)}
    ${ring(cx, 286, 34)}
    ${p.svg}
    ${ring(cx, p.hole.y, 36)}
    ${tag({ x: p.t.cx - 24, y: p.t.y + p.t.h * 0.27 }, 252, 520, "จุกสีใส (มีทุกชิ้น)")}
    ${pill("แกะกล่องแล้วห้อยได้เลย", { w: 400 })}
    ${foot(["ห่วง Z1 / Z2 แถมฟรี · เลือกแบบตะขอกว่า 30 แบบในกลุ่มถัดไป"])}`);
}

function hookNoCard() {
  const p = piece();
  const cx = p.hole.x;
  return frame(`
    ${title("ไม่รับตะขอ", "ได้เฉพาะชิ้นงาน + จุกสีใส ไม่มีตะขอ/ห่วง")}
    <g opacity="0.4">
      ${hookTop(cx, 152, 256)}
      ${ring(cx, 286, 34)}
    </g>
    <line x1="${cx - 84}" y1="170" x2="${cx + 84}" y2="314" stroke="#ef4444" stroke-width="9" stroke-linecap="round"/>
    ${p.svg}
    <circle cx="${p.hole.x}" cy="${p.hole.y}" r="38" fill="none" stroke="${CYAN}" stroke-width="3.5" stroke-dasharray="8 7"/>
    ${tag({ x: p.t.cx - 24, y: p.t.y + p.t.h * 0.27 }, 252, 520, "จุกสีใส (มีทุกชิ้น)")}
    <text x="${p.hole.x + 54}" y="${p.hole.y + 9}" font-family="${TH}" font-size="23" font-weight="700" fill="${CYAN}">เจาะรูมาให้</text>
    ${pill("มีตะขอเองอยู่แล้ว / ใส่เองทีหลัง", { tone: "off", w: 520 })}
    ${foot(["ถ้าอยากได้ห่วงติดมาด้วย เลือก “รับตะขอ” — ห่วง Z1 / Z2 แถมฟรี"])}`);
}

// ── วาด ─────────────────────────────────────────────────────────────────────
const FILES = [
  { file: "hole-yes", svg: holeYesCard(), note: "เจาะรู" },
  { file: "hole-no", svg: holeNoCard(), note: "ไม่เจาะรู" },
  { file: "hook-yes", svg: hookYesCard(), note: "รับตะขอ" },
  { file: "hook-no", svg: hookNoCard(), note: "ไม่รับตะขอ" },
];

const built = [];
for (const f of FILES) {
  const name = `${f.file}-${VER}.jpg`;
  const buf = await sharp(Buffer.from(f.svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${name}`, buf);
  built.push({ ...f, name, buf });
  console.log(`🖼  ${OUT}/${name}  ${Math.round(buf.length / 1024)} KB — ${f.note}`);
}
/* แผ่นรวมย่อ 80px (ขนาดจริงบนการ์ด) — ตรวจว่ายังแยกออกว่าใบไหนคือแบบไหน */
const TS = 160;
await sharp({ create: { width: TS * built.length, height: TS, channels: 3, background: "#ffffff" } })
  .composite(await Promise.all(built.map(async (b, i) => ({
    input: await sharp(b.buf).resize(80, 80).resize(TS, TS, { kernel: "nearest" }).toBuffer(),
    left: i * TS, top: 0,
  }))))
  .jpeg({ quality: 90 })
  .toFile(`${OUT}/_thumbs-all.jpg`);
console.log(`🔎 ${OUT}/_thumbs-all.jpg — รูปย่อ 80px ${built.length} ใบเรียงเทียบ`);

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัป storage + เขียน options ─────────────────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const url = {};
for (const b of built) {
  const key = `products/${PRODUCT_ID}/${b.name}`;
  const { error } = await sb.storage.from("product-images").upload(key, b.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  url[b.file] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  const head = await fetch(url[b.file], { method: "HEAD" });
  if (!head.ok) { console.error("ดึงรูปที่อัปแล้วไม่ได้", url[b.file], head.status); process.exit(1); }
}
console.log(`⬆️  อัปโหลด ${built.length} ไฟล์ขึ้น storage แล้ว`);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

/** เติมภาพ/คำอธิบายให้กลุ่มหนึ่ง — ตัวเลือกใน DB ต้องมีในตารางครบ ไม่งั้นหยุด (ชื่ออาจถูกแก้หลังบ้าน) */
const applied = [];
function apply(label, rows, { display } = {}) {
  const g = (data.options ?? []).find((o) => o.label === label);
  if (!g) { console.error(`ไม่เจอกลุ่ม "${label}" — หยุดก่อน`); process.exit(1); }
  if (display) g.display = display;
  for (const c of g.choices ?? []) {
    const r = rows.find((x) => x.choice === c.name);
    if (!r) { console.error(`ตัวเลือกใน DB ไม่มีในสคริปต์: ${label} / ${c.name}`); process.exit(1); }
    c.imageSrc = url[r.file];
    if (r.desc) c.desc = r.desc;
    applied.push({ label, name: c.name, file: r.file, desc: r.desc });
  }
}

apply("เจาะรู", [
  { choice: "เจาะรู", file: "hole-yes", desc: "เจาะรูตะขอที่มุมชิ้นงานไว้ร้อยห่วง/ตะขอ — ไม่มีค่าเจาะ" },
  { choice: "ไม่เจาะรู", file: "hole-no", desc: "ขอบเรียบไม่มีรูตะขอ เหมาะเก็บสะสม/ตั้งโชว์ (ห้อยตะขอไม่ได้ · ยังประกบ 2 แผ่นด้วยจุกสีใส)" },
], { display: "cards" });
apply("รับตะขอไหม", [
  { choice: "รับตะขอ", file: "hook-yes", desc: "ได้ตะขอ/ห่วงคล้องรูมาให้พร้อมห้อย — ห่วง Z1/Z2 แถมฟรี (เลือกแบบด้านล่าง)" },
  { choice: "ไม่รับตะขอ", file: "hook-no", desc: "ได้เฉพาะชิ้นงาน 2 แผ่น + จุกสีใส เจาะรูมาให้แล้ว — ไม่มีตะขอ/ห่วง" },
], { display: "cards" });

data.savedAt = new Date().toISOString();                 // ISO เท่านั้น (ตัวเลข = หน้าแก้ไขติด 409 ตลอด)
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// ── อ่านกลับมาเทียบ ("ไม่ error" ไม่ได้แปลว่าค่าลงจริง) ──────────────────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const bo = back.data.options ?? [];
for (const a of applied) {
  const g = bo.find((o) => o.label === a.label);
  const c = g?.choices?.find((x) => x.name === a.name);
  if (c?.imageSrc !== url[a.file] || (a.desc && c?.desc !== a.desc)) {
    console.error("อ่านกลับไม่ตรง:", a.label, a.name, c); process.exit(1);
  }
}
for (const label of ["เจาะรู", "รับตะขอไหม"]) {
  const g = bo.find((o) => o.label === label);
  if (g?.display !== "cards") { console.error(`display ของ "${label}" ไม่ใช่ cards:`, g?.display); process.exit(1); }
}
/* กันเผลอ: กลุ่ม/ตัวเลือกที่เป็นเป้า showWhen ต้องอยู่ครบเหมือนเดิม (กลุ่ม "ตะขอ / ห่วง" ชี้มาที่กลุ่มนี้) */
for (const o of bo) {
  for (const w of [o.showWhen, o.showWhenAlso]) {
    if (!w) continue;
    const parent = bo.find((x) => x.label === w.label);
    if (!parent) { console.error("showWhen ชี้กลุ่มที่หายไป!", o.label, w); process.exit(1); }
    for (const nm of w.choices ?? []) {
      if (!parent.choices?.some((c) => c.name === nm)) { console.error("showWhen ชี้ตัวเลือกที่หายไป!", o.label, nm); process.exit(1); }
    }
  }
}
console.log(`✓ เติมภาพ ${applied.length} ตัวเลือก (${built.length} ไฟล์) อ่านกลับตรงทั้งหมด · savedAt = ${back.data.savedAt}`);
