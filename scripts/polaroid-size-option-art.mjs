#!/usr/bin/env node
/**
 * POLAROID / โพลารอยด์ (new-mti1wu6o-1002) — ภาพประกอบตัวเลือกกลุ่ม "ขนาด"
 *
 *   node scripts/polaroid-size-option-art.mjs           (วาดลง .cache/polaroid/upload ดูก่อน)
 *   node scripts/polaroid-size-option-art.mjs --write   (+ อัปโหลด storage + ติดภาพให้การ์ด + อ่านกลับเทียบ)
 *
 * ผู้ใช้สั่ง 4 ก.ย. 69: กลุ่ม "ขนาด" เป็นการ์ดเปล่า ๆ ขอ "ภาพตัวอย่าง"
 * กลุ่มนี้มีตัวเลือกเดียว "10 × 8.5 ซม." badge "ได้ 12 ใบ / แผ่น A3" — ของจริงที่ต้องสื่อคือ
 * (1) ใบโพลารอยด์หน้าตายังไง (ขอบล่างหนากว่าอีก 3 ด้าน) (2) ทำไม 1 แผ่น A3 ได้ 12 ใบ
 *
 * ✅ ผังตัดวาดได้จริงสำหรับตัวนี้ — ต่างจากโปสการ์ด (postcard-th) ที่นับใบต่อ A3 ตามพื้นที่แล้ววางจริงไม่ครบ:
 *    ใบ 8.5 กว้าง × 10 สูง บน A3 (29.7 × 42 ซม.) → 3 คอลัมน์ = 25.5 ซม. · 4 แถว = 40 ซม. = 12 ใบพอดี
 *    เหลือขอบข้างละ ~2.1 ซม. บน-ล่างละ ~1 ซม. → ภาพผังตรงกับของจริง ไม่ขัดกับ [[iducky-4x6-cut-size]]
 *
 * สัดส่วนใบยกมาจากใบสเปค Print size ของร้าน (.cache/polaroid/src/layout.jpg):
 *   ทรงตั้ง 8.5 กว้าง × 10 สูง · ขอบบน-ข้าง ~5% ของด้านกว้าง · ขอบล่าง ~21% ของด้านสูง (ที่ว่างเขียนข้อความ)
 *
 * ⚠️ ภาพซ้าย (ใบจริง 30 px/ซม.) กับผังขวา (แผ่น A3 9 px/ซม.) คนละสเกล — เขียนกำกับไว้ในภาพแล้ว
 * ⚠️ การ์ดโชว์ภาพ 80×80 object-cover บนภาพจัตุรัส = เห็นเต็มใบไม่โดนครอป แต่เล็กมาก
 *    ป้ายขนาดตัวใหญ่จึงอยู่กลางภาพ และองค์ประกอบหลักมีแค่ 2 ก้อน (ใบ + ผัง) ให้ยังอ่านออกตอนย่อ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่ ([[iducky-image-cache-bust]])
 *
 * ราคา: กลุ่มนี้ไม่ใช่แกนตารางราคา (driverLabels = ชนิดกระดาษ / เคลือบ (เฉพาะด้านหน้า))
 *   สคริปต์เช็คซ้ำตอนอ่านกลับว่าชื่อกลุ่มไม่ไปชน driverLabels ([[iducky-price-driver-trap]])
 *
 * รันซ้ำได้: แก้กลุ่ม "ขนาด" ที่มีอยู่แบบ read-modify-write ไม่ย้ายลำดับ ไม่แตะฟิลด์อื่นของการ์ด
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const PRODUCT_ID = "new-mti1wu6o-1002";
const VER = "v1";
const GROUP = "ขนาด";
const CHOICE = "10 × 8.5 ซม.";
const FILE = `size-10x8.5-a3-12up-${VER}.jpg`;
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/polaroid/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const MASCOT = await mascotDataUri("peace", 420);

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2", LINE = "#cbd5e1";
const S1 = 30;   // ใบจริง: 1 ซม. = 30 px → 255 × 300
const S2 = 9;    // ผังแผ่น A3: 1 ซม. = 9 px → 267 × 378

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** ลูกศรวัดขนาด — เส้น + ขีดปลาย + ป้ายตัวเลขบนพื้นขาว (ทรงเดียวกับสคริปต์ขนาดตัวอื่น) */
const dim = (x1, y1, x2, y2, label) => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + 32;
  const tick = (x, y) => `<line x1="${x - (vertical ? 9 : 0)}" y1="${y - (vertical ? 0 : 9)}" x2="${x + (vertical ? 9 : 0)}" y2="${y + (vertical ? 0 : 9)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12.5 : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${esc(label)}</text>`;
};

