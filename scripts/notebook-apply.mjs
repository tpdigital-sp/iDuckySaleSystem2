#!/usr/bin/env node
/**
 * "สมุดโน๊ต" (notebook-ring) — ดึงราคาจากเว็บตารางราคา + อัปภาพ + เขียนสินค้า
 *
 *   node scripts/notebook-art.mjs             # เตรียมภาพประจำตัวเลือกก่อน (.cache/notebook/upload)
 *   node scripts/notebook-apply.mjs           # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/notebook-apply.mjs --write
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/otheracrylicproducts2
 *   หน้านั้นมีหลายบล็อกสินค้า และมีบล็อก "สมุด" (ปกหนัง พิมพ์ UV — คนละตัว ขายอยู่แล้วในชื่อ
 *   "สมุดหนัง" id otheracrylicproducts2-9) อยู่ในหน้าเดียวกัน จึงยึด "เซกชันของหัวข้อ" ไม่ใช่ลำดับตาราง:
 *   Wix ตั้ง anchor ของเซกชันเป็นชื่อหัวข้อ (id="สมุดโน๊ต") — สคริปต์อ่านเฉพาะเซกชันนั้น
 *
 * นอกจากตารางราคา ยังอ่าน "รายละเอียดเพิ่มเติม" ของบล็อกนี้มาใช้ตั้งค่าจริงด้วย —
 *   เงื่อนไขคละลาย · ค่าเคลือบพิเศษ · ระบบพิมพ์ · สีห่วงของแต่ละขนาด
 *   อ่านไม่ครบเมื่อไหร่ = หยุด ไม่เดาตัวเลขเอง
 *
 * ⚠️ ทุกขนาดต้องมีภาพประกอบ — ขนาดไหนโผล่มาใหม่บนเว็บแล้วยังไม่มีภาพ สคริปต์จะหยุด
 *    ให้ไปเพิ่มการ์ดใน scripts/notebook-art.mjs ก่อน
 *    (โจทย์ของสินค้าตัวนี้คือ "ทุกตัวเลือกต้องมีภาพว่าหน้าตาเป็นแบบไหน")
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v2 ครั้งหน้าขึ้น v3
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "notebook-ring";
const DIR = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1] || ".cache/notebook/upload";
const PAGE = "https://www.iduckyofficial-pricelists.com/otheracrylicproducts2";
const SECTION = "สมุดโน๊ต";
const NAME = SECTION;
const V = "v2";

/** ชื่อเดิมที่ยอมให้ทับได้ — กันเผลอรันทับสินค้าตัวอื่นถ้า id ถูกใช้ซ้ำวันหลัง */
const EXPECT_NAMES = [NAME];

const UNIT = "เล่ม";
const SIZE_LABEL = "ขนาด";
const COAT_LABEL = "เคลือบปก";
const FILM_LABEL = "เคลือบ"; // กลุ่มที่ลิงก์คลังตัวเลือกกลาง (ผิวฟิล์มพิเศษ 10 แบบ)
const FILM_PRESET = "preset-2";
const COAT_GLOSS = "เคลือบเงา";
const COAT_MATTE = "เคลือบด้าน";
const COAT_SPECIAL = "เคลือบพิเศษ";

/**
 * หัวคอลัมน์บนเว็บ → ชื่อตัวเลือก + ไฟล์ภาพจาก notebook-art.mjs
 * ขนาดเป็นมิลลิเมตรมาตรฐานกระดาษ A (เว็บบอกแค่ชื่อขนาด) — หน้าสินค้าจึงเขียนกำกับว่า "ประมาณ"
 */
const SIZE_META = {
  A7: { cm: "7.4 x 10.5", art: "size-a7", perSheet: 16 },
  A6: { cm: "10.5 x 14.8", art: "size-a6", perSheet: 8 },
  A5: { cm: "14.8 x 21", art: "size-a5", perSheet: 4 },
};

