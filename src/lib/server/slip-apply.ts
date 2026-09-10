import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { earlyPayState, lockEarlyPay, orderTotal, paidSoFar, paidStatusFor, withLog, type Order, type OrderPayment } from "@/lib/admin-data";
import { expectedForPhase, type SlipPhase } from "@/lib/payments";
import { earlyPayAmount, earlyPayBase, earlyPayOf, type EarlyPayDiscount } from "@/lib/early-pay";
import { getProductServer } from "@/lib/products-server";
import type { Product } from "@/lib/products";
import { verifySlipWithSlipOK, type SlipVerifyResult } from "@/lib/server/slipok";
import { assertSlipNotDuplicate } from "@/lib/server/slip-dedupe";
import { notifyCustomerLogged, orderLink } from "@/lib/server/notify";
import { reportPaidToTP, syncPaidCompleteToTP } from "@/lib/server/tp-report";
import { cutStockForOrder } from "@/lib/server/stock";
import { bumpSoldForOrder } from "@/lib/server/sold";
import { awardPointsForOrder } from "@/lib/server/contact-points";

/**
 * ตรวจสลิปกับ SlipOK แล้ว "ลงผล" ให้ออเดอร์ — ใช้ร่วมกันทั้งทางลูกค้าแนบเอง (/api/orders/slip)
 * และทางแอดมินแนบแทน (/api/admin/orders/slip) เพื่อให้กติกาเดียวกันเป๊ะ:
 *   • ผ่าน → นับยอดเข้า paidTotal · ถ้าครบงวด → ยืนยันชำระ/มัดจำ/ยอดคงเหลืออัตโนมัติ + log + แจ้ง LINE + msVerify + ตัดสต๊อก + ยอดขาย + แต้ม
 *   • สลิปแท้แต่โอนขาด (SlipOK ยืนยันเงินเข้าจริง ยอดไม่ตรง) → "รับบางส่วน": นับยอดที่เข้าจริง + แจ้งลูกค้ายอดที่เหลือ
 *     ไม่ยืนยันงวด งานยังไม่เริ่ม — ลูกค้าโอนเพิ่มแล้วแนบใบต่อไปได้เอง ไม่ต้องรอแอดมิน
 *   • ตรวจไม่ได้/ระบบล่ม → เก็บผลไว้ให้แอดมินดู แล้วรอตรวจมือ (fail-safe: อัตโนมัติได้เฉพาะเมื่อ SlipOK ยืนยันสลิปแท้)
 *
 * 💸 สลิปมีได้หลายใบ (ดู @/lib/payments): ช่องหลัก first/balance ตามเดิม · ใบที่เกินเข้า order.payments[] (extra)
 * ทุกใบถูกเทียบกับ "ยอดค้าง ณ ตอนนั้น" ไม่ใช่ยอดเต็ม — 2 ใบ 3 ใบ 5 ใบ ก็โค้ดเดียวกัน
 *
 * ออเดอร์ที่ "ยืนยันเงินไปแล้ว" และไม่มียอดค้าง (แอดมินแนบหลักฐานย้อนหลัง) → ตรวจแล้วเก็บผลอย่างเดียว ไม่แตะสถานะ/ยอด/ไม่ยิงซ้ำ
 *
 * กันสลิปซ้ำ: ถ้า SlipOK อ่านเลขอ้างอิงธุรกรรมได้ แล้วเลขนั้นถูกใช้กับออเดอร์อื่น/ใบอื่นอยู่แล้ว
 * → ลบไฟล์ที่เพิ่งอัปโหลดทิ้ง แล้วโยน SlipDuplicateError (เส้น API ตอบ 409) — ไม่บันทึกอะไรลงออเดอร์
 */
