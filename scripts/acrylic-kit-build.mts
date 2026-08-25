/**
 * Acrylic Kit (id: new-mt2rpb1j-2194) — ประกอบสินค้าทั้งใบจากตาราง "ACRYLIC KIT" สดบนเว็บตารางราคา
 *
 *   npx tsx scripts/acrylic-kit-build.mts            # ดูข้อมูล + เซฟภาพตัวอย่างลง out/ (ไม่เขียน DB)
 *   npx tsx scripts/acrylic-kit-build.mts --write    # อัปรูป + เขียนลง Supabase (ฉบับร่าง)
 *
 * ที่มา: https://www.iduckyofficial-pricelists.com/acrylickitmagnet — หน้าเดียวมี 2 ตารางหลัก
 *   [1] ACRYLIC KIT (ราคาฐาน) · [2] ACRYLIC KIT + Magnet ราคาฐานเท่ากันทุกช่อง ต่างแค่แม่เหล็ก
 *       จุดละ 8 บาท → ทำเป็นตัวเลือกติ๊ก "ติดแม่เหล็ก" ระบุจำนวนจุด ในสินค้าตัวเดียวกัน (ผู้ใช้สั่ง 25 ส.ค. 69)
 *   สคริปต์อ่านตารางสดทุกครั้ง: จับ <table> แรกที่หัวมี 8x8 (Wix เรนเดอร์เป็น <table> จริง)
 *   แกนตาราง = "ขนาด" 5 คอลัมน์ (8×8 / 10×10 / 12×12 / A6 / A5) × ช่วงจำนวน 6 ขั้น (1-10 … 500+)
 *
 * ตัวเลือก (ผู้ใช้สั่ง 25 ส.ค. 69: ภาพสินค้าให้ตรงกับตัวเลือก เห็นว่าแต่ละแบบหน้าตายังไง):
 *   • ขนาด — การ์ดมีรูป 5 ใบ (scripts/assets/acrylic-kit/size-*.jpg วาดสัดส่วนจริง
 *     เทียบกรอบเส้นประ = A5 ใหญ่สุด · ภาพแผ่นจริงครอปจาก DSC04621 ในไดรฟ์ร้าน)
 *     ⚠️ การ์ดวาดด้วย PIL ไม่มี raqm — ข้อความบนการ์ดใช้ "ตัว" (ตามเว็บ "ไม่เกิน 5 ตัว/set")
 *     เลี่ยงคำวรรณยุกต์ซ้อนแบบ "ชิ้น" · แก้รูปครั้งหน้าขยับชื่อไฟล์เป็น v2 (กัน Next/CDN แคช)
 *   • รูเสียบสแตนดี้ — กติกาเว็บ: 1-2 รูเสียบ +20 · เกินนั้นรูละ +10 · สูงสุด 5 รู (ต่อชุด)
 *
 * กติกาคละ (แถบท้ายตารางบนเว็บ): 1-10 ชุดคละดีเทลอิสระ · 11 ชุดขึ้นไปคละขั้นต่ำ 5 ชุด/ลาย
 *   → เรทเดียว minPerDesign 5 · freeMixBelowQty 11 (แพทเทิร์นเดียวกับพวงกุญแจ/3D Acrylic)
 *
 * รูปแกลเลอรี: ไดรฟ์ร้าน /Volumes/iDuckyShop/…/10_อะคริลิค/งานอะคริลิคทั่วไป/08_Acrylic Kit-Magnet
 *   (ภาพถ่ายร้านชุด Kit/Kit Magnet ใช้ร่วมกัน — ตัวสินค้าหน้าตาเดียวกัน ต่างแค่จุดแม่เหล็ก)
 *   ต้อง mount ไดรฟ์ก่อนรัน
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { hasQuoteOption, priceRange, type PriceMatrix, type Product, type ProductImage, type ProductOption } from "../src/lib/products";

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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const ID = "new-mt2rpb1j-2194"; // ร่างเดิมชื่อ "Acrylic Kit" ที่ผู้ใช้สร้างไว้หลังบ้าน
const NAME = "Acrylic Kit";
const CATEGORY = "acrylic";
const UNIT = "ชุด";
const V = "v1"; // ⚠️ ห้ามอัปทับชื่อไฟล์เดิม (Next/CDN แคช) — แก้รูปครั้งหน้าขยับเป็น v2
const PAGE = "https://www.iduckyofficial-pricelists.com/acrylickitmagnet";
const GROUP_SIZE = "ขนาด"; // = driverLabels[0] — ห้ามเปลี่ยนโดยไม่แก้ cells (กับดักแกนตารางราคา)
const GROUP_HOLES = "รูเสียบสแตนดี้";
const GROUP_MAGNET = "แม่เหล็ก (Acrylic Kit Magnet)";
const DRIVE = "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/10_อะคริลิค/งานอะคริลิคทั่วไป/08_Acrylic Kit-Magnet";
const OUT = new URL("../out/acrylic-kit/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

/* ── 1. อ่านตาราง ACRYLIC KIT สดจากเว็บ ── */
// หัวคอลัมน์บนเว็บ → ชื่อตัวเลือกในระบบ + ไฟล์การ์ด + คำอธิบาย (เรียงตามลำดับคอลัมน์)
const SIZES: { web: RegExp; name: string; file: string; desc: string; popular?: boolean }[] = [
  { web: /8\s*x\s*8/i, name: "8×8 ซม.", file: "size-8x8", desc: "จัตุรัสเล็กสุด เหมาะทำชุดพวงกุญแจ/ของสะสมชิ้นเล็ก (ชิ้นงานไม่เกิน 5 ชิ้น/ชุด)" },
  { web: /10\s*x\s*10/i, name: "10×10 ซม.", file: "size-10x10", desc: "จัตุรัสขนาดกลาง ใส่ตัวละคร 1 ตัวกับพร็อพแต่งตัวได้สบาย (ไม่เกิน 5 ชิ้น/ชุด)", popular: true },
  { web: /12\s*x\s*12/i, name: "12×12 ซม.", file: "size-12x12", desc: "จัตุรัสใหญ่ ชิ้นงานแต่ละตัวใหญ่ขึ้น เห็นรายละเอียดลายชัด (ไม่เกิน 5 ชิ้น/ชุด)" },
  { web: /^A6$/i, name: "A6 (14.8×10.5 ซม.)", file: "size-a6", desc: "แนวนอนขนาดโปสการ์ด จัดวางตัวละครคู่กับพร็อพได้หลายชิ้น (ไม่เกิน 5 ชิ้น/ชุด)" },
  { web: /^A5$/i, name: "A5 (14.8×21 ซม.)", file: "size-a5", desc: "ใหญ่สุด แนวตั้งครึ่ง A4 ใส่ตัวละครตัวใหญ่พร้อมพร็อพเต็มแผ่น (ไม่เกิน 5 ชิ้น/ชุด)" },
];

