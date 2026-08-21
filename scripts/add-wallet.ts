/**
 * สร้างสินค้า "กระเป๋า Wallet" จากตารางราคาเว็บ
 *
 *   npx tsx scripts/add-wallet.ts                                  # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   node scripts/wallet-art.mjs --sheet                            # เตรียมภาพ + คอนแทคชีตไว้ตรวจ
 *   npx tsx scripts/add-wallet.ts --upload --images=.cache/wallet/upload
 *   npx tsx scripts/add-wallet.ts --write                          # เขียนลง Supabase (เป็นฉบับร่าง)
 *
 * ที่มา: iduckyofficial-pricelists.com/wallet — 3 ตารางแรกของหน้า
 *   1. "ขนาด 10x11.5cm"
 *   2. "14.5x18.5cm"
 *   3. "ไดคัทตามทรง ขนาด 12*14cm"
 * ทั้ง 3 ตารางใช้คอลัมน์เนื้อผ้าชุดเดียวกัน (แคนวาส · ขนสั้น · ลูกฟูก · หนังนิ่ม PU ขาว · ขนยาว)
 * และช่วงจำนวนชุดเดียวกัน (1-10 / 11-29 / 30-49 / 50 ใบขึ้นไป) → ทำเป็นตารางเดียว 2 แกน 15 ช่อง
 *
 * ⚠️ ตารางที่ 4 ของหน้าเดียวกันคือ "Clip Pouch" ซึ่งเป็นสินค้าคนละตัว (มีในระบบแล้ว id: clip-pouch)
 *    จึงไม่ดึงมารวมที่นี่
 *
 * ⚠️ เว็บเขียนแค่ "ต้องการใส่เชือกหูห้อย เพิ่ม (เชือกสีขาว)" โดยไม่ระบุราคา
 *    จึงใส่เป็นตัวเลือกที่ไม่คิดเงินไว้ก่อน — ถ้าร้านคิดเพิ่ม ให้ใส่ extra ที่ STRAP ด้านล่าง
 *    ส่วน "ปักแบบอื่นราคาตามประเมิน" ไม่ได้ทำเป็นตัวเลือก (ราคาไม่แน่นอน) — เขียนไว้ในแท็บแทน
 *
 * ภาพ: เตรียมด้วย scripts/wallet-art.mjs (รูปงานจริงจากหน้า pricelists ของร้านเอง)
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

const ID = "wallet";
const REV = "v1";
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}-${REV}.jpg`;

const UNIT = "ใบ";
const SIZE_LABEL = "ขนาด / ทรง";
const FABRIC_LABEL = "เนื้อผ้า";
const ZIP_LABEL = "สีซิป";
const EXTRA_LABEL = "ลูกเล่นเพิ่ม";

const S_SMALL = "10x11.5 ซม.";
const S_LARGE = "14.5x18.5 ซม.";
const S_DIECUT = "ไดคัทตามทรง 12x14 ซม.";
const SIZES = [S_SMALL, S_LARGE, S_DIECUT];

const F_CANVAS = "ผ้าแคนวาส";
const F_SHORT = "ผ้าขนสั้น";
const F_CORD = "ผ้าลูกฟูก";
const F_PU = "หนังนิ่ม PU (สีขาว)";
const F_LONG = "ผ้าขนยาว";
const FABRICS = [F_CANVAS, F_SHORT, F_CORD, F_PU, F_LONG];

/**
 * ราคา/ใบ ตาม (ขนาด × เนื้อผ้า) เรียงตามช่วงจำนวน 1-10 / 11-29 / 30-49 / 50+
 * ตัวเลขตรงตามตารางในเว็บทุกช่อง
 */
const PRICE: Record<string, Record<string, number[]>> = {
  [S_SMALL]: {
    [F_CANVAS]: [139, 120, 100, 90],
    [F_SHORT]: [139, 120, 100, 90],
    [F_CORD]: [149, 130, 110, 100],
    [F_PU]: [169, 150, 130, 120],
    [F_LONG]: [189, 170, 150, 130],
  },
  [S_LARGE]: {
    [F_CANVAS]: [159, 140, 120, 110],
    [F_SHORT]: [159, 140, 120, 110],
    [F_CORD]: [169, 150, 140, 120],
    [F_PU]: [189, 165, 150, 140],
    [F_LONG]: [209, 190, 180, 160],
  },
  [S_DIECUT]: {
    [F_CANVAS]: [169, 150, 140, 130],
    [F_SHORT]: [169, 150, 140, 130],
    [F_CORD]: [179, 160, 150, 140],
    [F_PU]: [199, 180, 170, 160],
    [F_LONG]: [209, 200, 190, 180],
  },
};

