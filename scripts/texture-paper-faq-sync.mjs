#!/usr/bin/env node
/**
 * กระดาษ Texture Paper (texture-paper) — เขียนคำตอบ FAQ เรื่อง "เคลือบ" กับ "พิมพ์รองสีขาว" ให้ตรงกติกาปัจจุบัน
 *
 *   node scripts/texture-paper-faq-sync.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/texture-paper-faq-sync.mjs --write
 *
 * ⚠️ FAQ ของสินค้าอยู่ที่ data.seo.faqs (ไม่ใช่ seo.faq) — สคริปต์รอบก่อนแก้ผิดคีย์ คำตอบเก่าเลยค้าง
 *    หาโดยจับที่คำถาม ไม่ยึดลำดับ เผื่อทีมงานสลับข้อในหน้าแก้ไขสินค้า
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "texture-paper";
const ANSWERS = [
  {
    match: /รองสีขาว/,
    a: "กระดาษโฮโลแกรมและกระดาษสีเงิน/สีทองเป็นเนื้อมันวาว หมึกจะโปร่งไปกับเนื้อกระดาษ ถ้าอยากให้สีทึบชัดเหมือนพิมพ์บนกระดาษขาวต้องพิมพ์รองสีขาวก่อน — เลือกได้ในหน้าสินค้าเลย บวกเพิ่มแผ่นละ 20 บาท (เฉพาะกระดาษโฮโลแกรมและสีเงิน/สีทอง ทั้งผิวเงาและผิวด้าน)",
  },
  {
    match: /เคลือบ/,
    a: "เคลือบได้เฉพาะกระดาษโฮโลแกรม 2 ลาย และกระดาษสีเงิน/สีทอง “ผิวเงา” — เคลือบเงาด้านหน้า บวกเพิ่มแผ่นละ 10 บาท (ด้านหลังเคลือบไม่ได้) · ส่วนสีเงิน/สีทอง “ผิวด้าน” เนื้อ Canvas · 100 Pond · Extra White · E-Photo และ STARDREAM ทั้งสองแบบ เคลือบไม่ได้ทั้งสองด้าน · ทุกแบบในหน้านี้เคลือบฟอยล์ไม่ได้",
  },
];

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error || !row) throw new Error(`หาสินค้า ${ID} ไม่เจอ: ${error?.message}`);
const d = row.data;
const faqs = d.seo?.faqs;
if (!Array.isArray(faqs)) throw new Error("ไม่เจอ data.seo.faqs — โครงเปลี่ยนแล้ว หยุดก่อน");

for (const { match, a } of ANSWERS) {
  const hit = faqs.find((f) => match.test(f.q || ""));
  if (!hit) throw new Error(`ไม่เจอคำถามที่ตรงกับ ${match} — ตรวจก่อน`);
  hit.a = a;
}
for (const f of faqs) console.log("Q:", f.q, "\n  A:", f.a, "\n");

if (!WRITE) {
  console.log("(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (upErr) throw new Error(upErr.message);
console.log("✓ บันทึกแล้ว");
