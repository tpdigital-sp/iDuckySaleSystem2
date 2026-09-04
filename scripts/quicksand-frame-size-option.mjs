#!/usr/bin/env node
/**
 * กรอบรูปน้ำกลิตเตอร์ (photoframe-5) — ภาพประกอบกลุ่มตัวเลือก "ขนาด" + แสดงเป็นการ์ด
 *
 *   node scripts/quicksand-frame-size-option.mjs           (วาดภาพลง .cache/photoframe-5/upload ดูก่อน)
 *   node scripts/quicksand-frame-size-option.mjs --write   (+ อัปโหลด storage + เขียน options + อ่านกลับเทียบ)
 *
 * ใบสเปค 10_อะคริลิค/นาฬิกาน้ำ-กรอบรูปน้ำ-อคลเฟรม/P-nนาฬิกาน้ำ-01.jpg (Quicksand Photo Frames):
 *   • มี 2 ขนาด — 6.3x9.4x2.5 cm (เริ่ม 190.-) · 10.5x15.5 cm (เริ่ม 250.-) "กลิตเตอร์ต่างกัน"
 *   • ใส่รูปหรือการ์ด ขนาด 5.4x8.6 ได้ · มีน้ำและกลิตเตอร์ข้างใน เอาออกไม่ได้ · พิมพ์ UV
 * รูปงานจริงในหน้าสินค้า: หน้ากรอบพิมพ์พื้นพาสเทลม่วง-ชมพู เจาะช่องวงรีขอบหยักขาว ข้างในเป็นน้ำ+กลิตเตอร์
 *   ตัวเล็ก = เกล็ดกลม + ดาว · ตัวใหญ่ = เส้นเข็มระยิบ + เกล็ดดาว (ดูภาพประกอบสองใบในใบสเปค)
 *
 * ⚠️ ชื่อตัวเลือกเป็นคีย์ตารางราคา (pricing.cells / priceRates[].pricing.cells + driverLabels ["ขนาด"])
 *    — ห้ามเปลี่ยนชื่อในสคริปต์นี้ เติมแค่ imageSrc + desc + display cards ([[iducky-price-driver-trap]])
 * ⚠️ ปุ่มการ์ดครอปกลางภาพ (48×48 จาก 900×900 = พิกัด 300–600) — ป้ายขนาดจึงคร่อมกลางภาพพอดี
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช 30 วัน) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 420);

const PRODUCT_ID = "photoframe-5";
const VER = "v1";
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/photoframe-5/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const SIZE_GROUP = "ขนาด";
/** ชื่อ = คีย์ตารางราคา ห้ามแก้ · CM ร่วมสเกลเดียวกันทั้งสองใบ ผู้ใช้จะได้เทียบขนาดจริงได้ */
const SIZES = [
  {
    name: "6.3x9.4x2.5cm",
    file: `size-63x94-${VER}.jpg`,
    w: 6.3, h: 9.4, t: 2.5,
    badge: "6.3×9.4",
    title: "ขนาด 6.3 × 9.4 × 2.5 ซม.",
    sub: "กรอบเล็ก พกง่าย ตั้งโต๊ะได้ · กลิตเตอร์เกล็ดกลม + ดาว",
    desc: "กรอบเล็ก หนา 2.5 ซม. · กลิตเตอร์เกล็ดกลม + ดาว · ใส่รูป/การ์ด 5.4 × 8.6 ซม. ได้",
    glitter: "sequin",
  },
  {
    name: "10.5x15.5x3cm",
    file: `size-105x155-${VER}.jpg`,
    w: 10.5, h: 15.5, t: 3,
    badge: "10.5×15.5",
    title: "ขนาด 10.5 × 15.5 × 3 ซม.",
    sub: "กรอบใหญ่ ตั้งโชว์เด่น · กลิตเตอร์เส้นระยิบ + เกล็ดดาว",
    desc: "กรอบใหญ่ หนา 3 ซม. · กลิตเตอร์เส้นระยิบ + เกล็ดดาว · ใส่รูป/การ์ด 5.4 × 8.6 ซม. ได้",
    glitter: "needle",
  },
];

