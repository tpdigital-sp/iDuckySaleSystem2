#!/usr/bin/env node
/**
 * "กระจกถือ" (mirror-hand) — ดึงราคาจากเว็บตารางราคา + อัปภาพ + เขียนสินค้า
 *
 *   node scripts/hand-mirror-art.mjs          # เตรียมภาพประจำตัวเลือกก่อน (.cache/hand-mirror/upload)
 *   node scripts/hand-mirror-apply.mjs        # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/hand-mirror-apply.mjs --write
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/mirror
 *   บล็อกหัวข้อ "กระจกถือ" (หน้านั้นมี 4 บล็อกสินค้า: กระจกถือ · กระจกพกพา · กระจกพับ · เซ็ตหวี
 *   จึงยึด "หัวข้อ" ไม่ใช่ลำดับตาราง) — ในบล็อกมี 2 ตาราง:
 *     ทรง สี่เหลี่ยม (9x16cm) : สแตนดาร์ด | พรีเมี่ยม | สีฟ้า
 *     ทรง หัวใจ (13x18.5cm)   : สแตนดาร์ด | พรีเมี่ยม
 *   สคริปต์อ่านสดทุกครั้ง ราคาบนเว็บเปลี่ยนเมื่อไหร่รันซ้ำได้เลย
 *
 * ⚠️ ชื่อสีก็อ่านจากเว็บ (บรรทัด "สีสแตนดาร์ด ดำ | ขาว" ใต้ตารางแต่ละทรง) ไม่ได้พิมพ์ทับไว้ในโค้ด
 *    สีไหนโผล่มาใหม่แล้วยังไม่มีภาพประกอบ = สคริปต์หยุด ให้ไปเพิ่มภาพใน hand-mirror-art.mjs ก่อน
 *    (โจทย์ของสินค้าตัวนี้คือ "ทุกตัวเลือกต้องมีภาพว่าหน้าตาเป็นแบบไหน")
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "mirror-hand";
const DIR = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1] || ".cache/hand-mirror/upload";
const PAGE = "https://www.iduckyofficial-pricelists.com/mirror";
const SECTION = "กระจกถือ";
const NAME = SECTION;
const V = "v1";

/** ชื่อเดิมที่ยอมให้ทับได้ — กันเผลอรันทับสินค้าตัวอื่นถ้า id ถูกใช้ซ้ำวันหลัง */
const EXPECT_NAMES = [NAME];

const UNIT = "อัน";
const SHAPE_LABEL = "ทรง";
const COLOR_LABEL = "สี";

/** ชื่อสีบนเว็บ (หลังเติม "สี" ให้ครบ) → ไฟล์ภาพจาก hand-mirror-art.mjs */
const COLOR_ART = {
  สีดำ: "color-black",
  สีขาว: "color-white",
  สีชมพู: "color-pink",
  สีฟ้า: "color-blue",
  สีดำประกายมุก: "color-black-pearl",
  สีขาวประกายมุก: "color-white-pearl",
};

/** ทรงบนเว็บ → ไฟล์ภาพประจำทรง */
const SHAPE_ART = { สี่เหลี่ยม: "shape-square", หัวใจ: "shape-heart" };

/**
 * รูปในแกลเลอรี (id wixstatic ของรูปงานจริงในบล็อก "กระจกถือ" — ตรวจแล้วว่าอยู่ในแกลเลอรีของบล็อกนี้จริง
 * comp-m8u4p5u9 = ทรงสี่เหลี่ยม · comp-ltdxoj3l2 = ทรงหัวใจ)
 * ⚠️ ได้แค่ 5 รูป — หน้าแก้ไขสินค้าตัดที่ MAX_PHOTOS = 5 ตอนโหลดเข้าฟอร์ม ใส่เกินไว้จะหายเงียบ ๆ
 * ภาพประจำตัวเลือกอีก 8 ภาพไม่นับรวมตรงนี้ (หน้าร้านดึงขึ้นแกลเลอรีให้เองตอนลูกค้ากดเลือก)
 */
