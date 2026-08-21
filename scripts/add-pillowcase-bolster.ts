/**
 * สร้างสินค้า "ปลอกหมอนข้าง" (รวมแบบบอดี้ + แบบกลม ไว้ในตัวเดียว)
 *
 *   node scripts/pillowcase-bolster-art.mjs                                     # เตรียมภาพ
 *   npx tsx scripts/add-pillowcase-bolster.ts                                   # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   npx tsx scripts/add-pillowcase-bolster.ts --upload --images=.cache/pillowcase-bolster/upload
 *   npx tsx scripts/add-pillowcase-bolster.ts --write                           # เขียนลง Supabase (เป็นฉบับร่าง)
 *
 * ที่มา: iduckyofficial-pricelists.com/pillowcases — สองตารางในหน้าเดียวกัน
 *
 *   ปลอกหมอนข้าง แบบ บอดี้ · ขนาด 20x50 นิ้ว (บาท/ใบ)
 *     1-10  11-29  30-49  50-99  100-299  300-499  500-999  1000+
 *      690    500    480    450      430      400      380     350
 *
 *   ปลอกหมอนข้าง แบบ กลม · ขนาด 15x50 นิ้ว (บาท/ใบ)
 *     1-10  11-29  30-49  50-99  100-299  300-499  500-999  1000+
 *      590    450    430    400      380      350      330     300
 *
 * ทั้งสองแบบใช้ช่วงจำนวนชุดเดียวกัน → ทำเป็น "ตารางเดียว 2 คอลัมน์" โดยให้กลุ่มตัวเลือก
 * "แบบปลอกหมอนข้าง" เป็นแกนของตาราง (driverLabel) แทนการแยกเป็นสองสินค้า
 * ลูกค้าจึงเทียบสองแบบได้ในหน้าเดียว และแต่ละแบบมี "ภาพประกอบ" ของตัวเองบนปุ่มเลือก
 * (ภาพเดียวกันอยู่ในแกลเลอรีด้วย — กดเลือกแบบไหน แกลเลอรีสลับไปภาพแบบนั้นให้เอง)
 *
 * เงื่อนไขจากเว็บ (ตรงกันทั้งสองแบบ):
 *   • จำนวน 1-10 ใบ คละลายได้อิสระ   → freeMixBelowQty: 11
 *   • จำนวน 11 ใบขึ้นไป คละลาย สั่งลายละ 5 ชิ้นขึ้นไป → minPerDesign: 5
 *   • เพิ่มนิ้วละ 45 บาท              → กลุ่ม "เพิ่มขนาด" (ระบุจำนวนนิ้วได้)
 *
 * ⚠️ ของเดิมในระบบมี pillowcases-2 (บอดี้) และ pillowcases-3 (กลม) เป็นฉบับร่างแยกกันอยู่
 *    ตัวนี้ตั้งใจมาแทนทั้งคู่ — เผยแพร่ตัวนี้แล้วปล่อยสองตัวเก่าเป็นร่างไว้เหมือนเดิม
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

const ID = "pillowcase-bolster";
const REV = "v1";
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}-${REV}.jpg`;

const UNIT = "ใบ";
const TYPE_LABEL = "แบบปลอกหมอนข้าง";
const SIZE_LABEL = "เพิ่มขนาด";

const BODY = "แบบบอดี้ (20x50 นิ้ว)";
const ROUND = "แบบกลม (15x50 นิ้ว)";

/** ราคา/ใบ ตามช่วงจำนวน — ตัวเลขตรงตามตารางในเว็บ ไม่ปัดไม่เกลี่ย */
const CELLS: Record<string, number[]> = {
  [BODY]: [690, 500, 480, 450, 430, 400, 380, 350],
  [ROUND]: [590, 450, 430, 400, 380, 350, 330, 300],
};

const TIERS: PriceTier[] = [
  { upTo: 10, label: `1-10 ${UNIT}` },
  { upTo: 29, label: `11-29 ${UNIT}` },
  { upTo: 49, label: `30-49 ${UNIT}` },
  { upTo: 99, label: `50-99 ${UNIT}` },
  { upTo: 299, label: `100-299 ${UNIT}` },
  { upTo: 499, label: `300-499 ${UNIT}` },
  { upTo: 999, label: `500-999 ${UNIT}` },
  { upTo: null, label: `1000 ${UNIT}ขึ้นไป` },
];

const PRICING: PriceMatrix = { unit: UNIT, driverLabels: [TYPE_LABEL], tiers: TIERS, cells: CELLS };

