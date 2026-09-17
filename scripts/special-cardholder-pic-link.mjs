/**
 * 🖼 ผูกภาพให้แม่แบบ "Card Holder (สกรีนสาย)" + "(ไม่สกรีนสาย)" ในคลังสินค้าพิเศษ → สินค้า cardholder-white
 * (การ์ดโฮลเดอร์พลาสติกขาว — ตัวเลือก "+ สกรีนสาย" / "+ สายขาว" สเปคตรงกับแม่แบบทั้งคู่)
 * เจ้าของร้านสั่ง 17 ก.ย. 69 · OD-260917-6158 "Card Holder (สายสี)" ไม่มีลายลูกค้า ให้ขึ้นภาพสินค้า
 * แก้เฉพาะ imageProductId ของ 2 แม่แบบนี้ · เอาออกได้ที่ /admin/special-products
 * รัน: node scripts/special-cardholder-pic-link.mjs [--apply]
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim().replace(/^"|"$/g,"")]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");
const ROW = "__special_products__", TARGET = "cardholder-white";
const die = (m) => { console.error("✗", m); process.exit(1); };

const { data: prod } = await sb.from("products").select("id,data->>imageSrc").eq("id", TARGET).maybeSingle();
if (!prod?.imageSrc) die(`ไม่พบสินค้า ${TARGET} หรือไม่มีภาพปก`);
const { data: row, error } = await sb.from("products").select("data").eq("id", ROW).maybeSingle();
if (error || !row) die("อ่านคลังสินค้าพิเศษไม่ได้");
const list = row.data.list ?? [];
let n = 0;
const next = list.map((p) => {
  if (!/^card holder \((สกรีนสาย|ไม่สกรีนสาย)\)$/i.test(p.name.trim())) return p;
  n++;
  console.log(`  ${p.name}: ${p.imageProductId ?? "-"} → ${TARGET}`);
  return { ...p, imageProductId: TARGET };
});
if (n !== 2) die(`คาดว่าเจอ 2 แม่แบบ แต่เจอ ${n}`);
if (!APPLY) { console.log("(ลองเฉย ๆ — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }
const { data: wrote, error: e2 } = await sb.from("products").update({ data: { ...row.data, list: next } }).eq("id", ROW).select("data");
if (e2 || wrote?.length !== 1) die("เขียนไม่ลง: " + (e2?.message ?? "0 แถว"));
const { data: back } = await sb.from("products").select("data").eq("id", ROW).maybeSingle();
const ok = back.data.list.length === list.length && back.data.list.filter((p) => p.imageProductId === TARGET).length === 2;
if (!ok) die("อ่านกลับมาไม่ตรง");
console.log(`✓ ผูกแล้ว 2 แม่แบบ (คลัง ${back.data.list.length} รายการเท่าเดิม)`);
