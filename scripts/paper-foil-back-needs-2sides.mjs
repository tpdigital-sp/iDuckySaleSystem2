// Paper Foil: กลุ่มฟอยล์ด้านหลังโผล่เฉพาะเมื่อเลือก "พิมพ์ 2 ด้าน"
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const ID = "paper-foil";
const { data: row } = await sb.from("products").select("id,name,category,price,data").eq("id",ID).single();
const d = structuredClone(row.data);
writeFileSync(`.backup-paperfoil-back2sides-${new Date().toISOString().replace(/[:.]/g,"-")}.json`, JSON.stringify(row,null,2));

const TWO = { label: "จำนวนด้านที่พิมพ์", choices: ["พิมพ์ 2 ด้าน"] };
const backLayer = d.options.find(o => o.label === "เลเยอร์ฟอยล์ (ด้านหลัง)");
const backColor = d.options.find(o => o.label === "สีฟอยล์ (ด้านหลัง)");
if (!backLayer || !backColor) throw new Error("ไม่เจอกลุ่มฟอยล์ด้านหลัง");

backLayer.showWhen = { ...TWO };                 // เปิดสวิตช์ได้ต่อเมื่อสั่งพิมพ์ 2 ด้าน
backColor.showWhenAlso = { ...TWO };             // สีด้านหลังต้องผ่านทั้ง 2 เงื่อนไข
backLayer.note = "เลือกได้เมื่อสั่งพิมพ์ 2 ด้าน · เปิดสวิตช์เมื่ออยากปั๊มฟอยล์ด้านหลังด้วย — คิดเพิ่มต่อแผ่น A3";

const { error } = await sb.from("products").update({ data: d, name: row.name, category: row.category, price: row.price }).eq("id", ID);
if (error) throw error;
for (const o of [backLayer, backColor])
  console.log(o.label, "| showWhen:", JSON.stringify(o.showWhen), "| showWhenAlso:", JSON.stringify(o.showWhenAlso ?? null));
