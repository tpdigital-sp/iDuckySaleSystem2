/**
 * สร้างสินค้า "Rotating Stand" (ชุดกรอบอะคริลิค + ตัวสแตนดี้แขวนหมุนในกรอบ)
 * iduckyofficial-pricelists.com/acrylicrotatingstand — บล็อกบนสุดของหน้า หัวข้อ "Rotating Stand"
 *
 *   npx tsx scripts/add-rotating-stand-frame.ts                                 # ดูข้อมูลที่จะบันทึก
 *   node scripts/rotating-stand-frame-art.mjs                                   # เตรียมภาพ
 *   npx tsx scripts/add-rotating-stand-frame.ts --upload --images=.cache/rot/upload-frame
 *   npx tsx scripts/add-rotating-stand-frame.ts --write                         # เขียนลง Supabase (ฉบับร่าง)
 *
 * ⚠️ หน้าเดียวกันมี 3 ตาราง อย่าหยิบสลับกัน:
 *   1. "Rotating Stand"           350/320/310/300  → สินค้านี้ (กรอบ + ตัวสแตนดี้แขวนหมุน + ฐาน)
 *   2. "สแตนดี้อะคริลิค หมุนได้"   170…/ขนาด 5-12cm → scripts/add-standee-rotating.ts
 *   3. "พวงกุญแจ | Griptok | แม่เหล็ก ดุ๊กดิ๊ก" → สินค้า acrylic-dookdik (ทำไว้แล้ว)
 *
 * ราคาจากเว็บ (ต่อชิ้น = 1 ชุด) — 1-10 ชิ้น 350 · 11-29 ชิ้น 320 · 30-49 ชิ้น 310 · 50 ชิ้นขึ้นไป 300
 * สเปกใต้ตาราง: อะคริลิคหนาประมาณ 3 มม. (ได้เฉพาะอะคริลิคใส) · พิมพ์ระบบ UV
 *   ตัวสแตนดี้ และ กรอบ สกรีน 2 ด้าน · ฐาน(สกรีน) ขนาด 3-4 ซม. · อะคริลิคพิเศษหนา 2.5-3 มม.
 *   Add On เพิ่มขนาดอะคริลิค บวกเพิ่ม ซม.ละ 20 บาท (เท่ากันทุกช่วงจำนวน จึงเป็น option.extra ไม่ใช่แกนตาราง)
 *   11 ชิ้นขึ้นไป คละลาย คละขนาด สั่งขั้นต่ำ 5 ชิ้น++ ไม่ถึงตามจำนวน คิดตามราคาปลีก
 *
 * ภาพ (scripts/rotating-stand-frame-art.mjs) เก็บที่ storage `products/rotating-stand-frame/`
 * ไม่ใช่ `products/rotating-stand/` เพราะ path เดิมเคยมีไฟล์ของสินค้าอื่นอยู่ — CDN แคชชื่อไฟล์เดิมไว้
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  hasQuoteOption,
  priceRange,
  type PriceMatrix,
  type PriceTier,
  type Product,
  type ProductOption,
} from "../src/lib/products";
import { COLORS, acrylicColorImage } from "./acrylic-colors.mjs";

const WRITE = process.argv.includes("--write");
const UPLOAD = process.argv.includes("--upload");
const IMAGES_DIR = (process.argv.find((a) => a.startsWith("--images=")) || "").split("=")[1];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const ID = "rotating-stand";
const IMG_DIR = "rotating-stand-frame";
/**
 * รุ่นของไฟล์รูป — อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชของเก่าไว้) ขึ้นรุ่นใหม่ให้ขยับตัวนี้
 * ของจริงในฐานข้อมูลตอนนี้เป็น v2 แล้ว (ขยับด้วย scripts/repoint-product-images.mjs ตอนเปลี่ยนมาใช้มาสคอตเป็ด)
 */
