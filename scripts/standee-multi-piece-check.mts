/**
 * ตรวจสินค้า "สแตนดี้ หลายชิ้นใน 1 ฐาน" ด้วยฟังก์ชันจริงที่หน้าเว็บใช้ + ข้อมูลสดจาก DB
 * (ไม่แก้อะไร — อ่านอย่างเดียว)  npx tsx scripts/standee-multi-piece-check.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  allowedChoices,
  optionVisible,
  artworkConsultOf,
  unitPriceFor,
  unitPieceCountOf,
  activeMatrix,
  matrixChoiceAvailable,
  type Product,
} from "../src/lib/products";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: row, error } = await sb.from("products").select("data").eq("id", "new-mt1dwpc1-6773").single();
if (error) throw error;
const p = row.data as Product;

const COUNT = "จำนวนชิ้นใน 1 ฐาน";
const RATE = "เรทราคา";
const UNDER = "สกรีน 1 ด้าน (ใต้)";
const TOP = "สกรีน 1 ด้าน (บน)";
const TWO = "สกรีน 2 ด้าน (ใต้-บน)";
const CLEAR = "อะคริลิคใส";
const C02 = "อะคริลิคขาวขุ่น C-02";
const SPECIAL = "สีพิเศษ (โฮโลแกรม/กลิสเตอร์/สี)";
const rateLabel = p.priceRates![0].label;

let fail = 0;
const eq = (what: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "✅" : "❌"} ${what} → ${JSON.stringify(got)}${ok ? "" : ` (ควรเป็น ${JSON.stringify(want)})`}`);
};

/** ชุดตัวเลือกพื้นฐาน: n ชิ้น · ชิ้นที่ 1 ขนาด s1 · ชิ้นที่ 2 ขนาด s2 · ฐาน b ซม. */
const sel = (n: number, s1: number, s2: number, base: number, extra: Record<string, string> = {}) => ({
  [RATE]: rateLabel,
  [COUNT]: `${n} ชิ้น`,
  "ขนาดชิ้นที่ 1": `${s1}cm`,
  "งานสกรีน ชิ้นที่ 1": UNDER,
  "สีอะคริลิค ชิ้นที่ 1": CLEAR,
  "ขนาดชิ้นที่ 2": `${s2}cm`,
  "งานสกรีน ชิ้นที่ 2": UNDER,
  "สีอะคริลิค ชิ้นที่ 2": CLEAR,
  "ฐานสแตนดี้": "ไม่สกรีนฐาน",
  "ขนาดฐาน": `${base}cm`,
  "ทรงฐาน": "ทรงสี่เหลี่ยม",
  "สีอะคริลิคฐาน": CLEAR,
  ...extra,
});

console.log("— ใบเสนอราคาจริงของร้าน (2 ชิ้นใน 1 ฐาน · ชิ้นหน้า 6cm · ชิ้นหลัง 10cm · ฐาน 7cm) —");
eq("1 ชุด (เรทปลีก) = 140+100+5", unitPriceFor(p, sel(2, 6, 10, 7), 1), 245);
eq("11 ชุด (เรทส่งที่1) = 69+100+15", unitPriceFor(p, sel(2, 6, 10, 7), 11), 184);

console.log("\n— เรทนับ 'จำนวนชุด' ไม่ใช่ชิ้นรวม —");
eq("5 ชุด × 5 ชิ้น ยังเป็นเรทปลีก (ไม่เด้งเป็น 25 ชิ้น)", unitPriceFor(p, sel(5, 6, 10, 7), 5) > unitPriceFor(p, sel(5, 6, 10, 7), 11), true);
eq("ยอดชิ้นรวมต่อชุด (โชว์เฉย ๆ)", unitPieceCountOf(p, sel(4, 6, 10, 7)), 4);

console.log("\n— ชิ้นที่ 3-5 บวกเพิ่มตามขนาดของชิ้นนั้น —");
const s3 = sel(3, 6, 10, 7, { "ขนาดชิ้นที่ 3": "4cm", "งานสกรีน ชิ้นที่ 3": UNDER, "สีอะคริลิค ชิ้นที่ 3": CLEAR });
eq("3 ชิ้น (เพิ่มชิ้น 4cm = +40)", unitPriceFor(p, s3, 1), 285);
eq("ชิ้นที่ 3 โผล่เมื่อเลือก 3 ชิ้น", optionVisible(p.options.find((o) => o.label === "ขนาดชิ้นที่ 3")!, s3), true);
eq("ชิ้นที่ 3 ไม่โผล่เมื่อเลือก 2 ชิ้น", optionVisible(p.options.find((o) => o.label === "ขนาดชิ้นที่ 3")!, sel(2, 6, 10, 7)), false);
eq("เลือก 2 ชิ้น = ไม่คิดค่าชิ้นที่ 3 ที่ค้างอยู่", unitPriceFor(p, { ...sel(2, 6, 10, 7), "ขนาดชิ้นที่ 3": "20cm" }, 1), 245);

