/**
 * 📐 สแตนดี้อะคริลิค (standy) — แก้ข้อความใต้ช่อง "กำหนดขนาดเอง" ให้ตรงกับราคาที่ระบบคิดจริง
 *
 * เดิมเขียนว่า "เกิน 30 ซม. แอดมินตีราคาให้" แต่ตารางราคาจริงของแต่ละเรทไม่เท่ากัน
 *   • เรทที่ 1 (คละดีเทล / ปลีก) มีราคาถึง 20 ซม.
 *   • เรทที่ 2 (ไม่คละดีเทล · 50 ชิ้นขึ้นไป) มีราคาถึง 30 ซม.
 * ตอนนี้โค้ดเกาะได้เฉพาะแถวที่ "มีราคาในเรทที่ลูกค้าเลือกอยู่" (sizeInputPlanOf)
 * — ลูกค้าปลีกกรอก 25 ซม. จึงขึ้น 💬 รอแอดมินตีราคา ไม่ใช่ราคาตั้งต้นของสินค้า
 *
 *   node scripts/standy-size-hint-rate.mjs --dry
 *   node scripts/standy-size-hint-rate.mjs
 *
 * รันซ้ำได้ (idempotent) · อ่าน-แก้-เขียนบนแถวจริง แตะเฉพาะ input.hint ของช่องเดียว
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "standy";
const SIZE_LABEL = "ขนาดตัวสแตนดี้";
const HINT =
  "วัดด้านที่ยาวที่สุดของตัวสแตนดี้ (ไม่รวมฐาน) ใส่ทศนิยมได้ เช่น 12.5 · " +
  "เศษไม่เกินครึ่งเซนติเมตรยังอยู่แถวเดิม (12.5 ซม. = แถว 12cm · 12.6 ซม. = แถว 13cm) · " +
  "ใหญ่กว่าขนาดที่มีในตารางราคาของเรทที่เลือก (เรทที่ 1 ถึง 20 ซม. · เรทที่ 2 ถึง 30 ซม.) แอดมินตีราคาให้";

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const DRY = process.argv.includes("--dry");
const die = (msg) => { console.error("✗ " + msg); process.exit(1); };

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;

const size = (p.options || []).find((o) => o.label.trim() === SIZE_LABEL);
if (!size?.sizeInput) die("ไม่พบกลุ่ม " + SIZE_LABEL + " หรือกลุ่มนี้ยังไม่ได้ตั้ง sizeInput");

// ช่องที่เขียนข้อความ = ช่องด้านสุดท้ายของคู่ (สินค้านี้กรอกด้านยาวสุดช่องเดียว)
const fieldLabel = size.sizeInput.heightLabel ?? size.sizeInput.widthLabel;
const field = (p.options || []).find((o) => o.label === fieldLabel);
if (!field?.input) die("ไม่พบช่องกรอก " + fieldLabel);

if (field.input.hint === HINT) {
  console.log("✓ ข้อความตรงอยู่แล้ว ไม่ต้องแก้");
  process.exit(0);
}
console.log("เดิม:", field.input.hint);
console.log("ใหม่:", HINT);
if (DRY) { console.log("\n(--dry ไม่เขียนฐานข้อมูล)"); process.exit(0); }

field.input.hint = HINT;
p.savedAt = new Date().toISOString();
const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", ID);
if (upErr) die(upErr.message);

// อ่านกลับเทียบ
const { data: after } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const got = (after.data.options || []).find((o) => o.label === fieldLabel)?.input?.hint;
console.log(got === HINT ? "✅ บันทึกแล้ว (อ่านกลับตรง)" : "✗ อ่านกลับไม่ตรง");
