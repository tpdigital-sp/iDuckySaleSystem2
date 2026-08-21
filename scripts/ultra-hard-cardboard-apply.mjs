#!/usr/bin/env node
/**
 * "Ultra-Hard CardBoard หนา 2 mm" (ultra-hard-cardboard-2-mm) — ดึงราคาจากเว็บตารางราคา + อัปภาพ + เขียนสินค้า
 *
 *   node scripts/ultra-hard-cardboard-art.mjs      # เตรียมภาพประจำตัวเลือกก่อน (.cache/ultra-hard-cardboard/upload)
 *   node scripts/ultra-hard-cardboard-apply.mjs            # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/ultra-hard-cardboard-apply.mjs --write
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/cardboard
 *   หน้านั้นมี 2 บล็อกสินค้า (Card Broad Foam · Ultra-Hard CardBoard) จึงยึด "หัวข้อ" ไม่ใช่ลำดับตาราง
 *   ⚠️ ตารางราคาบนหน้านี้ไม่ได้เป็น <table> จริง — Wix วางเป็นข้อความก้อนเดียว
 *      ("... จำนวน A7 A6 A5 A4 A3 1-10 ชิ้น 75 85 90 110 225 ...") สคริปต์จึงแยกหัวคอลัมน์/แถวจากข้อความ
 *      อ่านไม่ครบหรือจำนวนตัวเลขไม่ลงล็อกเมื่อไหร่ = หยุด ไม่เดาราคาเอง
 *
 * ค่าบวกเพิ่มทุกตัวก็อ่านจากเว็บ ไม่ได้พิมพ์ทับไว้ในโค้ด:
 *   เคลือบเงา/ด้าน · เคลือบพิเศษ · ปั๊มฟอยล์ (ในบล็อกนี้) · เคลือบฟอยล์ 1/2 เลเยอร์ + โฮโลแกรม (ตาราง Add On ของทั้งหน้า)
 *   แล้วทวนกับตัวเลขที่เขียนอยู่บนการ์ดภาพ (FEES ใน art.mjs) — ไม่ตรง = หยุด ให้ไปสร้างภาพใหม่ก่อน
 *
 * ⚠️ สคริปต์เขียนแบบ upsert ลงแถวเดิม id นี้ (แถวนี้มีอยู่แล้วจากรอบนำเข้าสินค้าจากเว็บ — ราคายังเป็นชุดเดียวกัน
 *    แต่ยังไม่มีตัวเลือกเคลือบ/ฟอยล์ ไม่มีภาพประกอบ) ห้ามเปลี่ยน id เป็นชื่อสุ่มแบบปุ่ม "+ เพิ่มสินค้า"
 *    เพราะ id นี้เป็นลิงก์หน้าสินค้าด้วย
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SIZES, FEES } from "./ultra-hard-cardboard-art.mjs";

const WRITE = process.argv.includes("--write");
const ID = "ultra-hard-cardboard-2-mm";
const DIR = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1] || ".cache/ultra-hard-cardboard/upload";
const PAGE = "https://www.iduckyofficial-pricelists.com/cardboard";
const SECTION = "Ultra-Hard CardBoard หนา 2 mm";
const NAME = SECTION;
const V = "v1";

/** ชื่อเดิมที่ยอมให้ทับได้ — กันเผลอรันทับสินค้าตัวอื่นถ้า id ถูกใช้ซ้ำวันหลัง */
const EXPECT_NAMES = [NAME, "Ultra-Hard CardBoard"];

const UNIT = "ชิ้น";
const SIZE_LABEL = "ขนาด";
const COAT_LABEL = "เคลือบลามิเนต";
const FILM_LABEL = "เคลือบ"; // กลุ่มที่ลิงก์คลังตัวเลือกกลาง (ผิวฟิล์มพิเศษ 10 แบบ)
const FILM_PRESET = "preset-2";
const COAT_SPECIAL = "เคลือบพิเศษ";
const FOIL_LABEL = "เคลือบฟอยล์ (Add On)";
const FOIL_COLOR_LABEL = "สีฟอยล์";
const STAMP_LABEL = "ปั๊มฟอยล์ (Add On)";
const FOIL_NONE = "ไม่เคลือบฟอยล์";

/**
 * รูปงานจริงในบล็อก "Ultra-Hard CardBoard" ของหน้าเว็บ
 * (id wixstatic — ตรวจแล้วว่าอยู่ในแกลเลอรีช่วง DOM ต่อจากหัวข้อนี้จริง ไม่ใช่ของบล็อก Card Broad Foam)
 * ⚠️ หน้าแก้ไขสินค้าตัดที่ MAX_PHOTOS = 5 ตอนโหลดเข้าฟอร์ม — บล็อกนี้มีรูปงานจริง 3 รูป ยังไม่ชนเพดาน
 * ภาพประจำตัวเลือกไม่นับรวมตรงนี้ (หน้าร้านดึงขึ้นแกลเลอรีให้เองตอนลูกค้ากดเลือก)
 */
