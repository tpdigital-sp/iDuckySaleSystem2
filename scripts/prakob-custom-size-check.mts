/**
 * ตรวจ "กำหนดขนาดเอง" ของอะคริลิคประกบ (id "acrylic-prakob") ด้วยฟังก์ชันจริงที่หน้าเว็บใช้ + ข้อมูลสดจาก DB
 * (อ่านอย่างเดียว)  npx tsx scripts/prakob-custom-size-check.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  resolveSelections, allowedChoices, optionVisible, unitPriceFor, needsQuote,
  sizeInputPlan, sizeInputText, inputError, RATE_LABEL, type Product,
} from "../src/lib/products";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: row, error } = await sb.from("products").select("data").eq("id", "acrylic-prakob").single();
if (error) throw error;
const p = row.data as Product;

const SIZE = "ขนาด";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุด้านที่ยาวที่สุด)";
const W = "ขนาดกำหนดเอง (ด้านที่ยาวที่สุด)";
const KEYRING = "พวงกุญแจอะคริลิคประกบ";     // เรทที่ 1 — ตาราง 3-16cm
const STAND = "สแตนดี้อะคริลิคประกบ";        // เรทที่ 2 — ตาราง 3-13cm (มีฐาน)
const BASE = { [RATE_LABEL]: STAND, "ฐาน": "ฐานไม่สกรีน" };
let fail = 0;
const ok = (name: string, pass: boolean, extra = "") => { if (!pass) fail++; console.log(pass ? "✅" : "❌", name, extra); };
const group = (l: string) => p.options.find((o) => o.label === l)!;

// ── โครงข้อมูล
ok("กลุ่มขนาดมี 15 ตัวเลือก (14 ไซซ์ + กำหนดเอง ท้ายสุด)",
  group(SIZE).choices.length === 15 && group(SIZE).choices.at(-1)!.name === CUSTOM);
ok("ช่องกรอกอยู่ชุดเดียวกับกลุ่มขนาด", group(W).section === group(SIZE).section, group(W).section ?? "");
ok("กรอกด้านเดียว (heightLabel ชี้ช่องเดียวกับ widthLabel)",
  group(SIZE).sizeInput?.heightLabel === group(SIZE).sizeInput?.widthLabel);
ok("ไม่ได้ล็อก askOver ตัวเดียวทับสองเรท", group(SIZE).sizeInput?.askOver == null);
ok("ช่องกรอกไม่ได้บล็อกทศนิยม", group(W).input?.integer !== true);
ok("4.5 ผ่านตัวตรวจช่องกรอก", !inputError(group(W), "4.5"), String(inputError(group(W), "4.5") ?? ""));
ok("ช่องว่างยังบังคับกรอก", !!inputError(group(W), ""));

/** ⚠️ resolveSelections คืนเฉพาะคีย์ที่เป็นกลุ่มตัวเลือก — "เรทราคา" หลุด ต้องใส่กลับเอง ไม่งั้นตกไปเรทแรกเสมอ */
const pick = (sel: Record<string, string>) => ({ ...resolveSelections(p, sel), ...(sel[RATE_LABEL] ? { [RATE_LABEL]: sel[RATE_LABEL] } : {}) });

const base = resolveSelections(p, {});
ok("ยังไม่เลือก custom → ช่องกรอกซ่อน", !optionVisible(group(W), base));
ok("custom อยู่ใน allowedChoices", allowedChoices(p, base, SIZE).includes(CUSTOM));

// ── ราคา: เรทพวงกุญแจ (3-16cm)
const price = (sel: Record<string, string>, qty = 1) => unitPriceFor(p, sel, qty);
const std = (cm: string, qty = 1, extra: Record<string, string> = {}) =>
  price(pick({ [RATE_LABEL]: KEYRING, [SIZE]: cm, ...extra }), qty);
const cus = (w: string, qty = 1, extra: Record<string, string> = {}) =>
  price(pick({ [RATE_LABEL]: KEYRING, [SIZE]: CUSTOM, [W]: w, ...extra }), qty);
const plan = (w: string, extra: Record<string, string> = {}) =>
  sizeInputPlan(p, pick({ [RATE_LABEL]: KEYRING, [SIZE]: CUSTOM, [W]: w, ...extra }), SIZE)!;

console.log("ราคาพวงกุญแจ 1 ชิ้น:", ["3cm", "4cm", "5cm", "10cm", "16cm"].map((c) => `${c}=฿${std(c)}`).join(" · "));

