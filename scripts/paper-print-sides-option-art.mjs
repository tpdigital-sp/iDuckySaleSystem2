#!/usr/bin/env node
/**
 * ภาพประกอบกลุ่ม "จำนวนด้านที่พิมพ์" (พิมพ์ 1 ด้าน / 2 ด้าน) + แสดงเป็นการ์ด
 * ใช้กับ 2 สินค้าที่โครงตัวเลือกเหมือนกัน:
 *   · postcard-th    POSTCARD / โปสการ์ด        → ใบโปสการ์ดแนวนอน 6 × 4 นิ้ว
 *   · paper-art-pet  กระดาษอาร์ตมัน | PET       → แผ่นกระดาษแนวตั้ง (สัดส่วน A)
 *
 *   node scripts/paper-print-sides-option-art.mjs                 (วาดลง .cache/print-sides/ ดูก่อน)
 *   node scripts/paper-print-sides-option-art.mjs --write         (+ อัปโหลด + เขียน DB + อ่านกลับเทียบ)
 *   node scripts/paper-print-sides-option-art.mjs --only=postcard-th
 *
 * ดีไซน์เดียวกับ POSTER A3 (scripts/poster-a3-sides-option-art.mjs):
 *   แผ่นเดียวกันสองมุม "ด้านหน้า | ด้านหลัง" มีลูกศรพลิก + ป้ายเลข 1/2 คั่นกลาง
 *   1 ด้าน → แผ่นขวาเป็นกระดาษเปล่า · 2 ด้าน → แผ่นขวามีลายอีกชุด (คนละไฟล์)
 *   จุดต่างอยู่กลางภาพ (เลข 1/2 + แผ่นขวาขาว vs มีสี) จึงอ่านออกตั้งแต่ปุ่มครอป 62px
 *
 * ⚠️ ไม่ใส่ตัวเลขค่าพิมพ์ลงในภาพ — ค่าบริการ 2 ด้านอยู่ใน choice.extra (หน้าเว็บโชว์ป้าย +฿ ให้เอง)
 * ⚠️ ชื่อตัวเลือกถูกอ้างใน rules (400 แกรม / 130 แกรม / PET สีใส ล็อกให้พิมพ์ได้ 1 ด้าน) — ห้ามแก้ชื่อ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 460);

const VER = "v1";
const GROUP = "จำนวนด้านที่พิมพ์";
const WRITE = process.argv.includes("--write");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "";
const OUT = ".cache/print-sides";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";

/** สินค้า 2 ตัว — ต่างกันแค่รูปทรงแผ่นกับคำบรรยายท้ายภาพ */
const PRODUCTS = [
  {
    id: "postcard-th",
    nameRe: /POSTCARD|โปสการ์ด/i,
    sheet: { w: 330, h: 220 },      // โปสการ์ดแนวนอน 6 × 4 นิ้ว
    foot: "ใบโปสการ์ดใบเดียวกัน · เลือกได้ว่าจะพิมพ์กี่ด้าน",
  },
  {
    id: "paper-art-pet",
    nameRe: /กระดาษอาร์ตมัน/,
    sheet: { w: 226, h: 320 },      // แผ่นกระดาษแนวตั้ง สัดส่วน A (1 : 1.414)
    foot: "กระดาษแผ่นเดียวกัน · เลือกได้ว่าจะพิมพ์กี่ด้าน",
  },
].filter((p) => !ONLY || p.id === ONLY);
if (!PRODUCTS.length) { console.error(`--only=${ONLY} ไม่ตรงสินค้าตัวไหนในสคริปต์`); process.exit(1); }

