#!/usr/bin/env node
/**
 * กระดาษ Texture Paper — เรียงลำดับกลุ่มตัวเลือกใหม่ + กลุ่มเคลือบด้านหลังมีปุ่มเปิด-ปิด
 *
 *   node scripts/texture-paper-option-order.mjs           # ดูก่อน
 *   node scripts/texture-paper-option-order.mjs --write
 *
 * ลำดับที่ผู้ใช้สั่ง 28 ส.ค. 69:
 *   ชนิดกระดาษ → การตัด → พิมพ์รองสีขาว (ด้านหน้า) → จำนวนด้านที่พิมพ์ → เคลือบ (ด้านหน้า) → เคลือบ (ด้านหลัง)
 * กลุ่มลูกเกาะไปกับกลุ่มแม่เสมอ (ขนาดตัด/ขนาดไดคัท ตามหลัง "การตัด" · เคลือบพิเศษ ตามหลัง "เคลือบ (ด้านหลัง)")
 *
 * + "เคลือบ (ด้านหลัง)" ตั้ง collapsible = ปิดไว้ก่อน มีสวิตช์เปิด (ยังขึ้นเมื่อพิมพ์ 2 ด้านเหมือนเดิม)
 *   ⚠️ กติกาของ collapsible: ปิดสวิตช์ = เด้งค่ากลับ choices[0] → ตัวเลือกแรกต้องไม่คิดเงิน
 *      สคริปต์เช็คให้ก่อนเขียน ไม่ผ่านคือหยุด
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "texture-paper";

/** ลำดับที่ต้องการ — กลุ่มที่ไม่อยู่ในลิสต์จะต่อท้ายตามเดิม (แล้วเตือน) */
const ORDER = [
  "ชนิดกระดาษ",
  "การตัด",
  "ตัดเป็นขนาด",            // ลูกของ "การตัด"
  "ขนาดตัด (กว้าง)",
  "ขนาดตัด (สูง)",
  "ขนาดไดคัท (กว้าง)",
  "ขนาดไดคัท (สูง)",
  "พิมพ์รองสีขาว (ด้านหน้า)",
  "จำนวนด้านที่พิมพ์",
  "เคลือบ (ด้านหน้า)",
  "เคลือบ (ด้านหลัง)",
  "เคลือบพิเศษ (ด้านหลัง)",  // ลูกของ "เคลือบ (ด้านหลัง)"
];
const COLLAPSIBLE = ["เคลือบ (ด้านหลัง)"];

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) { console.error(error); process.exit(1); }
const before = row.data;
const d = JSON.parse(JSON.stringify(before));

/* ---------- 1) เรียงใหม่ ---------- */
const have = d.options.map((o) => o.label);
const missing = ORDER.filter((l) => !have.includes(l));
const extra = have.filter((l) => !ORDER.includes(l));
const sorted = [
  ...ORDER.map((l) => d.options.find((o) => o.label === l)).filter(Boolean),
  ...d.options.filter((o) => !ORDER.includes(o.label)),
];
if (sorted.length !== d.options.length) { console.error("⛔ นับกลุ่มไม่ครบ — หยุด"); process.exit(1); }
d.options = sorted;

/* ---------- 2) ปุ่มเปิด-ปิด ---------- */
const risky = [];
for (const label of COLLAPSIBLE) {
  const o = d.options.find((x) => x.label === label);
  if (!o) { console.error(`หากลุ่ม "${label}" ไม่เจอ — หยุด`); process.exit(1); }
  o.collapsible = true;
  const first = o.choices?.[0];
  if (o.display !== "multi" && (first?.extra ?? 0) !== 0) risky.push(`${label} → ตัวเลือกแรก "${first?.name}" คิดเงิน +${first?.extra}`);
}

/* ---------- สรุป ---------- */
console.log("ลำดับใหม่ (→ ที่ย่อหน้าคือกลุ่มที่ขึ้นต่อกลุ่มอื่น):");
d.options.forEach((o, i) => {
  const cond = [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? [])].filter(Boolean);
  const from = have.indexOf(o.label);
  console.log(
    `  ${String(i + 1).padStart(2)}. ${cond.length ? "   ↳ " : ""}${o.label}` +
    `${o.collapsible ? "  🔽 มีสวิตช์เปิด-ปิด" : ""}` +
    `${cond.length ? `   [ขึ้นเมื่อ ${cond.map((c) => `${c.label}=${c.choices.join("/")}`).join(" และ ").slice(0, 90)}…]` : ""}` +
    `${from !== i ? `   (เดิมอันดับ ${from + 1})` : ""}`
  );
});
if (missing.length) console.log("\n⚠️ ในลิสต์แต่ไม่มีในสินค้า:", missing.join(" · "));
if (extra.length) console.log("⚠️ มีในสินค้าแต่ไม่ได้ระบุลำดับ (ต่อท้ายให้):", extra.join(" · "));
if (risky.length) { console.error("\n⛔ กลุ่มที่ตั้งสวิตช์ ตัวเลือกแรกต้องไม่คิดเงิน (ปิดสวิตช์แล้วค่าเด้งกลับตัวแรก):\n   " + risky.join("\n   ")); process.exit(1); }
console.log("\n✓ กลุ่มที่ตั้งสวิตช์: ตัวเลือกแรกไม่คิดเงิน — ปิดสวิตช์แล้วไม่มีค่าซ่อน");

if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึกจริง)"); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`../.backup-texture-paper-${stamp}.json`, import.meta.url), JSON.stringify({ id: ID, data: before }, null, 2));
console.log(`\nสำรองของเดิมไว้ที่ .backup-texture-paper-${stamp}.json`);

d.savedAt = new Date().toISOString();
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) { console.error(e2); process.exit(1); }
console.log("✅ บันทึกแล้ว");
