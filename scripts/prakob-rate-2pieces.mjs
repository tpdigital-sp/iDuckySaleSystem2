/**
 * 🔗 อะคริลิคประกบ (acrylic-prakob) — เพิ่มเรท "พวงกุญแจประกบ 2 ชิ้น ใน 1 พวง"
 * เจ้าของร้านสั่ง 21 ก.ย. 69 พร้อมใบเสนอราคาจริง (6 พวง / 1 ลาย / 2 ชิ้นใน 1 พวง · ห้อยล่าง):
 *   ชิ้นหลัก ประกบใส สกรีน 2 ด้าน ยาวสุด 4-4.5 cm = 200+10 = 210
 *   ติ่งห้อย ประกบใส สกรีน 2 ด้าน ยาวสุด 1.54 cm = 49+10  = 59     → รวม 269 บาท/พวง
 *
 * กติกาที่อ่านได้จากใบนี้ (ตรงกับตารางราคาส่งอะคริลิคประกบ):
 *  • ชิ้นหลัก = ช่องตารางของเรทพวงกุญแจตามปกติ (6 พวง = แถวปลีก 1-10)
 *  • ชิ้นที่ 2 = ช่องตาราง "เดียวกัน" ที่ขนาดของชิ้นนั้น แต่ **ไม่ใช้แถวราคาปลีก**
 *    (แถวปลีกคือราคาต่อพวง รวมตะขอ/ขั้นต่ำต่อพวงแล้ว) → เริ่มที่แถว 11-49 ชิ้น
 *    สั่งเยอะกว่านั้นเลื่อนตามช่วงจำนวนปกติ (50-199 พวง = แถว 50-199)
 *  • งานสกรีน/เนื้ออะคริลิคใช้ชุดเดียวกันทั้ง 2 ชิ้น (ค่าสกรีนอยู่ในช่องตารางแล้ว)
 *
 * ทำอะไร:
 *  1. เรทใหม่ r-2pc (+ ตัวแทน r-2pc-dealer) — ตารางก๊อปจากเรทพวงกุญแจ r1/r1-dealer สดจาก DB
 *  2. กลุ่ม "ขนาดชิ้นที่ 2" (โผล่เฉพาะเรทนี้) ราคา = ดึงจากตารางเรทผ่าน priceAsDriver
 *     + priceAsDriverMinTier: 1 (ข้ามแถวปลีก) · กำหนดขนาดเองได้เหมือนชิ้นหลัก (sizeInput)
 *  3. ช่องกรอกขนาดชิ้นที่ 2 (โผล่เมื่อเลือก "กำหนดขนาดเอง" ในกลุ่มนั้น)
 *
 * ⚠️ ต้อง deploy โค้ด `priceAsDriverMinTier` (src/lib/products.ts) ก่อนเขียนลงฐานจริง
 *    ไม่งั้นเว็บจริงจะคิดชิ้นที่ 2 ที่ "ราคาปลีก" (3cm สกรีน 2 ด้าน = ฿210 แทน ฿59)
 *
 * รันซ้ำได้ (idempotent) · อ่านกลับมาเทียบทุกครั้ง
 *   node scripts/prakob-rate-2pieces.mjs                 # dry-run
 *   node scripts/prakob-rate-2pieces.mjs --out=/tmp/p.json   # จำลองลงไฟล์ไว้ตรวจราคาก่อน (ไม่แตะ DB)
 *   node scripts/prakob-rate-2pieces.mjs --write         # เขียนจริง (หลัง deploy โค้ดแล้ว)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "acrylic-prakob";
const SRC_ID = "r1";                 // เรทพวงกุญแจ (ต้นทางตาราง)
const SRC_DEALER_ID = "r1-dealer";
const NEW_ID = "r-2pc";
const NEW_LABEL = "พวงกุญแจประกบ 2 ชิ้น ใน 1 พวง";
const NEW_DEALER_ID = "r-2pc-dealer";
const NEW_DEALER_LABEL = `${NEW_LABEL} (ตัวแทน)`;
const RATE_LABEL = "เรทราคา";
const SIZE = "ขนาด";
const SIZE2 = "ขนาดชิ้นที่ 2";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุด้านที่ยาวที่สุด)";
const FIELD2 = "ขนาดกำหนดเอง ชิ้นที่ 2 (ด้านที่ยาวที่สุด)";
const UNIT = "ซม.";
const MIN_TIER = 1;                  // ชิ้นที่ 2 ไม่ใช้แถวราคาปลีก (เริ่มแถวที่ 2 = 11-49 ชิ้น)
const MAX_CM = 30;

const WRITE = process.argv.includes("--write");
const OUT = (process.argv.find((a) => a.startsWith("--out=")) || "").slice(6);
const die = (m) => { console.error("✗ " + m); process.exit(1); };
const clone = (v) => JSON.parse(JSON.stringify(v));

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;
const opts = p.options || [];
const rates = p.priceRates || [];

const size = opts.find((o) => o.label.trim() === SIZE);
if (!size) die(`ไม่พบกลุ่ม "${SIZE}"`);
if (!size.sizeInput) die("กลุ่มขนาดยังไม่มี sizeInput — รัน scripts/prakob-custom-size.mjs ก่อน");
const src = rates.find((r) => r.id === SRC_ID);
const srcDealer = rates.find((r) => r.id === SRC_DEALER_ID);
if (!src) die(`ไม่พบเรทต้นทาง ${SRC_ID}`);

// ── 1) เรทใหม่ (ตาราง = ของเรทพวงกุญแจ · หน่วยเป็น "พวง")
const mkRate = (from, id, label, desc) => ({
  ...clone(from),
  id,
  label,
  desc,
  pricing: { ...clone(from.pricing), unit: "พวง" },
});
const DESC =
  "ราคาต่อ 1 พวง (2 ชิ้น) · ชิ้นหลักคิดตามตารางเดียวกับพวงกุญแจประกบ · " +
  "ชิ้นที่ 2 (ห้อยล่าง) คิดตามตารางเดียวกันที่ขนาดของชิ้นนั้น โดยเริ่มที่แถว 11-49 ชิ้น (ไม่ใช้ราคาปลีก) · " +
  "งานสกรีน/เนื้ออะคริลิคใช้ชุดเดียวกันทั้ง 2 ชิ้น";
const put = (rate) => {
  const i = rates.findIndex((r) => r.id === rate.id);
  if (i >= 0) rates[i] = rate;
  else rates.push(rate);
};
put(mkRate(src, NEW_ID, NEW_LABEL, DESC));
if (srcDealer) put(mkRate(srcDealer, NEW_DEALER_ID, NEW_DEALER_LABEL, "ราคาตัวแทนจำหน่าย · " + DESC));

// ── 2) กลุ่ม "ขนาดชิ้นที่ 2" — ราคาดึงจากช่องตารางของขนาดนั้น (ข้ามแถวปลีก)
const whenRate = { label: RATE_LABEL, choices: [NEW_LABEL, ...(srcDealer ? [NEW_DEALER_LABEL] : [])] };
const rowNames = size.choices.map((c) => c.name).filter((n) => n !== CUSTOM);
const size2 = {
  label: SIZE2,
  display: "dropdown",
  section: size.section,
  showWhen: whenRate,
  choices: [...rowNames.map((name) => ({ name })), { name: CUSTOM }],
  priceAsDriver: SIZE,
  priceAsDriverMinTier: MIN_TIER,
  sizeInput: { choice: CUSTOM, widthLabel: FIELD2, heightLabel: FIELD2, unit: UNIT },
  note:
    "ชิ้นเล็กที่ห้อยเพิ่มในพวงเดียวกัน — คิดราคาตามตารางเดียวกันที่ขนาดของชิ้นนี้ " +
    "โดยไม่ใช้ราคาปลีก (เริ่มที่แถว 11-49 ชิ้น) · งานสกรีน/เนื้ออะคริลิคใช้ชุดเดียวกับชิ้นหลัก",
};
const i2 = opts.findIndex((o) => o.label === SIZE2);
if (i2 >= 0) opts[i2] = { ...opts[i2], ...size2 };
else opts.splice(opts.findIndex((o) => o.label === size.sizeInput.widthLabel) + 1 || opts.indexOf(size) + 1, 0, size2);

// ── 3) ช่องกรอกขนาดชิ้นที่ 2 (ทศนิยมได้ · เล็กกว่าแถวเล็กสุดก็เกาะแถว 3cm ตามปกติ)
//     ⚠️ ต้องมี showWhenAlso ผูกเรทด้วย — optionVisible ไม่ไล่ดูกลุ่มแม่ ค่าค้างในกลุ่มที่ซ่อนจะทำให้ช่องบังคับกรอกโผล่
const field2 = {
  label: FIELD2,
  display: "input",
  standardInput: true,
  showWhen: { label: SIZE2, choices: [CUSTOM] },
  showWhenAlso: whenRate,
  section: size.section,
  choices: [],
  input: {
    kind: "number",
    unit: UNIT,
    min: 0.5,
    max: MAX_CM,
    placeholder: "1.5",
    required: true,
    hint:
      `วัดด้านที่ยาวที่สุดของชิ้นที่ห้อยเพิ่ม ใส่ทศนิยมได้ เช่น 1.54 · เล็กกว่า 3 ซม. คิดเท่าแถว 3cm · ` +
      `เศษไม่เกินครึ่งเซนติเมตรยังอยู่แถวเดิม (4.5 ${UNIT} = แถว 4cm) · ใหญ่กว่าตารางราคา แอดมินตีราคาให้`,
  },
};
const iF2 = opts.findIndex((o) => o.label === FIELD2);
if (iF2 >= 0) opts[iF2] = { ...opts[iF2], ...field2 };
else opts.splice(opts.findIndex((o) => o.label === SIZE2) + 1, 0, field2);

p.options = opts;
p.priceRates = rates;
p.savedAt = new Date().toISOString();

const cells = src.pricing.cells;
const at = (key, i) => cells[key]?.[i];
console.log("เรททั้งหมดหลังเพิ่ม:", rates.map((r) => r.label).join(" · "));
console.log(
  "ตัวอย่างจากใบเสนอราคา: ชิ้นหลัก 4cm สกรีน 2 ด้าน (1-10 พวง) = ฿" +
    at("4cm│สกรีน 2 ด้าน (ด้านในตรงกลาง)│ไม่มีฐาน (พวงกุญแจ)", 0) +
    " + ชิ้นที่ 2 ยาวสุด 1.54 → แถว 3cm (11-49) = ฿" +
    at("3cm│สกรีน 2 ด้าน (ด้านในตรงกลาง)│ไม่มีฐาน (พวงกุญแจ)", MIN_TIER)
);
if (OUT) {
  fs.writeFileSync(OUT, JSON.stringify(p, null, 1));
  console.log("เขียนไฟล์จำลองแล้ว: " + OUT + " (ยังไม่แตะฐานข้อมูล)");
  process.exit(0);
}
if (!WRITE) {
  console.log(JSON.stringify({ rate: { id: NEW_ID, label: NEW_LABEL, desc: DESC }, size2, field2 }, null, 1));
  console.log("— dry-run · ใส่ --write เพื่อเขียนจริง (ต้อง deploy โค้ด priceAsDriverMinTier ก่อน)");
  process.exit(0);
}
const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");

// ── อ่านกลับมาเทียบ
const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q = back?.data;
if (q?.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ");
const qr = (q.priceRates || []).find((r) => r.id === NEW_ID);
if (!qr || qr.label !== NEW_LABEL) die("อ่านกลับ ไม่เจอเรทใหม่");
if (Object.keys(qr.pricing.cells).length !== Object.keys(src.pricing.cells).length) die("อ่านกลับ ตารางเรทใหม่ไม่ครบ");
const q2 = (q.options || []).find((o) => o.label === SIZE2);
if (!q2 || q2.priceAsDriver !== SIZE || q2.priceAsDriverMinTier !== MIN_TIER) die("อ่านกลับ กลุ่มขนาดชิ้นที่ 2 ไม่ครบ");
if (q2.sizeInput?.choice !== CUSTOM) die("อ่านกลับ sizeInput ของชิ้นที่ 2 หาย");
const qf = (q.options || []).find((o) => o.label === FIELD2);
if (!qf || qf.display !== "input" || !qf.showWhenAlso) die("อ่านกลับ ช่องกรอกชิ้นที่ 2 ไม่ครบ");
console.log("✅ บันทึกแล้ว + อ่านกลับตรวจครบ");
