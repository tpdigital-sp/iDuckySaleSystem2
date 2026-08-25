/**
 * สร้างสินค้า "GRIPTOK MIRROR (กระจก)" (griptok-mirror)
 *
 *   npx tsx scripts/griptok-mirror-build.mts            # ดึงตาราง+เตรียมภาพลง .cache (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/griptok-mirror-build.mts --write    # อัปภาพ + เขียนลง Supabase (ฉบับร่าง)
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/griptok
 *   บล็อกหัวข้อ "GRIPTOK MIRROR (กระจก) UV Printing" — สคริปต์อ่านตารางสดทุกครั้ง
 *   (ยึดหัวข้อ "GRIPTOK MIRROR" ตัวที่มี <table> ตามหลังใกล้ ๆ — ตัวแรกเป็นสารบัญ ไม่มีตาราง)
 *   ตารางเดียว: แกนขนาด 4-6 cm × 6 ช่วงจำนวน (คัดสอบทาน 25 ส.ค. 69)
 *
 *   จำนวน            4cm  5cm  6cm
 *   1-10             165  165  165
 *   11-49            104  114  124
 *   50-199           100  110  120
 *   200-499           95  105  115
 *   500-999           90  100  110
 *   1,000 ขึ้นไป       85   95  105
 *
 * เงื่อนไขจากบล็อกเดียวกัน:
 *   • งานอะคริลิคประกบ 2 ชิ้น — ด้านบนอะคริลิคกระจก + ด้านล่างอะคริลิคขาว
 *     (สเปคความหนาจากผู้ใช้ 25 ส.ค. 69 — เว็บไม่ได้ระบุ: กระจก 1.5 มม. + ขาว 1 มม. รวม ~2.5-3 มม.)
 *   • ขนาด 4-6 cm · เพิ่มขนาดจากนี้ บวกเพิ่ม cm ละ 15 บาท (แจ้งร้านก่อนสั่ง)
 *   • ฐานสีดำ/สีขาว ฟรี · เฉพาะฐานใส +5 บาท
 *
 * ภาพประกอบตัวเลือก (ผู้ใช้สั่ง 25 ส.ค. 69 — อยากให้เห็นว่าแต่ละแบบหน้าตาเป็นยังไง):
 *   • "ขนาด" display cards — การ์ดสเกลจริงบนหลังมือถือ (ดีไซน์เดียวกับชุด size ของ Griptok อะคริลิค v3)
 *     แต่หน้าชิ้นงานเป็นเนื้อกระจกเงิน + แถบสะท้อนแสง ให้รู้ว่าเป็นงาน Mirror
 *   • "ฐาน Griptok" display cards — ภาพฐานขาว/ดำ/ใส ใช้ร่วมกับคลัง products/griptok-acrylic/base-*.jpg
 *   • แกลเลอรี 5 ใบ = ภาพงานจริงชุด "Acrylic mirror" จากบล็อก GRIPTOK MIRROR บนหน้า /griptok (wixstatic)
 *
 * ทำงานแบบ read-modify-write บนแถวจริง — รันซ้ำได้ (กันทับสินค้าอื่นที่ id ชนกัน)
 * ⚠️ อัปภาพทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย v1 ครั้งหน้าขึ้น v2
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { hasQuoteOption, priceRange, type PriceTier, type Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ID = "griptok-mirror";
const OUT = ".cache/griptok-mirror/upload";
const V = "v1";
const PAGE = "https://www.iduckyofficial-pricelists.com/griptok";
const ANCHOR = "GRIPTOK MIRROR";
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}-${V}.jpg`;
/** ภาพฐาน Griptok ที่มีในคลังอยู่แล้ว (สินค้า Griptok อะคริลิค/ปั๊มนูน ใช้ชุดเดียวกัน) */
const BASE_IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/griptok-acrylic/${name}.jpg`;

/* ── 1. ดึงตารางราคาสดจากเว็บ ───────────────────────────────────── */
const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s: string) => decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const html = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } }).then((r) => {
  if (!r.ok) throw new Error(`ดึงหน้า ${PAGE} ไม่ได้ — HTTP ${r.status}`);
  return r.text();
});

function mirrorTable(): string[][] {
  // หัวข้อ "GRIPTOK MIRROR" โผล่ 2 ที่ (สารบัญ + เนื้อหา) — เอาตัวที่มี <table> ตามหลังใกล้ ๆ
  let a = -1;
  for (let i = html.indexOf(ANCHOR); i >= 0; i = html.indexOf(ANCHOR, i + 1)) {
    const t = html.indexOf("<table", i);
    if (t >= 0 && t - i < 3000) {
      a = t;
      break;
    }
  }
  if (a < 0) throw new Error(`หา "${ANCHOR}" ที่มีตารางตามหลังไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
  const rows = [...html.slice(a, html.indexOf("</table>", a)).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
    [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
  );
  if (rows.length < 3 || rows[0][0] !== "จำนวน" || rows[0].slice(1).join("|") !== "4cm|5cm|6cm")
    throw new Error(`ตารางที่เจอไม่ใช่ตาราง GRIPTOK MIRROR (หัว "${rows[0]?.join("|")}")`);
  return rows;
}