const html = await (await fetch(PAGE)).text();
const tables = html.match(/<table[\s\S]*?<\/table>/g) ?? [];
const parseTable = (t: string): string[][] =>
  (t.match(/<tr[\s\S]*?<\/tr>/g) ?? []).map((tr) =>
    (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/g) ?? []).map((td) =>
      td.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ").trim()
    )
  );
// ตารางแรกที่หัวมี 8x8 = ACRYLIC KIT (ตารางถัดไปที่หน้าตาเดียวกันเป็นของ + Magnet — ไม่ใช้)
const kit = tables.map(parseTable).find((rows) => rows[0]?.some((c) => /8\s*x\s*8/i.test(c)));
if (!kit) throw new Error("หา ตาราง ACRYLIC KIT (หัวคอลัมน์ 8x8) บนหน้าเว็บไม่เจอ — โครงหน้าอาจเปลี่ยน");

const header = kit[0];
// คอลัมน์ไหนคือขนาดไหน (อิงหัวจริง ไม่นับตำแหน่งตายตัว)
const colOf = SIZES.map((s) => {
  const i = header.findIndex((h) => s.web.test(h));
  if (i < 0) throw new Error(`หัวตารางไม่มีคอลัมน์ ${s.name} — ได้ ${JSON.stringify(header)}`);
  return i;
});
const dataRows = kit.slice(1).filter((r) => /ชุด/.test(r[0] ?? ""));
if (dataRows.length !== 6) throw new Error(`คาดว่ามี 6 ช่วงจำนวน ได้ ${dataRows.length} — ${JSON.stringify(dataRows.map((r) => r[0]))}`);

