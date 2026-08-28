#!/usr/bin/env node
/**
 * กระดาษ Texture Paper — แก้ต่อจาก texture-paper-back-coating.mjs (28 ส.ค. 69)
 *
 *   node scripts/texture-paper-front-coating-gloss-only.mjs           # ดูก่อน
 *   node scripts/texture-paper-front-coating-gloss-only.mjs --write
 *
 * ผู้ใช้แจ้งเพิ่ม: "กระดาษสีเงิน ผิวด้าน" และ "กระดาษสีทอง ผิวด้าน"
 *   ด้านหน้า  = เคลือบอะไรไม่ได้เลย  → ถอด 2 ตัวนี้ออกจาก showWhen ของกลุ่ม "เคลือบ (ด้านหน้า)"
 *   ด้านหลัง  = เคลือบได้ปกติ        → กลุ่ม "เคลือบ (ด้านหลัง)" ยังคุม 6 ตัวเหมือนเดิม (ไม่แตะ)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "texture-paper";
const MATTE = ["กระดาษสีเงิน ผิวด้าน (250 แกรม)", "กระดาษสีทอง ผิวด้าน (250 แกรม)"];

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) { console.error(error); process.exit(1); }
const before = row.data;
const d = JSON.parse(JSON.stringify(before));

/* ---------- 1) ด้านหน้า: เหลือ 4 ตัว (โฮโลแกรม 2 + ผิวเงา 2) ---------- */
const front = d.options.find((o) => o.label === "เคลือบ (ด้านหน้า)");
const back = d.options.find((o) => o.label === "เคลือบ (ด้านหลัง)");
if (!front || !back) { console.error("หากลุ่มเคลือบไม่ครบ — หยุด"); process.exit(1); }
front.showWhen.choices = front.showWhen.choices.filter((c) => !MATTE.includes(c));
front.note = "กระดาษกลุ่มนี้เคลือบเงาด้านหน้าให้ฟรี ไม่บวกเพิ่ม";
back.note = "เลือกเคลือบด้านหลังได้เมื่อพิมพ์ 2 ด้าน — สีเงิน/สีทอง ผิวด้าน เคลือบด้านหลังได้ตามปกติ · คิดเพิ่มต่อแผ่น A3";

/* ---------- 2) ข้อความในหน้า ---------- */
const swaps = [];
const swap = (get, set, from, to) => {
  const cur = get();
  if (typeof cur !== "string" || !cur.includes(from)) { swaps.push(["❌ ไม่เจอ", from.slice(0, 60)]); return; }
  set(cur.split(from).join(to));
  swaps.push(["✓", to.slice(0, 80)]);
};

swap(() => d.terms, (v) => (d.terms = v),
  "กระดาษโฮโลแกรม และกระดาษสีเงิน/สีทอง (ทั้งผิวเงาและผิวด้าน) เคลือบด้านหน้าให้ฟรี · พิมพ์ 2 ด้าน เลือกเคลือบด้านหลังเพิ่มได้",
  "กระดาษโฮโลแกรม และกระดาษสีเงิน/สีทอง ผิวเงา เคลือบด้านหน้าให้ฟรี — ส่วนสีเงิน/สีทอง ผิวด้าน เคลือบด้านหน้าไม่ได้ · พิมพ์ 2 ด้าน ทั้ง 6 แบบเลือกเคลือบด้านหลังเพิ่มได้");

const tab = d.tabs.find((t) => t.title === "รายละเอียดเพิ่มเติม");
if (!tab) { console.error('หาแท็บ "รายละเอียดเพิ่มเติม" ไม่เจอ — หยุด'); process.exit(1); }
swap(() => tab.text, (v) => (tab.text = v),
  "มีทั้งผิวเงาและผิวด้าน — เคลือบด้านหน้าฟรีทั้งสองผิว (พิมพ์รองสีขาวเพิ่ม +60 บาท/แผ่น)",
  "มีทั้งผิวเงาและผิวด้าน — ผิวเงาเคลือบด้านหน้าฟรี · ผิวด้านเคลือบด้านหน้าไม่ได้ (ด้านหลังเคลือบได้ทั้งคู่ · พิมพ์รองสีขาวเพิ่ม +60 บาท/แผ่น)");
