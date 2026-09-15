/**
 * 📐 อาร์มปัก (armpatch-1) — ช่องกว้าง/ยาว รับทศนิยมได้ (7 × 4.5 ซม.)
 * เจ้าของร้านสั่ง 11 ก.ย. 69: ลูกค้ากรอก "ยาว 4.5" แล้วโดนบล็อก "ต้องเป็นจำนวนเต็ม (ไม่รับทศนิยม)"
 * ทั้งที่ areaPriceBreakdown คิดพื้นที่ทศนิยมได้อยู่แล้ว (31.5 ตร.ซม. · ราคาปัดขึ้นตาม round:ceil)
 * → ถอดธง input.integer ออกจากทั้งสองช่อง + แก้ hint ไม่ให้บอกว่ารับแต่จำนวนเต็ม
 * ทำงานแบบ read-modify-write บนแถวจริง · รันซ้ำได้ · --dry = แค่โชว์ไม่เขียน
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "armpatch-1";
const LABELS = ["กว้าง", "ยาว"];
const OLD_TAIL = " · กรอกเป็นจำนวนเต็ม (ไม่รับทศนิยม)";
const NEW_TAIL = " · กรอกทศนิยมได้ เช่น 4.5";

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const DRY = process.argv.includes("--dry");
const die = (msg) => { console.error("✗ " + msg); process.exit(1); };

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;

let changed = false;
for (const label of LABELS) {
  const o = (p.options || []).find((x) => x.label.trim() === label && x.display === "input");
  if (!o?.input) die("ไม่พบช่องกรอก " + label);
  if (o.input.integer) { delete o.input.integer; changed = true; }
  const hint = String(o.input.hint || "");
  if (hint.includes(OLD_TAIL)) { o.input.hint = hint.replace(OLD_TAIL, NEW_TAIL); changed = true; }
  else if (!hint.includes(NEW_TAIL)) { o.input.hint = hint + NEW_TAIL; changed = true; }
  console.log(`${label}: integer=${o.input.integer ?? "-"} · hint=${o.input.hint}`);
}
if (!changed) { console.log("✓ ตรงอยู่แล้ว ไม่ต้องเขียน"); process.exit(0); }
if (DRY) { console.log("(dry) ไม่เขียน"); process.exit(0); }

p.savedAt = new Date().toISOString();
const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update โดน 0 แถว");
const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q = back?.data;
if (q?.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ");
for (const label of LABELS) {
  const o = q.options.find((x) => x.label.trim() === label && x.display === "input");
  if (o.input.integer || !o.input.hint.includes(NEW_TAIL)) die("อ่านกลับ " + label + " ไม่ตรง");
}
console.log("✓ เขียนแล้ว อ่านกลับตรง · savedAt " + p.savedAt);
