#!/usr/bin/env node
/**
 * สร้างสินค้า "Spinning Glow" (อะคริลิคหมุน มีไฟ / ไม่มีไฟ) จากหน้า pricelists /acrylicrotatingstand
 * ลงสินค้า id new-muzeb6rz-9639 (เจ้าของร้านกด "สินค้าใหม่" ในหลังบ้านไว้ 8 ต.ค. 69)
 *
 *   node scripts/spinning-glow-build.mjs            # พิมพ์ตาราง/ตัวเลือกที่จะเขียน (ยังไม่แตะอะไร)
 *   node scripts/spinning-glow-build.mjs --upload   # ดึงรูป 9 รูปจาก Wix → JPG → อัปขึ้น storage products/spinning-glow/
 *   node scripts/spinning-glow-build.mjs --write    # เขียนสินค้าลง Supabase (ต้องมีรูปบน storage แล้ว)
 *
 * แหล่งราคา: Wix dataset 3 ชุดในหน้านั้น (อ่านจาก recordsByCollectionId ใน HTML — ไม่ใช่ <table>)
 *   AcrylicSpinningGlow               = แบบมีไฟ     (จำนวน × ขนาด 5-10 cm · 4 ช่วง)
 *   AcrylicSpinningGloww3cda4f6cdz    = แบบไม่มีไฟ  (เหมือนกัน)
 *   AcrylicSpinningGlowADD-ON         = แผ่นบน (Add-on) อะคริลิค 2 mm (3 ช่วง: 1-10 / 11-29 / 30 ขึ้นไป)
 * ข้อความประกอบ: 11 cm ขึ้นไป "เรทราคาปลีก" + เซนละ 25 (มีไฟ) / 15 (ไม่มีไฟ) · แผ่นบน + เซนละ 8
 *   → เติมแถว 11-15cm เป็นราคาปลีกของ 10cm + ส่วนเพิ่ม เท่ากันทุกช่วงจำนวน (ตามคำว่า "เรทราคาปลีก")
 *
 * ทรงข้อมูล (เจ้าของร้านชี้ 8 ต.ค. 69: ตาราง Add-on = "ชิ้นที่ 2 (ชิ้นบน)" ต้องมีทุกชิ้น ไม่ใช่ของเสริม · ตารางมีไฟ/ไม่มีไฟ = "ชิ้นที่ 1 (ชิ้นล่าง)" — คนละชิ้น เลือกขนาดแยกกัน)
 *   ตารางราคา 2 แกน [ไฟ LED, ขนาดชิ้นที่ 1 (ชิ้นล่าง)]
 *   ชิ้นที่ 2 (ชิ้นบน) = กลุ่มเลือกขนาดของตัวเอง คิด +฿ 3 ขั้นตามช่วงจำนวน (extraSmall ≤10 · extraBelow <30 · extra ≥30)
 *   แบบเดียวกับกลุ่ม "ติ่งห้อย" ของ griptok-magsafe
 * ภาพตัวเลือก: ใช้รูปจริงจาก Wix (พวงกุญแจ/แม่เหล็ก × ติดไฟ/ไม่ติดไฟ) ผูก imageSrc + imageWhen
 * ให้แกลเลอรีสลับตามที่เลือก (URL ต้องเป็นตัวเดียวกับใน product.images — ดู memory iducky-option-images)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const UPLOAD = process.argv.includes("--upload");
const WRITE = process.argv.includes("--write");

const PRODUCT_ID = "new-muzeb6rz-9639";
const NAME = "Spinning Glow อะคริลิคหมุน มีไฟ / ไม่มีไฟ";
const SLUG = "spinning-glow";
const IMG_DIR = "spinning-glow";
const VER = "v1";
const CACHE = ".cache/spinning-glow";
mkdirSync(CACHE, { recursive: true });

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const STORAGE = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${IMG_DIR}`;

// ── รูปจาก Wix (ลำดับ = แกลเลอรี · รูปแรกเป็นปก) ─────────────────────────────
const WIX = "https://static.wixstatic.com/media/959b83_";
const IMAGES = [
  { file: "01-keyring-glow", id: "50b2851e4af74cf19bee146201e6b422", label: "พวงกุญแจ แบบมีไฟ (ไฟ RGB ติด)" },
  { file: "02-keyring-plain", id: "9ca1aaed188642b39494c3db08b0057c", label: "พวงกุญแจ แบบไม่มีไฟ" },
  { file: "03-magnet-glow", id: "b2763674e21142ef8129e27c0450e551", label: "แม่เหล็ก แบบมีไฟ (ไฟ RGB ติด)" },
  { file: "04-magnet-plain", id: "ea7f12227c1646b6bf083df88cbab036", label: "แม่เหล็ก แบบไม่มีไฟ" },
  { file: "05-keyring-glow-bag", id: "ac65ca6d75304709b53aecfd23ba8be4", label: "พวงกุญแจมีไฟ ห้อยกระเป๋า" },
  { file: "06-keyring-plain-close", id: "17ad942a97194411977163e381a02676", label: "พวงกุญแจ ใบพัดหมุนได้" },
  { file: "07-keyring-back", id: "07250aa838fe451d8ad33265cb019163", label: "ด้านหลังพวงกุญแจ (หมุดไฟ + ถ่าน)" },
  { file: "08-magnet-back", id: "19c462f4ed564f1a9f615f1469e2d54d", label: "ด้านหลังแม่เหล็ก (หมุดไฟ + แม่เหล็ก)" },
  { file: "09-magnet-glow-hand", id: "1d93d9c71fbb4a308a3e72f2e77f631c", label: "แม่เหล็กมีไฟ หมุนเล่นได้" },
];
const url = (file) => `${STORAGE}/${file}-${VER}.jpg`;
const IMG = Object.fromEntries(IMAGES.map((i) => [i.file.slice(0, 2), url(i.file)]));
// 01 พวงกุญแจมีไฟ · 02 พวงกุญแจไม่มีไฟ · 03 แม่เหล็กมีไฟ · 04 แม่เหล็กไม่มีไฟ · 08 หลังแม่เหล็ก

// ── ตารางราคาจาก Wix (บาท/ชิ้น · คอลัมน์ 5,6,7,8,9,10 cm) ───────────────────
const SIZES_WEB = [5, 6, 7, 8, 9, 10];
const TIERS = [
  { upTo: 10, label: "1-10 ชิ้น" },
  { upTo: 29, label: "11-29 ชิ้น" },
  { upTo: 49, label: "30-49 ชิ้น" },
  { upTo: null, label: "50 ชิ้นขึ้นไป" }, // เว็บเขียน 50-199 · 200 ขึ้นไปให้ถามแอดมิน (bulkAskQty)
];
/** แถว = ช่วงจำนวน (ตาม TIERS) · คอลัมน์ = ขนาด 5..10 */
const BASE = {
  "มีไฟ": [
    [210, 210, 235, 260, 285, 310],
    [148, 168, 188, 208, 228, 248],
    [140, 160, 180, 200, 220, 240],
    [130, 150, 170, 190, 210, 230],
  ],
  "ไม่มีไฟ": [
    [170, 170, 185, 200, 215, 230],
    [84, 94, 104, 114, 124, 134],
    [80, 90, 100, 110, 120, 130],
    [75, 85, 95, 105, 115, 125],
  ],
};
/**
 * ชิ้นบน 3 ช่วง: 1-10 / 11-29 / 30 ขึ้นไป · คอลัมน์ 2-10 cm
 * ⚠️ ใช้ตารางที่เจ้าของร้านส่งมา (ชีต 8 ต.ค. 69) ไม่ใช่ของเว็บ — เว็บเริ่ม 5cm=20 แต่ชีตเริ่ม 2cm=20, 5cm=50
 */
