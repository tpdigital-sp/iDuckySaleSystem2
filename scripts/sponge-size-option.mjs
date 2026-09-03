#!/usr/bin/env node
/**
 * ฟองน้ำขัดผิว | ฟองน้ำทำความสะอาด (mugcoaster-8) — เพิ่มกลุ่มตัวเลือก "ขนาด" + ภาพประกอบ
 *
 *   node scripts/sponge-size-option.mjs            (วาดภาพลง .cache/mugcoaster-8/upload ดูก่อน)
 *   node scripts/sponge-size-option.mjs --write    (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ตามใบสเปค WATER SPONGE (AdminBuddy/academy-assets/gifts/sponge.jpg):
 * ฟองน้ำมี "ขนาดเดียว" สี่เหลี่ยม 12×7 ซม. หนา 2 ซม. · วัสดุฝ้ายเยื่อไม้ (wood pulp cotton)
 * พิมพ์ระบบ UV · โดนน้ำแล้วพองตัว (หนา ~2 ซม.) ลายสกรีนจะขยายและสีซีดลง
 *
 * เพิ่มกลุ่ม "ขนาด" ตัวเลือกเดียว "12×7 ซม. หนา 2 ซม." ไม่บวกราคา
 * พร้อมภาพวาดใหม่ (900×900) ฟองน้ำทรงสามมิติ + ลูกศรวัด 12/7/2 ซม. + ลายมาสคอตบนหน้าพิมพ์
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = เขียนทับตัวเดิม ไม่เพิ่มซ้ำ
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "mugcoaster-8";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
const SIZE_CHOICE = "12×7 ซม. หนา 2 ซม.";

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const OK = "#0891b2";

/** ลูกศรวัดขนาดแนวตรง — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ hologram-bag-size-option) */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 30 : -14);
  const tick = (x, y) => `<line x1="${x - (vertical ? 8 : 0)}" y1="${y - (vertical ? 0 : 8)}" x2="${x + (vertical ? 8 : 0)}" y2="${y + (vertical ? 0 : 8)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12.5 : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

/** ลูกศรวัดตามแนวเฉียง (ขอบลึก 7 ซม.) — ขีดปลายตั้งฉากกับเส้น + ป้ายที่กึ่งกลาง */
const dimSlant = (x1, y1, x2, y2, label) => {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const px = (y1 - y2) / len; // ตั้งฉาก
  const py = (x2 - x1) / len;
  const tick = (x, y) => `<line x1="${x - px * 9}" y1="${y - py * 9}" x2="${x + px * 9}" y2="${y + py * 9}" stroke="${SUB}" stroke-width="3"/>`;
  const lx = (x1 + x2) / 2 + px * 34;
  const ly = (y1 + y2) / 2 + py * 34 + 8;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (label.length * 12.5) / 2}" y="${ly - 24}" width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${SUB}">${label}</text>`;
};

/**
 * ภาพ "ขนาดฟองน้ำ" — ก้อนฟองน้ำมุมเฉียงเห็น 3 หน้า:
 * หน้าบน = หน้าพิมพ์ลาย (พื้นพาสเทลฟ้า + มาสคอตแทนลายลูกค้า บีบตามระนาบจริง)
 * หน้าหน้า/ข้าง = เนื้อฟองน้ำสีครีมมีรูพรุน · ลูกศรวัด 12 / 7 / หนา 2 ซม.
 */