const TIERS: PriceTier[] = [
  { upTo: 10, label: "1-10 ใบ" },
  { upTo: 29, label: "11-29 ใบ" },
  { upTo: 49, label: "30-49 ใบ" },
  { upTo: null, label: "50 ใบขึ้นไป" },
];

const PRICING: PriceMatrix = {
  unit: UNIT,
  driverLabels: [SIZE_LABEL, FABRIC_LABEL],
  tiers: TIERS,
  cells: Object.fromEntries(
    SIZES.flatMap((size) => FABRICS.map((fab) => [`${size}│${fab}`, PRICE[size][fab]]))
  ),
};

/** ภาพประจำตัวเลือก — ทุกกลุ่มมีภาพครบ ลูกค้าเห็นหน้าตาแต่ละแบบก่อนเลือก */
const SIZE_IMG: Record<string, string> = {
  [S_SMALL]: IMG("size-small"),
  [S_LARGE]: IMG("size-large"),
  [S_DIECUT]: IMG("size-diecut"),
};
const FABRIC_IMG: Record<string, string> = {
  [F_CANVAS]: IMG("fab-canvas"),
  [F_SHORT]: IMG("fab-shortfur"),
  [F_CORD]: IMG("fab-corduroy"),
  [F_PU]: IMG("fab-pu"),
  [F_LONG]: IMG("fab-longfur"),
};

const ZIP_WHITE = "ซิปสีขาว";
const ZIP_BLACK = "ซิปสีดำ";
const STRAP = "ใส่เชือกหูห้อย (เชือกสีขาว)";
const EMBROIDERY = "ปักชื่อ";

const options: ProductOption[] = [
  {
    label: SIZE_LABEL,
    stockBearing: true,
    choices: SIZES.map((name) => ({
      name,
      imageSrc: SIZE_IMG[name],
      ...(name === S_SMALL ? { popular: true } : {}),
    })),
  },
  {
    label: FABRIC_LABEL,
    stockBearing: true,
    choices: FABRICS.map((name) => ({
      name,
      imageSrc: FABRIC_IMG[name],
      ...(name === F_CANVAS ? { popular: true } : {}),
    })),
  },
  {
    label: ZIP_LABEL,
    choices: [
      { name: ZIP_WHITE, imageSrc: IMG("zip-white") },
      { name: ZIP_BLACK, imageSrc: IMG("zip-black") },
    ],
  },
  {
    label: EXTRA_LABEL,
    display: "multi",
    choices: [
      // เว็บไม่ได้ระบุราคาเชือกหูห้อยไว้ — ตั้งเป็นไม่คิดเงินก่อน (ดูหมายเหตุหัวไฟล์)
      { name: STRAP, imageSrc: IMG("strap") },
      { name: EMBROIDERY, extra: 20, imageSrc: IMG("embroidery") },
    ],
  },
];

