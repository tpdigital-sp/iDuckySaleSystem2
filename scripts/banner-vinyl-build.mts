/**
 * เติมข้อมูลสินค้า "ป้ายไวนิล" (banner-5) จากหน้า pricelists /banner
 *
 *   npx tsx scripts/banner-vinyl-build.mts            # ดูข้อมูลที่จะบันทึก (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/banner-vinyl-build.mts --write    # อัปรูป + เขียนลง Supabase (คงสถานะฉบับร่าง)
 *
 * ที่มา: iduckyofficial-pricelists.com/banner หัวข้อ "ป้ายไวนิล (Banner Vinyl)"
 *   สคริปต์อ่านตารางสดทุกครั้ง (ยึดข้อความ "Banner Vinyl" แล้วหยิบตารางถัดไป จำนวน|ราคา หน่วย ตรม.)
 *   • ขายเป็น ตร.ม. 4 ช่วงจำนวน: 1-10=250 · 11-29=240 · 30-49=230 · 50+=220 บาท/ตร.ม.
 *   • คิดราคาขั้นต่ำ 1 ตร.ม. (1 ตร.ม. = 100×100 ซม.) · หน้ากว้างสูงสุด 148 ซม.
 *   • ไวนิลเกรดพรีเมี่ยม หนา 400 แกรม (เงา) พิมพ์ UV หมึกแท้จากญี่ปุ่น · ตัดพอดีขอบ ไม่พับขอบ
 *
 * ตัวเลือกมีภาพประกอบ (ผู้ใช้สั่ง 25 ส.ค. 69 — อยากให้เห็นว่าแต่ละแบบหน้าตาเป็นยังไง):
 *   กลุ่ม "การเจาะตาไก่" display cards 3 แบบ ฟรีทุกแบบ (เว็บ: "เจาะตาไก่ให้ฟรี!!")
 *   4 มุม / ไม่เจาะ — ภาพงานจริงจากหน้า /banner (wixstatic)
 *   + ช่องกรอกขนาดป้าย กว้าง×สูง (standardInput บังคับกรอก) กว้าง max 148 ตามหน้ากว้างผ้า
 *
 * จำนวนที่สั่ง = จำนวน ตร.ม. (แบบเดียวกับเรทตารางเมตรของ sticker-uv) — hint ใต้ช่องกรอก
 * อธิบายวิธีเทียบ ขนาด → ตร.ม. ให้ลูกค้า
 *
 * ทำงานแบบ read-modify-write บนแถวจริง (คงแท็บ/รูปเดิมที่อัปไว้แล้ว) — รันซ้ำได้
 * ⚠️ อัปรูปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
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

const ID = "banner-5";
const NAME = "ป้ายไวนิล";
const V = "v1";
const PAGE = "https://www.iduckyofficial-pricelists.com/banner";
const ANCHOR = "Banner Vinyl";
const UNIT = "ตร.ม.";
const EYELET_LABEL = "การเจาะตาไก่";
const W_LABEL = "ขนาดป้าย (กว้าง)";
const H_LABEL = "ขนาดป้าย (สูง)";

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = (file: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

/* ── 1. ดึงตารางราคาจากเว็บ ─────────────────────────────────────── */
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

