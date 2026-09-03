#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "LAPTOP BAG" (laptop-bag)
 *
 *   node scripts/laptop-bag-option-art.mjs            (วาดภาพลง .cache/laptop-bag/upload)
 *   node scripts/laptop-bag-option-art.mjs --write    (+ อัปโหลด storage + ตั้ง choice.imageSrc + อ่านกลับเทียบ)
 *
 * ทำไมต้องวาดเอง: แกลเลอรีมีรูปงานจริงแค่ 2 ใบ (ซับลิเมชั่นกับงานปัก) ถ่ายมุมเฉียง
 * ดูไม่ออกว่า 10/13/15 นิ้วต่างกันแค่ไหน และไม่มีรูปเทียบ "พิมพ์ 1 ด้าน / 2 ด้าน"
 * — สไตล์การ์ดยึดตาม drawstring-bag-option-art.mjs (ถุงผ้าหูรูด) ให้ทั้งร้านหน้าตาเดียวกัน
 *
 * ได้ 6 ไฟล์ (900x900 — แกลเลอรี/ปุ่มตัวเลือกครอปจัตุรัส):
 *   size-10.jpg   ขนาด 10 inch — ซองเล็กสุด
 *   size-13.jpg   ขนาด 13 inch
 *   size-15.jpg   ขนาด 15 inch — ซองใหญ่สุด
 *   print-sub.jpg พิมพ์ลาย (ระบบซับลิเมชั่น) — หมึกซึมลงเนื้อผ้า ลายเต็มใบชนขอบ
 *   side-1.jpg    สกรีน 1 ด้าน — หน้ามีลาย หลังเป็นผ้าพื้นสีดำ
 *   side-2.jpg    สกรีน 2 ด้าน (+฿10/ใบ) — มีลายทั้งสองด้าน
 *
 * ที่มาของตัวเลข: products.laptop-bag ใน DB (3 ก.ย. 69)
 *   pricing.cells ต่อขนาด × ช่วงจำนวน 1-10 / 11-29 / 30-49 / 50+ ใบ
 *   10" 320→260 · 13" 350→280 · 15" 390→320 · "2 ด้าน" extra 10
 * ⚠️ ไม่ใส่ตัวเลข ซม. ในภาพ — DB ไม่มีขนาดซองจริง มีแต่ขนาดจอที่ใส่ได้ (นิ้ว)
 *    สัดส่วนซองในภาพจึงสเกลตามขนาดจอ ไว้เทียบกันเองข้ามการ์ด (ก้นซองอยู่บรรทัดเดียวกันทุกใบ)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — แก้ภาพเมื่อไหร่ให้ขึ้นรุ่น VER ใหม่
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { mascotDataUri } from "./iducky-assets.mjs";

const MASCOT = await mascotDataUri("heart", 520);

const PRODUCT_ID = "laptop-bag";
const VER = "v3"; // v1 ซิปลอยกลางใบ → v2 ซิปพาดขอบบน → v3 ด้านหลังที่ไม่พิมพ์เป็นผ้าพื้นสีดำ
const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/laptop-bag/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
/** ผ้าซองโน้ตบุ๊ก: ครีมนวลแบบรูปงานจริง (ใบบุนวม) — ต่างจากพื้นการ์ดขาว */
const CLOTH = "#faf3e3";
const CLOTH_EDGE = "#ddcda8";
/** กุ๊นขอบ + ซิปสีเข้มตามรูปงานจริง */
const PIPING = "#1f2937";
const ZIP = "#9ca3af";
/** ด้านที่ไม่พิมพ์ลาย = ผ้าพื้น "สีดำ" (ผู้ใช้ยืนยัน 3 ก.ย. 69) — กุ๊นขอบต้องเข้มกว่าตัวผ้า ไม่งั้นใบกลายเป็นก้อนดำตัน */
const BACK = "#2f3540";
const BACK_EDGE = "#4b5563";
const BACK_PIPING = "#0b1220";
/** อะไหล่ซิป (หัว+หูดึง) สีเงินตามงานจริง — ต้องเห็นได้ทั้งบนใบครีมและใบดำ */
const HARDWARE = "#cbd5e1";
const HARDWARE_EDGE = "#64748b";