const rows = mirrorTable();
const TIERS: PriceTier[] = rows.slice(1).map((r) => {
  const m = r[0].match(/([\d,]+)\s*[-–]\s*([\d,]+)/);
  return { upTo: m ? Number(m[2].replace(/,/g, "")) : null, label: r[0] };
});
if (TIERS.some((t, i) => i < TIERS.length - 1 && !t.upTo) || TIERS[TIERS.length - 1].upTo !== null)
  throw new Error(`ช่วงจำนวนบนเว็บอ่านไม่ครบ (${TIERS.map((t) => t.label).join(" · ")}) — ตรวจก่อน`);

const SIZES = rows[0].slice(1); // ["4cm","5cm","6cm"]
const PRICES: Record<string, number[]> = Object.fromEntries(
  SIZES.map((s, col) => [
    s,
    rows.slice(1).map((r) => {
      const n = Number(String(r[col + 1]).replace(/[^\d]/g, ""));
      if (!n) throw new Error(`ช่องราคา ${s} แถว "${r[0]}" อ่านไม่ออก ("${r[col + 1]}")`);
      return n;
    }),
  ])
);
// กันโครงเว็บเปลี่ยนแล้วหยิบตารางผิดตัว: ราคาต้องไม่เพิ่มเมื่อจำนวนมากขึ้น และช่วงแรกหลักร้อยกลาง ๆ
for (const s of SIZES) {
  const p = PRICES[s];
  if (p[0] > 400 || p.some((v, i) => i > 0 && v > p[i - 1]))
    throw new Error(`ราคาขนาด ${s} ผิดคาด (${p.join(", ")}) — ตรวจหน้าเว็บก่อน`);
}

console.log(`📊 ตาราง "GRIPTOK MIRROR (กระจก)" จากเว็บ — ${TIERS.length} ช่วงจำนวน × ${SIZES.length} ขนาด`);
for (const s of SIZES) console.log(`   ${s.padEnd(5)}`, PRICES[s].join(" / "));

/* ── 2. การ์ดขนาด 4/5/6 ซม. — สเกลจริงบนหลังมือถือ หน้าชิ้นงานเนื้อกระจก ── */
const TH = "Thonburi, 'Noto Sans Thai', 'Sukhumvit Set', sans-serif";
const INK = "#0f172a";
const SUB = "#64748b";
const ACCENT = "#0284c7";
const W = 900;
const H = 900;
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const PPC = 36; // px ต่อ 1 ซม. — สเกลเดียวกับชุด size ของ Griptok อะคริลิค เปิดเทียบข้ามสินค้าได้
const PHONE_CM = { w: 7.15, h: 14.7 };
const CX = 450;
const PHONE_BOTTOM = 700;
const PHONE_W = PHONE_CM.w * PPC;
const PHONE_H = PHONE_CM.h * PPC;
const PHONE_TOP = PHONE_BOTTOM - PHONE_H;
const PLATE_CY = PHONE_TOP + PHONE_H * 0.54;

