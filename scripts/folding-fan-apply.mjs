#!/usr/bin/env node
/**
 * "FOLDING FAN" (folding-fan) — ดึงราคาจากเว็บตารางราคา + อัปภาพ + เขียนสินค้า
 *
 *   node scripts/folding-fan-art.mjs          # เตรียมภาพประจำตัวเลือกก่อน (.cache/folding-fan/upload)
 *   node scripts/folding-fan-apply.mjs                # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/folding-fan-apply.mjs --write
 *   node scripts/folding-fan-apply.mjs --write --reset-tabs   # เขียนแท็บชุดกลางทับของเดิมด้วย
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/magnetbookmark
 *   หน้านั้นมี 5 บล็อกสินค้า (Magnet Bookmark · Cup Sleeve · พัดพลาสติกใส · พัดกระดาษไดคัท · พัดพับ)
 *   จึงยึด "หัวข้อ" ไม่ใช่ลำดับตาราง · สคริปต์อ่านสดทุกครั้ง ราคาบนเว็บเปลี่ยนเมื่อไหร่รันซ้ำได้เลย
 *
 * บล็อกนี้มี 2 ตาราง — ตัวพัด กับ "ADD-ON! ถุงเก็บพัด" แยกกัน
 *   ระบบตัวเลือกคิด +฿ เป็นค่าคงที่ต่อชิ้นเท่านั้น แต่ค่าถุงลดตามจำนวนเหมือนตัวพัด
 *   จึงทำถุงเป็น "แกนของตารางราคา" (2 คอลัมน์: ไม่เอาถุง / เอาถุง) แล้วบวกราคาถุงเข้าไปในเซลล์
 *   ช่วงจำนวนของสองตารางไม่เท่ากัน (พัด 10 ช่วง · ถุง 4 ช่วง) — ดึงราคาถุงจาก "ช่วงที่ครอบช่วงนั้น"
 *   ไม่มีการเกลี่ย/เดาตัวเลขใหม่
 *
 * ⚠️ ตารางถุงบนเว็บช่องสุดท้ายเขียนว่า "50 ชิ้น" (ไม่ใช่ "50 ชิ้นขึ้นไป") — ถือเป็นช่วงเปิดปลาย
 *    แบบเดียวกับทุกตารางในหน้านั้น สั่งมากกว่า 50 ก็คิดใบละเท่าเดิม
 *
 * ⚠️ สคริปต์เขียนแบบ upsert — แถว folding-fan มีอยู่แล้ว (นำเข้าจากเว็บเดิม ยังไม่มีตัวเลือก/รูป)
 *    สคริปต์เช็คชื่อเดิมก่อนทับ · ห้ามเปลี่ยน ID เป็นชื่อสุ่มแบบปุ่ม "+ เพิ่มสินค้า" — id ใช้เป็นลิงก์หน้าสินค้า
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้ลงท้าย -v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SPEC, WIX, ART_FILES, buildArt } from "./folding-fan-art.mjs";

const WRITE = process.argv.includes("--write");
/** เขียนแท็บชุดกลาง (วิธีสั่งงาน/การเตรียมไฟล์/การรับประกัน) ทับของเดิม — ปกติไม่แตะ กันงานที่ทีมงานแก้เองหาย */
const RESET_TABS = process.argv.includes("--reset-tabs");
/** ข้ามการวาดการ์ดใหม่ (ใช้ของที่อยู่ใน .cache แล้ว) */
const SKIP_ART = process.argv.includes("--skip-art");
const ID = "folding-fan";
const DIR = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1] || ".cache/folding-fan/upload";
const PAGE = "https://www.iduckyofficial-pricelists.com/magnetbookmark";
const SECTION = "FOLDING FAN";
const NAME = "FOLDING FAN (พัดพับ)";
const V = "v1";

/** ชื่อเดิมที่ยอมให้ทับได้ — กันเผลอรันทับสินค้าตัวอื่นถ้า id ถูกใช้ซ้ำวันหลัง */
const EXPECT_NAMES = ["FOLDING FAN", NAME];

