#!/usr/bin/env node
/**
 * "พวงกุญแจ + อะไหล่จุกสีใส" — ถอดภาพ "แผ่นอะไหล่รวม" ออกจากตัวเลือกตะขอ / ห่วง
 *
 *   node scripts/keyring-hook-drop-partsboard.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/keyring-hook-drop-partsboard.mjs --write   # บันทึกจริง
 *
 * ตอนสร้างสินค้า ตะขอที่ไม่มีชาร์ตสีรายตัวถูกใส่ภาพ "แผ่นอะไหล่รวม" ไว้เป็นภาพสำรอง (25 จาก 31 ตัว)
 * แต่ภาพนั้นเป็นแผ่นรวมทั้งแผ่น พอย่อลงเป็นรูปเล็กข้างช่องเลือก มองไม่ออกว่าตะขอหน้าตายังไง
 * — เห็นเป็นแค่ตารางเบลอ ๆ เหมือนกันหมดทุกตัว เลยถอดออก
 *
 * ตะขอ 6 ตัวที่มีชาร์ตสีของตัวเอง (G · H · I · S · T · U) ยังมีภาพเหมือนเดิม
 * ส่วนแผ่นอะไหล่รวมยังอยู่ในแท็บ "ตะขอ / ห่วง" (แสดงภาพใหญ่ อ่านรหัสได้) ไม่ได้ถูกลบทิ้ง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-clear-stopper";
const MARK = "parts-board";

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

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่ได้ — ${error.message}`);

const d = structuredClone(row.data);
let dropped = 0;
let kept = 0;

for (const opt of d.options ?? []) {
  for (const c of opt.choices) {
    if (!c.imageSrc) continue;
    if (c.imageSrc.includes(MARK)) {
      delete c.imageSrc;
      dropped++;
    } else if (opt.label.includes("ตะขอ")) {
      kept++;
    }
  }
}

console.log(`📦 ${d.name} (${ID})`);
console.log(`   • ถอดภาพแผ่นอะไหล่รวมออก ${dropped} ตัวเลือก`);
console.log(`   • ตะขอที่ยังมีชาร์ตสีของตัวเอง ${kept} ตัวเลือก (ไม่แตะ)`);

if (!dropped) {
  console.log("\n(ไม่มีอะไรต้องแก้ — ถอดไปแล้ว)");
  process.exit(0);
}
if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

const up = await sb.from("products").update({ data: d }).eq("id", ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log("\n✅ บันทึกแล้ว");
