/**
 * 🔍 ด่านตรวจ — สแตนดี้อะคริลิค (standy): ขนาดฐาน "กำหนดเอง" ต้องคิดเงินเท่ากับเลือกแถว Ncm ที่ไปเกาะ
 *
 *   npx tsx scripts/standy-base-custom-size-check.mts [--simulate]
 *
 * --simulate = ยังไม่ได้รัน scripts/standy-base-custom-size.mjs ก็ตรวจได้ (ใส่ sizeInput ในหน่วยความจำ)
 * เรียกฟังก์ชันจริงจาก src/lib/products.ts บนข้อมูลจริงใน Supabase
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import { RATE_LABEL, allowedChoices, needsQuote, sizeInputPlan, unitPriceFor, type Product } from "../src/lib/products";

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a: Record<string, string>, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data, error } = await sb.from("products").select("data").eq("id", "standy").maybeSingle();
if (error || !data) { console.error("✗ อ่านสินค้าไม่ได้: " + error?.message); process.exit(1); }
const p = data.data as Product;

const BASE = "ขนาดฐาน";
const CUSTOM = "📐 กำหนดขนาดฐานเอง (ระบุด้านที่ยาวที่สุด)";
const FIELD = "ขนาดฐานกำหนดเอง (ด้านที่ยาวที่สุด)";
const SPECIAL = "อะคริลิคพิเศษ (สี / กลิตเตอร์ / โฮโลแกรม)";
const baseOpt = p.options.find((o) => o.label === BASE)!;
if (process.argv.includes("--simulate") && !baseOpt.sizeInput) {
  baseOpt.choices.push({ name: CUSTOM });
  baseOpt.sizeInput = { choice: CUSTOM, widthLabel: FIELD, heightLabel: FIELD, askOver: 20, unit: "ซม." };
  p.options.splice(p.options.indexOf(baseOpt) + 1, 0, {
    label: FIELD, display: "input", standardInput: true, choices: [],
    showWhen: { label: BASE, choices: [CUSTOM] },
    input: { kind: "number", unit: "ซม.", min: 1, max: 40, required: true },
  } as never);
  (p.rules ??= []).push({
    when: { label: BASE, choice: CUSTOM, choices: [CUSTOM] },
    limit: { label: "สีอะคริลิคฐาน", allow: ["อะคริลิคใส", "อะคริลิคขาวขุ่น C-02"] },
  } as never);
}
if (baseOpt.sizeInput?.choice !== CUSTOM) { console.error("✗ ขนาดฐานยังไม่ได้ตั้ง sizeInput (ลอง --simulate)"); process.exit(1); }

const RATE1 = "เรทที่ 1 (สั่งแบบคละดีเทล)";
const common: Record<string, string> = {
  [RATE_LABEL]: RATE1,
  "ขนาดตัวสแตนดี้": "10cm",
  "งานสกรีน": "สกรีน 1 ด้าน (บน)",
  "สีอะคริลิค": "อะคริลิคใส",
  "ฐานสแตนดี้": "ไม่สกรีนฐาน",
  "ทรงฐาน": "ทรงกลม",
  "สีอะคริลิคฐาน": "อะคริลิคใส",
};
const picked = (row: string) => ({ ...common, [BASE]: row });
const typed = (cm: string) => ({ ...common, [BASE]: CUSTOM, [FIELD]: cm });

let bad = 0;
const ok = (cond: boolean, msg: string, extra = "") => {
  console.log((cond ? "✅ " : "❌ ") + msg + (extra ? " " + extra : ""));
  if (!cond) bad++;
};

// กรอกเอง = ราคาเท่าเลือกแถวที่ไปเกาะ ทั้งช่วงปลีก (extraBelow) และช่วงส่ง (extra)
for (const [cm, row] of [["1.5", "2cm"], ["5", "5cm"], ["6.5", "6cm"], ["6.6", "7cm"], ["8.5", "8cm"], ["8.6", "9cm"], ["12", "12cm"], ["19.6", "20cm"], ["20.5", "20cm"]] as const) {
  for (const qty of [1, 10, 11, 100]) {
    const a = unitPriceFor(p, typed(cm), qty);
    const b = unitPriceFor(p, picked(row), qty);
    const pl = sizeInputPlan(p, typed(cm), BASE);
    ok(a === b && a > 0 && pl?.choice === row && !needsQuote(p, typed(cm)), `ฐาน ${cm} ซม. × ${qty} ชิ้น = แถว ${row}`, `฿${a} (เลือกแถวเอง ฿${b})`);
  }
}
// ค่าฐานขยับจริง (กันกรณีเท่ากันเพราะไม่คิดทั้งคู่)
ok(unitPriceFor(p, typed("12"), 1) - unitPriceFor(p, typed("5"), 1) === 30, "ปลีก: ฐาน 12 ซม. แพงกว่า 5 ซม. ฿30 ((12−6)×5)");
ok(unitPriceFor(p, typed("12"), 11) - unitPriceFor(p, typed("5"), 11) === 30, "ส่ง: ฐาน 12 ซม. แพงกว่า 5 ซม. ฿30 (ตาราง 40−10)");
// เกิน 20 ซม. = รอแอดมินตีราคา
for (const cm of ["20.6", "25"]) {
  ok(needsQuote(p, typed(cm)) && unitPriceFor(p, typed(cm), 5) === 0, `ฐาน ${cm} ซม. = รอแอดมินตีราคา`);
}
// ยังไม่กรอก = ไม่เป็นงานตีราคา และราคาไม่หล่นเป็น 0
ok(!needsQuote(p, typed("")) && unitPriceFor(p, typed(""), 5) > 0, "ยังไม่กรอกขนาดฐาน = ราคาเริ่มต้น ไม่ใช่รอตีราคา");
// กำหนดเองพร้อมกันทั้งตัวสแตนดี้และฐาน — แผนของแต่ละกลุ่มไม่ปนกัน
{
  const body = p.options.find((o) => o.label === "ขนาดตัวสแตนดี้")!;
  const sel = { ...typed("8.5"), [body.label]: body.sizeInput!.choice, [body.sizeInput!.widthLabel]: "12.5" };
  const ref = { ...picked("8cm"), [body.label]: "12cm" };
  ok(unitPriceFor(p, sel, 5) === unitPriceFor(p, ref, 5) && unitPriceFor(p, sel, 5) > 0, "กำหนดเองทั้งตัว 12.5 + ฐาน 8.5 = ตัว 12cm + ฐาน 8cm", `฿${unitPriceFor(p, sel, 5)}`);
  ok(sizeInputPlan(p, sel, body.label)?.choice === "12cm" && sizeInputPlan(p, sel, BASE)?.choice === "8cm", "แผนรายกลุ่มถูกตัว");
}
// กฎสีฐาน: กำหนดขนาดเอง = ไม่มีสีพิเศษ · เลือกแถวปกติ = ยังมีครบ
ok(!allowedChoices(p, typed("8"), "สีอะคริลิคฐาน").includes(SPECIAL), "ฐานกำหนดเอง: สีพิเศษถูกปิด");
ok(allowedChoices(p, picked("8cm"), "สีอะคริลิคฐาน").includes(SPECIAL), "ฐานเลือกจากรายการ: สีพิเศษยังเลือกได้");
ok(allowedChoices(p, common, BASE).includes(CUSTOM), "ตัวเลือกกำหนดขนาดฐานเองไม่โดนกฎไหนตัดทิ้ง");

console.log(bad ? `\n❌ ไม่ผ่าน ${bad} ข้อ` : "\n✅ ผ่านทุกข้อ");
process.exit(bad ? 1 : 0);
