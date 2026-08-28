// Paper Foil: กระดาษ 400 แกรม พิมพ์ได้ด้านเดียว (ล็อกไม่ให้เลือกพิมพ์ 2 ด้าน)
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const ID = "paper-foil", G400 = "กระดาษอาร์ตมัน 400 แกรม";
const { data: row } = await sb.from("products").select("id,name,category,price,data").eq("id",ID).single();
const d = structuredClone(row.data);
writeFileSync(`.backup-paperfoil-400g-${new Date().toISOString().replace(/[:.]/g,"-")}.json`, JSON.stringify(row,null,2));

const rule = {
  when: { label: "ความหนากระดาษ", choice: G400, choices: [G400] },
  limit: { label: "จำนวนด้านที่พิมพ์", allow: ["พิมพ์ 1 ด้าน"] },
};
d.rules = [...(d.rules ?? []).filter(r => !(r?.when?.label === "ความหนากระดาษ" && r?.limit?.label === "จำนวนด้านที่พิมพ์")), rule];

const gram = d.options.find(o => o.label === "ความหนากระดาษ");
gram.choices.find(c => c.name === G400).desc = "หนาที่สุด — พิมพ์ได้ด้านเดียว";
d.tabs = (d.tabs ?? []).map(t => t.title !== "ข้อควรทราบ" ? t : {
  ...t,
  text: t.text.split("\n").filter(l => !/400 แกรม พิมพ์ได้ด้านเดียว/.test(l))
    .concat("• กระดาษอาร์ตมัน 400 แกรม พิมพ์ได้ด้านเดียวเท่านั้น (พิมพ์ 2 ด้านไม่ได้)").join("\n"),
});

const { error } = await sb.from("products").update({ data: d, name: row.name, category: row.category, price: row.price }).eq("id", ID);
if (error) throw error;
console.log("rules:", JSON.stringify(d.rules));