function vinylTable(): string[][] {
  const a = html.indexOf(ANCHOR);
  if (a < 0) throw new Error(`หา "${ANCHOR}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
  const t = html.indexOf("<table", a);
  if (t < 0 || t - a > 10000) throw new Error(`ไม่เจอ <table> ใกล้หัวข้อ "${ANCHOR}"`);
  const rows = [...html.slice(t, html.indexOf("</table>", t)).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
    [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
  );
  if (rows.length < 2 || rows[0][0] !== "จำนวน" || rows[0][1] !== "ราคา" || !/ตรม/.test(rows[1][0]))
    throw new Error(`ตารางที่เจอไม่ใช่ตารางป้ายไวนิล (หัว "${rows[0]?.join("|")}" · แถวแรก "${rows[1]?.[0]}")`);
  return rows;
}

const rows = vinylTable();
const tiers = rows.slice(1).map((r) => {
  const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: r[0] };
});
tiers[tiers.length - 1].upTo = null; // แถวท้าย "50 ตรม.ขึ้นไป" = ขั้นเปิดปลาย
const prices = rows.slice(1).map((r) => {
  const n = Number(String(r[1]).replace(/[^\d]/g, ""));
  if (!n) throw new Error(`ช่องราคาแถว "${r[0]}" อ่านไม่ออก ("${r[1]}")`);
  return n;
});
if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ — ตรวจก่อน");
// กันโครงเว็บเปลี่ยนแล้วหยิบตารางผิดตัว: ป้ายไวนิลราคาต้องเรียงลงและช่วงแรกหลักร้อยต้น ๆ
if (prices[0] > 500 || prices.some((p, i) => i > 0 && p >= prices[i - 1]))
  throw new Error(`ราคาที่อ่านได้ผิดคาด (${prices.join(", ")}) — ตรวจหน้าเว็บก่อน`);

const pricing: PriceMatrix = { unit: UNIT, driverLabels: [], tiers, cells: { "": prices } };
console.log(`📊 ตาราง "ป้ายไวนิล (${ANCHOR})" จากเว็บ`);
console.log(`   ${tiers.map((t, i) => `${t.label}=฿${prices[i]}`).join(" · ")} (ต่อ ${UNIT})`);

/* ── 2. รูป — ภาพประจำตัวเลือกตาไก่ 3 + เสริมแกลเลอรี ─────────────── */
/**
 * ภาพงานจริงชุด Banner-Vinyl จากหน้า /banner (ผืนลายตารางแดง มีลายน้ำ "Banner–Vinyl")
 * เลือกจาก contact sheet 25 ส.ค. 69: มุมตาไก่ / ตาไก่+ตะขอยึด / ผืนบนรางหนีบ (ไม่เจาะ) / ม้วนโชว์เนื้อ
 */
const WIX = {
  eyeletCorner: "959b83_0f22ad1532a5408f9325db63d892a7e0~mv2.jpg", // ตาไก่โลหะที่มุมผืน
  eyeletHook: "959b83_984608b7125b46ca903d4443b5bc2ab6~mv2.jpg", // ตาไก่ + ตะขอยึดใช้งานจริง
  railNoEyelet: "959b83_1b937023a75d40779b68afba2c1f0307~mv2.jpg", // ผืนหนีบบนราง — งานไม่เจาะตาไก่
  rolled: "959b83_25aa1317ab3345afb695bb3560156193~mv2.jpg", // ม้วนผืนโชว์เนื้อไวนิล 400 แกรม
  foldedEdge: "959b83_2bde373f138f4f2f93362cd0b05e9f7d~mv2.jpg", // ขอบงานตัดพอดี ไม่พับขอบ
};

async function fetchWix(wixId: string, size = "w_1200,h_1200"): Promise<Buffer> {
  const u = `https://static.wixstatic.com/media/${wixId}/v1/fill/${size},al_c,q_88/file.jpg`;
  const res = await fetch(u);
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

const art: Record<keyof typeof WIX, string> = {} as never;
for (const [name, wixId] of Object.entries(WIX) as [keyof typeof WIX, string][])
  art[name] = await put(`vinyl-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, await fetchWix(wixId, "w_1200,h_900"));
console.log(`🖼  รูปจากหน้า /banner ${Object.keys(art).length} ภาพ (การ์ดตัวเลือก 3 + แกลเลอรี)`);

/* ── 3. อ่านสินค้าเดิม + ประกอบข้อมูล ───────────────────────────── */
const { data: cur, error: curErr } = await sb.from("products").select("id,name,data").eq("id", ID).maybeSingle();
if (curErr) throw new Error(`อ่านสินค้าเดิมไม่ได้: ${curErr.message}`);
if (!cur) throw new Error(`ไม่เจอสินค้า ${ID} ในฐานข้อมูล`);
if (cur.name !== NAME) throw new Error(`id ${ID} เป็นของ "${cur.name}" ไม่ใช่ "${NAME}" — ตรวจก่อน`);
const old = cur.data as Product;

const OPTIONS: ProductOption[] = [
  {
    label: EYELET_LABEL,
    display: "cards",
    note: "เจาะตาไก่ให้**ฟรีทุกแบบ** — ตาไก่โลหะ สำหรับร้อยเชือก/ผูกยึดผืนป้าย",
    choices: [
      {
        name: "เจาะตาไก่ 4 มุม",
        badge: "ฟรี",
        popular: true,
        imageSrc: art.eyeletCorner,
        desc: "เจาะตาไก่โลหะที่มุมทั้ง 4 ของผืน — มาตรฐานงานแขวนทั่วไป ร้อยเชือกผูกยึดได้ทันที",
      },
      // "เจาะตาไก่รอบขอบ" เคยมี — ผู้ใช้สั่งถอด 25 ส.ค. 69 (เหลือ 4 มุม / ไม่เจาะ)
      {
        name: "ไม่เจาะตาไก่",
        imageSrc: art.railNoEyelet,
        desc: "ตัดขอบเรียบ ไม่เจาะรู — เหมาะกับงานใส่รางหนีบ ใส่กรอบ หรือติดด้วยเทป/กาว",
      },
    ],
  },
  {
    label: W_LABEL,
    choices: [],
    display: "input",
    standardInput: true,
    input: {
      kind: "number",
      unit: "ซม.",
      min: 10,
      max: 148,
      placeholder: "เช่น 100",
      hint: "หน้ากว้างได้สูงสุด 148 ซม. — ด้านยาวกรอกช่องถัดไป (สั่งได้ตามต้องการ)",
    },
  },
  {
    label: H_LABEL,
    choices: [],
    display: "input",
    standardInput: true,
    input: {
      kind: "number",
      unit: "ซม.",
      min: 10,
      max: 2000,
      placeholder: "เช่น 200",
      hint: "ระบบคำนวณจำนวน ตร.ม. ให้อัตโนมัติจากขนาดที่กรอก — แต่ละด้านคิดขั้นต่ำ 1 เมตร และเศษพื้นที่ปัดขึ้นเต็ม ตร.ม. (เช่น 50×200 ซม. คิดเป็น 100×200 = 2 ตร.ม.)",
    },
  },
];

const gallery: Product["images"] = [
  // งานจริงชุด Banner-Vinyl ขึ้นก่อน (รูปเดิมของร่างเป็นรูปขาตั้ง Roll UP — ย้ายไปท้าย ลบเองได้ในหน้าแก้ไข)
  { emoji: "📢", gradient: "from-sky-100 to-blue-200", label: "เนื้อไวนิลเกรดพรีเมี่ยม หนา 400 แกรม (เงา)", src: art.rolled },
  { emoji: "📢", gradient: "from-sky-100 to-blue-200", label: "เจาะตาไก่โลหะให้ฟรี", src: art.eyeletCorner },
  { emoji: "📢", gradient: "from-sky-100 to-blue-200", label: "ตาไก่แข็งแรง ยึดตะขอ/ร้อยเชือกใช้งานจริง", src: art.eyeletHook },
  { emoji: "📢", gradient: "from-sky-100 to-blue-200", label: "ตัดงานพอดีขอบ ไม่พับขอบงาน", src: art.foldedEdge },
  ...(old.images ?? []).filter((im) => !im.src?.includes(`/products/${ID}/vinyl-`)).slice(0, 1),
];

const product: Product = {
  ...old,
  name: NAME,
  price: prices[0],
  imageSrc: gallery[0]?.src ?? old.imageSrc,
  description: `ป้ายไวนิล (Banner Vinyl) พิมพ์ UV หมึกแท้จากญี่ปุ่น บนไวนิลเกรดพรีเมี่ยม หนา 400 แกรม (เงา) เริ่มต้น ${prices[0]} บาท/ตร.ม. คิดราคาขั้นต่ำ 1 ตร.ม. · หน้ากว้างได้สูงสุด 148 ซม. · ตัดงานพอดีขอบ ไม่พับขอบงาน · เจาะตาไก่ให้ฟรี!!`,
  highlights: [
    `พิมพ์ UV วัสดุไวนิล หนา 400 แกรม (เงา) — เริ่มต้น ${prices[0]} บาท/ตร.ม. คิดขั้นต่ำ 1 ตร.ม.`,
    "หน้ากว้างได้สูงสุด 148 ซม. · ตัดงานพอดีขอบ ไม่พับขอบงาน",
    "เจาะตาไก่ให้ฟรี!! เลือกได้ เจาะ 4 มุม / ไม่เจาะ",
  ],
  options: OPTIONS,
  images: gallery,
  pricing,
  /**
   * 📐 จำนวน ตร.ม. ล็อกตามขนาดที่กรอก (ผู้ใช้เคาะ 25 ส.ค. 69):
   * แต่ละด้านคิดขั้นต่ำ 1 เมตร (minSide 100) แล้วปัดพื้นที่ขึ้นเต็ม ตร.ม.
   * เช่น 50×200 → คิด 100×200 = 2 ตร.ม. · 140×200 = 2.8 → คิด 3 ตร.ม.
   */
  qtyFromArea: { widthLabel: W_LABEL, heightLabel: H_LABEL, areaPerUnit: 10000, minSide: 100 },
  terms: [
    "*ราคาต่อ 1 ตร.ม. (1 ตารางเมตร = 100×100 ซม.) — แต่ละด้านคิดขั้นต่ำ 1 เมตร และเศษพื้นที่ปัดขึ้นเต็ม ตร.ม. (เช่น 50×200 ซม. คิดเป็น 100×200 = 2 ตร.ม. · 140×200 ซม. = 2.8 → คิด 3 ตร.ม.)",
    "*จำนวน 1-10 อัน คละลายได้ · 11 อันขึ้นไป คละลาย สั่งลายละ 5 อันขึ้นไป",
    "*หน้ากว้างได้สูงสุด 148 ซม. — ด้านยาวสั่งได้ตามต้องการ",
    "*ไวนิล เกรดพรีเมี่ยม หนา 400 แกรม (เงา) พิมพ์ด้วยเครื่อง UV หมึกแท้จากญี่ปุ่น",
    "*ตัดงานพอดีขอบ ไม่พับขอบงาน · เจาะตาไก่ให้ฟรี",
    "*งานพิมพ์ UV สีจะอ่อนลงประมาณ 5% — ทางร้านใช้สี RGB สีงานจริงอาจสว่างกว่าหรือดรอปลง ±5-15% ตามไฟล์งาน",
  ].join("\n"),
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: [
        "• พิมพ์ UV วัสดุไวนิล เกรดพรีเมี่ยม หนา 400 แกรม (เงา) หมึกแท้จากญี่ปุ่น",
        `• ราคาเริ่มต้น ${prices[0]} บาท/ตร.ม. — คิดราคาขั้นต่ำ 1 ตร.ม. (1 ตารางเมตร = 100×100 ซม.)`,
        "• หน้ากว้างได้สูงสุด 148 ซม. — ด้านยาวสั่งได้ตามต้องการ",
        "• ตัดงานพอดีขอบ ไม่พับขอบงาน",
        "• เจาะตาไก่ให้ฟรี!! เลือกได้ทั้งแบบเจาะ 4 มุม / ไม่เจาะ",
        "• จำนวน 1-10 อัน คละลายได้ · 11 อันขึ้นไป คละลาย สั่งลายละ 5 อันขึ้นไป",
      ].join("\n"),
    },
    // คงแท็บกลางชุดเดิมของสินค้า (วิธีสั่งงาน / การเตรียมไฟล์ / การรับประกันสินค้า)
    ...(old.tabs ?? []).filter((t) => t.title !== "รายละเอียดเพิ่มเติม"),
  ],
  seo: {
    title: `รับทำป้ายไวนิล Banner Vinyl พิมพ์ UV เริ่มต้น ${prices[0]} บาท/ตร.ม. เจาะตาไก่ฟรี`,
    keywords: [
      "รับทำป้ายไวนิล",
      "ป้ายไวนิล ราคาถูก",
      "Banner Vinyl",
      "ป้ายไวนิลพิมพ์ UV",
      "ทำป้ายร้าน",
      "ป้ายโฆษณา",
      "ป้ายไวนิลเจาะตาไก่",
      "iDucky",
    ],
    description: `รับทำป้ายไวนิล (Banner Vinyl) พิมพ์ UV หมึกแท้จากญี่ปุ่น ไวนิลเกรดพรีเมี่ยมหนา 400 แกรม เริ่มต้น ${prices[0]} บาท/ตร.ม. คิดขั้นต่ำ 1 ตร.ม. หน้ากว้างสูงสุด 148 ซม. เจาะตาไก่ให้ฟรี สั่งขนาดตามต้องการ`,
    faqs: [
      {
        q: "ป้ายไวนิล ราคาเท่าไหร่?",
        a: `เริ่มต้น ${prices[0]} บาท/ตร.ม. (1-10 ตร.ม.) ยิ่งสั่งเยอะยิ่งถูกลง จนถึง 50 ตร.ม. ขึ้นไปเหลือ ${prices[prices.length - 1]} บาท/ตร.ม. — แต่ละด้านคิดขั้นต่ำ 1 เมตร และเศษพื้นที่ปัดขึ้นเต็ม ตร.ม. (เช่น 50×200 ซม. คิดเป็น 100×200 = 2 ตร.ม.)`,
      },
      {
        q: "สั่งป้ายไวนิลขนาดใหญ่สุดได้เท่าไหร่?",
        a: "หน้ากว้างได้สูงสุด 148 ซม. ส่วนด้านยาวสั่งได้ตามต้องการ — ระบุขนาด กว้าง×สูง ได้เลยในหน้าสินค้า ระบบคำนวณจำนวนตารางเมตรและราคาให้อัตโนมัติ (เศษพื้นที่ปัดขึ้นเต็ม ตร.ม.)",
      },
      {
        q: "เจาะตาไก่คิดเงินเพิ่มไหม?",
        a: "เจาะตาไก่ให้ฟรี เลือกได้ทั้งเจาะ 4 มุม หรือไม่เจาะสำหรับงานใส่รางหนีบ/กรอบ",
      },
      {
        q: "ป้ายไวนิลใช้วัสดุอะไร พิมพ์ระบบไหน?",
        a: "ไวนิลเกรดพรีเมี่ยม หนา 400 แกรม ผิวเงา พิมพ์ด้วยเครื่อง UV หมึกแท้จากญี่ปุ่น สีสดคมชัด ใช้ได้ทั้งงานในร่มและกลางแจ้ง — ตัดงานพอดีขอบ ไม่พับขอบงาน",
      },
    ],
  },
};

const range = priceRange(product);
const saved: Product = {
  ...product,
  priceMin: range.min,
  priceMax: range.max,
  hasQuote: hasQuoteOption(product),
  savedAt: new Date().toISOString(),
};

console.log(`\n📦 ${saved.name} (${ID}) · สถานะ: ${saved.hidden ? "ฉบับร่าง" : "เผยแพร่"}`);
console.log(`   ราคา ฿${range.min}-${range.max}/${UNIT} (เริ่มต้น ฿${saved.price})`);
console.log(`   ตัวเลือก: ${OPTIONS.map((o) => (o.display === "input" ? `${o.label} (ช่องกรอก)` : `${o.label} ${o.choices.length} แบบ (การ์ดมีรูป)`)).join(" · ")}`);
console.log(`   แกลเลอรี ${gallery.length} ภาพ · แท็บ ${saved.tabs!.length} · FAQ ${saved.seo!.faqs!.length} ข้อ`);

if (!WRITE) {
  console.log("\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}

/* ── 4. เขียนลง Supabase (คอลัมน์กระจก name/price ต้องไปด้วย) ────── */
const { error } = await sb.from("products").update({ name: saved.name, price: saved.price, data: saved }).eq("id", ID);
if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);

/** update คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบก่อนประกาศสำเร็จ */
const { data: check, error: readErr } = await sb.from("products").select("data").eq("id", ID).single();
if (readErr) throw new Error(`อ่านกลับไม่ได้: ${readErr.message}`);
if ((check.data as Product).savedAt !== saved.savedAt) throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");

console.log(`\n✅ อัปรูป + บันทึกแล้ว — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
console.log(`   หน้าสินค้า: http://localhost:3005/products/${ID}`);
console.log(`   หน้าแก้ไข: http://localhost:3005/admin/products/${ID}`);