const PHOTOS = [
  ["photo-stand", "959b83_85fe52965259401f94a90fdc51f896fb", "งานจริง — แผ่นการ์ดบอร์ดพิมพ์เต็มหน้า ตั้งพิงได้เอง"],
  ["photo-fan", "959b83_a55597458e654edfab867865af2cce3a", "งานจริง — เรียงเทียบหลายขนาด เห็นสันแผ่นหนา 2 มม."],
  ["photo-stack", "959b83_89c8759630bf48e19dcb3f9c094719be", "งานจริง — ซ้อนกันหลายขนาด ตั้งแต่ A3 ถึงใบเล็ก"],
];

/* ── 1. ดึงบล็อก "Ultra-Hard CardBoard" จากหน้าเว็บ ──────────────── */

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

/** ไล่อ่านหน้าเว็บเป็น "ก้อน" ตามลำดับเอกสาร (ย่อหน้า/หัวข้อ/ตาราง) */
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
const start = ALL.findIndex((b) => b.text && b.text.startsWith(SECTION) && /จำนวน/.test(b.text));
if (start < 0) throw new Error(`หาก้อนตารางราคาของ "${SECTION}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
/** จบบล็อกที่ก้อน "ข้อจำกัด / วิธีสั่งงาน / การรับประกันสินค้า" ที่เป็นท้ายหน้าร่วมของทั้งหน้า */
const endRel = ALL.slice(start + 1).findIndex((b) => b.text && /^ข้อจำกัด/.test(b.text));
if (endRel < 0) throw new Error(`หาจุดจบของบล็อก "${SECTION}" ไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
const SEC = ALL.slice(start, start + 1 + endRel);
const SEC_TEXT = SEC.filter((b) => b.text).map((b) => b.text);

/**
 * แยกตารางราคาออกจากก้อนข้อความก้อนเดียว
 *   "<ชื่อสินค้า> จำนวน A7 A6 A5 A4 A3 1-10 ชิ้น 75 85 90 110 225 ... 1000 ชิ้นขึ้นไป 40 50 55 90 205 รายละเอียดเพิ่มเติม::"
 * → { heads: ["A7",...], rows: [{ label, upTo, prices[] }, ...] }
 */
function parseGrid(text) {
  const body = text.split(/จำนวน/)[1]?.split(/รายละเอียดเพิ่มเติม/)[0];
  if (!body) throw new Error(`ก้อนตารางราคาของ "${SECTION}" ไม่มีคำว่า "จำนวน" หรือ "รายละเอียดเพิ่มเติม" — โครงหน้าเว็บอาจเปลี่ยน`);
  const tk = body.trim().split(/\s+/);
  let i = 0;
  const heads = [];
  while (i < tk.length && /^A\d+$/.test(tk[i])) heads.push(tk[i++]);
  if (heads.length < 2) throw new Error(`อ่านหัวคอลัมน์ขนาดจากตารางไม่ได้ (เจอ ${heads.length} คอลัมน์) — ตรวจหน้าเว็บก่อน`);

  const rows = [];
  while (i < tk.length) {
    const m = /^(\d+)(?:[-–](\d+))?$/.exec(tk[i]);
    if (!m) throw new Error(`อ่านช่วงจำนวนไม่ออกที่ "${tk.slice(i, i + 4).join(" ")}" — ตรวจหน้าเว็บก่อน`);
    i++;
    // คำต่อท้ายช่วง เช่น "ชิ้น" / "ชิ้นข" (เว็บพิมพ์ตกไว้) / "ชิ้นขึ้นไป"
    if (!/ชิ้น/.test(tk[i] ?? "")) throw new Error(`หลังช่วง "${m[0]}" ไม่เจอคำว่า "ชิ้น" (เจอ "${tk[i]}") — ตรวจหน้าเว็บก่อน`);
    const open = /ขึ้นไป/.test(tk[i]);
    i++;
    const prices = [];
    for (let k = 0; k < heads.length; k++, i++) {
      const n = Number(tk[i]);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`ราคาแถว "${m[0]}" คอลัมน์ "${heads[k]}" อ่านไม่ออก ("${tk[i]}")`);
      prices.push(n);
    }
    rows.push({
      label: m[2] ? `${m[1]}-${m[2]} ${UNIT}` : `${m[1]} ${UNIT}ขึ้นไป`,
      upTo: open ? null : m[2] ? Number(m[2]) : null,
      open,
      prices,
    });
  }
  if (rows.length < 2) throw new Error(`ตารางราคามีแค่ ${rows.length} ช่วงจำนวน — ตรวจหน้าเว็บก่อน`);
  if (!rows.at(-1).open) throw new Error(`ช่วงจำนวนสุดท้ายไม่ใช่แบบ "ขึ้นไป" — ตรวจหน้าเว็บก่อน`);
  if (rows.some((r, k) => k < rows.length - 1 && !r.upTo)) throw new Error("ช่วงจำนวนกลางตารางอ่านไม่ครบ — ตรวจหน้าเว็บก่อน");
  return { heads, rows };
}

const GRID = parseGrid(SEC[0].text);

