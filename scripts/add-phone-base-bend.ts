/**
 * สินค้า "สแตนดี้ตั้งโทรศัพท์ (แบบฐานดัดง้อ)" — ดึงราคาจากเว็บตารางราคา
 * iduckyofficial-pricelists.com/standyphonebase → หัวข้อ "สแตนดี้ตั้งโทรศัพท์ แบบที่ 5"
 *
 *   npx tsx scripts/add-phone-base-bend.ts                                  # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   npx tsx scripts/add-phone-base-bend.ts --upload --images=<dir>          # อัปภาพขึ้น Supabase Storage
 *   npx tsx scripts/add-phone-base-bend.ts --write                          # เขียนลง Supabase (คงสถานะฉบับร่าง)
 *
 * ราคาจากเว็บ (ตารางของแบบที่ 5):
 *   1-10 ชิ้น 320 · 11-49 310 · 50-199 305 · 200 ขึ้นไป 300
 * ขนาด: **ขนาดเดียว** สูงประมาณ 14 ซม. · ฐานกว้าง 8 ซม.
 *   (เว็บมีบรรทัด "เพิ่มขนาด cm ละ 10 บาท" — เก็บไว้เป็นหมายเหตุอย่างเดียว ไม่เปิดเป็นตัวเลือกให้เลือกเอง
 *    เพราะทางร้านยืนยันว่าขายขนาดเดียว ใครอยากได้ใหญ่กว่านี้ต้องคุยกับแอดมินเป็นงานสั่งพิเศษ)
 * จุดดัดงอ 3 จุด — อะคริลิคแผ่นเดียวดัดขึ้นรูป (ไม่ใช่งานประกอบ) จึงคิดอะคริลิคพิเศษ "ต่อชิ้น" ครั้งเดียว
 * Add on อะคริลิคพิเศษ — ตารางของแบบนี้มีคอลัมน์เดียว: 14cm เรทปลีก 30 · เรทส่ง 30 (เท่ากัน)
 * ข้อจำกัดของแบบนี้: **ได้เฉพาะอะคริลิคใส / โฮโลแกรม / กลิตเตอร์** (ไม่มีอะคริลิคสีทึบ)
 * เงื่อนไขใต้ตาราง: 1-10 ชิ้น คละดีเทลได้ไม่จำกัด · 11 ชิ้นขึ้นไป คละลาย/คละขนาด สั่งลายละ 5 ชิ้นขึ้นไป
 *
 * ภาพ: เตรียมด้วย scripts/phone-base-bend-art.mjs (งานจริง 4 · ภาพวาดตัวเลือก 8 · สีอะคริลิคใช้ชุดกลาง)
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { hasQuoteOption, priceRange, type Product, type ProductOption } from "../src/lib/products";
// @ts-expect-error — สคริปต์ JS ล้วน (ภาพสีอะคริลิคชุดกลางของทั้งระบบ)
import { acrylicColorImage } from "./acrylic-colors.mjs";

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

const ID = "phone-stand-bend-base";
/** ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ขึ้นรุ่นใหม่ให้ขยับ v1 → v2 */
const REV = "v3";
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}-${REV}.jpg`;

/** ภาพงานจริงจากเว็บตารางราคา (หัวข้อ "ตัวอย่าง ... (แบบฐานดัดง้อ) แบบที่ 5") */
const GALLERY = ["gallery-1", "gallery-2", "gallery-3", "gallery-4"];
/** สินค้านี้มีขนาดเดียว — สูงประมาณ 14 ซม. ฐานกว้าง 8 ซม. */
const SIZE_CM = 14;
/** ค่าอะคริลิคพิเศษต่อชิ้น (ตาราง Add on ของแบบนี้ — 14cm เรทปลีก 30 · เรทส่ง 30 เท่ากัน) */
const SPECIAL_FEE = 30;

/**
 * สีอะคริลิคที่แบบนี้ทำได้ — เว็บระบุ "ได้เฉพาะอะคริลิคใส , โฮโลแกรม , กลิสเตอร์"
 * จึงแยกเป็น 3 ตัวเลือกตามนั้น (ไม่มีอะคริลิคสีทึบ / สีขุ่น / กระจก เหมือนสินค้าอะคริลิคตัวอื่น)
 * ⚠️ สะกดว่า "กลิตเตอร์" ให้ตรงกับชื่อสีในชาร์ตกลาง (acrylic-colors.mjs) ที่โผล่ในเมนูเลือกสีถัดไป
 *    ส่วนบรรทัดในข้อควรทราบ/แท็บ คงคำตามเว็บไว้
 */
const HOLO_COLORS = [
  "hologram-01",
  "hologram-02",
  "hologram-รุ้ง",
  "hologram-จุด",
  "hologram-หิมะ",
  "hologram-ดาว",
  "hologram-Stardust",
  "hologram-Dust",
  "hologram-หัวใจ",
];
const GLITTER_COLORS = ["อะคริลิคกลิตเตอร์-เงิน", "อะคริลิคกลิตเตอร์-ทอง", "อะคริลิคกลิตเตอร์-รุ้ง"];

const FILES = [...GALLERY, "bend-points", "clear"];

/**
 * ตาราง "Add on อะคริลิคพิเศษ" ตามเว็บตารางราคา (ใต้ตารางราคาของแบบที่ 5)
 * แบบนี้มีขนาดเดียวจึงมีคอลัมน์เดียว — 14cm เรทปลีก 30 · เรทส่ง 30 (เท่ากันทั้งสองเรท)
 */
const HEAD = "background:#8fb8dd;color:#ffffff;font-weight:700;white-space:nowrap";
const ROWHEAD = "text-align:left;white-space:nowrap;font-weight:700;color:#334155";
const CELL = "text-align:center;white-space:nowrap;background:#ecfeff;font-weight:700;color:#0e7490";

const ADDON_TABLE =
  `<div style="overflow:hidden;border:1px solid #e2e8f0;border-radius:16px">` +
  `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:0">` +
  `<thead><tr style="${HEAD}"><th scope="col" style="text-align:left;white-space:nowrap">เพิ่มเติม</th>` +
  `<th scope="col" style="text-align:center;white-space:nowrap">${SIZE_CM}cm</th></tr></thead><tbody>` +
  `<tr style="border-top:1px solid #e2e8f0"><th scope="row" style="${ROWHEAD}">(เรทราคาปลีก) อคล.พิเศษ</th>` +
  `<td style="${CELL}">${SPECIAL_FEE}</td></tr>` +
  `<tr style="background:#f8fafc;border-top:1px solid #e2e8f0"><th scope="row" style="${ROWHEAD}">(เรทราคาส่ง) อคล.พิเศษ</th>` +
  `<td style="${CELL}">${SPECIAL_FEE}</td></tr>` +
  `</tbody></table></div>` +
  `<p style="margin-top:8px">แบบฐานดัดง้อเป็น <strong>อะคริลิคแผ่นเดียวดัดขึ้นรูป</strong> — เลือกอะคริลิคพิเศษแล้วคิดเพิ่ม <strong>${SPECIAL_FEE} บาท/ชิ้น</strong> ครั้งเดียว (ไม่ต้องคิดแยกฐาน/ตัว)</p>` +
  `<p style="margin-top:6px;color:#0e7490"><strong>เรทราคาปลีก (1-10 ชิ้น) กับ เรทราคาส่ง (11 ชิ้นขึ้นไป) ราคาเท่ากัน</strong> — เลือกในหน้าสั่งซื้อได้เลย ระบบบวกให้อัตโนมัติ</p>` +
  `<p style="margin-top:6px;color:#b45309">แบบนี้ทำได้เฉพาะ <strong>อะคริลิคใส · โฮโลแกรม · กลิตเตอร์</strong> เท่านั้น (ไม่มีอะคริลิคสีทึบ)</p>`;