const PHOTOS = [
  ["photo-square-pair", "959b83_9e892427f9dd44b7ab880aee0bb69207~mv2.jpg", "งานจริง — กระจกถือทรงสี่เหลี่ยมสีดำ พิมพ์ลายเต็มด้านหลัง"],
  ["photo-heart-flower", "959b83_868149ac8b604902a06c370f1ff4994b~mv2.jpg", "งานจริง — ทรงหัวใจสีดำ ลายดอกไม้เต็มพื้นที่"],
  ["photo-square-many", "959b83_25bbdec558f34110b84a813ea7c72108~mv2.jpg", "งานจริง — ทรงสี่เหลี่ยมสีดำ งานจำนวนมาก"],
  ["photo-heart-pink", "959b83_7f6c4a1cb21d48048ab8baeeb7725247~mv2.jpg", "งานจริง — ทรงหัวใจสีชมพู"],
  ["photo-heart-mirror", "959b83_13ff46018be54704b2e494dfb4b2380c~mv2.jpg", "งานจริง — ด้านกระจกเงาของทรงหัวใจ"],
];

/* ── 1. ดึงบล็อก "กระจกถือ" จากหน้าเว็บ ──────────────────────────── */

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
const start = ALL.findIndex((b) => b.text === SECTION);
if (start < 0) throw new Error(`หาหัวข้อ "${SECTION}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
/** จบบล็อกที่ก้อน CSS ของแกลเลอรีถัดไป (Wix แทรก <style> เป็นย่อหน้าคั่นระหว่างบล็อกสินค้า) */
const end = ALL.findIndex((b, i) => i > start && b.text && /^\.comp-/.test(b.text));
if (end < 0) throw new Error(`หาจุดจบของบล็อก "${SECTION}" ไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
const SEC = ALL.slice(start, end);

/** "1-10 อัน" → { upTo: 10 } · "1000 อันขึ้นไป" → { upTo: null } */
const tierOf = (label) => {
  const m = label.match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: label.replace(/\s+/g, " ").trim() };
};

/** ตาราง (ช่วงจำนวน × คอลัมน์) → { tiers, cols: [{head, prices[]}] } */
function grid(rows, what) {
  const tiers = rows.slice(1).map((r) => tierOf(r[0]));
  tiers.at(-1).upTo = null; // ช่วงสุดท้ายเปิดปลายเสมอ
  if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo))
    throw new Error(`ช่วงจำนวนของตาราง${what}อ่านไม่ครบ — ตรวจหน้าเว็บก่อน`);
  const cols = rows[0].slice(1).map((head, ci) => ({
    head,
    prices: rows.slice(1).map((r) => {
      const n = Number(String(r[ci + 1]).replace(/[^\d]/g, ""));
      if (!n) throw new Error(`ตาราง${what} แถว "${r[0]}" คอลัมน์ "${head}" อ่านราคาไม่ออก ("${r[ci + 1]}")`);
      return n;
    }),
  }));
  return { tiers, cols };
}

/** ชื่อสีบนเว็บเขียนไม่เหมือนกัน ("ดำ" กับ "สีชมพู") — เติม "สี" ให้ครบทุกตัว */
const colorName = (s) => (s.startsWith("สี") ? s : `สี${s}`);

/**
 * บรรทัดสีใต้ตาราง → { column, names }
 *   "สีสแตนดาร์ด ดำ | ขาว"              → คอลัมน์ "สแตนดาร์ด" · [สีดำ, สีขาว]
 *   "สีพรีเมี่ยม ดำประกายมุก | ขาวประกายมุก" → คอลัมน์ "พรีเมี่ยม"
 *   "สีฟ้า"                              → คอลัมน์ "สีฟ้า" · [สีฟ้า]  (คอลัมน์นี้เป็นสีเดี่ยว)
 */
function colorLine(line, cols) {
  const m = line.match(/^(\S+)\s+(.+)$/);
  if (m) {
    const column = cols.find((c) => c === m[1] || `สี${c}` === m[1]);
    if (column) return { column, names: m[2].split("|").map((s) => colorName(s.trim())).filter(Boolean) };
  }
  const column = cols.find((c) => c === line);
  if (column) return { column, names: [colorName(line)] };
  return null;
}

