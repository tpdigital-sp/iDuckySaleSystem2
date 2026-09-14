/**
 * ตรวจ "ตัวน้อยเขย่ากำหนดขนาดเอง" ของพวงกุญแจเขย่า (new-mt2rp5i3-9488)
 * ด้วยฟังก์ชันจริงที่หน้าเว็บ/ตะกร้าใช้ + ข้อมูลสดจาก DB (อ่านอย่างเดียว)
 *
 *   npx tsx scripts/shake-shake-charm-custom-size-check.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  resolveSelections, optionVisible, unitPriceFor, needsQuote, inputError,
  choiceBadgeOf, formatMultiPick, type Product,
} from "../src/lib/products";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
/** --file <ไฟล์> = ตรวจจากไฟล์ที่สคริปต์ตั้งค่าเขียนไว้ (ทดสอบก่อนขึ้นฐานข้อมูลจริง) */
const FILE = (process.argv.find((a) => a.startsWith("--file=")) || "").slice(7);
let p: Product;
if (FILE) {
  p = JSON.parse(readFileSync(FILE, "utf8")) as Product;
} else {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: row, error } = await sb.from("products").select("data").eq("id", "new-mt2rp5i3-9488").single();
  if (error) throw error;
  p = row.data as Product;
}

const CHARM = "ตัวน้อยเขย่า";
const SPECIAL = "ตัวน้อยเขย่า ขนาดพิเศษ";
const CUSTOM = "📐 กำหนดขนาดเอง (เล็กสุด 1.2 ซม.)";
const STD = "ตัวน้อยเขย่า ขนาด 2-2.5 ซม.";
const FIELD = "ขนาดตัวน้อยเขย่า (กำหนดเอง)";

let fail = 0;
const ok = (name: string, pass: boolean, extra = "") => { if (!pass) fail++; console.log(pass ? "✅" : "❌", name, extra); };
const group = (l: string) => p.options.find((o) => o.label.trim() === l)!;

/** ราคาต่อ 1 ชุด ณ ตัวเลือกชุดนี้ */
const price = (sel: Record<string, string>, qty = 1) => unitPriceFor(p, sel, qty);
const plain = (qty = 1) => price(resolveSelections(p, {}), qty);                       // กรอบเปล่า ไม่ใส่ตัวน้อย
const stdSel = (n: number) => resolveSelections(p, { [CHARM]: formatMultiPick(STD, n) });
const cus = (cm: string, n = 1) =>
  resolveSelections(p, { [CHARM]: formatMultiPick(CUSTOM, n), [FIELD]: `${cm} ซม.` });
const ladder = (name: string, n = 1) => resolveSelections(p, { [SPECIAL]: formatMultiPick(name, n) });

// ── โครงตัวเลือก
ok("กลุ่มตัวน้อยมีแถวกำหนดขนาดเอง (ระบุจำนวนตัวได้)",
  !!group(CHARM).choices.find((c) => c.name === CUSTOM)?.qty);
ok("ช่องกรอกอยู่ชุดตัวเลือกเดียวกับกลุ่มตัวน้อย", group(FIELD).section === group(CHARM).section);
ok("ช่องกรอกไม่บล็อกทศนิยม", group(FIELD).input?.integer !== true);
ok("ยังไม่ติ๊กกำหนดขนาดเอง → ช่องกรอกซ่อน", !optionVisible(group(FIELD), resolveSelections(p, {})));
ok("ติ๊กแล้ว → ช่องกรอกโผล่", optionVisible(group(FIELD), cus("1.2")));
ok("1.2 ผ่านตัวตรวจช่องกรอก", !inputError(group(FIELD), "1.2"), String(inputError(group(FIELD), "1.2") ?? ""));
ok("0.8 ไม่ผ่าน (เล็กกว่า 1.2)", !!inputError(group(FIELD), "0.8"));
ok("21 ไม่ผ่าน (เกินเพดาน 20)", !!inputError(group(FIELD), "21"));
ok("ไม่กรอก = บล็อกก่อนสั่ง", !!inputError(group(FIELD), ""));
ok("ไม่ต้องรอแอดมินตีราคา", !needsQuote(p, cus("4")));

