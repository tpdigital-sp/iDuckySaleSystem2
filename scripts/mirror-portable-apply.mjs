#!/usr/bin/env node
/**
 * "กระจกพกพา" (mirror-portable) — ดึงราคาจากเว็บตารางราคา + อัปภาพ + เขียนสินค้า
 *
 *   node scripts/mirror-portable-art.mjs       # เตรียมภาพประจำตัวเลือกก่อน (.cache/mirror-portable/upload)
 *   node scripts/mirror-portable-apply.mjs             # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/mirror-portable-apply.mjs --write
 *   node scripts/mirror-portable-apply.mjs --write --id=new-xxxx   # เขียนลงแถวที่สร้างค้างไว้แทน
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/mirror
 *   บล็อกหัวข้อ "กระจกพกพาทรงกลม / กระจกพวงกุญแจ" (หน้านั้นมี 4 บล็อกสินค้า จึงยึด "หัวข้อ" ไม่ใช่ลำดับตาราง)
 *   ตาราง 3 คอลัมน์ = กระจกทรงกลม 58mm · กระจกทรงกลม 75mm · กระจกพวงกุญแจ 58mm
 *   สคริปต์อ่านสดทุกครั้ง ราคาบนเว็บเปลี่ยนเมื่อไหร่รันซ้ำได้เลย
 *
 * ⚠️ ตัวเลข "1 ชุด 5 ชิ้น" และ "เคลือบพิเศษ +40" ก็อ่านจากข้อความในบล็อกเดียวกัน ไม่ฮาร์ดโค้ด
 *    หาไม่เจอเมื่อไหร่ = หยุด ให้คนมาดูก่อน
 *
 * ⚠️ ช่วงจำนวนบนเว็บบรรทัด "(5ชิ้น- 125ชิ้น)" ขัดกับตารางเอง (1-29 เซ็ต = 5-145 ชิ้น)
 *    สคริปต์จึงคิดช่วง "ชิ้น" จากตารางเซ็ต × 5 ไม่ลอกบรรทัดนั้นมา
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { TYPES } from "./mirror-portable-art.mjs";

const WRITE = process.argv.includes("--write");
const ID = (process.argv.find((a) => a.startsWith("--id=")) || "").split("=")[1] || "mirror-portable";
const DIR = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1] || ".cache/mirror-portable/upload";
const PAGE = "https://www.iduckyofficial-pricelists.com/mirror";
const SECTION = "กระจกพกพาทรงกลม / กระจกพวงกุญแจ";
const NAME = "กระจกพกพา";
const V = "v1";

/** ชื่อเดิมที่ยอมให้ทับได้ — กันเผลอรันทับสินค้าตัวอื่นถ้า id ถูกใช้ซ้ำวันหลัง */
const EXPECT_NAMES = [NAME, "สินค้าใหม่"];

const UNIT = "เซ็ต";
const TYPE_LABEL = "แบบกระจก";
const COAT_KIND_LABEL = "ชนิดเคลือบ";
const COAT_LABEL = "ผิวเคลือบ";
const COAT_NORMAL = "เคลือบธรรมดา (ฟรี)";
const COAT_SPECIAL = "เคลือบพิเศษ";

/** คอลัมน์บนเว็บ → แบบสินค้าของเรา (จับด้วยข้อความหัวคอลัมน์ กันเว็บสลับลำดับ) */
const COLS = [
  { key: "round58", web: /ทรงกลม[^|]*58/ },
  { key: "round75", web: /ทรงกลม[^|]*75/ },
  { key: "keyring58", web: /พวงกุญแจ[^|]*58/ },
];

