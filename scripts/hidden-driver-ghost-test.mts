/**
 * 🧪 👻 กลุ่มแกนราคาที่ถูกซ่อนต้องไม่ติดไปกับตะกร้า/ออเดอร์ — npm run check:ghost
 *
 * เคสจริง 28 ก.ย. 69 เสื้อ Unisex YUEDPAO (ยืดเปล่า): ลูกค้าเลือกเรท "พิมพ์ DTF/DFT"
 * กลุ่ม "ขนาดปัก ด้านหน้า" ซ่อนอยู่ (showWhen เรทราคา = งานปัก) แต่การ์ดออเดอร์ขึ้น "ขนาดปัก ด้านหน้า: ไม่เกิน 10 ซม."
 * เหตุ: กลุ่มนี้เป็นแกนของเรท "งานปัก" เลยถูกนับเป็น "แกนตารางราคา" ของสินค้าทั้งตัว → ตัดไม่ได้
 * และไม่มีตัวเลือก "ไม่ปัก" ให้สลับ → ค่าค้าง choices[0] หลุดไปกับออเดอร์
 */
import { orderableSelections, resolveSelections, optionVisible, unitPriceFor, RATE_LABEL, type Product } from "../src/lib/products";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean) => (cond ? pass++ : fails.push(name));

const cells = (v: number[]) => v;
const F = "ขนาดสกรีน ด้านหน้า";
const B = "ขนาดสกรีน ด้านหลัง";
const E = "ขนาดปัก ด้านหน้า";
const printPricing = {
  unit: "ตัว",
  tiers: [1, 10, 30, 50, 100],
  driverLabels: [F, B],
  cells: {
    "ไม่เกิน 5 นิ้ว│ไม่สกรีน": cells([350, 250, 220, 210, 200]),
    "ไม่สกรีน│ไม่สกรีน": cells([300, 200, 180, 170, 160]),
    "ไม่เกิน A3│ไม่สกรีน": cells([390, 290, 260, 250, 240]),
    "ไม่เกิน 5 นิ้ว│ไม่เกิน 5 นิ้ว": cells([400, 300, 260, 250, 240]),
  },
};
const embPricing = {
  unit: "ตัว",
  tiers: [1, 10, 30, 50, 100],
  driverLabels: [E],
  cells: {
    "ไม่เกิน 10 ซม.": cells([380, 280, 250, 240, 230]),
    "ไม่เกิน 15 ซม.": cells([420, 320, 290, 280, 270]),
    "ไม่เกิน 20 ซม.": cells([460, 360, 330, 320, 310]),
  },
};
const shirt = {
  id: "yuedpao-test",
  name: "เสื้อ Unisex YUEDPAO (ยืดเปล่า)",
  price: 300,
  category: "fashion",
  options: [
    { label: "ไซส์", choices: [{ name: "S" }, { name: "M" }, { name: "L" }] },
    { label: "สีเสื้อ", choices: [{ name: "สีขาว" }, { name: "สีดำ" }] },
    { label: F, showWhen: { label: RATE_LABEL, choices: ["พิมพ์ DTF/DFT"] }, choices: [{ name: "ไม่เกิน 5 นิ้ว" }, { name: "ไม่เกิน A3" }, { name: "ไม่สกรีน" }] },
    { label: B, showWhen: { label: RATE_LABEL, choices: ["พิมพ์ DTF/DFT"] }, choices: [{ name: "ไม่สกรีน" }, { name: "ไม่เกิน 5 นิ้ว" }] },
    { label: E, showWhen: { label: RATE_LABEL, choices: ["งานปัก"] }, choices: [{ name: "ไม่เกิน 10 ซม." }, { name: "ไม่เกิน 15 ซม." }, { name: "ไม่เกิน 20 ซม." }] },
    { label: "สีไหม", display: "multi", showWhen: { label: RATE_LABEL, choices: ["งานปัก"] }, choices: [{ name: "เกินเพิ่มสีละ" }] },
  ],
  priceRates: [
    { id: "r1", label: "พิมพ์ DTF/DFT", pricing: printPricing },
    { id: "r3", label: "งานปัก", pricing: embPricing },
  ],
} as unknown as Product;

