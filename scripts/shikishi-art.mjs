#!/usr/bin/env node
/**
 * ภาพประกอบตัวเลือกของ "SHIKISHI (ชิกิชิ)" — การ์ดบอร์ดหนา 2mm ขอบมีสี
 *
 *   node scripts/shikishi-art.mjs [--out=<dir>]
 *
 * ที่มาของภาพแยกเป็น 2 ทาง:
 *
 * 1) ภาพฟิล์มเคลือบจากคลังตัวเลือกกลางของร้าน (products/preset-coating/*)
 *    ใช้ทำการ์ด "เคลือบเงา / เคลือบด้าน / เคลือบพิเศษ" — ผิวฟิล์มที่ลูกค้าเห็นเป็นของจริงจากงานร้าน
 *    (ผิวฟิล์มย่อย 10 แบบในกลุ่ม "เคลือบ" ลิงก์คลัง preset-2 ตรง ๆ ไม่ต้องอัปซ้ำ)
 *
 * 2) วาดเอง — ขนาด 7 แบบ (ตามสเกลจริงเทียบแผ่น A3) · สีขอบ 4 สี · โครงสร้างการ์ดบอร์ด 2mm ·
 *    การ์ด "ไม่เคลือบ" · การ์ดคละลาย
 *    รูปงานจริงบนหน้าเว็บมีแค่ขอบทองกับขอบโฮโลแกรม และไม่มีป้ายบอกว่าใบไหนขนาดไหน
 *    เอามาแปะเป็นภาพตัวเลือกตรง ๆ จะกลายเป็นบอกลูกค้าผิด — จึงวาดชุดเดียวกันทั้งหมดให้เทียบกันได้
 *
 * ภาพฟอยล์ (1/2 เลเยอร์ · สีฟอยล์ 4 สี) ไม่ได้ทำที่นี่ — ใช้ไฟล์เดิมของร้านที่ photocard-digital
 * รูปงานจริงสำหรับ "แกลเลอรี" ก็ไม่ได้ทำที่นี่ — shikishi-apply.mjs ดึงจากหน้าเว็บให้เอง
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ตอนอัป ครั้งหน้าขึ้น v2
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT = ((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1] || ".cache/shikishi/upload").replace(/\/$/, "");
mkdirSync(OUT, { recursive: true });

const W = 900;
const H = 900;
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const CYAN = "#0891b2";
const PAPER = "#f8fafc";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const frame = (body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${DEFS}${defs}</defs>
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const title = (t, sub) => `
  <text x="${W / 2}" y="86" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${INK}">${esc(t)}</text>
  ${sub ? `<text x="${W / 2}" y="128" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">${esc(sub)}</text>` : ""}`;

const foot = (lines) =>
  lines
    .map((l, i) => `<text x="${W / 2}" y="${812 + i * 34}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">${esc(l)}</text>`)
    .join("");

const save = (name, buf) => {
  writeFileSync(`${OUT}/${name}.jpg`, buf);
  console.log(`   ${name}.jpg  ${Math.round(buf.length / 1024)} KB`);
};
const saveSvg = async (name, svg) =>
  save(name, await sharp(Buffer.from(svg)).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer());

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } });
  if (!res.ok) throw new Error(`โหลด ${url} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** ไฟล์ในคลังฟิล์มเคลือบของร้าน (สินค้าตัวอื่นใช้ไฟล์ชุดนี้อยู่แล้ว) */
const COAT_BASE = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/preset-coating";

/* ── ขอบโลหะ 4 สี (ไล่เฉดแบบแผ่นฟอยล์ — มีทั้งช่วงสว่างและช่วงเงา) ── */

