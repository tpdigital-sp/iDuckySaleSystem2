/**
 * 🧪 เทสด่านตรวจราคา/ค่าส่งที่ลูกค้าส่งมาเอง (src/lib/server/order-price-guard.ts)
 *
 *   npm run check:price-guard
 *
 * ที่มา (ตรวจความปลอดภัย 8 ต.ค. 69): /api/orders และ /api/orders/append เคยเชื่อ unitPrice/discount/shippingCost
 * จากเบราว์เซอร์ทั้งหมด — ยิง API ตรงด้วยราคา ฿1 แล้วออเดอร์เกิดจริง
 */
import { cleanCustomerItems, shippingFloorProblem, underpricedLines } from "../src/lib/server/order-price-guard";
import type { OrderItem } from "../src/lib/admin-data";
import type { Product } from "../src/lib/products";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};

/** สินค้าทดสอบ: เรทเดียว · 1-10 = ฿400 · 11-49 = ฿350 · 50+ = ฿320 (ชุดเดียวกับ order-lot-reprice-test) */
const shawl: Product = {
  id: "shawl",
  name: "ผ้าคลุมไหล่",
  price: 450,
  category: "ผ้า",
  options: [{ label: "ขนาด", choices: [{ name: "100x100cm" }, { name: "70x70cm" }] }],
  priceRates: [
    {
      label: "เรทที่ 1",
      minQty: 1,
      pricing: {
        driverLabels: ["ขนาด"],
        tiers: [{ upTo: 10 }, { upTo: 49 }, { upTo: null }],
        cells: { "100x100cm": [400, 350, 320], "70x70cm": [250, 230, 200] },
      },
    },
  ],
} as unknown as Product;

const load = async (id: string) => (id === "shawl" ? shawl : undefined);
const line = (qty: number, unitPrice: number, extra: Partial<OrderItem> = {}): OrderItem => ({
  productId: "shawl",
  name: "ผ้าคลุมไหล่",
  selections: "ขนาด: 100x100cm",
  sel: { ขนาด: "100x100cm" },
  qty,
  unitPrice,
  ...extra,
});