const TOP_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const ADDON_WEB = [
  [20, 30, 40, 50, 60, 70, 80, 90, 100],
  [15, 25, 35, 45, 55, 65, 75, 85, 95],
  [12, 22, 32, 42, 52, 62, 72, 82, 92],
];
/** ชิ้นบน 11 cm ขึ้นไป + เซนละ 8 ทุกช่วง (ข้อความเว็บไม่ได้บอกว่าเฉพาะปลีก) */
const OVER_CM = { "มีไฟ": 25, "ไม่มีไฟ": 15 }; // 11 cm ขึ้นไป เรทปลีก + เซนละ
const ADDON_OVER_CM = 8;
const MAX_SIZE = 15;
const SIZES = Array.from({ length: MAX_SIZE - 4 }, (_, i) => i + 5);

const LIGHT = "ไฟ LED";
const SIZE = "ขนาดชิ้นที่ 1 (ชิ้นล่าง)";
const TOP_LABEL = "ขนาดชิ้นที่ 2 (ชิ้นบน)";
// 📐 ระบุขนาดเอง (แบบพวงกุญแจอะคริลิค keyring-copy-copy): เลือกตัวนี้แล้วกรอกด้านยาวสุด → ระบบเกาะแถวขนาดที่ครอบ · เกิน 15 ซม. ให้แอดมินตีราคา
const CUSTOM_CHOICE = "📐 กำหนดขนาดเอง (ระบุด้านที่ยาวที่สุด)";
const CUSTOM_BOTTOM = "ชิ้นล่าง กำหนดขนาดเอง (ด้านที่ยาวที่สุด)";
const CUSTOM_TOP = "ชิ้นบน กำหนดขนาดเอง (ด้านที่ยาวที่สุด)";
const sizeInputOf = (widthLabel) => ({ unit: "ซม.", choice: CUSTOM_CHOICE, askOver: MAX_SIZE, widthLabel, heightLabel: widthLabel });
const customInputGroup = (label, parent, hint) => ({
  label,
  display: "input",
  standardInput: true,
  section: "2. ขนาด",
  showWhen: { label: parent, choices: [CUSTOM_CHOICE] },
  input: { kind: "number", min: 1, max: 30, unit: "ซม.", placeholder: "3.5", hint },
  choices: [],
});
const WORK = "แบบงาน";
const sz = (n) => `${n}cm`;