const BORDERS = [
  {
    key: "silver",
    name: "ขอบสีเงิน",
    stops: ["#ffffff", "#cbd5e1", "#f8fafc", "#94a3b8", "#e2e8f0"],
    edge: "#94a3b8",
    note: "โทนเย็น เข้ากับงานพิมพ์แทบทุกโทนสี",
  },
  {
    key: "gold",
    name: "ขอบสีทอง",
    stops: ["#fff6c9", "#e3b53d", "#fffbe6", "#b8860b", "#f5d878"],
    edge: "#b8860b",
    note: "ยอดนิยม — ตัดกับงานพิมพ์โทนสว่างได้ชัด",
  },
  {
    key: "rosegold",
    name: "ขอบสีโรสโกลด์",
    stops: ["#ffe4d6", "#e0a184", "#fff2ea", "#c2765a", "#f6c9b3"],
    edge: "#c2765a",
    note: "โทนอุ่นชมพูทอง เข้ากับงานพาสเทล",
  },
  {
    key: "hologram",
    name: "ขอบสีโฮโลแกรม",
    stops: ["#ffd7ec", "#c9e6ff", "#d6ffe6", "#fff4c2", "#e3d2ff", "#ffd7ec"],
    edge: "#a5b4cf",
    note: "เหลือบรุ้ง สีเปลี่ยนตามมุมมองและแสง",
  },
];

/** เฉดไล่สีของขอบแต่ละสี + ฉากลายพิมพ์ตัวอย่าง (ประกาศครั้งเดียว ใช้ซ้ำทุกการ์ด) */
const DEFS = `
${BORDERS.map(
  (b) => `<linearGradient id="bd-${b.key}" x1="0" y1="0" x2="1" y2="1">
    ${b.stops.map((c, i) => `<stop offset="${((i / (b.stops.length - 1)) * 100).toFixed(0)}%" stop-color="${c}"/>`).join("")}
  </linearGradient>`
).join("")}
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#ffd7e5"/><stop offset="55%" stop-color="#f9b8cf"/><stop offset="100%" stop-color="#f7a8c4"/>
</linearGradient>`;

/**
 * ลายพิมพ์ตัวอย่างบนหน้าการ์ด (ภูเขา · พระอาทิตย์ · สะพานแดง) — เลียนแบบงานจริงบนหน้าเว็บร้าน
 * เป็นภาพ "ตัวอย่างลาย" เฉย ๆ ลูกค้าส่งลายอะไรมาก็พิมพ์ตามนั้น
 */
function scene(x, y, w, h, id) {
  const s = Math.min(w, h);
  return `<g clip-path="url(#clip-${id})">
    <clipPath id="clip-${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#sky)"/>
    <circle cx="${x + w * 0.72}" cy="${y + h * 0.24}" r="${s * 0.1}" fill="#fff1f6" opacity="0.95"/>
    <path d="M ${x} ${y + h * 0.62} L ${x + w * 0.34} ${y + h * 0.3} L ${x + w * 0.52} ${y + h * 0.44}
             L ${x + w * 0.66} ${y + h * 0.33} L ${x + w} ${y + h * 0.6} L ${x + w} ${y + h} L ${x} ${y + h} Z" fill="#3b4a80"/>
    <path d="M ${x + w * 0.34} ${y + h * 0.3} L ${x + w * 0.24} ${y + h * 0.39} L ${x + w * 0.44} ${y + h * 0.39} Z" fill="#eef2ff"/>
    <path d="M ${x} ${y + h * 0.78} Q ${x + w * 0.3} ${y + h * 0.62} ${x + w * 0.62} ${y + h * 0.78}
             T ${x + w} ${y + h * 0.74} L ${x + w} ${y + h} L ${x} ${y + h} Z" fill="#e8437a"/>
    <path d="M ${x} ${y + h * 0.9} Q ${x + w * 0.42} ${y + h * 0.79} ${x + w} ${y + h * 0.92} L ${x + w} ${y + h} L ${x} ${y + h} Z" fill="#f7c6d8"/>
    <g stroke="#c62a63" stroke-width="${Math.max(2, s * 0.012)}" fill="none">
      <path d="M ${x + w * 0.1} ${y + h * 0.86} Q ${x + w * 0.45} ${y + h * 0.73} ${x + w * 0.86} ${y + h * 0.85}"/>
      ${Array.from({ length: 7 }, (_, i) => {
        const t = 0.14 + i * 0.11;
        const px = x + w * t;
        const py = y + h * (0.855 - Math.sin(Math.PI * ((t - 0.1) / 0.76)) * 0.09);
        return `<path d="M ${px.toFixed(1)} ${py.toFixed(1)} L ${px.toFixed(1)} ${(py + h * 0.07).toFixed(1)}"/>`;
      }).join("")}
    </g>
  </g>`;
}