/**
 * ผิวฟิล์มเคลือบ — ใช้คลังตัวเลือกกลางของร้าน (products/preset-coating/*) ชื่อเดียวกับสินค้าตัวอื่น
 * เว็บหน้ากระจกเขียนรวม ๆ ว่า "เนื้อทราย | กลิสเตอร์ | โฮโลแกรม" — ลายโฮโลแกรมย่อยยึดตามคลังของร้าน
 * (ชุดเดียวกับ Brooch Badge ที่คิดเคลือบพิเศษ +40 เหมือนกัน)
 */
const FILMS_FREE = [
  ["เงา", "gloss"],
  ["ด้าน", "gloss-matte"],
];
const FILMS_SPECIAL = [
  ["กลิตเตอร์", "glitter"],
  ["ทราย", "sand"],
  ["hologram-รุ้ง", "rainbow"],
  ["hologram-ดาว", "star"],
  ["hologram-หิมะ", "snow"],
  ["hologram-หัวใจ", "heart"],
  ["hologram-เหลี่ยม", "facet"],
  ["hologram-จุด", "dot"],
  ["hologram-Dust", "dust"],
  ["hologram-Stardust", "stardust"],
];

/**
 * รูปงานจริงในบล็อกนี้ (id wixstatic — ตรวจแล้วว่าอยู่ในช่วง DOM ของหัวข้อนี้จริง)
 * ⚠️ ได้แค่ 5 รูป — หน้าแก้ไขสินค้าตัดที่ MAX_PHOTOS = 5 ตอนโหลดเข้าฟอร์ม ใส่เกินไว้จะหายเงียบ ๆ
 */
const PHOTOS = [
  ["photo-round-back", "959b83_f5c196f240cc4aed8d62b6efc57702df", "งานจริง — กระจกทรงกลม เห็นด้านลายและด้านกระจก"],
  ["photo-round-set", "959b83_00798da928464d5c90a7d9c95afdff96", "งานจริง — ทรงกลมทั้งเซ็ต ลายเดียวกัน 5 ชิ้น"],
  ["photo-round-big", "959b83_c555ce48c8024b34ac03b30434acb617", "งานจริง — ทรงกลมหน้าใหญ่ ลายเต็มหน้ากระจก"],
  ["photo-keyring", "959b83_992e483cb57d4e91a7d7400f89b96249", "งานจริง — กระจกพวงกุญแจ มีหูจับและโซ่"],
  ["photo-keyring-chain", "959b83_ee4fba11a4bd40429e20048463f4e1d9", "งานจริง — พวงกุญแจ โซ่ลูกปัดสำหรับแขวน"],
];

/* ── 1. ดึงบล็อก "กระจกพกพาทรงกลม / กระจกพวงกุญแจ" จากหน้าเว็บ ──── */

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
 * บล็อกสินค้าหนึ่ง = ตั้งแต่หัวข้อ <h1> ของสินค้านั้น จนถึง <h1> ตัวถัดไป
 * (หน้านี้ Wix วางตารางไว้ใน <div class="wixui-table"> ที่คั่นด้วย <p> ไม่ปิด — ตัดเป็นช่วงตามหัวข้อจึงชัวร์กว่า)
 */