const pill = (cx, y, text, tone = OK, bg = "#ecfeff") => {
  const w = text.length * 14.5 + 56;
  return `
    <rect x="${cx - w / 2}" y="${y - 23}" width="${w}" height="46" rx="23" fill="${bg}" stroke="${tone}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${tone}">${esc(text)}</text>`;
};

/**
 * ใบโพลารอยด์ 1 ใบ — กรอบขาว ขอบล่างหนา (ที่ว่างเขียนข้อความ) + ช่องภาพลูกค้า
 * big = ใบใหญ่ (ใส่มาสคอตแทนลายลูกค้า + ข้อความในขอบล่าง), เล็ก = ช่องในผัง A3
 */
const polaroid = (x, y, w, h, { big = false, fill = "url(#art)" } = {}) => {
  const pad = w * 0.058;
  const bottom = h * 0.21;
  const pw = w - pad * 2;
  const ph = h - pad - bottom;
  const r = MASCOT.ratio;
  const mh = ph * 0.74, mw = mh * r;
  return `
    <rect x="${x + (big ? 5 : 2)}" y="${y + (big ? 9 : 3)}" width="${w}" height="${h}" rx="${big ? 8 : 3}" fill="#0f172a" opacity="0.09"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${big ? 8 : 3}" fill="#ffffff" stroke="#e2e8f0" stroke-width="${big ? 2 : 1}"/>
    <rect x="${x + pad}" y="${y + pad}" width="${pw}" height="${ph}" fill="${fill}"/>
    ${big ? `<image href="${MASCOT.uri}" x="${x + pad + (pw - mw) / 2}" y="${y + pad + ph - mh - ph * 0.06}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>` : ""}
    ${big ? `<text x="${x + w / 2}" y="${y + h - bottom / 2 + 9}" font-family="${TH}" font-size="24" text-anchor="middle" fill="#94a3b8">เขียน/ตกแต่งได้เอง</text>` : ""}`;
};

/** ผังตัดแผ่น A3 — 3 คอลัมน์ × 4 แถว = 12 ใบ (วางได้จริง ไม่ได้นับตามพื้นที่) */
const sheet = (x, y) => {
  const sw = 29.7 * S2, sh = 42 * S2;
  const cw = 8.5 * S2, ch = 10 * S2;
  const mx = (sw - cw * 3) / 2, my = (sh - ch * 4) / 2;
  const cells = [];
  const hues = ["#a5d8f0", "#bfe3f4", "#ffd9a8", "#c9e7d4"];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++)
      cells.push(polaroid(x + mx + c * cw + 3, y + my + r * ch + 3, cw - 6, ch - 6, { fill: hues[(r + c) % hues.length] }));
  return `
    <rect x="${x + 6}" y="${y + 10}" width="${sw}" height="${sh}" rx="6" fill="#0f172a" opacity="0.07"/>
    <rect x="${x}" y="${y}" width="${sw}" height="${sh}" rx="6" fill="#f1f5f9" stroke="${LINE}" stroke-width="2.5"/>
    ${cells.join("")}
    <text x="${x + sw / 2}" y="${y + sh + 34}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">A3 · 29.7 × 42 ซม.</text>
    <text x="${x + sw / 2}" y="${y - 16}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">แผ่น A3 · ตัดได้ 12 ใบ</text>`;
};

const svg = () => {
  const bw = 8.5 * S1, bh = 10 * S1;      // 255 × 300
  const bx = 190, by = 208;
  const sx = 548, sy = 190;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="art" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#dff0fb"/><stop offset="0.55" stop-color="#a9d9f2"/><stop offset="1" stop-color="#7cc6ea"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>

  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">ขนาด 10 × 8.5 ซม.</text>
  <text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ทรงโพลารอยด์ ขอบล่างหนา — มีขนาดเดียว</text>

  <text x="${bx + bw / 2}" y="174" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">ใบจริง 1 ใบ</text>
  ${polaroid(bx, by, bw, bh, { big: true })}
  ${dim(bx, by + bh + 40, bx + bw, by + bh + 40, "8.5 ซม.")}
  ${dim(bx - 42, by, bx - 42, by + bh, "10 ซม.")}

  ${sheet(sx, sy)}

  <text x="${W / 2}" y="638" font-family="${TH}" font-size="19" text-anchor="middle" fill="#94a3b8">ภาพซ้ายเป็นใบจริง · ภาพขวาเป็นผังตัดย่อสเกล (คนละสเกลกัน)</text>

  <rect x="${(W - 372) / 2}" y="${684 - 36}" width="372" height="72" rx="36" fill="#ffffff" opacity="0.95" stroke="${OK}" stroke-width="3"/>
  <text x="${W / 2}" y="${684 + 17}" font-family="${TH}" font-size="50" font-weight="700" text-anchor="middle" fill="${INK}">${esc(CHOICE)}</text>

  ${pill(W / 2, 762, "1 แผ่น A3 ได้ 12 ใบ · คิดราคาเป็นแผ่น")}

  <text x="${W / 2}" y="828" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">วาง 3 คอลัมน์ × 4 แถวบนแผ่น A3 พอดี · ตัดสำเร็จให้เรียบร้อย</text>
  <text x="${W / 2}" y="860" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">วางลายให้เต็ม template เผื่อตัดตกด้านละ 0.25 มม. กันขอบขาว</text>
</svg>`;
};

