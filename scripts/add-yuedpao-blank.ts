/**
 * สร้างสินค้า "เสื้อ Unisex YUEDPAO (ยืดเปล่า)" จากตารางราคาเว็บ
 * iduckyofficial-pricelists.com/tshirtprinting — บล็อก "เสื้อ Unisex ยี่ห้อ YUEDPAO (ยืดเปล่า)"
 *
 *   npx tsx scripts/add-yuedpao-blank.ts          # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   npx tsx scripts/add-yuedpao-blank.ts --write  # เขียนลง Supabase
 *
 * ดึงครบทั้ง 4 แท็บของบล็อกนั้นมาเป็น 3 เรทราคา + 1 แกนตาราง:
 *   1. พิมพ์ DTF/DFT   350/250/220/210/200 · A5 +15 · A3 +40
 *   2. พิมพ์ FLEX      350/300/280/260 (ทุกขนาดราคาเท่ากันตั้งแต่ 11 ตัวขึ้นไป)
 *   3. พิมพ์ ปัก       10cm 450/420/380/360 · 15cm 650/620/580/560 · 20cm 850/820/780/760
 *   4. ตาราง "สกรีนมากกว่า 1 จุด" เข้าเป็นแกนที่สองของตาราง (ขนาดสกรีน ด้านหน้า/ด้านหลัง)
 *      — ลูกค้าเลือกขนาดสกรีนแยกรายด้าน · เลือก "ไม่สกรีน" ได้ 1 ด้าน
 *      — ด้านแรกที่มีลาย = ราคาเต็มตามขนาดของด้านนั้น · อีกด้านบวกค่าจุดเพิ่มตามขนาดของด้านนั้นเอง
 *        (30/45/95 บาท ลดหลั่นถึง 15/28/50 ตามช่วงจำนวน)
 *
 * ภาพประกอบทุกตัวเลือกอัปไว้ที่ Supabase Storage แล้ว (products/yuedpao-blank/*.jpg)
 * — ภาพเรทตัดจากภาพเปรียบเทียบงานสกรีนของร้าน (งานปัก / SUB / DTF / Flex print)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { hasQuoteOption, priceRange, RATE_LABEL, type PriceTier, type Product } from "../src/lib/products";

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

const ID = "yuedpao-blank";
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}.jpg`;

const UNIT = "ตัว";
const FRONT_LABEL = "ขนาดสกรีน ด้านหน้า";
const BACK_LABEL = "ขนาดสกรีน ด้านหลัง";
// งานปักของร้านทำด้านหน้าเป็นหลัก — ใส่ชื่อด้านไว้ในป้ายให้ตรงกับกลุ่มขนาดสกรีน
const EMB_LABEL = "ขนาดปัก ด้านหน้า";
const RATE_DTF = "พิมพ์ DTF/DFT";
const RATE_FLEX = "พิมพ์ FLEX";
const RATE_EMB = "งานปัก";

const S5 = "ไม่เกิน 5 นิ้ว";
const SA5 = "ไม่เกิน A5";
const SA3 = "ไม่เกิน A3";
const SIZES = [S5, SA5, SA3];

/** เลือกได้ด้านละ 1 ค่า — "ไม่สกรีน" ใช้ได้ด้านเดียว (กฎด้านล่างกันไม่ให้ว่างทั้งสองด้าน) */
const NO_SCREEN = "ไม่สกรีน";

/**
 * ตาราง "สกรีนมากกว่า 1 จุด" — ราคาต่อจุดที่เพิ่ม แยกตามขนาดสกรีน × ช่วงจำนวนจุด
 * ช่วงจำนวนจุด: 1-10 · 11-29 · 30-99 · 100-499 · 500 ขึ้นไป
 */
const POINT_FEE: Record<string, number[]> = {
  [S5]: [30, 25, 20, 18, 15],
  [SA5]: [45, 40, 35, 30, 28],
  [SA3]: [95, 90, 80, 60, 50],
};