const TABS: Product["tabs"] = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text:
      "กระเป๋า Wallet — กระเป๋าซิปใบเล็กพิมพ์ลายตามสั่ง ระบบซับลิเมชั่น ไม่มีขั้นต่ำในการสั่งผลิต\n" +
      "• ทำได้ 3 ทรง: 10x11.5 ซม. · 14.5x18.5 ซม. · ไดคัทตามทรง 12x14 ซม.\n" +
      "• เลือกเนื้อผ้าได้ 5 แบบ: แคนวาส · ขนสั้น · ลูกฟูก · หนังนิ่ม PU (สีขาว) · ขนยาว\n" +
      "• กระเป๋ามีซับในทุกใบ\n" +
      "• สีซิปเลือกได้ ขาว หรือ ดำ\n" +
      "• ใส่เชือกหูห้อยเพิ่มได้ (เชือกสีขาว)\n" +
      "• ปักชื่อเพิ่ม บวก 20 บาท/ใบ (ถ้าปักแบบอื่นราคาตามประเมิน)\n" +
      "• จำนวน 1-10 ใบ คละลายได้อิสระ · 11 ใบขึ้นไป คละลาย สั่งลายละ 5 ใบขึ้นไป\n" +
      "• ขนาดกระเป๋าแต่ละใบที่เย็บออกมาอาจคลาดเคลื่อน 0.5-1 ซม.",
    images: [IMG("photo-1"), IMG("photo-2"), IMG("photo-3")],
    imageSize: "md" as const,
  },
  {
    title: "ขนาด / ทรง",
    text:
      "เลือกได้ 3 ทรง::\n" +
      "• 10x11.5 ซม. — ทรงเล็กเกือบจัตุรัส ใส่เหรียญ บัตร ลิปสติก เครื่องสำอางชิ้นเล็ก\n" +
      "• 14.5x18.5 ซม. — ทรงใหญ่ ใส่มือถือ พาสปอร์ต เครื่องเขียน อุปกรณ์จุกจิกได้เยอะ\n" +
      "• ไดคัทตามทรง 12x14 ซม. — ตัดเย็บตามรูปทรงของลายที่ออกแบบ (เช่น ทรงหัวแมว)\n\n" +
      "หมายเหตุ::\n" +
      "• ขนาดที่เย็บออกมาจริงอาจคลาดเคลื่อน 0.5-1 ซม. ตามธรรมชาติของงานผ้า\n" +
      "• ทรงไดคัทควรออกแบบลายให้เส้นรอบรูปเรียบ ไม่มีติ่งแหลมเล็ก ๆ เพราะต้องเย็บตามขอบ",
    images: [IMG("size-small"), IMG("size-large"), IMG("size-diecut")],
    imageSize: "md" as const,
  },
  {
    title: "เนื้อผ้า 5 แบบ",
    text:
      "เลือกเนื้อผ้าได้ 5 แบบ (ราคาต่างกันตามตาราง)::\n" +
      "• ผ้าแคนวาส — เนื้อทอแน่น อยู่ทรง ลายคมชัด ราคาประหยัดสุด\n" +
      "• ผ้าขนสั้น — ผิวกำมะหยี่ขนสั้น นุ่มมือ ลายเนียน\n" +
      "• ผ้าลูกฟูก — ผิวเป็นร่องริ้ว ให้ลุคย้อนยุค น่ารัก\n" +
      "• หนังนิ่ม PU (สีขาว) — ผิวเรียบคล้ายหนัง เช็ดทำความสะอาดง่าย ดูพรีเมียม\n" +
      "• ผ้าขนยาว — ขนฟูยาว นุ่มฟูมาก ลายจะดูฟุ้งนุ่มตามเนื้อขน\n\n" +
      "ข้อควรรู้::\n" +
      "• งานพิมพ์ซับลิเมชั่นพิมพ์ได้เฉพาะผ้าสีอ่อนและผ้าเฉพาะเท่านั้น\n" +
      "• ผ้าขนยาว/ขนสั้น ลายจะนุ่มฟุ้งกว่าผ้าแคนวาส เพราะหมึกซึมตามเส้นขน — เหมาะกับลายชิ้นใหญ่ ไม่เหมาะกับตัวอักษรเล็ก",
    images: [
      IMG("fab-canvas"),
      IMG("fab-shortfur"),
      IMG("fab-corduroy"),
      IMG("fab-pu"),
      IMG("fab-longfur"),
    ],
    imageSize: "md" as const,
  },
  {
    title: "ซิป · ซับใน · ลูกเล่นเพิ่ม",
    text:
      "ซิปและซับใน::\n" +
      "• สีซิปมีให้เลือก ขาว | ดำ\n" +
      "• กระเป๋ามีซับในทุกใบ (ซับในสีขาว)\n\n" +
      "ลูกเล่นเพิ่ม::\n" +
      "• ใส่เชือกหูห้อยได้ (เชือกสีขาว) — ติ๊กเลือกในหน้าสั่งซื้อ\n" +
      "• ปักชื่อเพิ่ม บวก 20 บาท/ใบ — ระบบบวกราคาให้อัตโนมัติเมื่อติ๊ก\n" +
      '• ปักแบบอื่นนอกจากปักชื่อ (โลโก้ · ลายปักเฉพาะ) ราคาตามประเมิน — แจ้งในช่อง "หมายเหตุถึงร้าน" แล้วแอดมินจะตีราคาให้',
    images: [IMG("zip-white"), IMG("zip-black"), IMG("lining"), IMG("strap"), IMG("embroidery")],
    imageSize: "md" as const,
  },
  {
    title: "ข้อจำกัดงานผ้า",
    text:
      "🚨 ข้อจำกัดในการผลิตงานผ้าด้วยระบบพิมพ์ซับลิเมชั่น::\n" +
      "• ทางร้านใช้สีระบบ RGB สีงานที่ได้อาจสว่างกว่าหรือดรอปลงตามความแตกต่างของไฟล์งาน ±5% ถึง ±15%\n" +
      "• งานผ้าจะมีจุดดำที่เกิดจากฝุ่นบ้างเล็กน้อย มีการเคลื่อนของลายสกรีน และมีรอยยับของผ้า ซึ่งไม่กระทบกับการใช้งาน\n" +
      "• งานพิมพ์ซับลิเมชั่นเป็นงานถ่ายเทสีด้วยความร้อน อุณหภูมิมีผลกับสีที่พิมพ์ออกมา\n" +
      "• พิมพ์ได้เฉพาะผ้าสีอ่อนและผ้าเฉพาะเท่านั้น\n" +
      "• ขนาดกระเป๋าแต่ละใบที่เย็บออกมาอาจคลาดเคลื่อน 0.5-1 ซม.",
  },
  {
    title: "วิธีสั่งงาน",
    text:
      "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
      "• เลือกขนาด/ทรง · เนื้อผ้า · สีซิป · ลูกเล่นเพิ่ม แล้วใส่จำนวน\n" +
      '• แนบภาพลาย (JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n' +
      '• ระบุรายละเอียดเพิ่มในช่อง "หมายเหตุถึงร้าน" เช่น ชื่อที่จะปัก · วันที่ใช้งาน\n' +
      "• สั่งหลายลาย ให้เพิ่มลงตะกร้าแยกรายการตามลาย (11 ใบขึ้นไป สั่งลายละ 5 ใบขึ้นไป)\n\n" +
      "หรือสั่งทางอีเมล::\n" +
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com · หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n" +
      "• ระบุ: ประเภทงาน · ขนาด · เนื้อผ้า · จำนวน · วันที่ใช้งาน (ถ้ามี)\n" +
      "• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)\n" +
      "• ไฟล์นามสกุล .Ai .Psd .PNG พื้นหลังใส",
  },
  {
    title: "การรับประกันสินค้า",
    text:
      "รับเคลม::\n" +
      "• สีเพี้ยนเกิน 10-15%\n" +
      "• จำนวนที่ได้รับไม่ครบถ้วน\n" +
      "• อะไหล่ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n" +
      "• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\n" +
      "ไม่รับเคลม::\n" +
      "• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n" +
      "• สินค้าชำรุดจากการใช้งานมาแล้ว\n\n" +
      "ระยะเวลาในการเคลม::\n" +
      "ภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
  },
];