const tiers = dataRows.map((r) => {
  const label = r[0];
  const m = label.match(/^(\d+)\s*-\s*(\d+)/);
  return { label, upTo: m ? parseInt(m[2], 10) : null };
});
const cells: Record<string, number[]> = {};
for (let s = 0; s < SIZES.length; s++) {
  cells[SIZES[s].name] = dataRows.map((r) => {
    const n = parseInt(r[colOf[s]].replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`ราคาแถว "${r[0]}" คอลัมน์ ${SIZES[s].name} อ่านไม่ได้: "${r[colOf[s]]}"`);
    return n;
  });
  // ราคาต้องไม่แพงขึ้นเมื่อสั่งเยอะขึ้น — กันจับตารางผิด/คอลัมน์เพี้ยน
  const col = cells[SIZES[s].name];
  for (let i = 1; i < col.length; i++)
    if (col[i] > col[i - 1]) throw new Error(`ราคา ${SIZES[s].name} ขั้น ${tiers[i].label} (${col[i]}) แพงกว่าขั้นก่อน (${col[i - 1]}) — ตรวจตารางก่อน`);
}

console.log(`📥 ${PAGE}`);
console.log(`   ช่วงจำนวน: ${tiers.map((t) => t.label).join(" / ")}`);
for (const s of SIZES) console.log(`   ${s.name.padEnd(20)} ${cells[s.name].join(" / ")}`);

const pricing: PriceMatrix = { unit: UNIT, driverLabels: [GROUP_SIZE], tiers, cells };