/** หน่วยของ "แผ่นวัสดุ" ที่ค่าเคลือบพิเศษคิดตาม (ฟิล์มมาเป็นแผ่น A3 — 1 แผ่นเคลือบได้ตาม perSheet) */
const SHEET_UNIT = "แผ่น A3";

/**
 * รูปงานจริงในบล็อก "สมุดโน๊ต" ของหน้าเว็บ (id wixstatic — สคริปต์ตรวจให้ทุกครั้งว่ายังอยู่ในเซกชันนี้จริง)
 * ⚠️ ได้แค่ 5 รูป — หน้าแก้ไขสินค้าตัดที่ MAX_PHOTOS = 5 ตอนโหลดเข้าฟอร์ม ใส่เกินไว้จะหายเงียบ ๆ
 * ภาพประจำตัวเลือกอีก 8 ภาพไม่นับรวมตรงนี้ (หน้าร้านดึงขึ้นแกลเลอรีให้เองตอนลูกค้ากดเลือก)
 */
const PHOTOS = [
  ["photo-stack", "959b83_ea8d3793227742938fcd684ae21db696~mv2.jpg", "งานจริง — 3 ขนาดวางซ้อนกัน (A5 · A6 · A7)"],
  ["photo-a5-holo", "959b83_f2d1ab929ada465d8b1c665ea1abca43~mv2.jpg", "งานจริง — เล่ม A5 ปกเคลือบโฮโลแกรม"],
  ["photo-a7-hand", "959b83_cd83234918ec4659851193fa5b2cf376~mv2.jpg", "งานจริง — เล่ม A7 ห่วงสีขาว ถือได้ในมือเดียว"],
  ["photo-a6-glitter", "959b83_95e786866122425990218d6c1862acd0~mv2.jpg", "งานจริง — เล่ม A6 ปกเคลือบกลิตเตอร์ ห่วงสีเงิน"],
  ["photo-inside", "959b83_cb9f0726d12d41169438fc7d0674cafc~mv2.jpg", "งานจริง — กระดาษด้านในเป็นเส้นบรรทัด"],
];

/* ── 1. ดึงเซกชัน "สมุดโน๊ต" จากหน้าเว็บ ─────────────────────────── */

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