/**
 * อ่านทรงหนึ่งทรงจากบล็อก: หัวข้อ "ทรง X" → ตารางราคา → คำบรรยายขนาด → บรรทัดสี
 * ยึด "ลำดับก้อนต่อจากหัวข้อทรง" ไม่ใช่ลำดับตารางในหน้า (หน้านี้มีหลายบล็อกที่หน้าตาคล้ายกัน)
 */
function shape(word) {
  const hi = SEC.findIndex((b) => b.text && b.text.replace(/\s+/g, " ").trim() === `ทรง ${word}`);
  if (hi < 0) throw new Error(`ในบล็อก "${SECTION}" ไม่เจอหัวข้อ "ทรง ${word}" — โครงหน้าเว็บอาจเปลี่ยน`);
  const ti = SEC.findIndex((b, i) => i > hi && b.table);
  if (ti < 0) throw new Error(`ไม่เจอตารางราคาของทรง ${word}`);
  const g = grid(SEC[ti].table, `ทรง ${word}`);

  // ก้อนถัดจากตาราง จนถึงหัวข้อทรงถัดไป = คำบรรยายขนาด + บรรทัดสี
  const nextShape = SEC.findIndex((b, i) => i > ti && b.text && /^ทรง\s/.test(b.text));
  const after = SEC.slice(ti + 1, nextShape < 0 ? SEC.length : nextShape).filter((b) => b.text);

  const sizeText = after.find((b) => /กระจกทรง.*\d\s*x\s*[\d.]+\s*cm/i.test(b.text))?.text;
  const sm = sizeText?.match(/([\d.]+)\s*x\s*([\d.]+)\s*cm/i);
  if (!sm) throw new Error(`ไม่เจอขนาดของทรง ${word} (บรรทัด "กระจกทรง... 9x16cm") — โครงหน้าเว็บอาจเปลี่ยน`);
  const size = `${sm[1]}x${sm[2]}`;

  const cols = g.cols.map((c) => c.head);
  const colors = [];
  for (const b of after) {
    const parsed = colorLine(b.text, cols);
    if (parsed) for (const n of parsed.names) colors.push({ name: n, column: parsed.column });
  }
  const missing = cols.filter((c) => !colors.some((x) => x.column === c));
  if (missing.length)
    throw new Error(`ทรง ${word}: คอลัมน์ราคา "${missing.join(", ")}" ไม่มีบรรทัดบอกว่ามีสีอะไรบ้าง — ตรวจหน้าเว็บก่อน`);

  return { word, size, name: `ทรง${word} ${size} ซม.`, tiers: g.tiers, cols: g.cols, colors };
}

const SHAPES = [shape("สี่เหลี่ยม"), shape("หัวใจ")];

// ทั้งสองทรงต้องใช้ช่วงจำนวนชุดเดียวกัน ไม่งั้นรวมเป็นตารางเดียวไม่ได้
const tiers = SHAPES[0].tiers;
for (const s of SHAPES.slice(1)) {
  const same = s.tiers.length === tiers.length && s.tiers.every((t, i) => t.upTo === tiers[i].upTo);
  if (!same)
    throw new Error(
      `ช่วงจำนวนของ 2 ทรงบนเว็บไม่ตรงกันแล้ว — ต้องแยกตารางราคาต่อทรง\n` +
        `   ${SHAPES[0].word}: ${tiers.map((t) => t.label).join(" · ")}\n   ${s.word}: ${s.tiers.map((t) => t.label).join(" · ")}`
    );
}

/** เงื่อนไขคละลายจากบรรทัดหมายเหตุท้ายบล็อก ("11 ชิ้นขึ้นไปคละลาย สั่งขั้นต่ำ 5 ชิ้น++") */
const mixText = SEC.find((b) => b.text && /คละลาย/.test(b.text))?.text ?? "";
const mixFrom = Number(mixText.match(/(\d+)\s*ชิ้นขึ้นไปคละลาย/)?.[1]);
const mixMin = Number(mixText.match(/ขั้นต่ำ\s*(\d+)\s*ชิ้น/)?.[1]);
if (!mixFrom || !mixMin) throw new Error(`อ่านเงื่อนไขคละลายท้ายบล็อกไม่ออก ("${mixText}") — ตรวจหน้าเว็บก่อน`);

