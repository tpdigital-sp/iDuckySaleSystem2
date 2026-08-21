/**
 * สร้างสินค้า "ตะขอแขวนสูญญากาศ" จากตารางราคาเว็บ
 *
 *   node scripts/vacuum-hook-art.mjs                                        # เตรียมภาพ
 *   npx tsx scripts/add-vacuum-hook.ts                                      # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   npx tsx scripts/add-vacuum-hook.ts --upload --images=.cache/vacuum-hook/upload
 *   npx tsx scripts/add-vacuum-hook.ts --write                              # เขียนลง Supabase (เป็นฉบับร่าง)
 *
 * ที่มา: iduckyofficial-pricelists.com/otheracrylicproducts3 หัวข้อ "ตะขอแขวน สูญญากาศ"
 *
 *   จำหน่ายจำนวนเป็นเซ็ต | 1 เซ็ตจำนวน 5 ชิ้น
 *     จำนวน            ราคาต่อเซ็ต
 *     1-10 เซ็ต   (5-50 ชิ้น)      230
 *     11-30 เซ็ต  (55-150 ชิ้น)    180
 *     31-50 เซ็ต  (155-250 ชิ้น)   150
 *     51 เซ็ตขึ้นไป (255 ชิ้นขึ้นไป) 140
 *
 * รายละเอียดเพิ่มเติมจากหน้าเดียวกัน:
 *   • จำนวน 1-5 เซ็ต คละลายได้ · จำนวน 11 เซ็ตขึ้นไป คละลาย 5 เซ็ตต่อแบบ
 *   • ขนาด 58mm · พิมพ์ด้วยระบบ UV · ไม่มีขั้นต่ำในการสั่งผลิต
 *   • ฟรี!! เคลือบเงา / เคลือบด้าน
 *   • เคลือบพิเศษ [เนื้อทราย | กลิสเตอร์ | โฮโลแกรม] บวกเพิ่มชุดละ 40 บาท
 *   • 1 ชุด เลือกชนิดผิวเคลือบได้ 1 แบบ
 *
 * ⚠️ "ชุด" ในบรรทัดค่าเคลือบพิเศษ = "เซ็ต" (หน่วยขาย) → extra: 40 คิดต่อเซ็ตที่สั่ง
 * ⚠️ หน้าเว็บเดียวกันยังมี "ตะขอแขวนผนังอะคริลิค" (เรทละ 130/85/75/70/65/60 บาท/อัน)
 *    ซึ่งอยู่ในระบบแล้วเป็นฉบับร่างชื่อ otheracrylicproducts3-5 "อะคริลิค" — คนละตัวกัน ไม่แตะ
 *
 * ตัวเลือกมีกลุ่มเดียว (ผิวเคลือบ) แต่ทั้ง 5 แบบมีภาพประกอบของตัวเอง — ลูกค้ากดแล้ว
 * แกลเลอรีสลับไปภาพผิวแบบนั้นให้เห็นว่าหน้าตาต่างกันยังไง
 *
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

const ID = "vacuum-hook";
const REV = "v1";
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}-${REV}.jpg`;

/** ขายเป็นเซ็ต — 1 เซ็ต 5 ชิ้น (ตัวเลขในตารางเป็นราคาต่อเซ็ต ไม่ใช่ต่อชิ้น) */
const UNIT = "เซ็ต";
const PER_SET = 5;
const COAT_LABEL = "ผิวเคลือบ";

/** ราคา/เซ็ต ตามช่วงจำนวน — ตัวเลขตรงตามตารางในเว็บ ไม่ปัดไม่เกลี่ย */
const CELLS: Record<string, number[]> = { "": [230, 180, 150, 140] };

const TIERS: PriceTier[] = [
  { upTo: 10, label: `1-10 ${UNIT} (5-50 ชิ้น)` },
  { upTo: 30, label: `11-30 ${UNIT} (55-150 ชิ้น)` },
  { upTo: 50, label: `31-50 ${UNIT} (155-250 ชิ้น)` },
  { upTo: null, label: `51 ${UNIT}ขึ้นไป (255 ชิ้นขึ้นไป)` },
];

const PRICING: PriceMatrix = { unit: UNIT, driverLabels: [], tiers: TIERS, cells: CELLS };

