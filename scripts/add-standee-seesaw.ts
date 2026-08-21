/**
 * สินค้า "สแตนดี้ไม้กระดก" (ACRYLIC SEESAW) — ดึงราคาจากเว็บตารางราคา
 * iduckyofficial-pricelists.com/acrylicseesaw
 *
 *   npx tsx scripts/add-standee-seesaw.ts                           # ดูข้อมูลที่จะบันทึก (ไม่เขียนจริง)
 *   npx tsx scripts/add-standee-seesaw.ts --upload --images=<dir>   # อัปภาพขึ้น Supabase Storage
 *   npx tsx scripts/add-standee-seesaw.ts --write                   # เขียนลง Supabase (คงสถานะฉบับร่าง)
 *
 * ราคาจากเว็บ (ตาราง ACRYLIC SEESAW):
 *   1-10 ชิ้น 350 · 11-49 300 · 50-199 290 · 200-499 280 · 500+ 250
 *
 * ขนาดมาตรฐานที่รวมอยู่ในราคา — จาก "การ์ดสเปก SEESAW STANDY" ของร้าน:
 *   (ตัวกลาง 2 ชิ้น + เจาะ) 3-4 cm · (ตัวโยก สกรีน 2 ด้าน) 11 cm · ฐานใส 4-5 cm
 *   อะคริลิคใส หนา 3 mm · "ถ้าเกินบวกเพิ่ม cm ละ 10 บาท"
 *   → คิดค่าเพิ่มขนาด "ต่อชิ้นส่วน" ชิ้นละ 10 บาท/ซม. ที่เกินจากขนาดมาตรฐานของชิ้นนั้น
 *
 * Add on อะคริลิคพิเศษ (ตารางที่ 2 ของหน้าเว็บ) — คิดต่อ "ชิ้นอะคริลิค" ตามขนาดของชิ้นนั้น
 *   เรทปลีก (1-10) 2-10cm=10 · 11cm=15 … 20cm=60
 *   เรทส่ง (11+)   2-5cm=5 · 6-8cm=8 · 9-10cm=10 · 11cm=15 … 20cm=60
 *   หน้านี้ทำได้เฉพาะ อะคริลิคใส | กลิตเตอร์ | โฮโลแกรม (ไม่มีอะคริลิคสีทึบ)
 *
 * เงื่อนไขใต้ตาราง: 1-10 ชิ้น คละดีเทลได้ไม่จำกัด · 11 ชิ้นขึ้นไป คละลาย/คละขนาด สั่งลายละ 5 ชิ้น++
 *
 * ภาพ: เตรียมด้วย scripts/standee-seesaw-art.mjs (งานจริง 5 · ภาพวาดตัวเลือก 27)
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { hasQuoteOption, priceRange, type PriceMatrix, type Product, type ProductOption } from "../src/lib/products";
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

const ID = "new-mt2ro493-8195";
/** ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ขึ้นรุ่นใหม่ให้ขยับ v1 → v2 */
const REV = "v2";
const IMG = (name: string) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}-${REV}.jpg`;

// ── ขนาดชิ้นส่วน ───────────────────────────────────────────────────────────
/** ตัวโยก (คานไม้กระดก + ตัวการ์ตูน 2 ฝั่ง) — มาตรฐาน 11 ซม. */
const ROCK_SIZES = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const ROCK_STD = 11;
/** ตัวกลาง (จุดหมุน 2 ชิ้น + เจาะ) — มาตรฐาน 3-4 ซม. */
const MID_SIZES = [4, 5, 6, 7, 8];
const MID_STD = 4;
/** ฐานใส — มาตรฐาน 4-5 ซม. */
const BASE_SIZES = [5, 6, 7, 8, 9, 10];
const BASE_STD = 5;
/** ชิ้นที่ยังเป็นขนาดมาตรฐาน โชว์ป้ายบอกว่า "รวมในราคาแล้ว" ไม่ใช่แค่ตัวเลข ซม. */
const ROCK_LABEL = (cm: number) => `${cm} ซม.${cm === ROCK_STD ? " (มาตรฐาน)" : ""}`;
const MID_LABEL = (cm: number) => (cm === MID_STD ? "3-4 ซม. (มาตรฐาน)" : `${cm} ซม.`);
const BASE_LABEL = (cm: number) => (cm === BASE_STD ? "4-5 ซม. (มาตรฐาน)" : `${cm} ซม.`);

// ── ตาราง Add on อะคริลิคพิเศษ (ตามเว็บ 2-20 ซม.) ──────────────────────────
const ADDON_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const ADDON_RETAIL = [10, 10, 10, 10, 10, 10, 10, 10, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const ADDON_WHOLESALE = [5, 5, 5, 5, 8, 8, 8, 10, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
/** ค่าอะคริลิคพิเศษของชิ้นขนาด cm — เรทปลีกใช้ตอนสั่ง 1-10 เซต · เรทส่งตั้งแต่ 11 เซตขึ้นไป */
const specialFee = (cm: number, retail: boolean) => {
  const i = ADDON_SIZES.indexOf(cm);
  if (i < 0) throw new Error(`ไม่มีขนาด ${cm} ซม. ในตาราง Add on อะคริลิคพิเศษ`);
  return retail ? ADDON_RETAIL[i] : ADDON_WHOLESALE[i];
};

// ── ตารางราคาหลัก ──────────────────────────────────────────────────────────
const TIERS = [
  { upTo: 10, label: "1-10 เซต" },
  { upTo: 49, label: "11-49 เซต" },
  { upTo: 199, label: "50-199 เซต" },
  { upTo: 499, label: "200-499 เซต" },
  { upTo: null, label: "500 เซตขึ้นไป" },
];
const BASE_PRICES = [350, 300, 290, 280, 250];

const CLEAR = "อะคริลิคใส";
const SPECIAL = "อะคริลิคพิเศษ (กลิตเตอร์ · โฮโลแกรม)";
const MATERIALS = [CLEAR, SPECIAL];

const L_ROCK_SIZE = "ขนาดตัวโยก (คานไม้กระดก)";
const L_ROCK_MAT = "อะคริลิคตัวโยก";
const L_MID_SIZE = "ขนาดตัวกลาง (จุดหมุน)";
const L_MID_MAT = "อะคริลิคตัวกลาง";
const L_BASE_SIZE = "ขนาดฐาน";
const L_BASE_MAT = "อะคริลิคฐาน";

/**
 * ตารางราคา = (ขนาดตัวโยก × อะคริลิค 3 ชิ้น) — 10 × 2 × 2 × 2 = 80 ช่อง
 * ขนาดตัวโยกเข้าตารางเพราะค่าอะคริลิคพิเศษของชิ้นนี้ขึ้นกับขนาด (11 ซม. +15 … 20 ซม. +60)
 * ส่วนขนาดตัวกลาง/ฐานเป็น +฿ ธรรมดา (ซม. ละ 10) เพราะค่าอะคริลิคพิเศษของสองชิ้นนี้คงที่
 */
const cells: Record<string, number[]> = {};
for (const rock of ROCK_SIZES) {
  for (const mRock of MATERIALS) {
    for (const mMid of MATERIALS) {
      for (const mBase of MATERIALS) {
        cells[`${ROCK_LABEL(rock)}│${mRock}│${mMid}│${mBase}`] = BASE_PRICES.map((base, t) => {
          const retail = t === 0;
          return (
            base +
            (rock - ROCK_STD) * 10 +
            (mRock === SPECIAL ? specialFee(rock, retail) : 0) +
            (mMid === SPECIAL ? specialFee(MID_STD, retail) : 0) +
            (mBase === SPECIAL ? specialFee(BASE_STD, retail) : 0)
          );
        });
      }
    }
  }
}
const pricing: PriceMatrix = {
  unit: "เซต",
  driverLabels: [L_ROCK_SIZE, L_ROCK_MAT, L_MID_MAT, L_BASE_MAT],
  tiers: TIERS,
  cells,
};

/** สีอะคริลิคที่หน้านี้ทำได้ — "ทำได้เฉพาะอะคริลิคใส | กลิตเตอร์ | โฮโลแกรม" */
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

/** กลุ่ม "อะคริลิคของชิ้นนี้" + กลุ่มเลือกสีพิเศษที่โผล่ตามกัน */
const materialGroups = (label: string, part: string, art: string): ProductOption[] => [
  {
    label,
    choices: [
      { name: CLEAR, imageSrc: IMG(`part-${art}-plain`) },
      { name: SPECIAL, imageSrc: IMG(`part-${art}-special`) },
    ],
  },
  {
    label: `สีอะคริลิคพิเศษ — ${part}`,
    display: "dropdown",
    showWhen: { label, choices: [SPECIAL] },
    choices: SPECIAL_COLORS.map((name) => {
      const img = acrylicColorImage(name);
      return { name, ...(img ? { imageSrc: img } : {}) };
    }),
  },
];

const options: ProductOption[] = [
  {
    label: L_ROCK_SIZE,
    note: "ขนาดมาตรฐาน 11 ซม. รวมอยู่ในราคาเซตแล้ว — เกินจากนี้บวกเพิ่ม ซม. ละ 10 บาท",
    choices: ROCK_SIZES.map((cm) => ({ name: ROCK_LABEL(cm), imageSrc: IMG(`rock-${cm}`) })),
  },
  ...materialGroups(L_ROCK_MAT, "ตัวโยก", "rock"),
  {
    label: L_MID_SIZE,
    note: "จุดหมุน 2 ชิ้นประกบ + เจาะรูใส่หมุด · ขนาดมาตรฐาน 3-4 ซม.",
    choices: MID_SIZES.map((cm) => ({
      name: MID_LABEL(cm),
      ...(cm > MID_STD ? { extra: (cm - MID_STD) * 10 } : {}),
      imageSrc: IMG(`mid-${cm}`),
    })),
  },
  ...materialGroups(L_MID_MAT, "ตัวกลาง", "mid"),
  {
    label: L_BASE_SIZE,
    note: "ฐานใสสำหรับตั้งโชว์ · ขนาดมาตรฐาน 4-5 ซม.",
    choices: BASE_SIZES.map((cm) => ({
      name: BASE_LABEL(cm),
      ...(cm > BASE_STD ? { extra: (cm - BASE_STD) * 10 } : {}),
      imageSrc: IMG(`base-${cm}`),
    })),
  },
  ...materialGroups(L_BASE_MAT, "ฐาน", "base"),
];

// ── ตาราง Add on ที่โชว์ข้างแผงสั่งซื้อ ─────────────────────────────────────
const HEAD = "background:#8fb8dd;color:#ffffff;font-weight:700;white-space:nowrap";
const ROWHEAD = "text-align:left;white-space:nowrap;font-weight:700;color:#334155";
/** ขนาดที่สินค้านี้ใช้จริง (ตัวกลาง 3-8 · ฐาน 4-10 · ตัวโยก 11-20) — ไฮไลต์ให้ดูง่าย */
const usable = (cm: number) => cm >= 3;
const cellStyle = (cm: number) =>
  `text-align:center;white-space:nowrap;${usable(cm) ? "background:#ecfeff;font-weight:700;color:#0e7490" : "color:#94a3b8"}`;

const addonRow = (label: string, prices: number[], zebra: boolean) =>
  `<tr style="${zebra ? "background:#f8fafc;" : ""}border-top:1px solid #e2e8f0">` +
  `<th scope="row" style="${ROWHEAD}">${label}</th>` +
  ADDON_SIZES.map((cm, i) => `<td style="${cellStyle(cm)}">${prices[i]}</td>`).join("") +
  `</tr>`;

