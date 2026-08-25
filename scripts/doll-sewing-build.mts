/**
 * สร้างสินค้า "DOLL SEWING (ตุ๊กตากระต่ายปักชื่อที่หู)" ลงร่างเดิม id: new-mt2saszv-9863
 * (ร่างเปล่าชื่อ "ตุ๊กตา (งานปักหู)" — คง id เดิม ไม่ตั้ง slug)
 *
 *   npx tsx scripts/doll-sewing-build.mts            # ดูข้อมูล + เซฟภาพตัวอย่างลง scratchpad_out/ (ไม่เขียน DB)
 *   npx tsx scripts/doll-sewing-build.mts --write    # อัปรูป + เขียนลง Supabase (ฉบับร่าง)
 *
 * ที่มา: iduckyofficial-pricelists.com/pillowkeychain หัวข้อ "DOLL SEWING"
 *   สคริปต์อ่านตารางสดทุกครั้ง (ยึดหัวข้อ rich text ตัวแรก แล้วหา <table> ตัวถัดไป — ตัวหลัง ๆ
 *   ในไฟล์เป็น JSON warmup ห้ามใช้ ตามกับดักหน้า /griptok) — ราคาเปลี่ยนเมื่อไหร่รันซ้ำได้
 *   ตาราง: จำนวน | ราคา → 1-10 ชิ้น 169 · 11-29 ชิ้น 159 · 30-49 ชิ้น 149 · 50 ชิ้นขึ้นไป 130
 *   หมายเหตุใต้ตาราง: 1-10 ชิ้น คละลายไม่จำกัด · 11 ชิ้นขึ้นไป คละแบบละ 3 ชิ้นขึ้นไป
 *   สเปค (การ์ดร้าน P-nDoll-01): ตุ๊กตากระต่าย 11×46 ซม. (±1-2 ซม.) เนื้อกำมะหยี่ มี ชมพู/เทา/ขาว
 *   ระบบปัก: ปักชื่อได้ 1 หู · ไม่เกิน 3 สีไหม · ฟอนต์ E1-E11 / T1-T15 / อีโมจิ (ชาร์ต YourChoice)
 *
 * วิธีโมเดล (กลไกที่มีอยู่แล้วทั้งหมด — ไม่แตะ lib):
 *   • ราคา = ตารางขั้นบันไดคอลัมน์เดียว (driverLabels []) หน่วย "ตัว" + colLabel
 *   • คละลาย: priceRates เรทเดียว minPerDesign 3 + freeMixBelowQty 11
 *   • สีตุ๊กตา = display "cards" 3 ตัวเลือก มีรูปประกอบ (ผู้ใช้สั่ง 25 ส.ค. 69: ตัวเลือกต้องมีภาพ
 *     ให้เห็นว่าแต่ละแบบหน้าตายังไง) — ชมพู/ขาว ครอปจากรูปงานจริง · เทา ไม่มีรูปถ่าย ใช้สวอตช์สีผ้า
 *   • ข้อความปักชื่อ = กลุ่มช่องกรอก (display "input" + standardInput — งานปกติ ไม่ใช่กล่องสั่งทำ)
 *   • ฟอนต์ = dropdown E1-E11 / T1-T15 · ชาร์ตฟอนต์+อีโมจิอยู่แท็บ "ฟอนต์ / อีโมจิ"
 *   • สีไหมปัก = swatchGrid 80 เบอร์ Madeira — ก็อปกลุ่มจาก armpatch-1 ตอนรัน (รูปสวอตช์+ชาร์ต
 *     ใช้ URL ร่วมจาก products/armpatch-1 แบบเดียวกับฐาน griptok-mirror ที่ใช้ภาพร่วม) แต่ไม่คิด +฿
 *     เพราะการ์ดร้านกำหนด "ปักได้ไม่เกิน 3 สีไหม" (รวมในราคา ไม่มีเรทเกิน 3 สี)
 *
 * ภาพ: ไดรฟ์ร้าน /Volumes/iDuckyShop/Case Web/ใหม่/ตุ๊กตาหูปัก (1.1-2.5) + ชาร์ตฟอนต์จาก
 *   - ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/ตุ๊กตาปัก-ซับ/YourChoice-01.jpg
 *   ⚠️ ต้อง mount /Volumes/iDuckyShop ก่อนรัน · ห้ามอัปทับชื่อไฟล์เดิม (แคช) — แก้รูปขยับ v2
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { hasQuoteOption, priceRange, type PriceMatrix, type Product, type ProductOption } from "../src/lib/products";

const WRITE = process.argv.includes("--write");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const ID = "new-mt2saszv-9863"; // ร่างเดิมชื่อ "ตุ๊กตา (งานปักหู)" — เขียนทับตัวนี้ ไม่สร้าง id ใหม่
const OLD_NAME = "ตุ๊กตา (งานปักหู)";
const NAME = "DOLL SEWING (ตุ๊กตากระต่ายปักชื่อที่หู)";
const CATEGORY = "gifts"; // หมวดเดียวกับ DOLL DIE-CUT (ร่างเดิมติด acrylic มา — ไม่ใช่งานอะคริลิค)
const V = "v1"; // ⚠️ แก้รูปครั้งหน้าขยับเป็น v2 (กันแคช)
const PAGE = "https://www.iduckyofficial-pricelists.com/pillowkeychain";
const UNIT = "ตัว";
const SIZE = "11 x 46 ซม."; // ขนาดตุ๊กตา (±1-2 ซม.)
const THREAD_MAX = 3; // ปักได้ไม่เกิน 3 สีไหม (การ์ดร้าน)
const ARMPATCH_ID = "armpatch-1"; // ต้นทางกลุ่มสีไหม Madeira 80 เบอร์ (swatchGrid + chartSrc)

const GROUP_COLOR = "สีตุ๊กตา";
const GROUP_TEXT = "ข้อความปักชื่อ (ปักได้ 1 หู)";
const GROUP_FONT = "ฟอนต์ตัวปัก";
const GROUP_THREAD = `สีไหมปัก (เลือกได้ไม่เกิน ${THREAD_MAX} สี)`;

const DRIVE = "/Volumes/iDuckyShop/Case Web/ใหม่/ตุ๊กตาหูปัก";
const FONT_CHART = "/Volumes/iDuckyShop/- ข้อมูลตอบลูกค้า/40_เสื้อผ้าและงานผ้า/ตุ๊กตาปัก-ซับ/YourChoice-01.jpg";

const OUT = new URL("../scratchpad_out/doll-sewing/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = (file: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

/* ── 1. ดึงตารางราคาสดจากเว็บ ───────────────────────────────────── */
const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s: string) => decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const html = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } }).then((r) => {
  if (!r.ok) throw new Error(`ดึงหน้า ${PAGE} ไม่ได้ — HTTP ${r.status}`);
  return r.text();
});

