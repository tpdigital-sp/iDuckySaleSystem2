#!/usr/bin/env node
/**
 * "CUP SLEEVE" (cup-sleeve) — ดึงราคาจากเว็บตารางราคา + อัปภาพ + เขียนสินค้า
 *
 *   node scripts/cup-sleeve-art.mjs        # เตรียมภาพประจำตัวเลือกก่อน (.cache/cup-sleeve/upload)
 *   node scripts/cup-sleeve-apply.mjs              # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/cup-sleeve-apply.mjs --write
 *   node scripts/cup-sleeve-apply.mjs --write --reset-tabs   # เขียนแท็บชุดกลางทับของเดิมด้วย
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/magnetbookmark
 *   หน้านั้นมี 3 บล็อกสินค้า (Magnet Bookmark · CUP SLEEVE · พัดพลาสติกใส) จึงยึด "หัวข้อ" ไม่ใช่ลำดับตาราง
 *   สคริปต์อ่านสดทุกครั้ง ราคาบนเว็บเปลี่ยนเมื่อไหร่รันซ้ำได้เลย
 *
 * นอกจากตารางราคา ยังอ่าน "รายละเอียดเพิ่มเติม" ของบล็อกนี้มาใช้ตั้งค่าจริงด้วย —
 *   จำนวนชิ้นต่อเซ็ต · แกรมกระดาษมาตรฐาน · ค่าเคลือบธรรมดา/เคลือบพิเศษ (ต่อด้าน)
 *   อ่านไม่ครบเมื่อไหร่ = หยุด ไม่เดาตัวเลขเอง
 *
 * ขนาดขายจริง "ขนาดเดียว" — 27.7 × 7.6 ซม. (ตามใบสเปกของร้าน) ไม่ใช่ตัวเลือกให้ลูกค้าเลือก
 *   หน้าเว็บตารางราคาบอกแค่ "ปรับขนาดได้ 3 ระดับ" ซึ่งหมายถึงลิ้นล็อก 3 ตำแหน่งที่ปลายปลอก
 *   ผูก templateIds ของไฟล์ไดคัทขนาดนี้ไว้ให้ลูกค้าโหลดไปวางลายได้เลย
 *   ⚠️ คลังเทมเพลตมีไฟล์ cup sleeve อีก 2 ขนาด (35.2x7.8 · 42x9.3) — ร้านยืนยันว่าไม่ได้ขาย อย่าเอามาทำตัวเลือก
 *
 * ⚠️ สคริปต์เขียนแบบ upsert — มีแถว id นี้อยู่แล้วก็เติมทับ (เช็คชื่อเดิมก่อน) ไม่มีก็สร้างใหม่
 *    ห้ามเปลี่ยน ID เป็นชื่อสุ่มแบบปุ่ม "+ เพิ่มสินค้า" — id นี้ใช้เป็นลิงก์หน้าสินค้าด้วย
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SIZE } from "./cup-sleeve-art.mjs";

const WRITE = process.argv.includes("--write");
/** เขียนแท็บชุดกลาง (วิธีสั่งงาน/การเตรียมไฟล์/การรับประกัน) ทับของเดิม — ปกติสคริปต์จะไม่แตะ กันงานที่ทีมงานแก้เองหาย */
const RESET_TABS = process.argv.includes("--reset-tabs");
const ID = "cup-sleeve";
const DIR = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1] || ".cache/cup-sleeve/upload";
const PAGE = "https://www.iduckyofficial-pricelists.com/magnetbookmark";
const SECTION = "CUP SLEEVE";
const NAME = "CUP SLEEVE";
const V = "v1";

/** ชื่อเดิมที่ยอมให้ทับได้ — กันเผลอรันทับสินค้าตัวอื่นถ้า id ถูกใช้ซ้ำวันหลัง */
const EXPECT_NAMES = [NAME];

const PAPER_LABEL = "ชนิดกระดาษ";
const COAT_LABEL = "เคลือบ (ด้านนอก)";
const COAT_IN_LABEL = "เคลือบ (ด้านใน)";
const FILM_LABEL = "เคลือบ"; // กลุ่มที่ลิงก์คลังตัวเลือกกลาง (ผิวฟิล์มพิเศษ 10 แบบ)
const FILM_PRESET = "preset-2";
const COAT_SPECIAL = "เคลือบพิเศษ";

