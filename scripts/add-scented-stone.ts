/**
 * สร้างสินค้า "แผ่นหินน้ำหอม (Scented Stone)" จากตารางราคาเว็บ
 *
 *   npx tsx scripts/add-scented-stone.ts                                    # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   node scripts/scented-stone-art.mjs --sheet                              # เตรียมภาพ + คอนแทคชีตไว้ตรวจ
 *   npx tsx scripts/add-scented-stone.ts --upload --images=.cache/scented-stone/upload
 *   npx tsx scripts/add-scented-stone.ts --write                            # เขียนลง Supabase (เป็นฉบับร่าง)
 *
 * ที่มา: iduckyofficial-pricelists.com/รับทำแผ่นหินน้ำหอม — ตารางที่ 1 ของหน้า "ราคาแผ่นหินน้ำหอม"
 *
 *   จำนวน      | แผ่นหินน้ำหอม | add on → | ถุงผ้า 10x10cm | ถุงผ้า 11x13cm | ถุงหูรูด 11x12.5cm
 *   1-10       | 140           |    +     | 100            | 110            | 120
 *   11-29      | 100           |    +     |  95            | 105            | 110
 *   30-49      |  90           |    +     |  90            | 100            | 100
 *   50 ขึ้นไป  |  85           |    +     |  85            |  95            |  90
 *
 * ⚠️ คอลัมน์ถุงเป็น "add on" (มีคอลัมน์ + คั่นไว้ในตาราง) = บวกเพิ่มจากราคาแผ่นหิน ไม่ใช่ราคาแทน
 *    ตารางในระบบนี้เก็บ "ราคาต่อแผ่นรวมแล้ว" จึงบวกให้เสร็จตั้งแต่ในสคริปต์ (ดู PRICE ด้านล่าง)
 *    ตัวเลขดิบของเว็บอยู่ที่ STONE / BAG_ADD เผื่อวันหลังเว็บปรับราคาแล้วต้องแก้ตาม
 *
 * ⚠️ ตารางที่ 2 ของหน้าเดียวกันคือ "ถุงหอม เม็ดบีช" ซึ่งเป็นสินค้าคนละตัว (ยังไม่มีในระบบ)
 *    จึงไม่ดึงมารวมที่นี่
 *
 * ⚠️ ทรงทั้ง 4 (Plum blossom · Circle · Rhombus · Oval) เว็บคิดราคาเท่ากันหมด
 *    ตารางราคาจึงมีแกนเดียวคือ "ถุงบรรจุ" ส่วนทรงเป็นตัวเลือกที่ไม่กระทบราคา
 *
 * ⚠️ เนื้อผ้าถุง 3 ชนิด (ซาตินอินโด · ดัชเชส · บาร์บี้) เว็บไม่มีรูปแยกให้ — ตัวเลือกกลุ่มนี้จึงยังไม่มีภาพประจำตัว
 *    ถ้าร้านถ่ายรูปผ้าทั้ง 3 ชนิดมาเมื่อไหร่ ใส่ไฟล์ fabric-*.jpg แล้วผูก imageSrc ที่ FABRIC_IMG ได้เลย
 *
 * ภาพ: เตรียมด้วย scripts/scented-stone-art.mjs (รูปงานจริงจากหน้า pricelists ของร้านเอง)
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ขึ้นรุ่นใหม่ให้ขยับ REV
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

const ID = "scented-stone";
const REV = "v1";
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}-${REV}.jpg`;

const UNIT = "แผ่น";
const SHAPE_LABEL = "ทรงแผ่นหิน";
const BAG_LABEL = "ถุงบรรจุ";
const FABRIC_LABEL = "เนื้อผ้าถุง";

const SH_PLUM = "Plum blossom (ดอกไม้) ~6.9x6.6 ซม.";
const SH_CIRCLE = "Circle (วงกลม) ~6.8 ซม.";
const SH_RHOMBUS = "Rhombus ~5x9 ซม.";
const SH_OVAL = "Oval (วงรี) ~5x9.2 ซม.";
const SHAPES = [SH_PLUM, SH_CIRCLE, SH_RHOMBUS, SH_OVAL];

const B_NONE = "ไม่ใส่ถุง (เฉพาะแผ่นหิน)";
const B_P10 = "ถุงผ้า 10x10 ซม.";
const B_P13 = "ถุงผ้า 11x13 ซม.";
const B_DRAW = "ถุงหูรูด 11x12.5 ซม.";
const BAGS = [B_NONE, B_P10, B_P13, B_DRAW];

const F_SATIN = "ผ้าซาตินอินโด";
const F_DUCHESS = "ผ้าดัชเชส";
const F_BARBIE = "ผ้าบาร์บี้";
const FABRICS = [F_SATIN, F_DUCHESS, F_BARBIE];

/** ตัวเลขดิบจากเว็บ เรียงตามช่วงจำนวน 1-10 / 11-29 / 30-49 / 50+ */
const STONE = [140, 100, 90, 85];
const BAG_ADD: Record<string, number[]> = {
  [B_NONE]: [0, 0, 0, 0],
  [B_P10]: [100, 95, 90, 85],
  [B_P13]: [110, 105, 100, 95],
  [B_DRAW]: [120, 110, 100, 90],
};