const heads = [...html.matchAll(/<h1[\s\S]{0,4000}?<\/h1>/g)].map((m) => ({ at: m.index, text: strip(m[0]) }));
const hi = heads.findIndex((h) => h.text === SECTION);
if (hi < 0) throw new Error(`หาหัวข้อ "${SECTION}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
const SEC = html.slice(heads[hi].at, heads[hi + 1]?.at ?? html.length);
const SEC_TEXT = strip(SEC.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, ""));

/** ตารางราคาในบล็อกนี้ (หัวคอลัมน์แรก = "จำนวน") */
const tables = [...SEC.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) =>
  [...m[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map((r) => [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1])))
);
const rows = tables.find((t) => t.length > 1 && /จำนวน/.test(t[0][0]));
if (!rows) throw new Error(`ในบล็อก "${SECTION}" ไม่เจอตารางราคา — โครงหน้าเว็บอาจเปลี่ยน`);

/** "1-29 เซ็ต" → { upTo: 29 } · "100 เซ็ตขึ้นไป" → { upTo: null } */
const tiers = rows.slice(1).map((r) => {
  const m = r[0].match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: r[0].replace(/\s+/g, " ").trim() };
});
tiers.at(-1).upTo = null; // ช่วงสุดท้ายเปิดปลายเสมอ
if (tiers.some((t, i) => i < tiers.length - 1 && !t.upTo)) throw new Error("ช่วงจำนวนบนเว็บอ่านไม่ครบ — ตรวจก่อน");

/** คอลัมน์บนเว็บ → ราคาตามช่วงจำนวน */
const priceOf = COLS.map((c) => {
  const ci = rows[0].findIndex((h) => c.web.test(h));
  if (ci < 1) throw new Error(`ตารางราคาไม่มีคอลัมน์ของ "${c.key}" — ตรวจหน้าเว็บก่อน (หัวตาราง: ${rows[0].join(" | ")})`);
  const prices = rows.slice(1).map((r) => {
    const n = Number(String(r[ci]).replace(/[^\d]/g, ""));
    if (!n) throw new Error(`ช่องราคาแถว "${r[0]}" คอลัมน์ "${rows[0][ci]}" อ่านไม่ออก ("${r[ci]}")`);
    return n;
  });
  return { key: c.key, head: rows[0][ci], prices };
});

/** จำนวนชิ้นต่อเซ็ต + ค่าเคลือบพิเศษ — อ่านจากข้อความในบล็อกเดียวกัน ไม่ฮาร์ดโค้ด */
const perSetM = SEC_TEXT.match(/1\s*ชุด\s*จำนวน\s*(\d+)\s*ชิ้น/) || SEC_TEXT.match(/1\s*เซ็ต\s*เท่ากับ\s*(\d+)\s*ชิ้น/);
if (!perSetM) throw new Error('ในบล็อกนี้ไม่เจอข้อความ "1 ชุดจำนวน N ชิ้น" — ตรวจหน้าเว็บก่อน');
const PER_SET = Number(perSetM[1]);
const specialM = SEC_TEXT.match(/เคลือบพิเศษ[^]{0,80}?บวกเพิ่มชุดละ\s*(\d+)\s*บาท/);
if (!specialM) throw new Error('ในบล็อกนี้ไม่เจอข้อความ "เคลือบพิเศษ ... บวกเพิ่มชุดละ N บาท" — ตรวจหน้าเว็บก่อน');
const SPECIAL_FEE = Number(specialM[1]);
if (!/เคลือบเงา\s*\/\s*เคลือบด้าน\s*ฟรี/.test(SEC_TEXT)) throw new Error('ในบล็อกนี้ไม่เจอ "เคลือบเงา / เคลือบด้าน ฟรี!!" — ตรวจหน้าเว็บก่อน');

console.log(`📊 บล็อก "${SECTION}" จากเว็บ · ${tiers.length} ช่วงจำนวน (${tiers.map((t) => t.label).join(" · ")})`);
for (const p of priceOf) console.log(`   ${p.head}: ${p.prices.join(" / ")} บาท/${UNIT}`);
console.log(`   1 ${UNIT} = ${PER_SET} ชิ้น · เคลือบพิเศษ +${SPECIAL_FEE} บาท/${UNIT} · เคลือบเงา/ด้าน ฟรี`);

/** ชื่อแบบสินค้าที่ลูกค้าเห็น (ผูกกับ art ด้วย key เดียวกัน) */
const typeOf = (key) => {
  const t = TYPES.find((x) => x.key === key);
  if (!t) throw new Error(`ไม่รู้จักแบบ "${key}" — mirror-portable-art.mjs กับ apply ต้องใช้ key ชุดเดียวกัน`);
  return t;
};
const PRICING = {
  unit: UNIT,
  driverLabels: [TYPE_LABEL],
  tiers,
  cells: Object.fromEntries(priceOf.map((p) => [typeOf(p.key).name, p.prices])),
};
const allPrices = Object.values(PRICING.cells).flat();

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
const PUB = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products`;
const url = (file) => `${PUB}/mirror-portable/${file}`;
/** ภาพฟิล์มเคลือบ — ใช้ไฟล์คลังกลางของร้านตรง ๆ ไม่อัปสำเนาซ้ำ */
const coatUrl = (file) => `${PUB}/preset-coating/${file}.jpg`;

async function put(name, buf) {
  const file = `${name}.jpg`;
  if (!WRITE) return url(file);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/mirror-portable/${file}`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${file}: ${up.error.message}`);
  return url(file);
}