const BAG_LABEL = "ถุงเก็บพัด (Add-on)";
const BAG_NO = "รับเฉพาะพัดพับ";
const BAG_YES = "เพิ่มถุงเก็บพัด";
const UNIT = "ชิ้น";

/**
 * รูปงานจริงในบล็อก FOLDING FAN ของหน้าเว็บ
 * ⚠️ ได้แค่ 5 รูป — หน้าแก้ไขสินค้าตัดที่ MAX_PHOTOS = 5 ตอนโหลดเข้าฟอร์ม ใส่เกินไว้จะหายเงียบ ๆ
 * ภาพประจำตัวเลือกไม่นับรวมตรงนี้ (หน้าร้านดึงขึ้นแกลเลอรีให้เองตอนลูกค้ากดเลือก)
 */
const PHOTOS = [
  ["photo-hand", WIX.fanHand, "งานจริง — กางเต็มใบ พร้อมกล่องเก็บ"],
  ["photo-box", WIX.fanBox, "งานจริง — กล่องเก็บพัด สกรีนได้ 2 ด้าน"],
  ["photo-pair", WIX.fanPair, "งานจริง — พัดพับพร้อมกล่อง"],
  ["photo-flat", WIX.fanFlat, "งานจริง — ตัวพัดกางวางแบน"],
  ["photo-bag", WIX.bagHand, "งานจริง — ถุงเก็บพัด (Add-on)"],
];

/* ── 1. ดึงบล็อก "FOLDING FAN" จากหน้าเว็บ ────────────────────────── */

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
 * ⚠️ บางช่องของตารางบนเว็บมีอักขระควบคุมแทรกกลางคำไทย (เจอ NUL ใน "50-99 ชิ้\0น")
 *    เทอร์มินัลแสดงเป็นช่องว่าง แต่ \s ไม่ match — ต้องตัดทิ้งก่อน ไม่งั้น label ที่ลูกค้าเห็นจะคำแตก
 */
const strip = (s) =>
  decode(String(s).replace(/<[^>]+>/g, " "))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

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
// บล็อกนี้เป็นบล็อกสุดท้ายของหน้า — จบที่หัวข้อข้อจำกัดรวมท้ายหน้า
const endRel = ALL.slice(start + 1).findIndex((b) => b.text && /ข้อจำกัดในการผลิตและเคลือบลามิเนต/.test(b.text));
const SEC = ALL.slice(start, endRel < 0 ? ALL.length : start + 1 + endRel);
const SEC_TEXT = SEC.filter((b) => b.text).map((b) => b.text);

/** "1-10 ชิ้น" → { upTo: 10 } · "10,000 ชิ้นขึ้นไป" → { upTo: null } */
const tierOf = (label) => {
  const m = label.replace(/,/g, "").match(/(\d+)\s*[-–]\s*(\d+)/);
  return { upTo: m ? Number(m[2]) : null, label: label.replace(/\s+/g, " ").trim() };
};

/** อ่านตารางราคา 2 คอลัมน์ (จำนวน × ราคา) ให้เป็น tiers + ราคา */
function readTable(rows, what) {
  if (rows[0].length !== 2) throw new Error(`ตาราง${what} มี ${rows[0].length} คอลัมน์ (คาดว่า 2: จำนวน/ราคา) — ตรวจหน้าเว็บก่อน`);
  const t = rows.slice(1).map((r) => tierOf(r[0]));
  t.at(-1).upTo = null; // ช่วงสุดท้ายเปิดปลายเสมอ
  if (t.some((x, i) => i < t.length - 1 && !x.upTo)) throw new Error(`ช่วงจำนวนของตาราง${what}อ่านไม่ครบ — ตรวจก่อน`);
  const p = rows.slice(1).map((r) => {
    const n = Number(String(r[1]).replace(/[^\d]/g, ""));
    if (!n) throw new Error(`ช่องราคาแถว "${r[0]}" ของตาราง${what}อ่านไม่ออก ("${r[1]}")`);
    return n;
  });
  return { tiers: t, prices: p };
}