// ── ราคาปลีก (1 ชุด · ตัวน้อยตัวละ ฿20)
const base1 = plain(1);
console.log("กรอบเปล่า 1 ชุด = ฿" + base1 + " · 11 ชุด = ฿" + plain(11));
ok("มาตรฐาน 1 ตัว = +฿20", price(stdSel(1)) === base1 + 20, `฿${price(stdSel(1))}`);
ok("กำหนดเอง 1.2 ซม. = เท่าตัวน้อยมาตรฐาน", price(cus("1.2")) === price(stdSel(1)), `฿${price(cus("1.2"))}`);
ok("กำหนดเอง 2.5 ซม. = เท่าตัวน้อยมาตรฐาน", price(cus("2.5")) === price(stdSel(1)));
ok("กำหนดเอง 2.6 ซม. = +฿10 (เริ่มคิดเพิ่ม)", price(cus("2.6")) === base1 + 30, `฿${price(cus("2.6"))}`);
ok("กำหนดเอง 3 ซม. = เท่าบันได 3 ซม. (฿30)", price(cus("3")) === price(ladder("ตัวน้อย 3 ซม.")) && price(cus("3")) === base1 + 30, `฿${price(cus("3"))}`);
ok("กำหนดเอง 4 ซม. = เท่าบันได 4 ซม. (฿40)", price(cus("4")) === price(ladder("ตัวน้อย 4 ซม.")) && price(cus("4")) === base1 + 40);
ok("กำหนดเอง 4.5 ซม. = ฿40 (ยังไม่ขยับขั้น)", price(cus("4.5")) === base1 + 40, `฿${price(cus("4.5"))}`);
ok("กำหนดเอง 4.6 ซม. = ฿50 (ขึ้นขั้น)", price(cus("4.6")) === base1 + 50, `฿${price(cus("4.6"))}`);
ok("กำหนดเอง 6 ซม. = เท่าบันได 6 ซม. (฿60)", price(cus("6")) === price(ladder("ตัวน้อย 6 ซม.")) && price(cus("6")) === base1 + 60);
ok("กำหนดเอง 20 ซม. = ฿20 + 10×18 = ฿200", price(cus("20")) === base1 + 200, `฿${price(cus("20"))}`);

// ── เรทส่ง (11 ชุดขึ้นไป ตัวละ ฿15)
const base11 = plain(11);
ok("11 ชุด มาตรฐาน 1 ตัว = +฿15", price(stdSel(1), 11) === base11 + 15, `฿${price(stdSel(1), 11)}`);
ok("11 ชุด กำหนดเอง 1.2 ซม. = +฿15", price(cus("1.2"), 11) === base11 + 15, `฿${price(cus("1.2"), 11)}`);
ok("11 ชุด กำหนดเอง 4 ซม. = เท่าบันได 4 ซม. (฿35)", price(cus("4"), 11) === price(ladder("ตัวน้อย 4 ซม."), 11) && price(cus("4"), 11) === base11 + 35, `฿${price(cus("4"), 11)}`);
ok("100 ชุด กำหนดเอง 6 ซม. = เท่าบันได 6 ซม.", price(cus("6"), 100) === price(ladder("ตัวน้อย 6 ซม."), 100));

// ── จำนวนตัว + ผสมกับแถวมาตรฐาน
ok("กำหนดเอง 4 ซม. × 3 ตัว = ฿40 × 3", price(cus("4", 3)) === base1 + 120, `฿${price(cus("4", 3))}`);
ok("มาตรฐาน 2 ตัว + กำหนดเอง 5 ซม. 1 ตัว = 2×20 + 50",
  price(resolveSelections(p, { [CHARM]: `${formatMultiPick(STD, 2)} + ${formatMultiPick(CUSTOM, 1)}`, [FIELD]: "5 ซม." })) === base1 + 90,
  `฿${price(resolveSelections(p, { [CHARM]: `${formatMultiPick(STD, 2)} + ${formatMultiPick(CUSTOM, 1)}`, [FIELD]: "5 ซม." }))}`);
ok("ไม่ติ๊กตัวน้อยเลย = ราคากรอบเปล่า (ค่าค้างในช่องกรอกไม่ถูกคิด)",
  price(resolveSelections(p, { [FIELD]: "6 ซม." })) === base1, `฿${price(resolveSelections(p, { [FIELD]: "6 ซม." }))}`);
ok("ยังไม่กรอกขนาด = คิดเท่าตัวน้อยมาตรฐานไว้ก่อน (ไม่หล่นเป็น 0)",
  price(resolveSelections(p, { [CHARM]: CUSTOM })) === base1 + 20);

// ── ป้าย +฿ ข้างตัวเลือก ต้องตรงกับที่คิดเงินจริง
ok("ป้าย +฿ ของแถวกำหนดเอง (4 ซม. ปลีก) = ฿40",
  choiceBadgeOf(group(CHARM), cus("4"), CUSTOM, 1, p) === 40, String(choiceBadgeOf(group(CHARM), cus("4"), CUSTOM, 1, p)));
ok("ป้าย +฿ ของแถวกำหนดเอง (4 ซม. ส่ง 11 ชุด) = ฿35",
  choiceBadgeOf(group(CHARM), cus("4"), CUSTOM, 11, p) === 35, String(choiceBadgeOf(group(CHARM), cus("4"), CUSTOM, 11, p)));
ok("ป้าย +฿ ของแถวมาตรฐานไม่โดนค่าขนาดพ่วง",
  choiceBadgeOf(group(CHARM), cus("6"), STD, 1, p) === 20, String(choiceBadgeOf(group(CHARM), cus("6"), STD, 1, p)));

console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : "\n✅ ผ่านครบทุกข้อ");
process.exit(fail ? 1 : 0);
