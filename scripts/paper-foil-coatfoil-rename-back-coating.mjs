// Paper Foil (paper-foil):
// 1) เปลี่ยนชื่อกลุ่ม "เลเยอร์ฟอยล์ (ด้านหน้า/ด้านหลัง)" → "เคลือบฟอยล์ (ด้านหน้า/ด้านหลัง)"
//    — แทนทั้งก้อน data (label · showWhen · imageWhen · driverLabels ทั้ง pricing ตัวจริงและเงา priceRates[0] · FAQ)
// 2) เพิ่มกลุ่ม "เคลือบ (ด้านหลัง)" — เลือกได้เมื่อด้านหลังไม่ปั๊มฟอยล์ (พิมพ์ 1 ด้าน หรือปิดสวิตช์ฟอยล์หลัง)
//    ไม่เคลือบ 0 · เคลือบเงา/ด้าน +10 · เคลือบพิเศษ +30 (ต่อแผ่น A3 = ต่อหน่วยของสินค้านี้)
// รันซ้ำได้ · สำรองก่อนเขียน · อ่านกลับเทียบค่าจริง
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const die = (m) => { console.error("✗", m); process.exit(1); };

const ID = "paper-foil";
const CDN = "https://upvigfvxloelzevwneof.supabase.co/storage/v1/object/public/product-images/products/";
const COAT_LABEL = "เคลือบ (ด้านหลัง)";

const { data: row, error: e0 } = await sb.from("products").select("id,name,category,price,data").eq("id",ID).single();
if (e0) die(e0.message);
writeFileSync(`.backup-paperfoil-coatrename-${new Date().toISOString().replace(/[:.]/g,"-")}.json`, JSON.stringify(row,null,2));

// ① เปลี่ยนชื่อกลุ่มทั้งก้อน data — สตริงนี้เจาะจงพอ ไม่ชนข้อความอื่น
let d = JSON.parse(
  JSON.stringify(row.data)
    .replaceAll("เลเยอร์ฟอยล์ (ด้านหน้า)", "เคลือบฟอยล์ (ด้านหน้า)")
    .replaceAll("เลเยอร์ฟอยล์ (ด้านหลัง)", "เคลือบฟอยล์ (ด้านหลัง)")
);

// ② กลุ่มเคลือบด้านหลัง — วางต่อท้าย "สีฟอยล์ (ด้านหลัง)"
const coatGroup = {
  label: COAT_LABEL,
  note: "เลือกได้เมื่อด้านหลังไม่ปั๊มฟอยล์ · ค่าเคลือบคิดต่อแผ่น A3 — เคลือบเงา/ด้าน +10 บาท · เคลือบพิเศษ +30 บาท",
  choices: [
    { name: "ไม่เคลือบ", desc: "ด้านหลังเปลือย ไม่เคลือบฟิล์ม", imageSrc: CDN + "coating-b/none-v1.jpg" },
    { name: "เคลือบเงา", extra: 10, desc: "ฟิล์มใสผิวมัน สะท้อนแสง สีสดจัดขึ้น · กันรอย กันชื้น", imageSrc: CDN + "poster-a3/coat-gloss-v1.jpg" },
    { name: "เคลือบด้าน", extra: 10, desc: "ฟิล์มใสผิวด้าน ไม่สะท้อนแสง ลายนิ้วมือไม่ติด · กันรอย กันชื้น", imageSrc: CDN + "poster-a3/coat-matte-v1.jpg" },
    { name: "เคลือบพิเศษ", extra: 30, desc: "ฟิล์มลายพิเศษ กลิตเตอร์ / ทราย / โฮโลแกรม", imageSrc: CDN + "coating-b/glitter-v1.jpg" },
  ],
  display: "cards",
  section: "3. จำนวนด้าน + ฟอยล์",
  // "หรือ": พิมพ์ 1 ด้าน (สวิตช์ฟอยล์หลังไม่โผล่เลย) หรือพิมพ์ 2 ด้านแต่ไม่ปั๊มฟอยล์หลัง
  showWhenAny: [
    { label: "จำนวนด้านที่พิมพ์", choices: ["พิมพ์ 1 ด้าน"] },
    { label: "เคลือบฟอยล์ (ด้านหลัง)", choices: ["ไม่ปั๊มฟอยล์ด้านหลัง"] },
  ],
  collapsible: true,
};
const iColor = d.options.findIndex((o) => o.label === "สีฟอยล์ (ด้านหลัง)");
if (iColor < 0) die("หากลุ่ม สีฟอยล์ (ด้านหลัง) ไม่เจอ");
const iCoat = d.options.findIndex((o) => o.label === COAT_LABEL);
if (iCoat < 0) d.options.splice(iColor + 1, 0, coatGroup);
else d.options[iCoat] = coatGroup; // รันซ้ำ = เขียนทับด้วยเวอร์ชันล่าสุด