/** เซกชันของหัวข้อนี้ (Wix ใส่ anchor ชื่อหัวข้อไว้ในเซกชัน) — กันไปหยิบตารางของบล็อกอื่นในหน้าเดียวกัน */
const SEC_HTML = html.split(/(?=<section id=")/).find((p) => p.includes(`id="${SECTION}"`));
if (!SEC_HTML) throw new Error(`หาเซกชันของหัวข้อ "${SECTION}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);

/** ไล่อ่านเซกชันเป็น "ก้อน" ตามลำดับเอกสาร (ย่อหน้า/หัวข้อ/ตาราง) */
const SEC = (() => {
  const out = [];
  const re = /<table[\s\S]*?<\/table>|<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<p[^>]*>[\s\S]*?<\/p>/gi;
  for (let m; (m = re.exec(SEC_HTML)); ) {
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
})();

if (!SEC.some((b) => b.text === SECTION)) throw new Error(`เซกชันที่เจอไม่มีหัวข้อ "${SECTION}" — โครงหน้าเว็บอาจเปลี่ยน`);

/** "1-10 เล่ม" → { upTo: 10 } · "1000 เล่มขึ้นไป" → { upTo: null } */
const tierOf = (label) => {
  const m = label.match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: label.replace(/\s+/g, " ").trim() };
};

const TABLE = SEC.find((b) => b.table)?.table;
if (!TABLE) throw new Error(`ไม่เจอตารางราคาในเซกชัน "${SECTION}" — โครงหน้าเว็บอาจเปลี่ยน`);

const tiers = TABLE.slice(1).map((r) => tierOf(r[0]));
tiers.at(-1).upTo = null; // ช่วงสุดท้ายเปิดปลายเสมอ
if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนในตารางราคาอ่านไม่ครบ — ตรวจหน้าเว็บก่อน");

/** คอลัมน์ = ขนาด (A7 | A6 | A5) */
const COLS = TABLE[0].slice(1).map((head, ci) => ({
  head,
  prices: TABLE.slice(1).map((r) => {
    const n = Number(String(r[ci + 1]).replace(/[^\d]/g, ""));
    if (!n) throw new Error(`ตารางราคา แถว "${r[0]}" คอลัมน์ "${head}" อ่านราคาไม่ออก ("${r[ci + 1]}")`);
    return n;
  }),
}));

const noMeta = COLS.filter((c) => !SIZE_META[c.head]).map((c) => c.head);
if (noMeta.length)
  throw new Error(
    `ขนาด "${noMeta.join(", ")}" ยังไม่มีข้อมูล/ภาพประกอบ — เพิ่มใน SIZE_META และทำการ์ดใน scripts/notebook-art.mjs ก่อน\n` +
      `   (สินค้าตัวนี้ตั้งใจให้ทุกตัวเลือกมีภาพว่าหน้าตาเป็นแบบไหน)`
  );

const SIZES = COLS.map((c) => ({
  head: c.head,
  cm: SIZE_META[c.head].cm,
  art: SIZE_META[c.head].art,
  perSheet: SIZE_META[c.head].perSheet,
  name: `${c.head} (${SIZE_META[c.head].cm} ซม.)`,
  prices: c.prices,
}));

const SHEET_TEXT = SIZES.map((s) => `${s.head} ${s.perSheet} ${UNIT}`).join(" · ");

/** ตัวเลขในบรรทัด "รายละเอียดเพิ่มเติม" ของบล็อกนี้ — อ่านไม่ออก = หยุด ไม่เดาเอง */
const detail = (re, what) => {
  const line = SEC.find((b) => b.text && re.test(b.text))?.text;
  const m = line?.match(re);
  if (!m) throw new Error(`อ่าน "${what}" จากรายละเอียดของบล็อก "${SECTION}" ไม่ออก — ตรวจหน้าเว็บก่อน`);
  return m[1];
};

const MIX_FROM = Number(detail(/จำนวน\s*(\d+)\s*อันขึ้นไป\s*คละลาย/, "จำนวนที่เริ่มมีเงื่อนไขคละลาย"));
const MIX_MIN = Number(detail(/คละลายละ\s*(\d+)\s*อันขึ้นไป/, "จำนวนขั้นต่ำต่อลายเมื่อคละ"));
const SPECIAL_FEE = Number(detail(/เคลือบพิเศษ\s*เริ่มต้น\s*(\d+)\s*บาท/, "ค่าเคลือบพิเศษ"));
const PRINT_SYS = detail(/พิมพ์ระบบ\s*(.+)$/, "ระบบพิมพ์").trim();

/** สีห่วงของแต่ละขนาด — "ขนาด A7 - ห่วงสีขาว" · "ขนาด A6 A5 - ห่วงสีเงิน" */
const RING = {};
for (const b of SEC) {
  const m = b.text?.match(/^ขนาด\s+((?:A\d\s*)+)-\s*(ห่วง.+)$/);
  if (!m) continue;
  for (const s of m[1].trim().split(/\s+/)) RING[s] = m[2].trim();
}
const noRing = SIZES.filter((s) => !RING[s.head]).map((s) => s.head);
if (noRing.length) throw new Error(`ไม่เจอบรรทัดบอกสีห่วงของขนาด "${noRing.join(", ")}" — ตรวจหน้าเว็บก่อน`);

const cells = {};
for (const s of SIZES) cells[s.name] = s.prices;
const PRICING = { unit: UNIT, driverLabels: [SIZE_LABEL], tiers, cells };
const allPrices = Object.values(cells).flat();

console.log(`📊 บล็อก "${SECTION}" จากเว็บ · ${tiers.length} ช่วงจำนวน (${tiers.map((t) => t.label).join(" · ")})`);
for (const s of SIZES) console.log(`   ${s.name} · ${RING[s.head]} · ${s.perSheet} ${UNIT}/${SHEET_UNIT} : ${s.prices.join(" / ")}`);
console.log(`   พิมพ์ระบบ ${PRINT_SYS} · เคลือบเงา/ด้าน ฟรี · เคลือบพิเศษ ฿${SPECIAL_FEE}/${SHEET_UNIT}`);
console.log(`   คละลาย: ต่ำกว่า ${MIX_FROM} ${UNIT} คละอิสระ · ตั้งแต่ ${MIX_FROM} ${UNIT}ขึ้นไป ลายละ ${MIX_MIN} ${UNIT}ขึ้นไป`);
console.log(`   → ราคา ฿${Math.min(...allPrices)}-${Math.max(...allPrices)}/${UNIT}`);

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
const url = (file) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/notebook/${file}`;

async function put(name, buf) {
  const file = `${name}.jpg`;
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/notebook/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

// รูปงานจริง — ดึงจาก wixstatic แล้วอัปเข้า storage ของเราเอง (เว็บ Wix เปลี่ยนลิงก์เมื่อไหร่ก็ไม่พัง)
const gallery = [];
for (const [file, wixId, label] of PHOTOS) {
  if (!SEC_HTML.includes(wixId)) throw new Error(`รูป ${wixId} ไม่อยู่ในเซกชัน "${SECTION}" แล้ว — แกลเลอรีบนเว็บอาจถูกเปลี่ยน`);
  const res = await fetch(`https://static.wixstatic.com/media/${wixId}/v1/fill/w_1200,h_1200,al_c,q_88/file.jpg`);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  gallery.push({
    emoji: "📓",
    gradient: "from-sky-100 to-cyan-200",
    label,
    src: await put(`${file}-${V}`, Buffer.from(await res.arrayBuffer())),
  });
}
console.log(`🖼  รูปงานจริง ${gallery.length} ภาพ (จากแกลเลอรีเซกชัน "${SECTION}" บนเว็บ)`);

// ภาพประจำตัวเลือก — เตรียมไว้แล้วโดย notebook-art.mjs
const local = (f) => readFileSync(`${DIR}/${f}.jpg`);
const ART_FILES = [...SIZES.map((s) => s.art), "coat-gloss", "coat-matte", "coat-special", "size-chart", "howto-file"];
const art = {};
for (const f of ART_FILES) art[f] = await put(`${f}-${V}`, local(f));
console.log(`🖼  ภาพประจำตัวเลือก ${ART_FILES.length} ภาพ (${DIR})`);

// ผิวฟิล์มพิเศษ — ลิงก์คลังตัวเลือกกลาง ไม่ต้องอัปซ้ำ
const preset = await sb.from("products").select("data").eq("id", `__preset_${FILM_PRESET}`).single();
if (preset.error) throw new Error(`อ่านคลังตัวเลือก ${FILM_PRESET} ไม่ได้ — ${preset.error.message}`);
const FILMS = preset.data.data.choices.map((c) => ({ name: c.name, ...(c.imageSrc ? { imageSrc: c.imageSrc } : {}) }));
console.log(`🎞  ผิวฟิล์มพิเศษ ${FILMS.length} แบบ (ลิงก์คลัง ${FILM_PRESET} — “${preset.data.data.label}”)`);

const { data: row } = await sb.from("products").select("id,data").eq("id", ID).maybeSingle();
if (row && !EXPECT_NAMES.includes(row.data?.name))
  throw new Error(`${ID} มีอยู่แล้วและชื่อ "${row.data?.name}" ไม่ใช่แถวที่ตั้งใจแก้ — ตรวจก่อน`);
const d = row ? structuredClone(row.data) : {};

d.id = ID;
d.name = NAME;
d.slug = "สมุดโน๊ต";
d.category = "cat-msrdpxqn"; // Stationery & Office — สมุด / ปฏิทิน / เครื่องเขียน
d.emoji = "📓";
d.gradient = "from-sky-100 to-cyan-200";
d.unit = UNIT;
d.price = Math.min(...allPrices);
d.badge = "ใหม่";
d.rating = 5;
d.sold = d.sold ?? 0;
d.hidden = true; // เข้ามาเป็นฉบับร่าง ให้ทีมงานตรวจแล้วกดเผยแพร่เองที่ /admin/products

d.pricing = PRICING;
d.priceRates = [
  {
    id: "r1",
    label: `ราคาต่อ${UNIT}`,
    desc: `${MIX_FROM} ${UNIT}ขึ้นไปคละลายได้ ลายละ ${MIX_MIN} ${UNIT}ขึ้นไป`,
    minPerDesign: MIX_MIN,
    freeMixBelowQty: MIX_FROM,
    pricing: PRICING,
  },
];

d.options = [
  {
    label: SIZE_LABEL,
    stockBearing: true,
    choices: SIZES.map((s) => ({
      name: s.name,
      imageSrc: art[s.art],
      perSheet: s.perSheet, // 1 แผ่นฟิล์ม A3 เคลือบปกขนาดนี้ได้กี่เล่ม (ใช้คิดค่าเคลือบพิเศษ)
      ...(s.head === "A6" ? { popular: true } : {}),
    })),
  },
  {
    // ค่าเคลือบพิเศษเป็น "ค่าฟิล์มต่อแผ่น A3" ไม่ใช่ต่อเล่ม — เว็บเขียนว่า
    // "เริ่มต้น 30 บาท (ชิ้นถัดๆไปหารตามจำนวน A3)" คือสั่งไม่ถึง 1 แผ่นก็คิด 1 แผ่น เกินไปแผ่นที่ 2 ก็คิดเพิ่ม
    // เช่น A5 ได้ 4 เล่ม/แผ่น → สั่ง 4 เล่ม = ฿30 · สั่ง 5 เล่ม = 2 แผ่น = ฿60
    label: COAT_LABEL,
    sheetFee: { from: SIZE_LABEL, unit: SHEET_UNIT },
    choices: [
      { name: COAT_GLOSS, badge: "ฟรี!", imageSrc: art["coat-gloss"] },
      { name: COAT_MATTE, badge: "ฟรี!", imageSrc: art["coat-matte"] },
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

const sizeList = SIZES.map((s) => `${s.head} (${s.cm} ซม.)`).join(" · ");
d.description =
  `สมุดโน๊ตห่วงเกลียว พิมพ์ปกลายตามสั่งด้วยระบบ ${PRINT_SYS} ไม่มีขั้นต่ำในการสั่งผลิต ` +
  `เลือกได้ ${SIZES.length} ขนาด — ${sizeList} ` +
  `ปกเคลือบเงาหรือเคลือบด้านฟรี และอัปเกรดเป็นเคลือบพิเศษ (กลิตเตอร์ · ทราย · โฮโลแกรม) ได้ ` +
  `โดยค่าฟิล์มคิด${SPECIAL_FEE} บาทต่อ${SHEET_UNIT} (1 ${SHEET_UNIT} เคลือบได้ ${SHEET_TEXT}) ` +
  `ทุกตัวเลือกมีภาพให้ดูก่อนสั่งว่าหน้าตาเป็นแบบไหน ` +
  `ยิ่งสั่งเยอะยิ่งถูก เริ่มต้นเล่มละ ${d.price} บาท`;
d.highlights = [
  `${SIZES.length} ขนาดให้เลือก พร้อมภาพประกอบทุกขนาด — ${sizeList}`,
  `ฟรี! เคลือบปกเงาหรือด้าน · เคลือบพิเศษ ${SPECIAL_FEE} บาทต่อ${SHEET_UNIT} (เลือกผิวฟิล์มได้ ${FILMS.length} แบบ)`,
  `พิมพ์ปกระบบ ${PRINT_SYS} สีสด คมชัด`,
  ...SIZES.map((s) => `${s.head} — ${RING[s.head]}`).filter((v, i, a) => a.indexOf(v) === i),
  `ไม่มีขั้นต่ำ — สั่ง 1 ${UNIT}ก็ได้ · ต่ำกว่า ${MIX_FROM} ${UNIT} คละลายได้อิสระ`,
  `ยิ่งสั่งเยอะยิ่งถูก — ${tiers.at(-1).label} เหลือ${UNIT}ละ ${Math.min(...allPrices)} บาท`,
];

const priceLine = (s) => s.prices.map((p, i) => `${tiers[i].label} ${p}`).join(" · ");
d.tabs = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text:
      `สมุดโน๊ตห่วงเกลียว พิมพ์ปกลายตามสั่ง — พิมพ์ระบบ ${PRINT_SYS} ไม่มีขั้นต่ำในการสั่งผลิต\n` +
      SIZES.map((s) => `• ขนาด ${s.head} ประมาณ ${s.cm} ซม. — ${RING[s.head]}`).join("\n") +
      "\n• เคลือบปกเงา | ด้าน ฟรี! ไม่บวกเพิ่มจากราคาในตาราง\n" +
      `• เคลือบพิเศษ (กลิตเตอร์ · ทราย · โฮโลแกรม) คิดค่าฟิล์ม ${SPECIAL_FEE} บาทต่อ${SHEET_UNIT}\n` +
      `• 1 ${SHEET_UNIT} เคลือบปกได้ ${SHEET_TEXT} — สั่งไม่ถึง 1 ${SHEET_UNIT} ก็คิด 1 ${SHEET_UNIT} เกินไปแผ่นถัดไปคิดเพิ่มทีละแผ่น\n` +
      `  (เช่น A5 สั่ง 4 ${UNIT} = ${SPECIAL_FEE} บาท · สั่ง 5 ${UNIT} = 2 ${SHEET_UNIT} = ${SPECIAL_FEE * 2} บาท)\n` +
      `• จำนวนต่ำกว่า ${MIX_FROM} ${UNIT} คละลายได้อิสระ · ตั้งแต่ ${MIX_FROM} ${UNIT}ขึ้นไป คละลายได้ ลายละ ${MIX_MIN} ${UNIT}ขึ้นไป\n` +
      "• ไม่ถึงจำนวนตามที่กำหนด คิดตามราคาปลีก\n" +
      "• ขนาดที่ระบุเป็นขนาดมาตรฐานกระดาษ A (โดยประมาณ)",
    images: [art["size-chart"]],
    imageSize: "lg",
  },
  {
    title: "ราคาแต่ละแบบ",
    text: SIZES.map((s) => `ขนาด ${s.head} (${s.cm} ซม.)::\n• ${priceLine(s)}`).join("\n\n"),
  },
  {
    title: "การเตรียมไฟล์",
    text:
      "• ไฟล์นามสกุล .AI / .PSD / .PNG หรือพื้นหลังใส\n" +
      "• ความละเอียด 300 dpi ขึ้นไป · ทำไฟล์ปกให้ตรงกับขนาดที่สั่ง\n" +
      "• วางภาพให้เกินขอบเล็กน้อย (เผื่อตัดตก 2-3 มม.) และเลี่ยงวางจุดสำคัญของลายไว้ริมซ้าย เพราะเป็นแนวเจาะห่วง\n" +
      "• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n" +
      "• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิก — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์",
    images: [art["howto-file"]],
    imageSize: "lg",
  },
  {
    title: "วิธีสั่งงาน",
    text:
      "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
      '• เลือกขนาดและชนิดเคลือบ แล้วแนบภาพลายปก (JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n' +
      '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น จำนวนแต่ละลาย · วันที่ต้องการใช้งาน\n' +
      "• สั่งหลายขนาด/หลายแบบเคลือบ ให้เพิ่มลงตะกร้าแยกรายการ\n" +
      "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n" +
      "หรือสั่งทางอีเมล::\n" +
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n" +
      "• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n" +
      "• ระบุรายละเอียด: ขนาด · ชนิดเคลือบ · จำนวนแต่ละลาย · วันที่ใช้งาน (ถ้ามี)",
  },
  {
    title: "การรับประกันสินค้า",
    text:
      "รับเคลม::\n" +
      "• สีเพี้ยนเกิน 10-15%\n" +
      "• จำนวนที่ได้รับไม่ครบถ้วน\n" +
      "• ขนาด/ชนิดเคลือบ ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n" +
      "• สินค้าเกิดความเสียหายระหว่างการขนส่ง\n\n" +
      "ไม่รับเคลม::\n" +
      "• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n" +
      "• สินค้าชำรุดจากการใช้งานมาแล้ว\n\n" +
      "ระยะเวลาในการเคลม::\n" +
      "EMS 7 วัน นับจากวันที่ส่งสินค้า หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
  },
];

d.terms = [
  `พิมพ์ปกระบบ ${PRINT_SYS} · ไม่มีขั้นต่ำในการสั่งผลิต`,
  `จำนวนต่ำกว่า ${MIX_FROM} ${UNIT} คละลายได้อิสระ · ตั้งแต่ ${MIX_FROM} ${UNIT}ขึ้นไป คละลายได้ ลายละ ${MIX_MIN} ${UNIT}ขึ้นไป ไม่ถึงตามจำนวน คิดตามราคาปลีก`,
  ...SIZES.map((s) => `ขนาด ${s.head} ประมาณ ${s.cm} ซม. — ${RING[s.head]} (ขนาดอ้างอิงมาตรฐานกระดาษ A)`),
  "เคลือบปกเงา | ด้าน ฟรี ไม่บวกเพิ่มจากราคาในตาราง",
  `เคลือบพิเศษคิดค่าฟิล์ม ${SPECIAL_FEE} บาทต่อ${SHEET_UNIT} — 1 ${SHEET_UNIT} เคลือบได้ ${SHEET_TEXT} · สั่งไม่ถึง 1 ${SHEET_UNIT} ก็คิด 1 ${SHEET_UNIT} เกินไปแผ่นถัดไปคิดเพิ่มทีละแผ่น (เช่น A5 สั่ง 5 ${UNIT} = 2 ${SHEET_UNIT} = ${SPECIAL_FEE * 2} บาท)`,
  "ทางร้านใช้สีระบบ RGB สีงานพิมพ์ที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
  "ทางร้านมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องต่างกันประมาณ 5-10% งานคนละรอบอาจสีไม่เท่ากันพอดี",
].join("\n");

d.seo = {
  title: `รับทำสมุดโน๊ต พิมพ์ปกลายตามสั่ง A7 A6 A5 เริ่มต้น ${d.price} บาท`,
  description:
    `รับทำ/รับผลิตสมุดโน๊ตห่วงเกลียว พิมพ์ปกลายของคุณเอง มี ${SIZES.length} ขนาด — ${sizeList} ` +
    `เริ่มต้นเล่มละ ${d.price} บาท · ฟรีเคลือบปกเงา/ด้าน · เพิ่มเคลือบกลิตเตอร์-โฮโลแกรมได้ (ค่าฟิล์ม ${SPECIAL_FEE} บาทต่อ${SHEET_UNIT}) · ตรวจแบบก่อนผลิตทุกงาน`,
  keywords: [
    "รับทำสมุดโน๊ต",
    "สมุดโน๊ตพิมพ์ลาย",
    "สมุดห่วง",
    "สมุดโน๊ตสั่งทำ",
    "รับพิมพ์ปกสมุด",
    "สมุดโน๊ต A5",
    "สมุดโน๊ต A6",
    "สมุดโน๊ต A7",
    "สมุดพรีเมี่ยม",
    "ของชำร่วย",
    "ของแจกงานอีเวนต์",
    "พิมพ์ลายตามสั่ง",
  ],
  faqs: [
    {
      q: "สมุดโน๊ต ราคาเท่าไหร่?",
      a: SIZES.map((s) => `${s.head} — ${priceLine(s)}`).join(" · ") + ` (บาทต่อ${UNIT})`,
    },
    {
      q: "มีขนาดอะไรให้เลือกบ้าง?",
      a: `มี ${SIZES.length} ขนาด — ${SIZES.map((s) => `${s.head} ประมาณ ${s.cm} ซม. (${RING[s.head]})`).join(" · ")}`,
    },
    {
      q: "เคลือบปกได้ไหม คิดเงินยังไง?",
      a:
        `เคลือบเงาหรือเคลือบด้านฟรี ไม่บวกเพิ่ม · เคลือบพิเศษ (กลิตเตอร์ ทราย โฮโลแกรม) คิดค่าฟิล์ม ${SPECIAL_FEE} บาทต่อ${SHEET_UNIT} ` +
        `โดย 1 ${SHEET_UNIT} เคลือบได้ ${SHEET_TEXT} — สั่งไม่ถึง 1 แผ่นก็คิด 1 แผ่น เช่น A5 สั่ง 4 ${UNIT} = ${SPECIAL_FEE} บาท สั่ง 5 ${UNIT} = ${SPECIAL_FEE * 2} บาท`,
    },
    {
      q: "สั่งขั้นต่ำกี่เล่ม คละลายได้ไหม?",
      a: `ไม่มีขั้นต่ำ สั่ง 1 ${UNIT}ก็ได้ · ต่ำกว่า ${MIX_FROM} ${UNIT} คละลายได้อิสระ · ตั้งแต่ ${MIX_FROM} ${UNIT}ขึ้นไป คละได้ ลายละ ${MIX_MIN} ${UNIT}ขึ้นไป`,
    },
    {
      q: "ต้องเตรียมไฟล์แบบไหน?",
      a: "ไฟล์ .AI / .PSD / .PNG พื้นหลังใส ความละเอียด 300 dpi ขึ้นไป ทำไฟล์ตามขนาดที่สั่งและเผื่อตัดตก 2-3 มม. เลี่ยงวางจุดสำคัญของลายไว้ริมซ้ายเพราะเป็นแนวเจาะห่วง",
    },
  ],
};

/**
 * ฟิลด์ที่ปกติ /api/admin/products เขียนให้ตอนกดบันทึกในหน้าแก้ไข — สคริปต์เขียน DB ตรงจึงต้องทำเอง
 */
d.quoteOption = d.options.some((o) => o.askPrice || o.choices.some((c) => c.askPrice)) || undefined;
d.priceMin = Math.min(...allPrices);
d.priceMax = Math.max(...allPrices);
d.savedAt = new Date().toISOString();

console.log(`\n📦 ${d.name} (${ID}) · หมวด ${d.category} · slug ${d.slug}`);
console.log(`   ราคา ฿${d.priceMin}-${d.priceMax}/${UNIT} · ตัวเลือก ${d.options.map((o) => `${o.label} ${o.choices.length} แบบ`).join(" · ")}`);
console.log(`   แกลเลอรี ${d.images.length} ภาพ · ภาพประจำตัวเลือก ${d.options.flatMap((o) => o.choices).filter((c) => c.imageSrc).length}/${d.options.flatMap((o) => o.choices).length} ตัว`);
console.log(`   แท็บ: ${d.tabs.map((t) => t.title).join(" · ")} · สถานะ: ${d.hidden ? "ฉบับร่าง" : "เผยแพร่"}`);
if (!WRITE) {
  console.log("\n(ยังไม่อัปไฟล์ ไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

// คอลัมน์กระจก (name/category/price/badge) ต้องอัปด้วย — หน้ารายการสินค้าอ่านจากคอลัมน์ ไม่ใช่ใน data
const save = await sb
  .from("products")
  .upsert({ id: ID, data: d, name: d.name, category: d.category, price: d.price, badge: d.badge, sold: d.sold });
if (save.error) throw new Error(`บันทึกไม่สำเร็จ — ${save.error.message}`);
console.log(`\n✅ อัปภาพ + บันทึกแล้ว — ยังเป็นฉบับร่าง กดเผยแพร่ที่ /admin/products`);
