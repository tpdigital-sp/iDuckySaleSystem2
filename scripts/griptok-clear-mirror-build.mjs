#!/usr/bin/env node
/**
 * สร้างสินค้า "GRIPTOK อะคริลิคใส+กระจก" (id griptok-clear-mirror) จากหน้า pricelists /griptok
 *
 *   node scripts/griptok-clear-mirror-build.mjs           # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/griptok-clear-mirror-build.mjs --write   # อัปไฟล์ + เขียนสินค้า
 *
 * ที่มา (ผู้ใช้สั่ง 25 ส.ค. 69): หัวข้อ "GRIPTOK อะคริลิคใส+กระจก" (UV Printing) หน้า
 * https://www.iduckyofficial-pricelists.com/griptok — ตารางเดียว ขนาด 5-10cm × 6 ช่วงจำนวน
 * ดึงราคาสดทุกครั้งที่รัน (เว็บเปลี่ยนราคา → รันซ้ำได้เลย)
 *
 * ⚠️ หัวข้อนี้โผล่ในสารบัญบนสุดของหน้าด้วย — ห้ามหา heading ตรง ๆ
 *    ใช้วิธีไล่ทุก <table> แล้วเช็คว่า 2,500 ตัวอักษรก่อนหน้ามีคำว่า "อะคริลิคใส+กระจก"
 * ⚠️ แถวปลีก 1-10 ชิ้น: 5cm = 6cm = 160 ตามเว็บเป๊ะ (แถวอื่นห่างกัน 10) — ใส่ตามเว็บ รอผู้ใช้ยืนยัน
 *
 * กติกาจากเว็บ (ข้อความใต้ตาราง): 1-10 ชิ้นคละลายได้ · 11 ชิ้นขึ้นไป คละลาย คละขนาด ขั้นต่ำ 5 ชิ้น
 * → เรทเดียว minPerDesign 5 + freeMixBelowQty 11 (เรทเดียวหน้าร้านไม่โชว์การ์ดเรท — rates.length > 1 เท่านั้น)
 * ฐานดำ/ขาว ฟรี · ฐานใส +5
 *
 * ผู้ใช้สั่งเพิ่ม (25 ส.ค. 69):
 * - Add On "ช่องกรอบใส่ภาพ" (เพิ่มชั้นอะคริลิค 1mm เป็นช่องเสียบภาพ ตามภาพที่ 1)
 * - รอบ 5 (26 ส.ค. 69): ช่องกรอบใส่ภาพ **ไม่คิดเงินเพิ่ม** แล้ว (เดิม +15) + ทำกลุ่มเป็นของเสริม
 *   มีสวิตช์เปิด-ปิด (collapsible ปิดไว้ก่อน · ตัวเลือกแรก "ไม่เพิ่ม" 0 บาทตามกฎ)
 * - สเปคความหนา: อะคริลิคใสด้านหน้า 1.5mm + ตัวอะคริลิคกระจก 1.5mm (ช่องกรอบ +1mm) — note ใต้กลุ่ม ขนาด/ช่องกรอบ
 * - รอบ 4: กลุ่มสีอะคริลิค "เหลือแค่ อะคริลิคใส หนา 1.5 mm" — ถอดแกน ใส/C-02/พิเศษ (cells 18 คีย์)
 *   กลุ่มสี 46 เฉดลิงก์คลัง และ rules ออกทั้งหมด · เหลือกลุ่มโชว์ตัวเลือกเดียว ไม่ใช่แกนราคา
 *
 * แกลเลอรี 5 ช่องพอดี MAX_PHOTOS (รูปจริง 2 + คลิปงานจริง 3 — คลิป = {src: โปสเตอร์, videoSrc: mp4})
 * ภาพตัวเลือก: การ์ดขนาด v3 (แปะบนหลังมือถือ) + ฐานขาว/ดำ/ใส ก๊อปจาก products/griptok-acrylic/
 * (แต่ละสินค้าถือไฟล์ของตัวเอง — อัปสำเนาใหม่ที่ products/griptok-mirror/)
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "griptok-clear-mirror";
const DIR = ".cache/griptok-mirror";
const FOLDER = "products/griptok-mirror";
const PAGE = "https://www.iduckyofficial-pricelists.com/griptok";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const sb = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE);
const PUB = `${SUPA}/storage/v1/object/public/product-images`;
const BASE = `${PUB}/${FOLDER}`;

const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

/* ───────────────────────── 1) ราคาสดจากหน้า /griptok ───────────────────────── */
const html = await (await fetch(PAGE)).text();
const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

