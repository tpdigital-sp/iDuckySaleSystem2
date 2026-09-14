#!/usr/bin/env node
/**
 * 📐 พวงกุญแจเขย่า Shake Shake Acrylic (new-mt2rp5i3-9488)
 * — "ตัวน้อยเขย่า" กำหนดขนาดเองได้ เล็กสุด 1.2 ซม. · ใหญ่กว่ามาตรฐานคิดเพิ่ม ซม. ละ 10 บาท
 *   (เจ้าของร้านสั่ง 14 ก.ย. 69: "ตัวเขย่าได้เล็กสุด 1.2 ซม. อยากให้กำหนดขนาดเองได้ · เพิ่มขนาดได้ เซนละ 10 บาท")
 *
 *   node scripts/shake-shake-charm-custom-size.mjs          # ดูก่อนว่าจะแก้อะไร (dry-run)
 *   node scripts/shake-shake-charm-custom-size.mjs --write   # เขียนลงฐานข้อมูล + อ่านกลับมาเทียบ
 *
 * ทำอะไร (ข้อมูลล้วน ไม่ต้องแก้โค้ด/deploy):
 *  1. เพิ่มตัวเลือก "📐 กำหนดขนาดเอง (เล็กสุด 1.2 ซม.)" ในกลุ่ม "ตัวน้อยเขย่า" — ระบุจำนวนตัวได้เหมือนแถวมาตรฐาน
 *     ราคา = ค่าตัวน้อยมาตรฐาน (ปลีก/ส่งตามจำนวนชุด ผ่าน extraTiers) + ค่าเพิ่มขนาดตาม `choice.sizeFee`
 *     • ไม่เกิน 2.5 ซม. (รวม 1.2 ซม.) = ราคาเท่าตัวน้อยมาตรฐาน
 *     • ใหญ่กว่านั้น ซม. ละ 10 บาท ปัดขึ้นเต็มเซนติเมตรจาก 2.5 (3 ซม.=+10 · 4 ซม.=+20 …)
 *       — เลขเดียวกับบันได "ตัวน้อยเขย่า ขนาดพิเศษ" 3/4/5/6 ซม. ที่มีอยู่แล้ว (สคริปต์ assert ให้ตรงกัน)
 *  2. ช่องกรอก "ขนาดตัวน้อยเขย่า (กำหนดเอง)" — โผล่เมื่อติ๊กตัวเลือกข้างบน (ทศนิยมได้ · 1.2-20 ซม.)
 *     ⚠️ ใช้ `sizeFee` ไม่ใช่ `sizeInput` เพราะกลุ่มนี้เป็นกลุ่มติ๊กหลายอย่าง+ระบุจำนวน
 *        (sizeInput เทียบ selections[label] แบบตรงตัว ใช้กับกลุ่มติ๊กหลายอย่างไม่ได้)
 *        และ `extraTiers` ไม่ใช่ extra/extraBelow เพราะขา extraBelow ของ choiceExtraAtQty ไม่บวก sizeFee
 *  3. แก้ข้อความให้ตรงกัน: คำอธิบาย · ไฮไลต์ · แท็บรายละเอียด · FAQ · note ของกลุ่ม
 *
 * รันซ้ำได้ (idempotent) — ทำไปแล้วจะไม่มีอะไรเปลี่ยน · อ่านกลับมาเทียบทุกครั้ง
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ID = "new-mt2rp5i3-9488";
const CHARM = "ตัวน้อยเขย่า";                     // กลุ่มตัวน้อยมาตรฐาน (แถว 2-2.5 ซม.)
const SPECIAL = "ตัวน้อยเขย่า ขนาดพิเศษ";           // บันได 3/4/5/6 ซม. ที่มีอยู่แล้ว
const CUSTOM = "📐 กำหนดขนาดเอง (เล็กสุด 1.2 ซม.)";
const FIELD = "ขนาดตัวน้อยเขย่า (กำหนดเอง)";
const UNIT = "ซม.";
const MIN_CM = 1.2;      // เล็กสุดที่ทำได้ (เจ้าของร้านแจ้ง)
const FREE_CM = 2.5;     // ไม่เกินนี้ = ราคาเท่าตัวน้อยมาตรฐาน
const PER_CM = 10;       // เกิน 2.5 ซม. คิดเพิ่ม ซม. ละ 10 บาท (ปัดขึ้นเต็มเซนติเมตร)
const MAX_CM = 20;       // เพดานช่องกรอก (ตัวน้อยต้องเล็กกว่ากรอบอยู่แล้ว)

const WRITE = process.argv.includes("--write");
/** --out <ไฟล์> = เขียนผลลัพธ์ลงไฟล์ไว้ทดสอบก่อน (ไม่แตะฐานข้อมูล) — คู่กับ check --file */
const OUT = (process.argv.find((a) => a.startsWith("--out=")) || "").slice(6);
const die = (m) => { console.error("✗ " + m); process.exit(1); };
/** stringify แบบเรียงคีย์ — JSONB ไม่รักษาลำดับคีย์ เทียบตรง ๆ จะไม่เท่ากันทั้งที่ค่าเดียวกัน */
const canon = (v) =>
  Array.isArray(v)
    ? "[" + v.map(canon).join(",") + "]"
    : v && typeof v === "object"
      ? "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}"
      : JSON.stringify(v);

