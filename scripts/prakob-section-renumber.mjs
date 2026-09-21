/**
 * 🔢 อะคริลิคประกบ — เลขชุดตัวเลือกไม่ให้ข้าม (เจ้าของร้านสั่ง 21 ก.ย. 69 "หมายเลข 4 เปลี่ยน 3")
 * หลังซ่อนชุด "3. ฐาน" ในเรทพวงกุญแจ ลูกค้าเห็น 1 → 2 → 4 เพราะหัวชุดอ่านเลขจากชื่อชุดตรง ๆ
 * (ProductDetail: `sec.match(/\d+/)`)
 *
 * แก้แบบข้อมูลล้วน: เปลี่ยนชื่อชุด "4. ตะขอ" → "3. ตะขอ" ได้เพราะ **ชุดฐานกับชุดตะขอไม่เคยโผล่พร้อมกัน**
 * (ฐาน = เฉพาะเรทสแตนดี้ · ตะขอ = เฉพาะเรทพวงกุญแจ) — สคริปต์ตรวจข้อนี้ก่อนเปลี่ยนเสมอ
 *
 *   node scripts/prakob-section-renumber.mjs --dry
 *   node scripts/prakob-section-renumber.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "acrylic-prakob";
const FROM = "4. ตะขอ";
const TO = "3. ตะขอ";
const TWIN = "3. ฐาน";          // ชุดที่ใช้เลขเดียวกัน — ต้องคนละเรทกันเสมอ
const RATE_LABEL = "เรทราคา";
const DRY = process.argv.includes("--dry");
const die = (m) => { console.error("✗ " + m); process.exit(1); };

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;
const opts = p.options || [];
const inFrom = opts.filter((o) => o.section === FROM);
const inTwin = opts.filter((o) => o.section === TWIN);
if (!inFrom.length && opts.some((o) => o.section === TO)) { console.log("ทำไปแล้ว (ชุดชื่อ " + TO + " อยู่แล้ว)"); process.exit(0); }
if (!inFrom.length) die(`ไม่พบชุด "${FROM}"`);

/** ชุดหนึ่ง ๆ ผูกกับเรทไหนบ้าง (ดูจาก showWhen/showWhenAlso ที่อ้าง "เรทราคา" ของกลุ่มในชุด) */
const ratesOf = (groups) => {
  const set = new Set();
  for (const o of groups)
    for (const c of [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? [])])
      if (c?.label === RATE_LABEL) for (const n of c.choices) set.add(n);
  return set;
};
const a = ratesOf(inFrom), b = ratesOf(inTwin);
if (!a.size || !b.size) die("ชุดใดชุดหนึ่งไม่ได้ผูกกับเรท — ใช้เลขซ้ำไม่ได้ (จะโผล่พร้อมกัน)");
const both = [...a].filter((x) => b.has(x));
if (both.length) die("เรทที่เห็นทั้งสองชุด: " + both.join(" · ") + " — ใช้เลขซ้ำไม่ได้");

for (const o of opts) {
  if (o.section === FROM) o.section = TO;
  if (o.sectionTrim === FROM) o.sectionTrim = TO;
}
p.savedAt = new Date().toISOString();
console.log(`เปลี่ยนชื่อชุด "${FROM}" → "${TO}" · ${inFrom.length} กลุ่ม`);
console.log(`  ชุดตะขอ = เรท ${[...a].join(" / ")}`);
console.log(`  ชุดฐาน  = เรท ${[...b].join(" / ")}`);
if (DRY) { console.log("— dry-run · ตัด --dry ออกเพื่อเขียนจริง"); process.exit(0); }
const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");
const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q = back?.data;
if (q?.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง");
if ((q.options || []).some((o) => o.section === FROM)) die("อ่านกลับ ยังมีกลุ่มค้างชื่อชุดเดิม");
if ((q.options || []).filter((o) => o.section === TO).length !== inFrom.length) die("อ่านกลับ จำนวนกลุ่มในชุดใหม่ไม่ตรง");
console.log("✅ บันทึกแล้ว + อ่านกลับตรวจครบ");