let table = null;
for (const m of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
  const before = html.slice(Math.max(0, m.index - 2500), m.index);
  if (before.includes("อะคริลิคใส+กระจก")) {
    if (table) die("เจอตารางของหัวข้อ อะคริลิคใส+กระจก มากกว่า 1 ใบ — โครงหน้าเว็บเปลี่ยน ต้องตรวจใหม่");
    table = m[0];
  }
}
if (!table) die("ไม่เจอตารางของหัวข้อ อะคริลิคใส+กระจก — โครงหน้าเว็บเปลี่ยน");

const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((r) =>
  [...r[0].matchAll(/<t[dh][\s\S]*?<\/t[dh]>/g)].map((c) => strip(c[0]))
);
const SIZES = ["5 cm", "6 cm", "7 cm", "8 cm", "9 cm", "10 cm"];
const TIER_LABELS = ["1-10 ชิ้น", "11-29 ชิ้น", "30-49 ชิ้น", "50-199 ชิ้น", "200-499 ชิ้น", "500 ชิ้นขึ้นไป"];
if (rows.length !== 7) die(`ตารางมี ${rows.length} แถว (คาด 7)`);
if (JSON.stringify(rows[0]) !== JSON.stringify(["จำนวน", ...SIZES]))
  die(`หัวตารางไม่ตรง: ${JSON.stringify(rows[0])}`);

// cells: คีย์ = ขนาด ("5cm") · ค่า = ราคา 6 ช่วงเรียงตาม tiers
const cells = {};
SIZES.forEach((s) => (cells[s.replace(" ", "")] = []));
rows.slice(1).forEach((r, i) => {
  if (r[0] !== TIER_LABELS[i]) die(`ป้ายช่วงจำนวนแถว ${i + 1} ไม่ตรง: "${r[0]}" (คาด "${TIER_LABELS[i]}")`);
  r.slice(1).forEach((v, j) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) die(`ราคาแถว ${r[0]} คอลัมน์ ${SIZES[j]} อ่านไม่ออก: "${v}"`);
    cells[SIZES[j].replace(" ", "")].push(n);
  });
});
console.log("📊 ตารางสดจากเว็บ:");
for (const [k, v] of Object.entries(cells)) console.log(`   ${k}: ${v.join(" / ")}`);

// ── สีอะคริลิค: ผู้ใช้สั่ง (25 ส.ค. 69 รอบ 4) เหลือแค่ "อะคริลิคใส หนา 1.5 mm" ตัวเดียว ──
// (เดิมมีแกน ใส/C-02/พิเศษ ยุบเข้า cells 18 คีย์ + กลุ่มสี 46 เฉดจากคลัง — ถอดออกทั้งหมด
//  ตาราง cells กลับเป็น driverLabels ["ขนาด"] 6 คีย์ตามเว็บเป๊ะ · กลุ่มสีเหลือไว้เป็นกลุ่มโชว์
//  ตัวเลือกเดียว ให้ลูกค้าเห็นสเปคว่าด้านหน้าเป็นอะคริลิคใส 1.5 มม.)

const allPrices = Object.values(cells).flat();
const priceMin = Math.min(...allPrices);
const priceMax = Math.max(...allPrices);

