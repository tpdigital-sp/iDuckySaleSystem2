/**
 * 🌈 กริ๊กต๊อก MagSafe (griptok-magsafe) — เพิ่ม "เนื้ออะคริลิคของแผ่นที่เพิ่ม" (มีโฮโลแกรม hologram-01)
 * และ "ติ่งห้อย" เลือกขนาด 2-5cm + เลือกเนื้อ/เฉดของติ่งเองได้ — พนักงานแจ้ง 21 ก.ย. 69
 * (ลูกค้าสั่ง MagSafe + เคลือบโฮโล 01 + ติ่งห้อยแบบโฮโล)
 *
 *   npx tsx scripts/griptok-magsafe-holo-charm.mts            # ดูก่อน (ไม่เขียน)
 *   npx tsx scripts/griptok-magsafe-holo-charm.mts --write    # เขียนจริง + สำรองลง backups/
 *
 * เดิมหน้าสินค้ามีแค่ แบบ / ทรง / Add On แผ่นอะคริลิค 5-10cm / เคลือบเรซิ่น / coil base
 * แผ่นที่เพิ่มจึงได้แต่เนื้อใส และไม่มีติ่งห้อยให้เลือกเลย ทั้งที่แท็บราคาเขียนไว้เองว่า "เลือกตะขอ +10"
 *
 * ราคาที่ใช้ (เจ้าของร้าน/พนักงานเคาะ 21 ก.ย. 69 — ยึดตารางของ "กริ๊บต๊อกอะคริลิค" id 1-4):
 *   เนื้อพิเศษ (โฮโลแกรม/กลิตเตอร์/สี)  1-10 ชิ้น +฿10 ทุกขนาด · 11 ชิ้นขึ้นไป 5cm +฿5 · 6-8cm +฿8 · 9-10cm +฿10
 *   ติ่งห้อย (ต่อติ่ง · 1-10 / 11-29 / 30+)  2cm 20/15/12 · 3cm 30/25/22 · 4cm 40/35/32 · 5cm 50/45/42
 *     (ฐาน 2 ซม. ใหญ่กว่านั้นบวก ซม. ละ 10 บาท — ตัวเลขชุดเดียวกับ keyring-multi-charm)
 *   เนื้อพิเศษของ "ติ่งห้อย"                 1-10 ชิ้น +฿10/ติ่ง · 11 ชิ้นขึ้นไป +฿5/ติ่ง (ชั้นเดียวกับแผ่น 5cm — ติ่งใหญ่สุด 5 ซม.)
 *
 * ⚠️ ส่วนต่างเนื้อพิเศษไม่เท่ากันทุกขนาด จึงแยกเป็น 3 กลุ่มตามช่วงขนาด (แพตเทิร์นเดียวกับ 3d-acrylic
 *    ที่แยก "ชนิดอะคริลิค · ขนาด 6cm" ออกมาเพราะ extra คนละเลข) — โชว์ทีละกลุ่มด้วย showWhen ของแกน Add On
 *    กลุ่มเฉดสี 44 เฉดใช้กลุ่มเดียวพอ เพราะฟรีทุกเฉด → showWhenAny ครอบทั้ง 3 กลุ่ม
 * ⚠️ ไม่แตะตารางราคา (data.pricing / priceRates) เลย — ของเสริมคิดผ่าน +฿ ของตัวเลือกล้วน ๆ
 *    จึงไม่โดนกับดัก "ตารางเรทแรกเก็บ 2 ที่" (ดู memory iducky-script-write-product ข้อ 7)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  groupAddOf,
  priceRange,
  unitPriceFor,
  type Product,
  type ProductOption,
  type ProductOptionChoice,
} from "../src/lib/products";
import { COLORS, acrylicColorImage } from "./acrylic-colors.mjs";

const WRITE = process.argv.includes("--write");
const ID = "griptok-magsafe";
const EXPECT_NAME = "กริ๊กต๊อก MagSafe";

const ADDON_LABEL = "เพิ่มแผ่นอะคริลิค (Add On)";
const RESIN_LABEL = "เคลือบเรซิ่นแผ่นอะคริลิค";
const SHADE_LABEL = "เลือกเฉดอะคริลิคพิเศษ (แผ่นที่เพิ่ม)";
const CHARM_LABEL = "ติ่งห้อย";
const CHARM_MAT_LABEL = "เนื้ออะคริลิคติ่งห้อย";
const CHARM_SHADE_LABEL = "เลือกเฉดอะคริลิคติ่งห้อย";
const SECTION = "3. ของเสริม + เคลือบผิว";

const CLEAR = "อะคริลิคใส";
const C02 = "อะคริลิคขาวขุ่น C-02";
const SPECIAL = "อะคริลิคพิเศษ (โฮโลแกรม/กลิตเตอร์/สี)";
const CHARM_OFF = "ไม่เพิ่ม";

/** ภาพเนื้ออะคริลิค 3 แบบ — ใช้ไฟล์ชุดเดียวกับ "กริ๊บต๊อกอะคริลิค" ลูกค้าจะได้เห็นรูปเดิมทั้งตระกูล */
const IMG_BASE = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products";
const IMG_CLEAR = `${IMG_BASE}/griptok-acrylic/acrylic-1.jpg`;
const IMG_SPECIAL = `${IMG_BASE}/griptok-acrylic/acrylic-special.jpg`;
/** ภาพการ์ดขนาดติ่งห้อย — ชุดเดียวกับ "พวงกุญแจแบบหลายชิ้น" (keyring-multi-charm) */
const charmSizeImage = (name: string) => `${IMG_BASE}/keyring-multi-charm/size-${name}-v1.jpg`;

