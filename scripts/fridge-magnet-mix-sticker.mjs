#!/usr/bin/env node
/**
 * แม่เหล็กติดตู้เย็น (acrylicmagnet-3): ค่าคละลายตรรกะเดียวกับสติ๊กเกอร์ — ผู้ใช้สั่ง 26 ส.ค. 69
 *   • ไดคัท 100% = แบบสติ๊กเกอร์ไดคัท 100%: mixRule ระดับสินค้า {5, 2, 5} — ลายละ 5 ลายแรกไม่คิด
 *   • SET-KIT   = แบบสติ๊กเกอร์ไดคัท 50%:  mixRule ระดับเรท   {20, 2, 20} — ลายละ 20 ลายแรกไม่คิด
 *     (ฟีเจอร์ใหม่ PriceRate.mixRule — mixRuleFor อ่านเรทที่เลือกทับกติการะดับสินค้า)
 *
 *   node scripts/fridge-magnet-mix-sticker.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/fridge-magnet-mix-sticker.mjs --write
 *
 * ข้อความประกอบ: บรรทัดค่าคละใน terms + FAQ "คละลายได้ไหม?" แบบแยกสองเรท
 * (รันซ้ำได้ — รองรับทั้งสถานะก่อนมีบรรทัดค่าคละ และสถานะรอบแรกที่เขียนรวมลายละ 5 ไว้)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const ID = "acrylicmagnet-3";
const MIX_100 = { baseFee: 5, includedDesigns: 2, extraFee: 5 }; // ระดับสินค้า → ไดคัท 100%
const MIX_KIT = { baseFee: 20, includedDesigns: 2, extraFee: 20 }; // ระดับเรท SET-KIT

const TERMS_ANCHOR = "*ไดคัท 100% ขนาดเดียวกันทั้งแผ่น A3 · SET-KIT 1 pattern ต่อ 1 A3 (1 pattern คละขนาด/ลายได้)";
const TERMS_MIX_OLD = "*คละลายในแผ่นเดียวกัน (1 แผ่น A3): ค่าคละลายละ 5 บาท ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ)";
const TERMS_MIX_LINE =
  "*คละลายในแผ่นเดียวกัน (1 แผ่น A3): ไดคัท 100% ค่าคละลายละ 5 บาท · SET-KIT ค่าคละลายละ 20 บาท — ลายแรกไม่คิด (ระบบคิดให้อัตโนมัติ)";

const FAQ_Q = "คละลายได้ไหม?";
const FAQ_A =
  "ได้ครับ คละลายในแผ่น A3 เดียวกันได้ ระบบคิดให้อัตโนมัติ — ไดคัท 100% ค่าคละลายละ 5 บาท · SET-KIT ค่าคละลายละ 20 บาท ลายแรกไม่คิด (เช่น สั่ง 2 แผ่น คละ 3 ลาย แบบ SET-KIT = บวก 20 บาท)";

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

const { data: rows, error } = await sb.from("products").select("*").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า id=${ID}`);
if (row.name !== "แม่เหล็กติดตู้เย็น") die(`ชื่อไม่ตรงที่คาด (${row.name})`);
const d = row.data;

// กติการะดับสินค้า (มีผลกับไดคัท 100% ที่ไม่ได้ตั้งของตัวเอง)
const before = JSON.stringify(d.mixRule);
d.mixRule = { ...MIX_100 };

// กติกาเฉพาะเรท SET-KIT — ต้องเจอเรทชื่อนี้ตัวเดียวเป๊ะ
const kits = (d.priceRates ?? []).filter((r) => r.label === "SET-KIT");
if (kits.length !== 1) die(`เจอเรท SET-KIT ${kits.length} ตัว (ต้องเจอ 1) — เช็คโครงสร้างก่อน`);
const kitBefore = JSON.stringify(kits[0].mixRule);
kits[0].mixRule = { ...MIX_KIT };
const other = (d.priceRates ?? []).filter((r) => r.label !== "SET-KIT");
for (const r of other) if (r.mixRule) die(`เรท "${r.label}" มี mixRule ค้างอยู่ — เช็คก่อน`);

// terms: บรรทัดค่าคละแบบแยกเรท ถัดจากบรรทัดกติกา pattern
if (!d.terms?.includes(TERMS_MIX_LINE)) {
  if (d.terms?.includes(TERMS_MIX_OLD)) d.terms = d.terms.replace(TERMS_MIX_OLD, TERMS_MIX_LINE);
  else if (d.terms?.includes(TERMS_ANCHOR)) d.terms = d.terms.replace(TERMS_ANCHOR, TERMS_ANCHOR + "\n" + TERMS_MIX_LINE);
  else die(`ไม่พบทั้งบรรทัดค่าคละเดิมและ anchor ใน terms — โครงสร้างเปลี่ยน เช็คก่อน`);
}

// FAQ: เพิ่ม/อัปคำถามค่าคละ
d.seo ??= {};
d.seo.faqs ??= [];
const faq = d.seo.faqs.find((f) => f.q === FAQ_Q);
if (faq) faq.a = FAQ_A;
else d.seo.faqs.push({ q: FAQ_Q, a: FAQ_A });

d.savedAt = new Date().toISOString();

console.log(`${ID}: mixRule สินค้า ${before ?? "—"} → ${JSON.stringify(d.mixRule)}`);
console.log(`${ID}: mixRule เรท SET-KIT ${kitBefore ?? "—"} → ${JSON.stringify(kits[0].mixRule)}`);
console.log(`terms:\n${d.terms.split("\n").filter((l) => l.includes("คละ")).join("\n")}`);
console.log(`FAQ "${FAQ_Q}": ${d.seo.faqs.find((f) => f.q === FAQ_Q).a}`);

if (WRITE) {
  const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
  if (e2) die(e2.message);
  console.log("✓ เขียนแล้ว");
} else {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
}
