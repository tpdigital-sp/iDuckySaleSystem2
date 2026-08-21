/**
 * สร้างสินค้า "เสื้อ CROP" จากตารางราคาเว็บ
 * iduckyofficial-pricelists.com/tshirtprinting — บล็อก "เสื้อ CROP · เสื้อทั่วไป ไม่มียี่ห้อ"
 *
 *   npx tsx scripts/add-crop.ts                                # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   npx tsx scripts/add-crop.ts --upload --images=<dir>        # อัปภาพขึ้น Supabase Storage
 *   npx tsx scripts/add-crop.ts --write                        # เขียนลง Supabase (เป็นฉบับร่าง)
 *
 * ราคาจากเว็บ (5 แท็บของบล็อกนั้น) → 4 เรทราคา + แกน "ขนาดสกรีน ด้านหน้า/ด้านหลัง"
 *   1. พิมพ์ DTF/DFT   5 นิ้ว 280/220/180/175 · A5 295/220/180/175
 *   2. พิมพ์ FLEX      ตัวเลขชุดเดียวกับ DTF ทุกช่อง (เว็บลงไว้เท่ากัน) · เลือกผิวเงา/ผิวด้าน
 *   3. พิมพ์ซับลิเมชั่น 5 นิ้ว 280/210/170/160 · A5 270/210/170/160
 *   4. งานปัก          10 ซม. 370/340/310/300 · 15 ซม. 570/540/510/500
 *   ตาราง "สกรีนมากกว่า 1 จุด" เข้าเป็นแกนที่สอง (เลือกขนาดแยกด้านหน้า/ด้านหลัง · ด้านไหนไม่เอาลาย = "ไม่สกรีน")
 *   ด้านแรกที่มีลายคิดราคาเต็ม · อีกด้านบวกค่าจุดเพิ่มตามขนาดของด้านนั้น — เว็บแยกตารางจุดเพิ่มไว้ 2 ชุด
 *     DTF | Flex   5 นิ้ว 30/25/20/18/15 · A5 45/40/35/30/28 · A4-A3 95/90/80/60/50
 *     ซับลิเมชั่น  5 นิ้ว 30/25/20/18/15 · A5 40/35/30/25/18 · A4-A3 80/70/60/40/35
 *   (A4/A3 ไม่มีในตารางราคาเสื้อ CROP จึงเก็บไว้เป็นหมายเหตุ ไม่เปิดให้เลือก)
 *   เงื่อนไขใต้ตาราง: 1-10 ตัวคละลายได้ · 11 ตัวขึ้นไป คละลาย สั่งลายละ 3 ชิ้นขึ้นไป
 *
 * ขนาดเสื้อ — จากตาราง "Shirt Size Charts" ของร้าน (กลุ่ม No brand):
 *   CROP = Free size เดียว รอบอก 38 · ความยาว 15 · ความยาวแขน 8 (นิ้ว)
 *   สีเสื้อ: ดำ | ขาว | เบจ | ผ้าดิบ · วัสดุ Polyester ผสม Cotton เล็กน้อย เนื้อผ้าไม่หนามาก
 *   ซับลิเมชั่นพิมพ์ได้เฉพาะผ้าสีอ่อน จึงแยกกลุ่มสีของเรทนั้นไว้ต่างหาก (ไม่มีสีดำ)
 *
 * ภาพประกอบทุกตัวเลือก — ดึงจากหน้าเดียวกันบนเว็บ (static.wixstatic.com/media/959b83_*)
 *   gallery-1..4   ภาพเสื้อ CROP ตัวจริง (เบจ / ขาว / ดำ / แขวนราว)
 *   rate-*         ภาพประจำเรทราคา (ระบบพิมพ์)
 *   screen-5in/a5  ตัดจากอินโฟกราฟิก "screen size" ของร้าน — เห็นขนาดสกรีนเทียบบนตัวเสื้อ
 *   flex-gloss/matte ตัดจากภาพเทียบ "Flex ผิวเงา | ผิวด้าน" ของร้าน
 *   point-1..3     ผังตำแหน่งสกรีน 1/2/3 จุด (วาดเอง — หน้า/หลัง/แขน · เก็บไว้เฉย ๆ หลังเปลี่ยนมาเลือกขนาดรายด้าน)
 *   emb-10cm/15cm  ตัวอย่างงานปักเล็ก/ใหญ่ · color-*  สีเสื้อ (ผ้าดิบใช้แผ่นสีจากตารางไซซ์ของร้าน)
 *   compare-print  ภาพเทียบ DTF / Flex / SUB / ปัก · size-card ตารางไซซ์ CROP ของร้าน
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

const ID = "crop";
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}.jpg`;

const FILES = [
  "gallery-1",
  "gallery-2",
  "gallery-3",
  "gallery-4",
  "compare-print",
  "size-card",
  "rate-dtf",
  "rate-flex",
  "rate-sub",
  "rate-emb",
  "screen-5in",
  "screen-a5",
  "flex-gloss",
  "flex-matte",
  "emb-10cm",
  "emb-15cm",
  "color-black",
  "color-white",
  "color-beige",
  "color-natural",
  "point-1",
  "point-2",
  "point-3",
];

const UNIT = "ตัว";
const FRONT_LABEL = "ขนาดสกรีน ด้านหน้า";
const BACK_LABEL = "ขนาดสกรีน ด้านหลัง";
// งานปักของร้านทำด้านหน้าเป็นหลัก — ใส่ชื่อด้านไว้ในป้ายให้ตรงกับกลุ่มขนาดสกรีน
const EMB_LABEL = "ขนาดปัก ด้านหน้า";
const FLEX_FINISH_LABEL = "ผิวงาน FLEX";
const COLOR_LABEL = "สีเสื้อ";
const COLOR_SUB_LABEL = "สีเสื้อ (งานซับลิเมชั่น)";
const RATE_DTF = "พิมพ์ DTF/DFT";
const RATE_FLEX = "พิมพ์ FLEX";
const RATE_SUB = "พิมพ์ซับลิเมชั่น";
const RATE_EMB = "งานปัก";

const S5 = "ไม่เกิน 5 นิ้ว";
const SA5 = "ไม่เกิน A5";
const SIZES = [S5, SA5];

/** เลือกได้ด้านละ 1 ค่า — "ไม่สกรีน" ใช้ได้ด้านเดียว (กฎด้านล่างกันไม่ให้ว่างทั้งสองด้าน) */
const NO_SCREEN = "ไม่สกรีน";