const HOLO = "โฮโลแกรม";
const GLITTER = "กลิตเตอร์";

/**
 * เมนูเลือกลาย — โผล่เมื่อเลือกกลุ่มนั้น
 * ⚠️ ค่าอะคริลิคพิเศษ 30 บาท/ชิ้น คิดที่ปุ่ม "สีอะคริลิค" ไปแล้ว
 *    ตรงนี้ต้องไม่ใส่ extra อีก ไม่งั้นบวกซ้ำเป็น 60
 */
const colorPicker = (group: string, names: string[]): ProductOption => ({
  label: `เลือกลาย${group}`,
  display: "dropdown",
  stockBearing: true,
  showWhen: { label: "สีอะคริลิค", choices: [group] },
  choices: names.map((name) => {
    const img = acrylicColorImage(name);
    return { name, ...(img ? { imageSrc: img } : {}) };
  }),
});

const options: ProductOption[] = [
  {
    label: "สีอะคริลิค",
    stockBearing: true,
    choices: [
      { name: "อะคริลิคใส", imageSrc: IMG("clear") },
      { name: HOLO, extra: SPECIAL_FEE, imageSrc: acrylicColorImage("hologram-รุ้ง") },
      { name: GLITTER, extra: SPECIAL_FEE, imageSrc: acrylicColorImage("อะคริลิคกลิตเตอร์-รุ้ง") },
    ],
  },
  colorPicker(HOLO, HOLO_COLORS),
  colorPicker(GLITTER, GLITTER_COLORS),
];

