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
 * ขนาด: สูงประมาณ 14 ซม. · ฐานกว้าง 8 ซม. · เพิ่มขนาด ซม. ละ 10 บาท
 * จุดดัดงอ 3 จุด — อะคริลิคแผ่นเดียวดัดขึ้นรูป (ไม่ใช่งานประกอบ) จึงคิดอะคริลิคพิเศษ "ต่อชิ้น" ครั้งเดียว
 * Add on อะคริลิคพิเศษ (ตารางที่ 2 ของหน้า) — คิดตามขนาด:
 *   14 ซม. +30 · 15 +35 · 16 +40 · 17 +45 · 18 +50 · 19 +55 · 20 +60
 *   (เรทปลีกกับเรทส่งต่างกันเฉพาะขนาด 6-9 ซม. ซึ่งสินค้านี้ทำไม่ได้ — ช่วง 14-20 ซม. เท่ากันทั้งสองเรท)
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
const REV = "v2";
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}-${REV}.jpg`;

/** ภาพงานจริงจากเว็บตารางราคา (หัวข้อ "ตัวอย่าง ... (แบบฐานดัดง้อ) แบบที่ 5") */
const GALLERY = ["gallery-1", "gallery-2", "gallery-3", "gallery-4"];
/** ขนาดที่สั่งผ่านหน้าเว็บได้ — มาตรฐาน 14 ซม. เพิ่มได้ถึง 20 ซม. (เท่ากับช่วงท้ายตาราง Add on ของเว็บ) */
const SIZES = [14, 15, 16, 17, 18, 19, 20];
const BASE_SIZE = SIZES[0];
const SIZE_LABEL = (cm: number) => `${cm} ซม.${cm === BASE_SIZE ? " (มาตรฐาน)" : ""}`;
/** ค่าอะคริลิคพิเศษต่อชิ้น ตามขนาด (ตาราง Add on ของเว็บ — ช่วง 14-20 ซม. เรทปลีก = เรทส่ง) */
const SPECIAL_FEE: Record<number, number> = { 14: 30, 15: 35, 16: 40, 17: 45, 18: 50, 19: 55, 20: 60 };

/**
 * สีอะคริลิคพิเศษที่แบบนี้ทำได้ — เว็บระบุ "ได้เฉพาะอะคริลิคใส , โฮโลแกรม , กลิสเตอร์"
 * จึงไม่มีอะคริลิคสีทึบ/สีขุ่น/กระจก เหมือนสินค้าอะคริลิคตัวอื่น
 */
const SPECIAL_COLORS = [
  "อะคริลิคกลิตเตอร์-เงิน",
  "อะคริลิคกลิตเตอร์-ทอง",
  "อะคริลิคกลิตเตอร์-รุ้ง",
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

const FILES = [...GALLERY, ...SIZES.map((cm) => `size-${cm}`), "bend-points", "clear"];

/**
 * ตาราง "Add on อะคริลิคพิเศษ" ตามเว็บตารางราคา (ตารางที่ 2 ของหน้า standyphonebase)
 * เรทปลีก = สั่ง 1-10 ชิ้น · เรทส่ง = 11 ชิ้นขึ้นไป · คิดตามขนาดชิ้นงาน
 */
const ADDON_SIZES = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const ADDON_RETAIL = [10, 10, 10, 10, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const ADDON_WHOLESALE = [8, 8, 8, 10, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
/** ขนาดที่สั่งได้จริงของสินค้านี้ (ช่องอื่นเก็บไว้ให้ครบตามเว็บ แต่ทำให้จางลง) */
const usable = (cm: number) => cm >= SIZES[0] && cm <= SIZES[SIZES.length - 1];

const HEAD = "background:#8fb8dd;color:#ffffff;font-weight:700;white-space:nowrap";
const ROWHEAD = "text-align:left;white-space:nowrap;font-weight:700;color:#334155";
const cellStyle = (cm: number) =>
  `text-align:center;white-space:nowrap;${usable(cm) ? "background:#ecfeff;font-weight:700;color:#0e7490" : "color:#94a3b8"}`;

const addonRow = (label: string, prices: number[], zebra: boolean) =>
  `<tr style="${zebra ? "background:#f8fafc;" : ""}border-top:1px solid #e2e8f0">` +
  `<th scope="row" style="${ROWHEAD}">${label}</th>` +
  ADDON_SIZES.map((cm, i) => `<td style="${cellStyle(cm)}">${prices[i]}</td>`).join("") +
  `</tr>`;

