#!/usr/bin/env node
/**
 * ☕✂️ CUP SLEEVE — "📐 กำหนดขนาดเอง" ให้จอออกแบบสร้างเส้นไดคัทเองจากทรงมาตรฐาน 27.7 × 7.6 (ผู้ใช้สั่ง 16 ต.ค. 69)
 *
 * เพิ่มรูปแบบงานใน calendarStudio.formats:
 *   sleeve@{cm:ขนาดกำหนดเอง (กว้าง)}x{cm:ขนาดกำหนดเอง (สูง)}  เมื่อ ขนาดปลอกแก้ว = กำหนดขนาดเอง
 *   → หน้าสินค้าแทนค่าที่ลูกค้ากรอก (ซม. → มม.) · จอออกแบบวาดเส้นตามทรง (lib/sleeve-dieline) · ไฟล์ .ai/.pdf ได้เส้น CutContour
 * ขนาดมาตรฐานไม่มีรูปแบบนี้ → ใช้เทมเพลต .ai ที่ผูกไว้ (tpl@) ตามเดิม
 *
 * read-modify-write · รันซ้ำได้ (แทนตัวเดิมถ้ามี) · --dry = ดูอย่างเดียว
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "cup-sleeve";
const SIZE = "ขนาดปลอกแก้ว";
const CUSTOM = "📐 กำหนดขนาดเอง (งานคัสตอมตามไฟล์)";
const W = "ขนาดกำหนดเอง (กว้าง)";
const H = "ขนาดกำหนดเอง (สูง)";
const FORMAT = `sleeve@{cm:${W}}x{cm:${H}}`;
const DRY = process.argv.includes("--dry");

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.error("✗ " + m); process.exit(1); };

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;
const size = (p.options || []).find((o) => o.label === SIZE);
if (!size?.choices?.some((c) => c.name === CUSTOM)) die(`ไม่พบตัวเลือก "${CUSTOM}" ในกลุ่ม ${SIZE}`);
for (const l of [W, H]) if (!(p.options || []).some((o) => o.label === l)) die("ไม่พบช่องกรอก " + l);
if (!p.calendarStudio) die("สินค้านี้ยังไม่เปิดจอออกแบบ (calendarStudio)");

const before = JSON.stringify(p.calendarStudio.formats ?? []);
const rest = (p.calendarStudio.formats ?? []).filter((f) => !String(f.format).startsWith("sleeve@"));
p.calendarStudio.formats = [{ format: FORMAT, when: [{ label: SIZE, choices: [CUSTOM] }] }, ...rest];
console.log("formats เดิม:", before);
console.log("formats ใหม่:", JSON.stringify(p.calendarStudio.formats));
if (DRY) { console.log("(dry-run · ไม่ได้เขียน)"); process.exit(0); }
p.savedAt = new Date().toISOString();
const { error: e2 } = await sb.from("products").update({ data: p }).eq("id", ID);
if (e2) die(e2.message);
console.log("✓ บันทึกแล้ว");