/**
 * สร้างตารางราคาที่มี 2 แกน (ขนาดสกรีนด้านหน้า × ขนาดสกรีนด้านหลัง)
 * base = ราคาเสื้อสกรีนด้านเดียว ต่อขนาด · feeTier = ช่วงราคาจุดเพิ่มที่ใช้กับช่วงจำนวนตัวแต่ละช่วง
 * ด้านแรกที่มีลายคิดราคาเต็มตามขนาดของด้านนั้น · อีกด้าน (ถ้าสกรีน) บวกค่าจุดเพิ่มตามขนาดของด้านนั้นเอง
 * (สั่ง 11-29 ตัว สกรีนตัวละ 1 จุดเพิ่ม = 11-29 จุด จึงใช้ราคาช่วงเดียวกัน)
 */
function matrixBySide(tiers: PriceTier[], base: Record<string, number[]>, feeTier: number[]) {
  const cells: Record<string, number[]> = {};
  for (const front of [...SIZES, NO_SCREEN]) {
    for (const back of [NO_SCREEN, ...SIZES]) {
      // ไม่สกรีนทั้งสองด้าน = ไม่มีราคาในตารางของร้าน (กฎ rules กันไว้ไม่ให้เลือกได้อยู่แล้ว)
      if (front === NO_SCREEN && back === NO_SCREEN) continue;
      const first = front === NO_SCREEN ? back : front;
      const second = front === NO_SCREEN || back === NO_SCREEN ? null : back;
      cells[`${front}│${back}`] = base[first].map(
        (price, ti) => price + (second ? POINT_FEE[second][feeTier[ti]] : 0)
      );
    }
  }
  return { unit: UNIT, driverLabels: [FRONT_LABEL, BACK_LABEL], tiers, cells };
}

// ── เรท 1: DTF/DFT — 1-10 / 11-29 / 30-49 / 50-99 / 100 ตัวขึ้นไป
const DTF_TIERS: PriceTier[] = [
  { upTo: 10, label: "1-10 ตัว" },
  { upTo: 29, label: "11-29 ตัว" },
  { upTo: 49, label: "30-49 ตัว" },
  { upTo: 99, label: "50-99 ตัว" },
  { upTo: null, label: "100 ตัวขึ้นไป" },
];
const DTF = matrixBySide(
  DTF_TIERS,
  {
    [S5]: [350, 250, 220, 210, 200],
    [SA5]: [365, 265, 235, 225, 215],
    [SA3]: [390, 290, 260, 250, 240],
  },
  [0, 1, 2, 2, 3]
);

// ── เรท 2: FLEX — 1-10 / 11-29 / 30-49 / 50 ตัวขึ้นไป (ตั้งแต่ 11 ตัวทุกขนาดราคาเท่ากัน)
const FLEX_TIERS: PriceTier[] = [
  { upTo: 10, label: "1-10 ตัว" },
  { upTo: 29, label: "11-29 ตัว" },
  { upTo: 49, label: "30-49 ตัว" },
  { upTo: null, label: "50 ตัวขึ้นไป" },
];
const FLEX = matrixBySide(
  FLEX_TIERS,
  {
    [S5]: [350, 300, 280, 260],
    [SA5]: [365, 300, 280, 260],
    [SA3]: [390, 300, 280, 260],
  },
  [0, 1, 2, 2]
);

// ── เรท 3: งานปัก — แกนเดียว (ขนาดปัก) ไม่มีตารางจุดเพิ่ม
const EMB_TIERS: PriceTier[] = [
  { upTo: 10, label: "1-10 ตัว" },
  { upTo: 29, label: "11-29 ตัว" },
  { upTo: 49, label: "30-49 ตัว" },
  { upTo: null, label: "50 ตัวขึ้นไป" },
];
const E10 = "ไม่เกิน 10 ซม.";
const E15 = "ไม่เกิน 15 ซม.";
const E20 = "ไม่เกิน 20 ซม.";
const EMB = {
  unit: UNIT,
  driverLabels: [EMB_LABEL],
  tiers: EMB_TIERS,
  cells: {
    [E10]: [450, 420, 380, 360],
    [E15]: [650, 620, 580, 560],
    [E20]: [850, 820, 780, 760],
  },
};

