/**
 * ตรวจเรท "พวงกุญแจประกบ 2 ชิ้น ใน 1 พวง" ด้วยฟังก์ชันจริงที่หน้าเว็บใช้ (อ่านอย่างเดียว)
 *   npx tsx scripts/prakob-rate-2pieces-check.mts                 # ข้อมูลสดจาก DB
 *   npx tsx scripts/prakob-rate-2pieces-check.mts --file=<json>   # ไฟล์จำลองจาก --out (ตรวจก่อนเขียนจริง)
 * เทียบกับใบเสนอราคาจริง 21 ก.ย. 69: 6 พวง · ชิ้นหลัก 4-4.5cm ฿210 + ติ่ง 1.54cm ฿59 = ฿269/พวง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  resolveSelections, optionVisible, unitPriceFor, unitPriceParts, needsQuote,
  sizeInputPlan, inputError, RATE_LABEL, type Product,
} from "../src/lib/products";

const FILE = (process.argv.find((a) => a.startsWith("--file=")) || "").slice(7);
let p: Product;
if (FILE) {
  p = JSON.parse(readFileSync(FILE, "utf8")) as Product;
} else {
  const env = Object.fromEntries(
    readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
  );
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.from("products").select("data").eq("id", "acrylic-prakob").single();
  if (error) throw error;
  p = data.data as Product;
}

const SIZE = "ขนาด";
const SIZE2 = "ขนาดชิ้นที่ 2";
const W = "ขนาดกำหนดเอง (ด้านที่ยาวที่สุด)";
const W2 = "ขนาดกำหนดเอง ชิ้นที่ 2 (ด้านที่ยาวที่สุด)";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุด้านที่ยาวที่สุด)";
const SCREEN = "งานสกรีน";
const TWO_SIDE = "สกรีน 2 ด้าน (ด้านในตรงกลาง)";
const R1 = "พวงกุญแจอะคริลิคประกบ";
const R2PC = "พวงกุญแจประกบ 2 ชิ้น ใน 1 พวง";
const RSTAND = "สแตนดี้อะคริลิคประกบ";

let fail = 0;
const ok = (name: string, pass: boolean, extra = "") => { if (!pass) fail++; console.log(pass ? "✅" : "❌", name, extra); };
const group = (l: string) => p.options.find((o) => o.label === l)!;
/** ⚠️ resolveSelections คืนเฉพาะคีย์ที่เป็นกลุ่มตัวเลือก — "เรทราคา" หลุด ต้องใส่กลับเอง */
const pick = (sel: Record<string, string>) => ({ ...resolveSelections(p, sel), [RATE_LABEL]: sel[RATE_LABEL] });
const price = (sel: Record<string, string>, qty: number) => unitPriceFor(p, sel, qty);

// ── โครงข้อมูล
const rates = (p.priceRates ?? []).map((r) => r.label);
ok("มีเรทใหม่ + เรทตัวแทนคู่กัน", rates.includes(R2PC) && rates.includes(`${R2PC} (ตัวแทน)`), rates.join(" · "));
ok("เรทแรกยังเป็นพวงกุญแจ (pricing หลักไม่ย้าย)", p.priceRates![0].label === R1);
ok("ตารางเรทใหม่เท่าเรทพวงกุญแจทุกช่อง", (() => {
  const a = p.priceRates!.find((r) => r.label === R1)!.pricing.cells;
  const b = p.priceRates!.find((r) => r.label === R2PC)!.pricing.cells;
  const ks = Object.keys(a);
  return ks.length === Object.keys(b).length && ks.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
})());
ok("กลุ่มขนาดชิ้นที่ 2 ดึงราคาจากตาราง + ข้ามแถวปลีก",
  group(SIZE2).priceAsDriver === SIZE && group(SIZE2).priceAsDriverMinTier === 1);
ok("กลุ่มขนาดชิ้นที่ 2 กำหนดขนาดเองได้", group(SIZE2).sizeInput?.choice === CUSTOM);
ok("ช่องกรอกชิ้นที่ 2 ผูกทั้งตัวเลือกและเรท", !!group(W2).showWhen && !!group(W2).showWhenAlso);
ok("1.54 ผ่านตัวตรวจช่องกรอกชิ้นที่ 2", !inputError(group(W2), "1.54"), String(inputError(group(W2), "1.54") ?? ""));

