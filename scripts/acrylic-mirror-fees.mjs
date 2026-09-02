#!/usr/bin/env node
/**
 * อะคริลิคกระจก (new-mt2rqayf-7835) — ปรับกติกาค่าอะไหล่/ค่าฐาน/ค่าคละ ตามที่ผู้ใช้สั่ง 2 ก.ย. 69
 *
 *   node scripts/acrylic-mirror-fees.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/acrylic-mirror-fees.mjs --write   # บันทึกจริง
 *
 * 1) 🪝 พวงกุญแจกระจก — ตะขอฟรีช่วงปลีก 1-10 ชิ้น (ตรรกะเดียวกับสินค้าพวงกุญแจอะคริลิค
 *    keyring-copy-copy / acrylic-prakob): extraFromQty = 11 ที่กลุ่ม "ตะขอ" และกลุ่ม "สีตะขอ *"
 *    ทั้ง 13 กลุ่ม → 1-10 ชิ้นไม่บวกอะไรเลย · 11 ชิ้นขึ้นไปคิดตามราคาอะไหล่จริง
 *
 * 2) 🧱 สแตนดี้กระจก — ค่าฐานคิดตามตรรกะ "สแตนดี้อะคริลิค หมุนได้" (standee-rotating):
 *    ฐาน 2-5 ซม. = ขนาดมาตรฐาน รวมในราคาแล้ว · ใหญ่กว่านั้นบวกตาม ซม.
 *    (1-10 ชิ้น ซม.ละ 15 = extraBelow · 11 ชิ้นขึ้นไป ซม.ละ 10 = extra)
 *    ⚠️ ของเดิมยกชุดมาจาก standy (2-5cm +10 เฉพาะเรทส่ง · ปลีกฟรีถึง 6cm · ส่ง +5/ซม.)
 *    ค่าสกรีนฐาน "ยังเหมา +10 ทุกขนาด" ตามแผ่นราคาของหน้า /อคลกระจก เอง (rot คิด 10/15/20/25
 *    ตามขนาดฐาน — ถ้าจะเอาแบบนั้นด้วย บอกได้ แก้ที่ PRINT_FEE_BY_SIZE ในไฟล์นี้)
 *
 * 3) 🎨 ค่าอะคริลิคพิเศษของฐาน = ชุดกลางของ standy — ตรวจว่าตรงกันเป๊ะทั้ง 19 กลุ่ม (ตรงอยู่แล้ว
 *    ตั้งแต่ตอน build) สคริปต์นี้แค่ assert ไว้กันหลุดตอนแก้ค่าฐาน
 *
 * 4) 🧩 ค่าคละลาย — 11 ชิ้นขึ้นไป ขั้นต่ำลายละ 5 ชิ้น · เกินโควตาคิด "ลายละ 5 บาท"
 *    (extraDesignFee 5 แทน underMinPieceFee 5 ที่เป็นชิ้นละ 5)
 *    ⚠️ ถอด tierByDesign ออกด้วย — ไม่งั้นคละเกินโควตาโดนสองเด้ง (ราคาตกไปเรทปลีก + ค่าคละ)
 *    ตรงกับสินค้าอีก 19 เรทในฐานข้อมูลที่ใช้ extraDesignFee ซึ่งไม่มีตัวไหนตั้ง tierByDesign เลย
 *
 * รันซ้ำได้ (idempotent) — คิดค่าจากสูตรใหม่ทุกครั้ง ไม่ได้บวกทับของเดิม
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const TGT_ID = "new-mt2rqayf-7835"; // อะคริลิคกระจก
const SRC_BASE = "standy"; // ต้นแบบชุดเฉดสีพิเศษของฐาน

const HOOK_GROUP = "ตะขอ";
const HOOK_FROM_QTY = 11; // 1-10 ชิ้น = ตะขอ/สีตะขอ ฟรี
const FORM_GROUP = "รูปแบบงาน";
const FORM_KEYRING = "พวงกุญแจกระจก";
// ห่วง/โซ่สีเงินพื้นฐาน — ผู้ใช้สั่ง 2 ก.ย. 69 ให้ฟรีทุกเรทราคา (ไม่ใช่แค่ช่วงปลีก)
const FREE_HOOKS = ["Z1 ห่วงกลม (สีเงิน)", "Z2 โซ่ไข่ปลา (สีเงิน)"];
const BASE_SIZE_GROUP = "ขนาดฐาน";
const BASE_MIN_CM = 3; // ฐานเล็กสุดที่ร้านมี (ผู้ใช้เคาะ 2 ก.ย. 69 — ถอด 2cm ที่เคยเดาไว้ออก)
/**
 * 💵 ตารางค่าฐาน "ตามภาพแผ่นราคาของร้าน" (ผู้ใช้ส่งมา 2 ก.ย. 69) — ราคาเดียวทุกจำนวน ไม่มีเรทปลีก/ส่ง
 *   ไม่สกรีนฐาน  3-5cm 10 · 6-7cm 15 · 8cm 20 · 9cm 25 · 10cm 30 … เพิ่มขึ้น ซม.ละ 5 (20cm = 80)
 *   สกรีนฐาน     = แถวบน +10 ทุกช่อง → คิดที่ตัวเลือก "สกรีนฐาน" ของกลุ่ม "ฐานสแตนดี้"
 *   หัวตาราง "เพิ่มขนาด ตั้งแต่ 21cm ขึ้นไปบวกเพิ่ม cm ละ 5 บาท" = สูตรเดียวกันต่อไปเรื่อย ๆ
 * ตรงกับชุดกลางของ standy (สคริปต์ assert ให้ทุกครั้ง)
 */
