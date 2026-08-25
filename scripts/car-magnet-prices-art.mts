/**
 * แผ่นแม่เหล็กติดรถยนต์ (acrylicmagnet-4) — ดึงราคาสดจากเว็บ + ตัวเลือกวัสดุพร้อมภาพประกอบ
 *
 *   npx tsx scripts/car-magnet-prices-art.mts            # ดูข้อมูลที่จะบันทึก (ไม่อัป ไม่เขียน)
 *   npx tsx scripts/car-magnet-prices-art.mts --write    # อัปรูป + เขียนลง Supabase
 *
 * ที่มา: iduckyofficial-pricelists.com/acrylicmagnet หัวข้อ "แผ่นแม่เหล็กติดรถยนต์"
 *   ตารางเดียวคอลัมน์ "ราคา" 7 ช่วง (แผ่น A3) 300 → 220 — สคริปต์อ่านตารางสดทุกครั้ง รันซ้ำได้เมื่อราคาเปลี่ยน
 *   วัสดุมี 2 แบบ ราคาตามตารางเดียวกัน (บนหน้าเว็บทั้งสองแบบอยู่ใต้ตารางเดียว ไม่มีตารางแยก):
 *     • PET+Magnet (งานพิมพ์ Digital) — ไม่ฉีกขาด ทนทานสูง เปียกน้ำได้ ไม่ทิ้งคราบกาว
 *     • สติ๊กเกอร์สะท้อนแสง+Magnet (งานพิมพ์ UV) — กลางวันสีเงิน กลางคืนสะท้อนแสงตอนโดนไฟส่อง
 *   วัสดุทำเป็น "เรทราคา" 2 การ์ด (priceRates + imageSrc) ไม่ใช่กลุ่มตัวเลือก pills — ผู้ใช้สั่ง 25 ส.ค. 69
 *     ให้หน้าตาเป็นการ์ดมีรูป+คำอธิบายแบบเดียวกับหมวก (เรทพิมพ์ DTF|FLEX / งานปัก) · กดการ์ดแล้วแกลเลอรีเด้งตามภาพ
 *   หมายเหตุจากหน้าเว็บ: คละลายได้ 2-3 ลาย มากกว่านั้นบวกเพิ่มลายละ 5 บาท → mixRule (รวม 3 ลาย เกิน +5/ลาย)
 *     · เริ่มต้นที่ขนาด 3x3cm · ระยะตัดตก 2-3mm (อาจมีขอบขาวบ้างตามข้อจำกัดเครื่องตัด)
 *
 * ภาพ: ครอปสี่เหลี่ยมจาก wixstatic (al_c) — ภาพประจำตัวเลือก 2 + เติมแกลเลอรี 4 (รวม hero เดิม = 5 พอดี MAX_PHOTOS)
 *   ภาพกลางวัน/กลางคืนของตัวสะท้อนแสง ยึดตามป้ายกำกับบนหน้าเว็บ (e681d931 = ตอนกลางวัน · e269b998 = ตอนกลางคืน)
 *
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

const ID = "acrylicmagnet-4";
const NAME = "แผ่นแม่เหล็กติดรถยนต์";
const V = "v1";
const PAGE = "https://www.iduckyofficial-pricelists.com/acrylicmagnet";
const UNIT = "แผ่น A3";
const MATERIAL_LABEL = "วัสดุ";
const MAT_PET = "PET+Magnet (พิมพ์ Digital)";
const MAT_REFLECT = "สติ๊กเกอร์สะท้อนแสง+Magnet (พิมพ์ UV)";

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

/**
 * ตารางถัดจากหัวข้อ "แผ่นแม่เหล็กติดรถยนต์" — หน้านี้มีตารางอื่น (แม่เหล็กอะคริลิค/ตู้เย็น) อยู่ก่อน
 * เลยเช็คหัวตารางต้องเป็น [จำนวน, ราคา] และแถวแรกต้องเป็นช่วง "แผ่น A3" กันหยิบผิด
 */
