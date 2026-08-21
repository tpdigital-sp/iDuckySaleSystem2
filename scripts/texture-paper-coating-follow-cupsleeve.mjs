#!/usr/bin/env node
/**
 * กระดาษ Texture Paper (texture-paper) — ยึด "กติกาการเคลือบ" ชุดเดียวกับ CUP SLEEVE (ร้านยืนยัน 21 ส.ค. 69)
 *
 *   node scripts/texture-paper-coating-follow-cupsleeve.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/texture-paper-coating-follow-cupsleeve.mjs --write
 *
 * กติกาที่ยึด (ตรงกับ cup-sleeve เป๊ะ):
 *   • เคลือบได้เฉพาะ 4 เนื้อ — โฮโลแกรม SeaSand · โฮโลแกรม Rainbow · สีเงิน "ผิวเงา" · สีทอง "ผิวเงา"
 *     และได้แค่ "เคลือบเงา ด้านหน้า" ซึ่งรวมอยู่ในราคาแล้ว ไม่บวกเพิ่ม
 *   • ด้านหลังเคลือบไม่ได้ → ถอดกลุ่ม "เคลือบเพิ่ม (ด้านหลัง)" ออกทั้งกลุ่ม
 *   • สีเงิน/สีทอง "ผิวด้าน" · Canvas · 100 Pond · Extra White · E-Photo · STARDREAM 2 แบบ = เคลือบไม่ได้ทั้งสองด้าน
 *
 * ⚠️ ทับกติกาเดิมของหน้านี้ (เคยเปิดเคลือบด้านหลัง เงา/ด้าน +10 ให้ 6 เนื้อ) — ของใหม่แคบกว่า
 *    ไม่แตะกลุ่ม "พิมพ์รองสีขาว" (+20 บาท/แผ่น) ซึ่งยังเปิดให้ครบทั้ง 6 เนื้อโฮโลแกรม/เงิน-ทองตามเดิม
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "texture-paper";
const PAPER_LABEL = "ชนิดกระดาษ";
const OLD_BACK_LABEL = "เคลือบเพิ่ม (ด้านหลัง)";
const FRONT_LABEL = "เคลือบ (ด้านหน้า)";
const WHITE_LABEL = "พิมพ์รองสีขาว";
/** เนื้อที่เคลือบได้ — เคลือบเงาด้านหน้าอย่างเดียว รวมในราคาแล้ว (ชุดเดียวกับ cup-sleeve) */
const COATABLE = [
  "โฮโลแกรม SeaSand (300 แกรม)",
  "โฮโลแกรม Rainbow (300 แกรม)",
  "กระดาษสีเงิน ผิวเงา (250 แกรม)",
  "กระดาษสีทอง ผิวเงา (250 แกรม)",
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

const papers = (d.options || []).find((o) => o.label === PAPER_LABEL);
if (!papers) throw new Error(`ไม่เจอกลุ่ม "${PAPER_LABEL}" — หยุดก่อน`);
const missing = COATABLE.filter((n) => !papers.choices.some((c) => c.name === n));
if (missing.length) throw new Error(`ไม่เจอเนื้อกระดาษ "${missing.join(", ")}" — ชื่อเปลี่ยนไปแล้ว ตรวจก่อน`);

/** ถอดกลุ่มเคลือบด้านหลังทิ้ง แล้ววางกลุ่มเคลือบด้านหน้าไว้ตำแหน่งเดิม (ก่อนกลุ่มพิมพ์รองสีขาว) */
const front = {
  label: FRONT_LABEL,
  choices: [{ name: "เคลือบเงา (รวมในราคาแล้ว)" }],
  showWhen: { label: PAPER_LABEL, choices: COATABLE },
};
const kept = d.options.filter((o) => o.label !== OLD_BACK_LABEL && o.label !== FRONT_LABEL);
const at = kept.findIndex((o) => o.label === WHITE_LABEL);
kept.splice(at < 0 ? kept.length : at, 0, front);
d.options = kept;

const swap = (s) =>
  typeof s !== "string"
    ? s
    : s
        .replace(
          "กระดาษโฮโลแกรม และกระดาษสีเงิน/สีทอง เคลือบเงาด้านหน้า ฟรี · พิมพ์รองสีขาวเพิ่ม +20 บาท/แผ่น",
          "กระดาษโฮโลแกรม และกระดาษสีเงิน/สีทอง ผิวเงา เคลือบเงาด้านหน้า ฟรี (รวมในราคาแล้ว) — ด้านหลังเคลือบไม่ได้ · พิมพ์รองสีขาวเพิ่ม +20 บาท/แผ่น"
        )
        .replace(
          "เคลือบเงา | เคลือบด้าน เคลือบเฉพาะด้านที่สกรีนเท่านั้น · เคลือบด้านหลังเพิ่ม +10 บาท/แผ่น (มีเฉพาะเงา/ด้าน ไม่มีเคลือบพิเศษ)\nเคลือบได้เฉพาะกระดาษโฮโลแกรมและสีเงิน/สีทอง · เนื้อ Canvas · 100 Pond · Extra White · E-Photo · STARDREAM เคลือบไม่ได้",
          "กระดาษสีเงิน/สีทอง ผิวด้าน · เนื้อ Canvas · 100 Pond · Extra White · E-Photo · STARDREAM เคลือบไม่ได้ทั้งสองด้าน"
        )
        .replace(
          "กระดาษโฮโลแกรมและสีเงิน/สีทอง เคลือบเงาด้านหน้าให้ฟรี · เคลือบเพิ่มด้านหลังได้เฉพาะ เงา หรือ ด้าน +10 บาท/แผ่น (ไม่มีเคลือบพิเศษ) · ส่วนกระดาษเนื้อพิเศษและ STARDREAM เคลือบไม่ได้ และทุกแบบในหน้านี้เคลือบฟอยล์ไม่ได้",
          "กระดาษโฮโลแกรม 2 ลาย และกระดาษสีเงิน/สีทอง ผิวเงา เคลือบเงาด้านหน้าให้ฟรี (รวมในราคาแล้ว) — เคลือบได้เฉพาะด้านหน้า ด้านหลังเคลือบไม่ได้ · ส่วนสีเงิน/สีทอง ผิวด้าน เนื้อ Texture และ STARDREAM เคลือบไม่ได้ทั้งสองด้าน · ทุกแบบในหน้านี้เคลือบฟอยล์ไม่ได้"
        )
        .replace(
          "• เคลือบด้านหลังเพิ่ม เงา หรือ ด้าน +10 บาท/แผ่น (เฉพาะโฮโลแกรมและสีเงิน/สีทอง — ไม่มีเคลือบพิเศษ)\n• เนื้อ Canvas · 100 Pond · Extra White · E-Photo · STARDREAM เคลือบไม่ได้",
          "• เคลือบเงาด้านหน้า ฟรี เฉพาะโฮโลแกรมและสีเงิน/สีทอง ผิวเงา (รวมในราคาแล้ว) — ด้านหลังเคลือบไม่ได้\n• สีเงิน/สีทอง ผิวด้าน · เนื้อ Canvas · 100 Pond · Extra White · E-Photo · STARDREAM เคลือบไม่ได้"
        )
        .replace(
          "• กระดาษสีเงิน / สีทอง (ด้านหลังสีขาว) หนา 250 แกรม มีทั้งผิวเงาและผิวด้าน — เคลือบเงา ฟรี (พิมพ์รองสีขาวเพิ่ม +20 บาท/แผ่น)",
          "• กระดาษสีเงิน / สีทอง (ด้านหลังสีขาว) หนา 250 แกรม มีทั้งผิวเงาและผิวด้าน — เฉพาะ \"ผิวเงา\" เคลือบเงา ฟรี · ผิวด้านเคลือบไม่ได้ (พิมพ์รองสีขาวเพิ่ม +20 บาท/แผ่น)"
        );

d.terms = swap(d.terms);
for (const f of d.seo?.faq || []) f.a = swap(f.a);
for (const t of d.tabs || []) t.text = swap(t.text);

for (const o of d.options) {
  if (!/เคลือบ|รองสีขาว/.test(o.label)) continue;
  console.log(`== ${o.label} showWhen=${JSON.stringify(o.showWhen?.choices || null)}`);
  for (const c of o.choices) console.log("   -", c.name, c.extra ? `(+${c.extra})` : "");
}
console.log("\nterms:\n" + d.terms);

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (upErr) throw new Error(upErr.message);
console.log("\n✓ บันทึกแล้ว");
