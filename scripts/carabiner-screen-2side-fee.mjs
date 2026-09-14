#!/usr/bin/env node
/**
 * Carabiner Acrylic (/products/Carabiner-Acrylic · id carabiner-acrylic)
 * — เลือก "สกรีน 2 ด้าน" แล้วราคาไม่ขยับ (เจ้าของร้านแจ้ง 14 ก.ย. 69)
 *
 *   node scripts/carabiner-screen-2side-fee.mjs            # ดูผลก่อน (ไม่เขียนฐานข้อมูล)
 *   node scripts/carabiner-screen-2side-fee.mjs --write
 *
 * 🔍 สาเหตุ: กลุ่ม "สกรีน" ของสินค้าตัวนี้ไม่ผูกกับราคาเลยสักทาง
 *   • ไม่ได้อยู่ใน pricing.driverLabels (แกนตารางมีแค่ ประเภทอะคริลิค │ ขนาด)
 *     — เดิมเคยเขียนไว้ 3 แกน แต่คีย์ในตารางมี 2 ท่อน ราคาเลยตกไปใช้ราคาตั้งต้นทุกกรณี
 *       ตอนแก้บั๊กนั้น (scripts/fix-carabiner-acrylic.mjs) จึงตัดแกน "สกรีน" ออกให้ตรงกับคีย์จริง
 *       ผลข้างเคียงคือค่าสกรีน 2 ด้านหายไปด้วย ไม่มีใครทดแทน
 *   • ตัวเลือกในกลุ่มก็ไม่มี choice.extra สักตัว
 *   ⇒ 1 ด้าน / 2 ด้าน คิดเท่ากันทุกขนาด ทุกเนื้อ ทุกเรทจำนวน
 *
 * 💰 วิธีแก้: คิดค่าสกรีนด้านที่สอง **ชิ้นละ ฿10** ผ่าน choice.extra
 *   เท่ากับกติกาบ้านของงานอะคริลิคตระกูลเดียวกัน — พวงกุญแจอะคริลิค (keyring-copy-copy)
 *   และสแตนดี้อะคริลิค (standy) ที่ตารางราคาบวก ฿10 ให้ "สกรีน 2 ด้าน" ทุกขนาด/ทุกเรทจำนวน
 *   (เช่น keyring 1mm│2cm│ใส: 1 ด้าน 60/15/12/12/10/10 → 2 ด้าน 70/25/22/22/20/20)
 *
 *   ใช้ +฿ ของตัวเลือกแทนการเพิ่มแกนในตาราง เพราะค่านี้เท่ากันหมด ไม่ผูกกับเนื้อ/ขนาด
 *   (ต่างจากค่าขนาดใหญ่พิเศษที่ต้องลงตาราง ดู scripts/carabiner-oversize.mjs)
 *   ข้อดี: ตารางราคายังเป็น 33 ช่องเท่าเดิม · การ์ดตัวเลือกขึ้นป้าย "+฿10" ให้ลูกค้าเห็น ·
 *   ติดไปเองทุกที่ที่คิดเงิน (หน้าสินค้า · ตะกร้า · ใบเสนอราคา · ออเดอร์ · เรทตัวแทน)
 *
 * รันซ้ำได้: ตั้ง extra ของ "2 ด้าน" เป็น ฿10 เสมอ และลบ extra ของ "1 ด้าน" ทิ้งถ้ามีหลุดมา
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

const ID = "carabiner-acrylic";
const GROUP = "สกรีน";
const FEE = 10;                       // ฿/ชิ้น ของด้านที่สอง (กติกาเดียวกับพวงกุญแจ/สแตนดี้)
const is2Side = (name) => name.startsWith("2 ด้าน");

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
const opt = (data.options ?? []).find((o) => o.label === GROUP);
if (!opt) die(`ไม่เจอกลุ่ม "${GROUP}"`);
if ((data.options ?? []).filter((o) => o.label === GROUP).length > 1) die(`มีกลุ่มชื่อ "${GROUP}" ซ้ำ — ต้องระบุให้ชัดก่อนแก้`);
const twoSide = opt.choices.filter((c) => is2Side(c.name));
if (twoSide.length !== 2) die(`คาดว่ามีตัวเลือก "2 ด้าน" 2 แบบ แต่เจอ ${twoSide.length}: ${twoSide.map((c) => c.name).join(", ")}`);
// กลุ่มนี้ต้องไม่เป็นแกนตารางราคา ไม่งั้นจะกลายเป็นคิดเงินซ้ำสองทาง
const drivers = [data.pricing, ...(data.priceRates ?? []).map((r) => r.pricing)]
  .filter(Boolean)
  .flatMap((m) => m.driverLabels ?? []);
if (drivers.includes(GROUP)) die(`กลุ่ม "${GROUP}" เป็นแกนตารางราคาอยู่แล้ว — ใส่ +฿ ซ้ำจะคิดเงินสองเด้ง`);
const OPT_COUNT = (data.options ?? []).length;
const CELLS_BEFORE = Object.keys(data.pricing?.cells ?? {}).length;

console.log(`กลุ่ม "${GROUP}" ของ ${ID} — +฿ ต่อชิ้นที่จะเป็น`);
for (const c of opt.choices) {
  const from = c.extra ?? 0;
  const to = is2Side(c.name) ? FEE : 0;
  console.log(`  ${c.name.padEnd(18)} +฿${from} → +฿${to}${from === to ? "  (เท่าเดิม)" : ""}`);
}

if (!WRITE) {
  console.log("\n(ยังไม่เขียน DB — รันด้วย --write)");
  process.exit(0);
}

// ── เขียน: ตัวเลือก 2 ด้านคิดเพิ่ม ฿10 · 1 ด้านไม่คิดเพิ่ม ────────────────
for (const c of opt.choices) {
  if (is2Side(c.name)) c.extra = FEE;
  else delete c.extra;
}
data.savedAt = new Date().toISOString();   // ⚠️ ISO string เท่านั้น (ด่านกัน 409 ของหน้าแก้ไข)

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", ID).select("data");
if (updErr || !upd?.length) die("update พัง/0 แถว", updErr);

// ── อ่านกลับมาเทียบ อย่าเชื่อว่าไม่ error = สำเร็จ ────────────────────────
const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", ID).single();
if (backErr) die(backErr);
const b = back.data;
const bOpt = (b.options ?? []).find((o) => o.label === GROUP);
const fails = [
  [!!bOpt && bOpt.choices.length === opt.choices.length, "ตัวเลือกในกลุ่มสกรีนหาย"],
  [bOpt?.choices.every((c) => (is2Side(c.name) ? c.extra === FEE : !c.extra)), `+฿ ไม่ตรง (2 ด้าน ต้อง ฿${FEE} · 1 ด้าน ต้องไม่มี)`],
  [(b.options ?? []).length === OPT_COUNT, "จำนวนกลุ่มตัวเลือกเปลี่ยน (กลุ่มหาย)"],
  [Object.keys(b.pricing?.cells ?? {}).length === CELLS_BEFORE, "ตารางราคาเปลี่ยนจำนวนช่อง"],
  [(b.priceRates ?? []).length === (data.priceRates ?? []).length, "เรทราคาหาย"],
  [typeof b.savedAt === "string", "savedAt ไม่ใช่ ISO string"],
  [typeof b.terms === "string" && b.terms.length > 10, "terms โดนล้าง"],
].filter(([ok]) => !ok);
if (fails.length) die("อ่านกลับไม่ตรง:", fails.map((f) => f[1]).join(" · "));

console.log(`\n✓ สกรีน 2 ด้านคิดเพิ่มชิ้นละ ฿${FEE} แล้ว · savedAt =`, b.savedAt);
