#!/usr/bin/env node
/**
 * ปฏิทิน Mini Calendar (mini-calendar) + ตั้งโต๊ะ ทรงมาตรฐาน (3x3-7-62cm)
 * — การ์ดกลุ่มเคลือบใช้ "ภาพนิ่ง" ชุดกลาง coating-b เหมือนสินค้างานกระดาษ
 *   (ถอด videoSrc คลิปฟิล์มออก · imageSrc ชี้ coating-b อยู่แล้วจาก coating-photos-shopwide.mjs)
 *
 *   node scripts/calendar-coating-photos.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/calendar-coating-photos.mjs --write
 *
 * ผู้ใช้สั่ง 3 ก.ย. 69 (ตามหลังปฏิทินไดคัท scripts/calendar-dicut-coating-photos.mjs)
 * ⚠️ ไม่รัน build/coating .mts ทั้งตัว — กลุ่มฟอยล์อาจถูกถอดจากหลังบ้านแล้ว รันตัวนั้นจะสร้างกลับมา
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const TARGETS = [
  {
    id: "mini-calendar",
    nameRe: /Mini Calendar/i,
    groups: [
      "เคลือบ (ด้านหน้า)",
      "ลายฟิล์มเคลือบพิเศษ (ด้านหน้า)",
      "เคลือบ (ด้านหลัง)",
      "ลายฟิล์มเคลือบพิเศษ (ด้านหลัง)",
    ],
  },
  {
    id: "3x3-7-62cm",
    nameRe: /ปฎิทินตั้งโต๊ะ/,
    groups: [
      "เคลือบด้านหน้า",
      "ลายฟิล์มเคลือบพิเศษ (ด้านหน้า)",
      "เคลือบด้านหลัง",
      "ลายฟิล์มเคลือบพิเศษ (ด้านหลัง)",
    ],
  },
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

for (const t of TARGETS) {
  const { data: row, error } = await sb.from("products").select("name,data").eq("id", t.id).single();
  if (error) die(`${t.id}: ${error.message}`);
  if (!t.nameRe.test(row.name)) die(`id ${t.id} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`);
  const d = structuredClone(row.data);
  console.log(`\n===== ${t.id} · "${row.name}"`);

  let hits = 0;
  for (const label of t.groups) {
    const g = (d.options ?? []).find((o) => o.label === label);
    if (!g) die(`${t.id}: ไม่เจอกลุ่ม "${label}" — โครงตัวเลือกเปลี่ยน มาดูเองก่อน`);
    console.log(`[${label}]`);
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
  console.log(`รวมถอดคลิป ${hits} ตัวเลือก`);

  if (!WRITE) continue;

  d.savedAt = new Date().toISOString();
  const { data: saved, error: saveErr } = await sb.from("products").update({ data: d }).eq("id", t.id).select("data");
  if (saveErr) die(saveErr.message);
  if (saved.length !== 1) die(`update โดน ${saved.length} แถว`);

  // อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
  const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", t.id).single();
  if (backErr) die(backErr.message);
  if (back.data.savedAt !== d.savedAt) die(`${t.id}: savedAt อ่านกลับไม่ตรง — ค่าไม่ลงจริง รันซ้ำ`);
  let checked = 0;
  for (const label of t.groups) {
    const g = (back.data.options ?? []).find((o) => o.label === label);
    for (const c of g?.choices ?? []) {
      if (c.videoSrc) die(`${t.id} · ${label} · "${c.name}" ยังมี videoSrc อยู่`);
      if (!c.imageSrc?.includes("/coating-")) die(`${t.id} · ${label} · "${c.name}" imageSrc หาย`);
      checked++;
    }
  }
  console.log(`✅ ${t.id} บันทึกแล้ว · อ่านกลับยืนยัน ${checked} ตัวเลือก ไม่เหลือ videoSrc · savedAt ${d.savedAt}`);
}

if (!WRITE) console.log("\n(ยังไม่เขียน — ใส่ --write ถ้าโอเค)");