const anchor = html.indexOf("DOLL SEWING");
if (anchor < 0) throw new Error("หาหัวข้อ DOLL SEWING บนหน้าเว็บไม่เจอ — โครงหน้าอาจเปลี่ยน");
// กันชนหัวข้อผิดตัว: หัวข้อจริงต้องตามด้วยข้อความสเปคกระต่ายก่อนถึงตาราง
const t = html.indexOf("<table", anchor);
if (t < 0) throw new Error("หา <table> ถัดจากหัวข้อ DOLL SEWING ไม่เจอ");
if (!/ตุ๊กตากระต่าย/.test(strip(html.slice(anchor, Math.min(anchor + 20000, t)))))
  throw new Error("ระหว่างหัวข้อ DOLL SEWING กับตารางไม่มีข้อความ 'ตุ๊กตากระต่าย' — อาจยึดหัวข้อผิดตัว ตรวจหน้าเว็บก่อน");
const rows = [...html.slice(t, html.indexOf("</table>", t)).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
  [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
);

const head = rows[0]?.join("|") ?? "";
if (!/จำนวน/.test(head) || !/ราคา/.test(head))
  throw new Error(`หัวตาราง DOLL SEWING ไม่ตรงคาด: "${head}" — โครงหน้าเว็บอาจเปลี่ยน`);

const body = rows.slice(1);
if (body.length < 3) throw new Error(`ตาราง DOLL SEWING มีแค่ ${body.length} แถว — น้อยผิดปกติ ตรวจหน้าเว็บก่อน`);
const tiers = body.map((r, i) => {
  if (!/ชิ้น/.test(r[0])) throw new Error(`แถวช่วงจำนวนไม่ตรงคาด: "${r[0]}"`);
  const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
  const from = Number((r[0].match(/^(\d+)/) ?? [])[1]);
  const last = i === body.length - 1;
  if (!last && !m) throw new Error(`อ่านช่วงจำนวนจากแถว "${r[0]}" ไม่ได้`);
  // ป้ายช่วงเขียนใหม่เป็นหน่วย "ตัว" (เว็บใช้ "ชิ้น" — แนวเดียวกับ DOLL DIE-CUT ที่เว็บใช้ "ใบ")
  return { upTo: last ? null : Number(m![2]), label: last ? `${from} ${UNIT}ขึ้นไป` : `${m![1]}-${m![2]} ${UNIT}` };
});
const prices = body.map((r) => {
  const n = Number(String(r[1]).replace(/[^\d]/g, ""));
  if (!n) throw new Error(`แถว "${r[0]}" ราคาอ่านไม่ได้ (${r[1]})`);
  return n;
});

// หมายเหตุคละลายใต้ตาราง — assert กติกาที่โมเดลไว้ (3 ชิ้น/แบบ ตั้งแต่ 11 ชิ้น) ยังตรงกับเว็บ
const tEnd = html.indexOf("</table>", t);
const after = strip(html.slice(tEnd, tEnd + 60000));
if (!/คละลายได้ไม่จำกัด/.test(after) || !/ขั้นต่ำ\s*3\s*ชิ้น/.test(after))
  throw new Error("หมายเหตุคละลายใต้ตาราง DOLL SEWING เปลี่ยนไปจากเดิม (1-10 อิสระ · 11+ แบบละ 3) — ตรวจก่อน");
const MIX_FROM = tiers[1] ? Number((body[1][0].match(/^(\d+)/) ?? [])[1]) : 11;
const MIX_MIN = 3;

const PRICING: PriceMatrix = {
  unit: UNIT,
  driverLabels: [],
  tiers,
  cells: { "": prices },
  colLabel: "ตุ๊กตาปักชื่อที่หู",
};

console.log(`📊 ตารางจากเว็บ (${tiers.map((x) => x.label).join(" · ")})`);
console.log(`   ราคา: ${prices.map((p) => `฿${p}`).join(" / ")} · คละ: 1-${MIX_FROM - 1} อิสระ · ${MIX_FROM}+ แบบละ ${MIX_MIN}`);

/* ── 2. รูปภาพ ──────────────────────────────────────────────────── */
type ImgSrc =
  | { kind: "drive"; path: string; width?: number }
  | { kind: "square"; path: string } // ครอปกลางเป็นจัตุรัส — ภาพการ์ดตัวเลือก
  | { kind: "swatch"; rgb: { r: number; g: number; b: number } }; // สวอตช์สีผ้า (ไม่มีรูปถ่าย)

async function render(src: ImgSrc): Promise<Buffer> {
  if (src.kind === "swatch")
    return sharp({ create: { width: 900, height: 900, channels: 3, background: src.rgb } })
      .jpeg({ quality: 88 })
      .toBuffer();
  const img = sharp(src.path).rotate();
  if (src.kind === "square") return img.resize(900, 900, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer();
  return img.resize({ width: src.width ?? 1200, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
}

async function put(name: string, src: ImgSrc): Promise<string> {
  const file = `${name}-${V}.jpg`;
  const buf = await render(src);
  writeFileSync(`${OUT}${file}`, buf); // เก็บตัวอย่างไว้ดูก่อนเขียนจริงเสมอ
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

const art: Record<string, string> = {};
// แกลเลอรี 5 ใบ (MAX_PHOTOS) — ช็อตจากไดรฟ์ร้าน ชุดเดียวกับหน้า pricelists
art["photo-white"] = await put("photo-white", { kind: "drive", path: `${DRIVE}/1.2.jpg` });
art["photo-pair"] = await put("photo-pair", { kind: "drive", path: `${DRIVE}/1.3.jpg` });
art["photo-pink"] = await put("photo-pink", { kind: "drive", path: `${DRIVE}/2.2.jpg` });
art["photo-ear"] = await put("photo-ear", { kind: "drive", path: `${DRIVE}/1.5.jpg` });
art["photo-thai"] = await put("photo-thai", { kind: "drive", path: `${DRIVE}/1.9.jpg` });
// ภาพการ์ดตัวเลือกสีตุ๊กตา — ชมพู/ขาว ครอปจัตุรัสจากรูปงานจริง · เทา ไม่มีรูปถ่าย ใช้สวอตช์สีผ้ากำมะหยี่
art["opt-pink"] = await put("opt-pink", { kind: "square", path: `${DRIVE}/2.2.jpg` });
art["opt-white"] = await put("opt-white", { kind: "square", path: `${DRIVE}/1.4.jpg` });
art["opt-gray"] = await put("opt-gray", { kind: "swatch", rgb: { r: 171, g: 171, b: 177 } });
// ชาร์ตฟอนต์ + อีโมจิ (YOUR CHOICE) — ไว้ในแท็บ (กว้าง 1600 ให้ซูมอ่านรหัสได้)
art["font-chart"] = await put("font-chart", { kind: "drive", path: FONT_CHART, width: 1600 });
console.log(`🖼  อัปรูป ${Object.keys(art).length} ไฟล์ — ตัวอย่างอยู่ที่ ${OUT}`);

/* ── 2.5 กลุ่มสีไหม Madeira 80 เบอร์ — ก็อปจาก armpatch-1 (ดูหมายเหตุหัวไฟล์) ── */
const { data: apRow, error: apErr } = await sb.from("products").select("data").eq("id", ARMPATCH_ID).single();
if (apErr) throw new Error(`อ่านสินค้าอาร์มปัก ${ARMPATCH_ID} ไม่ได้: ${apErr.message}`);
const apThread = ((apRow.data as Product).options ?? []).find((o) => o.swatchGrid);
if (!apThread || !apThread.chartSrc || apThread.choices.length < 50)
  throw new Error(`กลุ่มสีไหม swatchGrid ของ ${ARMPATCH_ID} หน้าตาไม่ตรงคาด — โครงต้นทางเปลี่ยน ตรวจก่อน`);
const threadOption: ProductOption = {
  label: GROUP_THREAD,
  display: "multi",
  swatchGrid: true,
  chartSrc: apThread.chartSrc, // ใช้ชาร์ตร่วมจาก products/armpatch-1 (ไฟล์เดียวกับชาร์ตในไดรฟ์)
  note:
    `ไหมปัก Madeira โพลีเอสเตอร์ 100% — **ปักได้ไม่เกิน ${THREAD_MAX} สีไหมต่อตัว** (รวมในราคาแล้ว ไม่คิดเพิ่ม) · ` +
    `แตะสีเพื่อดูตัวอย่างใหญ่ หรือกดดูชาร์ตสีเต็มทุกเบอร์ · ไม่เลือกก็ได้ — ทางร้านจับคู่สีให้เข้ากับสีตุ๊กตา`,
  // ไม่คิด +฿ ต่อสี (ต่างจากอาร์มปักที่เกิน 3 สีคิดเพิ่ม) — ตัด extra ทิ้งทั้งชุด เหลือรูปสวอตช์
  choices: apThread.choices.map((c) => ({ name: c.name, imageSrc: c.imageSrc })),
};
console.log(`🧵 สีไหมจากอาร์มปัก: ${threadOption.choices.length} เบอร์ (ใช้รูปสวอตช์+ชาร์ตร่วมจาก ${ARMPATCH_ID})`);

/* ── 3. ประกอบสินค้า ─────────────────────────────────────────────── */
const FONT_EN = Array.from({ length: 11 }, (_, i) => `E${i + 1}`);
const FONT_TH = Array.from({ length: 15 }, (_, i) => `T${i + 1}`);

const OPTIONS: ProductOption[] = [
  {
    label: GROUP_COLOR,
    display: "cards",
    note: `ตุ๊กตากระต่ายเนื้อผ้ากำมะหยี่ ขนาด ${SIZE} (แต่ละชิ้นอาจ ±1-2 ซม.) — มีให้เลือก 3 สี`,
    choices: [
      { name: "ชมพู", desc: "กำมะหยี่ชมพู ปักไหมเข้มตัดสีได้สวย", imageSrc: art["opt-pink"], popular: true },
      { name: "เทา", desc: "กำมะหยี่เทา (สีตามสวอตช์ — ยังไม่มีรูปถ่ายงานจริง)", imageSrc: art["opt-gray"] },
      { name: "ขาว", desc: "กำมะหยี่ขาว เข้ากับไหมปักทุกสี", imageSrc: art["opt-white"] },
    ],
  },
  {
    label: GROUP_TEXT,
    display: "input",
    standardInput: true, // ข้อมูลประกอบของงานปกติ — โชว์เรียงกับกลุ่มอื่น ไม่เข้ากล่องสั่งทำ 📐
    input: {
      kind: "text",
      maxLength: 60,
      placeholder: "เช่น Wawah",
      hint: `ชื่อ/ข้อความที่ต้องการปักที่หู (ปักได้ 1 หู) · ใส่อีโมจิเสริมได้ — ดูรหัสจากชาร์ตในแท็บ "ฟอนต์ / อีโมจิ" แล้วพิมพ์รหัสต่อท้าย เช่น "Wawah + I2"`,
    },
    choices: [],
  },
  {
    label: GROUP_FONT,
    display: "dropdown",
    note: `ฟอนต์อังกฤษ E1-E11 · ฟอนต์ไทย T1-T15 — ดูตัวอย่างลายมือแต่ละฟอนต์ในแท็บ **"ฟอนต์ / อีโมจิ"** ท้ายหน้า`,
    choices: [
      ...FONT_EN.map((n) => ({ name: `ฟอนต์อังกฤษ ${n}` })),
      ...FONT_TH.map((n) => ({ name: `ฟอนต์ไทย ${n}` })),
    ],
  },
  threadOption,
];

const gallery: Product["images"] = [
  { emoji: "🐰", gradient: "from-pink-200 to-rose-300", label: `ตุ๊กตากระต่ายปักชื่อที่หู ขนาด ${SIZE}`, src: art["photo-white"] },
  { emoji: "🐰", gradient: "from-pink-200 to-rose-300", label: "มี 3 สี — ชมพู · เทา · ขาว เนื้อผ้ากำมะหยี่", src: art["photo-pair"] },
  { emoji: "🐰", gradient: "from-pink-200 to-rose-300", label: "สีชมพู ปักชื่อไหมสีเข้มตัดสี", src: art["photo-pink"] },
  { emoji: "🐰", gradient: "from-pink-200 to-rose-300", label: "งานปักชื่อที่หูระยะใกล้ — ไหม Madeira เรียบเงา", src: art["photo-ear"] },
  { emoji: "🐰", gradient: "from-pink-200 to-rose-300", label: "ปักฟอนต์ภาษาไทยได้ (T1-T15)", src: art["photo-thai"] },
];

const product: Product = {
  id: ID,
  name: NAME,
  category: CATEGORY,
  price: prices[0],
  emoji: "🐰",
  gradient: "from-pink-200 to-rose-300",
  imageSrc: gallery[0].src,
  rating: 5,
  sold: 0,
  description:
    `ตุ๊กตากระต่าย DOLL SEWING ปักชื่อที่หูด้วยระบบปัก ขนาด ${SIZE} เนื้อผ้ากำมะหยี่นุ่ม ` +
    `มี 3 สี ชมพู เทา ขาว เลือกฟอนต์ได้ทั้งอังกฤษ (E1-E11) และไทย (T1-T15) พร้อมสีไหม Madeira ให้เลือกถึง 80 เบอร์ ` +
    `เหมาะเป็นของขวัญรับปริญญา วันเกิด ของฝากแทนใจ ไม่มีขั้นต่ำในการสั่งผลิต เริ่ม${UNIT}ละ ${prices[0]} บาท`,
  highlights: [
    `ไม่มีขั้นต่ำ · เริ่ม${UNIT}ละ ${prices[0]} บาท (สั่งเยอะลดถึง ${prices[prices.length - 1]} บาท)`,
    `ปักชื่อที่หู 1 ข้าง — ฟอนต์อังกฤษ/ไทย ${FONT_EN.length + FONT_TH.length} แบบ + สีไหม 80 เบอร์ (ไม่เกิน ${THREAD_MAX} สี รวมในราคา)`,
    `ตุ๊กตากำมะหยี่ ${SIZE} มี 3 สี ชมพู · เทา · ขาว`,
  ],
  options: OPTIONS,
  images: gallery,
  pricing: PRICING,
  priceRates: [
    {
      id: "r1",
      label: NAME,
      desc: `ตุ๊กตากระต่ายกำมะหยี่ ${SIZE} ปักชื่อที่หู 1 ข้าง · รวมค่าปักแล้ว`,
      pricing: PRICING,
      minPerDesign: MIX_MIN, // 11 ตัวขึ้นไป คละแบบละ 3 ตัวขึ้นไป
      freeMixBelowQty: MIX_FROM, // 1-10 ตัว คละอิสระ
    },
  ],
  terms: [
    `*ไม่มีขั้นต่ำในการสั่งผลิต — ราคาต่อ${UNIT} รวมค่าปักชื่อแล้ว`,
    `*จำนวน 1-${MIX_FROM - 1} ${UNIT} คละสี/คละชื่อได้ไม่จำกัด · ${MIX_FROM} ${UNIT}ขึ้นไป คละแบบละ ${MIX_MIN} ${UNIT}ขึ้นไป`,
    `*ตุ๊กตากระต่าย ขนาด ${SIZE} เนื้อผ้ากำมะหยี่ — ขนาดแต่ละชิ้นอาจ ±1-2 ซม.`,
    "*มี 3 สี — ชมพู · เทา · ขาว",
    `*ปักชื่อได้ 1 หู · ใช้สีไหมได้ไม่เกิน ${THREAD_MAX} สีต่อตัว (รวมในราคาแล้ว)`,
    `*ฟอนต์อังกฤษ E1-E11 · ฟอนต์ไทย T1-T15 · อีโมจิเสริมตามชาร์ตของร้าน (ดูแท็บ "ฟอนต์ / อีโมจิ")`,
    "*สีไหมปักจริงอาจต่างจากหน้าจอเล็กน้อยตามการแสดงผลของแต่ละอุปกรณ์",
  ].join("\n"),
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: [
        "• ไม่มีขั้นต่ำในการสั่งผลิต — ปักชื่อด้วยเครื่องปักคอมพิวเตอร์ ไหม Madeira โพลีเอสเตอร์ 100% งานเรียบเงา ทนต่อการซักฟอก",
        `• ตุ๊กตากระต่าย ขนาด ${SIZE} (แต่ละชิ้นอาจ ±1-2 ซม.) เนื้อผ้ากำมะหยี่นุ่ม`,
        "• มี 3 สี — ชมพู · เทา · ขาว",
        `• ปักชื่อได้ 1 หู · ไม่เกิน ${THREAD_MAX} สีไหมต่อตัว (รวมในราคาแล้ว)`,
        `• ฟอนต์อังกฤษ E1-E11 · ฟอนต์ไทย T1-T15 · อีโมจิเสริม (ดูชาร์ตในแท็บ "ฟอนต์ / อีโมจิ")`,
        `• จำนวน 1-${MIX_FROM - 1} ${UNIT} คละสี/คละชื่อได้ไม่จำกัด · ${MIX_FROM} ${UNIT}ขึ้นไป คละแบบละ ${MIX_MIN} ${UNIT}ขึ้นไป`,
        "• เหมาะเป็นของขวัญรับปริญญา วันเกิด ของรับขวัญเด็ก ของฝากแทนใจ",
      ].join("\n"),
    },
    {
      title: "ฟอนต์ / อีโมจิ",
      text: [
        "เลือกฟอนต์และอีโมจิจากชาร์ตของร้าน::",
        "• ฟอนต์อังกฤษ E1-E11 · ฟอนต์ไทย T1-T15 — เลือกได้ในหน้าสินค้า",
        `• อีโมจิเสริม (คอลัมน์ Emoji ในชาร์ต) ระบุรหัสคอลัมน์-แถว เช่น I2 ต่อท้ายข้อความปักในช่อง "${GROUP_TEXT}" หรือแจ้งในหมายเหตุถึงร้าน`,
        `• สีไหมเลือกได้จากตารางสวอตช์ในหน้าสินค้า (ไม่เกิน ${THREAD_MAX} สีต่อตัว) — ไม่เลือกก็ได้ ทางร้านจับคู่สีให้เข้ากับสีตุ๊กตา`,
      ].join("\n"),
      images: [art["font-chart"]],
      imageSize: "lg" as const,
    },
    {
      title: "วิธีสั่งงาน",
      text:
        'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกสีตุ๊กตา กรอกข้อความปัก เลือกฟอนต์และสีไหม แล้วระบุจำนวน\n• สั่งหลายตัวหลายชื่อ ระบุชื่อของแต่ละตัวในช่อง "หมายเหตุถึงร้าน" ได้เลย\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\nหรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: สีตุ๊กตา · ข้อความปัก · ฟอนต์ · สีไหม · จำนวน · วันที่ใช้งาน (ถ้ามี)',
    },
    {
      title: "การรับประกันสินค้า",
      text: "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• งานผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเสียหายระหว่างการขนส่ง\n\nไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\nระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    },
  ],
  seo: {
    title: `ตุ๊กตากระต่ายปักชื่อ DOLL SEWING ปักชื่อที่หู เริ่ม${UNIT}ละ ${prices[0]} บาท ไม่มีขั้นต่ำ`,
    keywords: [
      "ตุ๊กตาปักชื่อ",
      "ตุ๊กตากระต่ายปักชื่อ",
      "ปักชื่อตุ๊กตา",
      "ตุ๊กตากระต่าย",
      "ตุ๊กตาปักหู",
      "DOLL SEWING",
      "ของขวัญรับปริญญา",
      "ของขวัญวันเกิด",
      "รับปักตุ๊กตา",
      "iDucky",
    ],
    description: `รับปักชื่อตุ๊กตากระต่าย DOLL SEWING ขนาด ${SIZE} เนื้อกำมะหยี่ มี 3 สี ชมพู เทา ขาว ปักชื่อที่หูด้วยไหม Madeira ฟอนต์ไทย/อังกฤษ ${FONT_EN.length + FONT_TH.length} แบบ ไม่มีขั้นต่ำ เริ่ม${UNIT}ละ ${prices[0]} บาท`,
    faqs: [
      {
        q: "ตุ๊กตากระต่ายปักชื่อ ราคาเท่าไหร่?",
        a: `เริ่ม${UNIT}ละ ${prices[0]} บาท (สั่ง ${MIX_FROM} ${UNIT}ขึ้นไปเริ่ม ${prices[1]} บาท ลดหลั่นถึง ${prices[prices.length - 1]} บาทเมื่อสั่ง 50 ${UNIT}ขึ้นไป) ราคารวมค่าปักชื่อแล้ว ไม่มีขั้นต่ำในการสั่งผลิต`,
      },
      {
        q: "ตุ๊กตามีสีอะไรบ้าง ขนาดเท่าไหร่?",
        a: `มี 3 สี ชมพู เทา และขาว เนื้อผ้ากำมะหยี่นุ่ม ขนาด ${SIZE} (แต่ละชิ้นอาจต่างกัน 1-2 ซม. ตามลักษณะงานเย็บ)`,
      },
      {
        q: "ปักชื่อได้ตรงไหน ใช้ฟอนต์อะไรได้บ้าง?",
        a: `ปักชื่อที่หูตุ๊กตา 1 ข้าง เลือกฟอนต์ได้ทั้งภาษาอังกฤษ E1-E11 และภาษาไทย T1-T15 พร้อมใส่อีโมจิเสริมจากชาร์ตของร้านได้ ดูตัวอย่างฟอนต์ทั้งหมดในแท็บ "ฟอนต์ / อีโมจิ" บนหน้าสินค้า`,
      },
      {
        q: "เลือกสีไหมปักได้ไหม?",
        a: `ได้ — ไหมปัก Madeira จากเยอรมนี โพลีเอสเตอร์ 100% มีให้เลือกถึง 80 เบอร์ ใช้ได้ไม่เกิน ${THREAD_MAX} สีต่อตัว (รวมในราคาแล้ว ไม่คิดเพิ่ม) ถ้าไม่ระบุ ทางร้านจับคู่สีให้เข้ากับสีตุ๊กตา`,
      },
      {
        q: "สั่งหลายตัว คละสีคละชื่อได้ไหม?",
        a: `สั่ง 1-${MIX_FROM - 1} ${UNIT} คละสี/คละชื่อได้ไม่จำกัด · สั่ง ${MIX_FROM} ${UNIT}ขึ้นไป คละแบบละ ${MIX_MIN} ${UNIT}ขึ้นไป`,
      },
      {
        q: "เหมาะกับโอกาสไหนบ้าง?",
        a: "นิยมสั่งเป็นของขวัญรับปริญญา ของขวัญวันเกิด ของรับขวัญเด็กแรกเกิด ของขวัญให้แฟน หรือของที่ระลึกแทนใจ เพราะปักชื่อเจ้าของได้ ตัวเดียวก็สั่งได้",
      },
    ],
  },
  // งานปักชื่อไม่มี "ไฟล์ลาย" ให้แนบ — สเปคงานคือ ข้อความ+ฟอนต์+สีไหม ที่เลือกบนหน้าสินค้า
  // (ช่องแนบลายยังอยู่ให้แนบภาพตัวอย่างได้ แต่ไม่บังคับก่อนสั่ง)
  artworkRequired: false,
  hidden: true, // ฉบับร่าง — กดเผยแพร่เองที่ /admin/products
};

const range = priceRange(product);
const saved: Product = {
  ...product,
  priceMin: range.min,
  priceMax: range.max,
  hasQuote: hasQuoteOption(product),
  savedAt: new Date().toISOString(),
};

console.log(`\n📦 ${saved.name} (${ID}) · หมวด ${saved.category}`);
console.log(`   ราคา ฿${range.min}-${range.max}/${UNIT} (เริ่มต้น ฿${saved.price})`);
console.log(`   ตัวเลือก: ${OPTIONS.map((o) => `${o.label} (${o.display}${o.swatchGrid ? "/swatch" : ""}) ×${o.choices.length}`).join(" · ")}`);
console.log(`   แกลเลอรี ${gallery.length} ภาพ · แท็บ ${saved.tabs!.length} · FAQ ${saved.seo!.faqs!.length} ข้อ · สถานะ: ฉบับร่าง`);
console.log(`   ตัวอย่างราคา: 1 ${UNIT} = ฿${prices[0]} · ${MIX_FROM} ${UNIT} = ฿${prices[1]}/${UNIT} · 50 ${UNIT} = ฿${prices[prices.length - 1]}/${UNIT}`);

if (!WRITE) {
  console.log(`\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — เปิดดูรูปที่ ${OUT} แล้วใส่ --write เพื่อบันทึกจริง)`);
  process.exit(0);
}

/* ── 4. เขียนลง Supabase (คอลัมน์กระจก name/category/price ต้องไปด้วย) ── */
const { data: existing, error: exErr } = await sb.from("products").select("id,name").eq("id", ID).maybeSingle();
if (exErr) throw new Error(`เช็คสินค้าเดิมไม่ได้: ${exErr.message}`);
if (!existing) throw new Error(`ไม่พบร่างเดิม id ${ID} — คาดว่ามีอยู่แล้ว ตรวจก่อน`);
if (existing.name !== OLD_NAME && existing.name !== NAME)
  throw new Error(`id ${ID} เป็นของ "${existing.name}" ไม่ใช่ร่างตุ๊กตาปักหู — ตรวจก่อน`);

const { error } = await sb
  .from("products")
  .update({ name: saved.name, category: saved.category, price: saved.price, data: saved })
  .eq("id", ID);
if (error) throw new Error(`อัปเดตไม่สำเร็จ: ${error.message}`);

/** update คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบก่อนประกาศสำเร็จ */
const { data: check, error: readErr } = await sb.from("products").select("name,category,data").eq("id", ID).single();
if (readErr) throw new Error(`อ่านกลับไม่ได้: ${readErr.message}`);
if (check.name !== NAME || check.category !== CATEGORY || (check.data as Product).savedAt !== saved.savedAt)
  throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");

console.log(`\n✅ อัปรูป + บันทึกแล้ว — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
console.log(`   หน้าสินค้า: http://localhost:3005/products/${ID}`);
console.log(`   หน้าแก้ไข: http://localhost:3005/admin/products/${ID}`);
