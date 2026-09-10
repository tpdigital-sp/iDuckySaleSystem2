import { amountDueNow, orderBalance, orderTotal, paidSoFar, type Order, type OrderPayment } from "./admin-data";

/**
 * 💸 บัญชีรับเงินของออเดอร์ — มองสลิปทุกใบเป็นรายการเดียวกัน (ใช้ได้ทั้งฝั่งลูกค้า/แอดมิน/เซิร์ฟเวอร์)
 *
 * ออเดอร์มี "ช่องหลัก" 2 ช่องที่ทุกจอรู้จักมาก่อน:
 *   first   = order.slipPath (ใบแรก — ใบธรรมดา = เต็มจำนวน · ใบมัดจำ = งวดแรก 50%)
 *   balance = deposit.balanceSlipPath (ยอดคงเหลือ 50% หลังของใบมัดจำ)
 * ใบที่เกินจากนั้น (โอนขาดแล้วโอนตาม · โอนแยกบัญชี · จ่ายค่าบริการ/สั่งเพิ่มทีหลัง) เข้า order.payments[] = "extra" ไม่จำกัดจำนวน
 *
 * กติกาเดียว: ยอดค้าง = orderTotal − paidTotal · สลิปใบถัดไปถูกเทียบกับ "ยอดค้างตอนนั้น" เสมอ
 */
export type SlipPhase = "first" | "balance" | "extra";

/** ช่องหลักนี้ "ว่าง" ไหม — ไม่มีสลิป หรือมีแต่ตรวจตกและยังไม่ได้นับยอดบางส่วน (แนบใบใหม่ทับได้เหมือนเดิม) */
function slotOpen(path: string | undefined, verify: Order["slipVerify"] | undefined): boolean {
  if (!path) return true;
  return verify?.status !== "pass" && !(verify?.credited ?? 0);
}

/**
 * สลิปใบต่อไปที่ลูกค้า/แอดมินจะแนบ ควรลงช่องไหน — null = ไม่มียอดค้างให้แนบ (ตอบ 409)
 * ลูกค้าไม่ต้องรู้จัก "งวด" — ปุ่มเดียว ระบบตัดสินเองจากยอดค้าง
 */
export function resolveSlipPhase(o: Order): SlipPhase | null {
  if (o.status === "ยกเลิก") return null;
  const waiting = o.status === "รอชำระเงิน" || o.status === "รอตรวจสอบ";
  const d = o.deposit;
  // ช่องแรกว่าง (ยังไม่มีสลิป หรือใบเดิมตรวจตกไม่นับยอด) และงวดแรกยังไม่ยืนยัน
  const firstOpen = slotOpen(o.slipPath || o.slipUrl, o.slipVerify) && waiting && !d?.firstPaidAt;

  if (d && !d.firstPaidAt) return firstOpen ? "first" : amountDueNow(o) > 0 ? "extra" : null;
  if (d && !d.settledAt) {
    const balanceOpen = slotOpen(d.balanceSlipPath || d.balanceSlipUrl, d.balanceVerify);
    return balanceOpen ? "balance" : orderBalance(o) > 0 ? "extra" : null;
  }
  // ใบธรรมดาที่ยังไม่มีเงินเข้าเลย → ช่องแรก
  if (!d && firstOpen && paidSoFar(o) <= 0) return "first";
  // เคยรับเงินแล้ว (paidTotal มีค่า) และยอดโตทีหลัง → ใบเพิ่ม · paidTotal ไม่มี = ไม่รู้ว่าค้างจริงไหม (แอดมินจัดการเอง)
  return o.paidTotal != null && orderBalance(o) > 0 ? "extra" : null;
}

/**
 * ยอดที่สลิปใบต่อไป "ควรจะเป็น" (บาท) — ทุกช่องใช้ amountDueNow ตัวเดียว:
 * มัดจำงวดแรกที่ยังไม่ครบ = ส่วนที่ขาดของมัดจำ (ไม่ใช่ยอดค้างทั้งบิล) · งวดหลัง/ใบธรรมดา = ยอดค้างที่เหลือ
 * (เคยใช้ orderBalance กับใบเพิ่ม → สลิปเติมมัดจำ 125 ถูกเทียบกับ 350 แล้วตกเป็น "รับบางส่วน" ทั้งที่ครบมัดจำพอดี · 10 ก.ย. 69)
 */
export function expectedForPhase(o: Order, phase: SlipPhase): number {
  void phase;
  return Math.max(0, amountDueNow(o));
}

/** สถานะของสลิปหนึ่งใบตามที่ควรโชว์ */
export type PaymentState = "pass" | "partial" | "accepted" | "fail" | "pending";