/** ส่วนต่างเนื้อพิเศษ "ช่วงส่ง" แยกตามขนาดแผ่น — ช่วงปลีก (1-10 ชิ้น) คิด ฿10 เท่ากันหมด */
const MAT_BANDS = [
  { suffix: "5cm", sizes: ["5cm"], extra: 5 },
  { suffix: "6-8cm", sizes: ["6cm", "7cm", "8cm"], extra: 8 },
  { suffix: "9-10cm", sizes: ["9cm", "10cm"], extra: 10 },
];
const MAT_BELOW = 10;
const MAT_FROM_QTY = 11;
const matLabel = (suffix: string) => `เนื้ออะคริลิคแผ่นที่เพิ่ม (${suffix})`;

/**
 * ขั้นราคาติ่งห้อยของร้าน — ฐาน 2 ซม. แล้วใหญ่กว่านั้นบวก ซม. ละ 10 บาททุกช่วงจำนวน
 * ตัวเลขชุดเดียวกับกลุ่ม "ขนาดชิ้นที่ 2..10" ของ keyring-multi-charm (ลูกค้าจะได้ไม่เจอราคาติ่งคนละแบบในร้านเดียว)
 *   small = 1-10 ชิ้น · below = 11-29 ชิ้น · extra = 30 ชิ้นขึ้นไป
 */
const CHARM_SIZES = [
  { name: "2cm", small: 20, below: 15, extra: 12 },
  { name: "3cm", small: 30, below: 25, extra: 22 },
  { name: "4cm", small: 40, below: 35, extra: 32 },
  { name: "5cm", small: 50, below: 45, extra: 42 },
];
const CHARM_SMALL_UP_TO = 10;
const CHARM_FROM_QTY = 30;
/** เนื้อพิเศษของติ่งห้อย (ทุกขนาด 2-5cm) คิดชั้นเดียวกับแผ่น 5cm: ปลีก MAT_BELOW · ตั้งแต่ 11 ชิ้น เลขนี้ */
const CHARM_MAT_EXTRA = MAT_BANDS[0].extra;

/** ทุกเฉดในคลังสีกลาง หัก C-02 (แยกเป็นตัวเลือกหลักไปแล้ว) = 44 เฉด ชุดเดียวกับสแตนดี้/พวงกุญแจ */
const SHADES = Object.keys(COLORS).filter((n) => n !== C02);

