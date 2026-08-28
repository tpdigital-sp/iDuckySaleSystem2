// Paper Foil: ค่าฟอยล์ด้านหลังตามตัวเลขที่ร้านยืนยัน
//   ตัดตามขนาด · หน้า 1 Layer · 1 แผ่น = ฿130
//   + หลัง 1 Layer = ฿130 (ไม่บวก) · + หลัง 2 Layer = ฿150 (บวก 20 เท่าส่วนต่าง 1→2 Layer ในตาราง)
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const ID = "paper-foil";
const { data: row } = await sb.from("products").select("id,name,category,price,data").eq("id",ID).single();
const d = structuredClone(row.data);
writeFileSync(`.backup-paperfoil-backfee-${new Date().toISOString().replace(/[:.]/g,"-")}.json`, JSON.stringify(row,null,2));

const back = d.options.find(o => o.label === "เลเยอร์ฟอยล์ (ด้านหลัง)");
for (const c of back.choices) {
  if (c.name === "พิมพ์ 1 Layer (ด้านหลัง)") delete c.extra;   // ไม่คิดเพิ่ม
  if (c.name === "พิมพ์ 2 Layer (ด้านหลัง)") c.extra = 20;
}
back.note = "เลือกได้เมื่อสั่งพิมพ์ 2 ด้าน · ปั๊มฟอยล์ด้านหลังแบบ 1 Layer ไม่คิดเพิ่ม — แบบ 2 Layer (พิมพ์สี + ฟอยล์ทับ) บวกแผ่นละ 20 บาท";

for (const f of d.seo?.faqs ?? []) {
  if (/ปั๊มฟอยล์ 2 ด้าน/.test(f.q ?? ""))
    f.a = "ได้ครับ · เลือก “พิมพ์ 2 ด้าน” แล้วเปิดสวิตช์ “เลเยอร์ฟอยล์ (ด้านหลัง)” — ด้านหลังแบบ 1 Layer ไม่คิดเพิ่ม · แบบ 2 Layer บวกแผ่นละ 20 บาท · เลือกสีฟอยล์ด้านหลังแยกจากด้านหน้าได้ (โฮโลแกรมบวกอีก 10 บาท)";
}
d.tabs = (d.tabs ?? []).map(t => t.title !== "ข้อควรทราบ" ? t : {
  ...t,
  text: t.text.split("\n").filter(l => !/ค่างานฟอยล์คิดต่อด้าน/.test(l))
    .concat("• ปั๊มฟอยล์ด้านหลัง: แบบ 1 Layer ไม่คิดเพิ่ม · แบบ 2 Layer บวกแผ่นละ 20 บาท").join("\n"),
});

const { error } = await sb.from("products").update({ data: d, name: row.name, category: row.category, price: row.price }).eq("id", ID);
if (error) throw error;
console.log("ด้านหลัง:", back.choices.map(c => `${c.name} +฿${c.extra ?? 0}`).join(" · "));
