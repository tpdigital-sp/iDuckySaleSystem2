/**
 * 🧺 ถุงหอม (scented-bag) — ตัวเลือก "ไม่รับเม็ดหอม เอาแต่ถุงผ้า"
 * เจ้าของร้านสั่ง 14 ก.ย. 69: ลูกค้าบางรายอยากได้ถุงผ้าพิมพ์ลายเปล่า ๆ ไม่เอาเม็ดหอม
 *
 * ทำเป็น "ช่องติ๊กใบเดียว" ใต้กลุ่มแบบถุง (ไม่เพิ่มการ์ดในกลุ่ม "รูปแบบ / ถุงใส่" ซึ่งเป็นแกนตารางราคา
 * — เจ้าของร้านขอให้ตัวเลือกดูไม่รก และการเพิ่มคอลัมน์ต้องเติมราคาทุกเรท)
 * ราคา: หักราคาเม็ดหอมออกตามช่วงจำนวน = คอลัมน์ "เฉพาะเม็ดหอม" ในใบราคาร้าน
 *   1-10 ฿90 · 11-29 ฿80 · 30-49 ฿75 · 50+ ฿70
 *   → ถุง 10x10 เหลือ 100/95/90/85 · 11x13 เหลือ 110/105/100/95 · หูรูด 120/110/100/90
 *   ตรงกับคอลัมน์ add on ในใบราคา iduckyofficial-pricelists.com/รับทำแผ่นหินน้ำหอม
 * ใช้ extraTiers ติดลบ (ดู ProductOptionChoice.extraTiers) — ไม่ติ๊ก = ราคาเดิมทุกอย่าง ของเก่าในตะกร้าไม่กระทบ
 *
 * รันซ้ำได้ (ทำไปแล้วจะไม่เขียนซ้ำ) · --dry = แค่โชว์ไม่เขียน
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "scented-bag";
const FORM = "รูปแบบ / ถุงใส่";
const GROUP = "เม็ดหอม";
const CHOICE = "ไม่รับเม็ดหอม (เอาแต่ถุงผ้า)";
const BAGS = ["+ ถุงผ้า 10x10 ซม.", "+ ถุงผ้า 11x13 ซม.", "+ ถุงหูรูด 11x12.5 ซม."];
const BEADS = "เฉพาะเม็ดหอม (ไม่มีถุงผ้า)";
const TIERS = [
  { upTo: 10, extra: -90 },
  { upTo: 29, extra: -80 },
  { upTo: 49, extra: -75 },
  { upTo: null, extra: -70 },
];
const NOTE =
  "ติ๊กช่องนี้ = เอาแต่ถุงผ้าพิมพ์ลายเปล่า ๆ ไม่ใส่เม็ดหอม — **ลดราคาเม็ดหอมออกให้** " +
  "1-10 ชิ้น ฿90 · 11-29 ชิ้น ฿80 · 30-49 ชิ้น ฿75 · 50 ชิ้นขึ้นไป ฿70 · ไม่ติ๊ก = ร้านใส่เม็ดหอม 30 กรัมมาให้ในถุงตามปกติ";
const FAQ = {
  q: "สั่งแต่ถุงผ้าเปล่า ไม่เอาเม็ดหอมได้ไหม?",
  a:
    "ได้ ตอนสั่งติ๊กช่อง \"ไม่รับเม็ดหอม (เอาแต่ถุงผ้า)\" ระบบจะลดราคาเม็ดหอมออกให้ — " +
    "ถุงผ้า 10x10 ซม. เหลือชิ้นละ 100 บาท (1-10 ชิ้น) ถึง 85 บาท (50 ชิ้นขึ้นไป) · " +
    "ถุงผ้า 11x13 ซม. 110-95 บาท · ถุงหูรูด 11x12.5 ซม. 120-90 บาท · ถุงยังพิมพ์ลายเต็มใบเหมือนเดิม",
};
const HILITE = "สั่งเฉพาะถุงผ้าเปล่า ไม่เอาเม็ดหอมก็ได้ (ลดราคาเม็ดหอมออกให้)";
const TAB_LINE = "• อยากได้ถุงผ้าเปล่า ๆ ไม่เอาเม็ดหอม ก็ติ๊กได้ตอนสั่ง ระบบลดราคาเม็ดหอมออกให้อัตโนมัติ";

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const i = l.indexOf("=");
  if (i > 0 && !l.trim().startsWith("#")) a[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const DRY = process.argv.includes("--dry");
const die = (m) => { console.error("✗ " + m); process.exit(1); };
// Supabase เก็บเป็น jsonb ซึ่ง "ไม่รักษาลำดับคีย์" — เทียบด้วย JSON.stringify จะไม่ตรงทั้งที่ค่าเหมือนกัน
const same = (a, b) => {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
};

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;

// ด่านกันสเปคเปลี่ยน: กลุ่มแกนราคาต้องมีแบบถุงครบ 3 แบบ + คอลัมน์เม็ดหอมล้วน (ที่มาของยอดที่หัก)
const form = (p.options || []).find((o) => o.label === FORM) || die("ไม่พบกลุ่ม " + FORM);
for (const b of [...BAGS, BEADS]) if (!form.choices.some((c) => c.name === b)) die("กลุ่ม " + FORM + " ไม่มี " + b);
const retail = (p.priceRates || []).find((r) => !r.dealerOnly)?.pricing || p.pricing;
const beadCells = retail?.cells?.[BEADS] || die("ไม่มีคอลัมน์ราคา " + BEADS);
const want = TIERS.map((t) => -t.extra);
if (beadCells.join() !== want.join()) die(`ราคาเม็ดหอมในตารางเป็น ${beadCells.join("/")} ไม่ใช่ ${want.join("/")} — แก้ TIERS ก่อน`);

const built = {
  label: GROUP,
  note: NOTE,
  display: "multi",
  section: form.section,
  showWhen: { label: FORM, choices: BAGS },
  choices: [{ name: CHOICE, extra: TIERS[0].extra, extraTiers: TIERS }],
};

let changed = false;
const idx = p.options.findIndex((o) => o.label === GROUP);
if (idx < 0) {
  p.options.splice(p.options.indexOf(form) + 1, 0, built);
  changed = true;
} else if (!same(p.options[idx], built)) {
  p.options[idx] = built;
  changed = true;
}

// เนื้อหาหน้าร้าน/SEO ให้บอกเรื่องนี้ด้วย (ไม่ซ้ำถ้ารันซ้ำ)
p.highlights = p.highlights || [];
if (!p.highlights.includes(HILITE)) { p.highlights.push(HILITE); changed = true; }
const faqs = (p.seo ||= {}).faqs ||= [];
const fi = faqs.findIndex((f) => f.q === FAQ.q);
if (fi < 0) { faqs.push(FAQ); changed = true; }
else if (faqs[fi].a !== FAQ.a) { faqs[fi] = FAQ; changed = true; }
const tab = (p.tabs || [])[0];
if (tab && !tab.text.includes(TAB_LINE)) { tab.text += "\n" + TAB_LINE; changed = true; }

if (!changed) { console.log("✓ ตรงอยู่แล้ว ไม่ต้องเขียน"); process.exit(0); }
console.log(JSON.stringify(built, null, 1));
if (DRY) { console.log("(dry) ไม่เขียน"); process.exit(0); }

p.savedAt = new Date().toISOString();
const up = await sb.from("products").update({ data: p }).eq("id", ID).select("id");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update โดน 0 แถว");
const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q = back?.data;
if (q?.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ");
const g = q.options.find((o) => o.label === GROUP);
if (!g || !same(g, built)) die("อ่านกลับกลุ่ม " + GROUP + " ไม่ตรง");
if (!q.seo.faqs.some((f) => f.q === FAQ.q && f.a === FAQ.a)) die("อ่านกลับ FAQ ไม่ตรง");
if (!q.highlights.includes(HILITE)) die("อ่านกลับ highlight ไม่ตรง");
console.log("✓ เขียนแล้ว อ่านกลับตรง · savedAt " + p.savedAt);
