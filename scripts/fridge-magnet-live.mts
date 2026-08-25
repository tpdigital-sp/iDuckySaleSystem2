/**
 * อัปเดตสินค้า "แม่เหล็กติดตู้เย็น" (acrylicmagnet-3) จากตารางราคาเว็บ
 *
 *   npx tsx scripts/fridge-magnet-live.mts            # ดูข้อมูลที่จะบันทึก (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/fridge-magnet-live.mts --write    # อัปรูป + เขียนลง Supabase
 *
 * ที่มา: iduckyofficial-pricelists.com/acrylicmagnet หัวข้อ "แม่เหล็กติดตู้เย็น"
 *   สคริปต์อ่านตารางสดทุกครั้ง (ยึดหัวข้อแล้วหา <table> ตัวถัดไป) — ราคาเปลี่ยนเมื่อไหร่รันซ้ำได้
 *   ขายเป็นแผ่น A3 · 7 ช่วงจำนวน · 2 แบบเป็น "เรทราคา" (การ์ดเลือกเรท มีรูป+คำอธิบาย
 *   แบบเดียวกับหมวกงานปัก hat-cap-prices.mts — ผู้ใช้สั่งปรับ 25 ส.ค. 69):
 *     • ไดคัท 100%  (แบบตัดขาดเป็นชิ้น ๆ)            300 → 220 บาท/แผ่น
 *     • SET-KIT     (ตัดขาดเป็นชิ้น ๆ + กรอบ + แผ่นรองหลัง) 350 → 280 บาท/แผ่น
 *
 * ภาพประจำเรท (ให้ลูกค้าเห็นหน้าตาแต่ละแบบ):
 *   บนหน้าเว็บมีรูปกำกับป้าย "แบบ ไดคัท 100% | SET-KIT" อยู่แล้ว ใช้ทั้งรูปได้เลยไม่ต้องครอป
 *   แกลเลอรีหน้าสินค้าดูดภาพประจำเรทเข้ามาเอง — ไม่ต้องใส่ซ้ำใน images
 *
 * ⚠️ กลุ่มตัวเลือกเดิมชื่อ "ขนาด" (นำเข้าจาก Wix) ถูกถอดออก — แบบสินค้าย้ายไปอยู่ที่เรทราคาแทน
 *    ตารางบนสุด (pricing) = เรทแรก คอลัมน์เดียว ไม่มี driver · สินค้ายังเป็นร่าง ไม่มีตะกร้าค้าง
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { hasQuoteOption, priceRange, type PriceMatrix, type Product } from "../src/lib/products";

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

const ID = "acrylicmagnet-3";
const V = "v1";
const PAGE = "https://www.iduckyofficial-pricelists.com/acrylicmagnet";
const SECTION = "แม่เหล็กติดตู้เย็น";
const UNIT = "แผ่น A3";
const DIECUT = "ไดคัท 100%";
const SETKIT = "SET-KIT";

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

/** ตารางแรกถัดจากหัวข้อ "แม่เหล็กติดตู้เย็น" (หน้านี้มีตารางแม่เหล็กอะคริลิค/ติดรถยนต์อยู่ด้วย — ยึดหัวข้อกันหยิบผิด) */
function sectionTable(): string[][] {
  for (let i = html.indexOf(SECTION); i >= 0; i = html.indexOf(SECTION, i + 1)) {
    const t = html.indexOf("<table", i);
    if (t < 0 || t - i > 2000) continue;
    const end = html.indexOf("</table>", t);
    const rows = [...html.slice(t, end).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
      [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
    );
    if (rows.length > 1 && rows[0][0] === "จำนวน" && rows[0].includes(DIECUT) && rows[0].includes(SETKIT)) return rows;
  }
  throw new Error(`หาตารางใต้หัวข้อ "${SECTION}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
}

const rows = sectionTable();
const header = rows[0]; // ["จำนวน", "ไดคัท 100%", "SET-KIT"]
const tiers = rows.slice(1).map((r) => {
  const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: r[0] };
});
tiers[tiers.length - 1].upTo = null; // "5000 แผ่นขึ้นไป" = ขั้นเปิดปลาย
if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ — ตรวจก่อน");

const cells: Record<string, number[]> = {};
for (const style of [DIECUT, SETKIT]) {
  const col = header.indexOf(style);
  cells[style] = rows.slice(1).map((r) => {
    const n = Number(String(r[col]).replace(/[^\d]/g, ""));
    if (!n) throw new Error(`ช่องราคา "${style}" แถว "${r[0]}" อ่านไม่ออก ("${r[col]}")`);
    return n;
  });
}

console.log(`📊 ตาราง "${SECTION}" จากเว็บ · ${tiers.length} ช่วงจำนวน × 2 แบบ`);
for (const style of [DIECUT, SETKIT])
  console.log(`   ${style}: ${tiers.map((t, i) => `${t.label} = ฿${cells[style][i]}`).join(" · ")}`);

/** แต่ละแบบเป็น "เรทราคา" ของตัวเอง — ตารางคอลัมน์เดียว ไม่มี driver (แบบเดียวกับหมวกงานปัก) */
const rateMatrix = (style: string): PriceMatrix => ({ unit: UNIT, driverLabels: [], tiers, cells: { "": cells[style] } });

/* ── 2. ภาพประจำเรท — รูปจริงจากท่อนเดียวกันบนหน้าเว็บ ──────────── */
const STYLE_ART: Record<string, [string, string]> = {
  // wixId จากหน้าเว็บ (มีป้ายกำกับ "แบบ ไดคัท 100% | SET-KIT" ใต้ตาราง)
  [DIECUT]: ["style-diecut", "959b83_245876d9a0b44562b216ffe4307e31b6~mv2.jpg"],
  [SETKIT]: ["style-setkit", "959b83_f98252a9446b44c19f79336107b22726~mv2.jpg"],
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
for (const [style, [name, wixId]] of Object.entries(STYLE_ART)) art[style] = await put(name, await fetchWix(wixId));
console.log(`🖼  ภาพประจำเรท ${Object.keys(art).length} ภาพ (แกลเลอรีหน้าสินค้าดูดเข้าไปเอง)`);

/* ── 3. ประกอบสินค้า (อัปเดตของเดิม — คงแท็บ/แกลเลอรี/ลำดับ/สถานะร่างไว้) ── */
const { data: row, error: readErr } = await sb.from("products").select("*").eq("id", ID).single();
if (readErr || !row) throw new Error(`อ่านสินค้า ${ID} ไม่ได้: ${readErr?.message ?? "ไม่พบ"}`);
const old = row.data as Product;

const product: Product = {
  ...old,
  price: cells[DIECUT][0],
  description:
    "แม่เหล็กติดตู้เย็น พิมพ์ลายตามสั่ง วัสดุ PET+Magnet ไม่ฉีกขาด ทนทานสูง เปียกน้ำ/โดนน้ำได้ ไม่ทิ้งคราบกาว " +
    `เลือกได้ 2 แบบ — ${DIECUT} ตัดขาดเป็นชิ้น ๆ พร้อมใช้ หรือ ${SETKIT} ตัดขาดเป็นชิ้น ๆ พร้อมกรอบและแผ่นรองหลัง — ขายเป็นแผ่น A3 ราคาปรับตามจำนวน`,
  highlights: [
    `2 แบบ: ${DIECUT} · ${SETKIT} (มีกรอบ+แผ่นรองหลัง)`,
    "PET+Magnet ไม่ฉีกขาด เปียกน้ำได้ ไม่ทิ้งคราบกาว",
    `ขายเป็นแผ่น A3 เริ่มแผ่นละ ${cells[DIECUT][0]} บาท`,
  ],
  options: [], // แบบสินค้าย้ายไปอยู่ที่เรทราคา — ไม่เหลือกลุ่มตัวเลือก
  pricing: rateMatrix(DIECUT), // ตารางบนสุด = เรทแรก (โครงเดียวกับหมวก)
  priceRates: [
    {
      id: "r1",
      label: DIECUT,
      desc: "ตัดขาดเป็นชิ้น ๆ พร้อมติดตู้เย็นได้เลย — วัสดุ PET+Magnet ไม่ฉีกขาด เปียกน้ำได้ ไม่ทิ้งคราบกาว",
      imageSrc: art[DIECUT],
      pricing: rateMatrix(DIECUT),
    },
    {
      id: "setkit",
      label: SETKIT,
      desc: "ตัดขาดเป็นชิ้น ๆ + กรอบ + แผ่นรองหลัง ครบเป็นชุด เหมาะทำของขวัญ/ของพรีเมียม",
      imageSrc: art[SETKIT],
      pricing: rateMatrix(SETKIT),
    },
  ],
  terms: [
    `*ราคาในตารางเป็นราคาต่อแผ่น A3`,
    `*${DIECUT} = แบบตัดขาดเป็นชิ้น ๆ · ${SETKIT} = แบบตัดขาดเป็นชิ้น ๆ + กรอบ + แผ่นรองหลัง`,
    "*วัสดุ PET+Magnet ไม่ฉีกขาด มีความทนทานสูง เปียกน้ำได้ โดนน้ำได้ ไม่ทิ้งคราบกาว",
    "*ทางร้านใช้สี R G B สีงานสกรีนที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
  ].join("\n"),
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
console.log(`   เรทราคา: ${saved.priceRates!.map((r) => r.label).join(" · ")} (มีภาพ+คำอธิบายครบ)`);
console.log(`   สถานะ: ${saved.hidden ? "ฉบับร่าง (คงเดิม)" : "เผยแพร่อยู่"} · แกลเลอรี ${saved.images?.length ?? 0} ภาพ (เดิม)`);

if (!WRITE) {
  console.log("\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}

/* ── 4. เขียนลง Supabase (คอลัมน์กระจก price ต้องไปด้วย) ─────────── */
const { error } = await sb
  .from("products")
  .update({ name: saved.name, category: saved.category, price: saved.price, data: saved })
  .eq("id", ID);
if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);

/** update คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบก่อนประกาศสำเร็จ */
const { data: check, error: backErr } = await sb.from("products").select("price,data").eq("id", ID).single();
if (backErr) throw new Error(`อ่านกลับไม่ได้: ${backErr.message}`);
if ((check.data as Product).savedAt !== saved.savedAt) throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");

console.log(`\n✅ อัปรูป + บันทึกแล้ว — ยังเป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
console.log(`   หน้าสินค้า: http://localhost:3005/products/${ID}`);
console.log(`   หน้าแก้ไข: http://localhost:3005/admin/products/${ID}`);