function sectionTable(): string[][] {
  for (let i = html.indexOf(NAME); i >= 0; i = html.indexOf(NAME, i + 1)) {
    const t = html.indexOf("<table", i);
    if (t < 0 || t - i > 5000) continue;
    const end = html.indexOf("</table>", t);
    const rows = [...html.slice(t, end).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
      [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
    );
    if (rows.length > 1 && rows[0][0] === "จำนวน" && rows[0][1] === "ราคา" && /แผ่น\s*A3/.test(rows[1][0])) return rows;
  }
  throw new Error(`หาตารางใต้หัวข้อ "${NAME}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
}

const rows = sectionTable();
const tiers = rows.slice(1).map((r) => {
  const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: r[0] };
});
tiers[tiers.length - 1].upTo = null; // "5000 แผ่น A3ขึ้นไป" = ขั้นเปิดปลาย
const prices = rows.slice(1).map((r) => {
  const n = Number(String(r[1]).replace(/[^\d]/g, ""));
  if (!n) throw new Error(`ช่องราคาแถว "${r[0]}" อ่านไม่ออก ("${r[1]}")`);
  return n;
});
if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ — ตรวจก่อน");

console.log(`📊 ตาราง "${NAME}" จากเว็บ · ${tiers.length} ช่วงจำนวน`);
console.log(`   ${tiers.map((t, i) => `${t.label} = ฿${prices[i]}`).join(" · ")}`);

/** ราคาเดียวทั้ง 2 วัสดุ → ตารางคอลัมน์เดียว ไม่มี driver */
const PRICING: PriceMatrix = { unit: UNIT, driverLabels: [], tiers, cells: { "": prices } };

/* ── 2. รูปจากหน้าเว็บ — ภาพประจำตัวเลือก 2 + เติมแกลเลอรี 4 ─────── */
/** [ชื่อไฟล์, wixstatic id, ป้ายในแกลเลอรี] — ป้ายกลางวัน/กลางคืน ตามคำกำกับใต้รูปบนหน้าเว็บ */
const PHOTOS: [string, string, string][] = [
  ["photo-pet-hand", "959b83_3188a6973cd64753b1b17318cb4f682c~mv2.jpg", "งานจริง PET+Magnet — พิมพ์ Digital สีสด ไดคัทตามทรง"],
  ["photo-pet-car", "959b83_ccc188e1936c4bd2a686f5c9eca8c460f003.jpg", "PET+Magnet ติดท้ายรถ — แม่เหล็กดูด ไม่ทิ้งคราบกาว"],
  ["photo-reflect-day", "959b83_e681d931fb3f4f32845a471af49705cf~mv2.jpg", "สติ๊กเกอร์สะท้อนแสง+Magnet — ตอนกลางวัน"],
  ["photo-reflect-night", "959b83_e269b9989649488ebc65490b7d70b0ae~mv2.jpg", "สติ๊กเกอร์สะท้อนแสง+Magnet — ตอนกลางคืน สะท้อนแสงตอนโดนไฟส่อง"],
];
/** ภาพประจำตัวเลือกวัสดุ — ใช้รูปงานจริงคนละแบบกับแกลเลอรี กันแกลเลอรีโชว์รูปซ้ำ */
const OPTION_ART: [string, string][] = [
  ["opt-pet", "959b83_3b0fd3018dc54c30a20d6cbed5e488f7~mv2.jpg"], // กอง PET สีสดหลายลายในมือ
  ["opt-reflect", "959b83_9919f23dfe4b4ce9aee9d8253a315052~mv2.jpg"], // แผ่นสะท้อนแสงสีเงินบนรถแดง
];

/** wixstatic แบบ fill สี่เหลี่ยมจัตุรัส (al_c = ครอปกลาง) — ไม่ต้องครอปเองด้วย sharp */
async function fetchWix(wixId: string): Promise<Buffer> {
  const res = await fetch(`https://static.wixstatic.com/media/${wixId}/v1/fill/w_1000,h_1000,al_c,q_88/file.jpg`);
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

/* ── 3. อ่านของเดิม แล้วประกอบร่างใหม่ ───────────────────────────── */
const { data: row, error: readErr0 } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (readErr0) throw new Error(`อ่านสินค้า ${ID} ไม่ได้: ${readErr0.message}`);
if (row.name !== NAME) throw new Error(`id ${ID} เป็น "${row.name}" ไม่ใช่ "${NAME}" — ตรวจก่อน`);
const old = row.data as Product;

const newPhotos: Product["images"] = [];
for (const [file, wixId, label] of PHOTOS) {
  const src = await put(file, await fetchWix(wixId));
  newPhotos.push({ emoji: "🧲", gradient: old.gradient ?? "from-sky-100 to-cyan-200", label, src });
}
const art: Record<string, string> = {};
for (const [name, wixId] of OPTION_ART) art[name] = await put(name, await fetchWix(wixId));

/** hero เดิมที่แอดมินอัปไว้ คงเป็นรูปแรก + รูปใหม่ 4 = 5 พอดี (MAX_PHOTOS) — กันรูปเดิมหาย */
const keptOld = (old.images ?? []).filter((im) => !newPhotos.some((n) => n.src === im.src));
const gallery = [...keptOld, ...newPhotos].slice(0, 5);
console.log(`🖼  แกลเลอรี ${gallery.length} ภาพ (เดิม ${keptOld.length} + ใหม่ ${newPhotos.length}) · ภาพประจำตัวเลือก ${Object.keys(art).length} ภาพ`);

/** วัสดุ 2 แบบเป็นเรทราคา (การ์ดมีรูป+คำอธิบาย) — ราคาตารางเดียวกัน · กดการ์ดแล้วแกลเลอรีเด้งไปภาพของแบบนั้น */
const RATES: Product["priceRates"] = [
  {
    id: "pet-digital",
    label: MAT_PET,
    desc: "พิมพ์ Digital สีสด คมชัด ไดคัทตามทรง — ไม่ฉีกขาด ทนทานสูง เปียกน้ำได้ ไม่ทิ้งคราบกาว",
    imageSrc: art["opt-pet"],
    pricing: PRICING,
  },
  {
    id: "reflect-uv",
    label: MAT_REFLECT,
    desc: "พิมพ์ UV ลงสติ๊กเกอร์สะท้อนแสงพื้นสีเงิน — ตอนกลางคืนสะท้อนแสงเมื่อโดนไฟส่อง เห็นชัดเพิ่มความปลอดภัย",
    imageSrc: art["opt-reflect"],
    pricing: PRICING,
  },
];

const product: Product = {
  ...old,
  price: prices[0],
  imageSrc: gallery[0]?.src ?? old.imageSrc,
  description:
    "แผ่นแม่เหล็กติดรถยนต์ พิมพ์ลายตามสั่ง ไดคัทตามทรง คิดราคาเป็นแผ่น A3 — เลือกวัสดุได้ 2 แบบ: PET+Magnet (งานพิมพ์ Digital) สีสด ไม่ฉีกขาด เปียกน้ำได้ ไม่ทิ้งคราบกาว หรือ สติ๊กเกอร์สะท้อนแสง+Magnet (งานพิมพ์ UV) ตอนกลางคืนสะท้อนแสงเมื่อโดนไฟส่อง ติด-ถอดได้ไม่ทำร้ายสีรถ",
  highlights: [
    `คิดราคาเป็นแผ่น A3 เริ่มแผ่นละ ${prices[0]} บาท`,
    "วัสดุ 2 แบบ: PET+Magnet (Digital) / สะท้อนแสง+Magnet (UV)",
    "แม่เหล็กดูดติดตัวถัง ถอดได้ ไม่ทิ้งคราบกาว",
  ],
  // วัสดุย้ายไปเป็นเรทราคาแล้ว — คงกลุ่มที่มีใน DB ไว้ (ช่องกรอกขนาดชิ้นงานมาจาก car-magnet-size-input.mts)
  options: old.options ?? [],
  images: gallery,
  pricing: PRICING,
  priceRates: RATES,
  /** คละลายได้ 2-3 ลาย มากกว่านั้นบวกเพิ่มลายละ 5 บาท (หมายเหตุบนหน้าเว็บ) */
  mixRule: { baseFee: 0, includedDesigns: 3, extraFee: 5 },
  terms: [
    "*ราคาในตารางเป็นราคาต่อแผ่น A3 — ราคาเดียวกันทั้งวัสดุ PET+Magnet (พิมพ์ Digital) และสติ๊กเกอร์สะท้อนแสง+Magnet (พิมพ์ UV)",
    "*คละลายได้ 2-3 ลาย มากกว่านั้น บวกเพิ่มลายละ 5 บาท",
    "*เริ่มต้นที่ขนาด 3x3cm · ระยะตัดตก 2-3mm (การตัดอาจมีขอบขาวบ้าง เนื่องจากข้อจำกัดของการทำงานและเครื่องตัด)",
    "*วัสดุไม่ฉีกขาด มีความทนทานสูง เปียกน้ำได้ โดนน้ำได้ ไม่ทิ้งคราบกาว",
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
console.log(`   ราคา ฿${range.min}-${range.max}/${UNIT} (เริ่มต้น ฿${saved.price}) · สถานะ: ${saved.hidden ? "ฉบับร่าง" : "เผยแพร่"}`);
console.log(`   เรทราคา (${MATERIAL_LABEL}): ${RATES.map((r) => r.label).join(" · ")} — การ์ดมีภาพครบ`);
console.log(`   คละลาย: รวม 3 ลาย เกินบวกลายละ 5 บาท · แกลเลอรี ${gallery.length} ภาพ`);

if (!WRITE) {
  console.log("\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}

/* ── 4. เขียนลง Supabase (คอลัมน์กระจก name/category/price ต้องไปด้วย) ── */
const { error } = await sb
  .from("products")
  .update({ name: saved.name, category: saved.category, price: saved.price, data: saved })
  .eq("id", ID);
if (error) throw new Error(`บันทึกไม่สำเร็จ: ${error.message}`);

/** update คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบก่อนประกาศสำเร็จ */
const { data: check, error: readErr } = await sb.from("products").select("data").eq("id", ID).single();
if (readErr) throw new Error(`อ่านกลับไม่ได้: ${readErr.message}`);
if ((check.data as Product).savedAt !== saved.savedAt) throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");

console.log(`\n✅ อัปรูป + บันทึกแล้ว`);
console.log(`   หน้าสินค้า: http://localhost:3005/products/${ID}`);
console.log(`   หน้าแก้ไข: http://localhost:3005/admin/products/${ID}`);