console.log("\n— ค่าสกรีน/เนื้อพิเศษ คิดตามขนาดของชิ้นนั้น ๆ —");
eq("ชิ้นที่ 1 สกรีน 2 ด้าน 6cm (+15)", unitPriceFor(p, sel(2, 6, 10, 7, { "งานสกรีน ชิ้นที่ 1": TWO }), 1), 260);
eq("ชิ้นที่ 2 สกรีน 2 ด้าน 10cm (+25)", unitPriceFor(p, sel(2, 6, 10, 7, { "งานสกรีน ชิ้นที่ 2": TWO }), 1), 270);
eq(
  "ชิ้นที่ 1 เนื้อพิเศษ 6cm ปลีก (+10)",
  unitPriceFor(p, sel(2, 6, 10, 7, { "สีอะคริลิค ชิ้นที่ 1": SPECIAL, "เลือกเฉดสีพิเศษ ชิ้นที่ 1": "อะคริลิคสีฟ้า (B)" }), 1),
  255
);
eq(
  "ชิ้นที่ 2 เนื้อพิเศษ 10cm ปลีก (+10)",
  unitPriceFor(p, sel(2, 6, 10, 7, { "สีอะคริลิค ชิ้นที่ 2": SPECIAL, "เลือกเฉดสีพิเศษ ชิ้นที่ 2": "อะคริลิคสีฟ้า (B)" }), 1),
  255
);

console.log("\n— กฎเนื้อทึบ: สกรีนใต้ไม่ได้ —");
eq(
  "ชิ้นที่ 2 เลือก C-02 → เหลือเฉพาะสกรีนผิวบน",
  allowedChoices(p, sel(2, 6, 10, 7, { "สีอะคริลิค ชิ้นที่ 2": C02 }), "งานสกรีน ชิ้นที่ 2"),
  [TOP, "สกรีน 2 ด้าน (บน-บน)"]
);
eq("ชิ้นที่ 1 ใส → สกรีนได้ครบ 5 แบบ", allowedChoices(p, sel(2, 6, 10, 7), "งานสกรีน ชิ้นที่ 1").length, 5);

console.log("\n— เกิน 5 ชิ้น = ต้องคุยกับแอดมินก่อน —");
eq("เลือก 5 ชิ้น สั่งได้เลย", artworkConsultOf(p, sel(5, 6, 10, 7)), null);
eq("เลือกมากกว่า 5 ชิ้น = บล็อกไว้ให้คุยก่อน", artworkConsultOf(p, { ...sel(5, 6, 10, 7), [COUNT]: "มากกว่า 5 ชิ้น (สอบถามแอดมิน)" })?.block, true);

console.log("\n— เรทที่ 2 (สั่งแบบไม่คละดีเทล) 50 ชุดขึ้นไป —");
const rate2Label = p.priceRates![1]?.label ?? "";
eq("มีเรทที่ 2 ในสินค้า", /เรทที่ 2/.test(rate2Label), true);
const sel2 = (extra: Record<string, string> = {}) => ({ ...sel(2, 6, 10, 7), [RATE]: rate2Label, ...extra });
eq("50 ชุด เรทที่ 2 = ชิ้นหน้า 6cm 55 + ชิ้นหลัง 10cm 85 + ฐาน 7cm 15", unitPriceFor(p, sel2(), 50), 155);
eq("200 ชุด เรทที่ 2 = 45+75+15", unitPriceFor(p, sel2(), 200), 135);
eq("เรทที่ 2 เนื้อพิเศษ 6cm ใช้คอลัมน์ส่ง (+8)", unitPriceFor(p, sel2({ "สีอะคริลิค ชิ้นที่ 1": SPECIAL, "เลือกเฉดสีพิเศษ ชิ้นที่ 1": "อะคริลิคสีฟ้า (B)" }), 50), 163);
eq("เรทที่ 2 สกรีน 3 เลเยอร์ 20cm (ช่องที่เติมเอง +110)", unitPriceFor(p, sel2({ "ขนาดชิ้นที่ 1": "20cm", "งานสกรีน ชิ้นที่ 1": "สกรีน 3 เลเยอร์" }), 50), 185 + 110 + 85 + 15);
const m2 = activeMatrix(p, sel2())!;
eq("ขนาด 3cm ไม่มีขายในเรทที่ 2 (หน้าร้านซ่อนให้)", matrixChoiceAvailable(m2, "ขนาดชิ้นที่ 1", "3cm"), false);
eq("ขนาด 5cm ยังอยู่ในเรทที่ 2", matrixChoiceAvailable(m2, "ขนาดชิ้นที่ 1", "5cm"), true);
const m1 = activeMatrix(p, sel(2, 6, 10, 7))!;
eq("เรทที่ 1 ยังมี 3cm ตามเดิม", matrixChoiceAvailable(m1, "ขนาดชิ้นที่ 1", "3cm"), true);

console.log("\n— ฐานคิดครั้งเดียวต่อชุด —");
eq("ฐาน 10cm ปลีก (+20) ไม่คูณจำนวนชิ้น", unitPriceFor(p, sel(5, 6, 10, 10), 1) - unitPriceFor(p, sel(5, 6, 10, 7), 1), 15);
eq("สกรีนฐาน +10 ครั้งเดียว", unitPriceFor(p, sel(5, 6, 10, 7, { "ฐานสแตนดี้": "สกรีนฐาน" }), 1) - unitPriceFor(p, sel(5, 6, 10, 7), 1), 10);

console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : "\n✅ ผ่านทั้งหมด");
process.exit(fail ? 1 : 0);
