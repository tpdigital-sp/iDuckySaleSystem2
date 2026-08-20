/**
 * สร้างสินค้า "สแตนดี้ + Frame Card" จากตารางราคาเว็บ
 *
 *   npx tsx scripts/add-standee-frame-card.ts                                  # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   node scripts/standee-frame-card-art.mjs                                    # เตรียมภาพ
 *   npx tsx scripts/add-standee-frame-card.ts --upload --images=.cache/framecard/upload
 *   npx tsx scripts/add-standee-frame-card.ts --write                          # เขียนลง Supabase (เป็นฉบับร่าง)
 *
 * ⚠️ ที่มาของราคา: ผู้ใช้ส่งลิงก์หน้า /standyphonebase มา แต่ตาราง
 *   "Pricelist & Size & Thick ราคาส่ง สกรีน แผ่นอะคริลิค พวงกุญแจ · เรทที่ 1 (สั่งแบบคละดีเทล)"
 *   อยู่ที่หน้า /pricestandy (หน้าสแตนดี้อะคริลิค) — หน้า standyphonebase ไม่มีตารางนี้และไม่มี Frame Card
 *   จึงยึดตัวเลขจาก /pricestandy ตามชื่อตารางที่ผู้ใช้ระบุ
 *
 * ราคาต่อชิ้น = ราคาแผ่นอะคริลิคตามขนาด (เรทที่ 1) + ค่าฐาน + (ถ้าเลือก) ค่าสกรีน 2 ด้าน + กรอบการ์ด 50 บาท
 *
 *   เรทที่ 1 · แผ่นอะคริลิคใส/ขาวขุ่น C-02 หนา 3 มม. (บาท/ชิ้น)
 *     ขนาด        15   16   17   18   19   20 ซม.
 *     1-10 ชิ้น   230  240  250  260  270  280
 *     11-29       159  169  179  189  199  209
 *     30-49       155  165  175  185  195  205
 *     50-199      150  160  170  180  190  200
 *     200-499     145  155  165  175  185  195
 *     500+        140  150  160  170  180  190
 *
 *   ตาราง "ราคาฐาน สแตนดี้" (บาท/ชิ้น · เท่ากันทุกช่วงจำนวน)
 *     ฐาน        6-7   8    9   10   11   12 ซม.
 *     ไม่สกรีน    15   20   25   30   35   40
 *     สกรีนฐาน    25   30   35   40   45   50
 *
 *   ตาราง "Add on งานสกรีน 2 ด้าน" — 15 ซม. 35 · 16 ซม. 35 · เกินจากนั้นบวก ซม.ละ 5 บาท
 *     (เว็บเขียนกำกับว่า "สกรีน 2 ด้าน ขนาดมากกว่า 17cm ขึ้นไป บวกเพิ่ม cm ละ 5 บาท" ตัวตารางจบที่ 16 ซม.
 *      จึงไล่ต่อเป็น 17→40 · 18→45 · 19→50 · 20→55 — ถ้าร้านคิดคนละแบบ แก้ที่ TWO_SIDE_FEE ตัวเดียวจบ)
 *
 *   Frame Card (แปะกาวสำหรับใส่รูปที่ด้านหลัง) — บวกเพิ่ม 50 บาท/ชิ้น ตามแผ่น "Standy สแตนดี้+ส่วนเสริม"
 *   อะคริลิคพิเศษ (ตาราง Add on) — 15 ซม. +35 · 16 +40 · 17 +45 · 18 +50 · 19 +55 · 20 +60 (เรทปลีก = เรทส่ง)
 *
 * เงื่อนไขที่ผู้ใช้ระบุ: ทำขนาด 15 ซม. ขึ้นไป (ต่ำกว่านั้นใส่การ์ด 5.4×8.5 ซม. ไม่ได้)
 * เงื่อนไขจากเว็บ: 1-10 ชิ้น คละดีเทลได้ไม่จำกัด · 11 ชิ้นขึ้นไป คละลาย/คละขนาด สั่งลายละ 5 ชิ้นขึ้นไป
 *
 * ภาพ: เตรียมด้วย scripts/standee-frame-card-art.mjs (งานจริง 4 · ชาร์ตสี 1 · ภาพวาดตัวเลือก 20)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ขึ้นรุ่นใหม่ให้ขยับ REV v1 → v2
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
// @ts-expect-error — สคริปต์ JS ล้วน (ภาพสีอะคริลิคชุดกลางของทั้งระบบ)
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

const ID = "standee-frame-card";
const REV = "v1";
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}-${REV}.jpg`;

const UNIT = "ชิ้น";
const SIZE_LABEL = "ขนาดตัวสแตนดี้";
const BASE_LABEL = "ขนาดฐาน";
const BASE_SCREEN_LABEL = "ฐานสแตนดี้";
const SCREEN_LABEL = "งานสกรีน";
const CARD_WAY_LABEL = "แนวกรอบการ์ด";
const ACRYLIC_LABEL = "สีอะคริลิค";

const SIZES = [15, 16, 17, 18, 19, 20];
const sizeName = (cm: number) => `${cm} ซม.`;

/** ขนาดฐานที่เปิดให้เลือก (key = ชื่อไฟล์ภาพ · cm = ตัวเลขที่ใช้คิดค่าฐาน) */
const BASES = [
  { key: 6, name: "ฐาน 6-7 ซม.", noScreen: 15, screen: 25 },
  { key: 8, name: "ฐาน 8 ซม.", noScreen: 20, screen: 30 },
  { key: 9, name: "ฐาน 9 ซม.", noScreen: 25, screen: 35 },
  { key: 10, name: "ฐาน 10 ซม.", noScreen: 30, screen: 40 },
  { key: 11, name: "ฐาน 11 ซม.", noScreen: 35, screen: 45 },
  { key: 12, name: "ฐาน 12 ซม.", noScreen: 40, screen: 50 },
];

