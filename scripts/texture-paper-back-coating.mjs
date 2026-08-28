#!/usr/bin/env node
/**
 * กระดาษ Texture Paper (id: texture-paper) — เคลือบด้านหน้าฟรี + เพิ่มกลุ่ม "เคลือบ (ด้านหลัง)"
 *
 *   node scripts/texture-paper-back-coating.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/texture-paper-back-coating.mjs --write
 *
 * ตามที่ผู้ใช้สั่ง 28 ส.ค. 69:
 *   1) กระดาษพิเศษ 6 ตัว (โฮโลแกรม 2 + สีเงิน/สีทอง ทั้งผิวเงาและผิวด้าน) — เคลือบด้านหน้า "ฟรี"
 *      (เดิม +10 บาท/แผ่น และขึ้นเฉพาะ 4 ตัวที่เป็นผิวเงา/โฮโลแกรม)
 *   2) เลือก "พิมพ์ 2 ด้าน" → ต้องมีกลุ่ม "เคลือบ (ด้านหลัง)" ให้เลือก
 *      ไม่เคลือบ · เคลือบเงา +10 · เคลือบด้าน +10 · เคลือบพิเศษ +30 (บาท/แผ่น A3)
 *
 * สินค้าตัวนี้ขายเป็น "แผ่น A3" อยู่แล้ว (pricing.unit) — 1 หน่วย = 1 แผ่น
 * ค่าเคลือบจึงใส่เป็น choice.extra ได้ตรง ๆ ไม่ต้องใช้ sheetFee/perSheet เหมือนงานกระดาษตัวอื่น
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "texture-paper";

const SIX = [
  "โฮโลแกรม SeaSand (300 แกรม)",
  "โฮโลแกรม Rainbow (300 แกรม)",
  "กระดาษสีเงิน ผิวเงา (250 แกรม)",
  "กระดาษสีเงิน ผิวด้าน (250 แกรม)",
  "กระดาษสีทอง ผิวเงา (250 แกรม)",
  "กระดาษสีทอง ผิวด้าน (250 แกรม)",
];

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) { console.error(error); process.exit(1); }
const before = row.data;
const d = JSON.parse(JSON.stringify(before));

/* ---------- 1) เคลือบ (ด้านหน้า): ฟรี + ขึ้นกับกระดาษ 6 ตัว ---------- */
const front = d.options.find((o) => o.label === "เคลือบ (ด้านหน้า)");
if (!front) { console.error('หากลุ่ม "เคลือบ (ด้านหน้า)" ไม่เจอ — หยุด'); process.exit(1); }
for (const c of front.choices) delete c.extra;          // ฟรีทุกตัวเลือกในกลุ่มนี้
front.showWhen = { label: "ชนิดกระดาษ", choices: [...SIX] };
front.note = "กระดาษกลุ่มนี้เคลือบเงาด้านหน้าให้ฟรี ไม่บวกเพิ่ม";

/* ---------- 2) กลุ่มใหม่ "เคลือบ (ด้านหลัง)" ---------- */
const BACK = {
  label: "เคลือบ (ด้านหลัง)",
  choices: [
    { name: "ไม่เคลือบ" },
    { name: "เคลือบเงา", extra: 10 },
    { name: "เคลือบด้าน", extra: 10 },
    { name: "เคลือบพิเศษ", extra: 30 },
  ],
  showWhen: { label: "จำนวนด้านที่พิมพ์", choices: ["พิมพ์ 2 ด้าน"] },
  showWhenAlso: { label: "ชนิดกระดาษ", choices: [...SIX] },
  note: "เลือกเคลือบด้านหลังได้เมื่อพิมพ์ 2 ด้าน — คิดเพิ่มต่อแผ่น A3",
};
const existing = d.options.findIndex((o) => o.label === BACK.label);
if (existing >= 0) d.options[existing] = BACK;                       // รันซ้ำได้
else d.options.splice(d.options.indexOf(front) + 1, 0, BACK);        // วางต่อจากกลุ่มด้านหน้า

/* ---------- 3) ข้อความในหน้า (เงื่อนไข / แท็บ / FAQ) ---------- */
const swaps = [];
const swap = (get, set, from, to) => {
  const cur = get();
  if (typeof cur !== "string" || !cur.includes(from)) { swaps.push(["❌ ไม่เจอ", from.slice(0, 60)]); return; }
  set(cur.split(from).join(to));
  swaps.push(["✓", to.slice(0, 70)]);
};

swap(() => d.terms, (v) => (d.terms = v),
  "กระดาษโฮโลแกรม และกระดาษสีเงิน/สีทอง ผิวเงา เคลือบเงาด้านหน้าได้ +10 บาท/แผ่น — ด้านหลังเคลือบไม่ได้ · พิมพ์รองสีขาวเพิ่ม +60 บาท/แผ่น",
  "กระดาษโฮโลแกรม และกระดาษสีเงิน/สีทอง (ทั้งผิวเงาและผิวด้าน) เคลือบด้านหน้าให้ฟรี · พิมพ์ 2 ด้าน เลือกเคลือบด้านหลังเพิ่มได้ เงา/ด้าน +10 บาท/แผ่น · เคลือบพิเศษ +30 บาท/แผ่น · พิมพ์รองสีขาวเพิ่ม +60 บาท/แผ่น");

