/**
 * 🗓 สร้างสินค้า "ปฏิทินโฟโต้การ์ด" (id: calendar-photocard) — ยกจากหน้าร้านเดิม (12 ต.ค. 69)
 *
 *   npx tsx scripts/calendar-photocard-build.mts            # ดูผลก่อน (ไม่อัปรูป ไม่เขียน DB)
 *   npx tsx scripts/calendar-photocard-build.mts --write    # อัปรูป + เขียนลง Supabase (เป็นฉบับร่าง)
 *
 * ต้นทาง: https://www.iduckyprintsstudio.com/Calendar_Photocard/ (Printbox family 399)
 *   ขนาด 85×55 มม. 20 ใบ/ชุด · ปี 2026/2027 · กระดาษอาร์ต 300 + กระดาษพิเศษ 7 ชนิด (เคลือบไม่ได้)
 *   ราคาเดียวต่อชุด: อาร์ต 140 · เคลือบพิเศษ +30 · กระดาษพิเศษ 170 · Stardream 190
 *   โปรแกรมออกแบบ: หน้าปก = รูป · ด้านหลัง = ปฏิทินทั้งปี (เว็บเราใช้ CalendarStudio — Product.calendarStudio)
 *
 * ที่ผู้ใช้เลือก (12 ต.ค. 69):
 *   - ราคาขั้นบันไดแบบโฟโต้การ์ด: ขั้นแรก = ราคาต้นทาง แล้วลดตามส่วนต่างเดียวกับโฟโต้การ์ด (−35/−40/−45)
 *   - เคลือบชุดเต็มแบบโฟโต้การ์ด (ไม่เคลือบ/เงา/ด้าน/พิเศษ +30 + ลายฟิล์ม 10 ลาย preset-2)
 *   - ค่าคละลายแบบโฟโต้การ์ด (mixRule ยกมาสด) · เรทตัวแทน (ขั้นแรก −10% ขั้นอื่น −5% สูตรเดียวกับโฟโต้การ์ด)
 *   - Eggshell ไม่ใส่ (เลิกขายแล้ว — ดูโน้ต discontinued options)
 *
 * กระดาษ/รูปการ์ดยกจากกลุ่มของ photocard-digital สด ๆ (ชื่อเนื้อชุดเดียวกัน ภาพชุดเดียวกัน ไม่ก๊อปไฟล์)
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
  type ProductOptionChoice,
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

const ID = "calendar-photocard";
const NAME = "ปฏิทินโฟโต้การ์ด";
const SLUG = "Calendar-Photocard";
const CATEGORY = "cat-msrdpxqn"; // หมวดปฏิทิน (ตัวเดียวกับ mini-calendar)
const SOURCE = "photocard-digital";
const V = "v1"; // ⚠️ แก้รูปครั้งหน้าขยับเป็น v2 (กันแคช)
const UNIT = "ชุด (20 ใบ)";
const YEAR_LABEL = "ปีปฏิทิน";
const RATE_ART = "กระดาษอาร์ตเกาหลี 300 แกรม";
const RATE_SPECIAL = "กระดาษเนื้อพิเศษ";
const RATE_STAR = "กระดาษ Stardream";
const COAT = "เคลือบ (เฉพาะด้านหน้า)";
const SPECIAL_FEE = 30;

/** ราคาขั้นแรก = ต้นทาง · ขั้นถัดไปลดเท่าโฟโต้การ์ด (130→95→90→85) */
const STEPS = [0, -35, -40, -45];
const BASE = { [RATE_ART]: 140, [RATE_SPECIAL]: 170, [RATE_STAR]: 190 };
const TIERS = [
  { upTo: 10, label: "1-10 ชุด" },
  { upTo: 49, label: "11-49 ชุด" },
  { upTo: 99, label: "50-99 ชุด" },
  { upTo: null, label: "100 ชุดขึ้นไป" },
];
const DEALER_TIERS = [
  { upTo: 10, label: "1-10" },
  { upTo: 49, label: "11-49" },
  { upTo: 99, label: "50-99" },
  { upTo: null, label: "100 ขึ้นไป" },
];
const pricesOf = (base: number) => STEPS.map((d) => base + d);
/** ตัวแทน: ขั้นแรก −10% ขั้นอื่น −5% ปัดเต็มบาท (สูตรที่ photocard-digital ใช้อยู่ — ตรวจด้านล่าง) */
const dealerOf = (p: number[]) => p.map((v, i) => Math.round(v * (i === 0 ? 0.9 : 0.95)));

