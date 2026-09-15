/**
 * ตรวจ "กำหนดขนาดเอง" ของกริ๊บต๊อกอะคริลิค (id "1-4") ด้วยฟังก์ชันจริงที่หน้าเว็บใช้ + ข้อมูลสดจาก DB
 * (อ่านอย่างเดียว)  npx tsx scripts/griptok-acrylic-custom-size-check.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { resolveSelections, allowedChoices, optionVisible, unitPriceFor, needsQuote, sizeInputPlan, sizeInputText, inputError, type Product } from "../src/lib/products";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: row, error } = await sb.from("products").select("data").eq("id", "1-4").single();
if (error) throw error;
const p = row.data as Product;

const SIZE = "ขนาด";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุด้านที่ยาวที่สุด)";
const W = "ขนาดกำหนดเอง (ด้านที่ยาวที่สุด)";
let fail = 0;
const ok = (name: string, pass: boolean, extra = "") => { if (!pass) fail++; console.log(pass ? "✅" : "❌", name, extra); };
const group = (l: string) => p.options.find((o) => o.label === l)!;

ok("กลุ่มขนาดมี 7 ตัวเลือก (6 ไซซ์ + กำหนดเอง)", group(SIZE).choices.length === 7 && group(SIZE).choices.at(-1)!.name === CUSTOM);
ok("ช่องกรอกอยู่ชุดเดียวกับกลุ่มขนาด", group(W).section === group(SIZE).section);
ok("กรอกด้านเดียว — ไม่มีช่องคู่ ก./ส. และ sizeInput ชี้ช่องเดียว",
  group(SIZE).sizeInput?.heightLabel === group(SIZE).sizeInput?.widthLabel &&
  !p.options.some((o) => /ขนาดกำหนดเอง \((กว้าง|สูง)\)/.test(o.label)));
ok("ช่องกรอกไม่ได้บล็อกทศนิยม (ไม่มีธง integer)", group(W).input?.integer !== true);
ok("4.5 ผ่านตัวตรวจช่องกรอก", !inputError(group(W), "4.5"), String(inputError(group(W), "4.5") ?? ""));

const base = resolveSelections(p, {});
ok("ยังไม่เลือก custom → ช่องกรอกซ่อน", !optionVisible(group(W), base));
ok("custom อยู่ใน allowedChoices", allowedChoices(p, base, SIZE).includes(CUSTOM));

const price = (sel: Record<string, string>, qty = 1) => unitPriceFor(p, sel, qty);
const std = (cm: string, qty = 1) => price(resolveSelections(p, { [SIZE]: cm }), qty);
console.log("ราคามาตรฐาน 1 ชิ้น:", ["5cm", "6cm", "7cm", "10cm"].map((c) => `${c}=฿${std(c)}`).join(" · "));

const cus = (w: string) => resolveSelections(p, { [SIZE]: CUSTOM, [W]: w });
const c65 = cus("6.5");
ok("เลือก custom → ช่องกรอกโผล่", optionVisible(group(W), c65));
const plan65 = sizeInputPlan(p, c65, SIZE)!;
ok("6.5 → เกาะแถว 6cm (ผ่อนเศษ 0.5)", plan65.choice === "6cm" && plan65.filled && !plan65.quote, JSON.stringify(plan65));
ok("ข้อความสรุปเป็น “ยาวสุด” ไม่ใช่ 6.5×0", sizeInputText(plan65) === "ยาวสุด 6.5 ซม.", sizeInputText(plan65));
ok("ราคา 6.5 = ราคา 6cm", price(c65) === std("6cm"), `฿${price(c65)} vs ฿${std("6cm")}`);
ok("6.6 → ขยับเป็นแถว 7cm", sizeInputPlan(p, cus("6.6"), SIZE)!.choice === "7cm" && price(cus("6.6")) === std("7cm"));
ok("3 (เล็กกว่าตาราง) → คิดเท่าแถว 5cm", sizeInputPlan(p, cus("3"), SIZE)!.choice === "5cm" && price(cus("3")) === std("5cm"));
ok("10 → แถว 10cm", sizeInputPlan(p, cus("10"), SIZE)!.choice === "10cm" && price(cus("10")) === std("10cm"));
ok("10.5 ยังอยู่แถว 10cm (ผ่อนเศษ)", sizeInputPlan(p, cus("10.5"), SIZE)!.choice === "10cm");
const over = cus("12");
ok("12 → รอแอดมินตีราคา", needsQuote(p, over) && sizeInputPlan(p, over, SIZE)!.quote && price(over) === 0, `฿${price(over)}`);
ok("ยังไม่กรอก → เกาะแถวเล็กสุด ไม่หล่นไปราคาตั้งต้น", (() => { const s = resolveSelections(p, { [SIZE]: CUSTOM }); const pl = sizeInputPlan(p, s, SIZE)!; return !pl.filled && pl.choice === "5cm" && price(s) === std("5cm"); })());
ok("ราคาขั้นบันไดยังคิดถูก (100 ชิ้น 6.5cm = 100 ชิ้น 6cm)", price(c65, 100) === std("6cm", 100), `฿${price(c65, 100)}`);
ok("สกรีน 3 เลเยอร์ + กำหนดขนาดเอง ยังคิดตามแถว", (() => { const s = resolveSelections(p, { [SIZE]: CUSTOM, "งานสกรีน": "สกรีน 3 เลเยอร์", [W]: "7.4" }); return price(s) === price(resolveSelections(p, { [SIZE]: "7cm", "งานสกรีน": "สกรีน 3 เลเยอร์" })); })());

console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : "\n✅ ผ่านครบทุกข้อ");
process.exit(fail ? 1 : 0);