const baseFeeOf = (cm) => (cm <= 5 ? 10 : cm <= 7 ? 15 : 20 + (cm - 8) * 5);
const SHADE_PREFIX = "เลือกสีพิเศษของฐาน";
const MIX_MIN_PER_DESIGN = 5;
const MIX_EXTRA_DESIGN_FEE = 5;
const MIX_FREE_BELOW = 11;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const load = async (id) => {
  const { data, error } = await sb.from("products").select("id,name,data").eq("id", id).single();
  if (error) throw new Error(`โหลด ${id} ไม่ได้ — ${error.message}`);
  return data;
};
const tgt = await load(TGT_ID);
const standy = await load(SRC_BASE);
const d = JSON.parse(JSON.stringify(tgt.data));
const log = [];
const optOf = (data, label) => (data.options ?? []).find((o) => o.label === label);

/* ── 1) ตะขอฟรีช่วงปลีก 1-10 ชิ้น ─────────────────────────────────────── */
const hook = optOf(d, HOOK_GROUP);
if (!hook) throw new Error(`ไม่เจอกลุ่ม "${HOOK_GROUP}" — โครงสินค้าเปลี่ยน`);
if (hook.smallQtyFee) throw new Error("กลุ่มตะขอมีค่าเหมาช่วงสั่งน้อย (smallQtyFee) ค้างอยู่ — ตรวจก่อนว่าจะเอายังไง");
const hookGroups = [hook, ...(d.options ?? []).filter((o) => o.label.startsWith("สีตะขอ"))];
for (const o of hookGroups) o.extraFromQty = HOOK_FROM_QTY;
hook.note =
  "เจาะรูตะขอให้ฟรี ไม่มีค่าเจาะ — เลือกตะขอ/ห่วงได้ 1 แบบต่อชิ้น · **ห่วง Z1 / โซ่ Z2 (สีเงิน) แถมฟรีทุกจำนวน** · " +
  "สั่ง 1-10 ชิ้น ตะขอฟรีทุกแบบ · ตั้งแต่ 11 ชิ้นขึ้นไปแบบอื่นคิดตามราคาอะไหล่จริง (ประมาณ 2-15 บาท/ชิ้น) · " +
  "กดรูปแผ่นอะไหล่ด้านล่างดูของจริงทุกแบบได้ (หรือดูในแท็บ “ตะขอ / ห่วง” ท้ายหน้า) · ต้องการหลายแบบ แจ้งในหมายเหตุถึงร้าน";
log.push(`ตะขอฟรี 1-10 ชิ้น — ตั้ง extraFromQty ${HOOK_FROM_QTY} ให้ ${hookGroups.length} กลุ่ม (ตะขอ + สีตะขอ ${hookGroups.length - 1})`);