/** ตารางราคา 2 แกน (ทรง × สี) — สีไหนอยู่คอลัมน์ไหน ก็ใช้ราคาคอลัมน์นั้น */
const cells = {};
for (const s of SHAPES)
  for (const c of s.colors) {
    const col = s.cols.find((x) => x.head === c.column);
    cells[`${s.name}│${c.name}`] = col.prices;
  }
const PRICING = { unit: UNIT, driverLabels: [SHAPE_LABEL, COLOR_LABEL], tiers, cells };

/** รายชื่อสีทั้งหมด (เรียงตามที่เจอบนเว็บ ไม่ซ้ำ) — เป็นตัวเลือกกลุ่มเดียว แล้วใช้กฎกรองตามทรง */
const ALL_COLORS = [];
for (const s of SHAPES) for (const c of s.colors) if (!ALL_COLORS.includes(c.name)) ALL_COLORS.push(c.name);
const noArt = ALL_COLORS.filter((c) => !COLOR_ART[c]);
if (noArt.length)
  throw new Error(
    `สี "${noArt.join(", ")}" ยังไม่มีภาพประกอบ — เพิ่มการ์ดใน scripts/hand-mirror-art.mjs ก่อน\n` +
      `   (สินค้าตัวนี้ตั้งใจให้ทุกตัวเลือกมีภาพว่าหน้าตาเป็นแบบไหน)`
  );

const allPrices = Object.values(cells).flat();

console.log(`📊 บล็อก "${SECTION}" จากเว็บ · ${tiers.length} ช่วงจำนวน (${tiers.map((t) => t.label).join(" · ")})`);
for (const s of SHAPES) {
  console.log(`   ${s.name}`);
  for (const c of s.colors) console.log(`      ${c.name} (คอลัมน์ ${c.column}) : ${cells[`${s.name}│${c.name}`].join(" / ")}`);
}
console.log(`   คละลาย: ต่ำกว่า ${mixFrom} อันคละอิสระ · ตั้งแต่ ${mixFrom} อันขึ้นไป ลายละ ${mixMin} ชิ้นขึ้นไป`);
console.log(`   → ตารางราคา ${Object.keys(cells).length} ช่อง (ทรง × สี) · ราคา ฿${Math.min(...allPrices)}-${Math.max(...allPrices)}/${UNIT}`);

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
const url = (file) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/hand-mirror/${file}`;

async function put(name, buf) {
  const file = `${name}.jpg`;
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/hand-mirror/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

// รูปงานจริง — ดึงจาก wixstatic แล้วอัปเข้า storage ของเราเอง (เว็บ Wix เปลี่ยนลิงก์เมื่อไหร่ก็ไม่พัง)
const gallery = [];
for (const [file, wixId, label] of PHOTOS) {
  const res = await fetch(`https://static.wixstatic.com/media/${wixId}/v1/fill/w_1200,h_1200,al_c,q_88/file.jpg`);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  gallery.push({
    emoji: "🪞",
    gradient: "from-cyan-100 to-teal-200",
    label,
    src: await put(`${file}-${V}`, Buffer.from(await res.arrayBuffer())),
  });
}
console.log(`🖼  รูปงานจริง ${gallery.length} ภาพ (จากแกลเลอรีบล็อก "${SECTION}" บนเว็บ)`);

// ภาพประจำตัวเลือก — เตรียมไว้แล้วโดย hand-mirror-art.mjs
const local = (f) => readFileSync(`${DIR}/${f}.jpg`);
const ART_FILES = [...Object.values(SHAPE_ART), ...ALL_COLORS.map((c) => COLOR_ART[c]), "size-chart", "howto-file"];
const art = {};
for (const f of ART_FILES) art[f] = await put(`${f}-${V}`, local(f));
console.log(`🖼  ภาพประจำตัวเลือก ${ART_FILES.length} ภาพ (${DIR})`);

const { data: row } = await sb.from("products").select("id,data").eq("id", ID).maybeSingle();
if (row && !EXPECT_NAMES.includes(row.data?.name))
  throw new Error(`${ID} มีอยู่แล้วและชื่อ "${row.data?.name}" ไม่ใช่แถวที่ตั้งใจแก้ — ตรวจก่อน`);
