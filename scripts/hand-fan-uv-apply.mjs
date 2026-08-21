#!/usr/bin/env node
/**
 * "HAND FAN พัดพลาสติกใส ทรงกลม (UV)" (hand-fan-uv) — ดึงราคาจากเว็บตารางราคา + อัปภาพ + เขียนสินค้า
 *
 *   node scripts/hand-fan-uv-art.mjs      # เตรียมภาพประจำตัวเลือกก่อน (.cache/hand-fan-uv/upload)
 *   node scripts/hand-fan-uv-apply.mjs            # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/hand-fan-uv-apply.mjs --write
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/magnetbookmark
 *   หน้านั้นมี 5 บล็อกสินค้า (Magnet Bookmark · Cup Sleeve · พัดพลาสติกใส · พัดกระดาษ · พัดพับ)
 *   จึงยึด "หัวข้อบล็อก" ไม่ใช่ลำดับตาราง — บล็อกนี้เริ่มที่ "พัดพลาสติกใส ทรงกลม ( UV )"
 *   และจบก่อน "พัดกระดาษไดคัทตามทรง" (สินค้าคนละตัว ราคาคนละตาราง)
 *
 * นอกจากตารางราคา (จำนวน × 2 ขนาด) ยังอ่านบรรทัด "รายละเอียดเพิ่มเติม" มาตั้งค่าจริงด้วย —
 *   ขนาดวงพัด/ความยาวรวมก้าน · ค่าสกรีน 2 ด้านของแต่ละขนาด · เงื่อนไขคละลาย · วิธีพิมพ์ของแต่ละขนาด
 *   อ่านไม่ครบเมื่อไหร่ = หยุด ไม่เดาตัวเลขเอง · ราคาบนเว็บเปลี่ยนเมื่อไหร่รันซ้ำได้เลย
 *
 * 💰 ค่าสกรีน 2 ด้าน "คนละเรทตามขนาด" (เล็ก 10 · ใหญ่ 15) — ระบบคิด +฿ ต่อตัวเลือก ไม่ใช่ต่อคู่ขนาด
 *    จึงทำเป็น 2 กลุ่มที่สลับกันโชว์ตามขนาดที่เลือก (showWhen) แบบเดียวกับกลุ่มเคลือบของ cup-sleeve
 *
 * ⚠️ สคริปต์เขียนแบบ upsert — มีแถว id นี้อยู่แล้วก็เติมทับ (เช็คชื่อเดิมก่อน) ไม่มีก็สร้างใหม่
 *    ห้ามเปลี่ยน ID เป็นชื่อสุ่มแบบปุ่ม "+ เพิ่มสินค้า" — id นี้ใช้เป็นลิงก์หน้าสินค้าด้วย
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SIZES, COMPARE_PHOTO } from "./hand-fan-uv-art.mjs";

const WRITE = process.argv.includes("--write");
const ID = "hand-fan-uv";
const DIR = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1] || ".cache/hand-fan-uv/upload";
const PAGE = "https://www.iduckyofficial-pricelists.com/magnetbookmark";
const SECTION = /^พัดพลาสติกใส ทรงกลม/;
const SECTION_END = /พัดกระดาษไดคัท/;
const NAME = "HAND FAN พัดพลาสติกใส ทรงกลม (UV)";
const V = "v1";

/** ชื่อเดิมที่ยอมให้ทับได้ — กันเผลอรันทับสินค้าตัวอื่นถ้า id ถูกใช้ซ้ำวันหลัง */
const EXPECT_NAMES = [NAME];

const SIZE_LABEL = "ขนาด";
const SIDE_1 = "สกรีน 1 ด้าน";
const SIDE_2 = "สกรีน 2 ด้าน";
/** กลุ่ม "จำนวนด้านที่สกรีน" ของแต่ละขนาด — ค่าสกรีน 2 ด้านคนละเรท จึงต้องแยกกลุ่ม */
const sideLabel = (s) => `การสกรีน (${s.col})`;

