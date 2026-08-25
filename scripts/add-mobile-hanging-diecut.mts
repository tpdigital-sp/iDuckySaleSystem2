/**
 * สร้างสินค้า "MOBILE PHONE HANGING ( ไดคัทตามทรง )" จากตารางราคาเว็บ
 *
 *   npx tsx scripts/add-mobile-hanging-diecut.ts            # ดูข้อมูลที่จะบันทึก (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/add-mobile-hanging-diecut.ts --write    # อัปรูป + เขียนลง Supabase (เป็นฉบับร่าง)
 *
 * ที่มา: iduckyofficial-pricelists.com/gadgetphone หัวข้อ "MOBILE PHONE HANGING ( ไดคัทตามทรง )"
 *   สคริปต์อ่านตารางสดทุกครั้ง (ยึดหัวข้อ "ไดคัทตามทรง" แล้วหา <table> ตัวถัดไป) — ราคาเปลี่ยนเมื่อไหร่รันซ้ำได้
 *   ขายเป็นเซ็ต เซ็ตละ 5 ชิ้น · 9 ช่วงจำนวน 150 → 108 บาท/เซ็ต · ราคาเดียวทั้ง PET ขาว/ใส
 *
 * รายละเอียดจากหน้าเดียวกัน:
 *   • วัสดุเป็น PET ( สีขาว | ใส ) หนา 250 ไมครอน → ทำเป็นกลุ่มตัวเลือก "วัสดุ PET" พร้อมภาพประกอบ
 *     (ภาพเทียบ ใส/ขาว ครอปจากรูปจริงบนหน้าเว็บที่เขียนป้าย "PET ใส | PET ขาว" กำกับไว้ให้แล้ว)
 *   • ทำขนาดไม่เกิน สูง 10 cm × กว้าง 6 cm · ที่ห้อยยาว 1.5 cm (ช่องห้อยประมาณ 8 mm)
 *   • งานพิมพ์ Digital Printing · ใส่หลังเคสผ่านรูช่องเสียบสายชาร์จ (รูต้องกว้างกว่า 1.1 cm)
 *   • จำนวน 1-10 เซ็ต คละลายได้ · 11 เซ็ตขึ้นไป คละลายละ 5 เซ็ตขึ้นไป
 *
 * ⚠️ กติกาคละลายตั้งตามพี่น้องร่วมตระกูล mobile-phone-hanging-2 (ผู้ใช้สั่งปรับ 24 ส.ค. 69 ให้ใช้ชุดเดียว
 *    กับที่เปิดขวดทรงกลม): minPerDesign 1 · extraDesignFee 5 · freeMixBelowQty 11 + perUnit บนตัวเลือก
 *    = 1-10 เซ็ตคละอิสระตามจำนวนชิ้น (เซ็ตละ 5 ลาย) · 11 เซ็ตขึ้นไปเซ็ตละ 1 ลาย เกินโควตา +5 บาท/ลาย
 *    (ตัวหนังสือบนเว็บเขียน "คละลายละ 5 เซ็ต" — ถ้าจะเอาตามเว็บเป๊ะ เปลี่ยนเป็น minPerDesign 5 ได้)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
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

const ID = "mobile-phone-hanging-diecut";
const NAME = "MOBILE PHONE HANGING ( ไดคัทตามทรง )";
const V = "v1";
const PAGE = "https://www.iduckyofficial-pricelists.com/gadgetphone";
const SECTION = "ไดคัทตามทรง";
const UNIT = "เซ็ต";
const PER_SET = 5;
const PET_LABEL = "วัสดุ PET";

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

/** ตารางแรกถัดจากหัวข้อ "ไดคัทตามทรง" (หน้านี้มีตาราง MOBILE PHONE HANGING ธรรมดาอยู่ก่อนหน้า — ยึดหัวข้อกันหยิบผิด) */
function sectionTable(): string[][] {
  for (let i = html.indexOf(SECTION); i >= 0; i = html.indexOf(SECTION, i + 1)) {
    const t = html.indexOf("<table", i);
    if (t < 0 || t - i > 2000) continue;
    const end = html.indexOf("</table>", t);
    const rows = [...html.slice(t, end).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
      [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
    );
    if (rows.length > 1 && rows[0][0] === "จำนวน" && rows[0][1] === "ราคา" && /เซ็ต/.test(rows[1][0])) return rows;
  }
  throw new Error(`หาตารางใต้หัวข้อ "${SECTION}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
}

const rows = sectionTable();
const tiers = rows.slice(1).map((r) => {
  const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: r[0] };
});
tiers[tiers.length - 1].upTo = null; // "5000 เซ็ต" = ขั้นเปิดปลาย
const prices = rows.slice(1).map((r) => {
  const n = Number(String(r[1]).replace(/[^\d]/g, ""));
  if (!n) throw new Error(`ช่องราคาแถว "${r[0]}" อ่านไม่ออก ("${r[1]}")`);
  return n;
});
if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ — ตรวจก่อน");

console.log(`📊 ตาราง "${NAME}" จากเว็บ · ${tiers.length} ช่วงจำนวน`);
console.log(`   ${tiers.map((t, i) => `${t.label} = ฿${prices[i]}`).join(" · ")}`);

/** ราคาเดียวทั้ง PET ขาว/ใส → ตารางคอลัมน์เดียว ไม่มี driver (แบบเดียวกับตะขอแขวนสูญญากาศ) */
const PRICING: PriceMatrix = { unit: UNIT, driverLabels: [], tiers, cells: { "": prices } };

/* ── 2. รูป — แกลเลอรี 5 + ภาพประจำตัวเลือก 2 ─────────────────────── */
/**
 * รูปงานจริงจากท่อน "ไดคัทตามทรง" บนหน้าเว็บ (wixstatic id) — ⚠️ MAX_PHOTOS = 5 ห้ามเกิน
 * รูปที่ตัดออก: 70b65bfa (ลาย Happy time ซ้ำกับ hero มุมอื่น)
 */
const PHOTOS: [string, string, string][] = [
  ["photo-oncase", "959b83_0f4fae51ae094fb1bcd0dd0946eb3227~mv2.jpg", "งานจริง — ไดคัทตามทรงลาย ติดหลังมือถือ"],
  ["photo-pet-compare", "959b83_ca920d24909547098ef6e8f6fdc4eab8~mv2.jpg", "เทียบวัสดุ — PET ใส | PET ขาว"],
  ["photo-shapes", "959b83_1667439f56a540b28f24dac9ad249fe6~mv2.jpg", "ไดคัทได้ทุกทรงตามลาย"],
  ["photo-both-oncase", "959b83_3bb5af1a7ccf47ec8f8ac75f0e4002c9~mv2.jpg", "PET ขาว + PET ใส บนเคสใส"],
  ["photo-variety", "959b83_d63f30a539b84652ae840c9559f63200~mv2.jpg", "ตัวอย่างงานหลายลาย พร้อมสายคล้อง"],
];
/** ภาพประจำตัวเลือก — ครอปจากรูปเทียบ ca920d24 (มีป้าย "PET ใส / PET ขาว" เขียนกำกับในรูปอยู่แล้ว) */
const CROPS: Record<string, { left: number; top: number; width: number; height: number }> = {
  "pet-clear": { left: 10, top: 250, width: 660, height: 660 },
  "pet-white": { left: 540, top: 300, width: 640, height: 640 },
};
const COMPARE_WIX = PHOTOS[1][1];

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
  gallery.push({ emoji: "🔗", gradient: "from-slate-100 to-blue-100", label, src });
}
const compareBuf = await fetchWix(COMPARE_WIX);
const art: Record<string, string> = {};
for (const [name, box] of Object.entries(CROPS))
  art[name] = await put(name, await sharp(compareBuf).extract(box).jpeg({ quality: 90 }).toBuffer());
console.log(`🖼  แกลเลอรี ${gallery.length} ภาพ + ภาพประจำตัวเลือก ${Object.keys(art).length} ภาพ`);

/* ── 3. ประกอบสินค้า ─────────────────────────────────────────────── */
/** เซ็ตละ 5 ชิ้น → perUnit 5 (เพดานคละช่วง 1-10 เซ็ต นับตามจำนวนชิ้น — แบบเดียวกับตัวเซ็ตละ 2 ชิ้น) */
const OPTIONS: ProductOption[] = [
  {
    label: PET_LABEL,
    display: "pills",
    choices: [
      { name: "PET สีขาว", perUnit: PER_SET, imageSrc: art["pet-white"] },
      { name: "PET ใส", perUnit: PER_SET, imageSrc: art["pet-clear"] },
    ],
  },
];

const product: Product = {
  id: ID,
  name: NAME,
  category: "phone-gadget",
  price: prices[0],
  emoji: "🔗",
  gradient: "from-slate-100 to-blue-100",
  imageSrc: gallery[0].src,
  rating: 5,
  sold: 0,
  description:
    `MOBILE PHONE HANGING แบบไดคัทตัดตามทรงลาย พิมพ์ลายตามสั่งด้วยระบบ Digital Printing ลงบนแผ่น PET หนา 250 ไมครอน เลือกได้ทั้งแบบสีขาวและแบบใส ทำขนาดได้ไม่เกิน สูง 10 × กว้าง 6 ซม. ใส่หลังเคสผ่านรูช่องเสียบสายชาร์จ — ขายเป็นเซ็ต 1 เซ็ต ${PER_SET} ชิ้น`,
  highlights: [
    `ไดคัทตามทรงลาย · 1 เซ็ต ${PER_SET} ชิ้น เริ่มเซ็ตละ ${prices[0]} บาท`,
    "PET หนา 250 ไมครอน เลือกได้ทั้งสีขาวและใส",
    `1-10 เซ็ต คละลายอิสระ (เซ็ตละ ${PER_SET} ลาย)`,
  ],
  options: OPTIONS,
  images: gallery,
  pricing: PRICING,
  /** กติกาคละชุดเดียวกับ mobile-phone-hanging-2 (ดูหมายเหตุหัวไฟล์) */
  priceRates: [
    {
      id: "r1",
      label: NAME,
      desc: `ขายเป็นเซ็ต เซ็ตละ ${PER_SET} ชิ้น · PET (สีขาว | ใส) หนา 250 ไมครอน`,
      pricing: PRICING,
      minPerDesign: 1,
      extraDesignFee: 5,
      freeMixBelowQty: 11,
    },
  ],
  bulkAskQty: 25,
  terms: [
    `*ขายเป็นเซ็ต เซ็ตละ ${PER_SET} ชิ้น (ราคาในตารางเป็นราคาต่อเซ็ต)`,
    "*วัสดุเป็น PET ( สีขาว | ใส ) หนา 250 ไมครอน — เลือกแบบได้ตอนสั่ง",
    "*ไดคัทตัดตามทรงลายได้ ทำขนาดไม่เกิน สูง 10 cm × กว้าง 6 cm",
    "*ที่ห้อยยาว 1.5 cm (ช่องสำหรับห้อยประมาณ 8 mm)",
    "*งานพิมพ์ Digital Printing",
    "*ใส่หลังเคส ผ่านรูของช่องเสียบสายชาร์จ — รูเคสต้องมีขนาดมากกว่า 1.1 cm ถึงจะใส่ได้",
    "*ทางร้านใช้สี R G B สีงานสกรีนที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
  ].join("\n"),
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: [
        `• ขายเป็นเซ็ต 1 เซ็ตได้ ${PER_SET} ชิ้น · วัสดุเป็น PET ( สีขาว | ใส ) หนา 250 ไมครอน`,
        "• ไดคัทตัดตามทรงลายได้ — ทำขนาดไม่เกิน สูง 10 cm × กว้าง 6 cm · ที่ห้อยยาว 1.5 cm (ช่องห้อยประมาณ 8 mm)",
        "• งานพิมพ์ Digital Printing",
        "• ใส่หลังเคส ผ่านรูของช่องเสียบสายชาร์จ — รูเคสต้องมีขนาดมากกว่า 1.1 cm ถึงจะใส่ได้",
        `• จำนวน 1-10 เซ็ต คละลายได้อิสระ — สั่ง 1 เซ็ตคละได้มากสุด ${PER_SET} ลาย (ตามจำนวนชิ้น)`,
        "• จำนวน 11 เซ็ตขึ้นไป คละได้เซ็ตละ 1 ลาย — คละเกินโควตา บวกเพิ่มลายละ 5 บาท",
        "• ทางร้านใช้สี RGB สีงานสกรีนอาจสว่างกว่าหรือดรอปลง ±5-15% ตามไฟล์งาน",
      ].join("\n"),
    },
    {
      title: "วิธีสั่งงาน",
      text: 'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกวัสดุ (PET สีขาว / PET ใส) และจำนวน "เซ็ต" ที่ต้องการ (1 เซ็ต = 5 ชิ้น) แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"\n• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น สั่งกี่ลาย ลายละกี่เซ็ต · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\nหรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: วัสดุที่เลือก · จำนวนเซ็ต · จำนวนลาย · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)',
    },
    {
      title: "การเตรียมไฟล์",
      text: "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n• งานไดคัทตามทรง — ลายควรเป็นเส้นขอบปิด ชัดเจน เผื่อพื้นที่ที่ห้อยด้านล่างยาว 1.5 cm\n• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด",
    },
    {
      title: "การรับประกันสินค้า",
      text: "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• สีหรืออะไหล่ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\nไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\nระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    },
  ],
  seo: {
    title: `รับทำ MOBILE PHONE HANGING ไดคัทตามทรง พิมพ์ลายตามสั่ง เริ่มต้น ${prices[0]} บาท`,
    keywords: [
      "รับทำ MOBILE PHONE HANGING",
      "MOBILE PHONE HANGING ไดคัทตามทรง",
      "ที่ห้อยหลังมือถือ",
      "ที่ห้อยโทรศัพท์สั่งทำ",
      "แผ่น PET ไดคัท",
      "รับทำแก็ดเจ็ต",
      "พิมพ์ลายตามสั่ง",
      "ของขวัญ",
      "iDucky",
    ],
    description: `รับทำ MOBILE PHONE HANGING แบบไดคัทตามทรงลาย แผ่น PET สีขาว/ใส หนา 250 ไมครอน ขายเป็นเซ็ต เซ็ตละ ${PER_SET} ชิ้น เริ่มต้น ${prices[0]} บาท · พิมพ์ลายตามสั่ง · ตรวจแบบก่อนผลิตทุกชิ้น`,
    faqs: [
      {
        q: "MOBILE PHONE HANGING ( ไดคัทตามทรง ) ราคาเท่าไหร่?",
        a: `ขายเป็นเซ็ต 1 เซ็ต ${PER_SET} ชิ้น — 1-10 เซ็ต เซ็ตละ ${prices[0]} บาท ยิ่งสั่งเยอะยิ่งถูกลง จนถึง 5000 เซ็ตขึ้นไปเซ็ตละ ${prices[prices.length - 1]} บาท ดูตารางราคาเต็มได้ในหน้าสินค้า`,
      },
      {
        q: "PET สีขาว กับ PET ใส ต่างกันยังไง?",
        a: "PET สีขาวพื้นทึบ ลายเด่นชัดเหมือนงานการ์ด ส่วน PET ใสมองทะลุได้ ให้ลุคโปร่ง ๆ เห็นสีเคส/ตัวเครื่องลอดออกมา — ความหนา 250 ไมครอนเท่ากันทั้งสองแบบ ราคาเท่ากัน",
      },
      {
        q: "ต่างกับ MOBILE PHONE HANGING แบบธรรมดายังไง?",
        a: "แบบธรรมดาเป็นทรงสี่เหลี่ยมขนาดตายตัว (เซ็ตละ 2 ชิ้น) ส่วนแบบไดคัทตัดตามทรงลายของคุณได้เลย ขนาดไม่เกิน สูง 10 × กว้าง 6 ซม. และขายเป็นเซ็ตละ 5 ชิ้น",
      },
      {
        q: "คละลายได้ไหม?",
        a: `จำนวน 1-10 เซ็ต คละลายได้อิสระตามจำนวนชิ้น (1 เซ็ตคละได้ ${PER_SET} ลาย) · 11 เซ็ตขึ้นไปคละได้เซ็ตละ 1 ลาย เกินโควตาบวกเพิ่มลายละ 5 บาท`,
      },
      {
        q: "ใส่กับเคสแบบไหนได้บ้าง?",
        a: "ใส่หลังเคส โดยสอดที่ห้อยผ่านรูของช่องเสียบสายชาร์จ — รูเคสต้องมีขนาดมากกว่า 1.1 cm ถึงจะใส่ได้",
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
console.log(`   ราคา ฿${range.min}-${range.max}/${UNIT} (เริ่มต้น ฿${saved.price}) · 1 เซ็ต = ${PER_SET} ชิ้น`);
console.log(`   ตัวเลือก: ${OPTIONS.map((o) => `${o.label} ${o.choices.length} แบบ (มีภาพครบ)`).join(" · ")}`);
console.log(`   แกลเลอรี ${gallery.length} ภาพ · แท็บ ${saved.tabs!.length} · FAQ ${saved.seo!.faqs!.length} ข้อ · สถานะ: ฉบับร่าง`);

if (!WRITE) {
  console.log("\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}

/* ── 4. เขียนลง Supabase (คอลัมน์กระจก name/category/price ต้องไปด้วย) ── */
const { data: dup } = await sb.from("products").select("id,name").eq("id", ID).maybeSingle();
if (dup && dup.name !== NAME) throw new Error(`id ${ID} ถูกใช้โดย "${dup.name}" อยู่แล้ว — ตรวจก่อน`);
const { data: maxRow } = await sb.from("products").select("sort").order("sort", { ascending: false }).limit(1);
const sort = ((maxRow?.[0]?.sort as number | undefined) ?? 0) + 1;
const { error } = await sb.from("products").upsert(
  {
    id: ID,
    name: saved.name,
    category: saved.category,
    price: saved.price,
    sold: 0,
    featured: false,
    badge: null,
    ...(dup ? {} : { sort }),
    data: saved,
  },
  { onConflict: "id" }
);
if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);

/** update/upsert คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบก่อนประกาศสำเร็จ */
const { data: check, error: readErr } = await sb.from("products").select("name,data").eq("id", ID).single();
if (readErr) throw new Error(`อ่านกลับไม่ได้: ${readErr.message}`);
if (check.name !== NAME || (check.data as Product).savedAt !== saved.savedAt)
  throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");

console.log(`\n✅ อัปรูป + บันทึกแล้ว (sort ${dup ? "เดิม" : sort}) — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
console.log(`   หน้าสินค้า: http://localhost:3005/products/${ID}`);
console.log(`   หน้าแก้ไข: http://localhost:3005/admin/products/${ID}`);