/* ── 1. อ่านต้นแบบ photocard-digital ── */
const { data: srcRow, error: srcErr } = await sb.from("products").select("data").eq("id", SOURCE).single();
if (srcErr || !srcRow) die(`อ่าน ${SOURCE} ไม่ได้: ${srcErr?.message}`);
const src = srcRow!.data as Product;
const grp = (label: string) => src.options.find((o) => o.label === label) ?? die(`${SOURCE} ไม่มีกลุ่ม "${label}"`);

// ยืนยันสูตรตัวแทนกับของจริงก่อนใช้ (กันสูตรในหัวไฟล์ล้าสมัย)
for (const r of src.priceRates ?? []) {
  if (!r.dealerOnly) continue;
  const pub = src.priceRates!.find((x) => !x.dealerOnly && `${x.label} (ตัวแทน)` === r.label);
  if (!pub) continue;
  const want = dealerOf(pub.pricing.cells[""]);
  const got = r.pricing.cells[""];
  if (JSON.stringify(want) !== JSON.stringify(got))
    console.warn(`⚠️ สูตรตัวแทนไม่ตรง ${r.label}: คำนวณ ${want} แต่โฟโต้การ์ดใช้ ${got}`);
}

const paperGroup = grp("ชนิดกระดาษเนื้อพิเศษ");
const paper = (re: RegExp): ProductOptionChoice => {
  const c = paperGroup.choices.find((x) => re.test(x.name)) ?? die(`ไม่เจอกระดาษ ${re}`);
  return structuredClone(c);
};
const SPECIAL_PAPERS = [/^เนื้อ Canvas/, /^เนื้อ 100 Pond/, /^เนื้อ E-Photo/, /^เนื้อ Extra White/].map(paper);
const STAR_PAPERS = [/^STARDREAM เนื้อมุกขาว/, /^STARDREAM Crystal/].map(paper);

const coatSrc = structuredClone(grp(COAT));
const coat: ProductOption = {
  ...coatSrc,
  // ไม่มีงานฟอยล์ในสินค้านี้ — ตัดตัวล็อกของงานฟอยล์ออก
  choices: coatSrc.choices.filter((c) => !/ฟอยล์/.test(c.name)),
  note: `เงา/ด้าน ฟรี · เคลือบพิเศษ +${SPECIAL_FEE} บาท/ชุด · กระดาษเนื้อพิเศษ/Stardream เคลือบไม่ได้`,
  section: "3. เคลือบผิว",
};
if (coat.choices.find((c) => c.name === "เคลือบพิเศษ")?.extra !== SPECIAL_FEE) die("ค่าเคลือบพิเศษของต้นแบบไม่ใช่ +30 — เช็คก่อน");
const film = { ...structuredClone(grp("เคลือบ")), section: "3. เคลือบผิว" };

