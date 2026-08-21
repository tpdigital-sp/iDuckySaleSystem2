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
const TEX_LABEL = "เนื้อกระดาษพิเศษ";
/**
 * กระดาษพิเศษกลุ่มโฮโลแกรม/เงิน-ทองผิวเงา — เคลือบได้เฉพาะด้านหน้า และเลือกได้แค่ "เคลือบเงา" หรือ "ไม่เคลือบ"
 * (ด้านหลังเคลือบไม่ได้เลย จึงไม่มีกลุ่มเคลือบด้านหลังให้เลือกเมื่อเลือกกระดาษพวกนี้)
 */
const COAT_HOLO_LABEL = "เคลือบ ด้านหน้า (กระดาษโฮโลแกรม · เงิน-ทอง)";
const COAT_LABEL = "เคลือบ (ด้านหน้า)";
const COAT_IN_LABEL = "เคลือบ (ด้านหลัง)";
const FILM_LABEL = "เคลือบ"; // กลุ่มที่ลิงก์คลังตัวเลือกกลาง (ผิวฟิล์มพิเศษ 10 แบบ) — ชื่อกลุ่มมาจากคลัง
const FILM_BACK_LABEL = "ผิวฟิล์มพิเศษ (ด้านหลัง)";
const WHITE_LABEL = "พิมพ์รองสีขาว";
const FILM_PRESET = "preset-2";
const COAT_NONE = "ไม่เคลือบ";
const COAT_GLOSS = "เคลือบเงา";
const COAT_MATTE = "เคลือบด้าน";
const COAT_SPECIAL = "เคลือบพิเศษ";
const COAT_IN_NONE = "ไม่เคลือบด้านหลัง";
const COAT_IN_GLOSS = "เคลือบเงา (ด้านหลัง)";
const COAT_IN_MATTE = "เคลือบด้าน (ด้านหลัง)";
const COAT_IN_SPECIAL = "เคลือบพิเศษ (ด้านหลัง)";

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

console.log(`📋 ตารางราคาจากเว็บ (${SECTION}) — กระดาษอาร์ตมัน ${GSM} แกรม`);
tiers.forEach((t, i) => console.log(`   ${t.label.padEnd(20)} ฿${prices[i]}/เซ็ต`));
console.log(`   1 เซ็ต = ${PER_SET} ชิ้น · เคลือบเงา/ด้าน +฿${COAT_FEE}/ด้าน · เคลือบพิเศษ +฿${SPECIAL_FEE}/ด้าน`);

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

/* ── 2. ราคากระดาษอื่น ๆ — อ่านจาก "สินค้ากระดาษ" ของร้านเอง (เรทไดคัทตามทรง) ────
 *
 * หน้าตารางราคาบอกแค่ "กระดาษ 300/400 แกรม หรือกระดาษพิเศษ คิดตามราคา" ไม่ได้ลงตัวเลข
 * ร้านให้ยึดราคาจากสินค้ากระดาษของร้าน 2 ตัว โดยใช้เรท "ไดคัทตามทรง" (ปลอกแก้วเป็นงานไดคัท):
 *   paper-art-pet  → กระดาษอาร์ตมัน 300 / 400 แกรม
 *   texture-paper  → กระดาษพิเศษ 12 เนื้อ
 *
 * ⚠️ ราคาสองตัวนั้นคิดเป็น "แผ่น A3" ส่วนปลอกแก้วขายเป็น "เซ็ต" — ตีเท่ากันแบบ 1 แผ่น A3 = 1 เซ็ต
 *    (1 เซ็ต 6 ชิ้น และใบสเปกของร้านเขียนว่า "11 อันขึ้นไป คละลาย 1 ลาย/1 ขนาด ต่อ 1 แผ่น A3")
 * ⚠️ ค่าเคลือบยังใช้กติกาของปลอกแก้วเอง (+฿COAT ต่อด้าน) บวกทับราคากระดาษ ไม่ได้ใช้คอลัมน์เคลือบ
 *    ของ paper-art-pet (ของเขาเคลือบพิเศษ +30 ปลอกแก้ว +40) — ยึดหน้าตารางราคาของสินค้าตัวนี้
 *
 * ช่วงจำนวนของสองฝั่งไม่เท่ากัน (ปลอกแก้ว 4 ช่วง · กระดาษ 7 ช่วง) จึงรวมเป็นบันไดเดียว
 * แล้วดึงราคาของแต่ละคอลัมน์จาก "ช่วงต้นทางที่ครอบช่วงนั้น" — ไม่มีการเกลี่ย/เดาตัวเลขใหม่
 */
