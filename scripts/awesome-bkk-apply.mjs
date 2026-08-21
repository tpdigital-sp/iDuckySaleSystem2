#!/usr/bin/env node
/**
 * "เสื้อยี่ห้อ AWESOME.BKK" (new-mt2eng6u-7593) — ดึงราคาจากเว็บตารางราคา + อัปภาพ + เขียนสินค้า
 *
 *   node scripts/awesome-bkk-art.mjs      # เตรียมภาพประจำตัวเลือกก่อน (.cache/awesome-bkk/upload)
 *   node scripts/awesome-bkk-apply.mjs            # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/awesome-bkk-apply.mjs --write
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/tshirtprinting
 *   บล็อกหัวข้อ "เสื้อยี่ห้อ AWESOME.BKK" (หน้านั้นมี 6 บล็อกสินค้า จึงยึด "หัวข้อ" ไม่ใช่ลำดับตาราง)
 *   4 แท็บของบล็อกนั้น → 3 เรทราคา + ตารางค่าจุดที่เพิ่ม
 *     พิมพ์ DTF/DFT · พิมพ์ FLEX (เว็บลงตัวเลขเท่ากัน) · งานปัก · สกรีนมากกว่า 1 จุด
 *   สคริปต์อ่านสดทุกครั้ง ราคาบนเว็บเปลี่ยนเมื่อไหร่รันซ้ำได้เลย
 *
 * ⚠️ แท็บ DTF ของบล็อกนี้เว็บไม่ได้ลงเป็น <table> (อยู่ในก้อนข้อความของ Wix) — สคริปต์อ่านตัวเลข
 *    จากก้อนข้อความนั้นแล้ว "เทียบกับตาราง FLEX" ถ้าไม่ตรงจะหยุดให้คนมาดู ไม่เดาเอง
 *
 * ขนาดสกรีนแยก "ด้านหน้า × ด้านหลัง" เหมือนเสื้อตัวอื่นของร้าน (เลือก "ไม่สกรีน" ได้ 1 ด้าน)
 *   ด้านแรกที่มีลายคิดราคาเต็ม · อีกด้านบวกค่าจุดเพิ่มตามขนาดของด้านนั้นเอง
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SIZES as SHIRT_SIZES } from "./awesome-bkk-art.mjs";

const WRITE = process.argv.includes("--write");
const ID = "new-mt2eng6u-7593"; // แถวที่ผู้ใช้สร้างค้างไว้ในหน้าแก้ไขสินค้า — เติมของลงแถวเดิม ไม่สร้างตัวซ้ำ
const DIR = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1] || ".cache/awesome-bkk/upload";
const PAGE = "https://www.iduckyofficial-pricelists.com/tshirtprinting";
const SECTION = "เสื้อยี่ห้อ AWESOME.BKK";
const NAME = SECTION;
const V = "v1";

/** ชื่อเดิมที่ยอมให้ทับได้ — กันเผลอรันทับสินค้าตัวอื่นถ้า id ถูกใช้ซ้ำวันหลัง */
const EXPECT_NAMES = [NAME];

const UNIT = "ตัว";
const RATE_LABEL = "เรทราคา";
const FRONT_LABEL = "ขนาดสกรีน ด้านหน้า";
const BACK_LABEL = "ขนาดสกรีน ด้านหลัง";
const EMB_LABEL = "ขนาดปัก ด้านหน้า";
const FLEX_FINISH_LABEL = "ผิวงาน FLEX";
const SIZE_LABEL = "ไซซ์";
const COLOR_LABEL = "สีเสื้อ";
const RATE_DTF = "พิมพ์ DTF/DFT";
const RATE_FLEX = "พิมพ์ FLEX";
const RATE_EMB = "งานปัก";
const NO_SCREEN = "ไม่สกรีน";

/** ชื่อขนาดสกรีนบนหน้าเว็บ → ชื่อที่ใช้ในระบบ (ลำดับเดียวกับคอลัมน์ในตาราง) */
const SCREEN_SIZES = [
  { web: /5\s*นิ้ว/, name: "ไม่เกิน 5 นิ้ว", art: "5in" },
  { web: /A5/i, name: "ไม่เกิน A5", art: "a5" },
  { web: /A4\s*\/?\s*A3/i, name: "ไม่เกิน A4 / A3", art: "a4a3" },
];
const EMB_SIZES = [
  { web: /10\s*cm/i, name: "ไม่เกิน 10 ซม.", art: "10cm" },
  { web: /15\s*cm/i, name: "ไม่เกิน 15 ซม.", art: "15cm" },
  { web: /20\s*cm/i, name: "ไม่เกิน 20 ซม.", art: "20cm" },
];

