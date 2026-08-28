// Paper Foil: ความหนากระดาษ 350 แกรม +5 · 400 แกรม +10 (ต่อแผ่น A3 · 300 แกรม = ราคาตาราง)
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const ID = "paper-foil";
const FEE = { "กระดาษอาร์ตมัน 350 แกรม": 5, "กระดาษอาร์ตมัน 400 แกรม": 10 };
const { data: row } = await sb.from("products").select("id,name,category,price,data").eq("id",ID).single();
const d = structuredClone(row.data);
writeFileSync(`.backup-paperfoil-gram-${new Date().toISOString().replace(/[:.]/g,"-")}.json`, JSON.stringify(row,null,2));

const gram = d.options.find(o => o.label === "ความหนากระดาษ");
for (const c of gram.choices) {
  if (FEE[c.name]) c.extra = FEE[c.name];
  else delete c.extra;
}
gram.note = "ราคาตามตารางอ้างอิงกระดาษอาร์ตมัน 300 แกรม · 350 แกรม บวกแผ่นละ 5 บาท · 400 แกรม บวกแผ่นละ 10 บาท";

d.tabs = (d.tabs ?? []).map(t => t.title !== "ข้อควรทราบ" ? t : {
  ...t,
  text: t.text.split("\n").map(l =>
    /ราคาตามตารางอ้างอิงกระดาษอาร์ตมัน 300 แกรม/.test(l)
      ? "• ราคาตามตารางอ้างอิงกระดาษอาร์ตมัน 300 แกรม — 350 แกรม บวกแผ่นละ 5 บาท · 400 แกรม บวกแผ่นละ 10 บาท"
      : l).join("\n"),
});
for (const f of d.seo?.faqs ?? []) {
  if (/กระดาษหนาเท่าไหร่/.test(f.q ?? ""))
    f.a = "เคลือบฟอยล์ได้ที่ความหนา 300 / 350 / 400 แกรม (กระดาษอาร์ตมันนำเข้าจากเกาหลี) — ราคาตารางคิดที่ 300 แกรม · 350 แกรม บวกแผ่นละ 5 บาท · 400 แกรม บวกแผ่นละ 10 บาท";
}

const { error } = await sb.from("products").update({ data: d, name: row.name, category: row.category, price: row.price }).eq("id", ID);
if (error) throw error;
console.log("ความหนากระดาษ:", gram.choices.map(c => `${c.name} +฿${c.extra ?? 0}`).join(" · "));
