#!/usr/bin/env node
/**
 * กระดาษ Texture Paper (texture-paper) — แก้กลุ่ม "เคลือบเพิ่ม (ด้านหลัง)"
 *
 *   node scripts/texture-paper-coating-fix.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/texture-paper-coating-fix.mjs --write
 *
 * ตามที่ร้านแจ้ง:
 *   • เคลือบได้เฉพาะ "เงา" หรือ "ด้าน" เท่านั้น — ไม่มีเคลือบพิเศษในหน้านี้ (ถอดปุ่ม +30 ออก)
 *     กระดาษที่เคลือบได้: โฮโลแกรม SeaSand / Rainbow · สีเงิน ผิวเงา/ผิวด้าน · สีทอง ผิวเงา/ผิวด้าน
 *   • เคลือบไม่ได้เลย: Canvas · 100 Pond · Extra White · E-Photo · STARDREAM (มุกขาว/Crystal)
 *     — กลุ่มนี้ถูกซ่อนอยู่แล้วด้วย showWhen ที่ระบุเฉพาะ 6 กระดาษข้างบน
 *   • แยกปุ่ม "เคลือบเงา / ด้าน (ด้านหลัง)" เป็น 2 ปุ่ม: เคลือบเงา · เคลือบด้าน (ทั้งคู่ +10 บาท/แผ่น)
 *
 * แก้ข้อความที่พูดถึง "เคลือบพิเศษ +30" ให้ตรงกันทั้ง terms · FAQ · แท็บรายละเอียดสินค้า
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "texture-paper";
const GROUP = "เคลือบเพิ่ม (ด้านหลัง)";

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

const grp = (d.options || []).find((o) => o.label === GROUP);
if (!grp) throw new Error(`ไม่เจอกลุ่ม "${GROUP}" — สินค้าถูกแก้โครงไปแล้ว หยุดก่อน`);

grp.choices = [
  { name: "ไม่เคลือบด้านหลัง" },
  { name: "เคลือบเงา (ด้านหลัง)", extra: 10 },
  { name: "เคลือบด้าน (ด้านหลัง)", extra: 10 },
];

/** แทนข้อความเดิม -> ใหม่ ในทุกที่ที่มี (เงียบ ๆ ถ้าไม่เจอ = เคยรันไปแล้ว) */
const swap = (s) =>
  typeof s !== "string"
    ? s
    : s
        .replace(
          "เคลือบเงา | ด้าน | พิเศษ เคลือบเฉพาะด้านที่สกรีนเท่านั้น · เคลือบด้านหลังเพิ่ม เงา/ด้าน +10 บาท/แผ่น · พิเศษ +30 บาท/แผ่น",
          "เคลือบเงา | เคลือบด้าน เคลือบเฉพาะด้านที่สกรีนเท่านั้น · เคลือบด้านหลังเพิ่ม +10 บาท/แผ่น (มีเฉพาะเงา/ด้าน ไม่มีเคลือบพิเศษ)\nเคลือบได้เฉพาะกระดาษโฮโลแกรมและสีเงิน/สีทอง · เนื้อ Canvas · 100 Pond · Extra White · E-Photo · STARDREAM เคลือบไม่ได้"
        )
        .replace(
          "กระดาษโฮโลแกรมและสีเงิน/สีทอง เคลือบเงาด้านหน้าให้ฟรี · เคลือบเพิ่มด้านหลัง เงา/ด้าน +10 บาท/แผ่น เคลือบพิเศษ +30 บาท/แผ่น · ส่วนกระดาษเนื้อพิเศษและ STARDREAM ไม่เคลือบ และทุกแบบในหน้านี้เคลือบฟอยล์ไม่ได้",
          "กระดาษโฮโลแกรมและสีเงิน/สีทอง เคลือบเงาด้านหน้าให้ฟรี · เคลือบเพิ่มด้านหลังได้เฉพาะ เงา หรือ ด้าน +10 บาท/แผ่น (ไม่มีเคลือบพิเศษ) · ส่วนกระดาษเนื้อพิเศษและ STARDREAM เคลือบไม่ได้ และทุกแบบในหน้านี้เคลือบฟอยล์ไม่ได้"
        )
        .replace(
          "• เคลือบด้านหลังเพิ่ม เงา/ด้าน +10 บาท/แผ่น · เคลือบพิเศษ +30 บาท/แผ่น (เฉพาะโฮโลแกรมและสีเงิน/สีทอง)",
          "• เคลือบด้านหลังเพิ่ม เงา หรือ ด้าน +10 บาท/แผ่น (เฉพาะโฮโลแกรมและสีเงิน/สีทอง — ไม่มีเคลือบพิเศษ)\n• เนื้อ Canvas · 100 Pond · Extra White · E-Photo · STARDREAM เคลือบไม่ได้"
        );

d.terms = swap(d.terms);
for (const f of d.seo?.faq || []) f.a = swap(f.a);
for (const t of d.tabs || []) t.text = swap(t.text);

console.log(`== ${GROUP}`);
for (const c of grp.choices) console.log("   -", c.name, c.extra ? `(+${c.extra})` : "");
console.log("\nterms:\n" + d.terms);

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (upErr) throw new Error(upErr.message);
console.log("\n✓ บันทึกแล้ว");