const TIERS = [
  { upTo: 10, label: "1-10 ชิ้น" },
  { upTo: 49, label: "11-49 ชิ้น" },
  { upTo: 199, label: "50-199 ชิ้น" },
  { upTo: null, label: "200 ชิ้นขึ้นไป" },
];
const PRICES = [320, 310, 305, 300];

const pricing = { unit: "ชิ้น", driverLabels: [], tiers: TIERS, cells: { "": PRICES } };

const seo = {
  title: "สแตนดี้ตั้งโทรศัพท์ แบบฐานดัดง้อ อะคริลิคพิมพ์ลาย เริ่ม 300 บาท",
  description:
    "รับผลิตสแตนดี้ตั้งโทรศัพท์แบบฐานดัดง้อ (แบบที่ 5) อะคริลิคแผ่นเดียวดัดขึ้นรูป 3 จุด พิมพ์ UV เต็มแผ่น " +
    "สูงประมาณ 14 ซม. ฐานกว้าง 8 ซม. · เลือกอะคริลิคใส โฮโลแกรม กลิตเตอร์ · 1-10 ชิ้นไม่มีขั้นต่ำ",
  keywords: [
    "สแตนดี้ตั้งโทรศัพท์",
    "ที่ตั้งโทรศัพท์อะคริลิค",
    "สแตนดี้ตั้งโทรศัพท์ แบบที่ 5",
    "ฐานดัดง้อ",
    "acrylic phone stand",
    "ที่วางมือถือพิมพ์ลาย",
    "รับผลิตที่ตั้งมือถือ",
    "อะคริลิคดัดขึ้นรูป",
    "ของพรีเมียมพิมพ์ลาย",
    "iDucky",
  ],
  faqs: [
    {
      q: "สแตนดี้ตั้งโทรศัพท์ แบบฐานดัดง้อ ราคาเท่าไหร่?",
      a: "เริ่มชิ้นละ 320 บาท (1-10 ชิ้น) ลดตามจำนวน — 11-49 ชิ้น 310 · 50-199 ชิ้น 305 · 200 ชิ้นขึ้นไป 300 บาท",
    },
    {
      q: "ขนาดเท่าไหร่ มีให้เลือกกี่ขนาด?",
      a: "มีขนาดเดียว สูงประมาณ 14 ซม. ฐานกว้าง 8 ซม. ความสูงเริ่มวัดจากพื้นฐาน — ถ้าต้องการใหญ่กว่านี้ทักแอดมินเป็นงานสั่งพิเศษ (เพิ่มขนาด ซม. ละ 10 บาท)",
    },
    {
      q: "แบบฐานดัดง้อต่างจากแบบอื่นยังไง?",
      a: "เป็นอะคริลิคแผ่นเดียวดัดขึ้นรูป มีจุดดัดงอ 3 จุด (ริมกันเครื่องไหล · ยกแผ่นหลัง · ตั้งองศาพิง) ไม่ต้องประกอบ พิมพ์ลายเต็มแผ่นทั้งฐานและแผ่นหลัง วางมือถือได้ทั้งแนวตั้งและแนวนอน",
    },
    {
      q: "เลือกอะคริลิคสีอะไรได้บ้าง?",
      a: "แบบนี้ทำได้เฉพาะอะคริลิคใส โฮโลแกรม และกลิตเตอร์เท่านั้น (ไม่มีอะคริลิคสีทึบ) เลือกอะคริลิคพิเศษคิดเพิ่ม 30 บาทต่อชิ้น (เรทปลีกกับเรทส่งเท่ากัน)",
    },
    {
      q: "สั่งขั้นต่ำกี่ชิ้น คละลายได้ไหม?",
      a: "1-10 ชิ้นไม่มีขั้นต่ำ คละดีเทลได้ไม่จำกัด · ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย/คละขนาดได้ โดยสั่งลายละ 5 ชิ้นขึ้นไป ถ้าไม่ถึงจำนวนคิดตามราคาปลีก",
    },
    {
      q: "ขนาดที่ได้ตรงเป๊ะไหม?",
      a: "ขนาดเป็นขนาดโดยประมาณ เพราะขึ้นอยู่กับการดัดง้อ แต่ละชิ้นจึงอาจไม่เท่ากันเล็กน้อย เป็นลักษณะธรรมชาติของงานอะคริลิคดัดขึ้นรูป",
    },
  ],
};

