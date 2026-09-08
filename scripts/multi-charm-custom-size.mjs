/**
 * 📐 พวงกุญแจ หลายชิ้นใน 1 พวง (keyring-multi-charm) — เพิ่ม "กำหนดขนาดเอง" ให้ทุกชิ้น (ขนาดชิ้นที่ 1-10)
 * ตรรกะเดียวกับพวงกุญแจอะคริลิค (scripts/keyring-custom-size.mjs · ProductOption.sizeInput):
 *
 *  1) ลูกค้าสั่งขนาดทศนิยมได้ (3.5 × 2.8 ซม.) — ราคาคิดตามด้านที่ยาวที่สุด แล้วไปเกาะแถวขนาดเดิม
 *     โดยผ่อนเศษให้ครึ่งหน่วย (3.5 → แถว 3cm · 3.6 → แถว 4cm)
 *     · ชิ้นที่ 1 = แกนตารางราคา (ช่องตารางของแถวที่เกาะ) · ชิ้นที่ 2-10 = +฿ ติ่งห้อยของแถวที่เกาะ
 *  2) ด้านยาวสุดเกิน 10 ซม. = เกินที่ตารางครอบ → "รอแอดมินตีราคา" (สั่งไว้ก่อนได้)
 *
 * ⚠️ ต้อง deploy โค้ดที่รองรับหลายกลุ่ม sizeInput ในสินค้าเดียว (sizeInputPlans/applySizeInputPlans) ก่อน
 * ไม่งั้นเว็บเก่าคิดราคาเฉพาะกลุ่มแรกที่เจอ (ชิ้นที่ 1) ส่วนติ่งห้อยที่กำหนดขนาดเองจะไม่บวกราคา
 *
 * ทำงานแบบ read-modify-write บนแถวจริง และรันซ้ำได้ (idempotent) · --dry = ดูเฉย ๆ
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "keyring-multi-charm";        // slug = พวงกุญแจ-หลายชิ้นใน-1-พวง
const PIECES = 10;
const sizeLabel = (k) => `ขนาดชิ้นที่ ${k}`;
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
// ชื่อเต็มลงท้ายด้วย "ชิ้นที่ k" ให้ sectionTrim ตัดออกในกรอบชุด (โชว์ "ขนาดกำหนดเอง (กว้าง)") · ชื่อเต็มใช้ในตะกร้า/ออเดอร์
const wLabel = (k) => `ขนาดกำหนดเอง (กว้าง) ชิ้นที่ ${k}`;
const hLabel = (k) => `ขนาดกำหนดเอง (สูง) ชิ้นที่ ${k}`;
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

let addedChoices = 0, addedFields = 0, ruleFix = 0;
for (let k = 1; k <= PIECES; k++) {
  const SIZE_LABEL = sizeLabel(k);
  const size = opts.find((o) => o.label.trim() === SIZE_LABEL);
  if (!size) die("ไม่พบกลุ่ม " + SIZE_LABEL);

  // 1) ตัวเลือก "กำหนดขนาดเอง" ท้ายกลุ่มขนาด (ชิ้นที่ 2-10 ไม่ใส่ +฿ — ราคาไปเกาะแถวที่ครอบขนาด)
  if (!size.choices.some((c) => c.name === CUSTOM)) {
    size.choices.push({
      name: CUSTOM,
      desc: `ระบุกว้าง×สูงเอง ใส่ทศนิยมได้ · ราคาคิดตามด้านที่ยาวที่สุด เท่าขนาดมาตรฐานที่ครอบได้ · เกิน ${ASK_OVER} ${UNIT} แอดมินตีราคาให้`,
    });
    addedChoices++;
  }

  // 2) สเปกคิดราคา (ด้านยาวสุด → แถวในตาราง เศษ ≤ 0.5 อยู่แถวเดิม · เกิน 10 ซม. = ตีราคา)
  size.sizeInput = { choice: CUSTOM, widthLabel: wLabel(k), heightLabel: hLabel(k), askOver: ASK_OVER, unit: UNIT };

  // 3) ช่องกรอกกว้าง/สูง — โผล่เมื่อเลือก "กำหนดขนาดเอง" ของชิ้นนั้น · อยู่ชุดเดียวกับกลุ่มขนาด (section/sectionTrim/sectionClosed)
    const showWhen = { label: SIZE_LABEL, choices: [CUSTOM] };
  const sectionBits = {
    // ชิ้นที่ 2-10 ซ่อนตาม "จำนวนชิ้นใน 1 พวง" — ช่องกรอกต้องซ่อนตามด้วย (optionVisible ไม่ไล่ขึ้นไปดูกลุ่มแม่)
    // ไม่งั้นค่า "กำหนดขนาดเอง" ที่ค้างในชิ้นที่ซ่อนอยู่จะทำให้ช่องกรอกโผล่ + บังคับกรอกทั้งที่ลูกค้าไม่เห็นชิ้นนั้น
    ...(size.showWhen ? { showWhenAlso: size.showWhen } : {}),
    ...(size.section ? { section: size.section } : {}),
    ...(size.sectionTrim ? { sectionTrim: size.sectionTrim } : {}),
    ...(size.sectionClosed ? { sectionClosed: true } : {}),
  };
  const field = (label, hint) => ({
    label,
    display: "input",
    standardInput: true,
    showWhen,
    choices: [],
    input: { kind: "number", unit: UNIT, min: 1, max: MAX_CM, placeholder: "3.5", required: true, hint },
    ...sectionBits,
  });
  const pair = [
    field(wLabel(k), "ใส่ทศนิยมได้ เช่น 3.5"),
    field(
      hLabel(k),
      `ราคาคิดจากด้านที่ยาวที่สุด เศษไม่เกินครึ่งเซนติเมตรยังอยู่แถวเดิม (3.5 ซม. = แถว 3cm · 3.6 ซม. = แถว 4cm) · ด้านยาวสุดเกิน ${ASK_OVER} ${UNIT} แอดมินตีราคาให้`
    ),
  ];
  for (const f of pair) {
    const i = opts.findIndex((o) => o.label === f.label);
    if (i >= 0) opts[i] = { ...opts[i], ...f };
  }
  const missing = pair.filter((f) => !opts.some((o) => o.label === f.label));
  if (missing.length) opts.splice(opts.indexOf(size) + 1, 0, ...missing);
  addedFields += missing.length;

  // 4) ⚠️ กฎที่จำกัดรายชื่อขนาดของชิ้นนี้ ต้องอนุญาตตัวเลือกใหม่ด้วย ไม่งั้นมันหายเงียบ ๆ (ตอนนี้ยังไม่มี แต่กันไว้)
  for (const r of p.rules || []) {
    if (r.limit?.label?.trim() !== SIZE_LABEL) continue;
    if (!r.limit.allow.includes(CUSTOM)) {
      r.limit.allow.push(CUSTOM);
      ruleFix++;
    }
  }
}
// โน้ตกลุ่มขนาดชิ้นที่ 1 บอกช่วง 2-10cm — เติมว่ากำหนดเองได้
const s1 = opts.find((o) => o.label === sizeLabel(1));
if (s1.note && !s1.note.includes("กำหนดขนาดเอง")) s1.note = s1.note + " · หรือกำหนดขนาดเอง (ทศนิยมได้ ราคาคิดตามด้านยาวสุด)";

p.options = opts;
p.savedAt = new Date().toISOString();
console.log("ตัวเลือก custom ที่เพิ่ม:", addedChoices, "· ช่องกรอกที่เพิ่ม:", addedFields, "· กฎที่เติม allow:", ruleFix, "· กลุ่มรวม:", opts.length);
if (DRY) {
  const s2 = opts.find((o) => o.label === sizeLabel(2));
  console.log(JSON.stringify({ sizeInput2: s2.sizeInput, custom2: s2.choices.at(-1), w2: opts.find((o) => o.label === wLabel(2)) }, null, 1));
  process.exit(0);
}
const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");

// 5) อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q = back?.data;
if (q?.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ");
for (let k = 1; k <= PIECES; k++) {
  const qSize = (q.options || []).find((o) => o.label.trim() === sizeLabel(k));
  if (qSize?.sizeInput?.choice !== CUSTOM) die("อ่านกลับ sizeInput ไม่ตรง: " + sizeLabel(k));
  if (!qSize.choices.some((c) => c.name === CUSTOM)) die("อ่านกลับ ตัวเลือก custom หาย: " + sizeLabel(k));
  for (const l of [wLabel(k), hLabel(k)])
    if (!(q.options || []).some((o) => o.label === l && o.display === "input")) die("อ่านกลับ ช่องกรอกหาย: " + l);
  for (const r of q.rules || [])
    if (r.limit?.label?.trim() === sizeLabel(k) && !r.limit.allow.includes(CUSTOM)) die("อ่านกลับ กฎยังไม่ allow custom: " + sizeLabel(k));
}
console.log("✅ บันทึกแล้ว + อ่านกลับตรวจครบ 10 ชิ้น");