// 🎁 Z1/Z2 ฟรีทุกเรทราคา — ใช้ freeWhen ผูกกับ "รูปแบบงาน = พวงกุญแจกระจก" ซึ่งเป็นเงื่อนไขที่
// กลุ่มตะขอโผล่อยู่แล้ว (showWhen เดียวกัน) = จริงเสมอเมื่อเห็นกลุ่มนี้ → ฟรีทุกจำนวน ทุกเรท
// (เก็บ extra ราคาอะไหล่จริงไว้ในตัวเลือกเหมือนเดิม ไม่ได้ล้างเป็น 0 — เผื่อวันหลังเลิกแถม)
const missingFree = FREE_HOOKS.filter((n) => !hook.choices.some((c) => c.name === n));
if (missingFree.length) throw new Error(`ไม่เจอตัวเลือกตะขอที่จะแถมฟรี: ${missingFree.join(" · ")}`);
const formGate = optOf(d, FORM_GROUP);
if (!formGate?.choices.some((c) => c.name === FORM_KEYRING)) throw new Error(`ไม่เจอ "${FORM_GROUP} = ${FORM_KEYRING}"`);
hook.freeWhen = { choices: [...FREE_HOOKS], when: { label: FORM_GROUP, choices: [FORM_KEYRING] } };
log.push(`แถมฟรีทุกเรท — ${FREE_HOOKS.join(" · ")} (freeWhen ผูก ${FORM_GROUP} = ${FORM_KEYRING})`);

/* ── 2) ค่าฐาน = ตารางบนแผ่นราคาของร้าน (ราคาเดียวทุกจำนวน) ──────────── */
const baseSize = optOf(d, BASE_SIZE_GROUP);
if (!baseSize) throw new Error(`ไม่เจอกลุ่ม "${BASE_SIZE_GROUP}"`);
const cmOf = (name) => {
  const cm = parseInt(String(name), 10);
  if (!Number.isFinite(cm)) throw new Error(`อ่านขนาดฐานจาก "${name}" ไม่ออก`);
  return cm;
};
// ฐานเล็กกว่า 3 ซม. ไม่มีขาย — ถอดตัวเลือกและกลุ่มเฉดสีพิเศษที่ผูกกับขนาดนั้นออกด้วย
const dropped = baseSize.choices.filter((c) => cmOf(c.name) < BASE_MIN_CM).map((c) => c.name);
baseSize.choices = baseSize.choices.filter((c) => cmOf(c.name) >= BASE_MIN_CM);
if (dropped.length) {
  const gone = (d.options ?? []).filter(
    (o) => o.label.startsWith(SHADE_PREFIX) && dropped.includes(o.showWhen?.choices?.[0])
  );
  d.options = (d.options ?? []).filter((o) => !gone.includes(o));
  log.push(`ถอดขนาดฐานที่เล็กกว่า ${BASE_MIN_CM} ซม. — ${dropped.join(" · ")} (พร้อมกลุ่มเฉดสีพิเศษ ${gone.length} กลุ่ม)`);
}
// ราคาเดียวทุกจำนวน → ไม่มีขั้นปลีก/ส่ง (ถอด extraFromQty + extraBelow ของชุด standy ออก)
delete baseSize.extraFromQty;
const feeRows = [];
for (const c of baseSize.choices) {
  c.extra = baseFeeOf(cmOf(c.name));
  delete c.extraBelow;
  feeRows.push(`${cmOf(c.name)}cm +${c.extra}`);
}
// ตารางนี้เป็นชุดเดียวกับค่าฐานของ standy — ถ้าไม่ตรงแปลว่าอ่านตารางผิด/ร้านเปลี่ยนราคา
const standyFee = Object.fromEntries(
  optOf(standy.data, BASE_SIZE_GROUP).choices.map((c) => [cmOf(c.name), c.extra ?? 0])
);
const feeDiff = baseSize.choices.filter((c) => standyFee[cmOf(c.name)] !== c.extra);
if (feeDiff.length)
  throw new Error(
    `ค่าฐานไม่ตรงกับชุดกลางของ ${SRC_BASE}: ${feeDiff.map((c) => `${c.name} ${c.extra}≠${standyFee[cmOf(c.name)]}`).join(" · ")}`
  );
baseSize.note =
  "ค่าฐานคิดตามขนาดฐาน ราคาเดียวทุกจำนวน (ไม่มีเรทปลีก/ส่ง) — " +
  "3-5 ซม. +10 · 6-7 ซม. +15 · 8 ซม. +20 · จากนั้นเพิ่มขึ้น ซม.ละ 5 บาท (20 ซม. +80) · สกรีนลายฐานอีก +10";