const product: Product = {
  id: ID,
  slug: "สแตนดี้ตั้งโทรศัพท์-แบบฐานดัดง้อ",
  name: "สแตนดี้ตั้งโทรศัพท์ (แบบฐานดัดง้อ)",
  category: "standee",
  price: PRICES[0],
  emoji: "📱",
  gradient: "from-sky-200 to-cyan-300",
  imageSrc: IMG("gallery-1"),
  seo,
  rating: 5,
  sold: 0,
  hidden: true,
  description:
    "สแตนดี้ตั้งโทรศัพท์ แบบที่ 5 (ฐานดัดง้อ) — อะคริลิคแผ่นเดียวหนาประมาณ 3 มม. ดัดขึ้นรูป 3 จุด พิมพ์ UV เต็มแผ่นทั้งฐานและแผ่นหลัง " +
    "มีขนาดเดียว สูงประมาณ 14 ซม. ฐานกว้าง 8 ซม. วางมือถือได้ทั้งแนวตั้งและแนวนอน · เรทราคาปลีก 1-10 ชิ้น ไม่มีขั้นต่ำในการสั่งผลิต",
  highlights: [
    "อะคริลิคแผ่นเดียว ดัดงอ 3 จุด — ไม่ต้องประกอบ",
    "พิมพ์ UV เต็มแผ่น ทั้งฐานและแผ่นหลัง",
    "1-10 ชิ้น ไม่มีขั้นต่ำ คละดีเทลได้ไม่จำกัด",
  ],
  // 4 ข้อแรกเรียงตามเว็บตารางราคาเป๊ะ ๆ (ขนาด · ฐาน · เพิ่มขนาด · จุดดัดงอ) แล้วค่อยต่อด้วยหมายเหตุ
  terms: [
    "ขนาด สูงประมาณ 14 ซม.",
    "ฐานกว้าง 8 ซม.",
    "เพิ่มขนาด ซม. ละ 10 บาท (หน้าเว็บขายขนาดเดียว — อยากได้ใหญ่กว่านี้ทักแอดมินเป็นงานสั่งพิเศษ)",
    "จุดดัดงอ 3 จุด",
    "*ขนาดจะเป็นขนาดโดยประมาณ ซึ่งขนาดจะขึ้นอยู่กับการดัดง้อ จึงทำให้ขนาดแต่ละชิ้นอาจจะไม่เท่ากัน **ความสูงจะเริ่มวัดจากพื้นฐาน",
    "ได้เฉพาะอะคริลิคใส / โฮโลแกรม / กลิตเตอร์ — อะคริลิคพิเศษบวกเพิ่ม 30 บาทต่อชิ้น",
    "จำนวน 11 ชิ้นขึ้นไป คละลาย คละขนาด สั่งขั้นต่ำ 5 ชิ้น++ | อะไหล่ คละแบบ คละสี สั่งขั้นต่ำ 5 ชิ้น++ ไม่ถึงตามจำนวน คิดตามราคาปลีก",
    "ราคา 1-10 ชิ้น สามารถคละดีเทลได้ไม่จำกัด",
  ].join("\n"),
  options,
  images: [...GALLERY, "bend-points"].map((g) => ({
    src: IMG(g),
    emoji: "📱",
    label: "",
    gradient: "from-sky-200 to-cyan-300",
  })),
  pricing,
  priceRates: [
    {
      id: "r1",
      label: "สแตนดี้ตั้งโทรศัพท์ แบบที่ 5 (ฐานดัดง้อ)",
      desc: "ขนาดเดียว สูงประมาณ 14 ซม. · ฐานกว้าง 8 ซม. · จุดดัดงอ 3 จุด · อะคริลิคหนา ~3 มม. พิมพ์ UV เต็มแผ่น",
      minQty: 11,
      minPerDesign: 5,
      freeMixBelowQty: 11,
      imageSrc: IMG("gallery-1"),
      pricing,
    },
  ],
  tierByDesign: true,
  bulkAskQty: 20,
  // โซน "ข้างแผงสั่งซื้อ" = ต่อท้ายตารางราคาในคอลัมน์เดียวกัน
  body: [
    {
      heading: "Add on อะคริลิคพิเศษ",
      text: "",
      html: ADDON_TABLE,
      slot: "side",
    },
  ],
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: [
        "• ขนาด สูงประมาณ 14 ซม.",
        "• ฐานกว้าง 8 ซม.",
        "• เพิ่มขนาด ซม. ละ 10 บาท (หน้าเว็บขายขนาดเดียว — อยากได้ใหญ่กว่านี้ทักแอดมินเป็นงานสั่งพิเศษ)",
        "• จุดดัดงอ 3 จุด (อะคริลิคแผ่นเดียวดัดขึ้นรูป ไม่ต้องประกอบ)",
        "• *ขนาดจะเป็นขนาดโดยประมาณ ซึ่งขนาดจะขึ้นอยู่กับการดัดง้อ จึงทำให้ขนาดแต่ละชิ้นอาจจะไม่เท่ากัน **ความสูงจะเริ่มวัดจากพื้นฐาน",
        "• ได้เฉพาะอะคริลิคใส , โฮโลแกรม , กลิตเตอร์ — บวกเพิ่ม 30 บาทต่อชิ้น",
        "• อะคริลิคพิเศษจะมีความหนาประมาณ 2.5-3 มม.",
        "• จำนวน 11 ชิ้นขึ้นไป คละลาย คละขนาด สั่งขั้นต่ำ 5 ชิ้น++ | อะไหล่ คละแบบ คละสี สั่งขั้นต่ำ 5 ชิ้น++ ไม่ถึงตามจำนวน คิดตามราคาปลีก",
        "• ราคา 1-10 ชิ้น สามารถคละดีเทลได้ไม่จำกัด",
        "• ไฟล์ นามสกุล .Ai .Psd .Png  หรือพื้นหลังใส",
        "• งานสกรีนเต็มขอบ สีมีโอกาสหลุดลอกง่ายกว่าแบบปกติ",
        "• ทางร้านจะมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องจะให้ความแตกต่างประมาณ 5-10% มีโอกาสที่สีแต่ละรอบไม่เหมือนกัน หากผลิตคนละเครื่อง",
        "• ทางร้านใช้สี R G B สีงานสกรีนที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
        "• ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดความยาวแนวแทยง)",
        "• งานสกรีนอะคริลิค โดยปกติทางร้านจะสกรีนใต้(ยกเว้นอคล.โฮโลแกรม01 /สีพิเศษ จะสกรีนบน) หากต้องการสกรีนบนต้องแจ้ง เพื่อทางร้านจะเขียนกำกับไว้ให้ที่บิล (หากที่บิลไม่มีเขียนกำกับว่าสกรีนให้แจ้งทันที)",
      ].join("\n"),
    },
    {
      title: "วิธีสั่งงาน",
      text:
        "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
        '• เลือกจำนวนและตัวเลือกที่ต้องการ แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"\n' +
        '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ขนาดที่ต้องการ · วันที่ต้องการใช้งาน\n' +
        "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n" +
        "หรือสั่งทางอีเมล::\n" +
        "• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n" +
        "• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n" +
        "• ระบุรายละเอียด: สแตนดี้ตั้งโทรศัพท์ แบบที่ 5 (ฐานดัดง้อ) · อะคริลิคพิเศษ (ถ้ามี) · จำนวน · วันที่ใช้งาน (ถ้ามี)\n" +
        "• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
    },
    {
      title: "การเตรียมไฟล์",
      text:
        "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n" +
        "• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n" +
        "• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n" +
        "• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด",
    },
    {
      title: "การรับประกันสินค้า",
      text:
        "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• สีอะคริลิค หรือ อะไหล่ ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\n" +
        "ไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\n" +
        "ระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    },
  ],
};

