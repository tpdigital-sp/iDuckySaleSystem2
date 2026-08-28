// Paper Foil: ค่างานฟอยล์ต่อด้าน = 1 Layer +40 · 2 Layer +60 (เท่ากันทั้งหน้า-หลัง)
//   ด้านหน้า: ตารางราคารวมค่าฟอยล์ไว้แล้ว → ส่วนต่าง 2 Layer − 1 Layer ต้องเป็น 20 (60−40) = ตัวเลขตารางเดิม
//             จึงคืนแถว 2 Layer กลับเป็นชุดเดิม (ที่เพิ่งเปลี่ยนเป็น +60 ไปนั้นเกินจริงไป 40)
//   ด้านหลัง: ตัวเลือกบวกเพิ่มตรง ๆ 1 Layer +40 · 2 Layer +60
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const ID = "paper-foil";
const { data: row } = await sb.from("products").select("id,name,category,price,data").eq("id",ID).single();
const d = structuredClone(row.data);
writeFileSync(`.backup-paperfoil-layerfee-${new Date().toISOString().replace(/[:.]/g,"-")}.json`, JSON.stringify(row,null,2));

// คืนตารางราคาจากไฟล์สำรองก่อนเปลี่ยนเป็น +60 (แถว 2 Layer = 1 Layer + 20)
const snap = readdirSync(".").filter(f => f.startsWith(".backup-paperfoil-2layer60-")).sort().pop();
if (!snap) throw new Error("ไม่เจอไฟล์สำรองก่อนแก้ตาราง");
d.pricing.cells = JSON.parse(readFileSync(snap, "utf8")).data.pricing.cells;

// ด้านหลัง 1 Layer +40 · 2 Layer +60
const backLayer = d.options.find(o => o.label === "เลเยอร์ฟอยล์ (ด้านหลัง)");
for (const c of backLayer.choices) {
  if (c.name === "พิมพ์ 1 Layer (ด้านหลัง)") c.extra = 40;
  if (c.name === "พิมพ์ 2 Layer (ด้านหลัง)") c.extra = 60;
}

const all = Object.values(d.pricing.cells).flat();
d.priceMin = Math.min(...all);
d.priceMax = Math.max(...all);

// ข้อความเกณฑ์ราคา
d.tabs = (d.tabs ?? []).map(t => t.title !== "ข้อควรทราบ" ? t : {
  ...t,
  text: t.text
    .split("\n")
    .filter(l => !/2 Layer \(พิมพ์สี \+ ปั๊มฟอยล์ทับ\) บวกเพิ่มแผ่นละ 60/.test(l))
    .concat("• ค่างานฟอยล์คิดต่อด้าน — 1 Layer แผ่นละ 40 บาท · 2 Layer แผ่นละ 60 บาท (ด้านหน้ารวมอยู่ในราคาตารางแล้ว · ด้านหลังบวกเพิ่มตามที่เลือก)")
    .join("\n"),
});

const { error } = await sb.from("products").update({ data: d, name: row.name, category: row.category, price: row.price }).eq("id", ID);
if (error) throw error;

for (const [k,v] of Object.entries(d.pricing.cells)) console.log(k.padEnd(40), v.join(" / "));
console.log("\nด้านหลัง:", backLayer.choices.map(c => `${c.name} +฿${c.extra ?? 0}`).join(" · "));
console.log("ช่วงราคา:", d.priceMin, "-", d.priceMax);