const DIECUT = "ไดคัทตามทรง";
const SRC_ART = "paper-art-pet";
const SRC_TEX = "texture-paper";

async function loadSource(id) {
  const { data, error } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  if (error || !data) throw new Error(`อ่านสินค้าต้นทางราคา ${id} ไม่ได้ — ${error?.message ?? "ไม่มีแถวนี้"}`);
  return data.data;
}

const srcArt = await loadSource(SRC_ART);
const srcTex = await loadSource(SRC_TEX);

const artRate = (srcArt.priceRates ?? []).find((r) => r.label === DIECUT);
if (!artRate) throw new Error(`${SRC_ART} ไม่มีเรท "${DIECUT}" แล้ว — ตรวจสินค้าต้นทางก่อน`);
const artM = artRate.pricing;
const texM = srcTex.pricing;
if (!texM?.driverLabels?.includes("การตัด")) throw new Error(`${SRC_TEX} ไม่มีแกน "การตัด" ในตารางราคาแล้ว — ตรวจก่อน`);

/** ราคาคอลัมน์หนึ่งจากตารางต้นทาง (พังทันทีถ้าคอลัมน์หาย = ต้นทางเปลี่ยนโครง) */
function column(m, key, what) {
  const cells = m.cells[key];
  if (!cells?.length) throw new Error(`ไม่เจอคอลัมน์ "${key}" ใน${what} — ตรวจสินค้าต้นทางก่อน`);
  return cells;
}

/** เนื้อกระดาษพิเศษของ texture-paper (ชื่อ + รูป) — เอามาเป็นตัวเลือกย่อยของ "กระดาษพิเศษ" */
const texGroup = (srcTex.options ?? []).find((o) => o.label === "ชนิดกระดาษ");
if (!texGroup) throw new Error(`${SRC_TEX} ไม่มีกลุ่ม "ชนิดกระดาษ" แล้ว — ตรวจก่อน`);
const texPapers = texGroup.choices.map((c) => ({
  name: c.name,
  imageSrc: c.imageSrc,
  prices: column(texM, `${c.name}│${DIECUT}`, `ตารางราคา ${SRC_TEX}`),
}));
/** เนื้อพิเศษแบ่งเป็น 2 กลุ่มราคา — กลุ่มทั่วไป กับ STARDREAM (แพงกว่า) */
const texGroups = [];
for (const t of texPapers) {
  const g = texGroups.find((x) => x.prices.join() === t.prices.join());
  if (g) g.papers.push(t);
  else texGroups.push({ prices: t.prices, papers: [t] });
}
texGroups.sort((a, b) => a.prices[0] - b.prices[0]);
if (texGroups.length !== 2)
  throw new Error(`${SRC_TEX} เรทไดคัทมี ${texGroups.length} กลุ่มราคา (คาดว่า 2: ทั่วไป / STARDREAM) — ตรวจก่อน`);

/** บันไดจำนวนรวมของทั้งสองฝั่ง (ขอบช่วงที่ฝั่งไหนมีก็เอามาหมด) */
const srcTiers = [
  { tiers, prices },
  { tiers: artM.tiers, prices: column(artM, "กระดาษอาร์ตมัน 300 แกรม│ไม่เคลือบ", `เรท "${DIECUT}" ของ ${SRC_ART}`) },
  { tiers: texM.tiers, prices: texGroups[0].prices },
];
const bounds = [...new Set(srcTiers.flatMap((s) => s.tiers.map((t) => t.upTo)).filter((n) => n !== null))].sort(
  (a, b) => a - b
);
const UNION = [...bounds.map((upTo) => ({ upTo })), { upTo: null }];

/** ราคาของช่วงรวมนี้ = ราคาของ "ช่วงต้นทางที่ครอบมันอยู่" */
function remap(src, srcPrices) {
  return UNION.map((u) => {
    const i = src.findIndex((t) => t.upTo === null || (u.upTo !== null && u.upTo <= t.upTo));
    if (i < 0) throw new Error("บันไดจำนวนของตารางต้นทางไม่ครอบช่วงที่ต้องการ — ตรวจก่อน");
    return srcPrices[i];
  });
}
const artCol = (gsm) => remap(artM.tiers, column(artM, `กระดาษอาร์ตมัน ${gsm} แกรม│ไม่เคลือบ`, `เรท "${DIECUT}" ของ ${SRC_ART}`));

