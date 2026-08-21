#!/usr/bin/env node
/**
 * กระดาษ Texture Paper (texture-paper) — "พิมพ์รองสีขาว" คิดค่ากระดาษเพิ่มด้วย
 *
 *   node scripts/texture-paper-white-base-paper-fee.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/texture-paper-white-base-paper-fee.mjs --write
 *
 * ตามที่ร้านแจ้ง (21 ส.ค. 69): พิมพ์รองสีขาว = ค่าพิมพ์ 20 บาท + ค่ากระดาษ 40 บาท
 *   รวมแผ่นละ 60 บาท · คิดต่อแผ่น A3 แบบเดียวกับงานเคลือบ
 *   (ก่อนหน้านี้ตั้งไว้แค่ค่าพิมพ์ 20 บาท — ดู scripts/texture-paper-white-base-price.mjs)
 *
 * หน่วยขายของสินค้าตัวนี้เป็น "แผ่น A3" อยู่แล้ว +฿ ต่อหน่วยจึงเท่ากับต่อแผ่นพอดี
 * ไม่ต้องใช้ sheetFee เหมือนการ์ดบอร์ด (ที่ขายเป็นชิ้น แล้วต้องหาร/ปัดขึ้นเป็นแผ่นเอง)
 *
 * เขียนแบบ "ตั้งค่าให้เป็นตามนี้" ไม่ใช่แทนที่ข้อความเดิมทีละคำ — รันซ้ำกี่รอบผลเท่าเดิม
 * ตัวเลขในข้อความทุกที่ (terms · แท็บ · FAQ) ถูกไล่เขียนใหม่จาก PRINT_FEE/PAPER_FEE ชุดเดียว
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "texture-paper";
const GROUP = "พิมพ์รองสีขาว";
const CHOICE = "พิมพ์รองสีขาว";

/** ค่าพิมพ์รองสีขาว (หมึกขาว) + ค่ากระดาษที่บวกเพิ่มเมื่อต้องพิมพ์รอง — ต่อ 1 แผ่น A3 */
const PRINT_FEE = 20;
const PAPER_FEE = 40;
const FEE = PRINT_FEE + PAPER_FEE;
/** วิธีเขียนราคาชุดนี้ในข้อความทุกที่ — ให้ลูกค้าเห็นที่มาของ 60 บาท ไม่ใช่เลขลอย ๆ */
const FEE_TEXT = `${FEE} บาท (ค่าพิมพ์ ${PRINT_FEE} + ค่ากระดาษ ${PAPER_FEE})`;

/** กระดาษที่ต้องพิมพ์รองสีขาว — ต้องตรงกับ showWhen ของกลุ่มที่ตั้งไว้แล้ว ไม่ตรง = หยุด */
const PAPERS = [
  "โฮโลแกรม SeaSand (300 แกรม)",
  "โฮโลแกรม Rainbow (300 แกรม)",
  "กระดาษสีเงิน ผิวเงา (250 แกรม)",
  "กระดาษสีเงิน ผิวด้าน (250 แกรม)",
  "กระดาษสีทอง ผิวเงา (250 แกรม)",
  "กระดาษสีทอง ผิวด้าน (250 แกรม)",
];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
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
const d = structuredClone(row.data);

const grp = (d.options || []).find((o) => o.label === GROUP);
if (!grp) throw new Error(`ไม่เจอกลุ่ม "${GROUP}" — หยุดก่อน`);
const choice = grp.choices.find((c) => c.name === CHOICE);
if (!choice) throw new Error(`ไม่เจอตัวเลือก "${CHOICE}" ในกลุ่ม — หยุดก่อน`);

/** กลุ่มนี้ต้องขึ้นเฉพาะกระดาษ 6 แบบที่ต้องรองขาว — ไม่ตรงเมื่อไหร่แปลว่ามีคนแก้ไว้ ต้องมาดูก่อน */
const shown = grp.showWhen?.choices ?? [];
const miss = PAPERS.filter((p) => !shown.includes(p));
const extraShown = shown.filter((p) => !PAPERS.includes(p));
if (miss.length || extraShown.length)
  throw new Error(
    `รายการกระดาษของกลุ่ม "${GROUP}" ไม่ตรงกับที่ร้านแจ้ง —\n` +
      (miss.length ? `   ขาด: ${miss.join(" · ")}\n` : "") +
      (extraShown.length ? `   เกิน: ${extraShown.join(" · ")}\n` : "")
  );

/** หน่วยขายต้องเป็นแผ่น A3 — ถ้าวันหลังเปลี่ยนไปขายเป็นชิ้น ค่านี้ต้องย้ายไปใช้ sheetFee แทน */
const unit = d.pricing?.unit ?? d.priceRates?.[0]?.pricing?.unit;
if (!/แผ่น/.test(String(unit)))
  throw new Error(`หน่วยขายของ ${ID} เป็น "${unit}" ไม่ใช่แผ่น — ค่ารองสีขาวคิดต่อแผ่น ต้องเปลี่ยนไปใช้ sheetFee ก่อน`);

