#!/usr/bin/env node
/**
 * Carabiner Acrylic (/products/Carabiner-Acrylic · id carabiner-acrylic)
 * — ค่าสกรีน "2 ด้าน" ต้องคิด **ตามขนาดชิ้นงาน** ไม่ใช่ ฿10 เท่ากันหมด
 *   (เจ้าของร้านส่งตาราง Add on งานสกรีน 2 ด้าน/หลายเลเยอร์ มา 14 ก.ย. 69)
 *
 *   node scripts/carabiner-screen-2side-by-size.mjs            # ดูผลก่อน (ไม่เขียนฐานข้อมูล)
 *   node scripts/carabiner-screen-2side-by-size.mjs --write
 *
 * 📋 ตารางกลางของร้าน (ยืนยันจากตารางราคาของพวงกุญแจอะคริลิค keyring-copy-copy และ
 *    สแตนดี้อะคริลิค standy ที่คิดค่าสกรีนผ่าน "แกนงานสกรีน" ในตารางราคา — ส่วนต่าง
 *    2 ด้าน ลบ 1 ด้าน ของทั้งสองตัวตรงกับตารางที่เจ้าของร้านส่งมาเป๊ะ):
 *      2-5 ซม. ฿10 · 6-7 ซม. ฿15 · 8-10 ซม. ฿25 · 11-13 ซม. ฿30 · 14-16 ซม. ฿35
 *      (สแตนดี้มีต่ออีก 17 ซม. ฿40 · 18 ฿45 · 19 ฿50 · 20 ฿55 — ตัวนี้ขายถึง 15 ซม. เลยไม่ต้อง)
 *
 * 💰 วิธีคิด: ใช้ choice.sizeFee (ขั้นราคาตามด้านยาวสุด) แทน choice.extra ฿10 ตายตัว
 *   ที่เพิ่งใส่ไว้เมื่อเช้า (scripts/carabiner-screen-2side-fee.mjs)
 *   • ตัวนี้ไม่มีช่องกรอกขนาด — ขนาดเป็น "เมนูเลื่อน" ชื่อ 5 cm … 15cm
 *     sizeFeeBreakdownOf อ่านตัวเลขจากค่าใน selections ตรง ๆ (ตัดตัวอักษรทิ้ง) จึงชี้
 *     widthLabel/heightLabel มาที่กลุ่ม "ขนาด" ได้เลย ชิ้นงานจัตุรัส กว้าง = ยาว = ค่าที่เลือก
 *   • ไม่ขยายตารางราคา (33 ช่อง × 3 เรทเท่าเดิม) และไม่ทำให้กลุ่ม "สกรีน" กลับไปเป็น
 *     แกนตารางอีก — ดูกับดักคีย์ 3 ท่อน/2 ท่อนใน scripts/fix-carabiner-acrylic.mjs
 *   • choiceExtraOf บวก sizeFee ให้เอง ⇒ ติดไปทุกที่ที่คิดเงิน (ราคาหน้าเว็บ · ป้าย +฿
 *     บนการ์ด ซึ่งขยับตามขนาดที่เลือกอยู่ · ตะกร้า · ใบเสนอราคา · ออเดอร์ · เรทตัวแทน)
 *
 * รันซ้ำได้: ตั้ง sizeFee ของ "2 ด้าน" เป็นตารางนี้เสมอ · ลบ extra ตายตัวที่ค้างอยู่ ·
 * "1 ด้าน" ต้องไม่มีทั้ง extra และ sizeFee
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

const ID = "carabiner-acrylic";
const GROUP = "สกรีน";
const SIZE_GROUP = "ขนาด";
/** ขั้นค่าสกรีนด้านที่สอง: ด้านยาวสุดไม่เกิน upTo ซม. → ฿/ชิ้น */
const TIERS = [
  { upTo: 5, fee: 10 },
  { upTo: 7, fee: 15 },
  { upTo: 10, fee: 25 },
  { upTo: 13, fee: 30 },
  { upTo: 16, fee: 35 },
];
const NOTE =
  "ค่าสกรีนด้านที่สองคิดตามขนาดชิ้นงาน: ไม่เกิน 5 ซม. +฿10 · 6-7 ซม. +฿15 · 8-10 ซม. +฿25 · 11-13 ซม. +฿30 · 14-15 ซม. +฿35 (ต่อชิ้น)";
const is2Side = (name) => name.startsWith("2 ด้าน");
const feeAt = (cm) => (TIERS.find((t) => cm <= t.upTo) ?? TIERS[TIERS.length - 1]).fee;

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
const die = (...m) => { console.error("❌", ...m); process.exit(1); };

const { data: row, error: readErr } = await sb.from("products").select("data").eq("id", ID).single();
if (readErr) die(readErr);
const data = row.data;

