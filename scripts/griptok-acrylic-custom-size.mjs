/**
 * 📐 กริ๊บต๊อกอะคริลิค (1-4) — เพิ่ม "กำหนดขนาดเอง" ในกลุ่มแกนราคา "ขนาด"
 * ตรรกะเดียวกับพวงกุญแจอะคริลิค (scripts/keyring-custom-size.mjs · ProductOption.sizeInput):
 *
 *  1) ลูกค้าสั่งขนาดทศนิยมได้ (6.5 ซม.) — ราคาคิดตามด้านที่ยาวที่สุด แล้วไปเกาะแถวขนาด
 *     ในตารางเรทเดิม (5cm-10cm) โดยผ่อนเศษให้ครึ่งเซนติเมตร (6.5 → แถว 6cm · 6.6 → แถว 7cm)
 *  2) เล็กกว่าแถวเล็กสุดก็สั่งได้เลย = คิดเท่าแถว 5cm (ไม่ต้องรอตีราคา)
 *  3) ด้านยาวสุดเกิน 10 ซม. = เกินที่ตารางครอบ → "รอแอดมินตีราคา" (กดสั่งไว้ก่อนได้)
 *
 * 14 ก.ย. 69 เจ้าของร้านสั่งเพิ่ม: **กรอกด้านที่ยาวที่สุดช่องเดียว** (หน้าสินค้าบอกอยู่แล้วว่า
 * ขนาดนับจากด้านยาวสุด · ไดคัทตามทรงลาย) → sizeInput ไม่มี heightLabel แล้ว และสคริปต์นี้
 * ลบคู่ช่อง กว้าง/สูง ของรอบก่อนออกให้ด้วย
 *
 * ทำงานแบบ read-modify-write บนแถวจริง และรันซ้ำได้ (idempotent) · --dry = ดูอย่างเดียว
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "1-4";                         // slug = Griptok-อะคริลิค
const SIZE_LABEL = "ขนาด";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุด้านที่ยาวที่สุด)";
const OLD_CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";   // ชื่อรอบแรกตอนยังกรอก 2 ช่อง
const SIDE_LABEL = "ขนาดกำหนดเอง (ด้านที่ยาวที่สุด)";
const OLD_LABELS = ["ขนาดกำหนดเอง (กว้าง)", "ขนาดกำหนดเอง (สูง)"];   // คู่ช่องรอบแรก — ลบทิ้ง
const UNIT = "ซม.";
const ASK_OVER = 10;                      // ใหญ่กว่านี้ = แอดมินตีราคา (ตารางครอบถึง 10cm)
const MAX_CM = 30;                        // กันพิมพ์เลขหลุด (เกิน 10 ยังกรอกได้ = ขอตีราคา)

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

// 1) ตัวเลือก "กำหนดขนาดเอง" ท้ายกลุ่มขนาด (เปลี่ยนชื่อจากรอบแรกที่ยังกรอก ก.×ส.)
const oldChoice = size.choices.find((c) => c.name === OLD_CUSTOM);
if (oldChoice) oldChoice.name = CUSTOM;
if (!size.choices.some((c) => c.name === CUSTOM)) size.choices.push({ name: CUSTOM });

// 2) สเปกคิดราคา (ด้านยาวสุด → แถวในตาราง เศษ ≤ 0.5 อยู่แถวเดิม · เกิน 10 ซม. = ตีราคา)
//    heightLabel ชี้ช่องเดียวกับ widthLabel = "กรอกด้านเดียว" (ดู SizeInputSpec ใน src/lib/products.ts)
//    ⚠️ ตั้งซ้ำแบบนี้เพื่อให้โค้ดที่ยัง live อยู่ (บังคับสองด้าน) ยังคิดราคาถูกระหว่างรอ deploy
size.sizeInput = { choice: CUSTOM, widthLabel: SIDE_LABEL, heightLabel: SIDE_LABEL, askOver: ASK_OVER, unit: UNIT };

// 3) ช่องกรอกด้านยาวสุด — โผล่เมื่อเลือก "กำหนดขนาดเอง" · งานปกติ (standardInput) บังคับกรอกก่อนสั่ง
//    ⚠️ สินค้านี้แบ่งชุดตัวเลือกไว้แล้ว ช่องกรอกต้องใส่ section เดียวกับกลุ่มขนาด ไม่งั้นโผล่นอกกรอบ
const showWhen = { label: SIZE_LABEL, choices: [CUSTOM] };
const field = (label, hint) => ({
  label,
  display: "input",
  standardInput: true,
  showWhen,
  section: size.section,
  choices: [],
  input: {
    kind: "number",
    unit: UNIT,
    min: 1,
    max: MAX_CM,
    placeholder: "6.5",
    required: true,
    hint,
  },
});
const pair = [
  field(
    SIDE_LABEL,
    `วัดด้านที่ยาวที่สุดของชิ้นงาน ใส่ทศนิยมได้ เช่น 6.5 · เศษไม่เกินครึ่งเซนติเมตรยังอยู่แถวเดิม (6.5 ซม. = แถว 6cm · 6.6 ซม. = แถว 7cm) · เกิน ${ASK_OVER} ${UNIT} แอดมินตีราคาให้`
  ),
];
for (const f of pair) {
  const i = opts.findIndex((o) => o.label === f.label);
  if (i >= 0) opts[i] = { ...opts[i], ...f };
}
const missing = pair.filter((f) => !opts.some((o) => o.label === f.label));
if (missing.length) opts.splice(opts.indexOf(size) + 1, 0, ...missing);

// 3.1) ลบคู่ช่อง กว้าง/สูง ของรอบแรกทิ้ง (ถามไปก็ไม่ได้ใช้คิดเงิน ลูกค้าต้องเดาอีกด้านเปล่า ๆ)
const dropped = opts.filter((o) => OLD_LABELS.includes(o.label)).length;
for (let i = opts.length - 1; i >= 0; i--) if (OLD_LABELS.includes(opts[i].label)) opts.splice(i, 1);

// 4) ⚠️ กฎที่จำกัดรายชื่อขนาด ต้องอนุญาตตัวเลือกใหม่ด้วย ไม่งั้นมันหายเงียบ ๆ
let ruleFix = 0;
for (const r of p.rules || []) {
  if (r.limit?.label?.trim() !== SIZE_LABEL) continue;
  r.limit.allow = r.limit.allow.filter((n) => n !== OLD_CUSTOM);
  if (!r.limit.allow.includes(CUSTOM)) {
    r.limit.allow.push(CUSTOM);
    ruleFix++;
  }
}

p.options = opts;
p.savedAt = new Date().toISOString();
console.log("ตัวเลือกในกลุ่มขนาด:", size.choices.length, "· ช่องกรอกที่เพิ่ม:", missing.length, "· ช่องเก่าที่ลบ:", dropped, "· กฎที่เติม allow:", ruleFix);
if (DRY) {
  console.log(JSON.stringify({ sizeInput: size.sizeInput, pair }, null, 1));
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
if (!qSize.choices.some((c) => c.name === CUSTOM)) die("อ่านกลับ ตัวเลือก custom หาย");
for (const f of pair)
  if (!(q.options || []).some((o) => o.label === f.label && o.display === "input" && o.input?.integer !== true))
    die("อ่านกลับ ช่องกรอกหาย/ยังบล็อกทศนิยม: " + f.label);
if (qSize.sizeInput.heightLabel !== SIDE_LABEL) die("อ่านกลับ heightLabel ไม่ได้ชี้ช่องเดียวกับ widthLabel");
if (qSize.choices.some((c) => c.name === OLD_CUSTOM)) die("อ่านกลับ ชื่อตัวเลือกเก่ายังอยู่");
for (const l of OLD_LABELS)
  if ((q.options || []).some((o) => o.label === l)) die("อ่านกลับ ช่องเก่ายังอยู่: " + l);
for (const r of q.rules || [])
  if (r.limit?.label?.trim() === SIZE_LABEL && !r.limit.allow.includes(CUSTOM)) die("อ่านกลับ กฎยังไม่ allow custom");
console.log("✅ บันทึกแล้ว + อ่านกลับตรวจครบ");
