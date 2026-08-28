// Paper Foil: ย้ายค่าความหนากระดาษเข้าไปอยู่ใน "ตารางราคาต่อหน่วยตามจำนวน"
//   เดิม: ตาราง = การตัด × เลเยอร์ (ด้านหน้า) แล้วบวก +5/+10 นอกตาราง
//   ใหม่: ตาราง = การตัด × เลเยอร์ (ด้านหน้า) × ความหนากระดาษ (300 = ฐาน · 350 +5 · 400 +10)
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const ID = "paper-foil", GRAM = "ความหนากระดาษ";
const FEE = { "กระดาษอาร์ตมัน 300 แกรม": 0, "กระดาษอาร์ตมัน 350 แกรม": 5, "กระดาษอาร์ตมัน 400 แกรม": 10 };
const { data: row } = await sb.from("products").select("id,name,category,price,data").eq("id",ID).single();
const d = structuredClone(row.data);
writeFileSync(`.backup-paperfoil-gramtable-${new Date().toISOString().replace(/[:.]/g,"-")}.json`, JSON.stringify(row,null,2));

const gram = d.options.find(o => o.label === GRAM);
const names = gram.choices.map(c => c.name);
if (names.some(n => FEE[n] === undefined)) throw new Error("ชื่อความหนาไม่ตรง: " + names.join(" / "));

// ถ้าเคยเพิ่ม GRAM เข้าไปแล้ว ให้ถอยกลับไปใช้ฐาน 300 แกรมก่อน แล้วค่อยกางใหม่ (รันซ้ำได้)
const base = {};
for (const [key, arr] of Object.entries(d.pricing.cells)) {
  const parts = key.split("│");
  const gi = (d.pricing.driverLabels ?? []).indexOf(GRAM);
  if (gi < 0) { base[key] = arr; continue; }
  if (parts[gi] !== names[0]) continue;                       // เก็บเฉพาะแถวฐาน (300 แกรม)
  base[parts.filter((_, i) => i !== gi).join("│")] = arr;
}

d.pricing.driverLabels = [...(d.pricing.driverLabels ?? []).filter(l => l !== GRAM), GRAM];
d.pricing.cells = {};
for (const [key, arr] of Object.entries(base))
  for (const n of names) d.pricing.cells[`${key}│${n}`] = arr.map(v => v + FEE[n]);

// ค่าความหนาอยู่ในตารางแล้ว — ถอด extra ออกกันคิดซ้ำ
for (const c of gram.choices) delete c.extra;
gram.note = "ราคาต่อแผ่นในตารางรวมค่าความหนาแล้ว — 350 แกรม แผ่นละ +5 บาท · 400 แกรม +10 บาท จากราคา 300 แกรม";

const all = Object.values(d.pricing.cells).flat();
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);
const firstKey = d.pricing.driverLabels.map(l => d.options.find(o => o.label === l).choices[0].name).join("│");
d.price = d.pricing.cells[firstKey][0];

const { error } = await sb.from("products").update({ data: d, name: row.name, category: row.category, price: d.price }).eq("id", ID);
if (error) throw error;

console.log("driverLabels:", JSON.stringify(d.pricing.driverLabels));
for (const [k,v] of Object.entries(d.pricing.cells)) console.log(" ", k.padEnd(70), v.join(" / "));
console.log("\nราคาเริ่มต้น:", d.price, "· ช่วง:", d.priceMin, "-", d.priceMax, "· ทั้งหมด", Object.keys(d.pricing.cells).length, "แบบ");