const frame = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e0f2fe"/><stop offset="0.55" stop-color="#f8fafc"/><stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
    <linearGradient id="back" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eef2f7"/><stop offset="1" stop-color="#d8e0ea"/>
    </linearGradient>
    <linearGradient id="mirror" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8fafc"/><stop offset="0.45" stop-color="#cbd5e1"/>
      <stop offset="0.55" stop-color="#e8edf3"/><stop offset="1" stop-color="#94a3b8"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="30" fill="#ffffff" fill-opacity="0.72" stroke="#e2e8f0" stroke-width="2"/>
  ${body}
</svg>`;

const header = (cm: number) => `
  <text x="${W / 2}" y="92" font-family="${TH}" font-size="50" font-weight="700" text-anchor="middle" fill="${INK}">ขนาดชิ้นงาน <tspan fill="${ACCENT}">${cm} cm</tspan></text>
  <text x="${W / 2}" y="136" font-family="${TH}" font-size="24" text-anchor="middle" fill="${SUB}">Griptok กระจก (Mirror) แปะหลังมือถือ — ภาพตามสเกลจริง (มือถือสูง ~14.7 ซม.)</text>`;

const phoneBack = () => {
  const x = CX - PHONE_W / 2;
  const y = PHONE_TOP;
  const camX = x + 18;
  const camY = y + 18;
  return `
    <rect x="${x + 8}" y="${y + 14}" width="${PHONE_W}" height="${PHONE_H}" rx="34" fill="#0f172a" fill-opacity="0.08"/>
    <rect x="${x}" y="${y}" width="${PHONE_W}" height="${PHONE_H}" rx="34" fill="url(#back)" stroke="#94a3b8" stroke-width="3"/>
    <rect x="${camX}" y="${camY}" width="86" height="86" rx="24" fill="#c3cddb" stroke="#9fb0c6" stroke-width="2"/>
    <circle cx="${camX + 26}" cy="${camY + 26}" r="13" fill="#7e93ad"/><circle cx="${camX + 60}" cy="${camY + 60}" r="13" fill="#7e93ad"/>
    <circle cx="${camX + 26}" cy="${camY + 26}" r="5" fill="#5a708c"/><circle cx="${camX + 60}" cy="${camY + 60}" r="5" fill="#5a708c"/>`;
};

/**
 * ชิ้นงานกระจกแปะกลางฝาหลัง — หน้าชิ้นงานเทเนื้อกระจกเงิน + แถบสะท้อนแสงทแยง
 * กรอบเส้นประ = ขนาดที่สั่ง (ไดคัทตามลาย) + วงฐาน Griptok (~3.5 ซม.) ตรงกลาง
 */
const plate = (cm: number) => {
  const s = cm * PPC;
  const x = CX - s / 2;
  const y = PLATE_CY - s / 2;
  const rx = Math.round(s * 0.16);
  const numSize = Math.max(56, Math.round(s * 0.3));
  const baseR = (3.5 * PPC) / 2;
  const dimY = y - 24;
  return `
    <clipPath id="clip${cm}"><rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${rx}"/></clipPath>
    <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${rx}" fill="url(#mirror)"/>
    <g clip-path="url(#clip${cm})">
      <rect x="${x - s * 0.35}" y="${y - s * 0.2}" width="${s * 0.28}" height="${s * 1.6}" fill="#ffffff" fill-opacity="0.65" transform="rotate(24 ${CX} ${PLATE_CY})"/>
      <rect x="${x + s * 0.28}" y="${y - s * 0.2}" width="${s * 0.1}" height="${s * 1.6}" fill="#ffffff" fill-opacity="0.5" transform="rotate(24 ${CX} ${PLATE_CY})"/>
    </g>
    <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${rx}" fill="none" stroke="${ACCENT}" stroke-width="4" stroke-dasharray="12 8"/>
    <circle cx="${CX}" cy="${PLATE_CY}" r="${baseR}" fill="none" stroke="${ACCENT}" stroke-opacity="0.5" stroke-width="3"/>
    <circle cx="${CX}" cy="${PLATE_CY}" r="${baseR * 0.55}" fill="none" stroke="${ACCENT}" stroke-opacity="0.4" stroke-width="2.5"/>
    <text x="${CX}" y="${y + Math.max(54, Math.round(s * 0.3))}" font-family="${TH}" font-size="${numSize}" font-weight="800" text-anchor="middle" fill="${INK}">${cm}<tspan font-size="${Math.round(numSize * 0.45)}" font-weight="700"> cm</tspan></text>
    <line x1="${x}" y1="${dimY}" x2="${x + s}" y2="${dimY}" stroke="${ACCENT}" stroke-width="2"/>
    <line x1="${x}" y1="${dimY - 7}" x2="${x}" y2="${dimY + 7}" stroke="${ACCENT}" stroke-width="2"/>
    <line x1="${x + s}" y1="${dimY - 7}" x2="${x + s}" y2="${dimY + 7}" stroke="${ACCENT}" stroke-width="2"/>
    <text x="${CX}" y="${dimY - 14}" font-family="${TH}" font-size="22" text-anchor="middle" fill="${ACCENT}">${esc(`ด้านที่ยาวที่สุด ${cm} ซม.`)}</text>`;
};

const ruler = (cm: number) => {
  const s = cm * PPC;
  const x0 = CX - s / 2;
  const y = PHONE_BOTTOM + 20;
  const ticks = Array.from(
    { length: cm + 1 },
    (_, i) => `<line x1="${x0 + i * PPC}" y1="${y}" x2="${x0 + i * PPC}" y2="${y + (i % 5 === 0 ? 15 : 9)}" stroke="#94a3b8" stroke-width="2"/>`
  ).join("");
  return `<line x1="${x0}" y1="${y}" x2="${x0 + s}" y2="${y}" stroke="#94a3b8" stroke-width="2.5"/>${ticks}
    <text x="${CX}" y="${y + 42}" font-family="${TH}" font-size="21" text-anchor="middle" fill="${SUB}">1 ช่อง = 1 ซม.</text>`;
};

const foot = () => `
  <rect x="80" y="806" width="${W - 160}" height="62" rx="16" fill="#f1f5f9"/>
  <text x="${W / 2}" y="832" font-family="${TH}" font-size="21" text-anchor="middle" fill="#475569">รูปทรงไดคัทตามลายที่ส่งมา · พื้นเงา = เนื้ออะคริลิคกระจก · วงกลาง = ฐาน Griptok</text>
  <text x="${W / 2}" y="858" font-family="${TH}" font-size="21" text-anchor="middle" fill="#475569">ขนาดนับจากด้านที่ยาวที่สุด ไม่วัดแนวทแยง · ตัดตกจากขนาดจริงด้านละ 3mm</text>`;

console.log(`🎨 การ์ดขนาด GRIPTOK MIRROR (${V}) → ${OUT}`);
for (const cm of [4, 5, 6]) {
  const svg = frame(`${header(cm)}${phoneBack()}${plate(cm)}${ruler(cm)}${foot()}`);
  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
  const name = `size-${cm}-${V}.jpg`;
  writeFileSync(`${OUT}/${name}`, buf);
  console.log(`   ${name}  ${Math.round(buf.length / 1024)} KB`);
}

/* ── 3. แกลเลอรี — ภาพงานจริงชุด "Acrylic mirror" จากบล็อก MIRROR บนหน้า /griptok ── */
const WIX: Record<string, string> = {
  // ชิ้นงานกระจกติดฐาน Griptok บนหลังมือถือ (เห็นตัวจับชัด) — ใช้เป็นหน้าปก
  "gallery-1": "959b83_d46b2113e88744cfbf7a7ec4fdafb182~mv2.jpg",
  "gallery-2": "959b83_939736984a534dc29275db781f257e9b~mv2.jpg", // ชิ้นงานแมวฮาโลวีนโค้งประตู เห็นเงาสะท้อน
  "gallery-3": "959b83_88645cd596e34d6697ced58285bb1f7c~mv2.jpg", // งานกระจกในเคสใส
  "gallery-4": "959b83_ef492fead613402dacd3cd90dede13b2~mv2.jpg", // ผีน้อยเนื้อกระจกไล่เงา
  "gallery-5": "959b83_af059c064d8a4fa19570a38037ca73f0~mv2.jpg", // เนื้อกระจกทรงกลม (งานพวงกุญแจ) โชว์ผิวสะท้อน
};

for (const [name, wixId] of Object.entries(WIX)) {
  const u = `https://static.wixstatic.com/media/${wixId}/v1/fill/w_1200,h_1200,al_c,q_88/file.jpg`;
  const res = await fetch(u);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`${OUT}/${name}-${V}.jpg`, buf);
  console.log(`   ${name}-${V}.jpg  ${Math.round(buf.length / 1024)} KB (wix)`);
}

