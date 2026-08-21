#!/usr/bin/env node
/**
 * "HAND FAN พัดกระดาษไดคัทตามทรง (Digital)" (hand-fan-paper) — ดึงราคาจากเว็บ + อัปภาพ + เขียนสินค้า
 *
 *   node scripts/hand-fan-paper-art.mjs        # เตรียมภาพประจำตัวเลือกก่อน (.cache/hand-fan-paper/upload)
 *   node scripts/hand-fan-paper-apply.mjs              # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/hand-fan-paper-apply.mjs --write
 *   node scripts/hand-fan-paper-apply.mjs --write --reset-tabs   # เขียนแท็บชุดกลางทับของเดิมด้วย
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/magnetbookmark
 *   หน้านั้นมี 5 บล็อกสินค้า (Magnet Bookmark · CUP SLEEVE · พัดพลาสติกใส · พัดกระดาษ · พัดพับ)
 *   และหัวข้อ "HAND FAN" ถูกใช้ซ้ำทั้งพัดพลาสติกและพัดกระดาษ
 *   → จึงยึดหัวข้อไทย "พัดกระดาษไดคัทตามทรง (Digital)" ไม่ใช่ "HAND FAN" และไม่ใช่ลำดับตาราง
 *   สคริปต์อ่านสดทุกครั้ง ราคาบนเว็บเปลี่ยนเมื่อไหร่รันซ้ำได้เลย
 *
 * นอกจากตารางราคา ยังอ่าน "รายละเอียดเพิ่มเติม" ของบล็อกนี้มาใช้ตั้งค่าจริงด้วย —
 *   กติกาคละลาย · แกรมกระดาษ · ขนาดใหญ่สุด · ค่าเคลือบเงา/เคลือบพิเศษ (ต่อแผ่น A3 ต่อด้าน)
 *   อ่านไม่ครบเมื่อไหร่ = หยุด ไม่เดาตัวเลขเอง
 *
 * 💰 ค่าเคลือบคิด "ต่อ 1 แผ่น A3 ปัดขึ้น" ตามที่หน้าเว็บเขียนไว้ ("บวกเพิ่ม A3 ด้านละ N บาท")
 *    ทำผ่าน ProductOption.sheetFee + ProductOptionChoice.perSheet (กลไกเดียวกับ card-broad-foam-2-mm)
 *    เงินส่วนนี้ไม่เข้าราคา/ชิ้น แต่ไปเป็นค่าเพิ่มทั้งรายการใน designFeeFor()
 *
 *    ⚠️ หน้าเว็บไม่ได้บอกว่า 1 แผ่น A3 ตัดพัดได้กี่อัน (งานไดคัทตามทรงลูกค้า ไม่มีขนาดตายตัว)
 *       จึงเปิดกลุ่ม "ขนาดพัด" 3 ช่วงให้ลูกค้าเลือก แล้วใช้ผังวางบนแผ่น A3 ของ hand-fan-paper-art.mjs
 *       เป็นตัวหาร (20 ซม. = 2 อัน · 14 ซม. = 6 อัน · 10 ซม. = 8 อัน)
 *       กลุ่มนี้ไม่เปลี่ยนราคาต่ออัน — ราคาต่ออันบนเว็บเท่ากันทุกขนาดที่ไม่เกิน 20×20 ซม.
 *
 * ⚠️ หน้าเว็บบล็อกนี้ระบุเฉพาะ "เคลือบเงา" กับ "เคลือบพิเศษ" — ไม่มีเคลือบด้าน (ต่างจาก CUP SLEEVE)
 *    จึงไม่ใส่ตัวเลือกเคลือบด้านให้ ถ้าร้านขายจริงค่อยเพิ่มบนหน้าเว็บตารางราคาแล้วรันซ้ำ
 *
 * ⚠️ สคริปต์เขียนแบบ upsert — มีแถว id นี้อยู่แล้วก็เติมทับ (เช็คชื่อเดิมก่อน) ไม่มีก็สร้างใหม่
 *    ห้ามเปลี่ยน ID เป็นชื่อสุ่มแบบปุ่ม "+ เพิ่มสินค้า" — id นี้ใช้เป็นลิงก์หน้าสินค้าด้วย
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SIZES, SHEET, GSM as ART_GSM } from "./hand-fan-paper-art.mjs";

const WRITE = process.argv.includes("--write");
/** เขียนแท็บชุดกลาง (วิธีสั่งงาน/การเตรียมไฟล์/การรับประกัน) ทับของเดิม — ปกติสคริปต์จะไม่แตะ */
const RESET_TABS = process.argv.includes("--reset-tabs");
const ID = "hand-fan-paper";
const DIR = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1] || ".cache/hand-fan-paper/upload";
const PAGE = "https://www.iduckyofficial-pricelists.com/magnetbookmark";
const SECTION = "พัดกระดาษไดคัทตามทรง (Digital)";
/**
 * หัวข้อบนหน้าเว็บถูกซอยเป็นหลาย <span> ข้อความที่อ่านได้จริงจึงมีเว้นวรรคแทรกในวงเล็บ
 * ("พัดกระดาษไดคัทตามทรง ( Digital )") — เทียบด้วยรูปแบบ ไม่ใช่เทียบตรงตัว
 */
