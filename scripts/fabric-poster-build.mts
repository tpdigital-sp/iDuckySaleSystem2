/**
 * สร้างสินค้าใหม่ "ผ้าแขวนผนัง" (id: fabric-poster) — Fabric Poster / ผ้าสกรีนยกหลา
 *
 *   npx tsx scripts/fabric-poster-build.mts            # ดูข้อมูล + เซฟภาพตัวอย่างลง out/ (ไม่เขียน DB)
 *   npx tsx scripts/fabric-poster-build.mts --write    # อัปรูป + เขียนลง Supabase (ฉบับร่าง)
 *
 * ที่มา: iduckyofficial-pricelists.com/fabricposter — สคริปต์อ่านตารางสดทุกครั้ง
 *   • ตาราง 1 ผ้ามาตรฐาน 9 คอลัมน์ (ฮาร์มิต/แคนวาส×2/Short Plush/Satin Peach/Satin Silk/ขนสั้น/ลูกฟูก/ซิติโน่)
 *     ⚠️ "ผ้าแคนวาส" ซ้ำ 2 คอลัมน์ — บนหน้าเว็บมีป้ายลอย "หนา 8 Oz" / "หนา 14 Oz" ทับหัวตาราง
 *     (เช็คตำแหน่ง px แล้ว คอลัมน์ซ้าย = 8 Oz ราคาถูกกว่า · ตรงกับใบราคาในไดรฟ์ร้าน P-nผ้าหลา-01)
 *     และ "หนา 230 แกรม" เป็นของ ผ้าขนสั้น
 *   • ตาราง 2 ผ้าสะท้อนน้ำ 4 คอลัมน์ (Pongee 300T / Binnan 210T / Taffeta 190T / ผ้าร่มหนา 600D)
 *   → รวมเป็นตารางราคาเดียว แกน "ชนิดผ้า" 13 ตัวเลือก (การ์ดมีรูป+คำอธิบาย ตามที่ผู้ใช้สั่ง 25 ส.ค. 69)
 *   ⚠️ ตารางที่ 3 บนหน้าเดียวกัน (Size S-XXL ต่อผืน) เป็นของ STICKY FABRIC คนละสินค้า — ไม่เกี่ยว
 *
 * รูปตัวเลือกผ้า: ไดรฟ์ร้าน /Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ/เนื้อผ้าต่างๆ
 *   (รูปสตูดิโอ 1970px มีแถบแคปชันล่าง → ครอปเหลือ 66% บน) · ชนิดที่ไม่มีรูปเดี่ยว (ลูกฟูก/Pongee/
 *   Binnan/Taffeta/600D) ครอปจากชาร์ต P-ใบชนิดเนื้อผ้า-New.jpg (3286×5386) · ต้อง mount ไดรฟ์ก่อนรัน
 *   หมายเหตุ: รูปขนสั้นในไดรฟ์เป็นป้าย "200 แกรม" แต่เว็บ/ใบราคาระบุ 230 แกรม — ใช้รูปเป็นตัวอย่างเนื้อผ้า
 *
 * OPTION เสริม (ตารางกราฟิก "ราคาตัดแบ่งผ้า และเย็บ/โพ้ง" — คิดต่อชิ้นจากด้านที่ยาวที่สุด):
 *   ผู้ใช้สั่ง 25 ส.ค. 69: เลือกผสม 2 มิติ + ระบบคำนวณอัตโนมัติ
 *   • กลุ่ม "การตัด": ตัดเต็มหลา | ตัดแบ่งตามขนาด (โชว์ช่องกรอก กว้าง/ยาว บังคับกรอก)
 *   • กลุ่ม "การเก็บขอบ": ไม่เย็บขอบ | เย็บขอบ | โพ้งขอบ — เลือกคู่กับการตัดแบบไหนก็ได้
 *   ราคาใช้กลไก sizeFee (เพิ่มใหม่ใน lib/products.ts): ขั้นตามด้านยาวสุด 30/60/90/120/150 ซม.
 *   ตัดแบ่ง +5..25 · เย็บขอบ +15..75 · โพ้งขอบ +10..70 บาท/ชิ้น × จำนวนชิ้นที่ตัดได้ต่อหลา
 *   (จัดวาง Print-Fit ในพื้นที่ 145×90 ช่องไฟ 1.5 = ตัดตก 1-2 ซม. · เต็มหลา = ขั้น 150 ซม. ชิ้นเดียว)
 *   sheetYield โชว์ "ตัดได้ ~กี่ชิ้นต่อหลา" · เจาะรูตาไก่ คู่ละ 10 บาท (multi + ระบุจำนวนคู่)
 *   ภาพการ์ด "ตัดแบ่ง" = scripts/assets/fabric-poster/cut-card.jpg (คอมโพสจากรูปจริง สไตล์การ์ดร้าน)
 */
import { readFileSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { hasQuoteOption, priceRange, type PriceMatrix, type Product, type ProductOption, type SizeFee } from "../src/lib/products";

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

const ID = "fabric-poster";
const NAME = "ผ้าแขวนผนัง";
const CATEGORY = "fabric"; // ผ้า / หมอน / ผ้าห่ม (คำอธิบายหมวดมี "ผ้าหลา" · fabricposter-2 ตัว import เก่าก็อยู่หมวดนี้)
const V = "v1"; // ⚠️ ห้ามอัปทับชื่อไฟล์เดิม (Next/CDN แคช) — แก้รูปครั้งหน้าขยับเป็น v2
const PAGE = "https://www.iduckyofficial-pricelists.com/fabricposter";
const UNIT = "หลา";
const GROUP_FABRIC = "ชนิดผ้า"; // = driverLabels[0] — ห้ามเปลี่ยนโดยไม่แก้ cells (กับดักแกนตารางราคา)
const GROUP_CUT = "การตัด";
const CUT_FULL = "ตัดเต็มหลา";
const CUT_SPLIT = "ตัดแบ่งตามขนาด";
const GROUP_EDGE = "การเก็บขอบ";
const GROUP_EYELET = "เจาะรูแขวนผนัง";
const W_LABEL = "ขนาดชิ้นงาน (กว้าง)";
const H_LABEL = "ขนาดชิ้นงาน (ยาว)";
/** พื้นที่วางชิ้นใน 1 หลา — ช่องไฟ 1.5 ซม. = พื้นที่ตัดตกระหว่างชิ้น 1-2 ซม. ตามกติกาหน้าเว็บ */
const YARD_SHEET = { sheetW: 145, sheetH: 90, gap: 1.5 };
/** เงื่อนไข "อ่านขนาดจากช่องกรอก" — ชุดเดียวกับ showWhen ของช่องกรอก (การตัด = ตัดแบ่งตามขนาด) */
const SIZE_WHEN = { label: GROUP_CUT, choices: [CUT_SPLIT] };
const TIER_CMS = [30, 60, 90, 120, 150];
/** ขั้นราคาตามด้านยาวสุด ต่อชิ้น (ตารางกราฟิกบนเว็บ/ใบราคาไดรฟ์) — เต็มหลา (145) ตกขั้น 150 อัตโนมัติ */
const feeTiers = (fees: number[]): SizeFee => ({
  when: SIZE_WHEN,
  widthLabel: W_LABEL,
  heightLabel: H_LABEL,
  defaultLongest: 145,
  tiers: TIER_CMS.map((upTo, i) => ({ upTo, fee: fees[i] })),
  perPiece: YARD_SHEET,
});

const DRIVE = "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/งานผ้าต่างๆ";
const DIR_FABRIC = `${DRIVE}/เนื้อผ้าต่างๆ`;
const DIR_POSTER = `${DRIVE}/25_Fabric poster-ผ้าแขวนผนัง - ผ้าสกรีนยกหลา`;
const CHART = `${DIR_FABRIC}/P-ใบชนิดเนื้อผ้า-New.jpg`; // ชาร์ต "เนื้อผ้า" 5 แถว × 4 คอลัมน์ 3286×5386

const OUT = new URL("../scratchpad_out/fabric-poster/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = (file: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

/* ── 1. ดึง 2 ตารางราคาจากเว็บ ───────────────────────────────────── */
const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s: string) => decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const html = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } }).then((r) => {
  if (!r.ok) throw new Error(`ดึงหน้า ${PAGE} ไม่ได้ — HTTP ${r.status}`);
  return r.text();
});