/** บล็อกนี้มี 2 ตาราง — ตัวพัดอยู่ก่อนหัวข้อ ADD-ON · ถุงอยู่หลัง */
const addOnAt = SEC.findIndex((b) => b.text && /^ADD-ON/i.test(b.text));
if (addOnAt < 0) throw new Error(`ในบล็อก "${SECTION}" ไม่เจอหัวข้อ "ADD-ON!" — โครงหน้าเว็บอาจเปลี่ยน`);
const fanTable = SEC.slice(0, addOnAt).find((b) => b.table && /จำนวน/.test(b.table[0][0] ?? ""));
const bagTable = SEC.slice(addOnAt).find((b) => b.table && /จำนวน/.test(b.table[0][0] ?? ""));
if (!fanTable) throw new Error(`ในบล็อก "${SECTION}" ไม่เจอตารางราคาตัวพัด — โครงหน้าเว็บอาจเปลี่ยน`);
if (!bagTable) throw new Error(`ในบล็อก "${SECTION}" ไม่เจอตารางราคาถุงเก็บพัด (ADD-ON) — โครงหน้าเว็บอาจเปลี่ยน`);

const FAN = readTable(fanTable.table, "ราคาตัวพัด");
const BAG = readTable(bagTable.table, "ราคาถุงเก็บพัด");

/**
 * ช่องสุดท้ายของตารางถุงบนเว็บเขียนว่า "50 ชิ้น" เฉย ๆ แต่เราคิดราคาเป็นช่วงเปิดปลาย
 * (สั่ง 100 ชิ้นก็ใบละเท่าเดิม) — ข้อความที่ลูกค้าอ่านต้องตรงกับที่คิดเงินจริง
 */
const bagLabel = (i) =>
  i === BAG.tiers.length - 1 && !/ขึ้นไป/.test(BAG.tiers[i].label)
    ? `${BAG.tiers[i].label}ขึ้นไป`
    : BAG.tiers[i].label;
const bagLine = (join) => BAG.tiers.map((_, i) => `${bagLabel(i)} ใบละ ${BAG.prices[i]} บาท`).join(join);

/** ราคาถุงของช่วงพัดแต่ละช่วง = ราคาของ "ช่วงถุงที่ครอบมันอยู่" */
const bagAt = FAN.tiers.map((t) => {
  const i = BAG.tiers.findIndex((b) => b.upTo === null || (t.upTo !== null && t.upTo <= b.upTo));
  if (i < 0) throw new Error(`ช่วง "${t.label}" หาราคาถุงที่ครอบไม่เจอ — ตรวจตารางถุงบนเว็บก่อน`);
  return BAG.prices[i];
});

/** สเปกจากบรรทัด "รายละเอียดเพิ่มเติม" ของบล็อกนี้ — อ่านไม่เจอ = หยุด ไม่เดาเอง */
function spec(re, what) {
  const line = SEC_TEXT.find((t) => re.test(t));
  if (!line) throw new Error(`ในบล็อก "${SECTION}" ไม่เจอบรรทัด${what} — โครงหน้าเว็บอาจเปลี่ยน`);
  return re.exec(line).slice(1);
}
const [FAN_SIDES, FAN_W, FAN_H] = spec(/พัดสกรีน\s*(\d+)\s*ด้าน\s*ขนาด\s*([\d.]+)\s*x\s*([\d.]+)\s*cm/i, "ขนาดตัวพัด");
const [BOX_SIDES, BOX_W, BOX_H] = spec(/กล่องเก็บพัดสกรีน\s*(\d+)\s*ด้าน\s*ขนาด\s*([\d.]+)\s*x\s*([\d.]+)\s*cm/i, "ขนาดกล่องเก็บพัด");
const [BAG_W, BAG_H] = spec(/ถุงเก็บพัด\s*ขนาด\s*([\d.]+)\s*x\s*([\d.]+)\s*cm/i, "ขนาดถุงเก็บพัด");