/** เพิ่มขนาดจากมาตรฐาน คิดนิ้วละ 45 บาท (เว็บระบุตรงกันทั้งสองแบบ) */
const INCH_FEE = 45;

const OPTIONS: ProductOption[] = [
  {
    label: TYPE_LABEL,
    stockBearing: true,
    choices: [
      {
        name: BODY,
        imageSrc: IMG("body-hero"),
        popular: true,
      },
      {
        name: ROUND,
        imageSrc: IMG("round-hero"),
      },
    ],
  },
  {
    label: SIZE_LABEL,
    display: "multi",
    choices: [{ name: `เพิ่มขนาดจากมาตรฐาน (นิ้วละ +${INCH_FEE})`, extra: INCH_FEE, qty: true, qtyMax: 20 }],
  },
];

const IMAGES: Product["images"] = [
  { emoji: "🛏️", gradient: "from-emerald-100 to-teal-100", label: BODY, src: IMG("body-hero") },
  { emoji: "🛏️", gradient: "from-sky-100 to-cyan-100", label: ROUND, src: IMG("round-hero") },
  { emoji: "🎨", gradient: "from-emerald-100 to-teal-100", label: "แบบบอดี้ · พิมพ์เต็มใบ", src: IMG("body-print") },
  { emoji: "🎨", gradient: "from-sky-100 to-cyan-100", label: "แบบกลม · พิมพ์เต็มใบรอบตัว", src: IMG("round-print") },
  { emoji: "📏", gradient: "from-sky-100 to-cyan-100", label: "แบบกลม · ทรงกระบอกเต็มใบ", src: IMG("round-body") },
  { emoji: "🧵", gradient: "from-sky-100 to-cyan-100", label: "แบบกลม · ปลายปลอกรูดเก็บ", src: IMG("round-tie") },
  { emoji: "🧵", gradient: "from-emerald-100 to-teal-100", label: "เนื้อผ้าฮาร์มิส", src: IMG("body-fabric") },
  { emoji: "🔍", gradient: "from-emerald-100 to-teal-100", label: "งานพิมพ์ซับลิเมชั่นคมชัด", src: IMG("body-face") },
];

const TERMS = [
  "*เนื้อผ้าฮาร์มิส นุ่ม ลื่น นอนสบาย ซักได้ปกติ สีไม่ตก",
  "*หมอนแต่ละรอบขนาดจะ +-ครึ่งนิ้ว",
  "*ด้านในปลอกหมอน อาจมีด้ายหลุดรุ่ยบ้างเล็กน้อย",
  "*จำนวน 1-10 ใบ คละลายได้ · ตั้งแต่ 11 ใบขึ้นไป คละลาย สั่งลายละ 5 ใบขึ้นไป",
  "*เพิ่มขนาดจากมาตรฐาน คิดนิ้วละ 45 บาท",
  "*ทางร้านใช้สี R G B งานพิมพ์ซับลิเมชั่น สีงานพิมพ์ที่ได้ออกมาอาจจะสว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15% เพราะเป็นงานถ่ายเทสีด้วยความร้อน",
  "*งานผ้าจะมีจุดดำที่เกิดจากฝุ่นบ้างเล็กน้อย มีการเคลื่อนของลายสกรีน และจะมีรอยยับของผ้า ซึ่งจะไม่กระทบกับการใช้งาน",
].join("\n");

const TABS: Product["tabs"] = [
  {
    title: "วิธีสั่งงาน",
    text:
      'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกแบบ (บอดี้ / กลม) และจำนวนที่ต้องการ แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"\n• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ขนาดที่ต้องการเพิ่ม · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\nหรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: แบบ/ขนาดที่เลือก · รายละเอียดเพิ่มเติม (ถ้ามี) · จำนวน · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)',
  },
  {
    title: "การเตรียมไฟล์",
    text:
      "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด",
  },
  {
    title: "การรับประกันสินค้า",
    text:
      "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• สีหรืออะไหล่ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\nไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\nระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
  },
];

