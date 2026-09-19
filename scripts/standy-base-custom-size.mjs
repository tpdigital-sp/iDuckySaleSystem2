/**
 * 📐 สแตนดี้อะคริลิค (standy) — กลุ่ม "ขนาดฐาน" พิมพ์กำหนดขนาดเองได้
 *
 * เจ้าของร้านสั่ง 19 ก.ย. 69: "ฐานสามารถพิมพ์กำหนดไซต์เองได้"
 * (ขนาดตัวสแตนดี้กำหนดเองได้อยู่แล้ว — scripts/acrylic-size-longest-only.mjs · ฐานยังเลือกได้แค่ 2-20cm)
 *
 * ใช้กลไกเดิม ProductOption.sizeInput (กรอกด้านที่ยาวที่สุดช่องเดียว) บนกลุ่ม +฿ ธรรมดา:
 * ขนาดที่กรอกไปเกาะแถว Ncm (ผ่อนเศษครึ่งเซนติเมตร) แล้วคิด extra/extraBelow ของแถวนั้นตามกติกาค่าฐานเดิม
 * (1-10 ชิ้น ≤6 ซม. ฟรี · 7 ซม.ขึ้นไป ซม.ละ ฿5 · 11 ชิ้นขึ้นไปตามตารางค่าฐาน) — ราคาไม่เปลี่ยนสักช่อง
 * เกิน 20 ซม. (แถวใหญ่สุด) = 💬 แอดมินตีราคา
 *
 * ⚠️ เมนู "เลือกสีพิเศษของฐาน" 19 กลุ่ม ผูก showWhen กับชื่อแถว Ncm — หน้าร้านดู selections ดิบ
 *    เลือก "กำหนดขนาดเอง" แล้วเมนูเฉดไม่โผล่ (ส่วนฝั่งคิดเงินสลับเป็นแถวแล้ว = เห็นคนละกลุ่ม)
 *    → ใส่กฎ: ฐานกำหนดขนาดเอง เลือกสีฐานได้แค่ ใส / ขาวขุ่น C-02 · อยากได้สีพิเศษให้เลือกขนาดจากรายการ
 *
 *   node scripts/standy-base-custom-size.mjs --dry   (ดูอย่างเดียว)
 *   node scripts/standy-base-custom-size.mjs         (เขียนจริง · idempotent · อ่านกลับเทียบ)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "standy";
const BASE_LABEL = "ขนาดฐาน";
const COLOR_LABEL = "สีอะคริลิคฐาน";
const SPECIAL_COLOR = "อะคริลิคพิเศษ (สี / กลิตเตอร์ / โฮโลแกรม)";
const CUSTOM = "📐 กำหนดขนาดฐานเอง (ระบุด้านที่ยาวที่สุด)";
const FIELD = "ขนาดฐานกำหนดเอง (ด้านที่ยาวที่สุด)";
const UNIT = "ซม.";
const ASK_OVER = 20; // แถวใหญ่สุดของตารางค่าฐาน
const HINT =
  `วัดด้านที่ยาวที่สุดของฐาน ใส่ทศนิยมได้ เช่น 8.5 · เศษไม่เกินครึ่งเซนติเมตรคิดค่าฐานแถวเดิม (8.5 ซม. = แถว 8cm · 8.6 ซม. = แถว 9cm) · เกิน ${ASK_OVER} ${UNIT} แอดมินตีราคาให้ · ฐานสีพิเศษ กรุณาเลือกขนาดจากรายการ`;

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

const base = opts.find((o) => o.label.trim() === BASE_LABEL);
if (!base) die(`ไม่พบกลุ่ม ${BASE_LABEL}`);
const color = opts.find((o) => o.label.trim() === COLOR_LABEL);
if (!color) die(`ไม่พบกลุ่ม ${COLOR_LABEL}`);
const plainColors = color.choices.map((c) => c.name).filter((n) => n !== SPECIAL_COLOR);
if (plainColors.length !== color.choices.length - 1) die(`ไม่พบตัวเลือก "${SPECIAL_COLOR}" ในกลุ่ม ${COLOR_LABEL}`);
// แถวที่จะไปเกาะต้องอ่านเลขออกทุกตัว (2cm…20cm) ไม่งั้นแผนเกาะแถวผิด
const rowsCm = base.choices.filter((c) => c.name !== CUSTOM).map((c) => Number(c.name.match(/^(\d+)cm$/)?.[1]));
if (rowsCm.some((n) => !Number.isFinite(n))) die("ชื่อแถวขนาดฐานไม่ใช่รูป Ncm ทุกตัว — หยุดก่อน");
if (Math.max(...rowsCm) !== ASK_OVER) die(`แถวใหญ่สุดไม่ใช่ ${ASK_OVER}cm (ได้ ${Math.max(...rowsCm)}) — ปรับ ASK_OVER ก่อน`);

// 1) ตัวเลือก "กำหนดขนาดฐานเอง" ต่อท้ายรายการ
if (!base.choices.some((c) => c.name === CUSTOM)) base.choices.push({ name: CUSTOM });

// 2) สเปกคิดราคา — ชี้ช่องเดียวกันทั้ง width/height = โหมดกรอกด้านเดียว
base.sizeInput = { choice: CUSTOM, widthLabel: FIELD, heightLabel: FIELD, askOver: ASK_OVER, unit: UNIT };

// 3) ช่องกรอก — โผล่เมื่อเลือกกำหนดขนาดฐานเอง · section เดียวกับกลุ่มขนาดฐาน
const field = {
  label: FIELD,
  display: "input",
  standardInput: true,
  showWhen: { label: BASE_LABEL, choices: [CUSTOM] },
  section: base.section,
  choices: [],
  input: { kind: "number", unit: UNIT, min: 1, max: 40, placeholder: "8.5", required: true, hint: HINT },
};
const at = opts.findIndex((o) => o.label === FIELD);
if (at >= 0) opts[at] = { ...opts[at], ...field };
else opts.splice(opts.indexOf(base) + 1, 0, field);

// 4) กฎ: ฐานกำหนดขนาดเอง → สีฐานเลือกได้แค่สีที่ไม่ต้องเปิดเมนูเฉด (เมนูเฉดผูกกับชื่อแถว Ncm)
p.rules = p.rules || [];
let rule = p.rules.find((r) => r.when?.label === BASE_LABEL && r.limit?.label === COLOR_LABEL);
if (!rule) {
  rule = { when: {}, limit: {} };
  p.rules.push(rule);
}
rule.when = { label: BASE_LABEL, choice: CUSTOM, choices: [CUSTOM] };
rule.limit = { label: COLOR_LABEL, allow: plainColors };

// 4.1) กฎเดิมที่จำกัดรายชื่อขนาดฐาน (ถ้ามี) ต้องยอมตัวเลือกใหม่ด้วย ไม่งั้นหายเงียบ ๆ
let ruleFix = 0;
for (const r of p.rules) {
  if (r.limit?.label?.trim() !== BASE_LABEL) continue;
  if (!r.limit.allow.includes(CUSTOM)) { r.limit.allow.push(CUSTOM); ruleFix++; }
}

p.options = opts;
p.savedAt = new Date().toISOString();
console.log(`ตัวเลือกในกลุ่ม "${BASE_LABEL}": ${base.choices.length} · ช่องกรอก: ${at >= 0 ? "อัปเดต" : "เพิ่ม"} · กฎ allow ที่เติม: ${ruleFix}`);
if (DRY) {
  console.log(JSON.stringify({ sizeInput: base.sizeInput, field, rule }, null, 1));
  process.exit(0);
}

const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");

// 5) อ่านกลับมาเทียบ
const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q = back?.data;
if (q?.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ");
const qBase = (q.options || []).find((o) => o.label.trim() === BASE_LABEL);
if (qBase?.sizeInput?.choice !== CUSTOM || qBase.sizeInput.widthLabel !== FIELD || qBase.sizeInput.heightLabel !== FIELD)
  die("อ่านกลับ sizeInput ไม่ตรง");
if (Number(qBase.sizeInput.askOver) !== ASK_OVER) die("อ่านกลับ askOver ไม่ตรง");
if (qBase.choices.filter((c) => c.name === CUSTOM).length !== 1) die("อ่านกลับ ตัวเลือก custom หาย/ซ้ำ");
if (qBase.extraFromQty !== 11) die("อ่านกลับ extraFromQty ของขนาดฐานเปลี่ยน");
const qField = (q.options || []).filter((o) => o.label === FIELD);
if (qField.length !== 1 || qField[0].display !== "input" || qField[0].input?.required !== true)
  die("อ่านกลับ ช่องกรอกหาย/ซ้ำ/ผิดสเปก");
if (qField[0].showWhen?.choices?.[0] !== CUSTOM || qField[0].section !== qBase.section)
  die("อ่านกลับ showWhen/section ของช่องกรอกไม่ตรง");
const qRule = (q.rules || []).filter((r) => r.when?.label === BASE_LABEL && r.limit?.label === COLOR_LABEL);
if (qRule.length !== 1 || qRule[0].limit.allow.includes(SPECIAL_COLOR) || qRule[0].limit.allow.length !== plainColors.length)
  die("อ่านกลับ กฎสีฐานไม่ตรง");
console.log("✅ บันทึกแล้ว + อ่านกลับตรวจครบ");
