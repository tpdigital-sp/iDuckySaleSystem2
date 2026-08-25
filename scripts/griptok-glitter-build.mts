/**
 * สร้างสินค้าใหม่ "GRIPTOK Glitter" (id: griptok-glitter) — กริ๊บต๊อกกากเพชร ฐานใสเขย่าวิ้ง
 *
 *   npx tsx scripts/griptok-glitter-build.mts            # ดูข้อมูล + เซฟภาพลง scratchpad_out/ (ไม่เขียน DB)
 *   npx tsx scripts/griptok-glitter-build.mts --write    # อัปรูป + เขียนลง Supabase (ฉบับร่าง)
 *
 * ที่มา: iduckyofficial-pricelists.com/griptok หัวข้อ "GRIPTOK  Glitter" — อ่านตารางสดทุกครั้ง
 *   • ตารางเดียว คอลัมน์ "ราคา" ใช้ทั้งทรงกลมและทรงหัวใจ (ราคาเท่ากันสองทรง)
 *   ⚠️ หน้าเดียวกันมีตาราง "จำนวน|ราคา" หน้าตาเหมือนกันของ กระจกพับ/PUSH-PULL อยู่ก่อนหน้า
 *     — ต้องยึดตารางแรก "หลัง" ตำแหน่งคำว่า Glitter ตัวสุดท้ายในหน้า (nav อยู่ต้นหน้า ไม่ชน)
 *   • กติกาคละลายชุดเดียวกับ griptok-th: 1-10 ชิ้นคละได้อิสระ · 11 ชิ้นขึ้นไปคละลาย/คละขนาด
 *     ขั้นต่ำลายละ 5 ชิ้น → priceRates r1 (minQty 11, minPerDesign 5, freeMixBelowQty 11) + tierByDesign
 *
 * โครง/แท็บ/เงื่อนไข ยึดตามสินค้าพี่น้อง griptok-th (กริ๊บต๊อกทรงกลม|ทรงหัวใจ) ให้เข้าชุดกัน
 * ภาพ: รูปจริง 4 รูปจากหมวด Glitter บนหน้า pricelists (wixstatic)
 *   • การ์ดทรงกลม = รูปสตูดิโอพื้นขาว ครอป 16:10 · การ์ดทรงหัวใจ = ครอปสี่เหลี่ยมจากภาพปกคลิป
 *     (ตัดแถบข้อความ "Griptok uv - glitter" ด้านบนออก)
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

const ID = "griptok-glitter";
const NAME = "GRIPTOK Glitter";
const CATEGORY = "phone-gadget"; // หมวดเดียวกับ griptok-th / griptok-magsafe
const V = "v1"; // ⚠️ ห้ามอัปทับชื่อไฟล์เดิม (Next/CDN แคช) — แก้รูปครั้งหน้าขยับเป็น v2
const PAGE = "https://www.iduckyofficial-pricelists.com/griptok";
const UNIT = "ชิ้น";
const GROUP_SHAPE = "แบบ"; // = driverLabels[0] — ห้ามเปลี่ยนโดยไม่แก้ pricing.cells (กับดักแกนตารางราคา)
const SHAPE_ROUND = "ทรงกลม";
const SHAPE_HEART = "ทรงหัวใจ";

const OUT = new URL("../scratchpad_out/griptok-glitter/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = (file: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

/* ── 1. ดึงตารางราคา Glitter จากเว็บ ─────────────────────────────── */
const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s: string) => decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const html = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } }).then((r) => {
  if (!r.ok) throw new Error(`ดึงหน้า ${PAGE} ไม่ได้ — HTTP ${r.status}`);
  return r.text();
});

