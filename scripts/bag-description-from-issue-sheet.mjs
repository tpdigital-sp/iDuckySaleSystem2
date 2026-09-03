#!/usr/bin/env node
/**
 * เติมคำอธิบายสินค้า (data.description — ย่อหน้าใต้ชื่อบนหน้าสินค้า) ของกระเป๋า 2 ตัว
 * ตามใบสเปค Crossbody bag / Shoulder bag ที่ลูกค้าส่งมา (3 ก.ย. 69)
 *
 *   node scripts/bag-description-from-issue-sheet.mjs           # dry-run โชว์เก่า/ใหม่
 *   node scripts/bag-description-from-issue-sheet.mjs --write   # บันทึก + อ่านกลับเทียบ
 *
 * ของใหม่ที่เพิ่มจากใบสเปค: วัสดุ (โพลีเอสเตอร์ / หนัง PU) · ขนาดใบไม่รวมสาย ·
 * ซับใน-ช่องด้านใน (crossbody ไม่มี / shoulder มี 1 ช่อง) · ความคลาดเคลื่อน 1-2 ซม.
 * ตัวเลขที่ "ไม่" ยกตามใบสเปค (ยึด DB แทน): สีไหมมีให้เลือก 80 เฉด (ใบสเปคว่า 3 สี =
 * จำนวนที่รวมในราคา ไม่ใช่จำนวนเฉด) · ราคาเริ่มต้น 250/280 = เรทต่ำสุดของตารางจริง
 *
 * description อยู่ใน data อย่างเดียว ไม่มีคอลัมน์กระจก — แต่ต้องอัป savedAt (ISO string)
 * ให้แท็บหน้าแก้ไขที่เปิดค้างโดนตีกลับ 409 แทนที่จะบันทึกทับ (ดู scripts/thread-color-note-short.mjs)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const WRITE = process.argv.includes("--write");

const DESC = {
  "crossbody-bag":
    "กระเป๋าสะพายข้าง (Crossbody Bag) ผ้าโพลีเอสเตอร์ ปักชื่อ ข้อความ หรือรูปภาพตามสั่ง " +
    "เลือกสีขาวหรือสีดำ ขนาดกระเป๋า (ไม่รวมสาย) 30×7×22 ซม. สายสะพายปรับความยาวได้ตามต้องการ " +
    "เปิด-ปิดด้วยซิป ไม่มีซับในและช่องด้านใน ขนาดปักไม่เกิน กว้าง 8 × สูง 4 ซม. " +
    "(เกินจากนี้บวกเพิ่ม ซม. ละ 15 บาท) สีไหมปักมีให้เลือก 80 เฉด รวมในราคา 3 สี " +
    "(สีที่ 4 ขึ้นไปบวกเพิ่มสีละ 10 บาท) ปักข้อความเลือกฟอนต์อังกฤษ/ไทยได้ " +
    "กระเป๋าแต่ละใบมีความคลาดเคลื่อน 1-2 ซม. เหมาะใช้เอง ของขวัญ " +
    "ยิ่งสั่งเยอะยิ่งถูก เริ่มต้นใบละ 250 บาท",
  "shoulder-bag":
    "กระเป๋าสะพายไหล่ (Shoulder Bag) หนัง PU ปักชื่อ ข้อความ หรือรูปภาพตามสั่ง " +
    "เลือกสีขาวหรือสีดำ ขนาดกระเป๋า (ไม่รวมสาย) 25×6×12 ซม. สายสะพายปรับความยาวได้ตามต้องการ " +
    "เปิด-ปิดด้วยซิป มีซับในและช่องด้านใน 1 ช่อง ขนาดปักไม่เกิน กว้าง 8 × สูง 4 ซม. " +
    "(เกินจากนี้บวกเพิ่ม ซม. ละ 15 บาท) สีไหมปักมีให้เลือก 80 เฉด รวมในราคา 3 สี " +
    "(สีที่ 4 ขึ้นไปบวกเพิ่มสีละ 10 บาท) ปักข้อความเลือกฟอนต์อังกฤษ/ไทยได้ " +
    "กระเป๋าแต่ละใบมีความคลาดเคลื่อน 1-2 ซม. เหมาะใช้เอง ของขวัญ " +
    "ยิ่งสั่งเยอะยิ่งถูก เริ่มต้นใบละ 280 บาท",
};

for (const [id, next] of Object.entries(DESC)) {
  const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", id).single();
  if (error) throw error;
  console.log(`\n== ${row.id} — ${row.name}`);
  console.log(`เดิม: ${row.data.description ?? "(ว่าง)"}`);
  console.log(`ใหม่: ${next}`);
  if (row.data.description === next) { console.log("· ตรงอยู่แล้ว ข้าม"); continue; }
  if (!WRITE) continue;

  const savedAt = new Date().toISOString();
  const data = { ...row.data, description: next, savedAt };
  const { data: upd, error: e2 } = await sb.from("products").update({ data }).eq("id", id).select("data");
  if (e2) throw e2;
  if (!upd?.length) { console.error("✗ อัปเดตโดน 0 แถว"); process.exit(1); }

  // อ่านกลับมาเทียบ — update() คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง
  const { data: back, error: e3 } = await sb.from("products").select("data").eq("id", id).single();
  if (e3) throw e3;
  if (back.data.description !== next || back.data.savedAt !== savedAt) {
    console.error("✗ อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");
    process.exit(1);
  }
  console.log("✏️ บันทึกแล้ว + อ่านกลับตรง ✅");
}

console.log(WRITE ? "\nเสร็จ ✅ (หน้าร้านแคช 5 นาที — เปิดเช็คด้วย ?v=ใหม่)" : "\n(dry-run — เติม --write เพื่อบันทึกจริง)");
