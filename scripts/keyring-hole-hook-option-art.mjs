#!/usr/bin/env node
/**
 * ภาพตัวอย่างกลุ่ม "เจาะรู" และ "รับตะขอไหม" ของพวงกุญแจอะคริลิค (keyring-copy-copy)
 * (/products/พวงกุญแจอะคริลิค-Acrylic-Keyring)
 *
 *   node scripts/keyring-hole-hook-option-art.mjs            # วาดลง .cache/keyring-copy-copy/upload (ไม่แตะ DB)
 *   node scripts/keyring-hole-hook-option-art.mjs --write    # + อัป storage + ตั้ง imageSrc/desc + อ่านกลับเทียบ
 *
 * 4 ใบ — ทั้ง 2 กลุ่มเป็นคำถามใช่/ไม่ใช่ จึงตั้ง display:"cards" เหมือนพวงกุญแจหลายชิ้น (keyring-multi-charm)
 *   hole-yes / hole-no   เจาะรู       ชิ้นงานมีรูร้อยตะขอ vs ชิ้นเรียบไม่มีรู (มีเลนส์ขยายให้เห็นขอบชัด)
 *   hook-yes / hook-no   รับตะขอไหม   ได้ตะขอ+ห่วงประกอบมาให้ vs ได้เฉพาะชิ้นเจาะรู
 *
 * ทรงชิ้นงาน/สี/ตัวอักษร ยกชุดจาก scripts/multi-charm-option-art.mjs — สินค้าตระกูลเดียวกัน
 * ภาพตัวเลือกทั้งร้านจึงดูเป็นชุดเดียวกัน ([[iducky-option-thumb-crop]] · กล่องการ์ด 80px ชิ้นงานต้องกินเต็มเฟรม)
 *
 * ⚠️ ห้ามแก้ชื่อกลุ่ม/ชื่อตัวเลือก — "เจาะรู"/"รับตะขอไหม" เป็นเป้า showWhen ของกลุ่ม "ตะขอ" (และ showWhenAlso)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้น VER ใหม่
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "keyring-copy-copy";
const VER = "v1";
const OUT = ".cache/keyring-copy-copy/upload";
mkdirSync(OUT, { recursive: true });

const HEART = await mascotDataUri("heart", 520);

const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", LINE = "#94a3b8", CYAN = "#0891b2";
const GLASS = "#e8f6fd", EDGE = "#7dd3fc", METAL = "#94a3b8";

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
const pill = (text, { tone = "ok", y = 716, w = 460 } = {}) => {
  const bg = tone === "ok" ? "#ecfeff" : "#f8fafc";
  const st = tone === "ok" ? CYAN : LINE;
  const fg = tone === "ok" ? CYAN : SUB;
  return `
  <rect x="${W / 2 - w / 2}" y="${y}" width="${w}" height="66" rx="20" fill="${bg}" stroke="${st}" stroke-width="3"/>
  <text x="${W / 2}" y="${y + 44}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${fg}">${text}</text>`;
};

const ring = (cx, cy, r, sw = 8, color = METAL) => `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ffffff" stroke-width="${(sw * 0.3).toFixed(1)}" opacity="0.7"/>`;

/** ตะขอสปริงย่อ — ปลายล่างจบที่ (cx,y2) ให้ห่วงมาคล้อง */
const hookTop = (cx, y1, y2) => `
  <path d="M${cx} ${y2} L${cx} ${y1 + 26} A20 20 0 1 1 ${cx + 32} ${y1 + 18}" fill="none" stroke="${METAL}" stroke-width="9" stroke-linecap="round"/>
  <path d="M${cx} ${y2} L${cx} ${y1 + 26} A20 20 0 1 1 ${cx + 32} ${y1 + 18}" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" opacity="0.7"/>`;

/**
 * ชิ้นอะคริลิคมองจากด้านหน้า — แผ่นโค้งมนเนื้อใส ลายสกรีนอยู่กลาง เจาะรูบนหรือไม่ก็ได้
 * คืน topHole ไว้ให้ตัวเรียกวางห่วง/เลนส์ขยายตรงตำแหน่งรูพอดี
 */