// รูปงานจริง — ดึงจาก wixstatic แล้วอัปเข้า storage ของเราเอง (เว็บ Wix เปลี่ยนลิงก์เมื่อไหร่ก็ไม่พัง)
const gallery = [];
for (const [file, wixId, label] of PHOTOS) {
  const res = await fetch(`https://static.wixstatic.com/media/${wixId}~mv2.jpg/v1/fill/w_1200,h_1200,al_c,q_88/file.jpg`);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  gallery.push({
    emoji: "🪞",
    gradient: "from-sky-100 to-cyan-200",
    label,
    src: await put(`${file}-${V}`, Buffer.from(await res.arrayBuffer())),
  });
}
console.log(`🖼  รูปงานจริง ${gallery.length} ภาพ (จากบล็อก "${SECTION}" บนเว็บ)`);

// ภาพประจำตัวเลือก — เตรียมไว้แล้วโดย mirror-portable-art.mjs
const local = (f) => readFileSync(`${DIR}/${f}.jpg`);
const ART_FILES = [...TYPES.map((t) => `type-${t.key}`), "coat-normal", "coat-special", "size-compare", "set-of-5"];
const art = {};
for (const f of ART_FILES) art[f] = await put(`${f}-${V}`, local(f));
console.log(`🖼  ภาพประจำตัวเลือก ${ART_FILES.length} ภาพ (${DIR})`);

const { data: row } = await sb.from("products").select("id,data,sort").eq("id", ID).maybeSingle();
if (row && !EXPECT_NAMES.includes(row.data?.name)) throw new Error(`${ID} ชื่อ "${row.data?.name}" ไม่ใช่แถวที่ตั้งใจแก้ — ตรวจก่อน`);
const d = row ? structuredClone(row.data) : {};

d.id = ID;
d.name = NAME;
d.slug = "mirror-portable";
d.category = "apparel"; // Daily Goods — ของใช้ประจำวัน (หมวดเดียวกับ กระจกพับ / Mirror Comb Set)
d.emoji = "🪞";
d.gradient = "from-sky-100 to-cyan-200";
d.unit = UNIT;
d.price = Math.min(...allPrices);
d.rating = 5;
d.sold = d.sold ?? 0;
d.featured = false;
d.badge = "ใหม่";
// สินค้าใหม่ = ฉบับร่างเสมอ ให้ทีมงานตรวจแล้วกดเผยแพร่เองที่ /admin/products
d.hidden = row ? !!d.hidden : true;

d.pricing = PRICING;
d.priceRates = [
  {
    id: "r1",
    label: "ราคาต่อเซ็ต",
    desc: `1 ${UNIT} = ${PER_SET} ชิ้น (1 ${UNIT} ต่อ 1 ลาย) · ยิ่งสั่งหลายเซ็ตยิ่งถูก`,
    // 1 เซ็ต = 1 ลาย → สั่งกี่เซ็ตก็คละได้เท่านั้นลาย (ไม่มีค่าคละเพิ่ม)
    minPerDesign: 1,
    pricing: PRICING,
  },
];