const TABS: Product["tabs"] = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text:
      "เสื้อยืด Unisex ยี่ห้อ YUEDPAO (เสื้อยืดเปล่า) — ราคารวมค่าเสื้อ + ค่าสกรีนแล้ว ไม่มีขั้นต่ำในการสั่งผลิต\n" +
      "• สีเสื้อ: สีดำ | สีขาว — เสื้อสีดำ บวกเพิ่มตัวละ 10 บาท\n" +
      "• Size: S M L / XL XXL XXXL — ไซส์ XL ขึ้นไป บวกเพิ่มตัวละ 10 บาท\n" +
      "• จำนวน 1-10 ตัว คละลายได้ · 11 ตัวขึ้นไป คละลาย สั่งลายละ 3 ชิ้นขึ้นไป\n" +
      "• ไม่สามารถสกรีนป้ายไซส์ตรงคอได้\n\n" +
      "จุดเด่นเนื้อผ้า YUEDPAO::\n" +
      "• ไม่ย้วย รับประกันมากกว่า 2 ปี\n" +
      "• ไม่หด ไม่ต้องเผื่อไซส์\n" +
      "• ไม่ต้องรีด ซักตากใส่ได้เลย เนี้ยบ\n" +
      "• ไม่อมเหงื่อ เนื้อผ้าระบายอากาศดีเยี่ยม\n\n" +
      "สกรีน 2 ด้าน (ด้านที่สองคิดเพิ่มตามขนาดของด้านนั้น)::\n" +
      "• ขนาดไม่เกิน 5 นิ้ว — 1-10 จุด 30 · 11-29 จุด 25 · 30-99 จุด 20 · 100-499 จุด 18 · 500 จุดขึ้นไป 15\n" +
      "• ขนาดไม่เกิน A5 — 45 · 40 · 35 · 30 · 28\n" +
      "• ขนาดไม่เกิน A4/A3 — 95 · 90 · 80 · 60 · 50",
  },
  {
    title: "ระบบพิมพ์ที่เลือกได้",
    text:
      "พิมพ์ DTF/DFT::\n" +
      "• คุณภาพ: พิมพ์ภาพลงแผ่นฟิล์มด้วยหมึกสำหรับย้อมผ้า แล้วรีดร้อนติดบนเสื้อ ลายชัดเจน สีสด คมชัด\n" +
      "• ความทนทาน: ติดทนนาน ทนต่อการซักหลายครั้ง · ราคาปานกลาง\n" +
      "• ผิวสัมผัส: งานพิมพ์อยู่บนเนื้อผ้า สัมผัสด้าน นูน\n" +
      "• คุณสมบัติ: ยืดหยุ่นตามเนื้อผ้า ติดแน่นเรียบไปกับเนื้อผ้า พิมพ์ได้ทั้งผ้าสีอ่อนและสีเข้ม\n" +
      "• จุดเด่น: พิมพ์สีด้วยระบบ CMYK เหมาะกับผ้าหลากหลายชนิด\n" +
      "• ข้อจำกัด: ส่วนที่สกรีนลงผ้าจะปิดทึบ ไม่มีที่ระบายในส่วนนั้น และไม่สามารถรีดตรง ๆ บนงานได้\n\n" +
      "พิมพ์ FLEX::\n" +
      "• งานตัดฟิล์มสีรีดติดผ้า สีทึบเรียบ ขอบคม เหมาะกับตัวอักษร/โลโก้สีเดียวหรือไม่กี่สี\n" +
      "• ตั้งแต่ 11 ตัวขึ้นไป ทุกขนาดคิดราคาเท่ากัน\n\n" +
      "งานปัก::\n" +
      "• งานปักด้ายลงบนเนื้อผ้าโดยตรง ให้ผิวสัมผัสนูน ดูพรีเมียม ทนทานที่สุด\n" +
      "• คิดราคาตามขนาดงานปัก (ไม่เกิน 10 / 15 / 20 ซม.)",
  },
  {
    title: "วิธีสั่งงาน",
    text:
      "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
      '• เลือกระบบพิมพ์ ขนาดสกรีนด้านหน้า/ด้านหลัง สีเสื้อ และไซส์ แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n' +
      '• สกรีนทั้ง 2 ด้าน แนบลายทั้งสองไฟล์ในช่องเดียวกันได้ แล้วระบุในช่อง "หมายเหตุถึงร้าน" ว่าลายไหนอยู่ด้านหน้า ลายไหนอยู่ด้านหลัง\n' +
      '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ตำแหน่งสกรีน (อก/หลัง/แขน) · จำนวนแต่ละไซส์ · วันที่ต้องการใช้งาน\n' +
      "• สั่งหลายไซส์/หลายสี ให้เพิ่มลงตะกร้าแยกรายการตามไซส์และสีที่ต้องการ\n" +
      "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n" +
      "หรือสั่งทางอีเมล::\n" +
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n" +
      "• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n" +
      "• ระบุรายละเอียด: ระบบพิมพ์ · ขนาดสกรีนด้านหน้า/ด้านหลัง · สีเสื้อ · ไซส์และจำนวนแต่ละไซส์ · วันที่ใช้งาน (ถ้ามี)\n" +
      "• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
  },
  {
    title: "การเตรียมไฟล์",
    text:
      "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n" +
      "• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n" +
      "• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n" +
      "• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด\n" +
      "• งาน FLEX และงานปัก ควรเป็นลายเส้น/ตัวอักษรที่ไม่บางเกินไป",
  },
  {
    title: "การรับประกันสินค้า",
    text:
      "รับเคลม::\n" +
      "• สีเพี้ยนเกิน 10-15%\n" +
      "• จำนวนที่ได้รับไม่ครบถ้วน\n" +
      "• ไซส์/สีเสื้อผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n" +
      "• งานสกรีนหลุดลอกตั้งแต่ยังไม่ได้ใช้งาน\n\n" +
      "ไม่รับเคลม::\n" +
      "• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n" +
      "• สินค้าชำรุดจากการใช้งาน/การซักที่ไม่ถูกวิธีมาแล้ว\n\n" +
      "ระยะเวลาในการเคลม::\n" +
      "ภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
  },
];

