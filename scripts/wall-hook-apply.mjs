#!/usr/bin/env node
/**
 * "ตะขอแขวนผนังอะคริลิค" (otheracrylicproducts3-5) — ดึงราคาจากเว็บตารางราคา + อัปภาพขึ้น storage
 *
 *   node scripts/wall-hook-art.mjs             # วาด/ครอปภาพตัวเลือกก่อน (.cache/wall-hook/upload)
 *   node scripts/wall-hook-apply.mjs           # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/wall-hook-apply.mjs --write
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/otheracrylicproducts3
 *   ตารางใต้หัวข้อ "ตะขอแขวนผนัง อะคริลิค" (หน้านั้นมี 6 ตาราง หัวคอลัมน์ "จำนวน | ราคา" เหมือนกันหมด
 *   จึงยึดหัวข้อที่อยู่เหนือตาราง ไม่ใช่ลำดับตาราง) · สคริปต์อ่านสดทุกครั้ง ราคาเปลี่ยนเมื่อไหร่รันซ้ำได้เลย
 *
 * ทำไมใช้ id เดิมไม่สร้างตัวใหม่: otheracrylicproducts3-5 คือแถวที่หน้านำเข้าดูดตารางนี้เข้ามาแล้ว
 * (ชื่อเพี้ยนเป็น "อะคริลิค" เพราะตัวดูดชื่อหยิบข้อความก้อนสุดท้ายก่อนตาราง) ยังเป็นฉบับร่าง ไม่เคยเปิดขาย
 * ใช้ id เดิมแล้วเปลี่ยนชื่อ = รายงานเทียบเว็บตารางราคา (pricelist-audit) ยังจับคู่ถูก ไม่มีตัวซ้ำค้างไว้
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { HOOK_COLORS, SIZES, sizeExtra } from "./wall-hook-art.mjs";
import { COLORS, acrylicColorImage } from "./acrylic-colors.mjs";

const WRITE = process.argv.includes("--write");
const ID = "otheracrylicproducts3-5";
const DIR = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1] || ".cache/wall-hook/upload";
const PAGE = "https://www.iduckyofficial-pricelists.com/otheracrylicproducts3";
const SECTION = "ตะขอแขวนผนัง";
const NAME = "ตะขอแขวนผนังอะคริลิค";
const V = "v1";

/** ชื่อเดิมที่ยอมให้ทับได้ — กันเผลอรันทับสินค้าตัวอื่นถ้า id ถูกใช้ซ้ำวันหลัง */
const EXPECT_NAMES = ["อะคริลิค", NAME];

const SIZE_LABEL = "ขนาด";
const SHEET_LABEL = "สีอะคริลิค";
const HOOK_LABEL = "สีตะขอแขวน";

const PICK_LABEL = "เลือกสีพิเศษ";

/**
 * "สีอะคริลิค" ใช้ชื่อชุดเดียวกับสินค้าสแตนดี้ (standy) ทั้งร้านจะได้เรียกเหมือนกัน
 * ภาพเป็น "รูปเนื้ออะคริลิคจริง" ไม่ใช่ภาพงานพิมพ์ —
 *   C-02 ใช้ไฟล์จากคลังสีกลาง products/acrylic-colors/ ตรง ๆ (ที่เดียวกับพวงกุญแจ/สแตนดี้ใช้)
 *   ใส / สีพิเศษ คลังกลางไม่มีช่องให้ (ใสถ่ายเป็นช่องสีไม่ได้ · สีพิเศษเป็นภาพรวมหลายสี) → wall-hook-art.mjs ทำให้
 */
const SHEETS = [
  { name: "อะคริลิคใส", local: "sheet-clear", popular: true },
  { name: "อะคริลิคขาวขุ่น C-02", shared: true },
  { name: "สีพิเศษ (โฮโลแกรม/กลิสเตอร์/สี)", local: "sheet-special" },
];
const SHEET_SPECIAL = SHEETS[2].name;

