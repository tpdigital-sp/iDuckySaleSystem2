/**
 * 🏅 เทสกติกา "ส่วนลดระดับสมาชิกบนออเดอร์" — โดยเฉพาะใบที่ลูกค้าโอนมาแล้วแล้วสั่งเพิ่ม
 *
 *   npm run check:member-tier
 *
 * เคสจริงที่ทำให้ต้องมีเทสนี้ (เจ้าของร้านแจ้ง 22 ก.ย. 69 · OD-260915-7543):
 * ลูกค้า Silver 5% โอนมาแล้ว ฿5,294 → แอดมินเพิ่มรายการอีก ฿2,460 → ส่วนลดค้างที่ −฿276 (5% ของยอดเก่า)
 * ของที่สั่งเพิ่มจึงไม่ได้ส่วนลดเลย · ที่ถูกคือ −฿399 (5% ของ ฿7,980)
 */
import { orderTotal, type Order } from "../src/lib/admin-data";
import { syncOrderMemberTier } from "../src/lib/server/order-member-tier";

/** ฐานปลอม: ตารางระดับของร้าน (Silver 5%) + ผู้ติดต่อ #1 ที่ล็อกระดับ Silver ไว้ */
const shopTiers = [
  { id: "bronze", name: "Bronze", icon: "🥉", minSpend: 50000, discountPct: 3 },
  { id: "silver", name: "Silver", icon: "🥈", minSpend: 150000, discountPct: 5 },
];
const fakeSb = {
  from(table: string) {
    return {
      select() {
        return {
          eq(_col: string, id: string) {
            return {
              async maybeSingle() {
                if (table === "products" && id === "__shop_payment__") return { data: { data: { tiers: shopTiers } } };
                if (table === "contacts" && id === "1") return { data: { data: { id: "1", tierLevel: "silver" } } };
                return { data: null };
              },
            };
          },
        };
      },
    };
  },
} as never;

const baseOrder = (over: Partial<Order>): Order =>
  ({
    id: "OD-TEST",
    date: "22 ก.ย. 2569 10:00",
    customer: "ทดสอบ",
    status: "รอชำระเงิน",
    contactId: "1",
    shippingCost: 50,
    items: [{ name: "ของ", qty: 4, unitPrice: 1380 }],
    ...over,
  }) as Order;

let fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : ` — ได้ ${JSON.stringify(got)} ควรเป็น ${JSON.stringify(want)}`}`);
};

// 1) ใบยังไม่โอน — คิดส่วนลดให้ตามปกติ
check("ใบยังไม่โอน ได้ 5% ของยอดสินค้า", (await syncOrderMemberTier(fakeSb, baseOrder({}))).discount?.amount, 276);

// 2) ใบโอนมาแล้ว + เพิ่มรายการ → ส่วนลดต้องโตตาม (เคส OD-260915-7543)
const paidThenAppended = baseOrder({
  paidTotal: 5294,
  paidReportedAt: "2026-09-16T09:06:36.517Z",
  items: [
    { name: "ของเดิม", qty: 4, unitPrice: 1380 },
    { name: "ของที่เพิ่ม", qty: 1, unitPrice: 1380 },
    { name: "ค่าอะคริลิคพิเศษ", qty: 4, unitPrice: 270 },
  ],
  discount: { label: "สมาชิก Silver (5%)", amount: 276, tierId: "silver" },
} as Partial<Order>);
const appended = await syncOrderMemberTier(fakeSb, paidThenAppended);
check("โอนแล้วสั่งเพิ่ม → ส่วนลดโตตามยอดใหม่", appended.discount?.amount, 399);
check("ยอดรวมลดลงตามส่วนลดใหม่", orderTotal(appended), 7631);

// 3) ใบโอนมาแล้ว + ลบรายการออก → ห้ามลดส่วนลด (ไม่ไล่เก็บเงินเพิ่มย้อนหลัง)
const paidThenRemoved = baseOrder({
  paidTotal: 5294,
  items: [{ name: "ของเดิม", qty: 2, unitPrice: 1380 }],
  discount: { label: "สมาชิก Silver (5%)", amount: 276, tierId: "silver" },
} as Partial<Order>);
check("โอนแล้วลบของ → ส่วนลดเดิมไม่ถูกหั่น", (await syncOrderMemberTier(fakeSb, paidThenRemoved)).discount?.amount, 276);

// 4) ใบโอนมาแล้ว + ถอดผู้ติดต่อ → ห้ามล้างส่วนลด (ยอดจะเด้งขึ้นหลังลูกค้าโอนตามยอดเก่าไปแล้ว)
const paidNoContact = baseOrder({
  paidTotal: 5294,
  contactId: undefined,
  discount: { label: "สมาชิก Silver (5%)", amount: 276, tierId: "silver" },
} as Partial<Order>);
check("โอนแล้วถอดผู้ติดต่อ → ส่วนลดยังอยู่", (await syncOrderMemberTier(fakeSb, paidNoContact)).discount?.amount, 276);

// 5) ยังไม่โอน + ถอดผู้ติดต่อ → ส่วนลดหายตาม (ของเดิม ต้องไม่พัง)
const openNoContact = baseOrder({
  contactId: undefined,
  discount: { label: "สมาชิก Silver (5%)", amount: 276, tierId: "silver" },
} as Partial<Order>);
check("ยังไม่โอน ถอดผู้ติดต่อ → ส่วนลดหาย", (await syncOrderMemberTier(fakeSb, openNoContact)).discount, undefined);

// 6) ลดแล้วจะกลายเป็นโอนเกิน → ไม่ลด (ต้องตามคืนเงิน)
const wouldOverpay = baseOrder({
  paidTotal: 5520 + 50,
  items: [{ name: "ของ", qty: 4, unitPrice: 1380 }],
} as Partial<Order>);
check("ลดแล้วกลายเป็นโอนเกิน → ไม่ลด", (await syncOrderMemberTier(fakeSb, wouldOverpay)).discount, undefined);

// 7) ส่วนลดที่ไม่ใช่ของระบบนี้ (คูปอง/ตกลงกับลูกค้าแล้ว) → ห้ามแตะ
const coupon = baseOrder({ discount: { label: "คูปอง", amount: 100 } } as Partial<Order>);
check("ส่วนลดไม่มีธง tierId → ไม่แตะ", (await syncOrderMemberTier(fakeSb, coupon)).discount?.amount, 100);

// 8) ใบที่เลยขั้นเก็บเงินไปแล้ว → ไม่แตะ
const shipped = baseOrder({ status: "ชำระแล้ว" } as Partial<Order>);
check("ใบเลยขั้นเก็บเงิน → ไม่คิดส่วนลดใหม่", (await syncOrderMemberTier(fakeSb, shipped)).discount, undefined);

console.log(fail === 0 ? "\n✅ ผ่านทั้งหมด" : `\n❌ ไม่ผ่าน ${fail} ข้อ`);
process.exit(fail === 0 ? 0 : 1);
