#!/usr/bin/env node
/**
 * "SHIKISHI (ชิกิชิ)" — ดึงราคาจากเว็บตารางราคา + อัปภาพประจำตัวเลือก + เขียนสินค้า
 *
 *   node scripts/shikishi-art.mjs      # เตรียมภาพประจำตัวเลือกก่อน (.cache/shikishi/upload)
 *   node scripts/shikishi-apply.mjs            # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/shikishi-apply.mjs --write
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/shikishi
 *   หน้านี้มีสินค้าตัวเดียว — อ่านตารางราคา (จำนวน × 7 ขนาด) + ตาราง Add On เคลือบฟอยล์
 *   และบรรทัด "รายละเอียดเพิ่มเติม" (ค่าเคลือบ · ค่าปั๊มฟอยล์ · แกรมกระดาษ · ความหนาบอร์ด)
 *   อ่านไม่ครบเมื่อไหร่ = หยุด ไม่เดาตัวเลขเอง · ราคาบนเว็บเปลี่ยนเมื่อไหร่รันซ้ำได้เลย
 *
 * ⚠️ แถว pricelist-shikishi มีอยู่แล้วในฐานข้อมูล (นำเข้าจากเว็บตอนกวาดสินค้า — ได้แค่ตารางราคา
 *    ชื่อยังเป็น "PRICELIST SHIKISHI" ไม่มีสีขอบ/เคลือบ/ฟอยล์/ภาพประกอบ)
 *    สคริปต์นี้ "เติมของลงแถวเดิม" ไม่สร้างตัวซ้ำ — เว็บจะได้ไม่มีชิกิชิสองตัว
 *
 * 💰 ค่าเคลือบ/ค่าฟอยล์ คิด "ต่อชิ้น" ตามตัวเลขบนเว็บ (10 / 40 / 60) ตามที่ผู้ใช้ยืนยัน 21 ส.ค. 69
 *    (หน้าเว็บเขียนกำกับว่าจำนวนเคลือบคิดต่อแผ่น A3 — ข้อมูลนั้นเก็บไว้ในแท็บ/เงื่อนไขให้ลูกค้าอ่าน)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SIZES } from "./shikishi-art.mjs";

const WRITE = process.argv.includes("--write");
const ID = "pricelist-shikishi";
const DIR = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1] || ".cache/shikishi/upload";
const PAGE = "https://www.iduckyofficial-pricelists.com/shikishi";
const NAME = "SHIKISHI (ชิกิชิ)";
const V = "v1";

/** ชื่อเดิมที่ยอมให้ทับได้ — กันเผลอรันทับสินค้าตัวอื่นถ้า id ถูกใช้ซ้ำวันหลัง */
const EXPECT_NAMES = ["PRICELIST SHIKISHI", NAME];

const SIZE_LABEL = "ขนาด";
const BORDER_LABEL = "สีขอบ";
const COAT_LABEL = "เคลือบลามิเนต";
const FILM_LABEL = "เคลือบ"; // กลุ่มที่ลิงก์คลังตัวเลือกกลาง (ผิวฟิล์มพิเศษ 10 แบบ)
const FILM_PRESET = "preset-2";
const COAT_SPECIAL = "เคลือบพิเศษ";
const FOIL_LABEL = "เคลือบฟอยล์ (Add On)";
const FOIL_COLOR_LABEL = "สีฟอยล์";
const STAMP_LABEL = "ปั๊มฟอยล์ (Add On)";
const FOIL_NONE = "ไม่เคลือบฟอยล์";