const seo: Product["seo"] = {
  title: "รับทำ กระเป๋า Wallet พิมพ์ลาย เริ่ม 90 บาท | iDucky",
  description:
    "รับผลิตกระเป๋า Wallet พิมพ์ลายตามสั่ง ระบบซับลิเมชั่น เลือกได้ 3 ทรง (10x11.5 · 14.5x18.5 · ไดคัทตามทรง 12x14 ซม.) " +
    "5 เนื้อผ้า (แคนวาส · ขนสั้น · ลูกฟูก · หนัง PU · ขนยาว) มีซับใน เลือกสีซิป ใส่เชือกหูห้อย ปักชื่อได้ ไม่มีขั้นต่ำ",
  keywords: [
    "กระเป๋า wallet",
    "รับทำกระเป๋าพิมพ์ลาย",
    "กระเป๋าซิปพิมพ์ลาย",
    "กระเป๋าใส่เหรียญสั่งทำ",
    "กระเป๋าผ้าขนยาว",
    "กระเป๋าไดคัทตามทรง",
    "งานซับลิเมชั่น",
    "ของชำร่วยกระเป๋า",
    "iDucky",
  ],
  faqs: [
    {
      q: "กระเป๋า Wallet ราคาเท่าไหร่?",
      a:
        "เริ่มต้นใบละ 90 บาท (ขนาด 10x11.5 ซม. ผ้าแคนวาส/ขนสั้น ที่ 50 ใบขึ้นไป) · " +
        "สั่ง 1-10 ใบ ทรงเล็กแคนวาสอยู่ที่ 139 บาท/ใบ · ทรงใหญ่ 159 บาท/ใบ · ไดคัทตามทรง 169 บาท/ใบ — ยิ่งสั่งเยอะยิ่งถูกตามตารางราคา",
    },
    {
      q: "มีขนาดอะไรให้เลือกบ้าง?",
      a: "3 ทรง — 10x11.5 ซม. (ทรงเล็ก) · 14.5x18.5 ซม. (ทรงใหญ่ ใส่มือถือได้) · ไดคัทตามทรง 12x14 ซม. (เย็บตามรูปทรงของลาย) · ขนาดที่เย็บจริงอาจคลาดเคลื่อน 0.5-1 ซม.",
    },
    {
      q: "เลือกเนื้อผ้าอะไรได้บ้าง?",
      a: "5 แบบ — ผ้าแคนวาส · ผ้าขนสั้น · ผ้าลูกฟูก · หนังนิ่ม PU (สีขาว) · ผ้าขนยาว · ราคาต่างกันตามชนิดผ้า แคนวาสกับขนสั้นราคาเท่ากันและถูกที่สุด ขนยาวแพงที่สุด",
    },
    {
      q: "ปักชื่อได้ไหม ใส่เชือกหูห้อยได้ไหม?",
      a: "ปักชื่อเพิ่ม 20 บาท/ใบ ติ๊กเลือกได้ในหน้าสั่งซื้อ · ปักแบบอื่น (โลโก้/ลายเฉพาะ) ราคาตามประเมิน · ใส่เชือกหูห้อยสีขาวได้ ติ๊กเลือกเช่นกัน · กระเป๋ามีซับในทุกใบ เลือกสีซิปได้ขาวหรือดำ",
    },
    {
      q: "สั่งขั้นต่ำกี่ใบ คละลายได้ไหม?",
      a: "ไม่มีขั้นต่ำ สั่ง 1 ใบก็ได้ (คิดเรทราคาปลีก) · จำนวน 1-10 ใบ คละลายได้อิสระ · ตั้งแต่ 11 ใบขึ้นไป คละลายได้โดยสั่งลายละ 5 ใบขึ้นไป",
    },
  ],
};

