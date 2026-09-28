/** เอาภาพประจำเรท (gallery-1.jpg คู่สเก็ตบอร์ด) ออกจากเสื้อกีฬา SPORT — 25 ก.ย. 69 เจ้าของร้านสั่ง "เอาภาพนี้ออก" */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync("/Users/iduckshop/Desktop/iDuckySaleSystem2/.env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const die = (m) => { console.error("✗ " + m); process.exit(1); };
const TARGET = "products/sport/gallery-1.jpg";

const { data: p, error } = await sb.from("products").select("id,data").eq("id","sport").single();
if (error) die(error.message);
const d = structuredClone(p.data);
let touched = 0;
for (const r of d.priceRates ?? []) {
  if (typeof r.imageSrc === "string" && r.imageSrc.includes(TARGET)) { delete r.imageSrc; touched++; }
}
if ((d.images ?? []).some((im) => im.src?.includes(TARGET))) die("ภาพนี้อยู่ใน images ด้วย — ไม่คาดคิด หยุดก่อน");
if (!touched) { console.log("ไม่มีอะไรต้องแก้ (ถอดไปแล้ว)"); process.exit(0); }
d.savedAt = new Date().toISOString();

const { data: rows, error: e2 } = await sb.from("products").update({ data: d }).eq("id","sport").select("data");
if (e2) die(e2.message);
if (rows.length !== 1) die(`อัปเดตโดน ${rows.length} แถว`);

const { data: back } = await sb.from("products").select("data").eq("id","sport").single();
const still = (back.data.priceRates ?? []).filter((r) => typeof r.imageSrc === "string" && r.imageSrc.includes(TARGET));
if (still.length) die("อ่านกลับยังเจอ imageSrc อยู่ " + still.length + " เรท");
if (back.data.savedAt !== d.savedAt) die("savedAt อ่านกลับไม่ตรง");
if ((back.data.images ?? []).length !== (p.data.images ?? []).length) die("จำนวน images เปลี่ยน");
console.log(`✓ ถอด imageSrc ออกจาก ${touched} เรท · images ยัง ${back.data.images.length} รูป · savedAt=${back.data.savedAt}`);
