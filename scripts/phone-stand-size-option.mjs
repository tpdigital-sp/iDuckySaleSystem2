#!/usr/bin/env node
/**
 * PHONE STAND 3 STEP (phone-stand-3-step) — เพิ่มกลุ่มตัวเลือก "ขนาด" แบบการ์ด + ภาพประกอบตัวเลือก
 *
 *   node scripts/phone-stand-size-option.mjs           (วาดภาพลง .cache/phone-stand-3-step/upload ดูก่อน)
 *   node scripts/phone-stand-size-option.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * สเปคจาก data.terms ของตัวสินค้าเอง (ตรงกับรูปงานจริง 4 ใบใน data.images):
 *   ขนาด 8.2 × 13 ซม. · วัสดุ ABS พลาสติกใส · งานสกรีน 1 ด้าน · พับเก็บแบน กางตั้งได้ 3 ระดับ
 *   ขอบชิ้นงานเป็นทรงหยักคลื่น (ดูรูป p1/p3) ไม่ใช่สี่เหลี่ยมตรง — ภาพจึงวาดขอบหยักตาม
 *
 * ของเดิมใน DB: data.options = [] (ไม่มีกลุ่มตัวเลือกเลย) → กลุ่มนี้เป็นกลุ่มแรกของสินค้า
 * ราคา: กลุ่มนี้ **ไม่ใช่แกนตารางราคา** — pricing.driverLabels = [] คีย์ราคาจึงเป็น "" ตรงกับ cells[""]
 *   การ์ดใบเดียวไม่มี extra → ยอดเงินเท่าเดิมทุกช่วงจำนวน (100/95/90/85/80) · priceMin 80 priceMax 100
 *   อ่านกลับเช็คซ้ำว่าชื่อกลุ่มไม่ไปชน driverLabels ([[iducky-price-driver-trap]])
 *
 * ภาพ 900×900 วาดสเกลจริง (1 ซม. = 38 px) แผ่นหน้า 8.2×13 ซม. เต็มเฟรม + ลูกศรวัดสองแกน
 *   ขวามือ = ภาพด้านข้าง 3 ใบ เรียงลงมา แสดง "3 ระดับ" ที่ปรับเอนได้ พร้อมมือถือพิงจริง
 * ⚠️ กล่องรูปบนการ์ดเป็นจัตุรัส 80px และไฟล์ก็จัตุรัส 900×900 → ย่อทั้งใบ ไม่ครอป
 *   ชิ้นงานจึงต้องกินพื้นที่ให้มากที่สุด ตัวหนังสือเท่าที่จำเป็น ([[iducky-option-thumb-crop]])
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 *
 * รันซ้ำได้: เจอกลุ่ม "ขนาด" อยู่แล้ว = ตัดทิ้งแล้ววางใหม่หน้าสุด ไม่เพิ่มซ้ำ
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 460);

const PRODUCT_ID = "phone-stand-3-step";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || `.cache/${PRODUCT_ID}/upload`).replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const GROUP = "ขนาด";
const CHOICE = "8.2 × 13 ซม.";
const FILE = `size-8-2x13-${VER}.jpg`;

// ── ชุดวาดกลาง 900×900 สไตล์บ้าน ─────────────────────────────────────
const W = 900, H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a", SUB = "#64748b", OK = "#0891b2";
const CM = 38; // 1 ซม. = 38 px → แผ่น 8.2×13 ซม. = 312×494 px

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines.filter(Boolean)
    .map((t, i, a) => `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`)
    .join("");

const pill = (cx, y, text) => {
  const w = text.length * 14.5 + 56;
  return `
    <rect x="${cx - w / 2}" y="${y - 23}" width="${w}" height="46" rx="23" fill="#ecfeff" stroke="${OK}" stroke-width="2.5"/>
    <text x="${cx}" y="${y + 8}" font-family="${TH}" font-size="23" font-weight="700" text-anchor="middle" fill="${OK}">${text}</text>`;
};

/** ลูกศรวัดขนาด — เส้น + ขีดปลาย + ป้ายตัวเลขบนพื้นขาว */
const dim = (x1, y1, x2, y2, label, side = "below") => {
  const vertical = x1 === x2;
  const lx = vertical ? x1 - 14 : (x1 + x2) / 2;
  const ly = vertical ? (y1 + y2) / 2 + 8 : y2 + (side === "below" ? 34 : -16);
  const tick = (x, y) => `<line x1="${x - (vertical ? 9 : 0)}" y1="${y - (vertical ? 0 : 9)}" x2="${x + (vertical ? 9 : 0)}" y2="${y + (vertical ? 0 : 9)}" stroke="${SUB}" stroke-width="3"/>`;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${SUB}" stroke-width="2.5"/>
    ${tick(x1, y1)}${tick(x2, y2)}
    <rect x="${lx - (vertical ? label.length * 12.5 : (label.length * 12.5) / 2)}" y="${ly - 24}"
      width="${label.length * 12.5}" height="31" rx="7" fill="#ffffff" opacity="0.94"/>
    <text x="${lx}" y="${ly}" font-family="${TH}" font-size="24" font-weight="700"
      text-anchor="${vertical ? "end" : "middle"}" fill="${SUB}">${label}</text>`;
};

/**
 * ขอบทรงคลื่นแบบชิ้นงานจริง — สุ่มไม่ได้ ใช้ไซน์คงที่ให้ซ้าย/ขวาสมมาตร
 * คืน path ปิดของแผ่นขนาด w × h ที่มุมซ้ายบน (x0,y0)
 */
function wavyPlate(x0, y0, w, h, { bumps = 4, amp = 11, r = 44 } = {}) {
  const x1 = x0 + w, y1 = y0 + h;
  const N = 60;
  const pts = [];
  // ขอบขวา (บน → ล่าง)
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = y0 + r + t * (h - 2 * r);
    pts.push([x1 + amp * Math.sin(2 * Math.PI * bumps * t), y]);
  }
  // มุมขวาล่าง → ขอบล่าง → มุมซ้ายล่าง (เส้นตรง ให้วางตั้งได้จริง)
  const bottom = [[x1 - r, y1], [x0 + r, y1]];
  // ขอบซ้าย (ล่าง → บน) กระจกกับขวา
  const left = [];
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    const y = y0 + r + t * (h - 2 * r);
    left.push([x0 - amp * Math.sin(2 * Math.PI * bumps * t), y]);
  }
  const L = (a) => a.map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return [
    `M ${x0 + r} ${y0}`,
    `L ${x1 - r} ${y0}`,
    `Q ${x1} ${y0} ${(x1 + amp * Math.sin(0)).toFixed(1)} ${y0 + r}`,
    L(pts.slice(1)),
    `Q ${x1} ${y1} ${bottom[0][0]} ${bottom[0][1]}`,
    `L ${bottom[1][0]} ${bottom[1][1]}`,
    `Q ${x0} ${y1} ${left[0][0].toFixed(1)} ${left[0][1].toFixed(1)}`,
    L(left.slice(1)),
    `Q ${x0} ${y0} ${x0 + r} ${y0}`,
    "Z",
  ].join(" ");
}

/** ภาพด้านข้าง 1 ใบ — ฐานนอนกับพื้น + แผ่นพิงเอนตามองศา + มือถือพิงอยู่ */
function sideStep(cx, cy, deg, label) {
  const baseW = 120, plate = 128;
  const bx = cx - baseW / 2, by = cy + 34;
  const rad = (deg * Math.PI) / 180;
  const tipX = bx + 26 + plate * Math.cos(rad), tipY = by - plate * Math.sin(rad);
  // มือถือพิงแผ่น — เอียงองศาเดียวกัน ยาว 108 หนา 13
  const phL = 108, phT = 13;
  const ux = Math.cos(rad), uy = -Math.sin(rad);          // ทิศตามแผ่น
  const nx = Math.sin(rad), ny = Math.cos(rad);           // ตั้งฉาก (ออกหน้าจอ)
  const px = bx + 34, py = by - 4;
  const quad = [
    [px + nx * 4, py + ny * 4],
    [px + nx * (4 + phT), py + ny * (4 + phT)],
    [px + ux * phL + nx * (4 + phT), py + uy * phL + ny * (4 + phT)],
    [px + ux * phL + nx * 4, py + uy * phL + ny * 4],
  ].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return `
  <g>
    <line x1="${bx - 16}" y1="${by}" x2="${bx + baseW + 22}" y2="${by}" stroke="#cbd5e1" stroke-width="3"/>
    <!-- ฐานนอน -->
    <rect x="${bx}" y="${by - 9}" width="${baseW}" height="9" rx="4" fill="#dbeafe" stroke="#93c5fd" stroke-width="2.5"/>
    <!-- แผ่นพิงเอน (อยู่หลัง) -->
    <line x1="${bx + 26}" y1="${by - 5}" x2="${tipX.toFixed(1)}" y2="${tipY.toFixed(1)}"
      stroke="#7dd3e8" stroke-width="11" stroke-linecap="round"/>
    <line x1="${bx + 26}" y1="${by - 5}" x2="${tipX.toFixed(1)}" y2="${tipY.toFixed(1)}"
      stroke="#0891b2" stroke-width="2" stroke-linecap="round" opacity="0.45"/>
    <!-- มือถือพิงอยู่ข้างหน้า -->
    <polygon points="${quad}" fill="#e2e8f0" stroke="#94a3b8" stroke-width="2.5"/>
    <circle cx="${bx + 26}" cy="${by - 5}" r="7" fill="#ffffff" stroke="${OK}" stroke-width="3"/>
    <text x="${cx + 96}" y="${by - 2}" font-family="${TH}" font-size="24" font-weight="700" fill="${OK}">${label}</text>
  </g>`;
}

/** แผ่นหน้า 8.2 × 13 ซม. สเกลจริง + ลายสกรีน 1 ด้าน + รอยพับ 2 เส้น */
function sizeArt() {
  const w = 8.2 * CM, h = 13 * CM;           // 311.6 × 494
  const cx = 292, cy = 395;
  const x0 = cx - w / 2, y0 = cy - h / 2;
  const path = wavyPlate(x0, y0, w, h);
  const r = MASCOT.ratio;
  const ah = h * 0.44, aw = ah * r;
  const label = CHOICE;
  const lw = label.length * 26 + 70;
  const LABEL_Y = 760;

  return frame(`
    ${title("ขนาด 8.2 × 13 ซม.", "ABS พลาสติกใส — ขนาดเดียว พับเก็บแบน")}

    <defs>
      <linearGradient id="clear" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset="0.55" stop-color="#eff8fc"/>
        <stop offset="1" stop-color="#dceaf3"/>
      </linearGradient>
      <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
    </defs>

    <!-- เงาใต้แผ่น -->
    <path d="${path}" transform="translate(7,13)" fill="#0f172a" opacity="0.07"/>
    <!-- ตัวแผ่นพลาสติกใส -->
    <path d="${path}" fill="url(#clear)" stroke="#a9c8da" stroke-width="3.5"/>
    <path d="${path}" fill="url(#shine)" opacity="0.55"/>

    <!-- ลายสกรีน 1 ด้าน (ลายลูกค้า) -->
    <image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${y0 + h * 0.07}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid meet"/>

    <!-- รอยพับ 2 เส้น = กางได้ 3 ระดับ -->
    <line x1="${x0 + 6}" y1="${y0 + h * 0.56}" x2="${x0 + w - 6}" y2="${y0 + h * 0.56}" stroke="#7fb6d1" stroke-width="2.5" stroke-dasharray="9 7"/>
    <line x1="${x0 + 6}" y1="${y0 + h * 0.79}" x2="${x0 + w - 6}" y2="${y0 + h * 0.79}" stroke="#7fb6d1" stroke-width="2.5" stroke-dasharray="9 7"/>
    <text x="${x0 + 16}" y="${y0 + h * 0.56 - 11}" font-family="${TH}" font-size="18" fill="#5b91ab">รอยพับ</text>
    <text x="${x0 + 16}" y="${y0 + h * 0.79 - 11}" font-family="${TH}" font-size="18" fill="#5b91ab">รอยพับ</text>

    <!-- ลูกศรวัดสองแกน -->
    ${dim(x0, y0 + h + 40, x0 + w, y0 + h + 40, "8.2 ซม.")}
    ${dim(x0 - 46, y0, x0 - 46, y0 + h, "13 ซม.")}

    <!-- ด้านข้าง 3 ระดับ -->
    <text x="686" y="182" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">กางตั้งได้ 3 ระดับ</text>
    ${sideStep(660, 268, 42, "1")}
    ${sideStep(660, 412, 55, "2")}
    ${sideStep(660, 556, 68, "3")}

    <!-- ป้ายขนาดตัวใหญ่ -->
    <rect x="${(W - lw) / 2}" y="${LABEL_Y - 36}" width="${lw}" height="72" rx="36" fill="#ffffff" opacity="0.95" stroke="${OK}" stroke-width="3"/>
    <text x="${W / 2}" y="${LABEL_Y + 17}" font-family="${TH}" font-size="50" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>

    ${foot([
      "งานสกรีน 1 ด้าน · วัสดุ ABS พลาสติกใส แข็งแรง · พับเก็บแบนพกพาง่าย",
      "ขนาดเดียว รวมในราคาสินค้าแล้ว",
    ])}`);
}

const buf = await sharp(Buffer.from(sizeArt())).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
writeFileSync(`${OUT}/${FILE}`, buf);
// ย่อเท่าที่ลูกค้าเห็นบนการ์ด (80px) กับบนแถบแกลเลอรี (62px) แล้วขยายกลับมาดูว่ายังอ่านออก
await sharp(buf).resize(80, 80).resize(320, 320, { kernel: "nearest" }).toFile(`${OUT}/thumb80-${FILE}`);
await sharp(buf).resize(62, 62).resize(320, 320, { kernel: "nearest" }).toFile(`${OUT}/thumb62-${FILE}`);
console.log(`🖼  ${OUT}/${FILE}  ${Math.round(buf.length / 1024)} KB — ${CHOICE}`);

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
const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
console.log("อัปโหลดแล้ว", url);

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;

// สคริปต์เขียนตรงไม่ผ่าน API = ไม่มีประวัติ product_revisions — ดัมป์ของเดิมไว้ก่อนเสมอ
const dump = `${OUT}/../before-${VER}.json`;
writeFileSync(dump, JSON.stringify(data, null, 2));
console.log("สำรองข้อมูลเดิมไว้ที่", dump);

const sizeGroup = {
  label: GROUP,
  display: "cards",
  note: "PHONE STAND 3 STEP มีขนาดเดียว 8.2 × 13 ซม. · สกรีนได้ 1 ด้าน",
  choices: [{
    name: CHOICE,
    popular: true,
    imageSrc: url,
    desc: "วัสดุ ABS พลาสติกใส แข็งแรง · สกรีนลาย 1 ด้าน · กางตั้งได้ 3 ระดับ พับเก็บแบนพกพาง่าย — รวมในราคาแล้ว",
  }],
};

// รันซ้ำได้: ตัดกลุ่มเดิมทิ้งก่อน แล้ววางไว้หน้าสุด
const options = (data.options ?? []).filter((o) => o.label !== GROUP);
data.options = [sizeGroup, ...options];
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const g = got.find((o) => o.label === GROUP);
const fails = [
  [got.filter((o) => o.label === GROUP).length === 1, "กลุ่มขนาดซ้ำ/หาย"],
  [g?.display === "cards", "กลุ่มขนาดไม่ใช่การ์ด"],
  [g?.choices?.length === 1, "จำนวนการ์ดไม่ใช่ 1 ใบ"],
  [g?.choices?.[0]?.name === CHOICE, "ชื่อการ์ดไม่ตรง"],
  [g?.choices?.[0]?.imageSrc === url, "ภาพการ์ดไม่ตรง"],
  [!g?.choices?.[0]?.extra, "การ์ดขนาดเดียวต้องไม่บวกราคา"],
  [!!g?.choices?.[0]?.desc, "การ์ดขาดคำอธิบาย"],
  // กันกับดักราคา: ชื่อกลุ่มใหม่ต้องไม่ไปตรงกับแกนตารางราคา ไม่งั้นราคาหล่นไป product.price
  [!(back.data.pricing?.driverLabels ?? []).includes(GROUP), "ชื่อกลุ่มไปชนแกนตารางราคา (driverLabels)"],
  [(back.data.priceRates ?? []).every((r) => !(r.pricing?.driverLabels ?? []).includes(GROUP)), "ชื่อกลุ่มไปชนแกนตารางราคาของเรท"],
  [back.data.priceMin === 80 && back.data.priceMax === 100, "ช่วงราคาสินค้าเปลี่ยนไป"],
  [typeof back.data.savedAt === "string", "savedAt ไม่ใช่ ISO string"],
].filter(([ok]) => !ok);
if (fails.length) { console.error("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · ")); process.exit(1); }

console.log(`\n✓ กลุ่ม "${GROUP}" การ์ด 1 ใบ (${CHOICE}) + ภาพ อ่านกลับตรงทุกข้อ · savedAt =`, back.data.savedAt);
console.log("ราคาต่อชิ้นเท่าเดิมทุกช่วงจำนวน: 100 / 95 / 90 / 85 / 80");
