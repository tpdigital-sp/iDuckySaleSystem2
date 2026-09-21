/**
 * 🪝 อะคริลิคประกบ — ให้ชุด "ตะขอ" โผล่ในทุกเรทที่เป็นพวงกุญแจ
 * เจ้าของร้านสั่ง 21 ก.ย. 69: เรท "พวงกุญแจประกบ 2 ชิ้น ใน 1 พวง" ต้องมีกลุ่ม "รับตะขอไหม: รับตะขอ"
 * เหมือนเรทพวงกุญแจอะคริลิคประกบ
 *
 * ของเดิมผูกไว้กับ **ชื่อเรทใบเดียว** ("พวงกุญแจอะคริลิคประกบ") → เรทใหม่ไม่เห็นชุดตะขอเลย
 * และ **เรทตัวแทนก็ไม่เห็นมาตั้งแต่แรก** (ลูกค้าตัวแทนเลือกตะขอไม่ได้) — สคริปต์นี้แก้ให้ทั้งชุด
 *
 * ทำอะไร (ข้อมูลล้วน ไม่ต้อง deploy · รันซ้ำได้):
 *  1. `รับตะขอไหม` + `ตะขอ` → showWhen/showWhenAlso = ทุกเรทที่เป็นพวงกุญแจ (ดูจาก "ไม่มีฐาน" ในตารางเรทนั้น)
 *  2. `รับตะขอไหม.defaultBy` → เรทพวงกุญแจทุกใบเริ่มที่ "รับตะขอ" · เรทสแตนดี้เริ่มที่ "เจาะรู /ไม่รับตะขอ"
 *     ⚠️ ของเดิม map ไว้ว่า "ไม่รับตะขอ" ซึ่ง **ไม่ตรงชื่อตัวเลือกจริง** → โค้ดข้ามเงียบ ๆ
 *        (กับดักชื่อค้างแบบเดียวกับ [[iducky-option-rename-dangling-ref]]) สคริปต์นี้ซ่อมให้ด้วย
 *
 *   node scripts/prakob-hook-rates.mjs --dry
 *   node scripts/prakob-hook-rates.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "acrylic-prakob";
const ASK = "รับตะขอไหม";
const HOOK = "ตะขอ";
const BASE = "ฐาน";
const RATE_LABEL = "เรทราคา";
const NO_BASE = "ไม่มีฐาน (พวงกุญแจ)";   // เรทที่มีค่านี้ในตาราง = เรทพวงกุญแจ
const YES = "รับตะขอ";
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
const ask = (p.options || []).find((o) => o.label.trim() === ASK);
const hook = (p.options || []).find((o) => o.label.trim() === HOOK);
if (!ask || !hook) die(`ไม่พบกลุ่ม "${ASK}" หรือ "${HOOK}"`);

/** ชื่อตัวเลือก "ไม่รับตะขอ" ตัวจริงในกลุ่ม (ชื่อมีวงเล็บ/เว้นวรรค อย่าเดา) */
const names = ask.choices.map((c) => c.name);
if (!names.includes(YES)) die(`กลุ่ม "${ASK}" ไม่มีตัวเลือก "${YES}"`);
const NO = names.find((n) => n !== YES && /ไม่รับตะขอ/.test(n)) ?? names.find((n) => n !== YES);
if (!NO) die(`กลุ่ม "${ASK}" ไม่มีตัวเลือกฝั่ง "ไม่รับตะขอ"`);

const basesOf = (m) => {
  const di = (m?.driverLabels || []).indexOf(BASE);
  if (di < 0) return [];
  return [...new Set(Object.keys(m.cells || {}).map((k) => k.split("│")[di]))];
};
const rates = p.priceRates || [];
if (!rates.length) die("สินค้านี้ไม่มีเรทราคา");
const keyringRates = rates.filter((r) => basesOf(r.pricing).includes(NO_BASE)).map((r) => r.label);
const standRates = rates.filter((r) => !basesOf(r.pricing).includes(NO_BASE)).map((r) => r.label);
if (!keyringRates.length) die("ไม่เจอเรทพวงกุญแจสักใบ (ดูจาก " + NO_BASE + ")");

const when = { label: RATE_LABEL, choices: keyringRates };
ask.showWhen = when;
hook.showWhenAlso = { ...when };
ask.defaultBy = {
  label: RATE_LABEL,
  map: { ...Object.fromEntries(keyringRates.map((l) => [l, YES])), ...Object.fromEntries(standRates.map((l) => [l, NO])) },
};

p.savedAt = new Date().toISOString();
console.log("เรทที่มีชุดตะขอ (เริ่มที่ " + YES + "):\n  " + keyringRates.join("\n  "));
console.log("เรทที่ไม่มีชุดตะขอ (เริ่มที่ " + NO + "):\n  " + (standRates.join("\n  ") || "-"));
if (DRY) {
  console.log(JSON.stringify({ showWhen: ask.showWhen, defaultBy: ask.defaultBy, hookShowWhenAlso: hook.showWhenAlso }, null, 1));
  console.log("— dry-run · ตัด --dry ออกเพื่อเขียนจริง");
  process.exit(0);
}
const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");

const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q = back?.data;
if (q?.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง");
const qa = (q.options || []).find((o) => o.label.trim() === ASK);
const qh = (q.options || []).find((o) => o.label.trim() === HOOK);
if (qa?.showWhen?.choices.join("|") !== keyringRates.join("|")) die("อ่านกลับ showWhen ของกลุ่มรับตะขอไม่ตรง");
if (qh?.showWhenAlso?.choices.join("|") !== keyringRates.join("|")) die("อ่านกลับ showWhenAlso ของกลุ่มตะขอไม่ตรง");
for (const [l, v] of Object.entries(qa.defaultBy.map))
  if (!qa.choices.some((c) => c.name === v)) die(`ค่าเริ่มต้นของเรท "${l}" = "${v}" ไม่ตรงชื่อตัวเลือกจริง`);
console.log("✅ บันทึกแล้ว + อ่านกลับตรวจครบ");
