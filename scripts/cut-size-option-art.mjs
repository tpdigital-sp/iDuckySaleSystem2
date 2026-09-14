#!/usr/bin/env node
/**
 * ภาพตัวอย่างกลุ่ม "ขนาดตัด" ชุดกลางทั้งร้าน (สติ๊กเกอร์ทุกตัว + กระดาษอาร์ตมัน/PET + แบนเนอร์)
 * [เจ้าของร้านสั่ง 14 ก.ย. 69 — "ให้เหมือนกับสติ๊กเกอร์ Gold/Silver/RoseGold และมีภาพกับสินค้าอื่น ๆ ด้วย"]
 *
 *   node scripts/cut-size-option-art.mjs                 # วาดลง .cache/cut-size/ ดูก่อน (ไม่เขียน)
 *   node scripts/cut-size-option-art.mjs --write         # + อัปคลังกลาง + ผูก imageSrc + อ่านกลับเทียบ
 *   node scripts/cut-size-option-art.mjs --only=neon     # จำกัดสินค้า (ใส่ได้หลายตัวคั่น ,)
 *
 * ⭐ ภาพ "ชุดกลาง" — เก็บที่ products/shared/cut-size/ แล้วหลายสินค้าใช้ไฟล์เดียวกัน
 *    คีย์ = ชื่อขนาด + จำนวนชิ้น + หน่วย · สินค้าที่ตัวเลขตรงกันจึงแชร์ไฟล์ (สติ๊กเกอร์ 8 ตัวตรงกันหมด)
 *    วาชิ/แบนเนอร์/เรทตารางเมตร ตัวเลขคนละชุด → ได้ไฟล์ของตัวเอง อัตโนมัติ
 *
 * วิธีวาด: แผ่นตามหน่วยราคา (A3 42×29.7 · ตร.ม. 100×100 · แบนเนอร์ 65×30)
 *   แล้ววางชิ้นงาน "ตามสัดส่วนจริง" เป็นกริด c × r = จำนวนชิ้นที่ร้านประกาศไว้ใน badge
 *   เลือก c × r + แนววางที่กินเนื้อที่แผ่นได้มากที่สุด (ย่อลงถ้าไม่พอ) — ไม่ได้เดาเอง ใช้ขนาดจริงเป็นตัวตั้ง
 *   จำนวนชิ้นในภาพจึงตรงกับ badge เสมอ · ที่ว่างบนแผ่นคือของจริง (เช่น วาชิ A4 = 1 ชิ้น ใช้ครึ่งแผ่น)
 *
 * ⚠️ เอาจำนวน/หน่วยจาก badge + piecesPerUnit ของสินค้าเอง — ห้าม hard-code เลขทั้งร้าน
 * ⚠️ CDN แคชตามพาธ — แก้ภาพต้องขึ้น VER ใหม่
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const VER = "v1";
const WRITE = process.argv.includes("--write");
const ONLY = ((process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const OUT = ".cache/cut-size";
const GROUP_RE = /^ขนาดตัด/;
const CUSTOM_RE = /กำหนดขนาดเอง|ระบุขนาดเอง/;
const BYFILE_RE = /ขนาดตามไฟล์/;

const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", EDGE = "#cbd5e1";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** ขนาดชิ้นงานจริง (ซม. แนวตั้ง กว้าง × สูง) — ใช้เป็นสัดส่วนตอนวาง */
const SIZES = {
  "A3": [29.7, 42], "A4": [21, 29.7], "A5": [14.85, 21], "A6": [10.5, 14.85], "A7": [7.4, 10.5],
  "ครึ่ง A4 แนวตั้ง": [10.5, 29.7], "ครึ่ง A5 แนวตั้ง": [7.4, 21], "ครึ่ง A6 แนวตั้ง": [5.25, 14.85],
  "4 × 6 นิ้ว": [10.16, 15.24],
};
const CM_TEXT = {
  "4 × 6 นิ้ว": "10.2 × 15.2 ซม. (4 × 6 นิ้ว)",
};
const cmTextOf = (name) => CM_TEXT[name] ?? (SIZES[name] ? `${SIZES[name][0]} × ${SIZES[name][1]} ซม.` : "");
/** คำบรรยายสั้นใต้หัวข้อ */
const NOTE = {
  "A3": "เต็มแผ่น A3", "A4": "ครึ่งหนึ่งของ A3", "A5": "ครึ่งหนึ่งของ A4",
  "A6": "ครึ่งหนึ่งของ A5", "A7": "ครึ่งหนึ่งของ A6",
  "ครึ่ง A4 แนวตั้ง": "ผ่า A4 ตามแนวตั้ง — ทรงยาว",
  "ครึ่ง A5 แนวตั้ง": "ผ่า A5 ตามแนวตั้ง — ทรงยาว",
  "ครึ่ง A6 แนวตั้ง": "ผ่า A6 ตามแนวตั้ง — ทรงยาว",
  "4 × 6 นิ้ว": "ขนาดรูปอัด 4 × 6 นิ้ว",
};