const SCREEN_BASE_NO = "ไม่สกรีนฐาน";
const SCREEN_BASE_YES = "สกรีนลายฐาน";
const SCREEN_1 = "สกรีน 1 ด้าน";
const SCREEN_2 = "สกรีน 2 ด้าน";

/** ราคาแผ่นอะคริลิคตามขนาด × ช่วงจำนวน (เรทที่ 1 · ตัวเลขตรงตามตารางในเว็บ) */
const SHEET: Record<number, number[]> = {
  15: [230, 159, 155, 150, 145, 140],
  16: [240, 169, 165, 160, 155, 150],
  17: [250, 179, 175, 170, 165, 160],
  18: [260, 189, 185, 180, 175, 170],
  19: [270, 199, 195, 190, 185, 180],
  20: [280, 209, 205, 200, 195, 190],
};

/** ค่าสกรีน 2 ด้าน ตามขนาดชิ้นงาน (ตาราง Add on — 16 ซม. ขึ้นไป บวกต่อ ซม.ละ 5 บาท) */
const TWO_SIDE_FEE: Record<number, number> = { 15: 35, 16: 35, 17: 40, 18: 45, 19: 50, 20: 55 };

/** ค่าอะคริลิคพิเศษต่อชิ้น ตามขนาด (ตาราง Add on อะคริลิคพิเศษ — ช่วง 15-20 ซม. เรทปลีก = เรทส่ง) */
const SPECIAL_FEE: Record<number, number> = { 15: 35, 16: 40, 17: 45, 18: 50, 19: 55, 20: 60 };

/** กรอบใส่การ์ด (แปะกาวสำหรับใส่รูปที่ด้านหลัง) — บวกเพิ่มต่อชิ้น */
const CARD_FEE = 50;

const CLEAR = "อะคริลิคใส / ขาวขุ่น C-02";
const SPECIAL = "อะคริลิคพิเศษ (สี / กลิตเตอร์ / โฮโลแกรม)";
/** สีพิเศษ = สีทั้งหมดในชาร์ตของร้าน ยกเว้น 2 ตัวที่อยู่ในราคามาตรฐานแล้ว */
const SPECIAL_COLORS: string[] = Object.keys(COLORS as Record<string, unknown>).filter(
  (name) => name !== "อะคริลิคขาวขุ่น C-02"
);

const TIERS: PriceTier[] = [
  { upTo: 10, label: "1-10 ชิ้น" },
  { upTo: 29, label: "11-29 ชิ้น" },
  { upTo: 49, label: "30-49 ชิ้น" },
  { upTo: 199, label: "50-199 ชิ้น" },
  { upTo: 499, label: "200-499 ชิ้น" },
  { upTo: null, label: "500 ชิ้นขึ้นไป" },
];