const PICKS = [
  {
    name: "พิมพ์ 1 ด้าน",
    slug: "sides-1",
    n: "1",
    back: false,
    title: "พิมพ์ 1 ด้าน",
    sub: "พิมพ์ลายเฉพาะด้านหน้า · ด้านหลังเป็นกระดาษเปล่า",
    note: "ส่งไฟล์ลายมา 1 ไฟล์",
    desc: "พิมพ์ลายด้านหน้าอย่างเดียว ด้านหลังเป็นกระดาษเปล่า · ส่งไฟล์ลายมา 1 ไฟล์",
  },
  {
    name: "พิมพ์ 2 ด้าน",
    slug: "sides-2",
    n: "2",
    back: true,
    title: "พิมพ์ 2 ด้าน",
    sub: "พิมพ์ลายทั้งด้านหน้าและด้านหลัง พลิกอีกด้านก็เป็นลาย",
    note: "ส่งไฟล์ลายมา 2 ไฟล์ (หน้า + หลัง)",
    desc: "พิมพ์ลายทั้งสองด้าน พลิกอีกด้านก็เป็นลาย · ส่งไฟล์ลายมา 2 ไฟล์ (หน้า + หลัง)",
  },
];

const line = (x, y, len, op = 0.75, th = 6) =>
  `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${len.toFixed(1)}" height="${th}" rx="${th / 2}" fill="#ffffff" opacity="${op}"/>`;