const die = (msg: string): never => {
  console.error("✖", msg);
  process.exit(1);
};

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── กลุ่มตัวเลือกที่จะใส่ ───────────────────────────────────────────────
function matGroup(band: (typeof MAT_BANDS)[number]): ProductOption {
  const choices: ProductOptionChoice[] = [
    { name: CLEAR, popular: true, imageSrc: IMG_CLEAR },
    { name: C02, imageSrc: acrylicColorImage(C02) },
    { name: SPECIAL, extra: band.extra, extraBelow: MAT_BELOW, imageSrc: IMG_SPECIAL },
  ];
  return {
    label: matLabel(band.suffix),
    note: `เนื้อของแผ่นที่เพิ่มเท่านั้น (ตัว Griptok เป็นฐานใส) · เนื้อพิเศษ +฿${MAT_BELOW}/ชิ้น · ${MAT_FROM_QTY} ชิ้นขึ้นไป +฿${band.extra}`,
    choices,
    display: "dropdown",
    section: SECTION,
    extraFromQty: MAT_FROM_QTY,
    showWhen: { label: ADDON_LABEL, choices: band.sizes },
  };
}

function shadeGroup(): ProductOption {
  return {
    label: SHADE_LABEL,
    note: "ทุกเฉดราคาเท่ากัน (ค่าเนื้อพิเศษคิดในกลุ่มด้านบนแล้ว)",
    choices: SHADES.map((name) => ({ name, imageSrc: acrylicColorImage(name) })),
    display: "dropdown",
    section: SECTION,
    showWhenAny: MAT_BANDS.map((b) => ({ label: matLabel(b.suffix), choices: [SPECIAL] })),
  };
}

/** ติ่งห้อย = แผ่นอะคริลิคชิ้นเล็กห้อยกับแผ่นที่เพิ่ม — เลือกขนาดเองได้ ราคาเกาะขนาด */
function charmGroup(): ProductOption {
  /**
   * ป้าย +฿ บนปุ่มบอกราคาช่วงปลีกของแต่ละขนาดอยู่แล้ว — คำอธิบายจึงเหลือแค่ "สั่งเยอะลดเท่าไหร่"
   * ส่วนลดเท่ากันทุกขนาด (−5 ที่ 11 ชิ้น · −8 ที่ 30 ชิ้น) assert ไว้ ถ้าวันหลังตารางเปลี่ยนจะได้รู้
   */
  const off1 = CHARM_SIZES[0].small - CHARM_SIZES[0].below;
  const off2 = CHARM_SIZES[0].small - CHARM_SIZES[0].extra;
  if (CHARM_SIZES.some((s) => s.small - s.below !== off1 || s.small - s.extra !== off2))
    die("ส่วนลดติ่งห้อยไม่เท่ากันทุกขนาดแล้ว — ต้องเขียนคำอธิบายใหม่ (เขียนสั้นแบบ 'ลดติ่งละ' ไม่ได้)");
  return {
    label: CHARM_LABEL,
    note: `ห้อยกับแผ่นที่เพิ่ม เลือกเนื้อ/เฉดแยกได้ · ${CHARM_SMALL_UP_TO + 1} ชิ้นขึ้นไป ลดติ่งละ ฿${off1} · ${CHARM_FROM_QTY} ชิ้นขึ้นไป ลดติ่งละ ฿${off2}`,
    choices: [
      { name: CHARM_OFF },
      ...CHARM_SIZES.map((s) => ({
        name: s.name,
        desc: `ด้านที่ยาวที่สุด ${s.name.replace("cm", "")} ซม. (ลายจะพอดีกรอบ ${s.name.replace("cm", "")} × ${s.name.replace("cm", "")} ซม.)`,
        extra: s.extra,
        extraBelow: s.below,
        extraSmall: s.small,
        imageSrc: charmSizeImage(s.name),
      })),
    ],
    section: SECTION,
    extraFromQty: CHARM_FROM_QTY,
    extraSmallUpToQty: CHARM_SMALL_UP_TO,
    showWhen: { label: ADDON_LABEL, choices: MAT_BANDS.flatMap((b) => b.sizes) },
  };
}