swap(() => tab.text, (v) => (tab.text = v),
  "• เคลือบด้านหน้า ฟรี — เฉพาะโฮโลแกรมและสีเงิน/สีทอง (ทั้งผิวเงาและผิวด้าน)\n• เคลือบด้านหลัง เลือกได้เมื่อพิมพ์ 2 ด้าน — เคลือบเงา/เคลือบด้าน +10 บาท/แผ่น · เคลือบพิเศษ +30 บาท/แผ่น",
  "• เคลือบด้านหน้า ฟรี — เฉพาะโฮโลแกรมและสีเงิน/สีทอง ผิวเงา (ผิวด้านเคลือบด้านหน้าไม่ได้)\n• เคลือบด้านหลัง เลือกได้เมื่อพิมพ์ 2 ด้าน — โฮโลแกรมและสีเงิน/สีทองทุกผิว · เคลือบเงา/เคลือบด้าน +10 บาท/แผ่น · เคลือบพิเศษ +30 บาท/แผ่น");

const hi = d.highlights.findIndex((h) => h.includes("เคลือบเงาด้านหน้า ฟรี"));
if (hi < 0) { swaps.push(["❌ ไม่เจอ", "highlight เคลือบเงาด้านหน้า ฟรี"]); }
else { d.highlights[hi] = "โฮโลแกรม + สีเงิน/สีทอง ผิวเงา เคลือบด้านหน้า ฟรี · ด้านหลังเคลือบเพิ่มได้"; swaps.push(["✓", d.highlights[hi]]); }

const faq = d.seo.faqs.find((f) => f.q === "เคลือบเงา/เคลือบด้านได้ไหม?");
if (!faq) { console.error("หา FAQ เรื่องเคลือบไม่เจอ — หยุด"); process.exit(1); }
faq.a = "ด้านหน้าเคลือบได้เฉพาะกระดาษโฮโลแกรม 2 ลาย และกระดาษสีเงิน/สีทอง “ผิวเงา” — เคลือบให้ฟรี ไม่บวกเพิ่ม · สีเงิน/สีทอง “ผิวด้าน” เคลือบด้านหน้าไม่ได้ แต่ด้านหลังเคลือบได้ตามปกติ · ถ้าเลือกพิมพ์ 2 ด้าน จะมีกลุ่ม “เคลือบ (ด้านหลัง)” ให้เลือกเพิ่ม: เคลือบเงาหรือเคลือบด้าน บวกแผ่นละ 10 บาท · เคลือบพิเศษ บวกแผ่นละ 30 บาท · ส่วนเนื้อ Canvas · 100 Pond · Extra White · E-Photo และ STARDREAM ทั้งสองแบบ เคลือบไม่ได้ทั้งสองด้าน · ทุกแบบในหน้านี้เคลือบฟอยล์ไม่ได้";
swaps.push(["✓", "FAQ เคลือบเงา/เคลือบด้านได้ไหม?"]);

/* ---------- สรุป ---------- */
for (const o of [front, back]) {
  console.log(`\n"${o.label}"`);
  console.log("  กระดาษที่เห็นกลุ่มนี้:", (o.showWhen.label === "ชนิดกระดาษ" ? o.showWhen : o.showWhenAlso).choices.join(" · "));
  for (const c of o.choices) console.log(`   - ${c.name}${c.extra ? `  +${c.extra}` : ""}`);
}
console.log("\nข้อความ:");
for (const [ok, t] of swaps) console.log(`  ${ok} ${t}`);

if (swaps.some(([ok]) => ok !== "✓")) { console.error("\n⛔ มีข้อความที่หาไม่เจอ — ไม่เขียน"); process.exit(1); }
if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึกจริง)"); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`../.backup-texture-paper-${stamp}.json`, import.meta.url), JSON.stringify({ id: ID, data: before }, null, 2));
console.log(`\nสำรองของเดิมไว้ที่ .backup-texture-paper-${stamp}.json`);

d.savedAt = new Date().toISOString();
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) { console.error(e2); process.exit(1); }
console.log("✅ บันทึกแล้ว");