const REV = "v2";
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${IMG_DIR}/${name}-${REV}.jpg`;

const UNIT = "ชิ้น";
const SIZE_ADD_LABEL = "เพิ่มขนาดอะคริลิค";
const ACRYLIC_LABEL = "ชนิดอะคริลิค";
const CLEAR = "อะคริลิคใส (มาตรฐาน)";
const SPECIAL = "อะคริลิคพิเศษ (สี/กลิตเตอร์/โฮโลแกรม)";
const COLOR_LABEL = "เลือกสีอะคริลิคพิเศษ";
/**
 * สีพิเศษ = ทั้งชาร์ตของร้าน (scripts/acrylic-colors.mjs)
 * สินค้านี้ราคาตามตารางได้เฉพาะ "อะคริลิคใส" เท่านั้น สีอื่นทั้งหมดจึงเป็นของพิเศษที่ร้านตีราคาให้
 */
const SPECIAL_COLORS: string[] = Object.keys(COLORS as Record<string, unknown>);
const SIZE_STD = "ขนาดมาตรฐาน";
const ADD_CM = [1, 2, 3, 4, 5];
const addName = (cm: number) => `เพิ่ม ${cm} ซม.`;

const TIERS: PriceTier[] = [
  { upTo: 10, label: "1-10 ชิ้น" },
  { upTo: 29, label: "11-29 ชิ้น" },
  { upTo: 49, label: "30-49 ชิ้น" },
  { upTo: null, label: "50 ชิ้นขึ้นไป" },
];

/** ตารางราคาคอลัมน์เดียว (ไม่มีแกนตัวเลือก) — ราคาต่อชุด ตามช่วงจำนวน */
const PRICING: PriceMatrix = {
  unit: UNIT,
  driverLabels: [],
  tiers: TIERS,
  cells: { "": [350, 320, 310, 300] },
};

const TABS: Product["tabs"] = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text:
      "Rotating Stand (สแตนดี้อะคริลิคหมุนๆ แบบมีกรอบ) — ชุดประกอบ 3 ส่วน: กรอบอะคริลิคทรงตั้ง + " +
      "ตัวสแตนดี้ที่แขวนหมุนอยู่กลางกรอบ + ฐานเสียบ · ราคาต่อ 1 ชุด รวมครบทุกส่วนแล้ว ไม่มีขั้นต่ำในการสั่งผลิต\n" +
      "• อะคริลิคหนาประมาณ 3 มม. (ได้เฉพาะอะคริลิคใส) · พิมพ์ระบบ UV เครื่องพิมพ์ญี่ปุ่น\n" +
      "• ตัวสแตนดี้ และ กรอบ สกรีน 2 ด้าน · ไดคัทตามแบบที่ออกแบบได้\n" +
      "• ฐาน (สกรีน) ขนาด 3-4 ซม. รวมอยู่ในราคาแล้ว\n" +
      "• อยากได้ใหญ่กว่ามาตรฐาน เลือก 'เพิ่มขนาดอะคริลิค' ได้ — บวกเพิ่ม ซม.ละ 20 บาท/ชิ้น\n" +
      "• อะคริลิคพิเศษ (สี/กลิตเตอร์/โฮโลแกรม) หนาประมาณ 2.5-3 มม. — เลือกได้ ทางร้านตีราคาให้\n" +
      "• จำนวน 1-10 ชิ้น เรทราคาปลีก คละลายได้ · 11 ชิ้นขึ้นไป คละลาย คละขนาด สั่งลายละ 5 ชิ้นขึ้นไป " +
      "(ไม่ถึงตามจำนวน คิดตามราคาปลีก)",
  },
  {
    title: "สเปกงาน",
    text:
      "ส่วนประกอบของชุด::\n" +
      "• กรอบอะคริลิค — สกรีน 2 ด้าน ไดคัทตามแบบ (ลายกรอบออกแบบเองได้ทั้งใบ)\n" +
      "• ตัวสแตนดี้ที่แขวนหมุนกลางกรอบ — สกรีน 2 ด้าน หมุนได้อิสระ\n" +
      "• ฐาน (สกรีน) ขนาด 3-4 ซม. — เสียบกรอบให้ตั้งได้\n\n" +
      "วัสดุ::\n" +
      "• อะคริลิคหนาประมาณ 3 มม. — ราคาตามตารางคืออะคริลิคใสเท่านั้น\n" +
      "• อะคริลิคพิเศษ (สี/กลิตเตอร์/โฮโลแกรม) หนาประมาณ 2.5-3 มม. คิดราคาเพิ่มตามขนาด\n" +
      "• งานสกรีนอะคริลิค โดยปกติทางร้านสกรีนใต้ (ยกเว้นโฮโลแกรม 01 / สีพิเศษ จะสกรีนบน) " +
      "หากต้องการสกรีนบนต้องแจ้งก่อน เพื่อเขียนกำกับไว้ที่บิล",
    images: [IMG("sizeadd-0"), IMG("gallery-4")],
    imageSize: "md" as const,
  },
  {
    title: "ชนิดอะคริลิค",
    text:
      "อะคริลิคใส (มาตรฐาน)::\n" +
      "• ราคาตามตารางคืออะคริลิคใส หนาประมาณ 3 มม.\n\n" +
      "อะคริลิคพิเศษ (สี / กลิตเตอร์ / โฮโลแกรม)::\n" +
      "• หนาประมาณ 2.5-3 มม. · บวกราคาเพิ่มตามขนาด — เลือกชนิดและสีที่ต้องการในหน้าสั่งซื้อได้เลย " +
      "แล้วทางร้านตีราคาให้ก่อนเริ่มผลิต\n" +
      "• ดูสีทั้งหมดได้จากตารางสีอะคริลิคของร้านด้านล่าง",
    images: [IMG("color-chart")],
    imageSize: "lg" as const,
  },
  {
    title: "วิธีสั่งงาน",
    text:
      "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
      '• เลือกขนาด (มาตรฐาน หรือเพิ่มขนาด) และชนิดอะคริลิค แล้วแนบภาพลาย (JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n' +
      '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ขนาดกรอบที่ต้องการเป็น ซม. · ลายกรอบ/ลายตัวแขวน · วันที่ต้องการใช้งาน\n' +
      "• สั่งหลายลาย ให้เพิ่มลงตะกร้าแยกรายการตามลาย (11 ชิ้นขึ้นไป สั่งลายละ 5 ชิ้นขึ้นไป)\n" +
      "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n" +
      "หรือสั่งทางอีเมล::\n" +
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n" +
      "• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n" +
      "• ระบุรายละเอียด: ขนาดกรอบ · ชนิดอะคริลิค · จำนวน · วันที่ใช้งาน (ถ้ามี)\n" +
      "• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
  },
  {
    title: "การเตรียมไฟล์",
    text:
      "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n" +
      "• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n" +
      "• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n" +
      "• แยกไฟล์ให้ชัดว่าอันไหน 'ลายกรอบ' อันไหน 'ตัวแขวนที่หมุน' — ทางร้านจะได้ประกอบถูก\n" +
      "• ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดความยาวแนวทแยง)\n" +
      "• งานสกรีนเต็มขอบ สีมีโอกาสหลุดลอกง่ายกว่าแบบปกติ",
  },
  {
    title: "การรับประกันสินค้า",
    text:
      "รับเคลม::\n" +
      "• สีเพี้ยนเกิน 10-15%\n" +
      "• จำนวนที่ได้รับไม่ครบถ้วน\n" +
      "• ชิ้นส่วนไม่ครบชุด (กรอบ / ตัวแขวน / ฐาน)\n" +
      "• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\n" +
      "ไม่รับเคลม::\n" +
      "• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n" +
      "• คราบกาวบริเวณจุดประกบ/จุดหมุน ซึ่งเป็นลักษณะปกติของงานและไม่มีผลกับการใช้งาน\n" +
      "• สินค้าชำรุดจากการใช้งานมาแล้ว\n\n" +
      "ระยะเวลาในการเคลม::\n" +
      "ภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
  },
];

const product: Product = {
  id: ID,
  slug: "rotating-stand",
  name: "Rotating Stand",
  category: "standee",
  price: 300,
  emoji: "🖼️",
  gradient: "from-sky-100 to-blue-200",
  imageSrc: IMG("gallery-1"),
  rating: 5,
  sold: 0,
  badge: "ใหม่",
  description:
    "Rotating Stand — สแตนดี้อะคริลิคหมุนๆ แบบมีกรอบ ชุดหนึ่งได้ครบ 3 ส่วน: กรอบอะคริลิคทรงตั้งสกรีน 2 ด้าน " +
    "ตัวสแตนดี้ที่แขวนหมุนได้อิสระอยู่กลางกรอบ และฐานสกรีนขนาด 3-4 ซม. " +
    "อะคริลิคหนาประมาณ 3 มม. พิมพ์ระบบ UV ไดคัทตามแบบที่ออกแบบเองได้ทั้งกรอบและตัวแขวน " +
    "อยากได้ใหญ่กว่ามาตรฐานก็เพิ่มขนาดได้ ซม.ละ 20 บาท ไม่มีขั้นต่ำในการสั่งผลิต " +
    "ยิ่งสั่งเยอะยิ่งถูก 50 ชิ้นขึ้นไปเหลือชิ้นละ 300 บาท",
  highlights: [
    "ชุดครบ 3 ส่วน — กรอบอะคริลิค + ตัวสแตนดี้แขวนหมุนกลางกรอบ + ฐานสกรีน 3-4 ซม.",
    "กรอบและตัวสแตนดี้ สกรีน 2 ด้าน ระบบ UV · ไดคัทตามแบบที่ออกแบบเอง",
    "อะคริลิคหนาประมาณ 3 มม. (ราคาตามตาราง = อะคริลิคใส)",
    "เพิ่มขนาดได้ตามต้องการ — ซม.ละ 20 บาท/ชิ้น พร้อมภาพเทียบขนาดทุกแบบ",
    "เลือกอะคริลิคพิเศษ (สี/กลิตเตอร์/โฮโลแกรม) ได้ ทางร้านตีราคาให้ก่อนผลิต",
    "ไม่มีขั้นต่ำ · 1-10 ชิ้นคละลายได้ · 11 ชิ้นขึ้นไปคละลาย คละขนาด ลายละ 5 ชิ้นขึ้นไป",
    "ยิ่งสั่งเยอะยิ่งถูก — 350 → 320 → 310 → 300 บาท/ชิ้น",
  ],
  images: [
    { emoji: "🖼️", gradient: "from-sky-100 to-blue-200", label: "Rotating Stand ชุดกรอบ + ตัวแขวนหมุน", src: IMG("gallery-1") },
    { emoji: "🦆", gradient: "from-sky-100 to-cyan-200", label: "มุมเฉียง — เห็นแกนแขวนและตัวสแตนดี้ในกรอบ", src: IMG("gallery-2") },
    { emoji: "✨", gradient: "from-blue-100 to-indigo-200", label: "งานจริงตั้งโชว์บนโต๊ะ", src: IMG("gallery-3") },
    { emoji: "🧩", gradient: "from-slate-100 to-sky-200", label: "แยกชิ้น — กรอบ · ตัวสแตนดี้ · ฐาน", src: IMG("gallery-4") },
    { emoji: "🔄", gradient: "from-cyan-100 to-sky-200", label: "ตัวสแตนดี้หมุนได้อิสระกลางกรอบ", src: IMG("gallery-5") },
    { emoji: "🌿", gradient: "from-teal-100 to-sky-200", label: "ลายกรอบออกแบบเองได้ทั้งใบ", src: IMG("gallery-6") },
  ],
  priceRates: [
    {
      id: "frame-set",
      label: "Rotating Stand (กรอบ + ตัวแขวน + ฐาน)",
      desc: "ราคาต่อ 1 ชุด รวมกรอบ ตัวสแตนดี้แขวนหมุน และฐานสกรีน 3-4 ซม. · สกรีน 2 ด้านทั้งกรอบและตัว",
      imageSrc: IMG("gallery-1"),
      freeMixBelowQty: 11,
      minPerDesign: 5,
      pricing: PRICING,
    },
  ],
  pricing: PRICING,
  options: [
    {
      label: SIZE_ADD_LABEL,
      choices: [
        { name: SIZE_STD, imageSrc: IMG("sizeadd-0") },
        ...ADD_CM.map((cm) => ({ name: addName(cm), extra: cm * 20, imageSrc: IMG(`sizeadd-${cm}`) })),
      ],
    },
    {
      label: ACRYLIC_LABEL,
      stockBearing: true,
      choices: [
        { name: CLEAR, imageSrc: IMG("acrylic-clear") },
        // เว็บบอกแค่ "อะคริลิคพิเศษหนา 2.5-3mm" ไม่มีตัวเลขบวกในตารางนี้ — ให้แอดมินตีราคา
        { name: SPECIAL, askPrice: true, imageSrc: IMG("acrylic-special") },
      ],
    },
    /*
     * เลือกอะคริลิคพิเศษแล้วต้องบอกได้ว่า "สีไหน" — เหมือนสินค้าอะคริลิคตัวอื่นของร้าน
     * ต่างกันตรงที่ตารางราคาหน้านี้ไม่มีตัวเลขบวกตามสี/ขนาด สีจึงไม่มี +฿ (ราคายังเป็น "รอแอดมินตีราคา"
     * จากชิป "อะคริลิคพิเศษ" อยู่แล้ว) — เก็บสีที่ลูกค้าเลือกติดไปกับออเดอร์ให้แอดมินตีราคาได้ตรงตัว
     */
    {
      label: COLOR_LABEL,
      display: "dropdown",
      stockBearing: true,
      showWhen: { label: ACRYLIC_LABEL, choices: [SPECIAL] },
      choices: SPECIAL_COLORS.map((name) => {
        const img = acrylicColorImage(name);
        return { name, ...(img ? { imageSrc: img } : {}) };
      }),
    } as ProductOption,
  ],
  terms: [
    "ราคาต่อ 1 ชุด รวมกรอบ + ตัวสแตนดี้แขวนหมุน + ฐาน(สกรีน) ขนาด 3-4 ซม. แล้ว",
    "อะคริลิคหนาประมาณ 3 มม. — ราคาตามตารางได้เฉพาะอะคริลิคใส",
    "เพิ่มขนาดอะคริลิคจากมาตรฐาน บวกเพิ่ม ซม.ละ 20 บาท/ชิ้น (ต้องการมากกว่า 5 ซม. แจ้งในหมายเหตุถึงร้าน)",
    "อะคริลิคพิเศษ (สี/กลิตเตอร์/โฮโลแกรม) หนาประมาณ 2.5-3 มม. บวกราคาเพิ่มตามขนาด — ทางร้านตีราคาให้ก่อนเริ่มผลิต",
    "จำนวน 11 ชิ้นขึ้นไป คละลาย คละขนาด สั่งขั้นต่ำลายละ 5 ชิ้น ไม่ถึงตามจำนวนคิดตามราคาปลีก",
    "ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดความยาวแนวทแยง)",
    "งานสกรีนอะคริลิค โดยปกติทางร้านสกรีนใต้ (ยกเว้นโฮโลแกรม 01 / สีพิเศษ จะสกรีนบน) หากต้องการสกรีนบนต้องแจ้ง",
    "ทางร้านใช้สีระบบ RGB สีงานสกรีนที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
    "ทางร้านมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องต่างกันประมาณ 5-10% หากผลิตคนละรอบ/คนละเครื่อง สีอาจไม่เท่ากัน",
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

const FILES = [
  ...Array.from({ length: 6 }, (_, i) => `gallery-${i + 1}`),
  ...Array.from({ length: 6 }, (_, i) => `sizeadd-${i}`),
  "acrylic-clear",
  "acrylic-special",
  "color-chart",
];

async function uploadImages() {
  if (!IMAGES_DIR) throw new Error("ต้องระบุ --images=<โฟลเดอร์> (รัน scripts/rotating-stand-frame-art.mjs ก่อน)");
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  for (const name of FILES) {
    const buf = await readFile(`${IMAGES_DIR.replace(/\/$/, "")}/${name}.jpg`);
    const { error } = await sb.storage
      .from("product-images")
      .upload(`products/${IMG_DIR}/${name}-${REV}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`${name}: ${error.message}`);
    console.log(`⬆️  ${name}-${REV}.jpg (${Math.round(buf.length / 1024)} KB)`);
  }
}

async function main() {
  if (UPLOAD) await uploadImages();

  console.log(`📦 ${saved.name} (${ID})`);
  console.log(
    `   ราคา ${range.min}-${range.max} บาท/${UNIT} · ตัวเลือก ${saved.options.length} กลุ่ม · รูป ${saved.images.length} ภาพ`
  );
  console.log(`   ตารางราคา: ${PRICING.cells[""].join(" / ")} (${TIERS.map((t) => t.label).join(" · ")})`);
  const choices = saved.options.flatMap((o) => o.choices);
  console.log(`   ตัวเลือกที่มีภาพประกอบ: ${choices.filter((c) => c.imageSrc).length}/${choices.length} ตัว`);
  console.log(`   แท็บ: ${(saved.tabs ?? []).map((t) => t.title).join(" · ")}`);

  if (!WRITE) {
    console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
    return;
  }

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
  if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);
  console.log(`\n✅ บันทึกแล้ว: ${ID} (sort ${sort}) — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
