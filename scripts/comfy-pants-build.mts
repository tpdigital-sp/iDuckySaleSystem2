/**
 * สร้างสินค้า "COMFY PANTS | กางเกงทรงกระบอก" ลงร่างเดิม new-mt2pl7cv-132
 *
 *   npx tsx scripts/comfy-pants-build.mts            # ดูข้อมูลที่จะบันทึก (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/comfy-pants-build.mts --write    # อัปรูป + เขียนลง Supabase (คงสถานะฉบับร่าง)
 *
 * ที่มา: iduckyofficial-pricelists.com/tailoringclothes หัวข้อ "COMFY PANTS | กางเกงทรงกระบอก"
 *   สคริปต์อ่านตารางสดทุกครั้ง — 7 ช่วงจำนวน × 3 คอลัมน์ไซซ์ (S,M,L,Free Size | XL | 2XL)
 *   ที่นี่แตกคอลัมน์เป็นไซซ์ละบรรทัด (แบบเดียวกับเสื้อ unisex) ให้ลูกค้าเลือกไซซ์ตรง ๆ
 *
 * รายละเอียดจากหน้าเดียวกัน:
 *   • เนื้อผ้าไหมอิตาลี สกรีนลายเต็มตัว (Sublimation) · มีกระเป๋า 2 ฝั่ง
 *   • เพิ่มเชือก +10 บาท — สีดำ / สีขาว (หัวจั๊ม) · หนา 6mm ยาว 38-39 นิ้ว (แต่ละเส้นต่างกัน 1-2 นิ้ว)
 *   • รอบเอว: Free Size 24" · S 26" · M 28" · L 30" · XL 32" · 2XL 34"
 *
 * ภาพ (ผู้ใช้สั่ง 25 ส.ค. 69 "ตัวเลือกควรมีภาพประกอบ ว่าแต่ละแบบหน้าตาเป็นแบบไหน"):
 *   แกลเลอรี 5 ใบ = รูปงานจริงจากหน้าเว็บ (หน้า/ข้าง/หลัง/งานนอกสถานที่/ระยะใกล้เห็นเอว+กระเป๋า)
 *   การ์ดไซซ์ 6 ใบ วาดเองสเกลเดียวกันทุกใบ (หน้าเว็บไม่มีภาพแยกไซซ์) + การ์ดตารางไซซ์รวมใช้ในแท็บ
 *   การ์ดเชือก 3 ใบ วาดเอง (ไม่เพิ่ม/ดำ/ขาว — หน้าเว็บไม่มีรูปเชือก) + ภาพเทียบงานสกรีน 2 ใบลงแท็บ
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย v1 ครั้งหน้าขึ้น v2
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { hasQuoteOption, priceRange, type PriceMatrix, type Product, type ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const ID = "new-mt2pl7cv-132"; // ร่างที่ผู้ใช้สร้างค้างไว้ — เขียนทับตัวนี้ ให้ลิงก์ /admin/products/new-mt2pl7cv-132 เดิมใช้ได้
const NAME = "COMFY PANTS | กางเกงทรงกระบอก";
const V = "v1";
const PAGE = "https://www.iduckyofficial-pricelists.com/tailoringclothes";
const SECTION = "COMFY PANTS";
const UNIT = "ตัว";
const ROPE_FEE = 10;
const SIZE_LABEL = "ขนาด";
const ROPE_LABEL = "เชือกเอว (หัวจั๊ม)";
/** รอบเอวแต่ละไซซ์ (นิ้ว) + คอลัมน์ราคาที่สังกัด (0 = S,M,L,Free Size · 1 = XL · 2 = 2XL) */
const SIZES: { name: string; waist: number; col: number }[] = [
  { name: "Free Size", waist: 24, col: 0 },
  { name: "S", waist: 26, col: 0 },
  { name: "M", waist: 28, col: 0 },
  { name: "L", waist: 30, col: 0 },
  { name: "XL", waist: 32, col: 1 },
  { name: "2XL", waist: 34, col: 2 },
];

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = (file: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;
const CACHE = ".cache/comfy-pants/upload";
mkdirSync(CACHE, { recursive: true });

/* ── 1. ดึงตารางราคาจากเว็บ ──────────────────────────────────────── */
const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s: string) => decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const html = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } }).then((r) => {
  if (!r.ok) throw new Error(`ดึงหน้า ${PAGE} ไม่ได้ — HTTP ${r.status}`);
  return r.text();
});