/** ตารางเต็มตามเว็บ (6-20 ซม. · เรทปลีก/เรทส่ง) — เก็บไว้ในกล่องพับ กดกางดูได้ */
const ADDON_FULL =
  `<div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:14px">` +
  `<table style="min-width:820px;border-collapse:collapse;font-size:12px;margin:0">` +
  `<thead><tr style="${HEAD}"><th scope="col" style="text-align:left;white-space:nowrap">เพิ่มเติม</th>` +
  ADDON_SIZES.map((cm) => `<th scope="col" style="text-align:center;white-space:nowrap">${cm}cm</th>`).join("") +
  `</tr></thead><tbody>` +
  addonRow("(เรทราคาปลีก) อคล.พิเศษ", ADDON_RETAIL, false) +
  addonRow("(เรทราคาส่ง) อคล.พิเศษ", ADDON_WHOLESALE, true) +
  `</tbody></table></div>`;

/** ตารางย่อเฉพาะขนาดที่สินค้านี้ทำได้ — ไม่ต้องเลื่อนก็เห็นครบ */
const ADDON_TABLE =
  `<div style="overflow:hidden;border:1px solid #e2e8f0;border-radius:16px">` +
  `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:0">` +
  `<thead><tr style="${HEAD}"><th scope="col" style="text-align:left;white-space:nowrap">ขนาด</th>` +
  SIZES.map((cm) => `<th scope="col" style="text-align:center;white-space:nowrap">${cm}cm</th>`).join("") +
  `</tr></thead><tbody><tr style="border-top:1px solid #e2e8f0">` +
  `<th scope="row" style="${ROWHEAD}">บวกเพิ่ม / ชิ้น</th>` +
  SIZES.map(
    (cm) => `<td style="text-align:center;white-space:nowrap;font-weight:700;color:#0e7490">${SPECIAL_FEE[cm]}</td>`
  ).join("") +
  `</tr></tbody></table></div>` +
  `<p style="margin-top:8px">แบบฐานดัดง้อเป็น <strong>อะคริลิคแผ่นเดียวดัดขึ้นรูป</strong> — เลือกอะคริลิคพิเศษแล้วคิดเพิ่มครั้งเดียวต่อชิ้น (ไม่ต้องคิดแยกฐาน/ตัว)</p>` +
  `<p style="margin-top:6px;color:#0e7490">ช่วง 14-20 ซม. <strong>เรทราคาปลีก (1-10 ชิ้น) กับ เรทราคาส่ง (11 ชิ้นขึ้นไป) ราคาเท่ากัน</strong> — เลือกในหน้าสั่งซื้อได้เลย ระบบบวกให้อัตโนมัติ</p>` +
  `<p style="margin-top:6px;color:#b45309">แบบนี้ทำได้เฉพาะ <strong>อะคริลิคใส · โฮโลแกรม · กลิตเตอร์</strong> เท่านั้น (ไม่มีอะคริลิคสีทึบ)</p>` +
  `<details style="margin-top:12px">` +
  `<summary style="cursor:pointer;font-weight:700;color:#0e7490">ดูตารางเต็มจากเว็บตารางราคา (6-20 ซม. · เรทปลีก / เรทส่ง)</summary>` +
  `<div style="margin-top:8px">${ADDON_FULL}` +
  `<p style="margin-top:8px;font-size:12px;color:#64748b">ช่องสีฟ้า = ขนาดที่แบบฐานดัดง้อทำได้จริง · ขนาดต่ำกว่า 14 ซม. เป็นเรทกลางของงานอะคริลิคอื่น สินค้านี้สั่งไม่ได้ · อคล.พิเศษ ตั้งแต่ 21cm ขึ้นไป บวกเพิ่ม cm ละ 5 บาท (ทักแอดมิน)</p>` +
  `</div></details>`;

const SPECIAL = "อะคริลิคพิเศษ (โฮโลแกรม / กลิตเตอร์)";