/* ── 2. รูป: การ์ดขนาด (assets ใน repo) + แกลเลอรีจากไดรฟ์ร้าน ── */
const url = (file: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

async function put(name: string, buf: Buffer): Promise<string> {
  const file = `${name}-${V}.jpg`;
  writeFileSync(`${OUT}${file}`, buf); // เก็บตัวอย่างไว้ดูก่อนเขียนจริงเสมอ
  if (!WRITE) return url(file);
  const up = await sb.storage.from("product-images").upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

const fromDrive = (path: string) =>
  sharp(path).rotate().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
const fromAsset = (file: string) => Promise.resolve(readFileSync(new URL(`./assets/acrylic-kit/${file}.jpg`, import.meta.url)));

const sizeImg: Record<string, string> = {};
for (const s of SIZES) sizeImg[s.name] = await put(s.file, await fromAsset(s.file));

const GALLERY: { file: string; path: string; label: string }[] = [
  { file: "photo-sheet", path: `${DRIVE}/ตัวอย่าง/DSC04621.jpg`, label: "แผ่น Acrylic Kit — ชิ้นงานกดถอดออกมาประกอบ/แต่งตัวได้" },
  { file: "photo-close", path: `${DRIVE}/ตัวอย่าง/DSC04614.jpg`, label: "ชิ้นงานยึดบนแผ่นอะคริลิคใสรองหลัง" },
  { file: "photo-holo", path: `${DRIVE}/ตัวอย่าง/LINE_ALBUM_2021_1.07_220402.jpg`, label: "งานจริง — อะคริลิคพิเศษโฮโลแกรม" },
  { file: "photo-standee", path: `${DRIVE}/ตัวอย่าง/LINE_ALBUM_2021_2.07_220402.jpg`, label: "งานจริง — ชุดสแตนดี้แบบรูเสียบ" },
  { file: "photo-keyring", path: `${DRIVE}/ตัวอย่าง/DSC04633.jpg`, label: "ถอดชิ้นงานทำพวงกุญแจ/ที่ห้อยกระเป๋าได้" },
];
const gallery: ProductImage[] = [];
for (const g of GALLERY)
  gallery.push({ emoji: "🧩", gradient: "from-sky-200 to-cyan-300", label: g.label, src: await put(g.file, await fromDrive(g.path)) });

/* ── 3. ตัวเลือก ── */
const OPTIONS: ProductOption[] = [
  {
    label: GROUP_SIZE,
    display: "cards",
    choices: SIZES.map((s) => ({ name: s.name, desc: s.desc, imageSrc: sizeImg[s.name], ...(s.popular ? { popular: true } : {}) })),
  },
  {
    // เว็บ: งานสแตนดี้ 1-2 รูเสียบ +20 · มากกว่านั้นรูละ +10 · สูงสุด 5 รูเสียบ
    label: GROUP_HOLES,
    choices: [
      { name: "ไม่เจาะรูเสียบ", badge: "ฟรี" },
      { name: "เจาะ 1-2 รูเสียบ (งานสแตนดี้)", extra: 20 },
      { name: "เจาะ 3 รูเสียบ", extra: 30 },
      { name: "เจาะ 4 รูเสียบ", extra: 40 },
      { name: "เจาะ 5 รูเสียบ", extra: 50 },
    ],
  },
  {
    // เว็บ (ตาราง ACRYLIC KIT + Magnet): แม่เหล็ก (ขนาด 3mm) บวกเพิ่มจุดละ 8 บาท
    // จุดที่จะติดแม่เหล็กต้องมีขนาดมากกว่า 1 ซม. — ราคาฐานสองตารางเท่ากันทุกช่อง จึงทำเป็น Add on ติ๊กเพิ่มในตัวนี้
    label: GROUP_MAGNET,
    display: "multi",
    choices: [
      // ติ๊กแล้วระบุจำนวนจุด — ราคา 8 × จำนวนจุด ต่อ 1 ชุด (ค่าที่เก็บเป็น "ติดแม่เหล็ก ขนาด 3 มม. ×N")
      {
        name: "ติดแม่เหล็ก ขนาด 3 มม.",
        extra: 8,
        qty: true,
        qtyUnit: "จุด",
        // รูปโคลสอัพชิ้นงานบนแผ่นรองหลัง (เห็นจุดยึดแม่เหล็ก) — ใช้ไฟล์เดียวกับแกลเลอรีใบที่ 2
        imageSrc: gallery.find((g) => g.src?.includes("photo-close"))?.src,
      },
    ],
  },
];

/* ── 4. ประกอบสินค้า ── */
const minFirstTier = Math.min(...SIZES.map((s) => cells[s.name][0]));
const minLastTier = Math.min(...SIZES.map((s) => cells[s.name][cells[s.name].length - 1]));

const product: Product = {
  id: ID,
  name: NAME,
  category: CATEGORY,
  price: minFirstTier,
  emoji: "🧩",
  gradient: "from-sky-200 to-cyan-300",
  imageSrc: gallery[0].src,
  rating: 5,
  sold: 0,
  description: `รับทำ Acrylic Kit ชุดอะคริลิคประกอบ — แผ่นอะคริลิคชิ้นงานกดถอดออกมาประกอบ แต่งตัว สลับพร็อพได้ตามลายของคุณ พิมพ์ระบบ UV Printing สีสดคมชัด อะคริลิคหนาประมาณ 3 มม. พร้อมแผ่นอะคริลิคใสรองหลัง เลือกขนาดได้ 5 ขนาด (8×8 ซม. ถึง A5) ชิ้นงานไม่เกิน 5 ชิ้นต่อชุด ไม่มีขั้นต่ำในการสั่งผลิต เริ่มต้นชุดละ ${minFirstTier} บาท ทำเป็นชุดสแตนดี้รูเสียบ ติดแม่เหล็ก (Acrylic Kit Magnet จุดละ 8 บาท) หรือใส่อะไหล่พวงกุญแจได้`,
  highlights: [
    `ไม่มีขั้นต่ำ · 5 ขนาด (8×8 ซม. – A5) เริ่มชุดละ ${minFirstTier} บาท (สั่งเยอะลดถึงชุดละ ${minLastTier} บาท)`,
    "พิมพ์ UV Printing สีสดคมชัด · อะคริลิคหนา ~3 มม. พร้อมแผ่นอะคริลิคใสรองหลัง",
    "ชิ้นงานไม่เกิน 5 ชิ้น/ชุด ถอดประกอบ-แต่งตัวได้ · ทำสแตนดี้รูเสียบ (+20 บาท) · ติดแม่เหล็ก 3 มม. (จุดละ 8 บาท) หรือใส่อะไหล่พวงกุญแจได้",
  ],
  options: OPTIONS,
  images: gallery,
  pricing,
  priceRates: [
    {
      id: "rate-1",
      label: "เรทที่ 1",
      desc: "1-10 ชุด คละดีเทลได้ไม่จำกัด · 11 ชุดขึ้นไปคละลาย/คละขนาดได้ ขั้นต่ำลายละ 5 ชุด",
      minPerDesign: 5,
      freeMixBelowQty: 11,
      pricing,
    },
  ],
  terms: [
    "*ไม่มีขั้นต่ำในการสั่งผลิต — ราคาต่อชุด · ชิ้นงานไม่เกิน 5 ชิ้น/ชุด (ต้องการเพิ่มชิ้น คิดราคาตามขนาด/ชิ้น แจ้งแอดมิน)",
    "*อะคริลิคหนาประมาณ 3 มม. พิมพ์ระบบ UV Printing · มีแผ่นอะคริลิคใสรองหลัง (อะคริลิคใส หนา 0.8 มม.)",
    "*ขนาด A6 = 14.8×10.5 ซม. · A5 = 14.8×21 ซม. · ขอบอะคริลิคเว้นระยะ 2.5 มม. ทุกชิ้นงาน",
    "*งานสแตนดี้รูเสียบ: 1-2 รูเสียบ ค่าทำพิเศษ +20 บาท/ชุด · มากกว่านั้นเพิ่มรูละ 10 บาท · สูงสุดไม่เกิน 5 รูเสียบ",
    "*สกรีนกรอบได้ — ถ้าไม่สกรีนกรอบ อาจเห็นคราบกาวของตัวกรอบที่ติดกับแผ่นรองหลัง",
    "*ติดแม่เหล็ก (ขนาด 3 มม.) เลือกได้ในหน้าสินค้า บวกเพิ่มจุดละ 8 บาท — จุดที่จะติดแม่เหล็กต้องมีขนาดมากกว่า 1 ซม. อาจเห็นคราบกาวจากแม่เหล็กที่ติดกับตัวงาน",
    "*หากต้องการอะไหล่พวงกุญแจ รบกวนแจ้งในหมายเหตุถึงร้าน",
    "*ข้อจำกัดการผลิต: งาน Acrylic Kit มีโอกาสสกรีนเบี้ยวเล็กน้อย · สีงานสกรีนต่างจากไฟล์ได้ ±5-15% (ระบบสี RGB)",
  ].join("\n"),
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: [
        "• ไม่มีขั้นต่ำในการสั่งผลิต — พิมพ์ระบบ UV Printing สีสดคมชัด · อะคริลิคหนาประมาณ 3 มม.",
        "• ชุดอะคริลิคประกอบ: ชิ้นงานกดถอดออกจากแผ่น นำมาประกอบ/แต่งตัว/สลับพร็อพได้ ไม่เกิน 5 ชิ้นต่อชุด",
        "• เลือกได้ 5 ขนาด — 8×8 / 10×10 / 12×12 ซม. · A6 (14.8×10.5 ซม.) · A5 (14.8×21 ซม.)",
        "• มีแผ่นอะคริลิคใสรองหลังทุกชุด (อะคริลิคใสเท่านั้น หนา 0.8 มม.) · สกรีนกรอบได้",
        "• ทำเป็นชุดสแตนดี้รูเสียบได้ (1-2 รู +20 บาท · เพิ่มรูละ 10 · สูงสุด 5 รู) · ใส่อะไหล่พวงกุญแจได้ (รบกวนแจ้ง)",
        "• ติดแม่เหล็กเฉพาะจุด (Acrylic Kit Magnet) ได้ — แม่เหล็กขนาด 3 มม. บวกเพิ่มจุดละ 8 บาท เลือกและระบุจำนวนจุดได้ในหน้าสินค้า · จุดที่จะติดแม่เหล็กต้องมีขนาดมากกว่า 1 ซม. · อาจเห็นคราบกาวจากแม่เหล็กที่ติดกับตัวงาน",
        "• ราคา 1-10 ชุด คละดีเทลได้ไม่จำกัด · 11 ชุดขึ้นไปคละลาย/คละขนาดได้ ขั้นต่ำลายละ 5 ชุด (ไม่ถึงคิดราคาปลีก)",
        "• ข้อจำกัดการผลิต: งาน Acrylic Kit มีโอกาสสกรีนเบี้ยวเล็กน้อย",
      ].join("\n"),
    },
    {
      title: "การเตรียมไฟล์",
      text: [
        "• ไฟล์นามสกุล .Ai .Psd .Png หรือไฟล์พื้นหลังใส",
        "• ทางร้านใช้สี RGB — สีงานสกรีนอาจสว่างกว่าหรือดรอปลงตามความแตกต่างของไฟล์งาน ±5% ถึง ±15%",
        "• ทางร้านมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องต่างกันประมาณ 5-10% หากผลิตคนละรอบ/คนละเครื่อง",
        "• งานสกรีนเต็มขอบ สีมีโอกาสหลุดลอกง่ายกว่าแบบปกติ",
        "• โดยปกติทางร้านสกรีนใต้อะคริลิค (ยกเว้นอะคริลิคโฮโลแกรม 01/สีพิเศษ สกรีนบน) — ต้องการสกรีนบนรบกวนแจ้ง",
        "• งานอะคริลิคทุกชิ้นแปะฟิล์มกันรอยให้ (ลอกออกเองได้เลย) — อาจมีบางชิ้นไม่มีฟิล์มจากการถ่ายรูปผลงาน/ฟิล์มไหม้จากตัด",
      ].join("\n"),
    },
    {
      title: "วิธีสั่งงาน",
      text: 'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกขนาด จำนวนชุด และรูเสียบสแตนดี้ (ถ้าต้องการ) แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"\n• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ต้องการอะไหล่พวงกุญแจ · ติดแม่เหล็ก · สกรีนกรอบ · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\nหรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: ขนาด · จำนวนชุด · รูเสียบ/อะไหล่ที่ต้องการ · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน (.AI .PSD .PNG พื้นหลังใส) หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)',
    },
    {
      title: "การรับประกันสินค้า",
      text: "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• งานผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเสียหายระหว่างการขนส่ง\n\nไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n• งานสกรีนเบี้ยวเล็กน้อยตามข้อจำกัดการผลิตของงาน Acrylic Kit\n\nระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    },
  ],
  seo: {
    title: `รับทำ Acrylic Kit ชุดอะคริลิคประกอบ 5 ขนาด เริ่มชุดละ ${minFirstTier} บาท ไม่มีขั้นต่ำ`,
    keywords: [
      "Acrylic Kit",
      "อะคริลิคคิท",
      "ชุดอะคริลิคประกอบ",
      "รับทำ Acrylic Kit",
      "อะคริลิคแต่งตัว",
      "อะคริลิคถอดประกอบ",
      "สแตนดี้รูเสียบ",
      "Acrylic Kit Magnet",
      "รับทำอะคริลิค",
      "iDucky",
    ],
    description: `รับทำ Acrylic Kit ชุดอะคริลิคประกอบ ชิ้นงานถอดมาแต่งตัว/สลับพร็อพได้ พิมพ์ UV สีสด อะคริลิคหนา 3 มม. เลือก 5 ขนาด (8×8 ซม. – A5) พร้อมภาพเทียบขนาด ไม่มีขั้นต่ำ เริ่มชุดละ ${minFirstTier} บาท ทำสแตนดี้รูเสียบ/พวงกุญแจได้`,
    faqs: [
      {
        q: "Acrylic Kit ราคาเท่าไหร่?",
        a: `เริ่มต้นชุดละ ${minFirstTier} บาท (ขนาด 8×8 ซม. สั่ง 1-10 ชุด) ราคาขึ้นกับขนาดที่เลือก และยิ่งสั่งเยอะยิ่งถูกลง — สั่ง 500 ชุดขึ้นไปเริ่มชุดละ ${minLastTier} บาท ไม่มีขั้นต่ำในการสั่งผลิต ดูตารางราคาเต็มได้ในหน้าสินค้า`,
      },
      {
        q: "Acrylic Kit คืออะไร ใช้ยังไง?",
        a: "เป็นแผ่นอะคริลิคที่สกรีนลายของคุณแล้วไดคัทชิ้นงานไว้ในแผ่น กดถอดชิ้นงานออกมาประกอบ แต่งตัว สลับหมวก/แว่น/พร็อพได้ตามลาย มีแผ่นอะคริลิคใสรองหลังทุกชุด อะคริลิคหนาประมาณ 3 มม. พิมพ์ระบบ UV Printing ชิ้นงานไม่เกิน 5 ชิ้นต่อชุด",
      },
      {
        q: "มีขนาดอะไรให้เลือกบ้าง?",
        a: "มี 5 ขนาด — 8×8 ซม. · 10×10 ซม. · 12×12 ซม. · A6 (14.8×10.5 ซม.) · A5 (14.8×21 ซม.) ทุกขนาดใส่ชิ้นงานได้ไม่เกิน 5 ชิ้นต่อชุด ในหน้าสินค้ามีภาพเทียบขนาดแต่ละแบบให้ดูตอนเลือก ต้องการเพิ่มจำนวนชิ้นคิดราคาตามขนาด/ชิ้น แจ้งแอดมินได้",
      },
      {
        q: "ทำเป็นสแตนดี้หรือพวงกุญแจได้ไหม?",
        a: "ได้ทั้งคู่ — แบบสแตนดี้เลือก \"รูเสียบสแตนดี้\" ในหน้าสินค้า (1-2 รูเสียบ +20 บาท เพิ่มรูละ 10 บาท สูงสุด 5 รู) ส่วนอะไหล่พวงกุญแจแจ้งในหมายเหตุถึงร้านได้เลย",
      },
      {
        q: "สั่งหลายลาย/หลายขนาดรวมกันได้ไหม?",
        a: "ได้ — สั่ง 1-10 ชุด คละดีเทลได้ไม่จำกัด ส่วน 11 ชุดขึ้นไปคละลาย/คละขนาดได้ ขั้นต่ำลายละ 5 ชุด (ไม่ถึงตามจำนวนคิดราคาปลีก)",
      },
      {
        q: "แบบติดแม่เหล็ก (Acrylic Kit Magnet) สั่งได้ไหม?",
        a: "ได้ — ติ๊กตัวเลือก \"ติดแม่เหล็ก ขนาด 3 มม.\" ในหน้าสินค้าแล้วระบุจำนวนจุดได้เลย คิดเพิ่มจุดละ 8 บาท จุดที่จะติดแม่เหล็กต้องมีขนาดมากกว่า 1 ซม. (แจ้งตำแหน่งที่ต้องการติดในหมายเหตุถึงร้านได้) อาจเห็นคราบกาวจากแม่เหล็กที่ติดกับตัวงานเล็กน้อย",
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
console.log(`   แกลเลอรี ${gallery.length} ภาพ · การ์ดขนาด ${SIZES.length} ใบ · แท็บ ${saved.tabs!.length} · FAQ ${saved.seo!.faqs!.length} ข้อ · สถานะ: ฉบับร่าง`);

if (!WRITE) {
  console.log(`\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — เปิดดูรูปที่ ${OUT} แล้วใส่ --write เพื่อบันทึกจริง)`);
  process.exit(0);
}

/* ── 5. เขียนลง Supabase (คอลัมน์กระจก name/category/price ต้องไปด้วย) ── */
const { data: existing, error: exErr } = await sb.from("products").select("id,name").eq("id", ID).maybeSingle();
if (exErr) throw new Error(`เช็คสินค้าเดิมไม่ได้: ${exErr.message}`);
if (!existing) throw new Error(`ไม่พบสินค้า id ${ID} — สคริปต์นี้เขียนทับร่างเดิมเท่านั้น`);
if (existing.name !== NAME) throw new Error(`id ${ID} ตอนนี้ชื่อ "${existing.name}" ไม่ใช่ "${NAME}" — หยุดก่อน`);

const { error } = await sb.from("products").update({ name: saved.name, category: saved.category, price: saved.price, data: saved }).eq("id", ID);
if (error) throw new Error(`อัปเดตไม่สำเร็จ: ${error.message}`);

/** update คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบก่อนประกาศสำเร็จ */
const { data: check, error: readErr } = await sb.from("products").select("name,category,price,data").eq("id", ID).single();
if (readErr) throw new Error(`อ่านกลับไม่ได้: ${readErr.message}`);
if (check.name !== NAME || check.category !== CATEGORY || (check.data as Product).savedAt !== saved.savedAt)
  throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");

console.log(`\n✅ อัปรูป + บันทึกแล้ว — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
console.log(`   หน้าสินค้า: http://localhost:3005/products/${ID}`);
console.log(`   หน้าแก้ไข: http://localhost:3005/admin/products/${ID}`);