/** ตัวเลขในบรรทัด "รายละเอียดเพิ่มเติม" ของบล็อกนี้ — อ่านไม่เจอ = หยุด ไม่เดาเอง */
function detail(re, what, pool = SEC_TEXT) {
  const line = pool.find((t) => re.test(t));
  if (!line) throw new Error(`ในบล็อก "${SECTION}" ไม่เจอบรรทัด${what} — โครงหน้าเว็บอาจเปลี่ยน`);
  return Number(re.exec(line)[1]);
}
const COAT_FEE = detail(/เคลือบเงา\s*\/\s*ด้าน\s*บวก\s*(\d+)\s*บาท/, "ค่าเคลือบเงา/ด้าน");
const SPECIAL_FEE = detail(/เคลือบพิเศษ\s*บวก\s*(\d+)\s*บาท/, "ค่าเคลือบพิเศษ");
const STAMP_FEE = detail(/ปั๊มฟอยล์\s*บวกเพิ่ม\s*(\d+)\s*บาท/, "ค่าปั๊มฟอยล์");
const THICK_MM = detail(/ความหนา\s*([\d.]+)\s*mm/i, "ความหนาของแผ่น");
const MIX_FREE_BELOW = detail(/ตั้งแต่\s*(\d+)\s*ชิ้นขึ้นไป\s*คละลาย/, "เงื่อนไขคละลาย (ตั้งแต่กี่ชิ้น)");
const MIX_MIN = detail(/คละลาย\s*ขั้นต่ำลายละ\s*(\d+)\s*ชิ้น/, "คละลายขั้นต่ำลายละกี่ชิ้น");

/** ตาราง Add On "เคลือบฟอยล์" ของทั้งหน้า (อยู่หัวหน้าเว็บ ใช้ร่วมกันทั้ง 2 บล็อก) */
const foilTable = ALL.find((b) => b.table && /เคลือบฟอยล์/.test(b.table[0][0] ?? ""));
if (!foilTable) throw new Error(`ในหน้าเว็บไม่เจอตาราง Add On "เคลือบฟอยล์" — โครงหน้าเว็บอาจเปลี่ยน`);
const foilRow = (re, what) => {
  const row = foilTable.table.slice(1).find((r) => re.test(r[0]));
  if (!row) throw new Error(`ตาราง Add On เคลือบฟอยล์ ไม่มีแถว${what} — ตรวจหน้าเว็บก่อน`);
  const n = Number(String(row[1]).replace(/[^\d]/g, ""));
  if (!n) throw new Error(`ราคาแถว "${row[0]}" อ่านไม่ออก ("${row[1]}")`);
  return { name: row[0].replace(/\s+/g, " ").trim(), price: n };
};
const FOIL1 = foilRow(/1\s*เลเยอร์/, ' "พิมพ์ 1 เลเยอร์"');
const FOIL2 = foilRow(/2\s*เลเยอร์/, ' "พิมพ์ 2 เลเยอร์"');
const HOLO_FEE = detail(/โฮโลแกรม\s*บวกเพิ่ม\s*(\d+)\s*บาท/, "ค่าฟอยล์โฮโลแกรม", ALL.filter((b) => b.text).map((b) => b.text));

/** ชื่อสีฟอยล์จากบรรทัดใต้ตาราง Add On ("เคลือบฟอยล์ สีเงิน , สีทอง , สีโรสโกล , สีโฮโลแกรม") */
const foilColorLine = ALL.find((b) => b.text && /^เคลือบฟอยล์\s*สี/.test(b.text))?.text;
if (!foilColorLine) throw new Error("ในหน้าเว็บไม่เจอบรรทัดบอกสีฟอยล์ — โครงหน้าเว็บอาจเปลี่ยน");
const WEB_FOIL_COLORS = foilColorLine.replace(/^เคลือบฟอยล์\s*/, "").split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);

/** "A4 ได้ 2 ใบ ต่อ 1 แผ่น A3" — ทวนกับตัวเลขที่วาดไว้บนการ์ดภาพขนาด */
for (const s of SIZES) {
  if (s.perA3 === 1) continue;
  const re = new RegExp(`${s.name}\\s*ได้\\s*(\\d+)\\s*ใบ\\s*ต่อ\\s*1\\s*แผ่น\\s*A3`);
  const got = detail(re, ` "${s.name} ได้ N ใบ ต่อ 1 แผ่น A3"`);
  if (got !== s.perA3)
    throw new Error(`เว็บบอก ${s.name} ได้ ${got} ใบต่อแผ่น A3 แต่การ์ดภาพวาดไว้ ${s.perA3} ใบ — แก้ SIZES ใน art.mjs แล้วสร้างภาพใหม่ก่อน`);
}

/** ค่าบวกเพิ่มที่เขียนอยู่บนการ์ดภาพ ต้องตรงกับที่เพิ่งอ่านมาจากเว็บ ไม่งั้นภาพจะบอกราคาผิด */
const feeCheck = [
  ["ค่าเคลือบเงา/ด้าน", COAT_FEE, FEES.coat],
  ["ค่าเคลือบพิเศษ", SPECIAL_FEE, FEES.special],
  ["ค่าเคลือบฟอยล์ 1 เลเยอร์", FOIL1.price, FEES.foil1],
  ["ค่าเคลือบฟอยล์ 2 เลเยอร์", FOIL2.price, FEES.foil2],
  ["ค่าฟอยล์โฮโลแกรม", HOLO_FEE, FEES.holo],
  ["ค่าปั๊มฟอยล์", STAMP_FEE, FEES.stamp],
].filter(([, web, art]) => web !== art);
if (feeCheck.length)
  throw new Error(
    `ราคาบนเว็บไม่ตรงกับตัวเลขที่เขียนอยู่บนการ์ดภาพ (FEES ใน art.mjs) —\n` +
      feeCheck.map(([what, web, art]) => `   ${what}: เว็บ ${web} · การ์ดภาพ ${art}`).join("\n") +
      `\n   แก้ FEES แล้วรัน node scripts/ultra-hard-cardboard-art.mjs ใหม่ก่อน`
  );