const PAPER_STD = `กระดาษอาร์ตมัน ${GSM} แกรม`;
const PAPER_300 = "กระดาษอาร์ตมัน 300 แกรม";
const PAPER_400 = "กระดาษอาร์ตมัน 400 แกรม";
/**
 * เนื้อกระดาษพิเศษแบ่ง 2 กลุ่มตามข้อจำกัดการเคลือบ (ร้านยืนยัน 21 ส.ค. 69):
 *   โฮโลแกรม / เงิน / ทอง → เคลือบเงา หรือ เคลือบด้าน ได้เท่านั้น (ราคารวมเคลือบแล้ว ไม่บวกเพิ่ม)
 *   เนื้อ Texture / มุก STARDREAM → เคลือบไม่ได้เลย
 * รายชื่อกลุ่มแรกอ่านจากสินค้า texture-paper เอง (กลุ่ม "เคลือบเพิ่ม (ด้านหลัง)" เปิดให้เฉพาะกระดาษพวกนี้)
 * เพื่อไม่ให้ต้องมาไล่แก้ชื่อสองที่เวลาร้านเพิ่มเนื้อกระดาษใหม่
 */
/**
 * เนื้อกระดาษพิเศษที่ "เคลือบได้" — ร้านยืนยัน 21 ส.ค. 69 ว่าได้แค่ผิวเงา และเฉพาะด้านหน้าเท่านั้น
 *   โฮโลแกรม 2 แบบ + สีเงิน/สีทอง เฉพาะ "ผิวเงา"
 *   สีเงิน/สีทอง "ผิวด้าน" และเนื้อ Texture/มุก ทั้งหมด = ไม่เคลือบอะไรเลย
 * (สินค้า texture-paper ของร้านเปิดเคลือบไว้กว้างกว่านี้ — ของปลอกแก้วแคบกว่า จึงระบุรายชื่อตรง ๆ)
 */
const GLOSS_ONLY = [
  "โฮโลแกรม SeaSand (300 แกรม)",
  "โฮโลแกรม Rainbow (300 แกรม)",
  "กระดาษสีเงิน ผิวเงา (250 แกรม)",
  "กระดาษสีทอง ผิวเงา (250 แกรม)",
];
/**
 * กระดาษเนื้อโลหะ/โฮโลแกรม พิมพ์ทับแล้วสีจม — สั่ง "พิมพ์รองสีขาว" ก่อนได้ (บวกเพิ่มต่อแผ่น A3 = ต่อเซ็ต)
 * ราคาตามที่ร้านแจ้ง 21 ส.ค. 69 · เท่ากับ Add On ของสินค้า paper-art-pet
 */
const UNDERPRINT = [
  "โฮโลแกรม SeaSand (300 แกรม)",
  "โฮโลแกรม Rainbow (300 แกรม)",
  "กระดาษสีเงิน ผิวเงา (250 แกรม)",
  "กระดาษสีเงิน ผิวด้าน (250 แกรม)",
  "กระดาษสีทอง ผิวเงา (250 แกรม)",
  "กระดาษสีทอง ผิวด้าน (250 แกรม)",
];
const UNDERPRINT_FEE = 20;
const missing = [...GLOSS_ONLY, ...UNDERPRINT].filter((n) => !texPapers.some((t) => t.name === n));
if (missing.length) throw new Error(`ไม่เจอเนื้อกระดาษ "${missing.join(", ")}" ใน ${SRC_TEX} แล้ว — ตรวจก่อน`);
const texCoatable = texPapers.filter((t) => GLOSS_ONLY.includes(t.name));
const texPlain = texPapers.filter((t) => !GLOSS_ONLY.includes(t.name));
if (texCoatable.some((t) => t.prices.join() !== texGroups[0].prices.join()))
  throw new Error(`กระดาษกลุ่มโฮโลแกรม/เงิน-ทองผิวเงา ราคาไม่เท่ากับเนื้อพิเศษทั่วไปแล้ว — ตรวจ ${SRC_TEX} ก่อน`);

