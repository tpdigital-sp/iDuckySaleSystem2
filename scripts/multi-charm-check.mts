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
  unitAddOnBreakdown,
  needsQuote,
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
// (เฉพาะชุดรายชิ้น — ชุด "ทั้งพวง"/"ตะขอ + การห้อย" ที่เพิ่มทีหลัง ชื่อกลุ่มอ่านออกอยู่แล้ว ไม่ต้องตัด)
ok("ทุกกลุ่มในชุดรายชิ้นตั้ง sectionTrim ให้ตัดชื่อกลุ่มเหลือคำสั้น",
  p.options.filter((o) => o.section && /ชิ้นที่ \d+$/.test(o.section) || o.section === "ตัวหลัก")
    .every((o) => !!o.sectionTrim && o.label.endsWith(o.sectionTrim!)));
ok("ทุกกลุ่มอยู่ในชุดครบ (ทั้งพวง/ตัวหลัก/ติ่งห้อย/ตะขอ + การห้อย)",
  [HANG, COUNT].every((l) => ["ทั้งพวง", "ตะขอ + การห้อย"].includes(sectionOf(l) ?? "")));
// 7 ก.ย. 69 — จัดหน้าให้กระชับ (multi-charm-tidy-dropdown.mjs): ชุดติ่งห้อยเริ่มแบบหุบ
ok("ชุดติ่งห้อยทุกชุดติดธง sectionClosed (เริ่มแบบหุบ)",
  p.options.filter((o) => /^ติ่งห้อย ชิ้นที่ \d+$/.test(o.section ?? "")).every((o) => o.sectionClosed === true) &&
  // 36 กลุ่มสเปค + 18 ช่องกรอกกำหนดขนาดเอง (8 ก.ย. 69)
  p.options.filter((o) => /^ติ่งห้อย ชิ้นที่ \d+$/.test(o.section ?? "")).length === 54);
ok("ชุดอื่นไม่ติด sectionClosed (ทั้งพวง/ตัวหลัก/ตะขอ ยังกางตอนเปิดหน้า)",
  !p.options.some((o) => o.sectionClosed && !/^ติ่งห้อย ชิ้นที่ \d+$/.test(o.section ?? "")));
ok("รูปแบบการห้อย + รับตะขอไหม เป็นเมนูเลื่อน (dropdown) และคำอธิบายย้ายไป selectedNote",
  [HANG, "รับตะขอไหม"].every((l) =>
    group(l).display === "dropdown" &&
    group(l).choices.every((c) => !c.desc || (typeof c.selectedNote === "string" && c.selectedNote.length > 0))
  ));
ok("ชื่อกลุ่มเต็มยังอยู่ (ตะกร้า/ใบงานอ่านออกว่าชิ้นไหน)", p.options.some((o) => o.label === "ขนาดชิ้นที่ 2") && trimOf("ขนาดชิ้นที่ 2") === "ชิ้นที่ 2");

console.log("\n── เรทติ่งห้อย (ชิ้นที่ 2 ขึ้นไป · เริ่ม 2 ซม. · 20/15/12 ตามจำนวนพวง) ──");
const SIZE2 = "ขนาดชิ้นที่ 2";
const charmSize = group(SIZE2);
ok("ติ่งห้อยเลิกดึงราคาจากตารางเรทของชิ้นที่ 1", !charmSize.priceAsDriver && !charmSize.priceAsDriverAlso);
// ⚠️ 2 ก.ย. 69 — ค่าติ่งห้อยนับช่วงราคาจาก "จำนวนพวง" เหมือนตัวหลัก (ไม่ใช่จำนวนติ่งห้อยรวม)
// ใบเสนอราคาจริง: 15 พวง พวงละ 3 ชิ้น = ติ่งละ ฿15 ทั้งที่มี 30 ติ่ง (ถ้านับติ่งจะตกไปขั้น 30+ = ฿12 ซึ่งผิด)
const selC = resolveSelections(p, { [COUNT]: "3 ชิ้น" });
ok("ค่าติ่งห้อยนับเรทจากจำนวนพวง (ไม่มี extraQtyScope)", !charmSize.extraQtyScope);
const feeAt = (name: string, units: number) =>
  choiceExtraAtQty(charmSize, selC, name, optionFeeQty(p, charmSize, selC, tierQtyFor(p, selC, units)));
