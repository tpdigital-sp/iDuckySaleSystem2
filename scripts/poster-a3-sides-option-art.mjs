#!/usr/bin/env node
/**
 * POSTER (poster-a3) — ภาพประกอบกลุ่ม "จำนวนด้านที่พิมพ์" (พิมพ์ 1 ด้าน / 2 ด้าน) + แสดงเป็นการ์ด
 *
 *   node scripts/poster-a3-sides-option-art.mjs           (วาดลง .cache/poster-a3/upload ดูก่อน)
 *   node scripts/poster-a3-sides-option-art.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ดีไซน์: วางแผ่นเดียวกันสองมุม "ด้านหน้า | ด้านหลัง" มีลูกศรพลิกคั่นกลาง
 *   1 ด้าน → ด้านหลังเป็นกระดาษเปล่า (ขาว)   ·   2 ด้าน → ด้านหลังมีลายอีกชุด (คนละไฟล์)
 *   จุดต่างที่อ่านออกตั้งแต่ปุ่มเล็ก = "แผ่นขวาขาว vs แผ่นขวามีสี" + ป้ายเลข 1/2 ตรงกลาง
 *   (ภาพเป็นจัตุรัส 900×900 เท่ากับช่อง object-cover ของปุ่ม จึงเห็นเต็มใบ ไม่ถูกครอป)
 *
 * ⚠️ ไม่ใส่ตัวเลขค่าพิมพ์ลงในภาพ — ค่าบริการ 2 ด้านอยู่ใน choice.extra ของ DB
 *    (หน้าเว็บโชว์ป้าย "+฿10" ให้เอง) ภาพจะได้ไม่ค้างราคาเก่าตอนร้านปรับราคา
 * ⚠️ ชื่อตัวเลือกถูกอ้างในกฎ (rules: 130/400 แกรม และ PET สีใส ล็อกให้พิมพ์ได้ 1 ด้าน) — ห้ามแก้ชื่อ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 460);

const PRODUCT_ID = "poster-a3";
const GROUP = "จำนวนด้านที่พิมพ์";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/poster-a3/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";

/** แผ่น A3 ย่อ — อัตราส่วนจริง 29.7 : 42 */
const SW = 206;
const SH = Math.round((SW * 42) / 29.7); // 291
const CY = 492;
const LX = 176;          // แผ่นซ้าย (ด้านหน้า)
const RX = W - LX - SW;  // แผ่นขวา (ด้านหลัง) — สมมาตรกับซ้าย
const SY = CY - SH / 2;

const PICKS = [
  {
    name: "พิมพ์ 1 ด้าน",
    file: `sides-1-${VER}.jpg`,
    n: "1",
    back: false,
    title: "พิมพ์ 1 ด้าน",
    sub: "พิมพ์ลายเฉพาะด้านหน้า · ด้านหลังเป็นกระดาษเปล่า",
    foot: "ส่งไฟล์ลายมา 1 ไฟล์",
    desc: "พิมพ์ลายด้านหน้าอย่างเดียว ด้านหลังเป็นกระดาษเปล่า · ส่งไฟล์ลายมา 1 ไฟล์",
  },
  {
    name: "พิมพ์ 2 ด้าน",
    file: `sides-2-${VER}.jpg`,
    n: "2",
    back: true,
    title: "พิมพ์ 2 ด้าน",
    sub: "พิมพ์ลายทั้งด้านหน้าและด้านหลัง พลิกอีกด้านก็เป็นลาย",
    foot: "ส่งไฟล์ลายมา 2 ไฟล์ (หน้า + หลัง)",
    desc: "พิมพ์ลายทั้งสองด้าน พลิกอีกด้านก็เป็นลาย · ส่งไฟล์ลายมา 2 ไฟล์ (หน้า + หลัง)",
  },
];

const line = (x, y, len, op = 0.75, th = 6) =>
  `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${len.toFixed(1)}" height="${th}" rx="${th / 2}" fill="#ffffff" opacity="${op}"/>`;

