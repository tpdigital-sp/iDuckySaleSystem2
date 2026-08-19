/**
 * สร้างสินค้า "Photo card Digital" จากตารางราคาเว็บ iduckyofficial-pricelists.com/photocard
 *
 *   npx tsx scripts/add-photocard-digital.ts          # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   npx tsx scripts/add-photocard-digital.ts --write  # เขียนลง Supabase
 *
 * ดึง 3 ตาราง (พิมพ์ระบบ Digital Printing) มาเป็น 3 เรทราคา:
 *   1. PHOTOCARD กระดาษอาร์ตมัน หนา 300 แกรม      130 / 95 / 90 / 85
 *   2. PHOTOCARD กระดาษเนื้อพิเศษ                   160 / 125 / 120 / 115
 *   3. PHOTOCARD พลาสติก (PET) หนา 250 ไมครอน      240 / 160 / 150 / 140
 * ตาราง Add On เคลือบฟอยล์ (40 / 60 · โฮโลแกรม +10) เข้าเป็นกลุ่มตัวเลือก "เคลือบฟอยล์" + "สีฟอยล์"
 * ภาพประกอบทุกตัวเลือกอัปไว้ที่ Supabase Storage แล้ว (products/photocard-digital/*.jpg)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { hasQuoteOption, priceRange, type PriceTier, type Product } from "../src/lib/products";

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

const ID = "photocard-digital";
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}.jpg`;

/** ช่วงจำนวนของทั้ง 3 ตาราง (เหมือนกันหมด) */
const TIERS: PriceTier[] = [
  { upTo: 10, label: "1-10 เซ็ต" },
  { upTo: 49, label: "11-49 เซ็ต" },
  { upTo: 99, label: "50-99 เซ็ต" },
  { upTo: null, label: "100 เซ็ตขึ้นไป" },
];
const UNIT = "เซ็ต (20 ใบ)";
const matrix = (prices: number[]) => ({ unit: UNIT, driverLabels: [], tiers: TIERS, cells: { "": prices } });

const RATE_ART = "กระดาษอาร์ตมัน 300 แกรม";
const RATE_SPECIAL = "กระดาษเนื้อพิเศษ";
const RATE_PET = "พลาสติก PET 250 ไมครอน";
const FOIL_1 = "พิมพ์ 1 เลเยอร์ / 1 ด้าน";
const FOIL_2 = "พิมพ์ 2 เลเยอร์ / 1 ด้าน";
const COAT_LABEL = "เคลือบ (เฉพาะด้านที่สกรีน)";
const COAT_SPECIAL_1 = "เคลือบพิเศษ 1 ด้าน";
const COAT_SPECIAL_2 = "เคลือบพิเศษ 2 ด้าน";

const TABS: Product["tabs"] = [
  {
    "title": "รายละเอียดเพิ่มเติม",
    "text": "• 1 เซต มีจำนวน 20 ใบ · ขนาด 5.5x8.5 ซม.\n• พิมพ์ 2 ด้าน บวกแผ่นละ 10 บาท\n• เคลือบพิเศษ บวกเพิ่มด้านละ 30 บาท\n• 1 แผ่น (A3) คละไม่เกิน 3 ลาย หากเกินคิดเพิ่มลายละ 5 บาท\n• เคลือบเงา | ด้าน | พิเศษ เคลือบเฉพาะด้านที่สกรีนเท่านั้น\n• ตัดตามขนาด เช่น A4 A5 A6 A7 หรือขนาดอื่น ๆ\n• แพ็คใส่ถุงรวมต่อเซ็ต\n\nรายละเอียดกระดาษเนื้อพิเศษ::\n• กระดาษเนื้อโฮโลแกรม หนา 300 แกรม (ด้านหน้าโฮโลแกรม-ด้านหลังสีขาว)\n• กระดาษเนื้อ Canvas หนา 260 แกรม\n• กระดาษเนื้อ Extra White หนา 260 แกรม\n• กระดาษเนื้อ 100 Pond หนา 300 แกรม\n\nAdd On งานพิมพ์สีเงิน | สีขาว::\n• พิมพ์รองสีเงิน บวกเพิ่ม 20 บาท/แผ่น\n• พิมพ์รองสีขาว บวกเพิ่ม 20 บาท/แผ่น (เฉพาะกระดาษเนื้อพิเศษ / PET)\n• งานพิมพ์รองสีเงิน รอบจัดส่งทุกวันศุกร์ — สีเงินเป็นสีพิเศษ เครื่องพิมพ์ใส่สีพิเศษได้ทีละหัว ผลิตได้อาทิตย์ละ 1 รอบ"
  },
  {
    "text": "สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกจำนวนและตัวเลือกที่ต้องการ แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง \"แนบลายของคุณ\"\n• ระบุรายละเอียดเพิ่มเติมในช่อง \"หมายเหตุถึงร้าน\" เช่น ขนาด/รุ่นที่ต้องการ · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\nหรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: สินค้า/ขนาดที่เลือก · รายละเอียดเพิ่มเติม (ถ้ามี) · จำนวน · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
    "title": "วิธีสั่งงาน"
  },
  {
    "text": "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด",
    "title": "การเตรียมไฟล์"
  },
  {
    "text": "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• สีหรืออะไหล่ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\nไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\nระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    "title": "การรับประกันสินค้า"
  }
];