/** ภาพฟอยล์ของร้านที่มีอยู่แล้ว (สินค้า photocard-digital ใช้ชุดนี้อยู่ — ใช้ไฟล์เดียวกัน ไม่อัปซ้ำ) */
const SB_PUBLIC = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products";
const FOIL_IMG = {
  layer1: `${SB_PUBLIC}/photocard-digital/foil-1layer-info.jpg`,
  layer2: `${SB_PUBLIC}/photocard-digital/foil-2layer-info.jpg`,
  silver: `${SB_PUBLIC}/photocard-digital/foil-silver.jpg`,
  gold: `${SB_PUBLIC}/photocard-digital/foil-gold.jpg`,
  rosegold: `${SB_PUBLIC}/photocard-digital/foil-rosegold.jpg`,
  hologram: `${SB_PUBLIC}/photocard-digital/foil-hologram.jpg`,
  steps: `${SB_PUBLIC}/paper-foil/process-foil.jpg`,
};

/**
 * รูปงานจริงของชิกิชิบนหน้าเว็บ (id wixstatic — ตรวจด้วยตาแล้วว่าเป็นงานชิกิชิจริง ไม่ใช่ของสินค้าอื่น)
 * ⚠️ ได้แค่ 5 รูป — หน้าแก้ไขสินค้าตัดที่ MAX_PHOTOS = 5 ตอนโหลดเข้าฟอร์ม ใส่เกินไว้จะหายเงียบ ๆ
 * ภาพประจำตัวเลือกไม่นับรวมตรงนี้ (หน้าร้านดึงขึ้นแกลเลอรีให้เองตอนลูกค้ากดเลือก)
 */
const PHOTOS = [
  ["photo-sizes", "959b83_1438afd29f214127a095dd1ded5bc03d", "งานจริง — ชิกิชิขอบทอง หลายขนาดวางซ้อนกัน"],
  ["photo-gold-stack", "959b83_dd77f208c31d4b55b01bb55ca9dd0e20", "งานจริง — ขอบทอง วางเรียงให้เห็นทั้งใบ"],
  ["photo-gold-corner", "959b83_06c3f45c2fbc45e4a1308f9487bda29a", "งานจริง — ซูมมุมขอบทอง"],
  ["photo-holo", "959b83_036d101978084f84b54f29ab1639bf7c", "งานจริง — ขอบโฮโลแกรม เหลือบรุ้ง"],
  ["photo-holo-pair", "959b83_4a976d236525447ab27a1131ef8a00a5", "งานจริง — ขอบโฮโลแกรม 2 ใบ"],
];

/* ── 1. ดึงราคา + เงื่อนไขจากหน้าเว็บ ─────────────────────────────── */

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
const TEXT = ALL.filter((b) => b.text).map((b) => b.text);

/* ตารางราคาหลัก — หัวคอลัมน์ "จำนวน" + ขนาดทั้ง 7 */
const priceTable = ALL.find((b) => b.table && /จำนวน/.test(b.table[0][0] ?? "") && /A7/.test(b.table[0][1] ?? ""));
if (!priceTable) throw new Error("ไม่เจอตารางราคาหลัก (จำนวน × ขนาด) — โครงหน้าเว็บอาจเปลี่ยน");
const [head, ...rows] = priceTable.table;
const COLS = head.slice(1);
const WANT = SIZES.map((s) => s.key);
if (COLS.length !== WANT.length || COLS.some((c, i) => c !== WANT[i]))
  throw new Error(`คอลัมน์ขนาดบนเว็บเป็น [${COLS}] ไม่ตรงกับที่สคริปต์รู้จัก [${WANT}] — ตรวจหน้าเว็บก่อน`);

/** "1-10 ชิ้น" → { upTo: 10 } · "100 ชิ้นขึ้นไป" → { upTo: null } */
const tiers = rows.map((r) => {
  const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: r[0].replace(/\s+/g, " ").trim() };
});
tiers.at(-1).upTo = null; // ช่วงสุดท้ายเปิดปลายเสมอ
if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ — ตรวจก่อน");

const cells = {};
COLS.forEach((col, ci) => {
  cells[col] = rows.map((r) => {
    const n = Number(String(r[ci + 1]).replace(/[^\d]/g, ""));
    if (!n) throw new Error(`ช่องราคา "${col}" แถว "${r[0]}" อ่านไม่ออก ("${r[ci + 1]}")`);
    return n;
  });
});
const ALL_PRICES = Object.values(cells).flat();

