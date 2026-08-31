/**
 * ตรวจสินค้า "พวงกุญแจ หลายชิ้นใน 1 พวง" ด้วยฟังก์ชันจริงที่หน้าเว็บใช้ + ข้อมูลสดจาก DB
 * (ไม่แก้อะไร — อ่านอย่างเดียว)  npx tsx scripts/multi-charm-check.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  resolveSelections,
  allowedChoices,
  optionVisible,
  artworkConsultOf,
  choiceExtraAtQty,
  tierQtyFor,
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
/** ตัวเลือกแรกของกลุ่มติ่งห้อย — ค่าที่ ProductDetail แกล้งใส่ให้ตอนเปิดสวิตช์ (visibilityView) */
const charmGroupFirst = (prod: Product) => prod.options.find((o) => o.label === "ติ่งห้อย")!.choices[0].name;

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
const one = resolveSelections(p, { [COUNT]: "1 ชิ้น" });
ok("พวง 1 ชิ้น → ไม่ถามสเปคชิ้นที่ 2", !optionVisible(group(TYPE2), one) && !optionVisible(group("งานสกรีน ชิ้นที่ 2"), one));
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
const piece2Special = unitPriceFor(p, resolveSelections(p, { ...baseSel, [TYPE2]: SPECIAL, "สีอะคริลิค ชิ้นที่ 2": "hologram-01" }), 1);
const bothSpecial = unitPriceFor(p, resolveSelections(p, { ...baseSel, [TYPE1]: SPECIAL, "สีอะคริลิค ชิ้นที่ 1": "hologram-01", [TYPE2]: SPECIAL, "สีอะคริลิค ชิ้นที่ 2": "hologram-01" }), 1);
console.log(`   5cm ×2 ชิ้น · ใส+ใส = ฿${bothClear} · ใส+สีพิเศษ = ฿${piece2Special} · สีพิเศษ+สีพิเศษ = ฿${bothSpecial}`);
ok("ชิ้นที่ 2 เป็นสีพิเศษ ราคาขยับขึ้นจากใส+ใส", piece2Special > bothClear);
ok("ส่วนต่างของสองชิ้นเท่ากันพอดี (ชิ้นละเท่า ๆ กัน)", bothSpecial - piece2Special === piece2Special - bothClear);
const bigger2 = unitPriceFor(p, resolveSelections(p, { ...baseSel, "ขนาดชิ้นที่ 2": "10cm" }), 1);
ok(`ชิ้นที่ 2 ใหญ่ขึ้น (10cm) ราคาขยับ ฿${bothClear} → ฿${bigger2}`, bigger2 > bothClear);
const screen2 = unitPriceFor(p, resolveSelections(p, { ...baseSel, "งานสกรีน ชิ้นที่ 2": "สกรีน 2 ด้าน (บน-บน)" }), 1);
ok(`ชิ้นที่ 2 สกรีน 2 ด้าน ราคาขยับ ฿${bothClear} → ฿${screen2}`, screen2 > bothClear);
const parts = unitPriceParts(p, resolveSelections(p, { ...baseSel, "ขนาดชิ้นที่ 2": "10cm" }), 1);
ok("รายการค่าตัวเลือกแยกบรรทัด 'ขนาดชิ้นที่ 2' ให้ลูกค้าเห็น", parts.addOns.some((a) => a.label === "ขนาดชิ้นที่ 2" && a.amount > 0));

console.log("\n── รูปแบบการห้อย (แยก 2 กลุ่ม: ชิ้นงานหลัก / ติ่งห้อย) ──");
const CHARM_HANG = "การห้อยติ่งห้อย";
const OTHER = "แบบอื่น ๆ (ติดต่อแอดมิน)";
const oneCharm = resolveSelections(p, { [COUNT]: "1 ชิ้น", [CHARM]: "ติ่งห้อย 2 ซม. (มาตรฐาน) ×2" });
ok("พวง 1 ชิ้น ไม่ติ๊กติ่งห้อย → ไม่ถามการห้อยทั้งสองกลุ่ม", !optionVisible(group(HANG), one) && !optionVisible(group(CHARM_HANG), one));
ok("พวง 2 ชิ้น → ถามรูปแบบการห้อย (ชิ้นงานหลัก) แต่ยังไม่ถามของติ่งห้อย", optionVisible(group(HANG), two) && !optionVisible(group(CHARM_HANG), two));
ok("พวง 1 ชิ้น + ติ๊กติ่งห้อย → ถามเฉพาะการห้อยติ่งห้อย", optionVisible(group(CHARM_HANG), oneCharm) && !optionVisible(group(HANG), oneCharm));
const twoCharm = resolveSelections(p, { ...two, [CHARM]: "ติ่งห้อย 3 ซม. ×1" });
ok("พวง 2 ชิ้น + ติ่งห้อย → ถามทั้งสองกลุ่มแยกกัน", optionVisible(group(HANG), twoCharm) && optionVisible(group(CHARM_HANG), twoCharm));
ok("การ์ดของสองกลุ่มมีภาพครบ และเป็นคนละชุด",
  group(HANG).choices.every((c) => !!c.imageSrc) &&
    group(CHARM_HANG).choices.every((c) => !!c.imageSrc) &&
    group(CHARM_HANG).choices[0].imageSrc !== group(HANG).choices[0].imageSrc);
