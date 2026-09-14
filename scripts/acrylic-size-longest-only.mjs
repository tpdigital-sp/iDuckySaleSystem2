/**
 * 📏 สแตนดี้อะคริลิค (standy) + พวงกุญแจอะคริลิค (keyring-copy-copy)
 * — "กำหนดขนาดเอง" กรอก **ด้านที่ยาวที่สุดช่องเดียว** (เดิมบังคับกรอก กว้าง × สูง)
 *
 * เจ้าของร้านสั่ง 14 ก.ย. 69 (ต่อจากกริ๊บต๊อกอะคริลิค scripts/griptok-acrylic-custom-size.mjs):
 * ทั้งสองตัวคิดราคาจาก **ด้านที่ยาวที่สุด** อยู่แล้ว และไดคัทตามทรงลาย — ถามอีกด้านไปก็ไม่ได้ใช้
 * คิดเงิน ลูกค้าต้องเดาเปล่า ๆ · ราคายังเกาะแถวเดิมทุกอย่าง (ผ่อนเศษครึ่งเซนติเมตรเหมือนเดิม)
 *
 * สคริปต์นี้ (read-modify-write บนแถวจริง · idempotent · --dry = ดูอย่างเดียว):
 *   1) เปลี่ยนชื่อตัวเลือกในกลุ่มขนาด "…(ระบุ ก.×ส.)" → "…(ระบุด้านที่ยาวที่สุด)"
 *   2) sizeInput ชี้ช่องเดียว (widthLabel = heightLabel = ช่องด้านยาวสุด)
 *      ⚠️ ตั้ง heightLabel ซ้ำแบบเดียวกับกริ๊บต๊อก เพื่อให้โค้ดที่ยัง live (บังคับสองด้าน)
 *         ยังคิดราคาถูกระหว่างรอ deploy — โค้ดรุ่นใหม่อ่านว่า "ด้านเดียว" (ดู SizeInputSpec)
 *   3) แทนคู่ช่อง กว้าง/สูง ด้วยช่องเดียว "ขนาดกำหนดเอง (ด้านที่ยาวที่สุด)" แล้วลบคู่เก่าทิ้ง
 *   4) กฎที่จำกัดรายชื่อขนาด (rules[].limit.allow) ต้องสลับมาอนุญาตชื่อใหม่ ไม่งั้นตัวเลือกหายเงียบ ๆ
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const CUSTOM = "📐 กำหนดขนาดเอง (ระบุด้านที่ยาวที่สุด)";
const OLD_CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";        // ชื่อรอบก่อนตอนยังกรอก 2 ช่อง
const SIDE_LABEL = "ขนาดกำหนดเอง (ด้านที่ยาวที่สุด)";
const OLD_LABELS = ["ขนาดกำหนดเอง (กว้าง)", "ขนาดกำหนดเอง (สูง)"];  // คู่ช่องรอบก่อน — ลบทิ้ง
const UNIT = "ซม.";

const JOBS = [
  {
    id: "standy",                     // slug = สแตนดี้อะคริลิค-Acrylic-Standee
    sizeLabel: "ขนาดตัวสแตนดี้",
    askOver: 30,                      // ใหญ่กว่านี้ = แอดมินตีราคา (ตารางครอบถึง 30cm)
    maxCm: 60,                        // กันพิมพ์เลขหลุด (เกิน 30 ยังกรอกได้ = ขอตีราคา)
    sample: "12.5",
    hint: (askOver) =>
      `วัดด้านที่ยาวที่สุดของตัวสแตนดี้ (ไม่รวมฐาน) ใส่ทศนิยมได้ เช่น 12.5 · เศษไม่เกินครึ่งเซนติเมตรยังอยู่แถวเดิม (12.5 ซม. = แถว 12cm · 12.6 ซม. = แถว 13cm) · เกิน ${askOver} ${UNIT} แอดมินตีราคาให้`,
  },
  {
    id: "keyring-copy-copy",          // slug = พวงกุญแจอะคริลิค-Acrylic-Keyring
    sizeLabel: "ขนาด",
    askOver: 10,
    maxCm: 30,
    sample: "3.5",
    hint: (askOver) =>
      `วัดด้านที่ยาวที่สุดของชิ้นงาน ใส่ทศนิยมได้ เช่น 3.5 · เศษไม่เกินครึ่งเซนติเมตรยังอยู่แถวเดิม (3.5 ซม. = แถว 3cm · 3.6 ซม. = แถว 4cm) · เกิน ${askOver} ${UNIT} แอดมินตีราคาให้`,
  },
];

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

for (const job of JOBS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", job.id).maybeSingle();
  if (error || !row) die(error?.message || "ไม่พบสินค้า " + job.id);
  const p = row.data;
  const opts = p.options || [];

  const size = opts.find((o) => o.label.trim() === job.sizeLabel);
  if (!size) die(`[${job.id}] ไม่พบกลุ่ม ${job.sizeLabel}`);

  // 1) ชื่อตัวเลือกกำหนดขนาดเอง
  const oldChoice = size.choices.find((c) => c.name === OLD_CUSTOM);
  if (oldChoice) oldChoice.name = CUSTOM;
  if (!size.choices.some((c) => c.name === CUSTOM)) size.choices.push({ name: CUSTOM });

  // 2) สเปกคิดราคา — ชี้ช่องเดียวกันทั้ง width/height = โหมดกรอกด้านเดียว
  size.sizeInput = {
    ...(size.sizeInput || {}),
    choice: CUSTOM,
    widthLabel: SIDE_LABEL,
    heightLabel: SIDE_LABEL,
    askOver: job.askOver,
    unit: UNIT,
  };

  // 3) ช่องกรอกด้านยาวสุด — โผล่เมื่อเลือกกำหนดขนาดเอง · standardInput = บังคับกรอกก่อนสั่ง
  //    ⚠️ สินค้าทั้งสองแบ่งชุดตัวเลือกไว้แล้ว ช่องกรอกต้องใส่ section เดียวกับกลุ่มขนาด ไม่งั้นโผล่นอกกรอบ
  const field = {
    label: SIDE_LABEL,
    display: "input",
    standardInput: true,
    showWhen: { label: job.sizeLabel, choices: [CUSTOM] },
    section: size.section,
    choices: [],
    input: {
      kind: "number",
      unit: UNIT,
      min: 1,
      max: job.maxCm,
      placeholder: job.sample,
      required: true,
      hint: job.hint(job.askOver),
    },
  };
  const at = opts.findIndex((o) => o.label === field.label);
  if (at >= 0) opts[at] = { ...opts[at], ...field };
  const added = at < 0;
  if (added) opts.splice(opts.indexOf(size) + 1, 0, field);

  // 3.1) ลบคู่ช่อง กว้าง/สูง ของรอบก่อนทิ้ง
  const dropped = opts.filter((o) => OLD_LABELS.includes(o.label)).length;
  for (let i = opts.length - 1; i >= 0; i--) if (OLD_LABELS.includes(opts[i].label)) opts.splice(i, 1);

  // 4) กฎที่จำกัดรายชื่อขนาด — สลับชื่อเก่าเป็นชื่อใหม่
  let ruleFix = 0;
  for (const r of p.rules || []) {
    if (r.limit?.label?.trim() !== job.sizeLabel) continue;
    r.limit.allow = r.limit.allow.filter((n) => n !== OLD_CUSTOM);
    if (!r.limit.allow.includes(CUSTOM)) {
      r.limit.allow.push(CUSTOM);
      ruleFix++;
    }
  }

  p.options = opts;
  p.savedAt = new Date().toISOString();
  console.log(
    `[${job.id}] ตัวเลือกในกลุ่ม "${job.sizeLabel}": ${size.choices.length} · ช่องกรอกใหม่: ${added ? "เพิ่ม" : "อัปเดต"} · ช่องเก่าที่ลบ: ${dropped} · กฎที่สลับ allow: ${ruleFix}`
  );
  if (DRY) {
    console.log(JSON.stringify({ sizeInput: size.sizeInput, field }, null, 1));
    continue;
  }

  const up = await sb.from("products").update({ data: p }).eq("id", job.id).select("data");
  if (up.error) die(up.error.message);
  if (!up.data?.length) die(`[${job.id}] update ไม่โดนแถวไหนเลย (0 แถว)`);

  // 5) อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
  const { data: back } = await sb.from("products").select("data").eq("id", job.id).maybeSingle();
  const q = back?.data;
  const qSize = (q?.options || []).find((o) => o.label.trim() === job.sizeLabel);
  if (q?.savedAt !== p.savedAt) die(`[${job.id}] อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ`);
  if (qSize?.sizeInput?.choice !== CUSTOM) die(`[${job.id}] อ่านกลับ sizeInput.choice ไม่ตรง`);
  if (qSize.sizeInput.widthLabel !== SIDE_LABEL || qSize.sizeInput.heightLabel !== SIDE_LABEL)
    die(`[${job.id}] อ่านกลับ width/heightLabel ไม่ได้ชี้ช่องเดียวกัน`);
  if (Number(qSize.sizeInput.askOver) !== job.askOver) die(`[${job.id}] อ่านกลับ askOver ไม่ตรง`);
  if (!qSize.choices.some((c) => c.name === CUSTOM)) die(`[${job.id}] อ่านกลับ ตัวเลือก custom หาย`);
  if (qSize.choices.some((c) => c.name === OLD_CUSTOM)) die(`[${job.id}] อ่านกลับ ชื่อตัวเลือกเก่ายังอยู่`);
  const qField = (q.options || []).find((o) => o.label === SIDE_LABEL);
  if (!qField || qField.display !== "input" || qField.input?.required !== true || qField.input?.integer === true)
    die(`[${job.id}] อ่านกลับ ช่องกรอกด้านยาวสุดหาย/ผิดสเปก`);
  if (qField.showWhen?.choices?.[0] !== CUSTOM) die(`[${job.id}] อ่านกลับ showWhen ของช่องกรอกไม่ตรงชื่อใหม่`);
  if (qField.section !== size.section) die(`[${job.id}] อ่านกลับ section ของช่องกรอกไม่ตรงกลุ่มขนาด`);
  for (const l of OLD_LABELS)
    if ((q.options || []).some((o) => o.label === l)) die(`[${job.id}] อ่านกลับ ช่องเก่ายังอยู่: ${l}`);
  for (const r of q.rules || [])
    if (r.limit?.label?.trim() === job.sizeLabel) {
      if (!r.limit.allow.includes(CUSTOM)) die(`[${job.id}] อ่านกลับ กฎยังไม่ allow ชื่อใหม่`);
      if (r.limit.allow.includes(OLD_CUSTOM)) die(`[${job.id}] อ่านกลับ กฎยัง allow ชื่อเก่า`);
    }
  console.log(`[${job.id}] ✅ บันทึกแล้ว + อ่านกลับตรวจครบ`);
}