function charm(cx, top, h, { art = HEART, w = null, hole = true } = {}) {
  const bw = w ?? h * 0.82;
  const r = Math.min(bw, h) * 0.16;
  const holeR = Math.max(5, Math.min(bw, h) * 0.055);
  const topHole = { x: cx, y: top + h * 0.1, r: holeR };
  const aw = art.ratio >= 1 ? bw * 0.7 : h * 0.6 * art.ratio;
  const ah = art.ratio >= 1 ? (bw * 0.7) / art.ratio : h * 0.6;
  return { topHole, svg: `
    <rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${h}" rx="${r}" fill="${GLASS}" stroke="${EDGE}" stroke-width="3.5"/>
    <rect x="${cx - bw / 2 + 5}" y="${top + 5}" width="${bw - 10}" height="${h - 10}" rx="${r * 0.8}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.8"/>
    <image href="${art.uri}" x="${cx - aw / 2}" y="${top + h * 0.53 - ah / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
    ${hole ? `<circle cx="${topHole.x}" cy="${topHole.y}" r="${holeR}" fill="#ffffff" stroke="${EDGE}" stroke-width="3"/>` : ""}` };
}

/**
 * เลนส์ขยายขอบบนของชิ้นงาน — วงกลมโตที่โชว์ว่า "ตรงนี้มีรู / ตรงนี้เรียบ"
 * รูเล็กแค่ 10 px ในรูปย่อบนการ์ด 80px มองไม่เห็นเลย เลนส์จึงเป็นตัวเล่าแทน
 * from = จุดบนชิ้นงานที่กำลังขยาย (ลากเส้นโยงไปหา)
 */
function lens(cx, cy, r, { hole = true, from } = {}) {
  const id = hole ? "lensHole" : "lensFlat";
  const sheetTop = cy - r * 0.52;
  const inner = `
    <rect x="${cx - r * 1.25}" y="${sheetTop}" width="${r * 2.5}" height="${r * 2}" rx="${r * 0.34}" fill="${GLASS}"/>
    <path d="M ${cx - r * 1.25} ${sheetTop + r * 0.34} q 0 ${-r * 0.34} ${r * 0.34} ${-r * 0.34} h ${r * 1.82} q ${r * 0.34} 0 ${r * 0.34} ${r * 0.34}"
      fill="none" stroke="${EDGE}" stroke-width="7"/>
    ${hole
      ? `<circle cx="${cx}" cy="${cy + r * 0.3}" r="${r * 0.33}" fill="#ffffff" stroke="${EDGE}" stroke-width="7"/>
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
    <text x="${cx}" y="${cy + r + 40}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${hole ? CYAN : SUB}">ขยายขอบบน</text>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) เจาะรู — มีรูร้อยตะขอ vs ชิ้นเรียบไม่มีรู
// ─────────────────────────────────────────────────────────────────────────────
const CH_CX = 330, CH_TOP = 262, CH_H = 372;

function holeYesCard() {
  const ch = charm(CH_CX, CH_TOP, CH_H);
  return frame(`
    ${title("เจาะรู", "เจาะรูบนชิ้นงานไว้ร้อยตะขอ/ห่วง")}
    ${ch.svg}
    ${lens(690, 330, 128, { hole: true, from: { x: ch.topHole.x + ch.topHole.r + 6, y: ch.topHole.y - 6 } })}
    ${pill("เจาะให้ฟรี ไม่คิดเพิ่ม", { w: 420 })}
    ${foot(["รูขนาดมาตรฐานของร้าน ใส่ห่วง/โซ่/ตะขอทั่วไปได้ทุกแบบ"])}`);
}

