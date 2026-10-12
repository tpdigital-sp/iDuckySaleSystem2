/**
 * 📐 กระดาษรองหลัง (package-backing): ช่องกำหนดขนาดเองนับชิ้น/แผ่น A3 ด้วยชีทไดคัทมาตรฐาน
 *
 *   node scripts/backing-sheet-yield-standard.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/backing-sheet-yield-standard.mjs --write
 *
 * พนักงานทัก 12 ต.ค. 69: กรอก 8 × 12 หน้าเว็บบอก "ได้ประมาณ 9 ชิ้น ต่อ 1 แผ่น A3"
 * แต่ /admin/diecut (ขอบ 0.5 · ระยะห่าง 0.5) จัดได้ 10 · กระดาษตัวอื่นตรงกับเครื่องคำนวณหมด
 * สาเหตุ: sheetYield ของตัวนี้ตัวเดียวตั้ง 40.5 × 30.4 เว้น 0.8 (grid-search ให้ตรงตารางขนาดสำเร็จ
 * ตอน 27 ส.ค. 69) ส่วนตัวอื่น 26 กลุ่มใช้ 43.76 × 28.89 เว้น 0.5 = พื้นที่วางของ /admin/diecut
 * → ปรับให้เหมือนกัน · ปุ่มขนาดสำเร็จ (7×7 · 9×15 …) ไม่แตะ ยังใช้ piecesPerUnit ตามตารางร้าน
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const ID = "package-backing";
const STD = { sheetW: 43.76, sheetH: 28.89, gap: 0.5 };

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const WRITE = process.argv.includes("--write");

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) {
  console.log("SKIP —", error?.message || "not found");
  process.exit(1);
}
const p = row.data;
let changed = 0;
for (const o of p.options ?? []) {
  const c = o.sheetYield;
  if (!c) continue;
  const before = `${c.sheetW}×${c.sheetH} gap ${c.gap ?? 0}`;
  if (c.sheetW === STD.sheetW && c.sheetH === STD.sheetH && c.gap === STD.gap) {
    console.log(`✓ ${o.label} ตรงแล้ว (${before})`);
    continue;
  }
  Object.assign(c, STD);
  changed++;
  console.log(`✎ ${o.label}  ${before} → ${STD.sheetW}×${STD.sheetH} gap ${STD.gap}`);
}
if (!changed) process.exit(0);
if (!WRITE) {
  console.log("(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
const { error: e2 } = await sb.from("products").update({ data: p }).eq("id", ID);
console.log(e2 ? `✗ ${e2.message}` : "✓ บันทึกแล้ว");