/** ราคา/แผ่นที่ลูกค้าจ่ายจริง = ราคาแผ่นหิน + ค่าถุง (add on) ของช่วงจำนวนเดียวกัน */
const PRICE: Record<string, number[]> = Object.fromEntries(
  BAGS.map((bag) => [bag, STONE.map((s, i) => s + BAG_ADD[bag][i])])
);

const TIERS: PriceTier[] = [
  { upTo: 10, label: "1-10 แผ่น" },
  { upTo: 29, label: "11-29 แผ่น" },
  { upTo: 49, label: "30-49 แผ่น" },
  { upTo: null, label: "50 แผ่นขึ้นไป" },
];

const PRICING: PriceMatrix = {
  unit: UNIT,
  driverLabels: [BAG_LABEL],
  tiers: TIERS,
  cells: Object.fromEntries(BAGS.map((bag) => [bag, PRICE[bag]])),
};

/** ภาพประจำตัวเลือก — ทรงและถุงมีภาพครบทุกตัว ลูกค้าเห็นหน้าตาก่อนเลือก */
const SHAPE_IMG: Record<string, string> = {
  [SH_PLUM]: IMG("shape-plum"),
  [SH_CIRCLE]: IMG("shape-circle"),
  [SH_RHOMBUS]: IMG("shape-rhombus"),
  [SH_OVAL]: IMG("shape-oval"),
};
const BAG_IMG: Record<string, string> = {
  [B_NONE]: IMG("bag-none"),
  [B_P10]: IMG("bag-pouch10"),
  [B_P13]: IMG("bag-pouch13"),
  [B_DRAW]: IMG("bag-drawstring"),
};

const options: ProductOption[] = [
  {
    label: SHAPE_LABEL,
    stockBearing: true,
    choices: SHAPES.map((name) => ({
      name,
      imageSrc: SHAPE_IMG[name],
      ...(name === SH_PLUM ? { popular: true } : {}),
    })),
  },
  {
    label: BAG_LABEL,
    stockBearing: true,
    choices: BAGS.map((name) => ({
      name,
      imageSrc: BAG_IMG[name],
      ...(name === B_NONE ? { popular: true } : {}),
    })),
  },
  {
    // เว็บไม่มีรูปแยกของผ้าแต่ละชนิด — กลุ่มนี้จึงยังไม่มีภาพประจำตัวเลือก (ดูหมายเหตุหัวไฟล์)
    label: FABRIC_LABEL,
    showWhen: { label: BAG_LABEL, choices: [B_P10, B_P13, B_DRAW] },
    choices: FABRICS.map((name) => ({ name, ...(name === F_SATIN ? { popular: true } : {}) })),
  },
];