/** ทวนกับตัวเลขที่ใช้วาดการ์ด — ไม่ตรงเมื่อไหร่แปลว่าเว็บแก้สเปกแล้ว การ์ดจะบอกลูกค้าผิด */
const sameSpec = (got, want, what) => {
  if (got.map(Number).join("×") !== want.join("×"))
    throw new Error(`${what}บนเว็บเป็น ${got.join("×")} แต่การ์ดในโฟลเดอร์ภาพวาดไว้ ${want.join("×")} — แก้ SPEC ใน folding-fan-art.mjs แล้ววาดใหม่ก่อน`);
};
sameSpec([FAN_W, FAN_H], SPEC.fan.cm, "ขนาดตัวพัด");
sameSpec([BOX_W, BOX_H], SPEC.box.cm, "ขนาดกล่องเก็บพัด");
sameSpec([BAG_W, BAG_H], SPEC.bag.cm, "ขนาดถุงเก็บพัด");
sameSpec([FAN_SIDES], [SPEC.fan.sides], "จำนวนด้านที่สกรีนบนตัวพัด");
sameSpec([BOX_SIDES], [SPEC.box.sides], "จำนวนด้านที่สกรีนบนกล่อง");

const HAS_SPRING = SEC_TEXT.some((t) => /มีสปริง.*พับเก็บลงกล่อง/.test(t));
const BAG_STRING = SEC_TEXT.some((t) => /ห้อยเชือกสีขาว/.test(t));
const BAG_RING = SEC_TEXT.some((t) => /ห่วงกลมสีเงิน\s*1\s*อัน/.test(t));
if (!HAS_SPRING || !BAG_STRING || !BAG_RING)
  throw new Error(`ในบล็อก "${SECTION}" อ่านรายละเอียดสปริง/เชือก/ห่วงไม่ครบ — ตรวจหน้าเว็บก่อน`);

console.log(`📋 ตารางราคาจากเว็บ (${SECTION})`);
console.log(`   ${"ช่วงจำนวน".padEnd(22)}${"เฉพาะพัด".padStart(12)}${"+ ถุงเก็บพัด".padStart(16)}`);
FAN.tiers.forEach((t, i) =>
  console.log(`   ${t.label.padEnd(22)}${`฿${FAN.prices[i]}`.padStart(12)}${`฿${FAN.prices[i] + bagAt[i]} (ถุง ฿${bagAt[i]})`.padStart(20)}`)
);
console.log(`   ตัวพัด ${FAN_W}×${FAN_H} ซม. สกรีน ${FAN_SIDES} ด้าน · กล่อง ${BOX_W}×${BOX_H} ซม. สกรีน ${BOX_SIDES} ด้าน · ถุง ${BAG_W}×${BAG_H} ซม.`);

/** ตารางราคา: คอลัมน์ = เอาถุงหรือไม่ · ช่วง = บันไดของตัวพัด (หน่วยเป็น "ชิ้น") */
const PRICING = {
  unit: UNIT,
  driverLabels: [BAG_LABEL],
  tiers: FAN.tiers,
  cells: {
    [BAG_NO]: FAN.prices,
    [BAG_YES]: FAN.prices.map((n, i) => n + bagAt[i]),
  },
};

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

// ภาพประจำตัวเลือก — วาดใหม่ทุกครั้ง โดยส่งราคาถุงที่เพิ่งอ่านจากเว็บเข้าไปด้วย
if (!SKIP_ART) await buildArt({ bagLow: Math.min(...BAG.prices), bagHigh: Math.max(...BAG.prices) });
const local = (f) => readFileSync(`${DIR}/${f}.jpg`);
const art = {};
for (const f of ART_FILES) art[f] = await put(`${f}-${V}`, local(f));
console.log(`\n🖼  ภาพประจำตัวเลือก/การ์ดสเปก ${ART_FILES.length} ภาพ (${DIR})`);

