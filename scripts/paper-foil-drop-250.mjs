// ถอดตัวเลือก "กระดาษอาร์ตมัน 250 แกรม" ออกจากสินค้า Paper Foil + แก้ข้อความที่อ้างถึง 250 แกรม
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const ID = "paper-foil";
const { data: row, error } = await sb.from("products").select("id,name,category,price,data").eq("id",ID).single();
if (error) throw error;
const d = structuredClone(row.data);
writeFileSync(`.backup-paperfoil-250-${new Date().toISOString().replace(/[:.]/g,"-")}.json`, JSON.stringify(row,null,2));

// 1) ถอดตัวเลือกออกจากกลุ่ม "ความหนากระดาษ"
let dropped = 0;
for (const o of d.options ?? []) {
  if (o.label !== "ความหนากระดาษ") continue;
  const before = o.choices.length;
  o.choices = o.choices.filter(c => !/250\s*แกรม/.test(c.name));
  dropped += before - o.choices.length;
}

// 2) แก้ข้อความที่ยังบอกว่ามี 250 แกรม
const fix = (s) => typeof s === "string"
  ? s
      .replace(/250\s*\/\s*300\s*\/\s*350\s*\/\s*400\s*แกรม/g, "300 / 350 / 400 แกรม")
      .replace(/ความหนา\s*250-400\s*แกรม/g, "ความหนา 300-400 แกรม")
      .replace(/ความหนา\s*250\s*\/\s*350\s*\/\s*400\s*แกรม/g, "ความหนา 350 / 400 แกรม")
  : s;

const walk = (v) => Array.isArray(v) ? v.map(walk)
  : (v && typeof v === "object") ? Object.fromEntries(Object.entries(v).map(([k,x]) => [k, k === "options" ? x : walk(x)]))
  : fix(v);

const out = walk(d);

const { error: e2 } = await sb.from("products").update({ data: out, name: row.name, category: row.category, price: row.price }).eq("id", ID);
if (e2) throw e2;

console.log("ถอดตัวเลือกออก:", dropped, "รายการ");
for (const o of out.options) if (o.label === "ความหนากระดาษ") console.log("เหลือ:", o.choices.map(c=>c.name).join(" · "));
console.log("ข้อความที่ยังมีคำว่า 250:", JSON.stringify(out).match(/[^"]{0,60}250[^"]{0,60}/g) ?? "ไม่มีแล้ว");