d.options = [
  {
    label: TYPE_LABEL,
    stockBearing: true,
    choices: TYPES.map((t) => ({
      name: t.name,
      imageSrc: art[`type-${t.key}`],
      perUnit: PER_SET, // 1 เซ็ตได้ 5 ชิ้น — ใช้คิดเพดานจำนวนลาย
      ...(t.key === "round58" ? { popular: true } : {}),
    })),
  },
  {
    label: COAT_KIND_LABEL,
    choices: [
      { name: COAT_NORMAL, imageSrc: art["coat-normal"] },
      { name: COAT_SPECIAL, extra: SPECIAL_FEE, imageSrc: art["coat-special"] },
    ],
  },
  {
    label: COAT_LABEL,
    display: "dropdown",
    choices: [...FILMS_FREE, ...FILMS_SPECIAL].map(([name, file]) => ({ name, imageSrc: coatUrl(file) })),
  },
];
// เลือกชนิดเคลือบไหน ก็เห็นเฉพาะผิวฟิล์มของชนิดนั้น (กันเลือกโฮโลแกรมโดยไม่จ่ายค่าเคลือบพิเศษ)
d.rules = [
  { when: { label: COAT_KIND_LABEL, choice: COAT_NORMAL }, limit: { label: COAT_LABEL, allow: FILMS_FREE.map(([n]) => n) } },
  { when: { label: COAT_KIND_LABEL, choice: COAT_SPECIAL }, limit: { label: COAT_LABEL, allow: FILMS_SPECIAL.map(([n]) => n) } },
];

d.images = gallery;
d.imageSrc = gallery[0].src;

const pieceRange = (t, i) => {
  const from = ((i === 0 ? 0 : tiers[i - 1].upTo) + 1) * PER_SET;
  return t.upTo ? `${from}-${t.upTo * PER_SET} ชิ้น` : `${from} ชิ้นขึ้นไป`;
};
const priceLine = (key) => {
  const p = priceOf.find((x) => x.key === key).prices;
  return tiers.map((t, i) => `${t.label} ${p[i]} บาท`).join(" · ");
};

d.description =
  `กระจกพกพาพิมพ์ลายตามสั่ง มีให้เลือก 3 แบบ — กระจกทรงกลม 58 มม., กระจกทรงกลม 75 มม. และกระจกพวงกุญแจ 58 มม. (มีหูจับ + โซ่ลูกปัด) ` +
  `ขายเป็นเซ็ต 1 เซ็ต ${PER_SET} ชิ้น (1 เซ็ตต่อ 1 ลาย) คละลายได้ ` +
  `ฟรี! เคลือบเงาหรือเคลือบด้าน · อยากได้ผิวพิเศษเนื้อทราย กลิตเตอร์ หรือโฮโลแกรม เพิ่มเซ็ตละ ${SPECIAL_FEE} บาท ` +
  `ไม่มีขั้นต่ำในการสั่งผลิต ยิ่งสั่งเยอะยิ่งถูก เริ่มต้นเซ็ตละ ${d.price} บาท`;
d.highlights = [
  `ขายเป็นเซ็ต — 1 เซ็ต ${PER_SET} ชิ้น (1 เซ็ต 1 ลาย) คละลายได้`,
  "3 แบบให้เลือก — ทรงกลม 58 มม. · ทรงกลม 75 มม. · พวงกุญแจ 58 มม. พร้อมภาพตัวอย่างทุกแบบ",
  "ฟรี! เคลือบเงา หรือ เคลือบด้าน",
  `เคลือบพิเศษ เนื้อทราย/กลิตเตอร์/โฮโลแกรม เพิ่มเซ็ตละ ${SPECIAL_FEE} บาท`,
  `ยิ่งสั่งเยอะยิ่งถูก — ${tiers.at(-1).label} เหลือเซ็ตละ ${Math.min(...priceOf.map((p) => p.prices.at(-1)))} บาท`,
  "พิมพ์ระบบ UV / Digital สีคมชัด ไม่ซีดไม่หลุดลอก",
];