/**
 * เนื้อของ "ติ่งห้อย" เอง — แยกจากแผ่นที่เพิ่มได้ (ลูกค้าขอแผ่นใส + ติ่งโฮโล หรือกลับกันก็ได้)
 * เนื้อพิเศษคิดเพิ่มชั้นเดียวกับแผ่น 5cm (พนักงานเคาะ 21 ก.ย. 69) — ติ่งใหญ่สุด 5 ซม. จึงอยู่ในชั้นนั้นทั้งหมด
 * ⚠️ ต่างจาก keyring-multi-charm ที่ "ประเภทอะคริลิค ชิ้นที่ 2..10" ยังฟรีอยู่ — ที่นั่นยังไม่ได้แก้
 */
function charmMatGroup(): ProductOption {
  return {
    label: CHARM_MAT_LABEL,
    note: `เลือกคนละแบบกับแผ่นได้ · เนื้อพิเศษ +฿${MAT_BELOW}/ติ่ง · ${MAT_FROM_QTY} ชิ้นขึ้นไป +฿${CHARM_MAT_EXTRA}`,
    choices: [
      { name: CLEAR, popular: true, imageSrc: IMG_CLEAR },
      { name: C02, imageSrc: acrylicColorImage(C02) },
      { name: SPECIAL, extra: CHARM_MAT_EXTRA, extraBelow: MAT_BELOW, imageSrc: IMG_SPECIAL },
    ],
    display: "dropdown",
    section: SECTION,
    extraFromQty: MAT_FROM_QTY,
    showWhen: { label: CHARM_LABEL, choices: CHARM_SIZES.map((s) => s.name) },
  };
}

function charmShadeGroup(): ProductOption {
  return {
    label: CHARM_SHADE_LABEL,
    note: "ทุกเฉดราคาเท่ากัน",
    choices: SHADES.map((name) => ({ name, imageSrc: acrylicColorImage(name) })),
    display: "dropdown",
    section: SECTION,
    showWhen: { label: CHARM_MAT_LABEL, choices: [SPECIAL] },
  };
}

/** กลุ่มที่สคริปต์นี้เป็นเจ้าของ — รันซ้ำ = เขียนทับชุดเดิม ไม่ใช่ต่อท้ายซ้ำ */
const OWNED = [
  ...MAT_BANDS.map((b) => matLabel(b.suffix)),
  SHADE_LABEL,
  CHARM_LABEL,
  CHARM_MAT_LABEL,
  CHARM_SHADE_LABEL,
];

// ── แท็บข้อความ ─────────────────────────────────────────────────────────
const TAB_OLD_HOOK = '• ช่วงปลีกของ Add On บนเว็บระบุไว้ว่า "1-10 ชิ้น (เลือกตะขอ +10)"';
const TAB_MAT_LINE =
  "• แผ่นอะคริลิคที่เพิ่ม เลือกเนื้อได้ — ใส / ขาวขุ่น C-02 / พิเศษ (โฮโลแกรม hologram-01 · กลิตเตอร์ · สี รวม 44 เฉด) · เนื้อพิเศษเพิ่ม 1-10 ชิ้น ชิ้นละ 10 บาท · 11 ชิ้นขึ้นไป 5cm 5 บาท · 6-8cm 8 บาท · 9-10cm 10 บาท";
const TAB_CHARM_LINE =
  "• ติ่งห้อย — แผ่นอะคริลิคชิ้นเล็กห้อยกับแผ่นที่เพิ่ม เลือกขนาด 2cm / 3cm / 4cm / 5cm และเลือกเนื้อ+เฉดของติ่งแยกจากแผ่นได้ (รวมโฮโลแกรม) · ราคาต่อติ่ง 1-10 ชิ้น / 11-29 ชิ้น / 30 ชิ้นขึ้นไป: 2cm 20/15/12 · 3cm 30/25/22 · 4cm 40/35/32 · 5cm 50/45/42 บาท · เนื้อพิเศษของติ่งเพิ่ม 1-10 ชิ้น ติ่งละ 10 บาท · 11 ชิ้นขึ้นไป ติ่งละ 5 บาท";
const PRICE_MAT_LINE =
  "• เนื้ออะคริลิคพิเศษ (โฮโลแกรม/กลิตเตอร์/สี) ของแผ่นที่เพิ่ม — 1-10 ชิ้น +10 บาท/ชิ้น · 11 ชิ้นขึ้นไป 5cm +5 · 6-8cm +8 · 9-10cm +10";
