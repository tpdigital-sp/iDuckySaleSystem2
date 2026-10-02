/**
 * 🧪 ค่าคละลายแบบ mixRule ในตะกร้ารวมล็อต ต้องเท่าหน้าสินค้า — npm run check:mix-line
 * 🎨 กติกา 2 ต.ค. 69 (พนักงานทดสอบ · เจ้าของร้านส่งมาแก้): ลายละ 1 แผ่น (ลาย ≤ แผ่น) ไม่ถือว่าคละ = ฿0
 *    เกินจำนวนแผ่นค่อยคิดเฉพาะลายที่ต้องลงแผ่นเดียวกัน (mixSpread กระจายให้ถูกสุด) · ยังคิดต่อรายการ ไม่รวมรายการอื่น
 *    (29 ก.ย.–1 ต.ค. เคยนับจำนวนลายอย่างเดียว → "สั่ง 2 แผ่น 2 ลาย ลายละ 1 A3" โดน ฿5 ทั้งที่ไม่ได้คละ)
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

/** สติ๊กเกอร์ไดคัท 50%: ลายละ 20 ลายแรกของแผ่นฟรี (20/2/20) — กติกา 26 ส.ค. 69 "ลายที่เกินจำนวนแผ่น" */
const diecut: Product = {
  id: "diecut",
  name: "สติ๊กเกอร์",
  price: 90,
  category: "sticker",
  options: [{ label: "แบบไดคัท", choices: [{ name: "ไดคัท 50%", mixRule: { baseFee: 20, includedDesigns: 2, extraFee: 20 } }, { name: "ไดคัท 100%" }] }],
  mixRule: { baseFee: 5, includedDesigns: 2, extraFee: 5 },
} as unknown as Product;

/** โฟโต้การ์ดดิจิตอล: 3 ลายแรกของแผ่นฟรี เกินลายละ 5 (0/3/5) — กติกาไม่เชิงเส้น ต้องกระจายให้ถูกสุด */
const photocard: Product = {
  id: "photocard",
  name: "โฟโต้การ์ด",
  price: 100,
  category: "card",
  mixRule: { baseFee: 0, includedDesigns: 3, extraFee: 5 },
} as unknown as Product;

const productOf = (id: string) =>
  id === "paper" ? paper : id === "keyring" ? keyring : id === "diecut" ? diecut : id === "photocard" ? photocard : undefined;
const L = (productId: string, selections: Record<string, string>, qty = 1) => ({ productId, selections, qty });
const front = (n: number, rate = "ตัดตามขนาด", sides = "พิมพ์ 1 ด้าน") => ({ เรทราคา: rate, ชนิดกระดาษ: "อาร์ตมัน", จำนวนด้านที่พิมพ์: sides, จำนวนลาย: `${n} ลาย` });
const twoSided = { ...front(3, "ตัดตามขนาด", "พิมพ์ 2 ด้าน"), "จำนวนลาย (ด้านหลัง)": "3 ลาย" };
const fees = (lines: ReturnType<typeof L>[]) => repriceCartGroups(lines, productOf).map((r) => r.extraFee);

// หน้าสินค้า (บรรทัดเดี่ยว)
eq("หน้าสินค้า: 1 แผ่น หน้า 3 ลาย + หลัง 3 ลาย = ฿20", designFeeFor(paper, twoSided, 1), 20);
eq("หน้าสินค้า: 1 แผ่น 3 ลาย = ฿10", designFeeFor(paper, front(3), 1), 10);
eq("หน้าสินค้า: 3 ลาย บน 1/2/3/10 แผ่น = ฿10/฿5/0/0 (ลายละ 1 แผ่นไม่ถือว่าคละ)", [1, 2, 3, 10].map((q) => designFeeFor(paper, front(3), q)), [10, 5, 0, 0]);
eq("หน้าสินค้า: 2 แผ่น 2 ลาย = 0 (พนักงานทดสอบ 2 ต.ค. 69) · 1 แผ่น 2 ลาย = เหมา ฿5", [designFeeFor(paper, front(2), 2), designFeeFor(paper, front(2), 1)], [0, 5]);
eq("หน้าสินค้า: 2 ลาย 5 แผ่น = 0 · 4 ลาย 2 แผ่น = ฿10 · 1 ลาย 3 แผ่น = 0", [designFeeFor(paper, front(2), 5), designFeeFor(paper, front(4), 2), designFeeFor(paper, front(1), 3)], [0, 10, 0]);
eq("หน้าสินค้า: 2 ด้าน 3+3 บน 2 แผ่น = ฿10 (หน้า 5 + หลัง 5) · บน 4 แผ่น = 0", [designFeeFor(paper, twoSided, 2), designFeeFor(paper, twoSided, 4)], [10, 0]);
eq("หน้าสินค้า: 2 แผ่น 9 ลาย = [5,4] → ฿20 + ฿15 = ฿35", designFeeFor(paper, front(9), 2), 35);