d.tabs = [
  {
    title: "รายละเอียดเพิ่มเติม",
    text:
      `กระจกพกพาพิมพ์ลายตามสั่ง — ขายเป็นเซ็ต 1 เซ็ต ${PER_SET} ชิ้น · 1 เซ็ตต่อ 1 ลาย · คละลายได้ ไม่มีขั้นต่ำ\n` +
      `• ${typeOf("round58").name} — ขนาดพกพา ใส่กระเป๋าเสื้อ/กระเป๋าสตางค์ได้\n` +
      `• ${typeOf("round75").name} — หน้ากระจกใหญ่กว่า เห็นลายเต็มตา\n` +
      `• ${typeOf("keyring58").name} — มีหูจับและโซ่ลูกปัด แขวนกระเป๋า/พวงกุญแจได้\n` +
      "• เคลือบเงา / เคลือบด้าน ฟรี — 1 เซ็ตเลือกผิวเคลือบได้ 1 แบบ\n" +
      `• เคลือบพิเศษ (เนื้อทราย · กลิตเตอร์ · โฮโลแกรม) เพิ่มเซ็ตละ ${SPECIAL_FEE} บาท\n` +
      "• พิมพ์ด้วยระบบ UV Printing / Digital Printing · QC ก่อนส่งทุกชิ้น\n\n" +
      "ช่วงราคาต่อเซ็ต::\n" +
      `• ${typeOf("round58").name} — ${priceLine("round58")}\n` +
      `• ${typeOf("round75").name} — ${priceLine("round75")}\n` +
      `• ${typeOf("keyring58").name} — ${priceLine("keyring58")}\n` +
      `• เทียบเป็นจำนวนชิ้น: ${tiers.map((t, i) => `${t.label} = ${pieceRange(t, i)}`).join(" · ")}`,
    images: [art["size-compare"], art["set-of-5"]],
    imageSize: "lg",
  },
  {
    title: "วิธีสั่งงาน",
    text:
      "สั่งผ่านหน้าเว็บนี้ได้เลย::\n" +
      '• เลือกแบบกระจก ชนิดเคลือบ และจำนวนเซ็ต แล้วแนบภาพลาย (JPG/PNG) หรือใส่ลิงก์ไฟล์งานในช่อง "แนบลายของคุณ"\n' +
      "• 1 เซ็ตใช้ได้ 1 ลาย — อยากได้หลายลาย เพิ่มจำนวนเซ็ตตามจำนวนลาย แล้วแนบไฟล์ให้ครบทุกลาย\n" +
      '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ลายไหนกี่เซ็ต · วันที่ต้องการใช้งาน\n' +
      "• สั่งหลายแบบ (ทรงกลม/พวงกุญแจ) ให้เพิ่มลงตะกร้าแยกรายการ\n" +
      "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน แก้แบบได้จนกว่าจะพอใจ\n\n" +
      "หรือสั่งทางอีเมล::\n" +
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com\n" +
      "• หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ\n" +
      "• ระบุรายละเอียด: แบบกระจก · ชนิดเคลือบ · จำนวนเซ็ตและจำนวนลาย · วันที่ใช้งาน (ถ้ามี)",
  },
  {
    title: "การเตรียมไฟล์",
    text:
      "• ไฟล์นามสกุล .Ai .Psd .PNG หรือพื้นหลังใส\n" +
      "• แนบไฟล์งานโดยตรง หรือใส่ลิงก์ Google Drive / Dropbox / OneDrive ที่เปิดการเข้าถึงไฟล์แล้ว\n" +
      "• ภาพที่แนบบนหน้าเว็บใช้เป็นแนวทางให้กราฟิกเท่านั้น — ไฟล์งานพิมพ์คุณภาพเต็มแนบเป็นลิงก์ไฟล์\n" +
      "• ภาพควรมีความละเอียดสูง — ภาพเล็กหรือความละเอียดต่ำ พิมพ์ออกมาอาจแตก/ไม่คมชัด\n" +
      "• ลายเป็นทรงกลม เผื่อขอบตกให้ด้วย — ลายที่มีกรอบ/ขอบ หรือตัวหนังสือชิดขอบ อาจโดนขอบกระจกบัง",
  },
  {
    title: "การรับประกันสินค้า",
    text:
      "รับเคลม::\n" +
      "• สีเพี้ยนเกิน 10-15%\n" +
      "• จำนวนที่ได้รับไม่ครบถ้วน\n" +
      "• แบบ/ขนาด/ชนิดเคลือบ ผิดจากแบบที่ได้รับการยืนยันผลิต\n" +
      "• สินค้าเกิดการแตกหักระหว่างการขนส่ง\n\n" +
      "ไม่รับเคลม::\n" +
      "• ลูกค้าตรวจสอบรายละเอียดงานไม่ครบถ้วน ก่อนการแจ้งยืนยันผลิต\n" +
      "• สินค้าชำรุดจากการใช้งานมาแล้ว\n\n" +
      "ระยะเวลาในการเคลม::\n" +
      "ภายใน 7 วันนับจากวันที่ส่งสินค้า (EMS) หลังจากนั้นไม่รับเคลมทุกกรณี เนื่องจากผ่านช่วงตรวจเช็คแล้ว",
  },
];

