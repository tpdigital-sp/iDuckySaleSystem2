/**
 * 📐 สแตนดี้อะคริลิค (standy) — เพิ่ม "กำหนดขนาดเอง" ในกลุ่มแกนราคา "ขนาดตัวสแตนดี้"
 * ตรรกะเดียวกับพวงกุญแจ (scripts/keyring-custom-size.mjs · ProductOption.sizeInput):
 *
 *  1) ลูกค้าสั่งขนาดทศนิยมได้ (12.5 × 8 ซม.) — ราคาคิดตามด้านที่ยาวที่สุด แล้วไปเกาะแถวขนาด
 *     ในตารางเรทเดิม โดยผ่อนเศษให้ครึ่งหน่วย (12.5 → แถว 12cm · 12.6 → แถว 13cm)
 *  2) ด้านยาวสุดเกิน 30 ซม. = เกินที่ตารางครอบ → ราคาเป็น "รอแอดมินตีราคา" (สั่งไว้ก่อนได้)
 *  3) เลือกสกรีน 3 เลเยอร์ (กฎจำกัดขนาดถึง 16cm) แล้วกรอกเกิน = ตกไปตีราคาเอง ไม่เกาะแถวต้องห้าม
 *
 * ทำงานแบบ read-modify-write บนแถวจริง และรันซ้ำได้ (idempotent)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "standy";                      // slug = สแตนดี้อะคริลิค-Acrylic-Standee
const SIZE_LABEL = "ขนาดตัวสแตนดี้";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const W_LABEL = "ขนาดกำหนดเอง (กว้าง)";
const H_LABEL = "ขนาดกำหนดเอง (สูง)";
const UNIT = "ซม.";
const ASK_OVER = 30;                      // ใหญ่กว่านี้ = แอดมินตีราคา (ตารางครอบถึง 30cm)
const MAX_CM = 60;                        // กันพิมพ์เลขหลุด (เกิน 30 ยังกรอกได้ = ขอตีราคา)

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

// 1) ตัวเลือก "กำหนดขนาดเอง" ท้ายกลุ่มขนาด
if (!size.choices.some((c) => c.name === CUSTOM)) size.choices.push({ name: CUSTOM });

// 2) สเปกคิดราคา (ด้านยาวสุด → แถวในตาราง เศษ ≤ 0.5 อยู่แถวเดิม · เกิน 30 ซม. = ตีราคา)
size.sizeInput = { choice: CUSTOM, widthLabel: W_LABEL, heightLabel: H_LABEL, askOver: ASK_OVER, unit: UNIT };

// 3) ช่องกรอกกว้าง/สูง — โผล่เมื่อเลือก "กำหนดขนาดเอง" · งานปกติ (standardInput) บังคับกรอกก่อนสั่ง
const showWhen = { label: SIZE_LABEL, choices: [CUSTOM] };
const field = (label, hint) => ({
  label,
  display: "input",
  standardInput: true,
  showWhen,
  choices: [],
  input: {
    kind: "number",
    unit: UNIT,
    min: 1,
    max: MAX_CM,
    placeholder: "12.5",
    required: true,
    hint,
  },
});
const pair = [
  field(W_LABEL, "ใส่ทศนิยมได้ เช่น 12.5"),
  field(
    H_LABEL,
    `ราคาคิดจากด้านที่ยาวที่สุด เศษไม่เกินครึ่งเซนติเมตรยังอยู่แถวเดิม (12.5 ซม. = แถว 12cm · 12.6 ซม. = แถว 13cm) · ด้านยาวสุดเกิน ${ASK_OVER} ${UNIT} แอดมินตีราคาให้`
  ),
];
for (const f of pair) {
  const i = opts.findIndex((o) => o.label === f.label);
  if (i >= 0) opts[i] = { ...opts[i], ...f };
}
const missing = pair.filter((f) => !opts.some((o) => o.label === f.label));
if (missing.length) opts.splice(opts.indexOf(size) + 1, 0, ...missing);

// 4) ⚠️ กฎที่จำกัดรายชื่อขนาด ต้องอนุญาตตัวเลือกใหม่ด้วย ไม่งั้นมันหายเงียบ ๆ
//    (สกรีน 3 เลเยอร์จำกัด 3-16cm — custom เลือกได้ แต่แถวที่เกาะยังนับเฉพาะที่กฎยอม)
let ruleFix = 0;
for (const r of p.rules || []) {
  if (r.limit?.label?.trim() !== SIZE_LABEL) continue;
  if (!r.limit.allow.includes(CUSTOM)) {
    r.limit.allow.push(CUSTOM);
    ruleFix++;
  }
}

p.options = opts;
p.savedAt = new Date().toISOString();
console.log("ตัวเลือกในกลุ่มขนาด:", size.choices.length, "· ช่องกรอกที่เพิ่ม:", missing.length, "· กฎที่เติม allow:", ruleFix);
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
  if (!(q.options || []).some((o) => o.label === f.label && o.display === "input")) die("อ่านกลับ ช่องกรอกหาย: " + f.label);
for (const r of q.rules || [])
  if (r.limit?.label?.trim() === SIZE_LABEL && !r.limit.allow.includes(CUSTOM)) die("อ่านกลับ กฎยังไม่ allow custom");
console.log("✅ บันทึกแล้ว + อ่านกลับตรวจครบ");
