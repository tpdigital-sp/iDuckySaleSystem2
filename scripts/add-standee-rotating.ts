/**
 * สร้างสินค้า "สแตนดี้อะคริลิค หมุนได้" จากตารางราคาเว็บ
 * iduckyofficial-pricelists.com/acrylicrotatingstand — บล็อก "สแตนดี้อะคริลิค หมุนได้"
 *
 * ⚠️ อย่าสับสนกับบล็อก "Rotating Stand" ของหน้าเดียวกัน (ตาราง 350/320/310/300)
 *   อันนั้นเป็นชุด "กรอบอะคริลิค + ตัวสแตนดี้แขวนหมุนในกรอบ" คนละสินค้า → scripts/add-rotating-stand-frame.ts
 *
 *   npx tsx scripts/add-standee-rotating.ts                              # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   node scripts/standee-rotating-art.mjs                                # เตรียมภาพ (ภาพงานจริง + ภาพประกอบตัวเลือก)
 *   npx tsx scripts/add-standee-rotating.ts --upload --images=.cache/rot/upload
 *   npx tsx scripts/add-standee-rotating.ts --write                      # เขียนลง Supabase (เป็นฉบับร่าง)
 *
 * ราคาจากเว็บ — ตาราง "สแตนดี้อะคริลิค หมุนได้ · ราคาสแตนดี้ รวมราคาฐาน (สกรีน 2 ด้าน / ไม่สกรีนฐาน)"
 *   ขนาด        5    6    7    8    9   10   11   12 cm
 *   1-10 ชิ้น  170  180  190  200  210  220  230  240
 *   11-29      95  100  105  125  145  155  165  175
 *   30-49      90   95  100  120  140  150  160  170
 *   50-199     85   90   95  115  135  145  155  165
 *   200+       80   85   90  110  130  140  150  160
 *
 * ของที่เว็บคิดเพิ่ม เข้ามาเป็น "แกนที่ 2/3" ของตารางราคา เพราะค่าบวกไม่เท่ากันทุกช่วงจำนวน:
 *   • ฐานมาตรฐาน 3-5 ซม. เกินจากนั้นบวกตาม ซม. — เรทปลีก (1-10 ชิ้น) ซม.ละ 15 · เรทส่ง ซม.ละ 10
 *   • ฐานสกรีนลาย บวกตามขนาดฐาน — 5-6 ซม. +10 · 7-8 ซม. +15 · 9-10 ซม. +20 · 11-12 ซม. +25
 *   ส่วนที่บวกเท่ากันทุกช่วง (ฐานไดคัทตามทรง +10) เก็บเป็น option.extra ตามปกติ
 *
 * สเปกงานจากใต้ตารางในเว็บ: ตัวสแตนดี้อะคริลิคหนา 3 มม. สกรีน 2 ด้าน · ฐานอะคริลิคใสหนา 5 มม.
 *   แกนหมุน 13 มม. · ฐานทรงกลม/ทรงสี่เหลี่ยมไม่บวกเพิ่ม · 11 ชิ้นขึ้นไปคละลายได้ ลายละ 5 ชิ้นขึ้นไป
 *
 * ภาพประกอบทุกตัวเลือก (สร้างด้วย scripts/standee-rotating-art.mjs):
 *   gallery-1..8   ภาพงานจริงจากหน้าเว็บตารางราคา (ฐานกลมฟ้า/แดง · ฐานไดคัททรงดอกไม้ · อะคริลิคกลิตเตอร์ · แกนหมุน)
 *   size-5..12     ภาพเทียบขนาดตัวสแตนดี้ (สเกลจริง มีเงาตัว 12 ซม. ไว้เทียบ)
 *   basesize-5..12 ภาพขนาดฐานมองจากด้านบน เทียบกับฐานมาตรฐาน 5 ซม.
 *   baseshape-*    ทรงฐาน กลม / สี่เหลี่ยม / ไดคัทตามทรง · basescreen-* ฐานสกรีนลาย/ไม่สกรีน
 *   color-chart    ตารางสีอะคริลิคของร้าน (หน้า coloracrylic) ใช้ในแท็บ "ชนิดอะคริลิค"
 *   ⚠️ อัปภาพใหม่ทับ "ชื่อไฟล์เดิม" ไม่ได้ — Next/CDN แคชของเก่าไว้ ต้องตั้งชื่อไฟล์ใหม่เสมอ
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { hasQuoteOption, priceRange, type PriceMatrix, type PriceTier, type Product } from "../src/lib/products";

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

const ID = "standee-rotating";
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}.jpg`;

const UNIT = "ชิ้น";
const SIZE_LABEL = "ขนาดตัวสแตนดี้";
const BASE_SIZE_LABEL = "ขนาดฐาน";
const BASE_SCREEN_LABEL = "สกรีนลายฐาน";
const BASE_SHAPE_LABEL = "ทรงฐาน";
const ACRYLIC_LABEL = "ชนิดอะคริลิคตัวสแตนดี้";

const SIZE_CM = [5, 6, 7, 8, 9, 10, 11, 12];
const BASE_CM = [5, 6, 7, 8, 9, 10, 11, 12];
const sizeName = (cm: number) => `${cm} ซม.`;
const baseName = (cm: number) => (cm === 5 ? "3-5 ซม. (มาตรฐาน)" : `${cm} ซม.`);

const SCREEN_NO = "ไม่สกรีนฐาน";
const SCREEN_YES = "สกรีนลายฐาน";

const TIERS: PriceTier[] = [
  { upTo: 10, label: "1-10 ชิ้น" },
  { upTo: 29, label: "11-29 ชิ้น" },
  { upTo: 49, label: "30-49 ชิ้น" },
  { upTo: 199, label: "50-199 ชิ้น" },
  { upTo: null, label: "200 ชิ้นขึ้นไป" },
];

/** ราคาตัวสแตนดี้ (รวมฐานมาตรฐาน) ตามขนาด × ช่วงจำนวน — ตัวเลขตรงตามตารางในเว็บ */
const STAND: Record<number, number[]> = {
  5: [170, 95, 90, 85, 80],
  6: [180, 100, 95, 90, 85],
  7: [190, 105, 100, 95, 90],
  8: [200, 125, 120, 115, 110],
  9: [210, 145, 140, 135, 130],
  10: [220, 155, 150, 145, 140],
  11: [230, 165, 160, 155, 150],
  12: [240, 175, 170, 165, 160],
};