/**
 * รูปงานจริงในบล็อกพัดพลาสติกใสของหน้าเว็บ (id wixstatic — ตรวจด้วยตาแล้วว่าเป็นพัดใส ไม่ใช่พัดกระดาษ/พัดพับ)
 * ⚠️ ได้แค่ 5 รูป — หน้าแก้ไขสินค้าตัดที่ MAX_PHOTOS = 5 ตอนโหลดเข้าฟอร์ม ใส่เกินไว้จะหายเงียบ ๆ
 * ภาพประจำตัวเลือกไม่นับรวมตรงนี้ (หน้าร้านดึงขึ้นแกลเลอรีให้เองตอนลูกค้ากดเลือก)
 */
const PHOTOS = [
  ["photo-both", COMPARE_PHOTO, "งานจริง — พัดอันใหญ่คู่กับพัดอันเล็ก เทียบขนาดกันได้"],
  ["photo-large", "959b83_8287cd4026eb4262928f274f573efe43", "งานจริง — พัดอันใหญ่ วงกลม 16.4 ซม."],
  ["photo-small", "959b83_48a5561054c2485c940e788f39f4c2b3", "งานจริง — พัดอันเล็ก วงกลม 5 ซม."],
  ["photo-mix", "959b83_782089af190b4d10943b8f03d502a04a", "งานจริง — พัดอันเล็กหลายลาย"],
  ["photo-chain", "959b83_ce5c9d90656b47faae2b61f7aa949c03", "งานจริง — พัดอันเล็กห้อยโซ่ลูกปัด"],
];

/* ── 1. ดึงบล็อก "พัดพลาสติกใส ทรงกลม (UV)" จากหน้าเว็บ ──────────── */

const decode = (s) =>
  String(s)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