/**
 * ตาราง "สกรีนมากกว่า 1 จุด" — ราคาต่อจุดที่เพิ่ม แยกตามขนาดสกรีน × ช่วงจำนวนจุด
 * ช่วงจำนวนจุด: 1-10 · 11-29 · 30-99 · 100-499 · 500 ขึ้นไป
 */
const POINT_FEE_PRINT: Record<string, number[]> = {
  [S5]: [30, 25, 20, 18, 15],
  [SA5]: [45, 40, 35, 30, 28],
};
const POINT_FEE_SUB: Record<string, number[]> = {
  [S5]: [30, 25, 20, 18, 15],
  [SA5]: [40, 35, 30, 25, 18],
};

// ทั้ง 4 เรทของบล็อกนี้ใช้ช่วงจำนวนชุดเดียวกัน: 1-10 / 11-29 / 30-49 / 50 ตัวขึ้นไป
const TIERS: PriceTier[] = [
  { upTo: 10, label: "1-10 ตัว" },
  { upTo: 29, label: "11-29 ตัว" },
  { upTo: 49, label: "30-49 ตัว" },
  { upTo: null, label: "50 ตัวขึ้นไป" },
];
// ช่วงจำนวนตัว → ช่วงราคาจุดที่เพิ่ม (1-10 จุด, 11-29 จุด, 30-99 จุด, …)
const FEE_TIER = [0, 1, 2, 2];

/**
 * ตารางราคา 2 แกน (ขนาดสกรีนด้านหน้า × ขนาดสกรีนด้านหลัง)
 * base = ราคาเสื้อสกรีนด้านเดียว ต่อขนาด · fee = ตารางจุดที่เพิ่มของระบบพิมพ์นั้น
 * ด้านแรกที่มีลายคิดราคาเต็มตามขนาดของด้านนั้น · อีกด้าน (ถ้าสกรีน) บวกค่าจุดเพิ่มตามขนาดของด้านนั้นเอง
 * (สั่ง 11-29 ตัว สกรีนตัวละ 1 จุดเพิ่ม = 11-29 จุด จึงใช้ราคาช่วงเดียวกัน)
 */
