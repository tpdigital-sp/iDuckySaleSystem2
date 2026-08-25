/**
 * สร้างสินค้าใหม่ "PHONE BACK CLIP" (phone-back-clip) จากตารางราคาเว็บ pricelists
 *
 *   npx tsx scripts/phone-back-clip-build.mts            # ดูข้อมูลที่จะบันทึก (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/phone-back-clip-build.mts --write    # อัปรูป + เขียนลง Supabase
 *
 * ที่มา: iduckyofficial-pricelists.com/griptok หัวข้อ "PHONE BACK CLIP"
 *   สคริปต์อ่านตารางสดทุกครั้ง — บนหน้ามี 2 ตารางหัวคอลัมน์ "จำนวน | Oval Clip | Mirror Clip"
 *   ตารางแรก = Phone Back Clip (UV) · ตารางที่สอง = Phone Back Clip (Acrylic)
 *   (ยึดหัวคอลัมน์แทนหัวข้อ เพราะข้อความ "Phone Back Clip (UV)" บนเว็บถูกผ่าเป็นหลาย span)
 *
 * โครงสินค้า (แบบเดียวกับแม่เหล็กติดตู้เย็น fridge-magnet-live.mts + กริ๊บต๊อก griptok-th):
 *   • เรทราคา 2 เรทเป็นการ์ดมีรูป+คำอธิบาย: แบบ UV (พิมพ์บนคลิป) | แบบ Acrylic (แผ่นอะคริลิคแปะบน)
 *   • กลุ่ม "ทรง" display cards มีรูป: Oval Clip | Mirror Clip — เป็น driver ของตารางราคาทั้ง 2 เรท
 *     ⚠️ ห้ามเปลี่ยนชื่อกลุ่ม/ตัวเลือก — เป็นแกนตารางราคา (price driver trap)
 *   • เฉพาะเรท Acrylic (showWhen เรทราคา): ขนาดอะคริลิค 5cm ฟรี → +10/cm · ชนิดอะคริลิค ใส/พิเศษ +10
 *   • กติกาคละ: 1-10 ชิ้นคละอิสระ (freeMixBelowQty 11) · 11+ คละขั้นต่ำลายละ 5 (minPerDesign 5)
 *
 * ภาพ: รูปจริงจากท่อน PHONE BACK CLIP บนหน้าเว็บ (wixId) — อัปเข้า product-images/products/phone-back-clip/
 *   ภาพประจำเรท/ตัวเลือกไม่ต้องใส่ซ้ำใน images (แกลเลอรีหน้าสินค้าดูดเข้าไปเอง) · แกลเลอรีหลักได้แค่ 5 รูป
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคช) — ชุดนี้ลงท้าย v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { hasQuoteOption, priceRange, RATE_LABEL, type PriceMatrix, type Product, type ProductOption } from "../src/lib/products";

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

const ID = "phone-back-clip";
const V = "v1";
const PAGE = "https://www.iduckyofficial-pricelists.com/griptok";
const UNIT = "ชิ้น";
const OVAL = "Oval Clip";
const MIRROR = "Mirror Clip";
const UV_RATE = "แบบ UV";
const AC_RATE = "แบบ Acrylic";
const SHAPE_LABEL = "ทรง";

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = (file: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

/* ── 1. ดึงตารางราคาจากเว็บ ──────────────────────────────────────── */
const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s: string) => decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const html = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } }).then((r) => {
  if (!r.ok) throw new Error(`ดึงหน้า ${PAGE} ไม่ได้ — HTTP ${r.status}`);
  return r.text();
});