const PRICING: PriceMatrix = {
  unit: UNIT,
  driverLabels: [SIZE_LABEL, BASE_LABEL, BASE_SCREEN_LABEL, SCREEN_LABEL],
  tiers: TIERS,
  cells: Object.fromEntries(
    SIZES.flatMap((cm) =>
      BASES.flatMap((b) =>
        [SCREEN_BASE_NO, SCREEN_BASE_YES].flatMap((baseScreen) =>
          [SCREEN_1, SCREEN_2].map((screen) => [
            `${sizeName(cm)}│${b.name}│${baseScreen}│${screen}`,
            SHEET[cm].map(
              (price) =>
                price +
                (baseScreen === SCREEN_BASE_YES ? b.screen : b.noScreen) +
                (screen === SCREEN_2 ? TWO_SIDE_FEE[cm] : 0) +
                CARD_FEE
            ),
          ])
        )
      )
    )
  ),
};

const options: ProductOption[] = [
  {
    label: SIZE_LABEL,
    stockBearing: true,
    choices: SIZES.map((cm) => ({ name: sizeName(cm), imageSrc: IMG(`size-${cm}`) })),
  },
  {
    label: BASE_LABEL,
    stockBearing: true,
    display: "dropdown",
    choices: BASES.map((b) => ({ name: b.name, imageSrc: IMG(`base-${b.key}`) })),
  },
  {
    label: BASE_SCREEN_LABEL,
    choices: [
      { name: SCREEN_BASE_NO, imageSrc: IMG("basescreen-no") },
      { name: SCREEN_BASE_YES, imageSrc: IMG("basescreen-yes") },
    ],
  },
  {
    label: SCREEN_LABEL,
    choices: [
      { name: SCREEN_1, imageSrc: IMG("screen-1") },
      { name: SCREEN_2, imageSrc: IMG("screen-2") },
    ],
  },
  {
    label: CARD_WAY_LABEL,
    choices: [
      { name: "แนวตั้ง (การ์ด 5.4 × 8.5 ซม.)", imageSrc: IMG("card-portrait") },
      { name: "แนวนอน (การ์ด 8.5 × 5.4 ซม.)", imageSrc: IMG("card-landscape") },
    ],
  },
  {
    label: ACRYLIC_LABEL,
    stockBearing: true,
    choices: [
      { name: CLEAR, imageSrc: IMG("clear") },
      { name: SPECIAL, imageSrc: acrylicColorImage("hologram-รุ้ง") },
    ],
  },
  // ค่าอะคริลิคพิเศษต่างกันตามขนาด → แยกกลุ่มต่อขนาด แล้วโชว์ทีละกลุ่มด้วย showWhen
  // (เลือกสีในกลุ่มไหน = บวกค่าของขนาดนั้นให้เอง ลูกค้าไม่ต้องติ๊กเพิ่มอีกช่อง)
  ...SIZES.map(
    (cm): ProductOption => ({
      label: `เลือกสีพิเศษ (ขนาด ${cm} ซม. · +${SPECIAL_FEE[cm]} บาท/ชิ้น)`,
      display: "dropdown",
      stockBearing: true,
      showWhen: { label: SIZE_LABEL, choices: [sizeName(cm)] },
      showWhenAlso: { label: ACRYLIC_LABEL, choices: [SPECIAL] },
      choices: SPECIAL_COLORS.map((name) => {
        const img = acrylicColorImage(name);
        return { name, extra: SPECIAL_FEE[cm], ...(img ? { imageSrc: img } : {}) };
      }),
    })
  ),
];