function matrixBySide(base: Record<string, number[]>, fee: Record<string, number[]>) {
  const cells: Record<string, number[]> = {};
  for (const front of [...SIZES, NO_SCREEN]) {
    for (const back of [NO_SCREEN, ...SIZES]) {
      // ไม่สกรีนทั้งสองด้าน = ไม่มีราคาในตารางของร้าน (กฎ rules กันไว้ไม่ให้เลือกได้อยู่แล้ว)
      if (front === NO_SCREEN && back === NO_SCREEN) continue;
      const first = front === NO_SCREEN ? back : front;
      const second = front === NO_SCREEN || back === NO_SCREEN ? null : back;
      cells[`${front}│${back}`] = base[first].map(
        (price, ti) => price + (second ? fee[second][FEE_TIER[ti]] : 0)
      );
    }
  }
  return { unit: UNIT, driverLabels: [FRONT_LABEL, BACK_LABEL], tiers: TIERS, cells };
}

// ── เรท 1: DTF/DFT
const DTF = matrixBySide({ [S5]: [280, 220, 180, 175], [SA5]: [295, 220, 180, 175] }, POINT_FEE_PRINT);

// ── เรท 2: FLEX — เว็บลงตัวเลขเท่ากับ DTF ทุกช่อง
const FLEX = matrixBySide({ [S5]: [280, 220, 180, 175], [SA5]: [295, 220, 180, 175] }, POINT_FEE_PRINT);

// ── เรท 3: ซับลิเมชั่น — ถูกกว่าอีกนิด และมีตารางจุดเพิ่มของตัวเอง
const SUB = matrixBySide({ [S5]: [280, 210, 170, 160], [SA5]: [270, 210, 170, 160] }, POINT_FEE_SUB);

// ── เรท 4: งานปัก — แกนเดียว (ขนาดปัก) ไม่มีตารางจุดเพิ่ม
const E10 = "ไม่เกิน 10 ซม.";
const E15 = "ไม่เกิน 15 ซม.";
const EMB = {
  unit: UNIT,
  driverLabels: [EMB_LABEL],
  tiers: TIERS,
  cells: {
    [E10]: [370, 340, 310, 300],
    [E15]: [570, 540, 510, 500],
  },
};

