#!/usr/bin/env node
/**
 * กระดาษ Texture Paper (texture-paper) — "พิมพ์รองสีขาว" มีราคาแล้ว ไม่ต้องรอแอดมินตีราคา
 *
 *   node scripts/texture-paper-white-base-price.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/texture-paper-white-base-price.mjs --write
 *
 * ตามที่ร้านแจ้ง: พิมพ์รองสีขาว +20 บาท/แผ่น A3 (ถอด askPrice ออก คิดเงินได้เลย)
 *   ขึ้นเฉพาะกระดาษโฮโลแกรม · สีเงิน · สีทอง (showWhen เดิม) — เนื้อพิเศษ/STARDREAM ไม่มีตัวเลือกนี้
 * แก้ข้อความ "แจ้งแอดมินตีราคา / ยังไม่รวม" ใน terms · FAQ · แท็บ ให้ตรงกับราคาใหม่
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "texture-paper";
const GROUP = "พิมพ์รองสีขาว";
const FEE = 20;

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
if (!grp) throw new Error(`ไม่เจอกลุ่ม "${GROUP}" — หยุดก่อน`);
const ask = grp.choices.find((c) => /พิมพ์รองสีขาว/.test(c.name));
if (!ask) throw new Error(`ไม่เจอปุ่มพิมพ์รองสีขาวในกลุ่ม — หยุดก่อน`);
ask.name = "พิมพ์รองสีขาว";
ask.extra = FEE;
delete ask.askPrice;

const swap = (s) =>
  typeof s !== "string"
    ? s
    : s
        .replace(
          "ราคายังไม่รวมพิมพ์รองสีขาว (แจ้งแอดมินตีราคา)",
          `พิมพ์รองสีขาวเพิ่ม +${FEE} บาท/แผ่น`
        )
        .replace(
          "ต้องพิมพ์รองสีขาวก่อน — ราคาในตารางยังไม่รวมส่วนนี้ เลือกในหน้าสินค้าแล้วแอดมินจะตีราคาให้",
          `ต้องพิมพ์รองสีขาวก่อน — เลือกในหน้าสินค้าได้เลย บวกเพิ่มแผ่นละ ${FEE} บาท`
        )
        .replace(
          /เคลือบเงา ฟรี \(ราคายังไม่รวมพิมพ์รองสีขาว\)/g,
          `เคลือบเงา ฟรี (พิมพ์รองสีขาวเพิ่ม +${FEE} บาท/แผ่น)`
        )
        .replace(
          '"พิมพ์รองสีขาว" (แจ้งแอดมินตีราคา)',
          `"พิมพ์รองสีขาว" (บวกแผ่นละ ${FEE} บาท)`
        )
        .replace(
          "• คละลาย บวกแผ่นละ 10 บาท (คละไม่เกิน 3-4 ลาย)",
          `• คละลาย บวกแผ่นละ 10 บาท (คละไม่เกิน 3-4 ลาย)\n• พิมพ์รองสีขาว บวกแผ่นละ ${FEE} บาท (เฉพาะโฮโลแกรมและสีเงิน/สีทอง)`
        );

d.terms = swap(d.terms);
for (const f of d.seo?.faq || []) f.a = swap(f.a);
for (const t of d.tabs || []) t.text = swap(t.text);

console.log(`== ${GROUP}`);
for (const c of grp.choices) console.log("   -", c.name, c.extra ? `(+${c.extra})` : "", c.askPrice ? "| ASK" : "");
console.log("\nterms:\n" + d.terms);

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (upErr) throw new Error(upErr.message);
console.log("\n✓ บันทึกแล้ว");
