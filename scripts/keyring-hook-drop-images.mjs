#!/usr/bin/env node
/**
 * "พวงกุญแจ + อะไหล่จุกสีใส" — ถอดภาพประจำตัวเลือกออกจากกลุ่ม "ตะขอ / ห่วง" ทั้งกลุ่ม
 *
 *   node scripts/keyring-hook-drop-images.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/keyring-hook-drop-images.mjs --write   # บันทึกจริง
 *
 * ทำไม:
 *   1. ตะขอ 25 ตัวที่ไม่มีชาร์ตของตัวเอง เคยใส่ "แผ่นอะไหล่รวม" เป็นภาพสำรอง — ย่อเป็นรูปเล็ก
 *      ข้างช่องเลือกแล้วมองไม่ออกว่าตะขอหน้าตายังไง เห็นเป็นตารางเบลอ ๆ เหมือนกันหมด
 *   2. ตะขอ 6 ตัวที่มีชาร์ตสีของตัวเอง (G · H · I · S · T · U) ทำให้ชาร์ตพวกนั้นไหลไปโผล่ใน
 *      "แกลเลอรีรูปสินค้า" ด้านบนด้วย (หน้าสินค้าดูดภาพประจำตัวเลือกเข้าแกลเลอรีอัตโนมัติ —
 *      ดู galleryImages ใน ProductDetail.tsx) แถวรูปย่อเลยเต็มไปด้วยชาร์ตตะขอแทนรูปงานจริง
 *
 * ภาพตะขอทั้งหมดยังอยู่ในแท็บ "ตะขอ / ห่วง" (แสดงภาพใหญ่ อ่านรหัสได้) ไม่ได้ลบทิ้งจาก storage
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-clear-stopper";
const GROUP = "ตะขอ / ห่วง";

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
const opt = (d.options ?? []).find((o) => o.label === GROUP);
if (!opt) throw new Error(`ไม่เจอกลุ่มตัวเลือก "${GROUP}" — สินค้าถูกแก้โครงไปแล้ว ตรวจก่อนรันทับ`);

const dropped = [];
for (const c of opt.choices) {
  if (!c.imageSrc) continue;
  dropped.push(`${c.name} — ${c.imageSrc.split("/").pop()}`);
  delete c.imageSrc;
}

console.log(`📦 ${d.name} (${ID}) · กลุ่ม "${GROUP}" ${opt.choices.length} ตัวเลือก`);
dropped.forEach((x) => console.log(`   − ${x}`));
console.log(`   รวมถอดภาพออก ${dropped.length} ตัวเลือก`);

if (!dropped.length) {
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
