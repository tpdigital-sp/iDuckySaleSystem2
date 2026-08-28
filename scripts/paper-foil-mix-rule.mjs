// Paper Foil: คละลาย — 1 แผ่น A3 รวม 1 ลาย · ลายที่เกินคิดเพิ่มลายละ 5 บาท (ต่อแผ่นที่คละ)
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const ID = "paper-foil";
const RULE = { baseFee: 0, includedDesigns: 1, extraFee: 5, tiers: [{ fromQty: 1, baseFee: 0, includedDesigns: 1, extraFee: 5 }] };
const { data: row } = await sb.from("products").select("id,name,category,price,data").eq("id",ID).single();
const d = structuredClone(row.data);
writeFileSync(`.backup-paperfoil-mix-${new Date().toISOString().replace(/[:.]/g,"-")}.json`, JSON.stringify(row,null,2));

d.mixRule = RULE;
d.tabs = (d.tabs ?? []).map(t => t.title !== "ข้อควรทราบ" ? t : {
  ...t,
  text: t.text.split("\n").filter(l => !/คละลาย/.test(l))
    .concat("• คละลาย: 1 แผ่น A3 รวมได้ 1 ลาย — ลายที่เกินคิดเพิ่มลายละ 5 บาท (คิดเฉพาะแผ่นที่มีหลายลาย)").join("\n"),
});
for (const f of d.seo?.faqs ?? []) if (/คละลาย/.test(f.q ?? "")) f.a = "คละได้ครับ · 1 แผ่น A3 รวมอยู่ 1 ลาย ถ้าอยากใส่หลายลายในแผ่นเดียว คิดเพิ่มลายละ 5 บาทต่อแผ่นนั้น";

const { error } = await sb.from("products").update({ data: d, name: row.name, category: row.category, price: row.price }).eq("id", ID);
if (error) throw error;
console.log("mixRule:", JSON.stringify(d.mixRule));
