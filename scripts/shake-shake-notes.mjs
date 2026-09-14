#!/usr/bin/env node
/**
 * ✂️ พวงกุญแจเขย่า — จัดข้อความกำกับกลุ่มตัวเลือกให้กระชับ + เป็นบรรทัด (เจ้าของร้านสั่ง 14 ก.ย. 69)
 * ข้อความชุดเดียวกับที่ `scripts/shake-shake-build.mts` สร้าง — ตัวนี้แค่แก้ของเดิมใน DB
 * โดยไม่ต้องรันสคริปต์สร้างสินค้าใหม่ทั้งตัว (เสี่ยงทับของที่เพิ่มมาทีหลัง)
 *
 *   node scripts/shake-shake-notes.mjs            # ดูก่อน
 *   node scripts/shake-shake-notes.mjs --write    # เขียน + อ่านกลับเทียบ
 *
 * รันซ้ำได้ · เรทต่อ ซม. ของกรอบอ่านสดจากตัวเลือกจริง ไม่ฮาร์ดโค้ด
 * (บรรทัดขึ้นต้น "• " = หัวข้อย่อย — หน้าสินค้าจัดจุดนำให้เอง ดู noteEmphasis ใน ProductDetail)
 * หมายเหตุ: กลุ่ม "ตัวน้อยเขย่า" ดูที่ shake-shake-charm-custom-size.mjs · "ขนาดพิเศษ" ที่ shake-shake-charm-size.mjs
 *          · "วิธีปิดกรอบ" ที่ shake-shake-closure.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ID = "new-mt2rp5i3-9488";
const FRAME = "ขนาดกรอบเขย่า";
const HOOK_GATE = "ตะขอ"; // เดิม "รับตะขอไหม" — เจ้าของร้านสั่งเปลี่ยนชื่อ 14 ก.ย. 69 (shake-shake-hook-label.mjs)
const BASE_CM = 6;
const WRITE = process.argv.includes("--write");
const die = (m) => { console.error("✗ " + m); process.exit(1); };

const env = readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;
const group = (label) => {
  const o = (p.options || []).find((x) => x.label.trim() === label);
  if (!o) die(`ไม่พบกลุ่ม "${label}"`);
  return o;
};

const frame = group(FRAME);
const rate = Number(frame.choices?.[0]?.extra);
if (!(rate > 0)) die("อ่านเรทต่อ ซม. ของกรอบจากตัวเลือกไม่ได้");

const NOTES = {
  [FRAME]:
    `กรอบเริ่มต้น **${BASE_CM} ซม.** (นับด้านยาวสุด ไดคัทตามทรงลายได้)\n` +
    `• ใหญ่ขึ้นได้ ติ๊กแล้วระบุจำนวน ซม. ที่เพิ่ม — **ซม. ละ ${rate} บาท** (กรอบ 8 ซม. = เพิ่ม 2 ซม.)`,
  [HOOK_GATE]:
    `ตะขอ/ห่วงมีให้เลือกกว่า 30 แบบตามแผ่นอะไหล่ของร้าน\n` +
    `• **ห่วง Z1 / โซ่ Z2 (สีเงิน) แถมฟรี** · แบบอื่นคิดเพิ่มตามชนิด\n` +
    `• ดูรูปอะไหล่ทั้งหมดในแท็บ "ตะขอ / ห่วง" ท้ายหน้า`,
};

let changed = 0;
for (const [label, note] of Object.entries(NOTES)) {
  const o = group(label);
  if (o.note === note) continue;
  console.log(`\n【${label}】\nเดิม: ${o.note}\nใหม่: ${note}`);
  o.note = note;
  changed++;
}
if (!changed) { console.log("ไม่มีอะไรเปลี่ยน (จัดไว้แล้ว)"); process.exit(0); }
if (!WRITE) { console.log("\n— dry-run · ใส่ --write เพื่อเขียนจริง"); process.exit(0); }

p.savedAt = new Date().toISOString();
const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
for (const [label, note] of Object.entries(NOTES)) {
  const o = (back?.data?.options || []).find((x) => x.label.trim() === label);
  if (o?.note !== note) die(`อ่านกลับ note ของ "${label}" ไม่ตรง — ค่าไม่ลงจริง`);
}
console.log(`\n✅ บันทึกแล้ว ${changed} กลุ่ม + อ่านกลับตรวจครบ`);