function sizeArt() {
  const CM = 42; // 1 ซม. = 42 px
  const bw = 12 * CM; // 504
  const th = 2 * CM; // 84 ความหนา
  const dpx = 176; // ระยะลึก 7 ซม. ฉายเฉียงขึ้นขวา
  const dpy = -128;
  const bx = 132; // เผื่อที่ป้าย "หนา 2 ซม." ฝั่งซ้าย
  const by = 480; // ขอบบนหน้าหน้า
  const depthReal = 7 * CM; // 364 ในพิกัดจริงของหน้าบน
  // matrix แปลงพิกัดหน้าบน (u=กว้าง 0-624, v=ลึกหลัง→หน้า 0-364) ลงระนาบเฉียง
  const m = `matrix(1 0 ${(-dpx / depthReal).toFixed(4)} ${(-dpy / depthReal).toFixed(4)} ${bx + dpx} ${by + dpy})`;
  const r = MASCOT.ratio;
  let ah = depthReal - 56;
  let aw = ah * r;
  if (aw > bw - 140) { aw = bw - 140; ah = aw / r; }

  // รูพรุนเนื้อฟองน้ำ (ตำแหน่งกำหนดตายตัว ไม่สุ่ม)
  const pores = (x0, y0, w0, h0, n, seedStep) => {
    let out = "";
    for (let i = 0; i < n; i++) {
      const fx = ((i * seedStep) % 97) / 97;
      const fy = ((i * (seedStep + 13)) % 89) / 89;
      const rr = 3 + ((i * 7) % 5);
      out += `<ellipse cx="${(x0 + 14 + fx * (w0 - 28)).toFixed(0)}" cy="${(y0 + 10 + fy * (h0 - 20)).toFixed(0)}" rx="${rr}" ry="${rr - 1}" fill="#e7d9c3" opacity="0.85"/>`;
    }
    return out;
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="print" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#c9f0f4"/>
      <stop offset="0.5" stop-color="#bfe9f2"/>
      <stop offset="1" stop-color="#d6f4ec"/>
    </linearGradient>
    <linearGradient id="side" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6ecd9"/>
      <stop offset="1" stop-color="#efe0c6"/>
    </linearGradient>
    <clipPath id="topClip"><rect x="0" y="0" width="${bw}" height="${depthReal}" rx="18"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="42" font-weight="700" text-anchor="middle" fill="${INK}">ขนาดฟองน้ำ 12 × 7 ซม.</text>
  <text x="${W / 2}" y="132" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">สี่เหลี่ยม หนา 2 ซม. — ขนาดเดียว</text>

  <!-- หน้าข้างขวา (ลึก 7 × หนา 2) -->
  <clipPath id="sideClip"><polygon points="${bx + bw},${by} ${bx + bw + dpx},${by + dpy} ${bx + bw + dpx},${by + dpy + th} ${bx + bw},${by + th}"/></clipPath>
  <polygon points="${bx + bw},${by} ${bx + bw + dpx},${by + dpy} ${bx + bw + dpx},${by + dpy + th} ${bx + bw},${by + th}"
    fill="#e9dabd" stroke="#d3bf9c" stroke-width="2.5"/>
  <g clip-path="url(#sideClip)">${pores(bx + bw, by + dpy, dpx, th - dpy, 18, 53)}</g>
  <!-- หน้าหน้า (กว้าง 12 × หนา 2) -->
  <rect x="${bx}" y="${by}" width="${bw}" height="${th}" rx="8" fill="url(#side)" stroke="#d3bf9c" stroke-width="2.5"/>
  ${pores(bx, by, bw, th, 26, 37)}
  <!-- หน้าบน = หน้าพิมพ์ลาย (วาดในพิกัดจริงแล้วบีบด้วย matrix) -->
  <g transform="${m}">
    <g clip-path="url(#topClip)">
      <rect x="0" y="0" width="${bw}" height="${depthReal}" fill="url(#print)"/>
      <circle cx="70" cy="70" r="26" fill="#fcd3ec" opacity="0.7"/>
      <circle cx="${bw - 64}" cy="${depthReal - 58}" r="30" fill="#fdeccb" opacity="0.8"/>
      <circle cx="${bw - 90}" cy="76" r="16" fill="#c9f2df" opacity="0.9"/>
      <circle cx="86" cy="${depthReal - 66}" r="18" fill="#d9d4fb" opacity="0.8"/>
      <image href="${MASCOT.uri}" x="${(bw - aw) / 2}" y="${(depthReal - ah) / 2}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>
    </g>
    <rect x="0" y="0" width="${bw}" height="${depthReal}" rx="18" fill="none" stroke="#b8c4d6" stroke-width="3"/>
  </g>

  <!-- ลูกศรวัด -->
  ${dim(bx, by + th + 40, bx + bw, by + th + 40, "12 ซม.")}
  <!-- ความหนา — ป้ายซ้อน 2 บรรทัดข้างซ้าย (พื้นที่ขาวล้วน ไม่ต้องมีพื้นป้าย) -->
  <line x1="${bx - 36}" y1="${by}" x2="${bx - 36}" y2="${by + th}" stroke="${SUB}" stroke-width="2.5"/>
  <line x1="${bx - 44}" y1="${by}" x2="${bx - 28}" y2="${by}" stroke="${SUB}" stroke-width="3"/>
  <line x1="${bx - 44}" y1="${by + th}" x2="${bx - 28}" y2="${by + th}" stroke="${SUB}" stroke-width="3"/>
  <text x="${bx - 50}" y="${by + th / 2 - 8}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="end" fill="${SUB}">หนา</text>
  <text x="${bx - 50}" y="${by + th / 2 + 24}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="end" fill="${SUB}">2 ซม.</text>
  ${dimSlant(bx + bw + 30, by + th, bx + bw + dpx + 30, by + dpy + th, "7 ซม.")}

  <!-- ป้ายหน้าพิมพ์ -->
  <rect x="${W / 2 - 210}" y="${by + dpy - 66}" width="420" height="40" rx="20" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
  <text x="${W / 2}" y="${by + dpy - 38}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${OK}">พิมพ์ลายของคุณเต็มแผ่น ด้วยระบบ UV</text>

  <text x="${W / 2}" y="${H - 104}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">วัสดุฝ้ายเยื่อไม้ (wood pulp cotton) · โดนน้ำแล้วพองตัวหนาประมาณ 2 ซม.</text>
  <text x="${W / 2}" y="${H - 70}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">หลังพองตัว ลายสกรีนจะขยายขึ้นและสีอ่อนลงเล็กน้อย</text>
</svg>`;
}

const svg = sizeArt();
const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
const FILE = `size-12x7-${VER}.jpg`;
writeFileSync(`${OUT}/${FILE}`, buf);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ฟองน้ำ 12×7 หนา 2 ซม.`);

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const key = `products/${PRODUCT_ID}/${FILE}`;
const { error: upErr } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
if (upErr) { console.error("อัปโหลดพัง", key, upErr); process.exit(1); }
const sizeUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", sizeUrl);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];

// กลุ่ม "ขนาด" — มีอยู่แล้ว = เขียนทับ, ยังไม่มี = แทรกไว้หน้าสุด
const sizeGroup = { label: SIZE_GROUP, choices: [{ name: SIZE_CHOICE, imageSrc: sizeUrl }] };
const at = options.findIndex((o) => o.label === SIZE_GROUP);
if (at >= 0) options[at] = sizeGroup;
else options.unshift(sizeGroup);

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options.find((o) => o.label === SIZE_GROUP)?.choices?.[0];
if (got?.name !== SIZE_CHOICE || got?.imageSrc !== sizeUrl) { console.error("อ่านกลับกลุ่มขนาดไม่ตรง!", got); process.exit(1); }
console.log(`✓ กลุ่ม "${SIZE_GROUP}" (${SIZE_CHOICE}) อ่านกลับตรง · savedAt =`, back.data.savedAt);