const PRICE_CHARM_LINE =
  "• ติ่งห้อย (ต่อติ่ง · ช่วง 1-10 ชิ้น / 11-29 ชิ้น / 30 ชิ้นขึ้นไป) — 2cm 20/15/12 · 3cm 30/25/22 · 4cm 40/35/32 · 5cm 50/45/42 บาท · ฐาน 2 ซม. ใหญ่กว่านั้นบวก ซม. ละ 10 บาท"
const PRICE_CHARM_MAT_LINE =
  "• เนื้ออะคริลิคพิเศษ (โฮโลแกรม/กลิตเตอร์/สี) ของติ่งห้อย — 1-10 ชิ้น +10 บาท/ติ่ง · 11 ชิ้นขึ้นไป +5 บาท/ติ่ง";
const HIGHLIGHT =
  "แผ่นอะคริลิคที่เพิ่ม เลือกเนื้อโฮโลแกรม/กลิตเตอร์/สีได้ 44 เฉด · เพิ่มติ่งห้อย 2-5cm เลือกเนื้อเองได้✨";

/** บรรทัด/ไฮไลต์รุ่นก่อนที่สคริปต์นี้เคยเขียนไว้ — รันรอบใหม่ต้องกวาดทิ้งก่อน ไม่งั้นข้อความขัดกันเอง */
const LEGACY_LINES = [
  "• ติ่งห้อย — เจาะติ่งบนแผ่นอะคริลิคที่เพิ่ม (เนื้อเดียวกับแผ่น) 1-10 ชิ้น ชิ้นละ 20 บาท · 11-29 ชิ้น ชิ้นละ 15 บาท · 30 ชิ้นขึ้นไป ชิ้นละ 12 บาท",
  "• ติ่งห้อย (บนแผ่นอะคริลิคที่เพิ่ม) — 1-10 ชิ้น 20 บาท/ชิ้น · 11-29 ชิ้น 15 บาท/ชิ้น · 30 ชิ้นขึ้นไป 12 บาท/ชิ้น",
  "• ติ่งห้อย — แผ่นอะคริลิคชิ้นเล็กห้อยกับแผ่นที่เพิ่ม เลือกขนาด 2cm / 3cm / 4cm / 5cm และเลือกเนื้อ+เฉดของติ่งแยกจากแผ่นได้ (รวมโฮโลแกรม ไม่บวกเพิ่ม) · ราคาต่อติ่ง 1-10 ชิ้น / 11-29 ชิ้น / 30 ชิ้นขึ้นไป: 2cm 20/15/12 · 3cm 30/25/22 · 4cm 40/35/32 · 5cm 50/45/42 บาท",
  "• ติ่งห้อย (ต่อติ่ง · ช่วง 1-10 ชิ้น / 11-29 ชิ้น / 30 ชิ้นขึ้นไป) — 2cm 20/15/12 · 3cm 30/25/22 · 4cm 40/35/32 · 5cm 50/45/42 บาท · ฐาน 2 ซม. ใหญ่กว่านั้นบวก ซม. ละ 10 บาท · เนื้อพิเศษของติ่งไม่บวกเพิ่ม",
];
const LEGACY_HIGHLIGHTS = ["แผ่นอะคริลิคที่เพิ่ม เลือกเนื้อโฮโลแกรม/กลิตเตอร์/สีได้ 44 เฉด · เพิ่มติ่งห้อยได้✨"];