export interface ApplySlipInput {
  sb: SupabaseClient;
  order: Order;
  /** path ในบัคเก็ต payment-slips-private ที่อัปโหลดเสร็จแล้ว */
  path: string;
  bytes: Uint8Array;
  contentType: string;
  /** ลายนิ้วมือไฟล์ (SHA-256) — เก็บลง slipHash/balanceSlipHash/payments[].hash ไว้กันแนบซ้ำ (ดู slip-dedupe.ts) */
  hash?: string;
  /**
   * ข้ามการเช็คเลขอ้างอิงซ้ำข้ามออเดอร์ — เฉพาะแอดมินยืนยันเองว่าเป็นสลิปโอนรวมหลายออเดอร์
   * (ลูกค้าแนบเองห้ามข้าม)
   */
  allowDuplicate?: boolean;
  /** ช่องที่สลิปใบนี้ลง — first/balance = ช่องหลักเดิม · extra = ใบเพิ่มใน payments[] */
  phase: SlipPhase;
  /** ตรวจซ้ำใบเพิ่มใบไหน (phase extra + recheck) */
  paymentId?: string;
  /** ใครแนบ — ลง payments[].by (ไม่ส่ง = "ลูกค้า") */
  by?: string;
  /** origin ของคำขอ — ใช้ประกอบลิงก์ออเดอร์ในข้อความ LINE */
  origin: string;
  /** วันเวลาที่ถือว่า "แจ้งโอน" งวดแรก (แอดมินแนบย้อนหลังอาจอยากคงค่าเดิม) — ค่าเริ่มต้น = ตอนนี้ */
  paidReportedAt?: string;
  /**
   * 🔄 ตรวจซ้ำสลิปใบเดิมที่แนบไว้แล้ว (แอดมินกด "ตรวจสลิปอีกครั้ง" หลัง SlipOK ตอบ 1010 เพราะลูกค้าแนบเร็วกว่าธนาคารส่งข้อมูล)
   * — ไม่ลบไฟล์ทิ้งแม้เจอเลขอ้างอิงซ้ำ (ไฟล์เป็นของออเดอร์นี้อยู่แล้ว), คงเวลาแจ้งโอนเดิม, log บอกว่าเป็นการตรวจซ้ำ
   */
  recheck?: boolean;
}