const env = readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;
const opts = p.options || [];
const before = canon(p);

const charm = opts.find((o) => o.label.trim() === CHARM);
if (!charm) die(`ไม่พบกลุ่ม "${CHARM}"`);
const special = opts.find((o) => o.label.trim() === SPECIAL);
if (!special) die(`ไม่พบกลุ่ม "${SPECIAL}"`);

// ── ราคาฐานของตัวน้อย อ่านสดจากแถวมาตรฐาน (ไม่ฮาร์ดโค้ด — ตารางเว็บเปลี่ยนเมื่อไหร่ต้องรู้ตัว)
const std = charm.choices.find((c) => c.name !== CUSTOM);
if (!std) die("ไม่พบแถวตัวน้อยมาตรฐาน");
const FROM_QTY = Math.floor(charm.extraFromQty ?? 0);
if (FROM_QTY !== 11) die(`กลุ่ม "${CHARM}" extraFromQty = ${FROM_QTY} (คาด 11) — เรทเปลี่ยน ตรวจก่อน`);
const RETAIL = Number(std.extraBelow);      // 1-10 ชุด ตัวละ 20
const WHOLE = Number(std.extra);            // 11 ชุดขึ้นไป ตัวละ 15
if (!(RETAIL > 0 && WHOLE > 0)) die("แถวมาตรฐานไม่มี extra/extraBelow ครบ");

// ── assert ว่าบันไดขนาดพิเศษยังเป็น "ฐาน + ซม. ละ 10 ปัดขึ้นจาก 2.5" จริง (ราคาสองทางต้องตรงกัน)
const stepFee = (cm) => Math.max(0, Math.ceil(cm - FREE_CM - 1e-9)) * PER_CM;
for (const c of special.choices) {
  const cm = Number(String(c.name).match(/\d+(\.\d+)?/)?.[0]);
  if (!cm) die(`อ่านขนาดจากชื่อ "${c.name}" ไม่ออก`);
  const want = { extra: WHOLE + stepFee(cm), extraBelow: RETAIL + stepFee(cm) };
  if (Number(c.extra) !== want.extra || Number(c.extraBelow) !== want.extraBelow)
    die(`บันได "${c.name}" = ${c.extraBelow}/${c.extra} แต่สูตร ฐาน+${PER_CM}/ซม. ได้ ${want.extraBelow}/${want.extra} — ราคาเปลี่ยน ตรวจก่อน`);
}

// ── 1) ตัวเลือกกำหนดขนาดเอง (ต่อท้ายแถวมาตรฐาน)
//    ขั้นราคาตามด้านยาวสุด: ≤2.5 ฟรี · 2.5-3.5 +10 · 3.5-4.5 +20 … (ปัดขึ้นเต็มเซนติเมตรจาก 2.5)
const tiers = [{ upTo: FREE_CM, fee: 0 }];
for (let n = 1; FREE_CM + n <= MAX_CM + 1; n++) tiers.push({ upTo: FREE_CM + n, fee: n * PER_CM });
const customChoice = {
  name: CUSTOM,
  qty: true,
  qtyUnit: "ตัว",
  qtyMax: std.qtyMax ?? 30,
  // ⚠️ ต้องมี extra ไว้เป็น "ขั้นแรก" ด้วย — ที่ที่ยังไม่รู้จำนวน (ช่วงราคา/หน้ารายการ) อ่านค่านี้
  extra: RETAIL,
  extraTiers: [{ upTo: FROM_QTY - 1, extra: RETAIL }, { upTo: null, extra: WHOLE }],
  sizeFee: {
    when: { label: CHARM, choices: [CUSTOM] },   // ไม่ได้ติ๊กตัวนี้ = ไม่อ่านค่าค้างในช่องกรอก
    widthLabel: FIELD,
    heightLabel: FIELD,                          // กรอกด้านยาวสุดช่องเดียว (ชี้ช่องเดียวกัน)
    tiers,
  },
};
const iCustom = charm.choices.findIndex((c) => c.name === CUSTOM);
if (iCustom >= 0) charm.choices[iCustom] = customChoice;
else charm.choices.push(customChoice);

