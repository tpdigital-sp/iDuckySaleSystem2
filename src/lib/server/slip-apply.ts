import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { amountDueNow, orderSubtotal, orderTotal, withLog, type Order, paidStatusFor } from "@/lib/admin-data";
import { earlyPayAmount, earlyPayOf, type EarlyPayDiscount } from "@/lib/early-pay";
import { verifySlipWithSlipOK, type SlipVerifyResult } from "@/lib/server/slipok";
import { assertSlipNotDuplicate } from "@/lib/server/slip-dedupe";
import { notifyCustomerLogged, orderLink } from "@/lib/server/notify";
import { reportPaidToTP } from "@/lib/server/tp-report";
import { cutStockForOrder } from "@/lib/server/stock";
import { bumpSoldForOrder } from "@/lib/server/sold";
import { awardPointsForOrder } from "@/lib/server/contact-points";

/**
 * ตรวจสลิปกับ SlipOK แล้ว "ลงผล" ให้ออเดอร์ — ใช้ร่วมกันทั้งทางลูกค้าแนบเอง (/api/orders/slip)
 * และทางแอดมินแนบแทน (/api/admin/orders/slip) เพื่อให้กติกาเดียวกันเป๊ะ:
 *   • ผ่าน → ยืนยันชำระ/มัดจำ/ยอดคงเหลืออัตโนมัติ + log + แจ้ง LINE + msVerify + ตัดสต๊อก + ยอดขาย + แต้ม
 *   • ไม่ผ่าน/ระบบล่ม → เก็บผลไว้ให้แอดมินดู แล้วรอตรวจมือ (fail-safe: อัตโนมัติได้เฉพาะทาง "ผ่าน")
 *
 * ออเดอร์ที่ "ยืนยันเงินไปแล้ว" (แอดมินแนบหลักฐานย้อนหลัง) → ตรวจแล้วเก็บผลอย่างเดียว ไม่แตะสถานะ/ยอด/ไม่ยิงซ้ำ
 *
 * กันสลิปซ้ำ: ถ้า SlipOK อ่านเลขอ้างอิงธุรกรรมได้ แล้วเลขนั้นถูกใช้กับออเดอร์อื่น/งวดอื่นอยู่แล้ว
 * → ลบไฟล์ที่เพิ่งอัปโหลดทิ้ง แล้วโยน SlipDuplicateError (เส้น API ตอบ 409) — ไม่บันทึกอะไรลงออเดอร์
 */
export interface ApplySlipInput {
  sb: SupabaseClient;
  order: Order;
  /** path ในบัคเก็ต payment-slips-private ที่อัปโหลดเสร็จแล้ว */
  path: string;
  bytes: Uint8Array;
  contentType: string;
  /** ลายนิ้วมือไฟล์ (SHA-256) — เก็บลง slipHash/balanceSlipHash ไว้กันแนบซ้ำ (ดู slip-dedupe.ts) */
  hash?: string;
  /**
   * ข้ามการเช็คเลขอ้างอิงซ้ำข้ามออเดอร์ — เฉพาะแอดมินยืนยันเองว่าเป็นสลิปโอนรวมหลายออเดอร์
   * (ลูกค้าแนบเองห้ามข้าม)
   */
  allowDuplicate?: boolean;
  /** true = สลิปยอดคงเหลือของออเดอร์มัดจำ (เก็บคนละช่องกับงวดแรก) */
  balancePhase: boolean;
  /** origin ของคำขอ — ใช้ประกอบลิงก์ออเดอร์ในข้อความ LINE */
  origin: string;
  /** วันเวลาที่ถือว่า "แจ้งโอน" งวดแรก (แอดมินแนบย้อนหลังอาจอยากคงค่าเดิม) — ค่าเริ่มต้น = ตอนนี้ */
  paidReportedAt?: string;
}

export interface ApplySlipResult {
  /** ออเดอร์หลังบันทึกลงฐานแล้ว */
  updated: Order;
  verify: SlipVerifyResult;
  /** true = SlipOK ผ่านและระบบยืนยันการรับเงินของงวดนี้ให้แล้ว */
  confirmed: boolean;
}