log.push(`ค่าฐานตามแผ่นราคาของร้าน — ${feeRows.join(" · ")}`);

const printChoice = optOf(d, "ฐานสแตนดี้")?.choices.find((c) => c.name === "สกรีนฐาน");
if (!printChoice) throw new Error('ไม่เจอตัวเลือก "สกรีนฐาน"');
log.push(`ค่าสกรีนฐานคงเดิม +${printChoice.extra} ทุกขนาด (ตามแผ่นราคาหน้า /อคลกระจก)`);

/* ── 3) ค่าอะคริลิคพิเศษของฐาน = ชุดกลาง standy (ตรวจเฉย ๆ) ──────────── */
const shadeOf = (data) =>
  Object.fromEntries(
    (data.options ?? [])
      .filter((o) => o.label.startsWith(SHADE_PREFIX))
      .map((o) => [o.label, JSON.stringify(o.choices.map((c) => [c.name, c.extra ?? 0, c.extraBelow ?? 0]))])
  );
const mine = shadeOf(d);
const theirs = shadeOf(standy.data);
const shadeDiff = Object.keys(mine).filter((k) => mine[k] !== theirs[k]);
if (shadeDiff.length) throw new Error(`ค่าเฉดสีพิเศษของฐานไม่ตรงกับ ${SRC_BASE}: ${shadeDiff.join(" · ")}`);
log.push(`ค่าอะคริลิคพิเศษของฐาน ${Object.keys(mine).length} กลุ่ม ตรงกับ ${SRC_BASE} ทุกช่อง (ไม่ต้องแก้)`);

/* ── 4) ค่าคละลาย — ลายละ 5 บาท ───────────────────────────────────────── */
if ((d.priceRates ?? []).length !== 1) throw new Error(`เรทราคามี ${d.priceRates?.length} เรท — สคริปต์เขียนไว้สำหรับเรทเดียว`);
const rate = d.priceRates[0];
const before = { extraDesignFee: rate.extraDesignFee, underMinPieceFee: rate.underMinPieceFee, tierByDesign: d.tierByDesign };
rate.minPerDesign = MIX_MIN_PER_DESIGN;
rate.freeMixBelowQty = MIX_FREE_BELOW;
rate.extraDesignFee = MIX_EXTRA_DESIGN_FEE;
delete rate.underMinPieceFee;
delete d.tierByDesign;
d.pricing = rate.pricing; // คอลัมน์กระจกของเรทฐาน (หน้าเก่าอ่านจากตรงนี้)
log.push(
  `ค่าคละ — ขั้นต่ำลายละ ${MIX_MIN_PER_DESIGN} ชิ้น (คละอิสระต่ำกว่า ${MIX_FREE_BELOW} ชิ้น) · เกินโควตาลายละ ${MIX_EXTRA_DESIGN_FEE} บาท` +
    ` (เดิม: ${before.underMinPieceFee ? `ชิ้นละ ${before.underMinPieceFee}` : "ไม่มี"} · tierByDesign ${before.tierByDesign ?? false} → ถอดออก)`
);