const before = choice.extra ?? 0;
choice.extra = FEE;
delete choice.askPrice;

/**
 * ไล่เขียนตัวเลขในข้อความทุกที่ให้ตรงกับ FEE ชุดเดียว
 * ที่มาของราคา (ค่าพิมพ์ + ค่ากระดาษ) กางไว้ที่เดียวใน terms กับหัวข้อราคาในแท็บ
 * บรรทัดอื่นใส่แค่ยอดรวม — ไม่งั้นวงเล็บซ้อนวงเล็บ อ่านไม่รู้เรื่อง
 */
const retext = (s) =>
  typeof s !== "string"
    ? s
    : s
        .replace(/พิมพ์รองสีขาวเพิ่ม \+\d+ บาท\/แผ่น/g, `พิมพ์รองสีขาวเพิ่ม +${FEE} บาท/แผ่น`)
        .replace(/พิมพ์รองสีขาว บวกแผ่นละ \d+ บาท[^\n]*/g, `พิมพ์รองสีขาว บวกแผ่นละ ${FEE_TEXT} — เฉพาะโฮโลแกรมและสีเงิน/สีทอง`)
        .replace(/(["“])พิมพ์รองสีขาว(["”]) \(บวกแผ่นละ \d+ บาท\)/g, `$1พิมพ์รองสีขาว$2 (บวกแผ่นละ ${FEE} บาท)`)
        .replace(/บวกเพิ่มแผ่นละ \d+ บาท/g, `บวกเพิ่มแผ่นละ ${FEE} บาท`);

d.terms = retext(d.terms);

/** บรรทัดที่กางที่มาของราคาใน terms — มีอยู่แล้วเขียนทับ ไม่มีก็เติมท้าย (รันซ้ำไม่บวกซ้ำ) */
const TERMS_LINE = `พิมพ์รองสีขาว บวกเพิ่มแผ่นละ ${FEE_TEXT} คิดต่อแผ่น A3 แบบเดียวกับงานเคลือบ — เฉพาะกระดาษโฮโลแกรมและสีเงิน/สีทอง`;
{
  const lines = String(d.terms ?? "").split("\n");
  const at = lines.findIndex((l) => /^พิมพ์รองสีขาว บวกเพิ่มแผ่นละ/.test(l.trim()));
  if (at >= 0) lines[at] = TERMS_LINE;
  else lines.push(TERMS_LINE);
  d.terms = lines.join("\n");
}
for (const t of d.tabs || []) t.text = retext(t.text);
for (const f of d.seo?.faqs || d.seo?.faq || []) {
  f.q = retext(f.q);
  f.a = retext(f.a);
}
d.savedAt = new Date().toISOString();

/** ตัวเลขที่ยังค้างอยู่ในข้อความ — เจอเมื่อไหร่แปลว่ามีประโยครูปแบบใหม่ที่ retext ยังไม่รู้จัก */
const stale = [];
const scan = (s, where) => {
  if (typeof s !== "string") return;
  for (const line of s.split("\n"))
    if (/รองสีขาว/.test(line) && /\d+ บาท/.test(line) && !line.includes(`${FEE} บาท`)) stale.push(`[${where}] ${line.trim()}`);
};
scan(d.terms, "terms");
for (const t of d.tabs || []) scan(t.text, t.title);
for (const f of d.seo?.faqs || d.seo?.faq || []) scan(f.a, "FAQ");

console.log(`📄 ${d.name} (${ID}) · หน่วยขาย ${unit}`);
console.log(`   ${GROUP}: ฿${before} → ฿${FEE}  (ค่าพิมพ์ ${PRINT_FEE} + ค่ากระดาษ ${PAPER_FEE} ต่อแผ่น)`);
console.log(`   ขึ้นเฉพาะกระดาษ ${PAPERS.length} แบบ: ${PAPERS.join(" · ")}`);
console.log("\n📝 ข้อความที่เขียนใหม่");
const show = (s, where) => {
  if (typeof s !== "string") return;
  for (const line of s.split("\n")) if (/รองสีขาว/.test(line)) console.log(`   [${where}] ${line.trim()}`);
};
show(d.terms, "terms");
for (const t of d.tabs || []) show(t.text, t.title);
for (const f of d.seo?.faqs || d.seo?.faq || []) show(f.a, "FAQ");

if (stale.length) throw new Error(`ยังมีบรรทัดที่ตัวเลขไม่ตรง ${FEE} บาท — เติมรูปประโยคใน retext() ก่อน:\n   ${stale.join("\n   ")}`);

if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (upErr) throw new Error(upErr.message);
console.log("\n✅ บันทึกแล้ว");