/** ราคาฐาน (ไฟ, ขนาด, index ช่วง) — เกิน 10 cm = ปลีกของ 10cm + ส่วนเพิ่ม ทุกช่วง */
const basePrice = (light, size, t) =>
  size <= 10 ? BASE[light][t][size - 5] : BASE[light][0][5] + OVER_CM[light] * (size - 10);
/** ชิ้นบน (ขนาด, index ช่วง 3 ขั้นของเว็บ 0=1-10 1=11-29 2=30+) */
const TOP_ALL = [...TOP_SIZES, ...SIZES.filter((n) => n > 10)]; // 2-15 cm
const topPrice = (size, w) => (size <= 10 ? ADDON_WEB[w][size - 2] : ADDON_WEB[w][8] + ADDON_OVER_CM * (size - 10));

const cells = {};
for (const light of ["มีไฟ", "ไม่มีไฟ"]) {
  for (const size of SIZES) {
    cells[`${light}│${sz(size)}`] = TIERS.map((_, t) => basePrice(light, size, t));
  }
}
// ยืนยันช่องที่คัดจากเว็บตรง 100% (กันพิมพ์เพี้ยน)
const check = (k, want) => {
  const got = JSON.stringify(cells[k]);
  if (got !== JSON.stringify(want)) throw new Error(`cell ${k} = ${got} ≠ ${JSON.stringify(want)}`);
};
check("มีไฟ│5cm", [210, 148, 140, 130]);
check("มีไฟ│10cm", [310, 248, 240, 230]);
check("ไม่มีไฟ│5cm", [170, 84, 80, 75]);
check("ไม่มีไฟ│10cm", [230, 134, 130, 125]);
check("มีไฟ│11cm", [335, 335, 335, 335]);
check("ไม่มีไฟ│12cm", [260, 260, 260, 260]);
if (topPrice(2, 0) !== 20 || topPrice(5, 0) !== 50 || topPrice(5, 2) !== 42 || topPrice(10, 1) !== 95 || topPrice(12, 0) !== 116) throw new Error("ตารางชิ้นบนเพี้ยน");

const pricing = { unit: "ชิ้น", driverLabels: [LIGHT, SIZE], tiers: TIERS, cells };

// 🔗 สีโซ่ไข่ปลาจากคลังตัวเลือกกลาง (ชุดเดียวกับพวงกุญแจ) — ราคาในคลัง = ค่าโซ่แล้ว (+3 · เงา +4)
// จึงตัวเลือก "โซ่ไข่ปลาสี" ไม่บวกเอง ไม่งั้นคิดซ้ำ (ดู note ของคลัง) · choices เก็บเป็น snapshot สำรองตามแบบ linkedOptionFromPreset
const CHAIN_PRESET = "hook-color-c";
const { data: presetRow, error: presetErr } = await sb.from("products").select("data").eq("id", `__preset_${CHAIN_PRESET}`).single();
if (presetErr) throw presetErr;
const chainPreset = presetRow.data;
if (!chainPreset?.choices?.length) throw new Error(`คลัง ${CHAIN_PRESET} ไม่มีตัวเลือก`);

const whenWork = (c) => [{ label: WORK, choices: [c] }];
const whenLight = (c) => [{ label: LIGHT, choices: [c] }];

