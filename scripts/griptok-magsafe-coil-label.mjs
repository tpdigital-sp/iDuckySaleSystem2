#!/usr/bin/env node
/**
 * GRIPTOK MAGSAFE (griptok-magsafe) — ย่อข้อความตัวเลือก "Magsafe coil base"
 *
 *   node scripts/griptok-magsafe-coil-label.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/griptok-magsafe-coil-label.mjs --write
 *
 * ผู้ใช้สั่ง 31 ส.ค. 69: ชื่อเดิม "เพิ่ม coil base ติดในเคส (อันละ 15 บาท)" ยาวจนตกสองบรรทัด
 * และซ้ำกับป้าย "+ ฿15" ที่ระบบขึ้นให้อยู่แล้ว — ตัดวงเล็บราคาออก
 *
 * ⚠️ ไม่รัน griptok-magsafe-apply.mjs ทับ — ของจริงตอนนี้ต่างจากสคริปต์นั้นแล้ว
 *    สคริปต์นี้อ่านของสดมาแก้เฉพาะชื่อตัวเลือก แล้วเขียนกลับ · รันซ้ำได้ (idempotent)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "griptok-magsafe";
const COIL_LABEL = "Magsafe coil base";
const NEW_NAME = "เพิ่ม coil base ติดในเคส";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
if (row.name !== "GRIPTOK MAGSAFE") throw new Error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
const d = structuredClone(row.data);

const group = (d.options ?? []).find((o) => o.label === COIL_LABEL);
if (!group) throw new Error(`ไม่เจอกลุ่ม "${COIL_LABEL}" — โครงตัวเลือกเปลี่ยน มาดูเองก่อน`);
if (group.choices.length !== 1) throw new Error(`กลุ่ม "${COIL_LABEL}" มี ${group.choices.length} ตัวเลือก — คาดว่ามีตัวเดียว มาดูเองก่อน`);

const before = group.choices[0].name;
group.choices[0].name = NEW_NAME;
console.log(`"${before}"\n  → "${NEW_NAME}"`);

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (upErr) throw upErr;
console.log("บันทึกแล้ว");