const W = 900;
const H = 900;
const CM = 33;
const BADGE_Y = 556; // กลางป้ายขนาด — ต่ำกว่ากลางภาพเล็กน้อย ให้พ้นช่องน้ำ แต่ยังอยู่ในกรอบครอป 300–600 // สเกลร่วม: 1 ซม. = 33 px → ใบใหญ่ 347×512 px, ใบเล็ก 208×310 px
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";

/** สุ่มแบบมีเมล็ด — รันกี่ครั้งกลิตเตอร์ก็ตกที่เดิม (ไฟล์จะได้ไม่เปลี่ยนทุกครั้งที่รัน) */
const rnd = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** ลูกศรวัดขนาด — เส้นบาง + ขีดปลายสองข้าง + ป้ายตัวเลข (ทรงเดียวกับ canvas-calendar-size-option) */
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

/** ดาวห้าแฉก */
const star = (cx, cy, r, fill, op = 1, rot = 0) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.42 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" opacity="${op}"/>`;
};

/** ประกายสี่แฉก */
const spark = (x, y, s, color = "#ffffff", op = 0.95) =>
  `<path d="M ${x} ${y - s} Q ${x + s * 0.2} ${y - s * 0.2} ${x + s} ${y} Q ${x + s * 0.2} ${y + s * 0.2} ${x} ${y + s} Q ${x - s * 0.2} ${y + s * 0.2} ${x - s} ${y} Q ${x - s * 0.2} ${y - s * 0.2} ${x} ${y - s} Z" fill="${color}" opacity="${op}"/>`;

const HOLO = ["#ffffff", "#e0f2fe", "#fce7f3", "#ede9fe", "#ccfbf1", "#fef9c3"];

/** เม็ดกลิตเตอร์ในช่องน้ำ — ตัวเล็ก: เกล็ดกลม+ดาว · ตัวใหญ่: เส้นเข็ม+เกล็ดดาว (ต่างกันตามใบสเปค) */
function glitterBits(kind, cx, cy, a, b, seed) {
  const r = rnd(seed);
  const out = [];
  const n = kind === "needle" ? 620 : 420;
  for (let i = 0; i < n; i++) {
    /* สุ่มจุดในวงรี (คูณรากที่สองให้กระจายทั่ว ไม่กองกลาง) แล้วถ่วงให้ตกก้นวงรีเหมือนน้ำจริง */
    /* กระจายทั่ววงรี แต่ถ่วงให้กองก้นเหมือนกลิตเตอร์จมน้ำจริง (ยกกำลัง <1 = มวลไปทางล่าง) */
    const px = cx + (r() * 2 - 1) * a * 0.95;
    const py = cy - b * 0.95 + Math.pow(r(), 0.62) * 1.9 * b * 0.95;
    if ((px - cx) ** 2 / (a * 0.95) ** 2 + (py - cy) ** 2 / (b * 0.95) ** 2 > 1) continue;
    const col = HOLO[Math.floor(r() * HOLO.length)];
    if (kind === "needle") {
      /* เส้นเข็มเอียงสุ่ม — กลิตเตอร์ของกรอบใหญ่ */
      const len = 9 + r() * 13;
      const rot = r() * 180;
      out.push(`<rect x="${(px - 0.9).toFixed(1)}" y="${(py - len / 2).toFixed(1)}" width="1.9" height="${len.toFixed(1)}" rx="0.9" fill="${col}" opacity="${(0.55 + r() * 0.4).toFixed(2)}" transform="rotate(${rot.toFixed(0)} ${px.toFixed(1)} ${py.toFixed(1)})"/>`);
      if (i % 14 === 0) out.push(star(px, py, 5 + r() * 3, col, 0.9, r() * 3));
    } else {
      /* เกล็ดกลม + ดาว — กลิตเตอร์ของกรอบเล็ก */
      if (i % 5 === 0) out.push(star(px, py, 4 + r() * 3.5, col, 0.92, r() * 3));
      else out.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(2.2 + r() * 2.6).toFixed(1)}" fill="${col}" opacity="${(0.6 + r() * 0.38).toFixed(2)}"/>`);
    }
  }
  /* ผงกลิตเตอร์ละเอียดคลุมทั้งช่อง */
  for (let i = 0; i < 320; i++) {
    const ang = r() * Math.PI * 2;
    const rad = Math.sqrt(r());
    const px = cx + Math.cos(ang) * rad * a * 0.93;
    const py = cy + Math.sin(ang) * rad * b * 0.93;
    out.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(0.6 + r() * 0.9).toFixed(1)}" fill="#ffffff" opacity="${(0.35 + r() * 0.5).toFixed(2)}"/>`);
  }
  return out.join("");
}