export async function applySlipVerification(input: ApplySlipInput): Promise<ApplySlipResult> {
  const { sb, order, path, bytes, contentType, balancePhase, origin } = input;

  // ── ตรวจสลิปอัตโนมัติกับ SlipOK (ถ้าตั้งค่าไว้) — เทียบ "ยอดงวดนี้" (มัดจำ/คงเหลือ/เต็ม) ──
  const expected = amountDueNow(order);
  const depositPhase = !!order.deposit && !order.deposit.firstPaidAt; // งวดแรกของออเดอร์มัดจำ
  /**
   * งวดนี้ยังรอเงินอยู่ไหม — ลูกค้าแนบเองผ่านด่านนี้มาก่อนแล้วเสมอ
   * แอดมินแนบย้อนหลังบนออเดอร์ที่ยืนยันไปแล้วจะไม่ผ่าน → เก็บผลตรวจอย่างเดียว
   */
  const eligible = balancePhase
    ? !!order.deposit?.firstPaidAt && !order.deposit.settledAt
    : order.status === "รอชำระเงิน" || order.status === "รอตรวจสอบ";

  /**
   * ⚡ ส่วนลดโอนไวที่ออเดอร์นี้ "ยังไม่ได้หัก" — ยอมให้สลิปขาดได้เท่านี้โดยไม่ตกไปตรวจมือ
   * ออเดอร์ที่สั่งผ่านเว็บหลังเปิดโปรจะมี order.earlyPay อยู่แล้ว (ยอดที่ต้องโอนลดไปแล้ว) → 0 กันหักซ้ำ
   * เหลือไว้ให้ออเดอร์เก่า + ลูกค้าที่รู้โปรจากไลน์แล้วโอนน้อยกว่ายอดที่เห็นในเว็บ
   */
  let earlyPayAllowed = 0;
  // 🤝 ออเดอร์ตัวแทนจำหน่ายไม่มีส่วนลดโอนไว — ห้ามยอมรับสลิปที่โอนขาด ฿5/฿10
  if (!order.earlyPay && !order.dealer) {
    try {
      const { data: settRow } = await sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle();
      earlyPayAllowed = earlyPayAmount(orderSubtotal(order), earlyPayOf(settRow?.data as { earlyPay?: EarlyPayDiscount } | undefined));
    } catch {
      // อ่านตั้งค่าไม่ได้ = ไม่ยอมรับส่วนต่าง ตกไปตรวจมือตามเดิม (fail-safe)
    }
  }
  const verify = await verifySlipWithSlipOK(bytes, contentType, expected, orderTotal(order), order.wht, earlyPayAllowed);

  // ── กันสลิปซ้ำชั้นที่ 2: เลขอ้างอิงธุรกรรมจาก QR ซ้ำกับออเดอร์อื่น/งวดอื่น แม้ไฟล์จะต่างกัน ──
  // (แคปหน้าจอใหม่/ครอป/บีบรูป ลายนิ้วมือไฟล์ไม่เหมือนเดิม แต่ธุรกรรมเดียวกัน) → ลบไฟล์ที่เพิ่งอัปทิ้ง แล้วโยน 409
  if (verify.transRef && !input.allowDuplicate) {
    try {
      await assertSlipNotDuplicate(sb, { transRef: verify.transRef }, { orderId: order.id, phase: balancePhase ? "balance" : "first" });
    } catch (e) {
      await sb.storage.from("payment-slips-private").remove([path]).catch(() => undefined);
      throw e;
    }
  }

  const now = new Date().toISOString();
  const confirmed = eligible && verify.status === "pass";
  // ท้ายประโยคบันทึก/แจ้งเตือน เมื่อสลิปโดนหัก ณ ที่จ่าย 1%/3% หรือค่าธรรมเนียมโอน
  const dedNote = verify.deduction
    ? ` · ${verify.deduction.label} ${verify.deduction.amount.toLocaleString("th-TH")} บาท${verify.deduction.kind === "wht" ? " — รอใบ 50 ทวิจากลูกค้า" : ""}`
    : "";
  const amountNote = `ยอด ${verify.amount ?? expected} บาท${verify.transRef ? ` · อ้างอิง ${verify.transRef}` : ""}${dedNote}`;

  // ผลตรวจของงวดนี้ — งวดแรกลง slipVerify · งวดหลังลง deposit.balanceVerify (คนละช่อง ไม่ทับกัน)
  const vRec: Order["slipVerify"] =
    verify.status === "pass" || verify.status === "fail"
      ? { status: verify.status, detail: verify.detail, amount: verify.amount, transRef: verify.transRef, at: now, deduction: verify.deduction }
      : undefined;
  let updated: Order = {
    ...order,
    // งวดหลังของออเดอร์มัดจำเก็บแยกช่อง — ไม่งั้นสลิปมัดจำงวดแรกถูกทับหาย
    ...(balancePhase
      ? { deposit: { ...order.deposit!, balanceSlipPath: path, balanceSlipHash: input.hash, balanceReportedAt: now, balanceVerify: vRec } }
      : { slipPath: path, slipHash: input.hash, slipUrl: undefined, paidReportedAt: input.paidReportedAt ?? now, slipVerify: vRec }),
  };

  if (!eligible) {
    // ออเดอร์ยืนยันเงินงวดนี้ไปแล้ว (แอดมินแนบหลักฐานย้อนหลัง) — บันทึกผลตรวจไว้ดูอย่างเดียว
    if (verify.status === "pass")
      updated = withLog(updated, "SlipOK", "ตรวจสลิปแล้ว: ยอดถูกต้อง (ออเดอร์ยืนยันรับเงินไว้ก่อนแล้ว — ไม่เปลี่ยนสถานะ)", amountNote);
    else if (verify.status === "fail") updated = withLog(updated, "SlipOK", "สลิปตรวจไม่ผ่าน — กรุณาตรวจสลิปเอง", verify.detail ?? "");
  } else if (balancePhase) {
    // งวดหลังของออเดอร์มัดจำ — สถานะงานเดินต่อตามเดิม ไม่ถอยกลับไปรอตรวจสอบ
    if (verify.status === "pass") {
      // ต่อจาก updated (ไม่ใช่ order) เพราะเพิ่งใส่ balanceSlipPath ไปในนั้น
      updated = { ...updated, paidTotal: orderTotal(order), deposit: { ...updated.deposit!, settledAt: now } };
      updated = withLog(updated, "SlipOK", "รับยอดคงเหลือครบแล้ว (อัตโนมัติ)", amountNote);
    } else {
      updated = withLog(updated, "SlipOK", "สลิปยอดคงเหลือรอแอดมินตรวจ", verify.detail ?? "ตรวจอัตโนมัติไม่ได้");
    }
  } else {
    updated = {
      ...updated,
      // จำยอดที่รับ ณ งวดนี้ — ออเดอร์มัดจำเก็บแค่ยอดงวดแรกก่อน
      paidTotal: expected,
      // ผ่านการตรวจอัตโนมัติเท่านั้นถึงยืนยันให้เลย — นอกนั้นรอแอดมินตรวจตามเดิม
      // ผ่านแล้ว: งานที่ลูกค้าจัดวางลายบนเทมเพลตเองมาครบ ข้ามไป "อนุมัติแบบ" เลย
      // (กราฟฟิกไม่ต้องทำแบบ ลูกค้าไม่ต้องตรวจซ้ำ) · งานอื่นเป็น "ชำระแล้ว" ตามเดิม
      status: verify.status === "pass" ? paidStatusFor(order) : "รอตรวจสอบ",
      ...(depositPhase && verify.status === "pass" ? { deposit: { ...order.deposit!, firstPaidAt: now } } : {}),
    };
    if (verify.status === "pass")
      updated = withLog(updated, "SlipOK", depositPhase ? "ยืนยันมัดจำ 50% อัตโนมัติ" : "ยืนยันการชำระเงินอัตโนมัติ", amountNote);
    else if (verify.status === "fail") updated = withLog(updated, "SlipOK", "สลิปตรวจไม่ผ่าน — รอแอดมินตรวจเอง", verify.detail ?? "");
  }

  const { error: saveErr } = await sb.from("orders").update({ data: updated }).eq("id", order.id);
  if (saveErr) throw new Error(saveErr.message);

  // ผ่านอัตโนมัติ → แจ้งลูกค้าทันทีเหมือนแอดมินกดยืนยันเอง (เงียบถ้ายังไม่ตั้งค่า LINE)
  if (confirmed) {
    const link = orderLink(origin, updated);
    // เงินเข้าบัญชีจริง = ยอดในสลิป (น้อยกว่ายอดตั้งเมื่อโดนหัก ณ ที่จ่าย/ค่าธรรมเนียม) — ให้ msVerify กระทบยอดกับธนาคารตรง
    const received = verify.amount ?? expected;
    // ขอใบ 50 ทวิจากลูกค้าไปในข้อความยืนยันเลย — เคสหัก ณ ที่จ่าย
    const whtAsk = verify.deduction?.kind === "wht" ? `\nรับยอดหลัง${verify.deduction.label} — รบกวนส่งหนังสือรับรองหักภาษี ณ ที่จ่าย (50 ทวิ) ให้ทางร้านด้วยนะครับ` : "";
    if (balancePhase) {
      void notifyCustomerLogged(sb, updated, `✅ รับยอดคงเหลือออเดอร์ ${updated.id} ครบแล้ว ขอบคุณครับ${whtAsk}\n${link}`, "ยืนยันรับยอดคงเหลือครบ");
      void reportPaidToTP(updated, "SlipOK อัตโนมัติ", { docSuffix: "-final", amount: received, noteSuffix: `ยอดคงเหลือ 50% หลัง (ครบแล้ว)${dedNote}` });
    } else if (depositPhase) {
      const remain = orderTotal(updated) - (updated.paidTotal ?? 0);
      void notifyCustomerLogged(sb, updated, `✅ รับมัดจำออเดอร์ ${updated.id} แล้ว เริ่มงานให้เลยครับ\nยอดคงเหลือ ${remain.toLocaleString()} บาท ชำระก่อนจัดส่ง${whtAsk}\n${link}`, "ยืนยันรับมัดจำ");
      void reportPaidToTP(updated, "SlipOK อัตโนมัติ", { amount: received, noteSuffix: `มัดจำ 50% งวดแรก${dedNote}` });
    } else {
      void notifyCustomerLogged(sb, updated, `✅ ยืนยันการชำระเงินออเดอร์ ${updated.id} แล้ว กำลังเริ่มงานให้ครับ${whtAsk}\n${link}`, "ยืนยันการชำระเงิน");
      // ส่งเข้า msVerify ระบบ Admin (fire-and-forget) — โดนหักมา = แจ้งยอดจริงพร้อมเหตุผล
      void reportPaidToTP(updated, "SlipOK อัตโนมัติ", verify.deduction ? { amount: received, noteSuffix: dedNote.replace(/^ · /, "") } : undefined);
    }
    if (!balancePhase) void cutStockForOrder(updated); // ตัดสต๊อกวัสดุที่ผูกไว้ (มัดจำ = เริ่มงานแล้วก็ตัดเลย)
    void bumpSoldForOrder(updated.id); // ยอด "ขายแล้ว" หน้าเว็บ (กันซ้ำในตัวเอง)
    // 🦆 แต้มสะสม — บวกเมื่อชำระ "ครบ" เท่านั้น: ออเดอร์ปกติ = งวดเดียวจบ · มัดจำ = ตอนยอดคงเหลือครบ (idempotent)
    if (!order.deposit || balancePhase) void awardPointsForOrder(updated);
  }

  return { updated, verify, confirmed };
}
