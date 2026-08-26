#!/usr/bin/env node
/**
 * Acrylic Kit — ตรวจราคาของเสริมชุดใหม่ (ฐานรูเสียบ · แม่เหล็ก · ตะขอระบุจำนวน · เพิ่มชิ้นงาน)
 *
 *   node scripts/acrylic-kit-addons.mjs --json /tmp/kit.json   # กางผลลัพธ์ที่สคริปต์จะเขียน
 *   node scripts/acrylic-kit-price-check.mts /tmp/kit.json     # แล้วเช็คราคาทีละเคส
 *
 * อ่านคลังตัวเลือกสดจาก Supabase (กลุ่มสีตะขอลิงก์คลัง) แล้วคิดราคาด้วย unitPriceFor ตัวจริง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { unitPriceFor, MULTI_SEP } from "../src/lib/products.ts";
import { resolveOptions } from "../src/lib/option-presets.ts";

const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{persistSession:false} });
const { data: rows } = await sb.from("products").select("data").eq("category","__presets__");
const presets = (rows ?? []).map((r:any)=>r.data).filter((p:any)=>p?.id);

const raw = JSON.parse(readFileSync(process.argv[2],"utf8"));
const p:any = { ...raw, options: resolveOptions(raw.options, presets) };

const HOOK = "F ตะขอสปริง 12×35mm (เงิน/ทอง/โรสโกลด์/รุ้ง)";
const cases: [string, Record<string,string>, number][] = [
  ["A5 เปล่า · 8 ชุด", { "ขนาด": "A5 (14.8×21 ซม.)" }, 8],
  ["A5 + ฐาน 1-2 รู · 8 ชุด", { "ขนาด": "A5 (14.8×21 ซม.)", "ฐานรูเสียบสแตนดี้": "1-2 รูเสียบ" }, 8],
  ["A5 + ฐาน 5 รู · 8 ชุด", { "ขนาด": "A5 (14.8×21 ซม.)", "ฐานรูเสียบสแตนดี้": "5 รูเสียบ" }, 8],
  ["A5 + แม่เหล็ก 3 จุด · 8 ชุด", { "ขนาด": "A5 (14.8×21 ซม.)", "แม่เหล็ก (Acrylic Kit Magnet)": "ติดแม่เหล็ก ขนาด 3 มม. ×3" }, 8],
  ["A5 + ตะขอ F เงิน 1 ชิ้น · 8 ชุด (ปลีก เหมา 10)", { "ขนาด": "A5 (14.8×21 ซม.)", "รับตะขอไหม": "รับตะขอ", "ตะขอ": HOOK, "สีตะขอ · โลหะ (F/J/K/L/M/N/O)": "สีเงิน" }, 8],
  ["A5 + ตะขอ F เงิน 3 ชิ้น · 8 ชุด (ปลีก 3×10)", { "ขนาด": "A5 (14.8×21 ซม.)", "รับตะขอไหม": "รับตะขอ", "ตะขอ": `${HOOK} ×3`, "สีตะขอ · โลหะ (F/J/K/L/M/N/O)": "สีเงิน" }, 8],
  ["A5 + ตะขอ F เงิน 3 ชิ้น · 30 ชุด (ส่ง สีคูณ 3)", { "ขนาด": "A5 (14.8×21 ซม.)", "รับตะขอไหม": "รับตะขอ", "ตะขอ": `${HOOK} ×3`, "สีตะขอ · โลหะ (F/J/K/L/M/N/O)": "สีเงิน" }, 30],
  ["A5 + ตะขอ F เงิน 1 ชิ้น · 30 ชุด (ส่ง)", { "ขนาด": "A5 (14.8×21 ซม.)", "รับตะขอไหม": "รับตะขอ", "ตะขอ": HOOK, "สีตะขอ · โลหะ (F/J/K/L/M/N/O)": "สีเงิน" }, 30],
  ["A5 + ห่วง Z1 แถมฟรี ×3 · 8 ชุด", { "ขนาด": "A5 (14.8×21 ซม.)", "รับตะขอไหม": "รับตะขอ", "ตะขอ": "Z1 ห่วงกลม (สีเงิน) ×3" }, 8],
  ["A5 + Z1×2 + F×3 เงิน · 8 ชุด (ฟรี+เหมา)", { "ขนาด": "A5 (14.8×21 ซม.)", "รับตะขอไหม": "รับตะขอ", "ตะขอ": `Z1 ห่วงกลม (สีเงิน) ×2${MULTI_SEP}${HOOK} ×3`, "สีตะขอ · โลหะ (F/J/K/L/M/N/O)": "สีเงิน" }, 8],
  ["A5 + เพิ่มชิ้นงาน 2 ชิ้น (แอดมินตีราคา)", { "ขนาด": "A5 (14.8×21 ซม.)", "เพิ่มจำนวนชิ้นงาน (เกิน 5 ชิ้นต่อกรอบ)": "เพิ่มชิ้นงานจาก 5 ชิ้น ×2" }, 8],
  ["8×8 + ตะขอ G เขียว ×2 · 30 ชุด (สี G1 10×2)", { "ขนาด": "8×8 ซม.", "รับตะขอไหม": "รับตะขอ", "ตะขอ": "G ตะขอสปริงพลาสติก (หลายสี) ×2", "สีตะขอ G": "G8 สีเขียวอ่อน" }, 30],
];
for (const [name, sel, qty] of cases) {
  console.log(String(unitPriceFor(p, sel, qty)).padStart(6), "บาท/ชุด  ←", name);
}