const options = [
  {
    label: LIGHT,
    display: "cards",
    section: "1. แบบ",
    choices: [
      {
        name: "มีไฟ",
        popular: true,
        desc: "หมุดไฟ RGB 1.65 cm · อะคริลิคหนารวม 1 cm",
        imageSrc: IMG["01"],
        imageWhen: [{ when: whenWork("แม่เหล็ก"), imageSrc: IMG["03"] }],
      },
      {
        name: "ไม่มีไฟ",
        desc: "หมุดธรรมดา 1.8 cm · อะคริลิคหนารวม 6 mm",
        imageSrc: IMG["02"],
        imageWhen: [{ when: whenWork("แม่เหล็ก"), imageSrc: IMG["04"] }],
      },
    ],
  },
  {
    label: WORK,
    display: "cards",
    section: "1. แบบ",
    choices: [
      {
        name: "พวงกุญแจ",
        popular: true,
        desc: "โซ่ไข่ปลาสีเงินฟรี · เลือกสีโซ่ได้",
        imageSrc: IMG["01"],
        imageWhen: [{ when: whenLight("ไม่มีไฟ"), imageSrc: IMG["02"] }],
      },
      {
        name: "แม่เหล็ก",
        desc: "แม่เหล็กด้านหลัง จุดละ 10 บาท",
        imageSrc: IMG["03"],
        imageWhen: [{ when: whenLight("ไม่มีไฟ"), imageSrc: IMG["04"] }],
      },
    ],
  },
  {
    label: SIZE,
    display: "dropdown",
    section: "2. ขนาด",
    note: `วัดด้านที่ยาวที่สุด · 11 cm ขึ้นไป คิดเรทปลีก +${OVER_CM["มีไฟ"]}/ซม. (มีไฟ) · +${OVER_CM["ไม่มีไฟ"]}/ซม. (ไม่มีไฟ)`,
    sizeInput: sizeInputOf(CUSTOM_BOTTOM),
    choices: [...SIZES.map((n) => ({ name: sz(n) })), { name: CUSTOM_CHOICE }],
  },
  customInputGroup(CUSTOM_BOTTOM, SIZE, `วัดด้านที่ยาวที่สุด ใส่ทศนิยมได้ เช่น 7.5 · เศษไม่เกินครึ่งเซนยังอยู่แถวเดิม (7.5 = แถว 7cm · 7.6 = แถว 8cm) · เกิน ${MAX_SIZE} ซม. แอดมินตีราคาให้`),
  {
    label: TOP_LABEL,
    display: "dropdown",
    section: "2. ขนาด",
    note: `อะคริลิคใส 2 mm ชิ้นบนตัวหมุน เลือกขนาดแยกจากชิ้นล่างได้ · 11 cm ขึ้นไป +${ADDON_OVER_CM}/ซม.`,
    extraSmallUpToQty: 10,
    extraFromQty: 30,
    sizeInput: sizeInputOf(CUSTOM_TOP),
    choices: [
      ...TOP_ALL.map((n) => ({
        name: sz(n),
        extraSmall: topPrice(n, 0),
        extraBelow: topPrice(n, 1),
        extra: topPrice(n, 2),
      })),
      { name: CUSTOM_CHOICE },
    ],
  },
  customInputGroup(CUSTOM_TOP, TOP_LABEL, `วัดด้านที่ยาวที่สุดของชิ้นบน ใส่ทศนิยมได้ เช่น 2.5 · เศษไม่เกินครึ่งเซนยังอยู่แถวเดิม (2.5 = แถว 2cm · 2.6 = แถว 3cm) · เกิน ${MAX_SIZE} ซม. แอดมินตีราคาให้`),
  {
    label: "โซ่ไข่ปลา",
    section: "3. ของเสริม",
    showWhen: { label: WORK, choices: ["พวงกุญแจ"] },
    choices: [
      { name: "โซ่ไข่ปลาสีเงิน", badge: "ฟรี!" },
      { name: "โซ่ไข่ปลาสี", desc: "1-10 ชิ้นฟรี · 11 ชิ้นขึ้นไป +3/เส้น" },
    ],
  },
  {
    label: chainPreset.label,
    display: "dropdown",
    section: "3. ของเสริม",
    presetId: CHAIN_PRESET,
    // ชีตเจ้าของร้าน: ช่วงปลีก 1-10 ชิ้น "เลือกสีอะไรก็ได้" รวมในราคา · เรทส่งค่อยคิดเส้นละ 3 (แบบเดียวกับพวงกุญแจอะคริลิค)
    extraFromQty: 11,
    note: "1-10 ชิ้นเลือกสีฟรี · 11 ชิ้นขึ้นไป เส้นละ 3 บาท (แบบเงา 4)",
    showWhen: { label: "โซ่ไข่ปลา", choices: ["โซ่ไข่ปลาสี"] },
    showWhenAlso: { label: WORK, choices: ["พวงกุญแจ"] },
    choices: chainPreset.choices,
  },
  {
    label: "แม่เหล็ก",
    section: "3. ของเสริม",
    showWhen: { label: WORK, choices: ["แม่เหล็ก"] },
    imageSrc: IMG["08"],
    note: "จุดละ 10 บาท · งานชิ้นใหญ่แนะนำ 2-3 จุด",
    choices: [
      { name: "1 จุด", extra: 10 },
      { name: "2 จุด", extra: 20 },
      { name: "3 จุด", extra: 30 },
    ],
  },
];

