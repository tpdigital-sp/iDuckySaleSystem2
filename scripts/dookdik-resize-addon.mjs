#!/usr/bin/env node
/**
 * "อะคริลิคดุ๊กดิ๊ก" — จัดกลุ่ม "เพิ่มขนาด (ถ้าต้องการใหญ่กว่ามาตรฐาน)" ตามผู้ใช้สั่ง 26 ส.ค. 69:
 *   • ย้ายไปอยู่หลังชุดตะขอ (เดิมคั่นกลางระหว่างงานสกรีนกับ "รับตะขอไหม")
 *     → ลำดับใหม่: แบบ · งานสกรีน ×2 · ชุดตะขอ 15 กลุ่ม · เพิ่มขนาด
 *   • ติดสวิตช์เปิด-ปิด (collapsible) — กลุ่ม multi ปิดสวิตช์ = ล้างที่ติ๊ก
 *     (ProductDetail รองรับ collapsible กับกลุ่ม multi แล้วในคอมมิตเดียวกัน)
 *
 *   node scripts/dookdik-resize-addon.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/dookdik-resize-addon.mjs --write   # บันทึกจริง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "acrylic-dookdik";
const RESIZE = "เพิ่มขนาด (ถ้าต้องการใหญ่กว่ามาตรฐาน)";

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
const idx = (d.options ?? []).findIndex((o) => o.label === RESIZE);
if (idx < 0) throw new Error(`ไม่พบกลุ่ม "${RESIZE}" — ตรวจก่อน`);
if (!(d.options ?? []).some((o) => o.label === "รับตะขอไหม"))
  throw new Error('ไม่พบชุดตะขอ — รัน scripts/dookdik-hooks-screen.mjs ก่อน');

const [resize] = d.options.splice(idx, 1);
resize.collapsible = true; // ของเสริมที่ลูกค้าส่วนใหญ่ไม่ได้ใช้ — ปิดไว้ก่อน หน้าจะได้ไม่ยาว
d.options.push(resize);
d.savedAt = new Date().toISOString();

console.log(`📦 ${d.name} (${ID})`);
console.log(`   "${RESIZE}" ตำแหน่ง ${idx + 1} → ท้ายสุด (${d.options.length}) · collapsible=true`);
console.log("   ลำดับใหม่:", d.options.map((o) => o.label).join(" · "));

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

const up = await sb.from("products").update({ data: d }).eq("id", ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log("\n✅ บันทึกแล้ว");
