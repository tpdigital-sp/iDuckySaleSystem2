#!/usr/bin/env node
/**
 * CARD HOLDER (พลาสติกใส) — cardholder-clear
 * กลุ่ม "สกรีนกี่ด้าน": เปลี่ยนชื่อตัวเลือก + ภาพประกอบ 2 ใบ
 *
 *   node scripts/cardholder-clear-screen-option.mjs           (วาดภาพลง .cache/cardholder-clear/upload ดูก่อน)
 *   node scripts/cardholder-clear-screen-option.mjs --write   (+ อัปโหลด storage + ย้ายคีย์ราคา + เขียน DB + อ่านกลับ)
 *
 * ── สิ่งที่แก้ ─────────────────────────────────────────────────────
 * ชื่อเดิมอ่านแล้วซ้ำซ้อน ("สกรีน: ราคาสกรีน 1 ด้าน") เจ้าของร้านสั่งให้เขียนว่า "สกรีน 1/2 ด้าน"
 *   กลุ่ม   "สกรีน"           → "สกรีนกี่ด้าน"   (ชื่อเดียวกับ frame-card สินค้าพี่น้อง)
 *   ตัวเลือก "ราคาสกรีน 1 ด้าน" → "สกรีน 1 ด้าน"
 *           "ราคาสกรีน 2 ด้าน" → "สกรีน 2 ด้าน"
 *
 * ⚠️ **กลุ่มนี้เป็นแกนตารางราคา** (`pricing.driverLabels = ["สกรีน"]`) — เปลี่ยนชื่อเฉย ๆ ไม่ได้
 *    ต้องย้าย "คีย์ของ pricing.cells" ตามไปด้วย ทั้งใน `data.pricing` และทุกใบใน `data.priceRates[].pricing`
 *    ไม่งั้นราคาหลุดหมด (หาเซลล์ไม่เจอ) ดู [[iducky-price-driver-trap]] · [[iducky-doll-die-cut]]
 *    สคริปต์นี้ย้ายให้ครบทุกที่ + อ่านกลับมาเทียบ "ตัวเลขราคาต้องเท่าเดิมเป๊ะ" ก่อนจบ
 *
 * ── ภาพ 2 ใบ (900×900) ────────────────────────────────────────────
 * วางการ์ดหน้า-หลังคู่กัน + วงเลข 1/2 กลางภาพ (ทรงเดียวกับ frame-card ทั้งร้านใช้แบบนี้)
 *   ด้านหน้า = กรอบสกรีน + ตรงกลางเว้นใสให้เห็นบัตรที่สอดข้างใน
 *   ด้านหลัง = 1 ด้าน → พลาสติกใสไม่มีหมึก (เห็นลายหน้าจาง ๆ กลับด้าน) · 2 ด้าน → พิมพ์เต็มหน้า อีกลายก็ได้
 * อ้างใบ HOW TO ของร้าน (`30_อุปกรณ์มือถือ/Card-Holder/CARD Ho.png`): ด้านหน้า "ตรงกลางจะใส" ·
 * ด้านหลังเป็นพื้นเต็มใบ · ขนาด 6.5 × 10.5 ซม. จากเทมเพลตไดคัท (ดู scripts/cardholder-clear-size-option.mjs)
 *
 * ⚠️ ปุ่ม/การ์ดตัวเลือกครอปกลางภาพ (900×900 เห็นแค่ 300–600) — วงเลข 1/2 จึงอยู่กลางภาพ ([[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 * รันซ้ำได้: ถ้าเปลี่ยนชื่อไปแล้วจะข้ามขั้นย้ายคีย์ แล้วเขียนแค่ภาพ/desc ทับ
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const PRODUCT_ID = "cardholder-clear";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const OLD_GROUP = "สกรีน";
const GROUP = "สกรีนกี่ด้าน";
const RENAME = { "ราคาสกรีน 1 ด้าน": "สกรีน 1 ด้าน", "ราคาสกรีน 2 ด้าน": "สกรีน 2 ด้าน" };
const DESC = {
  "สกรีน 1 ด้าน": "พิมพ์ลายด้านหน้า ด้านหลังเป็นพลาสติกใสไม่มีหมึก",
  "สกรีน 2 ด้าน": "พิมพ์ทั้งหน้า-หลัง ด้านหลังพิมพ์เต็มใบ คนละลายกับด้านหน้าก็ได้",
};

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";

const frame = (title, subtitle, body, note1 = "", note2 = "", defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}</defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">${title}</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${subtitle}</text>
  ${body}
  ${note1 ? `<text x="${W / 2}" y="${H - 72}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note1}</text>` : ""}
  ${note2 ? `<text x="${W / 2}" y="${H - 40}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${note2}</text>` : ""}
</svg>`;

const tag = (cx, y, text, on = false) => {
  const w = text.length * 12.5 + 40;
  return `
  <rect x="${cx - w / 2}" y="${y}" width="${w}" height="38" rx="19" fill="${on ? "#ecfeff" : "#f1f5f9"}" stroke="${on ? OK : "#cbd5e1"}" stroke-width="2"/>
  <text x="${cx}" y="${y + 26}" font-family="${TH}" font-size="21" font-weight="600" text-anchor="middle" fill="${on ? OK : SUB}">${text}</text>`;
};

// ── ลายสกรีนเล็ก ๆ (ชุดเดียวกับภาพกลุ่ม "ขนาด") ──────────────────────
const star = (cx, cy, r, fill, op = 1) => {
  const p = Array.from({ length: 10 }, (_, i) => {
    const a = (-90 + i * 36) * Math.PI / 180, rr = i % 2 ? r * 0.45 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return `<polygon points="${p}" fill="${fill}" opacity="${op}"/>`;
};
const heart = (cx, cy, s, fill, op = 1) => `<path d="M ${cx} ${cy + s * 0.75}
  C ${cx - s * 1.2} ${cy - s * 0.1} ${cx - s * 0.5} ${cy - s * 0.95} ${cx} ${cy - s * 0.25}
  C ${cx + s * 0.5} ${cy - s * 0.95} ${cx + s * 1.2} ${cy - s * 0.1} ${cx} ${cy + s * 0.75} Z"
  fill="${fill}" opacity="${op}"/>`;

/** ตำแหน่งลาย (u,v ∈ 0..1 ของตัวการ์ด) — band = เฉพาะขอบ (ด้านหน้า) · full = ทั่วใบ (ด้านหลังที่พิมพ์) */
const BAND = [
  ["s", 0.09, 0.075, 1], ["h", 0.3, 0.055, 0.85], ["d", 0.5, 0.085, 0.5], ["s", 0.71, 0.058, 0.9], ["h", 0.91, 0.08, 0.8],
  ["h", 0.085, 0.2], ["s", 0.09, 0.33, 0.95], ["d", 0.085, 0.44, 0.45], ["h", 0.09, 0.56, 0.85], ["s", 0.085, 0.69], ["d", 0.09, 0.8, 0.5],
  ["s", 0.915, 0.19], ["h", 0.91, 0.31, 0.85], ["d", 0.915, 0.43, 0.45], ["s", 0.912, 0.55, 0.95], ["h", 0.915, 0.68], ["d", 0.91, 0.79, 0.5],
  ["h", 0.14, 0.945, 0.85], ["s", 0.36, 0.955], ["d", 0.56, 0.95, 0.5], ["h", 0.78, 0.952, 0.9], ["s", 0.92, 0.93, 0.85],
];
const FULL = [
  ...BAND,
  ["s", 0.28, 0.22, 1], ["h", 0.62, 0.19, 0.9], ["d", 0.45, 0.33, 0.5], ["h", 0.24, 0.42, 0.85],
  ["s", 0.68, 0.4, 0.95], ["d", 0.4, 0.52, 0.45], ["h", 0.7, 0.6, 0.9], ["s", 0.26, 0.63, 1],
  ["d", 0.55, 0.72, 0.5], ["h", 0.35, 0.78, 0.85], ["s", 0.66, 0.83, 0.95],
];

