// Paper Foil: ลดความรกของกลุ่มตัวเลือก (ผู้ใช้สั่ง 7 ก.ย. 69)
// 1) การ์ดเต็มความกว้างที่ไม่มีคำอธิบาย/คำอธิบายสั้น → ปุ่ม pill แบบเดียวกับ "เคลือบฟอยล์ (ด้านหน้า)"
//    - จำนวนด้านที่พิมพ์ (การ์ด 171px → แถวเดียว) · สีฟอยล์ (ด้านหน้า/ด้านหลัง) (การ์ด 426px → ~2 แถว)
//    กลุ่มในสวิตช์พับ (เคลือบฟอยล์หลัง · เคลือบหลัง) มี desc ยาว คงเป็นการ์ดเดิม — ปิดอยู่โดยปริยาย ไม่รก
// 2) แยกหมวด: ด้านหลังทั้งชุด (ฟอยล์หลัง/สีฟอยล์หลัง/เคลือบหลัง) ออกเป็น "4. ด้านหลัง (ฟอยล์/เคลือบ)"
// รันซ้ำได้ · สำรองก่อนเขียน · อ่านกลับเทียบ
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const die = (m) => { console.error("✗", m); process.exit(1); };

const ID = "paper-foil";
const SEC_FRONT = "3. จำนวนด้าน + ฟอยล์ด้านหน้า";
const SEC_BACK = "4. ด้านหลัง (ฟอยล์/เคลือบ)";
const TO_PILLS = ["จำนวนด้านที่พิมพ์", "สีฟอยล์ (ด้านหน้า)", "สีฟอยล์ (ด้านหลัง)"];
const BACK_GROUPS = ["เคลือบฟอยล์ (ด้านหลัง)", "สีฟอยล์ (ด้านหลัง)", "เคลือบ (ด้านหลัง)"];

const { data: row, error: e0 } = await sb.from("products").select("id,name,category,price,data").eq("id",ID).single();
if (e0) die(e0.message);
writeFileSync(`.backup-paperfoil-declutter-${new Date().toISOString().replace(/[:.]/g,"-")}.json`, JSON.stringify(row,null,2));

const d = structuredClone(row.data);
for (const o of d.options) {
  if (TO_PILLS.includes(o.label) && o.display === "cards") delete o.display;
  if (o.section === "3. จำนวนด้าน + ฟอยล์")
    o.section = BACK_GROUPS.includes(o.label) ? SEC_BACK : SEC_FRONT;
}
d.savedAt = new Date().toISOString();

const { data: upd, error: e1 } = await sb.from("products")
  .update({ data: d, name: row.name, category: row.category, price: row.price })
  .eq("id", ID).select("data");
if (e1) die(e1.message);
if (!upd?.length) die("update โดน 0 แถว");

const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const bd = back.data;
for (const l of TO_PILLS) {
  const g = bd.options.find((o) => o.label === l);
  if (!g || g.display) die(`${l} ยังมี display=${g?.display}`);
}
for (const o of bd.options) {
  if (BACK_GROUPS.includes(o.label) && o.section !== SEC_BACK) die(`${o.label} section=${o.section}`);
}
if (bd.options.some((o) => o.section === "3. จำนวนด้าน + ฟอยล์")) die("ยังมี section ชื่อเก่าค้าง");
if (bd.savedAt !== d.savedAt) die("savedAt ไม่ตรง (โดนเขียนแทรก?)");
console.log("✓ ปรับแล้ว —", bd.options.map((o) => `${o.label}[${o.display ?? "pill"}|${o.section}]`).join("\n  "));