/** ขนาดที่มีในตารางเว็บ ต้องตรงกับชุดที่เตรียมภาพไว้ (เว็บเพิ่มขนาดใหม่ = ต้องมีภาพก่อน) */
const noArt = GRID.heads.filter((h) => !SIZES.some((s) => s.name === h));
if (noArt.length)
  throw new Error(
    `ขนาด "${noArt.join(", ")}" มีในตารางเว็บแต่ยังไม่มีภาพประกอบ — เพิ่มใน SIZES ของ scripts/ultra-hard-cardboard-art.mjs ก่อน\n` +
      `   (สินค้าตัวนี้ตั้งใจให้ทุกตัวเลือกมีภาพว่าหน้าตาเป็นแบบไหน)`
  );
const gone = SIZES.filter((s) => !GRID.heads.includes(s.name));
if (gone.length) throw new Error(`ขนาด "${gone.map((s) => s.name).join(", ")}" หายจากตารางเว็บแล้ว — ตรวจหน้าเว็บก่อนรันทับ`);

/** เรียงตัวเลือกขนาดจากเล็กไปใหญ่ตาม SIZES (เว็บเรียง A7→A3 อยู่แล้ว แต่ไม่ยึดลำดับเว็บ) */
const SIZE_ORDER = SIZES.filter((s) => GRID.heads.includes(s.name));
const sizeChoiceName = (s) => `${s.name} (${(s.mm[0] / 10).toFixed(1)} x ${(s.mm[1] / 10).toFixed(1)} ซม.)`;

const tiers = GRID.rows.map((r) => ({ upTo: r.upTo, label: r.label }));
const cells = {};
for (const s of SIZE_ORDER) {
  const ci = GRID.heads.indexOf(s.name);
  cells[sizeChoiceName(s)] = GRID.rows.map((r) => r.prices[ci]);
}
const PRICING = { unit: UNIT, driverLabels: [SIZE_LABEL], tiers, cells };
const allPrices = Object.values(cells).flat();

console.log(`📊 บล็อก "${SECTION}" จากเว็บ · ${tiers.length} ช่วงจำนวน`);
console.log(`   ${"ขนาด".padEnd(22)}${tiers.map((t) => t.label.padStart(16)).join("")}`);
for (const s of SIZE_ORDER)
  console.log(`   ${sizeChoiceName(s).padEnd(22)}${cells[sizeChoiceName(s)].map((p) => `฿${p}`.padStart(16)).join("")}`);