d.terms = [
  `ขายเป็นเซ็ต — 1 ${UNIT} เท่ากับ ${PER_SET} ชิ้น และ 1 ${UNIT} ใช้ได้ 1 ลาย (ราคาในตารางคิดต่อเซ็ต)`,
  "1 เซ็ตเลือกชนิดผิวเคลือบได้ 1 แบบ · เคลือบเงา/เคลือบด้าน ฟรี",
  `เคลือบพิเศษ (เนื้อทราย | กลิตเตอร์ | โฮโลแกรม) บวกเพิ่มชุดละ ${SPECIAL_FEE} บาท`,
  "งานไม่สามารถสกรีนเต็มขอบชิ้นงานได้",
  "ทางร้านใช้สี RGB สีงานพิมพ์ที่ได้อาจสว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน ±5% ถึง ±15%",
  "สินค้าเป็นงานวางมือ ตำแหน่งลายแต่ละชิ้นอาจคลาดเคลื่อนเล็กน้อย ไม่มีผลกับการใช้งาน หากคลาดเคลื่อนมากทางร้านเปลี่ยนให้ใหม่",
].join("\n");

d.seo = {
  title: `รับทำ กระจกพกพา พิมพ์ลายตามสั่ง เริ่มต้น ${d.price} บาท/เซ็ต`,
  description:
    `รับทำ/รับผลิต กระจกพกพา ทรงกลม 58 มม. · 75 มม. และกระจกพวงกุญแจ พิมพ์ลายของคุณเอง ` +
    `ขายเป็นเซ็ต 1 เซ็ต ${PER_SET} ชิ้น เริ่มต้น ${d.price} บาท · ฟรีเคลือบเงา/ด้าน · ตรวจแบบก่อนผลิตทุกงาน`,
  keywords: [
    "รับทำกระจกพกพา",
    "กระจกพกพา",
    "กระจกทรงกลม",
    "กระจกพวงกุญแจ",
    "รับสกรีนกระจก",
    "รับพิมพ์กระจก",
    "สกรีนโลโก้บนกระจก",
    "กระจกพกพา 58mm",
    "กระจกพกพา 75mm",
    "ของชำร่วย",
    "ของแจกงานอีเวนต์",
    "พิมพ์ลายตามสั่ง",
  ],
  faqs: [
    {
      q: "กระจกพกพา ราคาเท่าไหร่?",
      a: `ขายเป็นเซ็ต 1 เซ็ต ${PER_SET} ชิ้น — ${typeOf("round58").name} ${priceLine("round58")} · ${typeOf("round75").name} ${priceLine("round75")} · ${typeOf("keyring58").name} ${priceLine("keyring58")}`,
    },
    {
      q: "1 เซ็ตได้กี่ชิ้น และคละลายได้ไหม?",
      a: `1 เซ็ตได้ ${PER_SET} ชิ้น และ 1 เซ็ตใช้ได้ 1 ลาย — อยากได้หลายลาย เพิ่มจำนวนเซ็ตตามจำนวนลาย คละลายได้ไม่มีขั้นต่ำ`,
    },
    {
      q: "มีขนาดและแบบอะไรให้เลือกบ้าง?",
      a: `มี 3 แบบ — ${TYPES.map((t) => t.name).join(" · ")} โดยแบบพวงกุญแจมีหูจับและโซ่ลูกปัดสำหรับแขวน`,
    },
    {
      q: "เคลือบผิวมีแบบไหนบ้าง คิดเงินเพิ่มไหม?",
      a: `เคลือบเงาและเคลือบด้าน ฟรี · ผิวพิเศษ เนื้อทราย กลิตเตอร์ และโฮโลแกรม (มีหลายลาย) เพิ่มเซ็ตละ ${SPECIAL_FEE} บาท เลือกได้ 1 แบบต่อ 1 เซ็ต`,
    },
    {
      q: "สั่งแล้วกี่วันได้ของ?",
      a: "หลังยืนยันการชำระเงินและอนุมัติแบบ ทีมงานจะเริ่มผลิตและจัดส่งทั่วไทย ติดตามสถานะได้จากลิงก์ออเดอร์ตลอดเวลา",
    },
  ],
};