// ไดคัท 50% (กติกาของตัวเลือก 20/2/20) — "ลายที่เกินจำนวนแผ่น" ลายละ 20
const dc = (n: number, cut = "ไดคัท 50%") => ({ แบบไดคัท: cut, จำนวนลาย: `${n} ลาย` });
eq("ไดคัท 50%: 2 A3 2 ลาย = 0 · 2 A3 3 ลาย = ฿20 · 1 A3 3 ลาย = ฿40 · 3 A3 4 ลาย = ฿20", [designFeeFor(diecut, dc(2), 2), designFeeFor(diecut, dc(3), 2), designFeeFor(diecut, dc(3), 1), designFeeFor(diecut, dc(4), 3)], [0, 20, 40, 20]);
eq("ไดคัท 100% (กติการะดับสินค้า 5/2/5): 2 A3 2 ลาย = 0 · 2 A3 3 ลาย = ฿5", [designFeeFor(diecut, dc(2, "ไดคัท 100%"), 2), designFeeFor(diecut, dc(3, "ไดคัท 100%"), 2)], [0, 5]);

// กติกาไม่เชิงเส้น (0/3/5): กระจายให้ถูกสุด — 2 แผ่น 5 ลาย = [3,2] ฟรีทั้งคู่
const pc = (n: number) => ({ จำนวนลาย: `${n} ลาย` });
eq("โฟโต้การ์ด 0/3/5: 1 แผ่น 5 ลาย = ฿10 · 2 แผ่น 5 ลาย = 0 · 2 แผ่น 7 ลาย = ฿5 · 3 แผ่น 3 ลาย = 0", [designFeeFor(photocard, pc(5), 1), designFeeFor(photocard, pc(5), 2), designFeeFor(photocard, pc(7), 2), designFeeFor(photocard, pc(3), 3)], [10, 0, 5, 0]);

// ตะกร้ารวมล็อต — ต้องเท่าหน้าสินค้าทุกบรรทัด
eq("ตะกร้า: 2 ด้าน 3+3 + อีก 3 บรรทัด 1 ลาย (5 แผ่น 6 ลาย) → บรรทัดแรก ฿20 ที่เหลือ 0", fees([L("paper", twoSided), L("paper", front(1), 2), L("paper", front(1, "ไดคัท")), L("paper", front(1))]), [20, 0, 0, 0]);
eq("ตะกร้า: 3 ลาย 1 แผ่น + 2 ลาย×2 แผ่น เรทเดียวกัน → ฿10 + 0 (ลายละ 1 แผ่นไม่คละ)", fees([L("paper", front(3)), L("paper", front(2), 2)]), [10, 0]);
eq("ตะกร้า: 3 ลาย 2 บรรทัดเหมือนกัน → ฿10 + ฿10", fees([L("paper", front(3)), L("paper", front(3))]), [10, 10]);
eq("ตะกร้า: 4 ลาย 1 แผ่น + 1 ลาย 4 แผ่น → ฿15 + 0 (ไม่ถูกเกลี่ยไปแผ่นของบรรทัดอื่น)", fees([L("paper", front(4)), L("paper", front(1), 4)]), [15, 0]);
eq("ตะกร้า: 3 ลาย × 5 แผ่น + 3 ลาย × 1 แผ่น → 0 + ฿10 (คิดจากแผ่นของบรรทัดตัวเอง)", fees([L("paper", front(3), 5), L("paper", front(3))]), [0, 10]);
eq("ตะกร้า: 2 แผ่น 2 ลาย 2 บรรทัด → 0 + 0", fees([L("paper", front(2), 2), L("paper", front(2), 2)]), [0, 0]);

// กติกาโควตาของเรท (ไม่มี mixRule) ยังรวมล็อตแล้วเฉลี่ยเหมือนเดิม
eq("พวงกุญแจ 12 ชิ้น 12 ลาย × 2 บรรทัด → ฿50 + ฿50", fees([L("keyring", { สี: "ใส", จำนวนลาย: "12 ลาย" }, 12), L("keyring", { สี: "ใส", จำนวนลาย: "12 ลาย" }, 12)]), [50, 50]);

console.log(`✅ ผ่าน ${pass} ข้อ${fails.length ? ` · ❌ ตก ${fails.length}` : ""}`);
for (const f of fails) console.log(" ❌", f);
if (fails.length) process.exit(1);
