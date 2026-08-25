/**
 * เติมข้อมูลสินค้า "หมวก Bucket สกรีนเต็มใบ" (ร่างเปล่า id new-mt2omz1g-3978) จากตารางราคาเว็บ
 *
 *   npx tsx scripts/hat-fullprint-prices.mts            # ดูข้อมูลที่จะบันทึก (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/hat-fullprint-prices.mts --write    # อัปรูป + เขียนลง Supabase (คงสถานะฉบับร่าง)
 *
 * ที่มา: iduckyofficial-pricelists.com/หมวก หัวข้อ "หมวกปีกรอบใบ สกรีนเต็มใบ" (พิมพ์ด้วยระบบซับลิเมชั่น)
 *   สคริปต์อ่านตารางสดทุกครั้ง — ยึดหัวข้อ "หมวกปีกรอบใบ" แล้วหา <table> ตัวถัดไป (ตารางเดียว 6 ช่วง 590→300)
 *   หน้าเดียวกันมีตารางหมวกแก๊ป 2 + หมวกบักเก็ต 2 อยู่ก่อนหน้า — กันหยิบผิดด้วยหัวข้อ + เช็คคำว่า "ซับลิเมชั่น"
 *
 * รายละเอียดจากหน้าเดียวกัน:
 *   • วัสดุผ้าแคนวาส หนา 8oz · ขนาด 22 นิ้ว · สกรีนรอบใบ ทั้งด้านใน และด้านนอก
 *   • จำนวน 1-10 ใบ คละลายได้ · 11 ใบขึ้นไป คละลาย สั่งลายละ 3 ชิ้นขึ้นไป (ขั้นต่ำแข็ง — แบบเดียวกับหมวกแก๊ปที่ลายละ 5)
 *   • ซับลิเมชั่น: หมึกซึมลงเนื้อผ้า สีไม่หลุด ทนซัก/รีด · พิมพ์ได้เฉพาะผ้าสีอ่อน เนื้อ TC TK
 *   • ข้อจำกัดงานผ้า: สี RGB เพี้ยนได้ ±5-15% · มีจุดดำจากฝุ่นเล็กน้อย ลายเคลื่อนเล็กน้อย รอยยับของผ้า
 *
 * ภาพประจำตัวเลือก (ผู้ใช้สั่ง 25 ส.ค. 69 ให้เห็นว่าแต่ละแบบหน้าตาเป็นยังไง — ชุดเดียวกับหมวกแก๊ป):
 *   สินค้านี้มีแบบเดียวคือสกรีนเต็มใบซับลิเมชั่น → กลุ่ม "รูปแบบงานพิมพ์" 1 ตัวเลือก
 *   ชี้ไปที่รูปแกลเลอรีโดยตรง — รูปปีกหมวก 2 ชั้นที่เห็นทั้งลายด้านนอกและด้านในพร้อมกัน
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

const ID = "new-mt2omz1g-3978"; // ร่างที่ผู้ใช้สร้างไว้เองในหลังบ้าน — คง id เดิมให้ลิงก์หน้าแก้ไขไม่เปลี่ยน
const NAME = "หมวก Bucket สกรีนเต็มใบ";
const V = "v1";
const PAGE = "https://www.iduckyofficial-pricelists.com/%E0%B8%AB%E0%B8%A1%E0%B8%A7%E0%B8%81";
const SECTION = "หมวกปีกรอบใบ"; // หัวข้อบนเว็บเขียน "หมวกปีกรอบใบ สกรีนเต็มใบ"
const UNIT = "ใบ";
const DRIVER = "รูปแบบงานพิมพ์"; // ชื่อกลุ่มเดียวกับหมวกแก๊ปให้ทั้งตระกูลหน้าตาเข้าชุด (ตัวนี้มีแบบเดียว ไม่เป็นแกนราคา)
const FULLPRINT = "สกรีนเต็มใบ ซับลิเมชั่น (ด้านนอก + ด้านใน)";

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

/** ตารางแรกถัดจากหัวข้อ "หมวกปีกรอบใบ" — เช็คว่าท่อนก่อนตารางพูดถึง "ซับลิเมชั่น" กันหยิบตารางหมวกตัวอื่น */
function sectionTable(): string[][] {
  for (let i = html.indexOf(SECTION); i >= 0; i = html.indexOf(SECTION, i + 1)) {
    const t = html.indexOf("<table", i);
    if (t < 0 || t - i > 10000) continue; // ชื่อโผล่ใน JSON หัวไฟล์ได้ — เอาเฉพาะที่มีตารางตามติด
    const before = strip(html.slice(i, t));
    if (!/ซับลิเมชั่น/.test(before)) continue;
    const end = html.indexOf("</table>", t);
    const rows = [...html.slice(t, end).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
      [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
    );
    if (rows.length > 1 && rows[0][0] === "จำนวน" && rows[0][1] === "ราคา" && /ใบ/.test(rows[1][0])) return rows;
  }
  throw new Error(`หาตารางใต้หัวข้อ "${SECTION}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
}

const rows = sectionTable();
const tiers = rows.slice(1).map((r) => {
  const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: r[0] };
});
tiers[tiers.length - 1].upTo = null; // "200 ใบขึ้นไป" = ขั้นเปิดปลาย
if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ — ตรวจก่อน");
const prices = rows.slice(1).map((r) => {
  const n = Number(String(r[1]).replace(/[^\d]/g, ""));
  if (!n) throw new Error(`ช่องราคาแถว "${r[0]}" อ่านไม่ออก ("${r[1]}")`);
  return n;
});

console.log(`📊 ตาราง "หมวกปีกรอบใบ สกรีนเต็มใบ" จากเว็บ · ${tiers.length} ช่วงจำนวน (ราคาต่อ${UNIT})`);
console.log(`   ${tiers.map((t, i) => `${t.label}=฿${prices[i]}`).join(" · ")}`);

/** แบบเดียวราคาเดียว → ตารางคอลัมน์เดียว ไม่มี driver (แบบเดียวกับ MOBILE PHONE HANGING ไดคัท) */
const PRICING: PriceMatrix = { unit: UNIT, driverLabels: [], tiers, cells: { "": prices } };

/* ── 2. รูปแกลเลอรี 5 ภาพจากท่อนสกรีนเต็มใบบนหน้าเว็บ ─────────────────── */
/**
 * wixstatic id จากหน้า /หมวก โซน "หมวกปีกรอบใบ สกรีนเต็มใบ" — ⚠️ MAX_PHOTOS = 5 ห้ามเกิน (พอดี 5 รูป)
 * รูป [1] (ปีกหมวก 2 ชั้น เห็นลายนอก+ในพร้อมกัน) ใช้เป็นภาพประจำตัวเลือก "สกรีนเต็มใบ"
 */
const PHOTOS: [string, string, string][] = [
  ["photo-floral-full", "959b83_0ce90699517e4b15b86c92ff3dc8f96b~mv2.jpg", "งานจริง — สกรีนเต็มใบรอบทรงหมวก ลายดอกไม้"],
  ["photo-brim-both", "959b83_b2a6f2442b7c49c388099d4b3fc0fb16~mv2.jpg", "สกรีนทั้งด้านนอกและด้านใน — เห็นลายที่ปีกหมวก 2 ชั้น"],
  ["photo-wave-outside", "959b83_749efaaa745a4c5385e692ade55e1b71~mv2.jpg", "ด้านนอกหมวก — ลายต่อเนื่องรอบใบ"],
  ["photo-wave-inside", "959b83_36d80fe399364c3ea9ca7f6ee88d2b28~mv2.jpg", "ด้านในหมวก — สกรีนลายเต็มเช่นเดียวกับด้านนอก"],
  ["photo-inside-top", "959b83_8ab29f4a73e4466797a01ae036660058~mv2.jpg", "ด้านในหมวก มุมบน — ลายเต็มถึงทรงหมวก"],
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
  gallery.push({ emoji: "👒", gradient: "from-sky-200 to-cyan-300", label, src });
}
const artFullprint = gallery[1].src!; // ภาพประจำตัวเลือกชี้รูปแกลเลอรีตรง ๆ — เลือกแล้วแกลเลอรีเด้งไปรูปนั้น
console.log(`🖼  แกลเลอรี ${gallery.length} ภาพ (ภาพประจำตัวเลือกใช้รูป [1] ปีกหมวก 2 ชั้น)`);

/* ── 3. ประกอบสินค้า ─────────────────────────────────────────────── */
const OPTIONS: ProductOption[] = [
  {
    // สินค้านี้มีแบบเดียว (สกรีนเต็มใบซับลิเมชั่น ราคาเดียวตามตาราง) — คงกลุ่มไว้พร้อมภาพ
    // ให้ลูกค้าเห็นหน้าตางานชัด ๆ + บรรทัดตัวเลือกติดไปกับออเดอร์เหมือนหมวกตัวอื่นในตระกูล
    label: DRIVER,
    display: "pills",
    note: "สกรีนเต็มใบรอบทรงหมวก **ทั้งด้านนอกและด้านใน** ด้วยระบบซับลิเมชั่น — หมึกซึมลงเนื้อผ้า สีไม่หลุด",
    choices: [{ name: FULLPRINT, imageSrc: artFullprint }],
  },
];

const product: Product = {
  id: ID,
  name: NAME,
  category: "apparel", // ให้อยู่หมวดเดียวกับหมวกแก๊ป (ร่างเดิมค้างเป็น acrylic จากตอนสร้างร่างเปล่า)
  price: prices[0],
  emoji: "👒",
  gradient: "from-sky-200 to-cyan-300",
  imageSrc: gallery[0].src,
  rating: 5,
  sold: 0,
  description:
    "หมวกบักเก็ตปีกรอบใบ สกรีนลายตามสั่งเต็มใบทั้งด้านนอกและด้านใน ด้วยระบบพิมพ์ซับลิเมชั่น — หมึกซึมลงเนื้อผ้า สีไม่หลุด ทนต่อการขีดข่วน ซักและรีดได้หลายครั้ง วัสดุผ้าแคนวาสหนา 8oz ขนาด 22 นิ้ว",
  highlights: [
    `สกรีนเต็มใบ ด้านนอก + ด้านใน เริ่มใบละ ${prices[0]} บาท`,
    "ผ้าแคนวาสหนา 8oz · ขนาด 22 นิ้ว",
    "จำนวน 1-10 ใบ คละลายได้",
  ],
  options: OPTIONS,
  images: gallery,
  pricing: PRICING,
  priceRates: [
    {
      id: "r1",
      label: "หมวกปีกรอบใบ สกรีนเต็มใบ",
      desc: "ราคาต่อใบ · พิมพ์เต็มใบด้วยระบบซับลิเมชั่น ทั้งด้านนอกและด้านใน",
      pricing: PRICING,
      // กติกาคละจากหน้าเว็บ: 1-10 ใบคละอิสระ · 11 ใบขึ้นไป สั่งลายละ 3 ชิ้นขึ้นไป (ขั้นต่ำแข็ง ไม่มีค่าคละเกินโควตา)
      minPerDesign: 3,
      freeMixBelowQty: 11,
    },
  ],
  terms: [
    "*ราคาต่อใบ ตามตาราง — สกรีนเต็มใบรวมทั้งด้านนอกและด้านในแล้ว ไม่มีบวกเพิ่ม",
    "*จำนวน 1-10 ใบ คละลายได้ · จำนวน 11 ใบขึ้นไป คละลาย สั่งลายละ 3 ชิ้นขึ้นไป",
    "*วัสดุผ้าแคนวาส หนา 8oz · ขนาด 22 นิ้ว · สกรีนรอบใบ ทั้งด้านใน และด้านนอก",
    "*พิมพ์ด้วยระบบซับลิเมชั่น — พิมพ์ได้เฉพาะผ้าสีอ่อน",
    "*ทางร้านใช้สี R G B สีงานสกรีนที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
    "*งานผ้าอาจมีจุดดำจากฝุ่นเล็กน้อย มีการเคลื่อนของลายสกรีน และมีรอยยับของผ้า — ไม่กระทบการใช้งาน",
  ].join("\n"),
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: [
        "• หมวกบักเก็ตปีกรอบใบ สกรีนลายตามสั่งเต็มใบ — พิมพ์รอบใบ ทั้งด้านใน และด้านนอก",
        "• วัสดุผ้าแคนวาส หนา 8oz · ขนาด 22 นิ้ว",
        "• พิมพ์ด้วยระบบซับลิเมชั่น — พิมพ์ภาพลงบนกระดาษซับลิเมชั่น แล้วรีดด้วยความร้อนถ่ายเทหมึกลงเนื้อผ้า",
        "• จำนวน 1-10 ใบ คละลายได้ · จำนวน 11 ใบขึ้นไป คละลาย สั่งลายละ 3 ชิ้นขึ้นไป",
      ].join("\n"),
    },
    {
      title: "งานพิมพ์ซับลิเมชั่น",
      text: [
        "• คุณภาพ: พิมพ์ภาพลงบนกระดาษซับลิเมชั่น จากนั้นนำไปวางทับบนผ้าแล้วรีดด้วยความร้อน โดยการกดทับเพื่อถ่ายเทน้ำหมึกจากกระดาษลงบนเนื้อผ้า",
        "• ความทนทาน: ทนทานต่อการซัก และรีดได้หลายครั้ง",
        "• ผิวสัมผัส: ภาพพิมพ์ซึมลงในเนื้อผ้า ผิวสัมผัสเดียวกับเนื้อผ้า",
        "• คุณสมบัติ: พิมพ์สีด้วยระบบ CMYK ยืดหยุ่นตามเนื้อผ้า ติดแน่นเรียบไปกับเนื้อผ้า",
        "• จุดเด่น: สีพิมพ์ซึมลงบนผ้า สีไม่หลุด ทนต่อการขีดข่วน",
        "• ข้อจำกัด: พิมพ์ได้เฉพาะผ้าสีอ่อน และเนื้อผ้า TC TK เท่านั้น",
      ].join("\n"),
    },
    {
      title: "ข้อจำกัดงานพิมพ์",
      text: [
        "🚨 ข้อจำกัดในการผลิตงานผ้า ด้วยระบบพิมพ์ซับลิเมชั่น",
        "• ทางร้านใช้สี R G B สีงานสกรีนที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15% — เพราะเป็นงานถ่ายเทสีพิมพ์ด้วยความร้อน ซึ่งอุณหภูมิมีผลกับสีที่พิมพ์ออกมา",
        "• งานผ้าจะมีจุดดำที่เกิดจากฝุ่นบ้างเล็กน้อย มีการเคลื่อนของลายสกรีน และจะมีรอยยับของผ้า ซึ่งจะไม่กระทบกับการใช้งาน",
      ].join("\n"),
    },
    {
      title: "วิธีสั่งงาน",
      text: 'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกจำนวนที่ต้องการ แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"\n• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น สั่งกี่ลาย ลายละกี่ใบ · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\nหรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: ประเภทงาน (หมวกสกรีนเต็มใบ) · จำนวนใบ · จำนวนลาย · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)',
    },
    {
      title: "การเตรียมไฟล์",
      text: "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n• งานสกรีนเต็มใบ — เตรียมลายแบบต่อเนื่อง (pattern) หรือลายเต็มพื้นที่ ทางร้านจัดวางรอบทรงหมวกให้\n• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด",
    },
    {
      title: "การรับประกันสินค้า",
      text: "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• สีหรืออะไหล่ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\nไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\nระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    },
  ],
  seo: {
    title: `รับทำหมวกบักเก็ตสกรีนเต็มใบ พิมพ์ซับลิเมชั่นทั้งด้านนอก-ด้านใน เริ่มต้น ${prices[0]} บาท`,
    keywords: [
      "รับทำหมวกบักเก็ต",
      "หมวกบักเก็ตสกรีนเต็มใบ",
      "หมวกปีกรอบใบ สกรีนเต็มใบ",
      "หมวกพิมพ์ลายเต็มใบ",
      "หมวกซับลิเมชั่น",
      "หมวกสั่งทำ ไม่มีขั้นต่ำ",
      "หมวกบักเก็ตพรีเมี่ยม",
      "ของขวัญ",
      "iDucky",
    ],
    description: `รับทำหมวกบักเก็ตปีกรอบใบ สกรีนลายตามสั่งเต็มใบทั้งด้านนอกและด้านใน ระบบซับลิเมชั่น ผ้าแคนวาส 8oz ขนาด 22 นิ้ว เริ่มใบละ ${prices[0]} บาท · ตรวจแบบก่อนผลิตทุกใบ`,
    faqs: [
      {
        q: "หมวกบักเก็ตสกรีนเต็มใบ ราคาเท่าไหร่?",
        a: `จำนวน 1-10 ใบ ใบละ ${prices[0]} บาท ยิ่งสั่งเยอะยิ่งถูกลง จนถึง 200 ใบขึ้นไปใบละ ${prices[prices.length - 1]} บาท ดูตารางราคาเต็มได้ในหน้าสินค้า`,
      },
      {
        q: "สกรีนเต็มใบ คือสกรีนตรงไหนบ้าง?",
        a: "สกรีนลายรอบทรงหมวกทั้งใบ ทั้งด้านนอกและด้านใน รวมปีกหมวก — ราคาเดียวตามตาราง ไม่มีบวกเพิ่ม",
      },
      {
        q: "ต่างกับหมวกบักเก็ตพิมพ์ DTF ยังไง?",
        a: "แบบ DTF พิมพ์ลายเฉพาะจุดบนหมวกสำเร็จรูป ส่วนสกรีนเต็มใบพิมพ์ลายลงผืนผ้าด้วยระบบซับลิเมชั่นก่อนเย็บขึ้นทรง ลายจึงคลุมทั้งใบทั้งด้านนอก-ด้านใน หมึกซึมลงเนื้อผ้า สีไม่หลุด",
      },
      {
        q: "สั่งใบเดียวได้ไหม? คละลายได้ไหม?",
        a: "ได้ — จำนวน 1-10 ใบ คละลายได้ · จำนวน 11 ใบขึ้นไป คละลาย สั่งลายละ 3 ชิ้นขึ้นไป",
      },
      {
        q: "หมวกทำจากผ้าอะไร ขนาดเท่าไหร่?",
        a: "ผ้าแคนวาส หนา 8oz ขนาด 22 นิ้ว — งานพิมพ์ซับลิเมชั่นทนต่อการซักและรีดได้หลายครั้ง ผิวสัมผัสเดียวกับเนื้อผ้า",
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
console.log(`   ตัวเลือก: ${OPTIONS.map((o) => `${o.label} ${o.choices.length} แบบ (มีภาพ)`).join(" · ")}`);
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
