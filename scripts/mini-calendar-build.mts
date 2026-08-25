/**
 * เติมข้อมูลสินค้า "Mini Calendar" (id: mini-calendar — ตัวที่ import ไว้แล้ว) ให้ครบตามเว็บ pricelists
 *
 *   npx tsx scripts/mini-calendar-build.mts            # อ่านตารางสด + เซฟภาพลง scratchpad_out/ (ไม่เขียน DB)
 *   npx tsx scripts/mini-calendar-build.mts --write    # อัปรูป/คลิป + เขียนลง Supabase
 *
 * ที่มา: iduckyofficial-pricelists.com/calendar หัวข้อ "Mini Calendar"
 *   สคริปต์อ่านตารางสดทุกครั้ง (ยึดหัวข้อแล้วหา <table> ตัวถัดไป) — ราคาเปลี่ยนเมื่อไหร่รันซ้ำได้
 *   ตาราง: จำนวน | ราคา — 1-10=95 · 11-29=90 · 30-49=85 · 50-99=80 · 100-499=70 · 500-999=60 · 1000+=55
 *   สเปคใต้ตาราง: กระดาษ 6×8 ซม. หนา 260 แกรม · ฐานกระดาษอาร์ตขาว 400 แกรม · ห่วงสันเกลียวสีขาว
 *   Add On: เคลือบเงา/ด้าน ด้านละ 10 ต่อ A3 · เคลือบพิเศษ (เนื้อทราย/กลิสเตอร์/โฮโลแกรม) ชุดละ 40 ต่อ A3
 *   คละลาย: 1-10 เล่ม อิสระ · 11+ คละลายละ 5 เล่ม (บนเว็บพิมพ์ "11เล่น" — regex เผื่อไว้แล้ว)
 *
 * วิธีโมเดลราคาเคลือบ (กลไก sheetFee ที่มีอยู่แล้ว — ค่าเคลือบงานกระดาษคิดต่อแผ่น A3 ปัดขึ้น):
 *   กลุ่ม "เคลือบ" ตั้ง sheetFee ชี้กลุ่มตัวเอง + ทุกตัวเลือก perSheet 1
 *   = 1 เล่ม ใช้ A3 ประมาณ 1 แผ่น (เล่มหนึ่งมีกระดาษ 6×8 ซม. ~13 หน้า วางบน A3 ได้ ~21 ชิ้น)
 *   ⚠️ ถ้าหน้างานจริง 1 แผ่น A3 ทำได้มากกว่า 1 เล่ม แก้ตัวเลข PER_SHEET ตัวเดียวแล้วรันซ้ำ
 *
 * ภาพ/คลิป (ผู้ใช้สั่ง 25 ส.ค. 69 — ตัวเลือกต้องมีภาพประกอบว่าแต่ละแบบหน้าตายังไง):
 *   แกลเลอรี 5 ใบ = รูปงานจริง Mini Calendar จากหน้า /calendar (ชุดรูปเล่มจิ๋วมีโลโก้ iDucky —
 *   ระวัง: รูปชุดก่อนหัวข้อเป็นของ "ปฎิทินตั้งโต๊ะ ไดคัทตามทรง" คนละสินค้า ห้ามหยิบ)
 *   ตัวเลือกเคลือบ = การ์ดเล่นคลิปฟิล์มจริงจากหน้า /laminate (แพทเทิร์น videoSrc griptok-mirror-fold —
 *   คลิป wixstatic: id เดียวกับโปสเตอร์ f00x) · ฟิล์มพิเศษครบ 10 ลายตามหน้า ตย.ฟิล์มเคลือบ
 *   ⚠️ ห้ามอัปทับชื่อไฟล์เดิม (Next/CDN แคช) — แก้รูปครั้งหน้าขยับ V เป็น v2
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

const ID = "mini-calendar";
const NAME = "Mini Calendar";
const PAGE = "https://www.iduckyofficial-pricelists.com/calendar";
const UNIT = "เล่ม";
const V = "v1"; // ⚠️ แก้รูป/คลิปครั้งหน้าขยับเป็น v2 (กันแคช)
const PER_SHEET = 1; // 1 เล่ม ≈ A3 1 แผ่น (ดูหมายเหตุหัวไฟล์ — หน้างานจริงต่างจากนี้ แก้ตรงนี้ที่เดียว)
const GROUP_COAT = "เคลือบ";
const GROUP_FILM = "ลายฟิล์มเคลือบพิเศษ";
const CHOICE_SPECIAL = "เคลือบพิเศษ";

const OUT = new URL("../scratchpad_out/mini-calendar/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = (file: string) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

/* ── 1. ดึงตารางราคา + สเปคสดจากเว็บ ─────────────────────────────── */
const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s: string) => decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const html = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } }).then((r) => {
  if (!r.ok) throw new Error(`ดึงหน้า ${PAGE} ไม่ได้ — HTTP ${r.status}`);
  return r.text();
});