const TABS: Product["tabs"] = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text:
      "แผ่นหินน้ำหอม (Scented Stone) — แผ่นหินหอมพิมพ์ลายตามสั่งด้วยระบบ UV Printing ไม่มีขั้นต่ำในการสั่งผลิต\n" +
      "• ทำได้ 4 ทรง: Plum blossom (ดอกไม้) · Circle · Rhombus · Oval · ทุกทรงหนา 1 ซม.\n" +
      "• แถมน้ำหอมระเหยกลิ่น Holiday ปริมาณ 2 ml ไปด้วยทุกแผ่น\n" +
      "• **ลูกค้าฉีดพ่นน้ำหอมลงบนแผ่นหินเอง**\n" +
      "• เลือกใส่ถุงผ้าพิมพ์ลายเพิ่มได้ 3 แบบ (10x10 ซม. · 11x13 ซม. · ถุงหูรูด 11x12.5 ซม.)\n" +
      "• ถุงผ้าเลือกเนื้อผ้าได้ 3 ชนิด: ซาตินอินโด · ดัชเชส · บาร์บี้ · พิมพ์ระบบซับลิเมชั่น\n" +
      "• ราคาต่อแผ่นในระบบนี้รวมค่าถุงที่เลือกไว้แล้ว — ไม่ต้องบวกเอง",
    images: [IMG("photo-1"), IMG("photo-2"), IMG("photo-4")],
    imageSize: "md" as const,
  },
  {
    title: "ทรง และ ขนาด",
    text:
      "ทุกทรงหนา 1 ซม. เลือกได้ 4 แบบ::\n" +
      "• Plum blossom (ดอกไม้) — ขนาดประมาณ 6.9x6.6 ซม.\n" +
      "• Circle (วงกลม) — ขนาดประมาณ 6.8 ซม.\n" +
      "• Rhombus — ขนาดประมาณ 5x9 ซม. (ทรงป้ายห้อยเหลี่ยม ตามภาพ)\n" +
      "• Oval (วงรี) — ขนาดประมาณ 5x9.2 ซม.\n\n" +
      "หมายเหตุ::\n" +
      "• ทุกทรงเจาะรูสำหรับร้อยเชือกห้อยมาให้\n" +
      "• ราคาทั้ง 4 ทรงเท่ากัน เลือกทรงไหนก็ไม่กระทบราคา",
    images: [IMG("shape-plum"), IMG("shape-circle"), IMG("shape-rhombus"), IMG("shape-oval")],
    imageSize: "md" as const,
  },
  {
    title: "น้ำหอมที่แถมไปด้วย",
    text:
      "แผ่นหินทุกแผ่นแถมน้ำหอมไปด้วย::\n" +
      "• น้ำหอมระเหยกลิ่น Holiday ปริมาณ 2 ml\n" +
      "• **ลูกค้าฉีดพ่นน้ำหอมลงบนแผ่นหินเอง** — ทางร้านไม่ได้ฉีดมาให้ล่วงหน้า\n" +
      "• เนื้อหินซึมซับน้ำหอมได้ กลิ่นจะค่อย ๆ ระเหยออกมา เติมน้ำหอมซ้ำได้เมื่อกลิ่นจาง\n\n" +
      "อยากได้กลิ่นอื่นหรือปริมาณมากกว่านี้ แจ้งในช่อง \"หมายเหตุถึงร้าน\" ให้แอดมินประเมินให้",
    images: [IMG("set-perfume"), IMG("photo-4")],
    imageSize: "md" as const,
  },
  {
    title: "ถุงผ้า / ถุงหูรูด",
    text:
      "เลือกใส่ถุงเพิ่มได้ 3 แบบ (ราคาบวกเพิ่มตามตาราง ระบบคิดรวมให้แล้ว)::\n" +
      "• ถุงผ้า 10x10 ซม. — เป็นแบบเชือกห้อยสีขาว เย็บติดกับถุงผ้า\n" +
      "• ถุงผ้า 11x13 ซม. — เจาะรูห้อยเชือกสีขาว\n" +
      "• ถุงหูรูด 11x12.5 ซม. — แบบรูดปากถุง มีสายหิ้ว\n\n" +
      "เนื้อผ้ามีให้เลือก 3 ชนิด::\n" +
      "• ผ้าซาตินอินโด · ผ้าดัชเชส · ผ้าบาร์บี้\n\n" +
      "ข้อควรรู้::\n" +
      "• ถุงผ้าพิมพ์ด้วยระบบ Sublimation Printing (คนละระบบกับแผ่นหินที่พิมพ์ UV)\n" +
      "• ถุงผ้าแต่ละใบจะมีความคลาดเคลื่อน 2-5 ซม.",
    images: [IMG("bag-pouch10"), IMG("bag-pouch13"), IMG("bag-drawstring"), IMG("photo-5"), IMG("bag-hole")],
    imageSize: "md" as const,
  },
  {
    title: "ข้อจำกัดงานพิมพ์",
    text:
      "🚨 ข้อจำกัดในการผลิต::\n" +
      "• ทางร้านใช้สีระบบ R G B สีงานสกรีนที่ได้ออกมาอาจสว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน ±5% ถึง ±15%\n" +
      "• ความคลาดเคลื่อนในการตัด: การตัดชิ้นงานอาจมีความคลาดเคลื่อน ±0.5-2 มม. เนื่องจากข้อจำกัดของเครื่องตัด\n" +
      "• ถุงผ้าแต่ละใบจะมีความคลาดเคลื่อน 2-5 ซม.\n" +
      "• เนื้อหินเป็นวัสดุธรรมชาติ ผิวและเฉดพื้นของแต่ละแผ่นอาจต่างกันเล็กน้อย",
  },
  {
    title: "วิธีสั่งงาน",
    text:
      "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
      "• เลือกทรงแผ่นหิน · ถุงบรรจุ · เนื้อผ้าถุง แล้วใส่จำนวน\n" +
      '• แนบภาพลาย (JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n' +
      '• ระบุรายละเอียดเพิ่มในช่อง "หมายเหตุถึงร้าน" เช่น กลิ่นน้ำหอม · วันที่ใช้งาน\n' +
      "• สั่งหลายลาย ให้เพิ่มลงตะกร้าแยกรายการตามลาย\n\n" +
      "หรือสั่งทางอีเมล::\n" +
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com · หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n" +
      "• ระบุ: ประเภทงาน · ขนาด/ทรง · ถุงที่ต้องการ · จำนวน · วันที่ใช้งาน (ถ้ามี)\n" +
      "• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)\n" +
      "• ไฟล์นามสกุล .Ai .Psd .PNG พื้นหลังใส",
  },
  {
    title: "การรับประกันสินค้า",
    text:
      "รับเคลม::\n" +
      "• สีเพี้ยนเกิน 10-15%\n" +
      "• จำนวนที่ได้รับไม่ครบถ้วน\n" +
      "• วัสดุหรืออะไหล่ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n" +
      "• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\n" +
      "ไม่รับเคลม::\n" +
      "• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n" +
      "• สินค้าชำรุดจากการใช้งานมาแล้ว\n\n" +
      "ระยะเวลาในการเคลม::\n" +
      "ภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
  },
];