// ③ แท็บข้อควรทราบ + FAQ
d.tabs = (d.tabs ?? []).map((t) => t.title !== "ข้อควรทราบ" ? t : {
  ...t,
  text: t.text.split("\n").filter((l) => !/^• เคลือบด้านหลัง/.test(l))
    .concat("• เคลือบด้านหลัง (เฉพาะงานที่ไม่ปั๊มฟอยล์ด้านหลัง): เคลือบเงา/เคลือบด้าน บวกแผ่นละ 10 บาท · เคลือบพิเศษ บวกแผ่นละ 30 บาท").join("\n"),
});
const FAQ_Q = "ด้านหลังเคลือบเงา/ด้านได้ไหม?";
d.seo ??= {}; d.seo.faqs ??= [];
d.seo.faqs = d.seo.faqs.filter((f) => f.q !== FAQ_Q);
d.seo.faqs.push({
  q: FAQ_Q,
  a: "ได้ครับ · ถ้าด้านหลังไม่ได้ปั๊มฟอยล์ เลือกเคลือบด้านหลังได้ — เคลือบเงา/เคลือบด้าน บวกแผ่นละ 10 บาท · เคลือบพิเศษ (กลิตเตอร์/ทราย/โฮโลแกรม) บวกแผ่นละ 30 บาท · ส่วนด้านที่ปั๊มฟอยล์มีเคลือบด้านให้ในตัวอยู่แล้ว ไม่ต้องเลือกเพิ่ม",
});

d.savedAt = new Date().toISOString();

const { data: upd, error: e1 } = await sb.from("products")
  .update({ data: d, name: row.name, category: row.category, price: row.price })
  .eq("id", ID).select("data");
if (e1) die(e1.message);
if (!upd?.length) die("update โดน 0 แถว");

// อ่านกลับเทียบค่าจริง
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const bd = back.data, bs = JSON.stringify(bd);
if (bs.includes("เลเยอร์ฟอยล์")) die("ยังมีคำว่า เลเยอร์ฟอยล์ ค้างอยู่");
for (const l of ["เคลือบฟอยล์ (ด้านหน้า)", "เคลือบฟอยล์ (ด้านหลัง)", COAT_LABEL])
  if (!bd.options.some((o) => o.label === l)) die(`ไม่พบกลุ่ม ${l}`);
for (const p of [bd.pricing, bd.priceRates?.[0]?.pricing, bd.priceRates?.[1]?.pricing])
  if (!p?.driverLabels?.includes("เคลือบฟอยล์ (ด้านหน้า)")) die("driverLabels ไม่ถูกเปลี่ยน (pricing/priceRates)");
const g = bd.options.find((o) => o.label === COAT_LABEL);
const fees = Object.fromEntries(g.choices.map((c) => [c.name, c.extra ?? 0]));
if (fees["ไม่เคลือบ"] !== 0 || fees["เคลือบเงา"] !== 10 || fees["เคลือบด้าน"] !== 10 || fees["เคลือบพิเศษ"] !== 30) die("ค่าเคลือบไม่ตรง: " + JSON.stringify(fees));
if (!g.choices.every((c) => typeof c.imageSrc === "string" && c.imageSrc.startsWith("https://"))) die("ภาพตัวเลือกเคลือบไม่ครบ");
if (g.showWhenAny?.length !== 2) die("showWhenAny ไม่ครบ 2 เงื่อนไข");
const colorBack = bd.options.find((o) => o.label === "สีฟอยล์ (ด้านหลัง)");
if (colorBack.showWhen?.label !== "เคลือบฟอยล์ (ด้านหลัง)") die("showWhen สีฟอยล์หลังยังชี้ชื่อเก่า");
if (typeof bd.savedAt !== "string" || bd.savedAt !== d.savedAt) die("savedAt ไม่ตรง");

console.log("✓ เปลี่ยนชื่อกลุ่ม + เพิ่มกลุ่มเคลือบด้านหลังแล้ว");
console.log("  กลุ่มทั้งหมด:", bd.options.map((o) => o.label).join(" · "));
console.log("  ค่าเคลือบ:", g.choices.map((c) => `${c.name} +฿${c.extra ?? 0}`).join(" · "));
