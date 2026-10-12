/**
 * 🗓 สร้างสินค้า "โปสการ์ดปฏิทิน" (id: calendar-postcard) — ยกจากหน้าร้านเดิม (12 ต.ค. 69)
 *
 *   npx tsx scripts/calendar-postcard-build.mts            # ดูผลก่อน (ไม่อัปรูป ไม่เขียน DB)
 *   npx tsx scripts/calendar-postcard-build.mts --write    # อัปรูป + เขียนลง Supabase (เป็นฉบับร่าง)
 *
 * ต้นทาง: https://www.iduckyprintsstudio.com/Calendar_Poscard/ (Printbox family 401)
 *   4×6 นิ้ว · รายปี 8 ใบ/ชุด (แนวนอน/ตั้ง · พิมพ์ 1 หรือ 2 ด้าน) · รายเดือน 13 ใบ/ชุด · ปี 2026/2027
 *   ราคาต้นทาง (อาร์ต 300 เคลือบ): รายปี 1 ด้าน 90 · 2 ด้าน 110 · รายเดือน 100 — ราคาเดียวทุกจำนวน
 *
 * ผู้ใช้เลือก (12 ต.ค. 69): ราคา "ตามตารางโปสการ์ดของร้าน" — 1 ชุดรายปี 8 ใบ = 1 แผ่น A3 ของ postcard-th
 *   (อาร์ต 300 เคลือบ 90/70/65/60/55/50/45 = ขั้นแรกตรงต้นทางพอดี) · รายเดือน +10 · พิมพ์ 2 ด้าน +20 ตามต้นทาง
 *   ตารางราคา/เรทตัวแทน/ค่าคละ/กลุ่มกระดาษ+เคลือบ/กฎ ยกจาก postcard-th สด ๆ (เฉพาะกระดาษที่ต้นทางขาย ไม่เอา Eggshell)
 *   จอสร้างปฏิทิน: Product.calendarStudio.formats → postcard-year1/year2/month × L/P (lib/calendar-card)
 * รันซ้ำได้: เขียนทับทั้งก้อน แต่คงยอดขาย/รีวิว/สถานะเผยแพร่ของเดิมไว้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import {
  hasQuoteOption,
  priceRange,
  type OptionRule,
  type PriceMatrix,
  type Product,
  type ProductOption,
} from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m: string): never => {
  console.error("✗", m);
  process.exit(1);
};

const ID = "calendar-postcard";
const NAME = "โปสการ์ดปฏิทิน";
const SLUG = "Calendar-Postcard";
const CATEGORY = "cat-msrdpxqn";
const SOURCE = "postcard-th";
const V = "v1";
const PAPER = "ชนิดกระดาษ";
const COAT = "เคลือบ (เฉพาะด้านหน้า)";
const TYPE = "แบบปฏิทิน";
const ORI = "แนวโปสการ์ด";
const YEAR = "ปีปฏิทิน";

const T_Y1 = "รายปี · พิมพ์ 1 ด้าน (8 ใบ/ชุด)";
const T_Y2 = "รายปี · พิมพ์ 2 ด้าน (8 ใบ/ชุด)";
const T_M = "รายเดือน (13 ใบ/ชุด)";
const Y2_FEE = 20;
const M_FEE = 10;

/** กระดาษที่หน้าร้านเดิมขาย (ชื่อตาม postcard-th — เป็นคีย์ตารางราคา ห้ามแก้ฝั่งเดียว) */
const PAPERS = [
  "กระดาษอาร์ตมัน 300 แกรม",
  "Canvas Paper 260 แกรม",
  "100 Pound Paper (หนา 300gsm)",
  "E-Photo Paper 290 แกรม",
  "Extra Paper 260 แกรม",
  "Stardream Paper 285 แกรม",
  "Stardream Crystal Paper 285 แกรม",
];

/* ── 1. ต้นแบบ postcard-th ── */
const { data: srcRow, error: srcErr } = await sb.from("products").select("data").eq("id", SOURCE).single();
if (srcErr || !srcRow) die(`อ่าน ${SOURCE} ไม่ได้: ${srcErr?.message}`);
const src = srcRow!.data as Product;
const grp = (label: string) => structuredClone(src.options.find((o) => o.label === label) ?? die(`${SOURCE} ไม่มีกลุ่ม "${label}"`));
if (JSON.stringify(src.pricing?.driverLabels) !== JSON.stringify([PAPER, COAT])) die("แกนตารางราคาของโปสการ์ดเปลี่ยน — เช็คก่อน");