// ── 2) ช่องกรอกขนาด (โผล่เมื่อติ๊กตัวเลือกข้างบน) · ชุดตัวเลือกเดียวกับกลุ่มตัวน้อย ไม่งั้นโผล่นอกกรอบ
const field = {
  label: FIELD,
  choices: [],                 // ⚠️ ช่องกรอกก็ต้องมี choices: [] เสมอ (หลายที่เรียก opt.choices ตรง ๆ)
  display: "input",
  standardInput: true,
  section: charm.section,
  showWhen: { label: CHARM, choices: [CUSTOM] },
  input: {
    kind: "number",
    unit: UNIT,
    min: MIN_CM,
    max: MAX_CM,
    required: true,
    placeholder: "1.2",
    hint: `วัดด้านที่ยาวที่สุดของตัวน้อย ใส่ทศนิยมได้ · เล็กสุด ${MIN_CM} ${UNIT} · ไม่เกิน ${FREE_CM} ${UNIT} ราคาเท่าตัวน้อยมาตรฐาน · ใหญ่กว่านั้นคิดเพิ่ม ${UNIT} ละ ${PER_CM} บาท (ปัดขึ้นเต็มเซนติเมตรจาก ${FREE_CM}) · ตัวน้อยต้องเล็กกว่ากรอบเขย่า`,
  },
};
const iField = opts.findIndex((o) => o.label === FIELD);
if (iField >= 0) opts[iField] = field;
else opts.splice(opts.indexOf(charm) + 1, 0, field);

// ── 3) ข้อความ
// 📝 จัดเป็นบรรทัด (หัวข้อย่อย "• ") — ย่อหน้าเดียวยาว ๆ ที่มีชิปแทรกกลางอ่านยาก (เจ้าของร้านทัก 14 ก.ย. 69)
charm.note =
  "ชิ้นอะคริลิคเล็กที่ลอยเขย่าอยู่ในกรอบ (หนา 1-1.5 มม.) ระบุจำนวนตัวต่อ 1 ชุด\n" +
  `• ราคา: 1-10 ชุด **ตัวละ ${RETAIL} บาท** · 11 ชุดขึ้นไป **ตัวละ ${WHOLE} บาท**\n` +
  `• ขนาดอื่น: ติ๊ก **กำหนดขนาดเอง** แล้วกรอก — เล็กสุด ${MIN_CM} ซม. · ไม่เกิน ${FREE_CM} ซม. ราคาเท่ากัน · ใหญ่กว่านั้น ซม. ละ ${PER_CM} บาท`;

/** แทนข้อความแบบรันซ้ำได้ — มีของใหม่แล้วข้าม · ไม่เจอของเก่า = หยุด (อย่าเดา) */
const swap = (text, oldStr, newStr, where) => {
  if (text.includes(newStr)) return text;
  if (!text.includes(oldStr)) die(`ไม่เจอข้อความเดิมใน ${where}: ${oldStr.slice(0, 60)}…`);
  return text.replace(oldStr, newStr);
};

p.description = swap(
  p.description,
  "ใส่ตัวน้อย 2-2.5 ซม. ลอยเขย่าได้",
  `ใส่ตัวน้อยลอยเขย่าได้ กำหนดขนาดเองเล็กสุด ${MIN_CM} ซม.`,
  "คำอธิบาย"
);

p.highlights = (p.highlights || []).map((h) =>
  h.startsWith("ตัวน้อยเขย่า ตัวละ")
    ? swap(h, "— ใส่กี่ตัวก็ได้", `— ใส่กี่ตัวก็ได้ · กำหนดขนาดเองได้ เล็กสุด ${MIN_CM} ซม. (ใหญ่กว่า ${FREE_CM} ซม. คิดเพิ่ม ซม. ละ ${PER_CM} บาท)`, "ไฮไลต์")
    : h
);

