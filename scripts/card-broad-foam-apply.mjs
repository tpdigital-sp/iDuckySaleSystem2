#!/usr/bin/env node
/**
 * "Card Broad Foam หนา 2 mm" (card-broad-foam-2-mm) — ดึงราคาจากเว็บตารางราคา + อัปภาพ + เขียนสินค้า
 *
 *   node scripts/card-broad-foam-art.mjs      # เตรียมภาพประจำตัวเลือกก่อน (.cache/card-broad-foam/upload)
 *   node scripts/card-broad-foam-apply.mjs            # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/card-broad-foam-apply.mjs --write
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/cardboard
 *   หน้านั้นมี 2 บล็อกสินค้า (Card Broad Foam · Ultra-Hard CardBoard) จึงยึด "หัวข้อ" ไม่ใช่ลำดับตาราง
 *   สคริปต์อ่านสดทุกครั้ง ราคาบนเว็บเปลี่ยนเมื่อไหร่รันซ้ำได้เลย
 *
 * นอกจากตารางราคา (7 ขนาด × 5 ช่วงจำนวน) ยังอ่านค่าบวกเพิ่มจากหน้าเว็บมาใช้ด้วย —
 *   ค่าเคลือบเงา/ด้าน · ค่าเคลือบพิเศษ · ตาราง Add On เคลือบฟอยล์ (1/2 เลเยอร์) · ค่าฟอยล์โฮโลแกรม (ไปเป็น +฿ ของ "สีโฮโลแกรม")
 *   · จำนวนใบต่อแผ่น A3 ของแต่ละขนาด   อ่านไม่ครบเมื่อไหร่ = หยุด ไม่เดาตัวเลขเอง
 *
 * 💡 ค่าเคลือบ/ค่าฟอยล์ของหน้านี้คิด "ต่อ 1 แผ่น A3" และ **ปัดขึ้นเป็นแผ่นเต็มเสมอ**
 *    (หน้าเว็บเขียนกำกับไว้: A4 ได้ 2 ใบ · A5 ได้ 4 ใบ · A6 ได้ 8 ใบ · A7 ได้ 16 ใบ ต่อ 1 แผ่น A3)
 *    ผู้ใช้ยืนยัน 21 ส.ค. 69: "A5 = 4 ชิ้น = 30 บาท ถ้าไม่ถึงก็ 30 บาท ถ้าเกิน สั่ง 5 เล่ม จะต้อง 60 บาท"
 *    → ใช้ ProductOption.sheetFee + ProductOptionChoice.perSheet (กลไกเดียวกับ ultra-hard-cardboard-2-mm)
 *      คิด ⌈จำนวนที่สั่ง ÷ ใบต่อแผ่น⌉ × ค่าเคลือบ เป็น "ค่าเพิ่มทั้งรายการ" ไม่เข้าราคา/ชิ้น
 *
 * ⚠️ เดิมสคริปต์นี้ "หารค่าเคลือบเฉลี่ยลงทุกใบ" แล้วยัดเข้าตารางราคา (ราคาต่อชิ้นมีทศนิยม)
 *    วิธีนั้นเก็บค่าเคลือบขาดตอนสั่งไม่เต็มแผ่น (A5 สั่ง 1 ใบ ได้ค่าเคลือบแค่ 1/4 แผ่น) จึงเปลี่ยนมาปัดขึ้น
 *    ตารางราคากลับไปมีแกนเดียวคือ "ขนาด" เหมือนที่หน้าเว็บเขียนไว้ตรง ๆ
 *
 * ⚠️ ห้ามเปลี่ยน ID — id นี้ใช้เป็นลิงก์หน้าสินค้าด้วย และมีแถวอยู่ใน DB แล้ว (นำเข้าจากเว็บร้านรอบก่อน)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SIZES } from "./card-broad-foam-art.mjs";

const WRITE = process.argv.includes("--write");
const ID = "card-broad-foam-2-mm";
const DIR = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1] || ".cache/card-broad-foam/upload";
const PAGE = "https://www.iduckyofficial-pricelists.com/cardboard";
const SECTION = "Card Broad Foam หนา 2 mm";
const NAME = "Card Broad Foam หนา 2 mm";
const V = "v1";

/** ชื่อเดิมที่ยอมให้ทับได้ — กันเผลอรันทับสินค้าตัวอื่นถ้า id ถูกใช้ซ้ำวันหลัง */
const EXPECT_NAMES = [NAME];

const SIZE_LABEL = "ขนาด";
/**
 * ⚠️ ห้ามตั้ง COAT_LABEL เป็น "เคลือบ" — ชนกับ label ของคลังตัวเลือกกลาง preset-2
 * resolveOptions ทับชื่อกลุ่มที่ลิงก์คลังด้วยชื่อของคลังเสมอ ("ผิวเคลือบพิเศษ" → "เคลือบ")
 * ถ้าชื่อชนกัน สองกลุ่มจะใช้ค่าที่เลือกช่องเดียวกัน → กลุ่มผิวเคลือบพิเศษเลือกอะไรไม่ได้เลย
 * (เจอมาแล้วรอบหนึ่ง — หน้าร้านโชว์ "เคลือบพิเศษ" แต่ไม่มีผิวให้เลือกต่อ)
 */
const COAT_LABEL = "เคลือบลามิเนต";
/** ตั้งให้ตรงกับ label ของคลัง preset-2 ไปเลย กฎ/showWhen จะได้อ้างชื่อเดียวกันทั้งก่อนและหลัง resolve */
const FILM_LABEL = "เคลือบ";
const FOIL_LABEL = "ปั๊มฟอยล์";
const FOIL_COLOR_LABEL = "สีฟอยล์";
const FILM_PRESET = "preset-2";
const COAT_SPECIAL = "เคลือบพิเศษ";

/**
 * รูปงานจริงในบล็อก Card Broad Foam ของหน้าเว็บ (id wixstatic — ตรวจแล้วว่าอยู่ในช่วง DOM ของหัวข้อนี้จริง)
 * ⚠️ ได้แค่ 5 รูป — หน้าแก้ไขสินค้าตัดที่ MAX_PHOTOS = 5 ตอนโหลดเข้าฟอร์ม ใส่เกินไว้จะหายเงียบ ๆ
 * ภาพประจำตัวเลือกไม่นับรวมตรงนี้ (หน้าร้านดึงขึ้นแกลเลอรีให้เองตอนลูกค้ากดเลือก)
 */
