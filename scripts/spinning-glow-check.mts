/**
 * ตรวจสินค้า Spinning Glow (new-muzeb6rz-9639) ด้วยฟังก์ชันคิดราคาจริงของระบบ
 *   npx tsx scripts/spinning-glow-check.mts
 * เทียบราคาต่อชิ้นกับตารางบนเว็บ pricelists + ภาพตัวเลือกสลับตามแบบงาน + กลุ่มซ่อนไม่ติดไปกับตะกร้า
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  unitPriceFor,
  resolveSelections,
  orderableSelections,
  choiceImage,
  priceRange,
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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: row, error } = await sb.from("products").select("data").eq("id", "new-muzeb6rz-9639").single();
if (error) throw error;
const p = row.data as Product;

let fails = 0;
const eq = (what: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "✓" : "✗"} ${what}: ${JSON.stringify(got)}${ok ? "" : ` (ต้องการ ${JSON.stringify(want)})`}`);
};

const sel = (o: Record<string, string>) =>
  resolveSelections(p, {
    "ไฟ LED": "มีไฟ",
    "แบบงาน": "พวงกุญแจ",
    "ขนาดชิ้นที่ 1 (ชิ้นล่าง)": "5cm",
    "ขนาดชิ้นที่ 2 (ชิ้นบน)": "2cm",
    "โซ่ไข่ปลา": "โซ่ไข่ปลาสีเงิน",
    "แม่เหล็ก": "1 จุด",
    ...o,
  });

// ตารางเว็บ: มีไฟ 5cm 210/148/140/130 · ไม่มีไฟ 10cm 230/134/130/125
// ค่าเริ่มต้นของ sel = ชิ้นบน 2cm (ต้องมีทุกชิ้น) → +20 / +15 / +12 ตามช่วง
eq("มีไฟ 5cm + บน 2cm ×1", unitPriceFor(p, sel({}), 1), 230);
eq("มีไฟ 5cm + บน 2cm ×20", unitPriceFor(p, sel({}), 20), 163);
eq("มีไฟ 5cm + บน 2cm ×35", unitPriceFor(p, sel({}), 35), 152);
eq("มีไฟ 5cm + บน 2cm ×50", unitPriceFor(p, sel({}), 50), 142);
eq("ไม่มีไฟ 10cm ×1", unitPriceFor(p, sel({ "ไฟ LED": "ไม่มีไฟ", "ขนาดชิ้นที่ 1 (ชิ้นล่าง)": "10cm" }), 1), 250);
eq("ไม่มีไฟ 10cm ×100", unitPriceFor(p, sel({ "ไฟ LED": "ไม่มีไฟ", "ขนาดชิ้นที่ 1 (ชิ้นล่าง)": "10cm" }), 100), 137);
// ชิ้นบน ขนาดแยกจากชิ้นล่าง (ชีตเจ้าของร้าน 2-10cm): ล่าง 8cm + บน 5cm ×1 = 260+50 · ×20 = 208+45 · ×50 = 190+42 · ล่าง 5cm + บน 10cm ×1 = 210+100 · บน 12cm ×1 = 210+116
const TOP = "ขนาดชิ้นที่ 2 (ชิ้นบน)";
eq("ล่าง 8cm + บน 5cm ×1", unitPriceFor(p, sel({ "ขนาดชิ้นที่ 1 (ชิ้นล่าง)": "8cm", [TOP]: "5cm" }), 1), 310);
eq("ล่าง 8cm + บน 5cm ×20", unitPriceFor(p, sel({ "ขนาดชิ้นที่ 1 (ชิ้นล่าง)": "8cm", [TOP]: "5cm" }), 20), 253);
eq("ล่าง 8cm + บน 5cm ×50", unitPriceFor(p, sel({ "ขนาดชิ้นที่ 1 (ชิ้นล่าง)": "8cm", [TOP]: "5cm" }), 50), 232);
eq("ล่าง 5cm + บน 10cm ×1", unitPriceFor(p, sel({ [TOP]: "10cm" }), 1), 310);
eq("ล่าง 5cm + บน 12cm ×1", unitPriceFor(p, sel({ [TOP]: "12cm" }), 1), 326);
eq("ชิ้นบนมีขนาด 2-15cm", p.options.find((o) => o.label === TOP)?.choices.map((c) => c.name).join(","), "2cm,3cm,4cm,5cm,6cm,7cm,8cm,9cm,10cm,11cm,12cm,13cm,14cm,15cm,📐 กำหนดขนาดเอง (ระบุด้านที่ยาวที่สุด)");
// 📐 ระบุขนาดเอง: ล่าง 7.6 → แถว 8cm (260) · 7.5 → แถว 7cm (235) · บน 2.5 → แถว 2cm (+20) · บน 4.6 → แถว 5cm (+50) · เกิน 15 → ราคา 0 รอแอดมิน
const CUST = "📐 กำหนดขนาดเอง (ระบุด้านที่ยาวที่สุด)";
const CB = "ชิ้นล่าง กำหนดขนาดเอง (ด้านที่ยาวที่สุด)";
const CT = "ชิ้นบน กำหนดขนาดเอง (ด้านที่ยาวที่สุด)";
eq("ล่างกำหนดเอง 7.6 → 8cm ×1", unitPriceFor(p, sel({ "ขนาดชิ้นที่ 1 (ชิ้นล่าง)": CUST, [CB]: "7.6" }), 1), 280);
eq("ล่างกำหนดเอง 7.5 → 7cm ×1", unitPriceFor(p, sel({ "ขนาดชิ้นที่ 1 (ชิ้นล่าง)": CUST, [CB]: "7.5" }), 1), 255);
eq("บนกำหนดเอง 2.5 → 2cm ×1", unitPriceFor(p, sel({ [TOP]: CUST, [CT]: "2.5" }), 1), 230);
eq("บนกำหนดเอง 4.6 → 5cm ×1", unitPriceFor(p, sel({ [TOP]: CUST, [CT]: "4.6" }), 1), 260);
eq("ล่างกำหนดเอง 20 → รอแอดมิน", unitPriceFor(p, sel({ "ขนาดชิ้นที่ 1 (ชิ้นล่าง)": CUST, [CB]: "20" }), 1), 0);
eq("ไม่มีตัวเลือก ไม่เพิ่ม ในกลุ่มชิ้นบน", p.options.find((o) => o.label === TOP)?.choices.some((c) => /ไม่เพิ่ม/.test(c.name)), false);
// แม่เหล็ก จุดละ 10 (1 จุด +10 · 2 จุด +20) · โซ่สี: 1-10 ชิ้นฟรี · 11+ เส้นละ 3 (เฉพาะพวงกุญแจ)
eq("ไม่มีไฟ แม่เหล็ก 2 จุด 5cm ×30", unitPriceFor(p, sel({ "ไฟ LED": "ไม่มีไฟ", "แบบงาน": "แม่เหล็ก", "แม่เหล็ก": "2 จุด" }), 30), 112);
// โซ่สี: ราคาอยู่ที่กลุ่มสี (คลัง hook-color-c) +3 · แบบเงา +4 — ตัวเลือก "โซ่ไข่ปลาสี" เองไม่บวก
const CHAIN_COLOR = "สีตะขอ C (โซ่ไข่ปลา)";
eq("มีไฟ พวงกุญแจ โซ่สี C1 ×1", unitPriceFor(p, sel({ "โซ่ไข่ปลา": "โซ่ไข่ปลาสี", [CHAIN_COLOR]: "C1 สีดำ" }), 1), 230);
eq("มีไฟ พวงกุญแจ โซ่สี C29 เงา ×1", unitPriceFor(p, sel({ "โซ่ไข่ปลา": "โซ่ไข่ปลาสี", [CHAIN_COLOR]: "C29 สีชมพูเงา" }), 1), 230);
eq("มีไฟ พวงกุญแจ โซ่สี C1 ×11", unitPriceFor(p, sel({ "โซ่ไข่ปลา": "โซ่ไข่ปลาสี", [CHAIN_COLOR]: "C1 สีดำ" }), 11), 166);
// ยอดปลีกตามชีตเจ้าของร้าน (ล่างไม่เกิน 6cm + บน 2cm · 1 ชิ้น): พวงกุญแจ 230/190 · ติดตู้เย็น 240/200
eq("ชีตปลีก พวงกุญแจ มีไฟ", unitPriceFor(p, sel({ "ขนาดชิ้นที่ 1 (ชิ้นล่าง)": "6cm" }), 1), 230);
eq("ชีตปลีก พวงกุญแจ ไม่มีไฟ", unitPriceFor(p, sel({ "ไฟ LED": "ไม่มีไฟ", "ขนาดชิ้นที่ 1 (ชิ้นล่าง)": "6cm" }), 1), 190);
eq("ชีตปลีก ติดตู้เย็น มีไฟ", unitPriceFor(p, sel({ "แบบงาน": "แม่เหล็ก", "ขนาดชิ้นที่ 1 (ชิ้นล่าง)": "6cm" }), 1), 240);
eq("ชีตปลีก ติดตู้เย็น ไม่มีไฟ", unitPriceFor(p, sel({ "ไฟ LED": "ไม่มีไฟ", "แบบงาน": "แม่เหล็ก", "ขนาดชิ้นที่ 1 (ชิ้นล่าง)": "6cm" }), 1), 200);
eq("โซ่เงิน: ไม่มีคีย์สีโซ่", CHAIN_COLOR in orderableSelections(p, sel({})), false);
eq("โซ่สี: มีคีย์สีโซ่", orderableSelections(p, sel({ "โซ่ไข่ปลา": "โซ่ไข่ปลาสี", [CHAIN_COLOR]: "C4 สีขาว" }))[CHAIN_COLOR], "C4 สีขาว");
eq("แม่เหล็ก: ไม่มีคีย์สีโซ่", CHAIN_COLOR in orderableSelections(p, sel({ "แบบงาน": "แม่เหล็ก", "โซ่ไข่ปลา": "โซ่ไข่ปลาสี" })), false);
eq("กลุ่มสีโซ่ลิงก์คลัง", p.options.find((o) => o.label === CHAIN_COLOR)?.presetId, "hook-color-c");
// 11 cm ขึ้นไป = เรทปลีก + เซนละ 25/15 ทุกจำนวน
eq("มีไฟ 12cm ×100", unitPriceFor(p, sel({ "ขนาดชิ้นที่ 1 (ชิ้นล่าง)": "12cm" }), 100), 372);
eq("ไม่มีไฟ 11cm ×1", unitPriceFor(p, sel({ "ไฟ LED": "ไม่มีไฟ", "ขนาดชิ้นที่ 1 (ชิ้นล่าง)": "11cm" }), 1), 265);

// กลุ่มซ่อน (แม่เหล็ก ตอนเลือกพวงกุญแจ) ต้องไม่ติดไปกับตะกร้า · โซ่ต้องไม่ติดตอนเลือกแม่เหล็ก
const ordK = orderableSelections(p, sel({}));
eq("พวงกุญแจ: ไม่มีคีย์ แม่เหล็ก", "แม่เหล็ก" in ordK, false);
eq("พวงกุญแจ: มีคีย์ โซ่ไข่ปลา", ordK["โซ่ไข่ปลา"], "โซ่ไข่ปลาสีเงิน");
const ordM = orderableSelections(p, sel({ "แบบงาน": "แม่เหล็ก" }));
eq("แม่เหล็ก: ไม่มีคีย์ โซ่ไข่ปลา", "โซ่ไข่ปลา" in ordM, false);
eq("แม่เหล็ก: มีคีย์ แม่เหล็ก", ordM["แม่เหล็ก"], "1 จุด");

// ภาพตัวเลือกสลับตามแบบงาน/ไฟ (URL ต้องอยู่ในแกลเลอรี)
const gallery = new Set(p.images.map((i) => i.src));
const light = p.options.find((o) => o.label === "ไฟ LED")!;
const work = p.options.find((o) => o.label === "แบบงาน")!;
const on = light.choices.find((c) => c.name === "มีไฟ")!;
const off = light.choices.find((c) => c.name === "ไม่มีไฟ")!;
const mag = work.choices.find((c) => c.name === "แม่เหล็ก")!;
const tail = (u?: string) => u?.split("/").pop();
eq("มีไฟ + พวงกุญแจ → รูป", tail(choiceImage(on, sel({}))), "01-keyring-glow-v1.jpg");
eq("มีไฟ + แม่เหล็ก → รูป", tail(choiceImage(on, sel({ "แบบงาน": "แม่เหล็ก" }))), "03-magnet-glow-v1.jpg");
eq("ไม่มีไฟ + แม่เหล็ก → รูป", tail(choiceImage(off, sel({ "แบบงาน": "แม่เหล็ก" }))), "04-magnet-plain-v1.jpg");
eq("แม่เหล็ก + ไม่มีไฟ → รูป", tail(choiceImage(mag, sel({ "ไฟ LED": "ไม่มีไฟ" }))), "04-magnet-plain-v1.jpg");
const allImgs = p.options.flatMap((o) => [o.imageSrc, ...o.choices.flatMap((c) => [c.imageSrc, ...(c.imageWhen ?? []).map((w) => w.imageSrc)])]).filter(Boolean) as string[];
eq("ภาพตัวเลือกทุกรูปอยู่ในแกลเลอรี", allImgs.every((u) => gallery.has(u)), true);

// ช่วงราคาที่เก็บไว้ตรงกับที่ระบบคำนวณ
const r = priceRange(p);
eq("priceMin/priceMax", [p.priceMin, p.priceMax], [r.min, r.max]);

// รูปบน storage ตอบ 200 ครบ
for (const img of p.images) {
  const res = await fetch(img.src!, { method: "HEAD" });
  if (!res.ok) {
    fails++;
    console.log(`✗ รูป ${tail(img.src)} → ${res.status}`);
  }
}
console.log(fails ? `\n✗ ไม่ผ่าน ${fails} ข้อ` : "\n✓ ผ่านทุกข้อ");
process.exit(fails ? 1 : 0);
