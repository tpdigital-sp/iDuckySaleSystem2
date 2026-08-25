/**
 * เติมข้อมูลสินค้า "หมวกแก๊ป" (ร่างเปล่า id new-mt2omp9n-3490) จากตารางราคาเว็บ
 *
 *   npx tsx scripts/hat-cap-prices.mts            # ดูข้อมูลที่จะบันทึก (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/hat-cap-prices.mts --write    # อัปรูป + เขียนลง Supabase (คงสถานะฉบับร่าง)
 *
 * ที่มา: iduckyofficial-pricelists.com/หมวก หัวข้อ "หมวกแก๊ป" (Tabs: พิมพ์ DTF | FLEX · พิมพ์ ปัก)
 *   สคริปต์อ่านตารางสดทุกครั้ง — ยึดหัวข้อ "หมวกแก๊ป" แล้วเก็บ 2 ตารางแรกก่อนถึงหัวข้อ "หมวกบักเก็ต"
 *   (หน้าเดียวกันมีตารางหมวกบักเก็ต 2 ตาราง + หมวกปีกรอบใบสกรีนเต็มใบอีก 1 — กันหยิบผิดด้วยหัวข้อ)
 *   ราคาต่อใบ 8 ช่วงจำนวน · DTF|FLEX 350→180 · ปัก 400→250 → ตารางเดียว driver "รูปแบบงานพิมพ์"
 *
 * รายละเอียดจากหน้าเดียวกัน:
 *   • ไม่มีขั้นต่ำในการสั่งผลิต · 1-10 ใบ คละลายได้ · 11 ใบขึ้นไป คละลาย สั่งลายละ 5 ชิ้นขึ้นไป
 *   • งานปัก: ไฟล์ .DST/.PXF (ไม่มีไฟล์ = ค่าขึ้นบล๊อคตามความยากง่าย · Font/อิโมจิของร้าน ฟรี)
 *     ไหม Madeira เยอรมนี · เครื่อง TAJIMA ญี่ปุ่น 15 สีเข็ม · แบบนอกเหนือจากร้าน ≤3 สีเข็ม เกิน +10/สี/แบบ
 *   • ปักนูน +50 บาท/ใบ ทำได้เฉพาะฟอนต์ → กลุ่มตัวเลือกโผล่เฉพาะตอนเลือก "พิมพ์ ปัก"
 *   • ขนาดปัก สูงไม่เกิน 7 cm × กว้างไม่เกิน 15 cm
 *
 * ภาพประจำตัวเลือก (ผู้ใช้สั่ง 25 ส.ค. 69 ให้เห็นว่าแต่ละแบบหน้าตาเป็นยังไง):
 *   ชี้ไปที่รูปแกลเลอรีโดยตรง — พิมพ์ = หมวกลาย Magic vibes · ปัก = สไมลีย์ 1998
 *   กลุ่มปักนูนก็มีภาพทั้งคู่: ปักธรรมดา = สไมลีย์ 1998 (ไหมแบน) · ปักนูน = ปักชื่อ Mana (ตัวนูน)
 *   — ผู้ใช้ชี้เอง 25 ส.ค. 69 ว่ารูปไหนเป็นปักแบบไหน
 *   (ไม่อัปไฟล์แยก กันแกลเลอรีดูดภาพตัวเลือกเข้ามาซ้ำ — กดเลือกแล้วแกลเลอรีเด้งไปรูปนั้น)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
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

const ID = "new-mt2omp9n-3490"; // ร่างที่ผู้ใช้สร้างไว้เองในหลังบ้าน — คง id เดิมให้ลิงก์หน้าแก้ไขไม่เปลี่ยน
const NAME = "หมวกแก๊ป";
const V = "v1";
const PAGE = "https://www.iduckyofficial-pricelists.com/%E0%B8%AB%E0%B8%A1%E0%B8%A7%E0%B8%81";
const UNIT = "ใบ";
const DRIVER = "รูปแบบงานพิมพ์";
const PRINT_DTF = "พิมพ์ DTF | FLEX";
const PRINT_EMB = "พิมพ์ ปัก";
const EMBOSS_LABEL = "ปักนูน (เฉพาะฟอนต์)";
const EMBOSS_FEE = 50;

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = (file: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

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

/** 2 ตารางแรกหลังหัวข้อ "หมวกแก๊ป" ก่อนถึงหัวข้อ "หมวกบักเก็ต" — [0]=DTF|FLEX [1]=ปัก */
function capTables(): string[][][] {
  for (let i = html.indexOf(NAME); i >= 0; i = html.indexOf(NAME, i + 1)) {
    const t = html.indexOf("<table", i);
    if (t < 0 || t - i > 10000) continue; // ชื่อโผล่ใน JSON หัวไฟล์หลายที่ — เอาเฉพาะที่มีตารางตามติด
    const bucket = html.indexOf("หมวกบักเก็ต", i);
    const zone = html.slice(i, bucket > i ? bucket : undefined);
    const tables = [...zone.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => {
      const before = strip(zone.slice(Math.max(0, m.index! - 3000), m.index!));
      const rows = [...m[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
        [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
      );
      return { before, rows };
    });
    if (tables.length !== 2) continue;
    if (!/DTF/.test(tables[0].before) || !/ปัก/.test(tables[1].before))
      throw new Error("ลำดับตารางใต้หัวข้อหมวกแก๊ปไม่ตรงคาด (ตัวแรกต้องเป็น DTF ตัวสองเป็นปัก) — ตรวจหน้าเว็บก่อน");
    for (const { rows } of tables)
      if (rows.length < 2 || rows[0][0] !== "จำนวน" || rows[0][1] !== "ราคา" || !/ใบ/.test(rows[1][0]))
        throw new Error("โครงตารางหมวกแก๊ปไม่ตรงคาด (หัวต้องเป็น จำนวน|ราคา หน่วยเป็นใบ) — ตรวจหน้าเว็บก่อน");
    return tables.map((x) => x.rows);
  }
  throw new Error(`หาตารางใต้หัวข้อ "${NAME}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
}

const [dtfRows, embRows] = capTables();
const readPrices = (rows: string[][]) =>
  rows.slice(1).map((r) => {
    const n = Number(String(r[1]).replace(/[^\d]/g, ""));
    if (!n) throw new Error(`ช่องราคาแถว "${r[0]}" อ่านไม่ออก ("${r[1]}")`);
    return n;
  });
const tiers = dtfRows.slice(1).map((r) => {
  const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: m ? r[0] : r[0].replace(/ใบ\s*$/, "ใบขึ้นไป") };
});
tiers[tiers.length - 1].upTo = null; // "1000 ใบ(ขึ้นไป)" = ขั้นเปิดปลาย
if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ — ตรวจก่อน");
// สองตารางต้องช่วงจำนวนตรงกันถึงยุบเป็นตารางเดียวได้ — เทียบเลขต้นช่วงทุกแถว
dtfRows.slice(1).forEach((r, i) => {
  const a = r[0].match(/\d+/)?.[0];
  const b = embRows[i + 1]?.[0].match(/\d+/)?.[0];
  if (a !== b) throw new Error(`ช่วงจำนวนสองตารางไม่ตรงกัน (แถว ${i + 1}: DTF "${r[0]}" vs ปัก "${embRows[i + 1]?.[0]}")`);
});
const dtfPrices = readPrices(dtfRows);
const embPrices = readPrices(embRows);

console.log(`📊 ตาราง "${NAME}" จากเว็บ · ${tiers.length} ช่วงจำนวน (ราคาต่อ${UNIT})`);
console.log(`   ${PRINT_DTF}: ${tiers.map((t, i) => `${t.label}=฿${dtfPrices[i]}`).join(" · ")}`);
console.log(`   ${PRINT_EMB}: ${tiers.map((t, i) => `${t.label}=฿${embPrices[i]}`).join(" · ")}`);

const PRICING: PriceMatrix = {
  unit: UNIT,
  driverLabels: [DRIVER],
  tiers,
  cells: { [PRINT_DTF]: dtfPrices, [PRINT_EMB]: embPrices },
};

/* ── 2. รูปแกลเลอรี 5 ภาพจากท่อนหมวกแก๊ปบนหน้าเว็บ ─────────────────── */
/**
 * wixstatic id จากหน้า /หมวก โซนหมวกแก๊ป — ⚠️ MAX_PHOTOS = 5 ห้ามเกิน
 * ตัดออก: 88d16b98 (หมวกกรมท่าพิมพ์ ซ้ำมุมกับ hero) · 17906c57 (ปักชื่อ Mana มุมซ้ำ) · ddb95188 (กราฟิกตกแต่ง)
 * รูป [1] = ภาพประจำ "พิมพ์ DTF | FLEX" · รูป [3] = "พิมพ์ ปัก"/"ปักธรรมดา" · รูป [2] = "ปักนูน"
 */
const PHOTOS: [string, string, string][] = [
  ["photo-print-pair", "959b83_0e5eaaa5ff554703a4b3d5b4cf2df639~mv2.jpg", "งานพิมพ์ DTF | FLEX — หมวกแก๊ปพิมพ์ลายตามสั่ง"],
  ["photo-print-close", "959b83_2d94c210f9774f1580372dccc1154469~mv2.jpg", "งานพิมพ์ DTF — ลายชัด สีสด คมชัด"],
  ["photo-embro-name", "959b83_222ef0d7ed364c70a16a3c2836049861~mv2.jpg", "งานปักนูน — ปักชื่อไล่สี ตัวอักษรนูนเด่นจากผิวหมวก"],
  ["photo-embro-close", "959b83_5ec953faf743459cb07b6c09ccc8c295~mv2.jpg", "งานปักธรรมดา — ลายการ์ตูนหลายสีเข็ม ไหมปัก Madeira"],
  ["photo-embro-worn", "959b83_62faa60867d8403ba025b47e4c554fd6~mv2.jpg", "งานปักตอนสวมใส่จริง"],
];

async function fetchWix(wixId: string): Promise<Buffer> {
  const res = await fetch(`https://static.wixstatic.com/media/${wixId}/v1/fill/w_1200,h_1200,al_c,q_88/file.jpg`);
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
  gallery.push({ emoji: "🧢", gradient: "from-green-200 to-emerald-300", label, src });
}
// ภาพประจำตัวเลือกชี้รูปแกลเลอรีตรง ๆ — เลือกแล้วแกลเลอรีเด้งไปรูปนั้น
const artPrint = gallery[1].src!; // งานพิมพ์ DTF ใกล้ ๆ (Magic vibes)
const artEmbFlat = gallery[3].src!; // ปักธรรมดา — สไมลีย์ 1998 ไหมแบน (ผู้ใช้ชี้ 25 ส.ค. 69)
const artEmbPuff = gallery[2].src!; // ปักนูน — ปักชื่อ Mana ตัวอักษรนูน (ผู้ใช้ชี้ 25 ส.ค. 69)
console.log(`🖼  แกลเลอรี ${gallery.length} ภาพ (ภาพตัวเลือก: พิมพ์=[1] · ปัก/ปักธรรมดา=[3] · ปักนูน=[2])`);

/* ── 3. ประกอบสินค้า ─────────────────────────────────────────────── */
const OPTIONS: ProductOption[] = [
  {
    label: DRIVER, // แกนตารางราคา — ⚠️ ห้ามตัดกลุ่มนี้ออกตอนเข้าตะกร้า (driverLabels)
    display: "pills",
    choices: [
      { name: PRINT_DTF, imageSrc: artPrint },
      { name: PRINT_EMB, imageSrc: artEmbFlat },
    ],
  },
  {
    // โผล่เฉพาะตอนเลือกงานปัก — ปักนูนทำได้แค่ฟอนต์ +50/ใบ (จากหน้าเว็บ)
    label: EMBOSS_LABEL,
    display: "pills",
    note: "ปักนูน ทำได้เฉพาะ**ฟอนต์/ตัวอักษร** เท่านั้น · ขนาดปัก สูงไม่เกิน 7 ซม. × กว้างไม่เกิน 15 ซม.",
    showWhen: { label: DRIVER, choices: [PRINT_EMB] },
    choices: [
      { name: "ปักธรรมดา", badge: "ฟรี", imageSrc: artEmbFlat },
      { name: "ปักนูน", extra: EMBOSS_FEE, imageSrc: artEmbPuff },
    ],
  },
];

const product: Product = {
  id: ID,
  name: NAME,
  category: "apparel",
  price: dtfPrices[0],
  emoji: "🧢",
  gradient: "from-green-200 to-emerald-300",
  imageSrc: gallery[0].src,
  rating: 5,
  sold: 0,
  description:
    "หมวกแก๊ปสั่งทำลายตามสั่ง ไม่มีขั้นต่ำในการสั่งผลิต เลือกได้ 2 รูปแบบ — งานพิมพ์ DTF | FLEX ลายชัด สีสด คมชัด หรืองานปักด้วยไหม Madeira จากเยอรมนี เครื่องปัก TAJIMA มาตรฐานญี่ปุ่น ให้ผิวสัมผัสนูนของเส้นไหม เรียบหรูมีเอกลักษณ์",
  highlights: [
    `พิมพ์ DTF | FLEX เริ่มใบละ ${dtfPrices[0]} บาท · งานปัก เริ่มใบละ ${embPrices[0]} บาท`,
    "ไม่มีขั้นต่ำในการสั่งผลิต · 1-10 ใบ คละลายได้",
    "งานปักใช้ไหม Madeira เยอรมนี · เครื่องปัก TAJIMA รองรับ 15 สีเข็ม",
  ],
  options: OPTIONS,
  images: gallery,
  pricing: PRICING,
  priceRates: [
    {
      id: "r1",
      label: NAME,
      desc: "ราคาต่อใบ ตามรูปแบบงานพิมพ์ (DTF | FLEX หรือ งานปัก) · ไม่มีขั้นต่ำในการสั่งผลิต",
      pricing: PRICING,
      // กติกาคละจากหน้าเว็บ: 1-10 ใบคละอิสระ · 11 ใบขึ้นไป สั่งลายละ 5 ชิ้นขึ้นไป (ขั้นต่ำแข็ง ไม่มีค่าคละเกินโควตา)
      minPerDesign: 5,
      freeMixBelowQty: 11,
    },
  ],
  terms: [
    "*ราคาต่อใบ ตามรูปแบบงานพิมพ์ที่เลือก — ไม่มีขั้นต่ำในการสั่งผลิต",
    "*จำนวน 1-10 ใบ คละลายได้ · จำนวน 11 ใบขึ้นไป คละลาย สั่งลายละ 5 ชิ้นขึ้นไป",
    "*งานปัก ใช้ไฟล์ .DST หรือ .PXF — ถ้าไม่มีไฟล์ปัก มีค่าขึ้นบล๊อค (ราคาตามความยากง่าย) · ปัก Font หรืออิโมจิที่ทางร้านมี ไม่เสียค่าขึ้นบล๊อค",
    "*งานปัก แบบนอกเหนือจากทางร้าน ปักไม่เกิน 3 สีเข็ม — หากเกินคิดเพิ่มสีละ 10 บาทต่อแบบ",
    `*ปักนูน บวกเพิ่ม ${EMBOSS_FEE} บาท/ใบ ทำได้เฉพาะฟอนต์ · ขนาดปัก สูงไม่เกิน 7 cm × กว้างไม่เกิน 15 cm`,
    "*ทางร้านใช้สี R G B สีงานสกรีนที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
  ].join("\n"),
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: [
        "• หมวกแก๊ปสั่งทำลายตามสั่ง ไม่มีขั้นต่ำในการสั่งผลิต — เลือกได้ทั้งงานพิมพ์ DTF | FLEX และงานปัก",
        "• จำนวน 1-10 ใบ คละลายได้ · จำนวน 11 ใบขึ้นไป คละลาย สั่งลายละ 5 ชิ้นขึ้นไป",
        "• งานปัก ใช้ไหมปัก Madeira จากประเทศเยอรมนี — เส้นไหมโพลีเอสเตอร์ 100% คุณภาพสูง เรียบเงา ทนต่อการซักฟอก",
        "• เครื่องปัก TAJIMA มาตรฐานจากประเทศญี่ปุ่น รองรับ 15 สีเข็ม",
        "• งานปัก แบบนอกเหนือจากทางร้าน ปักไม่เกิน 3 สีเข็ม — หากเกินคิดเพิ่มสีละ 10 บาทต่อแบบ",
        `• ปักนูน บวกเพิ่ม ${EMBOSS_FEE} บาท/ใบ ทำได้เฉพาะฟอนต์ · ขนาดปัก สูงไม่เกิน 7 cm × กว้างไม่เกิน 15 cm · มีค่าขึ้นบล๊อค (ราคาตามความยากง่าย)`,
      ].join("\n"),
    },
    {
      title: "เทียบงานพิมพ์แต่ละแบบ",
      text: [
        "งานพิมพ์ DTF::",
        "• คุณภาพ: พิมพ์ภาพลงบนแผ่นฟิล์มด้วยหมึกสำหรับการย้อมผ้า แล้วรีดร้อนติดบนงาน — ลายชัดเจน สีสด คมชัด",
        "• ความทนทาน: ติดทนนาน ทนต่อการซักหลายครั้ง · ผิวสัมผัสด้าน นูน ยืดหยุ่นเรียบไปกับเนื้อผ้า",
        "• จุดเด่น: พิมพ์สีระบบ CMYK พิมพ์ได้ทั้งผ้าสีอ่อนและสีเข้ม · ข้อจำกัด: ส่วนที่สกรีนปิดทึบ รีดตรง ๆ บนงานไม่ได้",
        "",
        "งานพิมพ์ FLEX::",
        "• คุณภาพ: พิมพ์ภาพลงบน Flex ด้วยหมึก Solvent แล้วรีดร้อนติดบนงาน — ลายชัดเจน สีสด คมชัด",
        "• ความทนทาน: ทนต่อการซักและรีดได้หลายครั้ง · ผิวสัมผัสตามเนื้อ Flex ที่เลือก",
        "• จุดเด่น: ใช้เตารีดรีดลงโดยตรงบน Flex ได้ · ข้อจำกัด: ไม่เหมาะกับงานที่มีรายละเอียดเล็ก ๆ",
        "",
        "งานปัก::",
        "• คุณภาพ: สร้างลวดลายโดยใช้ไหมปักลงบนผ้า ให้ความเรียบหรู สวยงาม มีเอกลักษณ์แบบงานศิลปะ",
        "• ความทนทาน: ทนต่อการซักได้หลายครั้ง · ผิวสัมผัสนูนของเส้นไหม ยืดหยุ่นในระดับหนึ่ง",
        "• ข้อจำกัด: จำกัดเรื่องสีไหม เหมาะกับงานสีน้อย",
      ].join("\n"),
    },
    {
      title: "วิธีสั่งงาน",
      text: 'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกรูปแบบงานพิมพ์ (DTF | FLEX หรือ งานปัก) และจำนวนที่ต้องการ แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"\n• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น สีหมวก · ตำแหน่งลาย · สั่งกี่ลาย ลายละกี่ใบ · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\nหรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: รูปแบบงานพิมพ์ · จำนวนใบ · จำนวนลาย · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)',
    },
    {
      title: "การเตรียมไฟล์",
      text: "• งานพิมพ์ DTF | FLEX: ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n• งานปัก: ใช้ไฟล์ .DST หรือ .PXF — ถ้าไม่มีไฟล์ปัก จะมีค่าขึ้นบล๊อค (ราคาตามความยากง่าย) · ปัก Font หรืออิโมจิที่ทางร้านมี ไม่เสียค่าขึ้นบล๊อค\n• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด",
    },
    {
      title: "การรับประกันสินค้า",
      text: "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• สีหรืออะไหล่ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\nไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\nระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    },
  ],
  seo: {
    title: `รับทำหมวกแก๊ปสกรีนลาย งานพิมพ์ DTF | FLEX และงานปัก ไม่มีขั้นต่ำ เริ่มต้น ${dtfPrices[0]} บาท`,
    keywords: [
      "รับทำหมวกแก๊ป",
      "หมวกแก๊ปสกรีนลาย",
      "หมวกแก๊ปปักโลโก้",
      "หมวกปักชื่อ",
      "หมวกพิมพ์ลาย DTF",
      "หมวกสั่งทำ ไม่มีขั้นต่ำ",
      "หมวกแก๊ปพรีเมี่ยม",
      "ของขวัญ",
      "iDucky",
    ],
    description: `รับทำหมวกแก๊ปพิมพ์ลาย/ปักโลโก้ตามสั่ง ไม่มีขั้นต่ำ งานพิมพ์ DTF | FLEX เริ่มใบละ ${dtfPrices[0]} บาท งานปักไหม Madeira เริ่มใบละ ${embPrices[0]} บาท · ตรวจแบบก่อนผลิตทุกใบ`,
    faqs: [
      {
        q: "หมวกแก๊ปสั่งทำ ราคาเท่าไหร่?",
        a: `งานพิมพ์ DTF | FLEX ใบละ ${dtfPrices[0]} บาท (1-10 ใบ) ยิ่งสั่งเยอะยิ่งถูกลงจนถึงใบละ ${dtfPrices[dtfPrices.length - 1]} บาท · งานปัก ใบละ ${embPrices[0]} บาท ลดลงจนถึงใบละ ${embPrices[embPrices.length - 1]} บาท — ไม่มีขั้นต่ำในการสั่งผลิต ดูตารางราคาเต็มได้ในหน้าสินค้า`,
      },
      {
        q: "งานพิมพ์ DTF | FLEX กับงานปัก ต่างกันยังไง?",
        a: "งานพิมพ์ DTF | FLEX พิมพ์สีระบบ CMYK ลายชัด สีสด เหมาะกับลายที่มีรายละเอียดหรือสีเยอะ ส่วนงานปักใช้ไหมปักลงบนผ้า ให้ผิวสัมผัสนูนเรียบหรูมีเอกลักษณ์ เหมาะกับโลโก้/ตัวอักษร/ลายสีน้อย (แบบนอกเหนือจากทางร้าน ปักไม่เกิน 3 สีเข็ม เกินคิดเพิ่มสีละ 10 บาทต่อแบบ)",
      },
      {
        q: "สั่งใบเดียวได้ไหม? คละลายได้ไหม?",
        a: "ได้ — ไม่มีขั้นต่ำในการสั่งผลิต · จำนวน 1-10 ใบ คละลายได้ · จำนวน 11 ใบขึ้นไป คละลาย สั่งลายละ 5 ชิ้นขึ้นไป",
      },
      {
        q: "งานปัก ไม่มีไฟล์ปักทำได้ไหม?",
        a: "ได้ — ถ้าไม่มีไฟล์ปัก (.DST หรือ .PXF) จะมีค่าขึ้นบล๊อคตามความยากง่ายของลาย ส่วนการปัก Font หรืออิโมจิที่ทางร้านมี ไม่เสียค่าขึ้นบล๊อค",
      },
      {
        q: "ปักนูนคืออะไร?",
        a: `ปักนูนคืองานปักที่มีฟองน้ำรองใต้ไหมให้ลายนูนเด่นขึ้นจากผิวหมวก บวกเพิ่มใบละ ${EMBOSS_FEE} บาท ทำได้เฉพาะฟอนต์/ตัวอักษร · ขนาดปัก สูงไม่เกิน 7 ซม. × กว้างไม่เกิน 15 ซม.`,
      },
    ],
  },
  hidden: true, // คงเป็นฉบับร่าง — กดเผยแพร่เองที่ /admin/products
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
  console.log("\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}

/* ── 4. เขียนทับร่างเดิมใน Supabase (คอลัมน์กระจก name/category/price ต้องไปด้วย) ── */
const { data: row, error: rowErr } = await sb.from("products").select("id,name").eq("id", ID).maybeSingle();
if (rowErr) throw new Error(`อ่านสินค้าเดิมไม่ได้: ${rowErr.message}`);
if (!row) throw new Error(`ไม่พบสินค้า id ${ID} — สคริปต์นี้เติมข้อมูลร่างเดิม ไม่สร้างใหม่`);
if (row.name !== NAME) throw new Error(`id ${ID} เป็นของ "${row.name}" ไม่ใช่ "${NAME}" — ตรวจก่อน`);

const { error } = await sb
  .from("products")
  .update({ name: saved.name, category: saved.category, price: saved.price, data: saved })
  .eq("id", ID);
if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);

/** update คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบก่อนประกาศสำเร็จ */
const { data: check, error: readErr } = await sb.from("products").select("category,data").eq("id", ID).single();
if (readErr) throw new Error(`อ่านกลับไม่ได้: ${readErr.message}`);
if (check.category !== "apparel" || (check.data as Product).savedAt !== saved.savedAt)
  throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");

console.log(`\n✅ อัปรูป + บันทึกแล้ว — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
console.log(`   หน้าสินค้า: http://localhost:3005/products/${ID}`);
console.log(`   หน้าแก้ไข: http://localhost:3005/admin/products/${ID}`);