const PHOTOS = [
  ["photo-glitter", "959b83_e3928512422a4c978736e93cbb282777", "งานจริง — การ์ดเคลือบกลิตเตอร์ ตั้งโชว์ได้เพราะเนื้อแข็ง"],
  ["photo-foil-gold", "959b83_2ceda1d792d2409ca1de71c22f8d5b71", "งานจริง — ปั๊มฟอยล์ทองบนงานพิมพ์ (2 เลเยอร์)"],
  ["photo-mixed", "959b83_5106229df782415eb93e080e1cd46eb0", "งานจริง — คละหลายลายในออเดอร์เดียว"],
  ["photo-hand", "959b83_fce9a444e2824146b43937718ee67f33", "งานจริง — เทียบขนาดกับมือ (เคลือบพิเศษ + ฟอยล์)"],
  ["photo-edge", "959b83_77f13b33e99644208140114f40457369", "งานจริง — เห็นสันหนา 2 mm ตั้งได้เอง"],
];

/** สีฟอยล์ — ใช้ภาพชุดเดียวกับ Photo card Digital (งานจริงของร้าน) แล้วสำเนาเข้าโฟลเดอร์ของสินค้าตัวนี้ */
const FOIL_COLOR_SRC = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/photocard-digital";
const FOIL_COLORS = [
  { key: "foil-silver", name: "สีเงิน", src: "foil-silver" },
  { key: "foil-gold", name: "สีทอง", src: "foil-gold" },
  { key: "foil-rosegold", name: "สีโรสโกลด์", src: "foil-rosegold" },
  // ฟอยล์โฮโลแกรมเป็น "สีของฟอยล์" ไม่ใช่ชนิดการปั๊ม — คิดเพิ่มคงที่ต่อใบ เหมือนที่ร้านคิดกับ Photo card Digital
  { key: "foil-hologram", name: "สีโฮโลแกรม", src: "foil-hologram", holo: true },
];

/** ฟอยล์โฮโลแกรมปั๊มได้ใหญ่สุดแค่ขนาดนี้ — ขนาดที่ใหญ่กว่านี้จะไม่มีสีโฮโลแกรมให้เลือก */
const HOLO_MAX_SIZE = "A4";

/* ── 1. ดึงบล็อก "Card Broad Foam หนา 2 mm" จากหน้าเว็บ ──────────── */

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
 *
 * หน้านี้มี <p> ที่คร่อมตารางไว้ ถ้าดึงย่อหน้ากับตารางด้วย regex เดียวกัน
 * ตารางจะถูกกลืนไปเป็นข้อความก้อนเดียว — จึงดึงตารางออกก่อน แล้วแทนที่ด้วยช่องว่างความยาวเท่าเดิม
 * (ตำแหน่ง index ของก้อนอื่นไม่ขยับ เอามาเรียงลำดับเอกสารรวมกันได้)
 */
function blocks() {
  const out = [];
  let masked = html;
  for (const m of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const rows = [...m[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) =>
      [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => strip(c[1]))
    );
    if (rows.length > 1) out.push({ at: m.index, table: rows });
    masked = masked.slice(0, m.index) + " ".repeat(m[0].length) + masked.slice(m.index + m[0].length);
  }
  for (const m of masked.matchAll(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<p[^>]*>[\s\S]*?<\/p>/gi)) {
    const s = strip(m[0]);
    if (s) out.push({ at: m.index, text: s });
  }
  return out.sort((a, b) => a.at - b.at);
}

const ALL = blocks();

/* ตาราง Add On เคลือบฟอยล์ อยู่หัวหน้าเว็บ (ใช้ร่วมทั้งหน้า) — ต้องอ่านก่อนตัดเฉพาะบล็อกสินค้า */
const foilTable = ALL.find((b) => b.table && /ฟอยล์/.test(b.table[0][0] ?? ""));
if (!foilTable) throw new Error('ไม่เจอตาราง "Add On เคลือบฟอยล์" บนหน้าเว็บ — โครงหน้าเว็บอาจเปลี่ยน');
const foilPrice = (re, what) => {
  const row = foilTable.table.slice(1).find((r) => re.test(r[0]));
  if (!row) throw new Error(`ในตาราง Add On เคลือบฟอยล์ ไม่เจอแถว${what} — โครงหน้าเว็บอาจเปลี่ยน`);
  const n = Number(String(row[1]).replace(/[^\d]/g, ""));
  if (!n) throw new Error(`ราคาแถว "${row[0]}" อ่านไม่ออก ("${row[1]}")`);
  return n;
};
const FOIL_1 = foilPrice(/1\s*เลเยอร์/, ' "พิมพ์ 1 เลเยอร์"');
const FOIL_2 = foilPrice(/2\s*เลเยอร์/, ' "พิมพ์ 2 เลเยอร์"');

const holoLine = ALL.find((b) => b.text && /โฮโลแกรม\s*บวกเพิ่ม\s*\d+\s*บาท/.test(b.text));
if (!holoLine) throw new Error('ไม่เจอบรรทัด "โฮโลแกรม บวกเพิ่ม N บาท" บนหน้าเว็บ — โครงหน้าเว็บอาจเปลี่ยน');
const HOLO_FEE = Number(/โฮโลแกรม\s*บวกเพิ่ม\s*(\d+)\s*บาท/.exec(holoLine.text)[1]);