/**
 * รูปงานจริงในบล็อก CUP SLEEVE ของหน้าเว็บ (id wixstatic — ตรวจแล้วว่าอยู่ในช่วง DOM ของหัวข้อนี้จริง)
 * ⚠️ ได้แค่ 5 รูป — หน้าแก้ไขสินค้าตัดที่ MAX_PHOTOS = 5 ตอนโหลดเข้าฟอร์ม ใส่เกินไว้จะหายเงียบ ๆ
 * ภาพประจำตัวเลือกไม่นับรวมตรงนี้ (หน้าร้านดึงขึ้นแกลเลอรีให้เองตอนลูกค้ากดเลือก)
 */
const PHOTOS = [
  ["photo-iced", "959b83_98b812d952744f16aff6a8afcb946bc1", "งานจริง — สวมแก้วน้ำเย็น 2 ใบ"],
  ["photo-tumbler", "959b83_8f552cedce99485eb5e6de0b8f478dd2", "งานจริง — สวมแก้วทัมเบลอร์"],
  ["photo-cup", "959b83_bbe742ada39f484e9e819b70837a85fd", "งานจริง — สวมแก้วกระดาษ"],
  ["photo-flat", "959b83_129f9b76f8364e48b869d94935f5d60f", "งานจริง — ตัวปลอกแบบแบน ก่อนสวม"],
  ["photo-stack", "959b83_c151012209904c228abbecd9caa39ffc", "งานจริง — ปลอกแบบแบน หลายใบ"],
];

/* ── 1. ดึงบล็อก "CUP SLEEVE" จากหน้าเว็บ ────────────────────────── */

const decode = (s) =>
  String(s)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s) => decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const html = await fetch(PAGE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } }).then((r) => {
  if (!r.ok) throw new Error(`ดึงหน้า ${PAGE} ไม่ได้ — HTTP ${r.status}`);
  return r.text();
});

/**
 * ไล่อ่านหน้าเว็บเป็น "ก้อน" ตามลำดับเอกสาร (ย่อหน้า/หัวข้อ/ตาราง)
 * บล็อกสินค้าหนึ่ง = ตั้งแต่ก้อนที่เป็นชื่อสินค้า จนถึงก้อนชื่อสินค้าตัวถัดไป
 */
function blocks() {
  const out = [];
  const re = /<table[\s\S]*?<\/table>|<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<p[^>]*>[\s\S]*?<\/p>/gi;
  for (let m; (m = re.exec(html)); ) {
    const chunk = m[0];
    if (/^<table/i.test(chunk)) {
      const rows = [...chunk.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) =>
        [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => strip(c[1]))
      );
      if (rows.length > 1) out.push({ table: rows });
    } else {
      const s = strip(chunk);
      if (s) out.push({ text: s });
    }
  }
  return out;
}