/** ชื่อไฟล์ในคลัง — storage รับได้แต่ ASCII จึงต้องมีสลักอังกฤษของทุกขนาด */
const SLUG = {
  "A3": "a3", "A4": "a4", "A5": "a5", "A6": "a6", "A7": "a7",
  "ครึ่ง A4 แนวตั้ง": "half-a4", "ครึ่ง A5 แนวตั้ง": "half-a5", "ครึ่ง A6 แนวตั้ง": "half-a6",
  "4 × 6 นิ้ว": "4x6in",
};
/** ชื่อที่ไม่มีในตาราง — ทำสลักจากรหัสตัวอักษร (คงที่ ซ้ำได้เหมือนเดิมทุกครั้ง) */
const asciiSlug = (s) => {
  const ascii = s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return `x${ascii ? "-" + ascii : ""}-${h.toString(36)}`;
};

/** แผ่นที่วาด ตามหน่วยราคาที่เขียนใน badge */
const SHEETS = [
  { re: /^แผ่น\s*A3$/i, slug: "a3", w: 42, h: 29.7, caption: "แผ่น A3 · 29.7 × 42 ซม." },
  { re: /^ตร\.?\s*ม\.?$/i, slug: "sqm", w: 100, h: 100, caption: "1 ตารางเมตร · 100 × 100 ซม." },
  { re: /^แผ่น\s*\(?\s*65\s*[×x]\s*30/i, slug: "b6530", w: 65, h: 30, caption: "แผ่น 65 × 30 ซม." },
];
const sheetOf = (unit) => SHEETS.find((s) => s.re.test(unit.trim()));

/** จำนวน + หน่วย จาก badge เช่น "ได้ 8 ชิ้น / แผ่น A3 · ไดคัทฟรี 25 จุด" */
function readBadge(badge) {
  const m = String(badge ?? "").match(/ได้\s*([\d,]+)\s*ชิ้น\s*\/\s*([^·]+)/);
  return m ? { n: Number(m[1].replace(/,/g, "")), unit: m[2].trim() } : null;
}

/**
 * เลือกกริด c × r (c*r = n) + แนววางชิ้นงาน ที่กินเนื้อที่แผ่นได้มากที่สุด
 * s = สเกล (1 = ขนาดจริง · น้อยกว่า 1 = ต้องย่อเพราะวางไม่ลง)
 */
function gridFor(n, sw, sh, pw, ph) {
  let best = null;
  for (let c = 1; c <= n; c++) {
    if (n % c) continue;
    const r = n / c;
    for (const [w, h] of [[pw, ph], [ph, pw]]) {
      const s = Math.min(1, sw / (c * w), sh / (r * h));
      const fill = (c * w * s) * (r * h * s) / (sw * sh);
      if (!best || fill > best.fill + 1e-9) best = { c, r, w: w * s, h: h * s, s, fill };
    }
  }
  return best;
}

/* ── ผืนภาพ ── */
const frame = (body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#38bdf8"/><stop offset="0.55" stop-color="#22d3ee"/><stop offset="1" stop-color="#a5b4fc"/>
    </linearGradient>${defs}
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;
const head = (title, sub) => `
  <text x="${W / 2}" y="112" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${esc(title)}</text>
  <text x="${W / 2}" y="156" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>`;
const foot = (t) => `<text x="${W / 2}" y="${H - 56}" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${esc(t)}</text>`;

/** กรอบแผ่น — กว้างคงที่ 648px สูงตามสัดส่วนแผ่นจริง จัดกลางกรอบวาด */
const BOX = { x: 126, y: 200, w: 648, h: 470 };
function sheetBox(sheet) {
  let w = BOX.w, h = (BOX.w * sheet.h) / sheet.w;
  if (h > BOX.h) { h = BOX.h; w = (BOX.h * sheet.w) / sheet.h; }
  return { x: (W - w) / 2, y: BOX.y + (BOX.h - h) / 2, w, h };
}
const sheetFrame = (b, inner, caption) => `
  <rect x="${(b.x + 7).toFixed(1)}" y="${(b.y + 11).toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" rx="10" fill="#0f172a" opacity="0.10"/>
  <rect x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" rx="10" fill="#ffffff" stroke="${EDGE}" stroke-width="3"/>
  ${inner}
  <text x="${W / 2}" y="${BOX.y + BOX.h + 42}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${esc(caption)}</text>`;
const pill = (text) => {
  const w = 420, x = (W - w) / 2, y = BOX.y + BOX.h + 66;
  return `<rect x="${x}" y="${y}" width="${w}" height="52" rx="26" fill="#ecfeff" stroke="#a5f3fc" stroke-width="2"/>
          <text x="${W / 2}" y="${y + 35}" font-family="${TH}" font-size="25" font-weight="700" text-anchor="middle" fill="#0e7490">${esc(text)}</text>`;
};

/* ── ภาพ 3 แบบ ── */
function artSize({ name, n, unit, sheet }) {
  const b = sheetBox(sheet);
  const px = b.w / sheet.w;                       // px ต่อ ซม.
  const piece = SIZES[name];
  const g = piece ? gridFor(n, sheet.w, sheet.h, piece[0], piece[1]) : null;
  let cells = "";
  if (g) {
    const cw = g.w * px, ch = g.h * px, gap = Math.min(6, cw / 6, ch / 6);
    const gx = b.x + (b.w - g.c * cw) / 2, gy = b.y + (b.h - g.r * ch) / 2;
    const rx = Math.min(7, cw / 5);
    for (let r = 0; r < g.r; r++) for (let c = 0; c < g.c; c++) {
      cells += `<rect x="${(gx + c * cw + gap / 2).toFixed(1)}" y="${(gy + r * ch + gap / 2).toFixed(1)}"
        width="${(cw - gap).toFixed(1)}" height="${(ch - gap).toFixed(1)}" rx="${rx.toFixed(1)}" fill="url(#sky)"/>`;
    }
    if (cw > 96 && ch > 62) {
      cells += `<text x="${(gx + cw / 2).toFixed(1)}" y="${(gy + ch / 2 + 12).toFixed(1)}" font-family="${TH}"
        font-size="${Math.min(44, Math.round(cw / 3))}" font-weight="800" text-anchor="middle"
        fill="#ffffff" opacity="0.9">${esc(name.replace("ครึ่ง ", "½").replace(" แนวตั้ง", ""))}</text>`;
    }
  } else {
    // ไม่รู้ขนาดจริงของชื่อนี้ — แบ่งแผ่นเท่า ๆ กันแทน (ยังได้จำนวนชิ้นตรง badge)
    const c = Math.ceil(Math.sqrt(n)), r = Math.ceil(n / c);
    const cw = b.w / c, ch = b.h / r;
    for (let i = 0; i < n; i++) {
      cells += `<rect x="${(b.x + (i % c) * cw + 4).toFixed(1)}" y="${(b.y + Math.floor(i / c) * ch + 4).toFixed(1)}"
        width="${(cw - 8).toFixed(1)}" height="${(ch - 8).toFixed(1)}" rx="6" fill="url(#sky)"/>`;
    }
  }
  const cm = cmTextOf(name);
  const note = NOTE[name] ?? "";
  return frame(`
    ${head(`ตัดขนาด ${name}`, [note, cm && `ชิ้นละ ${cm}`].filter(Boolean).join(" · "))}
    ${sheetFrame(b, cells, sheet.caption)}
    ${pill(`ได้ ${n.toLocaleString("th-TH")} ชิ้น / ${unit}`)}
    ${foot(`ราคาคิดต่อ${unit} — เลือกขนาดไหนก็เรทเดียวกัน`)}`);
}

function artCustom({ sheet }) {
  const b = sheetBox(sheet);
  const bw = Math.min(236, b.w * 0.36), bh = Math.min(320, b.h * 0.7);
  const bx = b.x + (b.w - bw) / 2, by = b.y + (b.h - bh) / 2;
  return frame(`
    ${head("กำหนดขนาดเอง", "กรอกความกว้าง × ความสูงเองด้านล่าง")}
    ${sheetFrame(b, `
      <rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="8"
            fill="#f0f9ff" stroke="#0891b2" stroke-width="3" stroke-dasharray="12 8"/>
      <text x="${(bx + bw / 2).toFixed(1)}" y="${(by + bh / 2 + 34).toFixed(1)}" font-family="${TH}" font-size="104"
            font-weight="800" text-anchor="middle" fill="#22d3ee">?</text>
      <line x1="${bx.toFixed(1)}" y1="${(by - 26).toFixed(1)}" x2="${(bx + bw).toFixed(1)}" y2="${(by - 26).toFixed(1)}"
            stroke="#e0566f" stroke-width="3" marker-start="url(#ar)" marker-end="url(#ar)"/>
      <text x="${(bx + bw / 2).toFixed(1)}" y="${(by - 38).toFixed(1)}" font-family="${TH}" font-size="23"
            font-weight="700" text-anchor="middle" fill="#e0566f">กว้าง ?</text>
      <line x1="${(bx + bw + 30).toFixed(1)}" y1="${by.toFixed(1)}" x2="${(bx + bw + 30).toFixed(1)}" y2="${(by + bh).toFixed(1)}"
            stroke="#e0566f" stroke-width="3" marker-start="url(#ar)" marker-end="url(#ar)"/>
      <text x="${(bx + bw + 48).toFixed(1)}" y="${(by + bh / 2 + 8).toFixed(1)}" font-family="${TH}" font-size="23"
            font-weight="700" text-anchor="start" fill="#e0566f">สูง ?</text>`, sheet.caption)}
    ${pill("ระบบคิดจำนวนชิ้น/แผ่นให้เอง")}
    ${foot("กรอกขนาดที่ต้องการ แล้วหน้าเว็บจะบอกจำนวนชิ้นที่ได้ต่อแผ่น")}`,
    `<marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="#e0566f"/></marker>`);
}

function artByFile({ sheet }) {
  const b = sheetBox(sheet);
  const P = [[0.04, 0.05, 0.29, 0.41], [0.36, 0.05, 0.22, 0.28], [0.61, 0.05, 0.35, 0.30],
             [0.04, 0.51, 0.19, 0.44], [0.26, 0.51, 0.32, 0.25], [0.26, 0.80, 0.32, 0.15],
             [0.36, 0.37, 0.22, 0.10], [0.61, 0.39, 0.16, 0.56], [0.80, 0.39, 0.16, 0.26],
             [0.80, 0.69, 0.16, 0.26]];
  const shapes = P.map(([x, y, w, h], i) =>
    `<rect x="${(b.x + x * b.w).toFixed(1)}" y="${(b.y + y * b.h).toFixed(1)}" width="${(w * b.w).toFixed(1)}"
           height="${(h * b.h).toFixed(1)}" rx="7" fill="url(#sky)" opacity="${0.55 + (i % 3) * 0.15}"
           stroke="#ffffff" stroke-width="3"/>`).join("");
  return frame(`
    ${head("ขนาดตามไฟล์", "ส่งไฟล์ลายตามขนาดจริงมาได้เลย ไม่ต้องวัด")}
    ${sheetFrame(b, shapes, sheet.caption)}
    ${pill("กราฟฟิกแจ้งจำนวนตอนส่งแบบ")}
    ${foot("กราฟฟิกจัดวางให้คุ้มแผ่นที่สุด แล้วแจ้งจำนวนชิ้นตอนส่งแบบให้ตรวจ")}`);
}

/* ════════════════ อ่านสินค้า → สรุปว่าต้องวาดกี่ใบ ════════════════ */
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: rows, error } = await sb.from("products").select("id,name,data");
if (error) throw error;

const arts = new Map();   // key → { key, svg, buf, url }
const plan = [];          // { id, name, group, binds:[{choice,key}] }
const warn = [];

for (const p of rows) {
  if (p.id.startsWith("__template")) continue;
  if (ONLY.length && !ONLY.includes(p.id)) continue;
  for (const g of (p.data?.options ?? []).filter((o) => GROUP_RE.test(o.label) && (o.choices ?? []).length > 1)) {
    // หน่วยหลักของกลุ่ม = หน่วยที่ตัวเลือกส่วนใหญ่ใช้ (เอาไว้ให้ "กำหนดขนาดเอง / ตามไฟล์" ยืมแผ่นไปวาด)
    const units = g.choices.map((c) => readBadge(c.badge)?.unit).filter(Boolean);
    if (!units.length) { warn.push(`${p.id} [${g.label}] ไม่มี badge บอกจำนวนชิ้น — ข้ามทั้งกลุ่ม`); continue; }
    const mainUnit = units.sort((a, b) =>
      units.filter((u) => u === b).length - units.filter((u) => u === a).length)[0];
    const mainSheet = sheetOf(mainUnit);
    if (!mainSheet) { warn.push(`${p.id} [${g.label}] ไม่รู้จักหน่วย "${mainUnit}" — ข้ามทั้งกลุ่ม`); continue; }

    const binds = [];
    for (const c of g.choices) {
      let key, svg;
      if (CUSTOM_RE.test(c.name)) { key = `custom-${mainSheet.slug}`; svg = () => artCustom({ sheet: mainSheet }); }
      else if (BYFILE_RE.test(c.name)) { key = `byfile-${mainSheet.slug}`; svg = () => artByFile({ sheet: mainSheet }); }
      else {
        const b = readBadge(c.badge);
        const n = b?.n ?? c.piecesPerUnit;
        const unit = b?.unit ?? mainUnit;
        const sheet = sheetOf(unit);
        if (!n || !sheet) { warn.push(`${p.id} [${g.label}] "${c.name}" อ่านจำนวน/หน่วยไม่ได้ — ไม่ใส่รูป`); continue; }
        if (c.piecesPerUnit != null && b && c.piecesPerUnit !== b.n)
          warn.push(`${p.id} [${g.label}] "${c.name}" piecesPerUnit=${c.piecesPerUnit} ไม่ตรง badge=${b.n} — ใช้เลขใน badge`);
        key = `${SLUG[c.name] ?? asciiSlug(c.name)}-${n}-${sheet.slug}`;
        svg = () => artSize({ name: c.name, n, unit, sheet });
      }
      if (!arts.has(key)) arts.set(key, { key, svg });
      binds.push({ choice: c.name, key });
    }
    if (binds.length) plan.push({ id: p.id, name: p.name, group: g.label, binds });
  }
}

if (!plan.length) { console.error("ไม่เจอกลุ่มขนาดตัดที่วาดได้"); process.exit(1); }

mkdirSync(OUT, { recursive: true });
for (const a of arts.values()) {
  a.buf = await sharp(Buffer.from(a.svg())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${a.key}-${VER}.jpg`, a.buf);
  await sharp(a.buf).resize(44, 44).toFile(`${OUT}/_thumb-${a.key}-${VER}.jpg`);
}
console.log(`🖼  วาด ${arts.size} ใบ (ใช้ร่วมกัน ${plan.reduce((s, t) => s + t.binds.length, 0)} ช่อง) → ${OUT}/`);
for (const t of plan) console.log(`   ${t.id} [${t.group}] ${t.binds.length} ตัวเลือก`);
if (warn.length) { console.log("\n⚠️  " + warn.join("\n⚠️  ")); }
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

/* ════════════════ อัปคลังกลาง + ผูก + อ่านกลับ ════════════════ */
for (const a of arts.values()) {
  const path = `products/shared/cut-size/${a.key}-${VER}.jpg`;
  const { error: upErr } = await sb.storage.from("product-images").upload(path, a.buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) { console.error("อัปโหลดพัง", path, upErr); process.exit(1); }
  a.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}
console.log(`⬆️  อัปคลังกลาง ${arts.size} ไฟล์ → products/shared/cut-size/`);

for (const t of plan) {
  const row = rows.find((r) => r.id === t.id);
  const d = row.data;
  const g = d.options.find((o) => o.label === t.group);
  for (const b of t.binds) {
    const c = g.choices.find((x) => x.name === b.choice);
    c.imageSrc = arts.get(b.key).url;
  }
  d.savedAt = new Date().toISOString(); // กันแคชรูปเก่า (?v=savedAt)
  const { data: upd, error: updErr } = await sb.from("products").update({ data: d }).eq("id", t.id).select("id");
  if (updErr || !upd?.length) { console.error(`${t.id}: update พัง/0 แถว`, updErr); process.exit(1); }

  const { data: back } = await sb.from("products").select("data").eq("id", t.id).single();
  const bg = back.data.options.find((o) => o.label === t.group);
  for (const b of t.binds) {
    const c = bg.choices.find((x) => x.name === b.choice);
    if (c?.imageSrc !== arts.get(b.key).url) { console.error(`❌ ${t.id} อ่านกลับไม่ตรง`, b.choice); process.exit(1); }
  }
  console.log(`✅ ${t.id} [${t.group}] — ${t.binds.length} ตัวเลือก`);
}

// เปิดไฟล์จริงเช็คครั้งเดียวต่อไฟล์ (ไม่ใช่ต่อสินค้า)
for (const a of arts.values()) {
  const res = await fetch(a.url, { method: "HEAD" });
  if (res.status !== 200) { console.error(`❌ เปิดไฟล์ไม่ได้ ${a.url} HTTP ${res.status}`); process.exit(1); }
}
console.log(`🔎 เปิดไฟล์คลังกลางได้ครบ ${arts.size} ไฟล์`);