// รูปงานจริง — ดึงจาก wixstatic แล้วอัปเข้า storage ของเราเอง (เว็บ Wix เปลี่ยนลิงก์เมื่อไหร่ก็ไม่พัง)
const gallery = [];
for (const [file, wixId, label] of PHOTOS) {
  const res = await fetch(`https://static.wixstatic.com/media/${wixId}~mv2.png/v1/fit/w_1600,h_1600/x.jpg`);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  gallery.push({
    emoji: "🪭",
    gradient: "from-sky-100 to-blue-200",
    label,
    src: await put(`${file}-${V}`, Buffer.from(await res.arrayBuffer())),
  });
}
console.log(`🖼  รูปงานจริง ${gallery.length} ภาพ (จากบล็อก "${SECTION}" บนเว็บ)`);

const { data: row, error } = await sb.from("products").select("id,sort,data").eq("id", ID).maybeSingle();
if (error) throw new Error(`อ่านสินค้า ${ID} ไม่ได้ — ${error.message}`);
if (row && !EXPECT_NAMES.includes(row.data?.name))
  throw new Error(`${ID} ชื่อ "${row.data?.name}" ไม่ใช่แถวที่ตั้งใจแก้ — ตรวจก่อน`);
console.log(row ? `\n✏️  เติมของลงแถวเดิม ${ID}` : `\n🆕 ยังไม่มีแถว ${ID} — สร้างสินค้าใหม่ให้`);
/** ไม่มีแถวเดิม = ขึ้นของใหม่ทั้งชุด · สินค้าใหม่เริ่มเป็น "ฉบับร่าง" เสมอ (กดเผยแพร่เองที่ /admin/products) */
const d = structuredClone(row?.data ?? { id: ID, sold: 0, featured: false, hidden: true, body: [] });
d.id = ID;

d.name = NAME;
d.slug = ID;
d.category = row?.data?.category ?? "card-photo";
d.emoji = "🪭";
d.gradient = "from-sky-100 to-blue-200";
d.price = FAN.prices[0]; // ราคาตั้งต้น = ช่วงแรกของตาราง (สั่งน้อยจ่ายเท่านี้)
d.badge = "ใหม่";
d.rating = 5;
d.pricing = PRICING;
d.images = gallery;
d.imageSrc = gallery[0].src;
d.artworkRequired = true;

const FAN_MAX = Math.max(...FAN.prices);
const FAN_MIN = Math.min(...FAN.prices);
const BAG_MAX = Math.max(...BAG.prices);
const BAG_MIN = Math.min(...BAG.prices);

d.description =
  `พัดพับ (Folding Fan) พิมพ์ลายตามสั่ง ตัวพัดกางออกเป็นวงกลม ${FAN_W} × ${FAN_H} ซม. สกรีนลาย ${FAN_SIDES} ด้าน ` +
  `มีสปริงในตัว พับเก็บลงกล่องได้ — มาพร้อมกล่องเก็บพัดขนาด ${BOX_W} × ${BOX_H} ซม. ที่สกรีนลายได้ ${BOX_SIDES} ด้าน (รวมในราคาแล้ว) ` +
  `เริ่มต้นชิ้นละ ${FAN_MAX} บาท สั่งเยอะเหลือชิ้นละ ${FAN_MIN} บาท ` +
  `สั่งถุงเก็บพัดขนาด ${BAG_W} × ${BAG_H} ซม. เพิ่มได้ (ถุงผ้าห้อยเชือกสีขาว + ห่วงกลมสีเงิน) ไม่มีขั้นต่ำในการสั่งผลิต`;

d.highlights = [
  `ชิ้นละ ${FAN_MAX} บาท — สั่งเยอะเหลือชิ้นละ ${FAN_MIN} บาท ไม่มีขั้นต่ำ`,
  `ตัวพัด ${FAN_W} × ${FAN_H} ซม. สกรีนลาย ${FAN_SIDES} ด้าน · มีสปริง กางเองเมื่อปล่อยจากกล่อง`,
  `แถมกล่องเก็บพัด ${BOX_W} × ${BOX_H} ซม. สกรีนลายได้ ${BOX_SIDES} ด้าน — รวมในราคาแล้ว`,
  `เพิ่มถุงเก็บพัด ${BAG_W} × ${BAG_H} ซม. ได้ ใบละ ${BAG_MAX} บาท (สั่งเยอะเหลือใบละ ${BAG_MIN} บาท)`,
  "ถุงผ้าห้อยเชือกสีขาว + ห่วงกลมสีเงิน 1 อัน — ห้อยกระเป๋า/เป้ได้",
];

