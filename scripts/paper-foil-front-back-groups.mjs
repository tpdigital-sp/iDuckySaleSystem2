// Paper Foil: จัดกลุ่มตัวเลือกใหม่ตามลำดับที่ร้านสั่ง
//  การตัด → จำนวนด้านที่พิมพ์ → เลเยอร์ฟอยล์ (ด้านหน้า) → สีฟอยล์ (ด้านหน้า)
//  → [สวิตช์เปิด-ปิด] เลเยอร์ฟอยล์ (ด้านหลัง) → สีฟอยล์ (ด้านหลัง)
// แทนกลุ่มเดิม "ปั๊มฟอยล์ด้านที่ 2" ที่รวมเลเยอร์+สีไว้ในตัวเลือกเดียว
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const ID = "paper-foil";
const IMG = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/paper-foil";
const { data: row, error } = await sb.from("products").select("id,name,category,price,data").eq("id",ID).single();
if (error) throw error;
const d = structuredClone(row.data);
writeFileSync(`.backup-paperfoil-groups-${new Date().toISOString().replace(/[:.]/g,"-")}.json`, JSON.stringify(row,null,2));

const g = (label) => d.options.find(o => o.label === label);

// 1) เปลี่ยนชื่อกลุ่มด้านหน้า (ชื่อ "ตัวเลือก" ไม่แตะ — ตารางราคาอ้างชื่อตัวเลือก)
const front = g("จำนวนเลเยอร์ฟอยล์");
if (!front) throw new Error('ไม่เจอกลุ่ม "จำนวนเลเยอร์ฟอยล์"');
front.label = "เลเยอร์ฟอยล์ (ด้านหน้า)";
const frontColor = g("สีฟอยล์");
if (!frontColor) throw new Error('ไม่เจอกลุ่ม "สีฟอยล์"');
frontColor.label = "สีฟอยล์ (ด้านหน้า)";

// ⚠️ แกนตารางราคาอ้างชื่อกลุ่ม — ต้องตามแก้ ไม่งั้นราคาหล่นไป product.price
const fixDriver = (arr) => (arr ?? []).map(l => l === "จำนวนเลเยอร์ฟอยล์" ? front.label : l === "สีฟอยล์" ? frontColor.label : l);
if (d.pricing?.driverLabels) d.pricing.driverLabels = fixDriver(d.pricing.driverLabels);
for (const r of d.priceRates ?? []) if (r.pricing?.driverLabels) r.pricing.driverLabels = fixDriver(r.pricing.driverLabels);

// 2) กลุ่มใหม่ "จำนวนด้านที่พิมพ์"
const sides = {
  label: "จำนวนด้านที่พิมพ์",
  display: "cards",
  note: "งานพิมพ์ 2 ด้าน กระดาษอาจคลาดเคลื่อน +/- 3-5 มม. ไม่ควรวางลายชิดขอบหรือมีเส้นกรอบ",
  choices: [
    { name: "พิมพ์ 1 ด้าน", desc: "ลายอยู่ด้านหน้าด้านเดียว" },
    { name: "พิมพ์ 2 ด้าน", desc: "มีลายทั้งหน้าและหลัง" },
  ],
};

// 3) ด้านหลัง — เลเยอร์ (สวิตช์เปิด-ปิด ตัวแรกต้องไม่คิดเงิน) แล้วค่อยเลือกสี
const backLayer = {
  label: "เลเยอร์ฟอยล์ (ด้านหลัง)",
  display: "cards",
  collapsible: true,
  note: "เปิดสวิตช์เมื่ออยากปั๊มฟอยล์ด้านหลังด้วย · คิดเพิ่มต่อแผ่น A3",
  choices: [
    { name: "ไม่ปั๊มฟอยล์ด้านหลัง", desc: "ด้านหลังไม่มีงานฟอยล์" },
    { name: "พิมพ์ 1 Layer (ด้านหลัง)", desc: "ปั๊มฟอยล์อย่างเดียวบนกระดาษเปล่า", extra: 40, imageSrc: `${IMG}/layer-1.jpg` },
    { name: "พิมพ์ 2 Layer (ด้านหลัง)", desc: "พิมพ์สีก่อนแล้วปั๊มฟอยล์ทับ", extra: 20, imageSrc: `${IMG}/layer-2.jpg` },
  ],
};
const backLayerOn = backLayer.choices.slice(1).map(c => c.name);
const backColor = {
  label: "สีฟอยล์ (ด้านหลัง)",
  display: "cards",
  showWhen: { label: backLayer.label, choices: backLayerOn },
  choices: (frontColor.choices ?? []).map(c => ({ ...c })),
};

// 4) ประกอบลำดับกลุ่มใหม่ (กลุ่มอื่นที่ไม่ได้เอ่ยถึงต่อท้ายไว้เหมือนเดิม)
const ORDER = ["ความหนากระดาษ","การตัด",sides.label,front.label,frontColor.label,backLayer.label,backColor.label];
const pool = new Map(d.options.filter(o => o.label !== "ปั๊มฟอยล์ด้านที่ 2").map(o => [o.label, o]));
pool.set(sides.label, sides); pool.set(backLayer.label, backLayer); pool.set(backColor.label, backColor);
d.options = [
  ...ORDER.map(l => pool.get(l)).filter(Boolean),
  ...[...pool.values()].filter(o => !ORDER.includes(o.label)),
];

// 5) กฎเดิมล็อกกลุ่ม "ปั๊มฟอยล์ด้านที่ 2" ตามเลเยอร์ด้านหน้า — กลุ่มนั้นไม่มีแล้ว ตัดทิ้ง
d.rules = (d.rules ?? []).filter(r => r?.limit?.label !== "ปั๊มฟอยล์ด้านที่ 2");

// 6) FAQ ให้ตรงกับกติกาใหม่ (สีฟอยล์ด้านหลังบวกโฮโลแกรมเหมือนด้านหน้า)
for (const f of d.seo?.faqs ?? []) {
  if (/ปั๊มฟอยล์ 2 ด้าน/.test(f.q ?? "")) {
    f.a = "ได้ครับ · เปิดสวิตช์ “เลเยอร์ฟอยล์ (ด้านหลัง)” ในหน้าสินค้า — ด้านหลังแบบ 1 Layer บวกเพิ่มแผ่นละ 40 บาท · แบบ 2 Layer บวกเพิ่มแผ่นละ 20 บาท · เลือกสีฟอยล์ด้านหลังแยกจากด้านหน้าได้ (โฮโลแกรมบวกเพิ่มอีก 10 บาท)";
  }
}

const { error: e2 } = await sb.from("products").update({ data: d, name: row.name, category: row.category, price: row.price }).eq("id", ID);
if (e2) throw e2;

console.log("driverLabels:", JSON.stringify(d.pricing.driverLabels));
console.log("cells keys ตัวอย่าง:", Object.keys(d.pricing.cells).slice(0,2).join(" / "));
for (const [i,o] of d.options.entries()) {
  console.log(`\n[${i}] "${o.label}"${o.collapsible?" 🔘สวิตช์":""} display=${o.display??"-"} showWhen=${o.showWhen?`${o.showWhen.label}=${o.showWhen.choices.join("/")}`:"-"}`);
  for (const c of o.choices ?? []) console.log("     -", c.name, c.extra ? `+฿${c.extra}` : "");
}
console.log("\nrules เหลือ:", JSON.stringify(d.rules));