console.log(`   ความหนา ${THICK_MM} มม. · คละลาย: ต่ำกว่า ${MIX_FREE_BELOW} ชิ้นอิสระ · ตั้งแต่ ${MIX_FREE_BELOW} ชิ้นขึ้นไป ลายละ ${MIX_MIN} ชิ้นขึ้นไป`);
console.log(`   เคลือบเงา/ด้าน +฿${COAT_FEE} · เคลือบพิเศษ +฿${SPECIAL_FEE} · ปั๊มฟอยล์ +฿${STAMP_FEE}`);
console.log(`   เคลือบฟอยล์: ${FOIL1.name} +฿${FOIL1.price} · ${FOIL2.name} +฿${FOIL2.price} · โฮโลแกรม +฿${HOLO_FEE}`);
console.log(`   สีฟอยล์บนเว็บ: ${WEB_FOIL_COLORS.join(" · ")}`);

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
  const up = await sb.storage.from("product-images").upload(`products/${ID}/${file}`, buf, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

// รูปงานจริง — ดึงจาก wixstatic แล้วอัปเข้า storage ของเราเอง (เว็บ Wix เปลี่ยนลิงก์เมื่อไหร่ก็ไม่พัง)
const gallery = [];
for (const [file, wixId, label] of PHOTOS) {
  const res = await fetch(`https://static.wixstatic.com/media/${wixId}~mv2.jpg/v1/fit/w_1600,h_1600/x.jpg`);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  gallery.push({
    emoji: "🗂️",
    gradient: "from-sky-100 to-blue-200",
    label,
    src: await put(`${file}-${V}`, Buffer.from(await res.arrayBuffer())),
  });
}
console.log(`\n🖼  รูปงานจริง ${gallery.length} ภาพ (จากแกลเลอรีบล็อก "${SECTION}" บนเว็บ)`);

// ภาพประจำตัวเลือก — เตรียมไว้แล้วโดย ultra-hard-cardboard-art.mjs
const local = (f) => readFileSync(`${DIR}/${f}.jpg`);
const ART_FILES = [
  ...SIZE_ORDER.map((s) => s.key),
  "size-chart",
  "thickness-2mm",
  "coat-none",
  "coat-gloss",
  "coat-matte",
  "coat-special",
  "foil-none",
  "foil-1layer",
  "foil-2layer",
  "foil-silver",
  "foil-gold",
  "foil-rosegold",
  "foil-hologram",
  "stamp-none",
  "stamp-foil",
  "a3-chart",
];
const art = {};
for (const f of ART_FILES) art[f] = await put(`${f}-${V}`, local(f));
console.log(`🖼  ภาพประจำตัวเลือก ${ART_FILES.length} ภาพ (${DIR})`);

// ผิวฟิล์มพิเศษ — ใช้ตัวเลือกจากคลังกลาง (แก้ที่คลังครั้งเดียว ทุกสินค้าที่ลิงก์ได้ตามไปด้วย)
const preset = await sb.from("products").select("data").eq("id", `__preset_${FILM_PRESET}`).single();
if (preset.error) throw new Error(`อ่านคลังตัวเลือก ${FILM_PRESET} ไม่ได้ — ${preset.error.message}`);
const FILMS = preset.data.data.choices.map((c) => ({ name: c.name, ...(c.imageSrc ? { imageSrc: c.imageSrc } : {}) }));
console.log(`🎞  ผิวฟิล์มพิเศษ ${FILMS.length} แบบ (ลิงก์คลัง ${FILM_PRESET} — “${preset.data.data.label}”)`);

const { data: row, error } = await sb.from("products").select("id,sort,sold,data").eq("id", ID).maybeSingle();
if (error) throw new Error(`อ่านสินค้า ${ID} ไม่ได้ — ${error.message}`);
if (row && !EXPECT_NAMES.includes(row.data?.name))
  throw new Error(`${ID} ชื่อ "${row.data?.name}" ไม่ใช่แถวที่ตั้งใจแก้ — ตรวจก่อน`);
console.log(row ? `\n✏️  เติมของลงแถวเดิม ${ID}` : `\n🆕 ยังไม่มีแถว ${ID} — สร้างสินค้าใหม่ให้`);

/** ไม่มีแถวเดิม = ขึ้นของใหม่ทั้งชุด · สินค้าใหม่เริ่มเป็น "ฉบับร่าง" เสมอ (กดเผยแพร่เองที่ /admin/products) */
const d = structuredClone(row?.data ?? { id: ID, sold: 0, featured: false, hidden: true, body: [] });
d.id = ID;
d.name = NAME;
d.slug = "ultra-hard-cardboard";
d.category = "card-photo";
d.emoji = "🗂️";
d.gradient = "from-sky-100 to-blue-200";
d.unit = UNIT;
d.price = Math.min(...allPrices);
d.badge = "ใหม่";
d.rating = 5;
d.sold = d.sold ?? 0;
d.artworkRequired = true;

d.pricing = PRICING;
d.priceRates = [
  {
    id: "r1",
    label: `ราคาต่อ${UNIT}`,
    desc: `1-${MIX_FREE_BELOW - 1} ${UNIT} คละลายได้อิสระ · ตั้งแต่ ${MIX_FREE_BELOW} ${UNIT}ขึ้นไป คละลายได้ ลายละ ${MIX_MIN} ชิ้นขึ้นไป`,
    minPerDesign: MIX_MIN,
    freeMixBelowQty: MIX_FREE_BELOW,
    pricing: PRICING,
  },
];

const FOIL_COLORS = [
  { name: "สีเงิน", art: "foil-silver" },
  { name: "สีทอง", art: "foil-gold" },
  { name: "สีโรสโกลด์", art: "foil-rosegold" },
  { name: "สีโฮโลแกรม", art: "foil-hologram", extra: HOLO_FEE },
];
const FOIL_LAYERS = [
  { name: FOIL1.name, extra: FOIL1.price, art: "foil-1layer" },
  { name: FOIL2.name, extra: FOIL2.price, art: "foil-2layer" },
];

d.options = [
  {
    label: SIZE_LABEL,
    stockBearing: true,
    choices: SIZE_ORDER.map((s) => ({
      name: sizeChoiceName(s),
      ...(s.name === "A6" ? { popular: true } : {}),
      imageSrc: art[s.key],
    })),
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
    label: FOIL_LABEL,
    choices: [
      { name: FOIL_NONE, imageSrc: art["foil-none"] },
      ...FOIL_LAYERS.map((f) => ({ name: f.name, extra: f.extra, imageSrc: art[f.art] })),
    ],
  },
  {
    label: FOIL_COLOR_LABEL,
    showWhen: { label: FOIL_LABEL, choices: FOIL_LAYERS.map((f) => f.name) },
    choices: FOIL_COLORS.map((c) => ({ name: c.name, ...(c.extra ? { extra: c.extra } : {}), imageSrc: art[c.art] })),
  },
  {
    label: STAMP_LABEL,
    choices: [
      { name: "ไม่ปั๊มฟอยล์", imageSrc: art["stamp-none"] },
      { name: "ปั๊มฟอยล์", extra: STAMP_FEE, imageSrc: art["stamp-foil"] },
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

d.images = gallery;
d.imageSrc = gallery[0].src;

const sizeList = SIZE_ORDER.map((s) => s.name).join(" · ");
const cheapest = Math.min(...allPrices);
const startAt = Math.min(...GRID.rows[0].prices);

d.description =
  `Ultra-Hard CardBoard การ์ดบอร์ดแบบหนา ${THICK_MM} มม. พิมพ์ลายตามสั่งด้วยระบบ Digital ไม่มีขั้นต่ำในการสั่งผลิต ` +
  `เนื้อแผ่นแข็ง ผิวสัมผัสเรียบเนียน ตั้งโชว์ได้ไม่งอ เลือกได้ ${SIZE_ORDER.length} ขนาด (${sizeList}) ` +
  `เริ่มต้นชิ้นละ ${startAt} บาท สั่งเยอะเหลือชิ้นละ ${cheapest} บาท ` +
  `เคลือบลามิเนตเงา / ด้าน / เคลือบพิเศษ (กลิตเตอร์ · ทราย · โฮโลแกรม) ได้ ` +
  `และเพิ่มงานฟอยล์ได้ทั้งเคลือบฟอยล์ (1-2 เลเยอร์) และปั๊มฟอยล์ ` +
  `ทุกตัวเลือกมีภาพให้ดูก่อนสั่งว่าหน้าตาเป็นแบบไหน`;

d.highlights = [
  `การ์ดบอร์ดหนา ${THICK_MM} มม. ผิวเรียบเนียน — แข็งกว่ากระดาษการ์ดทั่วไป ตั้งได้ไม่งอ`,
  `${SIZE_ORDER.length} ขนาดให้เลือก พร้อมภาพเทียบขนาดทุกใบ — ${sizeList}`,
  `เริ่มต้นชิ้นละ ${startAt} บาท · สั่ง ${GRID.rows.at(-1).label} เหลือชิ้นละ ${cheapest} บาท`,
  `เคลือบเงา / ด้าน +${COAT_FEE} บาท · เคลือบพิเศษ +${SPECIAL_FEE} บาท (เลือกผิวฟิล์มได้ ${FILMS.length} แบบ)`,
  `เคลือบฟอยล์ 1 เลเยอร์ +${FOIL1.price} บาท · 2 เลเยอร์ +${FOIL2.price} บาท (${WEB_FOIL_COLORS.length} สีฟอยล์) · ปั๊มฟอยล์ +${STAMP_FEE} บาท`,
  `ไม่มีขั้นต่ำ — สั่ง 1 ชิ้นก็ได้ · 1-${MIX_FREE_BELOW - 1} ชิ้นคละลายได้อิสระ`,
];

const priceRow = (s) => `${sizeChoiceName(s)} — ${cells[sizeChoiceName(s)].map((p, i) => `${tiers[i].label} ${p} บาท`).join(" · ")}`;

d.terms = [
  `การ์ดบอร์ดแบบหนา ${THICK_MM} มม. ผิวสัมผัสเรียบเนียน · พิมพ์ด้วยระบบ Digital · ไม่มีขั้นต่ำในการสั่งผลิต`,
  `จำนวน 1-${MIX_FREE_BELOW - 1} ชิ้น คละลายได้อิสระ · ตั้งแต่ ${MIX_FREE_BELOW} ชิ้นขึ้นไป คละลายได้ ลายละ ${MIX_MIN} ชิ้นขึ้นไป ไม่ถึงตามจำนวน คิดตามราคาปลีก`,
  `เคลือบลามิเนตเนื้อเงา / ด้าน บวกเพิ่ม ${COAT_FEE} บาท · เคลือบพิเศษ (กลิตเตอร์ · ทราย · โฮโลแกรม) บวกเพิ่ม ${SPECIAL_FEE} บาท`,
  `เคลือบฟอยล์: ${FOIL1.name} ${FOIL1.price} บาท · ${FOIL2.name} ${FOIL2.price} บาท · เลือกสีฟอยล์ได้ ${WEB_FOIL_COLORS.join(" / ")} (โฮโลแกรมบวกเพิ่ม ${HOLO_FEE} บาท)`,
  `ปั๊มฟอยล์ (Add On) บวกเพิ่ม ${STAMP_FEE} บาท`,
  `จำนวนงานเคลือบลามิเนตและปั๊มฟอยล์คิดต่อ 1 แผ่น A3 — ${SIZE_ORDER.filter((s) => s.perA3 > 1)
    .map((s) => `${s.name} ได้ ${s.perA3} ใบ`)
    .join(" · ")}`,
  "งานพิมพ์ 2 เลเยอร์ ตำแหน่งพิมพ์อาจเลื่อนประมาณ 1-2 มม. เพราะกระดาษหดตัวจากการพิมพ์และเคลือบหลายรอบ",
  "ทางร้านใช้สีระบบ RGB สีงานพิมพ์ที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
  "การเคลือบแต่ละแบบทำให้สีพิมพ์เข้มขึ้น-อ่อนลงได้เล็กน้อย · งานเคลือบลามิเนตอาจมีฝุ่นบนงานเล็กน้อย",
  "การตัดชิ้นงานอาจคลาดเคลื่อน +/- 0.5-2 มม. ตามข้อจำกัดของเครื่องตัด · งานที่พิมพ์ด้านหลังคลาดเคลื่อนได้ +/- 3-5 มม. ไม่ควรวางงานชิดขอบหรือมีเส้นขอบ",
].join("\n");

/**
 * แท็บข้อมูล — 3 แท็บท้าย (วิธีสั่งงาน / การเตรียมไฟล์ / การรับประกัน) ใช้ของเดิมที่ทีมงานเขียนไว้ถ้ามี
 * ไม่มี = ใช้ชุดกลางของร้าน ปรับข้อความให้ตรงกับการ์ดบอร์ด
 */
const STD_TABS = [
  {
    title: "วิธีสั่งงาน",
    text: [
      "สั่งผ่านหน้าเว็บนี้ได้เลย::",
      "• เลือกขนาด → การเคลือบ → งานฟอยล์ (ถ้ามี) → ใส่จำนวนชิ้น",
      '• แนบภาพลาย หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"',
      '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น จำนวนแต่ละลาย · ตำแหน่งลายฟอยล์ · วันที่ต้องการใช้งาน',
      "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน",
      "",
      "หรือสั่งทางอีเมล::",
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com · หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ",
      "• ระบุรายละเอียด: ขนาด · การเคลือบ · พิมพ์ 1 ด้าน / 2 ด้าน · จำนวน · วันที่ใช้งาน (ถ้ามี)",
      "• แนบไฟล์งาน หรือลิงก์ Google Drive (เปิดการเข้าถึงไฟล์ให้เรียบร้อย)",
    ].join("\n"),
  },
  {
    title: "การเตรียมไฟล์",
    text: [
      "• ไฟล์นามสกุล .Ai .Psd .PNG พื้นหลังใส ความละเอียดสูง",
      "• ตัดตกจากขนาดงานจริงด้านละ 3 มม. · ไม่ควรวางงานชิดขอบหรือมีเส้นขอบ (ตัดคลาดเคลื่อนได้ 0.5-2 มม.)",
      "• งานที่พิมพ์ด้านหลังคลาดเคลื่อนได้ 3-5 มม. — เลี่ยงลายที่ต้องตรงกันทั้งสองด้าน",
      "• งานฟอยล์: แยกเลเยอร์ลายที่จะเป็นฟอยล์ออกมาให้ชัด (สีดำล้วนบนพื้นขาว)",
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
const keepTabs = STD_TABS.map((std) => (d.tabs ?? []).find((t) => t.title === std.title) ?? std);

d.tabs = [
  {
    title: "รายละเอียดงานพิมพ์",
    text: [
      "::ตัวแผ่น::",
      `• การ์ดบอร์ดแบบหนา ${THICK_MM} มม. ผิวสัมผัสเรียบเนียน`,
      "• พิมพ์ด้วยระบบ Digital · ไม่มีขั้นต่ำในการสั่งผลิต",
      `• ${SIZE_ORDER.length} ขนาด — ${SIZE_ORDER.map((s) => `${s.name} ${s.mm[0]}x${s.mm[1]} มม.`).join(" · ")}`,
      "::ราคาบวกเพิ่ม::",
      `• เคลือบลามิเนตเนื้อเงา / ด้าน +${COAT_FEE} บาท`,
      `• เคลือบพิเศษ (กลิตเตอร์ · ทราย · โฮโลแกรม) +${SPECIAL_FEE} บาท`,
      `• เคลือบฟอยล์ ${FOIL1.name} +${FOIL1.price} บาท · ${FOIL2.name} +${FOIL2.price} บาท`,
      `• สีฟอยล์: ${WEB_FOIL_COLORS.join(" / ")} — โฮโลแกรม +${HOLO_FEE} บาท`,
      `• ปั๊มฟอยล์ +${STAMP_FEE} บาท`,
      "::การคละลาย::",
      `• 1-${MIX_FREE_BELOW - 1} ชิ้น คละลายได้อิสระ`,
      `• ตั้งแต่ ${MIX_FREE_BELOW} ชิ้นขึ้นไป คละลายได้ ลายละ ${MIX_MIN} ชิ้นขึ้นไป`,
    ].join("\n"),
    images: [art["size-chart"], art["thickness-2mm"]],
    imagePos: "bottom",
    imageSize: "md",
  },
  {
    title: "ราคาแต่ละขนาด",
    text: SIZE_ORDER.map((s) => `• ${priceRow(s)}`).join("\n"),
  },
  {
    title: "จำนวนต่อแผ่น A3",
    text: [
      "งานเคลือบลามิเนตและปั๊มฟอยล์คิดจำนวนต่อ 1 แผ่น A3::",
      ...SIZE_ORDER.filter((s) => s.perA3 > 1).map((s) => `• ${s.name} ได้ ${s.perA3} ใบ ต่อ 1 แผ่น A3`),
      "• A3 = เต็มแผ่น (1 แผ่นได้ 1 ใบ)",
    ].join("\n"),
    images: [art["a3-chart"]],
    imageSize: "lg",
  },
  ...keepTabs,
];

d.seo = {
  title: "รับทำ Ultra-Hard CardBoard การ์ดบอร์ดหนา 2 มม. พิมพ์ลายตามสั่ง",
  description:
    `รับผลิต Ultra-Hard CardBoard การ์ดบอร์ดแบบหนา ${THICK_MM} มม. ผิวเรียบเนียน พิมพ์ระบบ Digital ` +
    `${SIZE_ORDER.length} ขนาด (${sizeList}) เริ่มต้นชิ้นละ ${startAt} บาท สั่งเยอะเหลือชิ้นละ ${cheapest} บาท ` +
    `เคลือบเงา ด้าน กลิตเตอร์ โฮโลแกรม · เคลือบฟอยล์ · ปั๊มฟอยล์ได้ ไม่มีขั้นต่ำ`,
  keywords: [
    "ultra hard cardboard",
    "การ์ดบอร์ดหนา",
    "การ์ดบอร์ด 2 mm",
    "รับทำการ์ดบอร์ด",
    "การ์ดบอร์ดพิมพ์ลาย",
    "ป้ายการ์ดบอร์ด",
    "การ์ดบอร์ดเคลือบฟอยล์",
  ],
  faqs: [
    {
      q: "Ultra-Hard CardBoard ราคาเท่าไหร่?",
      a: `คิดต่อชิ้นตามขนาดและจำนวน — ${SIZE_ORDER.map((s) => `${s.name} เริ่มที่ ${cells[sizeChoiceName(s)][0]} บาท`).join(" · ")} สั่งเยอะราคาลดตามตาราง`,
    },
    { q: "แผ่นหนาแค่ไหน แข็งไหม?", a: `หนา ${THICK_MM} มม. ผิวสัมผัสเรียบเนียน แข็งกว่ากระดาษการ์ดทั่วไปมาก ตั้งโชว์ได้ไม่งอ` },
    {
      q: "สั่งขั้นต่ำกี่ชิ้น คละลายได้ไหม?",
      a: `ไม่มีขั้นต่ำ สั่ง 1 ชิ้นก็ได้ · จำนวน 1-${MIX_FREE_BELOW - 1} ชิ้นคละลายได้อิสระ ตั้งแต่ ${MIX_FREE_BELOW} ชิ้นขึ้นไปคละได้ ลายละ ${MIX_MIN} ชิ้นขึ้นไป`,
    },
    {
      q: "เคลือบผิวได้ไหม คิดเงินยังไง?",
      a: `เคลือบเงาหรือเคลือบด้าน บวกเพิ่ม ${COAT_FEE} บาท · เคลือบพิเศษ (กลิตเตอร์ ทราย โฮโลแกรม) บวกเพิ่ม ${SPECIAL_FEE} บาท`,
    },
    {
      q: "ทำงานฟอยล์ได้ไหม?",
      a: `ได้ทั้งเคลือบฟอยล์และปั๊มฟอยล์ — เคลือบฟอยล์ ${FOIL1.name} ${FOIL1.price} บาท · ${FOIL2.name} ${FOIL2.price} บาท (สี ${WEB_FOIL_COLORS.join(" / ")} โฮโลแกรมบวก ${HOLO_FEE} บาท) · ปั๊มฟอยล์ ${STAMP_FEE} บาท`,
    },
    {
      q: "1 แผ่น A3 ได้กี่ใบ?",
      a: SIZE_ORDER.filter((s) => s.perA3 > 1).map((s) => `${s.name} ได้ ${s.perA3} ใบ`).join(" · ") + " (ใช้คิดจำนวนงานเคลือบและปั๊มฟอยล์)",
    },
  ],
};

/**
 * ฟิลด์ที่ปกติ /api/admin/products เขียนให้ตอนกดบันทึกในหน้าแก้ไข — สคริปต์เขียน DB ตรงจึงต้องทำเอง
 * hidden : คงสถานะฉบับร่างไว้ ให้ทีมงานกดเผยแพร่เองที่ /admin/products
 */
d.quoteOption = d.options.some((o) => o.askPrice || o.choices.some((c) => c.askPrice)) || undefined;
d.priceMin = Math.min(...allPrices);
d.priceMax = Math.max(...allPrices) + SPECIAL_FEE + FOIL2.price + HOLO_FEE + STAMP_FEE;
d.savedAt = new Date().toISOString();

const choices = d.options.flatMap((o) => o.choices);
console.log(`\n📦 ${d.name} (${ID}) · หมวด ${d.category} · slug ${d.slug}`);
console.log(`   ราคา ฿${d.priceMin}-${Math.max(...allPrices)}/${UNIT} (รวมของแต่งสูงสุด ฿${d.priceMax})`);
console.log(`   ตัวเลือก: ${d.options.map((o) => `${o.label} ${o.choices.length} แบบ`).join(" · ")}`);
console.log(`   แกลเลอรี ${d.images.length} ภาพ · ภาพประจำตัวเลือก ${choices.filter((c) => c.imageSrc).length}/${choices.length} ตัว`);
console.log(`   แท็บ: ${d.tabs.map((t) => t.title).join(" · ")} · สถานะ: ${d.hidden ? "ฉบับร่าง" : "เผยแพร่"}`);
if (!WRITE) {
  console.log("\n(ยังไม่อัปไฟล์ ไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

// คอลัมน์กระจก (name/category/price/badge) ต้องอัปด้วย — หน้ารายการสินค้าอ่านจากคอลัมน์ ไม่ใช่ใน data
const save = await sb.from("products").upsert(
  {
    id: ID,
    name: d.name,
    category: d.category,
    price: d.price,
    sold: d.sold,
    featured: d.featured ?? false,
    badge: d.badge,
    // แถวใหม่ต่อท้ายลิสต์ (แถวเดิมไม่แตะลำดับที่ทีมงานจัดไว้)
    ...(row ? {} : { sort: 640 }),
    data: d,
  },
  { onConflict: "id" }
);
if (save.error) throw new Error(`บันทึกไม่สำเร็จ — ${save.error.message}`);
console.log(`\n✅ อัปภาพ + บันทึกแล้ว — ยังเป็น${d.hidden ? "ฉบับร่าง กดเผยแพร่ที่ /admin/products" : "สถานะเผยแพร่"}`);