/** ฐานใหญ่กว่ามาตรฐาน 5 ซม. — เรทปลีก (ช่วงแรก) ซม.ละ 15 · เรทส่ง ซม.ละ 10 */
const baseOverFee = (baseCm: number, tierIndex: number) => Math.max(0, baseCm - 5) * (tierIndex === 0 ? 15 : 10);

/** ฐานสกรีนลาย บวกเพิ่มตามขนาดฐาน (เท่ากันทุกช่วงจำนวน) */
const baseScreenFee = (baseCm: number) => (baseCm <= 6 ? 10 : baseCm <= 8 ? 15 : baseCm <= 10 ? 20 : 25);

const PRICING: PriceMatrix = {
  unit: UNIT,
  driverLabels: [SIZE_LABEL, BASE_SIZE_LABEL, BASE_SCREEN_LABEL],
  tiers: TIERS,
  cells: Object.fromEntries(
    SIZE_CM.flatMap((cm) =>
      BASE_CM.flatMap((baseCm) =>
        [SCREEN_NO, SCREEN_YES].map((screen) => [
          `${sizeName(cm)}│${baseName(baseCm)}│${screen}`,
          STAND[cm].map(
            (price, ti) => price + baseOverFee(baseCm, ti) + (screen === SCREEN_YES ? baseScreenFee(baseCm) : 0)
          ),
        ])
      )
    )
  ),
};

