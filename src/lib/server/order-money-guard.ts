import type { Order, OrderStatus } from "@/lib/admin-data";

/**
 * 💰 ฟิลด์ "เรื่องเงิน" ของใบ — เงินเข้า/สลิป/ส่วนลดที่ล็อกแล้ว/ค่าบริการที่เก็บเพิ่ม
 * ทุกตัวถูกเขียนโดยเส้นทางของตัวเอง (slip-apply · /orders/slip · /orders/charge · cron) ที่อ่านใบสดจากฐานเสมอ
 * หน้าออเดอร์ไม่เคยแก้ตรง ๆ — มันแค่ "ส่งคืน" ค่าที่โหลดมา ก้อนเก่าจึงลบของจริงทิ้งได้
 */
const MONEY_KEYS = [
  "paidTotal",
  "payments",
  "charges",
  "slipPath",
  "slipHash",
  "slipUrl",
  "slipVerify",
  "paidReportedAt",
  "deposit",
  "earlyPay",
  "reopenedFrom",
] as const satisfies readonly (keyof Order)[];

/** สถานะ "ก่อนได้เงิน" — หน้าจอที่ยังไม่เห็นเงินก้อนล่าสุดส่งค่าพวกนี้มา = ค่าเก่าค้างจอ ไม่ใช่คำสั่งของแอดมิน */
const PRE_PAID_STATUSES: OrderStatus[] = ["รอชำระเงิน", "รอตรวจสอบ"];

/**
 * เวลาล่าสุดที่ "เรื่องเงิน" ของใบนี้ขยับ (แนบสลิป · ผลตรวจ SlipOK · ยืนยันงวดมัดจำ · ล็อกส่วนลดโอนไว · เก็บเพิ่ม)
 * ⚠️ ไม่นับ waivedAt (ติ๊ก "ลูกค้าไม่รับส่วนลด") — อันนั้นหน้าจอเป็นคนติ๊ก ติ๊กออกแล้วเวลาต้องหายได้
 */
export function moneyStamp(o: Order): string {
  return [
    o.paidReportedAt,
    o.slipVerify?.at,
    o.earlyPay?.lockedAt,
    o.deposit?.firstPaidAt,
    o.deposit?.settledAt,
    o.deposit?.balanceReportedAt,
    o.deposit?.balanceVerify?.at,
    ...(o.payments ?? []).map((p) => p.at),
    ...(o.charges ?? []).map((c) => c.at),
  ]
    .filter((x): x is string => typeof x === "string" && x !== "")
    .sort()
    .pop() ?? "";
}

/**
 * 💰 กันหน้าจอค้างลบ "เงินที่เข้ามาแล้ว" ทิ้ง
 *
 * ทำไม (OD-260915-6742 · 15 ก.ย. 69): ลูกค้าแนบสลิป 495 บาท 15:38 SlipOK ผ่าน → ยืนยันชำระ + ล็อกส่วนลดโอนไว
 * 4 นาทีต่อมา หน้าออเดอร์ที่พนักงานเปิดค้างไว้ตั้งแต่ 15:16 (โพลลิงหยุดตอนเคอร์เซอร์อยู่ในช่องกรอก) กดบันทึก
 * ก้อนเก่าที่ส่งมาไม่มี paidTotal/slipVerify/earlyPay.lockedAt และสถานะยังเป็น "รอชำระเงิน" → ทับของจริงหายหมด
 * → ไลน์เด้งบอกลูกค้าที่จ่ายครบแล้วว่า "รอชำระเงิน" · ส่วนลดโอนไวกลายเป็นหมดเวลา ยอดเด้งกลับ 500 สลิปเลยดูโอนขาด ฿5
 * → ลูกค้าแนบสลิปใบเดิมซ้ำ SlipOK ตอบ "สลิปซ้ำ" ใบค้าง "รอตรวจสอบ" ทั้งที่เงินเข้าครบตั้งแต่แรก
 *
 * กติกา: ในฐานมีเรื่องเงินที่ใหม่กว่าทั้ง (1) เวลาที่หน้าจอเห็นข้อมูลล่าสุด และ (2) เรื่องเงินที่หน้าจอส่งกลับมา
 *        = หน้าจอนั้นยังไม่รู้ว่ามีเงินเข้า → คงค่าในฐานไว้ทั้งชุด (รวมสถานะ ถ้าหน้าจอยังส่งสถานะ "ก่อนได้เงิน" มา)
 * เงื่อนไข (2) ทำให้หน้าจอที่เห็นเงินก้อนล่าสุดแล้วยัง "แก้เรื่องเงินได้ตามปกติ" (ติ๊กไม่รับส่วนลด · ยืนยันงวดมัดจำ)
 */
export function keepServerMoney(existing: Order, incoming: Order, clientSavedAt: string): { order: Order; kept: string[] } {
  const stamp = moneyStamp(existing);
  if (!stamp || stamp <= clientSavedAt || stamp <= moneyStamp(incoming)) return { order: incoming, kept: [] };
  const out: Order = { ...incoming };
  const kept: string[] = [];
  for (const k of MONEY_KEYS) {
    if (JSON.stringify(existing[k] ?? null) === JSON.stringify(incoming[k] ?? null)) continue;
    (out as unknown as Record<string, unknown>)[k] = existing[k];
    kept.push(k);
  }
  if (existing.status !== incoming.status && PRE_PAID_STATUSES.includes(incoming.status)) {
    out.status = existing.status;
    kept.push("status");
  }
  return { order: out, kept };
}
