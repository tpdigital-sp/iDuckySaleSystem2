/**
 * สร้างสินค้า "GRIPTOK อะคริลิค ปั๊มนูน" (griptok-emboss)
 *
 *   node scripts/griptok-emboss-art.mjs                  # เตรียมภาพก่อน (.cache/griptok-emboss/upload)
 *   npx tsx scripts/add-griptok-emboss.ts                # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   npx tsx scripts/add-griptok-emboss.ts --write        # อัปภาพ + เขียนลง Supabase (ฉบับร่าง)
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/griptok
 *   บล็อกหัวข้อ "GRIPTOK อะคริลิค ปั๊มนูน UV Printing" (คัดจากหน้าเว็บ 24 ส.ค. 69)
 *   ตารางเดียว: แกนขนาด 5-10 cm × 6 ช่วงจำนวน (ช่วงเดียวกับ Griptok อะคริลิค id 1-4)
 *
 *   จำนวน      5cm  6cm  7cm  8cm  9cm  10cm
 *   1-10       200  200  215  230  245  260
 *   11-29      129  139  149  159  169  179
 *   30-49      125  135  145  155  165  175
 *   50-199     120  130  140  150  160  170
 *   200-499    115  125  135  145  155  165
 *   500++      110  120  130  140  150  160
 *
 * เงื่อนไขจากบล็อกเดียวกัน:
 *   • ฐานสีดำ/สีขาว ฟรี · เฉพาะฐานใส +5 บาท
 *   • Add On อะคริลิคตัวน้อย (1.5-2cm, หนา 1.5mm) +15 บาท/ชิ้น
 *   • Fimo ตัวน้อยเขย่า (ดาว/ไข่มุก/เส้น) ใส่ให้ฟรี กำหนดปริมาณไม่ได้ — หากไม่รับให้แจ้ง
 *
 * ภาพฐาน Griptok ใช้ร่วมกับสินค้า Griptok อะคริลิค (products/griptok-acrylic/base-*.jpg)
 * ภาพที่เหลืออัปใหม่ที่ products/griptok-emboss/*-v1.jpg (⚠️ ห้ามอัปทับชื่อเดิม ครั้งหน้าขึ้น v2)
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { hasQuoteOption, priceRange, type PriceTier, type Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const DIR = ".cache/griptok-emboss/upload";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const ID = "griptok-emboss";
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}-v1.jpg`;
/** ภาพฐาน Griptok ที่มีในคลังอยู่แล้ว (สินค้า Griptok อะคริลิค ใช้ชุดเดียวกัน) */
const BASE_IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/griptok-acrylic/${name}.jpg`;

const TIERS: PriceTier[] = [
  { upTo: 10, label: "1-10 ชิ้น" },
  { upTo: 29, label: "11-29 ชิ้น" },
  { upTo: 49, label: "30-49 ชิ้น" },
  { upTo: 199, label: "50-199 ชิ้น" },
  { upTo: 499, label: "200-499 ชิ้น" },
  { upTo: null, label: "500 ชิ้นขึ้นไป" },
];

const SIZES = ["5cm", "6cm", "7cm", "8cm", "9cm", "10cm"] as const;
/** ราคาแต่ละขนาด เรียงตาม TIERS (คัดจากตารางบนเว็บ — แถวบนเว็บเป็นรายช่วงจำนวน ที่นี่กางเป็นรายขนาด) */
const PRICES: Record<(typeof SIZES)[number], number[]> = {
  "5cm": [200, 129, 125, 120, 115, 110],
  "6cm": [200, 139, 135, 130, 125, 120],
  "7cm": [215, 149, 145, 140, 135, 130],
  "8cm": [230, 159, 155, 150, 145, 140],
  "9cm": [245, 169, 165, 160, 155, 150],
  "10cm": [260, 179, 175, 170, 165, 160],
};

const FIMO_MIX = "ใส่ Fimo คละแบบ (ร้านเลือกให้)";
const FIMO_NO = "ไม่รับ Fimo";
const MINI_YES = "เพิ่มอะคริลิคตัวน้อย 1.5-2 ซม.";

const TABS: Product["tabs"] = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text: [
      "• Griptok อะคริลิคปั๊มนูน — ตัวเรือนปั๊มนูนเป็นกระเปาะ ใส่ตัวน้อย/Fimo เขย่าได้ · พิมพ์ระบบ UV Printing",
      "• 1-10 ชิ้น สามารถคละลายได้ · ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย คละขนาด ขั้นต่ำ 5 ชิ้น",
      "• ฐานสีดำและสีขาว ไม่บวกเงินเพิ่ม · เฉพาะฐานใส บวกเพิ่ม 5 บาท",
      "• Add On อะคริลิคตัวน้อย (ขนาด 1.5-2 ซม. หนา 1.5 mm) บวกเพิ่มตัวละ 15 บาท · ระบุจำนวนได้",
      "• Fimo ตัวน้อยเขย่า มี 3 แบบ — ดาว | ไข่มุก | เส้น ใส่ให้ฟรี · เลือกแบบได้ตอนสั่ง หรือให้ร้านคละแบบให้ · กำหนดปริมาณไม่ได้",
      "• หากไม่รับ Fimo เลือก “ไม่รับ Fimo” ไว้ได้เลย ทางร้านจะเขียนกำกับที่บิล",
      "• สั่งตั้งแต่ 24 ชิ้นขึ้นไป ฟรีแพ็คเกจ (คละลาย/ขั้นต่ำ 24 30 36 42 ... บวกเพิ่มทีละ 6 ชิ้น ไม่รับเศษที่หาร 6 ไม่ลงตัว)",
      "• ตัดตกจากขนาดงานจริงด้านละ 3mm · ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดแนวทแยง)",
      "• ไฟล์ นามสกุล .Ai .Psd .Png หรือพื้นหลังใส",
      "• ทางร้านมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องต่างกันประมาณ 5-10% · ใช้สี RGB สีที่ได้อาจสว่าง/ดรอปลง +-5% ถึง +-15%",
      "• สำหรับงานอะคริลิคทุกประเภท ทางร้านจะแปะฟิล์มกันรอยไว้ทุกชิ้น",
    ].join("\n"),
  },
  {
    title: "วิธีสั่งงาน",
    text: "สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกจำนวนและตัวเลือกที่ต้องการ แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง \"แนบลายของคุณ\"\n• ระบุรายละเอียดเพิ่มเติมในช่อง \"หมายเหตุถึงร้าน\" เช่น ขนาด/รุ่นที่ต้องการ · วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\nหรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: สินค้า/ขนาดที่เลือก · รายละเอียดเพิ่มเติม (ถ้ามี) · จำนวน · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
  },
  {
    title: "การเตรียมไฟล์",
    text: "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด",
  },
  {
    title: "การรับประกันสินค้า",
    text: "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• สีหรืออะไหล่ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\nไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\nระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
  },
];

const product: Product = {
  id: ID,
  slug: "griptok-acrylic-emboss",
  name: "GRIPTOK อะคริลิค ปั๊มนูน",
  category: "phone-gadget",
  price: 110,
  emoji: "🤳",
  gradient: "from-slate-100 to-blue-100",
  imageSrc: IMG("gallery-1"),
  rating: 5,
  sold: 0,
  badge: "ใหม่",
  description:
    "Griptok อะคริลิคปั๊มนูน พิมพ์ลายตามสั่งด้วยระบบ UV Printing ตัวเรือนปั๊มนูนเป็นกระเปาะใส " +
    "ใส่ Fimo ตัวน้อยเขย่าได้ (ดาว/ไข่มุก/เส้น ฟรี!) เพิ่มอะคริลิคตัวน้อย 1.5-2 ซม. ในกระเปาะได้ " +
    "เลือกขนาดได้ 5-10 ซม. ฐานสีขาว/ดำ/ใส ไม่มีขั้นต่ำในการสั่งผลิต ยิ่งสั่งเยอะยิ่งถูก",
  highlights: [
    "ตัวเรือนปั๊มนูนเป็นกระเปาะ — ใส่ตัวน้อย/Fimo เขย่าได้",
    "ฟรี! Fimo ตัวน้อยเขย่า 3 แบบ (ดาว/ไข่มุก/เส้น)",
    "ขนาด 5-10 ซม. · ฐานสีขาว/ดำ/ใส",
    "1-10 ชิ้น คละลายได้ · 11 ชิ้นขึ้นไป คละลาย คละขนาด",
    "ยิ่งสั่งเยอะยิ่งถูก — เริ่มต้น 110 บาท/ชิ้น",
  ],
  // แกลเลอรีจำกัด 5 ช่อง (MAX_PHOTOS ใน ProductEditor) — ช่องคลิปแทนรูป "มุมเฉียง" (gallery-5 เนื้อหาเดียวกับคลิป)
  // ⚠️ คลิปห้ามเป็นช่องแรก — รูปแรกถูกใช้เป็นภาพหน้าปกสินค้าในที่อื่นทั้งเว็บ (ดู ProductImage.videoSrc)
  images: [
    { emoji: "🤳", gradient: "from-slate-100 to-blue-100", label: "กระเปาะไข่มุก", src: IMG("gallery-1") },
    {
      emoji: "🎬",
      gradient: "from-violet-100 to-indigo-200",
      // ปุ่มรูปย่ออ่านออกเสียงว่า "ดูคลิป" + ชื่อนี้ต่อกัน — ตั้งชื่อให้ต่อแล้วเป็นประโยค
      label: "งานจริง — กระเปาะปั๊มนูน ใส่ Fimo เขย่าได้",
      src: IMG("clip-emboss-poster"),
      videoSrc: `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/clip-emboss-v1.mp4`,
    },
    { emoji: "⭐", gradient: "from-amber-100 to-yellow-200", label: "Fimo ดาวพาสเทล", src: IMG("gallery-2") },
    { emoji: "🐶", gradient: "from-sky-100 to-blue-200", label: "ตัวอย่างงานจริง", src: IMG("gallery-3") },
    { emoji: "🦁", gradient: "from-orange-100 to-amber-200", label: "กระเปาะไข่มุก ลายสิงโต", src: IMG("gallery-4") },
  ],
  pricing: {
    unit: "ชิ้น",
    driverLabels: ["ขนาด"],
    tiers: TIERS,
    cells: Object.fromEntries(SIZES.map((s) => [s, PRICES[s]])),
  },
  options: [
    {
      label: "ขนาด",
      choices: SIZES.map((s) => ({ name: s, imageSrc: IMG(`size-${s.replace("cm", "")}`) })),
    },
    {
      label: "ฐาน Griptok",
      choices: [
        { name: "สีขาว", imageSrc: BASE_IMG("base-white") },
        { name: "สีดำ", imageSrc: BASE_IMG("base-black") },
        { name: "สีใส (มีรอยขนแมวบ้าง)", extra: 5, imageSrc: BASE_IMG("base-clear") },
      ],
      display: "dropdown",
    },
    {
      // กลุ่มติ๊ก (multi) เพื่อเปิดช่องจำนวน (+฿15 × จำนวนตัวน้อย) — ไม่ติ๊ก = ไม่เพิ่ม จึงไม่มีตัวเลือก "ไม่เพิ่ม"
      label: "อะคริลิคตัวน้อย (Add On)",
      display: "multi",
      choices: [
        { name: MINI_YES, extra: 15, qty: true, qtyMax: 20, imageSrc: IMG("addon-mini") },
      ],
    },
    {
      // Fimo ใส่ให้ฟรีเป็นค่าเริ่มต้นตามหน้าเว็บ — "หากไม่รับ Fimo รบกวนแจ้งด้วยนะคะ"
      // ผู้ใช้สั่ง (24 ส.ค. 69): กางเป็นตัวเลือกรายแบบ ดาว/ไข่มุก/เส้น พร้อมภาพประกอบรายตัว
      label: "Fimo ตัวน้อยเขย่า (ฟรี)",
      choices: [
        { name: FIMO_MIX, popular: true, imageSrc: IMG("fimo-mix") },
        { name: "Fimo ดาว", imageSrc: IMG("fimo-star") },
        { name: "Fimo ไข่มุก", imageSrc: IMG("fimo-pearl") },
        { name: "Fimo เส้น", imageSrc: IMG("fimo-strand") },
        { name: FIMO_NO },
      ],
    },
  ],
  terms: [
    "1-10 ชิ้น สามารถคละลายได้ · ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย คละขนาด ขั้นต่ำ 5 ชิ้น",
    "ฐานสีดำและสีขาว ไม่บวกเงินเพิ่ม · เฉพาะฐานใส บวกเพิ่ม 5 บาท",
    "อะคริลิคตัวน้อย ขนาด 1.5-2 ซม. หนา 1.5 mm บวกเพิ่มตัวละ 15 บาท (ระบุจำนวนได้)",
    "Fimo ตัวน้อยเขย่า (ดาว/ไข่มุก/เส้น) ใส่ให้ฟรี · เลือกแบบได้ตอนสั่ง หรือให้ร้านคละแบบให้ · ไม่สามารถกำหนดปริมาณได้",
    "สั่งตั้งแต่ 24 ชิ้นขึ้นไป ฟรีแพ็คเกจ (คละลาย/ขั้นต่ำ 24 30 36 42 ... บวกเพิ่มทีละ 6 ชิ้น ไม่รับเศษที่หาร 6 ไม่ลงตัว)",
    "ตัดตกจากขนาดงานจริงด้านละ 3mm · ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดแนวทแยง)",
    "ทางร้านใช้สีระบบ RGB สีงานที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
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

console.log("ราคา:", range, "· ตัวเลือก:", saved.options.length, "กลุ่ม · แกนราคา:", saved.pricing?.driverLabels);
for (const s of SIZES) console.log(`  ${s.padEnd(5)}`, PRICES[s].join(" / "));

if (!WRITE) {
  console.log("(ยังไม่เขียน — ใส่ --write เพื่ออัปภาพ + บันทึกลง Supabase)");
  process.exit(0);
}

async function main() {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 1. อัปภาพจาก .cache/griptok-emboss/upload → products/griptok-emboss/
  if (!existsSync(DIR)) {
    console.error(`ไม่พบโฟลเดอร์ภาพ ${DIR} — รัน node scripts/griptok-emboss-art.mjs ก่อน`);
    process.exit(1);
  }
  const files = readdirSync(DIR).filter((f) => f.endsWith(".jpg") || f.endsWith(".mp4"));
  for (const file of files) {
    const buf = readFileSync(`${DIR}/${file}`);
    const up = await sb.storage
      .from("product-images")
      .upload(`products/${ID}/${file}`, buf, { contentType: file.endsWith(".mp4") ? "video/mp4" : "image/jpeg", upsert: true });
    if (up.error) {
      console.error(`อัป ${file} ไม่สำเร็จ:`, up.error.message);
      process.exit(1);
    }
    console.log(`⬆️  ${file}`);
  }

  // 2. เขียนสินค้า (กันเผลอทับสินค้าอื่นที่บังเอิญใช้ id เดียวกัน)
  const { data: row } = await sb.from("products").select("id,name,sort").eq("id", ID).maybeSingle();
  if (row && row.name !== saved.name) {
    console.error(`id ${ID} ถูกใช้โดยสินค้าอื่นอยู่: "${row.name}" — หยุดไว้ก่อน`);
    process.exit(1);
  }
  const { data: maxRow } = await sb.from("products").select("sort").order("sort", { ascending: false }).limit(1);
  const sort = (row?.sort as number | undefined) ?? ((maxRow?.[0]?.sort as number | undefined) ?? 0) + 1;
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
  console.log(`✅ บันทึกแล้ว: ${ID} (sort ${sort}) — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
}

main();
