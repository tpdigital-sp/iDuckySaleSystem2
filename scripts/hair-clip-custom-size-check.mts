/**
 * ตรวจตัวเลือกใหม่ของกิ๊บติดผมอะคริลิค (id "otheracrylicproducts5-1") ด้วยฟังก์ชันจริงที่หน้าเว็บใช้
 * + ข้อมูลสดจาก DB (อ่านอย่างเดียว)   npx tsx scripts/hair-clip-custom-size-check.mts
 *
 * กติกาที่ต้องจริง (ดู scripts/hair-clip-custom-size.mjs):
 *   ≤ 6 ซม. = ราคาปกติ · 7-11 ซม. = +฿10 ต่อ ซม. ที่เกิน 6 · เกิน 11 ซม. = รอแอดมินตีราคา
 *   "ตามไฟล์" = ราคาปกติ ไม่ต้องกรอกอะไร · "ด้านอื่นๆ" ในกลุ่มติดกิ๊บ ไม่กระทบราคา
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  resolveSelections, allowedChoices, optionVisible, unitPriceFor, needsQuote,
  sizeInputPlan, sizeInputText, inputError, type Product,
} from "../src/lib/products";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: row, error } = await sb.from("products").select("data").eq("id", "otheracrylicproducts5-1").single();
if (error) throw error;
const p = row.data as Product;

const SIZE = "ขนาด";
const SIDE = "ติดกิ๊บ";
const STEP = "เพิ่มขนาด";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุด้านที่ยาวที่สุด)";
const BY_FILE = "📄 ขนาดอื่น / ตามไฟล์ (กราฟฟิกวัดให้ตอนทำแบบ)";
const OTHER_SIDE = "ด้านอื่นๆ (แนบภาพประกอบ)";
const W = "ขนาดกำหนดเอง (ด้านที่ยาวที่สุด)";

let fail = 0;
const ok = (name: string, pass: boolean, extra = "") => { if (!pass) fail++; console.log(pass ? "✅" : "❌", name, extra); };
const group = (l: string) => p.options.find((o) => o.label === l)!;
const price = (sel: Record<string, string>, qty = 1) => unitPriceFor(p, sel, qty);
const std = (cm: string, qty = 1) => price(resolveSelections(p, { [SIZE]: cm }), qty);
const cus = (w?: string) => resolveSelections(p, { [SIZE]: CUSTOM, ...(w ? { [W]: w } : {}) });

// ── โครงตัวเลือก ────────────────────────────────────────────────────
ok("กลุ่มขนาด = 5 ไซซ์ + กำหนดเอง + ตามไฟล์", group(SIZE).choices.map((c) => c.name).join("|") === `2 cm|3 cm|4 cm|5 cm|6 cm|${CUSTOM}|${BY_FILE}`);
ok("กลุ่มติดกิ๊บมี ด้านอื่นๆ ต่อท้าย ซ้าย/ขวา", group(SIDE).choices.map((c) => c.name).join("|") === `ด้านซ้าย|ด้านขวา|${OTHER_SIDE}`);
ok("ช่องกรอกอยู่ชุดเดียวกับกลุ่มขนาด", group(W).section === group(SIZE).section, `${group(W).section} / ${group(SIZE).section}`);
ok("กรอกด้านเดียว (sizeInput ชี้ช่องเดียวกัน)", group(SIZE).sizeInput?.heightLabel === group(SIZE).sizeInput?.widthLabel);
ok("ช่องกรอกไม่บล็อกทศนิยม + 7.5 ผ่านตัวตรวจ", group(W).input?.integer !== true && !inputError(group(W), "7.5"), String(inputError(group(W), "7.5") ?? ""));
ok("ตัวเลือกใหม่ทั้ง 3 อยู่ใน allowedChoices", (() => {
  const b = resolveSelections(p, {});
  return [CUSTOM, BY_FILE].every((n) => allowedChoices(p, b, SIZE).includes(n)) && allowedChoices(p, b, SIDE).includes(OTHER_SIDE);
})());

// ── ช่องกรอกโผล่/ซ่อน ───────────────────────────────────────────────
ok("ยังไม่เลือกกำหนดเอง → ช่องกรอกซ่อน", !optionVisible(group(W), resolveSelections(p, {})));
ok("เลือกตามไฟล์ → ช่องกรอกยังซ่อน (ไม่บังคับกรอก)", !optionVisible(group(W), resolveSelections(p, { [SIZE]: BY_FILE })));
ok("เลือกกำหนดเอง → ช่องกรอกโผล่", optionVisible(group(W), cus("7")));

// ── ราคา ────────────────────────────────────────────────────────────
const BASE = std("3 cm");
console.log("ราคาแถวมาตรฐาน 1 ชิ้น:", ["2 cm", "4 cm", "6 cm"].map((c) => `${c}=฿${std(c)}`).join(" · "));
ok("ทุกไซซ์มาตรฐานราคาเท่ากัน (ขนาดไม่ใช่แกนราคา)", ["2 cm", "4 cm", "5 cm", "6 cm"].every((c) => std(c) === BASE), `฿${BASE}`);
ok("ตามไฟล์ = ราคาปกติ ไม่ต้องรอตีราคา", price(resolveSelections(p, { [SIZE]: BY_FILE })) === BASE && !needsQuote(p, resolveSelections(p, { [SIZE]: BY_FILE })));
ok("ด้านอื่นๆ (ติดกิ๊บ) ไม่กระทบราคา", price(resolveSelections(p, { [SIDE]: OTHER_SIDE })) === price(resolveSelections(p, { [SIDE]: "ด้านซ้าย" })));

const p35 = sizeInputPlan(p, cus("3.5"), SIZE)!;
ok("3.5 → เกาะแถว 3 cm (ผ่อนเศษ 0.5)", p35.choice === "3 cm" && p35.filled && !p35.quote, JSON.stringify(p35));
ok("ข้อความสรุปเป็น “ยาวสุด” ไม่ใช่ 3.5×0", sizeInputText(p35) === "ยาวสุด 3.5 ซม.", sizeInputText(p35));
ok("3.6 → ขยับเป็นแถว 4 cm", sizeInputPlan(p, cus("3.6"), SIZE)!.choice === "4 cm");
ok("1.5 (เล็กกว่าตาราง) → คิดเท่าแถว 2 cm ราคาปกติ", sizeInputPlan(p, cus("1.5"), SIZE)!.choice === "2 cm" && price(cus("1.5")) === BASE);
ok("6 = ราคาปกติ ไม่มีส่วนเกิน", (() => { const pl = sizeInputPlan(p, cus("6"), SIZE)!; return pl.overCm === 0 && price(cus("6")) === BASE; })(), `฿${price(cus("6"))}`);
ok("6.5 ยังอยู่แถว 6 cm ราคาปกติ (ผ่อนเศษ)", sizeInputPlan(p, cus("6.5"), SIZE)!.overCm === 0 && price(cus("6.5")) === BASE);
ok("7 → +฿10 (เกิน 1 ซม.)", (() => { const pl = sizeInputPlan(p, cus("7"), SIZE)!; return pl.overCm === 1 && pl.overFee === 10 && price(cus("7")) === BASE + 10; })(), `฿${price(cus("7"))}`);
ok("9 → +฿30", price(cus("9")) === BASE + 30, `฿${price(cus("9"))}`);
ok("11 (เพดาน) → +฿50 คิดเองได้ ไม่ต้องตีราคา", price(cus("11")) === BASE + 50 && !needsQuote(p, cus("11")), `฿${price(cus("11"))}`);
ok("11.5 ยังอยู่เพดาน 11 (ผ่อนเศษ)", price(cus("11.5")) === BASE + 50, `฿${price(cus("11.5"))}`);
ok("12 → รอแอดมินตีราคา ราคาเป็น 0", (() => { const s = cus("12"); return needsQuote(p, s) && sizeInputPlan(p, s, SIZE)!.quote && price(s) === 0; })(), `฿${price(cus("12"))}`);
ok("ยังไม่กรอก → เกาะแถวเล็กสุด ไม่หล่นไปราคาตั้งต้น", (() => { const pl = sizeInputPlan(p, cus(), SIZE)!; return !pl.filled && pl.choice === "2 cm" && price(cus()) === BASE; })());

// ── ราคาขั้นบันได + ไม่คิดค่าเพิ่มขนาดซ้ำ ───────────────────────────
ok("50 ชิ้น: กำหนดเอง 8 ซม. = ราคาขั้น 50 + ฿20", price(cus("8"), 50) === std("4 cm", 50) + 20, `฿${price(cus("8"), 50)} vs ฿${std("4 cm", 50)}`);
ok("เลือกกำหนดเองแล้ว กลุ่ม “เพิ่มขนาด” ไม่โผล่ (ไม่คิดซ้ำ)", !optionVisible(group(STEP), cus("8")));
ok("ทางเดิม 6 cm + เพิ่มขนาด 2 ซม. = ราคาเท่ากำหนดเอง 8 ซม.",
  price(resolveSelections(p, { [SIZE]: "6 cm", [STEP]: "เซนละ ×2" })) === price(cus("8")),
  `฿${price(resolveSelections(p, { [SIZE]: "6 cm", [STEP]: "เซนละ ×2" }))} vs ฿${price(cus("8"))}`);

console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : "\n✅ ผ่านครบทุกข้อ");
process.exit(fail ? 1 : 0);
