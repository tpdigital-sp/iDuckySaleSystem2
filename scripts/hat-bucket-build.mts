/**
 * เติมข้อมูลสินค้า "หมวก Bucket" (ร่างที่ผู้ใช้สร้างไว้ id new-mt2omund-2845)
 *
 *   npx tsx scripts/hat-bucket-build.mts            # ดูข้อมูลที่จะบันทึก (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/hat-bucket-build.mts --write    # อัปรูป + เขียนลง Supabase (คงสถานะฉบับร่าง)
 *
 * ที่มา: iduckyofficial-pricelists.com/หมวก หัวข้อ "หมวกบักเก็ต" — มี 2 แท็บราคา
 *   สคริปต์อ่านตารางสดทุกครั้ง (ยึดหัวข้อ "หมวกบักเก็ต" แล้วหยิบ 2 ตารางถัดไป: DTF|FLEX ก่อน แล้วค่อย ปัก)
 *   • พิมพ์ DTF | FLEX : 8 ช่วงจำนวน 300 → 150 บาท/ใบ
 *   • พิมพ์ ปัก        : 8 ช่วงจำนวน 350 → 220 บาท/ใบ
 *   → ทำเป็น 2 เรทราคา (priceRates) แบบเดียวกับสินค้าเสื้อ (crop/oversize) พร้อมภาพประจำเรท
 *     ให้ลูกค้าเห็นหน้าตางานแต่ละระบบตอนเลือก (ผู้ใช้สั่ง 25 ส.ค. 69)
 *
 * กติกาคละลายจากหน้าเดียวกัน: 1-10 ใบ คละได้อิสระ · 11 ใบขึ้นไป สั่งลายละ 3 ใบขึ้นไป
 *   → freeMixBelowQty 11 + minPerDesign 3 (ชุดเดียวกับเสื้อทุกตัว)
 *
 * งานปัก (รายละเอียดในแท็บปัก): ขนาดปักไม่เกิน สูง 7 × กว้าง 15 ซม. · ไฟล์ .DST/.PXF
 *   ไม่มีไฟล์ปักมีค่าขึ้นบล๊อค (ฟอนต์/อิโมจิของร้าน ฟรี) · เกิน 3 สีเข็ม +10 บาท/สี/แบบ
 *   ปักนูน +50 บาท/ใบ (เฉพาะฟอนต์) → ทำเป็นกลุ่มตัวเลือกโผล่เฉพาะเรทงานปัก
 *
 * ภาพ: รูปงานจริงจากแท็บของหมวกบักเก็ตบนหน้าเว็บ (wixstatic id)
 *   ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { hasQuoteOption, priceRange, RATE_LABEL, type PriceMatrix, type PriceRate, type Product, type ProductOption } from "../src/lib/products";

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

const ID = "new-mt2omund-2845";
const NAME = "หมวก Bucket";
const CATEGORY = "cat-mt2bpoyj"; // Fashion — เสื้อ / กางเกง / ยางรัดผม (หมวดเดียวกับเสื้อสกรีน/ปัก)
const V = "v1";
const PAGE = "https://www.iduckyofficial-pricelists.com/%E0%B8%AB%E0%B8%A1%E0%B8%A7%E0%B8%81";
const SECTION = "หมวกบักเก็ต";
const UNIT = "ใบ";
const RATE_DTF = "พิมพ์ DTF | FLEX";
const RATE_EMB = "งานปัก";
const EMBOSS_FEE = 50;

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = (file: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

/* ── 1. ดึง 2 ตารางราคาจากเว็บ ───────────────────────────────────── */
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

