#!/usr/bin/env node
/**
 * ผ้าเชียร์ (id 2-2-2) — กลุ่มของเสริมมีปุ่มเปิด-ปิด (ProductOption.collapsible)
 * ผู้ใช้สั่ง 27 ส.ค. 69 (จากภาพหน้าสินค้า: แผงตัวเลือกยาว กลุ่มติ๊ก "เกินขนาด" กินที่)
 *
 *   node scripts/cheer-cloth-collapsible.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/cheer-cloth-collapsible.mjs --write   # บันทึกจริง
 *
 * ตั้ง collapsible ให้เฉพาะ "กลุ่มที่ไม่เลือกก็ได้" — ปิดไว้ก่อน โชว์แค่แถวสวิตช์ + เลขเริ่มต้น
 *   · กลุ่มติ๊กหลายอย่าง (multi) 3 กลุ่ม "เกินขนาด" — ปิด = ล้างที่ติ๊ก
 *   · กลุ่ม FLEX 2 กลุ่ม (ตัวเลือกแรก "ไม่ใส่ FLEX" 0฿) — ปิด = เด้งกลับ "ไม่ใส่ FLEX"
 * กลุ่มที่ต้องเลือกอยู่แล้ว (ขนาด / ชนิดผ้า) ไม่แตะ — เป็นแกนราคา ปิดไม่ได้
 * เช็คก่อนเขียนเสมอว่าตัวเลือกแรกของกลุ่มที่ไม่ใช่ multi ต้องไม่คิดเงิน (กันค่าค้างที่มองไม่เห็น)
 * รันซ้ำได้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "2-2-2";
const TARGETS = [
  "ผ้ากว้างเกินขนาดมาตรฐาน (สกรีน 1 ด้าน)",
  "ผ้ากว้างเกินขนาดมาตรฐาน (สกรีน 2 ด้าน)",
  "FLEX กว้างเกินขนาดที่กำหนด",
  "FLEX (ลาย/ตัวอักษรพิเศษ)",
  "FLEX (ลาย/ตัวอักษรพิเศษ) ด้านที่ 2",
];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่ได้ — ${error.message}`);

const d = structuredClone(row.data);
const log = [];
for (const label of TARGETS) {
  const opt = (d.options ?? []).find((o) => o.label === label);
  if (!opt) throw new Error(`ไม่พบกลุ่ม "${label}" — โครงสินค้าเปลี่ยน ตรวจก่อน`);
  if (opt.display !== "multi") {
    const first = opt.choices?.[0];
    if (!first) throw new Error(`กลุ่ม "${label}" ไม่มีตัวเลือก`);
    if (first.extra) throw new Error(`กลุ่ม "${label}" ตัวเลือกแรก "${first.name}" คิดเงิน +${first.extra} — ปิดสวิตช์แล้วลูกค้าจะโดนคิดค่าที่มองไม่เห็น`);
  }
  log.push(`${opt.collapsible ? "= มีอยู่แล้ว" : "+ เพิ่ม"} 🔽 ${label} (${opt.display ?? "pills"})`);
  opt.collapsible = true;
}

console.log(`สินค้า: ${row.name} (${row.id})`);
console.log(log.join("\n"));

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) throw new Error(`บันทึกไม่สำเร็จ — ${e2.message}`);
console.log("\n✅ บันทึกลง Supabase แล้ว");
