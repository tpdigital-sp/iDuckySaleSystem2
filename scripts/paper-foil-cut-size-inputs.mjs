// Paper Foil: เพิ่มช่องกรอกขนาด + จำนวนชิ้นต่อแผ่น A3 ให้ "ตัดตามขนาด" และ "ไดคัทตามทรง"
// ใช้ตรรกะเดียวกับสินค้างานกระดาษ (texture-paper / paper-art-pet / sticker-pp):
//   ตัดตามขนาด  → เลือก A4-A7 (บอกได้กี่ชิ้น/แผ่น) หรือกำหนดขนาดเอง → sheetYield บน A3 เต็ม 42×29.7 gap 0
//   ไดคัทตามทรง → กรอก ก.×ส. เสมอ → sheetYield บนพื้นที่ไดคัท 43.76×28.89 gap 0.5
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const ID = "paper-foil";
const { data: row, error } = await sb.from("products").select("id,name,category,price,data").eq("id",ID).single();
if (error) throw error;
const d = structuredClone(row.data);
writeFileSync(`.backup-paperfoil-cutsize-${new Date().toISOString().replace(/[:.]/g,"-")}.json`, JSON.stringify(row,null,2));

const CUT = "การตัด", BY_SIZE = "ตัดตามขนาด", BY_SHAPE = "ไดคัทตามทรง";
if (!d.options.find(o => o.label === CUT)?.choices.some(c => c.name === BY_SHAPE)) throw new Error("ไม่เจอตัวเลือกการตัดที่ต้องใช้");

const sizePick = {
  label: "ตัดเป็นขนาด",
  showWhen: { label: CUT, choices: [BY_SIZE] },
  choices: [
    { name: "A4 (21 × 29.7 ซม.)", badge: "ได้ 2 ชิ้น / แผ่น A3", piecesPerUnit: 2 },
    { name: "A5 (14.8 × 21 ซม.)", badge: "ได้ 4 ชิ้น / แผ่น A3", piecesPerUnit: 4 },
    { name: "A6 (10.5 × 14.8 ซม.)", badge: "ได้ 8 ชิ้น / แผ่น A3", piecesPerUnit: 8 },
    { name: "A7 (7.4 × 10.5 ซม.)", badge: "ได้ 16 ชิ้น / แผ่น A3", piecesPerUnit: 16 },
    { name: "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)" },
  ],
};
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const numInput = (max, hint) => ({ kind: "number", unit: "ซม.", min: 3, max, placeholder: "เช่น 5", ...(hint ? { hint } : {}) });

const cutW = {
  label: "ขนาดตัด (กว้าง)", choices: [], display: "input", standardInput: true,
  input: numInput(29.7, "ขนาดชิ้นงานหลังตัด ใหญ่สุดเท่าแผ่น A3 (29.7 × 42 ซม.) — งานแนวนอนกรอกด้านยาวลงช่อง “สูง” ได้"),
  showWhen: { label: sizePick.label, choices: [CUSTOM] },
  showWhenAlso: { label: CUT, choices: [BY_SIZE] },
};
const cutH = {
  label: "ขนาดตัด (สูง)", choices: [], display: "input", standardInput: true,
  input: numInput(42),
  showWhen: { label: sizePick.label, choices: [CUSTOM] },
  showWhenAlso: { label: CUT, choices: [BY_SIZE] },
  sheetYield: { gap: 0, sheetW: 42, sheetH: 29.7, pairLabel: "ขนาดตัด (กว้าง)", sheetName: "แผ่น A3" },
};
const dieW = {
  label: "ขนาดไดคัท (กว้าง)", choices: [], display: "input", standardInput: true,
  input: numInput(29.7, "ขนาดชิ้นงานหลังไดคัท วัดด้านที่กว้างที่สุด — ใหญ่สุดเท่าแผ่น A3 (29.7 × 42 ซม.)"),
  showWhen: { label: CUT, choices: [BY_SHAPE] },
};
const dieH = {
  label: "ขนาดไดคัท (สูง)", choices: [], display: "input", standardInput: true,
  input: numInput(42),
  showWhen: { label: CUT, choices: [BY_SHAPE] },
  sheetYield: { gap: 0.5, sheetW: 43.76, sheetH: 28.89, pairLabel: "ขนาดไดคัท (กว้าง)", sheetName: "แผ่น A3" },
};

const add = [sizePick, cutW, cutH, dieW, dieH];
const byLabel = new Map(d.options.map(o => [o.label, o]));
for (const g of add) byLabel.set(g.label, g);                       // รันซ้ำได้ = เขียนทับของเดิม
const rest = [...byLabel.values()].filter(o => !add.some(g => g.label === o.label));
const at = rest.findIndex(o => o.label === CUT);
d.options = [...rest.slice(0, at + 1), ...add, ...rest.slice(at + 1)];

const { error: e2 } = await sb.from("products").update({ data: d, name: row.name, category: row.category, price: row.price }).eq("id", ID);
if (e2) throw e2;
for (const [i,o] of d.options.entries())
  console.log(`[${i}] ${o.label}${o.display==="input"?" ✍️":""}${o.sheetYield?` · sheetYield ${o.sheetYield.sheetW}×${o.sheetYield.sheetH} gap ${o.sheetYield.gap}`:""}${o.showWhen?` · เมื่อ ${o.showWhen.label}=${o.showWhen.choices.join("/")}`:""}`);
