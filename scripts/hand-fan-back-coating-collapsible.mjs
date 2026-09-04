#!/usr/bin/env node
/**
 * HAND FAN พัดกระดาษไดคัทตามทรง (Digital) — กลุ่ม "เคลือบ (ด้านหลัง)" มีปุ่มเปิด-ปิด
 * ผู้ใช้สั่ง 3 ก.ย. 69 ("เคลือบ (ด้านหลัง) เพิ่มปุ่มเปิด-ปิด ให้หน่อย")
 *
 *   node scripts/hand-fan-back-coating-collapsible.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/hand-fan-back-coating-collapsible.mjs --write   # บันทึกจริง
 *
 * ตั้ง ProductOption.collapsible = true — หน้าสินค้าโชว์แค่แถวสวิตช์ ปิดไว้ก่อน
 * ปิดสวิตช์ = เด้งกลับตัวเลือกแรก ซึ่งต้องเป็น 0฿ ("ไม่เคลือบด้านหลัง") — เช็คก่อนเขียนเสมอ
 * กลุ่มลูก "ผิวฟิล์มพิเศษ (ด้านหลัง)" ผูก showWhen ไว้ จึงหายตามเองเมื่อปิดสวิตช์
 * รันซ้ำได้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "hand-fan-paper";
const TARGETS = ["เคลือบ (ด้านหลัง)"];

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
  log.push(`${opt.collapsible ? "= มีอยู่แล้ว" : "+ เพิ่ม"} 🔽 ${label} (${opt.display ?? "pills"}) · ตัวเลือกแรก "${opt.choices?.[0]?.name}" 0฿`);
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