/**
 * ชิกิชิ 1 ใบ — ขอบโลหะรอบนอก + หน้ากระดาษพิมพ์ลายด้านใน
 * bw = ความหนาขอบเป็นสัดส่วนของด้านสั้น (งานจริงขอบราว 4-5 มม.)
 */
function board(x, y, w, h, borderKey, { id = borderKey, art = true, bw = 0.045 } = {}) {
  const b = Math.max(6, Math.min(w, h) * bw);
  return `<g>
    <rect x="${x + 5}" y="${y + 7}" width="${w}" height="${h}" rx="4" fill="#0f172a" opacity="0.1"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="url(#bd-${borderKey})" stroke="#94a3b8" stroke-width="1.5"/>
    ${
      art
        ? scene(x + b, y + b, w - b * 2, h - b * 2, id)
        : `<rect x="${x + b}" y="${y + b}" width="${w - b * 2}" height="${h - b * 2}" fill="#ffffff"/>`
    }
    <rect x="${x + b}" y="${y + b}" width="${w - b * 2}" height="${h - b * 2}" fill="none" stroke="#0f172a" stroke-opacity="0.12" stroke-width="1"/>
  </g>`;
}

/** เส้นบอกขนาดพร้อมหัวท้าย (แนวนอน/แนวตั้ง) */
const dimH = (x1, x2, y, label) => `<g stroke="${CYAN}" stroke-width="2.5" fill="none">
    <path d="M ${x1} ${y} L ${x2} ${y}"/><path d="M ${x1} ${y - 9} L ${x1} ${y + 9} M ${x2} ${y - 9} L ${x2} ${y + 9}"/>
  </g>
  <text x="${(x1 + x2) / 2}" y="${y + 34}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${CYAN}">${esc(label)}</text>`;
const dimV = (y1, y2, x, label, side = "left") => `<g stroke="${CYAN}" stroke-width="2.5" fill="none">
    <path d="M ${x} ${y1} L ${x} ${y2}"/><path d="M ${x - 9} ${y1} L ${x + 9} ${y1} M ${x - 9} ${y2} L ${x + 9} ${y2}"/>
  </g>
  <text x="${side === "left" ? x - 16 : x + 16}" y="${(y1 + y2) / 2 + 8}" font-family="${TH}" font-size="24" font-weight="700"
    text-anchor="${side === "left" ? "end" : "start"}" fill="${CYAN}">${esc(label)}</text>`;

/* ── 1. การ์ดขนาด (7 แบบ — วาดตามสเกลจริง) ───────────────────────── */

/** มม. จริงของแต่ละขนาด + จำนวนใบต่อแผ่น A3 ตามที่หน้าเว็บระบุ (เคลือบ/ปั๊มฟอยล์คิดต่อแผ่น A3) */
export const SIZES = [
  { key: "A7", mm: [74, 105], perA3: 16, note: "ขนาดเล็ก — เท่าโปสการ์ดครึ่งใบ ตั้งโชว์บนโต๊ะ" },
  { key: "A6", mm: [105, 148], perA3: 8, note: "เท่าโปสการ์ด — ขนาดยอดนิยมสำหรับของสะสม" },
  { key: "A5", mm: [148, 210], perA3: 4, note: "ครึ่งหนึ่งของ A4 — เห็นลายชัด ตั้งโชว์สวย" },
  { key: "A4", mm: [210, 297], perA3: 2, note: "เท่ากระดาษ A4 — งานโชว์/มอบเป็นของขวัญ" },
  { key: "A3", mm: [297, 420], perA3: 1, note: "ใหญ่ที่สุด — งานโชว์หน้าร้าน/งานอีเวนต์" },
  { key: "10x10cm", mm: [100, 100], perA3: null, note: "จัตุรัสเล็ก — ลายวงกลม/โลโก้ลงตัว" },
  { key: "15x15cm", mm: [150, 150], perA3: null, note: "จัตุรัสกลาง — ตั้งโชว์คู่กับกรอบได้" },
];

const MAX_MM = Math.max(...SIZES.flatMap((s) => s.mm));

