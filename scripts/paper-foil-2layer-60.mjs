// Paper Foil: งานพิมพ์ 2 Layer บวกเพิ่ม 60 บาท/แผ่น A3 ทั้งด้านหน้าและด้านหลัง
//   ด้านหน้า = แถว 2 Layer ในตารางราคา ตั้งเป็น "ราคา 1 Layer + 60" ทุกขั้นจำนวน
//   ด้านหลัง = ตัวเลือก "พิมพ์ 2 Layer (ด้านหลัง)" จาก +20 เป็น +60 (1 Layer ด้านหลังคงที่ +40)
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const ID = "paper-foil", STEP = 60;
const { data: row, error } = await sb.from("products").select("id,name,category,price,data").eq("id",ID).single();
if (error) throw error;
const d = structuredClone(row.data);
writeFileSync(`.backup-paperfoil-2layer60-${new Date().toISOString().replace(/[:.]/g,"-")}.json`, JSON.stringify(row,null,2));

// 1) ตารางราคา: แถว "พิมพ์ 2 Layer" = แถว "พิมพ์ 1 Layer" ของการตัดเดียวกัน + 60
const cells = d.pricing.cells;
for (const key of Object.keys(cells)) {
  if (!key.endsWith("│พิมพ์ 2 Layer")) continue;
  const base = cells[key.replace("│พิมพ์ 2 Layer", "│พิมพ์ 1 Layer")];
  if (!base) throw new Error("ไม่เจอแถว 1 Layer คู่กับ " + key);
  cells[key] = base.map((n) => n + STEP);
}

// 2) ด้านหลัง
const backLayer = d.options.find(o => o.label === "เลเยอร์ฟอยล์ (ด้านหลัง)");
const back2 = backLayer.choices.find(c => c.name === "พิมพ์ 2 Layer (ด้านหลัง)");
back2.extra = STEP;

// 3) ช่วงราคาที่โชว์หน้ารายการ + ข้อความที่อ้างตัวเลขเก่า
const all = Object.values(cells).flat();
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);
for (const f of d.seo?.faqs ?? []) {
  if (/ปั๊มฟอยล์ 2 ด้าน/.test(f.q ?? ""))
    f.a = "ได้ครับ · เปิดสวิตช์ “เลเยอร์ฟอยล์ (ด้านหลัง)” เมื่อสั่งพิมพ์ 2 ด้าน — ด้านหลังแบบ 1 Layer บวกเพิ่มแผ่นละ 40 บาท · แบบ 2 Layer บวกเพิ่มแผ่นละ 60 บาท · เลือกสีฟอยล์ด้านหลังแยกจากด้านหน้าได้ (โฮโลแกรมบวกเพิ่มอีก 10 บาท)";
}
d.tabs = (d.tabs ?? []).map(t =>
  t.title === "ข้อควรทราบ"
    ? { ...t, text: t.text.includes("2 Layer บวกเพิ่มแผ่นละ 60") ? t.text : `${t.text}\n• งานพิมพ์ 2 Layer (พิมพ์สี + ปั๊มฟอยล์ทับ) บวกเพิ่มแผ่นละ 60 บาท คิดทั้งด้านหน้าและด้านหลัง` }
    : t
);

const { error: e2 } = await sb.from("products").update({ data: d, name: row.name, category: row.category, price: row.price }).eq("id", ID);
if (e2) throw e2;

for (const [k,v] of Object.entries(cells)) console.log(k.padEnd(40), v.join(" / "));
console.log("\nด้านหลัง:", backLayer.choices.map(c => `${c.name} +฿${c.extra ?? 0}`).join(" · "));
console.log("ช่วงราคา:", d.priceMin, "-", d.priceMax);