function motifs(x, y, w, h, palette, list) {
  const base = w * 0.075;
  return list.map(([k, u, v, m = 1], i) => {
    const cx = x + u * w, cy = y + v * h, s = base * m;
    const c = palette[i % palette.length];
    return k === "s" ? star(cx, cy, s, c, 0.92) : k === "h" ? heart(cx, cy, s * 0.85, c, 0.9)
      : `<circle cx="${cx}" cy="${cy}" r="${s * 0.55}" fill="${c}" opacity="0.85"/>`;
  }).join("");
}

const PINK = { grad: "pinkPrint", dots: ["#ffffff", "#ffe08a", "#ff9fc4", "#8ad2ef"] };
const BLUE = { grad: "bluePrint", dots: ["#ffffff", "#a7e3f7", "#ffd98a", "#ffa9c9"] };

/**
 * ตัวการ์ด 1 ใบ (สัดส่วนจริง 6.5 × 10.5 ซม.)
 *   window = ด้านหน้า (เว้นใสตรงกลางให้เห็นบัตร) · false = ด้านหลังพิมพ์เต็มใบ
 *   faint  = ด้านหลังของ "1 ด้าน" — ไม่มีหมึก มองทะลุเห็นลายด้านหน้ากลับด้าน
 */
function holder(id, x, y, w, h, { theme = PINK, window: win = true, faint = false } = {}) {
  const r = w * 0.023;                       // มุมโค้ง 1.5 มม.
  const wl = x + 0.18 * w, wt = y + 0.15 * h, ww = w * 0.64, wh = h * 0.79;
  const slotW = w * 0.229, slotH = h * 0.042, slotY = y + h * 0.041;
  const art = `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${theme.grad})"/>
    ${motifs(x, y, w, h, theme.dots, win ? BAND : FULL)}
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="#ffffff" stroke-width="${w * 0.038}" opacity="0.32"/>`;
  return `<g>
    <rect x="${x + 4}" y="${y + 8}" width="${w}" height="${h}" rx="${r}" fill="#0f172a" opacity="0.07"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#clearPlastic)"/>
    <g clip-path="url(#clip-${id})" opacity="${faint ? 0.22 : 1}"
       ${faint ? `transform="translate(${(2 * x + w).toFixed(1)} 0) scale(-1 1)"` : ""}>${art}</g>
    ${win ? `<rect x="${wl}" y="${wt}" width="${ww}" height="${wh}" rx="${r * 3}" fill="#ffffff" opacity="${faint ? 0.5 : 0.94}" stroke="#cbd5e1" stroke-width="1.6"/>
      ${faint ? "" : `<g opacity="0.5">${Array.from({ length: 4 }, (_, i) =>
        `<rect x="${wl + ww * 0.12}" y="${wt + wh * (0.5 + i * 0.11)}" width="${ww * 0.76}" height="4" rx="2" fill="#cbd5e1"/>`).join("")}
        <rect x="${wl + ww * 0.24}" y="${wt + wh * 0.12}" width="${ww * 0.52}" height="${wh * 0.3}" rx="6" fill="#eff6ff" stroke="#dbeafe" stroke-width="1.5"/></g>`}` : ""}
    <rect x="${x + w / 2 - slotW / 2}" y="${slotY}" width="${slotW}" height="${slotH}" rx="${slotH / 2}" fill="#eef2f6" stroke="#8fbccb" stroke-width="1.6"/>
    <path d="M ${x + w * 0.14} ${y + h} L ${x + w * 0.56} ${y} L ${x + w * 0.72} ${y} L ${x + w * 0.3} ${y + h} Z" fill="#ffffff" opacity="0.16" clip-path="url(#clip-${id})"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="#8fbccb" stroke-width="2.5"/>
    <clipPath id="clip-${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath>
  </g>`;
}