const TABS: Product["tabs"] = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text:
      "เสื้อ CROP (เสื้อครอป คอกลม) เสื้อทั่วไปไม่มียี่ห้อ — ราคารวมค่าเสื้อ + ค่าสกรีนแล้ว ไม่มีขั้นต่ำในการสั่งผลิต\n" +
      "• วัสดุ: Polyester ผสม Cotton เล็กน้อย · เนื้อผ้าไม่หนามาก ใส่สบาย ไม่ร้อน\n" +
      "• สีเสื้อ: ดำ | ขาว | เบจ | ผ้าดิบ (ราคาเท่ากันทุกสี)\n" +
      "• ขนาด: Free size ไซซ์เดียว — รอบอก 38 · ความยาว 15 · ความยาวแขน 8 (นิ้ว)\n" +
      "• จำนวน 1-10 ตัว คละลายได้ · 11 ตัวขึ้นไป คละลาย สั่งลายละ 3 ชิ้นขึ้นไป\n" +
      "• เลือกงานได้ 4 ระบบ — DTF/DFT · FLEX (ผิวเงา/ผิวด้าน) · ซับลิเมชั่น · งานปัก\n" +
      "• เลือกขนาดสกรีนแยกด้านหน้า / ด้านหลังได้ — ด้านไหนไม่เอาลาย เลือก \"ไม่สกรีน\"\n\n" +
      "สกรีน 2 ด้าน (ด้านที่สองคิดเพิ่มตามขนาดของด้านนั้น)::\n" +
      "• ระบบ DTF | Flex — ไม่เกิน 5 นิ้ว 30 · 25 · 20 · 18 · 15 บาท (ตามช่วงจำนวนจุด 1-10 / 11-29 / 30-99 / 100-499 / 500 ขึ้นไป)\n" +
      "• ระบบ DTF | Flex — ไม่เกิน A5 45 · 40 · 35 · 30 · 28 บาท\n" +
      "• ระบบซับลิเมชั่น — ไม่เกิน 5 นิ้ว 30 · 25 · 20 · 18 · 15 บาท · ไม่เกิน A5 40 · 35 · 30 · 25 · 18 บาท\n" +
      "• ขนาด A4/A3 ไม่มีในตารางราคาเสื้อ CROP (ตัวเสื้อสั้น) — ถ้าต้องการ สอบถามทางร้านก่อนสั่ง",
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
      "พิมพ์ซับลิเมชั่น::\n" +
      "• คุณภาพ: พิมพ์ภาพลงกระดาษซับลิเมชั่น แล้ววางทับบนผ้ารีดด้วยความร้อน ถ่ายเทน้ำหมึกลงในเนื้อผ้า\n" +
      "• ความทนทาน: ทนทานต่อการซักและรีดได้หลายครั้ง · สีไม่หลุด ทนต่อการขีดข่วน\n" +
      "• ผิวสัมผัส: ภาพพิมพ์ซึมลงในเนื้อผ้า ผิวสัมผัสเดียวกับเนื้อผ้า ไม่รู้สึกว่ามีลายทับอยู่\n" +
      "• ข้อจำกัด: พิมพ์ได้เฉพาะผ้าสีอ่อน และเนื้อผ้า TC TK เท่านั้น (เสื้อสีดำใช้ระบบนี้ไม่ได้)\n\n" +
      "งานปัก::\n" +
      "• คุณภาพ: ปักด้ายลงบนเนื้อผ้าโดยตรง ให้ความเรียบหรู สวยงาม ผิวสัมผัสนูนของเส้นไหม\n" +
      "• ความทนทาน: ทนทานต่อการซักได้หลายครั้ง · คิดราคาตามขนาดงานปัก (10 / 15 ซม.)\n" +
      "• ข้อจำกัด: จำกัดเรื่องสีไหม เหมาะกับงานสีน้อย · แบบนอกเหนือจากทางร้าน ปักไม่เกิน 3 สีเข็ม " +
      "หากเกินคิดเพิ่มสีละ 10 บาทต่อแบบ",
  },
  {
    title: "ตารางไซซ์",
    text:
      "เสื้อ CROP มีไซซ์เดียว Free size (หน่วยเป็นนิ้ว)::\n" +
      "• Free size — รอบอก 38 · ความยาว 15 · ความยาวแขน 8\n" +
      "• แต่ละไซซ์อาจมีความคลาดเคลื่อน + – ไม่เกินครึ่งนิ้ว\n\n" +
      "เนื้อผ้า::\n" +
      "• วัสดุเป็น Polyester ผสม Cotton เล็กน้อย · เนื้อผ้าไม่หนามาก\n" +
      "• ทรงคอกลม แขนสั้น ตัวสั้น (crop) · มีสีดำ ขาว เบจ และผ้าดิบ",
    images: [IMG("size-card")],
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
      "• ระบุรายละเอียด: ระบบพิมพ์ · ขนาดสกรีน · สีเสื้อ · จำนวน · วันที่ใช้งาน (ถ้ามี)\n" +
      "• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
  },
  {
    title: "การเตรียมไฟล์",
    text:
      "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n" +
      "• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n" +
      "• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n" +
      "• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด\n" +
      "• เสื้อ CROP ตัวสั้น (ยาว 15 นิ้ว) ลายแนวตั้งที่สูงมากอาจวางไม่พอดี แนะนำลายไม่เกิน A5\n" +
      "• งาน FLEX และงานปัก ควรเป็นลายเส้น/ตัวอักษรที่ไม่บางเกินไป",
  },
  {
    title: "ข้อจำกัดในการผลิต",
    text:
      "🛑 ทางร้านใช้สีระบบ RGB สีงานสกรีนที่ได้ออกมาอาจสว่างกว่าหรือดรอปลงตามความแตกต่างของไฟล์งาน ±5% ถึง ±15%\n" +
      "🛑 งานผ้าจะมีจุดดำที่เกิดจากฝุ่นบ้างเล็กน้อย มีการเคลื่อนของลายสกรีน และมีรอยยับของผ้า ซึ่งไม่กระทบกับการใช้งาน\n" +
      "🛑 งานพิมพ์ซับลิเมชั่นเป็นงานถ่ายเทสีด้วยความร้อน อุณหภูมิมีผลกับสีที่พิมพ์ออกมา สีอาจสว่างกว่าหรือดรอปลง ±5% ถึง ±15%\n" +
      "🛑 ซับลิเมชั่นพิมพ์ได้เฉพาะผ้าสีอ่อน (ขาว | เบจ | ผ้าดิบ) และเนื้อผ้า TC TK เท่านั้น",
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
  slug: "tshirt-crop",
  name: "เสื้อ CROP",
  category: "apparel",
  price: 160,
  emoji: "👚",
  gradient: "from-stone-100 to-stone-300",
  imageSrc: IMG("gallery-1"),
  rating: 5,
  sold: 0,
  badge: "ใหม่",
  description:
    "เสื้อ CROP (เสื้อครอป) คอกลมแขนสั้น เนื้อผ้า Polyester ผสม Cotton เล็กน้อย ใส่สบายไม่ร้อน พร้อมสกรีนลายตามสั่ง ไม่มีขั้นต่ำในการสั่งผลิต " +
    "เลือกระบบงานได้ 4 แบบ — พิมพ์ DTF/DFT สีสดคมชัดพิมพ์ได้ทั้งผ้าสีอ่อนและสีเข้ม, พิมพ์ FLEX ฟิล์มสีทึบขอบคมเลือกผิวเงาหรือผิวด้าน, " +
    "พิมพ์ซับลิเมชั่นที่สีซึมลงเนื้อผ้าจนไม่รู้สึกว่ามีลายทับอยู่ และงานปักด้ายที่ให้ผิวสัมผัสนูนดูพรีเมียม " +
    "เลือกขนาดสกรีนได้ตั้งแต่ไม่เกิน 5 นิ้ว ถึง A5 และเลือกแยกได้ว่าจะสกรีนด้านหน้า ด้านหลัง หรือทั้งสองด้าน " +
    "มี 4 สี ดำ | ขาว | เบจ | ผ้าดิบ ไซซ์ Free size ยิ่งสั่งเยอะยิ่งถูก เริ่มต้นตัวละ 160 บาท",
  highlights: [
    "เสื้อครอปคอกลม เนื้อผ้า Polyester ผสม Cotton เล็กน้อย — เนื้อผ้าไม่หนามาก ใส่สบาย",
    "เลือกงานได้ 4 ระบบ — DTF/DFT · FLEX (ผิวเงา/ผิวด้าน) · ซับลิเมชั่น · งานปัก พร้อมภาพตัวอย่างทุกแบบ",
    "ไม่มีขั้นต่ำ — สั่ง 1 ตัวก็ได้ · 1-10 ตัวคละลายได้อิสระ",
    "ยิ่งสั่งเยอะยิ่งถูก — 50 ตัวขึ้นไป เริ่มต้นตัวละ 160 บาท (ซับลิเมชั่น) · 175 บาท (DTF/FLEX)",
    "เลือกขนาดสกรีนแยกด้านหน้า/ด้านหลัง — สกรีน 2 ด้านคิดเพิ่มตามขนาดของด้านที่สอง",
    "4 สี ดำ | ขาว | เบจ | ผ้าดิบ ราคาเท่ากัน · Free size รอบอก 38 นิ้ว · ยาว 15 นิ้ว",
  ],
  images: [
    { emoji: "👚", gradient: "from-stone-100 to-stone-300", label: "เสื้อ CROP สีเบจ สกรีนลายขนาด A5", src: IMG("gallery-1") },
    { emoji: "🤍", gradient: "from-slate-50 to-slate-200", label: "เสื้อ CROP สีขาว สกรีนลายเล็กกลางอก", src: IMG("gallery-2") },
    { emoji: "🖤", gradient: "from-zinc-200 to-zinc-400", label: "เสื้อ CROP สีดำ สกรีนลายขนาด 5 นิ้ว", src: IMG("gallery-3") },
    { emoji: "🧷", gradient: "from-neutral-100 to-neutral-300", label: "ทรงเสื้อ CROP ตัวจริง (ตัวสั้น คอกลม)", src: IMG("gallery-4") },
    { emoji: "⚖️", gradient: "from-emerald-100 to-teal-200", label: "เทียบงาน DTF / Flex / SUB / ปัก", src: IMG("compare-print") },
    { emoji: "📏", gradient: "from-slate-100 to-blue-100", label: "ตารางไซซ์ เสื้อ CROP (Free size)", src: IMG("size-card") },
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
      id: "sublimation",
      label: RATE_SUB,
      desc: "สีซึมลงเนื้อผ้า ผิวสัมผัสเดียวกับผ้า ไม่รู้สึกว่ามีลายทับ · เฉพาะผ้าสีอ่อน",
      imageSrc: IMG("rate-sub"),
      freeMixBelowQty: 11,
      minPerDesign: 3,
      pricing: SUB,
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
      // เสื้อ CROP ของร้านมีไซซ์เดียว — เก็บเป็นตัวเลือกไว้ให้ติดไปกับออเดอร์/ใบงาน
      choices: [{ name: "Free size (อก 38 · ยาว 15 นิ้ว)", imageSrc: IMG("size-card") }],
    },
    {
      label: COLOR_LABEL,
      stockBearing: true,
      showWhen: { label: RATE_LABEL, choices: [RATE_DTF, RATE_FLEX, RATE_EMB] },
      choices: [
        { name: "สีดำ", imageSrc: IMG("color-black") },
        { name: "สีขาว", imageSrc: IMG("color-white") },
        { name: "สีเบจ", imageSrc: IMG("color-beige") },
        { name: "สีผ้าดิบ", imageSrc: IMG("color-natural") },
      ],
    },
    {
      // ซับลิเมชั่นพิมพ์ได้เฉพาะผ้าสีอ่อน — ตัดสีดำออกจากกลุ่มนี้
      label: COLOR_SUB_LABEL,
      stockBearing: true,
      showWhen: { label: RATE_LABEL, choices: [RATE_SUB] },
      choices: [
        { name: "สีขาว", imageSrc: IMG("color-white") },
        { name: "สีเบจ", imageSrc: IMG("color-beige") },
        { name: "สีผ้าดิบ", imageSrc: IMG("color-natural") },
      ],
    },
    {
      // ด้านหน้าเป็นค่าตั้งต้น (สกรีนด้านเดียว) — เลือก "ไม่สกรีน" ได้ ถ้าลูกค้าเอาลายเฉพาะด้านหลัง
      label: FRONT_LABEL,
      showWhen: { label: RATE_LABEL, choices: [RATE_DTF, RATE_FLEX, RATE_SUB] },
      choices: [
        { name: S5, imageSrc: IMG("screen-5in") },
        { name: SA5, imageSrc: IMG("screen-a5") },
        { name: NO_SCREEN },
      ],
    },
    {
      // ตั้งต้น "ไม่สกรีน" — ราคาเริ่มต้นจึงเท่ากับสกรีนด้านเดียวเหมือนเดิม
      label: BACK_LABEL,
      showWhen: { label: RATE_LABEL, choices: [RATE_DTF, RATE_FLEX, RATE_SUB] },
      choices: [
        { name: NO_SCREEN },
        { name: S5, imageSrc: IMG("screen-5in") },
        { name: SA5, imageSrc: IMG("screen-a5") },
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
      ],
    },
  ],
  // ด้านหน้า "ไม่สกรีน" แล้ว ด้านหลังต้องเลือกขนาด — กันสั่งเสื้อเปล่าที่ไม่มีราคาในตาราง
  rules: [{ when: { label: FRONT_LABEL, choice: NO_SCREEN }, limit: { label: BACK_LABEL, allow: SIZES } }],
  terms: [
    "ราคารวมค่าเสื้อ CROP + ค่าสกรีนแล้ว · ไม่มีขั้นต่ำในการสั่งผลิต",
    "จำนวน 1-10 ตัว คละลายได้ · 11 ตัวขึ้นไป คละลาย สั่งลายละ 3 ชิ้นขึ้นไป",
    "ทุกสีราคาเท่ากัน · เสื้อ CROP มีไซซ์เดียว Free size (รอบอก 38 · ยาว 15 · แขน 8 นิ้ว)",
    "สกรีนด้านที่สอง คิดเพิ่มตามขนาดของด้านนั้น — DTF/Flex: 5 นิ้ว 30-15 บาท · A5 45-28 บาท | ซับลิเมชั่น: 5 นิ้ว 30-15 บาท · A5 40-18 บาท (ยิ่งสั่งเยอะยิ่งถูก)",
    "งานซับลิเมชั่นพิมพ์ได้เฉพาะผ้าสีอ่อน (ขาว | เบจ | ผ้าดิบ) และเนื้อผ้า TC TK เท่านั้น",
    "งานปักแบบนอกเหนือจากทางร้าน ปักได้ไม่เกิน 3 สีเข็ม หากเกินคิดเพิ่มสีละ 10 บาทต่อแบบ",
    "ทางร้านใช้สีระบบ RGB สีงานสกรีนที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
    "งานผ้าอาจมีจุดดำจากฝุ่นเล็กน้อย มีการเคลื่อนของลายสกรีน และมีรอยยับของผ้า ซึ่งไม่กระทบกับการใช้งาน",
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
