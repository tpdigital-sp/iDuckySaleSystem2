/**
 * สร้างสินค้า "เสื้อ OVER SIZE" จากตารางราคาเว็บ
 * iduckyofficial-pricelists.com/tshirtprinting — บล็อก "เสื้อ OVER SIZE · เสื้อยี่ห้อ AWESOME.BKK"
 * (ตามที่ผู้ใช้สั่ง 19 ส.ค. 69: ใช้ "ราคา" ของตาราง AWESOME.BKK แต่ตั้งชื่อสินค้าโดยไม่ระบุยี่ห้อ)
 *
 *   npx tsx scripts/add-oversize.ts                                # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   npx tsx scripts/add-oversize.ts --upload --images=<dir>        # อัปภาพขึ้น Supabase Storage
 *   npx tsx scripts/add-oversize.ts --write                        # เขียนลง Supabase (เป็นฉบับร่าง)
 *
 * ราคาจากเว็บ (4 แท็บของบล็อกนั้น) → 3 เรทราคา + แกน "ขนาดสกรีน ด้านหน้า/ด้านหลัง"
 *   1. พิมพ์ DTF/DFT  5 นิ้ว 520/490/480/460 · A5 530/490/480/460 · A4-A3 550/490/480/460
 *   2. พิมพ์ FLEX     ตัวเลขชุดเดียวกับ DTF ทุกช่อง (เว็บลงไว้เท่ากัน)
 *   3. งานปัก        10cm 650/620/580/560 · 15cm 850/820/780/760 · 20cm 1050/1020/980/960
 *   4. ตาราง "สกรีนมากกว่า 1 จุด" (DTF|Flex) เข้าเป็นแกนที่สองของตาราง
 *      — ลูกค้าเลือก "ขนาดสกรีน" แยกด้านหน้า/ด้านหลัง (เลือก "ไม่สกรีน" ได้ 1 ด้าน)
 *      — ด้านแรกที่มีลาย = ราคาเต็มตามขนาดของด้านนั้น · อีกด้านบวกค่าจุดเพิ่มตามขนาดของด้านนั้นเอง
 *        (30/45/95 บาท ลดหลั่นถึง 15/28/50 ตามช่วงจำนวน)
 *   เงื่อนไขใต้ตาราง: 1-10 ตัวคละลายได้ · 11 ตัวขึ้นไป คละลาย สั่งลายละ 3 ชิ้นขึ้นไป
 *   (บล็อกนี้ไม่มีค่าเสื้อสีดำ / ไซซ์ใหญ่บวกเพิ่ม แบบบล็อกเสื้อไม่มียี่ห้อ)
 *
 * ขนาดเสื้อ — ทางร้านให้มา 19 ส.ค. 69: มีไซซ์เดียว L รอบอก 44 · ยาว 28 · ไหล่ 19.5 · แขน 10 (นิ้ว)
 *   ⚠️ ไม่ได้ใช้ตารางไซซ์ AWESOME.BKK บนเว็บ (S-XL 40-52 นิ้ว) เพราะเป็นคนละตัวกับที่ร้านขายจริง
 *
 * ภาพประกอบทุกตัวเลือก — ดึงจากหน้าเดียวกันบนเว็บ (static.wixstatic.com/media/959b83_*)
 *   gallery-1..8   ตัวอย่างงานจริงในแท็บ DTF / FLEX / ปัก
 *   rate-*         ภาพประจำเรทราคา (ระบบพิมพ์)
 *   size-5in/a5/a4a3   ตัดจากอินโฟกราฟิก "screen size" ของเว็บ — เห็นขนาดสกรีนเทียบบนตัวเสื้อ
 *   flex-gloss/matte   ตัดจากภาพเทียบ "Flex ผิวเงา | ผิวด้าน"
 *   emb-10cm/15cm/20cm ตัวอย่างงานปัก · color-white/black ตัวอย่างสีเสื้อ
 *   compare-print  ภาพเทียบ DTF / Flex / SUB / ปัก · size-chart การ์ดตารางไซซ์ (วาดจากตัวเลขของร้าน)
 *   ⚠️ อัปภาพใหม่ทับ "ชื่อไฟล์เดิม" ไม่ได้ — Next/CDN แคชของเก่าไว้ ต้องตั้งชื่อไฟล์ใหม่เสมอ
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { hasQuoteOption, priceRange, RATE_LABEL, type PriceTier, type Product } from "../src/lib/products";

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

const ID = "oversize";
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}.jpg`;

const FILES = [
  "gallery-1",
  "gallery-2",
  "gallery-3",
  "gallery-4",
  "gallery-5",
  "gallery-6",
  "gallery-7",
  "gallery-8",
  "compare-print",
  "size-chart",
  "rate-dtf",
  "rate-flex",
  "rate-emb",
  "size-5in",
  "size-a5",
  "size-a4a3",
  "flex-gloss",
  "flex-matte",
  "emb-10cm",
  "emb-15cm",
  "emb-20cm",
  "color-white",
  "color-black",
];

const UNIT = "ตัว";
const FRONT_LABEL = "ขนาดสกรีน ด้านหน้า";
const BACK_LABEL = "ขนาดสกรีน ด้านหลัง";
const EMB_LABEL = "ขนาดปัก";
const FLEX_FINISH_LABEL = "ผิวงาน FLEX";
const RATE_DTF = "พิมพ์ DTF/DFT";
const RATE_FLEX = "พิมพ์ FLEX";
const RATE_EMB = "งานปัก";

const S5 = "ไม่เกิน 5 นิ้ว";
const SA5 = "ไม่เกิน A5";
const SA43 = "ไม่เกิน A4 / A3";
const SIZES = [S5, SA5, SA43];

/** เลือกได้ด้านละ 1 ค่า — "ไม่สกรีน" ใช้ได้ด้านเดียว (กฎด้านล่างกันไม่ให้ว่างทั้งสองด้าน) */
const NO_SCREEN = "ไม่สกรีน";

