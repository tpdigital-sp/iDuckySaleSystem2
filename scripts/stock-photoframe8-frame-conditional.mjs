// ครั้งเดียว: photoframe-8 ย้ายกรอบรูป A5 จาก "ตัวเลือก = กรอบรูป + แผ่นจิ๊กซอว์" (stockItemId) ไปเป็นของมีเงื่อนไขบน "ขนาด = A5"
// (stockLinks when ตัวเลือก = กรอบรูป + แผ่นจิ๊กซอว์) — ผลตัดเท่าเดิม (กฎสินค้าบังคับกรอบ = A5 เท่านั้น) แต่หน้าคลังเขียนกำกับ
// "ตัดพร้อมกับ แผ่นจิ๊กซอว์ A5" ได้ แบบเดียวกับงาน UV · [--apply]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const FRAME = "กรอบรูป + แผ่นจิ๊กซอว์";
const { data: row } = await sb.from("products").select("id,data").eq("id","photoframe-8").maybeSingle();
const p = row.data;
const ki = p.options.findIndex(o => o.label === "ตัวเลือก"), si = p.options.findIndex(o => o.label === "ขนาด");
const kc = p.options[ki]?.choices.find(c => c.name === FRAME), a5 = p.options[si]?.choices.find(c => c.name === "A5");
const rule = (p.rules ?? []).some(r => r.when?.label === "ตัวเลือก" && (r.when.choices ?? [r.when.choice]).includes(FRAME) && r.limit?.label === "ขนาด" && JSON.stringify(r.limit.allow) === '["A5"]');
console.log({ frameSku: kc?.stockItemId, a5Sheet: a5?.stockItemId, a5Links: a5?.stockLinks ?? null, ruleFrameOnlyA5: rule });
if (!kc?.stockItemId || !a5?.stockItemId || a5.stockLinks?.length || !rule) { console.log("⛔ สภาพไม่ตรงที่คาด — หยุด"); process.exit(1); }
const frameId = kc.stockItemId;
const next = { ...p, options: p.options.map((o, i) =>
  i === ki ? { ...o, choices: o.choices.map(c => c.name === FRAME ? Object.fromEntries(Object.entries(c).filter(([k]) => k !== "stockItemId" && k !== "stockQtyPer")) : c) }
  : i === si ? { ...o, choices: o.choices.map(c => c.name === "A5" ? { ...c, stockLinks: [{ stockItemId: frameId, when: [{ label: "ตัวเลือก", choices: [FRAME] }] }] } : c) }
  : o) };
console.log("หลังแก้: ขนาด A5 → แผ่น A5 เสมอ + กรอบรูป A5 เมื่อ ตัวเลือก =", FRAME, "· ตัวเลือก", FRAME, "→ ไม่ผูกเอง");
if (!APPLY) { console.log("(ดูอย่างเดียว — --apply)"); process.exit(0); }
mkdirSync(".cache/stock-fix", { recursive: true });
writeFileSync(".cache/stock-fix/photoframe-8.before-frame-cond-260919.json", JSON.stringify(row, null, 2));
const { error } = await sb.from("products").update({ data: next }).eq("id", "photoframe-8");
console.log(error ? "⛔ " + error.message : "✅ เขียนแล้ว · สำรองไว้ .cache/stock-fix/photoframe-8.before-frame-cond-260919.json");
process.exit(0);
