/**
 * 🧪 ค่าคละลายแบบ mixRule (ต่อแผ่น) ในตะกร้ารวมล็อต ต้องเท่าหน้าสินค้า — npm run check:mix-line
 * เคสจริง 29 ก.ย. 69 (กระดาษอาร์ตมัน & PET · OD-260924-2339): 1 แผ่น A3 คละ 3 ลาย + พิมพ์ 2 ด้าน หลัง 3 ลาย
 * หน้าสินค้า ฿110 + ค่าคละ ฿20 = ฿130 · ตะกร้าที่มีบรรทัดอื่นของสินค้าเดียวกันร่วมล็อตเคยได้ ฿122–123
 */
import { repriceCartGroups, designFeeFor, type Product } from "../src/lib/products";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};

/** กระดาษ: ค่าคละต่อแผ่น เหมา ฿5 รวม 2 ลาย เกินลายละ ฿5 · ด้านหลังลายแรกฟรี เกินลายละ ฿5 */
const paper: Product = {
  id: "paper",
  name: "กระดาษ",
  price: 110,
  category: "sticker-paper",
  options: [
    { label: "ชนิดกระดาษ", choices: [{ name: "อาร์ตมัน" }] },
    { label: "จำนวนด้านที่พิมพ์", choices: [{ name: "พิมพ์ 1 ด้าน" }, { name: "พิมพ์ 2 ด้าน", extra: 10 }] },
  ],
  priceRates: [
    { label: "ตัดตามขนาด", pricing: { driverLabels: ["ชนิดกระดาษ"], tiers: [{ upTo: null }], cells: { อาร์ตมัน: [100] } } },
    { label: "ไดคัท", pricing: { driverLabels: ["ชนิดกระดาษ"], tiers: [{ upTo: null }], cells: { อาร์ตมัน: [120] } } },
  ],
  mixRule: { baseFee: 5, includedDesigns: 2, extraFee: 5 },
  backDesign: { label: "จำนวนด้านที่พิมพ์", choices: ["พิมพ์ 2 ด้าน"], mixRule: { baseFee: 0, includedDesigns: 1, extraFee: 5 } },
} as unknown as Product;

/** พวงกุญแจ: โควตาของเรท ⌊ยอด ÷ 5⌋ ลาย เกินลายละ ฿5 — ต้องยังคิดจากยอดรวมล็อตแล้วเฉลี่ย (ใบราคา W3KEX 18 ก.ย. 69) */
const keyring: Product = {
  id: "keyring",
  name: "พวงกุญแจ",
  price: 100,
  category: "acrylic",
  options: [{ label: "สี", choices: [{ name: "ใส" }] }],
  priceRates: [
    { label: "เรทที่ 1", minQty: 1, minPerDesign: 5, extraDesignFee: 5, pricing: { driverLabels: ["สี"], tiers: [{ upTo: null }], cells: { ใส: [100] } } },
  ],
} as unknown as Product;

const productOf = (id: string) => (id === "paper" ? paper : id === "keyring" ? keyring : undefined);
const L = (productId: string, selections: Record<string, string>, qty = 1) => ({ productId, selections, qty });
const front = (n: number, rate = "ตัดตามขนาด", sides = "พิมพ์ 1 ด้าน") => ({ เรทราคา: rate, ชนิดกระดาษ: "อาร์ตมัน", จำนวนด้านที่พิมพ์: sides, จำนวนลาย: `${n} ลาย` });
const twoSided = { ...front(3, "ตัดตามขนาด", "พิมพ์ 2 ด้าน"), "จำนวนลาย (ด้านหลัง)": "3 ลาย" };
const fees = (lines: ReturnType<typeof L>[]) => repriceCartGroups(lines, productOf).map((r) => r.extraFee);

// หน้าสินค้า (บรรทัดเดี่ยว)
eq("หน้าสินค้า: 1 แผ่น หน้า 3 ลาย + หลัง 3 ลาย = ฿20", designFeeFor(paper, twoSided, 1), 20);
eq("หน้าสินค้า: 1 แผ่น 3 ลาย = ฿10", designFeeFor(paper, front(3), 1), 10);

// ตะกร้ารวมล็อต — ต้องเท่าหน้าสินค้าทุกบรรทัด
eq("ตะกร้า: 2 ด้าน 3+3 + อีก 3 บรรทัด 1 ลาย (5 แผ่น 6 ลาย) → บรรทัดแรก ฿20 ที่เหลือ 0", fees([L("paper", twoSided), L("paper", front(1), 2), L("paper", front(1, "ไดคัท")), L("paper", front(1))]), [20, 0, 0, 0]);
eq("ตะกร้า: 3 ลาย + 2 ลาย×2 แผ่น เรทเดียวกัน → ฿10 + ฿0 (2 ลายบน 2 แผ่น = แผ่นละลาย ไม่คละ เท่าหน้าสินค้า)", fees([L("paper", front(3)), L("paper", front(2), 2)]), [10, designFeeFor(paper, front(2), 2)]);
eq("ตะกร้า: 3 ลาย 2 บรรทัดเหมือนกัน → ฿10 + ฿10", fees([L("paper", front(3)), L("paper", front(3))]), [10, 10]);
eq("ตะกร้า: 4 ลาย 1 แผ่น + 1 ลาย 4 แผ่น → ฿15 + 0 (ไม่ถูกเกลี่ยเป็นแผ่นละ 1 ลาย)", fees([L("paper", front(4)), L("paper", front(1), 4)]), [15, 0]);

// กติกาโควตาของเรท (ไม่มี mixRule) ยังรวมล็อตแล้วเฉลี่ยเหมือนเดิม
eq("พวงกุญแจ 12 ชิ้น 12 ลาย × 2 บรรทัด → ฿50 + ฿50", fees([L("keyring", { สี: "ใส", จำนวนลาย: "12 ลาย" }, 12), L("keyring", { สี: "ใส", จำนวนลาย: "12 ลาย" }, 12)]), [50, 50]);

console.log(`✅ ผ่าน ${pass} ข้อ${fails.length ? ` · ❌ ตก ${fails.length}` : ""}`);
for (const f of fails) console.log(" ❌", f);
if (fails.length) process.exit(1);