/** เคลือบพิเศษ บวกเพิ่มชุดละ 40 บาท ("ชุด" ในเว็บ = เซ็ต ซึ่งเป็นหน่วยขาย) */
const SPECIAL_COAT_FEE = 40;

const OPTIONS: ProductOption[] = [
  {
    label: COAT_LABEL,
    choices: [
      { name: "เคลือบเงา", imageSrc: IMG("coat-gloss"), popular: true },
      { name: "เคลือบด้าน", imageSrc: IMG("coat-matte") },
      { name: `เคลือบพิเศษ · เนื้อทราย (+${SPECIAL_COAT_FEE})`, extra: SPECIAL_COAT_FEE, imageSrc: IMG("coat-sand") },
      { name: `เคลือบพิเศษ · กลิสเตอร์ (+${SPECIAL_COAT_FEE})`, extra: SPECIAL_COAT_FEE, imageSrc: IMG("coat-glitter") },
      { name: `เคลือบพิเศษ · โฮโลแกรม (+${SPECIAL_COAT_FEE})`, extra: SPECIAL_COAT_FEE, imageSrc: IMG("coat-holo") },
    ],
  },
];

const IMAGES: Product["images"] = [
  { emoji: "🪝", gradient: "from-sky-100 to-cyan-100", label: "ตะขอแขวนสูญญากาศ · งานจริง", src: IMG("hero") },
  { emoji: "📏", gradient: "from-sky-100 to-cyan-100", label: "ขนาดจาน 58 มม.", src: IMG("size-58") },
  { emoji: "🧮", gradient: "from-sky-100 to-cyan-100", label: `1 เซ็ต = ${PER_SET} ชิ้น`, src: IMG("set-5") },
  { emoji: "🔩", gradient: "from-sky-100 to-cyan-100", label: "ด้านหลัง · จุกยางสูญญากาศ", src: IMG("back") },
  { emoji: "🎨", gradient: "from-sky-100 to-cyan-100", label: "งานลูกค้า พิมพ์ลายเต็มหน้าจาน", src: IMG("real-set") },
  { emoji: "🔍", gradient: "from-sky-100 to-cyan-100", label: "ระยะใกล้ · ผิวเคลือบมีประกาย", src: IMG("closeup") },
];

const TERMS = [
  `*จำหน่ายจำนวนเป็นเซ็ต — 1 เซ็ตจำนวน ${PER_SET} ชิ้น (ราคาในตารางเป็นราคาต่อเซ็ต)`,
  "*ขนาด 58 มม. · ตัวเรือนพลาสติกสีขาว ด้านหลังเป็นจุกยางสูญญากาศ",
  "*ติดได้กับผิวเรียบมันเท่านั้น เช่น กระจก กระเบื้อง โลหะ — ผิวหยาบ ผิวพ่นสี หรือผนังปูนเปลือยจะไม่เกาะ",
  "*ฟรี!! เคลือบเงา / เคลือบด้าน",
  `*เคลือบพิเศษ [เนื้อทราย | กลิสเตอร์ | โฮโลแกรม] บวกเพิ่มชุดละ ${SPECIAL_COAT_FEE} บาท`,
  "*1 ชุด เลือกชนิดผิวเคลือบได้ 1 แบบ",
  "*จำนวน 1-5 เซ็ต คละลายได้",
  "*จำนวน 11 เซ็ตขึ้นไป คละลาย 5 เซ็ตต่อแบบ",
  "*ไม่มีขั้นต่ำในการสั่งผลิต",
  "*พิมพ์ด้วยระบบ UV",
  "*ทางร้านใช้สี R G B สีงานสกรีนที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
  "*ทางร้านมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องต่างกันประมาณ 5-10% มีโอกาสที่สีแต่ละรอบไม่เหมือนกันหากผลิตคนละเครื่อง",
].join("\n");