const PAPER_TEX = "กระดาษพิเศษ (Texture Paper)";
/** กระดาษอาร์ตมันทั้งสามแบบ — ใช้เป็นเงื่อนไข "แสดงเมื่อ" ของกลุ่มเคลือบชุดปกติ */
const ART_PAPERS = [PAPER_STD, PAPER_300, PAPER_400];
/** ชื่อเนื้อกระดาษที่ลูกค้าเห็น — เนื้อที่เคลือบไม่ได้ต่อท้ายไว้ให้รู้ตั้งแต่ตอนเลือก */
const texName = (t) => (GLOSS_ONLY.includes(t.name) ? t.name : `${t.name} — เคลือบไม่ได้`);

/**
 * STARDREAM (เนื้อมุก) แพงกว่าเนื้อพิเศษอื่นเท่ากันทุกช่วง — เก็บเป็น "+฿ ของตัวเลือกย่อย"
 * แทนที่จะแยกเป็นคอลัมน์ของตัวเอง ลูกค้าจะได้เลือกเนื้อพิเศษทั้ง 12 แบบจากที่เดียว
 * ต้นทางปรับราคาจนส่วนต่างไม่เท่ากันเมื่อไหร่ = หยุด ให้คนมาตัดสินใจก่อน
 */
const starDiff = [...new Set(texGroups[1].prices.map((n, i) => n - texGroups[0].prices[i]))];
if (starDiff.length !== 1 || starDiff[0] <= 0)
  throw new Error(`ส่วนต่างราคา STARDREAM ใน ${SRC_TEX} ไม่คงที่ (${starDiff.join(", ")}) — ตรวจก่อน`);
const STAR_EXTRA = starDiff[0];

/** ตารางราคาปลอกแก้ว: คอลัมน์ = ชนิดกระดาษ · ช่วง = บันไดรวม (หน่วยเป็น "เซ็ต") */
let from = 1;
const PRICING = {
  unit: "เซ็ต",
  driverLabels: [PAPER_LABEL],
  tiers: UNION.map((u) => {
    const label = u.upTo
      ? `${from}-${u.upTo} เซ็ต (${from * PER_SET}-${u.upTo * PER_SET} ชิ้น)`
      : `${from} เซ็ตขึ้นไป (${from * PER_SET} ชิ้นขึ้นไป)`;
    const row = { upTo: u.upTo, label };
    from = (u.upTo ?? 0) + 1;
    return row;
  }),
  cells: {
    [PAPER_STD]: remap(tiers, prices),
    [PAPER_300]: artCol(300),
    [PAPER_400]: artCol(400),
    [PAPER_TEX]: remap(texM.tiers, texGroups[0].prices),
  },
};

console.log(`\n📋 ตารางราคารวม (คอลัมน์ = ชนิดกระดาษ · ต้นทาง: เว็บ + ${SRC_ART} + ${SRC_TEX} เรท "${DIECUT}")`);
const shortCol = { [PAPER_STD]: "250 แกรม", [PAPER_300]: "300 แกรม", [PAPER_400]: "400 แกรม", [PAPER_TEX]: "พิเศษ" };
console.log(`   ${"ช่วงจำนวน".padEnd(24)}${Object.keys(PRICING.cells).map((k) => shortCol[k].padStart(11)).join("")}`);
PRICING.tiers.forEach((t, i) =>
  console.log(`   ${t.label.padEnd(24)}${Object.values(PRICING.cells).map((c) => `฿${c[i]}`.padStart(11)).join("")}`)
);
console.log(`   (เนื้อ STARDREAM บวกเพิ่มอีก ฿${STAR_EXTRA}/เซ็ต ทุกช่วง)`);

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
  "coat-none",
  "coat-gloss",
  "coat-matte",
  "coat-special",
  "set-of-6",
  "size-3-levels",
  "underprint",
  "underprint-none",
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
  `เลือกเคลือบเงา / เคลือบด้าน / เคลือบพิเศษ (กลิตเตอร์ · โฮโลแกรม) และอัปเกรดกระดาษเป็น 300 / 400 แกรม หรือกระดาษพิเศษได้`;