const SECTION_RE = /^พัดกระดาษไดคัทตามทรง\s*\(\s*Digital\s*\)$/i;
const NAME = "HAND FAN พัดกระดาษไดคัทตามทรง (Digital)";
const UNIT = "อัน";
const V = "v1";

/** ชื่อเดิมที่ยอมให้ทับได้ — กันเผลอรันทับสินค้าตัวอื่นถ้า id ถูกใช้ซ้ำวันหลัง */
const EXPECT_NAMES = [NAME];

const SIZE_LABEL = "ขนาดพัด";
const COAT_LABEL = "เคลือบ (ด้านหน้า)";
const COAT_IN_LABEL = "เคลือบ (ด้านหลัง)";
const FILM_LABEL = "เคลือบ"; // กลุ่มที่ลิงก์คลังตัวเลือกกลาง (ผิวฟิล์มพิเศษ 10 แบบ) — ชื่อกลุ่มมาจากคลัง
const FILM_BACK_LABEL = "ผิวฟิล์มพิเศษ (ด้านหลัง)";
const FILM_PRESET = "preset-2";
const COAT_NONE = "ไม่เคลือบ";
const COAT_GLOSS = "เคลือบเงา";
const COAT_SPECIAL = "เคลือบพิเศษ";
const COAT_IN_NONE = "ไม่เคลือบด้านหลัง";
const COAT_IN_GLOSS = "เคลือบเงา (ด้านหลัง)";
const COAT_IN_SPECIAL = "เคลือบพิเศษ (ด้านหลัง)";
/** ค่าเคลือบคิดต่อ 1 แผ่น A3 ปัดขึ้น — จำนวนอันต่อแผ่นอ่านจาก perSheet ของกลุ่ม "ขนาดพัด" */
const SHEET_UNIT = "แผ่น A3";
const SHEET_FEE = { from: SIZE_LABEL, unit: SHEET_UNIT };

/**
 * รูปงานจริงในบล็อก "พัดกระดาษไดคัทตามทรง" ของหน้าเว็บ
 * (id wixstatic — เปิดดูด้วยตาแล้วว่าเป็นพัดกระดาษไดคัทจริง ไม่ใช่พัดพลาสติกใสของบล็อกก่อนหน้า)
 * ⚠️ ได้แค่ 5 รูป — หน้าแก้ไขสินค้าตัดที่ MAX_PHOTOS = 5 ตอนโหลดเข้าฟอร์ม ใส่เกินไว้จะหายเงียบ ๆ
 * ภาพประจำตัวเลือกไม่นับรวมตรงนี้ (หน้าร้านดึงขึ้นแกลเลอรีให้เองตอนลูกค้ากดเลือก)
 */
const PHOTOS = [
  ["photo-pair", "959b83_db4a991bd87d4eef906cfa41d9be7a89", "งานจริง — พัดไดคัท 2 ทรง (แมว · หมี) พร้อมด้ามพลาสติก"],
  ["photo-cat-2side", "959b83_587115f025b846528f0ce15e65dd5c1c", "งานจริง — ทรงแมว พิมพ์ 2 ด้าน หน้า-หลังคนละลาย"],
  ["photo-cat-zoom", "959b83_9821b89582db42eaa30cdd01cf00f1d7", "งานจริง — ซูมทรงแมว เห็นขอบไดคัทและด้ามจับ"],
  ["photo-bear-2side", "959b83_e2390dfe845349f4aa0be4b7abf6ac65", "งานจริง — ทรงหมี พิมพ์ 2 ด้าน"],
];

/* ── 1. ดึงบล็อก "พัดกระดาษไดคัทตามทรง" จากหน้าเว็บ ──────────────── */

const decode = (s) =>
  String(s)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
/**
 * ตัวอักษรที่มองไม่เห็นในหน้าเว็บ Wix (NUL · zero-width · soft hyphen) —
 * แทรกกลางคำไทยอยู่จริง เช่น "พั\u0000ดพับ" ทำให้ค้นหัวข้อด้วยข้อความปกติไม่เจอ
 */