/** สลิปหนึ่งใบในรายการรวม — ช่องหลักและใบเพิ่มถูกแปลงให้หน้าตาเดียวกัน */
export interface PaymentEntry {
  /** key สำหรับ React/ชี้ใบ — first · balance · หรือ id ของใบเพิ่ม */
  key: string;
  phase: SlipPhase;
  /** id ของใบเพิ่ม (เฉพาะ phase extra) */
  paymentId?: string;
  /** ลำดับใบ 1..N เรียงตามเวลาแนบ */
  n: number;
  label: string;
  url?: string;
  path?: string;
  at?: string;
  by?: string;
  verify?: Order["slipVerify"];
  /** ยอดที่นับเข้า paidTotal แล้วจากใบนี้ (บาท) — undefined = ยังไม่กระทบยอด */
  credited?: number;
  accepted?: { by: string; at: string };
  state: PaymentState;
}

const stateOf = (verify: Order["slipVerify"] | undefined, credited: number | undefined, accepted: boolean, confirmed: boolean): PaymentState => {
  if (accepted) return "accepted";
  if (verify?.status === "pass" || confirmed) return "pass";
  if ((credited ?? 0) > 0) return "partial";
  if (verify?.status === "fail") return "fail";
  return "pending";
};

/** รายการสลิปทุกใบของออเดอร์ เรียงตามเวลาแนบ (เก่า→ใหม่) — ช่องหลัก + ใบเพิ่ม */
export function paymentEntries(o: Order): PaymentEntry[] {
  const out: Omit<PaymentEntry, "n">[] = [];
  const d = o.deposit;
  const waiting = o.status === "รอชำระเงิน" || o.status === "รอตรวจสอบ";

  if (o.slipPath || o.slipUrl) {
    // ใบแรกถือว่า "ผ่าน" เมื่องวดแรกยืนยันแล้ว (ใบมัดจำ) หรือออเดอร์เลยขั้นรอเงินไปแล้ว (ใบธรรมดา — รวมแอดมินยืนยันเอง)
    const confirmed = d ? !!d.firstPaidAt : !waiting && o.status !== "ยกเลิก";
    const credited = o.slipVerify?.status === "pass" || confirmed ? undefined : o.slipVerify?.credited;
    out.push({
      key: "first",
      phase: "first",
      label: d ? "มัดจำ 50% งวดแรก" : "ชำระเต็มจำนวน",
      url: o.slipUrl,
      path: o.slipPath,
      at: o.paidReportedAt,
      by: "ลูกค้า",
      verify: o.slipVerify,
      credited: credited && credited > 0 ? credited : undefined,
      state: stateOf(o.slipVerify, credited, false, confirmed),
    });
  }
  if (d && (d.balanceSlipPath || d.balanceSlipUrl)) {
    const confirmed = !!d.settledAt;
    const credited = d.balanceVerify?.status === "pass" || confirmed ? undefined : d.balanceVerify?.credited;
    out.push({
      key: "balance",
      phase: "balance",
      label: "ยอดคงเหลือ 50% หลัง",
      url: d.balanceSlipUrl,
      path: d.balanceSlipPath,
      at: d.balanceReportedAt,
      by: "ลูกค้า",
      verify: d.balanceVerify,
      credited: credited && credited > 0 ? credited : undefined,
      state: stateOf(d.balanceVerify, credited, false, confirmed),
    });
  }
  for (const p of o.payments ?? []) {
    out.push({
      key: p.id,
      phase: "extra",
      paymentId: p.id,
      label: p.expected != null ? `โอนเพิ่ม (ค้าง ${p.expected.toLocaleString("th-TH")} บาทตอนแนบ)` : "โอนเพิ่ม",
      url: p.url,
      path: p.path,
      at: p.at,
      by: p.by,
      verify: p.verify,
      credited: p.credited,
      accepted: p.accepted,
      state: stateOf(p.verify, p.credited, !!p.accepted, false),
    });
  }
  out.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  return out.map((e, i) => ({ ...e, n: i + 1 }));
}

/** มีสลิปใบไหนยังรอแอดมินตรวจอยู่ไหม (ตรวจตก/ตรวจไม่ได้ และยังไม่นับยอด) */
export function hasPendingSlip(o: Order): boolean {
  return paymentEntries(o).some((e) => e.state === "fail" || e.state === "pending");
}

/** จ่ายเกินยอดบิลอยู่กี่บาท (เครดิตที่ต้องคืน/แปลงเป็นแต้ม) — 0 = ไม่เกิน */
export function overpaidAmount(o: Order): number {
  if (o.paidTotal == null) return 0;
  return Math.max(0, Math.round((paidSoFar(o) - orderTotal(o)) * 100) / 100);
}

/** ค้นใบเพิ่มด้วย id */
export function findPayment(o: Order, id: string): OrderPayment | undefined {
  return (o.payments ?? []).find((p) => p.id === id);
}

/** รหัสใบเพิ่มแบบสั้น (อ่านง่ายในประวัติ) */
export function newPaymentId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