/* ── 5) ข้อความในหน้าที่ยังบอกกติกาเดิม ───────────────────────────────── */
const TEXT_FIXES = [
  // ค่าคละ: ชิ้นละ 5 → ลายละ 5
  [
    "ตั้งแต่ 11-49 ชิ้น คละลาย คละขนาด ขั้นต่ำลายละ 5 ชิ้น (ไม่ถึงคิดเพิ่มชิ้นละ 5 บาท)",
    "ตั้งแต่ 11-49 ชิ้น คละลาย คละขนาด ขั้นต่ำลายละ 5 ชิ้น (คละเกินโควตาคิดเพิ่มลายละ 5 บาท)",
  ],
  [
    "ตั้งแต่ 11-49 ชิ้น ขึ้นไป คละลาย คละขนาดได้ ขั้นต่ำลายละ 5 ชิ้น — ลายที่ไม่ถึง 5 ชิ้น คิดเพิ่มชิ้นละ 5 บาท",
    "ตั้งแต่ 11-49 ชิ้น ขึ้นไป คละลาย คละขนาดได้ ขั้นต่ำลายละ 5 ชิ้น — คละเกินโควตา (จำนวน ÷ 5) คิดเพิ่มลายละ 5 บาท",
  ],
  [
    "ตั้งแต่ 11 ชิ้นขึ้นไปคละลาย คละขนาดได้ ขั้นต่ำลายละ 5 ชิ้น ลายที่ไม่ถึงคิดเพิ่มชิ้นละ 5 บาท",
    "ตั้งแต่ 11 ชิ้นขึ้นไปคละลาย คละขนาดได้ ขั้นต่ำลายละ 5 ชิ้น คละเกินโควตาคิดเพิ่มลายละ 5 บาท",
  ],
  // ตะขอ: ฟรีช่วงปลีก
  [
    "• ห่วง Z1 (ห่วงกลมเงิน) และ Z2 (โซ่ไข่ปลาเงิน) คิดเพิ่มชิ้นละ 2 บาท\n" +
      "• ตะขอ/ห่วงแบบอื่นคิดตามราคาอะไหล่จริง (ประมาณ 2-15 บาท/ชิ้น) ตั้งแต่ชิ้นแรก ทุกจำนวนที่สั่ง — ระบุจำนวนตะขอต่อ 1 ชุดได้ ระบบคูณให้อัตโนมัติ",
    "• สั่ง 1-10 ชิ้น ตะขอ/ห่วงฟรีทุกแบบ — รวมในราคาชิ้นงานแล้ว\n" +
      "• ห่วง Z1 (ห่วงกลมเงิน) และ Z2 (โซ่ไข่ปลาเงิน) แถมฟรีทุกจำนวน ทุกเรทราคา\n" +
      "• ตะขอ/ห่วงแบบอื่น ตั้งแต่ 11 ชิ้นขึ้นไปคิดตามราคาอะไหล่จริง (ประมาณ 2-15 บาท/ชิ้น)\n" +
      "• เลือกตะขอได้ 1 แบบต่อชิ้น — ต้องการหลายแบบในออเดอร์เดียว แจ้งในหมายเหตุถึงร้าน",
  ],
  // ตะขอ: Z1/Z2 ฟรีทุกเรท (แก้ต่อจากข้อความชุด 1-10 ชิ้นฟรี)
  [
    "• ตั้งแต่ 11 ชิ้นขึ้นไป คิดตามราคาอะไหล่จริง — ห่วง Z1 (ห่วงกลมเงิน) และ Z2 (โซ่ไข่ปลาเงิน) ชิ้นละ 2 บาท · แบบอื่นประมาณ 2-15 บาท/ชิ้น",
    "• ห่วง Z1 (ห่วงกลมเงิน) และ Z2 (โซ่ไข่ปลาเงิน) แถมฟรีทุกจำนวน ทุกเรทราคา\n" +
      "• ตะขอ/ห่วงแบบอื่น ตั้งแต่ 11 ชิ้นขึ้นไปคิดตามราคาอะไหล่จริง (ประมาณ 2-15 บาท/ชิ้น)",
  ],
  // ค่าฐาน: ตรรกะสแตนดี้หมุนได้
  [
    "สแตนดี้: ฐานทรงกลม / วงรี / สี่เหลี่ยม ไม่บวกเพิ่ม · ทรงพิเศษบวกชิ้นละ 5 บาท",
    "สแตนดี้: ค่าฐานคิดตามขนาดฐาน ราคาเดียวทุกจำนวน — 3-5 ซม. +10 · 6-7 ซม. +15 · 8 ซม. +20 · จากนั้นเพิ่มขึ้น ซม.ละ 5 บาท (20 ซม. +80) · สกรีนลายฐานอีก +10 บาท/ชิ้น\n" +
      "สแตนดี้: ฐานทรงกลม / วงรี / สี่เหลี่ยม ไม่บวกเพิ่ม · ทรงพิเศษบวกชิ้นละ 5 บาท",
  ],
  [
    "• สแตนดี้: ฐานทรงกลม / วงรี / สี่เหลี่ยม ไม่บวกเพิ่ม · ทรงพิเศษ (ดาว / หัวใจ ฯลฯ) บวกชิ้นละ 5 บาท · ฐานอะคริลิคพิเศษมีความหนาประมาณ 2.5-3 มม.",
    "• สแตนดี้: ฐานอะคริลิคเริ่มที่ 3 ซม. — ค่าฐานคิดตามขนาด ราคาเดียวทุกจำนวน: 3-5 ซม. +10 · 6-7 ซม. +15 · 8 ซม. +20 · จากนั้นเพิ่มขึ้น ซม.ละ 5 บาท (20 ซม. +80) · สกรีนลายฐานอีก +10 บาท/ชิ้น\n" +
      "• สแตนดี้: ฐานทรงกลม / วงรี / สี่เหลี่ยม ไม่บวกเพิ่ม · ทรงพิเศษ (ดาว / หัวใจ ฯลฯ) บวกชิ้นละ 5 บาท · ฐานอะคริลิคพิเศษมีความหนาประมาณ 2.5-3 มม.",
  ],
  [
    "ตัวชิ้นงานเนื้อกระจก + ฐานอะคริลิคเสียบตั้ง เลือกขนาด/ทรง/สีฐานได้ (ค่าฐานคิดเพิ่ม)",
    "ตัวชิ้นงานเนื้อกระจก + ฐานอะคริลิคเสียบตั้ง เลือกขนาด/ทรง/สีฐานได้ (ค่าฐาน +10 ขึ้นไปตามขนาด)",
  ],
  [
    "ไดคัทตามลาย เจาะรูตะขอให้ฟรี — เลือกตะขอ/ห่วงกว่า 30 แบบได้ด้านล่าง",
    "ไดคัทตามลาย เจาะรูตะขอให้ฟรี — เลือกตะขอ/ห่วงกว่า 30 แบบได้ด้านล่าง (1-10 ชิ้น ตะขอฟรี)",
  ],
  // ค่าฐาน: กลับมาใช้ตารางบนแผ่นราคาของร้าน (แก้ทับชุด "ฐานมาตรฐานฟรี" ที่รันไปก่อนหน้า)
  [
    "สแตนดี้: ฐาน 2-5 ซม. เป็นขนาดมาตรฐาน รวมในราคาแล้ว · ใหญ่กว่านั้นบวกตาม ซม. (1-10 ชิ้น ซม.ละ 15 บาท · 11 ชิ้นขึ้นไป ซม.ละ 10 บาท) · สกรีนลายฐาน +10 บาท/ชิ้น",
    "สแตนดี้: ค่าฐานคิดตามขนาดฐาน ราคาเดียวทุกจำนวน — 3-5 ซม. +10 · 6-7 ซม. +15 · 8 ซม. +20 · จากนั้นเพิ่มขึ้น ซม.ละ 5 บาท (20 ซม. +80) · สกรีนลายฐานอีก +10 บาท/ชิ้น",
  ],
  [
    "• สแตนดี้: ฐานอะคริลิค 2-5 ซม. เป็นขนาดมาตรฐาน รวมในราคาแล้ว — ใหญ่กว่านั้นบวกเพิ่มตาม ซม. (1-10 ชิ้น ซม.ละ 15 บาท · 11 ชิ้นขึ้นไป ซม.ละ 10 บาท) · สกรีนลายฐาน +10 บาท/ชิ้น",
    "• สแตนดี้: ฐานอะคริลิคเริ่มที่ 3 ซม. — ค่าฐานคิดตามขนาด ราคาเดียวทุกจำนวน: 3-5 ซม. +10 · 6-7 ซม. +15 · 8 ซม. +20 · จากนั้นเพิ่มขึ้น ซม.ละ 5 บาท (20 ซม. +80) · สกรีนลายฐานอีก +10 บาท/ชิ้น",
  ],
  [
    "ตัวชิ้นงานเนื้อกระจก + ฐานอะคริลิคเสียบตั้ง เลือกขนาด/ทรง/สีฐานได้ (ฐานมาตรฐาน 2-5 ซม. ไม่บวกเพิ่ม)",
    "ตัวชิ้นงานเนื้อกระจก + ฐานอะคริลิคเสียบตั้ง เลือกขนาด/ทรง/สีฐานได้ (ค่าฐาน +10 ขึ้นไปตามขนาด)",
  ],
];
let fixed = 0;
/**
 * 🧹 บรรทัดกติกาเก่าที่ต้องลบทิ้ง (ไม่ใช่แก้ข้อความ) — เกิดจากรอบก่อนหน้าที่เคยเขียน
 * "ฐานมาตรฐาน 2-5 ซม. ฟรี" ไว้เป็นบรรทัดใหม่ แล้วรอบนี้เปลี่ยนกลับไปใช้ตารางของร้าน
 */