/* ตาราง Add On เคลือบฟอยล์ */
const foilTable = ALL.find((b) => b.table && /เคลือบฟอยล์/.test(b.table[0][0] ?? ""));
if (!foilTable) throw new Error("ไม่เจอตาราง Add On เคลือบฟอยล์ — โครงหน้าเว็บอาจเปลี่ยน");
const foilRow = (re, what) => {
  const r = foilTable.table.slice(1).find((x) => re.test(x[0]));
  if (!r) throw new Error(`ในตารางเคลือบฟอยล์ไม่เจอแถว${what} — โครงหน้าเว็บอาจเปลี่ยน`);
  const n = Number(String(r[1]).replace(/[^\d]/g, ""));
  if (!n) throw new Error(`ราคาแถว "${r[0]}" อ่านไม่ออก ("${r[1]}")`);
  return { name: r[0].replace(/\s+/g, " ").trim(), price: n };
};
const FOIL_1 = foilRow(/1\s*เลเยอร์/, ' "พิมพ์ 1 เลเยอร์"');
const FOIL_2 = foilRow(/2\s*เลเยอร์/, ' "พิมพ์ 2 เลเยอร์"');

/** ตัวเลขในบรรทัดรายละเอียดของหน้านี้ — อ่านไม่เจอ = หยุด ไม่เดาเอง */
function detail(re, what) {
  const line = TEXT.find((t) => re.test(t));
  if (!line) throw new Error(`ไม่เจอบรรทัด${what} บนหน้าเว็บ — โครงหน้าเว็บอาจเปลี่ยน`);
  return Number(re.exec(line)[1]);
}
const COAT_FEE = detail(/เคลือบเงา\s*\/\s*ด้าน\s*บวก\s*(\d+)\s*บาท/, "ค่าเคลือบเงา/ด้าน");
const SPECIAL_FEE = detail(/เคลือบพิเศษ\s*บวก\s*(\d+)\s*บาท/, "ค่าเคลือบพิเศษ");
const STAMP_FEE = detail(/ปั๊มฟอยล์\s*บวกเพิ่ม\s*(\d+)\s*บาท/, "ค่าปั๊มฟอยล์");
const HOLO_FEE = detail(/โฮโลแกรม\s*บวกเพิ่ม\s*(\d+)\s*บาท/, "ค่าฟอยล์สีโฮโลแกรม");
const GSM = detail(/อาร์ตการ์ด\s*(\d+)\s*แกรม/, "แกรมกระดาษอาร์ตการ์ด");
const THICK = detail(/การ์ดบอร์ด\s*หนา\s*(\d+)\s*mm/i, "ความหนาการ์ดบอร์ด");
const MIX_FROM = detail(/สั่งจำนวน\s*(\d+)\s*ชิ้นขึ้นไป\s*คละ/, "เงื่อนไขคละลาย (จำนวนขั้นต่ำ)");
const MIX_MIN = detail(/คละลาย\s*\/\s*คละขนาด\s*สั่งขั้นต่ำ\s*(\d+)\s*ชิ้น/, "เงื่อนไขคละลาย (ขั้นต่ำต่อลาย)");

/** จำนวนใบต่อแผ่น A3 ที่หน้าเว็บระบุ — ทวนกับตารางในสคริปต์ ไม่ตรงเมื่อไหร่ = หยุด */
for (const s of SIZES) {
  if (!s.perA3 || s.key === "A3") continue;
  const line = TEXT.find((t) => new RegExp(`^${s.key}\\s*ได้\\s*\\d+\\s*ใบ`).test(t));
  if (!line) continue;
  const got = Number(line.match(/(\d+)\s*ใบ/)[1]);
  if (got !== s.perA3) throw new Error(`เว็บบอก ${s.key} ได้ ${got} ใบต่อแผ่น A3 แต่สคริปต์ตั้งไว้ ${s.perA3} — ตรวจก่อน`);
}

const PRICING = { unit: "ชิ้น", driverLabels: [SIZE_LABEL], tiers, cells };