// ── เรทเดิมต้องไม่มีอะไรเปลี่ยน
const std1 = (cm: string, qty: number, screen = TWO_SIDE) => price(pick({ [RATE_LABEL]: R1, [SIZE]: cm, [SCREEN]: screen }), qty);
ok("เรทพวงกุญแจ: ไม่เห็นกลุ่มขนาดชิ้นที่ 2", !optionVisible(group(SIZE2), pick({ [RATE_LABEL]: R1, [SIZE]: "4cm" })));
ok("เรทพวงกุญแจ 4cm สกรีน 2 ด้าน 6 ชิ้น = ฿210 (ไม่โดนชิ้นที่ 2 บวก)", std1("4cm", 6) === 210, `฿${std1("4cm", 6)}`);
ok("เรทสแตนดี้ไม่เห็นกลุ่มขนาดชิ้นที่ 2", !optionVisible(group(SIZE2), pick({ [RATE_LABEL]: RSTAND, [SIZE]: "5cm" })));

// ── ใบเสนอราคาจริง: 6 พวง · ชิ้นหลักยาวสุด 4.5cm · ติ่ง 1.54cm · สกรีน 2 ด้าน
const quote = pick({ [RATE_LABEL]: R2PC, [SCREEN]: TWO_SIDE, [SIZE]: CUSTOM, [W]: "4.5", [SIZE2]: CUSTOM, [W2]: "1.54" });
ok("เรทใหม่: กลุ่มขนาดชิ้นที่ 2 โผล่ + ช่องกรอกโผล่", optionVisible(group(SIZE2), quote) && optionVisible(group(W2), quote));
ok("ชิ้นหลัก 4.5 → แถว 4cm", sizeInputPlan(p, quote, SIZE)!.choice === "4cm");
ok("ชิ้นที่ 2 ยาวสุด 1.54 → แถว 3cm (เล็กกว่าตารางเข้าแถวเล็กสุด)", sizeInputPlan(p, quote, SIZE2)!.choice === "3cm",
  JSON.stringify(sizeInputPlan(p, quote, SIZE2)));
ok("💰 6 พวง = ฿269/พวง ตรงใบเสนอราคา", price(quote, 6) === 269, `฿${price(quote, 6)}`);
const parts = unitPriceParts(p, quote, 6);
ok("แจกแจง: ฐาน ฿210 + ชิ้นที่ 2 ฿59", parts.base === 210 && parts.addOns.some((a) => a.label === SIZE2 && a.amount === 59),
  JSON.stringify(parts.addOns.map((a) => `${a.label} ฿${a.amount}`)));

// ── ขนาดมาตรฐาน (ไม่ใช้ custom) ต้องได้เลขเดียวกัน
const stdQuote = pick({ [RATE_LABEL]: R2PC, [SCREEN]: TWO_SIDE, [SIZE]: "4cm", [SIZE2]: "3cm" });
ok("เลือก 4cm + ชิ้นที่ 2 3cm จากเมนู = ฿269 เท่ากัน", price(stdQuote, 6) === 269, `฿${price(stdQuote, 6)}`);

// ── ช่วงจำนวนอื่น: ชิ้นที่ 2 เลื่อนตามช่วง แต่ไม่ต่ำกว่าแถว 11-49
const q50 = pick({ [RATE_LABEL]: R2PC, [SCREEN]: TWO_SIDE, [SIZE]: "4cm", [SIZE2]: "3cm" });
ok("50 พวง = ฿65 + ฿55 = ฿120", price(q50, 50) === 120, `฿${price(q50, 50)}`);
ok("11 พวง = ฿69 + ฿59 = ฿128", price(q50, 11) === 128, `฿${price(q50, 11)}`);
ok("1 พวง ยังคิดชิ้นที่ 2 ที่แถว 11-49 (฿210 + ฿59)", price(q50, 1) === 269, `฿${price(q50, 1)}`);
ok("1,000 พวง = ฿50 + ฿40 = ฿90", price(q50, 1000) === 90, `฿${price(q50, 1000)}`);

// ── สกรีนชุดเดียวใช้ทั้งสองชิ้น
const q1side = pick({ [RATE_LABEL]: R2PC, [SCREEN]: "สกรีน 1 ด้าน (ด้านในตรงกลาง)", [SIZE]: "4cm", [SIZE2]: "3cm" });
ok("สกรีน 1 ด้าน = ฿200 + ฿49 = ฿249", price(q1side, 6) === 249, `฿${price(q1side, 6)}`);

// ── ชิ้นที่ 2 ใหญ่เกินตาราง = รอแอดมินตีราคา
const qOver = pick({ [RATE_LABEL]: R2PC, [SCREEN]: TWO_SIDE, [SIZE]: "4cm", [SIZE2]: CUSTOM, [W2]: "18" });
ok("ชิ้นที่ 2 ยาวสุด 18 → รอแอดมินตีราคา", needsQuote(p, qOver) && price(qOver, 6) === 0, `฿${price(qOver, 6)}`);

console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : "\n✅ ผ่านครบทุกข้อ");
process.exit(fail ? 1 : 0);