const buf = await sharp(Buffer.from(svg())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/${FILE}`, buf);
await sharp(buf).resize(80, 80).toFile(`${OUT}/thumb-${FILE}`); // = ที่ลูกค้าเห็นบนการ์ดจริง (80×80)
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ${CHOICE}`);

if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + ติดภาพให้การ์ด ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const key = `products/${PRODUCT_ID}/${FILE}`;
const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", url);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
const dump = `${OUT}/../before-size-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

const groups = (data.options ?? []).filter((o) => o.label === GROUP);
if (groups.length !== 1) { console.error(`เจอกลุ่ม "${GROUP}" ${groups.length} กลุ่ม — หยุดก่อน`); process.exit(1); }
const g = groups[0];
if (g.choices?.length !== 1 || g.choices[0].name !== CHOICE) { console.error("การ์ดในกลุ่มขนาดไม่ตรงกับที่คาด", JSON.stringify(g.choices)); process.exit(1); }
g.display = "cards";
g.choices[0].imageSrc = url;
g.choices[0].desc ??= "ใบทรงตั้ง 8.5 กว้าง × 10 สูง ขอบล่างหนาไว้เขียนข้อความ · ราคานับเป็นแผ่น A3 — 1 แผ่นวางได้ 3 × 4 = 12 ใบพอดี";
data.savedAt = new Date().toISOString(); // ให้เว็บติด ?v= ใหม่ กันแคชรูปเก่า

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const gb = got.find((o) => o.label === GROUP);
const fails = [
  [got.length === (row.data.options ?? []).length, "จำนวนกลุ่มตัวเลือกเปลี่ยน (กลุ่มหาย/งอก)"],
  [got[0]?.label === GROUP, "กลุ่มขนาดไม่ได้อยู่ลำดับเดิม"],
  [gb?.display === "cards", "กลุ่มขนาดไม่ใช่การ์ด"],
  [gb?.choices?.length === 1 && gb.choices[0].name === CHOICE, "การ์ดขนาดไม่ตรง"],
  [gb?.choices?.[0]?.imageSrc === url, "ภาพการ์ดไม่ตรง"],
  [gb?.choices?.[0]?.piecesPerUnit === 12 && gb.choices[0].badge === "ได้ 12 ใบ / แผ่น A3", "ฟิลด์จำนวนใบ/ป้ายของการ์ดหาย"],
  [!gb?.choices?.[0]?.extra, "การ์ดขนาดเดียวต้องไม่บวกราคา"],
  [!(back.data.pricing?.driverLabels ?? []).includes(GROUP), "ชื่อกลุ่มไปชนแกนตารางราคา (driverLabels)"],
  [back.data.priceMin === row.data.priceMin && back.data.priceMax === row.data.priceMax, "ช่วงราคาสินค้าเปลี่ยนไป"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "${GROUP}" การ์ด ${CHOICE} + ภาพ อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);