const TABS: Product["tabs"] = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text:
      "สแตนดี้ + Frame Card — สแตนดี้อะคริลิคสกรีนลายตามสั่ง ด้านหลังแปะกรอบอะคริลิคใสไว้สอดการ์ด " +
      "(โฟโต้การ์ด / บัตรพนักงาน / รูปโพลารอยด์ ขนาดมาตรฐาน 5.4 × 8.5 ซม.) เปลี่ยนการ์ดเองได้ตลอด\n" +
      "• ราคาต่อชิ้นรวมครบแล้ว: ตัวสแตนดี้ + ฐาน + กรอบใส่การ์ด (ค่ากรอบการ์ดปกติ 50 บาท/ชิ้น)\n" +
      "• อะคริลิคหนาประมาณ 3 มม. ไดคัทตามลายที่ออกแบบ พิมพ์ระบบ UV Printing\n" +
      "• ทำขนาดตั้งแต่ 15 ซม. ขึ้นไป (ถึง 20 ซม.) — เล็กกว่านี้ใส่การ์ดไม่ได้\n" +
      "• เลือกขนาดฐาน 6-7 ถึง 12 ซม. · จะสกรีนลายลงฐานด้วยก็ได้\n" +
      "• เลือกสกรีน 1 ด้าน หรือ 2 ด้าน · เลือกอะคริลิคสีพิเศษได้กว่า 40 แบบ (คิดเพิ่มตามขนาด)\n" +
      "• 1-10 ชิ้น เรทราคาปลีก คละดีเทลได้ไม่จำกัด ไม่มีขั้นต่ำ · 11 ชิ้นขึ้นไป คละลาย/คละขนาด สั่งลายละ 5 ชิ้นขึ้นไป " +
      "(ไม่ถึงตามจำนวน คิดตามราคาปลีก)\n" +
      "• สั่งตั้งแต่ 24 ชิ้นขึ้นไป ฟรีแพ็คเกจ (คละลายได้ จำนวนขั้นต่ำ 24 30 36 42 ... บวกเพิ่มทีละ 6 ชิ้น)",
  },
  {
    title: "กรอบใส่การ์ด (Frame Card)",
    text:
      "กรอบการ์ดคืออะไร::\n" +
      "• แผ่นอะคริลิคใสแปะกาวไว้ที่ด้านหลังของตัวสแตนดี้ เว้นช่องด้านบนไว้สอดการ์ดเข้า-ออก\n" +
      "• รองรับการ์ดขนาดมาตรฐาน 5.4 × 8.5 ซม. (ขนาดเดียวกับบัตรพนักงาน/โฟโต้การ์ดทั่วไป)\n" +
      "• เลือกวางกรอบแนวตั้งหรือแนวนอนได้ ราคาเท่ากัน — การ์ดขนาดอื่นแจ้งแอดมินก่อนสั่งได้\n\n" +
      "ราคา::\n" +
      "• ค่ากรอบการ์ด 50 บาท/ชิ้น รวมอยู่ในราคาที่แสดงแล้ว (ไม่ต้องบวกเอง)\n" +
      "• ตัวสแตนดี้ต้องขนาด 15 ซม. ขึ้นไป การ์ดถึงจะใส่ได้พอดี",
    images: [IMG("photo-card"), IMG("hero"), IMG("photo-addon")],
    imageSize: "md" as const,
  },
  {
    title: "ขนาดและสเปกงาน",
    text:
      "ตัวสแตนดี้::\n" +
      "• เลือกได้ตั้งแต่ 15 ถึง 20 ซม. (วัดจากด้านที่ยาวที่สุด ไม่วัดความยาวแนวทแยง)\n" +
      "• อะคริลิคหนาประมาณ 3 มม. · ไดคัทตามรูปทรงที่ออกแบบ · ตัดตกจากขนาดงานจริงด้านละ 3 มม.\n" +
      "• สกรีน 1 ด้าน หรือ 2 ด้าน — สกรีน 2 ด้านบวกเพิ่มตามขนาด (15-16 ซม. +35 ถึง 20 ซม. +55 บาท/ชิ้น)\n\n" +
      "ฐาน::\n" +
      "• เลือกขนาดฐานได้ 6-7 · 8 · 9 · 10 · 11 · 12 ซม. — ตัวยิ่งสูงยิ่งควรใช้ฐานใหญ่ขึ้นเพื่อให้ตั้งมั่นคง\n" +
      "• ไม่สกรีนฐาน 15-40 บาท · สกรีนลายฐาน 25-50 บาท ตามขนาดฐาน (รวมในราคาที่แสดงแล้ว)\n" +
      "• ฐานทรงกลม/ทรงสี่เหลี่ยม ไม่คิดเพิ่ม · ฐานทรงพิเศษ (ไดคัทตามทรง) แจ้งแอดมิน คิดเพิ่ม 5-10 บาท/ชิ้น",
    images: [IMG("size-15"), IMG("size-20"), IMG("base-12")],
    imageSize: "md" as const,
  },
  {
    title: "ชนิดอะคริลิค",
    text:
      "อะคริลิคใส / ขาวขุ่น C-02 (มาตรฐาน)::\n" +
      "• ราคาตามตารางคืออะคริลิคใส หรือขาวขุ่น C-02 หนาประมาณ 3 มม.\n" +
      "• งานสกรีนอะคริลิค โดยปกติทางร้านสกรีนใต้ (ยกเว้นโฮโลแกรม 01 / สีพิเศษ จะสกรีนบน) " +
      "หากต้องการสกรีนบนต้องแจ้งก่อน เพื่อเขียนกำกับไว้ที่บิล\n\n" +
      "อะคริลิคพิเศษ (สี / กลิตเตอร์ / โฮโลแกรม)::\n" +
      "• หนาประมาณ 2.5-3 มม. · บวกเพิ่มตามขนาดตัวสแตนดี้ — 15 ซม. +35 · 16 +40 · 17 +45 · 18 +50 · 19 +55 · 20 +60 บาท/ชิ้น\n" +
      "• เลือกสีในหน้าสั่งซื้อได้เลย ระบบบวกค่าให้อัตโนมัติตามขนาดที่เลือก\n" +
      "• กรอบใส่การ์ดด้านหลังเป็นอะคริลิคใสเสมอ (เพื่อให้มองเห็นการ์ด)",
    images: [IMG("color-chart")],
    imageSize: "lg" as const,
  },
  {
    title: "วิธีสั่งงาน",
    text:
      "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
      "• เลือกขนาดตัวสแตนดี้ · ขนาดฐาน · สกรีนฐานหรือไม่ · สกรีน 1 หรือ 2 ด้าน · แนวกรอบการ์ด · สีอะคริลิค\n" +
      '• แนบภาพลาย (JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n' +
      '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ขนาดการ์ดที่จะใส่ · ลายฐาน · วันที่ต้องการใช้งาน\n' +
      "• สั่งหลายลาย ให้เพิ่มลงตะกร้าแยกรายการตามลาย (11 ชิ้นขึ้นไป สั่งลายละ 5 ชิ้นขึ้นไป)\n" +
      "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n" +
      "หรือสั่งทางอีเมล::\n" +
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n" +
      "• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n" +
      "• ระบุรายละเอียด: ขนาดตัวสแตนดี้ · ขนาด/สกรีนฐาน · สกรีนกี่ด้าน · แนวกรอบการ์ด · จำนวน · วันที่ใช้งาน (ถ้ามี)\n" +
      "• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
  },
  {
    title: "การเตรียมไฟล์",
    text:
      "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n" +
      "• ออกแบบให้อยู่ในขนาดที่สั่ง (15-20 ซม. วัดด้านที่ยาวที่สุด) · ตัดตกจากขนาดงานจริงด้านละ 3 มม.\n" +
      "• เผื่อพื้นที่ด้านหลังไว้ให้กรอบการ์ด 5.4 × 8.5 ซม. — เลี่ยงวางรายละเอียดสำคัญตรงจุดที่กรอบทับ " +
      "(ถ้าสกรีน 2 ด้าน ลายด้านหลังจะโดนกรอบและการ์ดบังบางส่วน)\n" +
      "• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n" +
      "• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด\n" +
      "• งานสกรีนเต็มขอบ สีมีโอกาสหลุดลอกง่ายกว่าแบบปกติ",
  },
  {
    title: "การรับประกันสินค้า",
    text:
      "รับเคลม::\n" +
      "• สีเพี้ยนเกิน 10-15%\n" +
      "• จำนวนที่ได้รับไม่ครบถ้วน\n" +
      "• สีอะคริลิค หรืออะไหล่ ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n" +
      "• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\n" +
      "ไม่รับเคลม::\n" +
      "• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n" +
      "• คราบกาวบริเวณจุดแปะกรอบการ์ด ซึ่งเป็นลักษณะปกติของงานและไม่มีผลกับการใช้งาน\n" +
      "• สินค้าชำรุดจากการใช้งานมาแล้ว\n\n" +
      "ระยะเวลาในการเคลม::\n" +
      "ภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
  },
];