async function sizeCards() {
  console.log("🖼  การ์ดขนาด 7 แบบ (วาดตามสเกลจริง + ผังเทียบขนาดกับ A3)");
  for (const s of SIZES) {
    const [mw, mh] = s.mm;
    // ตัวการ์ดใหญ่: ย่อให้พอดีกรอบ 430×430 (ทุกใบเห็นลายชัดเท่ากัน)
    const k = Math.min(430 / mw, 430 / mh);
    const w = Math.round(mw * k);
    const h = Math.round(mh * k);
    const x = Math.round((W - w) / 2) - 40;
    const y = Math.round(250 + (430 - h) / 2);

    // ผังมุมขวาล่าง: ใบนี้ (ทึบ) ซ้อนในกรอบ A3 (เส้นประ) ตามสเกลจริง — เทียบขนาดได้ทันที
    const pk = 150 / 420;
    const pw = Math.round(297 * pk);
    const ph = Math.round(420 * pk);
    const px = 700;
    const py = 470;
    const sw = Math.round(mw * pk);
    const sh = Math.round(mh * pk);

    const cm = (n) => (n / 10).toFixed(n % 10 ? 1 : 0);
    const svg = frame(`
      ${title(`ชิกิชิ ขนาด ${s.key}`, `${mw} × ${mh} มม. (${cm(mw)} × ${cm(mh)} ซม.)`)}
      ${board(x, y, w, h, "gold", { id: `sz-${s.key}` })}
      ${dimH(x, x + w, y + h + 30, `${mw} มม.`)}
      ${dimV(y, y + h, x - 26, `${mh} มม.`)}
      <g>
        <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="#f1f5f9" stroke="${SUB}" stroke-width="2" stroke-dasharray="6 5"/>
        <rect x="${px}" y="${py + ph - sh}" width="${sw}" height="${sh}" fill="#bae6fd" stroke="${CYAN}" stroke-width="2"/>
        <text x="${px + pw / 2}" y="${py - 14}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${SUB}">เทียบแผ่น A3</text>
        <text x="${px + pw / 2}" y="${py + ph + 30}" font-family="${TH}" font-size="20" text-anchor="middle" fill="${CYAN}">${esc(s.key)}</text>
      </g>
      <text x="${W / 2}" y="196" font-family="${TH}" font-size="25" text-anchor="middle" fill="${INK}">${esc(s.note)}</text>
      ${foot([
        s.perA3 ? `เคลือบ/ปั๊มฟอยล์ทำเป็นแผ่น A3 — ขนาดนี้ได้ ${s.perA3} ใบ ต่อ 1 แผ่น A3` : "การ์ดบอร์ดหนา 2 มม. · ตัวภาพกระดาษอาร์ตการ์ด 260 แกรม",
        "ลายบนภาพเป็นตัวอย่าง — พิมพ์ตามไฟล์ที่ลูกค้าส่งมา",
      ])}`);
    await saveSvg(`size-${s.key.toLowerCase()}`, svg);
  }

  // การ์ดรวม — เทียบขนาดตามสเกลจริง แยก 2 กอง (A-series | จัตุรัส) ไม่งั้นป้ายชื่อทับกัน
  const k = 470 / 420;
  const groups = [
    { title: "ขนาด A", x: 150, items: SIZES.filter((s) => s.key.startsWith("A")) },
    { title: "ขนาดจัตุรัส", x: 620, items: SIZES.filter((s) => !s.key.startsWith("A")) },
  ];
  const by = 720;
  const shades = ["#e0f2fe", "#bae6fd", "#7dd3fc", "#38bdf8", "#0284c7"];
  const svg = frame(`
    ${title("7 ขนาดที่มีให้เลือก", "เทียบขนาดจริงตามสเกล — ราคาต่างกันตามขนาด")}
    ${groups
      .map((g) => {
        const items = [...g.items].sort((a, b) => b.mm[0] * b.mm[1] - a.mm[0] * a.mm[1]);
        return `<text x="${g.x}" y="205" font-family="${TH}" font-size="24" font-weight="700" fill="${INK}">${esc(g.title)}</text>
        ${items
          .map((s, i) => {
            const w = s.mm[0] * k;
            const h = s.mm[1] * k;
            return `<rect x="${g.x}" y="${(by - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${shades[i]}" stroke="#0369a1" stroke-width="1.5"/>
            <text x="${(g.x + w - 10).toFixed(1)}" y="${(by - h + 28).toFixed(1)}" font-family="${TH}" font-size="21" font-weight="700" text-anchor="end" fill="#0c4a6e">${esc(s.key)}</text>`;
          })
          .join("")}`;
      })
      .join("")}
    ${foot(["A7 74×105 · A6 105×148 · A5 148×210 · A4 210×297 · A3 297×420 มม.", "จัตุรัส 10×10 ซม. และ 15×15 ซม. ราคาใกล้เคียง A4"])}`);
  await saveSvg("size-compare", svg);
}