// ── ตรวจโครงก่อน อย่าเดา ────────────────────────────────────────────────
const opts = data.options ?? [];
const opt = opts.find((o) => o.label === GROUP);
const sizeOpt = opts.find((o) => o.label === SIZE_GROUP);
if (!opt) die(`ไม่เจอกลุ่ม "${GROUP}"`);
if (!sizeOpt) die(`ไม่เจอกลุ่ม "${SIZE_GROUP}"`);
for (const label of [GROUP, SIZE_GROUP]) {
  if (opts.filter((o) => o.label === label).length > 1) die(`มีกลุ่มชื่อ "${label}" ซ้ำ — ต้องระบุให้ชัดก่อนแก้`);
}
const twoSide = opt.choices.filter((c) => is2Side(c.name));
if (twoSide.length !== 2) die(`คาดว่ามีตัวเลือก "2 ด้าน" 2 แบบ แต่เจอ ${twoSide.length}`);
// ชื่อตัวเลือกขนาดต้องอ่านเป็นตัวเลข ซม. ได้ทุกตัว ไม่งั้นค่าสกรีนจะเงียบหายไปเฉพาะบางขนาด
const sizeCm = sizeOpt.choices.map((c) => {
  const n = parseFloat(String(c.name).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) die(`ตัวเลือกขนาด "${c.name}" อ่านเป็นตัวเลขไม่ได้`);
  return { name: c.name, cm: n };
});
// กลุ่มสกรีนต้องไม่เป็นแกนตารางราคา ไม่งั้นคิดเงินซ้ำสองทาง
const drivers = [data.pricing, ...(data.priceRates ?? []).map((r) => r.pricing)]
  .filter(Boolean)
  .flatMap((m) => m.driverLabels ?? []);
if (drivers.includes(GROUP)) die(`กลุ่ม "${GROUP}" เป็นแกนตารางราคาอยู่แล้ว — ใส่ +฿ ซ้ำจะคิดเงินสองเด้ง`);
const OPT_COUNT = opts.length;
const CELLS_BEFORE = Object.keys(data.pricing?.cells ?? {}).length;

console.log(`ค่าสกรีน "2 ด้าน" ของ ${ID} — +฿/ชิ้น ตามขนาดที่ลูกค้าเลือก`);
for (const s of sizeCm) {
  const to = feeAt(s.cm);
  const from = twoSide[0].extra ?? 0;
  console.log(`  ${s.name.padEnd(6)} +฿${String(from).padStart(2)} → +฿${to}`);
}
console.log(`\n  1 ด้าน (ใต้/บน) ไม่คิดเพิ่มเหมือนเดิม · หมายเหตุกลุ่ม: ${NOTE}`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียน DB — รันด้วย --write)");
  process.exit(0);
}

// ── เขียน: 2 ด้าน = ขั้นราคาตามขนาด · 1 ด้าน = ไม่คิดเพิ่ม ─────────────────
const sizeFee = { widthLabel: SIZE_GROUP, heightLabel: SIZE_GROUP, tiers: TIERS };
for (const c of opt.choices) {
  delete c.extra;                       // ฿10 ตายตัวของเมื่อเช้า — ตารางใหม่แทนที่ทั้งหมด
  if (is2Side(c.name)) c.sizeFee = structuredClone(sizeFee);
  else delete c.sizeFee;
}
opt.note = NOTE;
data.savedAt = new Date().toISOString();   // ⚠️ ISO string เท่านั้น (ด่านกัน 409 ของหน้าแก้ไข)

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", ID).select("data");
if (updErr || !upd?.length) die("update พัง/0 แถว", updErr);

// ── อ่านกลับมาเทียบ อย่าเชื่อว่าไม่ error = สำเร็จ ────────────────────────
const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", ID).single();
if (backErr) die(backErr);
const b = back.data;
const bOpt = (b.options ?? []).find((o) => o.label === GROUP);
// ⚠️ jsonb ของ Postgres เรียงคีย์ในอ็อบเจ็กต์ใหม่ตอนเก็บ (fee มาก่อน upTo) — เทียบเป็นค่า อย่าเทียบ string
const sameTiers = (rows) =>
  Array.isArray(rows) &&
  rows.length === TIERS.length &&
  rows.every((t, i) => t.upTo === TIERS[i].upTo && t.fee === TIERS[i].fee);
const okTiers = (c) =>
  c.sizeFee?.widthLabel === SIZE_GROUP &&
  c.sizeFee?.heightLabel === SIZE_GROUP &&
  sameTiers(c.sizeFee?.tiers) &&
  !c.extra;
const fails = [
  [!!bOpt && bOpt.choices.length === opt.choices.length, "ตัวเลือกในกลุ่มสกรีนหาย"],
  [bOpt?.choices.every((c) => (is2Side(c.name) ? okTiers(c) : !c.sizeFee && !c.extra)), "ค่าสกรีนไม่ตรงตาราง"],
  [bOpt?.note === NOTE, "หมายเหตุกลุ่มสกรีนไม่ตรง"],
  [(b.options ?? []).length === OPT_COUNT, "จำนวนกลุ่มตัวเลือกเปลี่ยน (กลุ่มหาย)"],
  [(b.options ?? []).find((o) => o.label === SIZE_GROUP)?.choices.length === sizeOpt.choices.length, "ตัวเลือกขนาดหาย"],
  [Object.keys(b.pricing?.cells ?? {}).length === CELLS_BEFORE, "ตารางราคาเปลี่ยนจำนวนช่อง"],
  [(b.priceRates ?? []).length === (data.priceRates ?? []).length, "เรทราคาหาย"],
  [typeof b.savedAt === "string", "savedAt ไม่ใช่ ISO string"],
  [typeof b.terms === "string" && b.terms.length > 10, "terms โดนล้าง"],
].filter(([ok]) => !ok);
if (fails.length) die("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · "));

console.log(`\n✓ ค่าสกรีน 2 ด้านคิดตามขนาดแล้ว (${TIERS.map((t) => `≤${t.upTo}ซม. ฿${t.fee}`).join(" · ")}) · savedAt =`, b.savedAt);