const sel45 = pick({ [RATE_LABEL]: KEYRING, [SIZE]: CUSTOM, [W]: "4.5" });
ok("เลือก custom → ช่องกรอกโผล่", optionVisible(group(W), sel45));
ok("4.5 → เกาะแถว 4cm (ผ่อนเศษ 0.5)", plan("4.5").choice === "4cm" && plan("4.5").filled && !plan("4.5").quote, JSON.stringify(plan("4.5")));
ok("ข้อความสรุปเป็น “ยาวสุด” ไม่ใช่ 4.5×0", sizeInputText(plan("4.5")) === "ยาวสุด 4.5 ซม.", sizeInputText(plan("4.5")));
ok("ราคา 4.5 = ราคา 4cm", cus("4.5") === std("4cm"), `฿${cus("4.5")} vs ฿${std("4cm")}`);
ok("4.6 → ขยับเป็นแถว 5cm", plan("4.6").choice === "5cm" && cus("4.6") === std("5cm"));
ok("2 (เล็กกว่าตาราง) → คิดเท่าแถว 3cm", plan("2").choice === "3cm" && cus("2") === std("3cm"));
ok("16 → แถว 16cm (ใหญ่สุดของเรทพวงกุญแจ)", plan("16").choice === "16cm" && cus("16") === std("16cm"));
ok("16.5 ยังอยู่แถว 16cm (ผ่อนเศษ)", plan("16.5").choice === "16cm" && cus("16.5") === std("16cm"));
ok("18 → รอแอดมินตีราคา (ราคา 0 ไม่หล่นไปราคาตั้งต้น)",
  plan("18").quote && cus("18") === 0 && needsQuote(p, pick({ [RATE_LABEL]: KEYRING, [SIZE]: CUSTOM, [W]: "18" })),
  `฿${cus("18")}`);
ok("ยังไม่กรอก → เกาะแถวเล็กสุด ไม่หล่นไปราคาตั้งต้น", (() => {
  const s = pick({ [RATE_LABEL]: KEYRING, [SIZE]: CUSTOM });
  const pl = sizeInputPlan(p, s, SIZE)!;
  return !pl.filled && pl.choice === "3cm" && price(s) === std("3cm");
})());
ok("ราคาขั้นบันไดยังคิดถูก (100 ชิ้น 4.5cm = 100 ชิ้น 4cm)", cus("4.5", 100) === std("4cm", 100), `฿${cus("4.5", 100)}`);
ok("สกรีน 4 เลเยอร์ + กำหนดขนาดเอง ยังคิดตามแถว",
  cus("7.4", 1, { "งานสกรีน": "สกรีน 4 เลเยอร์" }) === std("7cm", 1, { "งานสกรีน": "สกรีน 4 เลเยอร์" }),
  `฿${cus("7.4", 1, { "งานสกรีน": "สกรีน 4 เลเยอร์" })}`);

// ── เรทสแตนดี้ (ตารางถึง 13cm เท่านั้น) — ห้ามเกาะแถว 14-16cm ที่เรทนี้ไม่มีราคา
const sPrice = (sel: Record<string, string>, qty = 1) => unitPriceFor(p, sel, qty);
const sStd = (cm: string, qty = 1) => sPrice(pick({ ...BASE, [SIZE]: cm }), qty);
const sCus = (w: string, qty = 1) => sPrice(pick({ ...BASE, [SIZE]: CUSTOM, [W]: w }), qty);
const sPlan = (w: string) => sizeInputPlan(p, pick({ ...BASE, [SIZE]: CUSTOM, [W]: w }), SIZE)!;
console.log("ราคาสแตนดี้ 1 ชิ้น:", ["3cm", "10cm", "13cm"].map((c) => `${c}=฿${sStd(c)}`).join(" · "));
ok("สแตนดี้ 9.5 → แถว 9cm", sPlan("9.5").choice === "9cm" && sCus("9.5") === sStd("9cm"), `฿${sCus("9.5")}`);
ok("สแตนดี้ 13 → แถว 13cm (ใหญ่สุดของเรทนี้)", sPlan("13").choice === "13cm" && sCus("13") === sStd("13cm"));
ok("สแตนดี้ 15 → รอตีราคา (ไม่ไปเกาะแถว 16cm ของเรทพวงกุญแจ)", sPlan("15").quote && sCus("15") === 0, `฿${sCus("15")}`);
ok("สแตนดี้ 15 ราคาไม่หล่นไปราคาตั้งต้นสินค้า", sCus("15") !== p.price);

console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : "\n✅ ผ่านครบทุกข้อ");
process.exit(fail ? 1 : 0);