/**
 * รูปในแกลเลอรี (id wixstatic ของรูปงานจริงในบล็อกนี้ — ตรวจแล้วว่าอยู่ในช่วง DOM ของหัวข้อนี้จริง)
 * ⚠️ ได้แค่ 5 รูป — หน้าแก้ไขสินค้าตัดที่ MAX_PHOTOS = 5 ตอนโหลดเข้าฟอร์ม ใส่เกินไว้จะหายเงียบ ๆ
 * ภาพประจำตัวเลือกอีก 22 ภาพไม่นับรวมตรงนี้ (หน้าร้านดึงขึ้นแกลเลอรีให้เองตอนลูกค้ากดเลือก)
 */
const PHOTOS = [
  ["photo-chest-5in", "959b83_bb8bd2b35ac644aaac92e1ae2323b9b2~mv2.jpg", "งานจริง — ลายเล็กกลางอก เสื้อสีขาว"],
  ["photo-worn-front", "959b83_dd45c4dbb7514deca72ef3628a745b29~mv2.jpg", "งานจริง — ลายใหญ่เต็มหน้าอกตอนสวมใส่"],
  ["photo-bigprint", "959b83_6c35feed60f6474393d323dc34bde985~mv2.jpg", "งานจริง — โคลสอัพลายใหญ่ (A4 / A3)"],
  ["photo-back", "959b83_e3c29d5c9bd845788f300e2ee9dcd840~mv2.jpg", "งานจริง — สกรีนด้านหลัง"],
  ["photo-flex-black", "959b83_47e799212b934097aed1d5dcf65f32c8~mv2.jpg", "งานจริง — FLEX ฟิล์มสีทึบบนเสื้อสีดำ"],
];