swap(() => d.terms, (v) => (d.terms = v),
  "กระดาษสีเงิน/สีทอง ผิวด้าน · เนื้อ Canvas · 100 Pond · Extra White · E-Photo · STARDREAM เคลือบไม่ได้ทั้งสองด้าน",
  "เนื้อ Canvas · 100 Pond · Extra White · E-Photo · STARDREAM เคลือบไม่ได้ทั้งสองด้าน");

const tab = d.tabs.find((t) => t.title === "รายละเอียดเพิ่มเติม");
if (!tab) { console.error('หาแท็บ "รายละเอียดเพิ่มเติม" ไม่เจอ — หยุด'); process.exit(1); }
swap(() => tab.text, (v) => (tab.text = v),
  "มี 2 ลาย: SeaSand และ Rainbow — เคลือบเงา +10 บาท/แผ่น (พิมพ์รองสีขาวเพิ่ม +60 บาท/แผ่น)",
  "มี 2 ลาย: SeaSand และ Rainbow — เคลือบด้านหน้าฟรี (พิมพ์รองสีขาวเพิ่ม +60 บาท/แผ่น)");
swap(() => tab.text, (v) => (tab.text = v),
  'มีทั้งผิวเงาและผิวด้าน — เฉพาะ "ผิวเงา" เคลือบเงาได้ +10 บาท/แผ่น · ผิวด้านเคลือบไม่ได้ (พิมพ์รองสีขาวเพิ่ม +60 บาท/แผ่น)',
  "มีทั้งผิวเงาและผิวด้าน — เคลือบด้านหน้าฟรีทั้งสองผิว (พิมพ์รองสีขาวเพิ่ม +60 บาท/แผ่น)");
swap(() => tab.text, (v) => (tab.text = v),
  "• เคลือบเงาด้านหน้า +10 บาท/แผ่น เฉพาะโฮโลแกรมและสีเงิน/สีทอง ผิวเงา — ด้านหลังเคลือบไม่ได้\n• สีเงิน/สีทอง ผิวด้าน · เนื้อ Canvas · 100 Pond · Extra White · E-Photo · STARDREAM เคลือบไม่ได้",
  "• เคลือบด้านหน้า ฟรี — เฉพาะโฮโลแกรมและสีเงิน/สีทอง (ทั้งผิวเงาและผิวด้าน)\n• เคลือบด้านหลัง เลือกได้เมื่อพิมพ์ 2 ด้าน — เคลือบเงา/เคลือบด้าน +10 บาท/แผ่น · เคลือบพิเศษ +30 บาท/แผ่น\n• เนื้อ Canvas · 100 Pond · Extra White · E-Photo · STARDREAM เคลือบไม่ได้");

const faq = d.seo.faqs.find((f) => f.q === "เคลือบเงา/เคลือบด้านได้ไหม?");
if (!faq) { console.error("หา FAQ เรื่องเคลือบไม่เจอ — หยุด"); process.exit(1); }
const faqBefore = faq.a;
faq.a = "เคลือบได้เฉพาะกระดาษโฮโลแกรม 2 ลาย และกระดาษสีเงิน/สีทอง ทั้งผิวเงาและผิวด้าน — ด้านหน้าเคลือบให้ฟรี ไม่บวกเพิ่ม · ถ้าเลือกพิมพ์ 2 ด้าน จะมีกลุ่ม “เคลือบ (ด้านหลัง)” ให้เลือกเพิ่ม: เคลือบเงาหรือเคลือบด้าน บวกแผ่นละ 10 บาท · เคลือบพิเศษ บวกแผ่นละ 30 บาท · ส่วนเนื้อ Canvas · 100 Pond · Extra White · E-Photo และ STARDREAM ทั้งสองแบบ เคลือบไม่ได้ทั้งสองด้าน · ทุกแบบในหน้านี้เคลือบฟอยล์ไม่ได้";
swaps.push(["✓", "FAQ เคลือบเงา/เคลือบด้านได้ไหม?"]);

/* ---------- สรุป ---------- */
console.log("กลุ่มตัวเลือกหลังแก้:");
for (const o of d.options) {
  if (!/เคลือบ|จำนวนด้าน|ชนิดกระดาษ/.test(o.label)) continue;
  console.log(`\n  "${o.label}"  showWhen=${JSON.stringify(o.showWhen ?? null)}${o.showWhenAlso ? ` + ${JSON.stringify(o.showWhenAlso)}` : ""}`);
  for (const c of (o.choices ?? []).slice(0, 8)) console.log(`     - ${c.name}${c.extra ? `  +${c.extra}` : ""}`);
}
console.log("\nข้อความ:");
for (const [ok, t] of swaps) console.log(`  ${ok} ${t}`);
console.log("\nFAQ เดิม:", faqBefore.slice(0, 90), "...");
console.log(`กลุ่มทั้งหมด ${before.options.length} → ${d.options.length}`);

if (swaps.some(([ok]) => ok !== "✓")) { console.error("\n⛔ มีข้อความที่หาไม่เจอ — ไม่เขียน"); process.exit(1); }
if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึกจริง)"); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`../.backup-texture-paper-${stamp}.json`, import.meta.url), JSON.stringify({ id: ID, data: before }, null, 2));
console.log(`\nสำรองของเดิมไว้ที่ .backup-texture-paper-${stamp}.json`);

d.savedAt = new Date().toISOString();
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) { console.error(e2); process.exit(1); }
console.log("✅ บันทึกแล้ว");
