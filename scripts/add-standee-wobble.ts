/**
 * สินค้า "สแตนดี้โยกเยก" — ดึงราคาจากเว็บตารางราคา
 * iduckyofficial-pricelists.com/standeewobbles
 *
 *   npx tsx scripts/add-standee-wobble.ts                                   # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   npx tsx scripts/add-standee-wobble.ts --upload --images=<dir>           # อัปภาพขึ้น Supabase Storage
 *   npx tsx scripts/add-standee-wobble.ts --write                           # เขียนลง Supabase (คงสถานะฉบับร่าง)
 *
 * ราคาจากเว็บ (ตารางที่ 1 — Pricelist ราคาส่ง):
 *   1-10 ชิ้น 350 · 11-29 340 · 30-49 320 · 50-199 300 · 200-499 290 · 500+ 280
 * ขนาด: เริ่ม 10 ซม. ไม่เกิน 15 ซม. — ตั้งแต่ 11 ซม. ขึ้นไป บวกเพิ่ม ซม. ละ 10 บาท/ชิ้น
 * Add on อะคริลิคพิเศษ (ตารางที่ 2) — คิดต่อ "ชิ้นอะคริลิค" ตามขนาด:
 *   10 ซม. +10 · 11 +15 · 12 +20 · 13 +25 · 14 +30 · 15 +35
 *   (เรทปลีกกับเรทส่งต่างกันเฉพาะขนาด 2-9 ซม. ซึ่งสินค้านี้ทำไม่ได้ — ช่วง 10-15 ซม. ตัวเลขเท่ากันทั้งสองเรท)
 * เงื่อนไขใต้ตาราง: 1-10 ชิ้น คละดีเทลได้ไม่จำกัด · 11 ชิ้นขึ้นไป คละลาย/คละขนาด สั่งลายละ 5 ชิ้นขึ้นไป
 *
 * ภาพ: เตรียมด้วย scripts/standee-wobble-art.mjs (งานจริง 9 · สีอะคริลิค 36 · ภาพวาดตัวเลือก 8)
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { hasQuoteOption, priceRange, type Product, type ProductOption } from "../src/lib/products";
// @ts-expect-error — สคริปต์ JS ล้วน (ภาพสีอะคริลิคชุดกลางของทั้งระบบ)
import { acrylicColorImage } from "./acrylic-colors.mjs";

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

const ID = "new-mszsx3ql-5569";
/** ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ขึ้นรุ่นใหม่ให้ขยับ v1 → v2 */
const REV = "v1";
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}-${REV}.jpg`;

/** ภาพงานจริงที่อัปขึ้นคลัง (9 ใบ) */
const PHOTOS = ["gallery-1", "gallery-2", "gallery-3", "gallery-4", "gallery-5", "gallery-6", "gallery-7", "gallery-8", "gallery-9"];
/**
 * แกลเลอรีเก็บได้สูงสุด 5 รูป — หน้าแก้ไขสินค้าหลังบ้าน (ProductEditor MAX_PHOTOS) ตัดที่ 5
 * ใส่เกินไว้ = ทีมงานเปิดหน้าแก้ไขแล้วกดบันทึกครั้งเดียว รูปที่เกินหายทันที
 * เลือกไว้ 5 ใบที่ต่างแบบกัน (สีมาตรฐาน · กลิตเตอร์ · โฮโลแกรม · งานเซ็ต)
 */
const GALLERY = ["gallery-1", "gallery-2", "gallery-4", "gallery-6", "gallery-9"];
const SIZES = [10, 11, 12, 13, 14, 15];
/** ค่าอะคริลิคพิเศษต่อ 1 ชิ้นอะคริลิค ตามขนาด (ตารางที่ 2 ของเว็บ) */
const SPECIAL_FEE: Record<number, number> = { 10: 10, 11: 15, 12: 20, 13: 25, 14: 30, 15: 35 };
const SIZE_LABEL = (cm: number) => `${cm} ซม.`;

/** สีอะคริลิคพิเศษ (ตามชาร์ต "อะคริลิคสีพิเศษ" ของร้าน) — ภาพมาจากชุดกลาง scripts/acrylic-colors.mjs */
const SPECIAL_COLORS = [
  "อะคริลิคใสขุ่น C-01",
  "อะคริลิคกลิตเตอร์-เงิน",
  "อะคริลิคกลิตเตอร์-ทอง",
  "อะคริลิคกลิตเตอร์-รุ้ง",
  "อะคริลิคกระจก",
  "hologram-01",
  "hologram-02",
  "hologram-รุ้ง",
  "hologram-จุด",
  "hologram-หิมะ",
  "hologram-ดาว",
  "hologram-Stardust",
  "hologram-Dust",
  "hologram-หัวใจ",
  "อะคริลิคสีขาว (W)",
  "อะคริลิคสีฟ้า (B)",
  "อะคริลิคสีชมพู (P)",
  "อะคริลิคสีเหลือง (Y)",
  "อะคริลิคสีส้ม (OR)",
  "อะคริลิคสีส้มอ่อน (OR-02)",
  "อะคริลิคสีเขียว (GR)",
  "อะคริลิคสีแดง (R)",
  "อะคริลิคสีเทา (G)",
  "อะคริลิคสีดำ (BK)",
  "อะคริลิคสีครีม",
  "อะคริลิคสีเลมอน (603)",
  "อะคริลิคสีไข่แดง (605)",
  "อะคริลิคสีส้มแดง (606)",
  "อะคริลิคสีน้ำตาล (611)",
  "อะคริลิคสีทอง (626)",
  "อะคริลิคสีมัสตาร์ด (235)",
  "อะคริลิคสีเหลืองเข้ม (206)",
  "อะคริลิคสีเทามุก (621)",
  "อะคริลิคสีท้องฟ้า (612)",
  "อะคริลิคสีน้ำเงิน (619)",
  "อะคริลิคสีกุหลาบแดง (601)",
  "อะคริลิคสีหญ้าเขียว (610)",
  "อะคริลิคสีแอปเปิ้ลเขียว (622)",
  "อะคริลิคสีม่วง (137)",
  "อะคริลิคสีกุหลาบชมพู",
  "อะคริลิคสีกากเพชรเงิน",
  "อะคริลิคสีกากเพชรโรสโกลด์",
  "อะคริลิคสีกากเพชรสีแดง",
  "อะคริลิคสีกากเพชรสีม่วง",
];

const FILES = [...PHOTOS, ...SIZES.map((cm) => `size-${cm}`), "part-figure", "part-base"];

const SPECIAL = "อะคริลิคพิเศษ (สี / กลิตเตอร์ / โฮโลแกรม)";

const options: ProductOption[] = [
  {
    label: "ขนาด",
    choices: SIZES.map((cm) => ({
      name: SIZE_LABEL(cm),
      ...(cm > 10 ? { extra: (cm - 10) * 10 } : {}),
      imageSrc: IMG(`size-${cm}`),
    })),
  },
  {
    label: "สีอะคริลิค",
    choices: [
      { name: "อะคริลิคใส" },
      { name: "อะคริลิคขาวขุ่น C-02", imageSrc: acrylicColorImage("อะคริลิคขาวขุ่น C-02") },
      { name: SPECIAL, imageSrc: acrylicColorImage("hologram-รุ้ง") },
    ],
  },
  {
    label: "เลือกสีพิเศษ",
    display: "dropdown",
    showWhen: { label: "สีอะคริลิค", choices: [SPECIAL] },
    choices: SPECIAL_COLORS.map((name) => {
      const img = acrylicColorImage(name);
      return { name, ...(img ? { imageSrc: img } : {}) };
    }),
  },
  // ค่าอะคริลิคพิเศษต่างกันตามขนาด → แยกกลุ่มต่อขนาด แล้วโชว์ทีละกลุ่มด้วย showWhen
  ...SIZES.map(
    (cm): ProductOption => ({
      label: `เพิ่มอะคริลิคพิเศษ (ขนาด ${SIZE_LABEL(cm)})`,
      display: "multi",
      showWhen: { label: "ขนาด", choices: [SIZE_LABEL(cm)] },
      showWhenAlso: { label: "สีอะคริลิค", choices: [SPECIAL] },
      choices: [
        { name: "ตัวกลาง", extra: SPECIAL_FEE[cm], imageSrc: IMG("part-figure") },
        { name: "ฐานโยกเยก", extra: SPECIAL_FEE[cm], imageSrc: IMG("part-base") },
      ],
    })
  ),
];

const TIERS = [
  { upTo: 10, label: "1-10 ชิ้น" },
  { upTo: 29, label: "11-29 ชิ้น" },
  { upTo: 49, label: "30-49 ชิ้น" },
  { upTo: 199, label: "50-199 ชิ้น" },
  { upTo: 499, label: "200-499 ชิ้น" },
  { upTo: null, label: "500 ชิ้นขึ้นไป" },
];
const PRICES = [350, 340, 320, 300, 290, 280];

const pricing = { unit: "ชิ้น", driverLabels: [], tiers: TIERS, cells: { "": PRICES } };

const seo = {
  title: "รับทำสแตนดี้โยกเยก อะคริลิค พิมพ์ลายตามสั่ง เริ่มต้น 280 บาท",
  description:
    "รับผลิตสแตนดี้โยกเยกอะคริลิค พิมพ์ UV ลายของคุณเอง — ตัวกลางสกรีน 2 ด้าน ฐานโยกเยกสกรีน 1 ด้าน " +
    "ทำขนาด 10-15 ซม. เลือกอะคริลิคพิเศษได้ทั้งกลิตเตอร์/โฮโลแกรม/สี · 1-10 ชิ้นไม่มีขั้นต่ำ ส่งไวทั่วไทย",
  keywords: [
    "สแตนดี้โยกเยก",
    "รับทำสแตนดี้โยกเยก",
    "สแตนดี้อะคริลิค",
    "standee wobble",
    "อะคริลิคโยกเยก",
    "สแตนดี้ตั้งโต๊ะ",
    "รับผลิตสแตนดี้",
    "พิมพ์ลายตามสั่ง",
    "อะคริลิคโฮโลแกรม",
    "iDucky",
  ],
  faqs: [
    { q: "สแตนดี้โยกเยก ราคาเท่าไหร่?", a: "เริ่มชิ้นละ 350 บาท (1-10 ชิ้น) ลดตามจำนวน — 11-29 ชิ้น 340 · 30-49 ชิ้น 320 · 50-199 ชิ้น 300 · 200-499 ชิ้น 290 · 500 ชิ้นขึ้นไป 280 บาท" },
    { q: "ทำขนาดเท่าไหร่ได้บ้าง?", a: "ขนาดเริ่มที่ 10 ซม. ทำได้ไม่เกิน 15 ซม. (นับรวมตัวกลางกับฐานโยกเยก วัดจากด้านที่ยาวที่สุด) ตั้งแต่ 11 ซม. ขึ้นไป บวกเพิ่ม ซม. ละ 10 บาทต่อชิ้น" },
    { q: "สกรีนกี่ด้าน?", a: "ตัวกลางสกรีน 2 ด้าน · ฐานโยกเยกสกรีน 1 ด้าน อะคริลิคหนาประมาณ 3 มม. พิมพ์ระบบ UV" },
    { q: "ใช้อะคริลิคสีพิเศษได้ไหม?", a: "ได้ครับ มีทั้งกลิตเตอร์ โฮโลแกรม กระจก และอะคริลิคสีกว่า 40 แบบ คิดเพิ่มตามขนาดและจำนวนชิ้นที่เปลี่ยน (ขนาด 10 ซม. +10 บาท/ชิ้น ถึง 15 ซม. +35 บาท/ชิ้น) อะคริลิคพิเศษหนาประมาณ 2.5-3 มม." },
    { q: "สั่งขั้นต่ำกี่ชิ้น คละลายได้ไหม?", a: "1-10 ชิ้นไม่มีขั้นต่ำ คละดีเทลได้ไม่จำกัด · ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย/คละขนาดได้ โดยสั่งลายละ 5 ชิ้นขึ้นไป ถ้าไม่ถึงจำนวนคิดตามราคาปลีก" },
    { q: "รับทำเป็นลายของตัวเองได้ไหม?", a: "ได้ครับ ส่งไฟล์ .Ai .Psd .Png พื้นหลังใส มาตอนสั่งซื้อ ทีมงานจัดทำแบบให้ตรวจและอนุมัติก่อนเริ่มผลิตทุกครั้ง" },
  ],
};

const product: Product = {
  id: ID,
  slug: "สแตนดี้โยกเยก",
  name: "สแตนดี้โยกเยก",
  category: "standee",
  price: PRICES[0],
  emoji: "🎠",
  gradient: "from-sky-200 to-cyan-300",
  imageSrc: IMG("gallery-1"),
  seo,
  rating: 5,
  sold: 0,
  hidden: true,
  description:
    "สแตนดี้โยกเยก อะคริลิคหนาประมาณ 3 มม. พิมพ์ UV — ตัวกลางสกรีน 2 ด้าน ฐานโยกเยกสกรีน 1 ด้าน วางแล้วโยกไปมาได้ " +
    "ทำขนาด 10-15 ซม. · เรทราคาปลีก 1-10 ชิ้น ไม่มีขั้นต่ำในการสั่งผลิต",
  highlights: [
    "ตัวกลาง สกรีน 2 ด้าน + ฐานโยกเยก สกรีน 1 ด้าน",
    "อะคริลิคหนา ~3 มม. · UV Printing",
    "1-10 ชิ้น ไม่มีขั้นต่ำ คละดีเทลได้ไม่จำกัด",
  ],
  terms: [
    "ขนาดสแตนดี้เริ่มที่ 10 ซม. และทำได้ไม่เกิน 15 ซม. (ตัวกลาง และ ฐานโยกเยก) — ตั้งแต่ 11 ซม. ขึ้นไป บวกเพิ่ม ซม. ละ 10 บาทต่อชิ้น",
    "ตัวกลาง สกรีน 2 ด้าน | ตัวฐานโยกเยก สกรีน 1 ด้าน",
    "อะคริลิคพิเศษจะมีความหนาประมาณ 2.5-3 มม.",
    "จำนวน 11 ชิ้นขึ้นไป คละลาย คละขนาด สั่งขั้นต่ำ 5 ชิ้น++ | อะไหล่ คละแบบ คละสี สั่งขั้นต่ำ 5 ชิ้น++ ไม่ถึงตามจำนวน คิดตามราคาปลีก",
    "ราคา 1-10 ชิ้น สามารถคละดีเทลได้ไม่จำกัด",
  ].join("\n"),
  options,
  images: GALLERY.map((g) => ({ src: IMG(g), emoji: "🎠", label: "", gradient: "from-sky-200 to-cyan-300" })),
  pricing,
  priceRates: [
    {
      id: "r1",
      label: "เรทที่ 1",
      desc: "ตัวกลาง สกรีน 2 ด้าน · ฐานโยกเยก สกรีน 1 ด้าน · อะคริลิคหนา ~3 มม.",
      minQty: 11,
      minPerDesign: 5,
      freeMixBelowQty: 11,
      pricing,
    },
  ],
  tierByDesign: true,
  bulkAskQty: 20,
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: [
        "• ขนาดสแตนดี้เริ่มที่ 10 ซม. ทำได้ไม่เกิน 15 ซม. (ตัวกลาง และ ฐานโยกเยก) ตั้งแต่ 11 ซม. ขึ้นไป บวกเพิ่ม ซม. ละ 10 บาทต่อชิ้น",
        "• ตัวกลาง สกรีน 2 ด้าน | ตัวฐานโยกเยก สกรีน 1 ด้าน",
        "• อะคริลิคพิเศษจะมีความหนาประมาณ 2.5-3 มม.",
        "• จำนวน 11 ชิ้นขึ้นไป คละลาย คละขนาด สั่งขั้นต่ำ 5 ชิ้น++ | อะไหล่ คละแบบ คละสี สั่งขั้นต่ำ 5 ชิ้น++ ไม่ถึงตามจำนวน คิดตามราคาปลีก",
        "• ราคา 1-10 ชิ้น สามารถคละดีเทลได้ไม่จำกัด",
        "• ไฟล์ นามสกุล .Ai .Psd .Png  หรือพื้นหลังใส",
        "• งานสกรีนเต็มขอบ สีมีโอกาสหลุดลอกง่ายกว่าแบบปกติ",
        "• ทางร้านจะมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องจะให้ความแตกต่างประมาณ 5-10% มีโอกาสที่สีแต่ละรอบไม่เหมือนกัน หากผลิตคนละเครื่อง",
        "• ทางร้านใช้สี R G B สีงานสกรีนที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
        "• ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดความยาวแนวแทยง)",
        "• งานสกรีนอะคริลิค โดยปกติทางร้านจะสกรีนใต้(ยกเว้นอคล.โฮโลแกรม01 /สีพิเศษ จะสกรีนบน) หากต้องการสกรีนบนต้องแจ้ง เพื่อทางร้านจะเขียนกำกับไว้ให้ที่บิล (หากที่บิลไม่มีเขียนกำกับว่าสกรีนให้แจ้งทันที)",
      ].join("\n"),
    },
    {
      title: "วิธีสั่งงาน",
      text:
        "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
        '• เลือกจำนวนและตัวเลือกที่ต้องการ แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"\n' +
        '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ขนาด/รุ่นที่ต้องการ · วันที่ต้องการใช้งาน\n' +
        "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n" +
        "หรือสั่งทางอีเมล::\n" +
        "• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n" +
        "• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n" +
        "• ระบุรายละเอียด: สินค้า/ขนาดที่เลือก · รายละเอียดเพิ่มเติม (ถ้ามี) · จำนวน · วันที่ใช้งาน (ถ้ามี)\n" +
        "• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
    },
    {
      title: "การเตรียมไฟล์",
      text:
        "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n" +
        "• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n" +
        "• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n" +
        "• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด",
    },
    {
      title: "การรับประกันสินค้า",
      text:
        "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• สีอะคริลิค หรือ อะไหล่ ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\n" +
        "ไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\n" +
        "ระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    },
  ],
};

const range = priceRange(product);
const saved: Product = {
  ...product,
  ...(hasQuoteOption(product) ? { quoteOption: true } : {}),
  priceMin: range.min,
  priceMax: range.max,
  savedAt: new Date().toISOString(),
};

const sb = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function uploadImages() {
  if (!IMAGES_DIR) throw new Error("ต้องระบุ --images=<โฟลเดอร์ที่เตรียมไฟล์ไว้>");
  const c = sb();
  let kb = 0;
  for (const name of FILES) {
    const buf = await readFile(`${IMAGES_DIR.replace(/\/$/, "")}/${name}.jpg`);
    const { error } = await c.storage
      .from("product-images")
      .upload(`products/${ID}/${name}-${REV}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`${name}: ${error.message}`);
    kb += buf.length / 1024;
  }
  console.log(`⬆️  อัปโหลด ${FILES.length} ภาพ (${Math.round(kb)} KB) → products/${ID}/*-${REV}.jpg`);
}