// ค่าที่หน้าสินค้าถือไว้จริง: ทุกกลุ่มมีค่า (กลุ่มซ่อนค้างที่ choices[0])
const dtf = { ไซส์: "L", สีเสื้อ: "สีขาว", [F]: "ไม่เกิน 5 นิ้ว", [B]: "ไม่สกรีน", [E]: "ไม่เกิน 10 ซม.", สีไหม: "", [RATE_LABEL]: "พิมพ์ DTF/DFT" };
const outDtf = orderableSelections(shirt, dtf);
ok("เรทพิมพ์: ไม่มีบรรทัดขนาดปัก", !(E in outDtf));
ok("เรทพิมพ์: ไม่มีบรรทัดสีไหม", !("สีไหม" in outDtf));
ok("เรทพิมพ์: ขนาดสกรีนหน้า/หลังยังอยู่", outDtf[F] === "ไม่เกิน 5 นิ้ว" && outDtf[B] === "ไม่สกรีน");
ok("เรทพิมพ์: ราคาไม่ขยับหลังตัด", unitPriceFor(shirt, outDtf, 1) === unitPriceFor(shirt, dtf, 1) && unitPriceFor(shirt, outDtf, 1) === 350);

const emb = { ไซส์: "L", สีเสื้อ: "สีขาว", [F]: "ไม่เกิน 5 นิ้ว", [B]: "ไม่สกรีน", [E]: "ไม่เกิน 15 ซม.", สีไหม: "", [RATE_LABEL]: "งานปัก" };
const outEmb = orderableSelections(shirt, emb);
ok("เรทปัก: ขนาดปักยังอยู่", outEmb[E] === "ไม่เกิน 15 ซม.");
ok("เรทปัก: ไม่มีบรรทัดขนาดสกรีนหน้า/หลัง (แกนของเรทพิมพ์)", !(F in outEmb) && !(B in outEmb));
ok("เรทปัก: ราคาไม่ขยับหลังตัด", unitPriceFor(shirt, outEmb, 1) === 420 && unitPriceFor(shirt, emb, 1) === 420);

// 🪝 เคสเดิม 24 ก.ย. 69 (frame-card) ต้องยังทำงาน: กลุ่มซ่อนที่เป็นแกนของตารางที่ใช้อยู่ + มี "❌ ไม่รับ" ราคาเท่ากัน → สลับ
const HOOK = "ตะขอโซ่ไข่ปลา";
const frame = {
  id: "frame-test",
  name: "เฟรมการ์ด",
  price: 30,
  category: "acrylic",
  options: [
    { label: "ชิ้นงาน", choices: [{ name: "เจาะรู" }, { name: "ไม่เจาะรู" }] },
    { label: HOOK, showWhen: { label: "ชิ้นงาน", choices: ["เจาะรู"] }, choices: [{ name: "ตะขอ Z2 โซ่ไข่ปลาสีเงิน" }, { name: "❌ ไม่รับตะขอ" }] },
  ],
  pricing: {
    unit: "ชิ้น",
    tiers: [1, 10],
    driverLabels: ["ชิ้นงาน", HOOK],
    cells: {
      "เจาะรู│ตะขอ Z2 โซ่ไข่ปลาสีเงิน": cells([35, 30]),
      "เจาะรู│❌ ไม่รับตะขอ": cells([30, 25]),
      "ไม่เจาะรู│ตะขอ Z2 โซ่ไข่ปลาสีเงิน": cells([30, 25]),
      "ไม่เจาะรู│❌ ไม่รับตะขอ": cells([30, 25]),
    },
  },
} as unknown as Product;
const noHole = { ชิ้นงาน: "ไม่เจาะรู", [HOOK]: "ตะขอ Z2 โซ่ไข่ปลาสีเงิน" };
const outFrame = orderableSelections(frame, noHole);
ok("frame-card: กลุ่มตะขอที่ซ่อน (แกนของตารางที่ใช้) สลับเป็น ❌ ไม่รับตะขอ", outFrame[HOOK] === "❌ ไม่รับตะขอ");
ok("frame-card: ราคาเท่าเดิม", unitPriceFor(frame, outFrame, 1) === 30);

// 👕 เสื้อครอป: กลุ่มซ่อนที่เป็นแกนของตารางที่ใช้ แต่ช่อง "ไม่สกรีน" ราคาต่างกัน → ห้ามสลับ (ราคาหน้าสินค้า = ตะกร้า)
const crop = {
  id: "crop-test",
  name: "เสื้อครอป",
  price: 280,
  category: "fashion",
  options: [
    { label: "แบบงาน", choices: [{ name: "สกรีน" }, { name: "งานปัก" }] },
    { label: F, showWhen: { label: "แบบงาน", choices: ["สกรีน"] }, choices: [{ name: "ไม่เกิน 5 นิ้ว" }, { name: "ไม่สกรีน" }] },
  ],
  pricing: {
    unit: "ตัว",
    tiers: [1],
    driverLabels: ["แบบงาน", F],
    cells: { "สกรีน│ไม่เกิน 5 นิ้ว": [310], "สกรีน│ไม่สกรีน": [280], "งานปัก│ไม่เกิน 5 นิ้ว": [310], "งานปัก│ไม่สกรีน": [280] },
  },
} as unknown as Product;
const cropEmb = { แบบงาน: "งานปัก", [F]: "ไม่เกิน 5 นิ้ว" };
ok("เสื้อครอป: ราคาต่างกัน → คงค่าเดิมไว้ ไม่สลับ", orderableSelections(crop, cropEmb)[F] === "ไม่เกิน 5 นิ้ว");