const options: ProductOption[] = [
  {
    label: "ขนาด (ความสูง)",
    choices: SIZES.map((cm) => ({
      name: SIZE_LABEL(cm),
      ...(cm > BASE_SIZE ? { extra: (cm - BASE_SIZE) * 10 } : {}),
      imageSrc: IMG(`size-${cm}`),
    })),
  },
  {
    label: "สีอะคริลิค",
    stockBearing: true,
    choices: [
      { name: "อะคริลิคใส", imageSrc: IMG("clear") },
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
      showWhen: { label: "ขนาด (ความสูง)", choices: [SIZE_LABEL(cm)] },
      showWhenAlso: { label: "สีอะคริลิค", choices: [SPECIAL] },
      choices: SPECIAL_COLORS.map((name) => {
        const img = acrylicColorImage(name);
        return { name, extra: SPECIAL_FEE[cm], ...(img ? { imageSrc: img } : {}) };
      }),
    })
  ),
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
    "สูงมาตรฐาน 14 ซม. ฐานกว้าง 8 ซม. เพิ่มขนาดได้ · เลือกอะคริลิคใส โฮโลแกรม กลิตเตอร์ · 1-10 ชิ้นไม่มีขั้นต่ำ",
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
      q: "ขนาดเท่าไหร่ เพิ่มขนาดได้ไหม?",
      a: "ขนาดมาตรฐานสูงประมาณ 14 ซม. ฐานกว้าง 8 ซม. — เพิ่มขนาดได้ ซม. ละ 10 บาทต่อชิ้น (หน้าเว็บสั่งได้ถึง 20 ซม. ใหญ่กว่านี้ทักแอดมิน) ความสูงเริ่มวัดจากพื้นฐาน",
    },
    {
      q: "แบบฐานดัดง้อต่างจากแบบอื่นยังไง?",
      a: "เป็นอะคริลิคแผ่นเดียวดัดขึ้นรูป มีจุดดัดงอ 3 จุด (ริมกันเครื่องไหล · ยกแผ่นหลัง · ตั้งองศาพิง) ไม่ต้องประกอบ พิมพ์ลายเต็มแผ่นทั้งฐานและแผ่นหลัง วางมือถือได้ทั้งแนวตั้งและแนวนอน",
    },
    {
      q: "เลือกอะคริลิคสีอะไรได้บ้าง?",
      a: "แบบนี้ทำได้เฉพาะอะคริลิคใส โฮโลแกรม และกลิตเตอร์เท่านั้น (ไม่มีอะคริลิคสีทึบ) อะคริลิคพิเศษคิดเพิ่มตามขนาด — 14 ซม. +30 บาท/ชิ้น ถึง 20 ซม. +60 บาท/ชิ้น",
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
    "สูงประมาณ 14 ซม. ฐานกว้าง 8 ซม. วางมือถือได้ทั้งแนวตั้งและแนวนอน · เรทราคาปลีก 1-10 ชิ้น ไม่มีขั้นต่ำในการสั่งผลิต",
  highlights: [
    "อะคริลิคแผ่นเดียว ดัดงอ 3 จุด — ไม่ต้องประกอบ",
    "พิมพ์ UV เต็มแผ่น ทั้งฐานและแผ่นหลัง",
    "1-10 ชิ้น ไม่มีขั้นต่ำ คละดีเทลได้ไม่จำกัด",
  ],
  // 4 ข้อแรกเรียงตามเว็บตารางราคาเป๊ะ ๆ (ขนาด · ฐาน · เพิ่มขนาด · จุดดัดงอ) แล้วค่อยต่อด้วยหมายเหตุ
  terms: [
    "ขนาด สูงประมาณ 14 ซม.",
    "ฐานกว้าง 8 ซม.",
    "เพิ่มขนาด ซม. ละ 10 บาท",
    "จุดดัดงอ 3 จุด",
    "*ขนาดจะเป็นขนาดโดยประมาณ ซึ่งขนาดจะขึ้นอยู่กับการดัดง้อ จึงทำให้ขนาดแต่ละชิ้นอาจจะไม่เท่ากัน **ความสูงจะเริ่มวัดจากพื้นฐาน",
    "ได้เฉพาะอะคริลิคใส / โฮโลแกรม / กลิตเตอร์ — ราคาอะคริลิคพิเศษบวกเพิ่มตามขนาด",
    "อะคริลิคพิเศษ ขนาดตั้งแต่ 21 ซม. ขึ้นไป บวกเพิ่ม ซม. ละ 5 บาท (สั่งผ่านแอดมิน)",
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
      desc: "สูงประมาณ 14 ซม. · ฐานกว้าง 8 ซม. · จุดดัดงอ 3 จุด · อะคริลิคหนา ~3 มม. พิมพ์ UV เต็มแผ่น",
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
      heading: "Add on อะคริลิคพิเศษ — ราคาบวกเพิ่มตามขนาด",
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
        "• เพิ่มขนาด ซม. ละ 10 บาท",
        "• จุดดัดงอ 3 จุด (อะคริลิคแผ่นเดียวดัดขึ้นรูป ไม่ต้องประกอบ)",
        "• *ขนาดจะเป็นขนาดโดยประมาณ ซึ่งขนาดจะขึ้นอยู่กับการดัดง้อ จึงทำให้ขนาดแต่ละชิ้นอาจจะไม่เท่ากัน **ความสูงจะเริ่มวัดจากพื้นฐาน",
        "• ได้เฉพาะอะคริลิคใส , โฮโลแกรม , กลิตเตอร์ ราคาบวกเพิ่มตามขนาด",
        "• อะคริลิคพิเศษ ขนาดตั้งแต่ 21 ซม. ขึ้นไป บวกเพิ่ม ซม. ละ 5 บาท",
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
        "• ระบุรายละเอียด: สแตนดี้ตั้งโทรศัพท์ แบบที่ 5 (ฐานดัดง้อ) · ขนาด · อะคริลิคพิเศษ (ถ้ามี) · จำนวน · วันที่ใช้งาน (ถ้ามี)\n" +
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