async function main() {
  if (UPLOAD) await uploadImages();

  const allChoices = saved.options.flatMap((o) => o.choices);
  console.log(`📦 ${saved.name} (${ID}) · ${saved.category}`);
  console.log(`   ราคา ${range.min}-${range.max} บาท/ชิ้น · ตัวเลือก ${saved.options.length} กลุ่ม · รูปแกลเลอรี ${saved.images.length} ภาพ`);
  console.log(`   ตารางราคา: ${TIERS.map((t, i) => `${t.label} ${PRICES[i]}`).join(" · ")}`);
  console.log(`   ตัวเลือกที่มีภาพประกอบ: ${allChoices.filter((c) => c.imageSrc).length}/${allChoices.length} ตัว`);
  console.log(`   แท็บ: ${(saved.tabs ?? []).map((t) => t.title).join(" · ")}`);

  if (!WRITE) {
    console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
    return;
  }
  const c = sb();
  const { data: cur } = await c.from("products").select("sort").eq("id", ID).maybeSingle();
  const { error } = await c.from("products").upsert(
    {
      id: saved.id,
      name: saved.name,
      category: saved.category,
      price: saved.price,
      sold: saved.sold,
      featured: false,
      badge: saved.badge ?? null,
      ...(typeof cur?.sort === "number" ? { sort: cur.sort } : {}),
      data: saved,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);
  console.log(`\n✅ บันทึกแล้ว: ${ID} — ยังเป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
