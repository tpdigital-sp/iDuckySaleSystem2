/**
 * ปฎิทินผ้าแคนวาส ขนาด 40x85cm (id: 40x85cm) — ดึงราคาสดจากตารางหน้า /calendar + การ์ดเทคนิคพิมพ์มีรูป
 *
 *   npx tsx scripts/canvas-calendar-build.mts            # อ่านตารางสด + เซฟภาพลง scratchpad_out/ (ไม่เขียน DB)
 *   npx tsx scripts/canvas-calendar-build.mts --write    # อัปรูป/คลิป + เขียนลง Supabase
 *
 * ผู้ใช้สั่ง (25 ส.ค. 69): ดึงราคาตาราง "ปฎิทินผ้าแคนวาส ขนาด 40x85cm"
 * + ภาพสินค้าให้ตรงกับตัวเลือก — แต่ละแบบต้องมีภาพประกอบว่าหน้าตาเป็นแบบไหน
 *
 * ที่มา: iduckyofficial-pricelists.com/calendar หัวข้อ "ปฎิทินผ้าแคนวาส"
 *   ตาราง: จำนวน | งานซับลิเมชั่น | งานพิมพ์ UV — 7 ขั้น (1-10=200/300 … 1000+=140/240)
 *   สเปคใต้ตาราง: ซับลิเมชั่น = เย็บโพ้งเก็บขอบ · ผ้า 14 ออนซ์ · เพิ่มขนาดนิ้วละ 15 บาท/ด้าน
 *               UV = พิมพ์รองสีขาว · ไม่เย็บโพ้งเก็บขอบ · ผ้า 400 แกรม · เพิ่มขนาดนิ้วละ 25 บาท/ด้าน
 *   คละลาย: 1-10 คละได้อิสระ · 11+ คละลายละ 5 ขึ้นไป (บนเว็บพิมพ์หน่วยเป็น แผ่น/เล่ม — สินค้านี้คือ ผืน)
 *
 * ⚠️ กลุ่มตัวเลือกเดิมชื่อ "ขนาด" ทั้งที่ตัวเลือกคือเทคนิคพิมพ์ (ตกทอดจาก import) —
 *    สคริปต์เปลี่ยนเป็น "เทคนิคการพิมพ์" พร้อม driverLabels ในจังหวะเดียวกัน (คีย์ cells อิงชื่อตัวเลือก ไม่แตะ)
 * ⚠️ ปก/แกลเลอรีเดิมเป็นรูปปฏิทินตั้งโต๊ะกระดาษ (ผิดสินค้า) — แทนด้วยรูปแคนวาสจริงจากหัวข้อบนหน้า /calendar
 *    หมายเหตุ: หน้าเว็บไม่มีรูปแยกต่อเทคนิค — การ์ด 2 ใบใช้รูปงานจริงคนละมุม + desc บอกความต่างของเนื้องาน
 * ⚠️ ห้ามอัปทับชื่อไฟล์เดิม (Next/CDN แคช) — แก้รูปครั้งหน้าขยับ V เป็น v2
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

const ID = "40x85cm";
const NAME = "ปฎิทินผ้าแคนวาส";
const PAGE = "https://www.iduckyofficial-pricelists.com/calendar";
const UNIT = "ผืน";
const V = "v1"; // ⚠️ แก้รูป/คลิปครั้งหน้าขยับเป็น v2 (กันแคช)
const GROUP_TECH = "เทคนิคการพิมพ์";
const GROUP_SIZE = "ขนาด";
const SIZE_STD = "40x85 ซม.";
const GROUP_ADDSIZE = "เพิ่มขนาด";
const ADDSIZE_ON = "ต้องการเพิ่มขนาดจากมาตรฐาน";

const OUT = new URL("../scratchpad_out/canvas-calendar/", import.meta.url).pathname;
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

const anchor = html.indexOf("ปฎิทินผ้าแคนวาส");
if (anchor < 0) throw new Error("หาหัวข้อ ปฎิทินผ้าแคนวาส บนหน้าเว็บไม่เจอ — โครงหน้าอาจเปลี่ยน");
const t = html.indexOf("<table", anchor);
if (t < 0) throw new Error("หา <table> ถัดจากหัวข้อ ปฎิทินผ้าแคนวาส ไม่เจอ");
const tEnd = html.indexOf("</table>", t);
const rows = [...html.slice(t, tEnd).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
  [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
);

const head = rows[0] ?? [];
if (!/จำนวน/.test(head[0] ?? "") || !/ซับลิเมชั่น/.test(head[1] ?? "") || !/UV/.test(head[2] ?? ""))
  throw new Error(`หัวตารางแคนวาสไม่ตรงคาด: "${head.join("|")}" — โครงหน้าเว็บอาจเปลี่ยน`);
// ชื่อตัวเลือก = หัวคอลัมน์จริงบนเว็บ (ต้องตรงคีย์ cells เป๊ะ)
const SUB = head[1];
const UV = head[2];

const body = rows.slice(1);
const tiers = body.map((r, i) => {
  if (!new RegExp(UNIT).test(r[0])) throw new Error(`แถวช่วงจำนวนไม่ตรงคาด (ไม่มีหน่วย ${UNIT}): "${r[0]}"`);
  const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: i === body.length - 1 ? null : m ? Number(m[2]) : null, label: r[0] };
});
if (tiers.some((tt, i) => i < tiers.length - 1 && !tt.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ");
if (tiers.length !== 7) throw new Error(`คาด 7 ขั้นจำนวน ได้ ${tiers.length}: ${tiers.map((x) => x.label).join(" | ")}`);
const col = (idx: number) =>
  body.map((r) => {
    const n = Number(String(r[idx]).replace(/[^\d]/g, ""));
    if (!n) throw new Error(`แถว "${r[0]}" คอลัมน์ ${idx} ราคาอ่านไม่ได้ (${r[idx]})`);
    return n;
  });
const priceSub = col(1);
const priceUv = col(2);

// สเปค 2 บล็อก (ซับลิเมชั่นก่อน UV) อยู่ระหว่างตารางกับหัวข้อ "ปฎิทินตั้งโต๊ะ" ถัดไป
const nextSec = html.indexOf("ปฎิทินตั้งโต๊ะ", tEnd);
const sec = strip(html.slice(tEnd, nextSec > 0 ? nextSec : tEnd + 250000));
for (const need of ["เย็บโพ้งเก็บขอบ", "14 ออนซ์", "400 แกรม", "รองสีขาว", "40x85cm"])
  if (!sec.includes(need)) throw new Error(`สเปค "${need}" หายจากหน้าเว็บ — ตรวจก่อน (ข้อความที่อ่านได้: ${sec.slice(0, 400)})`);

const feeMatches = [...sec.matchAll(/เพิ่มขนาด\s*นิ้วละ\s*(\d+)\s*บาท/g)].map((m) => Number(m[1]));
if (feeMatches.length !== 2) throw new Error(`ค่าเพิ่มขนาดต่อนิ้วคาด 2 ค่า ได้ ${feeMatches.length} (${feeMatches.join(",")})`);
const [FEE_SUB, FEE_UV] = feeMatches; // บล็อกซับลิเมชั่นมาก่อน UV ตามหน้าเว็บ
if (FEE_SUB >= FEE_UV) throw new Error(`ลำดับค่าเพิ่มขนาดสลับจากที่คาด (ซับ ${FEE_SUB} ≥ UV ${FEE_UV}) — ตรวจหน้าเว็บก่อน`);

const mMixFree = sec.match(/1\s*-\s*(\d+)\s*(?:แผ่น|เล่ม|ผืน)\s*คละลายได้/);
const mMixMin = sec.match(/คละลายละ\s*(\d+)/);
if (!mMixFree || !mMixMin) throw new Error("กติกาคละลายบนหน้าเว็บอ่านไม่ได้ — ตรวจก่อน");
const FREE_MIX_BELOW = Number(mMixFree[1]) + 1;
const MIN_PER_DESIGN = Number(mMixMin[1]);

const PRICING: PriceMatrix = {
  unit: UNIT,
  driverLabels: [GROUP_TECH],
  tiers,
  cells: { [SUB]: priceSub, [UV]: priceUv },
};

console.log(`📊 ตารางจากเว็บ (${tiers.map((x) => x.label).join(" · ")})`);
console.log(`   ${SUB}: ${priceSub.map((p) => `฿${p}`).join(" / ")} · เพิ่มขนาดนิ้วละ ฿${FEE_SUB}/ด้าน`);
console.log(`   ${UV}: ${priceUv.map((p) => `฿${p}`).join(" / ")} · เพิ่มขนาดนิ้วละ ฿${FEE_UV}/ด้าน`);
console.log(`   คละลาย: 1-${FREE_MIX_BELOW - 1} ${UNIT} อิสระ · ${FREE_MIX_BELOW}+ คละลายละ ${MIN_PER_DESIGN} ${UNIT}`);

/* ── 2. รูปแกลเลอรี + การ์ดเทคนิค + คลิปเนื้อผ้า (หัวข้อแคนวาสบนหน้า /calendar) ── */
async function fetchBuf(u: string): Promise<Buffer> {
  const res = await fetch(u);
  if (!res.ok) throw new Error(`โหลด ${u} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function putBuf(file: string, buf: Buffer, contentType: string): Promise<string> {
  writeFileSync(`${OUT}${file}`, buf); // เก็บตัวอย่างไว้ดูก่อนเขียนจริงเสมอ
  if (WRITE) {
    const up = await sb.storage.from("product-images").upload(`products/${ID}/${file}`, buf, { contentType, upsert: true });
    if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  }
  return url(file);
}

async function putJpg(name: string, wixId: string): Promise<string> {
  const buf = await sharp(await fetchBuf(`https://static.wixstatic.com/media/${wixId}`))
    .rotate()
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  return putBuf(`${name}-${V}.jpg`, buf, "image/jpeg");
}

/** การ์ดจัตุรัส 900 — ครอปกรอบที่กำหนดจากรูปต้นทาง */
async function putCard(name: string, wixId: string, crop: sharp.Region): Promise<string> {
  const buf = await sharp(await fetchBuf(`https://static.wixstatic.com/media/${wixId}`))
    .rotate()
    .extract(crop)
    .resize(900, 900, { fit: "cover" })
    .jpeg({ quality: 88 })
    .toBuffer();
  return putBuf(`${name}-${V}.jpg`, buf, "image/jpeg");
}

async function putClip(name: string, videoId: string): Promise<string> {
  let buf: Buffer;
  try {
    buf = await fetchBuf(`https://video.wixstatic.com/video/${videoId}/720p/mp4/file.mp4`);
  } catch {
    buf = await fetchBuf(`https://video.wixstatic.com/video/${videoId}/480p/mp4/file.mp4`);
  }
  return putBuf(`${name}-${V}.mp4`, buf, "video/mp4");
}

// รูปงานจริงหัวข้อแคนวาส + คลิปโคลสอัพเนื้อผ้า (id ยืนยันจากดูรูปจริงบนหน้า — ชุดก่อน/หลังหัวข้อเป็นสินค้าอื่น)
// ⚠️ 2 ใบท้าย (edgeCloseup/printCloseup) อยู่ในแกลเลอรีสไลด์ที่ scrape HTML ไม่เห็น — ได้มาจากอ่าน DOM หน้าจริง
const WIX = {
  hangFront: "959b83_13dbc30790a546e2ba8386ce4b52619b~mv2.jpg", // แขวนผนังเต็มผืน (แนวตั้ง)
  collage: "959b83_aad238cdc4c047cfa27d5e8353d043b6~mv2.jpg", // โคลสอัพลาย + งานจริง 2 มุม
  angle: "959b83_0c5d27dccf374b99a32e77a05c860517~mv2.jpg", // มุมเฉียงติดผนัง (แนวนอน)
  edgeCloseup: "959b83_0f91d880e1b4460a8deeaae2b36b2ff3~mv2.jpg", // โคลสอัพครึ่งล่าง เห็นขอบผ้าที่เก็บขอบ
  printCloseup: "959b83_f12b8e57b9784d97acd7f0648e3bd372~mv2.jpg", // โคลสอัพลายสีบนเนื้อผ้า
  clipPoster: "959b83_165f88a9ca0f43518bc1f4a9ae48dcb4f003.jpg",
  clipVideo: "959b83_165f88a9ca0f43518bc1f4a9ae48dcb4",
};

const imgHangFront = await putJpg("photo-hang-front", WIX.hangFront);
const imgCollage = await putJpg("photo-collage", WIX.collage);
const imgPrintCloseup = await putJpg("photo-print-closeup", WIX.printCloseup);
const imgAngle = await putJpg("photo-angle", WIX.angle);
const clipPoster = await putJpg("clip-fabric-poster", WIX.clipPoster);
const clipVideo = await putClip("clip-fabric", WIX.clipVideo);
// การ์ดเทคนิค: ครอปให้แต่ละใบเห็นจุดที่ desc พูดถึง — เต็มผืนเห็นขอบผ้าที่เก็บขอบ vs โคลสอัพความสดของสี
// ⚠️ หน้าเว็บไม่มีรูปแยกต่อเทคนิค — ทั้งคู่คืองานจริงของร้าน ไม่ใช่ภาพเทียบเทคนิค (note บอกลูกค้าไว้แล้ว)
const cardSub = await putCard("card-sublimation", WIX.angle, { left: 1430, top: 150, width: 2600, height: 2600 });
const cardUv = await putCard("card-uv", WIX.printCloseup, { left: 700, top: 0, width: 3400, height: 3400 });
console.log(`🖼  รูปแกลเลอรี 3 + โปสเตอร์/คลิป + การ์ด 2 — ตัวอย่างอยู่ที่ ${OUT}`);

/* ── 3. ประกอบตัวเลือก ───────────────────────────────────────────── */
const OPTIONS: ProductOption[] = [
  {
    label: GROUP_TECH,
    display: "cards",
    // ผู้ใช้สั่งถอด note ใต้ชื่อกลุ่มออก (25 ส.ค. 69) — ค่าเพิ่มขนาดต่อนิ้วยังอยู่ใน terms/highlights/FAQ
    note: "",
    choices: [
      {
        name: SUB,
        desc: `ผ้าแคนวาสหนา 14 ออนซ์ · เย็บโพ้งเก็บขอบเรียบร้อย · หมึกซึมลงเนื้อผ้า สัมผัสนุ่ม`,
        imageSrc: cardSub,
        popular: true,
      },
      {
        name: UV,
        desc: `ผ้าแคนวาสหนา 400 แกรม · พิมพ์รองพื้นสีขาว สีสดคมชัด · ไม่เย็บโพ้งเก็บขอบ`,
        imageSrc: cardUv,
      },
    ],
  },
  {
    // ผู้ใช้สั่งเพิ่ม (25 ส.ค. 69) — ขนาดมาตรฐานตัวเดียวตามตารางเว็บ
    // ⚠️ ไม่ใช่แกนราคา (driverLabels มีแต่เทคนิคการพิมพ์) ห้ามใส่เข้า cells
    label: GROUP_SIZE,
    choices: [{ name: SIZE_STD }],
  },
  {
    // ☑️ ผู้ใช้สั่ง (25 ส.ค. 69): ช่องกรอกต้องโผล่ต่อเมื่อติ๊กว่าจะเพิ่มขนาด
    //    กลุ่ม multi ตัวเลือกเดียว = ช่องติ๊ก · ไม่ติ๊ก → showWhen ไม่ตรง ช่องกรอกซ่อน
    //    และ optionActive กันกลุ่มที่ซ่อนออกจากการคิดเงินอยู่แล้ว = ค่าที่เผลอกรอกค้างไม่ถูกคิด
    label: GROUP_ADDSIZE,
    display: "multi",
    choices: [
      {
        name: ADDSIZE_ON,
        desc: `${SUB} นิ้วละ ${FEE_SUB} บาท · ${UV} นิ้วละ ${FEE_UV} บาท (คิดต่อด้าน)`,
      },
    ],
  },
  // 💰 เพิ่มขนาด: เว็บคิด "นิ้วละ N บาท ต่อด้าน" → แยกช่องกรอกตามด้าน แต่ละช่องคูณเรทของตัวเอง
  //    เรทตามเทคนิคที่เลือก (ซับลิเมชั่น 15 · UV 25) ผ่าน inputFee.rates
  ...(["ด้านกว้าง", "ด้านสูง"] as const).map((side) => ({
    label: `เพิ่มขนาด ${side} (นิ้ว)`,
    display: "input" as const,
    standardInput: true, // ข้อมูลประกอบงานปกติ ไม่ใช่งานสั่งทำที่ต้องให้แอดมินตีราคา
    showWhen: { label: GROUP_ADDSIZE, choices: [ADDSIZE_ON] },
    input: {
      kind: "number" as const,
      unit: "นิ้ว",
      max: 40,
      required: false, // เพิ่มด้านเดียวก็ได้ — อีกด้านปล่อยว่าง
      placeholder: "0",
      hint: `ด้านนี้ไม่เพิ่มปล่อยว่างไว้ · เพิ่ม${side}กี่นิ้วจาก ${SIZE_STD} (1 นิ้ว ≈ 2.54 ซม.)`,
    },
    inputFee: {
      perUnit: 0, // ยังไม่เลือกเทคนิค = ยังไม่คิด (เลือกแล้วเข้า rates ข้างล่างเสมอ)
      rates: [
        { when: { label: GROUP_TECH, choices: [SUB] }, perUnit: FEE_SUB },
        { when: { label: GROUP_TECH, choices: [UV] }, perUnit: FEE_UV },
      ],
    },
    choices: [],
  })),
];

/* ── 4. ประกอบสินค้า (patch ทับร่างเดิม — คงแท็บกลาง/ฟิลด์อื่นไว้) ── */
const { data: row, error: rowErr } = await sb.from("products").select("name,data").eq("id", ID).single();
if (rowErr) throw new Error(`อ่านสินค้า ${ID} ไม่ได้: ${rowErr.message}`);
if (row.name !== NAME) throw new Error(`id ${ID} เป็นของ "${row.name}" ไม่ใช่ ${NAME} — ตรวจก่อน`);
const existing = row.data as Product;

// แกลเลอรีเดิมเป็นรูปปฏิทินตั้งโต๊ะกระดาษ (ผิดสินค้า) — แทนทั้งชุดด้วยรูปแคนวาสจริง + คลิป
const gallery: Product["images"] = [
  { emoji: "📅", gradient: "from-sky-200 to-cyan-300", label: `${NAME} 40x85 ซม. แขวนผนัง — พิมพ์ลายตามสั่งทั้งผืน`, src: imgHangFront },
  { emoji: "📅", gradient: "from-sky-200 to-cyan-300", label: "คลิปงานจริง — โคลสอัพลายพิมพ์บนเนื้อผ้าแคนวาส", src: clipPoster, videoSrc: clipVideo },
  { emoji: "📅", gradient: "from-sky-200 to-cyan-300", label: "โคลสอัพงานพิมพ์บนเนื้อผ้าแคนวาส — เห็นลายสีและผิวผ้า", src: imgPrintCloseup },
  { emoji: "📅", gradient: "from-sky-200 to-cyan-300", label: "งานจริงติดผนัง — ใช้แต่งบ้าน/เป็นของขวัญปีใหม่", src: imgAngle },
  { emoji: "📅", gradient: "from-sky-200 to-cyan-300", label: "โคลสอัพลายพิมพ์ + งานจริงเทียบสองมุม", src: imgCollage },
];

const product: Product = {
  ...existing,
  name: NAME,
  emoji: "📅",
  gradient: "from-sky-200 to-cyan-300",
  price: priceSub[0],
  imageSrc: gallery[0].src,
  description:
    `${NAME} ขนาด 40x85 ซม. แขวนผนัง พิมพ์ลายตามสั่งทั้งผืน เลือกได้ 2 เทคนิค: ` +
    `${SUB} ผ้าหนา 14 ออนซ์ เย็บโพ้งเก็บขอบ หรือ ${UV} ผ้าหนา 400 แกรม พิมพ์รองพื้นสีขาวสีสด ` +
    `เพิ่มขนาดได้ ไม่มีขั้นต่ำ เริ่ม${UNIT}ละ ${priceSub[0]} บาท`,
  highlights: [
    `ขนาด 40x85 ซม. · ไม่มีขั้นต่ำ · เริ่ม${UNIT}ละ ${priceSub[0]} บาท (สั่งเยอะลดถึง ${Math.min(...priceSub)} บาท)`,
    `${SUB} ผ้า 14 ออนซ์ เย็บโพ้งเก็บขอบ · ${UV} ผ้า 400 แกรม พิมพ์รองสีขาว`,
    `เพิ่มขนาดได้ นิ้วละ ${FEE_SUB}/${FEE_UV} บาทต่อด้าน (ซับลิเมชั่น/UV)`,
  ],
  options: OPTIONS,
  images: gallery,
  pricing: PRICING,
  priceRates: [
    {
      id: "r1",
      label: `${NAME} 40x85cm`,
      desc: `ปฏิทินผ้าแขวนผนัง พิมพ์ลายตามสั่ง · เลือก${GROUP_TECH}ได้ 2 แบบ`,
      pricing: PRICING,
      minPerDesign: MIN_PER_DESIGN,
      freeMixBelowQty: FREE_MIX_BELOW,
    },
  ],
  terms: [
    `*ไม่มีขั้นต่ำในการสั่งผลิต — ราคาต่อ${UNIT}`,
    `*จำนวน 1-${FREE_MIX_BELOW - 1} ${UNIT} คละลายได้อิสระ · ${FREE_MIX_BELOW} ${UNIT}ขึ้นไป คละลายละ ${MIN_PER_DESIGN} ${UNIT}ขึ้นไป`,
    `*${SUB}: ผ้าแคนวาสหนา 14 ออนซ์ · งานเย็บโพ้งเก็บขอบ · เพิ่มขนาดนิ้วละ ${FEE_SUB} บาทต่อด้าน`,
    `*${UV}: ผ้าแคนวาสหนา 400 แกรม · งานพิมพ์รองสีขาว · ไม่เย็บโพ้งเก็บขอบ · เพิ่มขนาดนิ้วละ ${FEE_UV} บาทต่อด้าน`,
    "*ทางร้านใช้สี R G B สีงานพิมพ์ที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15%",
  ].join("\n"),
  seo: {
    ...existing.seo,
    title: `รับพิมพ์ปฏิทินผ้าแคนวาส 40x85 ซม. ลายตามสั่ง เริ่ม${UNIT}ละ ${priceSub[0]} บาท ไม่มีขั้นต่ำ`,
    keywords: [
      "ปฏิทินผ้าแคนวาส",
      "ปฏิทินผ้า",
      "ปฏิทินแขวนผนัง",
      "รับพิมพ์ปฏิทินผ้า",
      "รับทำปฏิทินแขวน",
      "ปฏิทินแคนวาสสั่งทำ",
      "canvas calendar",
      "ปฏิทินพิมพ์ลายตามสั่ง",
      "ของขวัญปีใหม่",
      "iDucky",
    ],
    description:
      `รับพิมพ์ปฏิทินผ้าแคนวาสแขวนผนัง ขนาด 40x85 ซม. ลายตามสั่งทั้งผืน เลือกงานซับลิเมชั่น (ผ้า 14 ออนซ์ เย็บโพ้ง) ` +
      `หรืองานพิมพ์ UV (ผ้า 400 แกรม รองสีขาว) เพิ่มขนาดได้ ไม่มีขั้นต่ำ เริ่ม${UNIT}ละ ${priceSub[0]} บาท`,
    faqs: [
      {
        q: "ปฏิทินผ้าแคนวาส 40x85cm ราคาเท่าไหร่?",
        a:
          `${SUB} เริ่ม${UNIT}ละ ${priceSub[0]} บาท · ${UV} เริ่ม${UNIT}ละ ${priceUv[0]} บาท (1-10 ${UNIT}) ` +
          `สั่งเยอะราคาลดหลั่นตามจำนวน ต่ำสุด ${Math.min(...priceSub)}/${Math.min(...priceUv)} บาทเมื่อสั่ง 1000 ${UNIT}ขึ้นไป ไม่มีขั้นต่ำในการสั่งผลิต`,
      },
      {
        q: "งานซับลิเมชั่นกับงานพิมพ์ UV ต่างกันยังไง?",
        a:
          `${SUB} ใช้ผ้าแคนวาสหนา 14 ออนซ์ หมึกซึมลงเนื้อผ้า สัมผัสนุ่ม พร้อมเย็บโพ้งเก็บขอบเรียบร้อย · ` +
          `${UV} ใช้ผ้าแคนวาสหนา 400 แกรม พิมพ์รองพื้นสีขาวก่อนจึงได้สีสดคมชัด ไม่เย็บโพ้งเก็บขอบ ดูภาพเทียบได้ที่ตัวเลือกบนหน้าสินค้า`,
      },
      {
        q: "สั่งขนาดอื่นนอกจาก 40x85 ซม. ได้ไหม?",
        a: `ได้ — เพิ่มขนาดคิดนิ้วละ ${FEE_SUB} บาทต่อด้านสำหรับ${SUB} และนิ้วละ ${FEE_UV} บาทต่อด้านสำหรับ${UV} แจ้งขนาดที่ต้องการในหมายเหตุถึงร้านตอนสั่งซื้อ`,
      },
      {
        q: "สั่งหลายลายคละกันได้ไหม?",
        a: `สั่ง 1-${FREE_MIX_BELOW - 1} ${UNIT} คละลายได้อิสระ · สั่ง ${FREE_MIX_BELOW} ${UNIT}ขึ้นไป คละลายละ ${MIN_PER_DESIGN} ${UNIT}ขึ้นไป`,
      },
      {
        q: "รับพิมพ์เป็นลายของตัวเองได้ไหม?",
        a: "ได้ครับ ส่งไฟล์ลาย/รูปที่ต้องการมาตอนสั่งซื้อ ทีมงานจัดทำแบบให้ตรวจและอนุมัติก่อนเริ่มผลิตทุกครั้ง",
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
console.log(`   แกลเลอรี ${gallery.length} ช่อง (รูป 3 + คลิป 1) · แท็บเดิม ${saved.tabs?.length ?? 0} · FAQ ${saved.seo!.faqs!.length} ข้อ`);
console.log(`   ตัวอย่างราคา: 1 ${UNIT} ${SUB} = ฿${priceSub[0]} · 30 ${UNIT} ${UV} = ${priceUv[2]}×30 = ฿${priceUv[2] * 30}`);

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

/** update คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง — อ่านกลับมาเทียบรายคีย์ก่อนประกาศสำเร็จ */
const { data: check, error: readErr } = await sb.from("products").select("name,price,data").eq("id", ID).single();
if (readErr) throw new Error(`อ่านกลับไม่ได้: ${readErr.message}`);
const back = check.data as Product;
const checks: [string, unknown, unknown][] = [
  ["name คอลัมน์", check.name, NAME],
  ["price คอลัมน์", check.price, priceSub[0]],
  ["savedAt", back.savedAt, saved.savedAt],
  ["driverLabels", JSON.stringify(back.pricing?.driverLabels), JSON.stringify([GROUP_TECH])],
  [`cells ${SUB}`, JSON.stringify(back.pricing?.cells?.[SUB]), JSON.stringify(priceSub)],
  [`cells ${UV}`, JSON.stringify(back.pricing?.cells?.[UV]), JSON.stringify(priceUv)],
  ["กลุ่มตัวเลือก", back.options?.[0]?.label, GROUP_TECH],
  ["จำนวนการ์ด", back.options?.[0]?.choices?.length, 2],
  ["กลุ่มขนาด", back.options?.[1]?.label, GROUP_SIZE],
  ["ตัวเลือกขนาด", back.options?.[1]?.choices?.[0]?.name, SIZE_STD],
  ["ช่องติ๊กเพิ่มขนาด", back.options?.find((o) => o.label === GROUP_ADDSIZE)?.display, "multi"],
  ["ช่องเพิ่มขนาด", back.options?.filter((o) => o.inputFee).length, 2],
  ["ช่องกรอกผูกกับช่องติ๊ก", back.options?.filter((o) => o.inputFee && o.showWhen?.label === GROUP_ADDSIZE).length, 2],
  [
    "เรทเพิ่มขนาด ซับ/UV",
    JSON.stringify(back.options?.find((o) => o.inputFee)?.inputFee?.rates?.map((r) => r.perUnit)),
    JSON.stringify([FEE_SUB, FEE_UV]),
  ],
  ["แกลเลอรี", back.images?.length, gallery.length],
];
for (const [what, got, want] of checks) {
  if (String(got) !== String(want)) throw new Error(`อ่านกลับไม่ตรง ${what}: ได้ ${got} คาด ${want}`);
  console.log(`✓ ${what}: ${String(got).slice(0, 80)}`);
}

console.log(`\n✅ อัปรูป/คลิป + บันทึกแล้ว${saved.hidden ? " — เป็นฉบับร่าง กดเผยแพร่ที่ /admin/products" : ""}`);
console.log(`   หน้าสินค้า: http://localhost:3005/products/${ID}`);
console.log(`   หน้าแก้ไข: http://localhost:3005/admin/products/${ID}`);
