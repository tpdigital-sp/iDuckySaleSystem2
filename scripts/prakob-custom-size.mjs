/**
 * 📐 อะคริลิคประกบ (acrylic-prakob · slug "อะคริลิคประกบ") — เพิ่ม "กำหนดขนาดเอง" ในกลุ่มแกนราคา "ขนาด"
 * ตรรกะเดียวกับพวงกุญแจอะคริลิค (ProductOption.sizeInput · ดู scripts/acrylic-size-longest-only.mjs)
 * เจ้าของร้านสั่ง 21 ก.ย. 69: "เพิ่มขนาดคัสตอมให้หน่อย · ตรรกะการคิดเหมือนพวงกุญแจเลย"
 *
 *  1) กรอก **ด้านที่ยาวที่สุดช่องเดียว** ทศนิยมได้ (4.5 ซม.) → ไปเกาะแถวขนาดในตารางเรทเดิม
 *     ผ่อนเศษครึ่งเซนติเมตร (4.5 → แถว 4cm · 4.6 → แถว 5cm) แล้วคิดราคาตามตารางตามปกติ
 *  2) เล็กกว่าแถวเล็กสุดก็สั่งได้เลย = คิดเท่าแถว 3cm (ไม่ต้องรอตีราคา)
 *  3) ใหญ่กว่าแถวที่ "มีราคาในเรทที่ลูกค้าเลือกอยู่" = 💬 รอแอดมินตีราคา (กดสั่งไว้ก่อนได้)
 *     ⚠️ ไม่ตั้ง askOver โดยตั้งใจ — สองเรทครอบไม่เท่ากัน (พวงกุญแจถึง 16cm · สแตนดี้ถึง 13cm)
 *        sizeInputPlanOf กรองแถวตาม activeMatrix ให้อยู่แล้ว ตั้ง askOver ตัวเดียวจะล็อกผิดเรท
 *
 * ทำงานแบบ read-modify-write บนแถวจริง และรันซ้ำได้ (idempotent) · --dry = ดูอย่างเดียว
 *   node scripts/prakob-custom-size.mjs --dry
 *   node scripts/prakob-custom-size.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "acrylic-prakob";
const SIZE_LABEL = "ขนาด";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุด้านที่ยาวที่สุด)";
const SIDE_LABEL = "ขนาดกำหนดเอง (ด้านที่ยาวที่สุด)";
const UNIT = "ซม.";
const MAX_CM = 30;   // กันพิมพ์เลขหลุด (เกินตาราง ยังกรอกได้ = ขอให้แอดมินตีราคา)

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const DRY = process.argv.includes("--dry");
const die = (msg) => { console.error("✗ " + msg); process.exit(1); };

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;
const opts = p.options || [];

const size = opts.find((o) => o.label.trim() === SIZE_LABEL);
if (!size) die("ไม่พบกลุ่ม " + SIZE_LABEL);

// แถวใหญ่สุดที่แต่ละเรทมีราคาจริง — เอาไว้เขียนข้อความบอกลูกค้า (ไม่ฮาร์ดโค้ด ตารางเปลี่ยนแล้วรู้ตัว)
const cmOf = (n) => Number(String(n).match(/\d+(\.\d+)?/)?.[0] ?? NaN);
const topOf = (m) => {
  const di = (m?.driverLabels || []).indexOf(SIZE_LABEL);
  if (di < 0) return null;
  const names = [...new Set(Object.keys(m.cells || {}).map((k) => k.split("│")[di]))];
  return names.map(cmOf).filter((v) => v > 0).sort((a, b) => b - a)[0] ?? null;
};
const rateTops = (p.priceRates?.length ? p.priceRates.filter((r) => !r.dealerOnly) : [{ label: "", pricing: p.pricing }])
  .map((r) => ({ label: r.label, top: topOf(r.pricing) }))
  .filter((r) => r.top);
if (!rateTops.length) die("อ่านแถวขนาดใหญ่สุดจากตารางราคาไม่ได้");
const overText = rateTops.map((r) => (r.label ? `${r.label} ${r.top} ${UNIT}` : `${r.top} ${UNIT}`)).join(" · ");

// 1) ตัวเลือก "กำหนดขนาดเอง" ท้ายกลุ่มขนาด
if (!size.choices.some((c) => c.name === CUSTOM)) size.choices.push({ name: CUSTOM });

// 2) สเปกคิดราคา — heightLabel ชี้ช่องเดียวกับ widthLabel = "กรอกด้านเดียว" (ดู SizeInputSpec ใน src/lib/products.ts)
size.sizeInput = { choice: CUSTOM, widthLabel: SIDE_LABEL, heightLabel: SIDE_LABEL, unit: UNIT };

// 3) ช่องกรอกด้านยาวสุด — โผล่เมื่อเลือก "กำหนดขนาดเอง"
//    ⚠️ สินค้านี้แบ่งชุดตัวเลือกไว้แล้ว ช่องกรอกต้องใส่ section เดียวกับกลุ่มขนาด ไม่งั้นโผล่นอกกรอบ
const field = {
  label: SIDE_LABEL,
  display: "input",
  standardInput: true,
  showWhen: { label: SIZE_LABEL, choices: [CUSTOM] },
  section: size.section,
  choices: [],
  input: {
    kind: "number",
    unit: UNIT,
    min: 1,
    max: MAX_CM,
    placeholder: "4.5",
    required: true,
    hint:
      `วัดด้านที่ยาวที่สุดของชิ้นงาน ใส่ทศนิยมได้ เช่น 4.5 · เศษไม่เกินครึ่งเซนติเมตรยังอยู่แถวเดิม ` +
      `(4.5 ${UNIT} = แถว 4cm · 4.6 ${UNIT} = แถว 5cm) · ใหญ่กว่าขนาดใหญ่สุดในตารางราคาของเรทที่เลือก (${overText}) แอดมินตีราคาให้`,
  },
};
const iField = opts.findIndex((o) => o.label === SIDE_LABEL);
const added = iField < 0;
if (added) opts.splice(opts.indexOf(size) + 1, 0, field);
else opts[iField] = { ...opts[iField], ...field };

// 4) ⚠️ กฎที่จำกัดรายชื่อขนาด ต้องอนุญาตตัวเลือกใหม่ด้วย ไม่งั้นมันหายเงียบ ๆ (ตอนนี้สินค้านี้ยังไม่มีกฎ)
let ruleFix = 0;
for (const r of p.rules || []) {
  if (r.limit?.label?.trim() !== SIZE_LABEL) continue;
  if (!r.limit.allow.includes(CUSTOM)) { r.limit.allow.push(CUSTOM); ruleFix++; }
}

p.options = opts;
p.savedAt = new Date().toISOString();
console.log("แถวใหญ่สุดต่อเรท:", rateTops.map((r) => `${r.label}=${r.top}`).join(" · "));
console.log("ตัวเลือกในกลุ่มขนาด:", size.choices.length, "· ช่องกรอก:", added ? "เพิ่มใหม่" : "อัปเดตของเดิม", "· กฎที่เติม allow:", ruleFix);
if (DRY) {
  console.log(JSON.stringify({ sizeInput: size.sizeInput, field }, null, 1));
  console.log("— dry-run · ตัด --dry ออกเพื่อเขียนจริง");
  process.exit(0);
}
const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");

// 5) อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q = back?.data;
const qSize = (q?.options || []).find((o) => o.label.trim() === SIZE_LABEL);
if (q?.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ");
if (qSize?.sizeInput?.choice !== CUSTOM) die("อ่านกลับ sizeInput ไม่ตรง");
if (qSize.sizeInput.heightLabel !== qSize.sizeInput.widthLabel) die("อ่านกลับ heightLabel ไม่ได้ชี้ช่องเดียวกับ widthLabel");
if (!qSize.choices.some((c) => c.name === CUSTOM)) die("อ่านกลับ ตัวเลือก custom หาย");
const qField = (q.options || []).find((o) => o.label === SIDE_LABEL);
if (!qField || qField.display !== "input" || qField.input?.integer === true) die("อ่านกลับ ช่องกรอกหาย/ยังบล็อกทศนิยม");
if (qField.section !== qSize.section) die("อ่านกลับ ช่องกรอกอยู่คนละชุดกับกลุ่มขนาด");
for (const r of q.rules || [])
  if (r.limit?.label?.trim() === SIZE_LABEL && !r.limit.allow.includes(CUSTOM)) die("อ่านกลับ กฎยังไม่ allow custom");
console.log("✅ บันทึกแล้ว + อ่านกลับตรวจครบ");