/** ลายด้านหน้า — มาสคอตบน หัวเรื่อง+บรรทัดข้อความล่าง (ชุดเดียวกับภาพแนวกระดาษ) */
const frontArt = (x, y) => {
  const mh = SH * 0.46;
  const mw = mh * MASCOT.ratio;
  const cx = x + SW / 2;
  return `
    <circle cx="${cx}" cy="${y + SH * 0.34}" r="${SW * 0.38}" fill="#ffffff" opacity="0.35"/>
    <image href="${MASCOT.uri}" x="${cx - mw / 2}" y="${y + SH * 0.1}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
    <rect x="${x + SW * 0.14}" y="${y + SH * 0.63}" width="${SW * 0.72}" height="${SH * 0.075}" rx="${SH * 0.02}" fill="#ffffff" opacity="0.9"/>
    ${line(x + SW * 0.2, y + SH * 0.755, SW * 0.6)}
    ${line(x + SW * 0.26, y + SH * 0.815, SW * 0.48, 0.6)}
    ${line(x + SW * 0.32, y + SH * 0.875, SW * 0.36, 0.45)}`;
};

/** ลายด้านหลัง — คนละไฟล์กับด้านหน้า วาดเป็นผังข้อความ/รายละเอียด ให้เห็นว่าไม่ใช่ลายเดิม */
const backArt = (x, y) => `
  <rect x="${x + SW * 0.12}" y="${y + SH * 0.11}" width="${SW * 0.76}" height="${SH * 0.062}" rx="${SH * 0.016}" fill="#ffffff" opacity="0.9"/>
  ${line(x + SW * 0.12, y + SH * 0.24, SW * 0.76, 0.7)}
  ${line(x + SW * 0.12, y + SH * 0.3, SW * 0.62, 0.55)}
  ${line(x + SW * 0.12, y + SH * 0.36, SW * 0.7, 0.55)}
  <rect x="${x + SW * 0.12}" y="${y + SH * 0.45}" width="${SW * 0.34}" height="${SH * 0.2}" rx="${SH * 0.02}" fill="#ffffff" opacity="0.42"/>
  <rect x="${x + SW * 0.54}" y="${y + SH * 0.45}" width="${SW * 0.34}" height="${SH * 0.2}" rx="${SH * 0.02}" fill="#ffffff" opacity="0.42"/>
  ${line(x + SW * 0.12, y + SH * 0.72, SW * 0.76, 0.7)}
  ${line(x + SW * 0.12, y + SH * 0.78, SW * 0.5, 0.55)}
  ${line(x + SW * 0.12, y + SH * 0.84, SW * 0.66, 0.45)}`;

/** แผ่นกระดาษหนึ่งใบ — มีลาย (grad) หรือเปล่า (ขาว) */
const sheet = (x, printed, grad, art) => `
  <rect x="${x + 6}" y="${SY + 10}" width="${SW}" height="${SH}" rx="4" fill="#0f172a" opacity="0.12"/>
  <rect x="${x}" y="${SY}" width="${SW}" height="${SH}" rx="4" fill="${printed ? `url(#${grad})` : "#ffffff"}" stroke="${printed ? "#94a3b8" : "#cbd5e1"}" stroke-width="2"/>
  ${printed ? `<g clip-path="url(#clip-${grad})">${art}</g>` : `<text x="${x + SW / 2}" y="${SY + SH / 2 + 10}" font-family="${TH}" font-size="27" text-anchor="middle" fill="#cbd5e1">กระดาษเปล่า</text>`}`;

function art(p) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="front" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#38bdf8"/><stop offset="0.55" stop-color="#22d3ee"/><stop offset="1" stop-color="#a5b4fc"/>
    </linearGradient>
    <linearGradient id="back" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a78bfa"/><stop offset="0.55" stop-color="#c084fc"/><stop offset="1" stop-color="#f0abfc"/>
    </linearGradient>
    <clipPath id="clip-front"><rect x="${LX}" y="${SY}" width="${SW}" height="${SH}" rx="4"/></clipPath>
    <clipPath id="clip-back"><rect x="${RX}" y="${SY}" width="${SW}" height="${SH}" rx="4"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="176" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${p.title}</text>
  <text x="${W / 2}" y="218" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${p.sub}</text>

  ${sheet(LX, true, "front", frontArt(LX, SY))}
  ${sheet(RX, p.back, "back", backArt(RX, SY))}

  <!-- ลูกศรพลิกแผ่น + ป้ายจำนวนด้าน -->
  <path d="M ${LX + SW + 26} ${CY - 34} q 44 -30 88 0" fill="none" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>
  <path d="M ${LX + SW + 108} ${CY - 44} l 8 12 -14 4 z" fill="#94a3b8"/>
  <circle cx="${W / 2}" cy="${CY + 24}" r="54" fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>
  <text x="${W / 2}" y="${CY + 30}" font-family="${TH}" font-size="52" font-weight="700" text-anchor="middle" fill="${INK}">${p.n}</text>
  <text x="${W / 2}" y="${CY + 60}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${SUB}">ด้าน</text>
  <text x="${W / 2}" y="${CY - 52}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">พลิกแผ่น</text>

  <text x="${LX + SW / 2}" y="${SY + SH + 46}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">ด้านหน้า</text>
  <text x="${RX + SW / 2}" y="${SY + SH + 46}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${p.back ? INK : "#94a3b8"}">ด้านหลัง</text>

  <text x="${W / 2}" y="${H - 92}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">${p.foot}</text>
  <text x="${W / 2}" y="${H - 56}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">กระดาษ A3 แผ่นเดียวกัน · เลือกได้ว่าจะพิมพ์กี่ด้าน</text>
</svg>`;
}

