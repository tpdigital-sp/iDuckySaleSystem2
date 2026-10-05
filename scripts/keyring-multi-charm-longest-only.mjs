/**
 * 📏 พวงกุญแจแบบหลายชิ้น (keyring-multi-charm) — "กำหนดขนาดเอง" กรอก **ด้านที่ยาวที่สุดช่องเดียว** ทุกชิ้น (1–10)
 *
 * เจ้าของร้านสั่ง 5 ต.ค. 69: "ตรงที่กรอกขนาดเอาแค่ด้านที่ยาวที่สุดได้" — ราคาคิดจากด้านยาวสุดอยู่แล้ว
 * (เหมือนพวงกุญแจอะคริลิคชิ้นเดียว scripts/acrylic-size-longest-only.mjs) ถามอีกด้านไปก็ไม่ได้ใช้คิดเงิน
 *
 * ต่อชิ้นที่ N (read-modify-write · idempotent · --dry = ดูอย่างเดียว):
 *   1) ตัวเลือก "…(ระบุ ก.×ส.)" ในกลุ่ม "ขนาดชิ้นที่ N" → "…(ระบุด้านที่ยาวที่สุด)"
 *   2) sizeInput ชี้ช่องเดียว (widthLabel = heightLabel = ช่องด้านยาวสุด · แบบเดียวกับกริ๊บต๊อก/พวงกุญแจชิ้นเดียว)
 *   3) แทนคู่ช่อง กว้าง/สูง ชิ้นที่ N ด้วยช่องเดียว "ขนาดกำหนดเอง (ด้านที่ยาวที่สุด) ชิ้นที่ N" (ตำแหน่ง/section เดิม)
 *   4) ทั้งแถวต้องไม่เหลือชื่อตัวเลือกเก่า (rules/showWhen อ้างชื่ออยู่ → ตัวเลือกหายเงียบ)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "keyring-multi-charm";
const PIECES = 10;
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุด้านที่ยาวที่สุด)";
const OLD_CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const UNIT = "ซม.";
const ASK_OVER = 10;
const sizeLabel = (n) => `ขนาดชิ้นที่ ${n}`;
const sideLabel = (n) => `ขนาดกำหนดเอง (ด้านที่ยาวที่สุด) ชิ้นที่ ${n}`;
const oldLabels = (n) => [`ขนาดกำหนดเอง (กว้าง) ชิ้นที่ ${n}`, `ขนาดกำหนดเอง (สูง) ชิ้นที่ ${n}`];
const HINT = `วัดด้านที่ยาวที่สุดของชิ้นนี้ ด้านเดียวพอ ใส่ทศนิยมได้ เช่น 3.5 · เศษไม่เกินครึ่งเซนติเมตรยังอยู่แถวเดิม (3.5 ซม. = แถว 3cm · 3.6 ซม. = แถว 4cm) · เกิน ${ASK_OVER} ${UNIT} แอดมินตีราคาให้`;

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

for (let n = 1; n <= PIECES; n++) {
  const size = opts.find((o) => o.label.trim() === sizeLabel(n));
  if (!size) die(`ไม่พบกลุ่ม ${sizeLabel(n)}`);

  const oldChoice = size.choices.find((c) => c.name === OLD_CUSTOM);
  if (oldChoice) oldChoice.name = CUSTOM;
  if (!size.choices.some((c) => c.name === CUSTOM)) size.choices.push({ name: CUSTOM });

  size.sizeInput = {
    ...(size.sizeInput || {}),
    choice: CUSTOM,
    widthLabel: sideLabel(n),
    heightLabel: sideLabel(n),
    askOver: ASK_OVER,
    unit: UNIT,
  };

  // ช่องเดียวแทนที่ตำแหน่งช่อง (กว้าง) เดิม — ลำดับในการ์ดชิ้นนั้นไม่ขยับ
  const [oldW] = oldLabels(n);
  const base = opts.find((o) => o.label === sideLabel(n)) || opts.find((o) => o.label === oldW) || {};
  const field = {
    ...base,
    label: sideLabel(n),
    display: "input",
    standardInput: true,
    showWhen: { label: sizeLabel(n), choices: [CUSTOM] },
    section: size.section,
    choices: [],
    input: { kind: "number", unit: UNIT, min: 1, max: 30, placeholder: "3.5", required: true, hint: HINT },
  };
  let at = opts.findIndex((o) => o.label === sideLabel(n));
  if (at < 0) at = opts.findIndex((o) => o.label === oldW);
  if (at >= 0) opts[at] = field;
  else opts.splice(opts.indexOf(size) + 1, 0, field);
  for (let i = opts.length - 1; i >= 0; i--) if (oldLabels(n).includes(opts[i].label)) opts.splice(i, 1);
}

p.options = opts;
if (JSON.stringify(p).includes(OLD_CUSTOM)) die("ยังมีชื่อตัวเลือกเก่าค้างในแถว (rules/ราคา?) — ตรวจก่อนเขียน");
p.savedAt = new Date().toISOString();
console.log(`[${ID}] ตั้งช่องด้านยาวสุด ${PIECES} ชิ้น · ช่องกรอกขนาดเหลือ ${opts.filter((o) => /^ขนาดกำหนดเอง/.test(o.label)).length} ช่อง`);
if (DRY) {
  console.log(JSON.stringify(opts.filter((o) => /ชิ้นที่ 2$/.test(o.label) && /ขนาด/.test(o.label)), null, 1));
  process.exit(0);
}

const up = await sb.from("products").update({ data: p }).eq("id", ID).select("id");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update ไม่โดนแถวไหนเลย");

// อ่านกลับเทียบ — ไม่มี error ≠ ค่าลงจริง
const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q = back?.data;
if (q?.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง");
if (JSON.stringify(q).includes(OLD_CUSTOM)) die("อ่านกลับ ยังมีชื่อเก่า");
for (let n = 1; n <= PIECES; n++) {
  const s = q.options.find((o) => o.label.trim() === sizeLabel(n));
  if (s?.sizeInput?.widthLabel !== sideLabel(n) || s.sizeInput.heightLabel !== sideLabel(n)) die(`อ่านกลับ sizeInput ชิ้นที่ ${n} ผิด`);
  const f = q.options.find((o) => o.label === sideLabel(n));
  if (!f || f.input?.required !== true || f.showWhen?.choices?.[0] !== CUSTOM || f.section !== s.section) die(`อ่านกลับ ช่องชิ้นที่ ${n} ผิด`);
  if (q.options.some((o) => oldLabels(n).includes(o.label))) die(`อ่านกลับ ช่องเก่าชิ้นที่ ${n} ยังอยู่`);
}
console.log(`[${ID}] ✅ บันทึกแล้ว + อ่านกลับตรวจครบ`);