const product: Product = {
  id: ID,
  slug: "photo-card-digital",
  name: "Photo card Digital",
  category: "card-photo",
  price: 85,
  emoji: "🎴",
  gradient: "from-sky-100 to-blue-200",
  imageSrc: IMG("gallery-1"),
  rating: 4.9,
  sold: 0,
  badge: "ใหม่",
  description:
    "โฟโต้การ์ดพิมพ์ระบบ Digital Printing ขนาด 5.5×8.5 ซม. ขายเป็นเซ็ต เซ็ตละ 20 ใบ ไม่มีขั้นต่ำในการสั่งผลิต " +
    "เลือกวัสดุได้ 3 แบบ — กระดาษอาร์ตมัน 300 แกรม (นำเข้าจากเกาหลี), กระดาษเนื้อพิเศษ (โฮโลแกรม / Canvas / 100 Pond / Extra White) " +
    "และแผ่นพลาสติก PET 250 ไมครอน (สีขาว / สีใส) ที่โดนน้ำได้ไม่ฉีกขาด " +
    "ฟรี! ไดคัทมุมมน และเคลือบเงา/ด้าน เพิ่มลูกเล่นได้ทั้งเคลือบพิเศษ เคลือบฟอยล์ และพิมพ์รองสีเงิน/สีขาว",
  highlights: [
    "1 เซ็ต = 20 ใบ · ขนาด 5.5×8.5 ซม. · ไม่มีขั้นต่ำ",
    "เลือกวัสดุได้ 3 แบบ — อาร์ตมัน 300 แกรม / กระดาษเนื้อพิเศษ / PET 250 ไมครอน",
    "ฟรี! ไดคัทมุมมน + เคลือบเงา/ด้าน (หน้า-หลัง)",
    "เคลือบฟอยล์ได้ 4 สี — เงิน ทอง โรสโกลด์ โฮโลแกรม (เฉพาะงานกระดาษ)",
    "ยิ่งสั่งเยอะยิ่งถูก — เริ่มต้น 85 บาท/เซ็ต",
  ],
  images: [
    { emoji: "🎴", gradient: "from-sky-100 to-blue-200", label: "กระดาษอาร์ตมัน 300 แกรม", src: IMG("gallery-1") },
    { emoji: "✨", gradient: "from-fuchsia-100 to-pink-200", label: "กระดาษเนื้อพิเศษ (โฮโลแกรม)", src: IMG("gallery-2") },
    { emoji: "💧", gradient: "from-cyan-100 to-sky-200", label: "พลาสติก PET 250 ไมครอน", src: IMG("gallery-3") },
    { emoji: "✂️", gradient: "from-amber-100 to-yellow-200", label: "ฟรี! ไดคัทมุมมน", src: IMG("gallery-4") },
    { emoji: "🌈", gradient: "from-violet-100 to-indigo-200", label: "กระดาษโฮโลแกรม", src: IMG("gallery-5") },
    { emoji: "🥇", gradient: "from-yellow-100 to-amber-200", label: "เคลือบฟอยล์", src: IMG("foil-1layer") },
  ],
  priceRates: [
    {
      id: "art-300",
      label: RATE_ART,
      desc: "กระดาษนำเข้าจากเกาหลี · ฟรี! ไดคัทมุมมน + เคลือบเงา/ด้าน (หน้า-หลัง)",
      imageSrc: IMG("rate-art300"),
      pricing: matrix([130, 95, 90, 85]),
    },
    {
      id: "paper-special",
      label: RATE_SPECIAL,
      desc: "โฮโลแกรม | Canvas | 100 Pond | Extra White · ฟรี! ไดคัทมุมมน + เคลือบเงา/ด้าน",
      imageSrc: IMG("rate-special"),
      pricing: matrix([160, 125, 120, 115]),
    },
    {
      id: "pet-250",
      label: RATE_PET,
      desc: "โดนน้ำได้ ไม่ฉีกขาด · เลือกสีขาว/สีใส · ฟรี! ไดคัทมุมมน (เคลือบฟอยล์ไม่ได้)",
      imageSrc: IMG("rate-pet250"),
      pricing: matrix([240, 160, 150, 140]),
    },
  ],
  // เรทราคา = "วัสดุ" ต้องเลือกก่อน จึงวางไว้ด้านบนตามค่าเริ่มต้น
  pricing: matrix([130, 95, 90, 85]),
  options: [
    {
      label: "ชนิดกระดาษเนื้อพิเศษ",
      stockBearing: true,
      showWhen: { label: "เรทราคา", choices: [RATE_SPECIAL] },
      choices: [
        { name: "กระดาษโฮโลแกรม 300 แกรม", imageSrc: IMG("paper-hologram") },
        { name: "Canvas 260 แกรม", imageSrc: IMG("paper-canvas") },
        { name: "100 Pond 300 แกรม", imageSrc: IMG("paper-pond100") },
        { name: "Extra White 260 แกรม", imageSrc: IMG("paper-extrawhite") },
      ],
    },
    {
      label: "สี PET",
      stockBearing: true,
      showWhen: { label: "เรทราคา", choices: [RATE_PET] },
      choices: [
        { name: "PET สีขาว", imageSrc: IMG("pet-white") },
        { name: "PET สีใส", imageSrc: IMG("pet-clear") },
      ],
    },
    {
      label: "พิมพ์กี่ด้าน",
      choices: [{ name: "พิมพ์ 1 ด้าน" }, { name: "พิมพ์ 2 ด้าน", extra: 10 }],
    },
    {
      label: COAT_LABEL,
      choices: [
        { name: "เคลือบเงา" },
        { name: "เคลือบด้าน" },
        { name: COAT_SPECIAL_1, extra: 30 },
        { name: COAT_SPECIAL_2, extra: 60 },
      ],
    },
    {
      // ลิงก์คลังตัวเลือกกลาง "เคลือบ" (preset-2) — ภาพฟิล์มแต่ละแบบมาจากคลัง
      label: "เคลือบ",
      presetId: "preset-2",
      display: "pills",
      showWhen: { label: COAT_LABEL, choices: [COAT_SPECIAL_1, COAT_SPECIAL_2] },
      choices: [
        { name: "เงา" },
        { name: "ด้าน" },
        { name: "กลิตเตอร์" },
        { name: "ทราย" },
        { name: "hologram-รุ้ง" },
        { name: "hologram-ดาว" },
        { name: "hologram-หิมะ" },
        { name: "hologram-หัวใจ" },
        { name: "hologram-เหลี่ยม" },
        { name: "hologram-จุด" },
        { name: "hologram-Dust" },
        { name: "hologram-Stardust" },
      ],
    },
    {
      label: "เคลือบฟอยล์",
      // เคลือบฟอยล์ได้เฉพาะงานกระดาษ — งาน PET ไม่ต้องถาม
      showWhen: { label: "เรทราคา", choices: [RATE_ART, RATE_SPECIAL] },
      choices: [
        { name: "ไม่เคลือบฟอยล์" },
        { name: FOIL_1, extra: 40, imageSrc: IMG("foil-1layer") },
        { name: FOIL_2, extra: 60, imageSrc: IMG("foil-2layer") },
      ],
    },
    {
      label: "สีฟอยล์",
      showWhen: { label: "เคลือบฟอยล์", choices: [FOIL_1, FOIL_2] },
      choices: [
        { name: "สีเงิน", imageSrc: IMG("foil-silver") },
        { name: "สีทอง", imageSrc: IMG("foil-gold") },
        { name: "สีโรสโกลด์", imageSrc: IMG("foil-rosegold") },
        { name: "สีโฮโลแกรม", extra: 10, imageSrc: IMG("foil-hologram") },
      ],
    },
    {
      label: "พิมพ์รองพื้น (Add On)",
      choices: [
        { name: "ไม่พิมพ์รอง" },
        { name: "พิมพ์รองสีเงิน", extra: 20 },
        { name: "พิมพ์รองสีขาว", extra: 20 },
      ],
    },
  ],
  rules: [
    // งานอาร์ตมันมีพิมพ์รองสีเงินอย่างเดียว (สีขาวมีเฉพาะกระดาษพิเศษ / PET)
    {
      when: { label: "เรทราคา", choice: RATE_ART, choices: [RATE_ART] },
      limit: { label: "พิมพ์รองพื้น (Add On)", allow: ["ไม่พิมพ์รอง", "พิมพ์รองสีเงิน"] },
    },
  ],
  // 1 แผ่น A3 (= 1 เซ็ต) คละได้ไม่เกิน 3 ลาย เกินคิดลายละ 5 บาท
  mixRule: { baseFee: 0, includedDesigns: 3, extraFee: 5 },
  terms: [
    "1 เซ็ต มีจำนวน 20 ใบ · ขนาด 5.5×8.5 ซม. · แพ็คใส่ถุงรวมต่อเซ็ต",
    "1 แผ่น (A3) คละได้ไม่เกิน 3 ลาย หากเกินคิดเพิ่มลายละ 5 บาท",
    "เคลือบเงา | ด้าน | พิเศษ — เคลือบเฉพาะด้านที่สกรีนเท่านั้น",
    "ตัดตามขนาดอื่นได้ เช่น A4 A5 A6 A7 (แจ้งในหมายเหตุถึงร้าน)",
    "เคลือบฟอยล์ได้เฉพาะงานกระดาษ · สีฟอยล์: เงิน ทอง โรสโกลด์ โฮโลแกรม (โฮโลแกรมบวกเพิ่ม 10 บาท)",
    "งานพิมพ์ฟอยล์ 2 เลเยอร์ งานพิมพ์จะเลื่อนประมาณ 1-2 มม. เพราะกระดาษหดตัวจากการพิมพ์และเคลือบหลายรอบ",
    "งานฟอยล์ที่มีเส้นบาง ๆ หรือตัวอักษรเล็กมาก ฟอยล์อาจหลุด/ติดไม่ครบ (ไม่ควรใช้ฟอนต์เล็กเกินไป)",
    "งานพิมพ์รองสีเงิน/สีขาว จัดส่งทุกวันศุกร์ — สีพิเศษใส่เครื่องได้ทีละหัว ผลิตได้อาทิตย์ละ 1 รอบ",
    "ทางร้านใช้สีระบบ RGB สีงานที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
    "ความคลาดเคลื่อนในการตัด ±0.5-2 มม. · งานกระดาษที่พิมพ์ด้านหลังคลาดเคลื่อนได้ถึง ±3-5 มม. ไม่ควรวางงานชิดขอบหรือมีเส้นขอบ",
    "งานเคลือบลามิเนตอาจมีฝุ่นบนงานเล็กน้อย",
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

console.log("ราคา:", range, "· ตัวเลือก:", saved.options.length, "กลุ่ม · เรท:", saved.priceRates?.length);

if (!WRITE) {
  console.log("(ยังไม่เขียน — ใส่ --write เพื่อบันทึกลง Supabase)");
  process.exit(0);
}

async function main() {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: maxRow } = await sb.from("products").select("sort").order("sort", { ascending: false }).limit(1);
  const sort = ((maxRow?.[0]?.sort as number | undefined) ?? 0) + 1;
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
  console.log(`บันทึกแล้ว: ${ID} (sort ${sort}) — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
}

main();
