#!/usr/bin/env node
/**
 * "สติ๊กเกอร์วาชิ" — เอาตัวเลือก "ครึ่ง A4/A5/A6 แนวตั้ง" กลับเข้าไปใหม่ (ตามที่ร้านสั่ง 2026-08-28)
 *   node scripts/washi-restore-half-cut-sizes.mjs [--write]
 *
 * ย้อนสิ่งที่ washi-remove-half-cut-sizes.mjs เอาออก — คืนครบทั้ง 3 ที่:
 *   1. ตัวเลือกในกลุ่ม "ขนาดตัด" (แทรกก่อน "กำหนดขนาดเอง")
 *   2. โควตาจุดไดคัทฟรี — จับคู่ตามพื้นที่: ครึ่ง A4≈A5 · ครึ่ง A5≈A6 · ครึ่ง A6≈A7
 *   3. บรรทัดสรุปสเปกในแท็บรายละเอียด
 * ⚠️ ไม่ย้อนราคาค่าจุด — ตอนนี้เป็น ฿0.50 แล้ว (ของเดิมตอนลบคือ ฿2 ซึ่งผิด)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "washi-sticker";
const HALVES = [
  { name: "ครึ่ง A4 แนวตั้ง", badge: "ได้ 2 ชิ้น / แผ่น A3", piecesPerUnit: 2, quotaWith: "A5" },
  { name: "ครึ่ง A5 แนวตั้ง", badge: "ได้ 4 ชิ้น / แผ่น A3", piecesPerUnit: 4, quotaWith: "A6" },
  { name: "ครึ่ง A6 แนวตั้ง", badge: "ได้ 8 ชิ้น / แผ่น A3", piecesPerUnit: 8, quotaWith: "A7" },
];

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) { console.error(error); process.exit(1); }
const d = JSON.parse(JSON.stringify(row.data));

// 1) ตัวเลือก
const cut = (d.options ?? []).find((o) => o.label === "ขนาดตัด");
if (!cut) { console.error('ไม่พบกลุ่ม "ขนาดตัด"'); process.exit(1); }
const custom = cut.choices.findIndex((c) => /กำหนดขนาดเอง/.test(c.name));
const at = custom < 0 ? cut.choices.length : custom;
const add = HALVES.filter((h) => !cut.choices.some((c) => c.name === h.name))
  .map(({ name, badge, piecesPerUnit }) => ({ name, badge, piecesPerUnit }));
cut.choices.splice(at, 0, ...add);
console.log("[1] ขนาดตัด:", cut.choices.map((c) => c.name).join(" | "));

// 2) โควตาจุดไดคัทฟรี
const dots = (d.options ?? []).find((o) => o.label === "จำนวนจุดไดคัท");
console.log("[2] โควตาจุดฟรี");
for (const h of HALVES) {
  const r = (dots?.inputFee?.rates ?? []).find((x) => (x.when?.choices ?? []).includes(h.quotaWith));
  if (!r) { console.error(`   ⚠️ ไม่พบเรทของ ${h.quotaWith}`); process.exit(1); }
  if (!r.when.choices.includes(h.name)) r.when.choices.push(h.name);
  console.log(`   [${r.when.choices.join(", ")}] ฟรี ${r.free} · สูงสุด ${r.max}`);
}

// 3) บรรทัดสรุปสเปก
console.log("[3] tabs[0].text");
const fixes = [
  ["• จุดไดคัท (ไดคัท 50%) ฟรีตามขนาด — A4 100 จุด / A5 50 จุด / A6 25 จุด / A7 12 จุด",
   "• จุดไดคัท (ไดคัท 50%) ฟรีตามขนาด — A4 100 จุด / A5 · ครึ่ง A4 50 จุด / A6 · ครึ่ง A5 25 จุด / A7 · ครึ่ง A6 12 จุด"],
  ["• ไดคัท 50% — A4 = 1 แผ่น · A5 = 2 · A6 = 4 · A7 = 9",
   "• ไดคัท 50% — A4 = 1 แผ่น · A5 = 2 · A6 = 4 · A7 = 9 · ครึ่ง A4 แนวตั้ง = 2 · ครึ่ง A5 แนวตั้ง = 4 · ครึ่ง A6 แนวตั้ง = 8"],
];
for (const [from, to] of fixes) {
  if (d.tabs[0].text.includes(to)) { console.log("   (มีอยู่แล้ว)"); continue; }
  if (!d.tabs[0].text.includes(from)) { console.error("   ⚠️ ไม่พบบรรทัด:", from.slice(0, 50)); process.exit(1); }
  d.tabs[0].text = d.tabs[0].text.replace(from, to);
  console.log("   ✓", to);
}

if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึกจริง)"); process.exit(0); }
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`../.backup-${ID}-${stamp}.json`, import.meta.url), JSON.stringify(row.data, null, 2));
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) { console.error(e2); process.exit(1); }
console.log("\n✅ บันทึกแล้ว");