console.log("📋 ตารางราคาจากเว็บ (PRICELIST SHIKISHI)");
console.log(`   ${"ช่วงจำนวน".padEnd(16)}${COLS.map((c) => c.padStart(9)).join("")}`);
tiers.forEach((t, i) => console.log(`   ${t.label.padEnd(16)}${COLS.map((c) => String(cells[c][i]).padStart(9)).join("")}`));
console.log(`   เคลือบเงา/ด้าน +฿${COAT_FEE} · เคลือบพิเศษ +฿${SPECIAL_FEE} · ปั๊มฟอยล์ +฿${STAMP_FEE}`);
console.log(`   ${FOIL_1.name} +฿${FOIL_1.price} · ${FOIL_2.name} +฿${FOIL_2.price} · ฟอยล์โฮโลแกรม +฿${HOLO_FEE}`);
console.log(`   การ์ดบอร์ด ${THICK} มม. · อาร์ตการ์ด ${GSM} แกรม · คละได้ตั้งแต่ ${MIX_FROM} ชิ้น (ลายละ ${MIX_MIN} ชิ้น)`);

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
    emoji: "🎴",
    gradient: "from-sky-100 to-blue-200",
    label,
    src: await put(`${file}-${V}`, Buffer.from(await res.arrayBuffer())),
  });
}
console.log(`\n🖼  รูปงานจริง ${gallery.length} ภาพ (จากหน้าเว็บตารางราคา)`);

// ภาพประจำตัวเลือก — เตรียมไว้แล้วโดย shikishi-art.mjs
const local = (f) => readFileSync(`${DIR}/${f}.jpg`);
const ART_FILES = [
  ...SIZES.map((s) => `size-${s.key.toLowerCase()}`),
  "size-compare",
  "border-silver",
  "border-gold",
  "border-rosegold",
  "border-hologram",
  "border-all",
  "structure",
  "coat-none",
  "coat-gloss",
  "coat-matte",
  "coat-special",
  "mix-designs",
];
const art = {};
for (const f of ART_FILES) art[f] = await put(`${f}-${V}`, local(f));
console.log(`🖼  ภาพประจำตัวเลือก ${ART_FILES.length} ภาพ (${DIR})`);