/** แก้ข้อความแท็บแบบรันซ้ำได้ — บรรทัดที่มีอยู่แล้วไม่เติมซ้ำ */
function patchTabs(tabs: Product["tabs"]): Product["tabs"] {
  return (tabs ?? []).map((t) => {
    let text = t.text ?? "";
    for (const old of LEGACY_LINES) text = text.replace(`\n${old}`, "").replace(old, "");
    if (t.title === "รายละเอียดเพิ่มเติม") {
      // บรรทัดเก่าอ้าง "เลือกตะขอ +10" ซึ่งขัดกับราคาติ่งห้อยจริง (20/15/12) — แทนที่ด้วยของจริง 2 บรรทัด
      if (text.includes(TAB_OLD_HOOK)) text = text.replace(TAB_OLD_HOOK, `${TAB_MAT_LINE}\n${TAB_CHARM_LINE}`);
      else {
        if (!text.includes(TAB_MAT_LINE)) text = text.replace(/\n• Magsafe coil base/, `\n${TAB_MAT_LINE}\n• Magsafe coil base`);
        if (!text.includes(TAB_CHARM_LINE)) text = text.replace(/\n• Magsafe coil base/, `\n${TAB_CHARM_LINE}\n• Magsafe coil base`);
      }
    }
    if (t.title === "ราคาแต่ละแบบ") {
      for (const line of [PRICE_MAT_LINE, PRICE_CHARM_LINE, PRICE_CHARM_MAT_LINE]) {
        if (!text.includes(line)) text = `${text.replace(/\s+$/, "")}\n${line}`;
      }
    }
    return { ...t, text };
  });
}

// ── ประกอบของใหม่ ───────────────────────────────────────────────────────
const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) die(`อ่านสินค้าไม่ได้: ${error.message}`);
const product = row!.data as Product;
if (product.name !== EXPECT_NAME) die(`ชื่อสินค้าไม่ตรงที่คาด (ได้ "${product.name}") — หยุดไว้ก่อน กันเขียนผิดตัว`);

const before: ProductOption[] = product.options ?? [];
const addon = before.find((o) => o.label === ADDON_LABEL) ?? die(`ไม่เจอกลุ่ม "${ADDON_LABEL}"`);
const addonSizes = addon.choices.map((c) => c.name);
for (const b of MAT_BANDS)
  for (const s of b.sizes) if (!addonSizes.includes(s)) die(`กลุ่ม Add On ไม่มีตัวเลือก "${s}" แล้ว — เงื่อนไข showWhen จะตาย`);

/**
 * เรียงใหม่ (พนักงานสั่ง 21 ก.ย. 69): Add On → เนื้อแผ่น 3 กลุ่ม → เฉดแผ่น
 * → ติ่งห้อย → เนื้อติ่ง → เฉดติ่ง → เคลือบเรซิ่น → ที่เหลือ (coil base)
 * คือ "คุยเรื่องชิ้นงานให้จบก่อน แล้วค่อยเคลือบผิว"
 */
const kept = before.filter((o) => !OWNED.includes(o.label));
const options: ProductOption[] = [];
for (const o of kept) {
  options.push(o);
  if (o.label === ADDON_LABEL)
    options.push(...MAT_BANDS.map(matGroup), shadeGroup(), charmGroup(), charmMatGroup(), charmShadeGroup());
}
if (!options.some((o) => o.label === CHARM_LABEL)) die(`ไม่เจอกลุ่ม "${ADDON_LABEL}" — ไม่รู้จะวางติ่งห้อยตรงไหน`);
const at = (label: string) => options.findIndex((o) => o.label === label);
if (at(CHARM_LABEL) > at(RESIN_LABEL)) die("ลำดับผิด — ติ่งห้อยต้องมาก่อนเคลือบเรซิ่น");

const highlights = [...(product.highlights ?? [])].filter((h) => h && !LEGACY_HIGHLIGHTS.includes(h));
if (!highlights.includes(HIGHLIGHT)) {
  const at = highlights.findIndex((h) => h.includes("เสริมแผ่นอะคริลิคไดคัท"));
  highlights.splice(at >= 0 ? at + 1 : highlights.length, 0, HIGHLIGHT);
}

const next: Product = { ...product, options, highlights, tabs: patchTabs(product.tabs) };
const range = priceRange(next);
next.priceMin = range.min;
next.priceMax = range.max;
next.savedAt = new Date().toISOString();