const seo: Product["seo"] = {
  title: "รับทำ สแตนดี้ + Frame Card อะคริลิคใส่การ์ดได้ เริ่ม 205 บาท",
  description:
    "รับผลิตสแตนดี้อะคริลิคพร้อมกรอบใส่การ์ดด้านหลัง (Frame Card) ใส่โฟโต้การ์ด 5.4×8.5 ซม. ได้ " +
    "พิมพ์ลายตามสั่งระบบ UV อะคริลิคหนา 3 มม. ทำขนาด 15-20 ซม. เลือกฐาน สกรีน 1-2 ด้าน อะคริลิคสีพิเศษ " +
    "1-10 ชิ้นไม่มีขั้นต่ำ คละลายได้",
  keywords: [
    "สแตนดี้ใส่การ์ด",
    "สแตนดี้ + Frame Card",
    "Frame Card อะคริลิค",
    "สแตนดี้อะคริลิค",
    "รับทำสแตนดี้",
    "กรอบใส่โฟโต้การ์ด",
    "acrylic standee card frame",
    "สแตนดี้พิมพ์ลาย",
    "อะคริลิคสั่งทำ",
    "iDucky",
  ],
  faqs: [
    {
      q: "สแตนดี้ + Frame Card ราคาเท่าไหร่?",
      a:
        "ราคารวมกรอบการ์ดและฐานแล้ว เริ่มต้นชิ้นละ 205 บาท (ตัว 15 ซม. ฐาน 6-7 ซม. ไม่สกรีนฐาน สกรีน 1 ด้าน ที่ 500 ชิ้นขึ้นไป) " +
        "· สั่ง 1-10 ชิ้น ตัว 15 ซม. อยู่ที่ 295 บาท/ชิ้น — ยิ่งสั่งเยอะยิ่งถูกตามตารางราคา",
    },
    {
      q: "ใส่การ์ดขนาดไหนได้บ้าง?",
      a: "กรอบมาตรฐานรองรับการ์ดขนาด 5.4 × 8.5 ซม. (เท่าบัตรพนักงาน/โฟโต้การ์ดทั่วไป) เลือกวางแนวตั้งหรือแนวนอนก็ได้ ราคาเท่ากัน · การ์ดขนาดอื่นแจ้งแอดมินก่อนสั่งได้",
    },
    {
      q: "ทำไมต้องสั่งขนาด 15 ซม. ขึ้นไป?",
      a: "เพราะกรอบใส่การ์ดสูง 8.5 ซม. ถ้าตัวสแตนดี้เล็กกว่า 15 ซม. จะแปะกรอบแล้วการ์ดล้นออกนอกตัวงาน ทางร้านจึงทำแบบนี้ตั้งแต่ 15 ถึง 20 ซม.",
    },
    {
      q: "ค่ากรอบการ์ดคิดเพิ่มเท่าไหร่?",
      a: "กรอบใส่การ์ด (แปะกาวสำหรับใส่รูปที่ด้านหลัง) คิดเพิ่ม 50 บาท/ชิ้น — ราคาที่แสดงบนหน้าเว็บรวมให้แล้ว ไม่ต้องบวกเอง",
    },
    {
      q: "ใช้อะคริลิคสีพิเศษได้ไหม?",
      a: "ได้ครับ มีทั้งสี กลิตเตอร์ โฮโลแกรม กระจก กว่า 40 แบบ คิดเพิ่มตามขนาด (15 ซม. +35 ถึง 20 ซม. +60 บาท/ชิ้น) อะคริลิคพิเศษหนาประมาณ 2.5-3 มม. ส่วนกรอบการ์ดเป็นอะคริลิคใสเสมอ",
    },
    {
      q: "สั่งขั้นต่ำกี่ชิ้น คละลายได้ไหม?",
      a: "1-10 ชิ้นไม่มีขั้นต่ำ คละดีเทลได้ไม่จำกัด · ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย/คละขนาดได้ โดยสั่งลายละ 5 ชิ้นขึ้นไป ถ้าไม่ถึงจำนวนคิดตามราคาปลีก",
    },
  ],
};