const paper = grp(PAPER);
for (const n of PAPERS) if (!paper.choices.some((c) => c.name === n)) die(`โปสการ์ดไม่มีกระดาษ "${n}"`);
paper.choices = paper.choices.filter((c) => PAPERS.includes(c.name));
paper.section = "2. เนื้อกระดาษ + เคลือบ";
const coat = { ...grp(COAT), section: "2. เนื้อกระดาษ + เคลือบ" };
const film = { ...grp("เคลือบ"), section: "2. เนื้อกระดาษ + เคลือบ" };
const ori = { ...grp(ORI), section: "1. แบบปฏิทิน", note: "ราคาเท่ากันทั้งสองแนว" };

/* ── 2. รูปงานจริงจากหน้าร้านเดิม ── */
const url = (f: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${f}`;
const PHOTOS = [
  ["photo-1", "https://storage.googleapis.com/pbx-sw-tpdigital/media/d8/9c/2c/1751276811/CDPC-1.jpg"],
  ["photo-2", "https://storage.googleapis.com/pbx-sw-tpdigital/media/df/b1/b8/1751272875/CDPC-2.jpg"],
  ["photo-3", "https://storage.googleapis.com/pbx-sw-tpdigital/media/14/f1/96/1751272875/CDPC-3.jpg"],
] as const;
const gallery: string[] = [];
for (const [name, from] of PHOTOS) {
  const file = `${name}-${V}.jpg`;
  if (WRITE) {
    const res = await fetch(from);
    if (!res.ok) die(`โหลด ${from} ไม่ได้ — HTTP ${res.status}`);
    const buf = await sharp(Buffer.from(await res.arrayBuffer()))
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    const up = await sb.storage.from("product-images").upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
    if (up.error) die(`อัป ${file}: ${up.error.message}`);
  }
  gallery.push(url(file));
}

/* ── 3. ตัวเลือก ── */
const OPTIONS: ProductOption[] = [
  {
    label: TYPE,
    display: "cards",
    section: "1. แบบปฏิทิน",
    choices: [
      { name: T_Y1, desc: "รูปของคุณ + ปฏิทินทั้งปี ในหน้าเดียวกัน", imageSrc: gallery[0] },
      { name: T_Y2, desc: "หน้า = รูปของคุณ · หลัง = ปฏิทินทั้งปี", extra: Y2_FEE, imageSrc: gallery[1] },
      { name: T_M, desc: "ปก + 12 เดือน · รูปด้านบน ตารางเดือนด้านล่าง", extra: M_FEE, imageSrc: gallery[2] },
    ],
  },
  ori,
  {
    label: YEAR,
    display: "cards",
    section: "1. แบบปฏิทิน",
    note: "ปฏิทินสร้างตามปีที่เลือก (เริ่มเดือนมกราคม)",
    choices: [{ name: "ปี ค.ศ. 2026 (พ.ศ. 2569)" }, { name: "ปี ค.ศ. 2027 (พ.ศ. 2570)" }],
  },
  paper,
  coat,
  film,
];
const labels = new Set(OPTIONS.map((o) => o.label));
const oriNames = ori.choices.map((c) => c.name);
if (JSON.stringify(oriNames) !== JSON.stringify(["แนวนอน", "แนวตั้ง"])) die(`ตัวเลือกแนวเปลี่ยน: ${oriNames}`);

/* ── 4. ราคา: ตาราง postcard-th เฉพาะกระดาษที่ขาย · หน่วย A3 → ชุด ── */
const toSet = (m: PriceMatrix, dealer: boolean): PriceMatrix => ({
  ...m,
  unit: "ชุด",
  cells: Object.fromEntries(Object.entries(m.cells).filter(([k]) => PAPERS.includes(k.split("│")[0]))),
  tiers: m.tiers.map((t) => ({ ...t, label: dealer ? t.label : t.label.replace(/แผ่น A3/g, "ชุด") })),
});
const priceRates = (src.priceRates ?? []).map((r) => ({ ...structuredClone(r), pricing: toSet(r.pricing, !!r.dealerOnly) }));
const pricing = toSet(src.pricing!, false);
const want = PAPERS.length * coat.choices.length;
for (const r of [pricing, ...priceRates.map((x) => x.pricing)])
  if (Object.keys(r.cells).length !== want) die(`ตารางราคาไม่ครบ ${Object.keys(r.cells).length}/${want} ช่อง`);

/* ── 5. กฎ: ยกเฉพาะข้อที่อ้างกลุ่มที่มีจริง + ตัดชื่อกระดาษที่ไม่ได้ขาย ── */
const RULES: OptionRule[] = [];
for (const r0 of src.rules ?? []) {
  const r = structuredClone(r0);
  if (!labels.has(r.when.label) || !labels.has(r.limit.label)) continue;
  const valid = new Set(OPTIONS.find((o) => o.label === r.when.label)!.choices.map((c) => c.name));
  const choices = (r.when.choices ?? [r.when.choice]).filter((c) => valid.has(c));
  if (!choices.length) continue;
  r.when = { ...r.when, choice: choices[0], choices };
  RULES.push(r);
}
// รายเดือนไม่มีแบบ 2 ด้าน — ไม่มีกฎเพิ่ม (แบบปฏิทินเป็นกลุ่มเดียวกันอยู่แล้ว)

/* ── 6. ประกอบ ── */
const { data: oldRow } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const old = (oldRow?.data ?? null) as Product | null;
const art = pricing.cells["กระดาษอาร์ตมัน 300 แกรม│เคลือบด้าน"];
const formats = (["L", "P"] as const).flatMap((o) => {
  const oname = o === "L" ? "แนวนอน" : "แนวตั้ง";
  return [
    { format: `postcard-year1-${o}`, when: [{ label: TYPE, choices: [T_Y1] }, { label: ORI, choices: [oname] }] },
    { format: `postcard-year2-${o}`, when: [{ label: TYPE, choices: [T_Y2] }, { label: ORI, choices: [oname] }] },
    { format: `postcard-month-${o}`, when: [{ label: TYPE, choices: [T_M] }, { label: ORI, choices: [oname] }] },
  ];
});

const product = {
  ...(old ?? {}),
  id: ID,
  slug: SLUG,
  name: NAME,
  category: CATEGORY,
  emoji: "🗓",
  gradient: "from-sky-100 to-amber-100",
  featured: old?.featured ?? false,
  rating: old?.rating ?? 4.9,
  sold: old?.sold ?? 0,
  hidden: old ? old.hidden : true,
  price: Math.min(...art),
  imageSrc: gallery[0],
  images: gallery.map((s) => ({ src: s, emoji: "🗓", label: "", gradient: "from-sky-100 to-amber-100" })),
  description:
    `โปสการ์ดปฏิทินขนาด 4×6 นิ้ว เลือกได้ทั้งปฏิทินรายปี (8 ใบ/ชุด พิมพ์ 1 หรือ 2 ด้าน) และรายเดือน (13 ใบ/ชุด) ` +
    `สร้างบนเว็บได้เลย ใส่รูป เลือกภาษา สี ฟอนต์ ไฮไลต์วันหยุดไทย และใส่วันสำคัญของคุณเองได้ ` +
    `กระดาษอาร์ตมัน 300 แกรม หรือกระดาษเนื้อพิเศษ เริ่มต้นชุดละ ${Math.min(...art)} บาท`,
  highlights: [
    "ขนาด 4×6 นิ้ว · แนวนอน/แนวตั้ง",
    `รายปี 8 ใบ/ชุด (พิมพ์ 2 ด้าน +${Y2_FEE}) · รายเดือน 13 ใบ/ชุด (+${M_FEE})`,
    "🗓 สร้างปฏิทินบนเว็บได้เลย — เลือกปี ภาษา สี ฟอนต์ วันหยุดไทย + วันสำคัญของคุณ",
    "กระดาษอาร์ตมัน 300 แกรม · Canvas · 100 Pound · E-Photo · Extra · Stardream",
    `ยิ่งสั่งเยอะยิ่งถูก — เริ่มต้น ${Math.min(...art)} บาท/ชุด`,
  ],
  options: OPTIONS,
  rules: RULES,
  pricing,
  priceRates,
  mixRule: structuredClone(src.mixRule),
  calendarStudio: { yearLabel: YEAR, formats },
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text:
        "• ขนาด 4×6 นิ้ว · เลือกแนวนอนหรือแนวตั้ง\n" +
        "• รายปี · พิมพ์ 1 ด้าน: รูปของคุณ + ปฏิทินทั้งปีในหน้าเดียว — 8 ใบ/ชุด\n" +
        `• รายปี · พิมพ์ 2 ด้าน: หน้ารูป หลังปฏิทินทั้งปี — 8 ใบ/ชุด (+${Y2_FEE} บาท/ชุด)\n` +
        `• รายเดือน: ปก + 12 เดือน (รูปด้านบน ตารางเดือนด้านล่าง) — 13 ใบ/ชุด (+${M_FEE} บาท/ชุด)\n` +
        "• กดปุ่ม 🗓 สร้างปฏิทินบนเว็บ — ใส่รูป (รูปเดียวทั้งชุด หรือแยกรูปรายเดือน) เพิ่มข้อความ เลือกภาษา ฟอนต์ สี\n" +
        "• ไฮไลต์วันหยุดนักขัตฤกษ์ไทย + สีวันอาทิตย์ · ใส่วันสำคัญของคุณเองเป็นวงกลมสีบนวันนั้น\n" +
        "• กระดาษเนื้อพิเศษ (Canvas / 100 Pound / E-Photo / Extra / Stardream) เคลือบไม่ได้\n" +
        "• ระยะเวลาผลิต 2-3 วันทำการ ไม่รวมจัดส่ง",
    },
    ...(src.tabs ?? []).filter((t) => ["การเตรียมไฟล์", "การรับประกันสินค้า"].includes(t.title)),
  ],
  seo: {
    ...(old?.seo ?? {}),
    faqs: [
      {
        q: "โปสการ์ดปฏิทิน ราคาเท่าไหร่?",
        a: `กระดาษอาร์ตมัน 300 แกรม เคลือบเงา/ด้าน ${art.join(" / ")} บาท/ชุด (ตามจำนวนชุด) · รายปีพิมพ์ 2 ด้าน +${Y2_FEE} · รายเดือน 13 ใบ +${M_FEE}`,
      },
      {
        q: "รายปีกับรายเดือนต่างกันยังไง?",
        a: "รายปี 8 ใบ/ชุด แต่ละใบมีปฏิทินครบ 12 เดือน (ใบเดียวกันทั้งชุด) · รายเดือน 13 ใบ/ชุด คือปก 1 ใบ + เดือนละใบ",
      },
      {
        q: "ต้องทำไฟล์ปฏิทินเองไหม?",
        a: "ไม่ต้อง — กดสร้างปฏิทินบนหน้าเว็บ ใส่รูป ระบบสร้างตารางปฏิทินให้เอง เลือกภาษา สี ฟอนต์ ไฮไลต์วันหยุดไทย และใส่วันสำคัญของคุณได้",
      },
    ],
  },
} as Product;

const range = priceRange(product);
const saved: Product = {
  ...product,
  priceMin: range.min,
  priceMax: range.max,
  hasQuote: hasQuoteOption(product),
  savedAt: new Date().toISOString(),
};

console.log(`\n📦 ${saved.name} (${ID}) · ${saved.hidden ? "ฉบับร่าง" : "เผยแพร่อยู่"} · ${old ? "แก้ของเดิม" : "สร้างใหม่"}`);
console.log(`   ราคา ฿${range.min}-${range.max}/ชุด · อาร์ต 300 ด้าน ${art.join("/")}`);
console.log(`   ตัวเลือก: ${OPTIONS.map((o) => `${o.label} (${o.choices.length})`).join(" · ")}`);
console.log(`   เรท: ${priceRates.map((r) => `${r.label} ${Object.keys(r.pricing.cells).length} ช่อง`).join(" · ")}`);
console.log(`   กฎ ${RULES.length} ข้อ · คละลาย ${JSON.stringify(saved.mixRule)}`);
console.log(`   รูปแบบจอสร้าง: ${formats.map((f) => f.format).join(", ")}`);

if (!WRITE) {
  console.log("\n(dry-run — ใส่ --write เพื่ออัปรูป + บันทึกจริง)");
  process.exit(0);
}

const row = { id: ID, name: saved.name, category: saved.category, price: saved.price, data: saved };
const { error } = old
  ? await sb.from("products").update(row).eq("id", ID)
  : await sb.from("products").insert({ ...row, sold: 0, featured: false, sort: 9999 });
if (error) die(`บันทึกไม่สำเร็จ: ${error.message}`);
const { data: check } = await sb.from("products").select("name,data").eq("id", ID).single();
const back = check!.data as Product;
if (back.savedAt !== saved.savedAt || back.options.length !== OPTIONS.length || !back.calendarStudio?.formats?.length)
  die("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");
console.log(`\n✅ บันทึกแล้ว${saved.hidden ? " — เป็นฉบับร่าง" : ""} · /products/${ID}`);
