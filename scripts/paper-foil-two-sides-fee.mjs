// Paper Foil: พิมพ์ 2 ด้าน บวกแผ่นละ 10 บาท
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const ID = "paper-foil";
const { data: row } = await sb.from("products").select("id,name,category,price,data").eq("id",ID).single();
const d = structuredClone(row.data);
writeFileSync(`.backup-paperfoil-2sidesfee-${new Date().toISOString().replace(/[:.]/g,"-")}.json`, JSON.stringify(row,null,2));

const sides = d.options.find(o => o.label === "จำนวนด้านที่พิมพ์");
sides.choices.find(c => c.name === "พิมพ์ 2 ด้าน").extra = 10;
sides.note = "พิมพ์ 2 ด้าน บวกแผ่นละ 10 บาท · งาน 2 ด้านกระดาษอาจคลาดเคลื่อน +/- 3-5 มม. ไม่ควรวางลายชิดขอบหรือมีเส้นกรอบ";

d.tabs = (d.tabs ?? []).map(t => t.title !== "ข้อควรทราบ" ? t : {
  ...t,
  text: t.text.split("\n").filter(l => !/พิมพ์ 2 ด้าน บวกแผ่นละ/.test(l))
    .concat("• พิมพ์ 2 ด้าน บวกแผ่นละ 10 บาท").join("\n"),
});

const { error } = await sb.from("products").update({ data: d, name: row.name, category: row.category, price: row.price }).eq("id", ID);
if (error) throw error;
console.log("จำนวนด้านที่พิมพ์:", sides.choices.map(c => `${c.name} +฿${c.extra ?? 0}`).join(" · "));