/* ───────────────────────── 2) สื่อจากเว็บ (รูป 2 + คลิป 3) ───────────────────────── */
mkdirSync(DIR, { recursive: true });
async function fetchTo(path, url) {
  if (existsSync(path)) return;
  const res = await fetch(url);
  if (!res.ok) die(`โหลด ${url} ไม่ได้ — HTTP ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
}
const WIX_IMG = (id) => `https://static.wixstatic.com/media/${id}`;
const WIX_VID = (id) => `https://video.wixstatic.com/video/${id}/720p/mp4/file.mp4`;

// รูปนิ่ง (~mv2 ต้นฉบับใหญ่ 4-5k px → ย่อ 1200px ตามนโยบายรูปสินค้า)
await fetchTo(`${DIR}/photo-1.jpg`, WIX_IMG("959b83_a18f4da663f94947972977a1e0a1f329~mv2.jpg"));
await fetchTo(`${DIR}/photo-2.jpg`, WIX_IMG("959b83_9c0632a47df447338d29dda9f3e449f5~mv2.jpg"));
for (const [src, out] of [
  ["photo-1.jpg", "photo-heart-mirror-v1.jpg"],
  ["photo-2.jpg", "photo-paw-mirror-v1.jpg"],
]) {
  if (!existsSync(`${DIR}/${out}`))
    execSync(`sips -Z 1200 -s format jpeg -s formatOptions 88 "${DIR}/${src}" --out "${DIR}/${out}"`, { stdio: "pipe" });
}
// คลิป (โปสเตอร์ f003 ต้องโหลด URL ตรง ห้ามใส่ transform)
const CLIPS = [
  { key: "paw", media: "959b83_7dffa80c1af64ebebcb0b6856a289b59", label: "งานจริง — Griptok อะคริลิคใส+กระจก ลายอุ้งเท้าแมว มีกระจกส่องหน้าตรงกลาง" },
  { key: "stamp", media: "959b83_af2dc17273e8468da6d77778d0bc84d0", label: "งานจริง — Griptok อะคริลิคใส+กระจก ทรงแสตมป์ กระจกเงาเต็มบานตรงกลาง" },
  { key: "side", media: "959b83_aec73b3317cb4d6bbfd9c419065c2dd2", label: "งานจริง — ด้านข้างชิ้นงาน อะคริลิคใสพิมพ์ลาย ประกบกระจก พร้อมฐาน Griptok" },
];
for (const c of CLIPS) {
  await fetchTo(`${DIR}/clip-${c.key}-poster-v1.jpg`, WIX_IMG(`${c.media}f003.jpg`));
  await fetchTo(`${DIR}/clip-${c.key}-v1.mp4`, WIX_VID(c.media));
}

/* ─────────────── 3) ภาพตัวเลือก — สำเนาจาก products/griptok-acrylic/ ─────────────── */
const COPY = [
  ...[5, 6, 7, 8, 9, 10].map((n) => `size-${n}-v3.jpg`),
  "base-white.jpg",
  "base-black.jpg",
  "base-clear.jpg",
];
for (const f of COPY) await fetchTo(`${DIR}/${f}`, `${PUB}/products/griptok-acrylic/${f}`);

/* ───────────────────────── 4) อัปโหลดขึ้น storage ───────────────────────── */
const UPLOADS = [
  ["photo-heart-mirror-v1.jpg", "image/jpeg"],
  ["photo-paw-mirror-v1.jpg", "image/jpeg"],
  ...CLIPS.flatMap((c) => [
    [`clip-${c.key}-poster-v1.jpg`, "image/jpeg"],
    [`clip-${c.key}-v1.mp4`, "video/mp4"],
  ]),
  ...COPY.map((f) => [f, "image/jpeg"]),
];
if (WRITE) {
  for (const [f, type] of UPLOADS) {
    const { error } = await sb.storage
      .from("product-images")
      .upload(`${FOLDER}/${f}`, readFileSync(`${DIR}/${f}`), { contentType: type, upsert: true });
    if (error) die(`อัป ${f} ไม่สำเร็จ: ${error.message}`);
    console.log(`⬆️  ${f}`);
  }
} else {
  console.log(`(dry-run) จะอัป ${UPLOADS.length} ไฟล์ → ${FOLDER}/`);
}

/* ───────────────────────── 5) ตัวสินค้า ───────────────────────── */
const NAME = "GRIPTOK อะคริลิคใส+กระจก";
const tiers = [
  { upTo: 10, label: "1-10 ชิ้น" },
  { upTo: 29, label: "11-29 ชิ้น" },
  { upTo: 49, label: "30-49 ชิ้น" },
  { upTo: 199, label: "50-199 ชิ้น" },
  { upTo: 499, label: "200-499 ชิ้น" },
  { upTo: null, label: "500 ชิ้นขึ้นไป" },
];

const images = [
  { src: `${BASE}/photo-heart-mirror-v1.jpg`, label: "" },
  {
    src: `${BASE}/clip-paw-poster-v1.jpg`,
    videoSrc: `${BASE}/clip-paw-v1.mp4`,
    label: CLIPS[0].label,
  },
  { src: `${BASE}/photo-paw-mirror-v1.jpg`, label: "" },
  {
    src: `${BASE}/clip-stamp-poster-v1.jpg`,
    videoSrc: `${BASE}/clip-stamp-v1.mp4`,
    label: CLIPS[1].label,
  },
  {
    src: `${BASE}/clip-side-poster-v1.jpg`,
    videoSrc: `${BASE}/clip-side-v1.mp4`,
    label: CLIPS[2].label,
  },
];

const data = {
  id: ID,
  slug: "Griptok-Clear-Mirror",
  name: NAME,
  category: "phone-gadget",
  price: priceMin,
  emoji: "🪞",
  gradient: "from-slate-100 to-blue-100",
  rating: 5,
  sold: 0,
  featured: false,
  hidden: true, // ฉบับร่าง — ผู้ใช้กดเผยแพร่เอง
  imageSrc: images[0].src,
  images,
  highlights: ["มีกระจกส่องหน้าในตัว", "ขนาด 5-10cm", "ราคาปรับตามจำนวน"],
  description:
    "Griptok อะคริลิคใสด้านหน้า 1.5 มม. พิมพ์ลาย UV ประกบตัวอะคริลิคกระจก 1.5 มม. มีกระจกส่องหน้าในตัว ขนาด 5-10cm สั่งทำตามแบบ · เพิ่มช่องกรอบใส่ภาพได้ ไม่คิดเงินเพิ่ม · คละลาย คละขนาดได้",
  priceRates: [
    {
      id: "r1",
      label: "ราคาตามขนาด",
      desc: "1-10 ชิ้น คละลายอิสระ (ราคาปลีก) · ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย คละขนาด ดีเทลละ 5 ชิ้นขึ้นไป",
      pricing: { unit: "ชิ้น", driverLabels: ["ขนาด"], tiers, cells },
      minPerDesign: 5,
      freeMixBelowQty: 11,
    },
  ],
  options: [
    {
      label: "ขนาด",
      display: "dropdown",
      // note = ข้อความเทาใต้ชื่อกลุ่ม (**...** เน้นสี rose) — สเปคความหนาแบบเดียวกับ griptok-mirror
      note: "อะคริลิคใสด้านหน้า หนา 1.5 มม. + ตัวอะคริลิคกระจก หนา 1.5 มม. — **รวมแล้วหนาประมาณ 3 มม.** (ถ้าเพิ่มช่องกรอบใส่ภาพ บวกความหนาอีก 1 มม.)",
      choices: [5, 6, 7, 8, 9, 10].map((n) => ({
        name: `${n}cm`,
        imageSrc: `${BASE}/size-${n}-v3.jpg`,
      })),
    },
    {
      // เหลือตัวเลือกเดียวตามผู้ใช้สั่ง — ไม่ใช่แกนราคาแล้ว (โชว์สเปคให้ลูกค้าเห็นเฉย ๆ)
      label: "สีอะคริลิค",
      choices: [
        // ชี้รูปหน้าปก (URL เดียวกับแกลเลอรี → กดเลือกแล้วภาพหลักเด้งตาม)
        { name: "อะคริลิคใส หนา 1.5 mm", imageSrc: `${BASE}/photo-heart-mirror-v1.jpg` },
      ],
    },
    {
      label: "ฐาน Griptok",
      display: "dropdown",
      choices: [
        { name: "สีขาว", imageSrc: `${BASE}/base-white.jpg` },
        { name: "สีดำ", imageSrc: `${BASE}/base-black.jpg` },
        { name: "สีใส (มีรอยขนแมวบ้าง)", extra: 5, imageSrc: `${BASE}/base-clear.jpg` },
      ],
    },
    {
      label: "ช่องกรอบใส่ภาพ",
      // ของเสริมปิดไว้ก่อน มีสวิตช์เปิด-ปิด — ตัวเลือกแรกต้องไม่คิดเงิน (ปิดสวิตช์ = เด้งกลับตัวแรก)
      collapsible: true,
      note: "เพิ่มชั้นอะคริลิคใสด้านหน้าอีก 1 มม. เป็นช่องเสียบภาพ ถอดเปลี่ยนรูปเองได้ **ไม่คิดเงินเพิ่ม** — ดูตัวอย่างคลิปทรงแสตมป์ในแกลเลอรี",
      choices: [
        { name: "ไม่เพิ่ม" },
        // ชี้โปสเตอร์คลิปทรงแสตมป์ (ช่องเสียบภาพ) — URL เดียวกับแกลเลอรี → เลือกแล้วเด้งไปคลิป
        { name: "เพิ่มช่องกรอบใส่ภาพ", imageSrc: `${BASE}/clip-stamp-poster-v1.jpg` },
      ],
    },
  ],
  tabs: [
    {
      title: "รายละเอียดเพิ่มเติม",
      text: [
        "• ราคานี้เป็นของ GRIPTOK อะคริลิคใส+กระจก — พิมพ์ลาย UV บนอะคริลิคใส ประกบอะคริลิคกระจก มีกระจกส่องหน้าในตัว",
        "• โครงสร้างชิ้นงาน: อะคริลิคใสด้านหน้า (พิมพ์ลาย) หนา 1.5 มม. + ตัวอะคริลิคกระจก หนา 1.5 มม.",
        "• Add On ช่องกรอบใส่ภาพ ไม่คิดเงินเพิ่ม — เพิ่มชั้นอะคริลิค 1 มม. เป็นช่องเสียบภาพ ถอดเปลี่ยนรูปเองได้ (ตามภาพที่ 1 ในแกลเลอรี)",
        "• 1-10 ชิ้น สามารถคละลายได้ (ราคาปลีก)",
        "• ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย คละขนาด ขั้นต่ำดีเทลละ 5 ชิ้น",
        "• ฐานสีดำและสีขาว ไม่บวกเงินเพิ่ม · เฉพาะฐานใส บวกเพิ่ม 5 บาท (ฐานใสจะมีรอยขนแมวบ้าง)",
        "• สั่งตั้งแต่ 24 ชิ้นขึ้นไป ฟรีแพ็คเกจ (คละลาย/ขั้นต่ำ 24 30 36 42 ... บวกเพิ่มทีละ 6 ชิ้น ไม่รับเศษที่หาร 6 ไม่ลงตัว)",
        "• ตัดตกจากขนาดงานจริงด้านละ 3mm · ขนาดชิ้นงานนับจากด้านที่ยาวที่สุด (ไม่วัดแนวทแยง)",
        "• ไฟล์ นามสกุล .Ai .Psd .Png หรือพื้นหลังใส",
        "• ทางร้านมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องต่างกันประมาณ 5-10% · ใช้สี RGB สีที่ได้อาจสว่าง/ดรอปลง +-5% ถึง +-15%",
        "• สำหรับงานอะคริลิคทุกประเภท ทางร้านจะแปะฟิล์มกันรอยไว้ทุกชิ้น",
      ].join("\n"),
    },
    {
      title: "วิธีสั่งงาน",
      text: [
        "สั่งผ่านหน้าเว็บนี้ได้เลย::",
        '• เลือกจำนวนและตัวเลือกที่ต้องการ แล้วแนบภาพลาย (ไฟล์ตัวอย่าง JPG/PNG) หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"',
        '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ขนาด/รุ่นที่ต้องการ · วันที่ต้องการใช้งาน',
        "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ",
        "",
        "หรือสั่งทางอีเมล::",
        "• ส่งอีเมลมาที่ iduckyshop03@gmail.com",
        "• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ",
        "• ระบุรายละเอียด: สินค้า/ขนาดที่เลือก · รายละเอียดเพิ่มเติม (ถ้ามี) · จำนวน · วันที่ใช้งาน (ถ้ามี)",
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
        "• เผื่อพื้นที่กลางลายไว้สำหรับช่องกระจก — ทีมงานจัดวางตำแหน่งกระจกให้เหมาะกับลายและส่งแบบให้ตรวจก่อนผลิต",
      ].join("\n"),
    },
    {
      title: "การรับประกันสินค้า",
      text: [
        "รับเคลม::",
        "• สีเพี้ยนเกิน 10-15%",
        "• จำนวนที่ได้รับไม่ครบถ้วน",
        "• สีหรืออะไหล่ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต",
        "• สินค้าเกิดการแตกหักระหว่างการขนส่ง",
        "",
        "ไม่รับเคลม::",
        "• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต",
        "• สินค้าชำรุดจากการใช้งานมาแล้ว",
        "",
        "ระยะเวลาในการเคลม::",
        "ภายใน 7 วันนับจากวันที่ส่งสินค้า",
      ].join("\n"),
    },
  ],
  terms:
    "1-10 ชิ้น คละลายได้ · ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย คละขนาด ขั้นต่ำดีเทลละ 5 ชิ้น · ฐานสีดำ/สีขาว ฟรี · ฐานใส +5 บาท · ช่องกรอบใส่ภาพ ไม่คิดเงินเพิ่ม",
  seo: {
    title: `รับทำ ${NAME} พิมพ์ลายตามสั่ง`,
    description:
      "รับทำ/รับผลิต GRIPTOK อะคริลิคใส+กระจก พิมพ์ลาย UV มีกระจกส่องหน้าในตัว ขนาด 5-10cm เริ่มต้นชิ้นละ " +
      `${priceMin} บาท คละลายคละขนาดได้ ส่งแบบให้ตรวจก่อนผลิตทุกงาน`,
    keywords: [
      "รับทำ Griptok",
      "Griptok กระจก",
      "Griptok มีกระจก",
      "Griptok อะคริลิคใส",
      "กริ๊บต๊อกสั่งทำ",
      "ที่จับโทรศัพท์สั่งทำ",
      "รับทำ",
      "รับผลิต",
      "งานสั่งทำ",
      "Phone & Gadget",
    ],
    faqs: [
      {
        q: `${NAME} ราคาเท่าไหร่?`,
        a: `เริ่มต้นชิ้นละ ${priceMin} บาท — ราคาขึ้นกับขนาด (5-10cm) และจำนวนที่สั่ง ดูตารางราคาได้ในหน้าสินค้า`,
      },
      {
        q: `${NAME} คืออะไร ต่างจาก Griptok ปกติยังไง?`,
        a: "เป็น Griptok อะคริลิคใสด้านหน้าหนา 1.5 มม. พิมพ์ลาย UV ประกบกับตัวอะคริลิคกระจกหนา 1.5 มม. ตรงกลางเว้นเป็นช่องกระจกเงา ใช้ส่องหน้าได้จริง · เพิ่มช่องกรอบใส่ภาพ (ชั้นอะคริลิค 1 มม. ถอดเปลี่ยนรูปเองได้) ไม่คิดเงินเพิ่ม",
      },
      {
        q: "เลือกสีอะคริลิคได้ไหม?",
        a: "งานนี้ใช้อะคริลิคใส หนา 1.5 มม. เป็นชั้นพิมพ์ลายด้านหน้าอย่างเดียว (โชว์เนื้อกระจกด้านหลังเต็ม ๆ) — สีของงานมาจากลายที่พิมพ์ ส่งลายมาได้เลย",
      },
      {
        q: "คละลาย คละขนาด ได้ไหม?",
        a: "1-10 ชิ้น คละลายได้อิสระ (ราคาปลีก) · ตั้งแต่ 11 ชิ้นขึ้นไป คละลาย คละขนาดได้ ขั้นต่ำดีเทลละ 5 ชิ้น",
      },
      {
        q: "รับทำเป็นลายของตัวเองได้ไหม?",
        a: "ได้ครับ ส่งไฟล์ลาย/รูปที่ต้องการมาตอนสั่งซื้อ ทีมงานจัดทำแบบให้ตรวจและอนุมัติก่อนเริ่มผลิตทุกครั้ง",
      },
    ],
  },
  priceMin,
  priceMax,
  savedAt: new Date().toISOString(),
};

console.log(`\n🧾 ${NAME} · id ${ID} · ฿${priceMin}–${priceMax} · แกลเลอรี ${images.length} ช่อง (คลิป 3)`);
console.log(
  `   ตัวเลือก: ${data.options.map((o) => `${o.label} ${o.choices.length} ค่า`).join(" · ")} · minPerDesign 5 · freeMix <11`
);

if (!WRITE) {
  console.log("\n(dry-run) รันด้วย --write เพื่ออัปไฟล์ + เขียนสินค้า");
  process.exit(0);
}

/* ───────────────────────── 6) เขียน + อ่านกลับตรวจ ───────────────────────── */
// upsert ทั้งคอลัมน์กระจก (หลังบ้านอ่านคอลัมน์ ไม่ใช่ data)
const { error: upErr } = await sb.from("products").upsert(
  {
    id: ID,
    name: NAME,
    category: data.category,
    price: data.price,
    sold: 0,
    featured: false,
    badge: null,
    data,
  },
  { onConflict: "id" }
);
if (upErr) die(`เขียนสินค้าไม่สำเร็จ: ${upErr.message}`);

const { data: back, error: rdErr } = await sb
  .from("products")
  .select("name,category,price,data")
  .eq("id", ID)
  .single();
if (rdErr) die(`อ่านกลับไม่สำเร็จ: ${rdErr.message}`);
const b = back.data;
const checks = [
  ["คอลัมน์ name", back.name === NAME],
  ["คอลัมน์ price", back.price === priceMin],
  ["savedAt", b.savedAt === data.savedAt],
  // ⚠️ jsonb ไม่รักษาลำดับคีย์ — เทียบรายคีย์ ห้าม JSON.stringify ทั้งก้อน
  [
    "cells ตรงกับเว็บ (6 คีย์ ขนาดล้วน)",
    (() => {
      const bc = b.priceRates?.[0]?.pricing?.cells ?? {};
      const keys = Object.keys(cells);
      return (
        Object.keys(bc).length === keys.length &&
        keys.every((k) => JSON.stringify(bc[k]) === JSON.stringify(cells[k]))
      );
    })(),
  ],
  ["ตัวเลือก 4 กลุ่ม", (b.options ?? []).length === 4],
  [
    "ช่องกรอบใส่ภาพ = ของเสริมมีสวิตช์ ไม่คิดเงิน",
    (() => {
      const o = (b.options ?? []).find((x) => x.label === "ช่องกรอบใส่ภาพ");
      return !!o && o.collapsible === true && o.choices.every((c) => !(c.extra ?? 0));
    })(),
  ],
  ["กลุ่มสีเหลือใสตัวเดียว", (() => { const o = (b.options ?? []).find((x) => x.label === "สีอะคริลิค"); return !!o && o.choices.length === 1 && o.choices[0].name === "อะคริลิคใส หนา 1.5 mm"; })()],
  ["ไม่มี rules/กลุ่มคลังสีค้าง", !(b.rules ?? []).length && !(b.options ?? []).some((o) => o.presetId)],
  [
    "ภาพตัวเลือกครบ (นอกกลุ่มคลังสี และ 'ไม่เพิ่ม')",
    (b.options ?? [])
      .filter((o) => !o.presetId)
      .every((o) => o.choices.every((c) => c.imageSrc || c.name === "ไม่เพิ่ม")),
  ],
  ["แกลเลอรี 5 ช่อง", (b.images ?? []).length === 5],
  ["คลิป 3 ช่อง", (b.images ?? []).filter((i) => i.videoSrc).length === 3],
  ["ฉบับร่าง (hidden)", b.hidden === true],
];
let ok = true;
for (const [label, pass] of checks) {
  console.log(`${pass ? "✓" : "✗"} ${label}`);
  if (!pass) ok = false;
}
if (!ok) die("อ่านกลับแล้วค่าไม่ตรงกับที่ตั้งใจเขียน — ห้ามเชื่อว่าสำเร็จ ตรวจสอบก่อน");
console.log(`\n✅ เสร็จ — ดูได้ที่ http://localhost:3005/products/${ID}?v=${Date.now() % 100000} (ฉบับร่าง)`);