const REMOVE_LINES = [
  "สแตนดี้: ฐาน 2-5 ซม. เป็นขนาดมาตรฐาน รวมในราคาแล้ว · ใหญ่กว่านั้นบวกตาม ซม. (1-10 ชิ้น ซม.ละ 15 บาท · 11 ชิ้นขึ้นไป ซม.ละ 10 บาท) · สกรีนลายฐาน +10 บาท/ชิ้น",
  "• สแตนดี้: ฐานอะคริลิค 2-5 ซม. เป็นขนาดมาตรฐาน รวมในราคาแล้ว — ใหญ่กว่านั้นบวกเพิ่มตาม ซม. (1-10 ชิ้น ซม.ละ 15 บาท · 11 ชิ้นขึ้นไป ซม.ละ 10 บาท) · สกรีนลายฐาน +10 บาท/ชิ้น",
];
let removed = 0;
const patchText = (s) => {
  if (typeof s !== "string") return s;
  let out = s;
  for (const line of REMOVE_LINES) {
    if (!out.includes(line)) continue;
    out = out.replaceAll(line + "\n", "").replaceAll("\n" + line, "").replaceAll(line, "");
    removed++;
  }
  for (const [oldTxt, newTxt] of TEXT_FIXES) {
    if (out.includes(newTxt)) continue; // แก้ไปแล้ว (รันซ้ำ)
    if (out.includes(oldTxt)) {
      out = out.replaceAll(oldTxt, newTxt);
      fixed++;
    }
  }
  return out;
};
d.terms = patchText(d.terms);
d.description = patchText(d.description);
d.highlights = (d.highlights ?? []).map(patchText);
d.tabs = (d.tabs ?? []).map((t) => ({ ...t, text: patchText(t.text), ...(t.html ? { html: patchText(t.html) } : {}) }));
for (const o of d.options ?? []) {
  o.note = patchText(o.note);
  for (const c of o.choices ?? []) if (c.desc) c.desc = patchText(c.desc);
}
if (d.seo?.faqs) for (const f of d.seo.faqs) f.a = patchText(f.a);
const allTexts = [
  d.terms,
  d.description,
  ...(d.highlights ?? []),
  ...(d.tabs ?? []).flatMap((t) => [t.text, t.html]),
  ...(d.options ?? []).flatMap((o) => [o.note, ...(o.choices ?? []).map((c) => c.desc)]),
  ...((d.seo?.faqs ?? []).map((f) => f.a)),
];
const stale = TEXT_FIXES.filter(([, newTxt]) => !allTexts.some((s) => s?.includes(newTxt)));
log.push(`ข้อความแก้ ${fixed} จุด${removed ? ` · ลบบรรทัดกติกาเก่า ${removed} บรรทัด` : ""}${stale.length ? ` ⚠️ หาที่แก้ไม่เจอ ${stale.length} จุด (ข้อความต้นทางเปลี่ยน)` : ""}`);
for (const [oldTxt] of stale) console.log(`   ⚠️ ไม่เจอ: ${oldTxt.slice(0, 70)}…`);

d.savedAt = new Date().toISOString();

/* ── สรุป ─────────────────────────────────────────────────────────────── */
console.log(`📦 ${tgt.name} (${TGT_ID}) — ค่าตะขอ / ค่าฐาน / ค่าคละ\n`);
for (const l of log) console.log(`   • ${l}`);
console.log(`\n   ฉบับร่าง (hidden): ${d.hidden === true ? "ใช่ — ยังไม่ขึ้นหน้าร้าน" : "ไม่ (เผยแพร่แล้ว)"}`);

const jsonAt = process.argv.indexOf("--json");
if (jsonAt > -1 && process.argv[jsonAt + 1]) {
  writeFileSync(process.argv[jsonAt + 1], JSON.stringify({ ...tgt, data: d }, null, 2));
  console.log(`   📄 เขียนผลลัพธ์ลง ${process.argv[jsonAt + 1]}`);
}

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
const up = await sb.from("products").update({ data: d }).eq("id", TGT_ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log("\n✅ บันทึกแล้ว");