/* ── 4. ตัวสินค้า ────────────────────────────────────────────────── */
const TABS: Product["tabs"] = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text: [
      "• GRIPTOK MIRROR (กระจก) — งานอะคริลิคประกบ 2 ชิ้น ด้านหน้าเป็นอะคริลิคกระจกเงาสะท้อน หนา 1.5 มม. + ประกบหลังด้วยอะคริลิคขาว หนา 1 มม. รวมหนาประมาณ 2.5-3 มม. · พิมพ์ลายระบบ UV Printing",
      "• ขนาด 4-6 ซม. (นับจากด้านที่ยาวที่สุด) · ต้องการขนาดใหญ่กว่านี้ บวกเพิ่ม ซม. ละ 15 บาท — แจ้งร้านทางแชท/หมายเหตุก่อนสั่ง",
      "• 1-10 ชิ้น สามารถคละลายได้ · ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย คละขนาด ขั้นต่ำ 5 ชิ้น",
      "• ฐานสีดำและสีขาว ไม่บวกเงินเพิ่ม · เฉพาะฐานใส บวกเพิ่ม 5 บาท",
      "• สั่งตั้งแต่ 24 ชิ้นขึ้นไป ฟรีแพ็คเกจ (คละลาย/ขั้นต่ำ 24 30 36 42 ... บวกเพิ่มทีละ 6 ชิ้น ไม่รับเศษที่หาร 6 ไม่ลงตัว)",
      "• ตัดตกจากขนาดงานจริงด้านละ 3mm · ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดแนวทแยง)",
      "• ไฟล์ นามสกุล .Ai .Psd .Png หรือพื้นหลังใส",
      "• ทางร้านมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องต่างกันประมาณ 5-10% · ใช้สี RGB สีที่ได้อาจสว่าง/ดรอปลง +-5% ถึง +-15%",
      "• สำหรับงานอะคริลิคทุกประเภท ทางร้านจะแปะฟิล์มกันรอยไว้ทุกชิ้น",
    ].join("\n"),
  },
  {
    title: "วิธีสั่งงาน",
    text: "สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกจำนวนและตัวเลือกที่ต้องการ แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง \"แนบลายของคุณ\"\n• ระบุรายละเอียดเพิ่มเติมในช่อง \"หมายเหตุถึงร้าน\" เช่น ขนาด/รุ่นที่ต้องการ · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\nหรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: สินค้า/ขนาดที่เลือก · รายละเอียดเพิ่มเติม (ถ้ามี) · จำนวน · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
  },
  {
    title: "การเตรียมไฟล์",
    text: "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด",
  },
  {
    title: "การรับประกันสินค้า",
    text: "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• สีหรืออะไหล่ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\nไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\nระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
  },
];