// 🤝 เรทตัวแทน "X (ตัวแทน)" ต้องผ่าน showWhen ที่ชี้ชื่อเรท public "X" (ตัวแทนต้องเห็นกลุ่มขนาดสกรีน)
const shirtDealer = {
  ...shirt,
  priceRates: [...shirt.priceRates!, { id: "r1-dealer", label: "พิมพ์ DTF/DFT (ตัวแทน)", dealerOnly: true, pricing: printPricing }],
} as unknown as Product;
const optF = shirtDealer.options.find((o) => o.label === F)!;
ok("ตัวแทน: กลุ่มขนาดสกรีนโชว์เมื่อถือเรท (ตัวแทน)", optionVisible(optF, { [RATE_LABEL]: "พิมพ์ DTF/DFT (ตัวแทน)" }));
ok("ตัวแทน: เรทปักไม่เปิดกลุ่มขนาดสกรีน", !optionVisible(optF, { [RATE_LABEL]: "งานปัก (ตัวแทน)" }));
const dealerSel = { ...dtf, [RATE_LABEL]: "พิมพ์ DTF/DFT (ตัวแทน)" };
const outDealer = orderableSelections(shirtDealer, dealerSel);
ok("ตัวแทน: ขนาดสกรีนติดไปกับตะกร้า ขนาดปักไม่ติด", outDealer[F] === "ไม่เกิน 5 นิ้ว" && !(E in outDealer));

// 👻 กลุ่มซ่อนต้องไม่คุมกลุ่มลูกที่โชว์ (ผ้าเชียร์: ปิด FLEX แล้ว "FLEX ลงด้านไหน" ค้าง "ทั้ง 2 ด้าน")
const FLEX = "FLEX (ลาย/ตัวอักษรพิเศษ)";
const SIDE = "FLEX ลงด้านไหน";
const FLEX2 = "FLEX ด้านที่ 2";
const flag = {
  id: "flag-test",
  name: "ผ้าเชียร์",
  price: 450,
  category: "fabric",
  options: [
    { label: FLEX, choices: [{ name: "ไม่ใส่ FLEX" }, { name: "ขนาดไม่เกิน 15x55cm", extra: 250 }] },
    { label: SIDE, showWhen: { label: FLEX, choices: ["ขนาดไม่เกิน 15x55cm"] }, choices: [{ name: "ด้านหน้า" }, { name: "ทั้ง 2 ด้าน" }] },
    { label: FLEX2, showWhen: { label: SIDE, choices: ["ทั้ง 2 ด้าน"] }, choices: [{ name: "ขนาดไม่เกิน 15x55cm", extra: 250 }] },
  ],
} as unknown as Product;
const raw = { [FLEX]: "ไม่ใส่ FLEX", [SIDE]: "ทั้ง 2 ด้าน", [FLEX2]: "ขนาดไม่เกิน 15x55cm" };
const eff = resolveSelections(flag, raw);
ok("ผ้าเชียร์: กลุ่มแม่ซ่อนกลับเป็นค่าเริ่มต้น", eff[SIDE] === "ด้านหน้า");
ok("ผ้าเชียร์: กลุ่มลูกซ่อนตาม ไม่คิดเงิน", unitPriceFor(flag, eff, 1) === 450);
ok("ผ้าเชียร์: ราคาหน้าสินค้า = ตะกร้า", unitPriceFor(flag, orderableSelections(flag, eff), 1) === unitPriceFor(flag, eff, 1));
const effOn = resolveSelections(flag, { ...raw, [FLEX]: "ขนาดไม่เกิน 15x55cm" });
ok("ผ้าเชียร์: เปิด FLEX กลับมา ค่าที่เคยเลือกกลับมา + คิดเงินครบ", effOn[SIDE] === "ทั้ง 2 ด้าน" && unitPriceFor(flag, effOn, 1) === 950);

console.log(`✅ ผ่าน ${pass} ข้อ${fails.length ? ` · ❌ ตก ${fails.length}` : ""}`);
for (const f of fails) console.log(" ❌", f);
if (fails.length) process.exit(1);
