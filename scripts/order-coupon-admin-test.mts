/**
 * 🎟️ เทสกติกา "แอดมินใส่คูปองให้ออเดอร์ที่มีอยู่แล้ว / ถอดออก" (lib/server/order-coupon.ts)
 *
 *   npm run check:coupon-admin
 *
 * ทำไมต้องมี: ลูกค้าได้คูปองมาแล้วแต่ทักไลน์ให้แอดมินรวมยอด → เดิมคูปองใช้ได้แค่ตอนลูกค้าล็อกอินสั่งเอง
 * ใช้ Supabase ปลอม (ตาราง coupons/products/contacts ในหน่วยความจำ) ตรวจทั้งส่วนลด · การตัดสิทธิ์แบบ atomic · การคืนสิทธิ์
 */
import { orderTotal, type Order } from "../src/lib/admin-data";
import type { Coupon } from "../src/lib/coupons";
import { applyCouponToOrder, removeCouponFromOrder } from "../src/lib/server/order-coupon";

/** ─── Supabase ปลอม: from().select().eq().maybeSingle() + from().update().eq()…select() พร้อม filter path data->>key ─── */
type Row = { id?: string; code?: string; data: Record<string, unknown> };
const store: Record<string, Row[]> = {
  products: [{ id: "__shop_payment__", data: { tiers: [{ id: "silver", name: "Silver", icon: "🥈", minSpend: 150000, discountPct: 5 }] } }],
  contacts: [
    { id: "1", data: { id: "1", tierLevel: "silver" } },
    { id: "2", data: { id: "2", memberId: "uuid-M" } }, // ผูกบัญชีสมาชิกเว็บไว้
  ],
  coupons: [],
};
const cell = (row: Row, col: string) => (col.startsWith("data->>") ? row.data[col.slice(7)] : (row as Record<string, unknown>)[col]);
const matches = (row: Row, filters: [string, string][]) => filters.every(([col, val]) => cell(row, col) !== undefined && String(cell(row, col)) === val);
function builder(table: string, op: "select" | "update", payload?: { data: Record<string, unknown> }) {
  const filters: [string, string][] = [];
  const b = {
    eq(col: string, val: string) {
      filters.push([col, val]);
      return b;
    },
    async maybeSingle() {
      const row = store[table].find((r) => matches(r, filters));
      return { data: row ? { data: row.data } : null, error: null };
    },
    async select() {
      const hit = store[table].filter((r) => matches(r, filters));
      if (op === "update") for (const r of hit) r.data = JSON.parse(JSON.stringify(payload!.data)); // jsonb ทิ้ง undefined เหมือนของจริง
      return { data: hit.map((r) => ({ code: r.code })), error: null };
    },
  };
  return b;
}
const fakeSb = {
  from(table: string) {
    return {
      select: () => builder(table, "select"),
      update: (payload: { data: Record<string, unknown> }) => builder(table, "update", payload),
    };
  },
} as never;
const seedCoupon = (c: Partial<Coupon> & { code: string }) => {
  const full: Coupon = { type: "fixed", value: 100, status: "active", createdAt: "2026-09-29T00:00:00.000Z", ...c };
  store.coupons = store.coupons.filter((r) => r.code !== c.code);
  store.coupons.push({ code: c.code, data: JSON.parse(JSON.stringify(full)) });
};
const couponNow = (code: string) => store.coupons.find((r) => r.code === code)!.data as unknown as Coupon;

const baseOrder = (over: Partial<Order>): Order =>
  ({
    id: "OD-TEST",
    date: "29 ก.ย. 2569 10:00",
    customer: "ทดสอบ",
    status: "รอชำระเงิน",
    shippingCost: 50,
    items: [{ productId: "acrylic-keychain", name: "พวงกุญแจ", qty: 4, unitPrice: 1380 }],
    ...over,
  }) as Order;

let fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : ` — ได้ ${JSON.stringify(got)} ควรเป็น ${JSON.stringify(want)}`}`);
};
const errOf = (r: { ok: boolean; error?: string }) => (r.ok ? "OK" : r.error);

// 1) ใบธรรมดา ไม่มีบัญชีเว็บ ไม่ผูกผู้ติดต่อ + คูปองลด ฿100 → ได้ส่วนลด ตัดสิทธิ์ จดด้วยเลขใบ
seedCoupon({ code: "FIX100" });
{
  const r = await applyCouponToOrder(fakeSb, baseOrder({}), "fix100", "แอดมิน");
  check("คูปอง ฿100 ใส่ใบธรรมดาได้ (พิมพ์ตัวเล็กก็ได้)", r.ok && r.order.discount, { label: "คูปอง FIX100 (฿100)", amount: 100, couponCode: "FIX100" });
  check("ยอดรวมหักส่วนลดแล้ว", r.ok && orderTotal(r.order), 5520 + 50 - 100);
  check("คูปองถูกตัดสิทธิ์ (ใบสิทธิ์เดียว → redeemed)", [couponNow("FIX100").status, couponNow("FIX100").uses, couponNow("FIX100").redeemedOrderId], ["redeemed", 1, "OD-TEST"]);
  check("จดผู้ใช้สิทธิ์ด้วยเลขใบ (ไม่มีบัญชี/ผู้ติดต่อ)", couponNow("FIX100").redemptions?.[0].customerId, "order:OD-TEST");
  check("log บอกยอดก่อน→หลัง", r.ok && /ใส่คูปอง/.test(r.order.log?.[r.order.log.length - 1]?.action ?? "") && /5,570 → ฿5,470/.test(r.order.log?.[r.order.log.length - 1]?.detail ?? ""), true);
}

// 2) ใช้ซ้ำใบเดิม → ไม่ได้
check("ใช้คูปองที่หมดสิทธิ์แล้ว → แจ้งใช้ครบสิทธิ์", errOf(await applyCouponToOrder(fakeSb, baseOrder({}), "FIX100", "แอดมิน")), "คูปองนี้ถูกใช้ครบสิทธิ์แล้ว");

// 3) คูปอง % มีเพดาน — ฐาน = ยอดสินค้าหลังหักส่วนลดรายรายการ ไม่รวมค่าส่ง
seedCoupon({ code: "PCT10", type: "percent", value: 10, maxDiscount: 300 });
{
  const withItemDisc = baseOrder({ items: [{ productId: "p", name: "ของ", qty: 2, unitPrice: 1000, discount: 200 }] } as Partial<Order>);
  const r = await applyCouponToOrder(fakeSb, withItemDisc, "PCT10", "แอดมิน");
  check("10% ของ (2,000 − 200) = 180 ไม่นับค่าส่ง", r.ok && r.order.discount?.amount, 180);
}

// 4) ใบมีส่วนลดระดับสมาชิก (Silver 5% = 276) + คูปอง ฿100 → ระดับดีกว่า ไม่เผาคูปอง
seedCoupon({ code: "FIX100B" });
const tierOrder = baseOrder({ contactId: "1", discount: { label: "สมาชิก Silver (5%)", amount: 276, tierId: "silver" } });
{
  const r = await applyCouponToOrder(fakeSb, tierOrder, "FIX100B", "แอดมิน");
  check("ระดับสมาชิกลดมากกว่า → ปฏิเสธ", r.ok ? "OK" : r.status, 409);
  check("คูปองยังไม่ถูกเผา", couponNow("FIX100B").status, "active");
}

// 5) คูปอง ฿500 ดีกว่าระดับ → แทนที่ส่วนลดระดับ
seedCoupon({ code: "FIX500", value: 500 });
{
  const r = await applyCouponToOrder(fakeSb, tierOrder, "FIX500", "แอดมิน");
  check("คูปองดีกว่าระดับ → แทนที่ (ไม่มีธง tierId แล้ว)", r.ok && r.order.discount, { label: "คูปอง FIX500 (฿500)", amount: 500, couponCode: "FIX500" });
  check("จดผู้ใช้สิทธิ์ด้วยผู้ติดต่อที่ผูก", couponNow("FIX500").redeemedBy, "contact:1");

  // 5b) ถอดคูปองออก → คืนสิทธิ์ + ส่วนลดระดับกลับมา
  const back = await removeCouponFromOrder(fakeSb, r.ok ? r.order : tierOrder, "แอดมิน");
  check("ถอดแล้วคืนสิทธิ์คูปอง (active · uses 0 · ไม่จำเลขใบ)", [couponNow("FIX500").status, couponNow("FIX500").uses, couponNow("FIX500").redeemedOrderId ?? null, couponNow("FIX500").redemptions?.length], ["active", 0, null, 0]);
  check("ส่วนลดระดับสมาชิกกลับมาเอง", back.ok && back.order.discount, { label: "สมาชิก Silver (5%)", amount: 276, tierId: "silver" });
}

// 6) ใบหลายสิทธิ์ (3 ครั้ง ใช้ไป 1) → ตัดเป็น 2 ยังไม่หมด · ถอดแล้วกลับเป็น 1 และชี้ใบก่อนหน้า
seedCoupon({ code: "MULTI", maxUses: 3, uses: 1, redeemedOrderId: "OD-OTHER", redeemedBy: "u-other", redemptions: [{ orderId: "OD-OTHER", customerId: "u-other", at: "2026-09-20T00:00:00.000Z" }] });
{
  const r = await applyCouponToOrder(fakeSb, baseOrder({}), "MULTI", "แอดมิน");
  check("ใบหลายสิทธิ์ ตัดแล้วยัง active", [r.ok, couponNow("MULTI").status, couponNow("MULTI").uses], [true, "active", 2]);
  const back = await removeCouponFromOrder(fakeSb, r.ok ? r.order : baseOrder({}), "แอดมิน");
  check("ถอดแล้วตัวนับถอย + ชี้กลับใบก่อนหน้า", [back.ok, couponNow("MULTI").uses, couponNow("MULTI").redeemedOrderId, couponNow("MULTI").redemptions?.length], [true, 1, "OD-OTHER", 1]);
}

// 7) คูปองเจาะจงบัญชี: ใบไม่มีบัญชีเว็บ → แอดมินยืนยันเอง ใช้ได้ และจดเป็น uuid ของเจ้าของ · ใบของบัญชีอื่น → ไม่ได้
seedCoupon({ code: "MINE", assignedTo: "uuid-A" });
check("ใบของบัญชีอื่น → สงวนสำหรับคนอื่น", errOf(await applyCouponToOrder(fakeSb, baseOrder({ customerId: "uuid-B" }), "MINE", "แอดมิน")), "คูปองนี้สงวนสำหรับลูกค้าท่านอื่น");
{
  const r = await applyCouponToOrder(fakeSb, baseOrder({}), "MINE", "แอดมิน");
  check("ใบไม่มีบัญชี → แอดมินยืนยันเอง ใช้ได้", r.ok, true);
  check("จดผู้ใช้สิทธิ์เป็นเจ้าของคูปอง (หน้า 'คูปองของฉัน' เห็นว่าใช้แล้ว)", couponNow("MINE").redeemedBy, "uuid-A");
}

// 7b) ใช้ซ้ำข้ามช่องทาง: คูปองหลายสิทธิ์ 1 บัญชี 1 ครั้ง — ลูกค้าเคยใช้เองบนเว็บ (uuid-M) แล้วทักให้แอดมินใส่อีกใบ
//     ใบผูกผู้ติดต่อ #2 ที่ผูกบัญชี uuid-M ไว้ → ต้องรู้ว่าเป็นคนเดียวกัน ไม่ให้ใช้ซ้ำ
seedCoupon({ code: "ONCE", maxUses: 5, uses: 1, oncePerCustomer: true, redemptions: [{ orderId: "OD-WEB", customerId: "uuid-M", at: "2026-09-20T00:00:00.000Z" }] });
check("ผู้ติดต่อที่ผูกบัญชีเคยใช้บนเว็บแล้ว → แอดมินใส่ซ้ำไม่ได้", errOf(await applyCouponToOrder(fakeSb, baseOrder({ contactId: "2" }), "ONCE", "แอดมิน")), "คุณใช้คูปองนี้ไปแล้ว (1 บัญชีใช้ได้ครั้งเดียว)");
check("ผู้ติดต่ออื่น (ยังไม่เคยใช้) → ใช้ได้", (await applyCouponToOrder(fakeSb, baseOrder({ contactId: "1" }), "ONCE", "แอดมิน")).ok, true);
check("แอดมินใส่ให้ใบเดียวกันซ้ำรอบสอง → ไม่ได้ (contact:1 ใช้ไปแล้ว)", errOf(await applyCouponToOrder(fakeSb, baseOrder({ contactId: "1" }), "ONCE", "แอดมิน")), "คุณใช้คูปองนี้ไปแล้ว (1 บัญชีใช้ได้ครั้งเดียว)");
seedCoupon({ code: "MEMB" });
{
  const r = await applyCouponToOrder(fakeSb, baseOrder({ contactId: "2" }), "MEMB", "แอดมิน");
  check("ใบผูกผู้ติดต่อที่มีบัญชี → จดผู้ใช้สิทธิ์เป็น uuid บัญชี", [r.ok, couponNow("MEMB").redeemedBy], [true, "uuid-M"]);
}

// 7c) ชิงกันพร้อมกัน: อ่านคูปองไปแล้วแต่มีคนตัดสิทธิ์ก่อน (ตัวนับเปลี่ยน) → ต้องได้ 0 แถว ไม่นับซ้อน
seedCoupon({ code: "RACE", maxUses: 2, uses: 0 });
{
  const stale = { ...couponNow("RACE") }; // สภาพที่คำขอ A อ่านไว้
  store.coupons.find((r) => r.code === "RACE")!.data = { ...stale, uses: 1, status: "active" } as unknown as Record<string, unknown>; // คำขอ B ตัดไปก่อน
  const r = await applyCouponToOrder(fakeSb, baseOrder({}), "RACE", "แอดมิน"); // อ่านค่าใหม่ (uses 1) → ล็อกที่ 1 → ผ่าน เป็น 2
  check("ใบ 2 สิทธิ์ถูกตัดไปก่อน 1 → ตัดต่อได้เป็น 2 แล้วหมด", [r.ok, couponNow("RACE").uses, couponNow("RACE").status], [true, 2, "redeemed"]);
  check("รอบถัดไป → หมดสิทธิ์", errOf(await applyCouponToOrder(fakeSb, baseOrder({ id: "OD-3" }), "RACE", "แอดมิน")), "คูปองนี้ถูกใช้ครบสิทธิ์แล้ว");
}

// 8) ใบที่โอนครบแล้ว → ลดแล้วกลายเป็นโอนเกิน = ไม่ให้
seedCoupon({ code: "LATE" });
check(
  "ใบโอนครบแล้ว ใส่คูปองไม่ได้ (โอนเกินต้องคืนเงิน)",
  (await applyCouponToOrder(fakeSb, baseOrder({ paidTotal: 5570, paidReportedAt: "2026-09-29T01:00:00.000Z" } as Partial<Order>), "LATE", "แอดมิน") as { status?: number }).status,
  409
);
check("คูปองไม่ถูกเผา", couponNow("LATE").status, "active");

// 9) ด่านอื่น ๆ
check("ตัวแทนจำหน่าย → ไม่ได้", /ตัวแทน/.test(errOf(await applyCouponToOrder(fakeSb, baseOrder({ dealer: true }), "LATE", "แอดมิน")) ?? ""), true);
check("ใบใช้คูปองอยู่แล้ว → ต้องถอดก่อน", /ถอดออกก่อน/.test(errOf(await applyCouponToOrder(fakeSb, baseOrder({ discount: { label: "คูปอง X (฿1)", amount: 1, couponCode: "X" } }), "LATE", "แอดมิน")) ?? ""), true);
check("ไม่มีคูปองนี้", errOf(await applyCouponToOrder(fakeSb, baseOrder({}), "NOPE", "แอดมิน")), "ไม่พบคูปองนี้");
check("หมดอายุ", (seedCoupon({ code: "OLD", expiresAt: "2020-01-01T00:00:00.000Z" }), errOf(await applyCouponToOrder(fakeSb, baseOrder({}), "OLD", "แอดมิน"))), "คูปองหมดอายุแล้ว");
check("ยอดไม่ถึงขั้นต่ำ", (seedCoupon({ code: "MIN", minSpend: 99999 }), errOf(await applyCouponToOrder(fakeSb, baseOrder({}), "MIN", "แอดมิน"))), "ยอดสั่งซื้อยังไม่ถึงขั้นต่ำของคูปอง");
check("ถอดจากใบที่ไม่ได้ใช้คูปอง", errOf(await removeCouponFromOrder(fakeSb, baseOrder({}), "แอดมิน")), "ใบนี้ไม่ได้ใช้คูปอง");

console.log(fail ? `\n❌ ไม่ผ่าน ${fail} เคส` : "\n✅ ผ่านทุกเคส");
process.exit(fail ? 1 : 0);