async function main() {
  // ── cleanCustomerItems ──
  eq("ว่าง = error", !!cleanCustomerItems([]).error, true);
  eq("ไม่ใช่อาร์เรย์ = error", !!cleanCustomerItems({ a: 1 }).error, true);
  eq("ราคาติดลบ = error", !!cleanCustomerItems([line(1, -5)]).error, true);
  eq("ราคา NaN = error", !!cleanCustomerItems([{ ...line(1, 0), unitPrice: "abc" as unknown as number }]).error, true);
  eq("จำนวน 0 = error", !!cleanCustomerItems([line(0, 400)]).error, true);
  eq("จำนวนทศนิยม = error", !!cleanCustomerItems([line(1.5, 400)]).error, true);
  const stripped = cleanCustomerItems([line(2, 400, { discount: 9999, discountPct: 90, quoteNote: "x" } as Partial<OrderItem>)]);
  eq("ตัด discount/discountPct/quoteNote ทิ้ง", stripped.error ?? Object.keys(stripped.items[0]).filter((k) => ["discount", "discountPct", "quoteNote"].includes(k)), []);
  eq("ของดีผ่าน + ปัดสตางค์", cleanCustomerItems([line(3, 400.004)]).items[0]?.unitPrice, 400);

  // ── underpricedLines: สั่งครั้งแรก ──
  eq("10 ชิ้น ฿400 ตรงตาราง → ผ่าน", await underpricedLines([line(10, 400)], load), []);
  eq("10 ชิ้น ฿1 → จับได้", (await underpricedLines([line(10, 1)], load)).map((s) => [s.sent, s.expected]), [[1, 400]]);
  eq("13 ชิ้น ฿350 (ขั้น 11-49) → ผ่าน", await underpricedLines([line(13, 350)], load), []);
  eq("13 ชิ้น ฿300 → จับได้", (await underpricedLines([line(13, 300)], load)).length, 1);
  eq("ส่งมาแพงกว่า (฿500) → ปล่อย", await underpricedLines([line(5, 500)], load), []);
  eq("5+6 ชิ้นสเปคเดียวกัน รวมล็อต 11 → ฿350 ผ่าน", await underpricedLines([line(5, 350), line(6, 350)], load), []);
  eq("5+6 ชิ้น แต่ส่ง ฿300 → จับได้ทั้งสองบรรทัด", (await underpricedLines([line(5, 300), line(6, 300)], load)).length, 2);
  eq("สินค้าที่ร้านไม่มี → ไม่ตรวจ", await underpricedLines([{ ...line(1, 1), productId: "ghost" }], load), []);
  eq("บรรทัดไม่มี sel (รายการพิเศษ) → ไม่ตรวจ", await underpricedLines([{ ...line(1, 1), sel: undefined }], load), []);
  eq("บรรทัด #boxfee → ไม่ตรวจ", await underpricedLines([{ ...line(1, 0), productId: "shawl#boxfee" }], load), []);

  // ── underpricedLines: สั่งเพิ่ม (ร่วมล็อตกับของเดิม) ──
  const base = [line(10, 400)];
  eq("เดิม 10 + เพิ่ม 3 → ล็อต 13 = ฿350 ผ่าน", await underpricedLines([line(3, 350)], load, base), []);
  eq("เดิม 10 + เพิ่ม 3 ที่ ฿300 → จับได้", (await underpricedLines([line(3, 300)], load, base)).length, 1);
  eq("ของเดิมถูกกว่าตาราง (แอดมินตีให้) → ไม่ถูกตรวจ", await underpricedLines([line(3, 350)], load, [line(10, 100)]), []);

  // ── shippingFloorProblem ──
  const sett = { shipping: [{ id: "std", name: "ส่งธรรมดา", price: 50 }, { id: "pickup", name: "มารับเอง", price: 0 }], freeShippingMin: 999 };
  eq("ส่งธรรมดา ฿0 ยอด 500 → ไม่ผ่าน", !!shippingFloorProblem(0, "ส่งธรรมดา", 500, sett), true);
  eq("ส่งธรรมดา ฿50 → ผ่าน", shippingFloorProblem(50, "ส่งธรรมดา", 500, sett), null);
  eq("ส่งธรรมดา ฿80 (ค่าส่งตามจำนวน) → ผ่าน", shippingFloorProblem(80, "ส่งธรรมดา", 500, sett), null);
  eq("ส่งธรรมดา ฿0 ยอด 1500 ถึงส่งฟรี → ผ่าน", shippingFloorProblem(0, "ส่งธรรมดา", 1500, sett), null);
  eq("มารับเอง ฿0 → ผ่าน", shippingFloorProblem(0, "มารับเอง", 500, sett), null);
  eq("ค่าส่งติดลบ → ไม่ผ่าน", !!shippingFloorProblem(-50, "ส่งธรรมดา", 500, sett), true);
  eq("ชื่อวิธีที่ร้านเลิกใช้ → ไม่มีราคาให้เทียบ ผ่าน", shippingFloorProblem(0, "EMS เก่า", 500, sett), null);
  eq("ไม่ตั้งค่าร้าน → ใช้ค่าเริ่มต้น (ส่งธรรมดา 50)", !!shippingFloorProblem(0, "ส่งธรรมดา (3-5 วัน)", 500, null), true);
  eq("ไม่ตั้งค่าร้าน + ยอดถึง 999 → ส่งฟรี ผ่าน", shippingFloorProblem(0, "ส่งธรรมดา (3-5 วัน)", 999, null), null);
  eq("ใบที่ไม่คิดค่าส่งซ้ำ (waived) → เช็คแค่ไม่ติดลบ", shippingFloorProblem(0, "ส่งธรรมดา", 500, sett, true), null);

  console.log(`✅ ผ่าน ${pass} ข้อ`);
  if (fails.length) {
    console.log(`❌ ไม่ผ่าน ${fails.length} ข้อ\n` + fails.map((f) => ` • ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