/* ── 2. รูป: ภาพงานจริง 2 ใบจากหน้าร้านเดิม ── */
const url = (f: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${f}`;
const PHOTOS = [
  ["photo-1", "https://storage.googleapis.com/pbx-sw-tpdigital/media/e1/03/af/1750989897/CCLD-1.jpg"],
  ["photo-2", "https://storage.googleapis.com/pbx-sw-tpdigital/media/f4/91/ec/1750989897/CCLD-2.jpg"],
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
const sizeImg = grp("ขนาดตัด").choices[0]?.imageSrc;
const OPTIONS: ProductOption[] = [
  {
    label: "ขนาด",
    display: "cards",
    section: "1. ขนาด + ปีปฏิทิน",
    choices: [
      {
        name: "5.5 × 8.5 ซม. (20 ใบ/ชุด)",
        desc: "หน้าปก = รูปของคุณ · ด้านหลัง = ปฏิทิน 12 เดือน",
        ...(sizeImg ? { imageSrc: sizeImg } : {}),
      },
    ],
  },
  {
    label: YEAR_LABEL,
    display: "cards",
    section: "1. ขนาด + ปีปฏิทิน",
    note: "ปฏิทินด้านหลังสร้างตามปีที่เลือก (เริ่มเดือนมกราคม)",
    choices: [
      { name: "ปี ค.ศ. 2026 (พ.ศ. 2569)" },
      { name: "ปี ค.ศ. 2027 (พ.ศ. 2570)" },
    ],
  },
  {
    label: "ชนิดกระดาษเนื้อพิเศษ",
    display: "dropdown",
    section: "2. เนื้อกระดาษ",
    showWhen: { label: "เรทราคา", choices: [RATE_SPECIAL] },
    choices: SPECIAL_PAPERS,
  },
  {
    label: "ชนิดกระดาษ Stardream",
    display: "dropdown",
    section: "2. เนื้อกระดาษ",
    showWhen: { label: "เรทราคา", choices: [RATE_STAR] },
    choices: STAR_PAPERS,
  },
  coat,
  film,
];

/* ── 4. เรทราคา ── */
const matrix = (cells: number[], tiers = TIERS): PriceMatrix =>
  ({ unit: UNIT, cells: { "": cells }, tiers, driverLabels: [] }) as PriceMatrix;
const rateImg = (label: string) => src.priceRates?.find((r) => r.label.startsWith(label))?.imageSrc;
const RATES = [
  {
    id: "art300",
    label: RATE_ART,
    desc: "กระดาษนำเข้าจากเกาหลี · เคลือบเงา/ด้านฟรี · เคลือบพิเศษ +30",
    imageSrc: rateImg("กระดาษอาร์ตมัน 300 แกรม"),
  },
  {
    id: "paper-special",
    label: RATE_SPECIAL,
    desc: "Canvas · 100 Pond · E-Photo · Extra White — เคลือบไม่ได้",
    imageSrc: SPECIAL_PAPERS[0].imageSrc,
  },
  {
    id: "stardream",
    label: RATE_STAR,
    desc: "STARDREAM เนื้อมุกขาว / Crystal (285 แกรม) — เคลือบไม่ได้",
    imageSrc: STAR_PAPERS[0].imageSrc,
  },
];
const priceRates = [
  ...RATES.map((r) => ({ ...r, pricing: matrix(pricesOf(BASE[r.label as keyof typeof BASE])) })),
  ...RATES.map((r) => ({
    id: `${r.id}-dealer`,
    label: `${r.label} (ตัวแทน)`,
    desc: "ราคาตัวแทนจำหน่าย",
    imageSrc: r.imageSrc,
    dealerOnly: true,
    pricing: matrix(dealerOf(pricesOf(BASE[r.label as keyof typeof BASE])), DEALER_TIERS),
  })),
];

/* ── 5. กฎ: กระดาษพิเศษ/Stardream ล็อกไม่เคลือบ ── */
const RULES: OptionRule[] = [
  {
    when: { label: "เรทราคา", choice: RATE_SPECIAL, choices: [RATE_SPECIAL, RATE_STAR] },
    limit: { label: COAT, allow: ["ไม่เคลือบ"] },
  },
];

/* ── 6. ประกอบสินค้า ── */
const { data: oldRow } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const old = (oldRow?.data ?? null) as Product | null;
const P = (r: string) => pricesOf(BASE[r as keyof typeof BASE]);

const product = {
  ...(old ?? {}),
  id: ID,
  slug: SLUG,
  name: NAME,
  category: CATEGORY,
  emoji: "🗓",
  gradient: "from-sky-100 to-teal-100",
  featured: old?.featured ?? false,
  rating: old?.rating ?? 4.9,
  sold: old?.sold ?? 0,
  hidden: old ? old.hidden : true,
  price: P(RATE_ART)[3],
  imageSrc: gallery[0],
  images: gallery.map((s) => ({ src: s, emoji: "🗓", label: "", gradient: "from-sky-100 to-teal-100" })),
  description:
    `ปฏิทินโฟโต้การ์ดขนาดพกพา 5.5×8.5 ซม. ชุดละ 20 ใบ หน้าปกเป็นรูปของคุณ ด้านหลังเป็นปฏิทินทั้งปี 12 เดือน ` +
    `สร้างบนเว็บได้เลย ใส่รูป เลือกสีและฟอนต์ ไฮไลต์วันหยุดไทย และใส่วันสำคัญของคุณเองได้ ` +
    `พิมพ์ระบบดิจิทัล กระดาษอาร์ตเกาหลี 300 แกรม หรือกระดาษเนื้อพิเศษ เริ่มต้นชุดละ ${P(RATE_ART)[3]} บาท`,
  highlights: [
    "1 ชุด = 20 ใบ · ขนาด 5.5×8.5 ซม. · หน้าปกรูปของคุณ + ปฏิทินทั้งปีด้านหลัง",
    "🗓 สร้างปฏิทินบนเว็บได้เลย — เลือกปี ภาษา สี ฟอนต์ วันหยุดไทย + วันสำคัญของคุณ",
    `กระดาษอาร์ตเกาหลี 300 แกรม · กระดาษเนื้อพิเศษ (Canvas / 100 Pond / E-Photo / Extra White) · Stardream`,
    `เคลือบเงา/ด้านฟรี · เคลือบพิเศษ (กลิตเตอร์ / ทราย / โฮโลแกรม) +${SPECIAL_FEE} บาท`,
    `ยิ่งสั่งเยอะยิ่งถูก — เริ่มต้น ${P(RATE_ART)[3]} บาท/ชุด`,
  ],
  options: OPTIONS,
  rules: RULES,
  priceRates,
  pricing: matrix(P(RATE_ART)),
  mixRule: structuredClone(src.mixRule),
  calendarStudio: { yearLabel: YEAR_LABEL },
  // ตัวเลือกเรทราคา (ชนิดกระดาษ) ขึ้นต่อจากกลุ่มปี — ลำดับเดียวกับโฟโต้การ์ด (ขนาด → เรท → เนื้อ → เคลือบ)
  rateAfterOption: YEAR_LABEL,
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text:
        "• 1 ชุด มี 20 ใบ · ขนาด 5.5×8.5 ซม. (85×55 มม.)\n" +
        "• หน้าปก = รูปของคุณ · ด้านหลัง = ปฏิทิน 12 เดือนของปีที่เลือก\n" +
        "• กดปุ่ม 🗓 สร้างปฏิทินบนเว็บ — ใส่รูปหน้าปก เพิ่มข้อความ เลือกภาษา (ไทย/อังกฤษ) วันเริ่มสัปดาห์ ฟอนต์ และสี\n" +
        "• ไฮไลต์วันหยุดนักขัตฤกษ์ไทย + สีวันอาทิตย์ · ใส่วันสำคัญของคุณเอง (วันเกิด วันครบรอบ) เป็นวงกลมสีบนวันนั้น\n" +
        `• เคลือบเงา/ด้าน ฟรี · เคลือบพิเศษ บวกเพิ่ม ${SPECIAL_FEE} บาท/ชุด (เคลือบเฉพาะด้านหน้า)\n` +
        "• กระดาษเนื้อพิเศษ / Stardream เคลือบไม่ได้\n" +
        "• 1 แผ่น (A3) คละไม่เกิน 3 ลาย หากเกินคิดเพิ่มลายละ 5 บาท\n" +
        "• มีไฟล์ของตัวเองอยู่แล้ว เลือก 📎 แนบไฟล์ลาย แยกช่องหน้าปก/ด้านหลังได้\n" +
        "• ระยะเวลาผลิต 2-3 วันทำการ ไม่รวมจัดส่ง",
    },
    ...(src.tabs ?? []).filter((t) => ["การเตรียมไฟล์", "การรับประกันสินค้า"].includes(t.title)),
  ],
  seo: {
    ...(old?.seo ?? {}),
    faqs: [
      {
        q: "ปฏิทินโฟโต้การ์ด ราคาเท่าไหร่?",
        a: `ชุดละ 20 ใบ กระดาษอาร์ตเกาหลี 300 แกรม ${P(RATE_ART).join(" / ")} บาท/ชุด (1-10 / 11-49 / 50-99 / 100 ชุดขึ้นไป) · กระดาษเนื้อพิเศษเริ่ม ${P(RATE_SPECIAL)[0]} บาท · Stardream เริ่ม ${P(RATE_STAR)[0]} บาท · เคลือบพิเศษบวก ${SPECIAL_FEE} บาท`,
      },
      {
        q: "ต้องทำไฟล์ปฏิทินเองไหม?",
        a: "ไม่ต้อง — กดสร้างปฏิทินบนหน้าเว็บ ใส่รูปหน้าปก ระบบสร้างปฏิทินทั้งปีด้านหลังให้เอง เลือกภาษา สี ฟอนต์ ไฮไลต์วันหยุดไทย และใส่วันสำคัญของคุณได้",
      },
      {
        q: "เลือกปีได้ปีไหนบ้าง?",
        a: "ปี ค.ศ. 2026 (พ.ศ. 2569) และ ปี ค.ศ. 2027 (พ.ศ. 2570) — ปฏิทินเริ่มเดือนมกราคม",
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

console.log(`\n📦 ${saved.name} (${ID}) · หมวด ${saved.category} · ${saved.hidden ? "ฉบับร่าง" : "เผยแพร่อยู่"} · ${old ? "แก้ของเดิม" : "สร้างใหม่"}`);
console.log(`   ราคา ฿${range.min}-${range.max}/${UNIT}`);
for (const r of priceRates) console.log(`   ${r.dealerOnly ? "  └ " : "· "}${r.label}: ${r.pricing.cells[""].join(" / ")}`);
console.log(`   ตัวเลือก: ${OPTIONS.map((o) => `${o.label} (${o.choices.length})`).join(" · ")}`);
console.log(`   กระดาษพิเศษ: ${SPECIAL_PAPERS.map((c) => c.name).join(", ")}`);
console.log(`   Stardream: ${STAR_PAPERS.map((c) => c.name).join(", ")}`);
console.log(`   เคลือบ: ${coat.choices.map((c) => c.name + (c.extra ? ` +${c.extra}` : "")).join(", ")} · ลายฟิล์ม ${film.choices.length} (${film.presetId ?? "-"})`);
console.log(`   คละลาย: ${JSON.stringify(saved.mixRule)}`);

if (!WRITE) {
  console.log("\n(dry-run — ใส่ --write เพื่ออัปรูป + บันทึกจริง)");
  process.exit(0);
}

const row = { id: ID, name: saved.name, category: saved.category, price: saved.price, data: saved };
const { error } = old
  ? await sb.from("products").update(row).eq("id", ID)
  : await sb.from("products").insert({ ...row, sold: 0, featured: false, sort: 9999 });
if (error) die(`บันทึกไม่สำเร็จ: ${error.message}`);

const { data: check, error: readErr } = await sb.from("products").select("name,data").eq("id", ID).single();
if (readErr) die(`อ่านกลับไม่ได้: ${readErr.message}`);
const back = check!.data as Product;
if (check!.name !== NAME || back.savedAt !== saved.savedAt || back.options.length !== OPTIONS.length || !back.calendarStudio)
  die("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");
console.log(`\n✅ บันทึกแล้ว${saved.hidden ? " — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products" : ""}`);
console.log(`   หน้าสินค้า: /products/${ID}`);