const d = row ? structuredClone(row.data) : {};

d.id = ID;
d.name = NAME;
d.slug = "กระจกถือ";
d.category = "mirror-magnet";
d.emoji = "🪞";
d.gradient = "from-cyan-100 to-teal-200";
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
    desc: `${mixFrom} ชิ้นขึ้นไปคละลายได้ ลายละ ${mixMin} ชิ้นขึ้นไป`,
    minPerDesign: mixMin,
    freeMixBelowQty: mixFrom,
    pricing: PRICING,
  },
];

d.options = [
  {
    label: SHAPE_LABEL,
    stockBearing: true,
    choices: SHAPES.map((s) => ({ name: s.name, imageSrc: art[SHAPE_ART[s.word]] })),
  },
  {
    label: COLOR_LABEL,
    stockBearing: true,
    choices: ALL_COLORS.map((c) => ({ name: c, imageSrc: art[COLOR_ART[c]] })),
  },
];
// สีไม่ได้มีครบทุกทรง (สีฟ้ามีเฉพาะสี่เหลี่ยม · สีชมพูมีเฉพาะหัวใจ) — กรองตามทรงที่เลือก
d.rules = SHAPES.map((s) => ({
  when: { label: SHAPE_LABEL, choice: s.name },
  limit: { label: COLOR_LABEL, allow: s.colors.map((c) => c.name) },
}));

d.images = gallery;
d.imageSrc = gallery[0].src;

const colorsOf = (s) => s.colors.map((c) => c.name.replace(/^สี/, "")).join(" | ");
d.description =
  `กระจกถือด้ามจับ พิมพ์ลายตามสั่งด้วยระบบ UV ไม่มีขั้นต่ำในการสั่งผลิต ` +
  `เลือกได้ 2 ทรง — ${SHAPES.map((s) => `${s.word} ${s.size} ซม.`).join(" และ ")} ` +
  `มีสีให้เลือก ${ALL_COLORS.length} สี ทั้งสีสแตนดาร์ดผิวด้านและสีพรีเมี่ยมผิวประกายมุก ` +
  `ทุกตัวเลือกมีภาพให้ดูก่อนสั่งว่าหน้าตาเป็นแบบไหน ` +
  `ยิ่งสั่งเยอะยิ่งถูก เริ่มต้นอันละ ${d.price} บาท`;
d.highlights = [
  `2 ทรงให้เลือก — ${SHAPES.map((s) => `${s.word} ${s.size} ซม.`).join(" · ")}`,
  `${ALL_COLORS.length} สี พร้อมภาพประกอบทุกสี — ${ALL_COLORS.map((c) => c.replace(/^สี/, "")).join(" · ")}`,
  "สีสแตนดาร์ดผิวด้าน / สีพรีเมี่ยมผิวประกายมุก ราคาต่างกันตามตารางของร้าน",
  "พิมพ์ระบบ UV ลงบนตัวกระจกโดยตรง สีสด คมชัด",
  `ไม่มีขั้นต่ำ — สั่ง 1 อันก็ได้ · ต่ำกว่า ${mixFrom} อันคละลายได้อิสระ`,
  `ยิ่งสั่งเยอะยิ่งถูก — ${tiers.at(-1).label} เหลืออันละ ${Math.min(...allPrices)} บาท`,
];