const frame = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>
  ${sub ? `<text x="${W / 2}" y="124" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">${sub}</text>` : ""}`;

const foot = (lines) =>
  lines
    .filter(Boolean)
    .map(
      (t, i, a) =>
        `<text x="${W / 2}" y="${H - 40 - (a.length - 1 - i) * 32}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">${t}</text>`
    )
    .join("");

/** ป้ายชี้ชิ้นส่วน — เส้นบาง ๆ + ข้อความ */
const callout = (x1, y1, x2, y2, text, anchor = "start") => `
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="2"/>
  <circle cx="${x1}" cy="${y1}" r="5" fill="#94a3b8"/>
  <text x="${x2 + (anchor === "end" ? -8 : 8)}" y="${y2 + 6}" font-family="${TH}" font-size="20" text-anchor="${anchor}" fill="${SUB}">${text}</text>`;

/** ทรงซองโน้ตบุ๊ก (มองด้านหน้า): สี่เหลี่ยมมุมมน กุ๊นขอบเข้ม + ซิปพาดด้านบน */
const sleeveGeom = (cx, bottom, w, h) => ({ cx, w, h, x: cx - w / 2, top: bottom - h, bottom });

const sleeveShape = (g, { fill, edge, clipId = "" } = {}) => {
  const r = Math.min(g.h * 0.16, 62);
  return `
    ${clipId ? `<clipPath id="${clipId}"><rect x="${g.x}" y="${g.top}" width="${g.w}" height="${g.h}" rx="${r}"/></clipPath>` : ""}
    <rect x="${g.x}" y="${g.top}" width="${g.w}" height="${g.h}" rx="${r}" fill="${fill}" stroke="${edge}" stroke-width="3"/>`;
};

/**
 * ซิป — พาดอยู่ "ขอบบนสุดของใบ" ตามงานจริง (ไม่ใช่เส้นลอยกลางใบ)
 * ฟันซิปคร่อมเส้นขอบบน · หัวซิป 2 ตัวชิดซ้าย หูดึงห้อยลงมาทางด้านหน้า
 * วาดเป็นตัวสุดท้ายเสมอ (หลังลายและหลังกุ๊นขอบ) ลายชนขอบจะได้ไม่ทับซิป
 */
const zipper = (g, color = PIPING) => {
  const r = Math.min(g.h * 0.16, 62);
  const zipY = g.top;                       // ขอบบนสุด = แนวซิป
  const zx1 = g.x + r * 0.72;               // เริ่ม/จบก่อนถึงมุมมน
  const zx2 = g.x + g.w - r * 0.72;
  const t = Math.max(3, g.h * 0.019);       // ครึ่งความสูงฟันซิป
  const n = Math.round((zx2 - zx1) / (t * 2.1));
  const teeth = Array.from({ length: n }, (_, i) => {
    const px = zx1 + ((zx2 - zx1) * i) / (n - 1);
    return `<line x1="${px}" y1="${zipY - t}" x2="${px}" y2="${zipY + t}" stroke="${ZIP}" stroke-width="${t * 0.95}" stroke-linecap="round"/>`;
  }).join("");
  /**
   * หัวซิป: ตัวสไลด์คร่อมราง + หูดึงห้อยลงด้านหน้า
   * อะไหล่เป็น "สีเงิน" คงที่ (ตามงานจริง) ไม่ใช้สีกุ๊นขอบ — ไม่งั้นบนใบผ้าพื้นสีดำจะจมหายไปทั้งตัว
   */
  const pull = (px) => `
    <rect x="${px - t * 2.3}" y="${zipY - t * 1.5}" width="${t * 4.6}" height="${t * 3}" rx="${t * 0.9}"
      fill="${HARDWARE}" stroke="${HARDWARE_EDGE}" stroke-width="${t * 0.3}"/>
    <path d="M${px} ${zipY + t * 1.5} l0 ${t * 1.3}" stroke="${HARDWARE_EDGE}" stroke-width="${t * 0.8}" stroke-linecap="round"/>
    <rect x="${px - t * 1.1}" y="${zipY + t * 2.6}" width="${t * 2.2}" height="${t * 4.4}" rx="${t * 1.1}"
      fill="none" stroke="${HARDWARE_EDGE}" stroke-width="${t * 0.85}"/>`;
  return `
    <!-- ผ้ากุ๊นสองข้างราง: เส้นบนคือขอบใบ เส้นล่างคือแถบผ้าที่เย็บติดซิป -->
    <line x1="${zx1 - t}" y1="${zipY - t * 1.6}" x2="${zx2 + t}" y2="${zipY - t * 1.6}" stroke="${color}" stroke-width="${t * 0.85}" stroke-linecap="round"/>
    <line x1="${zx1 - t}" y1="${zipY + t * 1.6}" x2="${zx2 + t}" y2="${zipY + t * 1.6}" stroke="${color}" stroke-width="${t * 0.85}" stroke-linecap="round"/>
    ${teeth}
    ${pull(zx1 + t * 2.6)}
    ${pull(zx1 + t * 8)}`;
};

/** เส้นกุ๊นขอบทับซ้ำ — วาดหลังใส่ลาย เพื่อให้ลายที่ชนขอบไม่กินเส้นขอบ */
const piping = (g, color = PIPING) => {
  const r = Math.min(g.h * 0.16, 62);
  return `<rect x="${g.x}" y="${g.top}" width="${g.w}" height="${g.h}" rx="${r}" fill="none" stroke="${color}" stroke-width="9"/>`;
};

/** ลายที่พิมพ์ — มาสคอตเป็ดของฝ่าย Content (แทนลายลูกค้า) */
const artwork = (cx, cy, box, opacity = 1) => {
  const aw = MASCOT.ratio >= 1 ? box : box * MASCOT.ratio;
  const ah = MASCOT.ratio >= 1 ? box / MASCOT.ratio : box;
  return `<image href="${MASCOT.uri}" x="${cx - aw / 2}" y="${cy - ah / 2}" width="${aw}" height="${ah}"
    preserveAspectRatio="xMidYMid meet" opacity="${opacity}"/>`;
};

/** ลายพื้นเต็มใบของงานซับลิเมชั่น — หัวใจ/จุดโทนฟ้าจาง กระจายชนขอบ (อยู่ใต้ clip ของตัวซอง) */
const fullPattern = (g) => {
  const dots = [];
  const cols = 6, rows = 5;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const px = g.x + g.w * ((c + (r % 2 ? 0.5 : 0)) / (cols - 0.5));
      const py = g.top + g.h * ((r + 0.4) / rows);
      dots.push(
        r % 2 === c % 2
          ? `<circle cx="${px}" cy="${py}" r="11" fill="#7dd3fc" opacity="0.55"/>`
          : `<path d="M${px} ${py + 8} c -10 -9 -16 -16 -8 -23 c 5 -4 8 -1 8 2 c 0 -3 3 -6 8 -2 c 8 7 2 14 -8 23 z" fill="#f9a8d4" opacity="0.6"/>`
      );
    }
  return dots.join("");
};

// ── ภาพ "ขนาด" — สเกลซองตามขนาดจอ ก้นซองอยู่บรรทัดเดียวกันทุกใบ ───────
/** ขนาดจอ (นิ้ว) → สัดส่วนใบ · 15" เป็นใบเต็มสเกล 1.00 */
const SIZES = {
  10: { scale: 0.74, price: [320, 260] },
  13: { scale: 0.88, price: [350, 280] },
  15: { scale: 1.0, price: [390, 320] },
};
const BASE_W = 640, BASE_H = 458, GROUND = 736; // ก้นซองบรรทัดเดียวกันทุกการ์ด

function sizeArt(inch) {
  const s = SIZES[inch];
  const g = sleeveGeom(W / 2, GROUND, BASE_W * s.scale, BASE_H * s.scale);
  const big = sleeveGeom(W / 2, GROUND, BASE_W, BASE_H); // เงาใบ 15" ไว้เทียบสเกล
  const ghost =
    inch === 15
      ? ""
      : `<rect x="${big.x}" y="${big.top}" width="${big.w}" height="${big.h}" rx="${Math.min(big.h * 0.16, 62)}"
           fill="none" stroke="#cbd5e1" stroke-width="3" stroke-dasharray="12 10"/>
         <text x="${big.x + 4}" y="${big.top - 14}" font-family="${TH}" font-size="19" fill="#94a3b8">เทียบขนาดใบ 15 นิ้ว</text>`;
  // โน้ตบุ๊กที่ใส่ได้ — เส้นประในใบ + เส้นทแยงบอกขนาดจอ
  const m = g.w * 0.1;
  const lx = g.x + m, ly = g.top + g.h * 0.2, lw = g.w - m * 2, lh = g.h - g.h * 0.2 - m;
  const laptop = `
    <rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="10" fill="none" stroke="#94a3b8" stroke-width="3" stroke-dasharray="10 8"/>
    <line x1="${lx}" y1="${ly + lh}" x2="${lx + lw}" y2="${ly}" stroke="#0891b2" stroke-width="3"/>
    <g transform="translate(${lx + lw * 0.5} ${ly + lh * 0.5})">
      <rect x="-56" y="-24" width="112" height="48" rx="12" fill="#ffffff" opacity="0.92"/>
      <text x="0" y="9" font-family="${TH}" font-size="30" font-weight="700" text-anchor="middle" fill="#0891b2">${inch}"</text>
    </g>`;

  const body = `
    ${title(`ขนาด ${inch} inch`, "ใส่โน้ตบุ๊กจอ " + inch + " นิ้วได้พอดี")}
    ${ghost}
    <ellipse cx="${g.cx}" cy="${GROUND + 16}" rx="${g.w * 0.46}" ry="12" fill="#0f172a" opacity="0.07"/>
    ${sleeveShape(g, { fill: CLOTH, edge: CLOTH_EDGE })}
    ${laptop}
    ${piping(g)}
    ${zipper(g)}
    ${callout(g.x + g.w * 0.78, g.top, W - 56, 208, "ซิปพาดขอบบน เปิดกว้างหยิบง่าย", "end")}
    ${foot([
      `฿${s.price[0]}/ใบ (1-10 ใบ) · 50 ใบขึ้นไป ฿${s.price[1]}/ใบ`,
      "ทุกขนาดพิมพ์ลายเต็มใบด้วยระบบซับลิเมชั่น",
    ])}`;
  return frame(body);
}

// ── ภาพ "ประเภทงาน" — ซับลิเมชั่นพิมพ์เต็มใบชนขอบ ─────────────────────
function printSubArt() {
  const g = sleeveGeom(W / 2, 660, 600, 430);
  const clip = "sleeveclip";
  const body = `
    ${title("พิมพ์ลาย (ระบบซับลิเมชั่น)", "หมึกซึมลงเนื้อผ้าด้วยความร้อน — พิมพ์เต็มใบชนขอบได้")}
    ${sleeveShape(g, { fill: CLOTH, edge: CLOTH_EDGE, clipId: clip })}
    <g clip-path="url(#${clip})">
      <rect x="${g.x}" y="${g.top}" width="${g.w}" height="${g.h}" fill="#eaf6fd"/>
      ${fullPattern(g)}
      ${artwork(g.cx, g.top + g.h * 0.54, g.h * 0.62, 0.92)}
    </g>
    ${piping(g)}
    ${zipper(g)}
    ${callout(g.x + 14, g.top + g.h * 0.75, 92, 782, "ลายชนขอบ ไม่มีกรอบขาว")}
    ${foot([
      "สัมผัสเรียบ ลายซึมเป็นเนื้อเดียวกับผ้า ไม่หนาตัว",
      "เริ่มต้น ฿320/ใบ (10 นิ้ว 1-10 ใบ) — ราคาตามขนาดและจำนวน",
    ])}`;
  return frame(body);
}

// ── ภาพ "พิมพ์กี่ด้าน" — วางด้านหน้า/ด้านหลังคู่กัน ──────────────────
function sideArt(sides) {
  const two = sides === 2;
  const w = 330, h = 236, gap = 46;
  const left = sleeveGeom(W / 2 - w / 2 - gap / 2, 520, w, h);
  const right = sleeveGeom(W / 2 + w / 2 + gap / 2, 520, w, h);

  const panel = (g, label, printed, clipId) => `
    ${sleeveShape(g, printed ? { fill: CLOTH, edge: CLOTH_EDGE, clipId } : { fill: BACK, edge: BACK_EDGE, clipId })}
    ${
      printed
        ? `<g clip-path="url(#${clipId})">
             <rect x="${g.x}" y="${g.top}" width="${g.w}" height="${g.h}" fill="#eaf6fd"/>
             ${fullPattern(g)}
             ${artwork(g.cx, g.top + g.h * 0.56, g.h * 0.6, 0.92)}
           </g>
           `
        : `<text x="${g.cx}" y="${g.top + g.h * 0.68}" font-family="${TH}" font-size="22" text-anchor="middle" fill="#cbd5e1">ผ้าพื้นสีดำ ไม่พิมพ์ลาย</text>`
    }
    ${piping(g, printed ? PIPING : BACK_PIPING)}
    ${zipper(g, printed ? PIPING : BACK_PIPING)}
    <text x="${g.cx}" y="${g.bottom + 46}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">${label}</text>`;

  const body = `
    ${title(two ? "สกรีน 2 ด้าน" : "สกรีน 1 ด้าน", two ? "มีลายทั้งด้านหน้าและด้านหลัง" : "มีลายด้านหน้า · ด้านหลังเป็นผ้าพื้นสีดำ")}
    ${panel(left, "ด้านหน้า", true, "sideL")}
    ${panel(right, "ด้านหลัง", two, "sideR")}
    <g transform="translate(${W / 2} 700)">
      <rect x="-250" y="-38" width="500" height="76" rx="20" fill="${two ? "#ecfeff" : "#f8fafc"}" stroke="${two ? "#a5f3fc" : "#e2e8f0"}" stroke-width="2"/>
      <text x="0" y="9" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="${two ? "#0e7490" : "#475569"}">${
        two ? "คิดเพิ่ม ใบละ ฿10" : "ราคาปกติตามตารางราคา"
      }</text>
    </g>
    ${foot(
      two
        ? ["ลายด้านหน้ากับด้านหลังใช้คนละลายได้", "ใช้ได้ทุกขนาด (10 / 13 / 15 นิ้ว)"]
        : ["ด้านหลังเป็นเนื้อผ้าพื้นสีดำ ไม่มีลาย", "ใช้ได้ทุกขนาด (10 / 13 / 15 นิ้ว)"]
    )}`;
  return frame(body);
}

const ART = {
  "size-10": { svg: sizeArt(10), choice: "10 inch", group: "ขนาด", note: "ขนาด 10 นิ้ว" },
  "size-13": { svg: sizeArt(13), choice: "13 inch", group: "ขนาด", note: "ขนาด 13 นิ้ว" },
  "size-15": { svg: sizeArt(15), choice: "15 inch", group: "ขนาด", note: "ขนาด 15 นิ้ว" },
  "print-sub": { svg: printSubArt(), choice: "พิมพ์ลาย (ระบบซับลิเมชั่น)", group: "ประเภทงาน", note: "ซับลิเมชั่น — ลายเต็มใบ" },
  "side-1": { svg: sideArt(1), choice: "สกรีน 1 ด้าน", group: "พิมพ์กี่ด้าน", note: "สกรีน 1 ด้าน — หลังผ้าพื้นสีดำ" },
  "side-2": { svg: sideArt(2), choice: "สกรีน 2 ด้าน", group: "พิมพ์กี่ด้าน", note: "สกรีน 2 ด้าน — หน้า+หลัง (+฿10)" },
};

const files = [];
for (const [name, art] of Object.entries(ART)) {
  const buf = await sharp(Buffer.from(art.svg)).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const file = `${name}-${VER}.jpg`;
  writeFileSync(`${OUT}/${file}`, buf);
  files.push({ ...art, name, file, path: `${OUT}/${file}` });
  console.log(`🖼  ${file}  ${Math.round(buf.length / 1024)} KB — ${art.note}`);
}

const WRITE = process.argv.includes("--write");
if (!WRITE) { console.log("\n(ยังไม่เขียน DB — รันด้วย --write เมื่อภาพผ่านตา)"); process.exit(0); }

// ── อัปโหลด storage + ตั้ง choice.imageSrc (แบบ drawstring-bag-option-art.mjs) ──
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

for (const f of files) {
  const key = `products/${PRODUCT_ID}/${f.file}`;
  const { error } = await sb.storage.from("product-images").upload(key, readFileSync(f.path), { contentType: "image/jpeg", upsert: true });
  if (error) { console.error("อัปโหลดพัง", key, error); process.exit(1); }
  f.url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${key}`;
  console.log("อัปโหลดแล้ว", f.url);
}

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (readErr) { console.error(readErr); process.exit(1); }
const data = row.data;
for (const f of files) {
  const grp = (data.options ?? []).find((o) => o.label === f.group);
  const c = grp?.choices?.find((c) => c.name === f.choice);
  if (!c) { console.error(`ไม่เจอตัวเลือก "${f.choice}" ในกลุ่ม "${f.group}"`); process.exit(1); }
  c.imageSrc = f.url;
}
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) { console.error("update พัง/0 แถว", updErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
for (const f of files) {
  const got = back.data.options.find((o) => o.label === f.group)?.choices?.find((c) => c.name === f.choice)?.imageSrc;
  if (got !== f.url) { console.error("อ่านกลับไม่ตรง!", f.choice, got); process.exit(1); }
}
console.log(`✓ ตั้ง imageSrc ครบ ${files.length} ตัวเลือก อ่านกลับตรงทุกตัว · savedAt =`, back.data.savedAt);