const tabDetail = (p.tabs || []).find((t) => t.title === "รายละเอียดเพิ่มเติม");
if (!tabDetail) die("ไม่เจอแท็บ รายละเอียดเพิ่มเติม");
tabDetail.text = swap(
  tabDetail.text,
  "• ตัวน้อยเขย่า หนา 1-1.5 มม. ขนาด 2-2.5 ซม. — ลอยอยู่ในช่องตัวกลาง เขย่าแล้วขยับได้",
  `• ตัวน้อยเขย่า หนา 1-1.5 มม. ขนาด 2-2.5 ซม. (กำหนดขนาดเองได้ เล็กสุด ${MIN_CM} ซม.) — ลอยอยู่ในช่องตัวกลาง เขย่าแล้วขยับได้`,
  "แท็บรายละเอียด (โครงสร้าง)"
);
tabDetail.text = swap(
  tabDetail.text,
  `• ตัวน้อยเขย่า ขนาด 2-2.5 ซม. — สั่ง 1-10 ชุด ตัวละ ${RETAIL} บาท · 11 ชุดขึ้นไป ตัวละ ${WHOLE} บาท`,
  `• ตัวน้อยเขย่า ขนาด 2-2.5 ซม. — สั่ง 1-10 ชุด ตัวละ ${RETAIL} บาท · 11 ชุดขึ้นไป ตัวละ ${WHOLE} บาท\n` +
    `• กำหนดขนาดตัวน้อยเองได้ เล็กสุด ${MIN_CM} ซม. — ไม่เกิน ${FREE_CM} ซม. ราคาเท่าตัวน้อยมาตรฐาน · ใหญ่กว่านั้นคิดเพิ่ม ซม. ละ ${PER_CM} บาท (ปัดขึ้นเต็มเซนติเมตรจาก ${FREE_CM} ซม. เช่น 4 ซม. = +${stepFee(4)} บาท)`,
  "แท็บรายละเอียด (ราคา)"
);

const faq = (p.seo?.faqs || []).find((f) => f.q.includes("ตัวน้อยเขย่าคืออะไร"));
if (!faq) die("ไม่เจอ FAQ ตัวน้อยเขย่าคืออะไร");
faq.a = swap(
  faq.a,
  `คิดตัวละ ${RETAIL} บาท หรือตัวละ ${WHOLE} บาทเมื่อสั่ง 11 ชุดขึ้นไป`,
  `คิดตัวละ ${RETAIL} บาท หรือตัวละ ${WHOLE} บาทเมื่อสั่ง 11 ชุดขึ้นไป · กำหนดขนาดตัวน้อยเองได้ เล็กสุด ${MIN_CM} ซม. ใหญ่กว่า ${FREE_CM} ซม. คิดเพิ่ม ซม. ละ ${PER_CM} บาท`,
  "FAQ"
);

p.options = opts;
const changed = canon({ ...p, savedAt: row.data.savedAt }) !== before;
console.log(
  `ตัวน้อยมาตรฐาน ปลีก ฿${RETAIL} / ส่ง ฿${WHOLE} · เพิ่มขนาด ซม. ละ ฿${PER_CM} · ขั้นราคา ${tiers.length} ขั้น (${MIN_CM}-${MAX_CM} ${UNIT})`
);
console.log("ตัวอย่าง: 1.2 → +฿0 · 2.5 → +฿0 · 3 → +฿" + stepFee(3) + " · 4.5 → +฿" + stepFee(4.5) + " · 6 → +฿" + stepFee(6));
console.log(changed ? "มีของต้องเปลี่ยน" : "ไม่มีอะไรเปลี่ยน (ทำไปแล้ว)");
if (OUT) {
  writeFileSync(OUT, JSON.stringify(p, null, 1));
  console.log("เขียนไฟล์ทดสอบแล้ว: " + OUT + " (ยังไม่แตะฐานข้อมูล)");
  process.exit(0);
}
if (!WRITE) {
  console.log(JSON.stringify({ customChoice, field }, null, 1));
  console.log("— dry-run · ใส่ --write เพื่อเขียนจริง");
  process.exit(0);
}

p.savedAt = new Date().toISOString();
const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");

// ── อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q = back?.data;
if (q?.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ");
const qCharm = (q.options || []).find((o) => o.label.trim() === CHARM);
const qCustom = qCharm?.choices.find((c) => c.name === CUSTOM);
if (!qCustom) die("อ่านกลับ ตัวเลือกกำหนดขนาดเองหาย");
if (qCustom.sizeFee?.widthLabel !== FIELD || qCustom.sizeFee?.tiers?.length !== tiers.length) die("อ่านกลับ sizeFee ไม่ครบ");
if (!qCustom.qty || qCustom.extraTiers?.length !== 2) die("อ่านกลับ ช่องจำนวน/ขั้นราคาไม่ครบ");
const qField = (q.options || []).find((o) => o.label === FIELD);
if (!qField || qField.display !== "input" || qField.input?.min !== MIN_CM || qField.input?.integer === true)
  die("อ่านกลับ ช่องกรอกหาย/ตั้งค่าไม่ตรง");
if (qField.section !== qCharm.section) die("อ่านกลับ ช่องกรอกอยู่คนละชุดกับกลุ่มตัวน้อย");
if (!q.description.includes(String(MIN_CM))) die("อ่านกลับ คำอธิบายยังไม่มีขนาดเล็กสุด");
console.log("✅ บันทึกแล้ว + อ่านกลับตรวจครบ");
