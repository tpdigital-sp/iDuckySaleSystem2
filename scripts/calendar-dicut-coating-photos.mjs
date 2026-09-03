#!/usr/bin/env node
/**
 * ปฏิทินตั้งโต๊ะ ไดคัทตามทรง (new-mt2s9i0u-5323) — การ์ดกลุ่มเคลือบใช้ "ภาพนิ่ง" ชุดกลาง
 * เหมือนสินค้างานกระดาษ (ถอด videoSrc คลิปฟิล์มที่ติดมาจาก mini-calendar ออก)
 *
 *   node scripts/calendar-dicut-coating-photos.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/calendar-dicut-coating-photos.mjs --write
 *
 * ผู้ใช้สั่ง 3 ก.ย. 69: "เปลี่ยนภาพกลุ่มตัวเลือกเคลือบ ให้เหมือนกับสินค้างานกระดาษ"
 * — imageSrc ชี้ products/coating-b/<key>-v1.jpg (ชุดกลางทั้งร้าน) อยู่แล้วจาก
 *   scripts/coating-photos-shopwide.mjs แต่การ์ดยังเล่น videoSrc ทับ จึงไม่เห็นภาพ
 * ⚠️ ไม่รัน calendar-dicut-coating.mts ทั้งตัว — กลุ่มฟอยล์ถูกถอดออกจากสินค้าแล้ว
 *   (savedAt 3 ก.ย. 69 07:54) รันตัวนั้นจะสร้างกลุ่มฟอยล์กลับมา
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "new-mt2s9i0u-5323";
const GROUPS = [
  "เคลือบ (ด้านหน้า)",
  "ลายฟิล์มเคลือบพิเศษ (ด้านหน้า)",
  "เคลือบ (ด้านหลัง)",
  "ลายฟิล์มเคลือบพิเศษ (ด้านหลัง)",
];

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});
const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) die(error.message);
if (!/ไดคัท/.test(row.name)) die(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
const d = structuredClone(row.data);

let hits = 0;
for (const label of GROUPS) {
  const g = (d.options ?? []).find((o) => o.label === label);
  if (!g) die(`ไม่เจอกลุ่ม "${label}" — โครงตัวเลือกเปลี่ยน มาดูเองก่อน`);
  console.log(`\n[${label}]`);
  for (const c of g.choices ?? []) {
    if (!c.imageSrc?.includes("/coating-")) die(`"${c.name}" imageSrc ไม่ใช่ภาพชุดกลาง coating-*: ${c.imageSrc}`);
    if (!c.videoSrc) {
      console.log(`   • ${c.name} — ไม่มีคลิปอยู่แล้ว`);
      continue;
    }
    delete c.videoSrc;
    hits++;
    console.log(`   • ${c.name} → ภาพนิ่ง ${c.imageSrc.replace(/^.*product-images\/products\//, "")}`);
  }
}
console.log(`\nรวมถอดคลิป ${hits} ตัวเลือก`);

if (!WRITE) {
  console.log("(ยังไม่เขียน — ใส่ --write ถ้าโอเค)");
  process.exit(0);
}

d.savedAt = new Date().toISOString();
const { data: saved, error: saveErr } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (saveErr) die(saveErr.message);
if (saved.length !== 1) die(`update โดน ${saved.length} แถว`);

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", ID).single();
if (backErr) die(backErr.message);
if (back.data.savedAt !== d.savedAt) die("savedAt อ่านกลับไม่ตรง — ค่าไม่ลงจริง รันซ้ำ");
let checked = 0;
for (const label of GROUPS) {
  const g = (back.data.options ?? []).find((o) => o.label === label);
  for (const c of g?.choices ?? []) {
    if (c.videoSrc) die(`${label} · "${c.name}" ยังมี videoSrc อยู่`);
    if (!c.imageSrc?.includes("/coating-")) die(`${label} · "${c.name}" imageSrc หาย`);
    checked++;
  }
}
console.log(`✅ บันทึกแล้ว · อ่านกลับยืนยัน ${checked} ตัวเลือก ไม่เหลือ videoSrc · savedAt ${d.savedAt}`);