// ผิวฟิล์มพิเศษ — ใช้ตัวเลือกจากคลังกลาง (แก้ที่คลังครั้งเดียว ทุกสินค้าที่ลิงก์ได้ตามไปด้วย)
const preset = await sb.from("products").select("data").eq("id", `__preset_${FILM_PRESET}`).single();
if (preset.error) throw new Error(`อ่านคลังตัวเลือก ${FILM_PRESET} ไม่ได้ — ${preset.error.message}`);
const FILMS = preset.data.data.choices.map((c) => ({ name: c.name, ...(c.imageSrc ? { imageSrc: c.imageSrc } : {}) }));
console.log(`🎞  ผิวฟิล์มพิเศษ ${FILMS.length} แบบ (ลิงก์คลัง ${FILM_PRESET} — “${preset.data.data.label}”)`);

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้า ${ID} ไม่ได้ — ${error.message}`);
const d = structuredClone(row.data);
if (!EXPECT_NAMES.includes(d.name)) throw new Error(`${ID} ชื่อ "${d.name}" ไม่ใช่แถวที่ตั้งใจแก้ — ตรวจก่อน`);

const MIN = Math.min(...ALL_PRICES);
const MAX = Math.max(...ALL_PRICES);

d.name = NAME;
d.slug = "shikishi";
d.category = "card-photo";
d.emoji = "🎴";
d.gradient = "from-sky-100 to-blue-200";
d.price = MIN;
d.badge = "ใหม่";
d.rating = 5;
d.pricing = PRICING;
d.images = gallery;
d.imageSrc = gallery[0].src;
d.artworkRequired = true;

d.description =
  `ชิกิชิ (SHIKISHI) การ์ดบอร์ดหนา ${THICK} มม. ขอบหุ้มฟอยล์ เลือกได้ 4 สี (เงิน · ทอง · โรสโกลด์ · โฮโลแกรม) ` +
  `ตัวภาพเป็นกระดาษอาร์ตการ์ด ${GSM} แกรม พิมพ์ระบบ Digital Printing สีคมชัด ไม่ซีดไม่หลุดลอก ` +
  `มี 7 ขนาด — A7 A6 A5 A4 A3 และจัตุรัส 10×10 / 15×15 ซม. เริ่มต้นชิ้นละ ${MIN} บาท ไม่มีขั้นต่ำในการสั่งผลิต ` +
  `เพิ่มเคลือบเงา / ด้าน / เคลือบพิเศษ และเคลือบฟอยล์-ปั๊มฟอยล์ได้`;

d.highlights = [
  `เริ่มชิ้นละ ${MIN} บาท (A7 สั่ง 100 ชิ้นขึ้นไป) — ไม่มีขั้นต่ำในการสั่งผลิต`,
  `การ์ดบอร์ดหนา ${THICK} มม. ขอบฟอยล์ 4 สี · ตัวภาพอาร์ตการ์ด ${GSM} แกรม`,
  "7 ขนาด: A7 · A6 · A5 · A4 · A3 · 10×10 ซม. · 15×15 ซม.",
  `เคลือบเงา/ด้าน +฿${COAT_FEE} · เคลือบพิเศษ +฿${SPECIAL_FEE} · เคลือบฟอยล์ +฿${FOIL_1.price} · ปั๊มฟอยล์ +฿${STAMP_FEE}`,
];

d.options = [
  {
    label: SIZE_LABEL,
    choices: SIZES.map((s) => ({
      name: s.key,
      ...(s.key === "A6" ? { popular: true } : {}),
      imageSrc: art[`size-${s.key.toLowerCase()}`],
    })),
  },
  {
    label: BORDER_LABEL,
    stockBearing: true,
    choices: [
      { name: "สีเงิน", imageSrc: art["border-silver"] },
      { name: "สีทอง", popular: true, imageSrc: art["border-gold"] },
      { name: "สีโรสโกลด์", imageSrc: art["border-rosegold"] },
      { name: "สีโฮโลแกรม", imageSrc: art["border-hologram"] },
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
    label: FOIL_LABEL,
    choices: [
      { name: FOIL_NONE },
      { name: FOIL_1.name, extra: FOIL_1.price, imageSrc: FOIL_IMG.layer1 },
      { name: FOIL_2.name, extra: FOIL_2.price, imageSrc: FOIL_IMG.layer2 },
    ],
  },
  {
    label: FOIL_COLOR_LABEL,
    showWhen: { label: FOIL_LABEL, choices: [FOIL_1.name, FOIL_2.name] },
    choices: [
      { name: "สีเงิน", imageSrc: FOIL_IMG.silver },
      { name: "สีทอง", imageSrc: FOIL_IMG.gold },
      { name: "สีโรสโกลด์", imageSrc: FOIL_IMG.rosegold },
      { name: "สีโฮโลแกรม", extra: HOLO_FEE, imageSrc: FOIL_IMG.hologram },
    ],
  },
  {
    label: STAMP_LABEL,
    choices: [{ name: "ไม่ปั๊มฟอยล์" }, { name: "ปั๊มฟอยล์", extra: STAMP_FEE }],
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
  `ราคาในตารางคิดต่อชิ้น และคิดตามขนาดที่เลือก — ${COLS.map((c) => `${c} เริ่ม ${Math.max(...cells[c])} บาท`).join(" · ")}`,
  "ไม่มีขั้นต่ำในการสั่งผลิต — สั่ง 1 ชิ้นก็ทำให้",
  `สั่งตั้งแต่ ${MIX_FROM} ชิ้นขึ้นไป คละลาย / คละขนาดได้ ขั้นต่ำลายละ ${MIX_MIN} ชิ้น`,
  `การ์ดบอร์ดหนา ${THICK} มม. ขอบมี 4 สี (เงิน · ทอง · โรสโกลด์ · โฮโลแกรม) ราคาเท่ากันทุกสี · ตัวภาพเป็นกระดาษอาร์ตการ์ด ${GSM} แกรม`,
  `เคลือบเงา / เคลือบด้าน บวกเพิ่ม ${COAT_FEE} บาท · เคลือบพิเศษ (กลิตเตอร์ · ทราย · โฮโลแกรม) บวกเพิ่ม ${SPECIAL_FEE} บาท`,
  `เคลือบฟอยล์: ${FOIL_1.name} บวกเพิ่ม ${FOIL_1.price} บาท · ${FOIL_2.name} บวกเพิ่ม ${FOIL_2.price} บาท · เลือกฟอยล์สีโฮโลแกรมบวกเพิ่มอีก ${HOLO_FEE} บาท`,
  `ปั๊มฟอยล์ บวกเพิ่ม ${STAMP_FEE} บาท · เคลือบฟอยล์ทำได้เฉพาะงานกระดาษ`,
  `งานเคลือบและปั๊มฟอยล์ทำเป็นแผ่น A3 — ${SIZES.filter((s) => s.perA3).map((s) => `${s.key} ได้ ${s.perA3} ใบ`).join(" · ")} ต่อ 1 แผ่น A3`,
  "งานพิมพ์ฟอยล์ 2 เลเยอร์ ตำแหน่งลายอาจเลื่อนประมาณ 1-2 มม. เพราะกระดาษหดตัวจากการพิมพ์และเคลือบหลายรอบ",
  "ขอบการ์ดติดด้วยมือ อาจมีรอยยับเล็กน้อย · การตัดคลาดเคลื่อนได้ +/- 0.5-2 มม. ตามข้อจำกัดของเครื่องตัด",
  "ทางร้านใช้สีระบบ RGB สีงานพิมพ์ที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
].join("\n");

/** แท็บข้อมูล — 3 แท็บท้าย (วิธีสั่งงาน / การเตรียมไฟล์ / การรับประกัน) ใช้ของเดิมที่มีอยู่แล้ว */
const keepTabs = (d.tabs ?? []).filter((t) => ["วิธีสั่งงาน", "การเตรียมไฟล์", "การรับประกันสินค้า"].includes(t.title));
d.tabs = [
  {
    title: "รายละเอียดงานพิมพ์",
    text: [
      "::วัสดุ::",
      `• การ์ดบอร์ด หนา ${THICK} มม. — ขอบหุ้มฟอยล์ เลือกได้ 4 สี: เงิน · ทอง · โรสโกลด์ · โฮโลแกรม`,
      `• ตัวภาพเป็นกระดาษอาร์ตการ์ด ${GSM} แกรม พิมพ์ด้วยระบบ Digital Printing`,
      "::ขนาด::",
      `• ${SIZES.map((s) => `${s.key} (${s.mm[0]}×${s.mm[1]} มม.)`).join(" · ")}`,
      "::ราคาต่อชิ้น::",
      ...COLS.map((c) => `• ${c}: ${tiers.map((t, i) => `${t.label} ${cells[c][i]} บาท`).join(" · ")}`),
      "::ราคาบวกเพิ่ม::",
      `• เคลือบเงา / เคลือบด้าน +${COAT_FEE} บาท · เคลือบพิเศษ +${SPECIAL_FEE} บาท`,
      `• ${FOIL_1.name} +${FOIL_1.price} บาท · ${FOIL_2.name} +${FOIL_2.price} บาท (ฟอยล์สีโฮโลแกรม +${HOLO_FEE} บาท)`,
      `• ปั๊มฟอยล์ +${STAMP_FEE} บาท`,
    ].join("\n"),
    images: [art["size-compare"], art["border-all"], art["structure"]],
    imagePos: "bottom",
    imageSize: "md",
  },
  {
    title: "ขั้นตอนงานฟอยล์",
    text: [
      "• พิมพ์ 1 เลเยอร์ = ปั๊มฟอยล์อย่างเดียวบนกระดาษเปล่า ลายเป็นสีฟอยล์ล้วน ไม่มีพิมพ์สี",
      "• พิมพ์ 2 เลเยอร์ = พิมพ์สีก่อน แล้วปั๊มฟอยล์ทับ ได้ทั้งลายสีและจุดที่เป็นฟอยล์",
      "• ฟอยล์มี 4 สี: เงิน · ทอง · โรสโกลด์ · โฮโลแกรม (โฮโลแกรมบวกเพิ่ม " + HOLO_FEE + " บาท)",
      "• เคลือบฟอยล์ทำได้เฉพาะงานกระดาษ",
      "• งาน 2 เลเยอร์ ตำแหน่งลายอาจเลื่อน 1-2 มม. เพราะกระดาษหดตัวจากการพิมพ์และเคลือบหลายรอบ",
    ].join("\n"),
    images: [FOIL_IMG.steps],
    imagePos: "bottom",
    imageSize: "lg",
  },
  {
    title: "ข้อควรทราบ",
    text: [
      `• สั่งตั้งแต่ ${MIX_FROM} ชิ้นขึ้นไป คละลาย / คละขนาดได้ — ขั้นต่ำลายละ ${MIX_MIN} ชิ้น`,
      `• งานเคลือบและปั๊มฟอยล์ทำเป็นแผ่น A3 (${SIZES.filter((s) => s.perA3).map((s) => `${s.key} ${s.perA3} ใบ`).join(" · ")} ต่อแผ่น)`,
      "• ขอบการ์ดติดด้วยมือ อาจมีรอยยับบ้างเล็กน้อย",
      "• การเคลือบแต่ละแบบทำให้สีพิมพ์เข้มขึ้น-อ่อนลงได้เล็กน้อย · งานเคลือบอาจมีฝุ่นบนงานเล็กน้อย",
      "• ทางร้านใช้สี RGB สีที่ได้อาจสว่างกว่าหรือดรอปลงจากไฟล์ ±5% ถึง ±15%",
      "• งานพิมพ์ด้านหลังคลาดเคลื่อนได้ +/- 3-5 มม. ไม่ควรวางลายชิดขอบหรือมีเส้นกรอบ",
    ].join("\n"),
    images: [art["mix-designs"]],
    imagePos: "bottom",
    imageSize: "md",
  },
  ...keepTabs,
];

d.seo = {
  title: "รับทำชิกิชิ SHIKISHI การ์ดบอร์ดขอบฟอยล์ พิมพ์ลายตามสั่ง",
  description:
    `รับผลิตชิกิชิ (SHIKISHI) การ์ดบอร์ดหนา ${THICK} มม. ขอบสีเงิน ทอง โรสโกลด์ โฮโลแกรม ` +
    `ตัวภาพอาร์ตการ์ด ${GSM} แกรม มี 7 ขนาด A7 A6 A5 A4 A3 และ 10×10 / 15×15 ซม. ` +
    `เริ่มชิ้นละ ${MIN} บาท ไม่มีขั้นต่ำ เคลือบเงา ด้าน พิเศษ และเคลือบฟอยล์-ปั๊มฟอยล์ได้`,
  keywords: [
    "ชิกิชิ",
    "shikishi",
    "รับทำชิกิชิ",
    "การ์ดชิกิชิ",
    "ชิกิชิขอบทอง",
    "ชิกิชิสั่งทำ",
    "พิมพ์ชิกิชิ",
    "shikishi board",
  ],
  faqs: [
    {
      q: "ชิกิชิราคาเท่าไหร่?",
      a: `คิดต่อชิ้นตามขนาด — ${COLS.map((c) => `${c} ${Math.max(...cells[c])}-${Math.min(...cells[c])} บาท`).join(" · ")} (ยิ่งสั่งเยอะยิ่งถูกตามช่วงจำนวน)`,
    },
    { q: "สั่งขั้นต่ำกี่ชิ้น?", a: `ไม่มีขั้นต่ำในการสั่งผลิต · สั่งตั้งแต่ ${MIX_FROM} ชิ้นขึ้นไป คละลาย / คละขนาดได้ ขั้นต่ำลายละ ${MIX_MIN} ชิ้น` },
    {
      q: "ขอบการ์ดมีสีอะไรบ้าง?",
      a: "มี 4 สี — สีเงิน สีทอง สีโรสโกลด์ และสีโฮโลแกรม ราคาเท่ากันทุกสี เลือกได้ทุกขนาด",
    },
    {
      q: "เคลือบผิวได้ไหม คิดเงินยังไง?",
      a: `เคลือบเงาหรือเคลือบด้าน บวกเพิ่ม ${COAT_FEE} บาท · เคลือบพิเศษ (กลิตเตอร์ ทราย โฮโลแกรม) บวกเพิ่ม ${SPECIAL_FEE} บาท`,
    },
    {
      q: "เคลือบฟอยล์กับปั๊มฟอยล์ต่างกันยังไง?",
      a: `เคลือบฟอยล์เลือกได้ 1 เลเยอร์ (+${FOIL_1.price} บาท ลายเป็นฟอยล์ล้วน ไม่มีพิมพ์สี) หรือ 2 เลเยอร์ (+${FOIL_2.price} บาท พิมพ์สีแล้วปั๊มฟอยล์ทับ) ส่วนปั๊มฟอยล์บวกเพิ่ม ${STAMP_FEE} บาท`,
    },
    {
      q: "ชิกิชิมีขนาดอะไรบ้าง?",
      a: `มี 7 ขนาด — ${SIZES.map((s) => `${s.key} ${s.mm[0]}×${s.mm[1]} มม.`).join(" · ")}`,
    },
  ],
};

/**
 * ฟิลด์ที่ปกติ /api/admin/products เขียนให้ตอนกดบันทึกในหน้าแก้ไข — สคริปต์เขียน DB ตรงจึงต้องทำเอง
 * hidden : คงสถานะฉบับร่างไว้ ให้ทีมงานกดเผยแพร่เองที่ /admin/products
 */
d.quoteOption = d.options.some((o) => o.askPrice || o.choices.some((c) => c.askPrice)) || undefined;
d.priceMin = MIN;
d.priceMax = MAX + SPECIAL_FEE + FOIL_2.price + HOLO_FEE + STAMP_FEE;
d.savedAt = new Date().toISOString();

const choices = d.options.flatMap((o) => o.choices);
console.log(`\n📦 ${d.name} (${ID}) · หมวด ${d.category} · slug ${d.slug}`);
console.log(`   ราคา ฿${MIN}-${MAX}/ชิ้น · ตัวเลือก ${d.options.map((o) => `${o.label} ${o.choices.length} แบบ`).join(" · ")}`);
console.log(`   แกลเลอรี ${d.images.length} ภาพ · ภาพประจำตัวเลือก ${choices.filter((c) => c.imageSrc).length}/${choices.length} ตัว`);
console.log(`   แท็บ: ${d.tabs.map((t) => t.title).join(" · ")} · สถานะ: ${d.hidden ? "ฉบับร่าง" : "เผยแพร่"}`);
if (!WRITE) {
  console.log("\n(ยังไม่อัปไฟล์ ไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

// คอลัมน์กระจก (name/category/price) ต้องอัปพร้อม data ไม่งั้นหน้ารายการสินค้าโชว์ของเก่า
const up = await sb.from("products").update({ name: d.name, category: d.category, price: d.price, data: d }).eq("id", ID);
if (up.error) throw new Error(`บันทึกสินค้าไม่สำเร็จ — ${up.error.message}`);
console.log(`\n✅ บันทึกแล้ว — เปิดดูที่ /admin/products/${ID}${d.hidden ? " (ยังเป็นฉบับร่าง — กดเผยแพร่เองที่หน้ารายการสินค้า)" : ""}`);