ok(`ติ่งห้อย 2cm = ${feeAt("2cm", 1)}/${feeAt("2cm", 15)}/${feeAt("2cm", 30)} บาท (1 / 15 / 30 พวง — พวงละกี่ติ่งก็ไม่เปลี่ยนขั้น)`,
  feeAt("2cm", 1) === 20 && feeAt("2cm", 15) === 15 && feeAt("2cm", 30) === 12);
ok(`ติ่งห้อย 3cm = ${feeAt("3cm", 1)}/${feeAt("3cm", 15)}/${feeAt("3cm", 30)} บาท (ใหญ่กว่า 2cm บวก cm ละ 10)`,
  feeAt("3cm", 1) === 30 && feeAt("3cm", 15) === 25 && feeAt("3cm", 30) === 22);
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
// พวงละ 3 ชิ้น (ตัวหลัก 5cm + ติ่งห้อย 2cm × 2 + ตะขอ F เงิน) — ใบเสนอราคาจริงที่ผู้ใช้ส่งมา 2 ก.ย. 69
const sel3 = resolveSelections(p, { ...selQ, [COUNT]: "3 ชิ้น", "ขนาดชิ้นที่ 3": "2cm" });
for (const [units, want, note] of [
  [1, 140, "100 + 20 + 20"],
  [15, 97, "59 + 15 + 15 + 8"],
  [30, 87, "55 + 12 + 12 + 8"],
] as [number, number, string][]) {
  const got = unitPriceParts(p, sel3, units);
  ok(`${units} พวง พวงละ 3 ชิ้น = ฿${got.total}/พวง (${note}) — ตรงใบเสนอราคาจริง`, got.total === want);
}

console.log("\n── มากกว่า 10 ชิ้นในพวงเดียว = แอดมินคิดราคาให้ (3 ก.ย. 69) ──");
const OVER10 = "มากกว่า 10 ชิ้น (แอดมินคิดราคาให้)";
const overChoice = group(COUNT).choices.find((c) => c.name === OVER10);
ok(`กลุ่ม "${COUNT}" มีตัวเลือก "${OVER10}" ติดธง askPrice`, overChoice?.askPrice === true);
const selOver = resolveSelections(p, { ...selQ, [COUNT]: OVER10 });
ok("เลือกมากกว่า 10 ชิ้น → ต้องตีราคา (needsQuote)", needsQuote(p, selOver));
ok("เลือกมากกว่า 10 ชิ้น → ราคาเป็น 0 (ตะกร้าขึ้น 💬 รอตีราคา)", unitPriceFor(p, selOver, 1) === 0);
ok("เลือกมากกว่า 10 ชิ้น → ชุดสเปคชิ้นที่ 2 ไม่โชว์ (คุยสเปคกับแอดมินแทน)", !optionVisible(group("ขนาดชิ้นที่ 2"), selOver));
ok("เลือกมากกว่า 10 ชิ้น → รูปแบบการห้อยไม่โชว์", !optionVisible(group(HANG), selOver));
ok("เลือก 3 ชิ้นตามปกติ → ไม่ติดตีราคา ราคายังคิดเองได้", !needsQuote(p, sel3) && unitPriceFor(p, sel3, 15) > 0);
ok("ธงการ์ดหน้ารายการ quoteOption = true", (p as { quoteOption?: boolean }).quoteOption === true);

