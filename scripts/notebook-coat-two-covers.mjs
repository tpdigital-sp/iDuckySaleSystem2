#!/usr/bin/env node
/**
 * สมุดโน๊ต (notebook-ring) — ค่าเคลือบพิเศษต้องคิด 2 ปกต่อเล่ม (ปกหน้า + ปกหลัง)
 *
 *   node scripts/notebook-coat-two-covers.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/notebook-coat-two-covers.mjs --write
 *
 * ต้นตอ: notebook-apply.mjs เอา "ชิ้นต่อแผ่น A3" (A7 16 · A6 8 · A5 4) ไปใส่ perSheet ซึ่งแปลว่า "เล่มต่อแผ่น"
 * → A5 20 เล่ม คิด ⌈20 ÷ 4⌉ = 5 แผ่น แต่จริงใช้ 40 ปก = 10 แผ่น (คิดขาดครึ่งหนึ่ง)
 * แก้เฉพาะจุด (perSheet + ข้อความที่อ้างเลขเดิม) ไม่รันสคริปต์ทั้งตัวทับ เผื่อมีคนแก้สินค้าในหลังบ้านไปแล้ว
 * รันซ้ำได้ (รอบสองจะไม่เจออะไรให้แก้)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const ID = "notebook-ring";
/** ชิ้นต่อแผ่น A3 เดิม → เล่มต่อแผ่น A3 */
const FIX = { 16: 8, 8: 4, 4: 2 };
const TEXT = [
  ["A7 16 เล่ม · A6 8 เล่ม · A5 4 เล่ม", "A7 8 เล่ม · A6 4 เล่ม · A5 2 เล่ม (เล่มละ 2 ปก หน้า+หลัง)"],
  ["A5 สั่ง 4 เล่ม = 30 บาท · สั่ง 5 เล่ม", "A5 สั่ง 2 เล่ม = 30 บาท · สั่ง 3 เล่ม"],
  ["A5 สั่ง 5 เล่ม = 2 แผ่น A3", "A5 สั่ง 3 เล่ม = 2 แผ่น A3"],
  ["A5 สั่ง 4 เล่ม = 30 บาท สั่ง 5 เล่ม", "A5 สั่ง 2 เล่ม = 30 บาท สั่ง 3 เล่ม"],
];

const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) throw error;
if (row.name !== "สมุดโน๊ต") throw new Error(`ชื่อไม่ตรง (${row.name}) — หยุดกันเขียนผิดตัว`);

const d = row.data;
let n = 0;
const size = d.options.find((o) => o.label === "ขนาด");
// ตัวเช็คว่ายังเป็นเลขเดิม: A5 = 4 (ถ้าแก้แล้วจะเป็น 2) — กันรันซ้ำแล้วหารซ้ำ (16→8→4)
const stale = size?.choices.some((c) => c.name.startsWith("A5") && c.perSheet === 4);
for (const c of stale ? size.choices : []) {
  if (FIX[c.perSheet]) {
    console.log(`  perSheet ${c.name}: ${c.perSheet} → ${FIX[c.perSheet]} เล่ม/แผ่น A3`);
    c.perSheet = FIX[c.perSheet];
    n++;
  }
}
let json = JSON.stringify(d);
for (const [a, b] of TEXT) {
  const hits = json.split(a).length - 1;
  if (hits) {
    console.log(`  ข้อความ ×${hits}: "${a}" → "${b}"`);
    json = json.split(a).join(b);
    n += hits;
  }
}
const left = json.match(/[^"]{0,40}A5 4 เล่ม[^"]{0,40}/g);
if (left) console.log("⚠️ ยังมีข้อความเลขเดิมเหลือ:", left);

if (!n) console.log("✓ แก้ไปแล้ว ไม่มีอะไรต้องทำ");
else if (!WRITE) console.log(`\n(ดูอย่างเดียว ${n} จุด — ใส่ --write เพื่อบันทึก)`);
else {
  const { error: e2 } = await sb.from("products").update({ data: JSON.parse(json) }).eq("id", ID);
  if (e2) throw e2;
  console.log(`✓ บันทึกแล้ว ${n} จุด`);
}