function art(p, prod) {
  const { w: SW, h: SH } = prod.sheet;
  const CY = 492;
  const SY = CY - SH / 2;
  const GAP = 150;                            // ช่องกลาง — วงกลมเลขด้าน (r=54) ต้องไม่ชนแผ่น
  const LX = Math.round((W - SW * 2 - GAP) / 2); // แผ่นซ้าย (ด้านหน้า)
  const RX = W - LX - SW;                        // แผ่นขวา (ด้านหลัง) — สมมาตรกับซ้าย

  /** ลายด้านหน้า — มาสคอตบนพื้นไล่สี + หัวเรื่อง/บรรทัดข้อความล่าง */
  const frontArt = (x, y) => {
    const mh = SH * 0.44;
    const mw = mh * MASCOT.ratio;
    const cx = x + SW / 2;
    return `
      <circle cx="${cx}" cy="${y + SH * 0.36}" r="${SH * 0.3}" fill="#ffffff" opacity="0.35"/>
      <image href="${MASCOT.uri}" x="${cx - mw / 2}" y="${y + SH * 0.13}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet"/>
      <rect x="${x + SW * 0.2}" y="${y + SH * 0.66}" width="${SW * 0.6}" height="${SH * 0.075}" rx="${SH * 0.02}" fill="#ffffff" opacity="0.9"/>
      ${line(x + SW * 0.26, y + SH * 0.79, SW * 0.48)}
      ${line(x + SW * 0.32, y + SH * 0.87, SW * 0.36, 0.55)}`;
  };

  /** ลายด้านหลัง — คนละไฟล์กับด้านหน้า วาดเป็นผังข้อความ/รูปย่อย ให้เห็นว่าไม่ใช่ลายเดิม */
  const backArt = (x, y) => `
    <rect x="${x + SW * 0.12}" y="${y + SH * 0.12}" width="${SW * 0.76}" height="${SH * 0.08}" rx="${SH * 0.02}" fill="#ffffff" opacity="0.9"/>
    ${line(x + SW * 0.12, y + SH * 0.27, SW * 0.76, 0.7)}
    ${line(x + SW * 0.12, y + SH * 0.35, SW * 0.6, 0.55)}
    <rect x="${x + SW * 0.12}" y="${y + SH * 0.46}" width="${SW * 0.34}" height="${SH * 0.24}" rx="${SH * 0.025}" fill="#ffffff" opacity="0.42"/>
    <rect x="${x + SW * 0.54}" y="${y + SH * 0.46}" width="${SW * 0.34}" height="${SH * 0.24}" rx="${SH * 0.025}" fill="#ffffff" opacity="0.42"/>
    ${line(x + SW * 0.12, y + SH * 0.79, SW * 0.76, 0.7)}
    ${line(x + SW * 0.12, y + SH * 0.87, SW * 0.5, 0.5)}`;

  /** แผ่นหนึ่งใบ — มีลาย (ไล่สี) หรือเปล่า (ขาว) */
  const sheet = (x, printed, grad, inner) => `
    <rect x="${x + 6}" y="${SY + 10}" width="${SW}" height="${SH}" rx="6" fill="#0f172a" opacity="0.12"/>
    <rect x="${x}" y="${SY}" width="${SW}" height="${SH}" rx="6" fill="${printed ? `url(#${grad})` : "#ffffff"}"
          stroke="${printed ? "#94a3b8" : "#cbd5e1"}" stroke-width="2"/>
    ${printed
      ? `<g clip-path="url(#clip-${grad})">${inner}</g>`
      : `<text x="${x + SW / 2}" y="${SY + SH / 2 + 10}" font-family="${TH}" font-size="27" text-anchor="middle" fill="#cbd5e1">กระดาษเปล่า</text>`}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="front" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#38bdf8"/><stop offset="0.55" stop-color="#22d3ee"/><stop offset="1" stop-color="#a5b4fc"/>
    </linearGradient>
    <linearGradient id="back" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a78bfa"/><stop offset="0.55" stop-color="#c084fc"/><stop offset="1" stop-color="#f0abfc"/>
    </linearGradient>
    <clipPath id="clip-front"><rect x="${LX}" y="${SY}" width="${SW}" height="${SH}" rx="6"/></clipPath>
    <clipPath id="clip-back"><rect x="${RX}" y="${SY}" width="${SW}" height="${SH}" rx="6"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="176" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${p.title}</text>
  <text x="${W / 2}" y="218" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${p.sub}</text>

  ${sheet(LX, true, "front", frontArt(LX, SY))}
  ${sheet(RX, p.back, "back", backArt(RX, SY))}

  <!-- ลูกศรพลิกแผ่น (โค้งข้ามด้านบน) + ป้ายจำนวนด้านกลางภาพ -->
  <path d="M ${LX + SW - 12} ${SY - 20} Q ${W / 2} ${SY - 88} ${RX + 12} ${SY - 20}"
        fill="none" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/>
  <path d="M ${RX + 4} ${SY - 32} l 17 -2 -8 17 z" fill="#94a3b8"/>
  <text x="${W / 2}" y="${SY - 82}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">พลิกแผ่น</text>
  <circle cx="${W / 2}" cy="${CY}" r="54" fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>
  <text x="${W / 2}" y="${CY + 6}" font-family="${TH}" font-size="52" font-weight="700" text-anchor="middle" fill="${INK}">${p.n}</text>
  <text x="${W / 2}" y="${CY + 36}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="middle" fill="${SUB}">ด้าน</text>

  <text x="${LX + SW / 2}" y="${SY + SH + 46}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">ด้านหน้า</text>
  <text x="${RX + SW / 2}" y="${SY + SH + 46}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${p.back ? INK : "#94a3b8"}">ด้านหลัง</text>

  <text x="${W / 2}" y="${H - 92}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">${p.note}</text>
  <text x="${W / 2}" y="${H - 56}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${prod.foot}</text>
</svg>`;
}

mkdirSync(OUT, { recursive: true });
for (const prod of PRODUCTS) {
  prod.built = [];
  for (const p of PICKS) {
    const file = `${p.slug}-${VER}.jpg`;
    const buf = await sharp(Buffer.from(art(p, prod))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    writeFileSync(`${OUT}/${prod.id}-${file}`, buf);
    await sharp(buf).resize(62, 62).toFile(`${OUT}/_thumb-${prod.id}-${file}`); // ปุ่มจริงครอปกลาง 62px
    prod.built.push({ ...p, file, buf });
    console.log(`🖼  ${OUT}/${prod.id}-${file}  ${Math.round(buf.length / 1024)} KB — ${p.title}`);
  }
}

if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ────────────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const prod of PRODUCTS) {
  const { data: row, error: readErr } = await sb.from("products").select("name,data").eq("id", prod.id).single();
  if (readErr) { console.error(prod.id, readErr); process.exit(1); }
  if (!prod.nameRe.test(row.name)) { console.error(`id ${prod.id} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`); process.exit(1); }

  for (const p of prod.built) {
    const key = `products/${prod.id}/${p.file}`;
    const { error } = await sb.storage.from("product-images").upload(key, p.buf, { contentType: "image/jpeg", upsert: true });
    if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
    p.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
    console.log("⬆️ ", p.url);
  }

  const data = row.data;
  const options = data.options ?? [];
  const before = options.length;
  const group = options.find((o) => o.label === GROUP);
  if (!group) { console.error(`${prod.id}: ไม่เจอกลุ่ม "${GROUP}"`); process.exit(1); }

  group.display = "cards"; // ปุ่มเปล่าโชว์รูปไม่ได้ ต้องเป็นการ์ด
  group.choices = group.choices.map((c) => {
    const p = prod.built.find((b) => b.name === c.name);
    if (!p) { console.error(`${prod.id}: เจอตัวเลือกที่ไม่มีในสคริปต์ (ชื่ออาจถูกแก้):`, c.name); process.exit(1); }
    return { ...c, imageSrc: p.url, desc: p.desc }; // คง extra/ฟิลด์อื่นไว้ครบ
  });
  if (group.choices.length !== prod.built.length) { console.error(`${prod.id}: จำนวนตัวเลือกไม่ตรงกับภาพที่วาด`, group.choices.map((c) => c.name)); process.exit(1); }

  data.savedAt = new Date().toISOString(); // กันแคชรูปเก่า (?v=savedAt)
  const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", prod.id).select("data");
  if (updErr || !upd?.length) { console.error(`${prod.id}: update พัง/0 แถว`, updErr); process.exit(1); }

  // อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
  const { data: back } = await sb.from("products").select("data").eq("id", prod.id).single();
  const g = back.data.options.find((o) => o.label === GROUP);
  if (g?.display !== "cards") { console.error(`${prod.id}: อ่านกลับ display ไม่เป็น cards`, g?.display); process.exit(1); }
  for (const p of prod.built) {
    const c = g.choices.find((x) => x.name === p.name);
    if (c?.imageSrc !== p.url || c?.desc !== p.desc) { console.error(`${prod.id}: อ่านกลับตัวเลือกไม่ตรง!`, p.name, c); process.exit(1); }
    const res = await fetch(p.url, { method: "HEAD" });
    if (res.status !== 200) throw new Error(`ไฟล์ ${p.url} เปิดไม่ได้: HTTP ${res.status}`);
  }
  /* กันเผลอ: ค่าบริการ 2 ด้าน + กฎที่อ้างชื่อตัวเลือก + จำนวนกลุ่ม ต้องอยู่ครบเหมือนเดิม */
  const two = g.choices.find((c) => c.name === "พิมพ์ 2 ด้าน");
  if (!(two?.extra > 0)) { console.error(`${prod.id}: ค่าบริการพิมพ์ 2 ด้านหาย!`, two); process.exit(1); }
  const rulesOnSides = (back.data.rules ?? []).filter((r) => r.limit?.label === GROUP).length;
  if (rulesOnSides < 2) { console.error(`${prod.id}: กฎล็อกจำนวนด้านหาย! เหลือ`, rulesOnSides); process.exit(1); }
  if (back.data.options.length !== before) { console.error(`${prod.id}: จำนวนกลุ่มตัวเลือกเปลี่ยน!`, back.data.options.length, before); process.exit(1); }
  console.log(`✓ ${prod.id} · กลุ่ม "${GROUP}" เป็นการ์ด + ภาพ ${prod.built.length} ใบ · 2 ด้าน +฿${two.extra} · กฎล็อก ${rulesOnSides} ข้อ`);
}
console.log("\n✅ เสร็จทั้งหมด");