console.log("\n── 📐 กำหนดขนาดเองได้ทุกชิ้น (8 ก.ย. 69 — ตรรกะเดียวกับพวงกุญแจ sizeInput) ──");
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const wL = (k: number) => `ขนาดกำหนดเอง (กว้าง) ชิ้นที่ ${k}`;
const hL = (k: number) => `ขนาดกำหนดเอง (สูง) ชิ้นที่ ${k}`;
ok("ขนาดชิ้นที่ 1-10 ทุกกลุ่มมีตัวเลือกกำหนดขนาดเอง + sizeInput ชี้ช่องกรอกของชิ้นตัวเอง",
  Array.from({ length: 10 }, (_, i) => i + 1).every((k) => {
    const g = group(`ขนาดชิ้นที่ ${k}`);
    return g.choices.some((c) => c.name === CUSTOM) && g.sizeInput?.choice === CUSTOM && g.sizeInput.widthLabel === wL(k) && g.sizeInput.heightLabel === hL(k) && g.sizeInput.askOver === 10;
  }));
ok("ช่องกรอกกว้าง/สูงของทุกชิ้นเป็น input บังคับกรอก อยู่ชุดเดียวกับกลุ่มขนาด",
  Array.from({ length: 10 }, (_, i) => i + 1).every((k) => [wL(k), hL(k)].every((l) => { const g = group(l); return g?.display === "input" && g.standardInput === true && g.input?.required === true && g.section === group(`ขนาดชิ้นที่ ${k}`).section; })));
// ชิ้นที่ 1 (แกนตาราง) 3.5×2 → เกาะแถว 3cm · ราคาต้องเท่าเลือก 3cm ตรง ๆ
const std3 = resolveSelections(p, { ...selQ, "ขนาดชิ้นที่ 1": "3cm" });
const cus1 = resolveSelections(p, { ...selQ, "ขนาดชิ้นที่ 1": CUSTOM, [wL(1)]: "3.5 ซม.", [hL(1)]: "2 ซม." });
ok("ชิ้นที่ 1 เลือกกำหนดขนาดเอง → ช่องกรอกกว้าง/สูงของชิ้นที่ 1 โผล่ (ชิ้นที่ 2 ไม่โผล่)",
  optionVisible(group(wL(1)), cus1) && optionVisible(group(hL(1)), cus1) && !optionVisible(group(wL(2)), cus1));
ok(`ชิ้นที่ 1 กรอก 3.5×2 ซม. → คิดเท่าแถว 3cm (฿${unitPriceFor(p, cus1, 15)} = ฿${unitPriceFor(p, std3, 15)} ที่ 15 พวง)`,
  unitPriceFor(p, cus1, 15) === unitPriceFor(p, std3, 15) && unitPriceFor(p, cus1, 1) === unitPriceFor(p, std3, 1) && !needsQuote(p, cus1));
const cus1b = resolveSelections(p, { ...cus1, [wL(1)]: "3.6 ซม." });
const std4 = resolveSelections(p, { ...selQ, "ขนาดชิ้นที่ 1": "4cm" });
ok(`ชิ้นที่ 1 กรอก 3.6×2 → ขยับเป็นแถว 4cm (฿${unitPriceFor(p, cus1b, 15)} = ฿${unitPriceFor(p, std4, 15)})`, unitPriceFor(p, cus1b, 15) === unitPriceFor(p, std4, 15));
// ติ่งห้อย (ชิ้นที่ 2) กำหนดขนาดเอง 4.5×3 → +฿ เท่าแถว 4cm (15 พวง = ฿35)
const charm4 = resolveSelections(p, { ...selQ, "ขนาดชิ้นที่ 2": "4cm" });
const cus2 = resolveSelections(p, { ...selQ, "ขนาดชิ้นที่ 2": CUSTOM, [wL(2)]: "4.5", [hL(2)]: "3" });
ok(`ติ่งห้อยชิ้นที่ 2 กรอก 4.5×3 → +฿ เท่าแถว 4cm (฿${unitPriceFor(p, cus2, 15)} = ฿${unitPriceFor(p, charm4, 15)} ที่ 15 พวง · 1 พวง ฿${unitPriceFor(p, cus2, 1)})`,
  unitPriceFor(p, cus2, 15) === unitPriceFor(p, charm4, 15) && unitPriceFor(p, cus2, 1) === unitPriceFor(p, charm4, 1) && unitPriceFor(p, cus2, 15) > unitPriceFor(p, selQ, 15));