const RATE_DESC = "1-10 ชิ้น คละลายได้ไม่จำกัด · ตั้งแต่ 11 ชิ้นขึ้นไป คละได้โดยลายละ 5 ชิ้นขึ้นไป — ไม่ถึงตามจำนวน คิดตามราคาปลีก";
const priceRates = [
  { id: "r1", label: "ราคาต่อชิ้น", desc: RATE_DESC, pricing, minPerDesign: 5, freeMixBelowQty: 11 },
];

const allPrices = Object.values(cells).flat();
const priceMin = Math.min(...allPrices);
const priceMax = Math.max(...allPrices);

const DESCRIPTION =
  "Spinning Glow อะคริลิคหมุนได้ พิมพ์ลาย UV ไดคัทตามแบบ ตัวงานประกบหมุดหมุนตรงกลาง — เลือกแบบมีไฟ RGB กะพริบตอนหมุน หรือแบบไม่มีไฟ ทำเป็นพวงกุญแจหรือแม่เหล็กติดตู้เย็น ขนาด 5-10 cm (ใหญ่กว่านั้นสั่งได้) งาน 2 ชิ้นประกบ (ชิ้นล่าง + ชิ้นบน เลือกขนาดแยกกัน) ไม่มีขั้นต่ำ เริ่มต้นชิ้นละ 190 บาท (ไม่มีไฟ ล่าง 5 cm + บน 2 cm) ยิ่งสั่งเยอะยิ่งถูก";