d.highlights = [
  `เซ็ตละ ${Math.max(...prices)} บาท — 1 เซ็ตได้ ${PER_SET} ชิ้น (สั่งเยอะเหลือเซ็ตละ ${Math.min(...prices)} บาท)`,
  `กระดาษอาร์ตมัน ${GSM} แกรม พิมพ์สีคมชัด ไม่มีขั้นต่ำในการสั่งผลิต`,
  `อัปเกรดเป็นอาร์ตมัน 300 / 400 แกรม หรือกระดาษพิเศษ ${texPapers.length} เนื้อ (โฮโลแกรม · เงิน-ทอง · มุก STARDREAM) ได้`,
  `ขนาด ${SIZE.name} — ปลายปลอกล็อกปรับความกว้างได้ 3 ระดับ ใช้ได้ทั้งแก้วร้อน-แก้วเย็น`,
  `เคลือบเงา / ด้าน +฿${COAT_FEE} ต่อด้าน · เคลือบพิเศษ +฿${SPECIAL_FEE} ต่อด้าน (เลือกผิวฟิล์มได้ ${FILMS.length} แบบ)`,
];

d.templateIds = [SIZE.tpl];

// ขนาดมีแบบเดียว จึงไม่ทำเป็นกลุ่มตัวเลือก — บอกไว้ในรายละเอียด/แท็บ/ภาพสเปกแทน
d.options = [
  {
    // แกนของตารางราคา — ราคาต่อเซ็ตอยู่ในตารางแล้ว ไม่ต้องตั้ง +฿ รายตัว
    label: PAPER_LABEL,
    stockBearing: true,
    choices: [
      { name: PAPER_STD, popular: true, imageSrc: art["paper-250"] },
      { name: PAPER_300, imageSrc: art["paper-300"] },
      { name: PAPER_400, imageSrc: art["paper-400"] },
      { name: PAPER_TEX, imageSrc: texCoatable[0].imageSrc },
    ],
  },
  /**
   * เนื้อกระดาษพิเศษทั้ง 12 แบบอยู่กลุ่มเดียวกัน (รูปลิงก์จาก texture-paper)
   * เนื้อที่เคลือบไม่ได้ต่อท้ายชื่อไว้เลย ลูกค้าจะได้รู้ตั้งแต่ตอนเลือก ไม่ต้องไปงงว่าทำไมไม่มีปุ่มเคลือบ
   */
  {
    label: TEX_LABEL,
    display: "dropdown",
    showWhen: { label: PAPER_LABEL, choices: [PAPER_TEX] },
    choices: texPapers.map((t) => ({
      name: texName(t),
      // เนื้อมุก STARDREAM แพงกว่าเนื้ออื่นเท่ากันทุกช่วง — เก็บเป็น +฿ ของตัวเลือก
      ...(t.prices.join() === texGroups[1].prices.join() ? { extra: STAR_EXTRA } : {}),
      ...(t.imageSrc ? { imageSrc: t.imageSrc } : {}),
    })),
  },
  {
    label: COAT_LABEL,
    // กระดาษอาร์ตมันเท่านั้น — กระดาษพิเศษมีข้อจำกัดของตัวเอง ใช้กลุ่มด้านล่างแทน
    showWhen: { label: PAPER_LABEL, choices: ART_PAPERS },
    choices: [
      { name: COAT_NONE, imageSrc: art["coat-none"] },
      { name: COAT_GLOSS, extra: COAT_FEE, imageSrc: art["coat-gloss"] },
      { name: COAT_MATTE, extra: COAT_FEE, imageSrc: art["coat-matte"] },
      { name: COAT_SPECIAL, extra: SPECIAL_FEE, imageSrc: art["coat-special"] },
    ],
  },
  {
    label: FILM_LABEL,
    display: "pills",
    presetId: FILM_PRESET,
    // เงื่อนไขข้อสองกันค่าค้าง — เคยเลือกเคลือบพิเศษไว้ตอนใช้กระดาษอาร์ตมัน แล้วสลับไปกระดาษพิเศษ
    showWhen: { label: COAT_LABEL, choices: [COAT_SPECIAL] },
    showWhenAlso: { label: PAPER_LABEL, choices: ART_PAPERS },
    choices: FILMS,
  },
  /**
   * กระดาษโฮโลแกรม / เงิน-ทอง — เคลือบเงาหรือด้านได้เท่านั้น และราคารวมเคลือบผิวหน้าไว้แล้ว
   * (ตามสินค้า texture-paper ของร้าน) จึงไม่บวกเพิ่มอีก · เนื้อ Texture/มุก เคลือบไม่ได้ = ไม่มีกลุ่มนี้ให้เลือก
   */
  {
    label: COAT_HOLO_LABEL,
    showWhen: { label: PAPER_LABEL, choices: [PAPER_TEX] },
    showWhenAlso: { label: TEX_LABEL, choices: texCoatable.map(texName) },
    // เลือกได้ 2 แบบ — เคลือบเงา (รวมในราคาแล้ว ไม่บวกเพิ่ม) หรือไม่เคลือบ · เคลือบด้าน/เคลือบพิเศษ ทำไม่ได้
    choices: [
      { name: COAT_GLOSS, imageSrc: art["coat-gloss"] },
      { name: COAT_NONE, imageSrc: art["coat-none"] },
    ],
  },
  {
    label: WHITE_LABEL,
    showWhen: { label: PAPER_LABEL, choices: [PAPER_TEX] },
    showWhenAlso: { label: TEX_LABEL, choices: texPapers.filter((t) => UNDERPRINT.includes(t.name)).map(texName) },
    choices: [
      { name: "ไม่พิมพ์รองสีขาว", imageSrc: art["underprint-none"] },
      { name: "พิมพ์รองสีขาว", extra: UNDERPRINT_FEE, imageSrc: art["underprint"] },
    ],
  },
  {
    label: COAT_IN_LABEL,
    showWhen: { label: PAPER_LABEL, choices: ART_PAPERS },
    choices: [
      { name: COAT_IN_NONE, imageSrc: art["coat-none"] },
      { name: COAT_IN_GLOSS, extra: COAT_FEE, imageSrc: art["coat-gloss"] },
      { name: COAT_IN_MATTE, extra: COAT_FEE, imageSrc: art["coat-matte"] },
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
    showWhenAlso: { label: PAPER_LABEL, choices: ART_PAPERS },
    choices: FILMS,
  },
];

/**
 * กฎเงื่อนไขข้ามกลุ่ม — เหลือข้อเดียว: ผิวฟิล์มพิเศษใช้ได้เฉพาะตอนเลือกเคลือบพิเศษ
 * ข้อจำกัดการเคลือบของกระดาษพิเศษไม่ได้ใช้กฎ เพราะกฎอ่านค่าของกลุ่มที่ถูกซ่อนอยู่ด้วย
 * (เลือกเนื้อกระดาษค้างไว้แล้วสลับไปกระดาษอาร์ตมัน กฎจะไปตัดตัวเลือกเคลือบผิดตัว)
 * — ใช้ "แสดงเมื่อ" 2 เงื่อนไข (ชนิดกระดาษ + เนื้อกระดาษ) กำกับที่กลุ่มเคลือบแทน
 */
d.rules = [
  {
    when: { label: COAT_LABEL, choice: COAT_SPECIAL, choices: [COAT_SPECIAL] },
    limit: { label: FILM_LABEL, allow: FILMS.map((f) => f.name) },
  },
];

d.terms = [
  `จำหน่ายเป็นเซ็ต — 1 เซ็ต ${PER_SET} ชิ้น (1 แบบ | 1 ขนาด : 1 เซ็ต) ราคาในตารางคิดต่อเซ็ต`,
  "จำนวน 1-10 ชิ้น คละลายได้ · ตั้งแต่ 11 ชิ้นขึ้นไป คิด 1 ลาย / 1 ขนาด ต่อ 1 แผ่น A3 — อยากได้หลายลาย เพิ่มจำนวนเซ็ตตามจำนวนลาย",
  `กระดาษมาตรฐานคืออาร์ตมัน ${GSM} แกรม · เลือกอาร์ตมัน 300 / 400 แกรม หรือกระดาษพิเศษได้ ราคาปรับตามชนิดกระดาษในตารางเลย`,
  "ราคากระดาษ 300 / 400 แกรม และกระดาษพิเศษ คิดตามเรทงานไดคัทของกระดาษชนิดนั้น (1 เซ็ต = 1 แผ่น A3)",
  `กระดาษพิเศษเนื้อมุก STARDREAM บวกเพิ่มเซ็ตละ ${STAR_EXTRA} บาท`,
  "กระดาษพิเศษเนื้อโฮโลแกรม และเงิน-ทองผิวเงา เลือกได้ระหว่าง “เคลือบเงาด้านหน้า” (รวมในราคาแล้ว ไม่บวกเพิ่ม) หรือ “ไม่เคลือบ” — เคลือบด้าน/เคลือบพิเศษ และการเคลือบด้านหลัง ทำไม่ได้",
  "กระดาษพิเศษเนื้อเงิน-ทองผิวด้าน · Texture · มุก STARDREAM เคลือบไม่ได้ทั้งสองด้าน",
  `กระดาษโฮโลแกรมและเงิน-ทอง สั่ง “พิมพ์รองสีขาว” ได้ บวกเพิ่มเซ็ตละ ${UNDERPRINT_FEE} บาท (ราคายังไม่รวมพิมพ์รอง — ไม่รองสีขาว สีลายจะจมไปกับเนื้อกระดาษ)`,
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
      "• เลือกชนิดกระดาษ → การเคลือบ (ด้านหน้า/ด้านหลัง) → ใส่จำนวนเซ็ต",
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
      `• เลือกเป็นอาร์ตมัน 300 / 400 แกรม หรือกระดาษพิเศษได้ — ราคาต่อเซ็ตปรับตามตาราง`,
      `• กระดาษพิเศษเลือกเนื้อได้ ${texPapers.length} แบบ ในกลุ่มเดียว (โฮโลแกรม · เงิน-ทอง · Texture · มุก STARDREAM)`,
      `• เนื้อโฮโลแกรม และเงิน-ทอง "ผิวเงา" (${texCoatable.length} แบบ) เลือกได้ระหว่างเคลือบเงาด้านหน้า (รวมในราคาแล้ว) หรือไม่เคลือบ · ด้านหลังเคลือบไม่ได้`,
      `• เนื้ออื่นอีก ${texPlain.length} แบบ (เงิน-ทองผิวด้าน · Texture · มุก STARDREAM) เคลือบไม่ได้ทั้งสองด้าน`,
      `• กระดาษโฮโลแกรม · เงิน-ทอง สั่งพิมพ์รองสีขาวได้ บวกเพิ่มเซ็ตละ ${UNDERPRINT_FEE} บาท (ช่วยให้สีลายไม่จมไปกับเนื้อกระดาษ)`,
      `• เนื้อมุก STARDREAM บวกเพิ่มเซ็ตละ ${STAR_EXTRA} บาท · เนื้ออื่นราคาเท่ากันหมด`,
      "::ราคาบวกเพิ่ม::",
      `• เคลือบเงา / เคลือบด้าน บวกเพิ่ม ${COAT_FEE} บาท ต่อด้าน`,
      `• เคลือบพิเศษ (กลิตเตอร์ · ทราย · โฮโลแกรม) บวกเพิ่ม ${SPECIAL_FEE} บาท ต่อด้าน — เลือกผิวฟิล์มได้ ${FILMS.length} แบบทั้งด้านหน้าและด้านหลัง`,
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
      "• เคลือบคิดเป็น “ต่อด้าน” — ด้านหน้าคือด้านที่พิมพ์ลาย ด้านหลังคือด้านที่แนบแก้ว · เคลือบทั้งสองด้าน คิดเพิ่มทั้งคู่",
      "• เลือกเคลือบพิเศษด้านไหน ก็เลือกผิวฟิล์มของด้านนั้นได้เอง (คนละแบบกันได้)",
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
      a: `เคลือบเงาหรือเคลือบด้าน บวกเพิ่ม ${COAT_FEE} บาทต่อด้าน · เคลือบพิเศษ (กลิตเตอร์ ทราย โฮโลแกรม) บวกเพิ่ม ${SPECIAL_FEE} บาทต่อด้าน และเลือกผิวฟิล์มได้ ${FILMS.length} แบบ`,
    },
    {
      q: "ใช้กระดาษหนากว่านี้ได้ไหม?",
      a: `มาตรฐานเป็นอาร์ตมัน ${GSM} แกรม (เซ็ตละ ${prices[0]} บาท) · เลือกอาร์ตมัน 300 / 400 แกรม หรือกระดาษพิเศษ ${texPapers.length} เนื้อได้ ราคาต่อเซ็ตปรับตามชนิดกระดาษที่เลือกในหน้าสินค้าเลย (เนื้อมุก STARDREAM บวกเพิ่มเซ็ตละ ${STAR_EXTRA} บาท)`,
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
console.log(`   ราคา ฿${d.priceMin}-${d.priceMax}/เซ็ต · ตัวเลือก ${d.options.map((o) => `${o.label} ${o.choices.length} แบบ`).join(" · ")}`);
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
