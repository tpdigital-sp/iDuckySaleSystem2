#!/usr/bin/env node
/**
 * "ปลอกหมอนอิง" (pillowcases-5) — ดึงราคาจากเว็บตารางราคา + อัปภาพประกอบขึ้น storage
 *
 *   node scripts/pillowcase-cushion-art.mjs        # วาดภาพตัวเลือกก่อน (.cache/pillowcase-cushion)
 *   node scripts/pillowcase-cushion-apply.mjs      # ดูก่อน (ไม่อัป ไม่เขียน)
 *   node scripts/pillowcase-cushion-apply.mjs --write
 *
 * ที่มาของราคา: https://www.iduckyofficial-pricelists.com/pillowcases → ตารางหัวข้อ "ปลอกหมอนอิง"
 * (หน้านั้นมี 6 ตาราง · ตาราง "หมอนอิงยัดใย" หัวคอลัมน์เหมือนกันเป๊ะ จึงต้องยึดหัวข้อที่อยู่เหนือตาราง)
 * สคริปต์อ่านตารางสดทุกครั้ง ราคาบนเว็บเปลี่ยนเมื่อไหร่รันซ้ำได้เลย
 *
 * ภาพ 3 ชุดที่อัปให้:
 *   photo-1..5   รูปงานจริงจากหน้าเว็บตารางราคา (ท่อน "ปลอกหมอนอิง") → แกลเลอรีสินค้า
 *   size-12..24  ภาพประจำตัวเลือก "ขนาด" — วาดเทียบสเกลจริง ลูกค้าเห็นว่าแต่ละขนาดใหญ่แค่ไหน
 *   insert-*     ภาพประจำตัวเลือก "ไส้หมอน" — ปลอกอย่างเดียว เทียบ พร้อมไส้หมอน 18x18 (+200)
 *
 * ⚠️ อัปทับชื่อไฟล์เดิมไม่ได้ (CDN/Next แคชไว้) — ชุดนี้จึงลงท้าย -v1 ครั้งหน้าขึ้น v2
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "pillowcases-5";
const DIR = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1] || ".cache/pillowcase-cushion";
const PAGE = "https://www.iduckyofficial-pricelists.com/pillowcases";
const SECTION = "ปลอกหมอนอิง";
const V = "v1";

/** รูปงานจริงในท่อน "ปลอกหมอนอิง" ของหน้าเว็บ (id ของ wixstatic) — เรียงตามที่อยากให้ขึ้นในแกลเลอรี */
const PHOTOS = [
  ["45df5d7d45a2461dba6a9174b180c349", "งานจริง — พิมพ์ลายเต็มใบ"],
  ["8faffefdb32942ce8eedf62319fbdb9b", "งานจริง — ลายสั่งทำ (ของขวัญวันเกิด)"],
  ["31474e7c0f9349faa117f4f839076266", "ซิปด้านล่าง — ถอดซักได้"],
  ["86b7fbe758b244e6b3af53b69e0b3146", "ขอบเย็บ + ซิป (โคลสอัพ)"],
  ["308bb9cca2e044c1be3a1d2ba245b01e", "เนื้องานพิมพ์ซับลิเมชั่น"],
];

const SIZES = [12, 14, 16, 18, 20, 22, 24];
const sizeName = (inch) => `${inch}x${inch} นิ้ว`;
const SIZE_LABEL = "ขนาด";
const INSERT_LABEL = "ไส้หมอน";
const INSERT_NONE = "ปลอกอย่างเดียว (ไม่มีไส้หมอน)";
const INSERT_18 = "พร้อมไส้หมอนอิง 18x18 นิ้ว";

/* ── 1. ดึงตารางราคาจากเว็บ ──────────────────────────────────────── */
const decode = (s) =>
  s
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

