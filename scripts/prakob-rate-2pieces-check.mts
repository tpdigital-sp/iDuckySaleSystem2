/**
 * ตรวจเรท "พวงกุญแจประกบ 2 ชิ้น ใน 1 พวง" ด้วยฟังก์ชันจริงที่หน้าเว็บใช้ (อ่านอย่างเดียว)
 *   npx tsx scripts/prakob-rate-2pieces-check.mts                 # ข้อมูลสดจาก DB
 *   npx tsx scripts/prakob-rate-2pieces-check.mts --file=<json>   # ไฟล์จำลองจาก --out (ตรวจก่อนเขียนจริง)
 * เทียบกับใบเสนอราคาจริง 21 ก.ย. 69: 6 พวง · ชิ้นหลัก 4-4.5cm ฿210 + ติ่ง 1.54cm ฿59 = ฿269/พวง
 * และกติกาที่เจ้าของร้านยืนยัน 22 ก.ย. 69: ติ่งห้อยใช้แถวราคาที่ถูกกว่าตัวหลัก 1 ขั้นเสมอ
 * (11-49 พวง → ติ่งแถว 50-199 · ตัวหลัก 5cm สกรีน 1 ด้าน ฿69 + ติ่ง 3cm ฿45) · งานสกรีนแยกรายชิ้น
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
const SIZE2 = "ติ่งห้อย";
const W = "ขนาดกำหนดเอง (ด้านที่ยาวที่สุด)";
const W2 = "ขนาดกำหนดเอง ติ่งห้อย (ด้านที่ยาวที่สุด)";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุด้านที่ยาวที่สุด)";
const SCREEN = "งานสกรีน";
const SCREEN2 = "งานสกรีน ติ่งห้อย";
const ONE_SIDE = "สกรีน 1 ด้าน (ด้านในตรงกลาง)";
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
ok("กลุ่มติ่งห้อย ดึงราคาจากตาราง + ข้ามแถวปลีก + ถูกกว่าตัวหลัก 1 ขั้น",
  group(SIZE2).priceAsDriver === SIZE && group(SIZE2).priceAsDriverMinTier === 1 && group(SIZE2).priceAsDriverTierShift === 1);
ok("ติ่งห้อยอ่านงานสกรีนจากกลุ่มของตัวเอง", group(SIZE2).priceAsDriverAlso?.[SCREEN] === SCREEN2);
ok("กลุ่มงานสกรีนของติ่งห้อยมีตัวเลือกครบเท่าชิ้นหลัก",
  group(SCREEN2).choices.length === group(SCREEN).choices.length);
ok("งานสกรีนติ่งห้อยเริ่มต้นตามชิ้นหลัก (defaultBy ชี้ชื่อตัวเลือกจริงทุกตัว)",
  !!group(SCREEN2).defaultBy && group(SCREEN2).defaultBy!.label === SCREEN &&
  Object.entries(group(SCREEN2).defaultBy!.map).every(([k, v]) =>
    group(SCREEN).choices.some((c) => c.name === k) && group(SCREEN2).choices.some((c) => c.name === v)));
ok("หัวข้อที่โชว์ในเรท 2 ชิ้น: ตัวหลัก / ชิ้นที่ 1 / ชิ้นที่ 2",
  group(SIZE).labelBy?.map[R2PC] === "ตัวหลัก" &&
  group(SCREEN).labelBy?.map[R2PC] === "ชิ้นที่ 1 (ตัวหลัก)" &&
  group(SCREEN2).labelBy?.map[R2PC] === "ชิ้นที่ 2 (ติ่งห้อย)");
ok("กลุ่มติ่งห้อย กำหนดขนาดเองได้", group(SIZE2).sizeInput?.choice === CUSTOM);
ok("ช่องกรอกติ่งห้อยผูกทั้งตัวเลือกและเรท",
  group(W2).showWhen?.label === SIZE2 && !!group(W2).showWhenAlso);
ok("ชื่อช่องกรอกของติ่งห้อยตรงกับกลุ่ม", group(SIZE2).sizeInput?.widthLabel === W2);
ok("1.54 ผ่านตัวตรวจช่องกรอกติ่งห้อย", !inputError(group(W2), "1.54"), String(inputError(group(W2), "1.54") ?? ""));
ok("ไม่มีชื่อกลุ่มเดิม \"ขนาดชิ้นที่ 2\" ค้างในสินค้า", !JSON.stringify(p).includes("ขนาดชิ้นที่ 2"));

// ── เรทเดิมต้องไม่มีอะไรเปลี่ยน
const std1 = (cm: string, qty: number, screen = TWO_SIDE) => price(pick({ [RATE_LABEL]: R1, [SIZE]: cm, [SCREEN]: screen }), qty);
ok("เรทพวงกุญแจ: ไม่เห็นกลุ่มติ่งห้อย/งานสกรีนติ่งห้อย",
  !optionVisible(group(SIZE2), pick({ [RATE_LABEL]: R1, [SIZE]: "4cm" })) &&
  !optionVisible(group(SCREEN2), pick({ [RATE_LABEL]: R1, [SIZE]: "4cm" })));
ok("เรทพวงกุญแจ 4cm สกรีน 2 ด้าน 6 ชิ้น = ฿210 (ไม่โดนชิ้นที่ 2 บวก)", std1("4cm", 6) === 210, `฿${std1("4cm", 6)}`);
ok("เรทสแตนดี้ไม่เห็นกลุ่มติ่งห้อย", !optionVisible(group(SIZE2), pick({ [RATE_LABEL]: RSTAND, [SIZE]: "5cm" })));

// ── ใบเสนอราคาจริง: 6 พวง · ชิ้นหลักยาวสุด 4.5cm · ติ่ง 1.54cm · สกรีน 2 ด้าน
const quote = pick({ [RATE_LABEL]: R2PC, [SCREEN]: TWO_SIDE, [SCREEN2]: TWO_SIDE, [SIZE]: CUSTOM, [W]: "4.5", [SIZE2]: CUSTOM, [W2]: "1.54" });
ok("เรทใหม่: กลุ่มติ่งห้อย + ช่องกรอก + งานสกรีนติ่งห้อย โผล่ครบ",
  optionVisible(group(SIZE2), quote) && optionVisible(group(W2), quote) && optionVisible(group(SCREEN2), quote));
ok("ชิ้นหลัก 4.5 → แถว 4cm", sizeInputPlan(p, quote, SIZE)!.choice === "4cm");
ok("ติ่งห้อยยาวสุด 1.54 → แถว 3cm (เล็กกว่าตารางเข้าแถวเล็กสุด)", sizeInputPlan(p, quote, SIZE2)!.choice === "3cm",
  JSON.stringify(sizeInputPlan(p, quote, SIZE2)));
ok("💰 6 พวง = ฿269/พวง ตรงใบเสนอราคา", price(quote, 6) === 269, `฿${price(quote, 6)}`);
const parts = unitPriceParts(p, quote, 6);
ok("แจกแจง: ฐาน ฿210 + ติ่งห้อย ฿59", parts.base === 210 && parts.addOns.some((a) => a.label === SIZE2 && a.amount === 59),
  JSON.stringify(parts.addOns.map((a) => `${a.label} ฿${a.amount}`)));

// ── ขนาดมาตรฐาน (ไม่ใช้ custom) ต้องได้เลขเดียวกัน
const stdQuote = pick({ [RATE_LABEL]: R2PC, [SCREEN]: TWO_SIDE, [SCREEN2]: TWO_SIDE, [SIZE]: "4cm", [SIZE2]: "3cm" });
ok("เลือก 4cm + ติ่งห้อย 3cm จากเมนู = ฿269 เท่ากัน", price(stdQuote, 6) === 269, `฿${price(stdQuote, 6)}`);

// ── ช่วงจำนวน: ติ่งห้อยถูกกว่าตัวหลัก 1 ขั้นเสมอ (ตัวหลัก 4cm + ติ่ง 3cm · สกรีน 2 ด้าน)
const q50 = pick({ [RATE_LABEL]: R2PC, [SCREEN]: TWO_SIDE, [SCREEN2]: TWO_SIDE, [SIZE]: "4cm", [SIZE2]: "3cm" });
ok("1 พวง = ฿210 + ติ่งแถว 11-49 ฿59 = ฿269", price(q50, 1) === 269, `฿${price(q50, 1)}`);
ok("11 พวง = ฿69 + ติ่งแถว 50-199 ฿55 = ฿124", price(q50, 11) === 124, `฿${price(q50, 11)}`);
ok("50 พวง = ฿65 + ติ่งแถว 200-499 ฿50 = ฿115", price(q50, 50) === 115, `฿${price(q50, 50)}`);
ok("200 พวง = ฿60 + ติ่งแถว 500-999 ฿45 = ฿105", price(q50, 200) === 105, `฿${price(q50, 200)}`);
ok("1,000 พวง = ฿50 + ติ่งแถวสุดท้าย ฿40 = ฿90 (เลยแถวสุดท้ายแล้วค้างไว้)", price(q50, 1000) === 90, `฿${price(q50, 1000)}`);

// ── ตัวอย่างจากภาพที่เจ้าของร้านส่ง 22 ก.ย. 69: สกรีน 1 ด้าน · ตัวหลัก 5cm ฿69 + ติ่ง 3cm ฿45
const shot = pick({ [RATE_LABEL]: R2PC, [SCREEN]: ONE_SIDE, [SCREEN2]: ONE_SIDE, [SIZE]: "5cm", [SIZE2]: "3cm" });
ok("📸 20 พวง = ฿69 + ฿45 = ฿114 ตรงภาพ", price(shot, 20) === 114, `฿${price(shot, 20)}`);
const shotParts = unitPriceParts(p, shot, 20);
ok("แจกแจง: ตัวหลัก ฿69 + ติ่งห้อย ฿45",
  shotParts.base === 69 && shotParts.addOns.some((a) => a.label === SIZE2 && a.amount === 45),
  JSON.stringify(shotParts.addOns.map((a) => `${a.label} ฿${a.amount}`)));
ok("สกรีน 1 ด้าน 6 พวง = ฿200 + ฿49 = ฿249", price(pick({ ...shot, [SIZE]: "4cm" }), 6) === 249,
  `฿${price(pick({ ...shot, [SIZE]: "4cm" }), 6)}`);

// ── งานสกรีนแยกรายชิ้น: ตัวหลัก 2 ด้าน + ติ่ง 1 ด้าน
const mix = pick({ [RATE_LABEL]: R2PC, [SCREEN]: TWO_SIDE, [SCREEN2]: ONE_SIDE, [SIZE]: "4cm", [SIZE2]: "3cm" });
ok("ตัวหลักสกรีน 2 ด้าน + ติ่งสกรีน 1 ด้าน · 20 พวง = ฿69 + ฿45 = ฿114", price(mix, 20) === 114, `฿${price(mix, 20)}`);
ok("สลับกัน: ตัวหลัก 1 ด้าน + ติ่ง 2 ด้าน · 20 พวง = ฿59 + ฿55 = ฿114",
  price(pick({ ...mix, [SCREEN]: ONE_SIDE, [SCREEN2]: TWO_SIDE }), 20) === 114,
  `฿${price(pick({ ...mix, [SCREEN]: ONE_SIDE, [SCREEN2]: TWO_SIDE }), 20)}`);

// ── ติ่งห้อยใหญ่เกินตาราง = รอแอดมินตีราคา
const qOver = pick({ [RATE_LABEL]: R2PC, [SCREEN]: TWO_SIDE, [SCREEN2]: TWO_SIDE, [SIZE]: "4cm", [SIZE2]: CUSTOM, [W2]: "18" });
ok("ติ่งห้อยยาวสุด 18 → รอแอดมินตีราคา", needsQuote(p, qOver) && price(qOver, 6) === 0, `฿${price(qOver, 6)}`);

console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : "\n✅ ผ่านครบทุกข้อ");
process.exit(fail ? 1 : 0);