/** ทุกตารางที่หัวคอลัมน์ = จำนวน | Oval Clip | Mirror Clip (หน้า /griptok มี 2 ตาราง: UV แล้วค่อย Acrylic) */
function clipTables(): string[][][] {
  const out: string[][][] = [];
  for (const m of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    const rows = [...m[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
      [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
    );
    if (rows.length > 1 && rows[0][0] === "จำนวน" && rows[0].includes(OVAL) && rows[0].includes(MIRROR)) out.push(rows);
  }
  if (out.length !== 2) throw new Error(`ตาราง Oval/Mirror Clip บนหน้าเว็บมี ${out.length} ตาราง (คาดไว้ 2: UV, Acrylic) — โครงหน้าเว็บอาจเปลี่ยน`);
  return out;
}

const [uvRows, acRows] = clipTables();

function parseTable(rows: string[][], rateName: string) {
  const header = rows[0];
  const tiers = rows.slice(1).map((r) => {
    const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
    return { upTo: m ? Number(m[2]) : null, label: r[0] };
  });
  tiers[tiers.length - 1].upTo = null; // "500 ชิ้นขึ้นไป" = ขั้นเปิดปลาย
  if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error(`ช่วงจำนวนตาราง ${rateName} อ่านไม่ครบ — ตรวจก่อน`);
  const cells: Record<string, number[]> = {};
  for (const shape of [OVAL, MIRROR]) {
    const col = header.indexOf(shape);
    cells[shape] = rows.slice(1).map((r) => {
      const n = Number(String(r[col]).replace(/[^\d]/g, ""));
      if (!n) throw new Error(`ช่องราคา "${shape}" (${rateName}) แถว "${r[0]}" อ่านไม่ออก ("${r[col]}")`);
      return n;
    });
  }
  return { tiers, cells };
}

const uv = parseTable(uvRows, UV_RATE);
const ac = parseTable(acRows, AC_RATE);
// กันหยิบสลับตาราง: Acrylic ต้องแพงกว่า UV ทุกช่อง (บนเว็บ UV มาก่อน Acrylic เสมอ)
if (ac.cells[OVAL][0] <= uv.cells[OVAL][0]) throw new Error("ตาราง Acrylic ถูกกว่า UV — ลำดับตารางบนเว็บอาจสลับ ตรวจก่อน");

for (const [name, t] of [[UV_RATE, uv], [AC_RATE, ac]] as const) {
  console.log(`📊 ${name} · ${t.tiers.length} ช่วงจำนวน`);
  for (const shape of [OVAL, MIRROR]) console.log(`   ${shape}: ${t.tiers.map((x, i) => `${x.label} = ฿${t.cells[shape][i]}`).join(" · ")}`);
}

const rateMatrix = (t: { tiers: { upTo: number | null; label: string }[]; cells: Record<string, number[]> }): PriceMatrix => ({
  unit: UNIT,
  driverLabels: [SHAPE_LABEL],
  tiers: t.tiers,
  cells: t.cells,
});

/* ── 2. ภาพจริงจากท่อน PHONE BACK CLIP บนหน้าเว็บ ─────────────────── */
/** ชื่อไฟล์ตาม "รูปอะไร" ไม่ใช่ลำดับ — กันสลับรูปแล้วแคชค้าง */
const ART: Record<string, string> = {
  // การ์ดเรทราคา
  "style-uv": "959b83_510537eef67a4c8697e851314c0552bc~mv2.jpg", // คลิปวงรีพิมพ์ UV เรียบ (HELLO Summer)
  "style-acrylic": "959b83_b2b27f914e304baba4a15fdbc5e03801~mv2.jpg", // แผ่นอะคริลิคนูนแปะบนคลิป (โคลสอัป)
  // การ์ดทรง
  "shape-oval": "959b83_e91b4c9b62ac470a9f0588e5d36b5fa1~mv2.jpg", // คลิปวงรีติดหลังมือถือ
  "shape-mirror": "959b83_4ce868d5da9445398ed41972912ca22d~mv2.jpg", // คลิปเปิดฝา เห็นกระจกด้านใน
  // แกลเลอรีหลัก (สูงสุด 5 รูป)
  "photo-mirror-strap": "959b83_d70960e5ba384faeb94fcec3a7583646~mv2.jpg", // ปก: Mirror Clip เปิดฝา + สายคล้อง + โลโก้
  "photo-mirror-closed": "959b83_92969dee2cc2430293c6633c0d13ae87~mv2.jpg", // Mirror Clip ปิดฝาบนมือถือ + สายคล้อง
  "photo-mirror-open": "959b83_6e3621cca5f341e9a70d8884cad4c43c~mv2.jpg", // Mirror Clip เปิดฝาใช้เป็นกระจก
  "photo-acrylic-strap": "959b83_bea2aa0ec5614dcfb063cffc7bc95591~mv2.jpg", // Oval Clip อะคริลิค + สายคล้อง
  "photo-acrylic-oval": "959b83_98db9dff844b41279e20a662db8b5926~mv2.jpg", // Oval Clip อะคริลิคบนมือถือ
};

async function fetchWix(wixId: string): Promise<Buffer> {
  const res = await fetch(`https://static.wixstatic.com/media/${wixId}/v1/fill/w_1200,h_1200,al_c,q_88/file.jpg`);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function put(name: string, buf: Buffer): Promise<string> {
  const file = `${name}-${V}.jpg`;
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

const art: Record<string, string> = {};
for (const [name, wixId] of Object.entries(ART)) art[name] = await put(name, await fetchWix(wixId));
console.log(`🖼  รูป ${Object.keys(art).length} ภาพ (เรท 2 + ทรง 2 + แกลเลอรี 5)`);

/* ── 3. ประกอบสินค้า ─────────────────────────────────────────────── */
const GRADIENT = "from-sky-100 to-cyan-200";
const IMG_META = { emoji: "📱", label: "", gradient: GRADIENT };

const OPTIONS: ProductOption[] = [
  {
    label: SHAPE_LABEL, // ⚠️ driver ของตารางราคา — ห้ามเปลี่ยนชื่อ
    display: "cards",
    choices: [
      {
        name: OVAL,
        imageSrc: art["shape-oval"],
        desc: "คลิปทรงรี หนีบหลังเคสมือถือ พิมพ์ลายของคุณเต็มชิ้น ใช้เป็นที่จับ/ขาตั้งดูหนังได้",
        popular: true,
      },
      {
        name: MIRROR,
        imageSrc: art["shape-mirror"],
        desc: "คลิปเปิดฝาได้ ด้านในเป็นกระจกส่องหน้า พกสะดวกไม่ต้องหยิบกระจกแยก",
      },
    ],
  },
  {
    label: "ขนาดอะคริลิค",
    display: "pills",
    showWhen: { label: RATE_LABEL, choices: [AC_RATE] },
    note: "อะคริลิคเริ่มต้นขนาด 5 ซม. — เพิ่มขนาด บวกเพิ่ม ซม.ละ 10 บาท",
    choices: [
      { name: "5 cm", badge: "ฟรี!" },
      { name: "6 cm", extra: 10 },
      { name: "7 cm", extra: 20 },
      { name: "8 cm", extra: 30 },
      { name: "9 cm", extra: 40 },
      { name: "10 cm", extra: 50 },
    ],
  },
  {
    label: "ชนิดอะคริลิค",
    display: "pills",
    showWhen: { label: RATE_LABEL, choices: [AC_RATE] },
    note: "อะคริลิคใส หนา 2 มม. · **อะคริลิคพิเศษ** (สี/ลายพิเศษ) หนา 2.5-3 มม.",
    choices: [
      { name: "อะคริลิคใส (หนา 2mm)" },
      { name: "อะคริลิคพิเศษ (หนา 2.5-3mm)", extra: 10 },
    ],
  },
];

const product: Product = {
  id: ID,
  name: "PHONE BACK CLIP",
  category: "phone-gadget",
  price: uv.cells[OVAL][0],
  emoji: "📱",
  gradient: GRADIENT,
  rating: 4.8,
  sold: 0, // สินค้าใหม่ — ปรับได้ในหน้าแก้ไข
  imageSrc: art["photo-mirror-strap"],
  badge: "ใหม่",
  hidden: true, // ฉบับร่าง — ผู้ใช้กดเผยแพร่เองที่ /admin/products
  description:
    "คลิปหนีบหลังมือถือพิมพ์ลายของคุณ ใช้แขวนสายคล้อง/ตั้งวางดูหนังได้ ไม่ต้องเจาะเคส " +
    `เลือกได้ 2 ทรง — ${OVAL} ทรงรีเรียบ หรือ ${MIRROR} เปิดฝามีกระจกด้านใน · ` +
    "งานพิมพ์เลือกได้ 2 แบบ: UV พิมพ์ลงบนคลิปโดยตรง หรือ Acrylic แผ่นอะคริลิคไดคัทนูนแปะบนคลิป",
  highlights: [
    `2 ทรง: ${OVAL} · ${MIRROR} (เปิดฝามีกระจก)`,
    "2 แบบงาน: UV พิมพ์บนคลิป · Acrylic แผ่นนูนมีมิติ",
    `ไม่มีขั้นต่ำ เริ่มชิ้นละ ${uv.cells[OVAL][0]} บาท · 1-10 ชิ้นคละลายได้`,
  ],
  images: [
    { src: art["photo-mirror-strap"], ...IMG_META },
    { src: art["photo-mirror-closed"], ...IMG_META },
    { src: art["photo-mirror-open"], ...IMG_META },
    { src: art["photo-acrylic-strap"], ...IMG_META },
    { src: art["photo-acrylic-oval"], ...IMG_META },
  ],
  options: OPTIONS,
  pricing: rateMatrix(uv), // ตารางบนสุด = เรทแรก (โครงเดียวกับแม่เหล็ก/หมวก)
  priceRates: [
    {
      id: "uv",
      label: UV_RATE,
      desc: "พิมพ์ลาย UV ลงบนตัวคลิปโดยตรง งานเรียบบาง สีสดคมชัด ราคาเบากว่า",
      imageSrc: art["style-uv"],
      minPerDesign: 5,
      freeMixBelowQty: 11,
      pricing: rateMatrix(uv),
    },
    {
      id: "acrylic",
      label: AC_RATE,
      desc: "แผ่นอะคริลิคพิมพ์ลายไดคัทตามแบบ แปะนูนบนคลิป งานมีมิติ — อะคริลิคใสหนา 2 มม. เริ่มต้นขนาด 5 ซม.",
      imageSrc: art["style-acrylic"],
      minPerDesign: 5,
      freeMixBelowQty: 11,
      pricing: rateMatrix(ac),
    },
  ],
  terms: [
    "*1-10 ชิ้น สามารถคละลายได้",
    "*ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย คละขนาด ขั้นต่ำ 5 ชิ้น",
    `*${MIRROR} เปิดฝาได้ ด้านในเป็นกระจก`,
    `*${AC_RATE}: อะคริลิคใส หนา 2 มม. เริ่มต้นขนาด 5 ซม. — เพิ่มขนาด บวกเพิ่ม ซม.ละ 10 บาท`,
    "*อะคริลิคพิเศษ (สี/ลายพิเศษ) หนา 2.5-3 มม. บวกเพิ่มชิ้นละ 10 บาท",
    "*ทางร้านใช้สี R G B สีงานสกรีนที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
  ].join("\n"),
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: [
        "• Phone Back Clip คลิปหนีบหลังมือถือ/เคส พิมพ์ลายตามสั่ง ใช้แขวนสายคล้องหรือกางเป็นขาตั้งได้",
        `• ${OVAL} = คลิปทรงรี พิมพ์ลายเต็มชิ้น · ${MIRROR} = คลิปเปิดฝาได้ ด้านในเป็นกระจกส่องหน้า`,
        "• งานพิมพ์ 2 แบบ: UV พิมพ์ลงบนคลิปโดยตรง · Acrylic แผ่นอะคริลิคไดคัทพิมพ์ลาย แปะนูนบนคลิป",
        "• อะคริลิคใส หนา 2 มม. เริ่มต้นขนาด 5 ซม. — เพิ่มขนาด บวกเพิ่ม ซม.ละ 10 บาท",
        "• อะคริลิคพิเศษ (สี/ลายพิเศษ) หนา 2.5-3 มม. บวกเพิ่มชิ้นละ 10 บาท",
        "• 1-10 ชิ้น สามารถคละลายได้ · ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย คละขนาด ขั้นต่ำ 5 ชิ้น",
        "• ทางร้านจะมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องจะให้ความแตกต่างประมาณ 5-10% มีโอกาสที่สีแต่ละรอบไม่เหมือนกัน หากผลิตคนละเครื่อง",
        "• ทางร้านใช้สี R G B สีงานสกรีนที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
        "• สำหรับงานอะคริลิค ทางร้านจะแปะฟิล์มกันรอยไว้ทุกชิ้น (ลูกค้าลอกออกเองได้เลย)",
      ].join("\n"),
    },
    {
      title: "วิธีสั่งงาน",
      text: [
        'สั่งผ่านหน้าเว็บนี้ได้เลย::',
        '• เลือกจำนวนและตัวเลือกที่ต้องการ แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"',
        '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ขนาด/รุ่นที่ต้องการ · วันที่ต้องการใช้งาน',
        "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ",
        "",
        "หรือสั่งทางอีเมล::",
        "• ส่งอีเมลมาที่ iduckyshop03@gmail.com",
        "• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ",
        "• ระบุรายละเอียด: สินค้า/ทรงที่เลือก · รายละเอียดเพิ่มเติม (ถ้ามี) · จำนวน · วันที่ใช้งาน (ถ้ามี)",
        "• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
      ].join("\n"),
    },
    {
      title: "การเตรียมไฟล์",
      text: [
        "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส",
        "• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว",
        "• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์",
        "• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด",
      ].join("\n"),
    },
    {
      title: "การรับประกันสินค้า",
      text: [
        "• ทางร้าน QC ตรวจงานทุกชิ้นก่อนส่ง",
        "• งานผิดสเปคจากการผลิต (ผิดแบบ/ผิดขนาด/ผิดตัวเลือก) แจ้งภายใน 7 วันหลังได้รับสินค้า พร้อมรูปถ่าย ทางร้านผลิตชดเชยให้",
        "• สีงานพิมพ์ต่างจากหน้าจอได้ +-5% ถึง +-15% ตามความแตกต่างของไฟล์งานและจอแสดงผล ไม่นับเป็นงานเสีย",
      ].join("\n"),
    },
  ],
  seo: {
    faqs: [
      {
        q: "Phone Back Clip ราคาเท่าไหร่?",
        a: `เริ่มต้นชิ้นละ ${uv.cells[OVAL][0]} บาท (${OVAL} แบบ UV) — สั่งเยอะยิ่งถูกลง ถึงชิ้นละ ${uv.cells[OVAL][uv.cells[OVAL].length - 1]} บาท ดูราคาแต่ละแบบได้ในหน้าสินค้า`,
      },
      {
        q: "Phone Back Clip มีแบบอะไรให้เลือกบ้าง?",
        a: `มี 2 ทรง: ${OVAL} (ทรงรี) และ ${MIRROR} (เปิดฝามีกระจกด้านใน) · งานพิมพ์เลือกได้ 2 แบบ: UV พิมพ์บนคลิปโดยตรง หรือ Acrylic แผ่นอะคริลิคนูนแปะบนคลิป`,
      },
      {
        q: "สั่งขั้นต่ำกี่ชิ้น คละลายได้ไหม?",
        a: "ไม่มีขั้นต่ำ สั่ง 1 ชิ้นก็ได้ — 1-10 ชิ้นคละลายได้อิสระ ตั้งแต่ 11 ชิ้นขึ้นไปคละลาย/คละขนาดได้ ขั้นต่ำลายละ 5 ชิ้น",
      },
      {
        q: "สั่งทำลายของตัวเองได้ไหม?",
        a: "ได้ค่ะ ส่งไฟล์ลาย/รูปที่ต้องการมาตอนสั่งซื้อ (.Ai .Psd .PNG หรือพื้นหลังใส) ทีมงานจัดทำแบบให้ตรวจและอนุมัติก่อนผลิตทุกงาน",
      },
    ],
  },
};

const range = priceRange(product);
const saved: Product = {
  ...product,
  priceMin: range.min,
  priceMax: range.max,
  ...(hasQuoteOption(product) ? { quoteOption: true } : {}),
  savedAt: new Date().toISOString(),
};

console.log(`\n📦 ${saved.name} (${ID}) · หมวด ${saved.category}`);
console.log(`   ราคา ฿${range.min}-${range.max}/${UNIT} (เริ่มต้น ฿${saved.price})`);
console.log(`   เรทราคา: ${saved.priceRates!.map((r) => `${r.label} (${Object.keys(r.pricing.cells).join("/")})`).join(" · ")}`);
console.log(`   ตัวเลือก: ${OPTIONS.map((o) => `${o.label}${o.showWhen ? ` (เฉพาะ ${o.showWhen.choices.join("/")})` : ""}`).join(" · ")}`);
console.log(`   สถานะ: ฉบับร่าง · แกลเลอรี ${saved.images!.length} ภาพ + ภาพเรท/ทรง 4 ภาพ (ดูดขึ้นแกลเลอรีเอง)`);

if (!WRITE) {
  console.log("\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}

/* ── 4. เขียนลง Supabase (คอลัมน์กระจก name/category/price/sold/featured/badge ต้องไปด้วย) ── */
const { data: wrote, error } = await sb
  .from("products")
  .upsert(
    {
      id: ID,
      name: saved.name,
      category: saved.category,
      price: saved.price,
      sold: 0,
      featured: false,
      badge: saved.badge ?? null,
      data: saved,
    },
    { onConflict: "id" }
  )
  .select("id");
if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);
if (!wrote?.length) throw new Error("upsert ไม่โดนแถวไหนเลย — ตรวจก่อน");

/** update คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบก่อนประกาศสำเร็จ */
const { data: check, error: backErr } = await sb.from("products").select("price,data").eq("id", ID).single();
if (backErr) throw new Error(`อ่านกลับไม่ได้: ${backErr.message}`);
if ((check.data as Product).savedAt !== saved.savedAt) throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");

console.log(`\n✅ อัปรูป + บันทึกแล้ว — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
console.log(`   หน้าสินค้า: http://localhost:3005/products/${ID}`);
console.log(`   หน้าแก้ไข: http://localhost:3005/admin/products/${ID}`);