/**
 * รายชื่อ "สีพิเศษ" ให้เลือกต่อ = ทุกสีในคลังสีกลาง หัก C-02 (แยกเป็นตัวเลือกหลักไปแล้ว)
 * ได้ 44 สี ลำดับเดียวกับกลุ่ม "เลือกสีพิเศษ" ของสแตนดี้+คลิปหนีบ — ลูกค้าเห็นลิสต์เดียวกันทั้งร้าน
 * ไม่ต้องใส่ +฿ ตรงนี้ เพราะส่วนต่างสีพิเศษฝังอยู่ในช่องตารางราคาแล้ว (ใส่ซ้ำ = คิดเงินสองรอบ)
 */
const SPECIAL_COLORS = Object.keys(COLORS).filter((n) => n !== "อะคริลิคขาวขุ่น C-02");

/**
 * ตาราง "Add on อะคริลิคพิเศษ" ชุดกลางของร้าน (หน้า pricelists "พวงกุญแจ notprint")
 *   เรทราคาปลีก : 2-10cm = 10 ทุกขนาด
 *   เรทราคาส่ง  : 2-5cm = 5 · 6-8cm = 8 · 9-10cm = 10
 * ปลีก = ช่วงจำนวนแรก (1-10 อัน) · ส่ง = ช่วงถัดไปทั้งหมด — วิธีคิดเดียวกับสแตนดี้/พวงกุญแจ
 * ที่ฝังส่วนต่างลงในช่องราคาเลย ไม่ได้ตั้งเป็น +฿ ของตัวเลือก (เพราะมันขึ้นกับทั้งขนาดและช่วงจำนวน)
 */
const specialExtra = (cm, tierIndex) => (tierIndex === 0 ? 10 : cm <= 5 ? 5 : cm <= 8 ? 8 : 10);

/**
 * รูปในแกลเลอรี (id ของ wixstatic จากท่อน "ตะขอแขวนผนัง อะคริลิค" บนหน้าเว็บ)
 * ⚠️ ได้แค่ 5 รูป — หน้าแก้ไขสินค้าหลังบ้านตัดที่ MAX_PHOTOS = 5 ตอนโหลดเข้าฟอร์ม
 *    ใส่เกินไว้ = ทีมงานเปิดหน้าแก้ไขแล้วกดบันทึกครั้งเดียว รูปส่วนเกินหายเงียบ ๆ
 * รูปที่ตัดออกจากท่อนนี้: อนิเมะตะขอดำ · โคลสอัพโซ่ห้อย · เทียบขนาดกับมือ
 * (ภาพประจำตัวเลือกอีก 19 ภาพไม่นับรวมตรงนี้ — หน้าร้านดึงขึ้นแกลเลอรีให้เองตอนลูกค้ากดเลือก)
 */
const PHOTOS = [
  ["photo-diecut", "959b83_3afa038b6a92411abcec59244c8f5767~mv2.jpg", "งานจริง — ตัดตามรูป ตะขอสีขาว/เหลือง/ดำ"],
  ["photo-wall", "959b83_e4e6f6c5b0ca4e95ad6394aa7b136cb5~mv2.jpg", "งานจริง — ติดผนัง แขวนของใช้ในบ้าน"],
  ["photo-rail", "959b83_238a3ea4af8846b098ec0906a6bae9bb~mv2.jpg", "งานจริง — ติดราวไม้ ทรงกลม/ทรงป้าย"],
  ["photo-square", "959b83_33f0d6ad4182438a9000afc818ebdda0~mv2.jpg", "งานจริง — ทรงสี่เหลี่ยม ตะขอสีชมพู"],
  ["photo-colorchart", "959b83_4edf8633b08a43f99a9015bd7865cb0d~mv2.jpg", "สีตะขอให้เลือก 7 สี (H01-H07) · ตะขอ 3 × 5.5 ซม."],
];

