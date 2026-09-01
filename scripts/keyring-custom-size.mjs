/**
 * 📐 พวงกุญแจอะคริลิค — เพิ่ม "กำหนดขนาดเอง" ในกลุ่มแกนราคา "ขนาด"
 *
 *  1) ลูกค้าสั่งขนาดทศนิยมได้ (3.5 × 2.8 ซม.) — ราคาคิดตามด้านที่ยาวที่สุด แล้วไปเกาะแถวขนาด
 *     ในตารางเรทเดิม โดยผ่อนเศษให้ครึ่งหน่วย (3.5 → แถว 3cm · 3.6 → แถว 4cm)
 *  2) ด้านยาวสุดเกิน 10 ซม. = เกินที่ตารางครอบ → ราคาเป็น "รอแอดมินตีราคา" (สั่งไว้ก่อนได้)
 *
 * ทำงานแบบ read-modify-write บนแถวจริง และรันซ้ำได้ (idempotent)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "keyring-copy-copy";           // slug = keyring
const SIZE_LABEL = "ขนาด";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const W_LABEL = "ขนาดกำหนดเอง (กว้าง)";
const H_LABEL = "ขนาดกำหนดเอง (สูง)";
const UNIT = "ซม.";
const ASK_OVER = 10;                      // ใหญ่กว่านี้ = แอดมินตีราคา
const MAX_CM = 30;                        // กันพิมพ์เลขหลุด

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const DRY = process.argv.includes("--dry");

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) throw new Error(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;
const opts = p.options || [];

const size = opts.find((o) => o.label.trim() === SIZE_LABEL);
if (!size) throw new Error("ไม่พบกลุ่ม " + SIZE_LABEL);

// 1) ตัวเลือก "กำหนดขนาดเอง" ท้ายกลุ่มขนาด
if (!size.choices.some((c) => c.name === CUSTOM)) size.choices.push({ name: CUSTOM });

// 2) สเปกคิดราคา (ด้านยาวสุด → แถวในตาราง เศษ ≤ 0.5 อยู่แถวเดิม · เกิน 10 ซม. = ตีราคา)
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
    placeholder: "3.5",
    required: true,
    hint,
  },
});
const pair = [
  field(W_LABEL, "ใส่ทศนิยมได้ เช่น 3.5"),
  field(
    H_LABEL,
    `ราคาคิดจากด้านที่ยาวที่สุด เศษไม่เกินครึ่งเซนติเมตรยังอยู่แถวเดิม (3.5 ซม. = แถว 3cm · 3.6 ซม. = แถว 4cm) · ด้านยาวสุดเกิน ${ASK_OVER} ${UNIT} แอดมินตีราคาให้`
  ),
];
for (const f of pair) {
  const i = opts.findIndex((o) => o.label === f.label);
  if (i >= 0) opts[i] = { ...opts[i], ...f };
}
const missing = pair.filter((f) => !opts.some((o) => o.label === f.label));
if (missing.length) opts.splice(opts.indexOf(size) + 1, 0, ...missing);

// 4) ⚠️ กฎที่จำกัดรายชื่อขนาด ต้องอนุญาตตัวเลือกใหม่ด้วย ไม่งั้นมันหายเงียบ ๆ
let ruleFix = 0;
for (const r of p.rules || []) {
  if (r.limit?.label?.trim() !== SIZE_LABEL) continue;
  if (!r.limit.allow.includes(CUSTOM)) {
    r.limit.allow.push(CUSTOM);
    ruleFix++;
  }
}

p.options = opts;
console.log("ตัวเลือกในกลุ่มขนาด:", size.choices.length, "· ช่องกรอกที่เพิ่ม:", missing.length, "· กฎที่เติม allow:", ruleFix);
if (DRY) {
  console.log(JSON.stringify({ sizeInput: size.sizeInput, pair }, null, 1));
  process.exit(0);
}
const up = await sb.from("products").update({ data: p }).eq("id", ID);
if (up.error) throw new Error(up.error.message);
console.log("✅ บันทึกแล้ว");