ok("ติ่งห้อยกำหนดขนาดเอง → บรรทัด Add on บอกขนาดที่กรอก + แถวที่คิดเท่า",
  unitAddOnBreakdown(p, cus2, 15).some((l) => /ขนาดชิ้นที่ 2 4.5×3 ซม\. \(คิดเท่า 4cm\)/.test(l.label) && l.amount === 35));
// ทั้งตัวหลักและติ่งห้อย 2 ชิ้นกำหนดขนาดเองพร้อมกัน — ทุกกลุ่มต้องถูกคิดครบ (จุดที่โค้ดเก่ารองรับแค่กลุ่มแรก)
const std3set = resolveSelections(p, { ...selQ, [COUNT]: "3 ชิ้น", "ขนาดชิ้นที่ 1": "5cm", "ขนาดชิ้นที่ 2": "3cm", "ขนาดชิ้นที่ 3": "6cm" });
const cusAll = resolveSelections(p, { ...selQ, [COUNT]: "3 ชิ้น", "ขนาดชิ้นที่ 1": CUSTOM, [wL(1)]: "5", [hL(1)]: "4.5", "ขนาดชิ้นที่ 2": CUSTOM, [wL(2)]: "2.5", [hL(2)]: "3", "ขนาดชิ้นที่ 3": CUSTOM, [wL(3)]: "6", [hL(3)]: "1" });
ok(`3 ชิ้นกำหนดขนาดเองพร้อมกัน (5×4.5 · 2.5×3 · 6×1) = ฿${unitPriceFor(p, cusAll, 15)} เท่า 5cm+3cm+6cm (฿${unitPriceFor(p, std3set, 15)}) ที่ 15 พวง`,
  unitPriceFor(p, cusAll, 15) === unitPriceFor(p, std3set, 15) && unitPriceFor(p, cusAll, 1) === unitPriceFor(p, std3set, 1));
ok("กำหนดขนาดเองแล้วชุดสเปคอื่นของชิ้นนั้นยังโผล่ตามปกติ (ประเภท/งานสกรีน ชิ้นที่ 2)",
  optionVisible(group(TYPE2), cus2) && optionVisible(group("งานสกรีน ชิ้นที่ 2"), cus2));
// เกิน 10 ซม. = รอแอดมินตีราคา (ชิ้นไหนก็ได้)
const over2 = resolveSelections(p, { ...selQ, "ขนาดชิ้นที่ 2": CUSTOM, [wL(2)]: "10.6", [hL(2)]: "3" });
ok("ติ่งห้อยกรอก 10.6 ซม. → ต้องตีราคา (needsQuote) ราคาเป็น 0", needsQuote(p, over2) && unitPriceFor(p, over2, 15) === 0);
const ten = resolveSelections(p, { ...selQ, "ขนาดชิ้นที่ 1": CUSTOM, [wL(1)]: "10.5", [hL(1)]: "2" });
ok("ชิ้นที่ 1 กรอก 10.5 ซม. → ผ่อนเศษยังเกาะแถว 10cm ไม่ตกไปตีราคา", !needsQuote(p, ten) && unitPriceFor(p, ten, 15) === unitPriceFor(p, resolveSelections(p, { ...selQ, "ขนาดชิ้นที่ 1": "10cm" }), 15));
// ชิ้นที่ 5 ซ่อนอยู่ (พวง 2 ชิ้น) แต่มีค่า custom ค้าง → ช่องกรอกต้องไม่โผล่/ไม่บังคับกรอก
const stale = resolveSelections(p, { ...selQ, [COUNT]: "2 ชิ้น", "ขนาดชิ้นที่ 5": CUSTOM });
ok("ชิ้นที่ 5 ถูกซ่อน (พวง 2 ชิ้น) แม้ค่ากำหนดขนาดเองค้างอยู่ → ช่องกรอกชิ้นที่ 5 ไม่โผล่", !optionVisible(group(wL(5)), stale) && !needsQuote(p, stale));

console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : "\n✅ ผ่านทั้งหมด");
process.exit(fail ? 1 : 0);