function parseTable(from: number): { rows: string[][]; end: number } {
  const t = html.indexOf("<table", from);
  if (t < 0) throw new Error("หา <table> ถัดไปไม่เจอ");
  const end = html.indexOf("</table>", t);
  const rows = [...html.slice(t, end).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
    [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
  );
  return { rows, end };
}

const T0_HEAD = ["จำนวน", "ผ้าฮาร์มิต", "ผ้าแคนวาส", "ผ้าแคนวาส", "ผ้า Short Plush", "ผ้า Satin Peach", "ผ้า Satin Silk", "ผ้าขนสั้น", "ผ้าลูกฟูก", "ผ้าซิติโน่"];
const T1_HEAD = ["จำนวน", "ผ้า Pongee 300T", "ผ้า Binnan fabric 210T", "ผ้า taffeta 190T", "ผ้าร่มหนา 600D"];

const t0 = parseTable(0);
const t1 = parseTable(t0.end);
if (JSON.stringify(t0.rows[0]) !== JSON.stringify(T0_HEAD))
  throw new Error(`หัวตารางผ้ามาตรฐานไม่ตรงคาด: ${t0.rows[0]?.join("|")} — โครงหน้าเว็บอาจเปลี่ยน`);
if (JSON.stringify(t1.rows[0]) !== JSON.stringify(T1_HEAD))
  throw new Error(`หัวตารางผ้าสะท้อนน้ำไม่ตรงคาด: ${t1.rows[0]?.join("|")} — โครงหน้าเว็บอาจเปลี่ยน`);

function tierRows(rows: string[][], cols: number): { tiers: { upTo: number | null; label: string }[]; prices: number[][] } {
  const body = rows.slice(1);
  const tiers = body.map((r, i) => {
    if (!/หลา/.test(r[0])) throw new Error(`แถวช่วงจำนวนไม่ตรงคาด: "${r[0]}"`);
    const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
    return { upTo: i === body.length - 1 ? null : m ? Number(m[2]) : null, label: r[0] };
  });
  if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ");
  const prices = body.map((r) => {
    const ps = r.slice(1, 1 + cols).map((c) => Number(String(c).replace(/[^\d]/g, "")));
    if (ps.length !== cols || ps.some((n) => !n)) throw new Error(`แถว "${r[0]}" ราคาอ่านไม่ครบ (${r.slice(1).join("|")})`);
    return ps;
  });
  return { tiers, prices };
}

const std = tierRows(t0.rows, 9);
const wat = tierRows(t1.rows, 4);
if (JSON.stringify(std.tiers) !== JSON.stringify(wat.tiers))
  throw new Error("ช่วงจำนวนของ 2 ตารางไม่ตรงกัน — ตรวจหน้าเว็บก่อน");
// กันจับคอลัมน์แคนวาสสลับข้าง: 8 Oz (คอลัมน์ซ้าย) ต้องถูกกว่า 14 Oz (270 < 300)
if (!(std.prices[0][1] < std.prices[0][2]))
  throw new Error(`แคนวาส 2 คอลัมน์ราคาไม่เรียงถูก (${std.prices[0][1]} / ${std.prices[0][2]}) — ตรวจป้ายความหนาบนเว็บก่อน`);

/* ── 2. ชนิดผ้า 13 ตัว: ชื่อ + คำอธิบาย + ที่มารูป ─────────────────── */
type ImgSrc =
  | { kind: "drive"; path: string; cropTop?: number } // รูปสตูดิโอในไดรฟ์ (cropTop = สัดส่วนความสูงที่เก็บไว้)
  | { kind: "chart"; r: number; c: number } // ครอปช่องรูปจากชาร์ตเนื้อผ้า (แถว, คอลัมน์ เริ่ม 0)
  | { kind: "wix"; id: string }; // รูปจากหน้า pricelists (wixstatic)

/** ลำดับต้องตรงคอลัมน์เว็บ: ตาราง 1 คอลัมน์ 1-9 แล้วต่อด้วยตาราง 2 คอลัมน์ 1-4 */
const FABRICS: { name: string; file: string; desc: string; badge?: string; img: ImgSrc }[] = [
  { name: "ผ้าฮาร์มิต", file: "fabric-harmit", img: { kind: "drive", path: `${DIR_FABRIC}/9.ผ้าฮาร์มิต.jpg`, cropTop: 0.66 },
    desc: "เนื้อผ้าละเอียด ผิวสัมผัสเรียบเนียน ยับยาก สีไม่ซีดง่าย ทนต่อการซัก ไม่เป็นขน" },
  { name: "ผ้าแคนวาส หนา 8 Oz", file: "fabric-canvas-8oz", img: { kind: "drive", path: `${DIR_FABRIC}/5.ผ้าแคนวาส 8 ออนซ์.jpg`, cropTop: 0.66 },
    desc: "ทอจากใยฝ้าย ลายเนื้อผ้าละเอียด หนาปานกลาง น้ำหนักเบา แข็งแรง ทนทาน พกพาสะดวก" },
  { name: "ผ้าแคนวาส หนา 14 Oz", file: "fabric-canvas-14oz", img: { kind: "drive", path: `${DIR_FABRIC}/4.ผ้าแคนวาส 14ออนซ์.jpg`, cropTop: 0.66 },
    desc: "เนื้อหนาเป็นพิเศษ แข็งแรง ทรงตัวได้ดี ไม่ย้วยง่าย รับน้ำหนักได้ดีมาก ใช้งานยาวนาน" },
  { name: "ผ้า Short Plush", file: "fabric-short-plush", img: { kind: "drive", path: `${DIR_FABRIC}/1.Short Plush.jpg`, cropTop: 0.66 },
    desc: "ขนสั้นนุ่มละมุน เนื้อแน่นเรียบตัว ไม่หลุดร่วงง่าย ผ้าค่อนข้างหนา ทิ้งตัวได้ดี" },
  { name: "ผ้า Satin Peach", file: "fabric-satin-peach", img: { kind: "drive", path: `${DIR_FABRIC}/6.Satin Peach.jpg`, cropTop: 0.66 },
    desc: "ผ้านุ่มฟู ไม่เงาวาวจนเกินไป มีขนอ่อน ๆ คล้ายผิวลูกพีช เนื้อละเอียด ทิ้งตัวสวย" },
  { name: "ผ้า Satin Silk", file: "fabric-satin-silk", img: { kind: "drive", path: `${DIR_FABRIC}/7.Satin Silk.jpg`, cropTop: 0.66 },
    desc: "ลายไหมทอละเอียด เนื้อลื่นมันวาว พริ้วไหว น้ำหนักเบา ทิ้งตัวดี ซักง่ายแห้งเร็ว" },
  { name: "ผ้าขนสั้น", file: "fabric-fur-short", img: { kind: "drive", path: `${DIR_FABRIC}/2.ผ้าขนสั้น 200แกรม.jpg`, cropTop: 0.66 },
    desc: "หนา 230 แกรม ขนนุ่มน่าสัมผัส ผ้านิ่มทรงสวย อยู่ทรง" },
  { name: "ผ้าลูกฟูก", file: "fabric-corduroy", img: { kind: "chart", r: 3, c: 0 },
    desc: "เนื้อผ้ามีลอนนูนเป็นร่อง ดูมีมิติ ผ้าหนา แข็งแรง ทนต่อการใช้งานหนัก" },
  { name: "ผ้าซิติโน่", file: "fabric-satino", img: { kind: "drive", path: `${DIR_FABRIC}/16.Satino.jpg`, cropTop: 0.66 },
    desc: "โพลีเอสเตอร์ 100% เนื้อเรียบเนียน ผิวนิ่มลื่น อยู่ทรง สัมผัสเย็นสบาย" },
  { name: "ผ้า Pongee 300T", file: "fabric-pongee-300t", badge: "สะท้อนน้ำ", img: { kind: "chart", r: 1, c: 0 },
    desc: "ผ้าสะท้อนน้ำ เนื้อกึ่งด้าน เงาเล็กน้อย คล้ายผ้าฝ้าย อยู่ทรงรักษารูปทรงดี" },
  { name: "ผ้า Binnan fabric 210T", file: "fabric-binnan-210t", badge: "สะท้อนน้ำ", img: { kind: "chart", r: 1, c: 1 },
    desc: "ผ้าสะท้อนน้ำ เนื้อละเอียด ผิวเรียบเนียน น้ำหนักเบา ไม่อมน้ำ ทำความสะอาดง่าย" },
  { name: "ผ้า Taffeta 190T", file: "fabric-taffeta-190t", badge: "สะท้อนน้ำ", img: { kind: "chart", r: 4, c: 3 },
    desc: "ผ้าสะท้อนน้ำ เนื้อผ้าร่มละเอียด บางเบา เรียบลื่น เงาเล็กน้อย" },
  { name: "ผ้าร่มหนา 600D", file: "fabric-umbrella-600d", badge: "สะท้อนน้ำ", img: { kind: "chart", r: 2, c: 2 },
    desc: "ผ้าสะท้อนน้ำหนาพิเศษ ทนขีดข่วนและฉีกขาด กันน้ำซึม เหมาะงานภายนอกอาคาร" },
];

/** ราคาต่อชนิด เรียงตามลำดับ FABRICS (9 มาตรฐาน + 4 สะท้อนน้ำ) */
const priceCols: number[][] = FABRICS.map((_, i) =>
  i < 9 ? std.prices.map((row) => row[i]) : wat.prices.map((row) => row[i - 9])
);

const pricing: PriceMatrix = {
  unit: UNIT,
  driverLabels: [GROUP_FABRIC],
  tiers: std.tiers,
  cells: Object.fromEntries(FABRICS.map((f, i) => [f.name, priceCols[i]])),
};

console.log(`📊 ตารางจากเว็บ (${std.tiers.map((t) => t.label).join(" · ")})`);
for (const [i, f] of FABRICS.entries()) console.log(`   ${f.name}: ${priceCols[i].map((p) => `฿${p}`).join(" / ")}`);

/* ── 3. รูปภาพ ──────────────────────────────────────────────────── */
/** ช่องรูปในชาร์ตเนื้อผ้า — สัดส่วนวัดจากภาพเรนเดอร์ 920×1508 (มี inset กันติดขอบการ์ดข้าง ๆ) */
async function chartCell(r: number, c: number): Promise<Buffer> {
  const meta = await sharp(CHART).metadata();
  const W = meta.width!, H = meta.height!;
  const x0 = Math.round(((45 + c * 215.5) / 920) * W);
  const y0 = Math.round(((161 + r * 267) / 1508) * H);
  const w = Math.round((178 / 920) * W);
  const h = Math.round((136 / 1508) * H);
  return sharp(CHART).extract({ left: x0, top: y0, width: w, height: h }).jpeg({ quality: 88 }).toBuffer();
}

async function fromDrive(path: string, cropTop?: number, width = 1200): Promise<Buffer> {
  let img = sharp(path);
  if (cropTop) {
    const meta = await img.metadata();
    img = img.extract({ left: 0, top: 0, width: meta.width!, height: Math.round(meta.height! * cropTop) });
  }
  return img.resize({ width, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
}

async function fetchWix(wixId: string, size = "w_1200,h_1200"): Promise<Buffer> {
  const u = wixId.includes("~mv2")
    ? `https://static.wixstatic.com/media/${wixId}/v1/fit/${size},al_c,q_88/file.jpg`
    : `https://static.wixstatic.com/media/${wixId}`;
  const res = await fetch(u);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function render(src: ImgSrc): Promise<Buffer> {
  if (src.kind === "drive") return fromDrive(src.path, src.cropTop);
  if (src.kind === "chart") return chartCell(src.r, src.c);
  return fetchWix(src.id);
}

async function put(name: string, buf: Buffer): Promise<string> {
  const file = `${name}-${V}.jpg`;
  writeFileSync(`${OUT}${file}`, buf); // เก็บตัวอย่างไว้ดูก่อนเขียนจริงเสมอ
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

// รูปตัวเลือกผ้า 13
const fabricImg: Record<string, string> = {};
for (const f of FABRICS) fabricImg[f.name] = await put(f.file, await render(f.img));

// รูปตัวเลือกเก็บขอบ + ตาไก่ + แกลเลอรี
const artSpecs: Record<string, ImgSrc> = {
  "edge-none": { kind: "drive", path: `${DIR_POSTER}/สกรีนเต็มหลาไม่ตัด.jpg` },
  // การ์ดคอมโพสเอง (รูปจริง + กราฟิก สไตล์การ์ดเย็บ/โพ้งของร้าน) — อยู่ใน repo
  "cut-card-sq": { kind: "drive", path: new URL("./assets/fabric-poster/cut-card.jpg", import.meta.url).pathname },
  // ⚠️ แก้รูปการ์ดพวกนี้ครั้งหน้าต้องเปลี่ยน "คีย์" ใหม่เสมอ (ชื่อไฟล์เดิมโดน Next/CDN แคช)
  // ฉบับ v2 25 ส.ค. 69: ม็อคอัพผืนเรียบจากรูปจริง (tapestry LINE_ALBUM ครอปหน้าผ้า) + หมุดขาว + ตาไก่
  "eyelet-2top-sq": { kind: "drive", path: new URL("./assets/fabric-poster/eyelet-top.jpg", import.meta.url).pathname },
  "eyelet-4c-sq": { kind: "drive", path: new URL("./assets/fabric-poster/eyelet-4r.jpg", import.meta.url).pathname },
  "edge-sew": { kind: "drive", path: `${DIR_POSTER}/1754293120031.jpg` },
  "edge-serge": { kind: "drive", path: `${DIR_POSTER}/1754293125352.jpg` },
  // กราฟิก "แบบเจาะรูแขวนผนัง + ตาไก่ คู่ละ 10 บาท" จากหน้า pricelists
  "eyelet": { kind: "wix", id: "959b83_044991869f204029994db25fca3fad06~mv2.jpg" },
  "photo-poster": { kind: "drive", path: `${DIR_POSTER}/ตย/DSC00558.jpg` },
  // ผ้าสะท้อนน้ำ (ประภาคาร "Water repellent fabric") จากหน้า pricelists
  "photo-water": { kind: "wix", id: "959b83_a4033bb7066b46e79e1a775c978f016bf003.jpg" },
  // กราฟิกตารางค่าตัดแบ่ง/เย็บขอบ/โพ้งขอบ จากหน้า pricelists
  "photo-cut-table": { kind: "wix", id: "959b83_6af3094d3580470991644ff84d9fd551~mv2.jpg" },
};
const art: Record<string, string> = {};
for (const [name, src] of Object.entries(artSpecs)) art[name] = await put(name, await render(src));
console.log(`🖼  รูปตัวเลือกผ้า ${Object.keys(fabricImg).length} + รูปประกอบ ${Object.keys(art).length} — ตัวอย่างอยู่ที่ ${OUT}`);

/* ── 4. ประกอบสินค้า ─────────────────────────────────────────────── */
const OPTIONS: ProductOption[] = [
  {
    label: GROUP_FABRIC, // แกนตารางราคา — ชื่อกลุ่ม/ชื่อตัวเลือกห้ามแก้โดยไม่แก้ pricing.cells
    display: "cards",
    note: "1 หลา = กว้าง 145 ซม. × ยาว 90 ซม. · **ผ้าสะท้อนน้ำ** (Pongee / Binnan / Taffeta / ผ้าร่มหนา) น้ำไม่ซึมผ่าน เหมาะกับผ้าแขวนภายนอกอาคาร ผ้าม่านห้องน้ำ หรือผ้าม่านภายนอก",
    choices: FABRICS.map((f) => ({ name: f.name, desc: f.desc, imageSrc: fabricImg[f.name], ...(f.badge ? { badge: f.badge } : {}) })),
  },
  {
    label: GROUP_CUT,
    display: "cards",
    note: "1 หลา = กว้าง 145 × ยาว 90 ซม. · **ตัดแบ่งตามขนาด**: ระบุขนาดชิ้นงานแล้วระบบคำนวณให้อัตโนมัติ — จำนวนชิ้นที่ตัดได้ต่อหลา (เผื่อตัดตกระหว่างชิ้น 1-2 ซม.) และค่าตัดต่อชิ้นตามด้านที่ยาวที่สุด (ไม่เกิน 30 ซม. +5 · 60 ซม. +10 · 90 ซม. +15 · 120 ซม. +20 · 150 ซม. +25 บาท/ชิ้น)",
    choices: [
      { name: CUT_FULL, badge: "ฟรี", imageSrc: art["edge-none"], desc: "รับผ้าเต็มผืน กว้าง 145 × ยาว 90 ซม. ต่อ 1 หลา ไม่ตัดแบ่ง" },
      {
        name: CUT_SPLIT,
        imageSrc: art["cut-card-sq"],
        desc: "ตัดแบ่งผ้าเป็นชิ้นตามขนาดที่ระบุ — ระบบคำนวณจำนวนชิ้นต่อหลา และค่าตัดต่อชิ้นให้อัตโนมัติ",
        sizeFee: feeTiers([5, 10, 15, 20, 25]),
      },
    ],
  },
  {
    // ⚠️ ต้องมี standardInput ไม่งั้นโดนจัดเป็น "งานสั่งทำ" ซ่อนใต้กล่อง 📐
    label: W_LABEL,
    display: "input",
    standardInput: true,
    showWhen: SIZE_WHEN,
    input: {
      kind: "number",
      unit: "ซม.",
      min: 1,
      max: 145,
      placeholder: "เช่น 45",
      hint: "ขนาดต่อชิ้น ใหญ่สุดไม่เกิน 145×90 ซม. (1 หลา) — ค่าตัด/เย็บขอบคิดต่อชิ้นจากด้านที่ยาวที่สุด × จำนวนชิ้นที่ตัดได้ต่อหลา",
    },
    choices: [],
  },
  {
    label: H_LABEL,
    display: "input",
    standardInput: true,
    showWhen: SIZE_WHEN,
    input: { kind: "number", unit: "ซม.", min: 1, max: 145, placeholder: "เช่น 45" },
    // โชว์ "ตัดได้ ~กี่ชิ้นต่อ 1 หลา" — จัดวางชุดเดียวกับที่ sizeFee ใช้คิดเงิน
    sheetYield: { pairLabel: W_LABEL, sheetW: YARD_SHEET.sheetW, sheetH: YARD_SHEET.sheetH, gap: YARD_SHEET.gap, sheetName: "หลา" },
    choices: [],
  },
  {
    label: GROUP_EDGE,
    display: "cards",
    note: "ค่าเย็บขอบ/โพ้งขอบ คิดต่อชิ้นตามด้านที่ยาวที่สุด (เย็บ +15 ถึง +75 · โพ้ง +10 ถึง +70 บาท/ชิ้น ดูตารางในแกลเลอรี) — **ตัดเต็มหลา** คิดที่ขั้น 150 ซม. ต่อผืน · **ตัดแบ่ง** ระบบคิดตามขนาดชิ้น × จำนวนชิ้นต่อหลาให้อัตโนมัติ",
    choices: [
      { name: "ไม่เย็บขอบ", badge: "ฟรี", imageSrc: art["photo-poster"], desc: "ขอบตัดเรียบ ไม่เย็บเก็บริม" },
      {
        name: "เย็บขอบ",
        imageSrc: art["edge-sew"],
        desc: "พับเข้าเก็บขอบ ด้านละ 1 ซม. ขอบเรียบหนา เก็บริมเรียบร้อย",
        sizeFee: feeTiers([15, 30, 45, 60, 75]),
      },
      {
        name: "โพ้งขอบ",
        imageSrc: art["edge-serge"],
        desc: "เย็บโพ้งริมผ้า 4 ด้าน กันลุ่ย ขอบบางกว่าเย็บขอบ",
        sizeFee: feeTiers([10, 25, 40, 55, 70]),
      },
    ],
  },
  {
    /*
     * ⚠️ เดิมเป็น multi ชื่อตัวเลือก "เจาะรู + ใส่ตาไก่" — ชื่อมี " + " ชนกับ MULTI_SEP ทำให้ติ๊กไม่ติด
     * (แก้ splitMultiPicks ให้ประกอบชื่อคืนแล้ว แต่เปลี่ยนเป็นการ์ดแบบสำเร็จตามผู้ใช้สั่ง 25 ส.ค. 69)
     */
    label: GROUP_EYELET,
    display: "cards",
    note: "ตาไก่ **คู่ละ 10 บาท** สำหรับร้อยเชือก/เกี่ยวตะขอแขวนผนัง — ต้องการตำแหน่งหรือจำนวนคู่แบบอื่น แจ้งในช่องหมายเหตุถึงร้าน",
    choices: [
      { name: "ไม่เจาะรู", badge: "ฟรี", imageSrc: art["photo-poster"], desc: "รับผ้าเรียบ ไม่เจาะรู — แขวนด้วยคลิปหนีบ/รางแขวนเองได้" },
      { name: "เจาะ 2 รู ด้านบน", extra: 10, imageSrc: art["eyelet-2top-sq"], desc: "ตาไก่ 2 ตัว (1 คู่) มุมบนซ้าย-ขวา สำหรับร้อยเชือกหรือเกี่ยวตะขอแขวนผนัง" },
      { name: "เจาะทั้ง 4 รู", extra: 20, imageSrc: art["eyelet-4c-sq"], desc: "ตาไก่ 4 ตัว (2 คู่) — 1 คู่ด้านบน และ 1 คู่ด้านล่าง แขวนได้ตึงทั้งผืน" },
    ],
  },
];

const gallery: Product["images"] = [
  { emoji: "🧵", gradient: "from-emerald-200 to-teal-300", label: "งานจริง — สกรีนเต็มหลา แขวนผนัง", src: art["edge-none"] },
  { emoji: "🧵", gradient: "from-emerald-200 to-teal-300", label: "ผืนงาน Fabric Poster พิมพ์ซับลิเมชั่น", src: art["photo-poster"] },
  { emoji: "🧵", gradient: "from-emerald-200 to-teal-300", label: "ผ้าสะท้อนน้ำ — เหมาะงานภายนอก / ผ้าม่านห้องน้ำ", src: art["photo-water"] },
  { emoji: "🧵", gradient: "from-emerald-200 to-teal-300", label: "แบบเจาะรูแขวนผนัง + ตาไก่ คู่ละ 10 บาท", src: art["eyelet"] },
  { emoji: "🧵", gradient: "from-emerald-200 to-teal-300", label: "ตารางค่าตัดแบ่งผ้า / เย็บขอบ / โพ้งขอบ", src: art["photo-cut-table"] },
];

const minFirstTier = Math.min(...priceCols.map((c) => c[0]));
const minLastTier = Math.min(...priceCols.map((c) => c[c.length - 1]));

const product: Product = {
  id: ID,
  name: NAME,
  category: CATEGORY,
  price: minFirstTier,
  emoji: "🧵",
  gradient: "from-emerald-200 to-teal-300",
  imageSrc: gallery[0].src,
  rating: 5,
  sold: 0,
  description:
    `รับพิมพ์ผ้าแขวนผนัง Fabric Poster / ผ้าสกรีนยกหลา พิมพ์ระบบซับลิเมชั่น สีสด ภาพคมชัด ซักได้ สีไม่หลุดลอก เลือกเนื้อผ้าได้ ${FABRICS.length} ชนิด รวมผ้าสะท้อนน้ำสำหรับงานภายนอก ไม่มีขั้นต่ำในการสั่งผลิต 1 หลา = กว้าง 145 × ยาว 90 ซม. เริ่มต้นหลาละ ${minFirstTier} บาท ออกแบบลายเองได้ตามสไตล์ที่คุณต้องการ`,
  highlights: [
    `ไม่มีขั้นต่ำ · เนื้อผ้าให้เลือก ${FABRICS.length} ชนิด เริ่มหลาละ ${minFirstTier} บาท (สั่งเยอะลดถึงหลาละ ${minLastTier} บาท)`,
    "พิมพ์ซับลิเมชั่น อบความร้อน 200°C สีสดทนทาน ซักได้ · มีผ้าสะท้อนน้ำสำหรับแขวนภายนอก",
    "บริการตัดแบ่ง เย็บขอบ/โพ้งขอบ และเจาะรูตาไก่ (คู่ละ 10 บาท) พร้อมแขวน",
  ],
  options: OPTIONS,
  images: gallery,
  pricing,
  terms: [
    `*ไม่มีขั้นต่ำในการสั่งผลิต — ราคาต่อหลา (1 หลา = กว้าง 145 ซม. × ยาว 90 ซม.)`,
    "*พิมพ์ระบบซับลิเมชั่น ทางร้านใช้สี RGB สีงานสกรีนอาจสว่างกว่าหรือดรอปลงตามความแตกต่างของไฟล์งาน ±5% ถึง ±15%",
    "*การแบ่งผ้าใน 1 หลา ต้องเหลือพื้นที่สำหรับตัดตกอย่างน้อย 1-2 ซม. · ผ้าตัดเย็บแต่ละชิ้นขนาดคลาดเคลื่อน ±0.5-1 นิ้ว",
    "*ค่าตัดแบ่ง / เย็บขอบ / โพ้งขอบ คิดต่อชิ้นตามด้านที่ยาวที่สุดของชิ้นงาน (ตารางราคาอยู่ในแกลเลอรี) — ตัดแบ่ง: ระบุขนาดชิ้นงาน ระบบคำนวณจำนวนชิ้นต่อหลาและค่าบริการให้อัตโนมัติ · ตัดเต็มหลา: เย็บ/โพ้งขอบคิดที่ขั้น 150 ซม. ต่อผืน",
    "*เจาะรูตาไก่ คู่ละ 10 บาท — เจาะ 2 รู ด้านบน (1 คู่ +10 บาท) หรือ เจาะทั้ง 4 รู 1 คู่ด้านบน 1 คู่ด้านล่าง (+20 บาท) · ตำแหน่ง/จำนวนแบบอื่นแจ้งในหมายเหตุถึงร้าน",
    "*ผ้าสะท้อนน้ำ น้ำไม่ซึมผ่าน เหมาะกับงานแขวนภายนอกอาคาร ผ้าม่านห้องน้ำ หรือผ้าม่านภายนอก",
  ].join("\n"),
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: [
        "• ไม่มีขั้นต่ำในการสั่งผลิต — พิมพ์ระบบซับลิเมชั่น สีสด ภาพคมชัด ซักได้ สีไม่หลุดลอก",
        "• 1 หลา = กว้าง 145 ซม. × ยาว 90 ซม. — สั่งหลายหลาต่อเนื่องเป็นผืนยาวได้ (ผ้ายกม้วน)",
        `• เนื้อผ้าให้เลือก ${FABRICS.length} ชนิด — ผ้ามาตรฐาน 9 ชนิด + ผ้าสะท้อนน้ำ 4 ชนิด (ดูภาพและคำอธิบายที่ตัวเลือกชนิดผ้า)`,
        "• การแบ่งผ้าใน 1 หลา ต้องเหลือพื้นที่สำหรับตัดตกอย่างน้อย 1-2 ซม.",
        "• ผ้าตัดเย็บแต่ละชิ้น ขนาดคลาดเคลื่อน ±0.5-1 นิ้ว",
        "• สีงานสกรีนอาจสว่างกว่าหรือดรอปลง ±5-15% ตามไฟล์งาน (ระบบสี RGB)",
      ].join("\n"),
    },
    {
      title: "ชนิดผ้า",
      text:
        "ผ้ามาตรฐาน::\n" +
        FABRICS.filter((f) => !f.badge).map((f) => `• ${f.name} — ${f.desc}`).join("\n") +
        "\n\nผ้าสะท้อนน้ำ (เหมาะกับแขวนภายนอกอาคาร ผ้าม่านห้องน้ำ ผ้าม่านภายนอก)::\n" +
        FABRICS.filter((f) => f.badge).map((f) => `• ${f.name} — ${f.desc}`).join("\n"),
    },
    {
      title: "OPTION เสริม (ตัดแบ่ง / เย็บขอบ / โพ้งขอบ / ตาไก่)",
      text: [
        "ราคาตัดแบ่งผ้า และเย็บเก็บริม — คิดต่อชิ้น ตามด้านที่ยาวที่สุดของชิ้นงาน::",
        "• ขนาดไม่เกิน 30 ซม. — ตัดแบ่ง +5 · เย็บขอบ +15 · โพ้งขอบ +10 บาท",
        "• ขนาดไม่เกิน 60 ซม. — ตัดแบ่ง +10 · เย็บขอบ +30 · โพ้งขอบ +25 บาท",
        "• ขนาดไม่เกิน 90 ซม. — ตัดแบ่ง +15 · เย็บขอบ +45 · โพ้งขอบ +40 บาท",
        "• ขนาดไม่เกิน 120 ซม. — ตัดแบ่ง +20 · เย็บขอบ +60 · โพ้งขอบ +55 บาท",
        "• ขนาดไม่เกิน 150 ซม. — ตัดแบ่ง +25 · เย็บขอบ +75 · โพ้งขอบ +70 บาท",
        "",
        "เย็บขอบ = พับเข้าเก็บขอบ ด้านละ 1 ซม. · โพ้งขอบ = เย็บโพ้งริมผ้ากันลุ่ย",
        "เจาะรูตาไก่ คู่ละ 10 บาท — เจาะ 2 รู ด้านบน (1 คู่ +10) หรือ เจาะทั้ง 4 รู 1 คู่ด้านบน 1 คู่ด้านล่าง (+20) · แบบอื่นแจ้งในหมายเหตุถึงร้าน",
        "",
        "หมายเหตุ::",
        "• การแบ่งผ้าใน 1 หลา ต้องเหลือพื้นที่สำหรับตัดตกอย่างน้อย 1-2 ซม.",
        "• ผ้าตัดเย็บแต่ละชิ้น ขนาดคลาดเคลื่อน ±0.5-1 นิ้ว",
        "• ในหน้าสินค้า เลือก การตัด (เต็มหลา/ตัดแบ่ง) คู่กับ การเก็บขอบ (ไม่เย็บ/เย็บขอบ/โพ้งขอบ) ได้อิสระ — ตัดแบ่ง: ระบุขนาดชิ้นงาน กว้าง×ยาว แล้วระบบคำนวณจำนวนชิ้นที่ตัดได้ต่อหลา และค่าตัด/ค่าเย็บต่อชิ้นให้อัตโนมัติ",
      ].join("\n"),
    },
    {
      title: "วิธีสั่งงาน",
      text: 'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกชนิดผ้า จำนวนหลา และ OPTION เสริมที่ต้องการ แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"\n• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ขนาดตัดแบ่ง · ตำแหน่งเจาะตาไก่ · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\nหรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: ชนิดผ้า · จำนวนหลา · ขนาดตัดแบ่ง/เย็บขอบ (ถ้ามี) · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน (.AI .PSD .PNG พื้นหลังใส) หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)',
    },
    {
      title: "การรับประกันสินค้า",
      text: "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• งานผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเสียหายระหว่างการขนส่ง\n\nไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\nระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    },
  ],
  seo: {
    title: `รับพิมพ์ผ้าแขวนผนัง Fabric Poster ผ้าสกรีนยกหลา ${FABRICS.length} เนื้อผ้า เริ่มหลาละ ${minFirstTier} บาท`,
    keywords: [
      "ผ้าแขวนผนัง",
      "รับพิมพ์ผ้าแขวนผนัง",
      "Fabric Poster",
      "ผ้าสกรีนยกหลา",
      "รับพิมพ์ผ้าหลา",
      "รับพิมพ์ลายผ้า",
      "พิมพ์ผ้าซับลิเมชั่น",
      "ผ้าแขวนผนังสั่งทำ",
      "ผ้าสะท้อนน้ำ",
      "iDucky",
    ],
    description: `รับพิมพ์ผ้าแขวนผนัง Fabric Poster / ผ้าสกรีนยกหลา พิมพ์ซับลิเมชั่นสีสดซักได้ เลือกเนื้อผ้า ${FABRICS.length} ชนิดพร้อมภาพตัวอย่าง รวมผ้าสะท้อนน้ำ ไม่มีขั้นต่ำ เริ่มหลาละ ${minFirstTier} บาท มีบริการตัดแบ่ง เย็บขอบ เจาะตาไก่`,
    faqs: [
      {
        q: "ผ้าแขวนผนัง ราคาเท่าไหร่?",
        a: `เริ่มต้นหลาละ ${minFirstTier} บาท (1 หลา = กว้าง 145 × ยาว 90 ซม.) ราคาขึ้นกับชนิดผ้าที่เลือก และยิ่งสั่งเยอะยิ่งถูกลง — สั่ง 50 หลาขึ้นไปเริ่มหลาละ ${minLastTier} บาท ไม่มีขั้นต่ำในการสั่ง ดูตารางราคาเต็มได้ในหน้าสินค้า`,
      },
      {
        q: "มีเนื้อผ้าให้เลือกกี่ชนิด ต่างกันยังไง?",
        a: `มี ${FABRICS.length} ชนิด — ผ้ามาตรฐาน 9 ชนิด เช่น ผ้าฮาร์มิต แคนวาส (8/14 Oz) Short Plush ซาติน ลูกฟูก และผ้าสะท้อนน้ำ 4 ชนิด (Pongee 300T · Binnan 210T · Taffeta 190T · ผ้าร่มหนา 600D) สำหรับแขวนภายนอกอาคารหรือผ้าม่านห้องน้ำ ทุกชนิดมีภาพตัวอย่างเนื้อผ้าและคำอธิบายให้ดูตอนเลือกในหน้าสินค้า`,
      },
      {
        q: "ตัดแบ่งเป็นชิ้นเล็ก หรือเย็บขอบได้ไหม?",
        a: "ได้ — เลือก \"ตัดแบ่งตามขนาด\" แล้วระบุขนาดชิ้นงาน ระบบคำนวณจำนวนชิ้นที่ตัดได้ต่อหลา และค่าตัดต่อชิ้นตามด้านที่ยาวที่สุด (เริ่มชิ้นละ +5 บาท) ให้อัตโนมัติ เลือกเย็บขอบหรือโพ้งขอบเพิ่มได้ทั้งแบบเต็มหลาและแบบตัดแบ่ง การแบ่งผ้าใน 1 หลาเผื่อพื้นที่ตัดตกอย่างน้อย 1-2 ซม.",
      },
      {
        q: "แขวนผนังยังไง มีเจาะรูให้ไหม?",
        a: "มีบริการเจาะรูใส่ตาไก่ คู่ละ 10 บาท เลือกได้ในหน้าสินค้า — เจาะ 2 รู ด้านบน (ตาไก่ 1 คู่ +10 บาท) สำหรับร้อยเชือก/เกี่ยวตะขอ หรือ เจาะทั้ง 4 รู (1 คู่ด้านบน 1 คู่ด้านล่าง +20 บาท) แขวนได้ตึงทั้งผืน มีภาพตัวอย่างตำแหน่งเจาะให้ดูตอนเลือก · ต้องการตำแหน่งแบบอื่นแจ้งในหมายเหตุถึงร้าน",
      },
      {
        q: "ใช้แขวนกลางแจ้ง/ในห้องน้ำได้ไหม?",
        a: "ได้ — เลือกผ้าสะท้อนน้ำ (Pongee 300T · Binnan fabric 210T · Taffeta 190T · ผ้าร่มหนา 600D) น้ำไม่ซึมผ่าน เหมาะกับผ้าแขวนภายนอกอาคาร ผ้าม่านห้องน้ำ หรือผ้าม่านภายนอก",
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
console.log(`   ตัวเลือก: ${OPTIONS.map((o) => `${o.label} ${o.choices.length} แบบ`).join(" · ")}`);
console.log(`   แกลเลอรี ${gallery.length} ภาพ · แท็บ ${saved.tabs!.length} · FAQ ${saved.seo!.faqs!.length} ข้อ · สถานะ: ฉบับร่าง`);

if (!WRITE) {
  console.log(`\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — เปิดดูรูปที่ ${OUT} แล้วใส่ --write เพื่อบันทึกจริง)`);
  process.exit(0);
}

/* ── 5. เขียนลง Supabase (คอลัมน์กระจก name/category/price ต้องไปด้วย) ── */
const { data: existing, error: exErr } = await sb.from("products").select("id,name").eq("id", ID).maybeSingle();
if (exErr) throw new Error(`เช็คสินค้าเดิมไม่ได้: ${exErr.message}`);
if (existing && existing.name !== NAME)
  throw new Error(`id ${ID} มีอยู่แล้วเป็นของ "${existing.name}" — ตรวจก่อน`);

if (existing) {
  const { error } = await sb.from("products").update({ name: saved.name, category: saved.category, price: saved.price, data: saved }).eq("id", ID);
  if (error) throw new Error(`อัปเดตไม่สำเร็จ: ${error.message}`);
  console.log(`\n✏️  เขียนทับ ${ID} เดิม (รันซ้ำ)`);
} else {
  const { data: maxRow } = await sb.from("products").select("sort").order("sort", { ascending: false }).limit(1).single();
  const sort = (maxRow?.sort ?? 0) + 1;
  const { error } = await sb.from("products").insert({
    id: ID, name: saved.name, category: saved.category, price: saved.price, sold: 0, featured: false, sort, data: saved,
  });
  if (error) throw new Error(`สร้างสินค้าไม่สำเร็จ: ${error.message}`);
  console.log(`\n➕ สร้างสินค้าใหม่ (sort ${sort})`);
}

/** update/insert คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบก่อนประกาศสำเร็จ */
const { data: check, error: readErr } = await sb.from("products").select("name,category,data").eq("id", ID).single();
if (readErr) throw new Error(`อ่านกลับไม่ได้: ${readErr.message}`);
if (check.name !== NAME || check.category !== CATEGORY || (check.data as Product).savedAt !== saved.savedAt)
  throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");

console.log(`✅ อัปรูป + บันทึกแล้ว — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
console.log(`   หน้าสินค้า: http://localhost:3005/products/${ID}`);
console.log(`   หน้าแก้ไข: http://localhost:3005/admin/products/${ID}`);