export interface ApplySlipResult {
  /** ออเดอร์หลังบันทึกลงฐานแล้ว */
  updated: Order;
  verify: SlipVerifyResult;
  /** true = SlipOK ผ่านและระบบยืนยันการรับเงินของงวดนี้ให้แล้ว (ครบงวด) */
  confirmed: boolean;
  /** true = สลิปแท้แต่โอนขาด — นับยอดบางส่วนแล้ว ยังค้างอยู่ */
  partial: boolean;
  /** id ของใบเพิ่มที่เพิ่งลง (phase extra) */
  paymentId?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const thb = (n: number) => n.toLocaleString("th-TH");

/** ผลตรวจที่จะเก็บลงออเดอร์ (ตัด skip ทิ้ง — ไม่มีอะไรให้จำ) */
function verifyRecord(verify: SlipVerifyResult, now: string): Order["slipVerify"] {
  if (verify.status !== "pass" && verify.status !== "fail") return undefined;
  return { status: verify.status, detail: verify.detail, amount: verify.amount, transRef: verify.transRef, at: now, deduction: verify.deduction };
}

export async function applySlipVerification(input: ApplySlipInput): Promise<ApplySlipResult> {
  const { sb, path, bytes, contentType, phase, origin } = input;
  const by = input.by?.trim() || "ลูกค้า";

  /**
   * ⏳ แจ้งโอนทันเวลา → ล็อกส่วนลดโอนไวไว้ "ก่อน" คิดยอดที่ต้องโอน (ไม่งั้นเลยเวลาแล้วยอดที่คาดหวังกลับเป็นเต็ม)
   * นับที่เวลาแจ้งโอน (paidReportedAt — แอดมินแนบย้อนหลังส่งเวลาจริงมาได้) ไม่ใช่เวลาที่โอนในสลิป
   * เลยเวลาแล้ว = ไม่ล็อก ยอดที่ต้องโอนเป็นยอดเต็ม สลิปที่โอนขาดเท่าส่วนลดจะตกไป "รับบางส่วน" ให้แอดมินดู
   */
  const lockAt = input.paidReportedAt ?? new Date().toISOString();
  const order =
    earlyPayState(input.order, Date.parse(lockAt) || Date.now()) === "active"
      ? withLog(lockEarlyPay(input.order, lockAt, by), by, "ล็อกส่วนลดโอนไว", `แจ้งโอนทันเวลา — ได้ส่วนลด ${thb(input.order.earlyPay!.amount)} บาท`)
      : input.order;

  // ── ยอดที่สลิปใบนี้ควรจะเป็น = ยอดค้างของช่องนั้น ณ ตอนนี้ (ไม่ใช่ยอดเต็ม) ──
  const expected = expectedForPhase(order, phase);
  const waiting = order.status === "รอชำระเงิน" || order.status === "รอตรวจสอบ";
  /**
   * ยังมีเงินให้รับอยู่ไหม — ลูกค้าแนบเองผ่านด่าน resolveSlipPhase มาก่อนแล้วเสมอ
   * แอดมินแนบย้อนหลังบนออเดอร์ที่ครบแล้วจะไม่ผ่าน → เก็บผลตรวจอย่างเดียว
   */
  const eligible = expected > 0 && (phase === "first" ? waiting : true);

  /**
   * ⚡ ส่วนลดโอนไวที่ออเดอร์นี้ "ยังไม่ได้หัก" — ยอมให้สลิปขาดได้เท่านี้โดยไม่ตกไปตรวจมือ
   * ออเดอร์ที่สั่งผ่านเว็บหลังเปิดโปรจะมี order.earlyPay อยู่แล้ว (ยอดที่ต้องโอนลดไปแล้ว) → 0 กันหักซ้ำ
   * เหลือไว้ให้ออเดอร์เก่า + ลูกค้าที่รู้โปรจากไลน์แล้วโอนน้อยกว่ายอดที่เห็นในเว็บ
   * ยอมครั้งเดียวต่อออเดอร์ — เคยรับเงินไปแล้ว (paidSoFar > 0) = ใบต่อ ๆ ไปห้ามขาดอีก ไม่งั้นโอน 3 ใบขาดได้ 3 รอบ
   * เฉพาะออเดอร์ราคาปลีกล้วนเหมือนตอน checkout — ใบที่มีบรรทัดเรทขายส่งไม่มีส่วนลดนี้ สลิปขาด ฿10 ต้องตกไปตรวจมือ
   */
  let earlyPayAllowed = 0;
  // 🤝 ออเดอร์ตัวแทนจำหน่ายไม่มีส่วนลดโอนไว — ห้ามยอมรับสลิปที่โอนขาด ฿5/฿10
  if (!order.earlyPay && !order.dealer && paidSoFar(order) <= 0) {
    try {
      const { data: settRow } = await sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle();
      const prods = new Map<string, Product>();
      for (const pid of [...new Set(order.items.map((i) => i.productId).filter(Boolean))]) {
        const p = await getProductServer(pid);
        if (p) prods.set(pid, p);
      }
      const goods = earlyPayBase(
        order.items.map((i) => ({ productId: i.productId, selections: i.sel, qty: i.qty, amount: i.qty * i.unitPrice })),
        (id) => prods.get(id),
        { mergeLots: true }
      );
      earlyPayAllowed = earlyPayAmount(goods, earlyPayOf(settRow?.data as { earlyPay?: EarlyPayDiscount } | undefined));
    } catch {
      // อ่านตั้งค่าไม่ได้ = ไม่ยอมรับส่วนต่าง ตกไปตรวจมือตามเดิม (fail-safe)
    }
  }
  const verify = await verifySlipWithSlipOK(bytes, contentType, expected, orderTotal(order), order.wht, earlyPayAllowed);

  // ── กันสลิปซ้ำชั้นที่ 2: เลขอ้างอิงธุรกรรมจาก QR ซ้ำกับออเดอร์อื่น/ใบอื่น แม้ไฟล์จะต่างกัน ──
  // (แคปหน้าจอใหม่/ครอป/บีบรูป ลายนิ้วมือไฟล์ไม่เหมือนเดิม แต่ธุรกรรมเดียวกัน) → ลบไฟล์ที่เพิ่งอัปทิ้ง แล้วโยน 409
  if (verify.transRef && !input.allowDuplicate) {
    try {
      await assertSlipNotDuplicate(sb, { transRef: verify.transRef }, { orderId: order.id, phase, paymentId: input.paymentId });
    } catch (e) {
      // ตรวจซ้ำ = ไฟล์เป็นของออเดอร์นี้อยู่แล้ว ห้ามลบ (แค่ตอบว่าซ้ำให้แอดมินไปตามต่อ)
      if (!input.recheck) await sb.storage.from("payment-slips-private").remove([path]).catch(() => undefined);
      throw e;
    }
  }

  const now = new Date().toISOString();
  const pass = eligible && verify.status === "pass";
  /**
   * 💸 รับบางส่วน: SlipOK ยืนยันสลิปแท้ อ่านยอดได้ แต่ยอดขาดและไม่เข้าข่ายส่วนต่างที่รู้จัก
   * เงินเข้าบัญชีร้านจริงแล้ว → นับยอดนั้นไว้ แล้วให้ลูกค้าโอนส่วนที่เหลือ (ไม่ต้องรอแอดมินเทียบยอด)
   * ไม่รวมกรณีอ่านยอดไม่ได้ (amount ว่าง) หรือ SlipOK บอกว่าสลิปซ้ำ
   */
  const partial =
    eligible && !pass && verify.status === "fail" && verify.genuine === true && !verify.duplicate && (verify.amount ?? 0) > 0 && (verify.amount ?? 0) < expected;
  // ยอดที่นับเข้า paidTotal จากใบนี้ — ผ่าน = ยอดค้างทั้งก้อน (ส่วนต่างที่ยอมรับถือว่าจ่ายครบ) · บางส่วน = ยอดที่เข้าจริง
  const credit = pass ? expected : partial ? round2(verify.amount!) : 0;
  const over = pass && (verify.amount ?? 0) > expected + 0.5 ? round2(verify.amount! - expected) : 0;

  // ท้ายประโยคบันทึก/แจ้งเตือน เมื่อสลิปโดนหัก ณ ที่จ่าย 1%/3% หรือค่าธรรมเนียมโอน
  const dedNote = verify.deduction
    ? ` · ${verify.deduction.label} ${thb(verify.deduction.amount)} บาท${verify.deduction.kind === "wht" ? " — รอใบ 50 ทวิจากลูกค้า" : ""}`
    : "";
  const overNote = over > 0 ? ` · ⚠️ โอนเกิน ${thb(over)} บาท (คืนลูกค้า/แปลงเป็นแต้ม)` : "";
  const amountNote = `ยอด ${thb(verify.amount ?? expected)} บาท${verify.transRef ? ` · อ้างอิง ${verify.transRef}` : ""}${dedNote}${overNote}`;

  // ผลตรวจของใบนี้ — ใส่ credited เมื่อรับบางส่วน (ห้ามนับซ้ำตอนตรวจซ้ำ/ลบ) · over เมื่อโอนเกิน
  const vRec: Order["slipVerify"] = verifyRecord(verify, now);
  const vStored: Order["slipVerify"] = vRec ? { ...vRec, ...(partial ? { credited: credit } : {}), ...(over > 0 ? { over } : {}) } : undefined;

  // คำขึ้นต้นบรรทัดประวัติ — ตรวจซ้ำให้อ่านออกว่าเป็นรอบที่สอง ไม่ใช่สลิปใบใหม่
  const rc = input.recheck ? "ตรวจซ้ำ: " : "";

  // ── 1) วางสลิปลงช่อง ──
  let updated: Order = order;
  let paymentId = input.paymentId;
  if (phase === "balance") {
    // งวดหลังของออเดอร์มัดจำเก็บแยกช่อง — ไม่งั้นสลิปมัดจำงวดแรกถูกทับหาย
    updated = {
      ...order,
      deposit: {
        ...order.deposit!,
        balanceSlipPath: path,
        balanceSlipHash: input.hash,
        // ตรวจซ้ำ = คงเวลาที่ลูกค้าแจ้งโอนไว้เดิม (ไม่ใช่เวลาที่แอดมินกดตรวจ)
        balanceReportedAt: input.recheck ? order.deposit?.balanceReportedAt ?? now : now,
        balanceVerify: vStored,
      },
    };
  } else if (phase === "first") {
    updated = { ...order, slipPath: path, slipHash: input.hash, slipUrl: undefined, paidReportedAt: input.paidReportedAt ?? now, slipVerify: vStored };
  } else {
    // ใบเพิ่ม — ตรวจซ้ำ = อัปเดตใบเดิม · ใบใหม่ = ต่อท้ายอาเรย์
    const list = [...(order.payments ?? [])];
    const idx = paymentId ? list.findIndex((p) => p.id === paymentId) : -1;
    const base: OrderPayment | undefined = idx >= 0 ? list[idx] : undefined;
    if (!paymentId) paymentId = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const entry: OrderPayment = {
      id: paymentId,
      path,
      hash: input.hash ?? base?.hash,
      at: base?.at ?? now,
      by: base?.by ?? by,
      expected: base?.expected ?? expected,
      verify: vStored,
      // ใบเพิ่ม: ยอดที่นับเข้า paidTotal อยู่ที่ payments[].credited (ทั้งผ่านและบางส่วน)
      credited: credit > 0 ? credit : undefined,
    };
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    updated = { ...order, payments: list };
  }

  // ── 2) นับยอด + ตัดสินว่างวดนี้ครบหรือยัง ──
  let confirmedFull = false; // ยืนยันรับเงินครบ (ใบธรรมดา = ทั้งบิล · มัดจำ = งวดหลังครบ)
  let confirmedDeposit = false; // ยืนยันมัดจำงวดแรก
  if (!eligible) {
    // ออเดอร์ยืนยันเงินครบไปแล้ว (แอดมินแนบหลักฐานย้อนหลัง) — บันทึกผลตรวจไว้ดูอย่างเดียว
    if (verify.status === "pass")
      updated = withLog(updated, "SlipOK", `${rc}ตรวจสลิปแล้ว: ยอดถูกต้อง (ออเดอร์ยืนยันรับเงินไว้ก่อนแล้ว — ไม่เปลี่ยนสถานะ)`, amountNote);
    else if (verify.status === "fail") updated = withLog(updated, "SlipOK", `${rc}สลิปตรวจไม่ผ่าน — กรุณาตรวจสลิปเอง`, verify.detail ?? "");
  } else if (credit > 0) {
    const paidBefore = paidSoFar(order);
    const paidNow = round2(paidBefore + credit);
    updated = { ...updated, paidTotal: paidNow };
    const total = orderTotal(updated);
    const remain = round2(Math.max(0, total - paidNow));
    const depositDue = updated.deposit && !updated.deposit.firstPaidAt ? Math.min(total, Math.max(0, updated.deposit.amount)) : 0;

    if (updated.deposit && !updated.deposit.firstPaidAt) {
      if (paidNow + 0.5 >= depositDue) {
        // ครบมัดจำงวดแรก → เริ่มงานได้
        confirmedDeposit = true;
        updated = {
          ...updated,
          deposit: { ...updated.deposit, firstPaidAt: now },
          status: waiting ? paidStatusFor(updated) : updated.status,
        };
        updated = withLog(updated, "SlipOK", `${rc}ยืนยันมัดจำ 50% อัตโนมัติ${paidBefore > 0 ? " (รวมยอดที่รับบางส่วนก่อนหน้า)" : ""}`, amountNote);
      } else {
        updated = { ...updated, status: waiting ? "รอชำระเงิน" : updated.status };
        updated = withLog(updated, "SlipOK", `${rc}รับมัดจำบางส่วน ${thb(credit)} บาท — ยังขาดอีก ${thb(round2(depositDue - paidNow))} บาท (รอลูกค้าโอนเพิ่ม)`, amountNote);
      }
    } else if (updated.deposit && !updated.deposit.settledAt) {
      if (remain <= 0.5) {
        // งวดหลังครบ — สถานะงานเดินต่อตามเดิม ไม่ถอยกลับไปรอตรวจสอบ
        confirmedFull = true;
        updated = { ...updated, paidTotal: Math.max(paidNow, total), deposit: { ...updated.deposit, settledAt: now } };
        updated = withLog(updated, "SlipOK", `${rc}รับยอดคงเหลือครบแล้ว (อัตโนมัติ)`, amountNote);
      } else {
        updated = withLog(updated, "SlipOK", `${rc}รับยอดคงเหลือบางส่วน ${thb(credit)} บาท — ยังขาดอีก ${thb(remain)} บาท`, amountNote);
      }
    } else if (remain <= 0.5) {
      // ใบธรรมดาครบ (หรือใบมัดจำที่ครบสองงวดแล้วมียอดโตทีหลังและเพิ่งเก็บครบ)
      confirmedFull = true;
      // ผ่านการตรวจอัตโนมัติเท่านั้นถึงยืนยันให้เลย — งานที่ลูกค้าจัดวางลายบนเทมเพลตเองมาครบ ข้ามไป "อนุมัติแบบ" เลย
      // ใบที่ถูกเด้งกลับมารอชำระเงินเพราะยอดโต (reopenedFrom) → กลับไปขั้นเดิม ไม่ถอยไป "ชำระแล้ว" ให้ตรวจแบบซ้ำ
      // งานที่เดินหน้าไปแล้ว (ค่าบริการเพิ่ม/สั่งเพิ่มระหว่างผลิต) คงสถานะเดิม แค่ปลดล็อกยอดค้าง
      updated = { ...updated, status: waiting ? updated.reopenedFrom ?? paidStatusFor(updated) : updated.status, reopenedFrom: undefined };
      updated = withLog(
        updated,
        "SlipOK",
        `${rc}${paidBefore > 0 ? `รับยอดครบแล้ว (อัตโนมัติ) — รวมที่รับก่อนหน้า ${thb(paidBefore)} บาท` : "ยืนยันการชำระเงินอัตโนมัติ"}`,
        amountNote
      );
    } else {
      // รับบางส่วน — ยอดค้างที่เหลือโชว์ให้ลูกค้าโอนต่อ · ใบธรรมดาที่ยังไม่เริ่มงานให้กลับไป "รอชำระเงิน" (ไม่ใช่รอตรวจสอบ) เพราะไม่มีอะไรให้แอดมินตรวจ
      updated = { ...updated, status: waiting ? "รอชำระเงิน" : updated.status };
      updated = withLog(updated, "SlipOK", `${rc}รับเงินบางส่วน ${thb(credit)} บาท — ยังค้างอีก ${thb(remain)} บาท (รอลูกค้าโอนเพิ่ม)`, amountNote);
    }
  } else {
    // ตรวจไม่ผ่านและนับยอดไม่ได้ (อ่านยอดไม่ได้ / ระบบล่ม / ซ้ำ) → รอแอดมินตรวจเอง
    if (phase === "first") updated = { ...updated, status: "รอตรวจสอบ" };
    if (verify.status === "fail")
      updated = withLog(updated, "SlipOK", `${rc}สลิป${phase === "balance" ? "ยอดคงเหลือ" : phase === "extra" ? "ใบเพิ่ม" : ""}ตรวจไม่ผ่าน — รอแอดมินตรวจเอง`, verify.detail ?? "");
    else if (phase !== "first") updated = withLog(updated, by, `แนบสลิป${phase === "balance" ? "ยอดคงเหลือ" : "เพิ่ม"} — รอแอดมินตรวจ`, verify.detail ?? "ตรวจอัตโนมัติไม่ได้");
  }

  const { error: saveErr } = await sb.from("orders").update({ data: updated }).eq("id", order.id);
  if (saveErr) throw new Error(saveErr.message);

  // ── 3) ผลข้างเคียงหลังบันทึก ──
  const link = orderLink(origin, updated);
  // เงินเข้าบัญชีจริง = ยอดในสลิป (น้อยกว่ายอดตั้งเมื่อโดนหัก ณ ที่จ่าย/ค่าธรรมเนียม) — ให้ msVerify กระทบยอดกับธนาคารตรง
  const received = verify.amount ?? credit;
  // ขอใบ 50 ทวิจากลูกค้าไปในข้อความยืนยันเลย — เคสหัก ณ ที่จ่าย
  const whtAsk = verify.deduction?.kind === "wht" ? `\nรับยอดหลัง${verify.deduction.label} — รบกวนส่งหนังสือรับรองหักภาษี ณ ที่จ่าย (50 ทวิ) ให้ทางร้านด้วยนะครับ` : "";
  // เรคอร์ด msVerify แยกใบ: ช่องแรก = doc id หลัก · งวดหลัง = -final · ใบเพิ่ม = -<paymentId> (กันชนกัน)
  const tp = (note: string) =>
    void reportPaidToTP(updated, "SlipOK อัตโนมัติ", {
      amount: received,
      noteSuffix: `${note}${dedNote}`,
      partial,
      ...(phase === "extra" ? { docSuffix: `-${paymentId}`, slipPath: path, extra: true } : phase === "balance" ? { docSuffix: "-final" } : {}),
    });
  // ครบงวดด้วยสลิปใบเพิ่ม → เรคอร์ดหลักที่เคยติดธง "รับบางส่วน" ต้องปลดธง (บอร์ด WIP ถึงจะขึ้นการ์ด)
  const completeViaExtra = phase === "extra" && (confirmedDeposit || confirmedFull) && paidSoFar(order) > 0;

  if (confirmedDeposit) {
    const remain = orderTotal(updated) - (updated.paidTotal ?? 0);
    void notifyCustomerLogged(sb, updated, `✅ รับมัดจำออเดอร์ ${updated.id} แล้ว เริ่มงานให้เลยครับ\nยอดคงเหลือ ${thb(remain)} บาท ชำระก่อนจัดส่ง${whtAsk}\n${link}`, "ยืนยันรับมัดจำ");
    tp("มัดจำ 50% งวดแรก");
    void cutStockForOrder(updated); // มัดจำ = เริ่มงานแล้วก็ตัดสต๊อกเลย
    void bumpSoldForOrder(updated.id);
  } else if (confirmedFull) {
    if (order.deposit) {
      void notifyCustomerLogged(sb, updated, `✅ รับยอดคงเหลือออเดอร์ ${updated.id} ครบแล้ว ขอบคุณครับ${whtAsk}\n${link}`, "ยืนยันรับยอดคงเหลือครบ");
      tp(order.deposit.settledAt ? "เก็บยอดที่เพิ่มทีหลังครบแล้ว" : "ยอดคงเหลือ 50% หลัง (ครบแล้ว)");
    } else if (waiting) {
      void notifyCustomerLogged(sb, updated, `✅ ยืนยันการชำระเงินออเดอร์ ${updated.id} แล้ว กำลังเริ่มงานให้ครับ${whtAsk}\n${link}`, "ยืนยันการชำระเงิน");
      tp(paidSoFar(order) > 0 ? "รับยอดส่วนที่เหลือครบแล้ว" : "");
      void cutStockForOrder(updated); // ตัดสต๊อกวัสดุที่ผูกไว้
      void bumpSoldForOrder(updated.id); // ยอด "ขายแล้ว" หน้าเว็บ (กันซ้ำในตัวเอง)
    } else {
      // งานเดินอยู่แล้ว เพิ่งเก็บส่วนต่าง (สั่งเพิ่ม/ค่าบริการเพิ่ม) ครบ — ปลดล็อกยิงเลขพัสดุ ไม่ต้องเริ่มงานซ้ำ
      void notifyCustomerLogged(sb, updated, `✅ รับยอดส่วนต่างออเดอร์ ${updated.id} ครบแล้ว ขอบคุณครับ${whtAsk}\n${link}`, "ยืนยันรับยอดส่วนต่างครบ");
      tp("ยอดส่วนต่างที่เก็บเพิ่ม (ครบแล้ว)");
    }
    // 🦆 แต้มสะสม — บวกเมื่อชำระ "ครบ" เท่านั้น (idempotent)
    void awardPointsForOrder(updated);
  } else if (partial) {
    const remain = round2(Math.max(0, (updated.deposit && !updated.deposit.firstPaidAt ? Math.min(orderTotal(updated), updated.deposit.amount) : orderTotal(updated)) - (updated.paidTotal ?? 0)));
    void notifyCustomerLogged(
      sb,
      updated,
      `💳 รับยอด ${thb(credit)} บาท ของออเดอร์ ${updated.id} แล้วครับ\nยังขาดอีก ${thb(remain)} บาท — โอนส่วนที่เหลือแล้วแนบสลิปเพิ่มที่ลิงก์เดิมได้เลย\n${link}`,
      `รับเงินบางส่วน ${thb(credit)} บาท (ค้าง ${thb(remain)})`
    );
    tp(`รับบางส่วน ${thb(credit)} บาท · ค้าง ${thb(remain)} บาท`);
  }

  // partial = ยังค้างอยู่หลังนับใบนี้ (ถ้ารับบางส่วนแล้วครบงวดพอดี ถือว่ายืนยัน ไม่ใช่บางส่วน)
  if (completeViaExtra) void syncPaidCompleteToTP(updated, "SlipOK อัตโนมัติ");

  return { updated, verify, confirmed: confirmedDeposit || confirmedFull, partial: partial && !confirmedDeposit && !confirmedFull, paymentId };
}

/**
 * 💰 แอดมินรับยอดของสลิปเองเมื่อ SlipOK ตรวจไม่ได้/ตรวจตก (เทียบยอดกับธนาคารเองแล้ว)
 * ใช้กับ "ใบเพิ่ม" ใน payments[] — ช่องหลักยังใช้ทางเดิม (เปลี่ยนสถานะเป็นชำระแล้ว / ยืนยันรับมัดจำ / ยืนยันรับครบ)
 * นับยอดเข้า paidTotal แล้วถ้าครบ → ยืนยันงวด + แจ้งลูกค้า + msVerify (กติกาเดียวกับ SlipOK ผ่าน)
 */
export async function acceptPaymentManually(a: {
  sb: SupabaseClient;
  order: Order;
  paymentId: string;
  amount: number;
  who: string;
  origin: string;
}): Promise<Order> {
  const { sb, order, paymentId, who, origin } = a;
  const amount = round2(Math.max(0, a.amount));
  const list = [...(order.payments ?? [])];
  const idx = list.findIndex((p) => p.id === paymentId);
  if (idx < 0) throw new Error("ไม่พบสลิปใบนี้ในออเดอร์");
  if ((list[idx].credited ?? 0) > 0) throw new Error("สลิปใบนี้นับยอดไปแล้ว");
  if (!(amount > 0)) throw new Error("ยอดต้องมากกว่า 0");

  const now = new Date().toISOString();
  const waiting = order.status === "รอชำระเงิน" || order.status === "รอตรวจสอบ";
  list[idx] = { ...list[idx], credited: amount, accepted: { by: who, at: now } };
  const paidNow = round2(paidSoFar(order) + amount);
  let updated: Order = { ...order, payments: list, paidTotal: paidNow };
  const total = orderTotal(updated);
  const remain = round2(Math.max(0, total - paidNow));
  const amountNote = `ยอด ${thb(amount)} บาท · แอดมินเทียบยอดเอง`;

  let confirmedDeposit = false;
  let confirmedFull = false;
  if (updated.deposit && !updated.deposit.firstPaidAt) {
    const depositDue = Math.min(total, Math.max(0, updated.deposit.amount));
    if (paidNow + 0.5 >= depositDue) {
      confirmedDeposit = true;
      updated = { ...updated, deposit: { ...updated.deposit, firstPaidAt: now }, status: waiting ? paidStatusFor(updated) : updated.status };
      updated = withLog(updated, who, "รับยอดสลิปใบเพิ่มเอง — ครบมัดจำ 50%", amountNote);
    } else updated = withLog(updated, who, `รับยอดสลิปใบเพิ่มเอง — มัดจำยังขาดอีก ${thb(round2(depositDue - paidNow))} บาท`, amountNote);
  } else if (updated.deposit && !updated.deposit.settledAt) {
    if (remain <= 0.5) {
      confirmedFull = true;
      updated = { ...updated, paidTotal: Math.max(paidNow, total), deposit: { ...updated.deposit, settledAt: now } };
      updated = withLog(updated, who, "รับยอดสลิปใบเพิ่มเอง — ยอดคงเหลือครบแล้ว", amountNote);
    } else updated = withLog(updated, who, `รับยอดสลิปใบเพิ่มเอง — ยังขาดอีก ${thb(remain)} บาท`, amountNote);
  } else if (remain <= 0.5) {
    confirmedFull = true;
    updated = { ...updated, status: waiting ? updated.reopenedFrom ?? paidStatusFor(updated) : updated.status, reopenedFrom: undefined };
    updated = withLog(updated, who, "รับยอดสลิปใบเพิ่มเอง — รับเงินครบแล้ว", amountNote);
  } else updated = withLog(updated, who, `รับยอดสลิปใบเพิ่มเอง — ยังค้างอีก ${thb(remain)} บาท`, amountNote);

  const { error } = await sb.from("orders").update({ data: updated }).eq("id", order.id);
  if (error) throw new Error(error.message);

  const link = orderLink(origin, updated);
  const adminName = `แอดมิน ${who}`;
  const tp = (note: string) =>
    void reportPaidToTP(updated, adminName, { amount, noteSuffix: note, docSuffix: `-${paymentId}`, slipPath: list[idx].path, extra: true, partial: !confirmedDeposit && !confirmedFull });
  if ((confirmedDeposit || confirmedFull) && paidSoFar(order) > 0) void syncPaidCompleteToTP(updated, adminName);
  if (confirmedDeposit) {
    const rem = orderTotal(updated) - (updated.paidTotal ?? 0);
    void notifyCustomerLogged(sb, updated, `✅ รับมัดจำออเดอร์ ${updated.id} แล้ว เริ่มงานให้เลยครับ\nยอดคงเหลือ ${thb(rem)} บาท ชำระก่อนจัดส่ง\n${link}`, "ยืนยันรับมัดจำ");
    tp("มัดจำ 50% งวดแรก (สลิปใบเพิ่ม)");
    void cutStockForOrder(updated);
    void bumpSoldForOrder(updated.id);
  } else if (confirmedFull) {
    void notifyCustomerLogged(sb, updated, `✅ รับยอดออเดอร์ ${updated.id} ครบแล้ว ขอบคุณครับ\n${link}`, "ยืนยันรับเงินครบ");
    tp(order.deposit ? "ยอดคงเหลือครบ (สลิปใบเพิ่ม)" : "รับครบ (สลิปใบเพิ่ม)");
    if (waiting && !order.deposit) {
      void cutStockForOrder(updated);
      void bumpSoldForOrder(updated.id);
    }
    void awardPointsForOrder(updated);
  } else {
    void notifyCustomerLogged(sb, updated, `💳 รับยอด ${thb(amount)} บาท ของออเดอร์ ${updated.id} แล้วครับ\nยังขาดอีก ${thb(remain)} บาท — โอนส่วนที่เหลือแล้วแนบสลิปเพิ่มที่ลิงก์เดิมได้เลย\n${link}`, `รับเงินบางส่วน ${thb(amount)} บาท`);
    tp(`รับบางส่วน ${thb(amount)} บาท · ค้าง ${thb(remain)} บาท`);
  }
  return updated;
}