const product: Product = {
  id: ID,
  slug: "standee-frame-card",
  name: "สแตนดี้ + Frame Card",
  category: "standee",
  price: 205,
  emoji: "🖼️",
  gradient: "from-sky-100 to-cyan-200",
  imageSrc: IMG("photo-card"),
  seo,
  rating: 5,
  sold: 0,
  badge: "ใหม่",
  hidden: true,
  description:
    "สแตนดี้อะคริลิคพร้อมกรอบใส่การ์ดด้านหลัง (Frame Card) — สกรีนลายตามสั่งด้วยระบบ UV อะคริลิคหนาประมาณ 3 มม. " +
    "ไดคัทตามลาย ด้านหลังแปะกรอบอะคริลิคใสไว้สอดโฟโต้การ์ด/รูป ขนาด 5.4 × 8.5 ซม. เปลี่ยนการ์ดเองได้ " +
    "ทำขนาดตั้งแต่ 15 ถึง 20 ซม. เลือกขนาดฐาน สกรีนฐาน และสกรีน 1-2 ด้านได้ " +
    "ราคารวมตัวงาน + ฐาน + กรอบการ์ดแล้ว 1-10 ชิ้นไม่มีขั้นต่ำ",
  highlights: [
    "ด้านหลังมีกรอบอะคริลิคใส สอดการ์ด 5.4 × 8.5 ซม. เปลี่ยนเองได้",
    "ราคารวมตัวสแตนดี้ + ฐาน + กรอบการ์ด (ปกติกรอบคิด 50 บาท/ชิ้น)",
    "ทำขนาด 15-20 ซม. · อะคริลิคหนา ~3 มม. พิมพ์ UV ไดคัทตามลาย",
    "เลือกฐาน 6-7 ถึง 12 ซม. · สกรีนลายฐานได้ · สกรีน 1 หรือ 2 ด้าน",
    "อะคริลิคสีพิเศษกว่า 40 แบบ ระบบบวกราคาตามขนาดให้อัตโนมัติ",
    "1-10 ชิ้น คละดีเทลได้ไม่จำกัด ไม่มีขั้นต่ำ · 11 ชิ้นขึ้นไป ลายละ 5 ชิ้นขึ้นไป",
  ],
  images: [
    { emoji: "🖼️", gradient: "from-sky-100 to-cyan-200", label: "งานจริง — สแตนดี้ + Frame Card ใส (สอดการ์ดด้านหลัง)", src: IMG("photo-card") },
    { emoji: "🧍", gradient: "from-sky-100 to-cyan-200", label: "ด้านหน้าสกรีนลาย · ด้านหลังกรอบใส่การ์ด", src: IMG("hero") },
    { emoji: "💳", gradient: "from-teal-100 to-cyan-200", label: "ตารางส่วนเสริมของร้าน — Frame Card ใส บวกเพิ่ม 50 บาท", src: IMG("photo-addon") },
    { emoji: "✨", gradient: "from-sky-100 to-blue-200", label: "ตัวอย่างงานสแตนดี้อะคริลิคตัวใหญ่", src: IMG("photo-1") },
    { emoji: "🌸", gradient: "from-pink-100 to-rose-200", label: "ตัวอย่างงานสแตนดี้พร้อมฐาน", src: IMG("photo-2") },
  ],
  options,
  pricing: PRICING,
  priceRates: [
    {
      id: "r1",
      label: "เรทที่ 1 (สั่งแบบคละดีเทล)",
      desc: "อะคริลิคใส / ขาวขุ่น C-02 หนา 3 มม. · ราคารวมฐานและกรอบใส่การ์ดแล้ว",
      imageSrc: IMG("photo-card"),
      minPerDesign: 5,
      freeMixBelowQty: 11,
      pricing: PRICING,
    },
  ],
  tierByDesign: true,
  terms: [
    "ราคาต่อชิ้นรวมแล้ว: ตัวสแตนดี้ + ฐาน (ตามขนาดที่เลือก) + กรอบใส่การ์ดด้านหลัง 50 บาท",
    "ทำขนาดตัวสแตนดี้ตั้งแต่ 15 ถึง 20 ซม. — ต่ำกว่า 15 ซม. ใส่การ์ด 5.4 × 8.5 ซม. ไม่ได้",
    "ค่าฐาน: ไม่สกรีนฐาน 6-7 ซม. 15 บาท ถึง 12 ซม. 40 บาท · สกรีนลายฐาน 6-7 ซม. 25 บาท ถึง 12 ซม. 50 บาท",
    "สกรีน 2 ด้าน บวกเพิ่มตามขนาด — 15-16 ซม. 35 · 17 ซม. 40 · 18 ซม. 45 · 19 ซม. 50 · 20 ซม. 55 บาท/ชิ้น",
    "อะคริลิคพิเศษ (สี/กลิตเตอร์/โฮโลแกรม) บวกเพิ่มตามขนาด 15 ซม. 35 บาท ถึง 20 ซม. 60 บาท/ชิ้น · หนาประมาณ 2.5-3 มม.",
    "กรอบใส่การ์ดเป็นอะคริลิคใสเสมอ · การ์ดขนาดอื่นนอกจาก 5.4 × 8.5 ซม. แจ้งก่อนสั่ง",
    "ราคา 1-10 ชิ้น สามารถคละดีเทลได้ไม่จำกัด · 11 ชิ้นขึ้นไป คละลาย คละขนาด สั่งขั้นต่ำลายละ 5 ชิ้น++ ไม่ถึงตามจำนวน คิดตามราคาปลีก",
    "สั่งตั้งแต่ 24 ชิ้นขึ้นไป ฟรีแพ็คเกจ (คละลายได้ จำนวนขั้นต่ำ 24 30 36 42 ... บวกเพิ่มทีละ 6 ชิ้น)",
    "ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดความยาวแนวทแยง) · ตัดตกจากขนาดงานจริงด้านละ 3 มม.",
    "งานสกรีนอะคริลิคปกติสกรีนใต้ (ยกเว้นโฮโลแกรม-01 / สีพิเศษ จะสกรีนบน) หากต้องการสกรีนบนต้องแจ้ง เพื่อเขียนกำกับไว้ที่บิล",
    "ทางร้านใช้สีระบบ RGB สีงานสกรีนที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15% · ผลิตคนละเครื่องสีต่างกันได้ 5-10%",
  ].join("\n"),
  tabs: TABS,
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
  "photo-card",
  "photo-addon",
  "photo-1",
  "photo-2",
  "color-chart",
  "hero",
  ...SIZES.map((cm) => `size-${cm}`),
  ...BASES.map((b) => `base-${b.key}`),
  "basescreen-no",
  "basescreen-yes",
  "screen-1",
  "screen-2",
  "card-portrait",
  "card-landscape",
  "clear",
];