const range = priceRange(product);
const saved: Product = {
  ...product,
  ...(hasQuoteOption(product) ? { quoteOption: true } : {}),
  priceMin: range.min,
  priceMax: range.max,
  savedAt: new Date().toISOString(),
};

const sb = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function uploadImages() {
  if (!IMAGES_DIR) throw new Error("ต้องระบุ --images=<โฟลเดอร์ที่เตรียมไว้ด้วย phone-base-bend-art.mjs>");
  const c = sb();
  let kb = 0;
  for (const name of FILES) {
    const buf = await readFile(`${IMAGES_DIR.replace(/\/$/, "")}/${name}.jpg`);
    const { error } = await c.storage
      .from("product-images")
      .upload(`products/${ID}/${name}-${REV}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`${name}: ${error.message}`);
    kb += buf.length / 1024;
  }
  console.log(`⬆️  อัปโหลด ${FILES.length} ภาพ (${Math.round(kb)} KB) → products/${ID}/*-${REV}.jpg`);
}

async function main() {
  if (UPLOAD) await uploadImages();

  const allChoices = saved.options.flatMap((o) => o.choices);
  console.log(`📦 ${saved.name} (${ID}) · ${saved.category}`);
  console.log(`   ราคา ${range.min}-${range.max} บาท/ชิ้น · ตัวเลือก ${saved.options.length} กลุ่ม · รูปแกลเลอรี ${saved.images.length} ภาพ`);
  console.log(`   ตารางราคา: ${TIERS.map((t, i) => `${t.label} ${PRICES[i]}`).join(" · ")}`);
  console.log(`   ตัวเลือกที่มีภาพประกอบ: ${allChoices.filter((c) => c.imageSrc).length}/${allChoices.length} ตัว`);
  console.log(`   แท็บ: ${(saved.tabs ?? []).map((t) => t.title).join(" · ")}`);

  if (!WRITE) {
    console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
    return;
  }
  const c = sb();
  const { data: cur } = await c.from("products").select("sort").eq("id", ID).maybeSingle();
  const { error } = await c.from("products").upsert(
    {
      id: saved.id,
      name: saved.name,
      category: saved.category,
      price: saved.price,
      sold: saved.sold,
      featured: false,
      badge: saved.badge ?? null,
      ...(typeof cur?.sort === "number" ? { sort: cur.sort } : {}),
      data: saved,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(error.message);
  console.log(`✅ บันทึกลง Supabase แล้ว — เปิดดูที่ /admin/products (สถานะ: ฉบับร่าง รอกดเผยแพร่)`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