const product: Product = {
  id: ID,
  name: "ปลอกหมอนข้าง",
  category: "fabric",
  price: CELLS[ROUND][0], // เริ่มต้นที่แบบถูกสุด ช่วงปลีก
  emoji: "🛏️",
  gradient: "from-emerald-100 to-teal-100",
  imageSrc: IMG("body-hero"),
  rating: 5,
  sold: 0,
  description:
    "ปลอกหมอนข้างพิมพ์ลายตามสั่ง เลือกได้ 2 แบบ — แบบบอดี้ทรงแบน 20x50 นิ้ว และแบบกลมทรงกระบอก 15x50 นิ้ว เนื้อผ้าฮาร์มิส นุ่ม ลื่น นอนสบาย พิมพ์เต็มใบด้วยระบบซับลิเมชั่น",
  highlights: ["เลือกได้ 2 แบบ: บอดี้ / กลม", "เนื้อผ้าฮาร์มิส นุ่ม ลื่น ซักได้ สีไม่ตก", "พิมพ์เต็มใบ ราคาถูกลงตามจำนวน"],
  options: OPTIONS,
  images: IMAGES,
  pricing: PRICING,
  priceRates: [
    {
      id: "r1",
      label: "เรทที่ 1",
      desc: "คละลายได้ 1-10 ใบ · ตั้งแต่ 11 ใบขึ้นไป ลายละ 5 ใบขึ้นไป",
      minPerDesign: 5,
      freeMixBelowQty: 11,
      pricing: PRICING,
    },
  ],
  tierByDesign: true,
  bulkAskQty: 50,
  terms: TERMS,
  tabs: TABS,
  seo: {
    title: "รับสกรีนปลอกหมอนข้าง แบบบอดี้ / แบบกลม พิมพ์ลายตามสั่ง",
    keywords: [
      "รับสกรีนปลอกหมอนข้าง",
      "ปลอกหมอนข้างพิมพ์ลาย",
      "ปลอกหมอนข้างบอดี้",
      "ปลอกหมอนข้างกลม",
      "หมอนข้างสั่งทำ",
      "รับสกรีนผ้า",
    ],
    faqs: [
      {
        q: "ปลอกหมอนข้าง แบบบอดี้ กับ แบบกลม ต่างกันยังไง?",
        a: "แบบบอดี้เป็นทรงแบนสี่เหลี่ยม ขนาด 20x50 นิ้ว (แนวดาคิมาคุระ) ส่วนแบบกลมเป็นทรงกระบอก ขนาด 15x50 นิ้ว ปลายปลอกรูดเก็บ — เลือกแบบไหนหน้าสินค้าจะสลับภาพให้ดูทันที",
      },
      {
        q: "ปลอกหมอนข้างราคาเท่าไหร่?",
        a: "แบบกลมเริ่มต้นใบละ 590 บาท แบบบอดี้เริ่มต้นใบละ 690 บาท สั่งเยอะราคาถูกลงเป็นขั้น ๆ ถึงใบละ 300 / 350 บาท ที่ 1000 ใบขึ้นไป",
      },
      {
        q: "คละลายได้ไหม?",
        a: "จำนวน 1-10 ใบ คละลายได้อิสระ ตั้งแต่ 11 ใบขึ้นไป คละลายได้โดยสั่งลายละ 5 ใบขึ้นไป",
      },
      {
        q: "อยากได้ขนาดใหญ่กว่ามาตรฐานได้ไหม?",
        a: "ได้ครับ เพิ่มขนาดคิดนิ้วละ 45 บาท ติ๊กที่ช่อง “เพิ่มขนาด” แล้วระบุจำนวนนิ้วที่ต้องการได้เลย",
      },
    ],
  },
  hidden: true, // ฉบับร่าง — กดเผยแพร่เองที่ /admin/products
};

const range = priceRange(product);
const saved: Product = { ...product, priceMin: range.min, priceMax: range.max, hasQuote: hasQuoteOption(product) };

const FILES = ["body-hero", "body-print", "body-face", "body-fabric", "round-hero", "round-print", "round-body", "round-tie"];

async function uploadImages() {
  if (!IMAGES_DIR) throw new Error("ต้องระบุ --images=<โฟลเดอร์> (รัน scripts/pillowcase-bolster-art.mjs ก่อน)");
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

  console.log(`\n📦 ${saved.name} (${ID})`);
  console.log(`   ราคา ${range.min}-${range.max} บาท/${UNIT} · ตัวเลือก ${saved.options.length} กลุ่ม · รูป ${saved.images.length} ภาพ`);
  const choices = saved.options.flatMap((o) => o.choices);
  console.log(`   ตัวเลือกที่มีภาพประกอบ: ${choices.filter((c) => c.imageSrc).length}/${choices.length} ตัว`);
  for (const [k, v] of Object.entries(CELLS)) console.log(`   ${k.padEnd(24)} ${v.join(" / ")}`);
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