// เอาเฉพาะบล็อกของสินค้าตัวนี้ (จนถึงหัวข้อ Ultra-Hard ตัวถัดไป)
// หน้านี้ห่อ <h1> ไว้ใน <p> เดียวกับคำว่า "รายละเอียดเพิ่มเติม::" — ก้อนหัวข้อจึงไม่ใช่ชื่อสินค้าล้วน ๆ
const start = ALL.findIndex((b) => b.text?.startsWith(SECTION));
if (start < 0) throw new Error(`หาหัวข้อ "${SECTION}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
const endRel = ALL.slice(start + 1).findIndex((b) => b.text && /Ultra-Hard/i.test(b.text));
const SEC = ALL.slice(start, endRel < 0 ? ALL.length : start + 1 + endRel);
const SEC_TEXT = SEC.filter((b) => b.text).map((b) => b.text);

/** "1-10 ชิ้น" → { upTo: 10 } · "1000 ชิ้นขึ้นไป" → { upTo: null } */
const tierOf = (label) => {
  const m = label.match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: label.replace(/\s+/g, " ").trim() };
};

const priceTable = SEC.find((b) => b.table && /จำนวน/.test(b.table[0][0] ?? ""));
if (!priceTable) throw new Error(`ในบล็อก "${SECTION}" ไม่เจอตารางราคา (จำนวน × ขนาด) — โครงหน้าเว็บอาจเปลี่ยน`);
const rows = priceTable.table;

/** หัวตารางคือชื่อขนาด — ต้องตรงกับตาราง SIZES ในไฟล์ art ทั้งชื่อและลำดับ (art ถือ "ได้กี่ใบต่อแผ่น A3" ไว้) */
const headSizes = rows[0].slice(1);
const wantSizes = SIZES.map((s) => s.name);
if (headSizes.join("|") !== wantSizes.join("|"))
  throw new Error(`ขนาดบนเว็บเปลี่ยนไปแล้ว — เว็บ [${headSizes.join(", ")}] · สคริปต์ [${wantSizes.join(", ")}]`);

const tiers = rows.slice(1).map((r) => tierOf(r[0]));
tiers.at(-1).upTo = null; // ช่วงสุดท้ายเปิดปลายเสมอ
if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ — ตรวจก่อน");

/** ราคาพื้นฐานต่อใบ (ยังไม่รวมเคลือบ/ฟอยล์) — base[ชื่อขนาด] = [ราคาเรียงตามช่วงจำนวน] */
const base = {};
headSizes.forEach((name, col) => {
  base[name] = rows.slice(1).map((r) => {
    const n = Number(String(r[col + 1]).replace(/[^\d]/g, ""));
    if (!n) throw new Error(`ช่องราคา "${name}" แถว "${r[0]}" อ่านไม่ออก ("${r[col + 1]}")`);
    return n;
  });
});

/** ตัวเลขในบรรทัด "รายละเอียดเพิ่มเติม" ของบล็อกนี้ — อ่านไม่เจอ = หยุด ไม่เดาเอง */
function detail(re, what) {
  const line = SEC_TEXT.find((t) => re.test(t));
  if (!line) throw new Error(`ในบล็อก "${SECTION}" ไม่เจอบรรทัด${what} — โครงหน้าเว็บอาจเปลี่ยน`);
  return Number(re.exec(line)[1]);
}
const COAT_FEE = detail(/เคลือบเงา\s*\/\s*ด้าน\s*บวก\s*(\d+)\s*บาท/, "ค่าเคลือบเงา/ด้าน");
const SPECIAL_FEE_WEB = detail(/เคลือบพิเศษ\s*บวก\s*(\d+)\s*บาท/, "ค่าเคลือบพิเศษ");
/** ค่าเคลือบพิเศษที่ร้านใช้จริง (ต่อแผ่น A3) — ผู้ใช้ยืนยัน 21 ส.ค. 69 ว่าไม่ใช่เลขบนหน้าเว็บ */
const SPECIAL_FEE = 30;
/** ชื่อ "แผ่น" ที่ใช้คิดค่าเคลือบ/ค่าฟอยล์ — 1 แผ่นได้กี่ใบ ดูที่ perSheet ของตัวเลือกขนาด */
const SHEET_UNIT = "แผ่น A3";
const STAMP_FEE = detail(/ปั๊มฟอยล์\s*บวกเพิ่ม\s*(\d+)\s*บาท/, "ค่าปั๊มฟอยล์");
const MIN_PER_DESIGN = detail(/คละลาย\s*ขั้นต่ำลายละ\s*(\d+)\s*ชิ้น/, "กติกาคละลายขั้นต่ำต่อลาย");
const FREE_MIX_BELOW = detail(/\d+\s*[-–]\s*(\d+)\s*ชิ้น\s*สามารถคละลายได้/, "ช่วงที่คละลายได้อิสระ");

/** บล็อกนี้เขียน "ปั๊มฟอยล์ บวกเพิ่ม 60 บาท" ไว้ = ราคาฟอยล์ 2 เลเยอร์ในตาราง Add On หัวหน้าเว็บ */
if (STAMP_FEE !== FOIL_2)
  throw new Error(`ค่าปั๊มฟอยล์ในบล็อก (${STAMP_FEE}) ไม่ตรงกับตาราง Add On 2 เลเยอร์ (${FOIL_2}) — ตรวจหน้าเว็บก่อน`);

/**
 * ทวน "ได้กี่ใบต่อ 1 แผ่น A3" ที่หน้าเว็บระบุไว้ กับผังวางในไฟล์ art
 * เลขชุดนี้เป็นตัวหารค่าเคลือบ/ค่าฟอยล์ ผิดเมื่อไหร่ราคาเพี้ยนทั้งตาราง จึงต้องหยุดให้คนมาดู
 */
const perSheetLines = SEC_TEXT.filter((t) => /ได้\s*\d+\s*ใบ\s*ต่อ\s*1\s*แผ่น\s*A3/.test(t));
if (!perSheetLines.length) throw new Error(`ในบล็อก "${SECTION}" ไม่เจอบรรทัด "Ax ได้ N ใบ ต่อ 1 แผ่น A3" — โครงหน้าเว็บอาจเปลี่ยน`);
for (const line of perSheetLines) {
  const [, name, n] = /^(\S+)\s*ได้\s*(\d+)\s*ใบ/.exec(line) ?? [];
  const s = SIZES.find((z) => z.name === name);
  if (!s) throw new Error(`หน้าเว็บบอกจำนวนใบของ "${name}" แต่ไม่มีขนาดนี้ในตารางราคา — ตรวจก่อน`);
  if (s.perSheet !== Number(n))
    throw new Error(`"${name}" เว็บบอก ${n} ใบต่อแผ่น A3 แต่ผังในไฟล์ art วางได้ ${s.perSheet} ใบ — ตรวจก่อน`);
}

/* ── 2. ประกอบตารางราคา (ขนาด × เคลือบ × ปั๊มฟอยล์) ────────────── */

const COATS = [
  { name: "ไม่เคลือบ", fee: 0, art: "coat-none", popular: true },
  { name: "เคลือบเงา", fee: COAT_FEE, art: "coat-gloss" },
  { name: "เคลือบด้าน", fee: COAT_FEE, art: "coat-matte" },
  { name: COAT_SPECIAL, fee: SPECIAL_FEE, art: "coat-special" },
];

/**
 * กลุ่มนี้คือ "ปั๊มกี่เลเยอร์" อย่างเดียว — ค่าฟอยล์คิดต่อแผ่น A3 จึงต้องอยู่ในแกนตารางราคา (หารตามขนาด)
 * ส่วนโฮโลแกรมย้ายไปเป็น "สี" ในกลุ่มสีฟอยล์ (บวกคงที่ต่อใบตามค่าที่อ่านจากเว็บ) ให้ตรงกับ Photo card Digital
 */
const FOILS = [
  { name: "ไม่ปั๊มฟอยล์", fee: 0, art: "foil-none", popular: true },
  { name: "ปั๊มฟอยล์ 1 เลเยอร์", fee: FOIL_1, art: "foil-1layer", color: true },
  { name: "ปั๊มฟอยล์ 2 เลเยอร์", fee: FOIL_2, art: "foil-2layer", color: true },
];

/**
 * ขนาดที่ใหญ่เกินกว่าจะปั๊มฟอยล์โฮโลแกรมได้ — วัดจากด้านกว้าง/ยาวจริง (มม.) ไม่ใช่ลำดับในตาราง
 * (ลำดับใน SIZES ไม่ได้เรียงตามพื้นที่ เช่น 15x15cm ใหญ่กว่า A7 แต่อยู่ก่อน)
 */
const HOLO_MAX = SIZES.find((s) => s.name === HOLO_MAX_SIZE);
if (!HOLO_MAX) throw new Error(`ไม่มีขนาด "${HOLO_MAX_SIZE}" ในตารางขนาด — ตรวจค่า HOLO_MAX_SIZE ก่อน`);
const fitsHolo = (s) =>
  Math.max(s.w, s.h) <= Math.max(HOLO_MAX.w, HOLO_MAX.h) && Math.min(s.w, s.h) <= Math.min(HOLO_MAX.w, HOLO_MAX.h);
const TOO_BIG_FOR_HOLO = SIZES.filter((s) => !fitsHolo(s)).map((s) => s.name);
const NON_HOLO_COLORS = FOIL_COLORS.filter((c) => !c.holo).map((c) => c.name);

/**
 * ตารางราคามีแกนเดียวคือ "ขนาด" — ตรงกับที่หน้าเว็บเขียนไว้
 * ค่าเคลือบ/ค่าฟอยล์ไม่เข้าราคาต่อชิ้น แต่คิดเป็นค่าวัสดุต่อแผ่น A3 (ดู sheetFee ในกลุ่มตัวเลือก)
 */
const cells = {};
for (const s of SIZES) cells[s.name] = base[s.name];

const PRICING = {
  unit: "ชิ้น",
  driverLabels: [SIZE_LABEL],
  tiers,
  cells,
};

const allPrices = Object.values(cells).flat();
const PRICE_MIN = Math.min(...allPrices);
const PRICE_MAX = Math.max(...allPrices);

console.log(`📋 ตารางราคาจากเว็บ (${SECTION})`);
console.log(`   ${"ช่วงจำนวน".padEnd(16)}${headSizes.map((n) => n.padStart(9)).join("")}`);
tiers.forEach((t, i) => console.log(`   ${t.label.padEnd(16)}${headSizes.map((n) => String(base[n][i]).padStart(9)).join("")}`));
console.log(`   ค่าเคลือบเงา/ด้าน +฿${COAT_FEE} · เคลือบพิเศษ +฿${SPECIAL_FEE} · ฟอยล์ 1 เลเยอร์ +฿${FOIL_1} · 2 เลเยอร์ +฿${FOIL_2} (ต่อ${SHEET_UNIT} ปัดขึ้นเต็มแผ่น)`);
if (SPECIAL_FEE_WEB !== SPECIAL_FEE)
  console.log(`   ⚠️ หน้าเว็บเขียนค่าเคลือบพิเศษ ฿${SPECIAL_FEE_WEB} แต่ใช้ ฿${SPECIAL_FEE} ตามที่ร้านยืนยัน`);
console.log(`   สีฟอยล์ ${FOIL_COLORS.map((c) => c.name).join(" · ")} — สีโฮโลแกรม +฿${HOLO_FEE}/ใบ · ปั๊มได้ใหญ่สุด ${HOLO_MAX_SIZE} (ขนาด ${TOO_BIG_FOR_HOLO.join(" · ")} เลือกไม่ได้)`);
console.log(`   (ปัดขึ้นเป็นแผ่นเต็ม → ใบต่อแผ่น: ${SIZES.map((s) => `${s.name} ${s.perSheet}`).join(" · ")})`);
console.log(`   คละลาย: 1-${FREE_MIX_BELOW} ชิ้นอิสระ · ${FREE_MIX_BELOW + 1} ชิ้นขึ้นไป ลายละ ${MIN_PER_DESIGN} ชิ้นขึ้นไป`);
console.log(`   ตารางราคา ${Object.keys(cells).length} คอลัมน์ × ${tiers.length} ช่วง · ราคา ฿${PRICE_MIN}-${PRICE_MAX}/ชิ้น`);

/* ── 3. อัปภาพ + เขียนสินค้า ─────────────────────────────────────── */

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
async function grab(src) {
  const res = await fetch(src, { headers: { "User-Agent": "Mozilla/5.0 (compatible; iDuckySaleSystem/1.0)" } });
  if (!res.ok) throw new Error(`โหลดรูป ${src} ไม่ได้ — HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// รูปงานจริง — ดึงจาก wixstatic แล้วอัปเข้า storage ของเราเอง (เว็บ Wix เปลี่ยนลิงก์เมื่อไหร่ก็ไม่พัง)
const gallery = [];
for (const [file, wixId, label] of PHOTOS) {
  gallery.push({
    emoji: "🗂️",
    gradient: "from-sky-100 to-blue-200",
    label,
    src: await put(`${file}-${V}`, await grab(`https://static.wixstatic.com/media/${wixId}~mv2.jpg/v1/fit/w_1600,h_1600/x.jpg`)),
  });
}
console.log(`\n🖼  รูปงานจริง ${gallery.length} ภาพ (จากบล็อก "${SECTION}" บนเว็บ)`);

// ภาพประจำตัวเลือก — เตรียมไว้แล้วโดย card-broad-foam-art.mjs
const local = (f) => readFileSync(`${DIR}/${f}.jpg`);
const ART_FILES = [
  ...SIZES.map((s) => s.key),
  "size-compare",
  ...COATS.map((c) => c.art),
  ...FOILS.map((f) => f.art),
  "thick-2mm",
  "mix-rule",
];
const art = {};
for (const f of ART_FILES) art[f] = await put(`${f}-${V}`, local(f));
console.log(`🖼  ภาพประจำตัวเลือก ${ART_FILES.length} ภาพ (${DIR})`);

// สีฟอยล์ — สำเนาภาพงานจริงชุดเดียวกับ Photo card Digital มาไว้ในโฟลเดอร์ของสินค้าตัวนี้
// (ลิงก์ข้ามโฟลเดอร์สินค้าอื่นตรง ๆ ไม่ได้ — วันหลังเขาลบไฟล์ ภาพฝั่งนี้จะหายตาม)
const foilColorArt = {};
for (const c of FOIL_COLORS) foilColorArt[c.key] = await put(`${c.key}-${V}`, await grab(`${FOIL_COLOR_SRC}/${c.src}.jpg`));
console.log(`🖼  สีฟอยล์ ${FOIL_COLORS.length} ภาพ (สำเนาจากงานจริงของ Photo card Digital)`);

// ผิวเคลือบพิเศษ — ใช้ตัวเลือกจากคลังกลาง (แก้ที่คลังครั้งเดียว ทุกสินค้าที่ลิงก์ได้ตามไปด้วย)
const preset = await sb.from("products").select("data").eq("id", `__preset_${FILM_PRESET}`).single();
if (preset.error) throw new Error(`อ่านคลังตัวเลือก ${FILM_PRESET} ไม่ได้ — ${preset.error.message}`);
const FILMS = preset.data.data.choices.map((c) => ({ name: c.name, ...(c.imageSrc ? { imageSrc: c.imageSrc } : {}) }));
console.log(`🎞  ผิวเคลือบพิเศษ ${FILMS.length} แบบ (ลิงก์คลัง ${FILM_PRESET} — “${preset.data.data.label}”)`);

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้า ${ID} ไม่ได้ — ${error.message}`);
const d = structuredClone(row.data);
if (!EXPECT_NAMES.includes(d.name)) throw new Error(`${ID} ชื่อ "${d.name}" ไม่ใช่แถวที่ตั้งใจแก้ — ตรวจก่อน`);

d.name = NAME;
d.category = "card-photo";
d.emoji = "🗂️";
d.gradient = "from-sky-100 to-blue-200";
d.price = PRICE_MIN;
d.badge = "ใหม่";
d.rating = 5;
d.images = gallery;
d.imageSrc = gallery[0].src;
d.artworkRequired = true;

d.description =
  `การ์ดบอร์ดโฟม (Card Broad Foam) หนา 2 mm พิมพ์ลายตามสั่ง เนื้อแข็งตั้งได้ ไม่งอง่ายเหมือนกระดาษแผ่นเดียว ` +
  `สันตัดเห็นไส้โฟมสีขาวเป็นเอกลักษณ์ พิมพ์ด้วยระบบ Digital ผิวสัมผัสเรียบเนียน ` +
  `เลือกได้ ${SIZES.length} ขนาด (${SIZES.map((s) => s.name).join(" · ")}) เริ่มต้นชิ้นละ ${Math.min(...allPrices)} บาท ไม่มีขั้นต่ำในการสั่งผลิต ` +
  `เคลือบลามิเนตเงา / ด้าน / เคลือบพิเศษ (กลิตเตอร์ · ทราย · โฮโลแกรม) และปั๊มฟอยล์เงิน ทอง โรสโกลด์ โฮโลแกรมได้`;

d.highlights = [
  `หนา 2 mm ตั้งได้เอง — สันตัดเห็นไส้โฟมสีขาว ไม่ใช่การ์ดกระดาษแผ่นเดียว`,
  `${SIZES.length} ขนาด ${SIZES.map((s) => s.name).join(" · ")} — A7 เริ่มต้นชิ้นละ ${base["A7"][0]} บาท เหลือ ${base["A7"].at(-1)} บาทเมื่อสั่งเยอะ`,
  `ค่าเคลือบ/ค่าฟอยล์คิดต่อ${SHEET_UNIT} ไม่ใช่ต่อชิ้น — เงา/ด้าน ${COAT_FEE} · พิเศษ ${SPECIAL_FEE} · ฟอยล์ ${FOIL_1}-${FOIL_2} บาทต่อแผ่น`,
  `สั่ง 1-${FREE_MIX_BELOW} ชิ้นคละลายได้อิสระ · ตั้งแต่ ${FREE_MIX_BELOW + 1} ชิ้นขึ้นไป คละได้ลายละ ${MIN_PER_DESIGN} ชิ้นขึ้นไป · ไม่มีขั้นต่ำ`,
];

d.options = [
  {
    label: SIZE_LABEL,
    stockBearing: true,
    choices: SIZES.map((s) => ({
      name: s.name,
      ...(s.name === "A6" ? { popular: true } : {}),
      // 1 แผ่น A3 ได้กี่ใบ — กลุ่มเคลือบ/ฟอยล์เอาไปหารจำนวนที่สั่งเพื่อคิดค่าวัสดุต่อแผ่น
      perSheet: s.perSheet,
      imageSrc: art[s.key],
    })),
  },
  {
    // ค่าเคลือบเป็นค่าฟิล์มต่อแผ่น A3 ไม่ใช่ต่อชิ้น — ⌈จำนวนที่สั่ง ÷ ใบต่อแผ่นของขนาดที่เลือก⌉
    label: COAT_LABEL,
    sheetFee: { from: SIZE_LABEL, unit: SHEET_UNIT },
    choices: COATS.map((c) => ({
      name: c.name,
      ...(c.fee ? { extra: c.fee } : {}),
      ...(c.popular ? { popular: true } : {}),
      imageSrc: art[c.art],
    })),
  },
  {
    label: FILM_LABEL,
    display: "pills",
    presetId: FILM_PRESET,
    showWhen: { label: COAT_LABEL, choices: [COAT_SPECIAL] },
    choices: FILMS,
  },
  {
    // ค่าฟอยล์คิดต่อแผ่น A3 เหมือนค่าเคลือบ
    label: FOIL_LABEL,
    sheetFee: { from: SIZE_LABEL, unit: SHEET_UNIT },
    choices: FOILS.map((f) => ({
      name: f.name,
      ...(f.fee ? { extra: f.fee } : {}),
      ...(f.popular ? { popular: true } : {}),
      imageSrc: art[f.art],
    })),
  },
  {
    // ค่าสีโฮโลแกรมเป็นส่วนหนึ่งของค่าฟอยล์ จึงคิดต่อแผ่น A3 เหมือนกัน
    label: FOIL_COLOR_LABEL,
    sheetFee: { from: SIZE_LABEL, unit: SHEET_UNIT },
    showWhen: { label: FOIL_LABEL, choices: FOILS.filter((f) => f.color).map((f) => f.name) },
    choices: FOIL_COLORS.map((c) => ({
      name: c.name,
      ...(c.holo ? { extra: HOLO_FEE } : {}),
      imageSrc: foilColorArt[c.key],
    })),
  },
];

/** กลุ่มผิวเคลือบพิเศษเปิดใช้เฉพาะตอนเลือกเคลือบพิเศษ (คู่กับ showWhen — กันเลือกค้างไว้จากตัวเลือกเดิม) */
d.rules = [
  {
    when: { label: COAT_LABEL, choice: COAT_SPECIAL, choices: [COAT_SPECIAL] },
    limit: { label: FILM_LABEL, allow: FILMS.map((f) => f.name) },
  },
  /**
   * งานฟอยล์ทำร่วมกับเคลือบลามิเนตไม่ได้ (ผู้ใช้ยืนยัน 21 ส.ค. 69) — ล็อกกันทั้งสองทาง
   *   เลือกฟอยล์  → กลุ่มเคลือบลามิเนตเหลือ "ไม่เคลือบ"
   *   เลือกเคลือบ → กลุ่มฟอยล์เหลือ "ไม่ปั๊มฟอยล์"
   * อยากสลับข้าง ให้ปลดข้างที่เลือกไว้กลับเป็น "ไม่..." ก่อน อีกกลุ่มถึงจะปลดล็อก
   */
  {
    when: {
      label: FOIL_LABEL,
      choice: FOILS.filter((x) => x.fee).map((x) => x.name)[0],
      choices: FOILS.filter((x) => x.fee).map((x) => x.name),
    },
    limit: { label: COAT_LABEL, allow: ["ไม่เคลือบ"] },
  },
  {
    when: {
      label: COAT_LABEL,
      choice: COATS.filter((c) => c.fee).map((c) => c.name)[0],
      choices: COATS.filter((c) => c.fee).map((c) => c.name),
    },
    limit: { label: FOIL_LABEL, allow: [FOILS[0].name] },
  },
  // ฟอยล์โฮโลแกรมปั๊มได้ใหญ่สุดแค่ A4 — ขนาดที่ใหญ่กว่านั้นตัดสีโฮโลแกรมออกจากกลุ่มสีฟอยล์
  ...(TOO_BIG_FOR_HOLO.length
    ? [
        {
          when: { label: SIZE_LABEL, choice: TOO_BIG_FOR_HOLO[0], choices: TOO_BIG_FOR_HOLO },
          limit: { label: FOIL_COLOR_LABEL, allow: NON_HOLO_COLORS },
        },
      ]
    : []),
];

/**
 * คละลายตามหน้าเว็บ: 1-10 ชิ้นคละอิสระ · 11 ชิ้นขึ้นไป ลายละ 5 ชิ้นขึ้นไป
 * tierByDesign = คละเกินโควตาแล้วราคาตกไปคิดตาม "จำนวนชิ้นต่อลาย" (ไม่บล็อกการสั่ง)
 */
d.tierByDesign = true;
d.priceRates = [
  {
    id: "r1",
    label: "ราคาต่อชิ้น",
    desc: `คละลายได้ — 1-${FREE_MIX_BELOW} ชิ้นอิสระ · ${FREE_MIX_BELOW + 1} ชิ้นขึ้นไป ลายละ ${MIN_PER_DESIGN} ชิ้นขึ้นไป`,
    minPerDesign: MIN_PER_DESIGN,
    freeMixBelowQty: FREE_MIX_BELOW + 1,
    pricing: PRICING,
  },
];
d.pricing = PRICING;

d.terms = [
  `การ์ดบอร์ดโฟม หนา 2 mm · ผิวสัมผัสเรียบเนียน · พิมพ์ด้วยระบบ Digital · ไม่มีขั้นต่ำในการสั่งผลิต`,
  `สั่ง 1-${FREE_MIX_BELOW} ชิ้น คละลายได้อิสระ · ตั้งแต่ ${FREE_MIX_BELOW + 1} ชิ้นขึ้นไป คละลายได้ ขั้นต่ำลายละ ${MIN_PER_DESIGN} ชิ้น`,
  `คละเกินโควตาสั่งได้ แต่ราคาจะตกไปคิดตามจำนวนชิ้นต่อลาย (เช่น ${FREE_MIX_BELOW + 1} ชิ้น คละ ${MIN_PER_DESIGN} ลาย = คิดเรทปลีก)`,
  `ค่าเคลือบและค่าฟอยล์คิดเป็นค่าวัสดุ "ต่อ 1 ${SHEET_UNIT}" ไม่ใช่ต่อชิ้น — เคลือบเงา/ด้าน ${COAT_FEE} บาท · เคลือบพิเศษ ${SPECIAL_FEE} บาท · ฟอยล์ 1 เลเยอร์ ${FOIL_1} บาท · 2 เลเยอร์ ${FOIL_2} บาท · สีโฮโลแกรม +${HOLO_FEE} บาท (ทั้งหมดต่อแผ่น)`,
  `สั่งไม่ถึงโควตาต่อแผ่นก็คิด 1 ${SHEET_UNIT} · เกินโควตาขึ้นแผ่นถัดไป — 1 แผ่น A3 ตัดได้ ${SIZES.map((s) => `${s.name} ${s.perSheet} ใบ`).join(" · ")} ` +
    `(เช่น A5 เคลือบพิเศษ สั่ง 1-4 ใบ = ${SPECIAL_FEE} บาท · สั่ง 5 ใบ = 2 แผ่น = ${SPECIAL_FEE * 2} บาท)`,
  `งานฟอยล์ทำร่วมกับการเคลือบลามิเนตไม่ได้ — เลือกได้อย่างใดอย่างหนึ่ง (เลือกข้างไหนแล้ว หน้าสินค้าจะล็อกอีกข้างให้เอง · อยากสลับให้ปลดข้างที่เลือกไว้กลับเป็น "ไม่..." ก่อน)`,
  `สีฟอยล์: ${FOIL_COLORS.map((c) => c.name.replace(/^สี/, "")).join(" · ")} — สีโฮโลแกรมปั๊มได้ใหญ่สุดแค่ ${HOLO_MAX_SIZE} (ขนาด ${TOO_BIG_FOR_HOLO.join(" · ")} เลือกสีโฮโลแกรมไม่ได้)`,
  `งานพิมพ์ฟอยล์ 2 เลเยอร์ ตำแหน่งงานพิมพ์จะเลื่อนประมาณ 1-2 มม. เพราะกระดาษหดตัวจากการพิมพ์และเคลือบหลายรอบ`,
  `ทางร้านใช้สีระบบ RGB สีงานพิมพ์ที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%`,
  `การตัดคลาดเคลื่อนได้ +/- 0.5-2mm ตามข้อจำกัดของเครื่องตัด · งานที่พิมพ์ด้านหลังคลาดเคลื่อนได้ +/- 3-5mm (ไม่ควรวางลายชิดขอบหรือมีเส้นขอบ)`,
  `งานเคลือบลามิเนตอาจมีฝุ่นบนงานเล็กน้อย`,
].join("\n");

/** แท็บข้อมูล — 3 แท็บท้าย (วิธีสั่งงาน / การเตรียมไฟล์ / การรับประกัน) ใช้ของเดิมที่มีอยู่แล้ว */
const keepTabs = (d.tabs ?? []).filter((t) => ["วิธีสั่งงาน", "การเตรียมไฟล์", "การรับประกันสินค้า"].includes(t.title));
d.tabs = [
  {
    title: "รายละเอียดงานพิมพ์",
    text: [
      "::ตัวสินค้า::",
      "• การ์ดบอร์ดโฟม หนา 2 mm — เนื้อแข็ง ตั้งได้ สันตัดเห็นไส้โฟมสีขาว",
      "• ผิวสัมผัสเรียบเนียน พิมพ์ด้วยระบบ Digital",
      `• เลือกได้ ${SIZES.length} ขนาด: ${SIZES.map((s) => `${s.name} (${s.note.split(" — ")[0]})`).join(" · ")}`,
      "::ราคาต่อชิ้น (ค่าเคลือบ/ฟอยล์คิดแยกต่อแผ่น A3)::",
      ...headSizes.map((n) => `• ${n} — ${tiers.map((t, i) => `${t.label} ฿${base[n][i]}`).join(" · ")}`),
      `::ราคาบวกเพิ่ม (คิดต่อ 1 ${SHEET_UNIT} ปัดขึ้นเต็มแผ่น)::`,
      `• เคลือบลามิเนตเงา / ด้าน +${COAT_FEE} บาท · เคลือบพิเศษ +${SPECIAL_FEE} บาท`,
      `• ปั๊มฟอยล์ 1 เลเยอร์ +${FOIL_1} บาท · 2 เลเยอร์ +${FOIL_2} บาท`,
      `• สีฟอยล์เลือกได้ ${FOIL_COLORS.map((c) => c.name.replace(/^สี/, "")).join(" · ")} — สีโฮโลแกรม +${HOLO_FEE} บาทต่อแผ่น และปั๊มได้ใหญ่สุดแค่ ${HOLO_MAX_SIZE}`,
      `• 1 แผ่น A3 ตัดได้ ${SIZES.map((s) => `${s.name} ${s.perSheet} ใบ`).join(" · ")} — สั่งไม่ถึงโควตาก็คิด 1 แผ่นเต็ม`,
      "• เคลือบลามิเนตกับงานฟอยล์ทำร่วมกันไม่ได้ — เลือกข้างไหน อีกข้างจะถูกล็อกให้เอง",
    ].join("\n"),
    images: [art["thick-2mm"], art["size-compare"]],
    imagePos: "bottom",
    imageSize: "md",
  },
  {
    title: "ข้อควรทราบ",
    text: [
      `• สั่ง 1-${FREE_MIX_BELOW} ชิ้น คละลายได้อิสระ · ${FREE_MIX_BELOW + 1} ชิ้นขึ้นไป คละได้ลายละ ${MIN_PER_DESIGN} ชิ้นขึ้นไป`,
      "• งานพิมพ์ฟอยล์ 2 เลเยอร์ ตำแหน่งฟอยล์เลื่อนได้ 1-2 มม. (กระดาษหดตัวจากการพิมพ์และเคลือบหลายรอบ)",
      "• งานฟอยล์ที่มีเส้นบาง ๆ หรือตัวอักษรเล็กมาก ฟอยล์อาจติดไม่ครบ — ไม่ควรใช้ฟอนต์เล็กเกินไป",
      "• การเคลือบแต่ละแบบทำให้สีพิมพ์เข้มขึ้น-อ่อนลงได้เล็กน้อย",
      "• ทางร้านใช้สี RGB สีที่ได้อาจสว่างกว่าหรือดรอปลงจากไฟล์ ±5% ถึง ±15%",
      "• การตัดคลาดเคลื่อน +/- 0.5-2mm · พิมพ์ด้านหลังคลาดเคลื่อน +/- 3-5mm",
    ].join("\n"),
    images: [art["mix-rule"]],
    imagePos: "bottom",
    imageSize: "md",
  },
  ...keepTabs,
];

d.seo = {
  title: "รับทำการ์ดบอร์ดโฟม Card Broad Foam หนา 2 mm พิมพ์ลายตามสั่ง",
  description:
    `รับผลิตการ์ดบอร์ดโฟม (Card Broad Foam) หนา 2 mm พิมพ์ลายตามสั่ง เนื้อแข็งตั้งได้ ` +
    `${SIZES.length} ขนาด ${SIZES.map((s) => s.name).join(" ")} เริ่มต้นชิ้นละ ${Math.min(...allPrices)} บาท ` +
    `เคลือบเงา ด้าน กลิตเตอร์ โฮโลแกรม ปั๊มฟอยล์เงิน ทอง โรสโกลด์ได้ ไม่มีขั้นต่ำในการสั่งผลิต`,
  keywords: [
    "card broad foam",
    "การ์ดบอร์ดโฟม",
    "การ์ดบอร์ดหนา",
    "รับทำการ์ดบอร์ด",
    "การ์ดบอร์ด 2 mm",
    "การ์ดสะสมหนา",
    "พิมพ์การ์ดบอร์ดโฟม",
    "การ์ดบอร์ดปั๊มฟอยล์",
  ],
  faqs: [
    {
      q: "Card Broad Foam ราคาเท่าไหร่?",
      a: `คิดต่อชิ้นตามขนาดและจำนวน — ${headSizes.map((n) => `${n} ชิ้นละ ${base[n][0]}-${base[n].at(-1)} บาท`).join(" · ")} (ค่าเคลือบ/ฟอยล์คิดแยกต่อแผ่น A3)`,
    },
    {
      q: "มีขนาดอะไรให้เลือกบ้าง?",
      a: `${SIZES.map((s) => `${s.name} (${s.note.split(" — ")[0]})`).join(" · ")} — ทุกขนาดหนา 2 mm เท่ากัน`,
    },
    {
      q: "ค่าเคลือบกับค่าปั๊มฟอยล์คิดยังไง?",
      a:
        `คิดเป็นค่าวัสดุต่อ 1 แผ่น A3 ไม่ใช่ต่อชิ้น และปัดขึ้นเป็นแผ่นเต็มเสมอ — เคลือบเงา/ด้าน ${COAT_FEE} บาท · เคลือบพิเศษ ${SPECIAL_FEE} บาท · ` +
        `ปั๊มฟอยล์ 1 เลเยอร์ ${FOIL_1} บาท · 2 เลเยอร์ ${FOIL_2} บาท · สีโฮโลแกรม +${HOLO_FEE} บาท (ปั๊มได้ใหญ่สุด ${HOLO_MAX_SIZE}) · ` +
        `1 แผ่น A3 ตัดได้ ${SIZES.map((s) => `${s.name} ${s.perSheet} ใบ`).join(" · ")} — เช่น A5 เคลือบพิเศษ สั่ง 1-4 ใบ ${SPECIAL_FEE} บาท · สั่ง 5 ใบ ${SPECIAL_FEE * 2} บาท`,
    },
    {
      q: "สั่งกี่ชิ้นถึงคละลายได้?",
      a: `1-${FREE_MIX_BELOW} ชิ้นคละได้อิสระทุกชิ้นคนละลาย · ตั้งแต่ ${FREE_MIX_BELOW + 1} ชิ้นขึ้นไป คละได้ลายละ ${MIN_PER_DESIGN} ชิ้นขึ้นไป · ไม่มีขั้นต่ำในการสั่งผลิต`,
    },
    {
      q: "การ์ดบอร์ดโฟมต่างจากการ์ดกระดาษยังไง?",
      a: "เป็นแผ่นโฟมประกบกระดาษ 2 หน้า หนา 2 mm ตั้งได้เอง ไม่งอง่ายเหมือนกระดาษแผ่นเดียว สันตัดจะเห็นไส้โฟมสีขาว",
    },
  ],
};

/**
 * ฟิลด์ที่ปกติ /api/admin/products เขียนให้ตอนกดบันทึกในหน้าแก้ไข — สคริปต์เขียน DB ตรงจึงต้องทำเอง
 * hidden : คงสถานะฉบับร่างไว้ ให้ทีมงานกดเผยแพร่เองที่ /admin/products
 */
d.quoteOption = d.options.some((o) => o.askPrice || o.choices.some((c) => c.askPrice)) || undefined;
d.priceMin = PRICE_MIN;
d.priceMax = PRICE_MAX;
d.savedAt = new Date().toISOString();

const choices = d.options.flatMap((o) => o.choices);
console.log(`\n📦 ${d.name} (${ID}) · หมวด ${d.category}`);
console.log(`   ราคา ฿${PRICE_MIN}-${PRICE_MAX}/ชิ้น · ตัวเลือก ${d.options.map((o) => `${o.label} ${o.choices.length} แบบ`).join(" · ")}`);
console.log(`   แกลเลอรี ${d.images.length} ภาพ · ภาพประจำตัวเลือก ${choices.filter((c) => c.imageSrc).length}/${choices.length} ตัว`);
console.log(`   แท็บ: ${d.tabs.map((t) => t.title).join(" · ")} · สถานะ: ${d.hidden ? "ฉบับร่าง" : "เผยแพร่"}`);
if (!WRITE) {
  console.log("\n(ยังไม่อัปไฟล์ ไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

const savedb = await sb
  .from("products")
  .update({ data: d, name: d.name, category: d.category, price: d.price, badge: d.badge })
  .eq("id", ID);
if (savedb.error) throw new Error(`บันทึกไม่สำเร็จ — ${savedb.error.message}`);
console.log("\n✅ อัปภาพ + บันทึกแล้ว — ยังเป็นฉบับร่าง กดเผยแพร่ที่ /admin/products");