const seo: Product["seo"] = {
  title: "รับทำ แผ่นหินน้ำหอม Scented Stone พิมพ์ลาย เริ่ม 85 บาท | iDucky",
  description:
    "รับผลิตแผ่นหินน้ำหอม (Scented Stone) พิมพ์ลายตามสั่ง ระบบ UV Printing เลือกได้ 4 ทรง " +
    "(Plum blossom · Circle · Rhombus · Oval) หนา 1 ซม. แถมน้ำหอมกลิ่น Holiday 2ml ทุกแผ่น " +
    "ใส่ถุงผ้าพิมพ์ลายเพิ่มได้ 3 แบบ ไม่มีขั้นต่ำ",
  keywords: [
    "แผ่นหินน้ำหอม",
    "scented stone",
    "รับทำแผ่นหินหอม",
    "แผ่นหินหอมพิมพ์ลาย",
    "ของชำร่วยแผ่นหินหอม",
    "ป้ายหินหอมแขวน",
    "ถุงหอมพิมพ์ลาย",
    "งาน UV Printing",
    "iDucky",
  ],
  faqs: [
    {
      q: "แผ่นหินน้ำหอมราคาเท่าไหร่?",
      a:
        "เฉพาะแผ่นหิน สั่ง 1-10 แผ่น อยู่ที่ 140 บาท/แผ่น · 11-29 แผ่น 100 บาท · 30-49 แผ่น 90 บาท · 50 แผ่นขึ้นไป 85 บาท — " +
        "ถ้าใส่ถุงผ้าด้วยจะบวกเพิ่มตามแบบถุงที่เลือก (ระบบคิดรวมให้ในราคาต่อแผ่นแล้ว)",
    },
    {
      q: "มีทรงอะไรให้เลือกบ้าง?",
      a: "4 ทรง — Plum blossom (ดอกไม้) ~6.9x6.6 ซม. · Circle ~6.8 ซม. · Rhombus ~5x9 ซม. · Oval ~5x9.2 ซม. ทุกทรงหนา 1 ซม. และราคาเท่ากัน",
    },
    {
      q: "มีน้ำหอมให้ด้วยไหม ต้องฉีดเองหรือเปล่า?",
      a: "แถมน้ำหอมระเหยกลิ่น Holiday ปริมาณ 2 ml ไปด้วยทุกแผ่น โดยลูกค้าฉีดพ่นน้ำหอมลงบนแผ่นหินเอง เติมซ้ำได้เมื่อกลิ่นจาง",
    },
    {
      q: "ใส่ถุงผ้าเพิ่มได้ไหม ราคาเท่าไหร่?",
      a:
        "ได้ 3 แบบ — ถุงผ้า 10x10 ซม. (เชือกขาวติดถุง) เพิ่ม 85-100 บาท · ถุงผ้า 11x13 ซม. (เจาะรูห้อยเชือก) เพิ่ม 95-110 บาท · " +
        "ถุงหูรูด 11x12.5 ซม. เพิ่ม 90-120 บาท ต่อใบ ตามช่วงจำนวนที่สั่ง · เนื้อผ้าเลือกได้ 3 ชนิด (ซาตินอินโด · ดัชเชส · บาร์บี้)",
    },
    {
      q: "สั่งขั้นต่ำกี่แผ่น?",
      a: "ไม่มีขั้นต่ำในการสั่งผลิต สั่ง 1 แผ่นก็ได้ (คิดเรทราคาปลีก) ยิ่งสั่งเยอะราคาต่อแผ่นยิ่งถูกลงตามตาราง",
    },
  ],
};