const product: Product = {
  id: ID,
  slug: "unisex-yuedpao-blank",
  name: "เสื้อ Unisex YUEDPAO (ยืดเปล่า)",
  category: "apparel",
  price: 200,
  emoji: "👕",
  gradient: "from-slate-100 to-slate-300",
  imageSrc: IMG("gallery-1"),
  rating: 5,
  sold: 0,
  badge: "ใหม่",
  description:
    "เสื้อยืดคอกลม ทรง Unisex ยี่ห้อ YUEDPAO (เสื้อยืดเปล่า) พร้อมสกรีนลายตามสั่ง ไม่มีขั้นต่ำในการสั่งผลิต " +
    "เลือกระบบงานได้ 3 แบบ — พิมพ์ DTF/DFT สีสดคมชัดพิมพ์ได้ทั้งผ้าสีอ่อนและสีเข้ม, พิมพ์ FLEX ฟิล์มสีทึบขอบคมเหมาะกับตัวอักษร/โลโก้ " +
    "และงานปักด้ายที่ให้ผิวสัมผัสนูนดูพรีเมียม " +
    "เนื้อผ้า YUEDPAO ไม่ย้วยรับประกันมากกว่า 2 ปี ไม่หดไม่ต้องเผื่อไซส์ ไม่ต้องรีด และไม่อมเหงื่อ " +
    "มีให้เลือกสีขาวและสีดำ ไซส์ S ถึง 3XL เลือกขนาดสกรีนแยกด้านหน้า/ด้านหลังได้",
  highlights: [
    "เสื้อยืดเปล่า YUEDPAO ของแท้ — ไม่ย้วย รับประกันมากกว่า 2 ปี · ไม่หด ไม่ต้องเผื่อไซส์",
    "เลือกงานได้ 3 ระบบ — DTF/DFT · FLEX · งานปัก (มีภาพเปรียบเทียบให้ดูทุกแบบ)",
    "ไม่มีขั้นต่ำ — สั่ง 1 ตัวก็ได้ · 1-10 ตัวคละลายได้อิสระ",
    "ยิ่งสั่งเยอะยิ่งถูก — DTF เริ่มต้น 200 บาท/ตัว เมื่อสั่ง 100 ตัวขึ้นไป",
    "เลือกขนาดสกรีนแยกด้านหน้า/ด้านหลัง — สกรีน 2 ด้านคิดเพิ่มตามขนาดของด้านที่สอง",
    "สีขาว | สีดำ · ไซส์ S M L XL XXL XXXL",
  ],
  images: [
    { emoji: "👕", gradient: "from-slate-100 to-slate-300", label: "เสื้อ YUEDPAO สีขาว-สีดำ", src: IMG("gallery-1") },
    { emoji: "🎯", gradient: "from-sky-100 to-blue-200", label: "สกรีนขนาดไม่เกิน 5 นิ้ว (อกซ้าย)", src: IMG("gallery-2") },
    { emoji: "🖼️", gradient: "from-cyan-100 to-sky-200", label: "สกรีนขนาดใหญ่ (A3)", src: IMG("gallery-3") },
    { emoji: "🧵", gradient: "from-amber-100 to-yellow-200", label: "งานปักบนเสื้อสีดำ", src: IMG("gallery-4") },
    { emoji: "✨", gradient: "from-fuchsia-100 to-pink-200", label: "งาน FLEX บนเสื้อสีดำ", src: IMG("gallery-5") },
    { emoji: "🔍", gradient: "from-violet-100 to-indigo-200", label: "เทียบงาน DTF / FLEX / SUB / ปัก", src: IMG("gallery-6") },
    { emoji: "⚖️", gradient: "from-emerald-100 to-teal-200", label: "เทียบงาน SUB กับ DTF บนเสื้อตัวเดียวกัน", src: IMG("gallery-7") },
  ],
  priceRates: [
    {
      id: "dtf",
      label: RATE_DTF,
      desc: "พิมพ์ฟิล์มรีดร้อน สีสด คมชัด ระบบ CMYK · พิมพ์ได้ทั้งผ้าสีอ่อนและสีเข้ม",
      imageSrc: IMG("rate-dtf"),
      freeMixBelowQty: 11,
      minPerDesign: 3,
      pricing: DTF,
    },
    {
      id: "flex",
      label: RATE_FLEX,
      desc: "ฟิล์มสีทึบ ขอบคม เหมาะกับตัวอักษร/โลโก้ · 11 ตัวขึ้นไปทุกขนาดราคาเท่ากัน",
      imageSrc: IMG("rate-flex"),
      freeMixBelowQty: 11,
      minPerDesign: 3,
      pricing: FLEX,
    },
    {
      id: "embroidery",
      label: RATE_EMB,
      desc: "ปักด้ายลงเนื้อผ้าโดยตรง ผิวสัมผัสนูน ดูพรีเมียม ทนทานที่สุด",
      imageSrc: IMG("rate-emb"),
      freeMixBelowQty: 11,
      minPerDesign: 3,
      pricing: EMB,
    },
  ],
  // เรทราคา = "ระบบพิมพ์" ต้องเลือกก่อน จึงวางไว้ด้านบนตามค่าเริ่มต้น
  pricing: DTF,
  options: [
    {
      label: "ไซส์",
      stockBearing: true,
      choices: [
        { name: "S" },
        { name: "M" },
        { name: "L" },
        { name: "XL", extra: 10 },
        { name: "XXL", extra: 10 },
        { name: "XXXL", extra: 10 },
      ],
    },
    {
      label: "สีเสื้อ",
      stockBearing: true,
      choices: [
        { name: "สีขาว", imageSrc: IMG("color-white") },
        { name: "สีดำ", extra: 10, imageSrc: IMG("color-black") },
      ],
    },
    {
      // ด้านหน้าเป็นค่าตั้งต้น (สกรีนด้านเดียว) — เลือก "ไม่สกรีน" ได้ ถ้าลูกค้าเอาลายเฉพาะด้านหลัง
      label: FRONT_LABEL,
      showWhen: { label: RATE_LABEL, choices: [RATE_DTF, RATE_FLEX] },
      choices: [
        { name: S5, imageSrc: IMG("size-5in") },
        { name: SA5, imageSrc: IMG("size-a5") },
        { name: SA3, imageSrc: IMG("size-a3") },
        { name: NO_SCREEN },
      ],
    },
    {
      // ตั้งต้น "ไม่สกรีน" — ราคาเริ่มต้นจึงเท่ากับสกรีนด้านเดียวเหมือนเดิม
      label: BACK_LABEL,
      showWhen: { label: RATE_LABEL, choices: [RATE_DTF, RATE_FLEX] },
      choices: [
        { name: NO_SCREEN },
        { name: S5, imageSrc: IMG("size-5in") },
        { name: SA5, imageSrc: IMG("size-a5") },
        { name: SA3, imageSrc: IMG("size-a3") },
      ],
    },
    {
      label: EMB_LABEL,
      showWhen: { label: RATE_LABEL, choices: [RATE_EMB] },
      choices: [
        { name: E10, imageSrc: IMG("emb-10cm") },
        { name: E15, imageSrc: IMG("emb-15cm") },
        { name: E20, imageSrc: IMG("emb-20cm") },
      ],
    },
  ],
  // ด้านหน้า "ไม่สกรีน" แล้ว ด้านหลังต้องเลือกขนาด — กันสั่งเสื้อเปล่าที่ไม่มีราคาในตาราง
  rules: [{ when: { label: FRONT_LABEL, choice: NO_SCREEN }, limit: { label: BACK_LABEL, allow: SIZES } }],
  terms: [
    "ราคารวมค่าเสื้อยืดเปล่า YUEDPAO + ค่าสกรีนแล้ว · ไม่มีขั้นต่ำในการสั่งผลิต",
    "จำนวน 1-10 ตัว คละลายได้ · 11 ตัวขึ้นไป คละลาย สั่งลายละ 3 ชิ้นขึ้นไป",
    "เสื้อสีดำ บวกเพิ่มตัวละ 10 บาท",
    "ไซส์ XL, XXL, XXXL บวกเพิ่มตัวละ 10 บาท",
    "สกรีนด้านที่สอง คิดเพิ่มตามขนาดของด้านนั้น — ไม่เกิน 5 นิ้ว 30-15 บาท · A5 45-28 บาท · A4/A3 95-50 บาท (ยิ่งสั่งเยอะยิ่งถูก)",
    "ไม่สามารถสกรีนป้ายไซส์ตรงคอได้",
    "งาน FLEX ตั้งแต่ 11 ตัวขึ้นไป ทุกขนาดคิดราคาเท่ากัน",
    "ทางร้านใช้สีระบบ RGB สีงานสกรีนที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
    "งานผ้าอาจมีจุดดำจากฝุ่นเล็กน้อย มีการเคลื่อนของลายสกรีน และมีรอยยับของผ้า ซึ่งไม่กระทบกับการใช้งาน",
    "งานสกรีนบนผ้า ส่วนที่สกรีนจะปิดทึบ ไม่มีที่ระบายในส่วนนั้น และไม่สามารถรีดตรง ๆ บนงานได้",
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
for (const r of saved.priceRates ?? []) {
  console.log(` เรท ${r.label}: ${Object.keys(r.pricing.cells).length} ช่อง × ${r.pricing.tiers.length} ช่วง`);
}

if (!WRITE) {
  console.log("(ยังไม่เขียน — ใส่ --write เพื่อบันทึกลง Supabase)");
  process.exit(0);
}

async function main() {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  // มีสินค้าตัวนี้อยู่แล้ว = คงลำดับเดิมไว้ (รันซ้ำเพื่ออัปข้อมูลไม่ควรดันไปท้ายรายการ)
  const { data: cur } = await sb.from("products").select("sort").eq("id", ID).limit(1);
  const { data: maxRow } = await sb.from("products").select("sort").order("sort", { ascending: false }).limit(1);
  const sort = (cur?.[0]?.sort as number | undefined) ?? ((maxRow?.[0]?.sort as number | undefined) ?? 0) + 1;
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