const built = [];
for (const p of PICKS) {
  const buf = await sharp(Buffer.from(art(p))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${p.file}`, buf);
  await sharp(buf).resize(62, 62).toFile(`${OUT}/_thumb-${p.file}`);
  built.push({ ...p, buf });
  console.log(`🖼  ${OUT}/${p.file}  ${Math.round(buf.length / 1024)} KB — ${p.title} (+ _thumb ขนาดปุ่มจริง 62px)`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const p of built) {
  const key = `products/${PRODUCT_ID}/${p.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, p.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  p.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", p.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];
const group = options.find((o) => o.label === GROUP);
if (!group) { console.error(`ไม่เจอกลุ่ม "${GROUP}"`); process.exit(1); }
const before = options.length;

group.display = "cards";
group.choices = group.choices.map((c) => {
  const p = built.find((b) => b.name === c.name);
  if (!p) { console.error("เจอตัวเลือกที่ไม่มีในสคริปต์ (ชื่ออาจถูกแก้):", c.name); process.exit(1); }
  return { ...c, imageSrc: p.url, desc: p.desc }; // คง extra/ฟิลด์อื่นไว้ครบ
});
if (group.choices.length !== built.length) { console.error("จำนวนตัวเลือกไม่ตรงกับภาพที่วาด", group.choices.map((c) => c.name)); process.exit(1); }

data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === GROUP);
if (g?.display !== "cards") { console.error("อ่านกลับ display ไม่เป็น cards", g?.display); process.exit(1); }
for (const p of built) {
  const c = g.choices.find((x) => x.name === p.name);
  if (c?.imageSrc !== p.url || c?.desc !== p.desc) { console.error("อ่านกลับตัวเลือกไม่ตรง!", p.name, c); process.exit(1); }
}
/* กันเผลอ: ค่าบริการ 2 ด้าน และกฎที่อ้างชื่อตัวเลือกต้องอยู่ครบเหมือนเดิม */
const two = g.choices.find((c) => c.name === "พิมพ์ 2 ด้าน");
if (!(two?.extra > 0)) { console.error("ค่าบริการพิมพ์ 2 ด้านหาย!", two); process.exit(1); }
const rulesOnSides = (back.data.rules ?? []).filter((r) => r.limit?.label === GROUP).length;
if (!rulesOnSides) { console.error("กฎล็อกจำนวนด้านหาย!"); process.exit(1); }
if (back.data.options.length !== before) { console.error("จำนวนกลุ่มตัวเลือกเปลี่ยน!", back.data.options.length, before); process.exit(1); }
console.log(`✓ กลุ่ม "${GROUP}" เป็นการ์ด + ภาพ ${built.length} ใบ · 2 ด้าน +฿${two.extra} · กฎล็อก ${rulesOnSides} ข้อ · savedAt =`, back.data.savedAt);