// ตาราง Glitter = <table> แรกหลังหัวข้อหมวด "GRIPTOK  Glitter" (rich text ใช้ &nbsp; คั่น — มีจุดเดียวบนหน้า
// ⚠️ ห้ามใช้ lastIndexOf("Glitter") เฉย ๆ — ท้ายไฟล์มี JSON warmup ของ Wix ที่มีคำนี้ซ้ำหลังตารางทั้งหมด)
const anchor = html.indexOf("GRIPTOK&nbsp; Glitter");
if (anchor < 0) throw new Error("หาหัวข้อ GRIPTOK&nbsp; Glitter บนหน้าไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน");
const t = html.indexOf("<table", anchor);
if (t < 0) throw new Error("หา <table> หลังหัวข้อ Glitter ไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน");
const rows = [...html.slice(t, html.indexOf("</table>", t)).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
  [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
);

if (JSON.stringify(rows[0]) !== JSON.stringify(["จำนวน", "ราคา"]))
  throw new Error(`หัวตาราง Glitter ไม่ตรงคาด: ${rows[0]?.join("|")} — โครงหน้าเว็บอาจเปลี่ยน`);
const body = rows.slice(1);
const tiers = body.map((r, i) => {
  if (!/ชิ้น/.test(r[0])) throw new Error(`แถวช่วงจำนวนไม่ตรงคาด: "${r[0]}"`);
  const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
  if (i < body.length - 1 && !m) throw new Error(`อ่านช่วงจำนวนแถว "${r[0]}" ไม่ได้`);
  return { upTo: i === body.length - 1 ? null : Number(m![2]), label: r[0] };
});
const prices = body.map((r) => {
  const n = Number(String(r[1]).replace(/[^\d]/g, ""));
  if (!n) throw new Error(`แถว "${r[0]}" ราคาอ่านไม่ได้ (${r[1]})`);
  return n;
});
if (prices.some((p, i) => i > 0 && p >= prices[i - 1]))
  throw new Error(`ราคาไม่ไล่ลงตามจำนวน (${prices.join("/")}) — อาจจับตารางผิดหมวด ตรวจหน้าเว็บก่อน`);

console.log(`📊 ตาราง Glitter จากเว็บ: ${tiers.map((tr, i) => `${tr.label} ฿${prices[i]}`).join(" · ")}`);

// ราคาเท่ากันทั้งสองทรง — คงแกน "แบบ" ไว้ให้เข้าชุด griptok-th และโชว์ราคาต่อทรงบนการ์ด
const pricing: PriceMatrix = {
  unit: UNIT,
  driverLabels: [GROUP_SHAPE],
  tiers,
  cells: { [SHAPE_ROUND]: prices, [SHAPE_HEART]: prices },
};

/* ── 2. รูปภาพจากหมวด Glitter บนหน้า pricelists ──────────────────── */
const WIX = {
  roundStudio: "959b83_cbcef91a43cb4a0398e6977a06af29f4~mv2.jpg", // ทรงกลม สตูดิโอพื้นขาว (โลโก้ iducky)
  roundPink: "959b83_49ada9433d4f493595e4b649f6fa7e48~mv2.jpg", // ทรงกลม ฉากม้านั่งชมพู
  coverRound: "959b83_312ce8de422548ac93f75d788a9cf9fef003.jpg", // ภาพปกคลิป ทรงกลม (มีตัวหนังสือ)
  coverHeart: "959b83_806d48c4fe594d2480b1a58b22bf1842f003.jpg", // ภาพปกคลิป ทรงหัวใจ (มีตัวหนังสือ)
};

async function fetchWix(wixId: string): Promise<Buffer> {
  const u = wixId.includes("~mv2")
    ? `https://static.wixstatic.com/media/${wixId}/v1/fit/w_1600,h_1600,al_c,q_88/file.jpg`
    : `https://static.wixstatic.com/media/${wixId}`;
  const res = await fetch(u);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function put(name: string, buf: Buffer): Promise<string> {
  const file = `${name}-${V}.jpg`;
  writeFileSync(`${OUT}${file}`, buf); // เก็บตัวอย่างไว้ดูก่อนเขียนจริงเสมอ
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

const [roundStudio, roundPink, coverRound, coverHeart] = await Promise.all([
  fetchWix(WIX.roundStudio),
  fetchWix(WIX.roundPink),
  fetchWix(WIX.coverRound),
  fetchWix(WIX.coverHeart),
]);

// การ์ดทรงกลม: รูปสตูดิโอ ครอป 16:10 ให้ตัวเรือนเด่น (สไตล์เดียวกับการ์ด shape ของ griptok-th)
const cardRoundBuf = await sharp(roundStudio)
  .metadata()
  .then((m) =>
    sharp(roundStudio)
      .extract({ left: 0, top: Math.round(m.height! * 0.083), width: m.width!, height: Math.round(m.width! * 0.625) })
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer()
  );
// การ์ดทรงหัวใจ: ภาพปกคลิป 720×1280 ครอปสี่เหลี่ยมใต้แถบข้อความ "uv - glitter" (ขอบล่างข้อความ ~y450)
const cardHeartBuf = await sharp(coverHeart)
  .extract({ left: 0, top: 450, width: 720, height: 720 })
  .jpeg({ quality: 90 })
  .toBuffer();

const art = {
  cardRound: await put("shape-round-glitter", cardRoundBuf),
  cardHeart: await put("shape-heart-glitter", cardHeartBuf),
  photoStudio: await put("photo-round-studio", await sharp(roundStudio).jpeg({ quality: 88 }).toBuffer()),
  photoPink: await put("photo-round-pink", await sharp(roundPink).jpeg({ quality: 88 }).toBuffer()),
  coverRound: await put("cover-round", coverRound),
  coverHeart: await put("cover-heart", coverHeart),
};
console.log(`🖼  รูป ${Object.keys(art).length} ไฟล์ — ตัวอย่างอยู่ที่ ${OUT}`);

/* ── 3. ประกอบสินค้า ─────────────────────────────────────────────── */
const OPTIONS: ProductOption[] = [
  {
    label: GROUP_SHAPE, // แกนตารางราคา — ชื่อกลุ่ม/ชื่อตัวเลือกห้ามแก้โดยไม่แก้ pricing.cells
    display: "cards",
    note: "ฐานใสบรรจุกากเพชร เขย่าแล้ววิ้งได้ทั้งสองทรง — พิมพ์ลาย UV ตามไฟล์ของคุณ",
    choices: [
      { name: SHAPE_ROUND, imageSrc: art.cardRound, desc: "ตัวเรือนทรงกลม ฐานใส กากเพชรลอยรอบลาย เขย่าแล้ววิ้งระยิบ" },
      { name: SHAPE_HEART, imageSrc: art.cardHeart, desc: "ตัวเรือนทรงหัวใจ ฐานใส กากเพชรลอยรอบลาย น่ารักสายหวาน" },
    ],
  },
];

const gallery: Product["images"] = [
  { emoji: "💍", gradient: "from-purple-100 to-fuchsia-200", label: "GRIPTOK Glitter ทรงกลม — กากเพชรลอยในฐานใส", src: art.photoPink },
  { emoji: "💍", gradient: "from-purple-100 to-fuchsia-200", label: "งานจริง — พิมพ์ลาย UV กากเพชรวิ้งรอบตัวการ์ตูน", src: art.photoStudio },
  { emoji: "💍", gradient: "from-purple-100 to-fuchsia-200", label: "ทรงหัวใจ — เขย่าแล้วกากเพชรไหลวิ้งทั้งชิ้น", src: art.cardHeart },
  { emoji: "💍", gradient: "from-purple-100 to-fuchsia-200", label: "GRIPTOK UV Glitter ทรงหัวใจ", src: art.coverHeart },
  { emoji: "💍", gradient: "from-purple-100 to-fuchsia-200", label: "GRIPTOK UV Glitter ทรงกลม", src: art.coverRound },
];

const product: Product = {
  id: ID,
  name: NAME,
  category: CATEGORY,
  price: prices[0],
  emoji: "💍",
  gradient: "from-purple-100 to-fuchsia-200",
  imageSrc: gallery[0].src,
  rating: 5,
  sold: 0,
  description:
    `กริ๊บต๊อกกากเพชร (Glitter Griptok) ฐานใสบรรจุกากเพชร เขย่าแล้ววิ้งระยิบทั้งชิ้น พิมพ์ลายของคุณด้วยระบบ UV Printing สีสวยคมชัด มีทรงกลมและทรงหัวใจ ไม่มีขั้นต่ำในการสั่งผลิต เริ่มต้นชิ้นละ ${prices[0]} บาท สั่งเยอะลดถึงชิ้นละ ${prices[prices.length - 1]} บาท ทำขายหรือแจกเป็นของขวัญก็น่ารัก`,
  highlights: [
    `ไม่มีขั้นต่ำ เริ่มชิ้นละ ${prices[0]} บาท (สั่งเยอะลดถึงชิ้นละ ${prices[prices.length - 1]} บาท)`,
    "ฐานใสบรรจุกากเพชร เขย่าแล้ววิ้งระยิบ — มีทรงกลม | ทรงหัวใจ ราคาเดียวกัน",
    "พิมพ์ลาย UV คมชัด จับถนัดมือ ใช้เป็นขาตั้งมือถือได้",
  ],
  options: OPTIONS,
  images: gallery,
  pricing,
  tierByDesign: true,
  priceRates: [
    {
      id: "r1",
      label: "เรทที่ 1",
      minQty: 11,
      minPerDesign: 5,
      freeMixBelowQty: 11,
      pricing,
    },
  ],
  terms: [
    "*ไม่มีขั้นต่ำในการสั่งผลิต — พิมพ์ด้วยระบบ UV Printing",
    "*1-10 ชิ้น สามารถคละลายได้อิสระ · ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย คละขนาด ขั้นต่ำลายละ 5 ชิ้น",
    "*มีทรงกลม | ทรงหัวใจ ราคาเดียวกันทั้งสองทรง",
    "*สั่งตั้งแต่ 24 ชิ้นขึ้นไป ฟรีแพ็คเกจ (ต้องคละลาย/จำนวน 24 30 36 42 ... บวกเพิ่มทีละ 6 ชิ้น)",
    "*ทางร้านใช้สี R G B สีงานสกรีนที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
  ].join("\n"),
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: [
        "• กริ๊บต๊อกกากเพชร ฐานใสบรรจุกากเพชรวิ้ง เขย่าแล้วกากเพชรไหลระยิบทั้งชิ้น",
        "• มีทรงกลม | ทรงหัวใจ — ราคาเดียวกันทั้งสองทรง",
        "• พิมพ์ด้วยระบบ UV Printing สีสวยคมชัด ไม่มีขั้นต่ำในการสั่งผลิต",
        "• 1-10 ชิ้น สามารถคละลายได้อิสระ",
        "• ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย คละขนาด ขั้นต่ำลายละ 5 ชิ้น",
        "• สั่งตั้งแต่ 24 ชิ้นขึ้นไป ฟรีแพ็คเกจ (ต้องคละลาย/จำนวน 24 30 36 42 ... บวกเพิ่มทีละ 6 ชิ้น ไม่รับเศษที่หาร 6 ไม่ลงตัว)",
        "• ทางร้านมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องต่างกันประมาณ 5-10% มีโอกาสที่สีแต่ละรอบไม่เหมือนกันหากผลิตคนละเครื่อง",
        "• ทางร้านใช้สี R G B สีงานสกรีนอาจสว่างกว่าหรือดรอปลง ±5% ถึง ±15% ตามไฟล์งาน",
      ].join("\n"),
    },
    {
      title: "วิธีสั่งงาน",
      text: 'สั่งผ่านหน้าเว็บนี้ได้เลย::\n• เลือกทรง จำนวน แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"\n• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น วันที่ต้องการใช้งาน\n• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\nหรือสั่งทางอีเมล::\n• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n• ระบุรายละเอียด: ทรงที่เลือก · จำนวน · วันที่ใช้งาน (ถ้ามี)\n• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)',
    },
    {
      title: "การเตรียมไฟล์",
      text: "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด",
    },
    {
      title: "การรับประกันสินค้า",
      text: "รับเคลม::\n• สีเพี้ยนเกิน 10-15%\n• จำนวนที่ได้รับไม่ครบถ้วน\n• สีหรืออะไหล่ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\nไม่รับเคลม::\n• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n• สินค้าชำรุดจากการใช้งานมาแล้ว\n\nระยะเวลาในการเคลม::\nภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    },
  ],
  seo: {
    title: `รับทำ GRIPTOK Glitter กริ๊บต๊อกกากเพชร พิมพ์ลายตามสั่ง เริ่มต้น ${prices[0]} บาท`,
    keywords: [
      "GRIPTOK Glitter",
      "กริ๊บต๊อกกากเพชร",
      "กริ๊บต๊อกกลิตเตอร์",
      "รับทำกริ๊บต๊อก",
      "กริ๊บต๊อก",
      "Griptok",
      "กริ๊บต๊อกเขย่า",
      "ที่ติดหลังมือถือ",
      "พิมพ์ลายตามสั่ง",
      "iDucky",
    ],
    description: `รับทำ GRIPTOK Glitter กริ๊บต๊อกกากเพชร ฐานใสเขย่าวิ้ง พิมพ์ลาย UV ของคุณเอง มีทรงกลมและทรงหัวใจ ไม่มีขั้นต่ำ เริ่มชิ้นละ ${prices[0]} บาท สั่งเยอะลดถึงชิ้นละ ${prices[prices.length - 1]} บาท ตรวจแบบก่อนผลิตทุกชิ้น`,
    faqs: [
      {
        q: "GRIPTOK Glitter ราคาเท่าไหร่?",
        a: `เริ่มต้นชิ้นละ ${prices[0]} บาท (1-10 ชิ้น) ยิ่งสั่งเยอะยิ่งถูกลง — 1000 ชิ้นขึ้นไปเหลือชิ้นละ ${prices[prices.length - 1]} บาท ทรงกลมและทรงหัวใจราคาเดียวกัน ไม่มีขั้นต่ำในการสั่ง ดูตารางราคาเต็มได้ในหน้าสินค้า`,
      },
      {
        q: "กริ๊บต๊อกกากเพชร ต่างจากกริ๊บต๊อกธรรมดายังไง?",
        a: "ตัวเรือนเป็นฐานใสบรรจุกากเพชรด้านใน เขย่าแล้วกากเพชรไหลวิ้งระยิบรอบลายที่พิมพ์ ลายพิมพ์ด้วยระบบ UV Printing สีสวยคมชัดเหมือนกริ๊บต๊อกปกติ แต่ได้ลูกเล่นวิ้ง ๆ เพิ่ม",
      },
      {
        q: "มีทรงอะไรให้เลือกบ้าง?",
        a: "มี 2 ทรง — ทรงกลม และ ทรงหัวใจ ราคาเดียวกันทั้งสองทรง เลือกได้ในหน้าสินค้า พร้อมภาพตัวอย่างงานจริงประกอบ",
      },
      {
        q: "สั่งคละลายได้ไหม?",
        a: "1-10 ชิ้น คละลายได้อิสระ · ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย คละขนาดได้ ขั้นต่ำลายละ 5 ชิ้น · สั่ง 24 ชิ้นขึ้นไป (จำนวนหาร 6 ลงตัว) ฟรีแพ็คเกจ",
      },
      {
        q: "รับทำเป็นลายของตัวเองได้ไหม?",
        a: "ได้ — ส่งไฟล์ลาย .Ai .Psd .PNG หรือพื้นหลังใสมาตอนสั่งซื้อ ทีมงานจัดทำแบบให้ตรวจและอนุมัติก่อนเริ่มผลิตทุกครั้ง",
      },
    ],
  },
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
console.log(`   ตัวเลือก: ${OPTIONS.map((o) => `${o.label} ${o.choices.length} แบบ`).join(" · ")}`);
console.log(`   แกลเลอรี ${gallery.length} ภาพ · แท็บ ${saved.tabs!.length} · FAQ ${saved.seo!.faqs!.length} ข้อ · สถานะ: ฉบับร่าง`);

if (!WRITE) {
  console.log(`\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — เปิดดูรูปที่ ${OUT} แล้วใส่ --write เพื่อบันทึกจริง)`);
  process.exit(0);
}

/* ── 4. เขียนลง Supabase (คอลัมน์กระจก name/category/price ต้องไปด้วย) ── */
const { data: existing, error: exErr } = await sb.from("products").select("id,name").eq("id", ID).maybeSingle();
if (exErr) throw new Error(`เช็คสินค้าเดิมไม่ได้: ${exErr.message}`);
if (existing && existing.name !== NAME)
  throw new Error(`id ${ID} มีอยู่แล้วเป็นของ "${existing.name}" — ตรวจก่อน`);

if (existing) {
  const { error } = await sb.from("products").update({ name: saved.name, category: saved.category, price: saved.price, data: saved }).eq("id", ID);
  if (error) throw new Error(`อัปเดตไม่สำเร็จ: ${error.message}`);
  console.log(`\n✏️  เขียนทับ ${ID} เดิม (รันซ้ำ)`);
} else {
  const { data: maxRow } = await sb.from("products").select("sort").order("sort", { ascending: false }).limit(1).single();
  const sort = (maxRow?.sort ?? 0) + 1;
  const { error } = await sb.from("products").insert({
    id: ID, name: saved.name, category: saved.category, price: saved.price, sold: 0, featured: false, sort, data: saved,
  });
  if (error) throw new Error(`สร้างสินค้าไม่สำเร็จ: ${error.message}`);
  console.log(`\n➕ สร้างสินค้าใหม่ (sort ${sort})`);
}

/** update/insert คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบก่อนประกาศสำเร็จ */
const { data: check, error: readErr } = await sb.from("products").select("name,category,data").eq("id", ID).single();
if (readErr) throw new Error(`อ่านกลับไม่ได้: ${readErr.message}`);
if (check.name !== NAME || check.category !== CATEGORY || (check.data as Product).savedAt !== saved.savedAt)
  throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");

console.log(`✅ อัปรูป + บันทึกแล้ว — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
console.log(`   หน้าสินค้า: http://localhost:3005/products/${ID}`);
console.log(`   หน้าแก้ไข: http://localhost:3005/admin/products/${ID}`);
