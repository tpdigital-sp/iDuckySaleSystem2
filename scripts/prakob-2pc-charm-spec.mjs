/**
 * 🔗 อะคริลิคประกบ · เรท "พวงกุญแจประกบ 2 ชิ้น ใน 1 พวง" — เจ้าของร้านสั่ง 22 ก.ย. 69 (พร้อมภาพตารางราคา)
 *
 *  1) 💰 ราคา "ติ่งห้อย" ถูกกว่าตัวหลัก 1 ขั้นเสมอ (priceAsDriverTierShift: 1)
 *     11-49 พวง → ติ่งใช้แถว 50-199 (ตัวหลัก 5cm ฿69 · ติ่ง 3cm ฿45 ตามภาพ)
 *     1-10 พวง → ติ่งใช้แถว 11-49 เหมือนเดิม (ตรงกับใบเสนอราคา 6 พวง ฿269)
 *  2) 🏷 ชื่อหัวข้อบนหน้าสินค้าในเรทนี้: "ขนาด" → ตัวหลัก · "ขนาดชิ้นที่ 2" → ติ่งห้อย
 *     ("ขนาด" เป็นแกนตารางราคาของทุกเรท เปลี่ยนชื่อจริงไม่ได้ → ใช้ labelBy โชว์เฉพาะเรทนี้)
 *  3) 🖌 แยกงานสกรีนรายชิ้น: "ชิ้นที่ 1 (ตัวหลัก)" = กลุ่ม "งานสกรีน" เดิม
 *     "ชิ้นที่ 2 (ติ่งห้อย)" = กลุ่มใหม่ "งานสกรีน ติ่งห้อย" → ราคาติ่งอ่านช่องตารางของสกรีนชิ้นนั้น
 *     (เริ่มต้นตามชิ้นหลักผ่าน defaultBy — ลูกค้าเปลี่ยนเองได้)
 *
 * ⚠️ ต้อง deploy โค้ด priceAsDriverTierShift + labelBy (products.ts · ProductDetail) ก่อนเขียนจริง
 * ⚠️ เปลี่ยนชื่อกลุ่มจริง "ขนาดชิ้นที่ 2" → "ติ่งห้อย" (คีย์ในตะกร้า/ออเดอร์เปลี่ยนตาม)
 *    ตะกร้าที่ค้างไว้ก่อนรันจะไม่มีราคาติ่ง — ล้างตะกร้าแล้วเลือกใหม่
 *
 * รันซ้ำได้ (idempotent) · อ่านกลับมาเทียบทุกครั้ง
 *   node scripts/prakob-2pc-charm-spec.mjs            # dry-run
 *   node scripts/prakob-2pc-charm-spec.mjs --write    # เขียนจริง
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "acrylic-prakob";
const RATE_LABEL = "เรทราคา";
const SIZE = "ขนาด";
const SCREEN = "งานสกรีน";
const OLD_CHARM = "ขนาดชิ้นที่ 2";
const CHARM = "ติ่งห้อย";
const OLD_FIELD = "ขนาดกำหนดเอง ชิ้นที่ 2 (ด้านที่ยาวที่สุด)";
const FIELD = "ขนาดกำหนดเอง ติ่งห้อย (ด้านที่ยาวที่สุด)";
const SCREEN2 = "งานสกรีน ติ่งห้อย";
const HEAD_SIZE1 = "ตัวหลัก";
const HEAD_SCREEN1 = "ชิ้นที่ 1 (ตัวหลัก)";
const HEAD_SCREEN2 = "ชิ้นที่ 2 (ติ่งห้อย)";
const SHIFT = 1; // ติ่งห้อยถูกกว่าตัวหลัก 1 ขั้น
const MIN_TIER = 1; // และไม่ใช้แถวราคาปลีก
const CHARM_NOTE =
  "ชิ้นเล็กที่ห้อยเพิ่มในพวงเดียวกัน — คิดราคาตามตารางเดียวกันที่ขนาดของชิ้นนี้ " +
  "โดยใช้แถวราคาที่ถูกกว่าตัวหลัก 1 ขั้น (สั่ง 11-49 พวง = แถว 50-199 ชิ้น · ไม่ใช้ราคาปลีก)";
const SCREEN2_NOTE = "งานสกรีนของติ่งห้อย เลือกแยกจากชิ้นหลักได้ — เริ่มต้นตามชิ้นหลัก";
const RATE_DESC = (dealer) =>
  (dealer ? "ราคาตัวแทนจำหน่าย · " : "") +
  "ราคาต่อ 1 พวง (2 ชิ้น) · ชิ้นหลักคิดตามตารางเดียวกับพวงกุญแจประกบ · " +
  "ติ่งห้อย (ชิ้นที่ 2) คิดตามตารางเดียวกันที่ขนาด/งานสกรีนของชิ้นนั้น โดยใช้แถวที่ถูกกว่าตัวหลัก 1 ขั้น " +
  "(11-49 พวง = แถว 50-199 ชิ้น) · เนื้ออะคริลิคใช้ชุดเดียวกันทั้ง 2 ชิ้น";

const WRITE = process.argv.includes("--write");
const OUT = (process.argv.find((a) => a.startsWith("--out=")) || "").slice(6);
const die = (m) => { console.error("✗ " + m); process.exit(1); };
const clone = (v) => JSON.parse(JSON.stringify(v));

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const i = l.indexOf("=");
  if (i > 0 && !l.trim().startsWith("#")) a[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;
const opts = p.options || [];
const log = [];
const G = (l) => opts.find((o) => o.label.trim() === l);

const size = G(SIZE) || die(`ไม่พบกลุ่ม "${SIZE}"`);
const screen = G(SCREEN) || die(`ไม่พบกลุ่ม "${SCREEN}"`);
const charm = G(CHARM) || G(OLD_CHARM) || die(`ไม่พบกลุ่ม "${OLD_CHARM}" (รัน scripts/prakob-rate-2pieces.mjs ก่อน)`);

// ── เรทที่เป็น "2 ชิ้นใน 1 พวง" — อ่านจากเงื่อนไขของกลุ่มติ่งห้อยเอง ไม่ฮาร์ดโค้ดชื่อ
const rate2 = (charm.showWhen?.label === RATE_LABEL ? charm.showWhen.choices : []) || [];
if (!rate2.length) die("กลุ่มติ่งห้อยไม่ได้ผูกกับเรทราคา — ตรวจ showWhen ก่อน");
const rateLabels = (p.priceRates || []).map((r) => r.label);
for (const l of rate2) if (!rateLabels.includes(l)) die(`เรท "${l}" ไม่มีอยู่จริงในสินค้า`);
const byRate = (text) => ({ label: RATE_LABEL, map: Object.fromEntries(rate2.map((l) => [l, text])) });

// ── 1) เปลี่ยนชื่อกลุ่มจริง "ขนาดชิ้นที่ 2" → "ติ่งห้อย" (+ ช่องกรอกขนาดของมัน)
if (charm.label.trim() !== CHARM) {
  charm.label = CHARM;
  log.push(`เปลี่ยนชื่อกลุ่ม "${OLD_CHARM}" → "${CHARM}"`);
}
for (const o of opts) {
  for (const key of ["showWhen", "showWhenAlso"]) {
    if (o[key]?.label?.trim() === OLD_CHARM) { o[key] = { ...o[key], label: CHARM }; log.push(`ลาก ${key} ของ "${o.label}" ไปชื่อใหม่`); }
  }
  for (const key of ["showWhenAll", "showWhenAny"]) {
    if (Array.isArray(o[key])) o[key] = o[key].map((c) => (c.label?.trim() === OLD_CHARM ? { ...c, label: CHARM } : c));
  }
}
const field = G(FIELD) || G(OLD_FIELD) || die(`ไม่พบช่องกรอกขนาดของติ่งห้อย ("${OLD_FIELD}")`);
if (field.label.trim() !== FIELD) {
  field.label = FIELD;
  log.push(`เปลี่ยนชื่อช่องกรอก "${OLD_FIELD}" → "${FIELD}"`);
}
if (charm.sizeInput) {
  charm.sizeInput = {
    ...charm.sizeInput,
    widthLabel: FIELD,
    ...(charm.sizeInput.heightLabel ? { heightLabel: FIELD } : {}),
  };
}

// ── 2) ราคาติ่งห้อย: ถูกกว่าตัวหลัก 1 ขั้น + อ่านงานสกรีนของชิ้นตัวเอง
if (charm.priceAsDriverTierShift !== SHIFT) { charm.priceAsDriverTierShift = SHIFT; log.push(`ติ่งห้อย: เลื่อนแถวราคาลง ${SHIFT} ขั้นจากตัวหลัก`); }
if (charm.priceAsDriverMinTier !== MIN_TIER) { charm.priceAsDriverMinTier = MIN_TIER; log.push("ติ่งห้อย: ไม่ใช้แถวราคาปลีก"); }
const also = { ...(charm.priceAsDriverAlso || {}), [SCREEN]: SCREEN2 };
if (JSON.stringify(charm.priceAsDriverAlso) !== JSON.stringify(also)) { charm.priceAsDriverAlso = also; log.push(`ติ่งห้อย: ราคาอ่านงานสกรีนจากกลุ่ม "${SCREEN2}"`); }
if (charm.note !== CHARM_NOTE) { charm.note = CHARM_NOTE; log.push("ติ่งห้อย: แก้คำอธิบายกลุ่ม"); }

// ── 3) ชื่อหัวข้อที่โชว์เฉพาะเรท 2 ชิ้น (ชื่อกลุ่มจริงไม่เปลี่ยน — เป็นแกนตารางราคาของทุกเรท)
const setLabelBy = (o, text) => {
  const want = byRate(text);
  if (JSON.stringify(o.labelBy) === JSON.stringify(want)) return;
  o.labelBy = want;
  log.push(`หัวข้อกลุ่ม "${o.label}" ในเรท 2 ชิ้น → "${text}"`);
};
setLabelBy(size, HEAD_SIZE1);
setLabelBy(screen, HEAD_SCREEN1);

// ── 4) กลุ่มงานสกรีนของติ่งห้อย (ตัวเลือกชุดเดียวกับชิ้นหลัก · เริ่มต้นตามชิ้นหลัก)
const mkScreen2 = () => ({
  label: SCREEN2,
  choices: clone(screen.choices),
  ...(screen.display ? { display: screen.display } : {}),
  ...(screen.section ? { section: screen.section } : {}),
  note: SCREEN2_NOTE,
  showWhen: { label: RATE_LABEL, choices: [...rate2] },
  defaultBy: { label: SCREEN, map: Object.fromEntries(screen.choices.map((c) => [c.name, c.name])) },
  labelBy: byRate(HEAD_SCREEN2),
});
let screen2 = G(SCREEN2);
if (!screen2) {
  screen2 = mkScreen2();
  opts.splice(opts.indexOf(screen) + 1, 0, screen2);
  log.push(`เพิ่มกลุ่ม "${SCREEN2}" (${screen2.choices.length} ตัวเลือก) ต่อท้ายกลุ่มงานสกรีน`);
} else {
  const want = mkScreen2();
  if (JSON.stringify(screen2) !== JSON.stringify(want)) {
    Object.assign(screen2, want);
    log.push(`ปรับกลุ่ม "${SCREEN2}" ให้ตรงชุดตัวเลือก/เงื่อนไขล่าสุด`);
  }
}

// ── 5) คำอธิบายเรท
for (const r of p.priceRates || []) {
  if (!rate2.includes(r.label)) continue;
  const want = RATE_DESC(/\(ตัวแทน\)/.test(r.label));
  if (r.desc !== want) { r.desc = want; log.push(`แก้คำอธิบายเรท "${r.label}"`); }
}

// ── ตรวจก่อนเขียน
const stale = JSON.stringify(p).includes(OLD_CHARM);
if (stale) die(`ยังมีชื่อเดิม "${OLD_CHARM}" ค้างอยู่ในข้อมูลสินค้า`);
for (const c of charm.choices || []) {
  if (c.name === charm.sizeInput?.choice) continue;
  if (!screen2.choices.length) die("กลุ่มงานสกรีนของติ่งห้อยไม่มีตัวเลือก");
}
console.log(log.length ? log.map((l) => "• " + l).join("\n") : "✔ ตรงตามที่ต้องการอยู่แล้ว ไม่มีอะไรต้องแก้");
// จำลองผลลัพธ์ลงไฟล์ไว้ตรวจราคาด้วยฟังก์ชันจริงก่อนเขียนฐาน (scripts/prakob-rate-2pieces-check.mts --file=)
if (OUT) { fs.writeFileSync(OUT, JSON.stringify(p, null, 1)); console.log(`\n📄 จำลองลงไฟล์ ${OUT} แล้ว (ยังไม่แตะฐาน)`); process.exit(0); }
if (!log.length) process.exit(0);
if (!WRITE) { console.log("\n— dry-run · ใส่ --write เพื่อเขียนจริง (ต้อง deploy โค้ด priceAsDriverTierShift + labelBy ก่อน)"); process.exit(0); }

p.savedAt = new Date().toISOString();
const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");

// ── อ่านกลับเทียบ
const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q = back?.data;
if (q?.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง");
const qg = (l) => (q.options || []).find((o) => o.label.trim() === l);
const qc = qg(CHARM) || die("อ่านกลับ ไม่พบกลุ่มติ่งห้อย");
if (qc.priceAsDriverTierShift !== SHIFT || qc.priceAsDriverMinTier !== MIN_TIER) die("อ่านกลับ กติกาแถวราคาของติ่งห้อยไม่ตรง");
if (qc.priceAsDriverAlso?.[SCREEN] !== SCREEN2) die("อ่านกลับ ติ่งห้อยยังไม่ได้อ่านงานสกรีนของตัวเอง");
if (qc.sizeInput?.widthLabel !== FIELD || !qg(FIELD)) die("อ่านกลับ ช่องกรอกขนาดติ่งห้อยไม่ตรง");
const q2 = qg(SCREEN2) || die("อ่านกลับ ไม่พบกลุ่มงานสกรีนของติ่งห้อย");
if (q2.choices.length !== screen.choices.length) die("อ่านกลับ ตัวเลือกงานสกรีนของติ่งห้อยไม่ครบ");
for (const [k, v] of Object.entries(q2.defaultBy?.map || {})) if (!q2.choices.some((c) => c.name === v)) die(`ค่าเริ่มต้นของ "${k}" = "${v}" ไม่ตรงชื่อตัวเลือกจริง`);
for (const [o, want] of [[qg(SIZE), HEAD_SIZE1], [qg(SCREEN), HEAD_SCREEN1], [q2, HEAD_SCREEN2]])
  for (const l of rate2) if (o.labelBy?.map?.[l] !== want) die(`อ่านกลับ หัวข้อของ "${o.label}" ในเรท "${l}" ไม่ตรง`);
if (JSON.stringify(q).includes(OLD_CHARM)) die(`อ่านกลับ ยังมีชื่อเดิม "${OLD_CHARM}" ค้างอยู่`);
console.log("\n✅ บันทึกแล้ว + อ่านกลับตรวจครบ");