// ── ด่านคิดเงิน: ต้องได้ตรงตารางที่เคาะไว้ ก่อนจะยอมเขียน ──────────────
const base = { แบบ: "แบบ A (สำเร็จรูป)", ทรง: "ทรงกลม (Circle)" };
const check = (sel: Record<string, string>, qty: number, label: string, want: number) => {
  const opt = next.options!.find((o) => o.label === label)!;
  const got = groupAddOf(opt, sel, qty);
  const tag = `${label} @ ${qty} ชิ้น`;
  if (got !== want) die(`${tag}: คิดได้ ฿${got} แต่ต้องเป็น ฿${want}`);
  console.log(`  ✓ ${tag} = +฿${got}`);
};
console.log("ตรวจการคิดเงิน:");
for (const b of MAT_BANDS) {
  const label = matLabel(b.suffix);
  const sel = { ...base, [ADDON_LABEL]: b.sizes[0], [label]: SPECIAL };
  check(sel, 1, label, MAT_BELOW);
  check(sel, 10, label, MAT_BELOW);
  check(sel, 11, label, b.extra);
  check(sel, 500, label, b.extra);
  check({ ...sel, [label]: CLEAR }, 11, label, 0);
}
for (const s of CHARM_SIZES) {
  const sel = { ...base, [ADDON_LABEL]: "5cm", [CHARM_LABEL]: s.name };
  check(sel, 1, CHARM_LABEL, s.small);
  check(sel, CHARM_SMALL_UP_TO, CHARM_LABEL, s.small);
  check(sel, CHARM_SMALL_UP_TO + 1, CHARM_LABEL, s.below);
  check(sel, CHARM_FROM_QTY - 1, CHARM_LABEL, s.below);
  check(sel, CHARM_FROM_QTY, CHARM_LABEL, s.extra);
}
check({ ...base, [ADDON_LABEL]: "5cm", [CHARM_LABEL]: CHARM_OFF }, 1, CHARM_LABEL, 0);
// เนื้อพิเศษของติ่งห้อย — ชั้นเดียวกับแผ่น 5cm (ปลีก MAT_BELOW · ตั้งแต่ 11 ชิ้น CHARM_MAT_EXTRA)
for (const s of CHARM_SIZES) {
  const sel = { ...base, [ADDON_LABEL]: "5cm", [CHARM_LABEL]: s.name, [CHARM_MAT_LABEL]: SPECIAL };
  check(sel, 1, CHARM_MAT_LABEL, MAT_BELOW);
  check(sel, MAT_FROM_QTY, CHARM_MAT_LABEL, CHARM_MAT_EXTRA);
  check({ ...sel, [CHARM_MAT_LABEL]: CLEAR }, 1, CHARM_MAT_LABEL, 0);
}

/** ของจริงที่ลูกค้ารายนี้สั่ง: MagSafe + แผ่นโฮโล 01 + ติ่งห้อยแบบโฮโล */
const order = {
  ...base,
  [ADDON_LABEL]: "7cm",
  [matLabel("6-8cm")]: SPECIAL,
  [SHADE_LABEL]: "hologram-01",
  [CHARM_LABEL]: "2cm",
  [CHARM_MAT_LABEL]: SPECIAL,
  [CHARM_SHADE_LABEL]: "hologram-01",
};
for (const qty of [1, 11, 30, 100]) {
  const addOns: { label: string; choice: string; amount: number }[] = [];
  const unit = unitPriceFor(next, order, qty, addOns);
  console.log(
    `  💰 แบบ A ทรงกลม + แผ่น 7cm hologram-01 + ติ่งห้อย 2cm hologram-01 @ ${qty} ชิ้น = ฿${unit}/ชิ้น` +
      ` (${addOns.map((a) => `${a.label} +฿${a.amount}`).join(" · ") || "ไม่มีของเสริม"})`
  );
}

console.log(
  `\nกลุ่มตัวเลือก ${before.length} → ${options.length} กลุ่ม` +
    `\n  เพิ่ม: ${OWNED.join(" · ")}` +
    `\n  เฉดสี ${SHADES.length} เฉด (มี hologram-01: ${SHADES.includes("hologram-01") ? "ใช่" : "ไม่!"})` +
    `\n  ช่วงราคา ${product.priceMin}-${product.priceMax} → ${next.priceMin}-${next.priceMax}`
);
if (SHADES.length !== 44) die(`เฉดสีควรได้ 44 เฉด แต่ได้ ${SHADES.length}`);
if (SHADES.some((n) => !acrylicColorImage(n)?.startsWith("https://"))) die("มีเฉดสีที่ไม่มีรูปในคลังกลาง");

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อเขียนจริง)");
  process.exit(0);
}