const TABS: Product["tabs"] = [
  {
    title: "วิธีสั่งงาน",
    text:
      'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกผิวเคลือบและจำนวน "เซ็ต" ที่ต้องการ (1 เซ็ต = 5 ชิ้น) แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"\n• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น สั่งกี่ลาย ลายละกี่เซ็ต · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\nหรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: ผิวเคลือบที่เลือก · จำนวนเซ็ต · จำนวนลาย · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)',
  },
  {
    title: "รายละเอียดสินค้า",
    text:
      `• จำหน่ายเป็นเซ็ต 1 เซ็ต ${PER_SET} ชิ้น — ราคาในตารางคือราคาต่อเซ็ต\n• ขนาดจาน 58 มม. มีขนาดเดียว\n• ตัวเรือนพลาสติกสีขาว ก้านตะของ่ามเดียว ด้านหลังเป็นจุกยางสูญญากาศ (ไม่ใช่เทปกาว) แกะออกย้ายที่ติดใหม่ได้\n• ติดได้กับผิวเรียบมันเท่านั้น เช่น กระจก กระเบื้อง โลหะ ตู้เย็น — เช็ดผิวให้แห้งสนิทก่อนติด จะเกาะแน่นกว่า\n• พิมพ์ลายเต็มหน้าจานด้วยระบบ UV`,
  },
  {
    title: "ผิวเคลือบ",
    text:
      `ฟรี ไม่คิดเพิ่ม::\n• เคลือบเงา — ผิวมันวาว สีสดที่สุด สะท้อนแสง (แบบที่ลูกค้าสั่งบ่อยสุด)\n• เคลือบด้าน — ผิวด้านนวล ไม่สะท้อนแสง ไม่เห็นรอยนิ้วมือ สีจะดรอปลงจากเคลือบเงาเล็กน้อย\n\nเคลือบพิเศษ บวกเพิ่มชุดละ ${SPECIAL_COAT_FEE} บาท::\n• เนื้อทราย — ผิวสากละเอียดเหมือนเม็ดทราย จับแล้วรู้สึกได้\n• กลิสเตอร์ — ฟิล์มกากเพชร มีประกายวิบวับเวลาโดนแสง\n• โฮโลแกรม — ฟิล์มเหลือบรุ้ง เปลี่ยนสีตามมุมมอง\n\n• 1 ชุด เลือกชนิดผิวเคลือบได้ 1 แบบ — อยากได้หลายผิวให้แยกสั่งเป็นคนละรายการ\n• ภาพประกอบบนปุ่มตัวเลือกเป็นภาพจำลองผิวแต่ละแบบ กดเลือกแล้วแกลเลอรีจะสลับให้ดู`,
  },
  {
    title: "การเตรียมไฟล์",
    text:
      "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n• ลายเป็นวงกลม เผื่อขอบตัดตกให้ด้วย — งานจริงเป็นจานกลม 58 มม.\n• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด",
  },
  {
    title: "การรับประกันสินค้า",
    text:
      "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• สีหรืออะไหล่ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\nไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\nระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
  },
];