d.options = [
  {
    // แกนของตารางราคา — ค่าถุงรวมอยู่ในเซลล์ราคาแล้ว ไม่ต้องตั้ง +฿ รายตัว
    label: BAG_LABEL,
    note: `ถุง 1 ใบต่อพัด 1 อัน — ราคาถุงลดตามจำนวนเหมือนตัวพัด (ใบละ ${BAG_MAX}-${BAG_MIN} บาท)`,
    choices: [
      { name: BAG_NO, popular: true, imageSrc: art["bag-none"] },
      { name: BAG_YES, imageSrc: art["bag-add"] },
    ],
  },
];

d.terms = [
  `ตัวพัดขนาด ${FAN_W} × ${FAN_H} ซม. (กางออกเป็นวงกลม) สกรีนลาย ${FAN_SIDES} ด้าน — อีกด้านเป็นสีพื้นของวัสดุ`,
  `กล่องเก็บพัดขนาด ${BOX_W} × ${BOX_H} ซม. สกรีนลายได้ ${BOX_SIDES} ด้าน มาพร้อมพัดทุกอัน ไม่คิดเงินเพิ่ม`,
  "ตัวพัดมีสปริง พับเก็บลงกล่องได้ กางออกเองเมื่อปล่อยจากกล่อง",
  `ถุงเก็บพัดเป็นตัวเลือกเสริม (Add-on) ขนาด ${BAG_W} × ${BAG_H} ซม. — ห้อยเชือกสีขาวติดกับถุงผ้า มีห่วงกลมสีเงิน 1 อัน`,
  `ราคาถุงคิดต่อใบตามจำนวนที่สั่ง — ${bagLine(" · ")}`,
  "เลือก “เพิ่มถุงเก็บพัด” แล้ว ราคาต่อชิ้นในตารางจะรวมค่าถุงให้เรียบร้อย (ถุง 1 ใบต่อพัด 1 อัน)",
  "ทางร้านใช้สีระบบ RGB สีงานสกรีนที่ได้อาจสว่างกว่าหรือดรอปลงตามไฟล์งาน ±5% ถึง ±15%",
  "งานสกรีนอาจมีความคลาดเคลื่อนของตำแหน่งลายเล็กน้อยตามข้อจำกัดของเครื่อง",
].join("\n");

/**
 * แท็บข้อมูล — 3 แท็บท้าย (วิธีสั่งงาน / การเตรียมไฟล์ / การรับประกัน) ใช้ของเดิมที่ทีมงานมีอยู่แล้ว
 * ไม่มี = ใช้ชุดกลางของร้าน ปรับข้อความให้ตรงกับพัดพับ
 */