const HIGHLIGHTS = [
  "หมุนได้จริง ✨ เลือกแบบมีไฟ RGB หรือไม่มีไฟ",
  "ทำเป็นพวงกุญแจ หรือแม่เหล็กติดตู้เย็นได้ — ปลีกเริ่ม 190 บาท รวมอะไหล่+โซ่แล้ว",
  "ไม่มีขั้นต่ำ — 1 ชิ้นก็สั่งได้ · 1-10 ชิ้น คละลายได้ไม่จำกัด",
  "ไดคัทตามแบบ พิมพ์ระบบ UV สีคมชัด 🥰",
];
const TERMS = [
  "*แบบมีไฟ: หมุดหมุนมีไฟ RGB ขนาด 1.65 cm · อะคริลิคประกบหนารวม 1 cm (แผ่นล่าง 5 mm / แผ่นบน 2 mm / แกนหมุน 4 mm)",
  "*แบบไม่มีไฟ: หมุดหมุนไม่มีไฟ ขนาด 1.8 cm · อะคริลิคประกบหนารวม 6 mm (แผ่นล่าง 3 mm / แผ่นบน 2 mm / แกนหมุน 4 mm)",
  "*ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดความยาวแนวแทยง) · พวงกุญแจไม่นับรวมรูตะขอ หากต้องการให้นับรวมต้องแจ้ง",
  "*ตัวงานจะเห็นคราบกาวบ้าง แต่ไม่มีผลกับการใช้งาน",
  "*ทางร้านใช้สี R G B สีงานสกรีนที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
].join("\n");
const TABS = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text: [
      "• อะคริลิคหมุนได้ (Spinning) พิมพ์ลาย UV ไดคัทตามแบบ ตรงกลางประกบหมุดหมุน — เลือกแบบมีไฟ RGB (กะพริบตอนหมุน) หรือแบบไม่มีไฟ",
      "• แบบงาน: พวงกุญแจ (โซ่ไข่ปลาสีเงินฟรี · โซ่สี 1-10 ชิ้นเลือกสีได้ฟรี 11 ชิ้นขึ้นไปเส้นละ 3 บาท) หรือแม่เหล็กติดตู้เย็น (ค่าแม่เหล็กจุดละ 10 บาท)",
      "• ราคาปลีก 1-10 ชิ้น (ชิ้นล่างไม่เกิน 6 cm + ชิ้นบน 2 cm): พวงกุญแจ มีไฟ 230 / ไม่มีไฟ 190 บาท · ติดตู้เย็น มีไฟ 240 / ไม่มีไฟ 200 บาท — รวมอะไหล่หมุน+ตะขอโซ่แล้ว",
      "• งานประกอบ 2 ชิ้น: ชิ้นที่ 1 (ชิ้นล่าง) = ตัวงานหลัก หนา 5 mm (มีไฟ) / 3 mm (ไม่มีไฟ) ขนาดเริ่มต้นไม่เกิน 6 cm ราคาเท่ากัน · ตาราง 5-10 cm — 11 cm ขึ้นไป คิดเรทราคาปลีก เพิ่ม cm ละ 25 บาท (มีไฟ) / 15 บาท (ไม่มีไฟ)",
      "• ชิ้นที่ 2 (ชิ้นบน) อะคริลิคใสหนา 2 mm ต้องมีทุกชิ้น เลือกขนาดแยกจากชิ้นล่างได้ ราคาชิ้นบนบวกเพิ่มตามขนาด 2-10 cm 12-100 บาท · 11 cm ขึ้นไป เพิ่ม cm ละ 8 บาท",
      "• ราคา 1-10 ชิ้น คละลายได้ไม่จำกัด · ตั้งแต่ 11 ชิ้นขึ้นไป คละได้โดยลายละ 5 ชิ้นขึ้นไป — ไม่ถึงตามจำนวน คิดตามราคาปลีก",
      "",
      "สเปคแบบมีไฟ::",
      "• อะคริลิคประกบ ความหนารวม 1 cm — แผ่นล่าง 5 mm / แผ่นบน 2 mm / แกนหมุน 4 mm",
      "• หมุดหมุนมีไฟ ขนาด 1.65 cm ไฟ RGB",
      "",
      "สเปคแบบไม่มีไฟ::",
      "• อะคริลิคประกบ ความหนารวม 6 mm — แผ่นล่าง 3 mm / แผ่นบน 2 mm / แกนหมุน 4 mm",
      "• หมุดหมุนไม่มีไฟ ขนาด 1.8 cm",
      "",
      "หมายเหตุ::",
      "• จุดหมุนแกนกลางที่ไว้สำหรับตัวหมุด ทรงกลม ขนาด 1 cm — ออกแบบเผื่อพื้นที่ตรงนี้ไว้ด้วย",
      "• ตัวงานจะเห็นคราบกาวบ้าง แต่ไม่มีผลกับการใช้งาน",
      "",
      "ข้อมูลที่ลูกค้าควรทราบ::",
      "• ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดความยาวแนวทแยง) · พวงกุญแจไม่นับรวมรูตะขอ หากต้องการให้นับรวมต้องแจ้ง",
      "• งานสกรีนอะคริลิคปกติสกรีนใต้ (ยกเว้นโฮโลแกรม-01 / สีพิเศษ จะสกรีนบน) — ต้องการสกรีนบนต้องแจ้ง เพื่อทางร้านเขียนกำกับไว้ที่บิล",
      "• งานสกรีนเต็มขอบ สีมีโอกาสหลุดลอกง่ายกว่าแบบปกติ",
      "• ทางร้านมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องต่างกันได้ 5-10% · ใช้สี RGB สีที่ได้อาจสว่างกว่าหรือดรอปลงจากไฟล์ ±5% ถึง ±15%",
    ].join("\n"),
  },
  {
    title: "วิธีสั่งงาน",
    text: [
      "• เลือกแบบ (มีไฟ/ไม่มีไฟ) · แบบงาน (พวงกุญแจ/แม่เหล็ก) · ขนาด · ของเสริม แล้วใส่จำนวน",
      "• แนบไฟล์งาน นามสกุล .Ai .Psd .Png พื้นหลังใส (หรือลิงก์ Google Drive ที่เปิดการเข้าถึงแล้ว)",
      "• ระบุวันที่ใช้งาน (ถ้ามี) ในช่องหมายเหตุ — ทางร้านจะส่งแบบให้ตรวจก่อนผลิต",
      "• ขนาด 11 cm ขึ้นไป หรือสั่ง 200 ชิ้นขึ้นไป แอดมินจะเช็คคิวผลิตและยืนยันราคาให้อีกครั้ง",
    ].join("\n"),
  },
  {
    title: "การรับประกันสินค้า",
    text: [
      "รับเคลม::",
      "• สีเพี้ยนเกิน 10-15%",
      "• จำนวนที่ได้รับไม่ครบถ้วน",
      "• สีอะคริลิค หรืออะไหล่ ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต",
      "• สินค้าเกิดการแตกหักระหว่างการขนส่ง",
      "",
      "ไม่รับเคลม::",
      "• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต",
      "• สินค้าชำรุดจากการใช้งานมาแล้ว",
      "",
      "ระยะเวลาในการเคลม::",
      "• EMS 7 วัน นับจากวันที่ส่งสินค้า หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    ].join("\n"),
  },
];
const SEO = {
  title: "รับทำ Spinning Glow อะคริลิคหมุนได้ มีไฟ RGB / ไม่มีไฟ · พวงกุญแจ · แม่เหล็ก",
  description:
    "รับทำ/รับผลิต Spinning Glow อะคริลิคหมุนได้ พิมพ์ UV ไดคัทตามแบบ เลือกแบบมีไฟ RGB หรือไม่มีไฟ ทำเป็นพวงกุญแจหรือแม่เหล็ก เริ่มต้น 190 บาท ไม่มีขั้นต่ำ สั่งง่าย ส่งไวทั่วไทย",
  keywords: [
    "Spinning Glow",
    "อะคริลิคหมุนได้",
    "พวงกุญแจอะคริลิคหมุน",
    "พวงกุญแจมีไฟ",
    "พวงกุญแจ LED",
    "แม่เหล็กอะคริลิค",
    "อะคริลิคมีไฟ",
    "รับทำพวงกุญแจ",
    "งานสั่งทำ",
    "UV Printing",
  ],
  faqs: [
    {
      q: "Spinning Glow ราคาเท่าไหร่?",
      a: "ราคาปลีก 1-10 ชิ้น พวงกุญแจ มีไฟ 230 / ไม่มีไฟ 190 บาท · ติดตู้เย็น 240 / 200 บาท (ชิ้นล่างไม่เกิน 6 cm + ชิ้นบน 2 cm) · ราคา = ชิ้นล่าง + ชิ้นบน · ชิ้นล่างแบบมีไฟ 5 cm 210 บาท (1-10 ชิ้น) ลดเหลือ 130 บาทที่ 50 ชิ้นขึ้นไป · แบบไม่มีไฟ 5 cm 170 บาท ลดเหลือ 75 บาท · ชิ้นบน 2 cm บวก 20 บาท (1-10 ชิ้น) / 15 / 12 · 5 cm บวก 50 / 45 / 42 · ขนาดใหญ่ขึ้นราคาเพิ่มตามตาราง",
    },
    {
      q: "แบบมีไฟ กับ ไม่มีไฟ ต่างกันยังไง?",
      a: "แบบมีไฟใช้หมุดหมุนที่มีไฟ RGB ในตัว (ขนาด 1.65 cm) กะพริบตอนหมุน อะคริลิคหนารวม 1 cm · แบบไม่มีไฟใช้หมุดหมุนธรรมดา 1.8 cm อะคริลิคหนารวม 6 mm",
    },
    {
      q: "คละลายได้ไหม?",
      a: "1-10 ชิ้น คละลายได้ไม่จำกัด · ตั้งแต่ 11 ชิ้นขึ้นไป คละได้โดยแต่ละลายต้องสั่งอย่างน้อย 5 ชิ้น ถ้าไม่ถึงจะคิดตามราคาปลีก",
    },
    {
      q: "สั่งขนาดใหญ่กว่า 10 cm ได้ไหม?",
      a: "ได้ — ชิ้นล่าง 11 cm ขึ้นไปคิดเรทราคาปลีก เพิ่ม cm ละ 25 บาท (มีไฟ) หรือ 15 บาท (ไม่มีไฟ) · ชิ้นบน เพิ่ม cm ละ 8 บาท",
    },
  ],
};