/* ── 1. ดึงบล็อก "เสื้อยี่ห้อ AWESOME.BKK" จากหน้าเว็บ ───────────── */

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
const start = ALL.findIndex((b) => b.text === SECTION);
if (start < 0) throw new Error(`หาหัวข้อ "${SECTION}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
/** จบบล็อกที่ "ชื่อสินค้าตัวถัดไป" = ก้อนข้อความที่ตามด้วยบรรทัด "รายละเอียดราคาปลีก" */
const end = ALL.findIndex((b, i) => i > start && b.text && /รายละเอียดราคาปลีก/.test(ALL[i + 1]?.text ?? ""));
const SEC = ALL.slice(start, end > start ? end : ALL.length);

/** "1-10 ตัว" → { upTo: 10 } · "50 ตัวขึ้นไป" → { upTo: null } */
const tierOf = (label) => {
  const m = label.match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: label.replace(/\s+/g, " ").trim() };
};

/**
 * ตารางในบล็อกนี้ที่หัวคอลัมน์ตรงกับ head และแถวแรกของข้อมูลตรงกับ unit
 * (บล็อกนี้มี 2 ตารางที่หัวคอลัมน์เป็น "ขนาดสกรีน" เหมือนกัน — ตารางราคานับเป็น "ตัว" ส่วนค่าจุดเพิ่มนับเป็น "จุด")
 */
function table(head, unit, what) {
  const t = SEC.find((b) => b.table && head.test(b.table[0].join(" ")) && unit.test(b.table[1][0]));
  if (!t) throw new Error(`ในบล็อก "${SECTION}" ไม่เจอตาราง${what} — โครงหน้าเว็บอาจเปลี่ยน`);
  return t.table;
}

/** ตาราง (ช่วงจำนวน × คอลัมน์) → { tiers, cols: [{head, prices[]}] } */
function grid(rows) {
  const tiers = rows.slice(1).map((r) => tierOf(r[0]));
  tiers.at(-1).upTo = null; // ช่วงสุดท้ายเปิดปลายเสมอ
  if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ — ตรวจก่อน");
  const cols = rows[0].slice(1).map((head, ci) => ({
    head,
    prices: rows.slice(1).map((r) => {
      const n = Number(String(r[ci + 1]).replace(/[^\d]/g, ""));
      if (!n) throw new Error(`ช่องราคาแถว "${r[0]}" คอลัมน์ "${head}" อ่านไม่ออก ("${r[ci + 1]}")`);
      return n;
    }),
  }));
  return { tiers, cols };
}

/** จับคอลัมน์บนเว็บเข้ากับรายการขนาดที่เราตั้งไว้ (กันเว็บสลับลำดับคอลัมน์) */
function byName(list, cols, what) {
  return list.map((s) => {
    const col = cols.find((c) => s.web.test(c.head));
    if (!col) throw new Error(`ตาราง${what}ไม่มีคอลัมน์ของ "${s.name}" — ตรวจหน้าเว็บก่อน`);
    return { ...s, prices: col.prices };
  });
}

const screen = grid(table(/ขนาดสกรีน/, /ตัว/, "ราคาสกรีน"));
const emb = grid(table(/ขนาดปัก/, /ตัว/, "งานปัก"));
const feeGrid = grid(table(/ขนาดสกรีน/, /จุด/, '"สกรีนมากกว่า 1 จุด"'));

const SCREEN = byName(SCREEN_SIZES, screen.cols, "ขนาดสกรีน");
const EMB = byName(EMB_SIZES, emb.cols, "งานปัก");
const FEE = byName(SCREEN_SIZES, feeGrid.cols, "ค่าจุดที่เพิ่ม");

/**
 * แท็บ DTF ของบล็อกนี้เว็บไม่ได้ลงเป็นตาราง — ตัวเลขอยู่ในก้อนข้อความ
 * อ่านมาเทียบกับตาราง FLEX (เว็บระบุว่าเท่ากัน) ไม่ตรงเมื่อไหร่ = หยุด ให้คนมาดูก่อน
 */
const dtfText = SEC.find((b) => b.text && /พิมพ์ด้วยระบบ DTF/.test(b.text))?.text ?? "";
// "1-10 ตัว 520 530 550" → [520, 530, 550] (อ่านทีละแถว ตามจำนวนคอลัมน์ขนาดสกรีนที่เจอในตาราง)
const dtfRowRe = new RegExp(`\\d+\\s*(?:[-–]\\s*\\d+)?\\s*ตัว(?:ขึ้นไป)?\\s+((?:\\d+\\s+){${SCREEN.length - 1}}\\d+)`, "g");
const dtfNums = [...dtfText.matchAll(dtfRowRe)].map((m) => m[1].trim().split(/\s+/).map(Number));
const flexTable = SCREEN.map((s) => s.prices);
const dtfOk =
  dtfNums.length === screen.tiers.length &&
  dtfNums.every((row, ti) => row.length === SCREEN.length && row.every((n, si) => n === flexTable[si][ti]));
if (!dtfOk) {
  throw new Error(
    `ตัวเลขแท็บ DTF บนเว็บไม่ตรงกับตาราง FLEX แล้ว — ต้องแยกตารางราคาให้ DTF เอง\n` +
      `   DTF ที่อ่านได้: ${JSON.stringify(dtfNums)}\n   FLEX ในตาราง: ${JSON.stringify(flexTable)}`
  );
}

console.log(`📊 บล็อก "${SECTION}" จากเว็บ · ${screen.tiers.length} ช่วงจำนวน (${screen.tiers.map((t) => t.label).join(" · ")})`);
for (const s of SCREEN) console.log(`   สกรีน ${s.name}: ${s.prices.join(" / ")}`);
for (const s of EMB) console.log(`   ปัก ${s.name}: ${s.prices.join(" / ")}`);
for (const s of FEE) console.log(`   จุดเพิ่ม ${s.name}: ${s.prices.join(" / ")} (ช่วง ${feeGrid.tiers.map((t) => t.label).join(" · ")})`);

/**
 * ช่วง "จำนวนตัว" ของตารางราคา → ช่วง "จำนวนจุด" ของตารางค่าจุดเพิ่ม
 * สั่ง 11-29 ตัว สกรีนตัวละ 1 จุดเพิ่ม = 11-29 จุด จึงใช้ราคาช่วงเดียวกัน
 * (ช่วงจำนวนจุดละเอียดกว่า — ช่วงตัวสุดท้าย 50+ ยังอยู่ในช่วงจุด 30-99)
 */
const feeTierFor = (tierIndex) => {
  const t = screen.tiers[tierIndex];
  const qty = t.upTo ?? (screen.tiers[tierIndex - 1]?.upTo ?? 0) + 1;
  const i = feeGrid.tiers.findIndex((f) => f.upTo === null || qty <= f.upTo);
  return i < 0 ? feeGrid.tiers.length - 1 : i;
};

/**
 * ตารางราคา 2 แกน (ขนาดสกรีนด้านหน้า × ขนาดสกรีนด้านหลัง)
 * ด้านแรกที่มีลาย = ราคาเต็มตามขนาดของด้านนั้น · อีกด้าน = ค่าจุดเพิ่มตามขนาดของด้านนั้นเอง
 * เลือก "ไม่สกรีน" ได้ด้านเดียว (กฎ rules กันไว้ไม่ให้ว่างทั้งสองด้าน — เสื้อเปล่าไม่มีราคาในตารางร้าน)
 */
function sideMatrix() {
  const base = Object.fromEntries(SCREEN.map((s) => [s.name, s.prices]));
  const feeOf = Object.fromEntries(FEE.map((s) => [s.name, s.prices]));
  const cells = {};
  for (const front of [...SCREEN.map((s) => s.name), NO_SCREEN])
    for (const back of [NO_SCREEN, ...SCREEN.map((s) => s.name)]) {
      if (front === NO_SCREEN && back === NO_SCREEN) continue;
      const first = front === NO_SCREEN ? back : front;
      const second = front === NO_SCREEN || back === NO_SCREEN ? null : back;
      cells[`${front}│${back}`] = base[first].map((p, ti) => p + (second ? feeOf[second][feeTierFor(ti)] : 0));
    }
  return { unit: UNIT, driverLabels: [FRONT_LABEL, BACK_LABEL], tiers: screen.tiers, cells };
}

const PRINT = sideMatrix();
const EMB_PRICING = {
  unit: UNIT,
  driverLabels: [EMB_LABEL],
  tiers: emb.tiers,
  cells: Object.fromEntries(EMB.map((s) => [s.name, s.prices])),
};
const allPrices = [...Object.values(PRINT.cells).flat(), ...Object.values(EMB_PRICING.cells).flat()];
console.log(`   → ตารางสกรีน ${Object.keys(PRINT.cells).length} ช่อง (หน้า × หลัง) · ตารางปัก ${Object.keys(EMB_PRICING.cells).length} ช่อง`);
console.log(`   ตย. หน้า 5 นิ้ว + หลังไม่สกรีน = ${PRINT.cells[`${SCREEN[0].name}│${NO_SCREEN}`].join("/")}`);
console.log(`       หน้า 5 นิ้ว + หลัง A4/A3  = ${PRINT.cells[`${SCREEN[0].name}│${SCREEN[2].name}`].join("/")}`);

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
const url = (file) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/awesome-bkk/${file}`;

async function put(name, buf) {
  const file = `${name}.jpg`;
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/awesome-bkk/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

// รูปงานจริง — ดึงจาก wixstatic แล้วอัปเข้า storage ของเราเอง (เว็บ Wix เปลี่ยนลิงก์เมื่อไหร่ก็ไม่พัง)
const gallery = [];
for (const [file, wixId, label] of PHOTOS) {
  const res = await fetch(`https://static.wixstatic.com/media/${wixId}/v1/fill/w_1200,h_1200,al_c,q_88/file.jpg`);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  gallery.push({
    emoji: "👕",
    gradient: "from-slate-100 to-slate-300",
    label,
    src: await put(`${file}-${V}`, Buffer.from(await res.arrayBuffer())),
  });
}
console.log(`🖼  รูปงานจริง ${gallery.length} ภาพ (จากบล็อก "${SECTION}" บนเว็บ)`);

// ภาพประจำตัวเลือก — เตรียมไว้แล้วโดย awesome-bkk-art.mjs
const local = (f) => readFileSync(`${DIR}/${f}.jpg`);
const ART_FILES = [
  ...SCREEN.map((s) => `front-${s.art}`),
  ...SCREEN.map((s) => `back-${s.art}`),
  "front-none",
  "back-none",
  ...EMB.map((s) => `emb-${s.art}`),
  ...SHIRT_SIZES.map((s) => `size-${s.name.toLowerCase()}`),
  "size-chart",
  "color-white",
  "color-black",
  "flex-gloss",
  "flex-matte",
  "rate-dtf",
  "rate-flex",
  "rate-emb",
  "compare-print",
];
const art = {};
for (const f of ART_FILES) art[f] = await put(`${f}-${V}`, local(f));
console.log(`🖼  ภาพประจำตัวเลือก ${ART_FILES.length} ภาพ (${DIR})`);

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้า ${ID} ไม่ได้ — ${error.message}`);
const d = structuredClone(row.data);
if (!EXPECT_NAMES.includes(d.name)) throw new Error(`${ID} ชื่อ "${d.name}" ไม่ใช่แถวที่ตั้งใจแก้ — ตรวจก่อน`);

d.name = NAME;
d.slug = "tshirt-awesome-bkk";
d.category = "apparel";
d.emoji = "👕";
d.gradient = "from-slate-100 to-slate-300";
d.unit = UNIT;
d.price = Math.min(...allPrices);
d.badge = "ใหม่";
d.rating = 5;

d.priceRates = [
  {
    id: "dtf",
    label: RATE_DTF,
    desc: "พิมพ์ฟิล์มรีดร้อน สีสด คมชัด ระบบ CMYK · พิมพ์ได้ทั้งผ้าสีอ่อนและสีเข้ม",
    imageSrc: art["rate-dtf"],
    freeMixBelowQty: 11,
    minPerDesign: 3,
    pricing: PRINT,
  },
  {
    id: "flex",
    label: RATE_FLEX,
    desc: "ฟิล์มสีทึบ ขอบคม เลือกผิวเงา/ผิวด้าน · เหมาะกับตัวอักษรและโลโก้",
    imageSrc: art["rate-flex"],
    freeMixBelowQty: 11,
    minPerDesign: 3,
    pricing: PRINT,
  },
  {
    id: "embroidery",
    label: RATE_EMB,
    desc: "ปักด้ายลงเนื้อผ้าโดยตรง ผิวสัมผัสนูน ดูพรีเมียม ทนทานที่สุด",
    imageSrc: art["rate-emb"],
    freeMixBelowQty: 11,
    minPerDesign: 3,
    pricing: EMB_PRICING,
  },
];
d.pricing = PRINT; // เรทตั้งต้น = DTF (ลูกค้าสลับเรทได้ที่หัวข้อ "เรทราคา")

const screenChoices = (side) => SCREEN.map((s) => ({ name: s.name, imageSrc: art[`${side}-${s.art}`] }));
d.options = [
  {
    label: SIZE_LABEL,
    stockBearing: true,
    choices: SHIRT_SIZES.map((s) => ({
      name: s.name,
      imageSrc: art[`size-${s.name.toLowerCase()}`],
      ...(s.name === "L" ? { popular: true } : {}),
    })),
  },
  {
    // เว็บไม่ได้ระบุราคาต่างกันตามสีในบล็อกนี้ (ต่างจากบล็อก YUEDPAO/OVERSIZE ที่เสื้อดำ +10) จึงไม่ใส่ +฿
    label: COLOR_LABEL,
    stockBearing: true,
    choices: [
      { name: "สีขาว", imageSrc: art["color-white"] },
      { name: "สีดำ", imageSrc: art["color-black"] },
    ],
  },
  {
    // ด้านหน้าเป็นค่าตั้งต้น (สกรีนด้านเดียว) — เลือก "ไม่สกรีน" ได้ ถ้าลูกค้าเอาลายเฉพาะด้านหลัง
    label: FRONT_LABEL,
    showWhen: { label: RATE_LABEL, choices: [RATE_DTF, RATE_FLEX] },
    choices: [...screenChoices("front"), { name: NO_SCREEN, imageSrc: art["front-none"] }],
  },
  {
    // ตั้งต้น "ไม่สกรีน" — ราคาเริ่มต้นจึงเท่ากับสกรีนด้านเดียว
    label: BACK_LABEL,
    showWhen: { label: RATE_LABEL, choices: [RATE_DTF, RATE_FLEX] },
    choices: [{ name: NO_SCREEN, imageSrc: art["back-none"] }, ...screenChoices("back")],
  },
  {
    label: FLEX_FINISH_LABEL,
    showWhen: { label: RATE_LABEL, choices: [RATE_FLEX] },
    choices: [
      { name: "ผิวเงา", imageSrc: art["flex-gloss"] },
      { name: "ผิวด้าน", imageSrc: art["flex-matte"] },
    ],
  },
  {
    label: EMB_LABEL,
    showWhen: { label: RATE_LABEL, choices: [RATE_EMB] },
    choices: EMB.map((s) => ({ name: s.name, imageSrc: art[`emb-${s.art}`] })),
  },
];
// ด้านหน้า "ไม่สกรีน" แล้ว ด้านหลังต้องเลือกขนาด — กันสั่งเสื้อเปล่าที่ไม่มีราคาในตาราง
d.rules = [
  { when: { label: FRONT_LABEL, choice: NO_SCREEN }, limit: { label: BACK_LABEL, allow: SCREEN.map((s) => s.name) } },
];

d.images = gallery;
d.imageSrc = gallery[0].src;
d.description =
  "เสื้อยืดคอกลม ยี่ห้อ AWESOME.BKK พร้อมสกรีนลายตามสั่ง ไม่มีขั้นต่ำในการสั่งผลิต " +
  "เลือกระบบงานได้ 3 แบบ — พิมพ์ DTF/DFT สีสดคมชัดพิมพ์ได้ทั้งผ้าสีอ่อนและสีเข้ม, พิมพ์ FLEX ฟิล์มสีทึบขอบคมเลือกผิวเงาหรือผิวด้าน " +
  "และงานปักด้ายที่ให้ผิวสัมผัสนูนดูพรีเมียม " +
  "เลือกขนาดสกรีนแยกด้านหน้า/ด้านหลังได้ ตั้งแต่ไม่เกิน 5 นิ้ว จนถึง A4/A3 " +
  `มีสีขาวและสีดำ ไซซ์ ${SHIRT_SIZES.map((s) => s.name).join(" ")} ยิ่งสั่งเยอะยิ่งถูก เริ่มต้นตัวละ ${d.price} บาท`;
d.highlights = [
  "เสื้อยืดคอกลมยี่ห้อ AWESOME.BKK — ไซซ์ S M L XL (รอบอก 40-52 นิ้ว)",
  "เลือกงานได้ 3 ระบบ — DTF/DFT · FLEX (ผิวเงา/ผิวด้าน) · งานปัก พร้อมภาพตัวอย่างทุกแบบ",
  "ไม่มีขั้นต่ำ — สั่ง 1 ตัวก็ได้ · 1-10 ตัวคละลายได้อิสระ",
  "เลือกขนาดสกรีนแยกด้านหน้า/ด้านหลัง — สกรีน 2 ด้านคิดเพิ่มตามขนาดของด้านที่สอง",
  `ยิ่งสั่งเยอะยิ่งถูก — ${screen.tiers.at(-1).label} เหลือตัวละ ${SCREEN[0].prices.at(-1)} บาท`,
  "สีขาว | สีดำ ราคาเท่ากัน",
];

const feeLine = (s) => `${s.name} — ${s.prices.map((p, i) => `${feeGrid.tiers[i].label} ${p}`).join(" · ")}`;
d.tabs = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text:
      "เสื้อยืดคอกลม ยี่ห้อ AWESOME.BKK — ราคารวมค่าเสื้อ + ค่าสกรีนแล้ว ไม่มีขั้นต่ำในการสั่งผลิต\n" +
      `• ไซซ์: ${SHIRT_SIZES.map((s) => `${s.name} (รอบอก ${s.chest} นิ้ว)`).join(" · ")}\n` +
      "• สีเสื้อ: สีขาว | สีดำ (ราคาเท่ากัน)\n" +
      "• จำนวน 1-10 ตัว คละลายได้ · 11 ตัวขึ้นไป คละลาย สั่งลายละ 3 ชิ้นขึ้นไป\n" +
      "• เลือกงานได้ 3 ระบบ — พิมพ์ DTF/DFT · พิมพ์ FLEX (ผิวเงา/ผิวด้าน) · งานปัก\n" +
      '• เลือกขนาดสกรีนแยกด้านหน้า / ด้านหลังได้ — ด้านไหนไม่เอาลาย เลือก "ไม่สกรีน"\n\n' +
      "สกรีน 2 ด้าน (ด้านที่สองคิดเพิ่มตามขนาดของด้านนั้น)::\n" +
      FEE.map((s) => `• ${feeLine(s)}`).join("\n"),
    images: [art["compare-print"]],
    imageSize: "lg",
  },
  {
    title: "ระบบพิมพ์ที่เลือกได้",
    text:
      "พิมพ์ DTF/DFT::\n" +
      "• คุณภาพ: พิมพ์ภาพลงแผ่นฟิล์มด้วยหมึกสำหรับย้อมผ้า แล้วรีดร้อนติดบนเสื้อ ลายชัดเจน สีสด คมชัด\n" +
      "• ความทนทาน: ติดทนนาน ทนต่อการซักหลายครั้ง · ราคาปานกลาง\n" +
      "• ผิวสัมผัส: งานพิมพ์อยู่บนเนื้อผ้า สัมผัสด้าน นูน\n" +
      "• คุณสมบัติ: ยืดหยุ่นตามเนื้อผ้า ติดแน่นเรียบไปกับเนื้อผ้า พิมพ์ได้ทั้งผ้าสีอ่อนและสีเข้ม\n" +
      "• ข้อจำกัด: ส่วนที่สกรีนลงผ้าจะปิดทึบ ไม่มีที่ระบายในส่วนนั้น และไม่สามารถรีดตรง ๆ บนงานได้\n\n" +
      "พิมพ์ FLEX (เลือกผิวเงา หรือ ผิวด้าน)::\n" +
      "• คุณภาพ: พิมพ์ภาพลงบน Flex ด้วยหมึก Solvent แล้วรีดร้อนติดบนเสื้อ สีทึบ ขอบคม\n" +
      "• ความทนทาน: ทนทานต่อการซักและรีดได้หลายครั้ง\n" +
      "• ผิวสัมผัส: งานพิมพ์อยู่บนเนื้อผ้า ผิวสัมผัสเป็นไปตามเนื้อ Flex ที่เลือก\n" +
      "• จุดเด่น: ใช้เตารีดรีดลงโดยตรงบน Flex ได้ · เหมาะกับตัวอักษร/โลโก้\n" +
      "• ข้อจำกัด: ไม่เหมาะกับงานที่มีรายละเอียดเล็ก ๆ\n\n" +
      "งานปัก::\n" +
      "• คุณภาพ: ปักด้ายลงบนเนื้อผ้าโดยตรง ให้ความเรียบหรู สวยงาม ผิวสัมผัสนูนของเส้นไหม\n" +
      `• ราคาคิดตามขนาดงานปัก (${EMB.map((s) => s.name.replace("ไม่เกิน ", "")).join(" / ")})\n` +
      "• ข้อจำกัด: จำกัดเรื่องสีไหม เหมาะกับงานสีน้อย · แบบนอกเหนือจากทางร้าน ปักไม่เกิน 3 สีเข็ม " +
      "หากเกินคิดเพิ่มสีละ 10 บาทต่อแบบ",
  },
  {
    title: "ตารางไซซ์",
    text:
      "ตารางไซซ์ AWESOME.BKK (หน่วยเป็นนิ้ว)::\n" +
      SHIRT_SIZES.map((s) => `• ${s.name} — รอบอก ${s.chest} · ความยาว ${s.length} · ความยาวแขน ${s.sleeve}`).join("\n") +
      "\n• แต่ละไซซ์อาจมีความคลาดเคลื่อน + – ไม่เกินครึ่งนิ้ว",
    images: [art["size-chart"]],
    imageSize: "lg",
  },
  {
    title: "วิธีสั่งงาน",
    text:
      "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
      '• เลือกระบบพิมพ์ ขนาดสกรีนด้านหน้า/ด้านหลัง ไซซ์ และสีเสื้อ แล้วแนบภาพลาย (JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n' +
      '• สกรีนทั้ง 2 ด้าน แนบลายทั้งสองไฟล์ในช่องเดียวกันได้ แล้วระบุในช่อง "หมายเหตุถึงร้าน" ว่าลายไหนอยู่ด้านหน้า ลายไหนอยู่ด้านหลัง\n' +
      '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ตำแหน่งลายบนตัวเสื้อ (อกซ้าย/กลางอก/กลางหลัง) · จำนวนแต่ละไซซ์ · วันที่ต้องการใช้งาน\n' +
      "• สั่งหลายสี/หลายไซซ์ ให้เพิ่มลงตะกร้าแยกรายการ\n" +
      "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n" +
      "หรือสั่งทางอีเมล::\n" +
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n" +
      "• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n" +
      "• ระบุรายละเอียด: ระบบพิมพ์ · ขนาดสกรีนด้านหน้า/ด้านหลัง · สีเสื้อ · ไซซ์และจำนวนแต่ละไซซ์ · วันที่ใช้งาน (ถ้ามี)",
  },
  {
    title: "การเตรียมไฟล์",
    text:
      "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n" +
      "• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n" +
      "• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n" +
      "• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด\n" +
      "• งาน FLEX และงานปัก ควรเป็นลายเส้น/ตัวอักษรที่ไม่บางเกินไป",
  },
  {
    title: "การรับประกันสินค้า",
    text:
      "รับเคลม::\n" +
      "• สีเพี้ยนเกิน 10-15%\n" +
      "• จำนวนที่ได้รับไม่ครบถ้วน\n" +
      "• สีเสื้อ/ไซซ์ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n" +
      "• งานสกรีนหลุดลอกตั้งแต่ยังไม่ได้ใช้งาน\n\n" +
      "ไม่รับเคลม::\n" +
      "• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n" +
      "• สินค้าชำรุดจากการใช้งาน/การซักที่ไม่ถูกวิธีมาแล้ว\n\n" +
      "ระยะเวลาในการเคลม::\n" +
      "ภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
  },
];

d.terms = [
  "ราคารวมค่าเสื้อ AWESOME.BKK + ค่าสกรีนแล้ว · ไม่มีขั้นต่ำในการสั่งผลิต",
  "จำนวน 1-10 ตัว คละลายได้ · 11 ตัวขึ้นไป คละลาย สั่งลายละ 3 ชิ้นขึ้นไป",
  "เสื้อสีขาวและสีดำราคาเท่ากัน",
  `สกรีนด้านที่สอง คิดเพิ่มตามขนาดของด้านนั้น — ${FEE.map((s) => `${s.name.replace("ไม่เกิน ", "")} ${s.prices[0]}-${s.prices.at(-1)} บาท`).join(" · ")} (ยิ่งสั่งเยอะยิ่งถูก)`,
  "งานปักแบบนอกเหนือจากทางร้าน ปักได้ไม่เกิน 3 สีเข็ม หากเกินคิดเพิ่มสีละ 10 บาทต่อแบบ",
  "ทางร้านใช้สีระบบ RGB สีงานสกรีนที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
  "งานผ้าอาจมีจุดดำจากฝุ่นเล็กน้อย มีการเคลื่อนของลายสกรีน และมีรอยยับของผ้า ซึ่งไม่กระทบกับการใช้งาน",
  "งานสกรีนบนผ้า ส่วนที่สกรีนจะปิดทึบ ไม่มีที่ระบายในส่วนนั้น และไม่สามารถรีดตรง ๆ บนงานได้",
].join("\n");

/**
 * ฟิลด์ที่ปกติ /api/admin/products เขียนให้ตอนกดบันทึกในหน้าแก้ไข — สคริปต์เขียน DB ตรงจึงต้องทำเอง
 * hidden : คงสถานะฉบับร่างไว้ ให้ทีมงานกดเผยแพร่เองที่ /admin/products
 */
d.quoteOption = d.options.some((o) => o.askPrice || o.choices.some((c) => c.askPrice)) || undefined;
d.priceMin = Math.min(...allPrices);
d.priceMax = Math.max(...allPrices);
d.savedAt = new Date().toISOString();

console.log(`\n📦 ${d.name} (${ID}) · หมวด ${d.category} · slug ${d.slug}`);
console.log(`   ราคา ฿${d.priceMin}-${d.priceMax}/ตัว · ตัวเลือก ${d.options.map((o) => `${o.label} ${o.choices.length} แบบ`).join(" · ")}`);
console.log(`   แกลเลอรี ${d.images.length} ภาพ · ภาพประจำตัวเลือก ${d.options.flatMap((o) => o.choices).filter((c) => c.imageSrc).length}/${d.options.flatMap((o) => o.choices).length} ตัว`);
console.log(`   แท็บ: ${d.tabs.map((t) => t.title).join(" · ")} · สถานะ: ${d.hidden ? "ฉบับร่าง" : "เผยแพร่"}`);
if (!WRITE) {
  console.log("\n(ยังไม่อัปไฟล์ ไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

const save = await sb
  .from("products")
  .update({ data: d, name: d.name, category: d.category, price: d.price, badge: d.badge })
  .eq("id", ID);
if (save.error) throw new Error(`บันทึกไม่สำเร็จ — ${save.error.message}`);
console.log("\n✅ อัปภาพ + บันทึกแล้ว — ยังเป็นฉบับร่าง กดเผยแพร่ที่ /admin/products");