const product: Product = {
  id: ID,
  slug: "griptok-mirror",
  name: "GRIPTOK MIRROR (กระจก)",
  category: "phone-gadget",
  price: PRICES["4cm"][PRICES["4cm"].length - 1],
  emoji: "🪞",
  gradient: "from-slate-100 to-zinc-200",
  imageSrc: IMG("gallery-1"),
  rating: 5,
  sold: 0,
  badge: "ใหม่",
  description:
    "Griptok กระจก (Mirror) พิมพ์ลายตามสั่งด้วยระบบ UV Printing งานอะคริลิคประกบ 2 ชิ้น — " +
    "ด้านหน้าเป็นอะคริลิคกระจกเงาสะท้อนแบบกระจกจริง หนา 1.5 มม. ประกบด้านหลังด้วยอะคริลิคขาว หนา 1 มม. " +
    "รวมความหนาชิ้นงานประมาณ 2.5-3 มม. แข็งแรงไม่บางเปราะ ไดคัทตามลายที่ส่งมา " +
    "เลือกขนาดได้ 4-6 ซม. ฐานสีขาว/ดำ/ใส ไม่มีขั้นต่ำในการสั่งผลิต ยิ่งสั่งเยอะยิ่งถูก",
  highlights: [
    "เนื้ออะคริลิคกระจก เงาสะท้อนแบบกระจกจริง",
    "กระจก 1.5 มม. + ขาวประกบหลัง 1 มม. — หนารวม ~2.5-3 มม.",
    "ขนาด 4-6 ซม. · ฐานสีขาว/ดำ/ใส",
    "1-10 ชิ้น คละลายได้ · 11 ชิ้นขึ้นไป คละลาย คละขนาด",
    `ยิ่งสั่งเยอะยิ่งถูก — เริ่มต้น ${PRICES["4cm"][PRICES["4cm"].length - 1]} บาท/ชิ้น`,
  ],
  // แกลเลอรีจำกัด 5 ช่อง (MAX_PHOTOS ใน ProductEditor) — ภาพการ์ดขนาด/ฐานถูกดูดเข้าแกลเลอรีเองจากตัวเลือก
  images: [
    { emoji: "🪞", gradient: "from-slate-100 to-zinc-200", label: "Griptok กระจกบนหลังมือถือ", src: IMG("gallery-1") },
    { emoji: "🐱", gradient: "from-slate-100 to-zinc-200", label: "ชิ้นงานกระจกไดคัทตามลาย", src: IMG("gallery-2") },
    { emoji: "📱", gradient: "from-slate-100 to-zinc-200", label: "งานกระจกในเคสใส", src: IMG("gallery-3") },
    { emoji: "👻", gradient: "from-violet-100 to-slate-200", label: "เนื้อกระจกไล่เงาสะท้อน", src: IMG("gallery-4") },
    { emoji: "🔑", gradient: "from-sky-100 to-slate-200", label: "ผิวกระจกสะท้อน (ตัวอย่างงานพวงกุญแจ)", src: IMG("gallery-5") },
  ],
  pricing: {
    unit: "ชิ้น",
    driverLabels: ["ขนาด"],
    tiers: TIERS,
    cells: Object.fromEntries(SIZES.map((s) => [s, PRICES[s]])),
  },
  options: [
    {
      label: "ขนาด",
      // 📝 สเปคความหนากำกับใต้ชื่อกลุ่ม (ผู้ใช้สั่ง 25 ส.ค. 69 — อยากให้เห็นตรงจุดเลือกขนาดด้วย)
      note:
        "ตัวอะคริลิคกระจก หนา 1.5 มม. + อะคริลิคขาวประกบด้านหลัง หนา 1 มม. — " +
        "**รวมแล้วหนาประมาณ 2.5-3 มม.** แข็งแรงไม่บางเปราะ",
      display: "cards",
      choices: SIZES.map((s, i) => ({
        name: s,
        imageSrc: IMG(`size-${s.replace("cm", "")}`),
        desc: `สั่งเยอะเหลือชิ้นละ ${PRICES[s][PRICES[s].length - 1]} บาท (${TIERS[TIERS.length - 1].label})`,
        ...(i === 1 ? { popular: true } : {}),
      })),
    },
    {
      label: "ฐาน Griptok",
      // (โน้ตกำกับกลุ่มนี้เคยมี — ผู้ใช้สั่งเอาออก 25 ส.ค. 69 ราคาฟรี/+5 มีบนการ์ดอยู่แล้ว)
      display: "cards",
      choices: [
        { name: "สีขาว", desc: "ฟรี — เข้ากับงานพื้นอ่อน", imageSrc: BASE_IMG("base-white"), popular: true },
        { name: "สีดำ", desc: "ฟรี — เข้ากับงานพื้นเข้ม", imageSrc: BASE_IMG("base-black") },
        { name: "สีใส (มีรอยขนแมวบ้าง)", desc: "โชว์หลังมือถือ ไม่บังลายเคส", extra: 5, imageSrc: BASE_IMG("base-clear") },
      ],
    },
  ],
  terms: [
    "งานอะคริลิคประกบ 2 ชิ้น — อะคริลิคกระจก 1.5 มม. + อะคริลิคขาวประกบหลัง 1 มม. รวมหนาประมาณ 2.5-3 มม.",
    "ขนาด 4-6 ซม. · ต้องการขนาดใหญ่กว่านี้ บวกเพิ่ม ซม. ละ 15 บาท (แจ้งร้านก่อนสั่ง)",
    "1-10 ชิ้น สามารถคละลายได้ · ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย คละขนาด ขั้นต่ำ 5 ชิ้น",
    "ฐานสีดำและสีขาว ไม่บวกเงินเพิ่ม · เฉพาะฐานใส บวกเพิ่ม 5 บาท",
    "สั่งตั้งแต่ 24 ชิ้นขึ้นไป ฟรีแพ็คเกจ (คละลาย/ขั้นต่ำ 24 30 36 42 ... บวกเพิ่มทีละ 6 ชิ้น ไม่รับเศษที่หาร 6 ไม่ลงตัว)",
    "ตัดตกจากขนาดงานจริงด้านละ 3mm · ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดแนวทแยง)",
    "ทางร้านใช้สีระบบ RGB สีงานที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
  ].join("\n"),
  tabs: TABS,
  hidden: true,
};