function parseTable(from: number): { rows: string[][]; end: number } {
  const t = html.indexOf("<table", from);
  if (t < 0) throw new Error("หา <table> ถัดไปไม่เจอ");
  const end = html.indexOf("</table>", t);
  const rows = [...html.slice(t, end).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
    [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
  );
  if (rows.length < 2 || rows[0][0] !== "จำนวน" || rows[0][1] !== "ราคา" || !/ใบ/.test(rows[1][0]))
    throw new Error(`ตารางที่เจอไม่ใช่ตารางราคาหมวก (หัว "${rows[0]?.join("|")}") — โครงหน้าเว็บอาจเปลี่ยน`);
  return { rows, end };
}

/**
 * 2 ตารางแรกถัดจากหัวข้อ "หมวกบักเก็ต" = DTF|FLEX แล้วตามด้วย ปัก
 * ⚠️ คำว่า "หมวกบักเก็ต" โผล่ในสารบัญบนสุดด้วย ซึ่งอยู่ก่อนตารางของ "หมวกแก๊ป" — ถ้าระหว่าง
 * หัวข้อกับตารางมีคำว่า "หมวกแก๊ป" คั่น แปลว่าหยิบหัวข้อผิดตัว ให้ข้ามไปหาตัวถัดไป
 */
function sectionTables(): [string[][], string[][]] {
  for (let i = html.indexOf(SECTION); i >= 0; i = html.indexOf(SECTION, i + 1)) {
    const t = html.indexOf("<table", i);
    if (t < 0 || t - i > 10000) continue;
    if (html.slice(i, t).includes("หมวกแก๊ป")) continue;
    const first = parseTable(i);
    const second = parseTable(first.end);
    return [first.rows, second.rows];
  }
  throw new Error(`หาตารางใต้หัวข้อ "${SECTION}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
}

function toPricing(rows: string[][]): { pricing: PriceMatrix; prices: number[] } {
  const tiers = rows.slice(1).map((r) => {
    const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
    return { upTo: m ? Number(m[2]) : null, label: r[0] };
  });
  tiers[tiers.length - 1].upTo = null; // แถวท้าย "1000 ใบ(ขึ้นไป)" = ขั้นเปิดปลาย
  const prices = rows.slice(1).map((r) => {
    const n = Number(String(r[1]).replace(/[^\d]/g, ""));
    if (!n) throw new Error(`ช่องราคาแถว "${r[0]}" อ่านไม่ออก ("${r[1]}")`);
    return n;
  });
  if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ — ตรวจก่อน");
  return { pricing: { unit: UNIT, driverLabels: [], tiers, cells: { "": prices } }, prices };
}

const [dtfRows, embRows] = sectionTables();
const dtf = toPricing(dtfRows);
const emb = toPricing(embRows);
// กันหยิบตารางสลับแท็บ/สลับหมวก: ราคาปักช่วงแรกต้องแพงกว่าพิมพ์ (350 > 300) และไม่ใช่ตารางหมวกแก๊ป (350)
if (emb.prices[0] <= dtf.prices[0])
  throw new Error(`ลำดับตารางไม่ตรงคาด (DTF ${dtf.prices[0]} · ปัก ${emb.prices[0]}) — ตรวจหน้าเว็บก่อน`);

console.log(`📊 ตาราง "${SECTION}" จากเว็บ`);
console.log(`   ${RATE_DTF}: ${dtf.pricing.tiers.map((t, i) => `${t.label}=฿${dtf.prices[i]}`).join(" · ")}`);
console.log(`   ${RATE_EMB}: ${emb.pricing.tiers.map((t, i) => `${t.label}=฿${emb.prices[i]}`).join(" · ")}`);

/* ── 2. รูป — แกลเลอรี 5 + ภาพประจำเรท 2 ─────────────────────────── */
/** รูปงานจริงจากแท็บหมวกบักเก็ตบนหน้าเว็บ (แท็บ DTF มีรูปเดียว ที่เหลือเป็นงานปัก) */
const PHOTOS: [string, string, string][] = [
  ["photo-dtf", "959b83_e72db818ee184c3798b427bf8dedd787~mv2.jpg", "งานพิมพ์ DTF | FLEX — หมวก Bucket ผ้าลูกฟูก"],
  ["photo-emb-sunflower", "959b83_626e82ab3e1d4a4caeea8c451ad17849~mv2.jpg", "งานปัก — ลายดอกทานตะวัน"],
  ["photo-emb-happy", "959b83_98fc02f8f48c416babc5aeb769dee4dd~mv2.jpg", "งานปัก — ตัวอักษรหลายสี"],
  ["photo-emb-baby", "959b83_4318d4ce87c64482b81cde1de2d46b78f003.jpg", "งานปัก — โลโก้ตัวอักษร"],
  ["photo-emb-cat", "959b83_7d5d2c35f172488489f38c352230fdf4f003.jpg", "งานปัก — ลายการ์ตูน"],
];
/** ภาพประจำเรท + ภาพประจำตัวเลือก — งานจริงของแต่ละระบบ ลูกค้าเห็นหน้าตาก่อนเลือก */
const RATE_IMGS: Record<string, string> = {
  "rate-dtf": "959b83_e72db818ee184c3798b427bf8dedd787~mv2.jpg",
  "rate-emb": "959b83_626e82ab3e1d4a4caeea8c451ad17849~mv2.jpg",
  // ปักนูน = รูปหมวกปักนูนฟอนต์ "Manao" จาก lightbox หน้า /หมวก (pgid ltcrjcnz1-fbf54fc0) — ผู้ใช้เลือกเอง 25 ส.ค. 69
  "choice-emboss": "959b83_222ef0d7ed364c70a16a3c2836049861~mv2.jpg",
};

/** ไฟล์ ~mv2 = รูปถ่ายต้นฉบับใหญ่ → ย่อผ่าน wix transform · ไฟล์ f003 = ปกคลิป (เล็กอยู่แล้ว) → เอาตรง ๆ */
async function fetchWix(wixId: string, size = "w_1200,h_1200"): Promise<Buffer> {
  const u = wixId.includes("~mv2")
    ? `https://static.wixstatic.com/media/${wixId}/v1/fill/${size},al_c,q_88/file.jpg`
    : `https://static.wixstatic.com/media/${wixId}`;
  const res = await fetch(u);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function put(name: string, buf: Buffer): Promise<string> {
  const file = `${name}-${V}.jpg`;
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

const gallery: Product["images"] = [];
for (const [file, wixId, label] of PHOTOS) {
  const src = await put(file, await fetchWix(wixId));
  gallery.push({ emoji: "🧢", gradient: "from-sky-200 to-cyan-300", label, src });
}
const art: Record<string, string> = {};
for (const [name, wixId] of Object.entries(RATE_IMGS)) art[name] = await put(name, await fetchWix(wixId, "w_1200,h_800"));
console.log(`🖼  แกลเลอรี ${gallery.length} ภาพ + ภาพประจำเรท ${Object.keys(art).length} ภาพ`);

/* ── 3. ประกอบสินค้า ─────────────────────────────────────────────── */
const RATES: PriceRate[] = [
  {
    id: "r1",
    label: RATE_DTF,
    desc: "พิมพ์ฟิล์มรีดร้อนติดบนหมวก สีสด คมชัด ระบบ CMYK — DTF เหมาะลายละเอียด · FLEX สีทึบขอบคม",
    imageSrc: art["rate-dtf"],
    minPerDesign: 3,
    freeMixBelowQty: 11,
    pricing: dtf.pricing,
  },
  {
    id: "embroidery",
    label: RATE_EMB,
    desc: "ปักไหมลงเนื้อผ้าโดยตรง ผิวสัมผัสนูน ดูพรีเมียม ทนทานที่สุด — ไหม Madeira · เครื่องปัก TAJIMA",
    imageSrc: art["rate-emb"],
    minPerDesign: 3,
    freeMixBelowQty: 11,
    pricing: emb.pricing,
  },
];

const OPTIONS: ProductOption[] = [
  {
    // จากแท็บปักบนเว็บ: ปักนูน +50/ใบ **ทำได้แค่เฉพาะฟอนต์** มีค่าขึ้นบล๊อคตามความยากง่าย
    label: "แบบงานปัก",
    display: "pills",
    note: "**ปักนูน** ทำได้เฉพาะฟอนต์/ตัวอักษร · มีค่าขึ้นบล๊อคเพิ่ม (ราคาตามความยากง่ายของแบบ)",
    showWhen: { label: RATE_LABEL, choices: [RATE_EMB] },
    choices: [
      { name: "ปักธรรมดา", badge: "ฟรี", imageSrc: art["rate-emb"] },
      { name: "ปักนูน", extra: EMBOSS_FEE, imageSrc: art["choice-emboss"] },
    ],
  },
];

const product: Product = {
  id: ID,
  name: NAME,
  category: CATEGORY,
  price: dtf.prices[0],
  emoji: "🧢",
  gradient: "from-sky-200 to-cyan-300",
  imageSrc: gallery[0].src,
  rating: 5,
  sold: 0,
  description:
    `หมวก Bucket ผ้าลูกฟูก สกรีนลายตามสั่ง เลือกได้ 2 ระบบ — พิมพ์ DTF | FLEX (สีสด คมชัด ระบบ CMYK) หรือ งานปัก (ไหมปัก Madeira เครื่องปัก TAJIMA ผิวสัมผัสนูน ดูพรีเมียม) ไม่มีขั้นต่ำในการสั่งผลิต เริ่มต้นใบละ ${dtf.prices[0]} บาท`,
  highlights: [
    `ไม่มีขั้นต่ำ · พิมพ์ DTF | FLEX เริ่มใบละ ${dtf.prices[0]} บาท · งานปัก เริ่มใบละ ${emb.prices[0]} บาท`,
    "งานปักใช้ไหม Madeira (เยอรมนี) เครื่องปัก TAJIMA รองรับ 15 สีเข็ม",
    "1-10 ใบ คละลายได้อิสระ · 11 ใบขึ้นไป สั่งลายละ 3 ใบ",
  ],
  options: OPTIONS,
  images: gallery,
  pricing: RATES[0].pricing,
  priceRates: RATES,
  bulkAskQty: 1, // หมวกเปล่าต้องเช็คสต๊อก/คิวผลิตกับแอดมินก่อนทุกออเดอร์ (ชุดเดียวกับสินค้าเสื้อ)
  terms: [
    "*ไม่มีขั้นต่ำในการสั่งผลิต — ราคาในตารางเป็นราคาต่อใบ",
    "*จำนวน 1-10 ใบ คละลายได้ · 11 ใบขึ้นไป คละลาย สั่งลายละ 3 ใบขึ้นไป",
    "*งานปัก ขนาดปักได้ สูงไม่เกิน 7 cm × กว้างไม่เกิน 15 cm",
    "*งานปัก ใช้ไฟล์ .DST หรือ .PXF — ถ้าไม่มีไฟล์ปัก มีค่าขึ้นบล๊อค (ราคาตามความยากง่าย) · ปัก Font หรืออิโมจิที่ทางร้านมี ไม่เสียค่าขึ้นบล๊อค",
    "*งานปัก แบบนอกเหนือจากทางร้าน ปักไม่เกิน 3 สีเข็ม — เกินคิดเพิ่มสีละ 10 บาทต่อแบบ",
    `*ปักนูน บวกเพิ่ม ${EMBOSS_FEE} บาท/ใบ ทำได้เฉพาะฟอนต์ + มีค่าขึ้นบล๊อค (ราคาตามความยากง่าย)`,
    "*งานพิมพ์ ทางร้านใช้สี R G B สีงานสกรีนที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
  ].join("\n"),
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: [
        "• ไม่มีขั้นต่ำในการสั่งผลิต — เลือกได้ 2 ระบบ: พิมพ์ DTF | FLEX หรือ งานปัก",
        "• จำนวน 1-10 ใบ คละลายได้อิสระ · 11 ใบขึ้นไป คละลาย สั่งลายละ 3 ใบขึ้นไป",
        "• งานปัก ขนาดปักได้ สูงไม่เกิน 7 cm × กว้างไม่เกิน 15 cm",
        `• ปักนูน บวกเพิ่ม ${EMBOSS_FEE} บาท/ใบ — ทำได้เฉพาะฟอนต์ มีค่าขึ้นบล๊อคตามความยากง่าย`,
        "• งานพิมพ์ ทางร้านใช้สี RGB สีงานสกรีนอาจสว่างกว่าหรือดรอปลง ±5-15% ตามไฟล์งาน",
      ].join("\n"),
    },
    {
      title: "งานพิมพ์ DTF | FLEX",
      text: "รายละเอียด งานพิมพ์ DTF::\n• คุณภาพ : พิมพ์ภาพลงบนแผ่นฟิล์ม ด้วยหมึกสำหรับการย้อมผ้า แล้วนำแผ่นฟิล์มที่พิมพ์แล้วมารีดร้อนติดบนหมวก พิมพ์ลายชัดเจน สีสด คมชัด\n• ความทนทาน : ติดทนนาน ทนต่อการซักหลายครั้ง\n• ผิวสัมผัส : งานพิมพ์อยู่บนเนื้อผ้า มีผิวสัมผัสด้าน นูน\n• คุณสมบัติ : ยืดหยุ่นตามเนื้อผ้า ติดแน่นเรียบไปกับเนื้อผ้า พิมพ์ได้ทั้งผ้าสีอ่อนและสีเข้ม\n• จุดเด่น : พิมพ์สีด้วยระบบ CMYK เหมาะกับผ้าหลากหลายชนิด\n• ข้อจำกัด : ส่วนที่สกรีนลงผ้าจะปิดทึบ ไม่มีที่ระบายในส่วนนั้น และไม่สามารถรีดตรง ๆ บนงานได้\n\nรายละเอียด งานพิมพ์ FLEX::\n• คุณภาพ : พิมพ์ภาพลงบน Flex ด้วยหมึก Solvent แล้วนำ Flex ที่พิมพ์แล้วมารีดร้อนติดบนหมวก พิมพ์ลายชัดเจน สีสด คมชัด\n• ความทนทาน : ทนทานต่อการซักและรีดได้หลายครั้ง\n• ผิวสัมผัส : งานพิมพ์อยู่บนเนื้อผ้า ผิวสัมผัสจะตามเนื้อ Flex ที่เลือก\n• คุณสมบัติ : พิมพ์สีด้วยระบบ CMYK เหมาะกับผ้าทุกชนิด\n• จุดเด่น : สามารถใช้เตารีด รีดลงโดยตรงบน Flex ได้\n• ข้อจำกัด : ไม่เหมาะกับงานที่มีรายละเอียดเล็ก ๆ",
    },
    {
      title: "งานปัก",
      text: "รายละเอียด งานปัก::\n• คุณภาพ : สร้างลวดลายโดยใช้ไหมปักลงบนผ้า ให้ความเรียบหรู สวยงาม\n• ไหมปัก Madeira จากประเทศเยอรมนี — เส้นไหมโพลีเอสเตอร์ 100% คุณภาพสูง เรียบเงา ทนต่อการซักฟอก\n• เครื่องปัก TAJIMA มาตรฐานจากประเทศญี่ปุ่น รองรับ 15 สีเข็ม\n• ผิวสัมผัส : มีผิวสัมผัสนูนของเส้นไหม เอกลักษณ์ต่างจากงานพิมพ์\n• ขนาดปักได้ สูงไม่เกิน 7 cm × กว้างไม่เกิน 15 cm\n\nไฟล์งานปัก::\n• ใช้ไฟล์ .DST หรือ .PXF — ถ้าไม่มีไฟล์ปัก มีค่าขึ้นบล๊อค (ราคาตามความยากง่าย)\n• ปัก Font หรืออิโมจิที่ทางร้านมี ไม่เสียค่าขึ้นบล๊อค\n• แบบนอกเหนือจากทางร้าน ปักไม่เกิน 3 สีเข็ม — หากเกิน คิดเพิ่มสีละ 10 บาทต่อแบบ\n\nงานปักนูน::\n• บวกเพิ่ม 50 บาท/ใบ **ทำได้เฉพาะฟอนต์** · มีค่าขึ้นบล๊อค (ราคาตามความยากง่าย)",
    },
    {
      title: "วิธีสั่งงาน",
      text: 'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกเรทงาน (พิมพ์ DTF | FLEX หรือ งานปัก) และจำนวนใบที่ต้องการ แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"\n• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น สั่งกี่ลาย ลายละกี่ใบ · ตำแหน่ง/ขนาดลาย · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\nหรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: ระบบงานที่เลือก (พิมพ์/ปัก) · จำนวนใบ · จำนวนลาย · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)',
    },
    {
      title: "การรับประกันสินค้า",
      text: "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• ลายสกรีน/งานปักผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเสียหายระหว่างการขนส่ง\n\nไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\nระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    },
  ],
  seo: {
    title: `รับทำหมวก Bucket สกรีนลาย พิมพ์ DTF/FLEX · งานปัก ไม่มีขั้นต่ำ เริ่มต้น ${dtf.prices[0]} บาท`,
    keywords: [
      "รับทำหมวก Bucket",
      "หมวกบักเก็ตสกรีนลาย",
      "หมวกบักเก็ตปักลาย",
      "หมวกปักชื่อ",
      "หมวกสกรีน DTF",
      "หมวกพิมพ์ลายตามสั่ง",
      "หมวกบักเก็ตไม่มีขั้นต่ำ",
      "ของขวัญ",
      "iDucky",
    ],
    description: `รับทำหมวก Bucket สกรีนลายตามสั่ง เลือกได้ทั้งพิมพ์ DTF | FLEX (เริ่มใบละ ${dtf.prices[0]} บาท) และงานปักไหม Madeira (เริ่มใบละ ${emb.prices[0]} บาท) ไม่มีขั้นต่ำ · คละลายได้ · ตรวจแบบก่อนผลิตทุกใบ`,
    faqs: [
      {
        q: "หมวก Bucket สกรีนลาย ราคาเท่าไหร่?",
        a: `พิมพ์ DTF | FLEX เริ่มใบละ ${dtf.prices[0]} บาท (1-10 ใบ) ยิ่งสั่งเยอะยิ่งถูกลง จนถึง 1000 ใบขึ้นไปใบละ ${dtf.prices[dtf.prices.length - 1]} บาท ส่วนงานปักเริ่มใบละ ${emb.prices[0]} บาท ลดถึงใบละ ${emb.prices[emb.prices.length - 1]} บาท — ไม่มีขั้นต่ำในการสั่ง ดูตารางราคาเต็มได้ในหน้าสินค้า`,
      },
      {
        q: "พิมพ์ DTF | FLEX กับงานปัก ต่างกันยังไง?",
        a: "พิมพ์ DTF | FLEX เป็นการพิมพ์ฟิล์มแล้วรีดร้อนติดบนหมวก สีสดคมชัด ระบบ CMYK เหมาะกับลายที่มีรายละเอียด/หลายสี ส่วนงานปักใช้ไหมปักลงเนื้อผ้าโดยตรง ผิวสัมผัสนูน ดูพรีเมียม ทนทานที่สุด เหมาะกับโลโก้ ตัวอักษร ลายสีน้อย — เลือกเรทได้ในหน้าสินค้า พร้อมภาพตัวอย่างงานจริงของแต่ละแบบ",
      },
      {
        q: "งานปักมีเงื่อนไขอะไรบ้าง?",
        a: "ขนาดปักได้ สูงไม่เกิน 7 ซม. × กว้างไม่เกิน 15 ซม. ใช้ไฟล์ .DST/.PXF — ถ้าไม่มีไฟล์ปักมีค่าขึ้นบล๊อคตามความยากง่าย (ปักฟอนต์หรืออิโมจิที่ร้านมี ฟรี) แบบนอกเหนือจากทางร้านปักไม่เกิน 3 สีเข็ม เกินคิดเพิ่มสีละ 10 บาทต่อแบบ · ปักนูนบวกเพิ่ม 50 บาท/ใบ (เฉพาะฟอนต์)",
      },
      {
        q: "สั่งขั้นต่ำกี่ใบ? คละลายได้ไหม?",
        a: "ไม่มีขั้นต่ำ สั่ง 1 ใบก็ทำได้ — จำนวน 1-10 ใบ คละลายได้อิสระ · 11 ใบขึ้นไป คละลาย สั่งลายละ 3 ใบขึ้นไป",
      },
      {
        q: "ใช้ไหมปักและเครื่องปักแบบไหน?",
        a: "ไหมปัก Madeira จากประเทศเยอรมนี เส้นไหมโพลีเอสเตอร์ 100% คุณภาพสูง เรียบเงา ทนซักฟอก ปักด้วยเครื่อง TAJIMA มาตรฐานญี่ปุ่น รองรับ 15 สีเข็ม",
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
console.log(`   เรทราคา: ${RATES.map((r) => `${r.label} (${r.pricing.tiers.length} ช่วง มีภาพ)`).join(" · ")}`);
console.log(`   ตัวเลือก: ${OPTIONS.map((o) => `${o.label} ${o.choices.length} แบบ`).join(" · ")}`);
console.log(`   แกลเลอรี ${gallery.length} ภาพ · แท็บ ${saved.tabs!.length} · FAQ ${saved.seo!.faqs!.length} ข้อ · สถานะ: ฉบับร่าง`);

if (!WRITE) {
  console.log("\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}

/* ── 4. เขียนลง Supabase (คอลัมน์กระจก name/category/price ต้องไปด้วย) ── */
const { data: cur, error: curErr } = await sb.from("products").select("id,name,data").eq("id", ID).maybeSingle();
if (curErr) throw new Error(`อ่านสินค้าเดิมไม่ได้: ${curErr.message}`);
if (!cur) throw new Error(`ไม่เจอสินค้า ${ID} ในฐานข้อมูล — สคริปต์นี้เติมร่างที่ผู้ใช้สร้างไว้เท่านั้น`);
if (cur.name !== NAME) throw new Error(`id ${ID} เป็นของ "${cur.name}" ไม่ใช่ "${NAME}" — ตรวจก่อน`);

const { error } = await sb
  .from("products")
  .update({ name: saved.name, category: saved.category, price: saved.price, data: saved })
  .eq("id", ID);
if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);

/** update คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบก่อนประกาศสำเร็จ */
const { data: check, error: readErr } = await sb.from("products").select("category,data").eq("id", ID).single();
if (readErr) throw new Error(`อ่านกลับไม่ได้: ${readErr.message}`);
if (check.category !== CATEGORY || (check.data as Product).savedAt !== saved.savedAt)
  throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");

console.log(`\n✅ อัปรูป + บันทึกแล้ว — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
console.log(`   หน้าสินค้า: http://localhost:3005/products/${ID}`);
console.log(`   หน้าแก้ไข: http://localhost:3005/admin/products/${ID}`);
