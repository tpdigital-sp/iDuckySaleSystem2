// Texture Paper: กลุ่ม "เคลือบ (ด้านหลัง)" ให้เหมือนสินค้างานกระดาษ (paper-art-pet)
//  - การ์ด + คำอธิบาย + รูปต่อตัวเลือก
//  - เพิ่มกลุ่มตาม "เคลือบพิเศษ (ด้านหลัง)" ให้เลือกลายได้เหมือนกัน
//  - เปลี่ยนชื่อกลุ่ม "พิมพ์รองสีขาว" → "พิมพ์รองสีขาว (ด้านหน้า)"
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const ID = "texture-paper", REF = "paper-art-pet";
const { data: row, error } = await sb.from("products").select("id,name,category,price,data").eq("id",ID).single();
if (error) throw error;
const { data: ref, error: e0 } = await sb.from("products").select("data").eq("id",REF).single();
if (e0) throw e0;

const d = structuredClone(row.data);
writeFileSync(`.backup-texturepaper-backcoat-${new Date().toISOString().replace(/[:.]/g,"-")}.json`, JSON.stringify(row,null,2));

const refBack = ref.data.options.find(o => o.label === "เคลือบ (เฉพาะด้านหลัง)");
const refSpecial = ref.data.options.find(o => o.label === "เคลือบพิเศษ (ด้านหลัง)");
if (!refBack || !refSpecial) throw new Error("หา group ต้นแบบใน paper-art-pet ไม่เจอ");
const refByName = Object.fromEntries(refBack.choices.map(c => [c.name, c]));

const idx = d.options.findIndex(o => o.label === "เคลือบ (ด้านหลัง)");
if (idx < 0) throw new Error('ไม่เจอกลุ่ม "เคลือบ (ด้านหลัง)"');
const back = d.options[idx];

// 1) การ์ด + desc + รูป (คงราคา/เงื่อนไข/หมายเหตุเดิมของ texture paper ไว้)
back.display = "cards";
back.choices = back.choices.map(c => {
  const r = refByName[c.name];
  return r ? { ...c, desc: c.desc ?? r.desc, imageSrc: c.imageSrc ?? r.imageSrc } : c;
});

// 2) กลุ่มลายเคลือบพิเศษด้านหลัง (โผล่เมื่อเลือก "เคลือบพิเศษ" ในกลุ่มด้านหลัง)
const special = {
  label: "เคลือบพิเศษ (ด้านหลัง)",
  choices: refSpecial.choices.map(c => ({ ...c })),
  showWhen: { label: back.label, choices: ["เคลือบพิเศษ"] },
  showWhenAlso: { ...back.showWhen },                 // พิมพ์ 2 ด้าน
  showWhenAll: back.showWhenAlso ? [{ ...back.showWhenAlso }] : undefined, // ชนิดกระดาษที่เคลือบหลังได้
};
if (!special.showWhenAll) delete special.showWhenAll;

const already = d.options.findIndex(o => o.label === special.label);
if (already >= 0) d.options[already] = special;
else d.options.splice(idx + 1, 0, special);

// 3) เปลี่ยนชื่อกลุ่มพิมพ์รองสีขาว (ไม่มีกลุ่มไหน showWhen อ้างชื่อนี้ — ตรวจแล้ว)
const white = d.options.find(o => o.label === "พิมพ์รองสีขาว");
if (white) white.label = "พิมพ์รองสีขาว (ด้านหน้า)";

const { error: e2 } = await sb.from("products").update({ data: d, name: row.name, category: row.category, price: row.price }).eq("id", ID);
if (e2) throw e2;

for (const o of d.options) {
  if (!/เคลือบ \(ด้านหลัง\)|เคลือบพิเศษ \(ด้านหลัง\)|พิมพ์รองสีขาว/.test(o.label)) continue;
  console.log(`\nGROUP "${o.label}" display=${o.display??"-"}`);
  for (const c of o.choices) console.log("   -", c.name, "| +฿", c.extra??0, "|", c.desc ? "มี desc" : "ไม่มี desc", "|", c.imageSrc ? "มีรูป" : "ไม่มีรูป");
}