const product: Product = {
  id: ID,
  name: "ตะขอแขวนสูญญากาศ",
  category: "home",
  price: CELLS[""][0],
  emoji: "🪝",
  gradient: "from-sky-100 to-cyan-100",
  imageSrc: IMG("hero"),
  rating: 5,
  sold: 0,
  description:
    `ตะขอแขวนสูญญากาศพิมพ์ลายตามสั่ง จานกลม 58 มม. ด้านหลังเป็นจุกยางสูญญากาศ ติดกระจก กระเบื้อง โลหะ แกะย้ายที่ได้ ไม่ทิ้งคราบกาว — จำหน่ายเป็นเซ็ต 1 เซ็ต ${PER_SET} ชิ้น เลือกผิวเคลือบได้ 5 แบบ`,
  highlights: [
    `1 เซ็ต ${PER_SET} ชิ้น เริ่มต้นเซ็ตละ ${CELLS[""][0]} บาท`,
    "จุกสูญญากาศ แกะย้ายที่ติดใหม่ได้ ไม่ทิ้งคราบกาว",
    "ผิวเคลือบ 5 แบบ · เงา/ด้าน ฟรี",
  ],
  options: OPTIONS,
  images: IMAGES,
  pricing: PRICING,
  priceRates: [
    {
      id: "r1",
      label: "เรทที่ 1",
      desc: `คละลายได้ 1-5 ${UNIT} · ตั้งแต่ 11 ${UNIT}ขึ้นไป คละลาย 5 ${UNIT}ต่อแบบ`,
      minPerDesign: 5,
      freeMixBelowQty: 6,
      pricing: PRICING,
    },
  ],
  tierByDesign: true,
  bulkAskQty: 200,
  terms: TERMS,
  tabs: TABS,
  seo: {
    title: "รับทำตะขอแขวนสูญญากาศ พิมพ์ลายตามสั่ง 1 เซ็ต 5 ชิ้น เริ่ม 230 บาท",
    keywords: [
      "ตะขอแขวนสูญญากาศ",
      "รับทำตะขอแขวน",
      "ตะขอแขวนพิมพ์ลาย",
      "ตะขอติดกระจก",
      "ตะขอแขวนผนัง",
      "ที่แขวนของสั่งทำ",
      "ของชำร่วยสั่งทำ",
      "iDucky",
    ],
    faqs: [
      {
        q: "ตะขอแขวนสูญญากาศ ราคาเท่าไหร่?",
        a: `ขายเป็นเซ็ต 1 เซ็ต ${PER_SET} ชิ้น — 1-10 เซ็ต เซ็ตละ 230 บาท · 11-30 เซ็ต 180 บาท · 31-50 เซ็ต 150 บาท · 51 เซ็ตขึ้นไป 140 บาท`,
      },
      {
        q: "1 เซ็ตได้กี่ชิ้น สั่งชิ้นเดียวได้ไหม?",
        a: `1 เซ็ตได้ ${PER_SET} ชิ้น สั่งแยกเป็นชิ้นไม่ได้ ต้องสั่งเป็นเซ็ต แต่ไม่มีขั้นต่ำ — สั่ง 1 เซ็ตก็ได้`,
      },
      {
        q: "คละลายได้ไหม?",
        a: `จำนวน 1-5 เซ็ต คละลายได้ ตั้งแต่ 11 เซ็ตขึ้นไป คละลายได้โดยสั่งลายละ 5 เซ็ตขึ้นไป`,
      },
      {
        q: "ผิวเคลือบมีกี่แบบ คิดเงินเพิ่มไหม?",
        a: `มี 5 แบบ — เคลือบเงา กับ เคลือบด้าน ฟรีไม่คิดเพิ่ม ส่วนเคลือบพิเศษ (เนื้อทราย · กลิสเตอร์ · โฮโลแกรม) บวกเพิ่มชุดละ ${SPECIAL_COAT_FEE} บาท และ 1 ชุดเลือกผิวได้ 1 แบบ`,
      },
      {
        q: "ติดกับผนังปูนได้ไหม?",
        a: "ไม่ได้ครับ ด้านหลังเป็นจุกยางสูญญากาศ ต้องติดกับผิวเรียบมันเท่านั้น เช่น กระจก กระเบื้อง โลหะ ตู้เย็น — ข้อดีคือแกะออกย้ายที่ติดใหม่ได้ ไม่ทิ้งคราบกาว",
      },
      {
        q: "ตะขอแขวนสูญญากาศ ต่างกับตะขอแขวนผนังอะคริลิคยังไง?",
        a: "ตัวสูญญากาศเป็นจานพลาสติกกลม 58 มม. ด้านหลังเป็นจุกยาง แกะย้ายที่ได้ ขายเป็นเซ็ต 5 ชิ้น ส่วนตะขอแขวนผนังอะคริลิคเป็นแผ่นอะคริลิคไดคัทตามลาย ด้านหลังเป็นเทปกาวสองหน้า ขายเป็นชิ้น",
      },
    ],
  },
  hidden: true, // ฉบับร่าง — กดเผยแพร่เองที่ /admin/products
};

const range = priceRange(product);
const saved: Product = { ...product, priceMin: range.min, priceMax: range.max, hasQuote: hasQuoteOption(product) };

const FILES = ["hero", "size-58", "set-5", "back", "real-set", "closeup", "coat-gloss", "coat-matte", "coat-sand", "coat-glitter", "coat-holo"];

async function uploadImages() {
  if (!IMAGES_DIR) throw new Error("ต้องระบุ --images=<โฟลเดอร์> (รัน scripts/vacuum-hook-art.mjs ก่อน)");
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
  for (const t of TIERS) console.log(`   ${t.label.padEnd(30)} ${CELLS[""][TIERS.indexOf(t)]} บาท/${UNIT}`);
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