const ADDON_FULL =
  `<div style="overflow-x:auto;border:1px solid #e2e8f0;border-radius:14px">` +
  `<table style="min-width:940px;border-collapse:collapse;font-size:12px;margin:0">` +
  `<thead><tr style="${HEAD}"><th scope="col" style="text-align:left;white-space:nowrap">เพิ่มเติม</th>` +
  ADDON_SIZES.map((cm) => `<th scope="col" style="text-align:center;white-space:nowrap">${cm}cm</th>`).join("") +
  `</tr></thead><tbody>` +
  addonRow("(เรทราคาปลีก) อคล.พิเศษ", ADDON_RETAIL, false) +
  addonRow("(เรทราคาส่ง) อคล.พิเศษ", ADDON_WHOLESALE, true) +
  `</tbody></table></div>`;

/** ตารางย่อ "ขนาดมาตรฐาน 1 เซต" — บอกว่าอะไรรวมอยู่ในราคา 350 บาทแล้ว */
const SPEC_TABLE =
  `<div style="overflow:hidden;border:1px solid #e2e8f0;border-radius:16px">` +
  `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:0">` +
  `<thead><tr style="${HEAD}">` +
  `<th scope="col" style="text-align:left;white-space:nowrap">ชิ้นส่วนใน 1 เซต</th>` +
  `<th scope="col" style="text-align:center;white-space:nowrap">ขนาดมาตรฐาน</th>` +
  `<th scope="col" style="text-align:center;white-space:nowrap">อคล.พิเศษ (ปลีก / ส่ง)</th>` +
  `</tr></thead><tbody>` +
  [
    ["ตัวกลาง (จุดหมุน) 2 ชิ้น + เจาะ", "3-4 cm", `+${specialFee(MID_STD, true)} / +${specialFee(MID_STD, false)}`],
    ["ตัวโยก (คานไม้กระดก) สกรีน 2 ด้าน", "11 cm", `+${specialFee(ROCK_STD, true)} / +${specialFee(ROCK_STD, false)}`],
    ["ฐานใส", "4-5 cm", `+${specialFee(BASE_STD, true)} / +${specialFee(BASE_STD, false)}`],
  ]
    .map(
      ([a, b, c], i) =>
        `<tr style="${i % 2 ? "background:#f8fafc;" : ""}border-top:1px solid #e2e8f0">` +
        `<th scope="row" style="${ROWHEAD}">${a}</th>` +
        `<td style="text-align:center;white-space:nowrap;font-weight:700;color:#0e7490">${b}</td>` +
        `<td style="text-align:center;white-space:nowrap;color:#334155">${c}</td></tr>`
    )
    .join("") +
  `</tbody></table></div>` +
  `<p style="margin-top:8px">อะคริลิคใส หนา 3 มม. — ขนาดข้างบนรวมอยู่ในราคา <strong>350 บาท/เซต</strong> แล้ว ` +
  `ชิ้นไหน<strong>เกินขนาดมาตรฐาน บวกเพิ่ม ซม. ละ 10 บาท</strong></p>` +
  `<p style="margin-top:6px;color:#0e7490">เปลี่ยนเป็นอะคริลิคพิเศษ (กลิตเตอร์ / โฮโลแกรม) คิดเพิ่มต่อ “ชิ้นอะคริลิค” ตามขนาดของชิ้นนั้น — เลือกเปลี่ยนเฉพาะชิ้นที่ต้องการได้ ระบบบวกให้อัตโนมัติ</p>` +
  `<details style="margin-top:12px">` +
  `<summary style="cursor:pointer;font-weight:700;color:#0e7490">ดูตารางเต็มจากเว็บตารางราคา (2-20 ซม. · เรทปลีก / เรทส่ง)</summary>` +
  `<div style="margin-top:8px">${ADDON_FULL}` +
  `<p style="margin-top:8px;font-size:12px;color:#64748b">เรทราคาปลีก = สั่ง 1-10 เซต · เรทราคาส่ง = 11 เซตขึ้นไป</p>` +
  `</div></details>`;