/* ── 2. การ์ดสีขอบ (4 สี) ────────────────────────────────────────── */

async function borderCards() {
  console.log("🖼  การ์ดสีขอบ 4 สี (วาดชุดเดียวกัน เทียบสีกันได้)");
  for (const b of BORDERS) {
    const w = 330;
    const h = 462;
    const x = 150;
    const y = 220;
    // แถบสีขอบขยายใหญ่ + มุมการ์ดซูม ให้เห็นเนื้อฟอยล์ชัด ๆ
    const zx = 560;
    const zy = 250;
    const zs = 250;
    const svg = frame(`
      ${title(b.name, "การ์ดบอร์ด 2 มม. ขอบหุ้มฟอยล์รอบใบ")}
      ${board(x, y, w, h, b.key, { id: `bd-card-${b.key}` })}
      <g>
        <text x="${zx + zs / 2}" y="${zy - 16}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">ซูมมุมการ์ด</text>
        ${board(zx, zy, zs, zs, b.key, { id: `bd-zoom-${b.key}`, bw: 0.16 })}
        <rect x="${zx}" y="${zy + zs + 40}" width="${zs}" height="${64}" rx="10" fill="url(#bd-${b.key})" stroke="${b.edge}" stroke-width="2"/>
        <text x="${zx + zs / 2}" y="${zy + zs + 130}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">เนื้อฟอยล์ขอบ</text>
      </g>
      <text x="${W / 2}" y="740" font-family="${TH}" font-size="25" text-anchor="middle" fill="${INK}">${esc(b.note)}</text>
      ${foot(["ทั้ง 4 สีราคาเท่ากัน — เลือกได้ทุกขนาด", "ขอบติดด้วยมือ อาจมีรอยยับเล็กน้อยตามธรรมชาติของงาน"])}`);
    await saveSvg(`border-${b.key}`, svg);
  }

  // การ์ดรวม 4 สี — ใช้ในแท็บรายละเอียด
  const w = 168;
  const h = 235;
  const gap = 24;
  const x0 = Math.round((W - (w * 4 + gap * 3)) / 2);
  const y0 = 300;
  const svg = frame(`
    ${title("ขอบมี 4 สีให้เลือก", "เงิน · ทอง · โรสโกลด์ · โฮโลแกรม")}
    ${BORDERS.map(
      (b, i) => `${board(x0 + i * (w + gap), y0, w, h, b.key, { id: `bd-all-${b.key}` })}
      <text x="${x0 + i * (w + gap) + w / 2}" y="${y0 + h + 40}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">${esc(b.name.replace("ขอบสี", ""))}</text>`
    ).join("")}
    ${foot(["ราคาเท่ากันทุกสี เลือกได้ทุกขนาด", "ลายบนภาพเป็นตัวอย่าง — พิมพ์ตามไฟล์ที่ลูกค้าส่งมา"])}`);
  await saveSvg("border-all", svg);
}

/* ── 3. โครงสร้างการ์ด (บอร์ด 2 มม. + อาร์ตการ์ด 260 แกรม) ───────── */

