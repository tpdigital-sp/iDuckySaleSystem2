// Paper Foil: คละลายมีเฉพาะงานที่ตัด/ไดคัท — "ไม่ไดคัท (เต็มแผ่น A3)" 1 แผ่น = 1 ลาย ไม่ต้องถามคละ
// ย้าย mixRule จากระดับสินค้า → ไปอยู่บนตัวเลือก "ตัดตามขนาด" และ "ไดคัทตามทรง"
// (mixRuleFor อ่านของตัวเลือกก่อน ถ้าตัวเลือกที่เลือกอยู่ไม่มี = ไม่มีกติกาคละ → หน้าสินค้าไม่ขึ้นช่อง "คละกี่ลาย")
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const ID = "paper-foil";
const RULE = { baseFee: 0, includedDesigns: 1, extraFee: 5, tiers: [{ fromQty: 1, baseFee: 0, includedDesigns: 1, extraFee: 5 }] };
const WITH_MIX = ["ตัดตามขนาด", "ไดคัทตามทรง"];

const { data: row } = await sb.from("products").select("id,name,category,price,data").eq("id",ID).single();
const d = structuredClone(row.data);
writeFileSync(`.backup-paperfoil-mixcut-${new Date().toISOString().replace(/[:.]/g,"-")}.json`, JSON.stringify(row,null,2));

delete d.mixRule;
const cut = d.options.find(o => o.label === "การตัด");
for (const c of cut.choices) {
  if (WITH_MIX.includes(c.name)) c.mixRule = structuredClone(RULE);
  else delete c.mixRule;
}

d.tabs = (d.tabs ?? []).map(t => t.title !== "ข้อควรทราบ" ? t : {
  ...t,
  text: t.text.split("\n").filter(l => !/คละลาย/.test(l))
    .concat("• คละลาย (เฉพาะงานตัดตามขนาด / ไดคัทตามทรง): 1 แผ่น A3 รวมได้ 1 ลาย — ลายที่เกินคิดเพิ่มลายละ 5 บาท · งานไม่ไดคัทเต็มแผ่น A3 = 1 แผ่น 1 ลาย ตามจำนวนที่สั่ง").join("\n"),
});
for (const f of d.seo?.faqs ?? []) if (/คละลาย/.test(f.q ?? ""))
  f.a = "คละได้เฉพาะงานตัดตามขนาด/ไดคัทตามทรงครับ · 1 แผ่น A3 รวมอยู่ 1 ลาย ลายที่เกินคิดเพิ่มลายละ 5 บาทต่อแผ่นนั้น — ส่วนงานไม่ไดคัทเต็มแผ่น A3 คิด 1 แผ่นต่อ 1 ลายตามจำนวนที่สั่งอยู่แล้ว";

const { error } = await sb.from("products").update({ data: d, name: row.name, category: row.category, price: row.price }).eq("id", ID);
if (error) throw error;
console.log("mixRule ระดับสินค้า:", d.mixRule ?? "ถอดออกแล้ว");
for (const c of cut.choices) console.log(" ", c.name.padEnd(26), c.mixRule ? "มีกติกาคละ (1 ลาย/แผ่น · เกินลายละ 5)" : "ไม่มีคละลาย");
