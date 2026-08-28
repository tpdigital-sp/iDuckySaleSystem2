// Paper Foil: เรียงตัวเลือก "การตัด" ตามลำดับคอลัมน์ในตารางราคาของร้าน
// (ตัดตามขนาด → ไดคัทตามทรง → ขนาด A3) ตัวแรกเป็นค่าเริ่มต้น = ฿130
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const ID = "paper-foil";
const ORDER = ["ตัดตามขนาด", "ไดคัทตามทรง", "ไม่ไดคัท (เต็มแผ่น A3)"];
const { data: row } = await sb.from("products").select("id,name,category,price,data").eq("id",ID).single();
const d = structuredClone(row.data);
writeFileSync(`.backup-paperfoil-cutorder-${new Date().toISOString().replace(/[:.]/g,"-")}.json`, JSON.stringify(row,null,2));

const cut = d.options.find(o => o.label === "การตัด");
const by = new Map(cut.choices.map(c => [c.name, c]));
if (ORDER.some(n => !by.has(n))) throw new Error("ชื่อตัวเลือกการตัดไม่ตรงกับที่ตั้งไว้: " + [...by.keys()].join(" / "));
cut.choices = [...ORDER.map(n => by.get(n)), ...cut.choices.filter(c => !ORDER.includes(c.name))];

// ราคาเริ่มต้นที่โชว์หน้ารายการ = ตัวเลือกแรกของทุกแกน (ตัดตามขนาด × 1 Layer ขั้น 1-10)
const first = d.pricing.cells[`${cut.choices[0].name}│${d.options.find(o=>o.label==="เลเยอร์ฟอยล์ (ด้านหน้า)").choices[0].name}`];
d.price = first[0];

const { error } = await sb.from("products").update({ data: d, name: row.name, category: row.category, price: first[0] }).eq("id", ID);
if (error) throw error;
console.log("การตัด:", cut.choices.map(c=>c.name).join(" → "));
console.log("ราคาเริ่มต้น:", first[0]);