/**
 * ตาราง "สกรีนมากกว่า 1 จุด" — ราคาต่อจุดที่เพิ่ม แยกตามขนาดสกรีน × ช่วงจำนวนจุด
 * ช่วงจำนวนจุด: 1-10 · 11-29 · 30-99 · 100-499 · 500 ขึ้นไป
 */
const POINT_FEE: Record<string, number[]> = {
  [S5]: [30, 25, 20, 18, 15],
  [SA5]: [45, 40, 35, 30, 28],
  [SA43]: [95, 90, 80, 60, 50],
};

/**
 * ตารางราคา 2 แกน (ขนาดสกรีนด้านหน้า × ขนาดสกรีนด้านหลัง)
 * base = ราคาเสื้อสกรีนด้านเดียว ต่อขนาด · feeTier = ช่วงราคาจุดเพิ่มที่ใช้กับช่วงจำนวนตัวแต่ละช่วง
 * ด้านแรกที่มีลายคิดราคาเต็มตามขนาดของด้านนั้น · อีกด้าน (ถ้าสกรีน) บวกค่าจุดเพิ่ม "ตามขนาดของด้านนั้นเอง"
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

// ทั้ง 3 เรทของบล็อกนี้ใช้ช่วงจำนวนชุดเดียวกัน: 1-10 / 11-29 / 30-49 / 50 ตัวขึ้นไป
const TIERS: PriceTier[] = [
  { upTo: 10, label: "1-10 ตัว" },
  { upTo: 29, label: "11-29 ตัว" },
  { upTo: 49, label: "30-49 ตัว" },
  { upTo: null, label: "50 ตัวขึ้นไป" },
];
// ช่วงจำนวนตัว → ช่วงราคาจุดที่เพิ่ม (1-10 จุด, 11-29 จุด, 30-99 จุด, …)
const FEE_TIER = [0, 1, 2, 2];

// ── เรท 1: DTF/DFT
const DTF = matrixBySide(
  TIERS,
  {
    [S5]: [520, 490, 480, 460],
    [SA5]: [530, 490, 480, 460],
    [SA43]: [550, 490, 480, 460],
  },
  FEE_TIER
);

// ── เรท 2: FLEX — เว็บลงตัวเลขเท่ากับ DTF ทุกช่อง
const FLEX = matrixBySide(
  TIERS,
  {
    [S5]: [520, 490, 480, 460],
    [SA5]: [530, 490, 480, 460],
    [SA43]: [550, 490, 480, 460],
  },
  FEE_TIER
);

// ── เรท 3: งานปัก — แกนเดียว (ขนาดปัก) ไม่มีตารางจุดเพิ่ม
const E10 = "ไม่เกิน 10 ซม.";
const E15 = "ไม่เกิน 15 ซม.";
const E20 = "ไม่เกิน 20 ซม.";
const EMB = {
  unit: UNIT,
  driverLabels: [EMB_LABEL],
  tiers: TIERS,
  cells: {
    [E10]: [650, 620, 580, 560],
    [E15]: [850, 820, 780, 760],
    [E20]: [1050, 1020, 980, 960],
  },
};

const TABS: Product["tabs"] = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text:
      "เสื้อยืดคอกลม ทรง OVER SIZE — ราคารวมค่าเสื้อ + ค่าสกรีนแล้ว ไม่มีขั้นต่ำในการสั่งผลิต\n" +
      "• เนื้อผ้า: คอตตอน 100% NO.40 ทรงโอเวอร์ไซส์ · เนื้อหนา นุ่ม 180-190 gsm\n" +
      "• สีเสื้อ: สีขาว | สีดำ (ราคาเท่ากัน)\n" +
      "• ขนาด: มีไซซ์เดียว L — รอบอก 44 · ความยาว 28 · ไหล่ 19.5 · แขน 10 (นิ้ว)\n" +
      "• จำนวน 1-10 ตัว คละลายได้ · 11 ตัวขึ้นไป คละลาย สั่งลายละ 3 ชิ้นขึ้นไป\n" +
      "• เลือกงานได้ 3 ระบบ — พิมพ์ DTF/DFT · พิมพ์ FLEX (ผิวเงา/ผิวด้าน) · งานปัก\n" +
      "• เลือกขนาดสกรีนแยกด้านหน้า / ด้านหลังได้ — ด้านไหนไม่เอาลาย เลือก \"ไม่สกรีน\"\n\n" +
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
      "พิมพ์ FLEX (เลือกผิวเงา หรือ ผิวด้าน)::\n" +
      "• คุณภาพ: พิมพ์ภาพลงบน Flex ด้วยหมึก Solvent แล้วรีดร้อนติดบนเสื้อ สีทึบ ขอบคม\n" +
      "• ความทนทาน: ทนทานต่อการซักและรีดได้หลายครั้ง\n" +
      "• ผิวสัมผัส: งานพิมพ์อยู่บนเนื้อผ้า ผิวสัมผัสเป็นไปตามเนื้อ Flex ที่เลือก\n" +
      "• จุดเด่น: ใช้เตารีดรีดลงโดยตรงบน Flex ได้ · เหมาะกับตัวอักษร/โลโก้\n" +
      "• ข้อจำกัด: ไม่เหมาะกับงานที่มีรายละเอียดเล็ก ๆ\n\n" +
      "งานปัก::\n" +
      "• คุณภาพ: ปักด้ายลงบนเนื้อผ้าโดยตรง ให้ความเรียบหรู สวยงาม ผิวสัมผัสนูนของเส้นไหม\n" +
      "• ความทนทาน: ทนทานต่อการซักได้หลายครั้ง · คิดราคาตามขนาดงานปัก (10 / 15 / 20 ซม.)\n" +
      "• ข้อจำกัด: จำกัดเรื่องสีไหม เหมาะกับงานสีน้อย · แบบนอกเหนือจากทางร้าน ปักไม่เกิน 3 สีเข็ม " +
      "หากเกินคิดเพิ่มสีละ 10 บาทต่อแบบ",
  },
  {
    title: "ตารางไซซ์",
    text:
      "เสื้อ OVER SIZE มีไซซ์เดียว (หน่วยเป็นนิ้ว)::\n" +
      "• L — รอบอก 44 · ความยาว 28 · ไหล่ 19.5 · ความยาวแขน 10\n" +
      "• แต่ละไซซ์อาจมีความคลาดเคลื่อน + – ไม่เกินครึ่งนิ้ว\n\n" +
      "เนื้อผ้า::\n" +
      "• คอตตอน 100% NO.40 ทรงโอเวอร์ไซส์ · เนื้อหนา นุ่ม 180-190 gsm\n" +
      "• คอกลม แขนสั้น · มีสีขาวและสีดำ",
    images: [IMG("size-chart")],
    imageSize: "lg" as const,
  },
  {
    title: "วิธีสั่งงาน",
    text:
      "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
      '• เลือกระบบพิมพ์ ขนาดสกรีนด้านหน้า/ด้านหลัง และสีเสื้อ แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n' +
      '• สกรีนทั้ง 2 ด้าน แนบลายทั้งสองไฟล์ในช่องเดียวกันได้ แล้วระบุในช่อง "หมายเหตุถึงร้าน" ว่าลายไหนอยู่ด้านหน้า ลายไหนอยู่ด้านหลัง\n' +
      '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ตำแหน่งลายบนตัวเสื้อ (อกซ้าย/กลางอก/กลางหลัง) · จำนวนแต่ละสี · วันที่ต้องการใช้งาน\n' +
      "• สั่งหลายสี ให้เพิ่มลงตะกร้าแยกรายการตามสีที่ต้องการ\n" +
      "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n" +
      "หรือสั่งทางอีเมล::\n" +
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n" +
      "• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n" +
      "• ระบุรายละเอียด: ระบบพิมพ์ · ขนาดสกรีนด้านหน้า/ด้านหลัง · สีเสื้อ · จำนวน · วันที่ใช้งาน (ถ้ามี)\n" +
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
      "• สีเสื้อผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n" +
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
  slug: "tshirt-oversize",
  name: "เสื้อ OVER SIZE",
  category: "apparel",
  price: 460,
  emoji: "👕",
  gradient: "from-slate-100 to-slate-300",
  imageSrc: IMG("gallery-1"),
  rating: 5,
  sold: 0,
  badge: "ใหม่",
  description:
    "เสื้อยืดคอกลม ทรง OVER SIZE ผ้าคอตตอน 100% เนื้อหนานุ่ม 180-190 gsm พร้อมสกรีนลายตามสั่ง ไม่มีขั้นต่ำในการสั่งผลิต " +
    "เลือกระบบงานได้ 3 แบบ — พิมพ์ DTF/DFT สีสดคมชัดพิมพ์ได้ทั้งผ้าสีอ่อนและสีเข้ม, พิมพ์ FLEX ฟิล์มสีทึบขอบคมเลือกผิวเงาหรือผิวด้าน " +
    "และงานปักด้ายที่ให้ผิวสัมผัสนูนดูพรีเมียม " +
    "เลือกขนาดสกรีนได้ตั้งแต่ไม่เกิน 5 นิ้ว จนถึง A4/A3 และเลือกแยกได้ว่าจะสกรีนด้านหน้า ด้านหลัง หรือทั้งสองด้าน " +
    "มีสีขาวและสีดำ ทรงโอเวอร์ไซส์ไซซ์เดียวใส่ได้ทั้งชาย-หญิง ยิ่งสั่งเยอะยิ่งถูก เริ่มต้นตัวละ 460 บาท",
  highlights: [
    "ผ้าคอตตอน 100% NO.40 ทรงโอเวอร์ไซส์ — เนื้อหนา นุ่ม 180-190 gsm",
    "เลือกงานได้ 3 ระบบ — DTF/DFT · FLEX (ผิวเงา/ผิวด้าน) · งานปัก พร้อมภาพตัวอย่างทุกแบบ",
    "ไม่มีขั้นต่ำ — สั่ง 1 ตัวก็ได้ · 1-10 ตัวคละลายได้อิสระ",
    "ยิ่งสั่งเยอะยิ่งถูก — 50 ตัวขึ้นไป เหลือตัวละ 460 บาท ทุกขนาดสกรีน",
    "เลือกขนาดสกรีนแยกด้านหน้า/ด้านหลัง — สกรีน 2 ด้านคิดเพิ่มตามขนาดของด้านที่สอง",
    "สีขาว | สีดำ ราคาเท่ากัน · ไซซ์เดียว L (รอบอก 44 นิ้ว · ยาว 28 นิ้ว)",
  ],
  images: [
    { emoji: "👕", gradient: "from-slate-100 to-slate-300", label: "ทรง OVER SIZE ตัวจริงเมื่อสวมใส่", src: IMG("gallery-1") },
    { emoji: "🎨", gradient: "from-sky-100 to-blue-200", label: "มีสีขาวและสีดำ", src: IMG("gallery-2") },
    { emoji: "🎯", gradient: "from-cyan-100 to-sky-200", label: "สกรีนขนาดไม่เกิน 5 นิ้ว (อกซ้าย)", src: IMG("gallery-3") },
    { emoji: "🖼️", gradient: "from-blue-100 to-indigo-200", label: "สกรีนขนาดกลาง (A5) กลางอก", src: IMG("gallery-4") },
    { emoji: "🧩", gradient: "from-indigo-100 to-violet-200", label: "สกรีนขนาดใหญ่ (A4 / A3)", src: IMG("gallery-5") },
    { emoji: "✨", gradient: "from-fuchsia-100 to-pink-200", label: "งาน FLEX บนเสื้อสีดำ", src: IMG("gallery-6") },
    { emoji: "🧵", gradient: "from-amber-100 to-yellow-200", label: "งานปักบนเสื้อสีดำ", src: IMG("gallery-7") },
    { emoji: "🪡", gradient: "from-rose-100 to-orange-200", label: "งานปักบนเสื้อสีขาว", src: IMG("gallery-8") },
    { emoji: "⚖️", gradient: "from-emerald-100 to-teal-200", label: "เทียบงาน DTF / Flex / SUB / ปัก", src: IMG("compare-print") },
    { emoji: "📏", gradient: "from-slate-100 to-blue-100", label: "ตารางไซซ์ เสื้อ OVER SIZE", src: IMG("size-chart") },
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
      desc: "ฟิล์มสีทึบ ขอบคม เลือกผิวเงา/ผิวด้าน · เหมาะกับตัวอักษรและโลโก้",
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
      label: "ไซซ์",
      stockBearing: true,
      // ทรงโอเวอร์ไซส์ของร้านมีไซซ์เดียว — เก็บเป็นตัวเลือกไว้ให้ติดไปกับออเดอร์/ใบงาน
      choices: [{ name: "L (ไซซ์เดียว)", imageSrc: IMG("size-chart") }],
    },
    {
      label: "สีเสื้อ",
      stockBearing: true,
      choices: [
        { name: "สีขาว", imageSrc: IMG("color-white") },
        { name: "สีดำ", imageSrc: IMG("color-black") },
      ],
    },
    {
      // ด้านหน้าเป็นค่าตั้งต้น (สกรีนด้านเดียว) — เลือก "ไม่สกรีน" ได้ ถ้าลูกค้าเอาลายเฉพาะด้านหลัง
      label: FRONT_LABEL,
      showWhen: { label: RATE_LABEL, choices: [RATE_DTF, RATE_FLEX] },
      choices: [
        { name: S5, imageSrc: IMG("size-5in") },
        { name: SA5, imageSrc: IMG("size-a5") },
        { name: SA43, imageSrc: IMG("size-a4a3") },
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
        { name: SA43, imageSrc: IMG("size-a4a3") },
      ],
    },
    {
      label: FLEX_FINISH_LABEL,
      showWhen: { label: RATE_LABEL, choices: [RATE_FLEX] },
      choices: [
        { name: "ผิวเงา", imageSrc: IMG("flex-gloss") },
        { name: "ผิวด้าน", imageSrc: IMG("flex-matte") },
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
    "ราคารวมค่าเสื้อ OVER SIZE + ค่าสกรีนแล้ว · ไม่มีขั้นต่ำในการสั่งผลิต",
    "จำนวน 1-10 ตัว คละลายได้ · 11 ตัวขึ้นไป คละลาย สั่งลายละ 3 ชิ้นขึ้นไป",
    "เสื้อสีขาวและสีดำราคาเท่ากัน · ทรงโอเวอร์ไซส์มีไซซ์เดียว (L)",
    "สกรีนด้านที่สอง คิดเพิ่มตามขนาดของด้านนั้น — ไม่เกิน 5 นิ้ว 30-15 บาท · A5 45-28 บาท · A4/A3 95-50 บาท (ยิ่งสั่งเยอะยิ่งถูก)",
    "งานปักแบบนอกเหนือจากทางร้าน ปักได้ไม่เกิน 3 สีเข็ม หากเกินคิดเพิ่มสีละ 10 บาทต่อแบบ",
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

async function uploadImages() {
  if (!IMAGES_DIR) throw new Error("ต้องระบุ --images=<โฟลเดอร์ที่เตรียมไฟล์ไว้>");
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
  console.log(`   ราคา ${range.min}-${range.max} บาท/ตัว · ตัวเลือก ${saved.options.length} กลุ่ม · รูป ${saved.images.length} ภาพ`);
  for (const r of saved.priceRates ?? []) {
    console.log(`   เรท ${r.label}: ${Object.keys(r.pricing.cells).length} ช่อง × ${r.pricing.tiers.length} ช่วง`);
  }
  const withImg = saved.options.flatMap((o) => o.choices.filter((c) => c.imageSrc));
  console.log(`   ตัวเลือกที่มีภาพประกอบ: ${withImg.length}/${saved.options.flatMap((o) => o.choices).length} ตัว`);
  console.log(`   แท็บ: ${(saved.tabs ?? []).map((t) => t.title).join(" · ")}`);

  if (!WRITE) {
    console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
    return;
  }

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
  if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);
  console.log(`\n✅ บันทึกแล้ว: ${ID} (sort ${sort}) — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