const buildData = (cur) => ({
  ...cur,
  id: PRODUCT_ID,
  slug: SLUG,
  name: NAME,
  category: "acrylic",
  emoji: "✨",
  gradient: "from-sky-100 to-cyan-200",
  rating: 5,
  sold: cur.sold ?? 0,
  hidden: true, // ยังเป็นฉบับร่าง — เจ้าของร้านตรวจแล้วค่อยเผยแพร่
  unit: "ชิ้น",
  price: 170,
  priceMin,
  priceMax,
  imageSrc: IMG["01"],
  images: IMAGES.map((i) => ({ src: url(i.file), emoji: "✨", label: i.label, gradient: "from-sky-100 to-cyan-200" })),
  description: DESCRIPTION,
  highlights: HIGHLIGHTS,
  terms: TERMS,
  tabs: TABS,
  seo: SEO,
  options,
  pricing,
  priceRates,
  tierByDesign: true,
  bulkAskQty: 200,
  savedAt: new Date().toISOString(),
});

// ── รายงาน ──────────────────────────────────────────────────────────────────
console.log(`ตาราง 2 แกน ${Object.keys(cells).length} ช่อง · ราคาชิ้นล่าง ${priceMin}-${priceMax} บาท`);
console.log("ชิ้นบน (บวกเพิ่ม): " + TOP_ALL.map((n) => `${n}cm ${topPrice(n, 0)}/${topPrice(n, 1)}/${topPrice(n, 2)}`).join(" · "));
for (const light of ["มีไฟ", "ไม่มีไฟ"]) {
  console.log(`\n${light} (ชิ้นล่าง)`);
  console.log("        " + SIZES.map((s) => String(s).padStart(5)).join(""));
  TIERS.forEach((t, i) =>
    console.log(t.label.padEnd(12) + SIZES.map((s) => String(cells[`${light}│${sz(s)}`][i]).padStart(5)).join(""))
  );
}
console.log(`\nตัวเลือก: ${options.map((o) => `${o.label} (${o.choices.length})`).join(" · ")}`);

