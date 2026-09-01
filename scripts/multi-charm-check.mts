/**
 * ตรวจสินค้า "พวงกุญแจ หลายชิ้นใน 1 พวง" ด้วยฟังก์ชันจริงที่หน้าเว็บใช้ + ข้อมูลสดจาก DB
 * (ไม่แก้อะไร — อ่านอย่างเดียว)  npx tsx scripts/multi-charm-check.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  resolveSelections,
  allowedChoices,
  choiceExtraAtQty,
  tierQtyFor,
  optionFeeQty,
  optionVisible,
  artworkConsultOf,
  unitPriceFor,
  unitPriceParts,
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
const { data: row, error } = await sb.from("products").select("data").eq("id", "keyring-multi-charm").single();
if (error) throw error;
const p = row.data as Product;

const COUNT = "จำนวนชิ้นใน 1 พวง";
const HANG = "รูปแบบการห้อย";
const CHARM = "ติ่งห้อย";
const TYPE1 = "ประเภทอะคริลิค ชิ้นที่ 1";
const TYPE2 = "ประเภทอะคริลิค ชิ้นที่ 2";
const SPECIAL = "สีพิเศษ (โฮโลแกรม/กลิสเตอร์/สี)";
let fail = 0;
const ok = (name: string, pass: boolean) => {
  if (!pass) fail++;
  console.log(pass ? "✅" : "❌", name);
};
const group = (l: string) => p.options.find((o) => o.label === l)!;

console.log("── ความหนา / ประเภท / สี ──");
const sel1 = resolveSelections(p, {});
ok(`ความหนาเหลือ 3mm/2mm (ค่าเริ่มต้น "${sel1["ความหนาอะคริลิค"]}")`, allowedChoices(p, sel1, "ความหนาอะคริลิค").join() === "3mm,2mm");
const sel3mm = resolveSelections(p, { ความหนาอะคริลิค: "3mm", [TYPE1]: SPECIAL });
ok("3mm → ประเภทอะคริลิคเลือกได้ครบ 3 แบบ", allowedChoices(p, sel3mm, TYPE1).length === 3);
ok("3mm + สีพิเศษ → กลุ่มสีอะคริลิคโผล่ 44 เฉด", optionVisible(group("สีอะคริลิค ชิ้นที่ 1"), sel3mm) && allowedChoices(p, sel3mm, "สีอะคริลิค ชิ้นที่ 1").length === 44);
const sel2mm = resolveSelections(p, { ความหนาอะคริลิค: "2mm" });
ok("2mm → เหลืออะคริลิคใสอย่างเดียว", allowedChoices(p, sel2mm, TYPE1).join() === "อะคริลิคใส" && sel2mm[TYPE1] === "อะคริลิคใส");
const loop = resolveSelections(p, { ...sel3mm, "สีอะคริลิค ชิ้นที่ 1": "hologram-01" });
const toClear = resolveSelections(p, { ...loop, [TYPE1]: "อะคริลิคใส" });
const back = resolveSelections(p, { ...toClear, [TYPE1]: SPECIAL });
ok("สลับ สีพิเศษ → ใส → สีพิเศษ ได้ครบวง (ไม่ล็อกตาย)", toClear[TYPE1] === "อะคริลิคใส" && back[TYPE1] === SPECIAL);

console.log("\n── สเปครายชิ้น ──");
const minSel = resolveSelections(p, {});
ok(`ขั้นต่ำ 2 ชิ้นต่อพวง — ไม่มีตัวเลือก "1 ชิ้น" (ค่าเริ่มต้น "${minSel[COUNT]}")`,
  allowedChoices(p, minSel, COUNT)[0] === "2 ชิ้น" && minSel[COUNT] === "2 ชิ้น");
const two = resolveSelections(p, { ความหนาอะคริลิค: "3mm", [COUNT]: "2 ชิ้น" });
ok("พวง 2 ชิ้น → ถามขนาด/ประเภท/งานสกรีน ของชิ้นที่ 2", ["ขนาดชิ้นที่ 2", TYPE2, "งานสกรีน ชิ้นที่ 2"].every((l) => optionVisible(group(l), two)));
ok("พวง 2 ชิ้น → ยังไม่ถามชิ้นที่ 3", !optionVisible(group("ประเภทอะคริลิค ชิ้นที่ 3"), two));
const twoSpecial = resolveSelections(p, { ...two, [TYPE2]: SPECIAL });
ok("ชิ้นที่ 2 เลือกสีพิเศษ → เฉดของชิ้นที่ 2 โผล่ (ชิ้นที่ 1 ไม่โผล่)",
  optionVisible(group("สีอะคริลิค ชิ้นที่ 2"), twoSpecial) && !optionVisible(group("สีอะคริลิค ชิ้นที่ 1"), twoSpecial));
const twoThin = resolveSelections(p, { ความหนาอะคริลิค: "2mm", [COUNT]: "2 ชิ้น", [TYPE2]: SPECIAL });
ok("2mm → ชิ้นที่ 2 ก็ถูกบังคับเป็นอะคริลิคใส", twoThin[TYPE2] === "อะคริลิคใส");

console.log("\n── ราคาคิดตามสเปคของแต่ละชิ้นจริงไหม ──");
const baseSel = resolveSelections(p, {
  ความหนาอะคริลิค: "3mm",
  [COUNT]: "2 ชิ้น",
  "ขนาดชิ้นที่ 1": "5cm",
  "ขนาดชิ้นที่ 2": "5cm",
  "งานสกรีน ชิ้นที่ 1": "สกรีน 1 ด้าน (บน)",
  "งานสกรีน ชิ้นที่ 2": "สกรีน 1 ด้าน (บน)",
  [TYPE1]: "อะคริลิคใส",
  [TYPE2]: "อะคริลิคใส",
});
const bothClear = unitPriceFor(p, baseSel, 1);
const piece1Special = unitPriceFor(p, resolveSelections(p, { ...baseSel, [TYPE1]: SPECIAL, "สีอะคริลิค ชิ้นที่ 1": "hologram-01" }), 1);
console.log(`   ตัวหลัก 5cm + ติ่งห้อย 5cm · ใส = ฿${bothClear} · ตัวหลักสีพิเศษ = ฿${piece1Special}`);
ok("ตัวหลักเป็นสีพิเศษ ราคาขยับขึ้น (ตัวหลักคิดตามตารางเรท)", piece1Special > bothClear);
const bigger1 = unitPriceFor(p, resolveSelections(p, { ...baseSel, "ขนาดชิ้นที่ 1": "10cm" }), 1);
ok(`ตัวหลักใหญ่ขึ้น (10cm) ราคาขยับ ฿${bothClear} → ฿${bigger1}`, bigger1 > bothClear);
const screen1 = unitPriceFor(p, resolveSelections(p, { ...baseSel, "งานสกรีน ชิ้นที่ 1": "สกรีน 2 ด้าน (บน-บน)" }), 1);
ok(`ตัวหลักสกรีน 2 ด้าน ราคาขยับ ฿${bothClear} → ฿${screen1}`, screen1 > bothClear);
const bigger2 = unitPriceFor(p, resolveSelections(p, { ...baseSel, "ขนาดชิ้นที่ 2": "10cm" }), 1);
ok(`ติ่งห้อยใหญ่ขึ้น 5cm → 10cm ราคาขยับ ฿${bothClear} → ฿${bigger2} (+50 = cm ละ 10)`, bigger2 - bothClear === 50);
const parts = unitPriceParts(p, resolveSelections(p, { ...baseSel, "ขนาดชิ้นที่ 2": "10cm" }), 1);
ok("รายการค่าตัวเลือกแยกบรรทัด 'ขนาดชิ้นที่ 2' ให้ลูกค้าเห็น", parts.addOns.some((a) => a.label === "ขนาดชิ้นที่ 2" && a.amount > 0));

console.log("\n── รูปแบบการห้อย (ชิ้นในพวงทั้งหมด) ──");
const OTHER = "แบบอื่น ๆ (ติดต่อแอดมิน)";
ok("กลุ่มของเสริม 'ติ่งห้อย' และ 'การห้อยติ่งห้อย' ถอดออกแล้ว (ติ่งห้อย = ชิ้นที่ 2 ขึ้นไป)",
  !p.options.some((o) => [CHARM, "การห้อยติ่งห้อย"].includes(o.label)));
ok("ไม่มีกลุ่ม/กฎไหนค้างชี้กลุ่มที่ถอดไป",
  !p.options.some((o) =>
    [o.showWhen, ...(o.showWhenAll || []), ...(o.showWhenAny || [])].some((c) =>
      c && [CHARM, "การห้อยติ่งห้อย"].includes(c.label)
    )
  ) && !(p.rules || []).some((r) => [CHARM, "การห้อยติ่งห้อย"].includes(r.when?.label ?? "")));
ok("พวง 2 ชิ้น → ถามรูปแบบการห้อย", optionVisible(group(HANG), two));
ok("การ์ดรูปแบบการห้อยมีภาพครบ", group(HANG).choices.every((c) => !!c.imageSrc));
ok("เลือก 'แบบอื่น ๆ' → บังคับคุยแอดมิน", !!artworkConsultOf(p, resolveSelections(p, { ...two, [HANG]: OTHER })));
ok("เลือกแบบปกติ → สั่งได้เลย", !artworkConsultOf(p, resolveSelections(p, { ...two, [HANG]: "ห้อยด้านข้าง" })));

console.log("\n── ชุดตัวเลือกรายชิ้น (กรอบ + หัวชุด: ตัวหลัก / ติ่งห้อย ชิ้นที่ k) ──");
const sectionOf = (l: string) => group(l).section;
const trimOf = (l: string) => group(l).sectionTrim;
ok("ชิ้นที่ 1 = ชุด 'ตัวหลัก'", ["ขนาดชิ้นที่ 1", TYPE1, "งานสกรีน ชิ้นที่ 1"].every((l) => sectionOf(l) === "ตัวหลัก"));
ok("ชิ้นที่ 2 = ชุด 'ติ่งห้อย ชิ้นที่ 1'", ["ขนาดชิ้นที่ 2", TYPE2, "งานสกรีน ชิ้นที่ 2"].every((l) => sectionOf(l) === "ติ่งห้อย ชิ้นที่ 1"));
ok("ชิ้นที่ 10 = ชุด 'ติ่งห้อย ชิ้นที่ 9'", sectionOf("ขนาดชิ้นที่ 10") === "ติ่งห้อย ชิ้นที่ 9");
// หัวชุดโชว์ชื่อใหม่ แต่หัวข้อในกรอบยังตัดด้วยชื่อกลุ่มเดิม ("ขนาดชิ้นที่ 2" → "ขนาด")
ok("ทุกกลุ่มในชุดตั้ง sectionTrim ให้ตัดชื่อกลุ่มเหลือคำสั้น",
  p.options.filter((o) => o.section).every((o) => !!o.sectionTrim && o.label.endsWith(o.sectionTrim!)));
ok("กลุ่มนอกชุดไม่ติดชุด", [HANG, COUNT].every((l) => !sectionOf(l)));
ok("ชื่อกลุ่มเต็มยังอยู่ (ตะกร้า/ใบงานอ่านออกว่าชิ้นไหน)", p.options.some((o) => o.label === "ขนาดชิ้นที่ 2") && trimOf("ขนาดชิ้นที่ 2") === "ชิ้นที่ 2");

console.log("\n── เรทติ่งห้อย (ชิ้นที่ 2 ขึ้นไป · เริ่ม 2 ซม. · 20/15/12 ตามจำนวนติ่งห้อยรวม) ──");
const SIZE2 = "ขนาดชิ้นที่ 2";
const charmSize = group(SIZE2);
ok("ติ่งห้อยเลิกดึงราคาจากตารางเรทของชิ้นที่ 1", !charmSize.priceAsDriver && !charmSize.priceAsDriverAlso);
// พวงละ 3 ชิ้น = ติ่งห้อยพวงละ 2 ติ่ง → สั่ง 1 พวง = 2 ติ่ง (ปลีก) · 10 พวง = 20 ติ่ง · 15 พวง = 30 ติ่ง
const selC = resolveSelections(p, { [COUNT]: "3 ชิ้น" });
ok('ค่าติ่งห้อยนับเรทจาก "จำนวนติ่งห้อยรวม" (extraQtyScope)', charmSize.extraQtyScope === "extraPieces");
const feeAt = (name: string, units: number) =>
  choiceExtraAtQty(charmSize, selC, name, optionFeeQty(p, charmSize, selC, tierQtyFor(p, selC, units)));
ok(`ติ่งห้อย 2cm = ${feeAt("2cm", 1)}/${feeAt("2cm", 10)}/${feeAt("2cm", 15)} บาท (1 / 10 / 15 พวง = 2 / 20 / 30 ติ่ง)`,
  feeAt("2cm", 1) === 20 && feeAt("2cm", 10) === 15 && feeAt("2cm", 15) === 12);
ok(`ติ่งห้อย 3cm = ${feeAt("3cm", 1)}/${feeAt("3cm", 10)}/${feeAt("3cm", 15)} บาท (ใหญ่กว่า 2cm บวก cm ละ 10)`,
  feeAt("3cm", 1) === 30 && feeAt("3cm", 10) === 25 && feeAt("3cm", 15) === 22);
ok(`ติ่งห้อย 10cm = ${feeAt("10cm", 1)} บาท (ปลีก)`, feeAt("10cm", 1) === 100);
const oneCharm2cm = resolveSelections(p, { ...baseSel, "ขนาดชิ้นที่ 2": "2cm" });
const charm2 = unitPriceFor(p, oneCharm2cm, 1);
const charm10 = unitPriceFor(p, resolveSelections(p, { ...baseSel, "ขนาดชิ้นที่ 2": "10cm" }), 1);
ok(`ตัวหลัก 5cm + ติ่งห้อย 2cm = ฿${charm2} · ติ่งห้อย 10cm = ฿${charm10} (ต่างกัน 80 = cm ละ 10)`, charm10 - charm2 === 80);
const partsC = unitPriceParts(p, oneCharm2cm, 1);
ok("ค่าติ่งห้อยแยกบรรทัดให้ลูกค้าเห็น (+฿20)", partsC.addOns.some((a) => a.label === SIZE2 && a.amount === 20));
// เนื้อ/งานสกรีนของติ่งห้อยไม่บวกราคาแล้ว (เดิมบวกผ่านตารางเรท) — บันทึกไว้ให้เห็นชัดว่าตั้งใจ
const charmSpecial = unitPriceFor(p, resolveSelections(p, { ...oneCharm2cm, [TYPE2]: SPECIAL, "สีอะคริลิค ชิ้นที่ 2": "hologram-01" }), 1);
ok(`ติ่งห้อยเลือกสีพิเศษ/สกรีน 2 ด้าน = ไม่บวกเพิ่ม (฿${charmSpecial})`, charmSpecial === unitPriceFor(p, oneCharm2cm, 1));

console.log("\n── ช่วงราคาคิดตามจำนวนพวง ไม่ใช่ชิ้นรวม (1 ก.ย. 69) ──");
const selQ = resolveSelections(p, {
  ...baseSel,
  "ขนาดชิ้นที่ 2": "2cm",
  [HANG]: "ห้อยด้านข้าง",
  ตะขอ: "F ตะขอสปริง 12×35mm (เงิน/ทอง/โรสโกลด์/รุ้ง)", // + สีตะขอ · โลหะ = สีเงิน +฿8 (ตามใบเสนอราคา)
});
ok("สั่ง 15 พวง พวงละ 2 ชิ้น → เรท 15 (ไม่ใช่ 30)", tierQtyFor(p, selQ, 15) === 15);
const q15 = unitPriceParts(p, selQ, 15);
const q30 = unitPriceParts(p, selQ, 30);
ok(`15 พวง = ฿${q15.total}/พวง (ฐาน ฿${q15.base} + ติ่งห้อย 2cm ฿15 + ตะขอ ฿8) — ตรงใบเสนอราคาจริง`, q15.total === 82);
ok(`30 พวง = ฿${q30.total}/พวง (ฐาน ฿${q30.base} + ติ่งห้อย 2cm ฿12 + ตะขอ ฿8) — ตรงใบเสนอราคาจริง`, q30.total === 75);
ok("ป้ายช่วงราคาในตารางเปลี่ยนเป็น 'พวง'", (p.pricing?.tiers ?? []).every((t) => !/ชิ้น/.test(t.label ?? "")));

console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : "\n✅ ผ่านทั้งหมด");
process.exit(fail ? 1 : 0);