/**
 * ฟิลด์ที่ปกติ /api/admin/products เขียนให้ตอนกดบันทึกในหน้าแก้ไข — สคริปต์เขียน DB ตรงจึงต้องทำเอง
 */
d.quoteOption = d.options.some((o) => o.askPrice || o.choices.some((c) => c.askPrice)) || undefined;
d.priceMin = Math.min(...allPrices);
d.priceMax = Math.max(...allPrices) + SPECIAL_FEE;
d.savedAt = new Date().toISOString();

console.log(`\n📦 ${d.name} (${ID}) · หมวด ${d.category} · slug ${d.slug} · ${row ? "แก้แถวเดิม" : "สร้างแถวใหม่"}`);
console.log(`   ราคา ฿${d.priceMin}-${d.priceMax}/${UNIT} · ตัวเลือก ${d.options.map((o) => `${o.label} ${o.choices.length} แบบ`).join(" · ")}`);
console.log(`   แกลเลอรี ${d.images.length} ภาพ · ภาพประจำตัวเลือก ${d.options.flatMap((o) => o.choices).filter((c) => c.imageSrc).length}/${d.options.flatMap((o) => o.choices).length} ตัว`);
console.log(`   แท็บ: ${d.tabs.map((t) => t.title).join(" · ")} · สถานะ: ${d.hidden ? "ฉบับร่าง" : "เผยแพร่"}`);
if (!WRITE) {
  console.log("\n(ยังไม่อัปไฟล์ ไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

// คอลัมน์กระจกของตาราง products (name/category/price/badge) ต้องอัปพร้อมกัน — หน้าอื่นอ่านจากคอลัมน์นี้
const save = await sb
  .from("products")
  .upsert({ id: ID, data: d, name: d.name, category: d.category, price: d.price, badge: d.badge, featured: false, sold: d.sold });
if (save.error) throw new Error(`บันทึกไม่สำเร็จ — ${save.error.message}`);
console.log(`\n✅ อัปภาพ + บันทึกแล้ว — ${d.hidden ? "ยังเป็นฉบับร่าง กดเผยแพร่ที่ /admin/products" : "เผยแพร่อยู่"}`);