const product: Product = {
  id: ID,
  slug: "wallet",
  name: "กระเป๋า Wallet",
  category: "bag",
  price: 90,
  emoji: "👛",
  gradient: "from-sky-100 to-indigo-200",
  imageSrc: IMG("photo-1"),
  seo,
  rating: 5,
  sold: 0,
  badge: "ใหม่",
  hidden: true,
  description:
    "กระเป๋า Wallet พิมพ์ลายตามสั่งด้วยระบบซับลิเมชั่น เลือกได้ 3 ทรง (10x11.5 ซม. · 14.5x18.5 ซม. · ไดคัทตามทรง 12x14 ซม.) " +
    "และ 5 เนื้อผ้า (แคนวาส · ขนสั้น · ลูกฟูก · หนังนิ่ม PU สีขาว · ขนยาว) กระเป๋ามีซับในทุกใบ เลือกสีซิปได้ขาว/ดำ " +
    "ใส่เชือกหูห้อยหรือปักชื่อเพิ่มได้ ไม่มีขั้นต่ำในการสั่งผลิต",
  highlights: [
    "3 ทรงให้เลือก — 10x11.5 · 14.5x18.5 · ไดคัทตามทรง 12x14 ซม.",
    "5 เนื้อผ้า — แคนวาส · ขนสั้น · ลูกฟูก · หนังนิ่ม PU ขาว · ขนยาว",
    "กระเป๋ามีซับในทุกใบ · เลือกสีซิปได้ ขาว/ดำ",
    "ปักชื่อเพิ่ม 20 บาท/ใบ · ใส่เชือกหูห้อยสีขาวได้",
    "พิมพ์ระบบซับลิเมชั่น ลายเต็มใบ ไม่มีขั้นต่ำ",
    "1-10 ใบคละลายอิสระ · 11 ใบขึ้นไป คละลายละ 5 ใบขึ้นไป",
  ],
  images: [
    { emoji: "👛", gradient: "from-sky-100 to-indigo-200", label: "งานจริง — Wallet 4 เนื้อผ้าเรียงซ้อน", src: IMG("photo-1") },
    { emoji: "🧵", gradient: "from-indigo-100 to-blue-200", label: "ผ้าแคนวาส ซิปดำ (เทียบขนาดกับมือถือ)", src: IMG("photo-2") },
    { emoji: "🐱", gradient: "from-orange-100 to-amber-200", label: "ไดคัทตามทรง 12x14 ซม.", src: IMG("photo-3") },
    { emoji: "🧸", gradient: "from-violet-100 to-purple-200", label: "ผ้าขนยาว — ขนฟูนุ่ม", src: IMG("photo-4") },
    { emoji: "🎀", gradient: "from-fuchsia-100 to-pink-200", label: "ผ้าลูกฟูก — ผิวเป็นร่องริ้ว", src: IMG("photo-5") },
    { emoji: "🪡", gradient: "from-slate-100 to-sky-200", label: "ด้านในมีซับในทุกใบ · ซิปสีขาว", src: IMG("photo-6") },
    { emoji: "🎗️", gradient: "from-pink-100 to-rose-200", label: "ใส่เชือกหูห้อยเพิ่มได้ (เชือกสีขาว)", src: IMG("photo-7") },
    { emoji: "✨", gradient: "from-cyan-100 to-sky-200", label: "ทรงเล็ก 10x11.5 ซม.", src: IMG("photo-8") },
  ],
  options,
  pricing: PRICING,
  priceRates: [
    {
      id: "r1",
      label: "ราคากระเป๋า Wallet",
      desc: "พิมพ์ซับลิเมชั่น · ไม่มีขั้นต่ำ · 11 ใบขึ้นไป คละลายละ 5 ใบขึ้นไป",
      imageSrc: IMG("photo-1"),
      minPerDesign: 5,
      freeMixBelowQty: 11,
      pricing: PRICING,
    },
  ],
  tierByDesign: true,
  terms: [
    "ราคาตามตารางคิดต่อใบ ขึ้นกับขนาด/ทรง และเนื้อผ้าที่เลือก (ตรงตามตารางราคาหน้า Wallet ของร้าน)",
    "ไม่มีขั้นต่ำในการสั่งผลิต · พิมพ์ด้วยระบบซับลิเมชั่น",
    "จำนวน 1-10 ใบ คละลายได้อิสระ · จำนวน 11 ใบขึ้นไป คละลาย สั่งลายละ 5 ใบขึ้นไป",
    "สีซิปมีให้เลือก ขาว | ดำ · กระเป๋ามีซับในทุกใบ",
    "ใส่เชือกหูห้อยเพิ่มได้ (เชือกสีขาว)",
    "ปักชื่อเพิ่ม บวก 20 บาท/ใบ · ถ้าปักแบบอื่นราคาตามประเมิน",
    "ขนาดกระเป๋าแต่ละใบที่เย็บออกมาอาจมีความคลาดเคลื่อน 0.5-1 ซม.",
    "งานพิมพ์ซับลิเมชั่นพิมพ์ลงบนกระดาษเฉพาะแล้วทรานเฟอร์หมึกด้วยความร้อน พิมพ์ได้เฉพาะผ้าสีอ่อนและผ้าเฉพาะเท่านั้น",
    "ทางร้านใช้สีระบบ RGB สีงานที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
    "งานผ้าจะมีจุดดำจากฝุ่นเล็กน้อย มีการเคลื่อนของลายสกรีน และมีรอยยับของผ้า ซึ่งไม่กระทบกับการใช้งาน",
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
  "photo-8",
  "size-small",
  "size-large",
  "size-diecut",
  "fab-canvas",
  "fab-shortfur",
  "fab-corduroy",
  "fab-pu",
  "fab-longfur",
  "zip-white",
  "zip-black",
  "strap",
  "embroidery",
  "lining",
];

async function uploadImages() {
  if (!IMAGES_DIR) throw new Error("ต้องระบุ --images=<โฟลเดอร์ที่เตรียมไฟล์ไว้> (รัน node scripts/wallet-art.mjs ก่อน)");
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
  for (const size of SIZES) {
    for (const fab of FABRICS) {
      console.log(`   ${size.padEnd(24)} ${fab.padEnd(20)} ${PRICING.cells[`${size}│${fab}`].join(" / ")}`);
    }
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