/** ตารางแรกถัดจากหัวข้อ "COMFY PANTS" — หัวตารางต้องเป็น Title | S,M,L,Free Size | XL | 2XL */
function sectionTable(): string[][] {
  for (let i = html.indexOf(SECTION); i >= 0; i = html.indexOf(SECTION, i + 1)) {
    const t = html.indexOf("<table", i);
    if (t < 0 || t - i > 3000) continue;
    const end = html.indexOf("</table>", t);
    const rows = [...html.slice(t, end).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
      [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
    );
    if (rows.length > 1 && /S\s*,\s*M\s*,\s*L/.test(rows[0][1] ?? "") && rows[0][2] === "XL" && rows[0][3] === "2XL")
      return rows;
  }
  throw new Error(`หาตารางใต้หัวข้อ "${SECTION}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
}

const rows = sectionTable();
const tiers = rows.slice(1).map((r) => {
  const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: r[0] };
});
tiers[tiers.length - 1].upTo = null; // "500 ตัวขึ้นไป" = ขั้นเปิดปลาย
/** ราคา 3 คอลัมน์ต่อแถว [S/M/L/FS, XL, 2XL] */
const cols: number[][] = rows.slice(1).map((r) => {
  const p = [r[1], r[2], r[3]].map((c) => Number(String(c).replace(/[^\d]/g, "")));
  if (p.some((n) => !n)) throw new Error(`ช่องราคาแถว "${r[0]}" อ่านไม่ออก (${r.slice(1).join(" | ")})`);
  return p;
});
if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ — ตรวจก่อน");

console.log(`📊 ตาราง "${NAME}" จากเว็บ · ${tiers.length} ช่วงจำนวน × 3 คอลัมน์ไซซ์`);
for (let i = 0; i < tiers.length; i++) console.log(`   ${tiers[i].label.padEnd(14)} ${cols[i].join(" / ")}`);

const PRICING: PriceMatrix = {
  unit: UNIT,
  driverLabels: [SIZE_LABEL],
  tiers,
  cells: Object.fromEntries(SIZES.map((s) => [s.name, cols.map((row) => row[s.col])])),
};

/* ── 2. รูปงานจริงจากหน้าเว็บ (แกลเลอรี 5 = MAX_PHOTOS ห้ามเกิน) ───── */
const PHOTOS: [string, string, string, string][] = [
  ["gallery-front", "959b83_b3018e6ba01f48e290a9926efb6dd3ba~mv2.png", "🦆", "งานจริง — ลายเป็ดพื้นขาว (ด้านหน้า เอวยางยืด)"],
  ["gallery-outdoor", "959b83_83522b65366547cc974a9edf7b25d584~mv2.jpg", "⭐", "งานจริง — COMFY PANTS ลายดาว"],
  ["gallery-side", "959b83_2b9c028c80fe43cca52bf9e135f6b7cf~mv2.png", "🧍", "ด้านข้าง — ทรงกระบอกขาตรง ใส่สบาย"],
  ["gallery-pocket", "959b83_a3116b86b7ba43ae8eaf69415f52b7c6~mv2.jpg", "🔍", "ระยะใกล้ — ขอบเอวยางยืด + กระเป๋าข้าง"],
  ["gallery-back", "959b83_307737aac74d4236ba929c7d7b05724b~mv2.png", "🔄", "ด้านหลัง — พิมพ์ลายเต็มตัวรอบขา"],
];
/** ภาพเทียบงานสกรีนของร้าน (ใช้ในแท็บ ไม่นับเป็นแกลเลอรี) */
const COMPARES: [string, string][] = [
  ["compare-sub-dtf", "959b83_54c7a61929ac4b7f8981076c5eee5cf5~mv2.png"],
  ["compare-print", "959b83_23d5c7d965db4fa6ab8155fb481aa70c~mv2.jpg"],
];

async function fetchWix(wixId: string): Promise<Buffer> {
  const res = await fetch(`https://static.wixstatic.com/media/${wixId}`);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function put(name: string, buf: Buffer): Promise<string> {
  const file = `${name}-${V}.jpg`;
  writeFileSync(`${CACHE}/${file}`, buf); // เก็บสำเนาไว้ตรวจตาเสมอ (dry-run ก็ได้ดูของจริง)
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

/** รูปถ่าย: ย่อกว้างไม่เกิน 1400 (นโยบายเดียวกับรูปสินค้าใน ProductEditor — เว็บโหลดไว) */
const photo = async (buf: Buffer) =>
  sharp(buf, { limitInputPixels: false }) // รูปเทียบสกรีนของร้านต้นฉบับใหญ่มาก (20719×14678) เกินลิมิตปกติของ sharp
    .resize({ width: 1400, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();

/* ── 3. วาดการ์ดตัวเลือก (SVG → JPG 900×900) ─────────────────────── */
const W = 900;
const H = 900; // จัตุรัส — แกลเลอรีหน้าสินค้าครอปเป็นจัตุรัส (object-cover)
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const ACCENT = "#0284c7";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const frame = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f8fafc"/>
  <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="28" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const svg2jpg = (svg: string) => sharp(Buffer.from(svg)).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();

/** ลายจุดดาวเล็ก ๆ ในเนื้อผ้า — ใบ้ว่าเป็นงานพิมพ์ลายเต็มตัว (ตำแหน่ง fix ให้ทุกใบเหมือนกัน) */
const dots = (cx: number, top: number, bottom: number, hw: number) => {
  const pts: [number, number][] = [
    [-0.55, 0.18], [0.4, 0.12], [-0.2, 0.32], [0.6, 0.38], [-0.65, 0.52],
    [0.25, 0.55], [-0.35, 0.7], [0.55, 0.72], [-0.6, 0.88], [0.3, 0.9],
  ];
  return pts
    .map(([fx, fy]) => {
      const x = cx + fx * (hw - 30);
      const y = top + fy * (bottom - top);
      return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="7" fill="#bae6fd"/>`;
    })
    .join("");
};

/**
 * การ์ดไซซ์ — กางเกงวาดสเกลเดียวกันทุกใบ (26 px ต่อ 1 นิ้วของหน้ากว้างผ้า = รอบเอว/2)
 * เปิดคนละใบเทียบกันได้ด้วยตา · เลขรอบเอวตัวใหญ่ อ่านออกแม้เป็นภาพย่อบนปุ่มตัวเลือก
 */
const PPI = 22; // 22 px ต่อนิ้ว — แคบพอให้ขายาวดูเป็นกางเกงขายาว ไม่ใช่ขาสั้น
function sizeCard(name: string, waist: number): string {
  const half = ((waist / 2) * PPI) / 2; // ความกว้างผ้า (รอบเอว/2 นิ้ว) × สเกล ÷ 2 = ระยะจากแกนกลางถึงขอบเอว
  const cx = W / 2;
  const bandTop = 248, bandH = 42, hipY = bandTop + bandH + 105, bottom = 778, gap = 13;
  const flare = 14; // สะโพกกว้างกว่าเอวเล็กน้อย แล้วตรงลงแบบทรงกระบอก
  const crotch = bandTop + bandH + 165;
  const pants = `
    <path d="M ${cx - half} ${bandTop + bandH}
             L ${cx - half - flare} ${hipY} L ${cx - half - flare} ${bottom}
             L ${cx - gap} ${bottom} L ${cx} ${crotch} L ${cx + gap} ${bottom}
             L ${cx + half + flare} ${bottom} L ${cx + half + flare} ${hipY}
             L ${cx + half} ${bandTop + bandH} Z"
          fill="#e0f2fe" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    ${dots(cx, hipY, bottom - 20, half + flare)}
    <rect x="${cx - half}" y="${bandTop}" width="${half * 2}" height="${bandH}" rx="12" fill="#bae6fd" stroke="${INK}" stroke-width="4"/>
    ${Array.from({ length: Math.floor((half * 2 - 24) / 16) }, (_, i) => `<line x1="${cx - half + 18 + i * 16}" y1="${bandTop + 8}" x2="${cx - half + 18 + i * 16}" y2="${bandTop + bandH - 8}" stroke="#7dd3fc" stroke-width="3"/>`).join("")}
    <line x1="${cx - half - flare}" y1="${hipY}" x2="${cx - half - flare}" y2="${bottom}" stroke="${INK}" stroke-width="4"/>
  `;
  const dimY = bandTop - 26;
  const dim = `
    <line x1="${cx - half}" y1="${dimY}" x2="${cx + half}" y2="${dimY}" stroke="${ACCENT}" stroke-width="4"/>
    <path d="M ${cx - half} ${dimY} l 16 -8 v 16 Z" fill="${ACCENT}"/>
    <path d="M ${cx + half} ${dimY} l -16 -8 v 16 Z" fill="${ACCENT}"/>
    <line x1="${cx - half}" y1="${dimY - 12}" x2="${cx - half}" y2="${bandTop + 6}" stroke="${ACCENT}" stroke-width="2" stroke-dasharray="6 5"/>
    <line x1="${cx + half}" y1="${dimY - 12}" x2="${cx + half}" y2="${bandTop + 6}" stroke="${ACCENT}" stroke-width="2" stroke-dasharray="6 5"/>
  `;
  return frame(`
    <text x="${cx}" y="128" font-family="${TH}" font-size="${name.length > 3 ? 72 : 96}" font-weight="700" text-anchor="middle" fill="${INK}">${esc(name)}</text>
    <text x="${cx}" y="192" font-family="${TH}" font-size="40" font-weight="700" text-anchor="middle" fill="${ACCENT}">รอบเอว ${waist} นิ้ว</text>
    ${dim}${pants}
    <text x="${cx}" y="828" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">เอวยางยืด · ทุกใบวาดสเกลเดียวกัน เทียบขนาดกันได้ด้วยตา</text>
  `);
}

/** การ์ดตารางไซซ์รวม (ใช้ในแท็บ "ตารางไซซ์") — แท่งยาวตามรอบเอวจริง */
function sizeChartCard(): string {
  const rows = SIZES.map((s, i) => {
    const y = 210 + i * 100;
    const bw = s.waist * 13;
    return `
      <text x="145" y="${y + 42}" font-family="${TH}" font-size="${s.name.length > 3 ? 32 : 40}" font-weight="700" text-anchor="middle" fill="${INK}">${esc(s.name)}</text>
      <rect x="270" y="${y}" width="${bw}" height="60" rx="16" fill="#e0f2fe" stroke="${ACCENT}" stroke-width="3"/>
      <text x="${270 + bw - 16}" y="${y + 42}" font-family="${TH}" font-size="30" font-weight="700" text-anchor="end" fill="${ACCENT}">${s.waist}"</text>
    `;
  }).join("");
  return frame(`
    <text x="${W / 2}" y="96" font-family="${TH}" font-size="44" font-weight="700" text-anchor="middle" fill="${INK}">ตารางไซซ์ COMFY PANTS</text>
    <text x="${W / 2}" y="146" font-family="${TH}" font-size="28" text-anchor="middle" fill="${SUB}">รอบเอว (นิ้ว) · เอวยางยืด ยืดหยุ่นได้</text>
    ${rows}
    <text x="${W / 2}" y="852" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">S M L Free Size ราคาเดียวกัน · XL และ 2XL เพิ่มตามตารางราคา</text>
  `);
}

/** การ์ดเชือกเอว — ขอบเอวระยะใกล้ มี/ไม่มีเชือก (หน้าเว็บไม่มีรูปเชือก จึงวาดเอง) */
function ropeCard(kind: "none" | "black" | "white"): string {
  const cx = W / 2;
  const bandX = 130, bandW = W - 260, bandY = 300, bandH = 110;
  const rib = Array.from({ length: Math.floor((bandW - 30) / 22) }, (_, i) =>
    `<line x1="${bandX + 24 + i * 22}" y1="${bandY + 14}" x2="${bandX + 24 + i * 22}" y2="${bandY + bandH - 14}" stroke="#7dd3fc" stroke-width="4"/>`
  ).join("");
  const fabric = `
    <path d="M ${bandX} ${bandY + bandH} L ${bandX - 14} ${bandY + bandH + 260} L ${bandX + bandW + 14} ${bandY + bandH + 260} L ${bandX + bandW} ${bandY + bandH} Z"
          fill="#f0f9ff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    ${dots(cx, bandY + bandH + 30, bandY + bandH + 240, bandW / 2)}
  `;
  const band = `
    <rect x="${bandX}" y="${bandY}" width="${bandW}" height="${bandH}" rx="22" fill="#bae6fd" stroke="${INK}" stroke-width="5"/>
    ${rib}
  `;
  let cord = "";
  let title = "ไม่เพิ่มเชือก";
  let chip = `<rect x="${cx - 150}" y="216" width="300" height="52" rx="26" fill="#e2e8f0"/>
    <text x="${cx}" y="251" font-family="${TH}" font-size="27" font-weight="700" text-anchor="middle" fill="#334155">เอวยางยืดเรียบ ๆ · ฟรี</text>`;
  if (kind !== "none") {
    const c = kind === "black" ? { fill: "#1e293b", edge: "#0f172a", th: "เชือกสีดำ" } : { fill: "#f8fafc", edge: "#94a3b8", th: "เชือกสีขาว" };
    title = `${c.th} (หัวจั๊ม)`;
    chip = `<rect x="${cx - 130}" y="216" width="260" height="52" rx="26" fill="${ACCENT}"/>
      <text x="${cx}" y="251" font-family="${TH}" font-size="28" font-weight="700" text-anchor="middle" fill="#ffffff">+${ROPE_FEE} บาท/ตัว</text>`;
    const g = (x: number) => `<circle cx="${x}" cy="${bandY + bandH / 2}" r="13" fill="#ffffff" stroke="${INK}" stroke-width="4"/>`;
    // เชือก 2 ปลายห้อยจากตาไก่กลางขอบเอว ปลายเป็นหัวจั๊มทรงแคปซูล
    const cordPath = (x0: number, sway: number) => `
      <path d="M ${x0} ${bandY + bandH / 2 + 10} C ${x0 + sway * 0.3} ${bandY + bandH + 90}, ${x0 + sway} ${bandY + bandH + 140}, ${x0 + sway} ${bandY + bandH + 210}"
            fill="none" stroke="${c.fill}" stroke-width="12" stroke-linecap="round" ${kind === "white" ? `style="paint-order:stroke"` : ""}/>
      ${kind === "white" ? `<path d="M ${x0} ${bandY + bandH / 2 + 10} C ${x0 + sway * 0.3} ${bandY + bandH + 90}, ${x0 + sway} ${bandY + bandH + 140}, ${x0 + sway} ${bandY + bandH + 210}" fill="none" stroke="${c.edge}" stroke-width="14" stroke-linecap="round" opacity="0.5"/><path d="M ${x0} ${bandY + bandH / 2 + 10} C ${x0 + sway * 0.3} ${bandY + bandH + 90}, ${x0 + sway} ${bandY + bandH + 140}, ${x0 + sway} ${bandY + bandH + 210}" fill="none" stroke="${c.fill}" stroke-width="10" stroke-linecap="round"/>` : ""}
      <rect x="${x0 + sway - 11}" y="${bandY + bandH + 206}" width="22" height="46" rx="11" fill="${c.fill}" stroke="${c.edge}" stroke-width="3"/>
    `;
    cord = `${g(cx - 34)}${g(cx + 34)}${cordPath(cx - 34, -46)}${cordPath(cx + 34, 46)}`;
  }
  const foot =
    kind === "none"
      ? "ขอบเอวยางยืดอย่างเดียว ไม่มีเชือก — ใส่สบายเหมือนเดิม"
      : `เชือกหนา 6 มม. ยาวประมาณ 38-39 นิ้ว (แต่ละเส้นยาวต่างกัน 1-2 นิ้ว)`;
  return frame(`
    <text x="${cx}" y="150" font-family="${TH}" font-size="52" font-weight="700" text-anchor="middle" fill="${INK}">${esc(title)}</text>
    ${chip}${fabric}${band}${cord}
    <text x="${cx}" y="828" font-family="${TH}" font-size="25" text-anchor="middle" fill="${SUB}">${esc(foot)}</text>
  `);
}

/* ── 4. อัปรูปทั้งหมด ────────────────────────────────────────────── */
const gallery: Product["images"] = [];
for (const [file, wixId, emoji, label] of PHOTOS) {
  const src = await put(file, await photo(await fetchWix(wixId)));
  gallery.push({ emoji, gradient: "from-sky-100 to-blue-200", label, src });
}
const compareUrl: Record<string, string> = {};
for (const [file, wixId] of COMPARES) compareUrl[file] = await put(file, await photo(await fetchWix(wixId)));

const sizeArt: Record<string, string> = {};
for (const s of SIZES) sizeArt[s.name] = await put(`size-${s.name.toLowerCase().replace(/\s+/g, "")}`, await svg2jpg(sizeCard(s.name, s.waist)));
const chartUrl = await put("size-chart", await svg2jpg(sizeChartCard()));
const ropeArt: Record<string, string> = {};
for (const k of ["none", "black", "white"] as const) ropeArt[k] = await put(`rope-${k}`, await svg2jpg(ropeCard(k)));
console.log(`🖼  แกลเลอรี ${gallery.length} ภาพ · การ์ดไซซ์ ${SIZES.length} + ตารางไซซ์ 1 · การ์ดเชือก 3 · ภาพเทียบสกรีน 2`);

/* ── 5. ประกอบสินค้า ─────────────────────────────────────────────── */
const OPTIONS: ProductOption[] = [
  {
    label: SIZE_LABEL, // แกนตารางราคา (driverLabels) — ห้ามตัดกลุ่มนี้ออกตอนเข้าตะกร้า
    note: "รอบเอว: Free Size 24\" · S 26\" · M 28\" · L 30\" · XL 32\" · 2XL 34\" (เอวยางยืด)",
    choices: SIZES.map((s) => ({ name: s.name, imageSrc: sizeArt[s.name] })),
  },
  {
    label: ROPE_LABEL,
    note: `เชือกหนา 6 มม. ยาวประมาณ 38-39 นิ้ว — **แต่ละเส้นยาวต่างกัน 1-2 นิ้ว**`,
    display: "pills",
    choices: [
      { name: "ไม่เพิ่มเชือก", badge: "ฟรี", imageSrc: ropeArt.none },
      { name: "เชือกสีดำ", extra: ROPE_FEE, imageSrc: ropeArt.black },
      { name: "เชือกสีขาว", extra: ROPE_FEE, imageSrc: ropeArt.white },
    ],
  },
];

const firstCol = cols.map((r) => r[0]);
const product: Product = {
  id: ID,
  name: NAME,
  category: "cat-mt2bpoyj", // หมวดเสื้อผ้า (เดียวกับ unisex/sport/oversize)
  price: firstCol[0],
  emoji: "👖",
  gradient: "from-sky-100 to-blue-200",
  imageSrc: gallery[0].src,
  rating: 5,
  sold: 0,
  description:
    `กางเกงทรงกระบอกขายาว COMFY PANTS พิมพ์ลายตามสั่งเต็มตัวด้วยระบบ Sublimation บนเนื้อผ้าไหมอิตาลี ` +
    `นุ่มลื่น ใส่สบาย เอวยางยืด มีกระเป๋าข้าง 2 ฝั่ง เลือกได้ 6 ไซซ์ (Free Size ถึง 2XL) ` +
    `เพิ่มเชือกเอวได้ทั้งสีดำและสีขาว (หัวจั๊ม) เพียงตัวละ ${ROPE_FEE} บาท ` +
    `สั่งตัวเดียวก็ได้ ยิ่งสั่งเยอะยิ่งถูก เริ่มต้นตัวละ ${firstCol[firstCol.length - 1]} บาท`,
  highlights: [
    "เนื้อผ้าไหมอิตาลี สกรีนลายเต็มตัว (Sublimation)",
    "มีกระเป๋า 2 ฝั่ง · เอวยางยืด ทรงกระบอกขาตรง",
    `เพิ่มเชือกเอวได้ สีดำ/สีขาว (หัวจั๊ม) +${ROPE_FEE} บาท`,
    "6 ไซซ์: Free Size · S · M · L · XL · 2XL",
    `สั่ง 1 ตัวก็ได้ — 500 ตัวขึ้นไปเหลือตัวละ ${firstCol[firstCol.length - 1]} บาท`,
  ],
  options: OPTIONS,
  images: gallery,
  pricing: PRICING,
  terms: [
    "*เนื้อผ้าไหมอิตาลี สกรีนลายเต็มตัว · มีกระเป๋า 2 ฝั่ง",
    `*เพิ่มเชือก บวกเพิ่ม ${ROPE_FEE} บาท — เชือกมีสีดำ / สีขาว (หัวจั๊ม)`,
    "*เชือกหนา 6mm ยาวประมาณ 38-39 นิ้ว — เชือกแต่ละเส้นจะมีความยาวแตกต่างกัน 1-2 นิ้ว",
    "*ทางร้านใช้สี R G B สีงานสกรีนที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
    "*งานผ้าจะมีจุดดำที่เกิดจากฝุ่นบ้างเล็กน้อย มีการเคลื่อนของลายสกรีน และจะมีรอยยับของผ้า ซึ่งจะไม่กระทบกับการใช้งาน",
  ].join("\n"),
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: [
        "• เนื้อผ้าไหมอิตาลี สกรีนลายเต็มตัวด้วยระบบ Sublimation — พิมพ์ลงผ้าโดยตรง ลายไม่ลอก ไม่แตก",
        "• ทรงกระบอกขาตรง เอวยางยืด ใส่สบายทั้งชายและหญิง",
        "• มีกระเป๋า 2 ฝั่ง",
        `• เพิ่มเชือกเอวได้ บวกเพิ่มตัวละ ${ROPE_FEE} บาท — เชือกมีสีดำ / สีขาว (หัวจั๊ม)`,
        "• เชือกหนา 6 มม. ยาวประมาณ 38-39 นิ้ว (เชือกแต่ละเส้นยาวต่างกัน 1-2 นิ้ว)",
        "• งานพิมพ์ซับลิเมชั่นใช้สี RGB — สีงานจริงอาจสว่างกว่าหรือดรอปลง ±5-15% ตามไฟล์งาน",
      ].join("\n"),
    },
    {
      title: "ตารางไซซ์",
      text:
        "ตารางไซซ์ COMFY PANTS (รอบเอว หน่วยเป็นนิ้ว · เอวยางยืด)::\n" +
        SIZES.map((s) => `• ${s.name} — รอบเอว ${s.waist} นิ้ว`).join("\n") +
        "\n\nราคาเริ่มต้น::\n" +
        `• ไซซ์ S / M / L / Free Size — เริ่มต้น ${cols[0][0]} บาท/ตัว\n` +
        `• ไซซ์ XL — เริ่มต้น ${cols[0][1]} บาท/ตัว · ไซซ์ 2XL — เริ่มต้น ${cols[0][2]} บาท/ตัว\n` +
        `• สั่งจำนวนมากราคาลดตามช่วง ต่ำสุด ${firstCol[firstCol.length - 1]} บาท/ตัว (ดูตารางราคาในหน้าสั่งซื้อ)`,
      images: [chartUrl],
      imageSize: "lg" as const,
    },
    {
      title: "ภาพเปรียบเทียบงานสกรีน",
      text:
        "กางเกงทรงกระบอกของทางร้านพิมพ์ด้วยระบบ Sublimation (SUB) — พิมพ์ลงเนื้อผ้าโดยตรง " +
        "ลายซึมเข้าเนื้อผ้า ไม่มีแผ่นฟิล์มปิดทับ ไม่ลอก ไม่แตก ระบายอากาศได้ตามปกติ\n" +
        "ภาพด้านล่างเทียบงานพิมพ์แต่ละระบบของทางร้าน (SUB / DTF / Flex / งานปัก) ให้เห็นความต่างของเนื้องาน",
      images: [compareUrl["compare-sub-dtf"], compareUrl["compare-print"]],
      imageSize: "lg" as const,
    },
    {
      title: "วิธีสั่งงาน",
      text:
        'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกไซซ์ เชือกเอว และจำนวนที่ต้องการ แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"\n• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น สั่งกี่ลาย ไซซ์ละกี่ตัว · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\nหรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: ไซซ์ที่เลือก · เชือกเอว (ถ้าเพิ่ม) · จำนวน · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)',
    },
    {
      title: "การเตรียมไฟล์",
      text:
        "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด",
    },
    {
      title: "การรับประกันสินค้า",
      text:
        "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• สีหรือไซซ์ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเสียหายระหว่างการขนส่ง\n\nไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n• จุดดำจากฝุ่นเล็กน้อย การเคลื่อนของลายสกรีน และรอยยับของผ้า ซึ่งเป็นธรรมชาติของงานผ้าซับลิเมชั่น\n\nระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    },
  ],
  seo: {
    title: `รับทำกางเกงทรงกระบอก COMFY PANTS พิมพ์ลายตามสั่ง เริ่มตัวละ ${firstCol[firstCol.length - 1]} บาท`,
    description:
      `รับผลิตกางเกงทรงกระบอก COMFY PANTS พิมพ์ลายเต็มตัวตามสั่ง ผ้าไหมอิตาลี เอวยางยืด มีกระเป๋า 2 ฝั่ง ` +
      `ไซซ์ Free Size-2XL เพิ่มเชือกเอวได้ สั่ง 1 ตัวก็ได้ ราคาเริ่ม ${firstCol[firstCol.length - 1]} บาท/ตัว`,
    keywords: ["กางเกงทรงกระบอก", "comfy pants", "กางเกงพิมพ์ลาย", "กางเกงสกรีนลายตามสั่ง", "กางเกงลายเต็มตัว", "sublimation"],
    faqs: [
      {
        q: "กางเกงทรงกระบอก COMFY PANTS ราคาเท่าไหร่?",
        a: `ไซซ์ S/M/L/Free Size เริ่มตัวละ ${cols[0][0]} บาท (1-10 ตัว) · XL ${cols[0][1]} บาท · 2XL ${cols[0][2]} บาท — ยิ่งสั่งเยอะยิ่งถูก 500 ตัวขึ้นไปเหลือตัวละ ${firstCol[firstCol.length - 1]}/${cols[cols.length - 1][1]}/${cols[cols.length - 1][2]} บาทตามไซซ์`,
      },
      {
        q: "มีไซซ์อะไรบ้าง?",
        a: "มี 6 ไซซ์ วัดที่รอบเอว (เอวยางยืด): Free Size 24 นิ้ว · S 26 · M 28 · L 30 · XL 32 · 2XL 34 นิ้ว — S/M/L/Free Size ราคาเดียวกัน ส่วน XL และ 2XL เพิ่มตามช่วงจำนวน",
      },
      {
        q: "เพิ่มเชือกเอวได้ไหม?",
        a: `เพิ่มได้ บวกเพิ่มตัวละ ${ROPE_FEE} บาท เลือกได้ทั้งเชือกสีดำและสีขาว (หัวจั๊ม) — เชือกหนา 6 มม. ยาวประมาณ 38-39 นิ้ว แต่ละเส้นยาวต่างกัน 1-2 นิ้ว`,
      },
      {
        q: "ใช้ผ้าอะไร พิมพ์ระบบไหน?",
        a: "เนื้อผ้าไหมอิตาลี นุ่มลื่นใส่สบาย พิมพ์ลายเต็มตัวด้วยระบบ Sublimation ลายซึมเข้าเนื้อผ้า ไม่ลอกไม่แตก มีกระเป๋าข้าง 2 ฝั่ง",
      },
      {
        q: "สั่งขั้นต่ำกี่ตัว?",
        a: "ไม่มีขั้นต่ำ สั่ง 1 ตัวก็ผลิตให้ — ช่วงราคา 1-10 ตัวตามตาราง และลดลงเป็นขั้นบันไดเมื่อสั่งมากขึ้น",
      },
    ],
  },
  hidden: true, // ฉบับร่าง — กดเผยแพร่เองที่ /admin/products
};

const range = priceRange(product);
const saved: Product = {
  ...product,
  priceMin: range.min,
  priceMax: range.max,
  hasQuote: hasQuoteOption(product),
  savedAt: new Date().toISOString(),
};

console.log(`\n📦 ${saved.name} (${ID}) · หมวด ${saved.category}`);
console.log(`   ราคา ฿${range.min}-${range.max}/${UNIT} (เริ่มต้น ฿${saved.price})`);
console.log(`   ตัวเลือก: ${OPTIONS.map((o) => `${o.label} ${o.choices.length} แบบ (มีภาพครบ)`).join(" · ")}`);
console.log(`   แกลเลอรี ${gallery.length} ภาพ · แท็บ ${saved.tabs!.length} · FAQ ${saved.seo!.faqs!.length} ข้อ · สถานะ: ฉบับร่าง`);

if (!WRITE) {
  console.log("\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}

/* ── 6. เขียนลง Supabase (คอลัมน์กระจก name/category/price ต้องไปด้วย) ── */
const { data: existing, error: exErr } = await sb.from("products").select("id,name,sort,sold").eq("id", ID).maybeSingle();
if (exErr) throw new Error(`อ่านร่างเดิมไม่ได้: ${exErr.message}`);
if (!existing) throw new Error(`ไม่พบร่าง ${ID} — สคริปต์นี้เขียนทับร่างเดิมเท่านั้น`);
console.log(`\n✏️  เขียนทับร่างเดิม "${existing.name}" (sort ${existing.sort})`);

const { error } = await sb.from("products").update(
  {
    name: saved.name,
    category: saved.category,
    price: saved.price,
    data: saved,
  }
).eq("id", ID);
if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);

/** update คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบก่อนประกาศสำเร็จ */
const { data: check, error: readErr } = await sb.from("products").select("name,category,data").eq("id", ID).single();
if (readErr) throw new Error(`อ่านกลับไม่ได้: ${readErr.message}`);
if (check.name !== NAME || check.category !== saved.category || (check.data as Product).savedAt !== saved.savedAt)
  throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");

console.log(`✅ อัปรูป + บันทึกแล้ว — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
console.log(`   หน้าสินค้า: http://localhost:3005/products/${ID}`);
console.log(`   หน้าแก้ไข: http://localhost:3005/admin/products/${ID}`);