const TABS: Product["tabs"] = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text:
      "สแตนดี้อะคริลิค หมุนได้ — ตัวสแตนดี้เสียบบนแกนหมุน หมุนได้รอบตัว 360° " +
      "ราคาในตารางรวมค่าฐานเรียบร้อยแล้ว ไม่มีขั้นต่ำในการสั่งผลิต\n" +
      "• ตัวสแตนดี้: อะคริลิคหนา 3 มม. · สกรีน 2 ด้าน · ไดคัทตามรูปทรงที่ออกแบบได้\n" +
      "• ฐาน: อะคริลิคใสหนา 5 มม. (อะคริลิคใสเท่านั้น) · ขนาดมาตรฐาน 3-5 ซม.\n" +
      "• แกนหมุน: ขนาด 13 มม. · จุดหมุนแกนกลางบนตัวสแตนดี้เป็นทรงกลมขนาด 1 ซม.\n" +
      "• ฐานทรงกลมและทรงสี่เหลี่ยมไม่คิดเพิ่ม · ไดคัทตามทรงอื่นคิดเพิ่ม 10 บาท/ชิ้น\n" +
      "• จำนวน 1-10 ชิ้น คละลายได้อิสระ · 11 ชิ้นขึ้นไป คละลาย/คละขนาด สั่งลายละ 5 ชิ้นขึ้นไป " +
      "(ไม่ถึงตามจำนวน คิดตามราคาปลีก)\n\n" +
      "ส่วนที่คิดเพิ่มจากราคาในตาราง::\n" +
      "• ฐานใหญ่กว่า 5 ซม. — เรทราคาปลีก (1-10 ชิ้น) บวก ซม.ละ 15 บาท · เรทราคาส่ง (11 ชิ้นขึ้นไป) บวก ซม.ละ 10 บาท\n" +
      "• ฐานสกรีนลาย — ฐาน 5-6 ซม. +10 · 7-8 ซม. +15 · 9-10 ซม. +20 · 11-12 ซม. +25 บาท/ชิ้น\n" +
      "• ฐานไดคัทตามทรง +10 บาท/ชิ้น (ทรงกลม/ทรงสี่เหลี่ยม ไม่บวกเพิ่ม)\n" +
      "• ตัวสแตนดี้อะคริลิคพิเศษ (สี/กลิตเตอร์/โฮโลแกรม) บวกเพิ่มตามขนาด — แจ้งขนาดที่ต้องการ ทางร้านตีราคาให้",
  },
  {
    title: "ขนาดและสเปกงาน",
    text:
      "ตัวสแตนดี้::\n" +
      "• เลือกได้ตั้งแต่ 5 ถึง 12 ซม. (วัดจากด้านที่ยาวที่สุด ไม่วัดความยาวแนวทแยง)\n" +
      "• อะคริลิคหนา 3 มม. · สกรีน 2 ด้าน (แผ่นหน้า-แผ่นหลัง)\n" +
      "• อะคริลิคพิเศษจะมีความหนาประมาณ 2.5-3 มม.\n\n" +
      "ฐานและแกนหมุน::\n" +
      "• ฐานอะคริลิคใส หนา 5 มม. — ขนาดมาตรฐาน 3-5 ซม. ใหญ่กว่านั้นบวกเพิ่มตาม ซม.\n" +
      "• ทรงฐาน: ทรงกลม / ทรงสี่เหลี่ยม (ไม่บวกเพิ่ม) · ไดคัทตามทรงอื่น +10 บาท/ชิ้น\n" +
      "• ฐานสกรีนลายได้ คิดเพิ่มตามขนาดฐาน\n" +
      "• แกนหมุนขนาด 13 มม. — จุดหมุนแกนกลางบนตัวสแตนดี้เป็นทรงกลมขนาด 1 ซม.",
    images: [IMG("size-12"), IMG("basesize-5"), IMG("baseshape-diecut")],
    imageSize: "md" as const,
  },
  {
    title: "ชนิดอะคริลิค",
    text:
      "อะคริลิคใส (มาตรฐาน)::\n" +
      "• ราคาตามตารางคืออะคริลิคใส · ฐานเป็นอะคริลิคใสเท่านั้น\n" +
      "• งานสกรีนอะคริลิค โดยปกติทางร้านสกรีนใต้ หากต้องการสกรีนบนต้องแจ้งก่อน เพื่อเขียนกำกับไว้ที่บิล\n\n" +
      "อะคริลิคพิเศษ (สี / กลิตเตอร์ / โฮโลแกรม)::\n" +
      "• ใช้กับ 'ตัวสแตนดี้' ได้ บวกราคาเพิ่มตามขนาด — เลือกในหน้าสั่งซื้อแล้วทางร้านตีราคาให้\n" +
      "• ความหนาประมาณ 2.5-3 มม.\n" +
      "• อะคริลิคโฮโลแกรม 01 และสีพิเศษ ทางร้านจะสกรีนบน (เพื่อให้เห็นสีของอะคริลิค)\n" +
      "• ดูสีทั้งหมดได้จากตารางสีอะคริลิคของร้าน",
    images: [IMG("color-chart")],
    imageSize: "lg" as const,
  },
  {
    title: "วิธีสั่งงาน",
    text:
      "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
      "• เลือกขนาดตัวสแตนดี้ · ขนาดฐาน · ทรงฐาน · จะสกรีนลายฐานหรือไม่ แล้วแนบภาพลาย " +
      '(ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n' +
      '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ลายฐาน · สีอะคริลิคพิเศษที่ต้องการ · วันที่ต้องการใช้งาน\n' +
      "• สั่งหลายลาย ให้เพิ่มลงตะกร้าแยกรายการตามลาย (11 ชิ้นขึ้นไป สั่งลายละ 5 ชิ้นขึ้นไป)\n" +
      "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n" +
      "หรือสั่งทางอีเมล::\n" +
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n" +
      "• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n" +
      "• ระบุรายละเอียด: ขนาดตัวสแตนดี้ · ขนาด/ทรงฐาน · สกรีนฐานหรือไม่ · จำนวน · วันที่ใช้งาน (ถ้ามี)\n" +
      "• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
  },
  {
    title: "การเตรียมไฟล์",
    text:
      "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n" +
      "• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n" +
      "• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n" +
      "• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด\n" +
      "• ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดความยาวแนวทแยง)\n" +
      "• เผื่อพื้นที่จุดหมุนแกนกลางบนตัวสแตนดี้เป็นทรงกลมขนาด 1 ซม. — เลี่ยงวางรายละเอียดสำคัญตรงจุดนั้น\n" +
      "• งานสกรีนเต็มขอบ สีมีโอกาสหลุดลอกง่ายกว่าแบบปกติ",
  },
  {
    title: "การรับประกันสินค้า",
    text:
      "รับเคลม::\n" +
      "• สีเพี้ยนเกิน 10-15%\n" +
      "• จำนวนที่ได้รับไม่ครบถ้วน\n" +
      "• ขนาด/ทรงฐานผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n" +
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
  slug: "standee-rotating",
  name: "สแตนดี้อะคริลิค หมุนได้",
  category: "standee",
  price: 80,
  emoji: "🔄",
  gradient: "from-sky-100 to-cyan-200",
  imageSrc: IMG("gallery-1"),
  rating: 5,
  sold: 0,
  badge: "ใหม่",
  description:
    "สแตนดี้อะคริลิค หมุนได้ (Acrylic Rotating Standee) — ตัวสแตนดี้เสียบบนแกนหมุน 13 มม. หมุนเล่นได้รอบตัว " +
    "ตัวสแตนดี้อะคริลิคหนา 3 มม. สกรีน 2 ด้าน ไดคัทตามลายที่ออกแบบ ฐานอะคริลิคใสหนา 5 มม. " +
    "เลือกขนาดตัวสแตนดี้ได้ตั้งแต่ 5 ถึง 12 ซม. เลือกขนาดฐาน 3-5 ซม. ถึง 12 ซม. เลือกทรงฐานกลม/สี่เหลี่ยม/ไดคัทตามทรง " +
    "และจะสกรีนลายลงบนฐานด้วยก็ได้ ราคาในตารางรวมค่าฐานแล้ว ไม่มีขั้นต่ำในการสั่งผลิต " +
    "ยิ่งสั่งเยอะยิ่งถูก เริ่มต้นชิ้นละ 80 บาท",
  highlights: [
    "หมุนได้รอบตัว — แกนหมุนขนาด 13 มม. ตัวสแตนดี้อะคริลิคหนา 3 มม. สกรีน 2 ด้าน",
    "ราคารวมฐานอะคริลิคใสหนา 5 มม. แล้ว · ไม่มีขั้นต่ำ สั่ง 1 ชิ้นก็ได้",
    "เลือกขนาดตัวสแตนดี้ 5-12 ซม. พร้อมภาพเทียบขนาดจริงทุกแบบ",
    "เลือกทรงฐานได้ — ทรงกลม/ทรงสี่เหลี่ยมไม่บวกเพิ่ม · ไดคัทตามทรง +10 บาท/ชิ้น",
    "สกรีนลายลงบนฐานได้ คิดเพิ่มตามขนาดฐาน (5-6 ซม. +10 ถึง 11-12 ซม. +25 บาท)",
    "1-10 ชิ้นคละลายได้อิสระ · 11 ชิ้นขึ้นไปคละลาย/คละขนาด สั่งลายละ 5 ชิ้นขึ้นไป",
    "ยิ่งสั่งเยอะยิ่งถูก — 200 ชิ้นขึ้นไป เริ่มต้นชิ้นละ 80 บาท",
  ],
  images: [
    { emoji: "🔄", gradient: "from-sky-100 to-cyan-200", label: "สแตนดี้อะคริลิคหมุนได้ ฐานกลม (ลายกลอง)", src: IMG("gallery-1") },
    { emoji: "🐕", gradient: "from-teal-100 to-cyan-200", label: "ตัวสแตนดี้ไดคัทตามลาย สกรีน 2 ด้าน", src: IMG("gallery-2") },
    { emoji: "🎠", gradient: "from-rose-100 to-red-200", label: "ฐานทรงกลม อะคริลิคสี", src: IMG("gallery-3") },
    { emoji: "✨", gradient: "from-orange-100 to-amber-200", label: "งานจริงตั้งโชว์ — ฐานทรงกลม", src: IMG("gallery-4") },
    { emoji: "🌸", gradient: "from-pink-100 to-rose-200", label: "ฐานไดคัทตามทรง (ทรงดอกไม้)", src: IMG("gallery-5") },
    { emoji: "🌟", gradient: "from-fuchsia-100 to-pink-200", label: "ตัวสแตนดี้อะคริลิคพิเศษ (กลิตเตอร์)", src: IMG("gallery-6") },
    { emoji: "🎡", gradient: "from-pink-100 to-purple-200", label: "งานจริง — อะคริลิคกลิตเตอร์ ฐานดอกไม้", src: IMG("gallery-7") },
    { emoji: "⚙️", gradient: "from-slate-100 to-sky-200", label: "แกนหมุน 13 มม. บนฐานอะคริลิค", src: IMG("gallery-8") },
  ],
  priceRates: [
    {
      id: "rotating",
      label: "สแตนดี้อะคริลิค หมุนได้ (รวมฐาน)",
      desc: "ราคาสแตนดี้รวมราคาฐานแล้ว · ตัวสแตนดี้สกรีน 2 ด้าน · ฐานอะคริลิคใสหนา 5 มม.",
      imageSrc: IMG("gallery-1"),
      freeMixBelowQty: 11,
      minPerDesign: 5,
      pricing: PRICING,
    },
  ],
  pricing: PRICING,
  options: [
    {
      label: SIZE_LABEL,
      stockBearing: true,
      choices: SIZE_CM.map((cm) => ({ name: sizeName(cm), imageSrc: IMG(`size-${cm}`) })),
    },
    {
      label: BASE_SIZE_LABEL,
      stockBearing: true,
      choices: BASE_CM.map((cm) => ({ name: baseName(cm), imageSrc: IMG(`basesize-${cm}`) })),
    },
    {
      label: BASE_SHAPE_LABEL,
      choices: [
        { name: "ทรงกลม", imageSrc: IMG("baseshape-round") },
        { name: "ทรงสี่เหลี่ยม", imageSrc: IMG("baseshape-square") },
        { name: "ไดคัทตามทรง", extra: 10, imageSrc: IMG("baseshape-diecut") },
      ],
    },
    {
      label: BASE_SCREEN_LABEL,
      choices: [
        { name: SCREEN_NO, imageSrc: IMG("basescreen-no") },
        { name: SCREEN_YES, imageSrc: IMG("basescreen-yes") },
      ],
    },
    {
      label: ACRYLIC_LABEL,
      stockBearing: true,
      choices: [
        { name: "อะคริลิคใส (มาตรฐาน)", imageSrc: IMG("gallery-1") },
        // เว็บบอกแค่ "บวกราคาเพิ่มตามขนาด" ไม่มีตัวเลข — ให้แอดมินตีราคาให้ตอนตรวจออเดอร์
        { name: "อะคริลิคพิเศษ (สี/กลิตเตอร์/โฮโลแกรม)", askPrice: true, imageSrc: IMG("gallery-6") },
      ],
    },
  ],
  terms: [
    "ราคาในตารางรวมค่าฐานอะคริลิคใสแล้ว (ฐานมาตรฐาน 3-5 ซม. ทรงกลม/ทรงสี่เหลี่ยม ไม่สกรีนฐาน)",
    "ฐานใหญ่กว่า 5 ซม. บวกเพิ่ม — เรทราคาปลีก (1-10 ชิ้น) ซม.ละ 15 บาท · เรทราคาส่ง (11 ชิ้นขึ้นไป) ซม.ละ 10 บาท",
    "ฐานสกรีนลายบวกเพิ่มตามขนาดฐาน — 5-6 ซม. +10 · 7-8 ซม. +15 · 9-10 ซม. +20 · 11-12 ซม. +25 บาท/ชิ้น",
    "ฐานไดคัทตามทรง +10 บาท/ชิ้น (ทรงกลม ทรงสี่เหลี่ยม ไม่บวกเพิ่ม) · ฐานเป็นอะคริลิคใสเท่านั้น",
    "จำนวน 1-10 ชิ้น คละลายได้อิสระ · 11 ชิ้นขึ้นไป คละลาย คละขนาด สั่งลายละ 5 ชิ้นขึ้นไป ไม่ถึงตามจำนวนคิดตามราคาปลีก",
    "ตัวสแตนดี้อะคริลิคพิเศษ (สี/กลิตเตอร์/โฮโลแกรม) บวกราคาเพิ่มตามขนาด — ทางร้านตีราคาให้ก่อนเริ่มผลิต",
    "จุดหมุนแกนกลางบนตัวสแตนดี้เป็นทรงกลมขนาด 1 ซม. · ตัวงานอาจเห็นคราบกาวบ้าง แต่ไม่มีผลกับการใช้งาน",
    "ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดความยาวแนวทแยง)",
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
  ...Array.from({ length: 8 }, (_, i) => `gallery-${i + 1}`),
  "color-chart",
  ...SIZE_CM.map((cm) => `size-${cm}`),
  ...BASE_CM.map((cm) => `basesize-${cm}`),
  "baseshape-round",
  "baseshape-square",
  "baseshape-diecut",
  "basescreen-no",
  "basescreen-yes",
];

async function uploadImages() {
  if (!IMAGES_DIR) throw new Error("ต้องระบุ --images=<โฟลเดอร์ที่เตรียมไฟล์ไว้> (รันสคริปต์ rotating-stand-art.mjs ก่อน)");
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  for (const name of FILES) {
    const buf = await readFile(`${IMAGES_DIR.replace(/\/$/, "")}/${name}.jpg`);
    const { error } = await sb.storage
      .from("product-images")
      .upload(`products/${ID}/${name}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`${name}: ${error.message}`);
    console.log(`⬆️  ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
  }
}

async function main() {
  if (UPLOAD) await uploadImages();

  console.log(`📦 ${saved.name} (${ID})`);
  console.log(
    `   ราคา ${range.min}-${range.max} บาท/${UNIT} · ตัวเลือก ${saved.options.length} กลุ่ม · รูป ${saved.images.length} ภาพ`
  );
  for (const r of saved.priceRates ?? []) {
    console.log(`   เรท ${r.label}: ${Object.keys(r.pricing.cells).length} ช่อง × ${r.pricing.tiers.length} ช่วง`);
  }
  const choices = saved.options.flatMap((o) => o.choices);
  console.log(`   ตัวเลือกที่มีภาพประกอบ: ${choices.filter((c) => c.imageSrc).length}/${choices.length} ตัว`);
  console.log(`   แท็บ: ${(saved.tabs ?? []).map((t) => t.title).join(" · ")}`);
  // ตัวอย่างการคิดราคา ให้เทียบกับตารางในเว็บได้ด้วยตาเปล่า
  const sample = (size: number, base: number, screen: string) =>
    `${size}ซม. ฐาน${base}ซม. ${screen}: ${PRICING.cells[`${sizeName(size)}│${baseName(base)}│${screen}`].join(" / ")}`;
  console.log(`   ตัวอย่าง ${sample(5, 5, SCREEN_NO)}`);
  console.log(`   ตัวอย่าง ${sample(12, 5, SCREEN_NO)}`);
  console.log(`   ตัวอย่าง ${sample(8, 7, SCREEN_YES)}`);

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
