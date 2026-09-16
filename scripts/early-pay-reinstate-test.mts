/**
 * ⚡↩️ เทสกติกา "คืนส่วนลดโอนไวให้ใบที่หมดเวลา" — npx tsx --tsconfig tsconfig.json scripts/early-pay-reinstate-test.mts
 *
 * เจ้าของร้านสั่ง 16 ก.ย. 69 (ต่อจากเคส OD-260915-6742):
 *   1) โอนทันเวลาแต่แนบสลิปช้า → ต้องได้ส่วนลด (ดูเวลาโอนบนสลิปจาก SlipOK + ผ่อน graceMinutes)
 *   2) โอนช้าจริงแต่โอนยอดที่ลดแล้วมาพอดี ก่อนเริ่มผลิต → ยกให้ ไม่ทวง ฿5/฿10 (ตัดสินใน slip-apply ด้วยยอด)
 *   3) ปุ่มคืนส่วนลดในหน้าออเดอร์ (reinstateEarlyPay)
 * กติกาที่เทส: transferredInTime · reinstateEarlyPay · parseSlipTransAt · earlyPayOf(graceMinutes)
 */
import { earlyPayState, orderTotal, reinstateEarlyPay, transferredInTime, type Order } from "../src/lib/admin-data";
import { earlyPayOf, DEFAULT_EARLY_PAY } from "../src/lib/early-pay";
import { parseSlipTransAt } from "../src/lib/slip-time";
import { matchSlipAmount } from "../src/lib/server/slipok";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else fails.push(`${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
};

// สั่ง 15:16 · หมดเวลา 16:16 (เวลาไทย = 08:16Z / 09:16Z)
const EXP = "2026-09-15T09:16:00.589Z";
const mk = (o: Partial<Order>): Order =>
  ({ id: "OD-TEST", date: "", customer: "", phone: "", address: "", status: "รอชำระเงิน", payment: "โอนธนาคาร", shipping: "", shippingCost: 50, items: [{ productId: "1-4", name: "กริ๊บต๊อก", qty: 3, unitPrice: 150 }], earlyPay: { label: "⚡ ส่วนลดโอนไว", amount: 5, expiresAt: EXP }, ...o }) as Order;
const expired = mk({});
const LATE = Date.parse("2026-09-15T12:00:00Z"); // แนบสลิป 19:00 — หมดเวลาแล้วแน่

eq("ตั้งต้น: แนบช้า = หมดเวลา ยอดเด้งเป็น 500", [earlyPayState(expired, LATE), orderTotal(expired)], ["expired", 500]);

// ── 1) โอนทันเวลา แนบช้า ─────────────────────────────────────────────────────
eq("โอน 15:37 (ก่อนหมดเวลา 16:16) = ทัน", transferredInTime(expired, "2026-09-15T08:37:00Z", 0), true);
eq("โอน 16:16:00 พอดี = ทัน", transferredInTime(expired, "2026-09-15T09:16:00.589Z", 0), true);
eq("โอน 16:20 ไม่ผ่อน = ไม่ทัน", transferredInTime(expired, "2026-09-15T09:20:00Z", 0), false);
eq("โอน 16:20 ผ่อน 15 นาที = ทัน (ถึง 16:31)", transferredInTime(expired, "2026-09-15T09:20:00Z", 15), true);
eq("โอน 16:32 ผ่อน 15 นาที = ไม่ทัน", transferredInTime(expired, "2026-09-15T09:32:00Z", 15), false);
eq("SlipOK ไม่ส่งเวลาโอน = ตัดสินไม่ได้ (false ให้ทางอื่นดู)", transferredInTime(expired, undefined, 15), false);
eq("ใบไม่จำกัดเวลา (ไม่มี expiresAt) = ไม่เกี่ยว", transferredInTime(mk({ earlyPay: { label: "x", amount: 5 } }), "2026-09-15T08:37:00Z", 15), false);
eq("เวลาโอนอ่านพัง = false", transferredInTime(expired, "ไม่ใช่เวลา", 15), false);

// ── 3) คืนส่วนลด (ปุ่มแอดมิน / slip-apply ใช้ตัวเดียวกัน) ─────────────────────────
const back = reinstateEarlyPay(expired, "2026-09-15T08:37:00Z", "SlipOK");
eq("คืนแล้ว = locked แม้ตอนนี้เลยเวลาไปนาน", earlyPayState(back, LATE), "locked");
eq("คืนแล้วยอดกลับเป็น 495", orderTotal(back), 495);
eq("จำว่าใครคืน/ตัดสินจากเวลาไหน", [back.earlyPay!.lockedAt, back.earlyPay!.lockedBy], ["2026-09-15T08:37:00Z", "SlipOK"]);
eq("ใบที่ล็อกอยู่แล้ว = ไม่แตะ (ไม่เขียนทับเวลาล็อกเดิม)", reinstateEarlyPay(back, "2026-09-16T00:00:00Z", "แอดมิน").earlyPay!.lockedAt, "2026-09-15T08:37:00Z");
eq("ใบที่ยังไม่หมดเวลา (active) = ไม่แตะ (ทางล็อกปกติทำอยู่แล้ว)", reinstateEarlyPay(mk({ earlyPay: { label: "x", amount: 5, expiresAt: "2999-01-01T00:00:00Z" } }), "2026-09-15T08:37:00Z", "x").earlyPay!.lockedAt, undefined);
eq("ลูกค้าไม่รับส่วนลด (waived) = ไม่คืน", earlyPayState(reinstateEarlyPay(mk({ earlyPay: { label: "x", amount: 5, expiresAt: EXP, waivedAt: "2026-09-15T10:00:00Z" } }), "2026-09-15T08:37:00Z", "x"), LATE), "waived");
eq("มีส่วนลดอื่น (superseded) = ไม่คืน", earlyPayState(reinstateEarlyPay(mk({ adminDiscount: { amount: 20 } }), "2026-09-15T08:37:00Z", "x"), LATE), "superseded");
eq("ไม่มีส่วนลดโอนไว = ไม่เกี่ยว", reinstateEarlyPay(mk({ earlyPay: undefined }), "2026-09-15T08:37:00Z", "x").earlyPay, undefined);

// ── เวลาโอนจากคำตอบ SlipOK ─────────────────────────────────────────────────────
eq("transTimestamp ISO", parseSlipTransAt({ transTimestamp: "2026-09-15T08:37:12.000Z" }), "2026-09-15T08:37:12.000Z");
eq("transDate+transTime เวลาไทย → UTC", parseSlipTransAt({ transDate: "20260915", transTime: "15:37:12" }), "2026-09-15T08:37:12.000Z");
eq("transTime ไม่มีวินาที", parseSlipTransAt({ transDate: "20260915", transTime: "15:37" }), "2026-09-15T08:37:00.000Z");
eq("transTimestamp ชนะ transDate", parseSlipTransAt({ transTimestamp: "2026-09-15T08:37:12Z", transDate: "20200101", transTime: "00:00" }), "2026-09-15T08:37:12.000Z");
eq("ไม่มีอะไรเลย = undefined", parseSlipTransAt({}), undefined);
eq("ขยะ = undefined", parseSlipTransAt({ transDate: "วันนี้", transTime: "บ่าย" }), undefined);
eq("null = undefined", parseSlipTransAt(null), undefined);

// ── ตั้งค่า ─────────────────────────────────────────────────────────────────────
eq("ค่าเริ่มต้นผ่อน 15 นาที", DEFAULT_EARLY_PAY.graceMinutes, 15);
eq("ร้านที่ตั้งค่าไว้ก่อนมีช่องนี้ = ได้ 15 เอง", earlyPayOf({ earlyPay: { enabled: true, threshold: 999, small: 5, large: 10, windowMinutes: 60 } }).graceMinutes, 15);
eq("ตั้ง 0 = ไม่ผ่อน", earlyPayOf({ earlyPay: { graceMinutes: 0 } }).graceMinutes, 0);

// ── 2) โอนช้าจริงแต่โอนยอดลดมาพอดี — สูตรที่ slip-apply ใช้ ────────────────────────
const disc = expired.earlyPay!.amount;
const fullExpected = orderTotal(expired); // 500
const paidDiscounted = (slip: number) => Math.abs(Math.round((fullExpected - disc) * 100) / 100 - slip) < 0.01;
eq("โอน 495 = ยอดลดพอดี → ยกให้", paidDiscounted(495), true);
eq("โอน 490 = ขาดมากกว่าส่วนลด → ไม่ยก (รับบางส่วนตามเดิม)", paidDiscounted(490), false);
eq("โอน 500 = เต็ม → ไม่ต้องยุ่ง", paidDiscounted(500), false);
// ⚠️ ฿5/฿10 ชนกับ "หัก ณ ที่จ่าย 1% ของ 500/1,000" และค่าธรรมเนียมโอน — ตัวเทียบยอดเดิมปล่อย 495/500 ผ่านเป็น "หัก ณ ที่จ่าย 1%"
// (นับเงินเข้า 500 ทั้งที่เข้า 495 + รอใบ 50 ทวิที่ไม่มีวันมา) → slip-apply ดักทั้ง fail และ pass-ที่มี-deduction แล้วตีความเป็น "โอนยอดที่ลดแล้ว" ก่อน
eq("495 บนบิล 500 ถูกตัวเทียบเดิมมองเป็นหัก ณ ที่จ่าย 1% (จึงต้องดัก pass+deduction ด้วย)", matchSlipAmount(500, 495, 500).deduction?.kind, "wht");
eq("990 บนบิล 1,000 = 1% เหมือนกัน", matchSlipAmount(1000, 990, 1000).deduction?.kind, "wht");
eq("ส่วนลดที่ยังไม่หัก (earlyPayAllowed) มาก่อน wht/bankFee — ลำดับเดิมที่เราทำตาม", matchSlipAmount(500, 495, 500, undefined, 5).deduction?.kind, "earlyPay");
eq("คืนส่วนลดแล้ว 495 ตรง 495 เป๊ะ ไม่มีส่วนต่างค้าง", matchSlipAmount(495, 495, 495), { ok: true });

console.log(fails.length ? `❌ ไม่ผ่าน ${fails.length} เคส\n\n${fails.join("\n\n")}\n` : "");
console.log(`${fails.length ? "❌" : "✅"} ผ่าน ${pass}/${pass + fails.length} เคส`);
process.exit(fails.length ? 1 : 0);