async function structureCard() {
  console.log("🖼  การ์ดโครงสร้างงาน (บอร์ด 2 มม. + อาร์ตการ์ด 260 แกรม)");
  const x = 150;
  const y = 240;
  const w = 300;
  // ภาพตัด: กระดาษพิมพ์ลายทับบนบอร์ด แล้วขอบฟอยล์หุ้มรอบ (ป้ายอยู่ขวามือ กว้างพอไม่ล้นการ์ด)
  const svg = frame(`
    ${title("โครงสร้างงานชิกิชิ", "การ์ดบอร์ดหนา 2 มม. · ตัวภาพอาร์ตการ์ด 260 แกรม")}
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="24" fill="#fecdd3" stroke="#e11d48" stroke-width="2"/>
      <text x="${x + w + 40}" y="${y + 18}" font-family="${TH}" font-size="22" fill="${INK}">อาร์ตการ์ด 260 แกรม</text>
      <text x="${x + w + 40}" y="${y + 46}" font-family="${TH}" font-size="20" fill="${SUB}">(หน้าที่พิมพ์ลาย)</text>
      <rect x="${x}" y="${y + 24}" width="${w}" height="68" fill="#f1f5f9" stroke="${SUB}" stroke-width="2"/>
      <text x="${x + w + 40}" y="${y + 100}" font-family="${TH}" font-size="22" fill="${INK}">การ์ดบอร์ด หนา 2 มม.</text>
      <rect x="${x - 14}" y="${y - 8}" width="14" height="108" fill="url(#bd-gold)" stroke="#b8860b" stroke-width="1.5"/>
      <rect x="${x + w}" y="${y - 8}" width="14" height="108" fill="url(#bd-gold)" stroke="#b8860b" stroke-width="1.5"/>
      ${dimV(y - 8, y + 100, x - 46, "2 มม.")}
      <path d="M ${x + w + 7} ${y + 108} L ${x + w + 7} ${y + 132} L ${x + w + 34} ${y + 132}" stroke="${SUB}" stroke-width="2" fill="none"/>
      <text x="${x + w + 44}" y="${y + 140}" font-family="${TH}" font-size="22" fill="${INK}">ขอบฟอยล์หุ้มรอบใบ (4 สี)</text>
    </g>
    ${board(300, 452, 300, 250, "gold", { id: "struct" })}
    <text x="${W / 2}" y="758" font-family="${TH}" font-size="24" text-anchor="middle" fill="${INK}">พิมพ์ด้วยระบบ Digital Printing สีคมชัด ไม่ซีดไม่หลุดลอก</text>
    ${foot(["ภาพตัดขวางเพื่ออธิบายโครงสร้าง ไม่ใช่สัดส่วนจริง", "ขอบติดด้วยมือ อาจมีรอยยับเล็กน้อย"])}`);
  await saveSvg("structure", svg);
}

/* ── 4. การ์ดชนิดเคลือบ (ภาพฟิล์มจริงจากคลังของร้าน) ─────────────── */

async function coatCard(name, cardTitle, cardSub, films, notes) {
  const gap = 22;
  const tw = Math.min(Math.floor((760 - gap * (films.length - 1)) / films.length), 600);
  const thh = Math.min(Math.round(tw * 0.72), 430);
  const tiles = [];
  for (const f of films) {
    // contain ไม่ใช่ cover — ภาพฟิล์มของร้านมีป้ายชื่อผิวอยู่มุมขวาล่าง ครอปแล้วป้ายขาด
    tiles.push(
      await sharp(await get(`${COAT_BASE}/${f.file}.jpg`))
        .resize({ width: tw, height: thh, fit: "contain", background: "#ffffff" })
        .toBuffer()
    );
  }
  const x0 = Math.round((W - (tw * films.length + gap * (films.length - 1))) / 2);
  const y0 = Math.round(190 + (520 - thh) / 2);
  const labels = films
    .map(
      (f, i) =>
        `<text x="${x0 + i * (tw + gap) + tw / 2}" y="${y0 + thh + 46}" font-family="${TH}" font-size="26" font-weight="700" text-anchor="middle" fill="${INK}">${esc(f.label)}</text>`
    )
    .join("");
  const svg = frame(`${title(cardTitle, cardSub)}${labels}${foot(notes)}`);
  const buf = await sharp(Buffer.from(svg))
    .composite(tiles.map((input, i) => ({ input, left: x0 + i * (tw + gap), top: y0 })))
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
  save(name, buf);
}