const product: Product = {
  id: ID,
  slug: "scented-stone",
  name: "แผ่นหินน้ำหอม",
  category: "gifts",
  price: 85,
  emoji: "🌸",
  gradient: "from-rose-100 to-pink-200",
  imageSrc: IMG("photo-1"),
  seo,
  rating: 5,
  sold: 0,
  badge: "ใหม่",
  hidden: true,
  description:
    "แผ่นหินน้ำหอม (Scented Stone) พิมพ์ลายตามสั่งด้วยระบบ UV Printing เลือกได้ 4 ทรง " +
    "(Plum blossom ดอกไม้ · Circle · Rhombus · Oval) หนา 1 ซม. เจาะรูห้อยมาให้ " +
    "แถมน้ำหอมระเหยกลิ่น Holiday 2 ml ทุกแผ่น (ลูกค้าฉีดพ่นเอง) " +
    "เลือกใส่ถุงผ้าพิมพ์ลายเพิ่มได้ 3 แบบ ไม่มีขั้นต่ำในการสั่งผลิต",
  highlights: [
    "4 ทรงให้เลือก — ดอกไม้ · วงกลม · Rhombus · วงรี · หนา 1 ซม.",
    "พิมพ์ระบบ UV Printing ลายคมชัดเต็มแผ่น",
    "แถมน้ำหอมกลิ่น Holiday 2 ml ทุกแผ่น (ฉีดพ่นเอง)",
    "ใส่ถุงผ้าพิมพ์ลายเพิ่มได้ 3 แบบ · เลือกเนื้อผ้าได้ 3 ชนิด",
    "เจาะรูห้อยมาให้ ใช้เป็นป้ายแขวนตู้เสื้อผ้า/รถ/ของชำร่วยได้",
    "ไม่มีขั้นต่ำ สั่ง 1 แผ่นก็ได้",
  ],
  images: [
    { emoji: "🌸", gradient: "from-rose-100 to-pink-200", label: "งานจริง — แผ่นหิน 4 ทรงเรียงรวม", src: IMG("photo-1") },
    { emoji: "🎁", gradient: "from-red-100 to-rose-200", label: "ทรงดอกไม้ + ถุงหูรูดแดง", src: IMG("photo-2") },
    { emoji: "🎄", gradient: "from-emerald-100 to-teal-200", label: "ทรงดอกไม้ + ถุงหูรูดเขียวมิ้นต์", src: IMG("photo-3") },
    { emoji: "💧", gradient: "from-sky-100 to-cyan-200", label: "ชุดแผ่นหิน + น้ำหอม 2 ml", src: IMG("photo-4") },
    { emoji: "👜", gradient: "from-amber-100 to-yellow-200", label: "ถุงผ้า 2 แบบ — 11x13 เจาะรู · 10x10 เชือกติดถุง", src: IMG("photo-5") },
    { emoji: "🎀", gradient: "from-orange-100 to-red-200", label: "ถุงหูรูด 11x12.5 ซม.", src: IMG("photo-6") },
    { emoji: "✨", gradient: "from-violet-100 to-purple-200", label: "ถุงหูรูด + ถุงผ้าเรียงคู่", src: IMG("photo-7") },
  ],
  options,
  pricing: PRICING,
  terms: [
    "ราคาตามตารางคิดต่อแผ่น ขึ้นกับถุงบรรจุที่เลือก (ตรงตามตารางราคาหน้าแผ่นหินน้ำหอมของร้าน)",
    "คอลัมน์ถุงในเว็บเป็นราคา add on — ราคาที่แสดงในระบบนี้บวกค่าถุงให้เรียบร้อยแล้ว",
    "ไม่มีขั้นต่ำในการสั่งผลิต · แผ่นหินพิมพ์ด้วยระบบ UV Printing · ถุงผ้าพิมพ์ด้วยระบบ Sublimation Printing",
    "ทรงและขนาด (หนา 1 ซม.): Plum blossom ~6.9x6.6 ซม. · Circle ~6.8 ซม. · Rhombus ~5x9 ซม. · Oval ~5x9.2 ซม. — ทุกทรงราคาเท่ากัน",
    "แถมน้ำหอมระเหยกลิ่น Holiday ปริมาณ 2 ml ทุกแผ่น โดยลูกค้าฉีดพ่นน้ำหอมลงบนแผ่นหินเอง",
    "ถุงผ้ามีให้เลือก 3 เนื้อผ้า: ซาตินอินโด · ดัชเชส · บาร์บี้",
    "ถุงผ้า 10x10 ซม. เป็นแบบเชือกห้อยสีขาวติดกับถุงผ้า · ถุงผ้า 11x13 ซม. เจาะรูห้อยเชือกสีขาว · ถุงหูรูด 11x12.5 ซม.",
    "ถุงผ้าแต่ละใบจะมีความคลาดเคลื่อน 2-5 ซม.",
    "ทางร้านใช้สีระบบ RGB สีงานที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
    "การตัดชิ้นงานอาจมีความคลาดเคลื่อน ±0.5-2 มม. เนื่องจากข้อจำกัดของเครื่องตัด",
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
  "photo-1",
  "photo-2",
  "photo-3",
  "photo-4",
  "photo-5",
  "photo-6",
  "photo-7",
  "shape-plum",
  "shape-circle",
  "shape-rhombus",
  "shape-oval",
  "bag-none",
  "bag-pouch10",
  "bag-pouch13",
  "bag-drawstring",
  "set-perfume",
  "bag-hole",
];

async function uploadImages() {
  if (!IMAGES_DIR)
    throw new Error("ต้องระบุ --images=<โฟลเดอร์ที่เตรียมไฟล์ไว้> (รัน node scripts/scented-stone-art.mjs ก่อน)");
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
  console.log(`\n   ${"ถุงบรรจุ".padEnd(26)} ${TIERS.map((t) => t.label.padStart(13)).join("")}`);
  for (const bag of BAGS) {
    const add = BAG_ADD[bag].map((n) => (n ? `+${n}` : "—"));
    console.log(
      `   ${bag.padEnd(26)} ${PRICE[bag].map((p, i) => `${p} (${add[i]})`.padStart(13)).join("")}`
    );
  }

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