const INVISIBLE = /[\u0000\u00ad\u200b-\u200f\u2060\ufeff]/g;
const strip = (s) =>
  decode(String(s).replace(/<[^>]+>/g, " ")).replace(INVISIBLE, "").replace(/\s+/g, " ").trim();

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
const start = ALL.findIndex((b) => b.text && SECTION_RE.test(b.text));
if (start < 0) throw new Error(`หาหัวข้อ "${SECTION}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
const endRel = ALL.slice(start + 1).findIndex((b) => b.text && /FOLDING FAN|พัดพับ/.test(b.text));
const SEC = ALL.slice(start, endRel < 0 ? ALL.length : start + 1 + endRel);
const SEC_TEXT = SEC.filter((b) => b.text).map((b) => b.text);

const priceTable = SEC.find((b) => b.table && /จำนวน/.test(b.table[0][0] ?? "") && /อัน/.test(b.table[1]?.[0] ?? ""));
if (!priceTable) throw new Error(`ในบล็อก "${SECTION}" ไม่เจอตารางราคา (จำนวน × ราคา) — โครงหน้าเว็บอาจเปลี่ยน`);
const rows = priceTable.table;
if (rows[0].length !== 2)
  throw new Error(`ตารางราคา "${SECTION}" มี ${rows[0].length} คอลัมน์ (คาดว่า 2: จำนวน/พัดกระดาษ) — ตรวจหน้าเว็บก่อน`);

/** "1-10 อัน" → { upTo: 10 } · "10000 อันขึ้นไป" → { upTo: null } */
const tiers = rows.slice(1).map((r) => {
  const m = r[0].match(/(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)/);
  return { upTo: m ? Number(m[2].replace(/,/g, "")) : null, label: r[0].replace(/\s+/g, " ").trim() };
});
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
  return re.exec(line).slice(1).map(Number);
}
const [FREE_MIX_BELOW] = detail(/1\s*-\s*(\d+)\s*อัน\s*สามารถคละลายได้/, ' "1-N อัน สามารถคละลายได้"');
const [MIX_FROM, MIN_PER_DESIGN] = detail(
  /ตั้งแต่จำนวน\s*(\d+)\s*อันขึ้นไป\s*คละลายละ\s*(\d+)\s*ชิ้นขึ้นไป/,
  ' "ตั้งแต่จำนวน N อันขึ้นไป คละลายละ M ชิ้นขึ้นไป"'
);
const [GSM] = detail(/พัดกระดาษ\s*(\d+)\s*แกรม/, ' "พัดกระดาษ N แกรม"');
const [MAX_W, MAX_H] = detail(/ขนาดไม่เกิน\s*(\d+)\s*x\s*(\d+)\s*cm/i, ' "ขนาดไม่เกิน WxH cm"');
const [COAT_FEE] = detail(/เคลือบ\s*เงา\s*บวกเพิ่ม\s*A3\s*ด้านละ\s*(\d+)\s*บาท/, "ค่าเคลือบเงา");
const [SPECIAL_FEE] = detail(/เคลือบพิเศษ\s*บวกเพิ่ม\s*A3\s*ด้านละ\s*(\d+)\s*บาท/, "ค่าเคลือบพิเศษ");

/* กันของสองไฟล์หลุดจากกัน — ผังแผ่น A3 ในไฟล์ art ต้องอิงสเปกชุดเดียวกับหน้าเว็บ */
if (GSM !== ART_GSM)
  throw new Error(`เว็บบอกกระดาษ ${GSM} แกรม แต่ hand-fan-paper-art.mjs ตั้ง ${ART_GSM} แกรม — แก้ไฟล์ art ก่อน`);
if (MIX_FROM !== FREE_MIX_BELOW + 1)
  throw new Error(`เว็บบอกคละอิสระถึง ${FREE_MIX_BELOW} อัน แต่โควตาเริ่มที่ ${MIX_FROM} อัน (ควรต่อกันพอดี) — ตรวจหน้าเว็บก่อน`);
const BIGGEST = SIZES.reduce((a, b) => (a.mm >= b.mm ? a : b));
if (MAX_W !== MAX_H)
  throw new Error(`เว็บบอกขนาดใหญ่สุด ${MAX_W}x${MAX_H} cm ไม่ใช่ทรงจัตุรัส — ผังวางบนแผ่น A3 คิดจากด้านเท่า ตรวจก่อน`);
/**
 * ช่วงขนาดที่เปิดขายเล็กกว่าที่เว็บบอกว่าทำได้ = เรื่องปกติ (ร้านถอดช่วง 20×20 ออกเอง)
 * ที่ห้ามคือ "ใหญ่เกินที่ร้านทำได้" — ผังแผ่น A3 จะกลายเป็นคิดค่าเคลือบให้งานที่ผลิตไม่ได้
 */
if (BIGGEST.mm > MAX_W * 10)
  throw new Error(
    `ช่วงขนาดใหญ่สุดในไฟล์ art คือ ${BIGGEST.mm / 10} ซม. เกินที่เว็บบอกว่าทำได้ (${MAX_W} ซม.) — แก้ตาราง SIZES ก่อน`
  );

console.log(`📋 ตารางราคาจากเว็บ (${SECTION}) — กระดาษ ${GSM} แกรม พิมพ์ 2 ด้าน`);
tiers.forEach((t, i) => console.log(`   ${t.label.padEnd(20)} ฿${prices[i]}/${UNIT}`));
console.log(`   ขนาดไม่เกิน ${MAX_W}×${MAX_H} ซม. · เคลือบเงา +฿${COAT_FEE}/${SHEET_UNIT}/ด้าน · เคลือบพิเศษ +฿${SPECIAL_FEE}/${SHEET_UNIT}/ด้าน`);
console.log(`   คละลาย: 1-${FREE_MIX_BELOW} ${UNIT} อิสระ · ${MIX_FROM} ${UNIT}ขึ้นไป ลายละ ${MIN_PER_DESIGN} ชิ้นขึ้นไป`);
console.log(`   ผังแผ่น A3 (${SHEET.w}×${SHEET.h} มม.): ${SIZES.map((s) => `${s.mm / 10}ซม. ${s.perSheet} ${UNIT}`).join(" · ")}`);

const PRICING = { unit: UNIT, driverLabels: [], tiers, cells: { "": prices } };

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
const url = (file) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${file}`;

async function put(name, buf) {
  const file = `${name}.jpg`;
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

// รูปงานจริง — ดึงจาก wixstatic แล้วอัปเข้า storage ของเราเอง (เว็บ Wix เปลี่ยนลิงก์เมื่อไหร่ก็ไม่พัง)
const gallery = [];
for (const [file, wixId, label] of PHOTOS) {
  const res = await fetch(`https://static.wixstatic.com/media/${wixId}~mv2.jpg/v1/fit/w_1600,h_1600/x.jpg`);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  gallery.push({
    emoji: "🪭",
    gradient: "from-sky-100 to-blue-200",
    label,
    src: await put(`${file}-${V}`, Buffer.from(await res.arrayBuffer())),
  });
}
console.log(`\n🖼  รูปงานจริง ${gallery.length} ภาพ (จากบล็อก "${SECTION}" บนเว็บ)`);

// ภาพประจำตัวเลือก — เตรียมไว้แล้วโดย hand-fan-paper-art.mjs
const local = (f) => readFileSync(`${DIR}/${f}.jpg`);
const ART_FILES = [...SIZES.map((s) => s.key), "size-compare", "coat-none", "coat-gloss", "coat-special", "print-2side", "mix-rule"];
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
d.slug = "hand-fan-paper";
d.category = "card-photo";
d.emoji = "🪭";
d.gradient = "from-sky-100 to-blue-200";
d.unit = UNIT;
d.price = prices[0]; // ราคาตั้งต้น = ช่วงแรกของตาราง (สั่งน้อยจ่ายเท่านี้)
d.badge = "ใหม่";
d.rating = 5;
d.pricing = PRICING;
d.images = gallery;
d.imageSrc = gallery[0].src;
d.artworkRequired = true;

/**
 * คละลายตามหน้าเว็บ: 1-10 อันคละอิสระ · 11 อันขึ้นไป ลายละ 5 ชิ้นขึ้นไป
 * tierByDesign = คละเกินโควตาแล้วราคาตกไปคิดตาม "จำนวนชิ้นต่อลาย" (ไม่บล็อกการสั่ง)
 * ⚠️ ไม่ตั้งธงนี้ minPerDesign จะเป็นแค่ป้ายบอก ไม่มีผลกับราคาเลย (ดู tierQtyFor ใน products.ts)
 */
d.tierByDesign = true;
d.priceRates = [
  {
    id: "r1",
    label: `ราคาต่อ${UNIT}`,
    desc: `คละลายได้ — 1-${FREE_MIX_BELOW} ${UNIT}อิสระ · ${MIX_FROM} ${UNIT}ขึ้นไป ลายละ ${MIN_PER_DESIGN} ชิ้นขึ้นไป`,
    minPerDesign: MIN_PER_DESIGN,
    freeMixBelowQty: MIX_FROM,
    pricing: PRICING,
  },
];

d.description =
  `พัดกระดาษไดคัทตามทรง พิมพ์ลายตามสั่งด้วยระบบ Digital Printing กระดาษ ${GSM} แกรม ` +
  `พิมพ์ 2 ด้าน หน้า-หลังเป็นคนละลายกันได้ ไดคัทได้ตามทรงที่ออกแบบมา ขนาดไม่เกิน ${MAX_W} × ${MAX_H} ซม. ` +
  `เสียบด้ามพลาสติกให้เรียบร้อย เริ่มต้น${UNIT}ละ ${Math.max(...prices)} บาท สั่งเยอะเหลือ${UNIT}ละ ${Math.min(...prices)} บาท ` +
  `ไม่มีขั้นต่ำในการสั่งผลิต · เพิ่มเคลือบเงาหรือเคลือบพิเศษ (กลิตเตอร์ · ทราย · โฮโลแกรม) ได้ทั้งสองด้าน`;

d.highlights = [
  `เริ่ม${UNIT}ละ ${Math.max(...prices)} บาท — สั่งเยอะเหลือ${UNIT}ละ ${Math.min(...prices)} บาท · ไม่มีขั้นต่ำ`,
  `ไดคัทตามทรงที่ลูกค้าออกแบบมา ขนาดไม่เกิน ${MAX_W} × ${MAX_H} ซม.`,
  `กระดาษ ${GSM} แกรม พิมพ์ 2 ด้าน — หน้า-หลังคนละลายได้ ไม่คิดเพิ่ม`,
  `เคลือบเงา ฿${COAT_FEE} · เคลือบพิเศษ ฿${SPECIAL_FEE} — คิดต่อ${SHEET_UNIT} ต่อด้าน ไม่ใช่ต่อ${UNIT}`,
  `1-${FREE_MIX_BELOW} ${UNIT} คละลายได้อิสระ · ${MIX_FROM} ${UNIT}ขึ้นไป ลายละ ${MIN_PER_DESIGN} ชิ้นขึ้นไป`,
];

d.options = [
  {
    /**
     * ไม่ใช่แกนของตารางราคา — ราคาต่ออันเท่ากันทุกช่วงขนาด
     * มีไว้บอก "1 แผ่น A3 ตัดได้กี่อัน" ให้กลุ่มเคลือบเอาไปหารค่าฟิล์ม (ดู SHEET_FEE)
     */
    label: SIZE_LABEL,
    note:
      `ไดคัทตามทรงที่ออกแบบมา · ราคาต่อ${UNIT}เท่ากันทุกช่วง — ช่วงขนาดใช้คิดค่าเคลือบต่อ${SHEET_UNIT} ` +
      `· ร้านทำได้ถึง ${MAX_W} × ${MAX_H} ซม. ใหญ่กว่าช่วงในลิสต์ทักแอดมินได้เลย`,
    choices: SIZES.map((s) => ({
      name: s.name,
      perSheet: s.perSheet, // 1 แผ่น A3 ตัดได้กี่อัน — ใช้คิดค่าเคลือบแบบต่อแผ่น
      ...(s.popular ? { popular: true } : {}),
      imageSrc: art[s.key],
    })),
  },
  {
    label: COAT_LABEL,
    note: `มาตรฐานของงานนี้คือ "ไม่เคลือบลามิเนต" · ค่าเคลือบคิดต่อ 1 ${SHEET_UNIT} ปัดขึ้น ไม่ใช่ต่อ${UNIT}`,
    sheetFee: SHEET_FEE,
    choices: [
      { name: COAT_NONE, popular: true, imageSrc: art["coat-none"] },
      { name: COAT_GLOSS, extra: COAT_FEE, imageSrc: art["coat-gloss"] },
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
    note: `พัดพิมพ์ 2 ด้าน — เคลือบด้านหลังด้วยก็ได้ คิดเพิ่มอีกชุดต่อ${SHEET_UNIT}`,
    sheetFee: SHEET_FEE,
    choices: [
      { name: COAT_IN_NONE, popular: true, imageSrc: art["coat-none"] },
      { name: COAT_IN_GLOSS, extra: COAT_FEE, imageSrc: art["coat-gloss"] },
      { name: COAT_IN_SPECIAL, extra: SPECIAL_FEE, imageSrc: art["coat-special"] },
    ],
  },
  /**
   * ผิวฟิล์มพิเศษของด้านหลัง — ตัวเลือกชุดเดียวกับด้านหน้า แต่ลิงก์คลังซ้ำไม่ได้
   * (คลังจะเปลี่ยนชื่อกลุ่มเป็น "เคลือบ" ทั้งคู่ → สองกลุ่มใช้ค่าช่องเดียวกัน เลือกอะไรไม่ได้เลย)
   * จึงคัดลอกตัวเลือกจากคลังมาไว้เป็นกลุ่มอิสระ · รันสคริปต์ซ้ำเมื่อไหร่ก็ดึงของใหม่จากคลังให้เอง
   */
  {
    label: FILM_BACK_LABEL,
    display: "pills",
    showWhen: { label: COAT_IN_LABEL, choices: [COAT_IN_SPECIAL] },
    choices: FILMS,
  },
];

/** กลุ่มผิวฟิล์มเปิดใช้เฉพาะตอนเลือกเคลือบพิเศษ (คู่กับ showWhen — กันเลือกค้างไว้จากตัวเลือกเดิม) */
d.rules = [
  {
    when: { label: COAT_LABEL, choice: COAT_SPECIAL, choices: [COAT_SPECIAL] },
    limit: { label: FILM_LABEL, allow: FILMS.map((f) => f.name) },
  },
];

const sheetExample = SIZES.map((s) => `${s.mm / 10} ซม. ${s.perSheet} ${UNIT}`).join(" · ");

d.terms = [
  `พัดกระดาษ ${GSM} แกรม พิมพ์ 2 ด้าน ระบบ Digital Printing · มาตรฐานคือไม่เคลือบลามิเนต · ไม่มีขั้นต่ำในการสั่งผลิต`,
  `ไดคัทตามทรงที่ลูกค้าออกแบบมา ขนาดไม่เกิน ${MAX_W} × ${MAX_H} ซม. — ราคาต่อ${UNIT}เท่ากันทุกขนาดในกรอบนี้`,
  `ช่วงขนาดในหน้าสินค้ามีให้เลือกถึง ${BIGGEST.mm / 10} × ${BIGGEST.mm / 10} ซม. — อยากได้ใหญ่กว่านั้น (ไม่เกิน ${MAX_W} × ${MAX_H} ซม.) ทักแอดมินก่อนสั่ง เพื่อคิดค่าเคลือบต่อแผ่น A3 ให้ถูกต้อง`,
  `สั่ง 1-${FREE_MIX_BELOW} ${UNIT} คละลายได้อิสระ · ตั้งแต่ ${MIX_FROM} ${UNIT}ขึ้นไป คละลายได้ ขั้นต่ำลายละ ${MIN_PER_DESIGN} ชิ้น`,
  `คละเกินโควตาสั่งได้ แต่ราคาจะตกไปคิดตามจำนวนชิ้นต่อลาย (เช่น ${MIX_FROM} ${UNIT} คละ ${MIX_FROM} ลาย = คิดเรทปลีก)`,
  `ค่าเคลือบคิดเป็นค่าวัสดุ "ต่อ 1 ${SHEET_UNIT} ต่อด้าน" ไม่ใช่ต่อ${UNIT} — เคลือบเงา ${COAT_FEE} บาท · เคลือบพิเศษ ${SPECIAL_FEE} บาท`,
  `สั่งไม่ถึงโควตาต่อแผ่นก็คิด 1 ${SHEET_UNIT} · เกินโควตาขึ้นแผ่นถัดไป — 1 แผ่น A3 ตัดได้ ${sheetExample}`,
  `เคลือบด้านหน้าและด้านหลังคิดแยกกัน — เคลือบทั้งสองด้าน คิดค่าเคลือบสองชุด`,
  `ด้ามจับเป็นพลาสติกสีขาว เสียบท้ายตัวพัดมาให้เรียบร้อย ไม่ได้พิมพ์ลายบนด้าม`,
  `ทางร้านใช้สีระบบ RGB สีงานพิมพ์ที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%`,
  `การตัดคลาดเคลื่อนได้ +/- 0.5-2mm ตามข้อจำกัดของเครื่องตัด · งานที่พิมพ์ด้านหลังคลาดเคลื่อนได้ +/- 3-5mm (ไม่ควรวางลายชิดขอบหรือมีเส้นขอบ)`,
  `การเคลือบแต่ละแบบทำให้สีพิมพ์เข้มขึ้น-อ่อนลงได้เล็กน้อย · งานเคลือบลามิเนตอาจมีฝุ่นบนงานเล็กน้อย`,
].join("\n");

/**
 * แท็บข้อมูล — 3 แท็บท้าย (วิธีสั่งงาน / การเตรียมไฟล์ / การรับประกัน) ใช้ของเดิมถ้ามี
 * ไม่มี (สินค้าใหม่) = ใช้ชุดกลางของร้าน ปรับข้อความให้ตรงกับพัดกระดาษ
 */
const STD_TABS = [
  {
    title: "วิธีสั่งงาน",
    text: [
      "สั่งผ่านหน้าเว็บนี้ได้เลย::",
      "• เลือกช่วงขนาดพัด → การเคลือบ (ด้านหน้า/ด้านหลัง) → ใส่จำนวนอัน",
      '• แนบภาพลาย หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"',
      '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ทรงไดคัทที่ต้องการ · วันที่ต้องการใช้งาน',
      "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน",
      "",
      "หรือสั่งทางอีเมล::",
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com · หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ",
      "• ระบุรายละเอียด: ขนาดพัด · การเคลือบ · จำนวนอัน · จำนวนลาย · วันที่ใช้งาน (ถ้ามี)",
    ].join("\n"),
  },
  {
    title: "การเตรียมไฟล์",
    text: [
      "• ไฟล์นามสกุล .Ai .Psd .PNG พื้นหลังใส ความละเอียดสูง",
      `• ขนาดงานไม่เกิน ${MAX_W} × ${MAX_H} ซม. · ส่งมาทั้งด้านหน้าและด้านหลัง (คนละลายได้)`,
      "• ตีเส้นไดคัทมาให้ชัด หรือส่งลายที่มีพื้นหลังใสมาแล้วแจ้งว่าให้ตัดตามทรง",
      "• เผื่อตัดตกด้านละ 2-3 มม. · ไม่ควรวางงานชิดขอบหรือมีเส้นขอบ (ตัดคลาดเคลื่อนได้ 0.5-2mm)",
      "• เว้นบริเวณท้ายพัดที่เสียบด้ามไว้ อย่าวางข้อความสำคัญทับ",
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
      `• ${tiers.map((t, i) => `${t.label} ${UNIT}ละ ${prices[i]} บาท`).join("\n• ")}`,
      "• ไม่มีขั้นต่ำในการสั่งผลิต",
      "::ขนาดงาน::",
      `• ไดคัทตามทรงที่ลูกค้าออกแบบมา — ขนาดไม่เกิน ${MAX_W} × ${MAX_H} ซม.`,
      `• ราคาต่อ${UNIT}เท่ากันทุกขนาดในกรอบนี้ · ช่วงขนาดที่เลือกในหน้าสินค้าใช้คิดค่าเคลือบต่อ${SHEET_UNIT}`,
      `• 1 แผ่น A3 ตัดได้ ${sheetExample}`,
      `• ช่วงขนาดในหน้าสินค้ามีให้เลือกถึง ${BIGGEST.mm / 10} × ${BIGGEST.mm / 10} ซม. — ใหญ่กว่านั้นทักแอดมินก่อนสั่ง`,
      "::วัสดุ::",
      `• กระดาษ ${GSM} แกรม พิมพ์ระบบ Digital Printing`,
      "• พิมพ์ 2 ด้าน หน้า-หลังเป็นคนละลายกันได้ ไม่คิดเพิ่ม",
      "• มาตรฐานคือไม่เคลือบลามิเนต",
      "• ด้ามจับพลาสติกสีขาว เสียบท้ายตัวพัดมาให้",
      "::ราคาบวกเพิ่ม::",
      `• เคลือบเงา บวกเพิ่ม ${COAT_FEE} บาท ต่อ${SHEET_UNIT} ต่อด้าน`,
      `• เคลือบพิเศษ (กลิตเตอร์ · ทราย · โฮโลแกรม) บวกเพิ่ม ${SPECIAL_FEE} บาท ต่อ${SHEET_UNIT} ต่อด้าน — เลือกผิวฟิล์มได้ ${FILMS.length} แบบ`,
      `• สั่งไม่ถึงโควตาต่อแผ่นก็คิด 1 ${SHEET_UNIT} เต็ม (เช่น ขนาด ${BIGGEST.mm / 10} ซม. เคลือบพิเศษ สั่ง 1-${BIGGEST.perSheet} ${UNIT} = ${SPECIAL_FEE} บาท · สั่ง ${BIGGEST.perSheet + 1} ${UNIT} = ${SPECIAL_FEE * 2} บาท)`,
    ].join("\n"),
    images: [art["print-2side"], art["size-compare"]],
    imagePos: "bottom",
    imageSize: "md",
  },
  {
    title: "ข้อควรทราบ",
    text: [
      `• สั่ง 1-${FREE_MIX_BELOW} ${UNIT} คละลายได้อิสระ · ${MIX_FROM} ${UNIT}ขึ้นไป ลายละ ${MIN_PER_DESIGN} ชิ้นขึ้นไป`,
      "• คละเกินโควตาสั่งได้ แต่ราคาจะตกไปคิดตามจำนวนชิ้นต่อลาย",
      "• เคลือบคิดเป็น “ต่อด้าน” และ “ต่อแผ่น A3” — เคลือบทั้งสองด้าน คิดเพิ่มทั้งคู่",
      "• เลือกเคลือบพิเศษด้านไหน ก็เลือกผิวฟิล์มของด้านนั้นได้เอง (คนละแบบกันได้)",
      "• งานพิมพ์ด้านหลังคลาดเคลื่อนได้ 3-5 มม. ไม่ควรวางลายชิดขอบหรือมีเส้นขอบ",
      "• การเคลือบแต่ละแบบทำให้สีพิมพ์เข้มขึ้น-อ่อนลงได้เล็กน้อย",
      "• ทางร้านใช้สี RGB สีที่ได้อาจสว่างกว่าหรือดรอปลงจากไฟล์ ±5% ถึง ±15%",
      "• วางลายเผื่อตัดตกด้านละ 2-3 มม.",
    ].join("\n"),
    images: [art["mix-rule"]],
    imagePos: "bottom",
    imageSize: "md",
  },
  ...keepTabs,
];

d.seo = {
  title: "รับทำพัดกระดาษไดคัทตามทรง พิมพ์ลายตามสั่ง 2 ด้าน | HAND FAN",
  description:
    `รับผลิตพัดกระดาษไดคัทตามทรง พิมพ์ลายตามสั่ง กระดาษ ${GSM} แกรม พิมพ์ 2 ด้าน ` +
    `เริ่มต้น${UNIT}ละ ${Math.max(...prices)} บาท สั่งเยอะเหลือ${UNIT}ละ ${Math.min(...prices)} บาท ` +
    `ขนาดไม่เกิน ${MAX_W} × ${MAX_H} ซม. เคลือบเงา/กลิตเตอร์/โฮโลแกรมได้ ไม่มีขั้นต่ำในการสั่งผลิต`,
  keywords: [
    "พัดกระดาษ",
    "พัดไดคัท",
    "รับทำพัดกระดาษ",
    "hand fan",
    "พัดแฟนคลับ",
    "พัดกระดาษพิมพ์ลาย",
    "พัดไดคัทตามทรง",
    "พัดกระดาษตามสั่ง",
  ],
  faqs: [
    {
      q: "พัดกระดาษไดคัทราคาเท่าไหร่?",
      a: `คิดเป็น${UNIT} — ${tiers.map((t, i) => `${t.label} ${UNIT}ละ ${prices[i]} บาท`).join(" · ")}`,
    },
    {
      q: "ทำขนาดไหนได้บ้าง ทรงอะไรก็ได้ไหม?",
      a: `ไดคัทได้ตามทรงที่ออกแบบมาเลย ขนาดไม่เกิน ${MAX_W} × ${MAX_H} ซม. ราคาต่อ${UNIT}เท่ากันทุกขนาดในกรอบนี้ — ช่วงขนาดที่เลือกในหน้าสินค้ามีไว้คิดค่าเคลือบต่อแผ่น A3 เท่านั้น`,
    },
    {
      q: "พิมพ์กี่ด้าน หน้า-หลังคนละลายได้ไหม?",
      a: `พิมพ์ 2 ด้านอยู่แล้วในราคา และหน้า-หลังเป็นคนละลายกันได้ ไม่คิดเพิ่ม · กระดาษ ${GSM} แกรม มาตรฐานคือไม่เคลือบลามิเนต`,
    },
    {
      q: "เคลือบผิวได้ไหม คิดเงินยังไง?",
      a: `เคลือบเงา ${COAT_FEE} บาท · เคลือบพิเศษ (กลิตเตอร์ ทราย โฮโลแกรม) ${SPECIAL_FEE} บาท — คิดต่อ 1 ${SHEET_UNIT} ต่อด้าน ไม่ใช่ต่อ${UNIT} · 1 แผ่น A3 ตัดได้ ${sheetExample} สั่งไม่ถึงโควตาก็คิด 1 แผ่นเต็ม`,
    },
    {
      q: "คละลายได้กี่ลาย?",
      a: `สั่ง 1-${FREE_MIX_BELOW} ${UNIT} คละได้อิสระ ทุก${UNIT}เป็นคนละลายก็ได้ · ตั้งแต่ ${MIX_FROM} ${UNIT}ขึ้นไป คละได้ ลายละ ${MIN_PER_DESIGN} ชิ้นขึ้นไป · คละเกินโควตายังสั่งได้ แต่ราคาจะตกไปคิดตามจำนวนชิ้นต่อลาย`,
    },
  ],
};

/**
 * ฟิลด์ที่ปกติ /api/admin/products เขียนให้ตอนกดบันทึกในหน้าแก้ไข — สคริปต์เขียน DB ตรงจึงต้องทำเอง
 * hidden : คงสถานะฉบับร่างไว้ ให้ทีมงานกดเผยแพร่เองที่ /admin/products
 */
d.quoteOption = d.options.some((o) => o.askPrice || o.choices.some((c) => c.askPrice)) || undefined;
// เท่ากับที่ priceRange() คิดให้ตอนกดบันทึกในหน้าแก้ไข — สินค้ามีตารางราคา = ใช้ช่วงราคาในตารางล้วน ๆ
const allCells = Object.values(PRICING.cells).flat();
d.priceMin = Math.min(...allCells);
d.priceMax = Math.max(...allCells);
d.savedAt = new Date().toISOString();

const choices = d.options.flatMap((o) => o.choices);
console.log(`\n📦 ${d.name} (${ID}) · หมวด ${d.category} · slug ${d.slug}`);
console.log(`   ราคา ฿${d.priceMin}-${d.priceMax}/${UNIT} · ตัวเลือก ${d.options.map((o) => `${o.label} ${o.choices.length} แบบ`).join(" · ")}`);
console.log(`   แกลเลอรี ${d.images.length} ภาพ · ภาพประจำตัวเลือก ${choices.filter((c) => c.imageSrc).length}/${choices.length} ตัว`);
console.log(`   แท็บ: ${d.tabs.map((t) => t.title).join(" · ")} · สถานะ: ${d.hidden ? "ฉบับร่าง" : "เผยแพร่"}`);
if (!WRITE) {
  console.log("\n(ยังไม่อัปไฟล์ ไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

/**
 * ตาราง products มีคอลัมน์ name/category/price แยกจาก data (หน้ารายการหลังบ้านอ่านคอลัมน์พวกนี้)
 * อัปเดตแต่ data อย่างเดียว = หน้าร้านเปลี่ยนแล้วแต่หลังบ้านยังโชว์ชื่อเก่า — ต้องเขียนให้ตรงกันทั้งคู่
 */
const save = await sb.from("products").upsert(
  {
    id: ID,
    name: d.name,
    category: d.category,
    price: d.price,
    sold: d.sold ?? 0,
    featured: d.featured ?? false,
    badge: d.badge,
    // แถวใหม่วางต่อจาก FOLDING FAN (443) ซึ่งมาจากหน้าตารางราคาเดียวกัน
    ...(row ? {} : { sort: 444 }),
    data: d,
  },
  { onConflict: "id" }
);
if (save.error) throw new Error(`บันทึกไม่สำเร็จ — ${save.error.message}`);
console.log("\n✅ อัปภาพ + บันทึกแล้ว — ยังเป็นฉบับร่าง กดเผยแพร่ที่ /admin/products");