const anchor = html.indexOf("Mini Calendar");
if (anchor < 0) throw new Error("หาหัวข้อ Mini Calendar บนหน้าเว็บไม่เจอ — โครงหน้าอาจเปลี่ยน");
const t = html.indexOf("<table", anchor);
if (t < 0) throw new Error("หา <table> ถัดจากหัวข้อ Mini Calendar ไม่เจอ");
const tEnd = html.indexOf("</table>", t);
const rows = [...html.slice(t, tEnd).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
  [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
);

const head = rows[0]?.join("|") ?? "";
if (!/จำนวน/.test(head) || !/ราคา/.test(head))
  throw new Error(`หัวตาราง Mini Calendar ไม่ตรงคาด: "${head}" — โครงหน้าเว็บอาจเปลี่ยน`);

const body = rows.slice(1);
const tiers = body.map((r, i) => {
  if (!/เล่ม/.test(r[0])) throw new Error(`แถวช่วงจำนวนไม่ตรงคาด: "${r[0]}"`);
  const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: i === body.length - 1 ? null : m ? Number(m[2]) : null, label: r[0] };
});
if (tiers.some((tt, i) => i < tiers.length - 1 && !tt.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ");
const prices = body.map((r) => {
  const n = Number(String(r[1]).replace(/[^\d]/g, ""));
  if (!n) throw new Error(`แถว "${r[0]}" ราคาอ่านไม่ได้ (${r[1]})`);
  return n;
});

// สเปค + Add On อยู่ระหว่างตารางกับหัวข้อ "ปฎิทินผ้าแคนวาส" ถัดไป
const nextSec = html.indexOf("ปฎิทินผ้าแคนวาส", tEnd);
const sec = strip(html.slice(tEnd, nextSec > 0 ? nextSec : tEnd + 250000));
for (const need of ["กว้าง 6", "สูง 8", "400 แกรม", "260", "ห่วงสันเกลียว"])
  if (!sec.includes(need)) throw new Error(`สเปค "${need}" หายจากหน้าเว็บ — ตรวจก่อน (ข้อความที่อ่านได้: ${sec.slice(0, 300)})`);

const mGloss = sec.match(/ด้านละ\s*(\d+)\s*บาท\s*ต่อ\s*A3/i);
if (!mGloss) throw new Error("หาค่าเคลือบเงา/ด้าน 'ด้านละ .. บาท ต่อ A3' ไม่เจอ — ตรวจหน้าเว็บก่อน");
const GLOSS_FEE = Number(mGloss[1]);
const mSpecial = sec.match(/ชุดละ\s*(\d+)\s*บาท\s*ต่อ\s*A3/i);
if (!mSpecial) throw new Error("หาค่าเคลือบพิเศษ 'ชุดละ .. บาท ต่อ A3' ไม่เจอ — ตรวจหน้าเว็บก่อน");
const SPECIAL_FEE = Number(mSpecial[1]);

// คละลาย: "จำนวน 1-10 เล่ม คละลายได้" + "จำนวน 11เล่นขึ้นไป คละลายละ 5 เล่มขึ้นไป" (เว็บพิมพ์ "เล่น" — เผื่อ)
const mMixFree = sec.match(/1\s*-\s*(\d+)\s*เล่ม\s*คละลายได้/);
const mMixMin = sec.match(/คละลายละ\s*(\d+)\s*เล่ม/);
if (!mMixFree || !mMixMin) throw new Error("กติกาคละลายบนหน้าเว็บอ่านไม่ได้ — ตรวจก่อน");
const FREE_MIX_BELOW = Number(mMixFree[1]) + 1; // 1-10 อิสระ → เริ่มนับโควตาที่ 11
const MIN_PER_DESIGN = Number(mMixMin[1]);

const PRICING: PriceMatrix = {
  unit: UNIT,
  driverLabels: [],
  tiers,
  cells: { "": prices },
  colLabel: "ราคา",
};

console.log(`📊 ตารางจากเว็บ (${tiers.map((x) => x.label).join(" · ")})`);
console.log(`   ราคา: ${prices.map((p) => `฿${p}`).join(" / ")}`);
console.log(`   เคลือบเงา/ด้าน ด้านละ ฿${GLOSS_FEE}/แผ่น A3 · เคลือบพิเศษ ฿${SPECIAL_FEE}/แผ่น A3 (คิด ${PER_SHEET} ${UNIT}/แผ่น)`);
console.log(`   คละลาย: 1-${FREE_MIX_BELOW - 1} ${UNIT} อิสระ · ${FREE_MIX_BELOW}+ คละลายละ ${MIN_PER_DESIGN} ${UNIT}`);

/* ── 2. รูปแกลเลอรี (หน้า /calendar) + คลิปฟิล์มเคลือบ (หน้า /laminate) ── */
async function fetchBuf(u: string): Promise<Buffer> {
  const res = await fetch(u);
  if (!res.ok) throw new Error(`โหลด ${u} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function putJpg(name: string, wixId: string): Promise<string> {
  const file = `${name}-${V}.jpg`;
  const buf = await sharp(await fetchBuf(`https://static.wixstatic.com/media/${wixId}`))
    .rotate()
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  writeFileSync(`${OUT}${file}`, buf); // เก็บตัวอย่างไว้ดูก่อนเขียนจริงเสมอ
  if (WRITE) {
    const up = await sb.storage
      .from("product-images")
      .upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
    if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  }
  return url(file);
}

async function putClip(name: string, videoId: string): Promise<string> {
  const file = `${name}-${V}.mp4`;
  let buf: Buffer;
  try {
    buf = await fetchBuf(`https://video.wixstatic.com/video/${videoId}/720p/mp4/file.mp4`);
  } catch {
    buf = await fetchBuf(`https://video.wixstatic.com/video/${videoId}/480p/mp4/file.mp4`);
  }
  writeFileSync(`${OUT}${file}`, buf);
  if (WRITE) {
    const up = await sb.storage
      .from("product-images")
      .upload(`products/${ID}/${file}`, buf, { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  }
  return url(file);
}

// รูปงานจริง Mini Calendar 5 ใบ (แกลเลอรีเต็มโควตา MAX_PHOTOS 5)
const GALLERY_SRC: [string, string, string][] = [
  ["photo-cover", "959b83_4920fd1fc86f41d9b2d3b2f67eefcad9~mv2.jpg", "Mini Calendar ปฏิทินตั้งโต๊ะจิ๋ว — ปกหน้า + หน้าเดือน สันห่วงเกลียวสีขาว"],
  ["photo-month", "959b83_03b589526a7543728240bd3a5412e46a~mv2.jpg", "หน้าปฏิทินรายเดือน กระดาษ 6×8 ซม. พิมพ์ลายตามสั่ง"],
  ["photo-front", "959b83_f6dbe1051f014865bab1cd589077985f~mv2.jpg", "ปกหน้าพิมพ์ลายของคุณเอง กระดาษหนา 260 แกรม"],
  ["photo-stand", "959b83_c13f3dd6541d450abbe39feedf2c709c~mv2.jpg", "ตั้งโต๊ะได้ด้วยฐานกระดาษอาร์ตขาวหนา 400 แกรม"],
  ["photo-page", "959b83_be379cf48de247ae98a823c4a8b642c9~mv2.jpg", "งานจริง — พลิกดูรายเดือนได้ทั้งเล่ม"],
];

// คลิปฟิล์มเคลือบจากหน้า ตย.ฟิล์มเคลือบ (/laminate) — id คลิป = id โปสเตอร์ (ตัด f00x)
// [คีย์ไฟล์, id, ชื่อตัวเลือก, คำอธิบายบนการ์ด]
const FILMS: [string, string, string, string][] = [
  ["film-none", "959b83_232e77cb4e214693b2bc4a771e2ac8c7", "ไม่เคลือบ", "งานพิมพ์มาตรฐาน ไม่เคลือบฟิล์ม"],
  ["film-gloss", "959b83_69a9b333d5aa4ce6945fada044ac2e61", "เคลือบเงา", "ฟิล์มเงา สีสดขึ้น เพิ่มความทนทาน"],
  ["film-matte", "959b83_38cfa28433974b3e93db7ea78948dbb3", "เคลือบด้าน", "ฟิล์มด้าน ผิวนุ่มละมุน ไม่สะท้อนแสง"],
  ["film-sand", "959b83_2c3f901c054b4faa993761671a28208f", "เนื้อทราย", "ผิวสัมผัสขรุขระแบบเม็ดทราย"],
  ["film-glitter", "959b83_5622d3fbfa2143b58d746af3ec114296", "กลิสเตอร์", "เกล็ดกากเพชรวิบวับทั้งใบ"],
  ["film-holo-star", "959b83_727b92a1c614408eb4ed27f5f706c7d9", "โฮโลแกรมดาว", "ประกายรุ้งลายดาวเล็ก"],
  ["film-holo-dot", "959b83_830de19fe54b4e1aa57b32dc2f7ad99c", "โฮโลแกรมจุด", "ประกายรุ้งลายจุดกลม"],
  ["film-holo-heart", "959b83_0f3e2e370d2a4f1c972735e14395be7d", "โฮโลแกรมหัวใจ", "ประกายรุ้งลายหัวใจ"],
  ["film-holo-square", "959b83_16b75348ca724a69a68e8f7e3e4ed050", "โฮโลแกรมเหลี่ยม", "ประกายรุ้งลายตารางเหลี่ยม"],
  ["film-holo-snow", "959b83_e70ad6012a34453fbe48ff2ec543472f", "โฮโลแกรมหิมะ", "ประกายรุ้งลายเกล็ดหิมะ"],
  ["film-holo-rainbow", "959b83_dd6160fe4e414934bd0618804a8bd75a", "โฮโลแกรมรุ้ง", "ประกายรุ้งเต็มแผ่น"],
  ["film-holo-dust", "959b83_932420c1fbbd43f3a3c7fd2b87a1d4fa", "โฮโลแกรม Dust", "ประกายรุ้งเนื้อฝุ่นละเอียด"],
  ["film-holo-stardust", "959b83_3a5c8a0bb5e947b7bc172d66d2781abf", "โฮโลแกรม Stardust", "ประกายรุ้งฝุ่นดาววิบวับ"],
];

const gallerySrc: Record<string, string> = {};
for (const [key, wixId] of GALLERY_SRC) gallerySrc[key] = await putJpg(key, wixId);

const filmMedia: Record<string, { img: string; vid: string }> = {};
for (const [key, id] of FILMS) {
  // โปสเตอร์ = ภาพนิ่งสำรอง/เฟรมแรกของการ์ด · คลิป = ตัวจริงที่การ์ดเล่นวน
  const img = await putJpg(`${key}-poster`, `${id}f000.jpg`);
  const vid = await putClip(`${key}-clip`, id);
  filmMedia[key] = { img, vid };
}
console.log(`🖼  รูปแกลเลอรี ${GALLERY_SRC.length} ใบ + ฟิล์ม ${FILMS.length} แบบ (โปสเตอร์+คลิป) — ตัวอย่างอยู่ที่ ${OUT}`);

/* ── 3. ประกอบตัวเลือก ───────────────────────────────────────────── */
const film = (key: string) => {
  const f = FILMS.find((x) => x[0] === key)!;
  return { name: f[2], desc: f[3], imageSrc: filmMedia[key].img, videoSrc: filmMedia[key].vid };
};

const OPTIONS: ProductOption[] = [
  {
    label: GROUP_COAT,
    display: "cards",
    // ค่าเคลือบคิดต่อแผ่น A3 ปัดขึ้น (กลไก sheetFee) — ชี้กลุ่มตัวเอง + perSheet ทุกตัวเลือก
    sheetFee: { from: GROUP_COAT, unit: "แผ่น A3" },
    note:
      `เคลือบฟิล์มด้านหน้ากระดาษทุกแผ่นในเล่ม — เงา/ด้าน **ด้านละ ${GLOSS_FEE} บาท ต่อแผ่น A3** · ` +
      `เคลือบพิเศษ (เนื้อทราย / กลิสเตอร์ / โฮโลแกรม) **ชุดละ ${SPECIAL_FEE} บาท ต่อแผ่น A3** ` +
      `(Mini Calendar 1 ${UNIT} ใช้กระดาษประมาณ 1 แผ่น A3) — ต้องการเคลือบ 2 ด้าน แจ้งในหมายเหตุถึงร้าน`,
    choices: [
      { ...film("film-none"), perSheet: PER_SHEET },
      { ...film("film-gloss"), extra: GLOSS_FEE, perSheet: PER_SHEET, popular: true },
      { ...film("film-matte"), extra: GLOSS_FEE, perSheet: PER_SHEET },
      {
        name: CHOICE_SPECIAL,
        desc: "เนื้อทราย / กลิสเตอร์ / โฮโลแกรม — เลือกลายฟิล์มด้านล่าง",
        extra: SPECIAL_FEE,
        perSheet: PER_SHEET,
        imageSrc: filmMedia["film-glitter"].img,
        videoSrc: filmMedia["film-glitter"].vid,
      },
    ],
  },
  {
    label: GROUP_FILM,
    display: "cards",
    showWhen: { label: GROUP_COAT, choices: [CHOICE_SPECIAL] },
    note: "ลายฟิล์มเคลือบพิเศษมีให้เลือก 10 ลาย — การ์ดแต่ละใบเล่นคลิปฟิล์มจริง ราคารวมอยู่ในค่าเคลือบพิเศษแล้ว",
    choices: FILMS.filter(([k]) => !["film-none", "film-gloss", "film-matte"].includes(k)).map(([k]) => film(k)),
  },
];

/* ── 4. ประกอบสินค้า (patch ทับร่างเดิม — คงแท็บกลาง/ฟิลด์อื่นไว้) ── */
const { data: row, error: rowErr } = await sb.from("products").select("name,data").eq("id", ID).single();
if (rowErr) throw new Error(`อ่านสินค้า ${ID} ไม่ได้: ${rowErr.message}`);
if (row.name !== NAME) throw new Error(`id ${ID} เป็นของ "${row.name}" ไม่ใช่ Mini Calendar — ตรวจก่อน`);
const existing = row.data as Product;

const gallery: Product["images"] = GALLERY_SRC.map(([key, , label]) => ({
  emoji: "📅",
  gradient: "from-sky-200 to-cyan-300",
  label,
  src: gallerySrc[key],
}));

const product: Product = {
  ...existing,
  name: NAME,
  emoji: "📅",
  gradient: "from-sky-200 to-cyan-300",
  price: prices[0],
  imageSrc: gallery[0].src,
  description:
    `Mini Calendar ปฏิทินตั้งโต๊ะขนาดจิ๋ว พิมพ์ลายตามสั่งทั้งเล่ม กระดาษ กว้าง 6 × สูง 8 ซม. หนา 260 แกรม ` +
    `ฐานปฏิทินกระดาษอาร์ตขาวหนา 400 แกรม เข้าเล่มห่วงสันเกลียวสีขาว ตั้งโต๊ะได้ ` +
    `เลือกเคลือบฟิล์มเงา/ด้าน/พิเศษได้ ไม่มีขั้นต่ำในการสั่งผลิต เริ่ม${UNIT}ละ ${prices[0]} บาท`,
  highlights: [
    `ไม่มีขั้นต่ำ · เริ่ม${UNIT}ละ ${prices[0]} บาท (สั่งเยอะลดถึง ${prices[prices.length - 1]} บาท)`,
    "กระดาษ 6×8 ซม. หนา 260 แกรม · ฐานกระดาษอาร์ตขาว 400 แกรม · ห่วงสันเกลียวสีขาว",
    `เคลือบเงา/ด้าน ด้านละ ${GLOSS_FEE} บาท · เคลือบพิเศษ 10 ลาย (ทราย/กลิสเตอร์/โฮโลแกรม) ${SPECIAL_FEE} บาท ต่อแผ่น A3`,
  ],
  options: OPTIONS,
  images: gallery,
  pricing: PRICING,
  priceRates: [
    {
      id: "r1",
      label: NAME,
      desc: `ปฏิทินตั้งโต๊ะจิ๋ว กระดาษ 6×8 ซม. เข้าเล่มห่วงสันเกลียว · พิมพ์ลายตามสั่ง`,
      pricing: PRICING,
      minPerDesign: MIN_PER_DESIGN,
      freeMixBelowQty: FREE_MIX_BELOW,
    },
  ],
  terms: [
    `*ไม่มีขั้นต่ำในการสั่งผลิต — ราคาต่อ${UNIT}`,
    `*จำนวน 1-${FREE_MIX_BELOW - 1} ${UNIT} คละลายได้อิสระ · ${FREE_MIX_BELOW} ${UNIT}ขึ้นไป คละลายละ ${MIN_PER_DESIGN} ${UNIT}ขึ้นไป`,
    "*กระดาษ กว้าง 6 ซม. × สูง 8 ซม. หนา 260 แกรม",
    "*ฐานปฏิทิน กระดาษอาร์ต ขาว หนา 400 แกรม · เข้าเล่มห่วงสันเกลียว สีขาว",
    `*เคลือบเงา/ด้าน บวกด้านละ ${GLOSS_FEE} บาท ต่อแผ่น A3 · เคลือบพิเศษ (เนื้อทราย/กลิสเตอร์/โฮโลแกรม) ชุดละ ${SPECIAL_FEE} บาท ต่อแผ่น A3 (1 ${UNIT} ≈ A3 1 แผ่น)`,
    "*ทางร้านใช้สี R G B สีงานพิมพ์ที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
  ].join("\n"),
  seo: {
    ...existing.seo,
    title: `รับพิมพ์ Mini Calendar ปฏิทินตั้งโต๊ะจิ๋ว ลายตามสั่ง เริ่ม${UNIT}ละ ${prices[0]} บาท ไม่มีขั้นต่ำ`,
    keywords: [
      "Mini Calendar",
      "ปฏิทินตั้งโต๊ะจิ๋ว",
      "ปฏิทินจิ๋ว",
      "ปฏิทินตั้งโต๊ะ สั่งทำ",
      "รับทำปฏิทิน",
      "ปฏิทินพิมพ์ลายตามสั่ง",
      "mini calendar สั่งทำ",
      "iDucky",
    ],
    description: `รับพิมพ์ Mini Calendar ปฏิทินตั้งโต๊ะขนาดจิ๋ว ลายตามสั่งทั้งเล่ม กระดาษ 6×8 ซม. หนา 260 แกรม ฐานอาร์ตขาว 400 แกรม ห่วงสันเกลียว เคลือบเงา/ด้าน/พิเศษได้ ไม่มีขั้นต่ำ เริ่ม${UNIT}ละ ${prices[0]} บาท`,
    faqs: [
      {
        q: "Mini Calendar ราคาเท่าไหร่?",
        a: `เริ่มต้น${UNIT}ละ ${prices[0]} บาท (1-10 ${UNIT}) สั่งเยอะราคาลดหลั่นตามจำนวน ถึง${UNIT}ละ ${prices[prices.length - 1]} บาทเมื่อสั่ง 1000 ${UNIT}ขึ้นไป ไม่มีขั้นต่ำในการสั่งผลิต`,
      },
      {
        q: "Mini Calendar ขนาดเท่าไหร่ ใช้กระดาษอะไร?",
        a: "กระดาษปฏิทินขนาด กว้าง 6 × สูง 8 ซม. หนา 260 แกรม ฐานปฏิทินเป็นกระดาษอาร์ตขาวหนา 400 แกรม พับตั้งโต๊ะได้ เข้าเล่มด้วยห่วงสันเกลียวสีขาว พิมพ์ลายตามสั่งได้ทั้งเล่ม",
      },
      {
        q: "เคลือบฟิล์มได้ไหม มีแบบไหนบ้าง?",
        a: `ได้ — เคลือบเงาหรือเคลือบด้าน บวกด้านละ ${GLOSS_FEE} บาท ต่อแผ่น A3 และเคลือบพิเศษบวกชุดละ ${SPECIAL_FEE} บาท ต่อแผ่น A3 มีให้เลือก 10 ลาย ได้แก่ เนื้อทราย กลิสเตอร์ และโฮโลแกรมลายดาว จุด หัวใจ เหลี่ยม หิมะ รุ้ง Dust และ Stardust ดูคลิปฟิล์มจริงได้ที่ตัวเลือกบนหน้าสินค้า`,
      },
      {
        q: "สั่งหลายลายคละกันได้ไหม?",
        a: `สั่ง 1-${FREE_MIX_BELOW - 1} ${UNIT} คละลายได้อิสระ · สั่ง ${FREE_MIX_BELOW} ${UNIT}ขึ้นไป คละลายละ ${MIN_PER_DESIGN} ${UNIT}ขึ้นไป`,
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

console.log(`\n📦 ${saved.name} (${ID}) · หมวด ${saved.category} · สถานะ: ${saved.hidden ? "ฉบับร่าง" : "เผยแพร่อยู่"}`);
console.log(`   ราคา ฿${range.min}-${range.max}/${UNIT} (เริ่มต้น ฿${saved.price})`);
console.log(`   ตัวเลือก: ${OPTIONS.map((o) => `${o.label} (${o.choices.length} แบบ)`).join(" · ")}`);
console.log(`   แกลเลอรี ${gallery.length} ภาพ · แท็บเดิม ${saved.tabs?.length ?? 0} · FAQ ${saved.seo!.faqs!.length} ข้อ`);
console.log(`   ตัวอย่างราคา: 1 ${UNIT} เคลือบเงา = ${prices[0]} + ${GLOSS_FEE} = ฿${prices[0] + GLOSS_FEE}`);
console.log(`   ตัวอย่างราคา: 30 ${UNIT} เคลือบพิเศษ = ${prices[2]}×30 + ${SPECIAL_FEE}×30 = ฿${prices[2] * 30 + SPECIAL_FEE * 30}`);

if (!WRITE) {
  console.log(`\n(ยังไม่อัปรูป ไม่เขียนฐานข้อมูล — เปิดดูรูป/คลิปที่ ${OUT} แล้วใส่ --write เพื่อบันทึกจริง)`);
  process.exit(0);
}

/* ── 5. เขียนลง Supabase (คอลัมน์กระจก name/category/price ต้องไปด้วย) ── */
const { error } = await sb
  .from("products")
  .update({ name: saved.name, category: saved.category, price: saved.price, data: saved })
  .eq("id", ID);
if (error) throw new Error(`อัปเดตไม่สำเร็จ: ${error.message}`);

/** update คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบก่อนประกาศสำเร็จ */
const { data: check, error: readErr } = await sb.from("products").select("name,data").eq("id", ID).single();
if (readErr) throw new Error(`อ่านกลับไม่ได้: ${readErr.message}`);
const back = check.data as Product;
if (check.name !== NAME || back.savedAt !== saved.savedAt || (back.options?.length ?? 0) !== OPTIONS.length)
  throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");

console.log(`\n✅ อัปรูป/คลิป + บันทึกแล้ว${saved.hidden ? " — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products" : ""}`);
console.log(`   หน้าสินค้า: http://localhost:3005/products/${ID}`);
console.log(`   หน้าแก้ไข: http://localhost:3005/admin/products/${ID}`);