/* ── 1. ดึงตารางราคาจากเว็บ ──────────────────────────────────────── */
const decode = (s) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s) => decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const html = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } }).then((r) => {
  if (!r.ok) throw new Error(`ดึงหน้า ${PAGE} ไม่ได้ — HTTP ${r.status}`);
  return r.text();
});

/** ตารางแรกที่อยู่ถัดจากหัวข้อ "ตะขอแขวนผนัง" (ต้องชิดกัน ไม่เกิน 2000 ตัวอักษร) */
function sectionTable() {
  for (let i = html.indexOf(SECTION); i >= 0; i = html.indexOf(SECTION, i + 1)) {
    // หน้านั้นมี "ตะขอแขวน สูญญากาศ" อยู่ด้วย — ตัวนั้นขายเป็นเซ็ต หัวคอลัมน์เป็น "ราคาต่อเซ็ต" จึงคัดออกได้
    const t = html.indexOf("<table", i);
    if (t < 0 || t - i > 2000) continue;
    const end = html.indexOf("</table>", t);
    const rows = [...html.slice(t, end).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
      [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
    );
    if (rows.length > 1 && rows[0][0] === "จำนวน" && rows[0][1] === "ราคา" && /อัน/.test(rows[1][0])) return rows;
  }
  throw new Error(`หาตารางใต้หัวข้อ "${SECTION}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
}

const rows = sectionTable();
/** "1-10 อัน" → { upTo: 10 } · "500 อันขึ้นไป" → { upTo: null } */
const tiers = rows.slice(1).map((r) => {
  const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: r[0] };
});
tiers.at(-1).upTo = null; // ขั้นสุดท้ายเปิดปลายเสมอ
const prices = rows.slice(1).map((r) => {
  const n = Number(String(r[1]).replace(/[^\d]/g, ""));
  if (!n) throw new Error(`ช่องราคาแถว "${r[0]}" อ่านไม่ออก ("${r[1]}")`);
  return n;
});
if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ — ตรวจก่อน");

console.log(`📊 ตาราง "${SECTION} อะคริลิค" จากเว็บ · ${tiers.length} ช่วงจำนวน`);
console.log(`   ${tiers.map((t, i) => `${t.label} = ฿${prices[i]}`).join(" · ")}`);

/**
 * กางเป็นตารางราคา 2 แกน: ขนาด × สีอะคริลิค
 *   ราคาช่อง = ราคาตามจำนวนจากเว็บ + ค่าเพิ่มขนาด (เกิน 6 ซม. ซม.ละ 10) + ค่าอะคริลิคพิเศษ (ตามตารางกลาง)
 * ทำแบบเดียวกับสแตนดี้/พวงกุญแจ — ค่าอะคริลิคพิเศษขึ้นกับ "ขนาด" และ "ช่วงจำนวน" พร้อมกัน
 * ตั้งเป็น +฿ ของตัวเลือกไม่ได้ (ตัวเลือกมี +฿ ค่าเดียว แยกได้แค่ปลีก/ส่ง ไม่แยกตามขนาด)
 */
const cells = {};
for (const cm of SIZES)
  for (const s of SHEETS)
    cells[`${cm}cm│${s.name}`] = prices.map(
      (p, ti) => p + sizeExtra(cm) + (s.name === SHEET_SPECIAL ? specialExtra(cm, ti) : 0)
    );
const pricing = { unit: "อัน", cells, tiers, driverLabels: [SIZE_LABEL, SHEET_LABEL] };
const allPrices = Object.values(cells).flat();
console.log(`   → กางเป็น ${SIZES.length} ขนาด × ${SHEETS.length} สีอะคริลิค = ${Object.keys(cells).length} ช่อง`);
console.log(`   ตย. 6cm ใส = ${cells[`6cm│${SHEETS[0].name}`].join("/")}`);
console.log(`       6cm พิเศษ = ${cells[`6cm│${SHEET_SPECIAL}`].join("/")}   (ปลีก +10 · ส่ง +8)`);
console.log(`       10cm พิเศษ = ${cells[`10cm│${SHEET_SPECIAL}`].join("/")}  (เพิ่มขนาด +40 · พิเศษ ปลีก +10 · ส่ง +10)`);

/* ── 2. อัปภาพ + เขียนสินค้า ─────────────────────────────────────── */
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
const url = (file) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

/** อัปไฟล์เดียว — ต่อ .jpg ให้เอง เว้นแต่ส่งนามสกุลมา (ภาพสีอะคริลิคเป็น .png ที่มีพื้นหลังโปร่ง แปลงเป็น jpg ไม่ได้) */
async function put(name, buf, ext = "jpg") {
  const file = `${name}.${ext}`;
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${file}`, buf, { contentType: ext === "png" ? "image/png" : "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

// รูปงานจริง — ดึงจาก wixstatic แล้วอัปเข้า storage ของเราเอง (เว็บ Wix เปลี่ยนลิงก์เมื่อไหร่ก็ไม่พัง)
// ชื่อไฟล์ตั้งตาม "รูปอะไร" ไม่ใช่ลำดับ — สลับ/ตัดรูปทีหลังแล้วไม่ไปทับไฟล์เดิมที่ CDN แคชค้างไว้
const gallery = [];
for (const [file, wixId, label] of PHOTOS) {
  const res = await fetch(`https://static.wixstatic.com/media/${wixId}/v1/fill/w_1200,h_1200,al_c,q_88/file.jpg`);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  gallery.push({ emoji: "🪝", gradient: "from-sky-100 to-cyan-100", label, src: await put(`${file}-${V}`, buf) });
}
console.log(`🖼  รูปงานจริง ${gallery.length} ภาพ (จากท่อน "${SECTION}" บนเว็บ)`);

// ภาพประจำตัวเลือก — วาด/ครอปไว้แล้วโดย wall-hook-art.mjs
const local = (f) => readFileSync(`${DIR}/${f}.jpg`);
const art = {};
for (const f of [
  ...SIZES.map((cm) => `size-${cm}`),
  ...Object.keys(HOOK_COLORS).map((c) => `hook-${c}`),
  ...SHEETS.filter((s) => s.local).map((s) => s.local),
])
  art[f] = await put(`${f}-${V}`, local(f));

// สีพิเศษทั้ง 44 สี ใช้ภาพจากคลังสีกลางตรง ๆ — ไม่ก๊อปมา เพราะคลังนั้นมีสคริปต์ดูแลอยู่แล้ว
// (scripts/acrylic-colors.mjs · ชาร์ตออกรุ่นใหม่เมื่อไหร่ ทุกสินค้าที่อ้างอยู่ได้ภาพใหม่พร้อมกัน)
const missing = SPECIAL_COLORS.filter((n) => !acrylicColorImage(n));
if (missing.length) throw new Error(`คลังสีกลางไม่มีภาพของ: ${missing.join(", ")}`);
console.log(
  `🖼  ภาพตัวเลือก ${Object.keys(art).length} ภาพของตัวเอง (${SIZES.length} ขนาด + 7 สีตะขอ + 2 สีอะคริลิค)` +
    ` · อีก ${SPECIAL_COLORS.length + 1} ภาพอ้างคลังสีกลาง acrylic-colors/`
);

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้า ${ID} ไม่ได้ — ${error.message}`);
const d = structuredClone(row.data);
if (!EXPECT_NAMES.includes(d.name)) throw new Error(`${ID} ชื่อ "${d.name}" ไม่ใช่แถวที่ตั้งใจแก้ — ตรวจก่อน`);

d.name = NAME;
d.slug = NAME;
d.category = "acrylic";
d.emoji = "🪝";
d.gradient = "from-sky-100 to-cyan-100";
d.price = prices[0];
d.unit = "อัน";
d.pricing = pricing;
/** เว็บเขียนไว้ว่า "1-10 อัน คละลายได้" · "11 อันขึ้นไป คละลาย 5 อัน ต่อแบบ" */
d.priceRates = [{ id: "r1", label: "เรทมาตรฐาน", freeMixBelowQty: 11, minPerDesign: 5, pricing }];
delete d.tierByDesign;

// ลำดับสองกลุ่มแรกต้องตรงกับ pricing.driverLabels (ขนาด → สีอะคริลิค) เพราะเป็นแกนของตารางราคา
d.options = [
  {
    label: SIZE_LABEL,
    display: "dropdown", // 9 ขนาด — ปุ่มแยกจะยาวเกินไป (สแตนดี้ก็ใช้เมนูเลือก)
    choices: SIZES.map((cm) => ({ name: `${cm}cm`, imageSrc: art[`size-${cm}`], ...(cm === 6 ? { popular: true } : {}) })),
  },
  {
    label: SHEET_LABEL,
    display: "pills",
    stockBearing: true,
    choices: SHEETS.map((s) => ({
      name: s.name,
      imageSrc: s.shared ? acrylicColorImage(s.name) : art[s.local],
      ...(s.popular ? { popular: true } : {}),
    })),
  },
  {
    // เลือก "สีพิเศษ" แล้วต้องบอกต่อว่าสีไหน — ราคาบวกไปแล้วในตาราง กลุ่มนี้จึงไม่มี +฿
    label: PICK_LABEL,
    display: "dropdown", // 44 สี — ปุ่มแยกยาวเกิน (สแตนดี้+คลิปหนีบก็ใช้เมนูเลือก)
    /**
     * ธงนี้ทำหน้าที่อย่างเดียวตรงนี้: กันไม่ให้ 44 ภาพสีไหลเข้าแถบรูปย่อของแกลเลอรี
     * (ดู galleryImages ใน ProductDetail.tsx — ข้ามกลุ่มที่ตั้งธงนี้)
     * ส่วนหน้าตากลุ่มยังเป็นเมนูเลื่อนตามปกติ เพราะโหมด "ตารางสวอตช์" ใช้ได้เฉพาะกลุ่มติ๊กหลายอย่าง
     * ภาพสีที่เลือกอยู่ยังโชว์เป็นรูปย่อข้างเมนูเหมือนเดิม
     */
    swatchGrid: true,
    stockBearing: true,
    showWhen: { label: SHEET_LABEL, choices: [SHEET_SPECIAL] },
    choices: SPECIAL_COLORS.map((n) => ({ name: n, imageSrc: acrylicColorImage(n) })),
  },
  {
    label: HOOK_LABEL,
    display: "pills",
    stockBearing: true, // ตัวตะขอเป็นวัสดุที่กินสต๊อก — รอผูก SKU ตอนตั้งคลังตะขอแขวนผนัง
    choices: Object.entries(HOOK_COLORS).map(([code, thai]) => ({ name: `${code} ${thai}`, imageSrc: art[`hook-${code}`] })),
  },
];

d.images = gallery;
d.imageSrc = gallery[0].src;
d.description =
  "ตะขอแขวนผนังอะคริลิค พิมพ์ลายตามสั่งลงบนอะคริลิคหนา 3 มม. ตัดตามรูปได้ทุกทรง เลือกขนาดได้ 2-10 ซม. และเลือกเนื้ออะคริลิคได้ทั้งแบบใส ขาวขุ่น C-02 และสีพิเศษ (โฮโลแกรม/กลิสเตอร์/สี) ประกบกับตะขอพลาสติกขนาด 3 × 5.5 ซม. เลือกสีตะขอได้ 7 สี ติดผนังด้วยเทปกาวสองหน้า ไม่ต้องเจาะผนัง";
d.highlights = ["เลือกขนาดได้ 2-10 ซม.", "สีตะขอให้เลือก 7 สี (H01-H07)", "ติดผนังด้วยเทปกาว ไม่ต้องเจาะ"];
d.terms = [
  "*ขนาดชิ้นงานไม่เกิน 6 ซม. รวมอยู่ในราคาแล้ว — ตั้งแต่ 7 ซม. ขึ้นไป คิดเพิ่มเซนติเมตรละ 10 บาท/ชิ้น (วัดด้านที่ยาวที่สุด)",
  "*สีพิเศษ (โฮโลแกรม/กลิสเตอร์/สี) คิดเพิ่มตามขนาด — เรทปลีก (1-10 อัน) +10 บาท/ชิ้นทุกขนาด · เรทส่ง (11 อันขึ้นไป) 2-5 ซม. +5 · 6-8 ซม. +8 · 9-10 ซม. +10 (รวมอยู่ในตารางราคาแล้ว)",
  "*จำนวน 1-10 อัน คละลายได้อิสระ · 11 อันขึ้นไป คละลายได้ สั่งลายละ 5 อันขึ้นไป",
  "*ตัวตะขอกว้าง 3 ซม. สูง 5.5 ซม. ติดผนังด้วยเทปกาวสองหน้า — เหมาะกับผนังเรียบ ไม่เหมาะกับผนังปูนหยาบ/ผิวฝุ่นเกาะ",
  "*ใช้แขวนของเบา เช่น กุญแจ สายชาร์จ หมวก ถุงผ้า — ไม่รองรับของหนัก",
  "*สีตะขอเป็นสีพลาสติกสำเร็จ อาจเพี้ยนจากภาพบนหน้าจอเล็กน้อยตามการตั้งค่าจอ",
].join("\n");
d.hidden = false;

/**
 * ฟิลด์ที่ปกติ /api/admin/products เขียนให้ตอนกดบันทึกในหน้าแก้ไข — สคริปต์เขียน DB ตรงจึงต้องทำเอง
 * quoteOption : ไม่มีแบบที่ต้องให้แอดมินตีราคาแล้ว (อะคริลิคพิเศษคิดจากตารางได้) → ล้างธงเดิมทิ้ง
 * priceMin/Max: ช่วงราคาจากทุกช่องในตาราง ใช้โชว์บนการ์ดโดยไม่ต้องโหลดตารางราคาทั้งก้อน
 */
d.quoteOption = d.options.some((o) => o.askPrice || o.choices.some((c) => c.askPrice)) || undefined;
d.priceMin = Math.min(...allPrices);
d.priceMax = Math.max(...allPrices);
d.savedAt = new Date().toISOString();

console.log(`\n📦 ${d.name} (${ID}) · หมวด ${d.category}`);
console.log(`   ราคา ฿${d.priceMin}-${d.priceMax}/อัน (เริ่มต้น ฿${d.price}) · ตัวเลือก ${d.options.map((o) => `${o.label} ${o.choices.length} แบบ`).join(" · ")}`);
console.log(`   แกลเลอรี ${d.images.length} ภาพ · ภาพประจำตัวเลือกครบทุกตัว (${Object.keys(art).length} ภาพ) · สถานะ: เผยแพร่`);
if (!WRITE) {
  console.log("\n(ยังไม่อัปไฟล์ ไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
/**
 * ตาราง products มีคอลัมน์ name/category/price แยกจาก data (หน้ารายการหลังบ้านอ่านคอลัมน์พวกนี้)
 * อัปเดตแต่ data อย่างเดียว = หน้าร้านเปลี่ยนแล้วแต่หลังบ้านยังโชว์ชื่อเก่า — ต้องเขียนให้ตรงกันทั้งคู่
 */
const save = await sb
  .from("products")
  .update({ data: d, name: d.name, category: d.category, price: d.price })
  .eq("id", ID);
if (save.error) throw new Error(`บันทึกไม่สำเร็จ — ${save.error.message}`);
console.log("\n✅ อัปภาพ + บันทึก + เผยแพร่แล้ว");