const ALL = blocks();
// หัวข้อรวมด้านบนหน้าเว็บก็มีคำว่า CUP SLEEVE อยู่ด้วย — เอาเฉพาะก้อนที่เป็นชื่อบล็อกล้วน ๆ
const start = ALL.findIndex((b) => b.text === SECTION);
if (start < 0) throw new Error(`หาหัวข้อ "${SECTION}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
const endRel = ALL.slice(start + 1).findIndex((b) => b.text && /HAND FAN|พัดพลาสติกใส/.test(b.text));
const SEC = ALL.slice(start, endRel < 0 ? ALL.length : start + 1 + endRel);
const SEC_TEXT = SEC.filter((b) => b.text).map((b) => b.text);

/** "1-30 เซ็ต" → { upTo: 30 } · "500 เซ็ตขึ้นไป" → { upTo: null } */
const tierOf = (label) => {
  const m = label.match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: label.replace(/\s+/g, " ").trim() };
};

const priceTable = SEC.find((b) => b.table && /จำนวน/.test(b.table[0][0] ?? "") && /เซ็ต/.test(b.table[1]?.[0] ?? ""));
if (!priceTable) throw new Error(`ในบล็อก "${SECTION}" ไม่เจอตารางราคา (จำนวน × ราคา) — โครงหน้าเว็บอาจเปลี่ยน`);
const rows = priceTable.table;
if (rows[0].length !== 2) throw new Error(`ตารางราคา "${SECTION}" มี ${rows[0].length} คอลัมน์ (คาดว่า 2: จำนวน/ราคา) — ตรวจหน้าเว็บก่อน`);

const tiers = rows.slice(1).map((r) => tierOf(r[0]));
tiers.at(-1).upTo = null; // ช่วงสุดท้ายเปิดปลายเสมอ
if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ — ตรวจก่อน");
const prices = rows.slice(1).map((r) => {
  const n = Number(String(r[1]).replace(/[^\d]/g, ""));
  if (!n) throw new Error(`ช่องราคาแถว "${r[0]}" อ่านไม่ออก ("${r[1]}")`);
  return n;
});

/** ตัวเลขในบรรทัด "รายละเอียดเพิ่มเติม" ของบล็อกนี้ — อ่านไม่เจอ = หยุด ไม่เดาเอง */
function detail(re, what) {
  const line = SEC_TEXT.find((t) => re.test(t));
  if (!line) throw new Error(`ในบล็อก "${SECTION}" ไม่เจอบรรทัด${what} — โครงหน้าเว็บอาจเปลี่ยน`);
  return Number(re.exec(line)[1]);
}
const PER_SET = detail(/1\s*เซ็ต\s*ได้\s*(\d+)\s*ชิ้น/, ' "1 เซ็ต ได้ N ชิ้น"');
const GSM = detail(/ใช้กระดาษอาร์ตมัน\s*(\d+)\s*แกรม/, ' "ใช้กระดาษอาร์ตมัน N แกรม"');
const COAT_FEE = detail(/เคลือบด้าน\s*\/\s*เงา\s*บวกเพิ่ม\s*(\d+)\s*บาท\s*ต่อด้าน/, "ค่าเคลือบด้าน/เงา");
const SPECIAL_FEE = detail(/เคลือบพิเศษ\s*บวกเพิ่ม\s*(\d+)\s*บาท\s*ต่อด้าน/, "ค่าเคลือบพิเศษ");

/**
 * ใต้ตารางเว็บลงจำนวน "ชิ้น" ของแต่ละช่วงไว้ด้วย — เอามาทวนกับ (เซ็ต × ชิ้นต่อเซ็ต)
 * ไม่ตรงเมื่อไหร่แปลว่าเว็บเปลี่ยนจำนวนชิ้นต่อเซ็ตแล้ว แต่บรรทัดรายละเอียดยังเป็นของเก่า → หยุดให้คนมาดู
 */
const pieceLines = SEC_TEXT.filter((t) => /^\(\s*\d+\s*ชิ้น/.test(t));
if (pieceLines.length === tiers.length) {
  tiers.forEach((t, i) => {
    const want = Number(String(t.label).match(/(\d+)/)[1]) * PER_SET;
    const got = Number(pieceLines[i].match(/(\d+)/)[1]);
    if (want !== got)
      throw new Error(`ช่วง "${t.label}" เว็บบอก ${got} ชิ้น แต่ ${PER_SET} ชิ้น/เซ็ต ต้องได้ ${want} ชิ้น — ตรวจหน้าเว็บก่อน`);
  });
}

/** ป้ายช่วงจำนวนใส่จำนวนชิ้นกำกับไว้ด้วย (แบบเดียวกับตะขอแขวนสูญญากาศ) — ลูกค้าอ่านแล้วเห็นภาพ */
const PRICING = {
  unit: "เซ็ต",
  driverLabels: [],
  tiers: tiers.map((t) => {
    const nums = t.label.match(/\d+/g).map(Number);
    const pieces = nums.length > 1 ? `${nums[0] * PER_SET}-${nums[1] * PER_SET} ชิ้น` : `${nums[0] * PER_SET} ชิ้นขึ้นไป`;
    return { upTo: t.upTo, label: `${t.label} (${pieces})` };
  }),
  cells: { "": prices },
};

console.log(`📋 ตารางราคาจากเว็บ (${SECTION})`);
PRICING.tiers.forEach((t, i) => console.log(`   ${t.label.padEnd(34)} ฿${prices[i]}/เซ็ต`));
console.log(`   1 เซ็ต = ${PER_SET} ชิ้น · กระดาษอาร์ตมัน ${GSM} แกรม`);
console.log(`   เคลือบเงา/ด้าน +฿${COAT_FEE}/ด้าน · เคลือบพิเศษ +฿${SPECIAL_FEE}/ด้าน`);

/* ── 2. อัปภาพ + เขียนสินค้า ─────────────────────────────────────── */

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const url = (file) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/cup-sleeve/${file}`;

async function put(name, buf) {
  const file = `${name}.jpg`;
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/cup-sleeve/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

// รูปงานจริง — ดึงจาก wixstatic แล้วอัปเข้า storage ของเราเอง (เว็บ Wix เปลี่ยนลิงก์เมื่อไหร่ก็ไม่พัง)
const gallery = [];
for (const [file, wixId, label] of PHOTOS) {
  const res = await fetch(`https://static.wixstatic.com/media/${wixId}~mv2.jpg/v1/fit/w_1600,h_1600/x.jpg`);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  gallery.push({
    emoji: "🥤",
    gradient: "from-sky-100 to-blue-200",
    label,
    src: await put(`${file}-${V}`, Buffer.from(await res.arrayBuffer())),
  });
}
console.log(`\n🖼  รูปงานจริง ${gallery.length} ภาพ (จากบล็อก "${SECTION}" บนเว็บ)`);

// ภาพประจำตัวเลือก — เตรียมไว้แล้วโดย cup-sleeve-art.mjs
const local = (f) => readFileSync(`${DIR}/${f}.jpg`);
const ART_FILES = [
  SIZE.key,
  "paper-250",
  "paper-300",
  "paper-400",
  "paper-special",
  "coat-none",
  "coat-gloss",
  "coat-matte",
  "coat-special",
  "set-of-6",
  "size-3-levels",
];
const art = {};
for (const f of ART_FILES) art[f] = await put(`${f}-${V}`, local(f));
console.log(`🖼  ภาพประจำตัวเลือก ${ART_FILES.length} ภาพ (${DIR})`);

// ผิวฟิล์มพิเศษ — ใช้ตัวเลือกจากคลังกลาง (แก้ที่คลังครั้งเดียว ทุกสินค้าที่ลิงก์ได้ตามไปด้วย)
const preset = await sb.from("products").select("data").eq("id", `__preset_${FILM_PRESET}`).single();
if (preset.error) throw new Error(`อ่านคลังตัวเลือก ${FILM_PRESET} ไม่ได้ — ${preset.error.message}`);
const FILMS = preset.data.data.choices.map((c) => ({ name: c.name, ...(c.imageSrc ? { imageSrc: c.imageSrc } : {}) }));
console.log(`🎞  ผิวฟิล์มพิเศษ ${FILMS.length} แบบ (ลิงก์คลัง ${FILM_PRESET} — “${preset.data.data.label}”)`);

const { data: row, error } = await sb.from("products").select("id,sort,data").eq("id", ID).maybeSingle();
if (error) throw new Error(`อ่านสินค้า ${ID} ไม่ได้ — ${error.message}`);
if (row && !EXPECT_NAMES.includes(row.data?.name))
  throw new Error(`${ID} ชื่อ "${row.data?.name}" ไม่ใช่แถวที่ตั้งใจแก้ — ตรวจก่อน`);
console.log(row ? `\n✏️  เติมของลงแถวเดิม ${ID}` : `\n🆕 ยังไม่มีแถว ${ID} — สร้างสินค้าใหม่ให้`);
/** ไม่มีแถวเดิม = ขึ้นของใหม่ทั้งชุด · สินค้าใหม่เริ่มเป็น "ฉบับร่าง" เสมอ (กดเผยแพร่เองที่ /admin/products) */
const d = structuredClone(row?.data ?? { id: ID, sold: 0, featured: false, hidden: true, body: [] });
d.id = ID;

d.name = NAME;
d.slug = "cup-sleeve";
d.category = "card-photo";
d.emoji = "🥤";
d.gradient = "from-sky-100 to-blue-200";
d.price = prices[0]; // ราคาตั้งต้น = ช่วงแรกของตาราง (สั่งน้อยจ่ายเท่านี้) แบบเดียวกับสินค้าตัวอื่นที่ขายเป็นเซ็ต
d.badge = "ใหม่";
d.rating = 5;
d.pricing = PRICING;
d.images = gallery;
d.imageSrc = gallery[0].src;
d.artworkRequired = true;

d.description =
  `ที่ครอบแก้วกระดาษ (Cup Sleeve) พิมพ์ลายตามสั่ง กระดาษอาร์ตมัน ${GSM} แกรม ` +
  `ขายเป็นเซ็ต 1 เซ็ตได้ ${PER_SET} ชิ้น เริ่มต้นเซ็ตละ ${Math.max(...prices)} บาท สั่งเยอะราคาลดตามตาราง ` +
  `ขนาด ${SIZE.name} (กางแบน) ปลายปลอกมีลิ้นล็อก 3 ระดับ ปรับความกว้างได้ตามขนาดแก้ว ` +
  `เลือกเคลือบเงา / เคลือบด้าน / เคลือบพิเศษ (กลิตเตอร์ · โฮโลแกรม) ได้`;

d.highlights = [
  `เซ็ตละ ${Math.max(...prices)} บาท — 1 เซ็ตได้ ${PER_SET} ชิ้น (สั่งเยอะเหลือเซ็ตละ ${Math.min(...prices)} บาท)`,
  `กระดาษอาร์ตมัน ${GSM} แกรม พิมพ์สีคมชัด ไม่มีขั้นต่ำในการสั่งผลิต`,
  `ขนาด ${SIZE.name} — ปลายปลอกล็อกปรับความกว้างได้ 3 ระดับ ใช้ได้ทั้งแก้วร้อน-แก้วเย็น`,
  `เคลือบเงา / ด้าน +฿${COAT_FEE} ต่อด้าน · เคลือบพิเศษ +฿${SPECIAL_FEE} ต่อด้าน`,
];

d.templateIds = [SIZE.tpl];

// ขนาดมีแบบเดียว จึงไม่ทำเป็นกลุ่มตัวเลือก — บอกไว้ในรายละเอียด/แท็บ/ภาพสเปกแทน
d.options = [
  {
    label: PAPER_LABEL,
    stockBearing: true,
    choices: [
      { name: `กระดาษอาร์ตมัน ${GSM} แกรม`, popular: true, imageSrc: art["paper-250"] },
      { name: "กระดาษอาร์ตมัน 300 แกรม", askPrice: true, imageSrc: art["paper-300"] },
      { name: "กระดาษอาร์ตมัน 400 แกรม", askPrice: true, imageSrc: art["paper-400"] },
      { name: "กระดาษพิเศษ (แจ้งชนิดกับแอดมิน)", askPrice: true, imageSrc: art["paper-special"] },
    ],
  },
  {
    label: COAT_LABEL,
    choices: [
      { name: "ไม่เคลือบ", imageSrc: art["coat-none"] },
      { name: "เคลือบเงา", extra: COAT_FEE, imageSrc: art["coat-gloss"] },
      { name: "เคลือบด้าน", extra: COAT_FEE, imageSrc: art["coat-matte"] },
      { name: COAT_SPECIAL, extra: SPECIAL_FEE, imageSrc: art["coat-special"] },
    ],
  },
  {
    label: FILM_LABEL,
    display: "pills",
    presetId: FILM_PRESET,
    showWhen: { label: COAT_LABEL, choices: [COAT_SPECIAL] },
    choices: FILMS,
  },
  {
    label: COAT_IN_LABEL,
    choices: [
      { name: "ไม่เคลือบด้านใน", imageSrc: art["coat-none"] },
      { name: "เคลือบเงา/ด้าน (ด้านใน)", extra: COAT_FEE, imageSrc: art["coat-gloss"] },
      { name: "เคลือบพิเศษ (ด้านใน)", extra: SPECIAL_FEE, imageSrc: art["coat-special"] },
    ],
  },
];

/** กลุ่มผิวฟิล์มเปิดใช้เฉพาะตอนเลือกเคลือบพิเศษ (คู่กับ showWhen — กันเลือกค้างไว้จากตัวเลือกเดิม) */
d.rules = [
  {
    when: { label: COAT_LABEL, choice: COAT_SPECIAL, choices: [COAT_SPECIAL] },
    limit: { label: FILM_LABEL, allow: FILMS.map((f) => f.name) },
  },
];

d.terms = [
  `จำหน่ายเป็นเซ็ต — 1 เซ็ต ${PER_SET} ชิ้น (1 แบบ | 1 ขนาด : 1 เซ็ต) ราคาในตารางคิดต่อเซ็ต`,
  "จำนวน 1-10 ชิ้น คละลายได้ · ตั้งแต่ 11 ชิ้นขึ้นไป คิด 1 ลาย / 1 ขนาด ต่อ 1 แผ่น A3 — อยากได้หลายลาย เพิ่มจำนวนเซ็ตตามจำนวนลาย",
  `กระดาษมาตรฐานคืออาร์ตมัน ${GSM} แกรม · กระดาษ 300 / 400 แกรม หรือกระดาษพิเศษ คิดราคาตามงานจริง (แอดมินตีราคาให้ก่อนผลิต)`,
  `เคลือบเงา / เคลือบด้าน บวกเพิ่ม ${COAT_FEE} บาทต่อด้าน · เคลือบพิเศษ (กลิตเตอร์ · ทราย · โฮโลแกรม) บวกเพิ่ม ${SPECIAL_FEE} บาทต่อด้าน`,
  `ขนาดงานมีแบบเดียว ${SIZE.name} (วัดตอนกางแบน) — เป็นทรงมาตรฐานของร้าน ไม่ได้ตัดตามแก้วเฉพาะรุ่น`,
  "ปลายปลอกมีลิ้นล็อก + ช่องเสียบ 3 ตำแหน่ง ปรับความกว้างได้ตามขนาดแก้ว",
  `วางลายเผื่อตัดตกด้านละ ${SIZE.bleedCm} ซม.`,
  "ทางร้านใช้สีระบบ RGB สีงานพิมพ์ที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
  "งานเคลือบลามิเนตอาจมีฝุ่นบนงานเล็กน้อย · การตัดคลาดเคลื่อนได้ +/- 0.5-2mm ตามข้อจำกัดของเครื่องตัด",
].join("\n");

/**
 * แท็บข้อมูล — 3 แท็บท้าย (วิธีสั่งงาน / การเตรียมไฟล์ / การรับประกัน) ใช้ของเดิมถ้ามี
 * ไม่มี (สินค้าใหม่) = ใช้ชุดกลางของร้าน ปรับข้อความให้ตรงกับปลอกแก้ว
 */
const STD_TABS = [
  {
    title: "วิธีสั่งงาน",
    text: [
      "สั่งผ่านหน้าเว็บนี้ได้เลย::",
      "• เลือกชนิดกระดาษ → การเคลือบ (ด้านนอก/ด้านใน) → ใส่จำนวนเซ็ต",
      '• แนบภาพลาย หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"',
      '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ขนาดแก้วที่จะใช้ · วันที่ต้องการใช้งาน',
      "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน",
      "",
      "หรือสั่งทางอีเมล::",
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com · หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ",
      "• ระบุรายละเอียด: ชนิดกระดาษ · การเคลือบ · จำนวนเซ็ต · วันที่ใช้งาน (ถ้ามี)",
    ].join("\n"),
  },
  {
    title: "การเตรียมไฟล์",
    text: [
      "• โหลดไฟล์เทมเพลตไดคัทไปวางลายได้เลย (ไฟล์ .ai ที่หน้าสินค้า)",
      "• ไฟล์นามสกุล .Ai .Psd .PNG พื้นหลังใส ความละเอียดสูง",
      "• เผื่อตัดตกจากขนาดงานจริงด้านละ 0.5 ซม. · ไม่ควรวางงานชิดขอบหรือมีเส้นขอบ (ตัดคลาดเคลื่อนได้ 0.5-2mm)",
      "• เว้นบริเวณลิ้นล็อกและช่องเสียบไว้ อย่าวางข้อความสำคัญทับ",
      "• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์",
    ].join("\n"),
  },
  {
    title: "การรับประกันสินค้า",
    text: [
      "รับเคลม::",
      "• สีเพี้ยนเกิน 10-15%",
      "• จำนวนที่ได้รับไม่ครบถ้วน",
      "• งานผิดจากแบบที่ได้รับการยืนยันผลิต",
      "• สินค้าเสียหายระหว่างการขนส่ง",
      "",
      "ไม่รับเคลม::",
      "• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต",
      "• สินค้าชำรุดจากการใช้งานมาแล้ว",
      "",
      "ระยะเวลาในการเคลม::",
      "ภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
    ].join("\n"),
  },
];
const keepTabs = STD_TABS.map((std) => (RESET_TABS ? std : (d.tabs ?? []).find((t) => t.title === std.title) ?? std));
d.tabs = [
  {
    title: "รายละเอียดงานพิมพ์",
    text: [
      "::การขาย::",
      `• จำหน่ายเป็นเซ็ต — 1 เซ็ต ${PER_SET} ชิ้น · 1 แบบ | 1 ขนาด : 1 เซ็ต`,
      `• ${PRICING.tiers.map((t, i) => `${t.label} เซ็ตละ ${prices[i]} บาท`).join("\n• ")}`,
      "• ไม่มีขั้นต่ำในการสั่งผลิต",
      "::ขนาดงาน::",
      `• ขนาดเดียว ${SIZE.name} (วัดตอนกางแบน ก่อนสวม)`,
      "• ปลายปลอกมีลิ้นล็อก + ช่องเสียบ 3 ตำแหน่ง ปรับความกว้างได้ตามขนาดแก้ว",
      `• วางลายเผื่อตัดตกด้านละ ${SIZE.bleedCm} ซม. · มีไฟล์เทมเพลตไดคัทให้โหลด`,
      "::วัสดุ::",
      `• กระดาษอาร์ตมัน ${GSM} แกรม (มาตรฐาน)`,
      "• กระดาษ 300 แกรม / 400 แกรม หรือกระดาษพิเศษ — คิดราคาตามงานจริง",
      "::ราคาบวกเพิ่ม::",
      `• เคลือบเงา / เคลือบด้าน บวกเพิ่ม ${COAT_FEE} บาท ต่อด้าน`,
      `• เคลือบพิเศษ (กลิตเตอร์ · ทราย · โฮโลแกรม) บวกเพิ่ม ${SPECIAL_FEE} บาท ต่อด้าน`,
    ].join("\n"),
    images: [art["set-of-6"], art[SIZE.key], art["size-3-levels"]],
    imagePos: "bottom",
    imageSize: "md",
  },
  {
    title: "ข้อควรทราบ",
    text: [
      `• 1 เซ็ต ${PER_SET} ชิ้น · 1 แบบ | 1 ขนาด : 1 เซ็ต`,
      "• จำนวน 1-10 ชิ้น คละลายได้ · ตั้งแต่ 11 ชิ้นขึ้นไป คิด 1 ลาย / 1 ขนาด ต่อ 1 แผ่น A3",
      `• ขนาดงานมีแบบเดียว ${SIZE.name} (กางแบน)`,
      "• เคลือบคิดเป็น “ต่อด้าน” — เคลือบทั้งด้านนอกและด้านใน คิดเพิ่มทั้งสองด้าน",
      "• การเคลือบแต่ละแบบทำให้สีพิมพ์เข้มขึ้น-อ่อนลงได้เล็กน้อย",
      "• ทางร้านใช้สี RGB สีที่ได้อาจสว่างกว่าหรือดรอปลงจากไฟล์ ±5% ถึง ±15%",
      "• งานเป็นทรงมาตรฐานของร้าน ไม่ได้ตัดตามขนาดแก้วเฉพาะรุ่น",
      `• วางลายเผื่อตัดตกด้านละ ${SIZE.bleedCm} ซม.`,
    ].join("\n"),
  },
  ...keepTabs,
];

d.seo = {
  title: "รับทำ Cup Sleeve ที่ครอบแก้ว ปลอกแก้วกระดาษ พิมพ์ลายตามสั่ง",
  description:
    `รับผลิต Cup Sleeve (ที่ครอบแก้ว) ปลอกแก้วกระดาษสกรีนโลโก้ กระดาษอาร์ตมัน ${GSM} แกรม ` +
    `เซ็ตละ ${Math.max(...prices)} บาท (1 เซ็ต ${PER_SET} ชิ้น) สั่งเยอะเหลือเซ็ตละ ${Math.min(...prices)} บาท ` +
    `ขนาด ${SIZE.name} ปรับความกว้างได้ 3 ระดับ เคลือบเงา ด้าน กลิตเตอร์ โฮโลแกรมได้ ไม่มีขั้นต่ำ`,
  keywords: [
    "cup sleeve",
    "ที่ครอบแก้ว",
    "ปลอกแก้วกระดาษ",
    "ปลอกสวมแก้ว",
    "รับทำ cup sleeve",
    "ที่ครอบแก้วสกรีนโลโก้",
    "ปลอกแก้วพิมพ์ลาย",
  ],
  faqs: [
    {
      q: "Cup Sleeve ราคาเท่าไหร่?",
      a: `คิดเป็นเซ็ต — ${PRICING.tiers.map((t, i) => `${t.label} เซ็ตละ ${prices[i]} บาท`).join(" · ")}`,
    },
    { q: "1 เซ็ตได้กี่ชิ้น?", a: `1 เซ็ตได้ ${PER_SET} ชิ้น และ 1 เซ็ตใช้ได้ 1 ลาย — อยากได้หลายลายให้เพิ่มจำนวนเซ็ต` },
    {
      q: "ขนาดเท่าไหร่ ใช้กับแก้วขนาดไหนได้บ้าง?",
      a: `ขนาดงานมีแบบเดียว ${SIZE.name} (วัดตอนกางแบน) ปลายปลอกมีลิ้นล็อก 3 ตำแหน่ง ปรับความกว้างได้ตามขนาดแก้ว ใช้ได้ทั้งแก้วร้อนและแก้วเย็น`,
    },
    {
      q: "เคลือบผิวได้ไหม คิดเงินยังไง?",
      a: `เคลือบเงาหรือเคลือบด้าน บวกเพิ่ม ${COAT_FEE} บาทต่อด้าน · เคลือบพิเศษ (กลิตเตอร์ ทราย โฮโลแกรม) บวกเพิ่ม ${SPECIAL_FEE} บาทต่อด้าน`,
    },
    {
      q: "ใช้กระดาษหนากว่านี้ได้ไหม?",
      a: `มาตรฐานเป็นอาร์ตมัน ${GSM} แกรม · ถ้าต้องการ 300 / 400 แกรม หรือกระดาษพิเศษ เลือกในหน้าสินค้าได้เลย แล้วแอดมินจะตีราคาให้ก่อนเริ่มผลิต`,
    },
  ],
};

/**
 * ฟิลด์ที่ปกติ /api/admin/products เขียนให้ตอนกดบันทึกในหน้าแก้ไข — สคริปต์เขียน DB ตรงจึงต้องทำเอง
 * hidden : คงสถานะฉบับร่างไว้ ให้ทีมงานกดเผยแพร่เองที่ /admin/products
 */
d.quoteOption = d.options.some((o) => o.askPrice || o.choices.some((c) => c.askPrice)) || undefined;
// เท่ากับที่ priceRange() คิดให้ตอนกดบันทึกในหน้าแก้ไข — สินค้ามีตารางราคา = ใช้ช่วงราคาในตารางล้วน ๆ
d.priceMin = Math.min(...prices);
d.priceMax = Math.max(...prices);
d.savedAt = new Date().toISOString();

const choices = d.options.flatMap((o) => o.choices);
console.log(`\n📦 ${d.name} (${ID}) · หมวด ${d.category} · slug ${d.slug}`);
console.log(`   ราคา ฿${Math.min(...prices)}-${Math.max(...prices)}/เซ็ต · ตัวเลือก ${d.options.map((o) => `${o.label} ${o.choices.length} แบบ`).join(" · ")}`);
console.log(`   แกลเลอรี ${d.images.length} ภาพ · ภาพประจำตัวเลือก ${choices.filter((c) => c.imageSrc).length}/${choices.length} ตัว`);
console.log(`   แท็บ: ${d.tabs.map((t) => t.title).join(" · ")} · สถานะ: ${d.hidden ? "ฉบับร่าง" : "เผยแพร่"}`);
if (!WRITE) {
  console.log("\n(ยังไม่อัปไฟล์ ไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

const save = await sb.from("products").upsert(
  {
    id: ID,
    name: d.name,
    category: d.category,
    price: d.price,
    sold: d.sold ?? 0,
    featured: d.featured ?? false,
    badge: d.badge,
    // แถวใหม่ต่อท้ายลิสต์ (แถวเดิมไม่แตะลำดับที่ทีมงานจัดไว้)
    ...(row ? {} : { sort: 440 }),
    data: d,
  },
  { onConflict: "id" }
);
if (save.error) throw new Error(`บันทึกไม่สำเร็จ — ${save.error.message}`);
console.log("\n✅ อัปภาพ + บันทึกแล้ว — ยังเป็นฉบับร่าง กดเผยแพร่ที่ /admin/products");