ok("เลือก 'แบบอื่น ๆ' ที่ชิ้นงานหลัก → บังคับคุยแอดมิน", !!artworkConsultOf(p, resolveSelections(p, { ...two, [HANG]: OTHER })));
ok("เลือก 'แบบอื่น ๆ' ที่ติ่งห้อย → บังคับคุยแอดมิน (เงื่อนไขหรือ)", !!artworkConsultOf(p, resolveSelections(p, { ...oneCharm, [CHARM_HANG]: OTHER })));
ok("เลือกแบบปกติทั้งสองกลุ่ม → สั่งได้เลย",
  !artworkConsultOf(p, resolveSelections(p, { ...twoCharm, [HANG]: "ห้อยด้านข้าง", [CHARM_HANG]: "ห้อยต่อ ๆ กันลงมา" })));

console.log("\n── เปิดสวิตช์ติ่งห้อยแต่ยังไม่ติ๊กขนาด (หน้าเว็บโชว์กลุ่มให้ แต่ห้ามคิดเงิน/ห้ามติดไปกับออเดอร์) ──");
// หน้าเว็บโชว์กลุ่มโดยแกล้งมองว่ากลุ่มที่เปิดสวิตช์ไว้ = กำลังใช้อยู่ (visibilityView ใน ProductDetail)
const openView = resolveSelections(p, { [COUNT]: "1 ชิ้น", [CHARM]: charmGroupFirst(p) });
ok("มุมมองตอนเปิดสวิตช์ → กลุ่มการห้อยติ่งห้อยโชว์", optionVisible(group(CHARM_HANG), openView));
// แต่ค่าจริง (ยังไม่ติ๊ก) ต้องถือว่ากลุ่มนี้ปิดอยู่ — handleAdd ตัดกลุ่มที่ optionVisible=false ออกจากตะกร้า
const noTick = resolveSelections(p, { [COUNT]: "1 ชิ้น", [CHARM]: "", [CHARM_HANG]: "ห้อยต่อ ๆ กันลงมา" });
ok("ค่าจริงยังไม่ติ๊ก → กลุ่มนี้ไม่ติดไปกับตะกร้า/ออเดอร์", !optionVisible(group(CHARM_HANG), noTick));
ok("ยังไม่ติ๊กติ่งห้อย → ไม่มีค่าติ่งห้อยบวกเข้าราคา", unitPriceFor(p, noTick, 1) === unitPriceFor(p, resolveSelections(p, { [COUNT]: "1 ชิ้น" }), 1));
ok("เลือก 'แบบอื่น ๆ' ค้างไว้ในกลุ่มที่ซ่อนอยู่ → ไม่บล็อกปุ่มสั่ง",
  !artworkConsultOf(p, resolveSelections(p, { [COUNT]: "1 ชิ้น", [CHARM]: "", [CHARM_HANG]: OTHER })));

console.log("\n── ชุดตัวเลือกรายชิ้น (กรอบ + หัวชุด) ──");
const sectionOf = (l: string) => group(l).section;
ok("กลุ่มของชิ้นที่ 2 ติดชุด 'ชิ้นที่ 2' ครบ", ["ขนาดชิ้นที่ 2", TYPE2, "งานสกรีน ชิ้นที่ 2"].every((l) => sectionOf(l) === "ชิ้นที่ 2"));
ok("กลุ่มของชิ้นที่ 10 ไม่หลุดไปชุดอื่น", sectionOf("ขนาดชิ้นที่ 10") === "ชิ้นที่ 10");
ok("กลุ่มนอกชุดไม่ติดชุด", [CHARM, HANG, CHARM_HANG, COUNT].every((l) => !sectionOf(l)));
ok("ชื่อกลุ่มเต็มยังอยู่ (ตะกร้า/ใบงานอ่านออกว่าชิ้นไหน)", p.options.some((o) => o.label === "ขนาดชิ้นที่ 2"));

console.log("\n── เรทติ่งห้อย (เริ่ม 2 ซม. · 20/15/12 ตามชิ้นรวม) ──");
const charm = group(CHARM);
const selC = resolveSelections(p, { [COUNT]: "3 ชิ้น" });
const feeAt = (name: string, units: number) => choiceExtraAtQty(charm, selC, name, tierQtyFor(p, selC, units));
console.log(`   สั่ง 1 พวง = 3 ชิ้นรวม · 5 พวง = 15 ชิ้น · 10 พวง = 30 ชิ้น`);
ok(`ติ่งห้อย 2 ซม. = ${feeAt("ติ่งห้อย 2 ซม. (มาตรฐาน)", 1)}/${feeAt("ติ่งห้อย 2 ซม. (มาตรฐาน)", 5)}/${feeAt("ติ่งห้อย 2 ซม. (มาตรฐาน)", 10)} บาท`,
  feeAt("ติ่งห้อย 2 ซม. (มาตรฐาน)", 1) === 20 && feeAt("ติ่งห้อย 2 ซม. (มาตรฐาน)", 5) === 15 && feeAt("ติ่งห้อย 2 ซม. (มาตรฐาน)", 10) === 12);
ok(`ติ่งห้อย 3 ซม. = ${feeAt("ติ่งห้อย 3 ซม.", 1)}/${feeAt("ติ่งห้อย 3 ซม.", 5)}/${feeAt("ติ่งห้อย 3 ซม.", 10)} บาท (ใหญ่กว่า 2 ซม. บวก ซม. ละ 10)`,
  feeAt("ติ่งห้อย 3 ซม.", 1) === 30 && feeAt("ติ่งห้อย 3 ซม.", 5) === 25 && feeAt("ติ่งห้อย 3 ซม.", 10) === 22);
ok("ตัวเลือกติ่งห้อยเล็กสุดคือ 2 ซม.", charm.choices[0].name.includes("2 ซม."));

console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : "\n✅ ผ่านทั้งหมด");
process.exit(fail ? 1 : 0);
