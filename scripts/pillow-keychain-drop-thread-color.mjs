#!/usr/bin/env node
/**
 * ถอดกลุ่มตัวเลือก "สีไหมเย็บชิ้นงาน" ออกจาก PILLOW KEYCHAIN (pillow-keychain)
 * ตามผู้ใช้สั่ง 25 ส.ค. 69
 *
 * เช็คก่อนถอดแล้ว: ไม่ใช่แกนราคา (pricing.driverLabels ว่าง · priceRates ไม่มี cells)
 * ไม่มี rules อ้างถึง · ทั้ง data กล่าวถึงคำว่า "สีไหม" แค่ครั้งเดียวคือตัวกลุ่มเอง
 * กลุ่มลิงก์คลังกลาง preset-4 — ถอดจากสินค้าตัวนี้ไม่กระทบคลังหรือสินค้าตัวอื่น
 *
 *   node scripts/pillow-keychain-drop-thread-color.mjs           # ดูผลก่อน (ไม่เขียน)
 *   node scripts/pillow-keychain-drop-thread-color.mjs --write
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "pillow-keychain";
const DROP = "สีไหมเย็บชิ้นงาน";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const data = row.data;

// กันพลาด: ถ้ากลุ่มนี้ดันเป็นแกนราคาที่ไหนสักที่ ให้หยุดทันที (ราคาจะหล่นไป product.price เงียบ ๆ)
const drivers = [
  ...(data.pricing?.driverLabels ?? []),
  ...(data.priceRates ?? []).flatMap((r) => r.driverLabels ?? []),
];
if (drivers.includes(DROP)) {
  console.error(`✗ หยุด: "${DROP}" เป็นแกนตารางราคา (driverLabels) ถอดไม่ได้`);
  process.exit(1);
}

const before = (data.options ?? []).map((o) => o.label);
const group = (data.options ?? []).find((o) => o.label === DROP);
if (!group) {
  console.log(`— ไม่พบกลุ่ม "${DROP}" (อาจถอดไปแล้ว) ไม่ต้องทำอะไร`);
  process.exit(0);
}
console.log(`จะถอด: ${DROP} (${(group.choices ?? []).length} ตัวเลือก · display=${group.display} · preset=${group.presetId ?? "—"})`);

data.options = (data.options ?? []).filter((o) => o.label !== DROP);
console.log(`\nกลุ่มก่อน: ${before.join(" | ")}`);
console.log(`กลุ่มหลัง: ${data.options.map((o) => o.label).join(" | ")}`);

if (!WRITE) {
  console.log("\n(dry-run) รันด้วย --write เพื่อบันทึกจริง");
  process.exit(0);
}

const { error: upErr } = await sb.from("products").update({ data }).eq("id", ID);
if (upErr) throw upErr;

const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const still = (back.data.options ?? []).some((o) => o.label === DROP);
const leftover = JSON.stringify(back.data).includes("สีไหม");
console.log(`\nบันทึกแล้ว — กลุ่มยังอยู่? ${still ? "✗ ยังอยู่" : "✓ หายแล้ว"} · มีคำว่า "สีไหม" ค้างใน data? ${leftover ? "✗ ยังมี" : "✓ ไม่มี"}`);
console.log(`เหลือ ${back.data.options.length} กลุ่ม: ${back.data.options.map((o) => o.label).join(" | ")}`);
