#!/usr/bin/env node
/**
 * พวงกุญแจ หลายชิ้นใน 1 พวง — สร้างสินค้าใหม่โดย copy ตรรกะทั้งหมดจากพวงกุญแจอะคริลิค (keyring-copy-copy)
 *
 *   node scripts/keyring-multi-charm-build.mjs           # ดูก่อนว่าจะเขียนอะไร (ไม่เขียนจริง)
 *   node scripts/keyring-multi-charm-build.mjs --write   # เขียนลงฐานข้อมูล (สร้างเป็นฉบับร่าง รอกดเผยแพร่)
 *
 * กติกาที่ผู้ใช้กำหนด (26 ส.ค. 69):
 *   • 1 พวง เลือกจำนวนชิ้นอิสระ 1-10 ชิ้น · แต่ละชิ้นเลือกขนาดเอง 2-10cm
 *   • ราคารวม = ผลรวมราคาตามตารางเรทของทุกชิ้น (ชิ้นที่ 1 = ราคาฐาน · ชิ้นที่ 2+ ใช้ priceAsDriver)
 *   • ช่วงราคาขั้นบันไดนับจาก "จำนวนชิ้นรวม" (จำนวนพวง × ชิ้นต่อพวง — กลไก pieceCountLabel)
 *   • ตะขอ/อะไหล่คิดครั้งเดียวต่อพวง (หน่วยขายเป็น "พวง" อยู่แล้ว จึงคิดต่อพวงอัตโนมัติ)
 *   • ใช้เรทที่ 1 (คละดีเทล) เรทเดียว — เรทที่ 2 ส่งโรงงาน (ไม่คละดีเทล ขั้นต่ำ 50) ขัดกับคอนเซ็ปต์
 *     คละหลายชิ้นหลายขนาดใน 1 พวง จึงตัดออก (ขั้นบันไดเรท 1 ครอบถึง 500+ ชิ้นอยู่แล้ว)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const SRC_ID = "keyring-copy-copy";
const NEW_ID = "keyring-multi-charm";
const NEW_NAME = "พวงกุญแจ หลายชิ้นใน 1 พวง";
const COUNT_LABEL = "จำนวนชิ้นใน 1 พวง";
const SIZE1 = "ขนาดชิ้นที่ 1";
const OLD_SIZE = "ขนาด";
const SIZES = ["2cm", "3cm", "4cm", "5cm", "6cm", "7cm", "8cm", "9cm", "10cm"]; // ไม่เกิน 10cm ตามที่สั่ง
const MAX_PIECES = 10;

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const log = [];

// ── ดึงต้นทางสดจาก DB (ห้ามใช้ dump เก่า — กัน drift) ──
const { data: srcRow, error } = await sb.from("products").select("*").eq("id", SRC_ID).single();
if (error) throw error;
const p = JSON.parse(JSON.stringify(srcRow.data)); // deep copy — ไม่แตะต้นทาง

// ── ตัวตนใหม่ ──
p.id = NEW_ID;
p.slug = NEW_ID;
p.name = NEW_NAME;
p.hidden = true; // ฉบับร่าง — ผู้ใช้กดเผยแพร่เองตาม workflow ร้าน
p.sold = 0;
p.featured = false;
delete p.badge;
delete p.rating;
log.push(`สร้างสินค้าใหม่ id=${NEW_ID} (ร่าง) จาก ${SRC_ID}`);

// ── เหลือเรทที่ 1 เรทเดียว ──
const r1 = (p.priceRates ?? []).find((r) => r.id === "r1");
if (!r1) throw new Error("ไม่พบเรท r1 ในต้นทาง — หยุดก่อน ข้อมูลเปลี่ยนไปจากตอนเขียนสคริปต์");
r1.label = "ราคาตามจำนวนชิ้นรวม (คละดีเทลได้)";
r1.desc =
  "คละลาย คละขนาด อะไหล่ได้ · ช่วงราคานับจากจำนวนชิ้นรวมทุกพวง (เช่น 4 พวง พวงละ 3 ชิ้น = 12 ชิ้น) · " +
  "1-10 ชิ้นคละอิสระ (ราคาปลีก) · 11 ชิ้นขึ้นไป ดีเทลละ 5 ชิ้นขึ้นไป";
p.priceRates = [r1];
log.push(`เหลือเรทเดียว: "${r1.label}" (ตัดเรทที่ 2 ส่งโรงงาน — ขัดกับคอนเซ็ปต์คละหลายชิ้นใน 1 พวง)`);

// ── เปลี่ยนชื่อกลุ่ม "ขนาด" → "ขนาดชิ้นที่ 1" + เหลือ 2-10cm ──
const sizeOpt = (p.options ?? []).find((o) => o.label === OLD_SIZE);
if (!sizeOpt) throw new Error(`ไม่พบกลุ่ม "${OLD_SIZE}" — หยุดก่อน`);
sizeOpt.label = SIZE1;
sizeOpt.note = "ขนาดของชิ้นแรกในพวง (นับจากด้านที่ยาวที่สุด) — เลือกได้ 2-10cm ต่อชิ้น";
const beforeCount = sizeOpt.choices.length;
sizeOpt.choices = sizeOpt.choices.filter((c) => SIZES.includes(c.name));
log.push(`กลุ่มขนาด: "${OLD_SIZE}" → "${SIZE1}" · ตัวเลือก ${beforeCount} → ${sizeOpt.choices.length} (2-10cm)`);

// driverLabels ต้องตามชื่อใหม่ทุกตาราง + ตัดช่องราคาขนาดเกิน 10cm ทิ้ง
const fixMatrix = (m, tag) => {
  if (!m) return;
  const di = m.driverLabels.indexOf(OLD_SIZE);
  m.driverLabels = m.driverLabels.map((l) => (l === OLD_SIZE ? SIZE1 : l));
  const sizeIdx = di >= 0 ? di : m.driverLabels.indexOf(SIZE1);
  if (sizeIdx >= 0) {
    const before = Object.keys(m.cells).length;
    m.cells = Object.fromEntries(Object.entries(m.cells).filter(([k]) => SIZES.includes(k.split("│")[sizeIdx])));
    log.push(`  ↳ ${tag}: driverLabels อัปเดต · ช่องราคา ${before} → ${Object.keys(m.cells).length}`);
  }
  if (m.unit === "ชิ้น") m.unit = "พวง"; // หน่วยขาย = พวง (ช่วงราคาในหัวตารางยังบรรยายเป็น "ชิ้น" ถูกแล้ว — นับชิ้นรวม)
};
fixMatrix(r1.pricing, "เรท 1");
p.pricing = JSON.parse(JSON.stringify(r1.pricing)); // ตารางระดับสินค้าให้ตรงเรทเดียวที่เหลือ
log.push("  ↳ pricing ระดับสินค้า = สำเนาตารางเรท 1");

// ── กฎที่จำกัด "ขนาด" — หลังตัดเหลือ 2-10cm กฎพวกนี้อนุญาตครบทุกตัวอยู่แล้ว (no-op) → ถอดทิ้ง ──
const beforeRules = (p.rules ?? []).length;
p.rules = (p.rules ?? []).filter((r) => r.limit?.label !== OLD_SIZE);
log.push(`กฎ: ถอดกฎจำกัดขนาด ${beforeRules - p.rules.length} ข้อ (เป็น no-op หลังเหลือ 2-10cm) · คงกฎอื่น ${p.rules.length} ข้อ`);

// ── กลุ่ม "จำนวนชิ้นใน 1 พวง" (1-10 ชิ้น) หน้ากลุ่มขนาด ──
const sizeAt = p.options.indexOf(sizeOpt);
const countOpt = {
  label: COUNT_LABEL,
  display: "pills",
  note: "เลือกอิสระว่า 1 พวงมีอะคริลิคกี่ชิ้น (สูงสุด 10 ชิ้น) — แต่ละชิ้นเลือกขนาดเองได้ ราคารวมตามขนาดของทุกชิ้น",
  choices: Array.from({ length: MAX_PIECES }, (_, i) => ({ name: `${i + 1} ชิ้น` })),
};
p.options.splice(sizeAt, 0, countOpt);
p.pieceCountLabel = COUNT_LABEL; // ช่วงราคาขั้นบันไดนับจากชิ้นรวม (จำนวนพวง × ชิ้นต่อพวง)
log.push(`เพิ่มกลุ่ม "${COUNT_LABEL}" (1-${MAX_PIECES} ชิ้น) + ตั้ง pieceCountLabel`);

// ── กลุ่ม "ขนาดชิ้นที่ 2..10" — โชว์ตามจำนวนชิ้นที่เลือก · ราคาดึงสดจากตารางเรท (priceAsDriver) ──
const pieceCounts = countOpt.choices.map((c) => c.name); // ["1 ชิ้น" … "10 ชิ้น"]
const sizeGroups = [];
for (let k = 2; k <= MAX_PIECES; k++) {
  sizeGroups.push({
    label: `ขนาดชิ้นที่ ${k}`,
    display: "dropdown",
    priceAsDriver: SIZE1, // +฿ = ราคาช่องขนาดนั้นในตารางเรท ณ ช่วงจำนวนปัจจุบัน
    showWhen: { label: COUNT_LABEL, choices: pieceCounts.slice(k - 1) }, // โชว์เมื่อเลือก ≥ k ชิ้น
    ...(k === 2 ? { note: "ชิ้นที่ 2 ขึ้นไปบวกราคาตามขนาดของชิ้นนั้นในตารางเรทเดียวกัน (ขยับตามช่วงจำนวนอัตโนมัติ)" } : {}),
    choices: SIZES.map((n) => ({ name: n })),
  });
}
p.options.splice(p.options.indexOf(sizeOpt) + 1, 0, ...sizeGroups);
log.push(`เพิ่มกลุ่ม "ขนาดชิ้นที่ 2".."ขนาดชิ้นที่ ${MAX_PIECES}" (dropdown 2-10cm · priceAsDriver → "${SIZE1}")`);

// ── ตะขอคิดครั้งเดียวต่อพวง — เขียนกำกับให้ชัด ──
const hookOpt = p.options.find((o) => o.label === "ตะขอ");
if (hookOpt) {
  hookOpt.note = [hookOpt.note, "ตะขอ 1 ชุดต่อพวง — คิดครั้งเดียว ไม่คูณจำนวนชิ้นในพวง"].filter(Boolean).join(" · ");
  log.push('กลุ่ม "ตะขอ": เติมข้อความ "คิดครั้งเดียวต่อพวง"');
}

// ── ข้อความหน้าสินค้า ──
p.description =
  "พวงกุญแจอะคริลิคแบบหลายชิ้นใน 1 พวง — เลือกได้อิสระว่าจะใส่กี่ชิ้น (1-10 ชิ้น) " +
  "แต่ละชิ้นเลือกขนาดเองได้ 2-10cm ราคารวมคิดตามขนาดของทุกชิ้นจากตารางเรทเดียวกัน " +
  "ช่วงราคานับจากจำนวนชิ้นรวมทุกพวง ตะขอคิดครั้งเดียวต่อพวง พิมพ์ระบบ UV Printing มีฟิล์มกันรอย QC ก่อนส่งทุกชิ้น";
p.highlights = [
  "1 พวง ใส่อะคริลิคได้อิสระ 1-10 ชิ้น",
  "แต่ละชิ้นเลือกขนาดเองได้ 2-10cm (คนละขนาดก็ได้)",
  "ราคารวมตามขนาดจริงของทุกชิ้น — ช่วงราคานับจากชิ้นรวม",
  "ตะขอ/อะไหล่ 1 ชุดต่อพวง คิดครั้งเดียว",
  "เลือกความหนา งานสกรีน และอะคริลิคสีพิเศษได้เหมือนพวงกุญแจปกติ",
];
p.terms =
  "*1 พวง เลือกได้สูงสุด 10 ชิ้น ขนาดชิ้นละ 2-10cm — ราคารวมคิดตามขนาดของแต่ละชิ้น · ตะขอ 1 ชุดต่อพวง\n" +
  p.terms;
log.push("อัปเดต description / highlights / terms");

// แท็บ "เรทที่ 1 vs เรทที่ 2" ไม่ตรงกับสินค้านี้แล้ว (เรทเดียว) → แทนด้วยวิธีคิดราคา
const rateTab = (p.tabs ?? []).find((t) => t.title === "เรทที่ 1 vs เรทที่ 2");
if (rateTab) {
  rateTab.title = "วิธีคิดราคา (หลายชิ้นใน 1 พวง)";
  rateTab.text =
    "• 1 พวง เลือกจำนวนชิ้นได้ 1-10 ชิ้น แต่ละชิ้นเลือกขนาดเอง 2-10cm\n" +
    "• ราคารวมต่อพวง = ผลรวมราคาตามตารางของทุกชิ้น (ชิ้นไหนขนาดใหญ่ก็คิดตามขนาดชิ้นนั้น)\n" +
    "• ช่วงราคาขั้นบันไดนับจาก \"จำนวนชิ้นรวมทุกพวง\" เช่น สั่ง 4 พวง พวงละ 3 ชิ้น = 12 ชิ้น เข้าช่วง 11-29 ชิ้น\n" +
    "• 1-10 ชิ้นคละอิสระ (ราคาปลีก) · 11 ชิ้นขึ้นไป ดีเทลละ 5 ชิ้นขึ้นไป\n" +
    "• ตะขอ/อะไหล่คิดครั้งเดียวต่อพวง · ความหนา งานสกรีน ประเภทอะคริลิค เลือกครั้งเดียวใช้ทั้งพวง";
  log.push(`แท็บ "เรทที่ 1 vs เรทที่ 2" → "${rateTab.title}" (เขียนใหม่)`);
}

// ── SEO ──
p.seo = {
  ...(p.seo ?? {}),
  title: "รับทำพวงกุญแจอะคริลิค หลายชิ้นใน 1 พวง เลือกได้ 1-10 ชิ้น ขนาด 2-10cm",
  description:
    "พวงกุญแจอะคริลิคแบบหลายชิ้นใน 1 พวง เลือกจำนวนชิ้นอิสระ 1-10 ชิ้น แต่ละชิ้นเลือกขนาดเอง 2-10cm " +
    "ราคารวมตามขนาดจริงของทุกชิ้น ตะขอคิดครั้งเดียวต่อพวง ไม่มีขั้นต่ำ พิมพ์ UV Printing",
  faqs: [
    {
      q: "1 พวง ใส่อะคริลิคได้กี่ชิ้น?",
      a: "เลือกได้อิสระตั้งแต่ 1-10 ชิ้นต่อพวง — เลือกจำนวนชิ้นบนหน้าสั่งซื้อ แล้วช่องเลือกขนาดของแต่ละชิ้นจะเปิดให้ตามจำนวน",
    },
    {
      q: "แต่ละชิ้นเลือกขนาดต่างกันได้ไหม?",
      a: "ได้ครับ แต่ละชิ้นเลือกขนาดเองได้ 2-10cm ไม่ต้องเท่ากัน ราคารวมคิดตามขนาดจริงของทุกชิ้นจากตารางเรทเดียวกัน",
    },
    {
      q: "ราคาขั้นบันไดนับยังไง?",
      a: "นับจากจำนวนชิ้นรวมทุกพวง เช่น สั่ง 4 พวง พวงละ 3 ชิ้น = 12 ชิ้น เข้าช่วงราคา 11-29 ชิ้น ราคาต่อชิ้นถูกลงตามจำนวนรวม",
    },
    {
      q: "ค่าตะขอคิดยังไง?",
      a: "ตะขอ/อะไหล่คิดครั้งเดียวต่อพวง ไม่คูณตามจำนวนชิ้นในพวง — เลือกแบบตะขอและสีได้เหมือนพวงกุญแจปกติ",
    },
  ],
};
log.push("อัปเดต SEO title/description/FAQ 4 ข้อ");

// ── ช่วงราคา min-max จากตารางที่เหลือ ──
const vals = Object.values(p.pricing.cells).flat().filter((n) => Number.isFinite(n));
p.priceMin = Math.min(...vals);
p.priceMax = Math.max(...vals);
p.price = srcRow.price; // ราคาตั้งต้น fallback เดิม
log.push(`ช่วงราคา: ${p.priceMin} - ${p.priceMax} · ราคาตั้งต้น ${p.price}`);

p.savedAt = new Date().toISOString();

console.log(log.map((l) => "• " + l).join("\n"));
console.log("\nตัวเลือกทั้งหมด:", p.options.map((o) => o.label).join(" | "));
console.log("driverLabels:", p.pricing.driverLabels.join(" │ "), "· unit:", p.pricing.unit);

if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าจะเขียนจริง)");
  process.exit(0);
}

// มีอยู่แล้ว = อัปเดตทับ (รันซ้ำได้) · ยังไม่มี = insert ใหม่
const { data: exists } = await sb.from("products").select("id").eq("id", NEW_ID).maybeSingle();
const row = { id: NEW_ID, name: NEW_NAME, category: srcRow.category, price: p.price, sold: 0, featured: false, badge: null, data: p };
const { error: wErr } = exists
  ? await sb.from("products").update(row).eq("id", NEW_ID)
  : await sb.from("products").insert(row);
if (wErr) throw wErr;
console.log(`\n✅ ${exists ? "อัปเดต" : "สร้าง"} ${NEW_ID} แล้ว (ฉบับร่าง — กดเผยแพร่ในหลังบ้านเมื่อพร้อม)`);