const TERMS = [
  "1 เซต = ตัวกลาง (จุดหมุน) 2 ชิ้น + เจาะ ขนาด 3-4 ซม. · ตัวโยก (คานไม้กระดก) สกรีน 2 ด้าน ขนาด 11 ซม. · ฐานใส ขนาด 4-5 ซม.",
  "อะคริลิคใส หนา 3 มม. — ชิ้นไหนเกินขนาดมาตรฐาน บวกเพิ่ม ซม. ละ 10 บาท",
  "ทำได้เฉพาะอะคริลิคใส | กลิตเตอร์ | โฮโลแกรม (ไม่มีอะคริลิคสีทึบ) · อะคริลิคพิเศษหนาประมาณ 2.5-3 มม.",
  "จำนวน 11 เซตขึ้นไป คละลาย คละขนาด สั่งขั้นต่ำ 5 ชิ้น++ ไม่ถึงตามจำนวน คิดตามราคาปลีก",
  "ราคา 1-10 เซต สามารถคละดีเทลได้ไม่จำกัด",
  "ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดความยาวแนวแทยง)",
].join("\n");

const seo = {
  title: "รับทำสแตนดี้ไม้กระดก (Acrylic Seesaw) พิมพ์ลายตามสั่ง เริ่มต้น 250 บาท",
  description:
    "รับผลิตสแตนดี้ไม้กระดกอะคริลิค (Acrylic Seesaw) พิมพ์ UV ลายของคุณเอง — 1 เซตมีตัวโยกสกรีน 2 ด้าน " +
    "จุดหมุน 2 ชิ้น และฐานใส เลือกกลิตเตอร์/โฮโลแกรมได้ · 1-10 เซตไม่มีขั้นต่ำ ส่งไวทั่วไทย",
  keywords: [
    "สแตนดี้ไม้กระดก",
    "รับทำสแตนดี้ไม้กระดก",
    "acrylic seesaw",
    "สแตนดี้อะคริลิค",
    "อะคริลิคไม้กระดก",
    "สแตนดี้ตั้งโต๊ะ",
    "รับผลิตสแตนดี้",
    "พิมพ์ลายตามสั่ง",
    "อะคริลิคโฮโลแกรม",
    "iDucky",
  ],
  faqs: [
    {
      q: "สแตนดี้ไม้กระดก ราคาเท่าไหร่?",
      a: "เริ่มเซตละ 350 บาท (1-10 เซต) ลดตามจำนวน — 11-49 เซต 300 · 50-199 เซต 290 · 200-499 เซต 280 · 500 เซตขึ้นไป 250 บาท",
    },
    {
      q: "1 เซตได้อะไรบ้าง ขนาดเท่าไหร่?",
      a: "ได้ตัวกลาง (จุดหมุน) 2 ชิ้น + เจาะรู ขนาด 3-4 ซม. · ตัวโยก (คานไม้กระดก) สกรีน 2 ด้าน ขนาด 11 ซม. · และฐานใส ขนาด 4-5 ซม. อะคริลิคใสหนา 3 มม.",
    },
    {
      q: "อยากได้ใหญ่กว่าขนาดมาตรฐาน คิดเพิ่มยังไง?",
      a: "ชิ้นไหนเกินขนาดมาตรฐาน บวกเพิ่ม ซม. ละ 10 บาท เลือกขนาดของแต่ละชิ้นได้ในหน้าสั่งซื้อ ระบบคิดราคาให้อัตโนมัติ",
    },
    {
      q: "ใช้อะคริลิคสีพิเศษได้ไหม?",
      a: "ได้เฉพาะอะคริลิคใส กลิตเตอร์ และโฮโลแกรมครับ (หน้าตารางราคาระบุไว้) คิดเพิ่มต่อชิ้นอะคริลิคตามขนาดชิ้นนั้น เช่น ตัวโยก 11 ซม. +15 บาท · ตัวกลาง/ฐาน +10 บาท (เรทปลีก) อะคริลิคพิเศษหนาประมาณ 2.5-3 มม.",
    },
    {
      q: "สั่งขั้นต่ำกี่เซต คละลายได้ไหม?",
      a: "1-10 เซตไม่มีขั้นต่ำ คละดีเทลได้ไม่จำกัด · ตั้งแต่ 11 เซตขึ้นไป คละลาย/คละขนาดได้ โดยสั่งลายละ 5 ชิ้นขึ้นไป ถ้าไม่ถึงจำนวนคิดตามราคาปลีก",
    },
    {
      q: "รับทำเป็นลายของตัวเองได้ไหม?",
      a: "ได้ครับ ส่งไฟล์ .Ai .Psd .Png พื้นหลังใส มาตอนสั่งซื้อ ทีมงานจัดทำแบบให้ตรวจและอนุมัติก่อนเริ่มผลิตทุกครั้ง",
    },
  ],
};