// ── อัปโหลดรูป ──────────────────────────────────────────────────────────────
if (UPLOAD) {
  for (const img of IMAGES) {
    const src = `${CACHE}/${img.id}.png`;
    if (!existsSync(src)) {
      const r = await fetch(`${WIX}${img.id}~mv2.png`);
      if (!r.ok) throw new Error(`ดึงรูป ${img.id} ไม่ได้: ${r.status}`);
      writeFileSync(src, Buffer.from(await r.arrayBuffer()));
    }
    const buf = await sharp(src).flatten({ background: "#ffffff" }).resize(1600, 1000).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
    const key = `products/${IMG_DIR}/${img.file}-${VER}.jpg`;
    const { error } = await sb.storage.from("product-images").upload(key, buf, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`อัปโหลด ${key} ไม่ได้: ${error.message}`);
    console.log(`↑ ${key} (${Math.round(buf.length / 1024)} KB)`);
  }
}

// ── เขียน DB ────────────────────────────────────────────────────────────────
if (WRITE) {
  const { data: row, error } = await sb.from("products").select("name,data").eq("id", PRODUCT_ID).single();
  if (error) throw error;
  if (row.name !== "สินค้าใหม่" && row.name !== NAME) throw new Error(`id ${PRODUCT_ID} ตอนนี้ชื่อ "${row.name}" — ไม่ใช่สินค้าที่ตั้งใจเขียน หยุดก่อน`);
  // รูปต้องอยู่บน storage ก่อน ไม่งั้นหน้าสินค้าขึ้นรูปแตก
  for (const img of IMAGES) {
    const r = await fetch(url(img.file), { method: "HEAD" });
    if (!r.ok) throw new Error(`ยังไม่มีรูป ${url(img.file)} (${r.status}) — รัน --upload ก่อน`);
  }
  const data = buildData(row.data ?? {});
  const { error: updErr } = await sb
    .from("products")
    .update({ name: NAME, category: "acrylic", price: data.price, data })
    .eq("id", PRODUCT_ID);
  if (updErr) throw updErr;
  const { data: back } = await sb.from("products").select("name,data").eq("id", PRODUCT_ID).single();
  const bc = back.data.pricing.cells;
  if (Object.keys(bc).length !== Object.keys(cells).length || back.data.options.length !== options.length)
    throw new Error("อ่านกลับไม่ตรง");
  console.log(`\n✓ เขียนแล้ว: "${back.name}" · ${Object.keys(bc).length} ช่อง · ${back.data.images.length} รูป · hidden=${back.data.hidden} · savedAt ${back.data.savedAt}`);
} else {
  console.log("\n(ยังไม่เขียน DB — --upload อัปรูป · --write เขียนสินค้า)");
}