const STD_TABS = [
  {
    title: "วิธีสั่งงาน",
    text: [
      "สั่งผ่านหน้าเว็บนี้ได้เลย::",
      "• เลือกว่าจะเอาถุงเก็บพัดด้วยหรือไม่ → ใส่จำนวนที่ต้องการ",
      '• แนบภาพลาย หรือใส่ลิงก์ไฟล์งาน/อีเมลในช่อง "แนบลายของคุณ"',
      '• ระบุรายละเอียดเพิ่มเติมในช่อง "หมายเหตุถึงร้าน" เช่น ลายของตัวพัด/กล่อง/ถุง · วันที่ต้องการใช้งาน',
      "• กดเพิ่มลงตะกร้า → ชำระเงิน — ทางร้านจะส่งแบบให้ตรวจก่อนผลิตทุกงาน",
      "",
      "หรือสั่งทางอีเมล::",
      "• ส่งอีเมลมาที่ iduckyshop03@gmail.com · หัวข้ออีเมล: ชื่อ LINE ลูกค้า และเบอร์โทรติดต่อ",
      "• ระบุรายละเอียด: จำนวนพัด · เอาถุงเก็บพัดด้วยหรือไม่ · วันที่ใช้งาน (ถ้ามี)",
    ].join("\n"),
  },
  {
    title: "การเตรียมไฟล์",
    text: [
      "• ไฟล์นามสกุล .Ai .Psd .PNG พื้นหลังใส ความละเอียดสูง",
      `• ตัวพัดเป็นวงกลม ${FAN_W} × ${FAN_H} ซม. — วางลายให้เต็มวง เผื่อขอบไว้ ไม่ควรวางข้อความสำคัญชิดขอบ`,
      `• กล่องเก็บพัด ${BOX_W} × ${BOX_H} ซม. แยกลายด้านหน้า-ด้านหลังมาให้ชัด`,
      `• ถุงเก็บพัด ${BAG_W} × ${BAG_H} ซม. (ถ้าสั่งเพิ่ม) แนบลายมาอีกไฟล์`,
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
    title: "รายละเอียดสินค้า",
    text: [
      "::ตัวพัด::",
      `• ขนาด ${FAN_W} × ${FAN_H} ซม. กางออกเป็นวงกลม`,
      `• สกรีนลาย ${FAN_SIDES} ด้าน`,
      "• มีสปริงในตัว พับเก็บลงกล่องได้ กางออกเองเมื่อปล่อยจากกล่อง",
      "::กล่องเก็บพัด (รวมในราคาแล้ว)::",
      `• ขนาด ${BOX_W} × ${BOX_H} ซม.`,
      `• สกรีนลายได้ ${BOX_SIDES} ด้าน`,
      "::ถุงเก็บพัด (Add-on — สั่งเพิ่มได้)::",
      `• ขนาด ${BAG_W} × ${BAG_H} ซม.`,
      "• ห้อยเชือกสีขาวติดกับถุงผ้า · มีห่วงกลมสีเงิน 1 อัน",
      `• ${bagLine("\n• ")}`,
      "::ราคาตัวพัด::",
      `• ${FAN.tiers.map((t, i) => `${t.label} ชิ้นละ ${FAN.prices[i]} บาท`).join("\n• ")}`,
      "• ไม่มีขั้นต่ำในการสั่งผลิต",
    ].join("\n"),
    images: [art["spec-fan"], art["spec-box"], art["spec-bag"], art["spring-fold"]],
    imagePos: "bottom",
    imageSize: "md",
  },
  {
    title: "ข้อควรทราบ",
    text: [
      `• ตัวพัดสกรีนลาย ${FAN_SIDES} ด้าน — อีกด้านเป็นสีพื้นของวัสดุ`,
      `• กล่องเก็บพัดสกรีนได้ ${BOX_SIDES} ด้าน มาพร้อมพัดทุกอัน ไม่คิดเงินเพิ่ม`,
      "• ถุงเก็บพัดเป็นตัวเลือกเสริม — เลือกในหน้าสินค้าแล้วราคาต่อชิ้นจะรวมค่าถุงให้เลย (ถุง 1 ใบต่อพัด 1 อัน)",
      "• ราคาถุงลดตามจำนวนเหมือนตัวพัด",
      "• ทางร้านใช้สี RGB สีที่ได้อาจสว่างกว่าหรือดรอปลงจากไฟล์ ±5% ถึง ±15%",
      "• งานสกรีนอาจมีความคลาดเคลื่อนของตำแหน่งลายเล็กน้อยตามข้อจำกัดของเครื่อง",
    ].join("\n"),
  },
  ...keepTabs,
];

d.seo = {
  title: "รับทำพัดพับ Folding Fan พิมพ์ลายตามสั่ง พร้อมกล่องเก็บพัด",
  description:
    `รับผลิตพัดพับ (Folding Fan) สกรีนลายตามสั่ง ตัวพัด ${FAN_W} × ${FAN_H} ซม. มีสปริงพับเก็บลงกล่องได้ ` +
    `พร้อมกล่องเก็บพัด ${BOX_W} × ${BOX_H} ซม. สกรีนได้ ${BOX_SIDES} ด้าน เริ่มต้นชิ้นละ ${FAN_MAX} บาท ` +
    `สั่งเยอะเหลือชิ้นละ ${FAN_MIN} บาท เพิ่มถุงเก็บพัด ${BAG_W} × ${BAG_H} ซม. ได้ ไม่มีขั้นต่ำ`,
  keywords: [
    "พัดพับ",
    "folding fan",
    "รับทำพัดพับ",
    "พัดพับสกรีนลาย",
    "พัดพับพร้อมกล่อง",
    "พัดแฟนคลับ",
    "ถุงเก็บพัด",
  ],
  faqs: [
    {
      q: "พัดพับราคาเท่าไหร่?",
      a: `คิดต่อชิ้น — ${FAN.tiers.map((t, i) => `${t.label} ชิ้นละ ${FAN.prices[i]} บาท`).join(" · ")}`,
    },
    {
      q: "ได้กล่องเก็บพัดด้วยไหม?",
      a: `ได้ — กล่องเก็บพัดขนาด ${BOX_W} × ${BOX_H} ซม. สกรีนลายได้ ${BOX_SIDES} ด้าน มาพร้อมพัดทุกอัน รวมอยู่ในราคาแล้ว ไม่คิดเงินเพิ่ม`,
    },
    {
      q: "ถุงเก็บพัดคิดเงินยังไง?",
      a: `เป็นตัวเลือกเสริม ขนาด ${BAG_W} × ${BAG_H} ซม. คิดต่อใบ — ${bagLine(" · ")} เลือกในหน้าสินค้าแล้วราคาต่อชิ้นจะรวมค่าถุงให้เลย`,
    },
    {
      q: "ตัวพัดขนาดเท่าไหร่ สกรีนได้กี่ด้าน?",
      a: `ตัวพัดกางออกเป็นวงกลม ${FAN_W} × ${FAN_H} ซม. สกรีนลาย ${FAN_SIDES} ด้าน — อีกด้านเป็นสีพื้นของวัสดุ ส่วนกล่องเก็บพัดสกรีนได้ ${BOX_SIDES} ด้าน`,
    },
    { q: "มีขั้นต่ำในการสั่งไหม?", a: "ไม่มีขั้นต่ำ สั่ง 1 ชิ้นก็ทำได้ — สั่งจำนวนมากราคาต่อชิ้นลดลงตามตาราง" },
  ],
};

/**
 * ฟิลด์ที่ปกติ /api/admin/products เขียนให้ตอนกดบันทึกในหน้าแก้ไข — สคริปต์เขียน DB ตรงจึงต้องทำเอง
 * hidden : คงสถานะฉบับร่างไว้ ให้ทีมงานกดเผยแพร่เองที่ /admin/products
 */
d.quoteOption = d.options.some((o) => o.askPrice || o.choices.some((c) => c.askPrice)) || undefined;
const allCells = Object.values(PRICING.cells).flat();
d.priceMin = Math.min(...allCells);
d.priceMax = Math.max(...allCells);
d.savedAt = new Date().toISOString();

const choices = d.options.flatMap((o) => o.choices);
console.log(`\n📦 ${d.name} (${ID}) · หมวด ${d.category} · slug ${d.slug}`);
console.log(`   ราคา ฿${d.priceMin}-${d.priceMax}/${UNIT} · ตัวเลือก ${d.options.map((o) => `${o.label} ${o.choices.length} แบบ`).join(" · ")}`);
console.log(`   แกลเลอรี ${d.images.length} ภาพ · ภาพประจำตัวเลือก ${choices.filter((c) => c.imageSrc).length}/${choices.length} ตัว · การ์ดในแท็บ 4 ภาพ`);
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
    // แถวเดิมไม่แตะลำดับที่ทีมงานจัดไว้
    ...(row ? {} : { sort: 444 }),
    data: d,
  },
  { onConflict: "id" }
);
if (save.error) throw new Error(`บันทึกไม่สำเร็จ — ${save.error.message}`);
console.log("\n✅ อัปภาพ + บันทึกแล้ว — ยังเป็นฉบับร่าง กดเผยแพร่ที่ /admin/products");