const product: Product = {
  id: ID,
  slug: "สแตนดี้ไม้กระดก",
  name: "สแตนดี้ไม้กระดก",
  category: "acrylic",
  price: BASE_PRICES[0],
  emoji: "🛝",
  gradient: "from-sky-200 to-cyan-300",
  imageSrc: IMG("gallery-1"),
  seo,
  rating: 5,
  sold: 0,
  hidden: true,
  description:
    "สแตนดี้ไม้กระดก (Acrylic Seesaw) อะคริลิคใสหนา 3 มม. พิมพ์ UV — 1 เซตมีตัวโยก (คานไม้กระดก) สกรีน 2 ด้าน ขนาด 11 ซม. " +
    "ตัวกลาง (จุดหมุน) 2 ชิ้น + เจาะ ขนาด 3-4 ซม. และฐานใส 4-5 ซม. วางแล้วกระดกขึ้นลงได้จริง · เรทราคาปลีก 1-10 เซต ไม่มีขั้นต่ำ",
  highlights: [
    "1 เซต = ตัวโยก (สกรีน 2 ด้าน) + จุดหมุน 2 ชิ้น + ฐานใส",
    "อะคริลิคใสหนา 3 มม. · UV Printing · เลือกกลิตเตอร์/โฮโลแกรมได้",
    "1-10 เซต ไม่มีขั้นต่ำ คละดีเทลได้ไม่จำกัด",
  ],
  terms: TERMS,
  options,
  images: [1, 2, 3, 4, 5].map((n) => ({
    src: IMG(`gallery-${n}`),
    emoji: "🛝",
    label: "",
    gradient: "from-sky-200 to-cyan-300",
  })),
  pricing,
  priceRates: [
    {
      id: "r1",
      label: "เรทที่ 1",
      desc: "ตัวโยก สกรีน 2 ด้าน · จุดหมุน 2 ชิ้น + เจาะ · ฐานใส — อะคริลิคใสหนา 3 มม.",
      minPerDesign: 5,
      freeMixBelowQty: 11,
      pricing,
    },
  ],
  tierByDesign: true,
  bulkAskQty: 20,
  // โซน "ข้างแผงสั่งซื้อ" = ต่อท้ายตารางราคาในคอลัมน์เดียวกัน
  body: [
    {
      heading: "ขนาดมาตรฐาน 1 เซต · Add on อะคริลิคพิเศษ",
      text: "",
      html: SPEC_TABLE,
      slot: "side",
    },
  ],
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: [
        "• 1 เซต = ตัวกลาง (จุดหมุน) 2 ชิ้น + เจาะ ขนาด 3-4 ซม. | ตัวโยก (คานไม้กระดก) สกรีน 2 ด้าน ขนาด 11 ซม. | ฐานใส ขนาด 4-5 ซม.",
        "• อะคริลิคใส หนา 3 มม. — ชิ้นไหนเกินขนาดมาตรฐาน บวกเพิ่ม ซม. ละ 10 บาท",
        "• ทำได้เฉพาะอะคริลิคใส | กลิตเตอร์ | โฮโลแกรม · อะคริลิคพิเศษจะมีความหนาประมาณ 2.5-3 มม.",
        "• จำนวน 11 ชิ้นขึ้นไป คละลาย คละขนาด สั่งขั้นต่ำ 5 ชิ้น++ ไม่ถึงตามจำนวน คิดตามราคาปลีก",
        "• ราคา 1-10 ชิ้น สามารถคละดีเทลได้ไม่จำกัด",
        "• ไฟล์ นามสกุล .Ai .Psd .Png หรือพื้นหลังใส",
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
        '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ขนาด/รุ่นที่ต้องการ · วันที่ต้องการใช้งาน\n' +
        "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n" +
        "หรือสั่งทางอีเมล::\n" +
        "• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n" +
        "• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n" +
        "• ระบุรายละเอียด: สินค้า/ขนาดที่เลือก · ขนาดที่กำหนดเอง กี่ ซม. (ถ้ามี) · จำนวน · วันที่ใช้งาน (ถ้ามี)\n" +
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

const FILES = [
  ...[1, 2, 3, 4, 5].map((n) => `gallery-${n}`),
  ...ROCK_SIZES.map((cm) => `rock-${cm}`),
  ...MID_SIZES.map((cm) => `mid-${cm}`),
  ...BASE_SIZES.map((cm) => `base-${cm}`),
  ...["rock", "mid", "base"].flatMap((p) => [`part-${p}-plain`, `part-${p}-special`]),
];

const sb = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function uploadImages() {
  if (!IMAGES_DIR) throw new Error("ต้องระบุ --images=<โฟลเดอร์ที่เตรียมไฟล์ไว้>");
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
  console.log(
    `   ราคา ${range.min}-${range.max} บาท/เซต · ตัวเลือก ${saved.options.length} กลุ่ม · รูปแกลเลอรี ${saved.images.length} ภาพ`
  );
  console.log(`   ตารางราคา: ${TIERS.map((t, i) => `${t.label} ${BASE_PRICES[i]}`).join(" · ")}`);
  console.log(`   ช่องในตาราง ${Object.keys(cells).length} ช่อง (ขนาดตัวโยก × อะคริลิค 3 ชิ้น)`);
  console.log(`   ตัวเลือกที่มีภาพประกอบ: ${allChoices.filter((c) => c.imageSrc).length}/${allChoices.length} ตัว`);
  console.log(`   แท็บ: ${(saved.tabs ?? []).map((t) => t.title).join(" · ")}`);
  console.log("\n   ตัวอย่างราคา/เซต (ทุกชิ้นอะคริลิคใส):");
  for (const cm of [11, 15, 20]) {
    const key = `${ROCK_LABEL(cm)}│${CLEAR}│${CLEAR}│${CLEAR}`;
    console.log(`     ตัวโยก ${cm} ซม.  ${cells[key].join(" · ")}`);
  }
  console.log("   ตัวอย่างราคา/เซต (อะคริลิคพิเศษทั้ง 3 ชิ้น):");
  for (const cm of [11, 20]) {
    const key = `${ROCK_LABEL(cm)}│${SPECIAL}│${SPECIAL}│${SPECIAL}`;
    console.log(`     ตัวโยก ${cm} ซม.  ${cells[key].join(" · ")}`);
  }

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
  if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);
  console.log(`\n✅ บันทึกแล้ว: ${ID} — ยังเป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
