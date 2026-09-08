/**
 * ตรวจ "กำหนดขนาดเอง" ของเข็มกลัดอะคริลิค (id "1") ด้วยฟังก์ชันจริงที่หน้าเว็บใช้ + ข้อมูลสดจาก DB
 * (อ่านอย่างเดียว)  npx tsx scripts/brooch-acrylic-custom-size-check.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { resolveSelections, allowedChoices, optionVisible, unitPriceFor, needsQuote, sizeInputPlan, type Product } from "../src/lib/products";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: row, error } = await sb.from("products").select("data").eq("id", "1").single();
if (error) throw error;
const p = row.data as Product;

const SIZE = "ขนาดด้านที่ยาวที่สุด";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const W = "ขนาดกำหนดเอง (กว้าง)";
const H = "ขนาดกำหนดเอง (สูง)";
let fail = 0;
const ok = (name: string, pass: boolean, extra = "") => { if (!pass) fail++; console.log(pass ? "✅" : "❌", name, extra); };
const group = (l: string) => p.options.find((o) => o.label === l)!;

ok("product.custom ถูกลบ", !p.custom);
ok("กลุ่มขนาดมี 10 ตัวเลือก (9 ไซซ์ + กำหนดเอง)", group(SIZE).choices.length === 10 && group(SIZE).choices.at(-1)!.name === CUSTOM);
ok("ช่องกรอกอยู่ชุด 1. ขนาด", group(W).section === "1. ขนาด" && group(H).section === "1. ขนาด");

const base = resolveSelections(p, {});
ok("ค่าเริ่มต้นยัง 2cm", base[SIZE] === "2cm");
ok("ยังไม่เลือก custom → ช่องกรอกซ่อน", !optionVisible(group(W), base) && !optionVisible(group(H), base));
ok("custom อยู่ใน allowedChoices", allowedChoices(p, base, SIZE).includes(CUSTOM));

const price = (sel: Record<string, string>, qty = 1) => unitPriceFor(p, sel, qty);
const std = (cm: string, qty = 1) => price(resolveSelections(p, { [SIZE]: cm }), qty);
console.log("ราคามาตรฐาน 1 ชิ้น:", ["2cm", "3cm", "4cm", "10cm"].map((c) => `${c}=฿${std(c)}`).join(" · "));

const cus = (w: string, h: string, qty = 1) => resolveSelections(p, { [SIZE]: CUSTOM, [W]: w, [H]: h });
const c35 = cus("3.5", "2.8");
ok("เลือก custom → ช่องกรอกโผล่", optionVisible(group(W), c35) && optionVisible(group(H), c35));
const plan35 = sizeInputPlan(p, c35, SIZE)!;
ok("3.5×2.8 → เกาะแถว 3cm (ผ่อนเศษ 0.5)", plan35.choice === "3cm" && plan35.filled && !plan35.quote, JSON.stringify(plan35));
ok("ราคา 3.5×2.8 = ราคา 3cm", price(c35) === std("3cm"), `฿${price(c35)}`);
const c36 = cus("2", "3.6");
ok("2×3.6 → แถว 4cm", sizeInputPlan(p, c36, SIZE)!.choice === "4cm" && price(c36) === std("4cm"), `฿${price(c36)}`);
const c105 = cus("10.5", "4");
ok("10.5×4 → ยังแถว 10cm ไม่ตกตีราคา", sizeInputPlan(p, c105, SIZE)!.choice === "10cm" && !needsQuote(p, c105), `฿${price(c105)}`);
const c11 = cus("4", "11");
ok("4×11 → รอแอดมินตีราคา (ราคา 0)", needsQuote(p, c11) && price(c11) === 0, `฿${price(c11)}`);
const c1 = cus("1.2", "1");
ok("1.2×1 → แถวเล็กสุด 2cm", sizeInputPlan(p, c1, SIZE)!.choice === "2cm" && price(c1) === std("2cm"));
const empty = cus("", "");
ok("ยังไม่กรอก → เกาะแถวเล็กสุดไว้ก่อน ไม่ quote", !sizeInputPlan(p, empty, SIZE)!.filled && price(empty) === std("2cm") && !needsQuote(p, empty));
const spec = resolveSelections(p, { ...c35, ชนิดอะคริลิค: "อะคริลิคพิเศษ" });
const spec3 = resolveSelections(p, { [SIZE]: "3cm", ชนิดอะคริลิค: "อะคริลิคพิเศษ" });
ok("custom + อะคริลิคพิเศษ = ราคา 3cm พิเศษ", price(spec) === price(spec3), `฿${price(spec)} vs ฿${price(spec3)}`);
ok("เรทขั้นบันได 500 ชิ้น custom 3.5 = 3cm", price(c35, 500) === std("3cm", 500), `฿${price(c35, 500)}`);

console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : "\n🎉 ผ่านทุกข้อ");
process.exit(fail ? 1 : 0);