/** ตารางแรกที่อยู่ถัดจากหัวข้อ "ปลอกหมอนอิง" (ต้องชิดกัน ไม่เกิน 2000 ตัวอักษร) */
function sectionTable() {
  for (let i = html.indexOf(SECTION); i >= 0; i = html.indexOf(SECTION, i + 1)) {
    const t = html.indexOf("<table", i);
    if (t < 0 || t - i > 2000) continue;
    const end = html.indexOf("</table>", t);
    const rows = [...html.slice(t, end).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
      [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
    );
    if (rows.length > 1 && rows[0][0] === "จำนวน") return rows;
  }
  throw new Error(`หาตารางใต้หัวข้อ "${SECTION}" ในหน้าเว็บไม่เจอ — โครงหน้าเว็บอาจเปลี่ยน`);
}

const rows = sectionTable();
const cols = rows[0].slice(1); // 12x12 นิ้ว … 24x24 นิ้ว
if (JSON.stringify(cols) !== JSON.stringify(SIZES.map(sizeName)))
  throw new Error(`หัวคอลัมน์บนเว็บไม่ตรงกับที่รู้จัก: ${JSON.stringify(cols)} — ตรวจก่อน`);

/** "1-10 ใบ" → { upTo: 10 } · "1000 ใบขึ้นไป" → { upTo: null } */
const tiers = rows.slice(1).map((r) => {
  const label = r[0];
  const m = label.match(/(\d+)\s*[-–]\s*(\d+)/);
  const up = m ? Number(m[2]) : /ขึ้นไป|^\s*\d+\s*ใบ\s*$/.test(label) ? null : null;
  return { upTo: up, label };
});
tiers.at(-1).upTo = null; // ขั้นสุดท้ายเปิดปลาย

const cells = Object.fromEntries(
  cols.map((c, ci) => [
    c,
    rows.slice(1).map((r) => {
      const n = Number(String(r[ci + 1]).replace(/[^\d]/g, ""));
      if (!n) throw new Error(`ช่องราคา ${c} / ${r[0]} อ่านไม่ออก ("${r[ci + 1]}")`);
      return n;
    }),
  ])
);
const pricing = { unit: "ใบ", cells, tiers, driverLabels: [SIZE_LABEL] };
console.log(`📊 ตาราง "${SECTION}" จากเว็บ · ${cols.length} ขนาด × ${tiers.length} ช่วงจำนวน`);
console.log(`   ${cols.map((c, i) => `${c.replace(" นิ้ว", "")}=${cells[c][0]}`).join(" · ")}   (ช่วง ${tiers[0].label})`);

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
const url = (name) => `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/${name}.jpg`;

async function put(name, buf) {
  if (!WRITE) return url(name);
  const up = await sb.storage
    .from("product-images")
    .upload(`products/${ID}/${name}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error(`อัป ${name}: ${up.error.message}`);
  return url(name);
}

// รูปงานจริง — ดึงจาก wixstatic แล้วอัปเข้า storage ของเราเอง (เว็บ Wix เปลี่ยนลิงก์เมื่อไหร่ก็ไม่พัง)
const gallery = [];
for (const [wixId, label] of PHOTOS) {
  const n = gallery.length + 1;
  const res = await fetch(`https://static.wixstatic.com/media/959b83_${wixId}~mv2.jpg/v1/fill/w_1200,h_1200,al_c,q_88/file.jpg`);
  if (!res.ok) throw new Error(`โหลดรูป ${wixId} ไม่ได้ — HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  gallery.push({ emoji: "🛋️", gradient: "from-sky-100 to-cyan-100", label, src: await put(`photo-${n}-${V}`, buf) });
}
console.log(`🖼  รูปงานจริง ${gallery.length} ภาพ (จากท่อน "${SECTION}" บนเว็บ) → photo-1-${V} … photo-${gallery.length}-${V}`);

// ภาพประจำตัวเลือก — วาดไว้แล้วโดย pillowcase-cushion-art.mjs
const local = (f) => readFileSync(`${DIR}/${f}.jpg`);
const sizeArt = {};
for (const inch of SIZES) sizeArt[inch] = await put(`size-${inch}-${V}`, local(`size-${inch}`));
const insertArt = {
  none: await put(`insert-none-${V}`, local("insert-none")),
  with: await put(`insert-18-${V}`, local("insert-18")),
};
console.log(`🖼  ภาพตัวเลือก ${SIZES.length} ขนาด + ไส้หมอน 2 แบบ (จาก ${DIR})`);

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้า ${ID} ไม่ได้ — ${error.message}`);
const d = structuredClone(row.data);
if (d.name !== SECTION) throw new Error(`${ID} ชื่อ "${d.name}" ไม่ใช่ "${SECTION}" — ตรวจก่อน`);

d.price = cells[cols[0]][0];
d.unit = "ใบ";
d.pricing = pricing;
/**
 * เว็บเขียนไว้ว่า "1-10 ชิ้น คละลายได้" · "11 ชิ้นขึ้นไป คละลาย สั่งลายละ 5 ชิ้นขึ้นไป"
 * ตรงกับ freeMixBelowQty + minPerDesign ของเรทราคาพอดี (ไม่ใช้ tierByDesign — เรทบนเว็บคิดจากยอดรวม)
 */
d.priceRates = [{ id: "r1", label: "เรทมาตรฐาน", freeMixBelowQty: 11, minPerDesign: 5, pricing }];
delete d.tierByDesign;

d.options = [
  {
    label: SIZE_LABEL,
    display: "pills",
    stockBearing: true,
    choices: SIZES.map((inch) => ({ name: sizeName(inch), imageSrc: sizeArt[inch] })),
  },
  {
    label: INSERT_LABEL,
    display: "pills",
    // ร้านมีไส้หมอนเฉพาะ 18x18 นิ้ว (ตามที่เว็บระบุ) — ขนาดอื่นจึงไม่ต้องถาม
    showWhen: { label: SIZE_LABEL, choices: [sizeName(18)] },
    choices: [
      { name: INSERT_NONE, imageSrc: insertArt.none },
      { name: INSERT_18, extra: 200, imageSrc: insertArt.with },
    ],
  },
];

d.images = gallery;
d.imageSrc = gallery[0].src;
d.emoji = "🛋️";
d.gradient = "from-sky-100 to-cyan-100";
d.description =
  "ปลอกหมอนอิงพิมพ์ลายเต็มใบ เนื้อผ้าฮาร์มิส นุ่มลื่น มีซิปด้านล่างถอดซักได้ เลือกได้ 7 ขนาด ตั้งแต่ 12x12 ถึง 24x24 นิ้ว (ราคานี้เป็นปลอกอย่างเดียว ไม่รวมไส้หมอน)";
d.highlights = ["ปลอกอย่างเดียว ไม่รวมไส้หมอน", "7 ขนาด 12x12 – 24x24 นิ้ว", "ผ้าฮาร์มิส มีซิปด้านล่าง"];
d.terms = [
  "*ราคานี้เป็นปลอกหมอนอย่างเดียว ไม่รวมไส้หมอน — ขนาด 18x18 นิ้ว สั่งพร้อมไส้หมอนได้ บวกเพิ่มใบละ 200 บาท",
  "*จำนวน 1-10 ใบ คละลายได้อิสระ · 11 ใบขึ้นไป คละลายได้ สั่งลายละ 5 ใบขึ้นไป",
  "*เนื้อผ้าฮาร์มิส นุ่ม ลื่น นอนสบาย ซักได้ปกติ สีไม่ตก",
  "*ด้านในปลอกหมอน อาจมีด้ายหลุดรุ่ยบ้างเล็กน้อย",
  "*หมอนแต่ละรอบขนาดจะ +-ครึ่งนิ้ว",
  "*งานผ้าจะมีจุดดำที่เกิดจากฝุ่นบ้างเล็กน้อย มีการเคลื่อนของลายสกรีน และจะมีรอยยับของผ้า ซึ่งจะไม่กระทบกับการใช้งาน",
  "*ทางร้านใช้สี R G B งานพิมพ์ซับลิเมชั่น สีงานพิมพ์ที่ได้ออกมาอาจจะมีสีที่สว่างกว่าหรือดรอปลง ตามความแตกต่างของไฟล์งาน +-5% ถึง +-15% เพราะเป็นงานถ่ายเท",
  "สีพิมพ์ด้วยความร้อน ซึ่งอุณหภูมิความร้อนมีผลกับสีที่พิมพ์ออกมาด้วยเหมือนกัน",
].join("\n");
d.hidden = false;

console.log(`\n📦 ${d.name} (${ID}) · หมวด ${row.data.category ?? "fabric"}`);
console.log(`   ราคาเริ่มต้น ฿${d.price}/ใบ · ตัวเลือก ${d.options.map((o) => `${o.label} ${o.choices.length} แบบ`).join(" · ")}`);
console.log(`   แกลเลอรี ${d.images.length} ภาพ · ภาพประจำตัวเลือกครบ ${SIZES.length + 2} ภาพ · สถานะ: เผยแพร่`);
if (!WRITE) {
  console.log("\n(ยังไม่อัปไฟล์ ไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
const save = await sb.from("products").update({ data: d }).eq("id", ID);
if (save.error) throw new Error(`บันทึกไม่สำเร็จ — ${save.error.message}`);
console.log("\n✅ อัปภาพ + บันทึก + เผยแพร่แล้ว");