async function uploadImages() {
  if (!IMAGES_DIR) throw new Error("ต้องระบุ --images=<โฟลเดอร์ที่เตรียมไฟล์ไว้> (รัน scripts/standee-frame-card-art.mjs ก่อน)");
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  for (const name of FILES) {
    const buf = await readFile(`${IMAGES_DIR.replace(/\/$/, "")}/${name}.jpg`);
    const { error } = await sb.storage
      .from("product-images")
      .upload(`products/${ID}/${name}-${REV}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
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
  console.log(`   ตารางราคา: ${Object.keys(PRICING.cells).length} ช่อง × ${PRICING.tiers.length} ช่วงจำนวน`);
  const choices = saved.options.flatMap((o) => o.choices);
  console.log(`   ตัวเลือกที่มีภาพประกอบ: ${choices.filter((c) => c.imageSrc).length}/${choices.length} ตัว`);
  console.log(`   แท็บ: ${(saved.tabs ?? []).map((t) => t.title).join(" · ")}`);
  // ตัวอย่างการคิดราคา ให้เทียบกับตารางในเว็บได้ด้วยตาเปล่า
  const sample = (cm: number, base: string, bs: string, sc: string) =>
    `${cm}ซม. ${base} ${bs} ${sc}: ${PRICING.cells[`${sizeName(cm)}│${base}│${bs}│${sc}`].join(" / ")}`;
  console.log(`   ตัวอย่าง ${sample(15, BASES[0].name, SCREEN_BASE_NO, SCREEN_1)}`);
  console.log(`   ตัวอย่าง ${sample(20, BASES[5].name, SCREEN_BASE_YES, SCREEN_2)}`);
  console.log(`   ตัวอย่าง ${sample(18, BASES[2].name, SCREEN_BASE_NO, SCREEN_2)}`);

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