mkdirSync("backups", { recursive: true });
const backup = `backups/griptok-magsafe-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(backup, JSON.stringify(row, null, 2));
console.log("สำรองของเดิมไว้ที่", backup);

const { data: wrote, error: e2 } = await sb.from("products").update({ data: next }).eq("id", ID).select("data");
if (e2) die(`เขียนไม่สำเร็จ: ${e2.message}`);
if (!wrote?.length) die("เขียนแล้วแต่ไม่โดนสักแถว");

// อ่านกลับมาเทียบของจริง (update ที่ไม่ error ยังลงไม่จริงได้ — ดู memory iducky-script-write-product ข้อ 4)
const { data: backRow } = await sb.from("products").select("data").eq("id", ID).single();
const back = backRow!.data as Product;
if (back.savedAt !== next.savedAt) die(`อ่านกลับแล้ว savedAt ไม่ตรง (${String(back.savedAt)})`);
for (const label of OWNED) {
  const g = back.options?.find((o) => o.label === label);
  if (!g?.choices?.length) die(`อ่านกลับแล้วไม่เจอกลุ่ม "${label}"`);
}
const backShade = back.options!.find((o) => o.label === SHADE_LABEL)!;
if (backShade.choices.length !== 44) die(`อ่านกลับแล้วเฉดสีเหลือ ${backShade.choices.length}`);
if (!backShade.choices.some((c) => c.name === "hologram-01" && typeof c.imageSrc === "string" && c.imageSrc.startsWith("https://")))
  die("อ่านกลับแล้ว hologram-01 ไม่มีรูป");
const backCharm = back.options!.find((o) => o.label === CHARM_LABEL)!;
for (const s of CHARM_SIZES) {
  const c = backCharm.choices.find((x) => x.name === s.name);
  if (c?.extraSmall !== s.small || c?.extraBelow !== s.below || c?.extra !== s.extra)
    die(`อ่านกลับแล้วราคาติ่งห้อย ${s.name} ไม่ตรง (${JSON.stringify(c)})`);
  if (typeof c.imageSrc !== "string" || !c.imageSrc.startsWith("https://")) die(`ติ่งห้อย ${s.name} ไม่มีรูป`);
}
if (backCharm.smallQtyFee) die("อ่านกลับแล้วยังมี smallQtyFee ค้าง — ราคาติ่งจะถูกเหมาทับขนาด");
const backCharmMat = back.options!.find((o) => o.label === CHARM_MAT_LABEL)!;
const backCharmSpecial = backCharmMat.choices.find((c) => c.name === SPECIAL);
if (backCharmSpecial?.extra !== CHARM_MAT_EXTRA || backCharmSpecial?.extraBelow !== MAT_BELOW)
  die(`อ่านกลับแล้วค่าเนื้อพิเศษของติ่งห้อยไม่ตรง (${JSON.stringify(backCharmSpecial)})`);
if (backCharmMat.extraFromQty !== MAT_FROM_QTY) die("อ่านกลับแล้วเกณฑ์ช่วงส่งของเนื้อติ่งห้อยไม่ตรง");
const backCharmShade = back.options!.find((o) => o.label === CHARM_SHADE_LABEL)!;
if (backCharmShade.choices.length !== 44) die(`อ่านกลับแล้วเฉดติ่งห้อยเหลือ ${backCharmShade.choices.length}`);
if (back.tabs?.some((t) => LEGACY_LINES.some((l) => (t.text ?? "").includes(l)))) die("อ่านกลับแล้วยังมีบรรทัดติ่งห้อยรุ่นเก่าค้าง");
if (!back.tabs?.some((t) => (t.text ?? "").includes(TAB_CHARM_LINE))) die("อ่านกลับแล้วแท็บยังไม่มีบรรทัดติ่งห้อย");

console.log("✅ เขียนแล้ว + อ่านกลับตรงทุกข้อ — เปิดดูที่ /products/GRIPTOK-MAGSAFE?v=" + Date.now());