const range = priceRange(product);
const saved: Product = {
  ...product,
  ...(hasQuoteOption(product) ? { quoteOption: true } : {}),
  priceMin: range.min,
  priceMax: range.max,
  savedAt: new Date().toISOString(),
};

console.log("ราคา:", range, "· ตัวเลือก:", saved.options.length, "กลุ่ม · แกนราคา:", saved.pricing?.driverLabels);

if (!WRITE) {
  console.log("(ยังไม่เขียน — เปิดภาพใน .cache ดูก่อน แล้วใส่ --write เพื่ออัปภาพ + บันทึกลง Supabase)");
  process.exit(0);
}

async function main() {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  for (const file of readdirSync(OUT).filter((f) => f.endsWith(".jpg"))) {
    const up = await sb.storage
      .from("product-images")
      .upload(`products/${ID}/${file}`, readFileSync(`${OUT}/${file}`), { contentType: "image/jpeg", upsert: true });
    if (up.error) {
      console.error(`อัป ${file} ไม่สำเร็จ:`, up.error.message);
      process.exit(1);
    }
    console.log(`⬆️  ${file}`);
  }

  const { data: row } = await sb.from("products").select("id,name,sort").eq("id", ID).maybeSingle();
  if (row && row.name !== saved.name) {
    console.error(`id ${ID} ถูกใช้โดยสินค้าอื่นอยู่: "${row.name}" — หยุดไว้ก่อน`);
    process.exit(1);
  }
  const { data: maxRow } = await sb.from("products").select("sort").order("sort", { ascending: false }).limit(1);
  const sort = (row?.sort as number | undefined) ?? ((maxRow?.[0]?.sort as number | undefined) ?? 0) + 1;
  const { error } = await sb.from("products").upsert(
    {
      id: saved.id,
      name: saved.name,
      category: saved.category,
      price: saved.price,
      sold: saved.sold,
      featured: false,
      badge: saved.badge ?? null,
      sort,
      data: saved,
    },
    { onConflict: "id" }
  );
  if (error) {
    console.error("บันทึกไม่สำเร็จ:", error.message);
    process.exit(1);
  }
  console.log(`✅ บันทึกแล้ว: ${ID} (sort ${sort}) — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
}

main();