async function coatCards() {
  console.log("🖼  การ์ดชนิดเคลือบ (ภาพฟิล์มจริงจากคลังของร้าน)");
  await saveSvg(
    "coat-none",
    frame(`
      ${title("ไม่เคลือบ", "ผิวกระดาษอาร์ตการ์ดตามธรรมชาติ")}
      ${board(300, 230, 300, 420, "gold", { id: "coat-none" })}
      <text x="${W / 2}" y="700" font-family="${TH}" font-size="26" text-anchor="middle" fill="${INK}">สีพิมพ์ตามไฟล์งาน ไม่มีฟิล์มทับหน้า</text>
      <text x="${W / 2}" y="742" font-family="${TH}" font-size="23" text-anchor="middle" fill="${SUB}">ผิวสัมผัสเป็นเนื้อกระดาษ ไม่มันวาว</text>
      ${foot(["ราคานี้รวมในราคาการ์ดแล้ว (ไม่บวกเพิ่ม)", "โดนน้ำ/ความชื้นแล้วเลอะได้ง่ายกว่าแบบเคลือบ"])}`)
  );
  await coatCard(
    "coat-gloss",
    "เคลือบเงา",
    "ฟิล์มผิวมันวาว — ตัวอย่างผิวงานจริงของร้าน",
    [{ file: "gloss", label: "ผิวเงา" }],
    ["สีสดขึ้น เงาวาว กันน้ำ/รอยเปื้อนได้ดีกว่าไม่เคลือบ", "บวกเพิ่ม 10 บาท"]
  );
  await coatCard(
    "coat-matte",
    "เคลือบด้าน",
    "ฟิล์มผิวด้านนวล — ตัวอย่างผิวงานจริงของร้าน",
    [{ file: "gloss-matte", label: "ผิวด้าน" }],
    ["นวลตา ไม่สะท้อนแสง ลายนิ้วมือไม่ติด", "บวกเพิ่ม 10 บาท"]
  );
  await coatCard(
    "coat-special",
    "เคลือบพิเศษ",
    "กลิตเตอร์ · ทราย · โฮโลแกรม (เลือกผิวย่อยได้อีก 10 แบบ)",
    [
      { file: "glitter", label: "กลิตเตอร์" },
      { file: "rainbow", label: "โฮโลแกรม-รุ้ง" },
      { file: "sand", label: "ทราย" },
    ],
    ["เลือกผิวฟิล์มย่อยได้ในกลุ่ม “เคลือบ” หลังเลือกแบบนี้", "บวกเพิ่ม 40 บาท"]
  );
}

/* ── 5. การ์ดคละลาย / คละขนาด ────────────────────────────────────── */

async function mixCard() {
  console.log("🖼  การ์ดคละลาย/คละขนาด");
  const cards = [
    { x: 120, y: 300, w: 180, h: 252, b: "gold" },
    { x: 340, y: 300, w: 180, h: 252, b: "silver" },
    { x: 560, y: 300, w: 180, h: 252, b: "hologram" },
  ];
  const svg = frame(`
    ${title("สั่ง 11 ชิ้นขึ้นไป คละได้", "คละลาย / คละขนาด — ขั้นต่ำลายละ 5 ชิ้น")}
    ${cards.map((c, i) => `${board(c.x, c.y, c.w, c.h, c.b, { id: `mix-${i}` })}
      <text x="${c.x + c.w / 2}" y="${c.y + c.h + 42}" font-family="${TH}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}">ลายที่ ${i + 1}</text>
      <text x="${c.x + c.w / 2}" y="${c.y + c.h + 78}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${SUB}">5 ชิ้นขึ้นไป</text>`).join("")}
    <text x="${W / 2}" y="240" font-family="${TH}" font-size="25" text-anchor="middle" fill="${INK}">ไม่มีขั้นต่ำในการสั่งผลิต — สั่ง 1 ชิ้นก็ทำให้</text>
    ${foot(["ราคาคิดตามจำนวนรวมทั้งออเดอร์ ตามช่วงในตารางราคา", "แจ้งจำนวนของแต่ละลาย/ขนาดในช่องหมายเหตุถึงร้าน"])}`);
  await saveSvg("mix-designs", svg);
}

/* ── รัน ─────────────────────────────────────────────────────────── */

/** shikishi-apply.mjs import ตาราง SIZES จากไฟล์นี้ — วาดภาพเฉพาะตอนสั่งรันไฟล์นี้ตรง ๆ เท่านั้น */
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log(`📁 ${OUT}`);
  await sizeCards();
  await borderCards();
  await structureCard();
  await coatCards();
  await mixCard();
  console.log("\n✅ เสร็จ — ต่อด้วย: node scripts/shikishi-apply.mjs --write");
}