/** ผงกลิตเตอร์บนพื้นพิมพ์ UV รอบช่องวงรี */
function printSpeckles(x, y, w, h, seed) {
  const r = rnd(seed);
  let s = "";
  for (let i = 0; i < 420; i++) {
    s += `<circle cx="${(x + r() * w).toFixed(1)}" cy="${(y + r() * h).toFixed(1)}" r="${(0.7 + r() * 1.3).toFixed(1)}" fill="#ffffff" opacity="${(0.35 + r() * 0.5).toFixed(2)}"/>`;
  }
  return s;
}

/**
 * ภาพหนึ่งขนาด — กล่องอะคริลิคใส (เห็นความหนาเป็นสามมิติ) หน้าพิมพ์ UV พาสเทล
 * เจาะช่องวงรีขอบหยักขาว ข้างในน้ำ+กลิตเตอร์ + มาสคอตแทนรูป/การ์ดของลูกค้า
 * ลูกศรวัดกว้าง×สูง + ป้ายตัวเลขคร่อมกลางภาพ (ที่ปุ่มการ์ดครอปมาโชว์)
 */
function sizeArt(s) {
  const bw = s.w * CM;
  const bh = s.h * CM;
  const dx = s.t * CM * 0.55; // ความหนาเอียงไปทางขวา
  const dy = s.t * CM * 0.34;
  const cx = W / 2;
  const x0 = cx - (bw + dx) / 2;
  const y0 = 470 - bh / 2 + dy / 2;
  const fx = cx; // กลางหน้ากรอบ
  const fy = y0 + bh / 2;

  /* ช่องวงรี — ขอบหยักขาวเป็นวงกลมเรียงรอบวงรี (ตามงานจริง) */
  const a = bw * 0.37;
  const b = bh * 0.36;
  const scallopR = Math.max(6, bw * 0.032);
  const nScallop = Math.round((Math.PI * (a + b)) / (scallopR * 1.55));
  let scallops = "";
  for (let i = 0; i < nScallop; i++) {
    const t = (i / nScallop) * Math.PI * 2;
    scallops += `<circle cx="${(fx + Math.cos(t) * a).toFixed(1)}" cy="${(fy + Math.sin(t) * b).toFixed(1)}" r="${scallopR.toFixed(1)}" fill="#ffffff"/>`;
  }

  const mh = b * 1.15;
  const mw = mh * MASCOT.ratio;
  const seed = Math.round(s.w * 100);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- พื้นพิมพ์ UV พาสเทลม่วง→ชมพู (ตามรูปงานจริง) -->
    <linearGradient id="uvPrint" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ddd6fe"/>
      <stop offset="0.45" stop-color="#ede9fe"/>
      <stop offset="1" stop-color="#fbcfe8"/>
    </linearGradient>
    <!-- น้ำในช่องวงรี -->
    <radialGradient id="water" cx="0.42" cy="0.3" r="0.9">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.6" stop-color="#f2f6fb"/>
      <stop offset="1" stop-color="#dfe7f1"/>
    </radialGradient>
    <!-- อะคริลิคใสด้านข้าง/ด้านบน -->
    <linearGradient id="acrTop" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eef6fb"/>
      <stop offset="1" stop-color="#cfe0ea"/>
    </linearGradient>
    <linearGradient id="acrSide" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#dceaf2"/>
      <stop offset="1" stop-color="#b9cfdc"/>
    </linearGradient>
    <clipPath id="win"><ellipse cx="${fx}" cy="${fy}" rx="${a}" ry="${b}"/></clipPath>
    <clipPath id="face"><rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" rx="${bw * 0.035}"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <text x="${cx}" y="92" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${s.title}</text>
  <text x="${cx}" y="132" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${s.sub}</text>

  <!-- เงากล่อง -->
  <rect x="${x0 + 10}" y="${y0 + bh - 10}" width="${bw + dx}" height="26" rx="13" fill="#0f172a" opacity="0.10"/>

  <!-- ด้านบน + ด้านข้าง = ความหนาอะคริลิคใส -->
  <polygon points="${x0},${y0} ${x0 + dx},${y0 - dy} ${x0 + bw + dx},${y0 - dy} ${x0 + bw},${y0}" fill="url(#acrTop)" stroke="#b7cdd9" stroke-width="1.5"/>
  <polygon points="${x0 + bw},${y0} ${x0 + bw + dx},${y0 - dy} ${x0 + bw + dx},${y0 + bh - dy} ${x0 + bw},${y0 + bh}" fill="url(#acrSide)" stroke="#b7cdd9" stroke-width="1.5"/>

  <!-- หน้ากรอบ: พื้นพิมพ์ UV + ผงกลิตเตอร์ -->
  <rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" rx="${bw * 0.035}" fill="url(#uvPrint)" stroke="#cbd5e1" stroke-width="2"/>
  <g clip-path="url(#face)">${printSpeckles(x0, y0, bw, bh, seed + 7)}</g>

  <!-- ช่องน้ำ+กลิตเตอร์ + รูป/การ์ดของลูกค้า (แทนด้วยมาสคอต) -->
  <g clip-path="url(#win)">
    <ellipse cx="${fx}" cy="${fy}" rx="${a}" ry="${b}" fill="url(#water)"/>
    <image href="${MASCOT.uri}" x="${fx - mw / 2}" y="${fy - mh / 2}" width="${mw}" height="${mh}" preserveAspectRatio="xMidYMid meet" opacity="0.85"/>
    ${glitterBits(s.glitter, fx, fy, a, b, seed)}
    <!-- แสงสะท้อนผิวน้ำ -->
    <ellipse cx="${fx - a * 0.35}" cy="${fy - b * 0.5}" rx="${a * 0.42}" ry="${b * 0.24}" fill="#ffffff" opacity="0.3"/>
  </g>
  ${scallops}
  <ellipse cx="${fx}" cy="${fy}" rx="${a}" ry="${b}" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.9"/>

  <!-- ไฮไลต์อะคริลิคหน้ากรอบ -->
  <g clip-path="url(#face)">
    <polygon points="${x0},${y0 + bh * 0.12} ${x0 + bw * 0.3},${y0} ${x0 + bw * 0.52},${y0} ${x0},${y0 + bh * 0.36}" fill="#ffffff" opacity="0.22"/>
  </g>
  ${spark(x0 + bw * 0.16, y0 + bh * 0.09, 13)}
  ${spark(x0 + bw * 0.86, y0 + bh * 0.93, 10, "#ffffff", 0.85)}

  <!-- ป้ายขนาดคร่อมกลางภาพ — ปุ่มการ์ดครอปเห็นแค่กรอบกลาง 300–600 -->
  <rect x="${cx - 132}" y="${BADGE_Y - 33}" width="264" height="74" rx="18" fill="#0f172a" opacity="0.12"/>
  <rect x="${cx - 132}" y="${BADGE_Y - 37}" width="264" height="74" rx="18" fill="#ffffff" opacity="0.96" stroke="#cbd5e1" stroke-width="2"/>
  <text x="${cx}" y="${BADGE_Y + 15}" font-family="${TH}" font-size="46" font-weight="700" text-anchor="middle" fill="${INK}">${s.badge}</text>

  <!-- ลูกศรวัดสองแกน + ความหนา -->
  ${dim(x0, y0 + bh + 42, x0 + bw, y0 + bh + 42, `${s.w} ซม.`)}
  ${dim(x0 - 40, y0, x0 - 40, y0 + bh, `${s.h} ซม.`)}
  <line x1="${x0 + bw + dx - 4}" y1="${y0 + bh * 0.3}" x2="${x0 + bw + dx + 46}" y2="${y0 + bh * 0.22}" stroke="${SUB}" stroke-width="2.5"/>
  <circle cx="${x0 + bw + dx / 2}" cy="${y0 + bh * 0.3 - dy / 2}" r="4" fill="${SUB}"/>
  <line x1="${x0 + bw + dx / 2}" y1="${y0 + bh * 0.3 - dy / 2}" x2="${x0 + bw + dx - 4}" y2="${y0 + bh * 0.3}" stroke="${SUB}" stroke-width="2.5"/>
  <text x="${x0 + bw + dx + 54}" y="${y0 + bh * 0.22 + 8}" font-family="${TH}" font-size="24" font-weight="700" fill="${SUB}">หนา ${s.t} ซม.</text>

  <text x="${cx}" y="${H - 42}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">พิมพ์ลาย UV เต็มหน้ากรอบ · ข้างในมีน้ำ+กลิตเตอร์ เขย่าเล่นได้ (เอาออกไม่ได้)</text>
</svg>`;
}

const built = [];
for (const s of SIZES) {
  const buf = await sharp(Buffer.from(sizeArt(s))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${s.file}`, buf);
  /* ครอปกลาง 300–600 ไว้ตรวจว่าที่เห็นบนปุ่มการ์ดยังบอกขนาดได้ */
  await sharp(buf).extract({ left: 300, top: 300, width: 300, height: 300 }).toFile(`${OUT}/_thumb-${s.file}`);
  built.push({ ...s, buf });
  console.log(`🖼  ${OUT}/${s.file}  ${Math.round(buf.length / 1024)} KB — ${s.title} (+ _thumb ครอปกลาง)`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + เขียน options ─────────────────────────────────
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const s of built) {
  const key = `products/${PRODUCT_ID}/${s.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, s.buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  s.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", s.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
const options = data.options ?? [];
const at = options.findIndex((o) => o.label === SIZE_GROUP);
if (at < 0) { console.error(`ไม่เจอกลุ่ม "${SIZE_GROUP}"`); process.exit(1); }

/* เติมภาพ/คำอธิบายทับตัวเดิม โดยคงชื่อ (คีย์ตารางราคา) และฟิลด์อื่นของตัวเลือกไว้ครบ */
const group = options[at];
group.display = "cards";
group.choices = group.choices.map((c) => {
  const s = built.find((b) => b.name === c.name);
  if (!s) { console.error("เจอตัวเลือกที่ไม่มีในสคริปต์ (ชื่ออาจถูกแก้):", c.name); process.exit(1); }
  return { ...c, imageSrc: s.url, desc: s.desc };
});
if (group.choices.length !== built.length) { console.error("จำนวนตัวเลือกไม่ตรงกับภาพที่วาด", group.choices.map((c) => c.name)); process.exit(1); }

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const g = back.data.options.find((o) => o.label === SIZE_GROUP);
if (g?.display !== "cards") { console.error("อ่านกลับ display ไม่เป็น cards", g?.display); process.exit(1); }
for (const s of built) {
  const c = g.choices.find((x) => x.name === s.name);
  if (c?.imageSrc !== s.url || c?.desc !== s.desc) { console.error("อ่านกลับตัวเลือกไม่ตรง!", s.name, c); process.exit(1); }
}
/* กันเผลอ: คีย์ตารางราคาต้องยังตรงกับชื่อตัวเลือกทุกใบ (ไม่งั้นราคาหล่นไป product.price เงียบ ๆ) */
for (const p of [back.data.pricing, ...(back.data.priceRates ?? []).map((r) => r.pricing)]) {
  for (const s of built) if (!p?.cells?.[s.name]) { console.error("คีย์ราคาหาย!", s.name, Object.keys(p?.cells ?? {})); process.exit(1); }
}
console.log(`✓ กลุ่ม "${SIZE_GROUP}" เป็นการ์ด + ภาพ ${built.length} ใบ · คีย์ตารางราคาครบ · savedAt =`, back.data.savedAt);