const DEFS = `
  <linearGradient id="clearPlastic" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="#f4fbff"/><stop offset="0.55" stop-color="#eaf6fc"/><stop offset="1" stop-color="#dcedf6"/>
  </linearGradient>
  <linearGradient id="pinkPrint" x1="0" y1="0" x2="0.85" y2="1">
    <stop offset="0" stop-color="#ffc3dc"/><stop offset="0.45" stop-color="#bfe3fb"/><stop offset="1" stop-color="#77cfe8"/>
  </linearGradient>
  <linearGradient id="bluePrint" x1="0" y1="0" x2="0.85" y2="1">
    <stop offset="0" stop-color="#9fd8f7"/><stop offset="0.5" stop-color="#c8e8fb"/><stop offset="1" stop-color="#ffc9de"/>
  </linearGradient>`;

// ── ภาพกลุ่ม "สกรีนกี่ด้าน" ───────────────────────────────────────────
const CH = 400;                     // สูงตัวการ์ดในภาพ
const CW = (CH * 6.5) / 10.5;       // กว้างตามสัดส่วนจริง
const CY = 452, LX = 224, RX = 676;

function screenArt(sides) {
  const one = sides === 1;
  const top = CY - CH / 2;
  const body = `
  ${holder("f", LX - CW / 2, top, CW, CH, { theme: PINK, window: true })}
  ${holder("b", RX - CW / 2, top, CW, CH, one ? { theme: PINK, window: true, faint: true } : { theme: BLUE, window: false })}
  ${one ? `<text x="${RX}" y="${CY + 8}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="#9fb0bf">ไม่พิมพ์</text>` : ""}
  ${tag(LX, 684, "ด้านหน้า — พิมพ์ลาย", true)}
  ${tag(RX, 684, one ? "ด้านหลัง — ใส ไม่มีลาย" : "ด้านหลัง — พิมพ์ลาย", !one)}
  <g>
    <circle cx="${W / 2}" cy="${CY - 14}" r="84" fill="#ffffff" stroke="${OK}" stroke-width="4"/>
    <text x="${W / 2}" y="${CY + 6}" font-family="${TH}" font-size="88" font-weight="800" text-anchor="middle" fill="${OK}">${sides}</text>
    <text x="${W / 2}" y="${CY + 48}" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="${SUB}">ด้าน</text>
  </g>`;
  return one
    ? frame("สกรีน 1 ด้าน", "พิมพ์ลายด้านหน้าด้านเดียว", body,
      "ด้านหลังเป็นพลาสติกใสไม่มีหมึก — มองทะลุเห็นลายด้านหน้ากลับด้าน",
      "ตรงกลางด้านหน้าเว้นใสไว้ให้เห็นบัตรที่สอดข้างใน", DEFS)
    : frame("สกรีน 2 ด้าน", "พิมพ์ลายทั้งสองด้าน", body,
      "ด้านหลังพิมพ์เต็มใบ จะเป็นคนละลายกับด้านหน้าก็ได้",
      "สกรีนเต็มใบล้นถึงขอบ — ส่วนขอบจะฟุ้งขาวเล็กน้อย", DEFS);
}

// ── เรนเดอร์ ────────────────────────────────────────────────────────
const files = {};
for (const sides of [1, 2]) {
  const name = `สกรีน ${sides} ด้าน`;
  const buf = await sharp(Buffer.from(screenArt(sides))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const file = `screen-${sides}-side-${VER}.jpg`;
  writeFileSync(`${OUT}/${file}`, buf);
  await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/_thumb-${sides}.jpg`);
  files[name] = { file, buf };
  console.log(`🖼  ${OUT}/${file}  ${Math.round(buf.length / 1024)} KB — ${name}`);
}
console.log(`🔍 ${OUT}/_thumb-1.jpg, _thumb-2.jpg — กรอบที่ปุ่มตัวเลือกจะเห็นจริง`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด + เปลี่ยนชื่อ + ย้ายคีย์ราคา ─────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const url = {};
for (const [name, { file, buf }] of Object.entries(files)) {
  const key = `products/${PRODUCT_ID}/${file}`;
  const { error } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  url[name] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", url[name]);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

/** ราคาก่อนแก้ (คีย์ใหม่ → แถวตัวเลข) ไว้เทียบตอนอ่านกลับ ว่าราคาไม่หลุด */
const before = {};
for (const [oldName, newName] of Object.entries(RENAME)) {
  before[newName] = data.pricing?.cells?.[oldName] ?? data.pricing?.cells?.[newName];
}

/** ย้ายคีย์ cells ของตารางราคา 1 ใบ (คงลำดับคีย์เดิม) + เปลี่ยนชื่อแกน */
const migratePricing = (p) => {
  if (!p) return;
  if (p.cells) {
    p.cells = Object.fromEntries(Object.entries(p.cells).map(([k, v]) => [RENAME[k] ?? k, v]));
  }
  if (Array.isArray(p.driverLabels)) {
    p.driverLabels = p.driverLabels.map((l) => (l === OLD_GROUP ? GROUP : l));
  }
};
migratePricing(data.pricing);
for (const r of data.priceRates ?? []) migratePricing(r.pricing);
for (const r of data.extraRates ?? []) migratePricing(r);

// กลุ่มตัวเลือก: เปลี่ยนชื่อกลุ่ม + ชื่อตัวเลือก + ใส่ภาพ/desc
const group = (data.options ?? []).find((o) => o.label === OLD_GROUP || o.label === GROUP);
if (!group) { console.error(`หากลุ่ม "${OLD_GROUP}" ไม่เจอ`); process.exit(1); }
group.label = GROUP;
group.display = "cards";
group.choices = group.choices.map((c) => {
  const name = RENAME[c.name] ?? c.name;
  return { ...c, name, desc: DESC[name] ?? c.desc, imageSrc: url[name] ?? c.imageSrc };
});

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// ── อ่านกลับมาเทียบ — ชื่อ/ภาพ/แกนราคา/ตัวเลขราคา ต้องตรงหมด ──────────
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === GROUP);
if (!g) { console.error("อ่านกลับไม่เจอกลุ่ม", GROUP); process.exit(1); }
for (const name of Object.values(RENAME)) {
  const c = g.choices.find((x) => x.name === name);
  if (!c || c.imageSrc !== url[name] || c.desc !== DESC[name]) { console.error("ตัวเลือกไม่ตรง!", name, JSON.stringify(c)); process.exit(1); }
}
if (back.data.pricing.driverLabels.join() !== GROUP) { console.error("แกนราคาไม่ตรง!", back.data.pricing.driverLabels); process.exit(1); }
for (const [name, cellsBefore] of Object.entries(before)) {
  const now = back.data.pricing.cells[name];
  if (!now || JSON.stringify(now) !== JSON.stringify(cellsBefore)) { console.error("ราคาเพี้ยน!", name, cellsBefore, "→", now); process.exit(1); }
  for (const r of back.data.priceRates ?? []) {
    if (JSON.stringify(r.pricing?.cells?.[name]) !== JSON.stringify(cellsBefore)) { console.error("ราคาในเรทเพี้ยน!", r.id, name); process.exit(1); }
  }
}
const leftover = JSON.stringify(back.data).includes("ราคาสกรีน");
console.log(`✓ กลุ่ม "${GROUP}" · ${g.choices.map((c) => c.name).join(" / ")} · ภาพ+desc ครบ`);
console.log(`✓ แกนราคา = [${back.data.pricing.driverLabels}] · ตัวเลขราคาทุกแถว/ทุกเรทเท่าเดิมเป๊ะ · ชื่อเก่าค้างอยู่ไหม: ${leftover ? "⚠️ ยังมี" : "ไม่มีแล้ว"}`);
console.log("savedAt =", back.data.savedAt);