function holeNoCard() {
  const ch = charm(CH_CX, CH_TOP, CH_H, { hole: false });
  return frame(`
    ${title("ไม่เจาะรู", "ชิ้นงานเรียบทั้งชิ้น ไม่มีรู")}
    ${ch.svg}
    ${lens(690, 330, 128, { hole: false, from: { x: CH_CX + CH_H * 0.82 * 0.5 - 10, y: CH_TOP + 16 } })}
    ${pill("เหมาะเก็บสะสม / ตั้งโชว์", { tone: "off", w: 470 })}
    ${foot(["ไม่มีรูแล้วห้อยตะขอไม่ได้ — ถ้าจะห้อยกระเป๋า/กุญแจ เลือก “เจาะรู”"])}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) รับตะขอไหม — ได้ตะขอ+ห่วงมาด้วย vs ได้เฉพาะชิ้นเจาะรู
// ─────────────────────────────────────────────────────────────────────────────
function hookYesCard() {
  const ch = charm(450, 372, 300);
  /* ห่วง 2 วงคล้องกัน: วงบนรับปลายตะขอ · วงล่างวาดทับแผ่นให้เส้นพาดผ่านรูพอดี = เห็นว่า "ร้อยรูมาแล้ว" */
  return frame(`
    ${title("รับตะขอ", "ได้ตะขอ + ห่วง ประกอบมาให้พร้อมใช้")}
    ${hookTop(450, 176, 264)}${ring(450, 300, 38, 9)}
    ${ch.svg}
    ${ring(450, ch.topHole.y - 36, 38, 9)}
    ${pill("แกะกล่องแล้วห้อยได้เลย", { w: 396 })}
    ${foot(["เลือกแบบตะขอและสีตะขอได้ในกลุ่มถัดไป"])}`);
}

function hookNoCard() {
  const ch = charm(450, 372, 300);
  return frame(`
    ${title("ไม่รับตะขอ", "ได้เฉพาะชิ้นอะคริลิค เจาะรูมาให้แล้ว")}
    <g opacity="0.45">
      ${hookTop(450, 176, 264)}${ring(450, 300, 38, 9)}
    </g>
    <line x1="368" y1="192" x2="546" y2="348" stroke="#ef4444" stroke-width="9" stroke-linecap="round"/>
    ${ch.svg}
    <circle cx="450" cy="${ch.topHole.y}" r="34" fill="none" stroke="${CYAN}" stroke-width="3.5" stroke-dasharray="8 7"/>
    <text x="574" y="${ch.topHole.y + 9}" font-family="${TH}" font-size="24" font-weight="700" fill="${CYAN}">เจาะรูมาให้</text>
    ${pill("มีตะขอเองอยู่แล้ว / เอาไปประกอบเอง", { tone: "off", w: 560 })}
    ${foot(["ราคาถูกลงเพราะไม่รวมค่าตะขอ · ใส่ห่วงเองทีหลังได้"])}`);
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
  const buf = await sharp(Buffer.from(f.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
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
  { choice: "เจาะรู", file: "hole-yes", desc: "เจาะรูบนชิ้นงานไว้ร้อยตะขอ/ห่วง — ไม่มีค่าเจาะ" },
  { choice: "ไม่เจาะรู", file: "hole-no", desc: "ชิ้นงานเรียบไม่มีรู เหมาะเก็บสะสม/ตั้งโชว์ (ห้อยตะขอไม่ได้)" },
], { display: "cards" });
apply("รับตะขอไหม", [
  { choice: "รับตะขอ", file: "hook-yes", desc: "ได้ตะขอ + ห่วงประกอบมาให้พร้อมใช้ (เลือกแบบ/สีตะขอได้ด้านล่าง)" },
  { choice: "ไม่รับตะขอ", file: "hook-no", desc: "ได้เฉพาะชิ้นอะคริลิคเจาะรู ไม่รวมตะขอ — ราคาถูกลง" },
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
/* กันเผลอ: ตัวเลือกที่เป็นเป้า showWhen ของ 2 กลุ่มที่แตะ ต้องอยู่ครบเหมือนเดิม (กลุ่ม "ตะขอ" ชี้มาที่นี่)
   กลุ่มอื่นที่ชี้เพี้ยนอยู่ก่อนแล้วแค่เตือน — สคริปต์นี้ไม่ได้ทำ และไม่ควรบล็อกการรันซ้ำ
   (ของจริงที่ค้างอยู่: "สรีนด้าน" ชี้ "สกรีน 1 ด้าน" แต่ในกลุ่มงานสกรีนชื่อเป็น "สกรีน 1 ด้าน (ใต้)/(บน)" → กลุ่มนี้ไม่เคยโผล่) */
const TOUCHED = ["เจาะรู", "รับตะขอไหม"];
for (const o of bo) {
  for (const w of [o.showWhen, o.showWhenAlso]) {
    if (!w) continue;
    const hard = TOUCHED.includes(w.label);
    const parent = bo.find((x) => x.label === w.label);
    if (!parent) {
      console[hard ? "error" : "warn"]("showWhen ชี้กลุ่มที่ไม่มี:", o.label, w);
      if (hard) process.exit(1);
      continue;
    }
    for (const nm of w.choices ?? []) {
      if (parent.choices?.some((c) => c.name === nm)) continue;
      console[hard ? "error" : "warn"](`${hard ? "showWhen ชี้ตัวเลือกที่หายไป!" : "⚠️ (ค้างมาก่อน) showWhen ชี้ตัวเลือกที่ไม่มี:"}`, o.label, "→", w.label, "/", nm);
      if (hard) process.exit(1);
    }
  }
}
console.log(`✓ เติมภาพ ${applied.length} ตัวเลือก (${built.length} ไฟล์) อ่านกลับตรงทั้งหมด · savedAt = ${back.data.savedAt}`);