/** ตัดแท็ก + ตัวอักษรล่องหนที่ Wix แทรกไว้ (zero-width space / soft hyphen) ออกให้หมดก่อนอ่านค่า */
const strip = (s) =>
  decode(String(s).replace(/<[^>]+>/g, " "))
    .replace(/[​­]/g, "")
    .replace(/\s+/g, " ")
    .trim();

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
// หัวข้อรวมด้านบนหน้าเว็บก็พูดถึง "พัดใสทรงกลม" — เอาเฉพาะก้อนที่ขึ้นต้นด้วยชื่อบล็อกจริง
const start = ALL.findIndex((b) => b.text && SECTION.test(b.text));
if (start < 0) throw new Error(`หาหัวข้อบล็อกพัดพลาสติกใสในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
const endRel = ALL.slice(start + 1).findIndex((b) => b.text && SECTION_END.test(b.text));
const SEC = ALL.slice(start, endRel < 0 ? ALL.length : start + 1 + endRel);
const SEC_TEXT = SEC.filter((b) => b.text).map((b) => b.text);

/* ตารางราคา — หัวคอลัมน์ "จำนวน" + ชื่อขนาดทั้งสอง */
const priceTable = SEC.find((b) => b.table && /จำนวน/.test(b.table[0][0] ?? ""));
if (!priceTable) throw new Error("ในบล็อกพัดพลาสติกใสไม่เจอตารางราคา — โครงหน้าเว็บอาจเปลี่ยน");
const [head, ...rows] = priceTable.table;
const COLS = head.slice(1);
const WANT = SIZES.map((s) => s.col);
if (COLS.length !== WANT.length || COLS.some((c, i) => c !== WANT[i]))
  throw new Error(`คอลัมน์ขนาดบนเว็บเป็น [${COLS}] ไม่ตรงกับที่สคริปต์รู้จัก [${WANT}] — ตรวจหน้าเว็บก่อน`);

/** "1-10 อัน" → { upTo: 10 } · "10000 อันขึ้นไป" → { upTo: null } */
const tiers = rows.map((r) => {
  const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: r[0].replace(/\s+/g, " ").trim() };
});
tiers.at(-1).upTo = null; // ช่วงสุดท้ายเปิดปลายเสมอ
if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ — ตรวจก่อน");

/** ราคาต่ออันของแต่ละขนาด เรียงตามช่วงจำนวน — key ใช้ "ชื่อตัวเลือกที่ลูกค้าเห็น" ไม่ใช่ชื่อคอลัมน์บนเว็บ */
const cells = {};
SIZES.forEach((s, ci) => {
  cells[s.name] = rows.map((r) => {
    const n = Number(String(r[ci + 1]).replace(/[^\d]/g, ""));
    if (!n) throw new Error(`ช่องราคา "${s.col}" แถว "${r[0]}" อ่านไม่ออก ("${r[ci + 1]}")`);
    return n;
  });
});
const ALL_PRICES = Object.values(cells).flat();

/** ตัวเลขในบรรทัดรายละเอียดของบล็อกนี้ — อ่านไม่เจอ = หยุด ไม่เดาเอง */
function detail(re, what) {
  const line = SEC_TEXT.find((t) => re.test(t));
  if (!line) throw new Error(`ไม่เจอบรรทัด${what} ในบล็อกพัดพลาสติกใส — โครงหน้าเว็บอาจเปลี่ยน`);
  return re.exec(line).slice(1).map(Number);
}
/** บรรทัดข้อความล้วน (ไม่มีตัวเลขให้อ่าน) — ใช้ทวนว่าเว็บยังบอกวิธีพิมพ์แบบเดิม */
function hasLine(re, what) {
  if (!SEC_TEXT.some((t) => re.test(t))) throw new Error(`ไม่เจอบรรทัด${what} ในบล็อกพัดพลาสติกใส — โครงหน้าเว็บอาจเปลี่ยน`);
}

const [FREE_MIX_BELOW] = detail(/^1-(\d+)\s*อัน สามารถคละลายได้/, "เงื่อนไขคละลายช่วงปลีก");
const [MIX_FROM, MIN_PER_DESIGN] = detail(/ตั้งแต่จำนวน (\d+) อันขึ้นไป คละลายละ (\d+) ชิ้นขึ้นไป/, "เงื่อนไขคละลายช่วงส่ง");
if (MIX_FROM !== FREE_MIX_BELOW + 1)
  throw new Error(`เว็บบอกคละอิสระถึง ${FREE_MIX_BELOW} อัน แต่เริ่มโควตาที่ ${MIX_FROM} อัน — ช่วงไม่ต่อกัน ตรวจก่อน`);

// ขนาดวงพัด/ความยาวรวมก้าน + ค่าสกรีน 2 ด้าน ของแต่ละขนาด (ทวนกับตารางในสคริปต์ ไม่ตรง = หยุด)
for (const s of SIZES) {
  const [dia, total] = detail(
    new RegExp(`${s.col} วงกลม ([\\d.]+) ?cm รวมก้าน ([\\d.]+) ?cm`),
    `ขนาดของ "${s.col}"`
  );
  if (Math.round(dia * 10) !== s.dia || Math.round(total * 10) !== s.total)
    throw new Error(`เว็บบอก ${s.col} วง ${dia} ซม. รวมก้าน ${total} ซม. แต่สคริปต์ตั้งไว้ ${s.dia / 10}/${s.total / 10} — ตรวจก่อน`);
  [s.side2Fee] = detail(new RegExp(`${s.col} สกรีน 2 ด้าน บวกเพิ่ม (\\d+) บาท`), `ค่าสกรีน 2 ด้านของ "${s.col}"`);
}
hasLine(/เป็นการสกรีน UV ลงวัสดุ/, "วิธีพิมพ์ของพัดอันเล็ก (สกรีน UV ลงวัสดุ)");
hasLine(/เป็นการติดสติ๊กเกอร์ UV ลงวัสดุ/, "วิธีพิมพ์ของพัดอันใหญ่ (ติดสติ๊กเกอร์ UV)");
hasLine(/พิมพ์ด้วยระบบ\s*:\s*UV Printing/, "ระบบงานพิมพ์ (UV Printing)");
hasLine(/วัสดุ เป็นพลาสติก/, "วัสดุ (พลาสติก)");

const PRICING = { unit: "อัน", driverLabels: [SIZE_LABEL], tiers, cells };

console.log("📋 ตารางราคาจากเว็บ (พัดพลาสติกใส ทรงกลม UV)");
console.log(`   ${"ช่วงจำนวน".padEnd(18)}${SIZES.map((s) => s.col.padStart(12)).join("")}`);
tiers.forEach((t, i) =>
  console.log(`   ${t.label.padEnd(18)}${SIZES.map((s) => String(cells[s.name][i]).padStart(12)).join("")}`)
);
console.log(`   สกรีน 2 ด้าน — ${SIZES.map((s) => `${s.col} +฿${s.side2Fee}/อัน`).join(" · ")}`);
console.log(`   คละลาย: 1-${FREE_MIX_BELOW} อันอิสระ · ${MIX_FROM} อันขึ้นไป ลายละ ${MIN_PER_DESIGN} ชิ้นขึ้นไป`);

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
console.log(`\n🖼  รูปงานจริง ${gallery.length} ภาพ (จากหน้าเว็บตารางราคา)`);

// ภาพประจำตัวเลือก — เตรียมไว้แล้วโดย hand-fan-uv-art.mjs
const local = (f) => readFileSync(`${DIR}/${f}.jpg`);
const ART_FILES = [...SIZES.map((s) => `size-${s.key}`), "size-compare", "side-1", "side-2", "print-method", "mix-designs"];
const art = {};
for (const f of ART_FILES) art[f] = await put(`${f}-${V}`, local(f));
console.log(`🖼  ภาพประจำตัวเลือก ${ART_FILES.length} ภาพ (${DIR})`);

const { data: row } = await sb.from("products").select("id,data").eq("id", ID).maybeSingle();
if (row && !EXPECT_NAMES.includes(row.data?.name))
  throw new Error(`${ID} ชื่อ "${row.data?.name}" ไม่ใช่แถวที่ตั้งใจแก้ — ตรวจก่อน`);
const d = row ? structuredClone(row.data) : {};

const MIN = Math.min(...ALL_PRICES);
const MAX = Math.max(...ALL_PRICES);
const RETAIL = tiers[0].label; // ช่วงราคาปลีก (1-10 อัน)

d.id = ID;
d.name = NAME;
d.slug = "hand-fan-uv";
d.category = "gifts";
d.emoji = "🪭";
d.gradient = "from-sky-100 to-blue-200";
d.price = MIN;
d.badge = "ใหม่";
d.rating = d.rating ?? 5;
d.sold = d.sold ?? 0;
d.pricing = PRICING;
d.images = gallery;
d.imageSrc = gallery[0].src;
d.artworkRequired = true;
// สินค้าใหม่เข้าเป็นฉบับร่างก่อน ให้ทีมงานตรวจแล้วกดเผยแพร่เองที่ /admin/products
d.hidden = row ? d.hidden : true;

d.description =
  `พัดพลาสติกใส ทรงกลม (HAND FAN) พิมพ์ลายตามสั่งด้วยระบบ UV Printing สีสวยคมชัด ไม่ซีดไม่หลุดลอก โดนน้ำได้ ` +
  `ตัวพัดเป็นพลาสติก ไม่แตกหักง่าย มีให้เลือก 2 ขนาด — อันเล็กวงกลม ${SIZES[0].dia / 10} ซม. (รวมก้าน ${SIZES[0].total / 10} ซม.) ` +
  `และอันใหญ่วงกลม ${SIZES[1].dia / 10} ซม. (รวมก้าน ${SIZES[1].total / 10} ซม.) เริ่มต้นอันละ ${MIN} บาท ` +
  `ไม่มีขั้นต่ำในการสั่งผลิต สั่งสกรีน 2 ด้านได้ เหมาะกับงานแฟนคลับ ของแจกงานอีเวนต์ และของที่ระลึก`;

d.highlights = [
  `เริ่มอันละ ${MIN} บาท — ไม่มีขั้นต่ำในการสั่งผลิต สั่ง 1 อันก็ทำให้`,
  `2 ขนาด: ${SIZES.map((s) => `${s.col} วง ${s.dia / 10} ซม.`).join(" · ")}`,
  `พิมพ์ระบบ UV บนพลาสติก — สีไม่ซีด ไม่หลุดลอก โดนน้ำได้`,
  `สกรีน 2 ด้านได้ — ${SIZES.map((s) => `${s.col} +${s.side2Fee} บาท/อัน`).join(" · ")}`,
];

d.options = [
  {
    label: SIZE_LABEL,
    stockBearing: true,
    note: `ราคาต่ออันคิดตามขนาดที่เลือก · ${SIZES.map((s) => `${s.col} ${s.method}`).join(" · ")}`,
    choices: SIZES.map((s) => ({ name: s.name, imageSrc: art[`size-${s.key}`] })),
  },
  // ค่าสกรีน 2 ด้านคนละเรทตามขนาด — แยกกลุ่มแล้วสลับโชว์ตามขนาดที่ลูกค้าเลือก
  ...SIZES.map((s) => ({
    label: sideLabel(s),
    note: `${s.col} สกรีน 2 ด้าน บวกเพิ่มอันละ ${s.side2Fee} บาท`,
    showWhen: { label: SIZE_LABEL, choices: [s.name] },
    choices: [
      { name: SIDE_1, imageSrc: art["side-1"] },
      { name: SIDE_2, extra: s.side2Fee, imageSrc: art["side-2"] },
    ],
  })),
];

/**
 * คละลายตามหน้าเว็บ: 1-10 อันคละอิสระ · 11 อันขึ้นไป ลายละ 5 ชิ้นขึ้นไป
 * tierByDesign = คละเกินโควตาแล้วราคาตกไปคิดตาม "จำนวนชิ้นต่อลาย" (ไม่บล็อกการสั่ง)
 */
d.tierByDesign = true;
d.priceRates = [
  {
    id: "r1",
    label: "ราคาต่ออัน",
    desc: `คละลายได้ — 1-${FREE_MIX_BELOW} อันอิสระ · ${MIX_FROM} อันขึ้นไป ลายละ ${MIN_PER_DESIGN} ชิ้นขึ้นไป`,
    minPerDesign: MIN_PER_DESIGN,
    freeMixBelowQty: MIX_FROM,
    pricing: PRICING,
  },
];

d.terms = [
  `ราคาในตารางคิดต่ออัน และคิดตามขนาดที่เลือก — ${SIZES.map((s) => `${s.col} ${Math.max(...cells[s.name])}-${Math.min(...cells[s.name])} บาท`).join(" · ")}`,
  "ไม่มีขั้นต่ำในการสั่งผลิต — สั่ง 1 อันก็ทำให้",
  `สั่ง 1-${FREE_MIX_BELOW} อัน คละลายได้อิสระ · ตั้งแต่ ${MIX_FROM} อันขึ้นไป คละได้ ขั้นต่ำลายละ ${MIN_PER_DESIGN} ชิ้น`,
  `คละเกินโควตาสั่งได้ แต่ราคาจะตกไปคิดตามจำนวนชิ้นต่อลาย (เช่น ${MIX_FROM} อัน คละ ${MIX_FROM} ลาย = คิดเรทปลีก ${RETAIL})`,
  `ราคาในตารางเป็นแบบสกรีน 1 ด้าน — สกรีน 2 ด้านบวกเพิ่ม ${SIZES.map((s) => `${s.col} ${s.side2Fee} บาท/อัน`).join(" · ")}`,
  `${SIZES[0].col} วงกลม ${SIZES[0].dia / 10} ซม. รวมก้าน ${SIZES[0].total / 10} ซม. — ${SIZES[0].method}`,
  `${SIZES[1].col} วงกลม ${SIZES[1].dia / 10} ซม. รวมก้าน ${SIZES[1].total / 10} ซม. — ${SIZES[1].method}`,
  "ตัวพัดเป็นพลาสติกใส พิมพ์ด้วยระบบ UV Printing — ส่วนที่ไม่ได้พิมพ์ลายจะใสมองทะลุได้",
  "สกรีน 1 ด้าน มองจากอีกด้านจะเห็นลายกลับด้านจาง ๆ (เนื้อพัดใส) — อยากให้ลายคมทั้งสองด้านต้องสั่งสกรีน 2 ด้าน",
  "ทางร้านใช้สีระบบ RGB สีงานพิมพ์ที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
].join("\n");

/** แท็บข้อมูล — 3 แท็บท้าย (วิธีสั่งงาน / การเตรียมไฟล์ / การรับประกัน) ใช้ของเดิมถ้ามี */
const keepTabs = (d.tabs ?? []).filter((t) => ["วิธีสั่งงาน", "การเตรียมไฟล์", "การรับประกันสินค้า"].includes(t.title));
d.tabs = [
  {
    title: "รายละเอียดงานพิมพ์",
    text: [
      "::ตัวสินค้า::",
      "• พัดพลาสติกใส ทรงกลม — เนื้อพลาสติก ไม่แตกหักง่าย โดนน้ำได้ สีไม่ลอก",
      `• ${SIZES.map((s) => `${s.col}: วงกลม ${s.dia / 10} ซม. รวมก้าน ${s.total / 10} ซม.`).join("\n• ")}`,
      "• พิมพ์ด้วยระบบ UV Printing",
      `• ${SIZES.map((s) => `${s.col} — ${s.method}`).join("\n• ")}`,
      "::ราคาต่ออัน (สกรีน 1 ด้าน)::",
      ...SIZES.map((s) => `• ${s.col}: ${tiers.map((t, i) => `${t.label} ${cells[s.name][i]} บาท`).join(" · ")}`),
      "::ราคาบวกเพิ่ม::",
      ...SIZES.map((s) => `• ${s.col} สกรีน 2 ด้าน +${s.side2Fee} บาท/อัน`),
    ].join("\n"),
    images: [art["size-compare"], art["print-method"]],
    imagePos: "bottom",
    imageSize: "md",
  },
  {
    title: "ข้อควรทราบ",
    text: [
      `• สั่ง 1-${FREE_MIX_BELOW} อัน คละลายได้อิสระ · ${MIX_FROM} อันขึ้นไป คละได้ลายละ ${MIN_PER_DESIGN} ชิ้นขึ้นไป`,
      "• เนื้อพัดเป็นพลาสติกใส — ส่วนที่ไม่ได้พิมพ์ลายจะใสมองทะลุได้",
      "• สกรีน 1 ด้าน มองจากด้านหลังจะเห็นลายกลับด้านจาง ๆ ตามธรรมชาติของวัสดุใส",
      "• สกรีน 2 ด้าน ส่งไฟล์ลายมาทั้งสองด้าน (คนละลายกันได้) — ตำแหน่งลายหน้า/หลังอาจเลื่อนกันเล็กน้อย",
      "• ทางร้านใช้สี RGB สีที่ได้อาจสว่างกว่าหรือดรอปลงจากไฟล์ ±5% ถึง ±15%",
      "• งาน UV บนพลาสติกใสไม่ต้องเคลือบเพิ่ม",
    ].join("\n"),
    images: [art["side-1"], art["side-2"], art["mix-designs"]],
    imagePos: "bottom",
    imageSize: "sm",
  },
  ...keepTabs,
];

d.seo = {
  title: "รับทำพัดพลาสติกใส ทรงกลม HAND FAN พิมพ์ UV ตามสั่ง",
  description:
    `รับผลิตพัดพลาสติกใส ทรงกลม (HAND FAN) พิมพ์ UV ลายตามสั่ง มี 2 ขนาด — วงกลม ${SIZES[0].dia / 10} ซม. ` +
    `และ ${SIZES[1].dia / 10} ซม. เริ่มอันละ ${MIN} บาท ไม่มีขั้นต่ำ สกรีน 2 ด้านได้ ` +
    `พัดแฟนคลับ พัดใส พัด PVC ของแจกงานอีเวนต์ สีไม่ซีดไม่หลุดลอก โดนน้ำได้`,
  keywords: [
    "พัดพลาสติกใส",
    "พัดใส",
    "hand fan",
    "รับทำพัดพลาสติก",
    "พัดแฟนคลับ",
    "พัด pvc",
    "พัดทรงกลม",
    "พัดพิมพ์ลาย",
  ],
  faqs: [
    {
      q: "พัดพลาสติกใสราคาเท่าไหร่?",
      a: `คิดต่ออันตามขนาด — ${SIZES.map((s) => `${s.col} ${Math.max(...cells[s.name])}-${Math.min(...cells[s.name])} บาท`).join(" · ")} (ยิ่งสั่งเยอะยิ่งถูกตามช่วงจำนวน)`,
    },
    { q: "สั่งขั้นต่ำกี่อัน?", a: `ไม่มีขั้นต่ำในการสั่งผลิต · สั่ง 1-${FREE_MIX_BELOW} อันคละลายได้อิสระ ตั้งแต่ ${MIX_FROM} อันขึ้นไป คละได้ขั้นต่ำลายละ ${MIN_PER_DESIGN} ชิ้น` },
    {
      q: "พัดมีกี่ขนาด ขนาดเท่าไหร่?",
      a: SIZES.map((s) => `${s.col} วงกลม ${s.dia / 10} ซม. รวมก้าน ${s.total / 10} ซม.`).join(" · "),
    },
    {
      q: "สกรีน 2 ด้านได้ไหม คิดเพิ่มเท่าไหร่?",
      a: `ได้ — ${SIZES.map((s) => `${s.col} บวกเพิ่มอันละ ${s.side2Fee} บาท`).join(" · ")} · ราคาในตารางเป็นแบบสกรีน 1 ด้าน`,
    },
    {
      q: "พิมพ์ด้วยระบบอะไร สีลอกไหม?",
      a: `พิมพ์ด้วยระบบ UV Printing บนเนื้อพลาสติก — ${SIZES[0].col}${SIZES[0].method} ส่วน${SIZES[1].col}${SIZES[1].method} สีสวยคมชัด ไม่ซีดไม่หลุดลอก โดนน้ำได้`,
    },
  ],
};

/**
 * ฟิลด์ที่ปกติ /api/admin/products เขียนให้ตอนกดบันทึกในหน้าแก้ไข — สคริปต์เขียน DB ตรงจึงต้องทำเอง
 * hidden : สินค้าใหม่เข้าเป็นฉบับร่าง ให้ทีมงานกดเผยแพร่เองที่ /admin/products
 */
d.quoteOption = d.options.some((o) => o.askPrice || o.choices.some((c) => c.askPrice)) || undefined;
d.priceMin = MIN;
d.priceMax = MAX;
d.savedAt = new Date().toISOString();

const choices = d.options.flatMap((o) => o.choices);
console.log(`\n📦 ${d.name} (${ID}) · หมวด ${d.category} · slug ${d.slug}`);
console.log(`   ราคา ฿${MIN}-${MAX}/อัน · ตัวเลือก ${d.options.map((o) => `${o.label} ${o.choices.length} แบบ`).join(" · ")}`);
console.log(`   แกลเลอรี ${d.images.length} ภาพ · ภาพประจำตัวเลือก ${choices.filter((c) => c.imageSrc).length}/${choices.length} ตัว`);
console.log(`   แท็บ: ${d.tabs.map((t) => t.title).join(" · ")} · สถานะ: ${d.hidden ? "ฉบับร่าง" : "เผยแพร่"}`);
if (!WRITE) {
  console.log("\n(ยังไม่อัปไฟล์ ไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

// คอลัมน์กระจก (name/category/price) ต้องอัปพร้อม data ไม่งั้นหน้ารายการสินค้าโชว์ของเก่า
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
    ...(row ? {} : { sort: 627 }),
    data: d,
  },
  { onConflict: "id" }
);
if (save.error) throw new Error(`บันทึกไม่สำเร็จ — ${save.error.message}`);
console.log(`\n✅ อัปภาพ + บันทึกแล้ว — เปิดดูที่ /admin/products/${ID}${d.hidden ? " (ยังเป็นฉบับร่าง กดเผยแพร่ที่ /admin/products)" : ""}`);