const priceLine = (s, c) => `${c.name} — ${cells[`${s.name}│${c.name}`].map((p, i) => `${tiers[i].label} ${p}`).join(" · ")}`;
d.tabs = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text:
      "กระจกถือด้ามจับ พิมพ์ลายตามสั่ง — พิมพ์ด้วยระบบ UV ไม่มีขั้นต่ำในการสั่งผลิต\n" +
      SHAPES.map((s) => `• ทรง${s.word} ขนาด ${s.size} ซม. — สี ${colorsOf(s)}`).join("\n") +
      "\n• สีสแตนดาร์ด = ผิวด้าน · สีพรีเมี่ยม = ผิวประกายมุก (ราคาต่างกันตามตาราง)\n" +
      `• จำนวนต่ำกว่า ${mixFrom} อัน คละลายได้อิสระ · ตั้งแต่ ${mixFrom} อันขึ้นไป คละลายได้ ลายละ ${mixMin} ชิ้นขึ้นไป\n` +
      "• ไม่ถึงจำนวนตามที่กำหนด คิดตามราคาปลีก",
    images: [art["size-chart"]],
    imageSize: "lg",
  },
  {
    title: "ราคาแต่ละแบบ",
    text: SHAPES.map((s) => `ทรง${s.word} ${s.size} ซม.::\n` + s.colors.map((c) => `• ${priceLine(s, c)}`).join("\n")).join("\n\n"),
  },
  {
    title: "การเตรียมไฟล์",
    text:
      "• ไฟล์นามสกุล .PNG / .PSD / .AI หรือพื้นหลังใส\n" +
      "• ความละเอียด 300 dpi ขึ้นไป · ทำไฟล์ให้ตรงกับขนาดของทรงที่สั่ง\n" +
      "• วางภาพให้เกินขอบเล็กน้อย (เผื่อตัดตก) และเลี่ยงวางจุดสำคัญของลายไว้ริมขอบ\n" +
      "• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n" +
      "• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิก — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์",
    images: [art["howto-file"]],
    imageSize: "lg",
  },
  {
    title: "วิธีสั่งงาน",
    text:
      "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
      '• เลือกทรงและสี แล้วแนบภาพลาย (JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n' +
      '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น จำนวนแต่ละลาย · วันที่ต้องการใช้งาน\n' +
      "• สั่งหลายทรง/หลายสี ให้เพิ่มลงตะกร้าแยกรายการ\n" +
      "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n" +
      "หรือสั่งทางอีเมล::\n" +
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n" +
      "• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n" +
      "• ระบุรายละเอียด: ทรง · สี · จำนวนแต่ละลาย · วันที่ใช้งาน (ถ้ามี)",
  },
  {
    title: "การรับประกันสินค้า",
    text:
      "รับเคลม::\n" +
      "• สีเพี้ยนเกิน 10-15%\n" +
      "• จำนวนที่ได้รับไม่ครบถ้วน\n" +
      "• สี/ทรง หรืออะไหล่ที่ผิดพลาดจากแบบที่ได้รับการยืนยันผลิต\n" +
      "• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\n" +
      "ไม่รับเคลม::\n" +
      "• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n" +
      "• สินค้าชำรุดจากการใช้งานมาแล้ว\n\n" +
      "ระยะเวลาในการเคลม::\n" +
      "EMS 7 วัน นับจากวันที่ส่งสินค้า หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
  },
];

d.terms = [
  "พิมพ์ระบบ UV ลงบนตัวกระจกโดยตรง · ไม่มีขั้นต่ำในการสั่งผลิต",
  `จำนวนต่ำกว่า ${mixFrom} อัน คละลายได้อิสระ · ตั้งแต่ ${mixFrom} อันขึ้นไป คละลายได้ ลายละ ${mixMin} ชิ้นขึ้นไป ไม่ถึงตามจำนวน คิดตามราคาปลีก`,
  ...SHAPES.map((s) => `ทรง${s.word} ${s.size} ซม. มีสี ${colorsOf(s)}`),
  "สีพรีเมี่ยม (ประกายมุก) คิดราคาสูงกว่าสีสแตนดาร์ดตามตารางราคาของร้าน",
  "ภาพประกอบของสีฟ้าเป็นภาพจำลองสี (ยังไม่มีรูปงานจริงของสีนี้) — สีจริงอาจต่างเล็กน้อย",
  "ทางร้านใช้สีระบบ RGB สีงานพิมพ์ที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
  "ทางร้านมีเครื่องผลิตหลายเครื่อง สีแต่ละเครื่องต่างกันประมาณ 5-10% งานคนละรอบอาจสีไม่เท่ากันพอดี",
].join("\n");

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
console.log(`   กฎกรองสี ${d.rules.length} ข้อ: ${d.rules.map((r) => `${r.when.choice} → ${r.limit.allow.length} สี`).join(" · ")}`);
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
