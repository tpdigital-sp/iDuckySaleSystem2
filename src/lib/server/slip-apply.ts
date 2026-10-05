import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { balanceWhtShare, clearStageMemory, orderBalance, earlyPayState, flowAccountGap, lockEarlyPay, orderBilledTotal, orderOtherDiscounts, orderTaxToRate, orderTotal, paidSoFar, parkForSlipReview, reconciledOrderAmounts, reinstateEarlyPay, slipMatchesFlowAccountBill, stageAfterPayment, transferredInTime, withLog, type Order, type OrderPayment } from "@/lib/admin-data";
import { thaiDateTime } from "@/lib/bangkok-time";
import { expectedForPhase, type SlipPhase } from "@/lib/payments";
import { earlyPayAmount, earlyPayBase, earlyPayOf, type EarlyPayDiscount } from "@/lib/early-pay";
import { getProductServer } from "@/lib/products-server";
import type { Product } from "@/lib/products";
import { matchSlipAmount, matchSlipReceiver, verifySlipWithSlipOK, type ShopReceiverAccounts, type SlipVerifyResult } from "@/lib/server/slipok";
import { docRefMismatch, findSlipLookalikes, readSlipImage } from "@/lib/server/slip-ocr";
import { assertSlipNotDuplicate, findSlipOwners } from "@/lib/server/slip-dedupe";
import { balanceNetTransfer, notifyCustomerLogged, orderLink, orderNotice } from "@/lib/server/notify";
import { reportPaidToTP, syncPaidCompleteToTP } from "@/lib/server/tp-report";
import { cutStockForOrder } from "@/lib/server/stock";
import { bumpSoldForOrder } from "@/lib/server/sold";
import { awardPointsForOrder } from "@/lib/server/contact-points";
import { updateOrder } from "@/lib/server/order-write";
import { earlyPayBillReason } from "@/lib/server/order-early-pay";
import { inBackground } from "@/lib/server/background";
import { pushShopAlert } from "@/lib/server/line-alert";

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
// มีสตางค์ = โชว์สองตำแหน่ง (ยอดมัดจำ 50% ลงท้าย .50 บ่อย — "17,173.5 บาท" อ่านเหมือนพิมพ์ไม่จบ)
const thb = (n: number) =>
  n.toLocaleString("th-TH", n % 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined);

/**
 * ผลตรวจที่จะเก็บลงออเดอร์ — เก็บ skip ด้วย
 *
 * ⚠️ เดิมทิ้ง skip ("ไม่มีอะไรให้จำ") แต่มันคือเคส "SlipOK ไม่ทำงาน" ที่แอดมินต้องรู้มากที่สุด:
 * 21 ก.ย. 69 SlipOK ตอบช้าจนถูกตัดสาย 4 ใบ → ไม่มี slipVerify + ใบแรกไม่ลง log ด้วย (ดูท้ายไฟล์)
 * หน้าออเดอร์เลยโชว์สลิปเปล่า ๆ ไม่มีป้ายผลตรวจ ไม่มีปุ่มตรวจซ้ำ เหมือนไม่เคยมีการตรวจเกิดขึ้น
 */
function verifyRecord(verify: SlipVerifyResult, now: string): Order["slipVerify"] {
  return {
    status: verify.status,
    detail: verify.detail,
    amount: verify.amount,
    transRef: verify.transRef,
    ...(verify.transAt ? { transAt: verify.transAt } : {}),
    at: now,
    deduction: verify.deduction,
    ...(verify.noRetry ? { noRetry: true } : {}),
    // 🏦 ผู้รับบนสลิป — เก็บทุกใบไว้สแกนย้อนหลัง · wrongReceiver = โอนเข้าบัญชีอื่น (หน้าออเดอร์ขึ้นกล่องแดง)
    ...(verify.receiver ? { receiver: verify.receiver } : {}),
    ...(verify.receiverAccount ? { receiverAccount: verify.receiverAccount } : {}),
    ...(verify.wrongReceiver ? { wrongReceiver: true } : {}),
    // 🤖 AI อ่านรูปสลิปไม่มี QR + คำเตือน "อาจซ้ำ" (ดู slip-ocr.ts)
    ...(verify.ocr ? { ocr: verify.ocr } : {}),
    ...(verify.refFrom ? { refFrom: verify.refFrom } : {}),
    ...(verify.lookalike?.length ? { lookalike: verify.lookalike } : {}),
    ...(verify.docMismatch ? { docMismatch: verify.docMismatch } : {}),
    ...(verify.ocrReceiverMismatch ? { ocrReceiverMismatch: true } : {}),
  };
}

/** วัน/เวลาโอนแบบไทยจาก ISO ของ SlipOK — ไว้เทียบกับสลิปที่ AI อ่าน */
function bkkWhen(iso: string | undefined): { date?: string; time?: string } {
  if (!iso) return {};
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return {};
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour").replace("24", "00")}:${g("minute")}` };
}

/**
 * ⏳ เพดานเวลารอเรคอร์ด msVerify ก่อนตอบคำขอ — Firestore อืดต้องไม่ทำให้ "แนบสลิป" ของลูกค้าพัง
 * (Netlify function มีเพดานเวลาของมันเอง · เกินแล้วคำขอตอบ error ทั้งที่ยอดเงินบันทึกไปแล้ว)
 * เกินเพดาน = ปล่อยให้เขียนต่อเบื้องหลัง แล้วให้ cron/tp-bridge-audit เก็บตกใบที่ไม่ลงจริงภายใน 3 ชม.
 */
const TP_WAIT_MS = 6000;

async function settleTP(jobs: Promise<unknown>[]): Promise<void> {
  if (!jobs.length) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([Promise.allSettled(jobs), new Promise((done) => { timer = setTimeout(done, TP_WAIT_MS); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
  let order: Order =
    earlyPayState(input.order, Date.parse(lockAt) || Date.now()) === "active"
      ? withLog(lockEarlyPay(input.order, lockAt, by), by, "ล็อกส่วนลดโอนไว", `แจ้งโอนทันเวลา — ได้ส่วนลด ${thb(input.order.earlyPay!.amount)} บาท`)
      : input.order;

  // ── ยอดที่สลิปใบนี้ควรจะเป็น = ยอดค้างของช่องนั้น ณ ตอนนี้ (ไม่ใช่ยอดเต็ม) ──
  let expected = expectedForPhase(order, phase);
  const waiting = order.status === "รอชำระเงิน" || order.status === "รอตรวจสอบ";
  /**
   * ยังมีเงินให้รับอยู่ไหม — ลูกค้าแนบเองผ่านด่าน resolveSlipPhase มาก่อนแล้วเสมอ
   * แอดมินแนบย้อนหลังบนออเดอร์ที่ครบแล้วจะไม่ผ่าน → เก็บผลตรวจอย่างเดียว
   */
  const eligible = expected > 0 && (phase === "first" ? waiting : true);

  /**
   * 🏦 ตั้งค่าร้าน (แถว __shop_payment__) อ่านครั้งเดียว — ใช้ทั้งเทียบ "ผู้รับบนสลิปต้องเป็นบัญชีร้าน" และส่วนลดโอนไว
   * อ่านไม่ได้ = ส่ง unavailable ให้ตัวตรวจตกไปตรวจมือ (fail-safe) ไม่ใช่ปล่อยผ่านเหมือนร้านไม่ได้ตั้งบัญชี
   */
  let shopSettings: (ShopReceiverAccounts & { earlyPay?: EarlyPayDiscount }) | undefined;
  try {
    const { data: settRow, error: settErr } = await sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle();
    if (settErr) throw settErr;
    shopSettings = (settRow?.data as typeof shopSettings) ?? {};
  } catch {
    shopSettings = { unavailable: true };
  }

  /**
   * ⚡ ส่วนลดโอนไวที่ออเดอร์นี้ "ยังไม่ได้หัก" — ยอมให้สลิปขาดได้เท่านี้โดยไม่ตกไปตรวจมือ
   * ออเดอร์ที่สั่งผ่านเว็บหลังเปิดโปรจะมี order.earlyPay อยู่แล้ว (ยอดที่ต้องโอนลดไปแล้ว) → 0 กันหักซ้ำ
   * เหลือไว้ให้ออเดอร์เก่า + ลูกค้าที่รู้โปรจากไลน์แล้วโอนน้อยกว่ายอดที่เห็นในเว็บ
   * ยอมครั้งเดียวต่อออเดอร์ — เคยรับเงินไปแล้ว (paidSoFar > 0) = ใบต่อ ๆ ไปห้ามขาดอีก ไม่งั้นโอน 3 ใบขาดได้ 3 รอบ
   * เฉพาะออเดอร์ราคาปลีกล้วนเหมือนตอน checkout — ใบที่มีบรรทัดเรทขายส่งไม่มีส่วนลดนี้ สลิปขาด ฿10 ต้องตกไปตรวจมือ
   */
  let earlyPayAllowed = 0;
  // 🤝 ออเดอร์ตัวแทนจำหน่ายไม่มีส่วนลดโอนไว — ห้ามยอมรับสลิปที่โอนขาด ฿5/฿10
  // 🧾 ใบที่มีบิลบริษัท (FlowAccount/ใบกำกับภาษี/ใบเสนอราคา) ก็ไม่มีส่วนลดนี้เหมือนกัน — โอนขาดต้องตกไปตรวจมือ
  //    ไม่งั้นใบที่กติกาใหม่ไม่ให้ลด กลับถูก "ลดที่ตัวตรวจสลิป" แทน แล้วเงินเข้าไม่ตรงบิลที่ออกให้ลูกค้า
  if (!order.earlyPay && !order.dealer && !earlyPayBillReason(order) && paidSoFar(order) <= 0 && orderOtherDiscounts(order) <= 0) {
    try {
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
      earlyPayAllowed = earlyPayAmount(goods, earlyPayOf(shopSettings?.unavailable ? undefined : shopSettings));
    } catch {
      // อ่านตั้งค่าไม่ได้ = ไม่ยอมรับส่วนต่าง ตกไปตรวจมือตามเดิม (fail-safe)
    }
  }
  const slipOkStarted = Date.now();
  let verify = await verifySlipWithSlipOK(bytes, contentType, expected, orderTotal(order), order.wht, earlyPayAllowed, shopSettings);

  /**
   * 🕰️ "สลิปซ้ำ" ที่ซ้ำกับตัวเอง — กู้ผลของรอบที่ถูกตัดสายไป
   *
   * เคสต้นเรื่อง 21 ก.ย. 69: SlipOK ตอบช้า 16-22 วินาที เกินเพดานเวลา ฝั่งเราตัดสายทิ้ง (ผล skip)
   * แต่ SlipOK ตรวจเสร็จจริงทีหลังและจำสลิปไว้ (log=true) — พอกด "ตรวจสลิปอีกครั้ง" จึงได้ 1012 "สลิปซ้ำ" ตันอยู่แค่นั้น
   * ทั้งที่คำตอบ 1012 แนบข้อมูลสลิปมาครบ (ยอด/เลขอ้างอิง/เวลาโอน/ผู้รับ) พอตัดสินได้เลย
   *
   * ปลอดภัย 2 ชั้น:
   *   1. เฉพาะตอนแอดมินกด "ตรวจสลิปอีกครั้ง" (recheck) เท่านั้น — ทางที่ลูกค้าแนบเองไม่แตะกติกาสลิปซ้ำเดิมเลย
   *   2. ต้องไม่มีออเดอร์/ใบอื่นถือครองเลขอ้างอิงนี้ (= ยังไม่เคยมีใครนับเงินก้อนนี้)
   *      ลูกค้าเอาสลิปเก่าที่เคยใช้กับออเดอร์อื่นมาเวียน = เจอเจ้าของ → ตกเป็นสลิปซ้ำเหมือนเดิม
   */
  if (input.recheck && verify.duplicate && verify.selfJudged && verify.transRef) {
    const owners = await findSlipOwners(sb, { transRef: verify.transRef }, { orderId: order.id, phase, paymentId: input.paymentId });
    if (!owners.length) {
      const j = verify.selfJudged;
      verify = { ...j, detail: `${j.detail ? `${j.detail} · ` : ""}(ผลจากรอบก่อนของใบนี้เองที่ SlipOK ตอบช้าจนถูกตัดสาย — ดึงกลับมาให้แล้ว)` };
    }
  }

  /**
   * 🤖 สลิปที่ SlipOK อ่าน QR ไม่ได้ (K BIZ / รายงานธนาคาร / แคปรายการเดินบัญชี) → ให้ AI อ่านรูปแทน (slip-ocr.ts)
   * เลขอ้างอิงธนาคารที่อ่านได้ (≥ 14 ตัว) ใช้เป็น transRef → ด่านชั้น 2 ข้างล่างตีตกสลิปซ้ำได้เหมือนเลขจาก QR
   * ยอดที่ AI อ่านเก็บแยกที่ verify.ocr ห้ามนับเงิน — สลิปยังตก "รอแอดมินตรวจเอง" เหมือนเดิม
   */
  /*
   * ⏱ งบเวลา: SlipOK ช้าได้ถึง 30 วิ + AI อีกหลายวิ = เสี่ยงชนเพดานเวลาของ serverless function
   * (โดนฆ่ากลางทาง = ไฟล์ขึ้นบัคเก็ตแต่ออเดอร์ไม่ถูกบันทึก — แย่กว่าไม่อ่าน ดู [[iducky-slipok]])
   * SlipOK ใช้ไปเกิน 8 วิ → ข้ามการอ่านรอบนี้ (สลิปยังตกรอตรวจตามเดิม · กด "ตรวจสลิปอีกครั้ง" ได้อ่านอีกรอบ)
   */
  const ocrBudgetMs = 8_000 - (Date.now() - slipOkStarted);
  if (!verify.transRef && verify.status !== "pass" && ocrBudgetMs > 0) {
    const ocr = await readSlipImage(bytes, contentType, undefined, Math.min(10_000, 18_000 - (Date.now() - slipOkStarted)));
    if (ocr) verify = { ...verify, ocr, ...(ocr.ref ? { transRef: ocr.ref, refFrom: "ocr" as const } : {}) };
  }

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

  /**
   * ⚠️ ชั้น 3 (เตือน ไม่ตีตก): สลิปในออเดอร์อื่นที่ยอด + วันโอน (+ เวลา) ตรงกัน — จับแคปหน้าจอใหม่ของสลิปไม่มี QR
   * และสลิปมี QR ที่ลูกค้าเคยส่งเป็นภาพแคปไปอีกใบ · ลงที่ verify.lookalike ให้หน้าออเดอร์ขึ้นกล่องเตือน + แจ้งกลุ่มแอดมิน
   */
  // บัญชีร้านเอง (AI สลับช่องผู้โอน/ผู้รับได้) ห้ามใช้เป็น "บัญชีผู้โอนเดียวกัน" — ไม่งั้นทุกใบดูเหมือนคนเดียวกันหมด
  const isShopAccount = (a?: string) => !!a && /\d{4}/.test(a) && matchSlipReceiver({ account: { value: a } }, shopSettings) === "match";
  const probePayer = isShopAccount(verify.ocr?.payerAccount) ? undefined : verify.ocr?.payerAccount;
  const probeAmount = verify.amount ?? verify.ocr?.amount;
  const probeWhen = verify.transAt ? undefined : { date: verify.ocr?.date, time: verify.ocr?.time };
  if (probeAmount && !input.allowDuplicate) {
    const when = probeWhen ?? bkkWhen(verify.transAt);
    if (when.date) {
      const lookalike = await findSlipLookalikes(
        sb,
        { amount: probeAmount, date: when.date, time: when.time, payerAccount: probePayer, docRef: verify.ocr?.docRef },
        { orderId: order.id, phase, paymentId: input.paymentId }
      ).catch(() => []);
      if (lookalike.length) verify = { ...verify, lookalike };
    }
  }
  if (verify.ocr) {
    const docMismatch = docRefMismatch(order, verify.ocr.docRef);
    /*
     * เตือนบัญชีผู้รับเฉพาะเมื่อ AI อ่าน "เลขบัญชี" ได้และไม่ตรงบัญชีร้าน — ไม่เทียบชื่อ (AI อ่านชื่อไทยเพี้ยนทีละตัว "ทีพีดีจิดอล")
     * และ AI สลับช่องผู้โอน/ผู้รับได้ (ทดสอบ 3 ต.ค. 69 แถว KBANK ใส่บัญชีร้านเป็นผู้โอน) → บัญชีร้านโผล่ช่องไหนก็ถือว่าตรง
     */
    const rcv =
      verify.ocr.receiverAccount && /\d{4}/.test(verify.ocr.receiverAccount) && !isShopAccount(verify.ocr.payerAccount)
        ? matchSlipReceiver({ account: { value: verify.ocr.receiverAccount } }, shopSettings)
        : "noReceiver";
    verify = { ...verify, ...(docMismatch ? { docMismatch } : {}), ...(rcv === "mismatch" ? { ocrReceiverMismatch: true } : {}) };
  }

  /**
   * 🧾 สลิปเป็น "หลักฐาน" ว่าตัวเลขภาษีในใบเป็นของยอดเก่า → คิดใหม่ตามเรตแล้วถือว่าจ่ายครบ
   *
   * เคสต้นเรื่อง OD-260915-1705 (15 ก.ย. 69): ใบเสนอราคาแก้ 12 → 5 ชิ้น · รายการตามแล้วแต่ VAT ค้าง 7% ของ 12 ชิ้น
   * ยอดในระบบเลยเป็น 1,775.36 ทั้งที่บิลจริง 1,626.40 — ลูกค้าโอนสุทธิตามบิล 1,580.80 (หัก ณ ที่จ่าย 3%) ครบแล้ว
   * แต่ระบบหาว่า "โอนขาด 194.56" แล้วส่งไลน์ทวง · ประตูเขียนออเดอร์ (reconcileOrderTax) อุดทางเข้าไปแล้ว
   * ทางนี้เป็นตาข่ายชั้นสุดท้ายตรงจุดที่ "รู้ว่าลูกค้าโอนเท่าไหร่จริง ๆ": ใบที่ภาษีไม่ใช่เรต × ฐานล่าสุด
   * แล้วสลิปแท้ตรงกับยอดที่ควรจะเป็นพอดี = ยอดในระบบผิด ไม่ใช่ลูกค้าโอนขาด → แก้ให้ตรงแล้วผ่านไปเลย
   * (เดิมได้แค่ "ไม่ทวง" แล้วค้าง "รอตรวจสอบ" รอแอดมินมาแก้เอง — ยอดตรงแล้วต้องผ่านเองได้)
   *
   * ปลอดภัยเพราะกว่าจะมาถึงตรงนี้ต้อง: SlipOK ยืนยันว่าสลิปแท้ + อ่านยอดได้ + ยอดนั้นอธิบายด้วยตัวเลขที่เก็บไว้ไม่ได้
   * (ยอดที่แอดมินพิมพ์เองตามใบ 50 ทวิ ถ้าลูกค้าโอนตามนั้นจริงจะผ่านตั้งแต่ด่าน adminWht ไม่ตกมาถึงนี่)
   */
  if (eligible && verify.status === "fail" && verify.genuine === true && !verify.duplicate && (verify.amount ?? 0) > 0) {
    const fix = orderTaxToRate(order);
    const want = fix ? expectedForPhase(fix.order, phase) : 0;
    const m = fix && want > 0 ? matchSlipAmount(want, verify.amount!, orderTotal(fix.order), fix.order.wht, earlyPayAllowed) : null;
    if (fix && m?.ok) {
      order = withLog(fix.order, "SlipOK", "คิดภาษีใหม่ตามยอดในใบงาน (สลิปลูกค้าตรงยอดที่ถูกต้อง)", `${fix.note} · ลูกค้าโอน ${thb(verify.amount!)} บาท`);
      expected = want;
      verify = {
        ...verify,
        status: "pass",
        deduction: m.deduction,
        detail:
          `ยอดในสลิป ${thb(verify.amount!)} บาท ตรงกับยอดที่ถูกต้องของใบนี้ (คิด VAT/หัก ณ ที่จ่ายตามเรตกับรายการล่าสุดแล้วได้ ` +
          `${thb(orderTotal(order))} บาท${order.wht?.amount ? ` − หัก ณ ที่จ่าย ${thb(order.wht.amount)} = ${thb(round2(orderTotal(order) - order.wht.amount))} บาท` : ""}) — ` +
          `ตัวเลขภาษีในใบเป็นของยอดเก่า ระบบคิดใหม่ให้ตรงแล้ว (${fix.note})`,
      };
    }
  }

  /**
   * ⚡↩️ ส่วนลดโอนไว "หมดเวลา" ไปแล้วตอนแนบสลิป — ดูหลักฐานบนสลิปก่อนตัดสิน (เจ้าของร้านสั่ง 16 ก.ย. 69)
   *   1) SlipOK อ่านเวลาโอนบนสลิปได้ และโอนทันกำหนด (+ผ่อน graceMinutes) = ลูกค้าทำถูก แค่แนบสลิปช้า → คืนส่วนลด
   *   2) โอนช้าจริง แต่โอน "ยอดที่ลดแล้ว" มาพอดี (ขาดเท่าส่วนลด) และเงินเข้าก่อนเริ่มผลิต → ยกให้ ไม่ทวง ฿5/฿10
   *      (ทวง ฿5 เสียเวลาแอดมิน + ลูกค้าเสียความรู้สึก มากกว่าเงินที่ได้ · กติกาดั้งเดิม "โอนไว = โอนก่อนเริ่มผลิต")
   * คืนแล้วคิด expected ใหม่ → สลิปที่เคย "ขาด" กลายเป็นตรงยอด ผ่านเป็นชำระแล้วเอง
   * เฉพาะ: งวดแรกที่ยังรอเงิน · ยังไม่มีเงินเข้าก้อนก่อน · สลิปแท้ อ่านยอดได้ ไม่ซ้ำ · **สลิปยังไม่ตรงยอดเต็มเป๊ะ**
   * (ลูกค้าที่เห็นยอดเต็มแล้วโอนเต็มมาเอง = ตั้งใจจ่ายเต็ม ไม่ต้องคืนให้แล้วไปโชว์ "โอนเกิน ฿5")
   * ⚠️ ฿5/฿10 ชนกับ "หัก ณ ที่จ่าย 1% ของบิล 500/1,000" และ "ค่าธรรมเนียมโอน 5/10" พอดี — matchSlipAmount จึงปล่อยสลิป 495/500
   *    ผ่านเป็น "หัก ณ ที่จ่าย 1%" (รอใบ 50 ทวิที่ไม่มีวันมา) แล้วนับเงินเข้า 500 ทั้งที่เข้าจริง 495 (พฤติกรรมเดิมที่จดไว้ว่า "ยังหลุดได้ ฿5")
   *    → ใบที่มีส่วนลดโอนไวหมดเวลาอยู่ ให้ตีความว่า "ลูกค้าโอนยอดที่ลดแล้ว" ก่อน — บิล 495 เงินเข้า 495 ตรงบัญชีจริง
   *    (ลำดับเดียวกับที่ matchSlipAmount ใช้ตอนส่วนลดยังไม่หัก: โอนไวมาก่อน wht/bankFee · ลูกค้านิติบุคคลจริงมี order.wht ตั้งไว้ = ไม่แตะ)
   * ที่ทำตรงนี้ไม่ใช่ตอนล็อกก่อนตรวจ เพราะเวลาโอนบนสลิปรู้ได้หลัง SlipOK ตอบเท่านั้น
   */
  if (
    eligible &&
    phase === "first" &&
    paidSoFar(order) <= 0 &&
    (verify.status === "fail" || (verify.status === "pass" && !!verify.deduction && verify.deduction.kind !== "earlyPay" && !order.wht)) &&
    verify.genuine === true &&
    !verify.duplicate &&
    (verify.amount ?? 0) > 0 &&
    earlyPayState(order) === "expired"
  ) {
    // อ่านตั้งค่าไม่ได้ = ไม่ผ่อนเวลา (ตัดสินจากเวลาโอนบนสลิปตรง ๆ)
    const grace = shopSettings?.unavailable ? 0 : earlyPayOf(shopSettings).graceMinutes;
    const disc = order.earlyPay!.amount;
    const inTime = transferredInTime(order, verify.transAt, grace);
    const paidDiscounted = Math.abs(round2(expected - disc) - round2(verify.amount!)) < 0.01;
    if (inTime || paidDiscounted) {
      const reinstateAt = inTime ? verify.transAt! : new Date().toISOString();
      const reason = inTime
        ? `โอนจริงเวลา ${thaiDateTime(new Date(verify.transAt!))} ทันกำหนด${grace ? ` (ผ่อนให้ ${grace} นาที)` : ""} — แนบสลิปช้าไม่ถือว่าผิด`
        : `โอนช้ากว่ากำหนด แต่โอนยอดที่ลดแล้ว ${thb(verify.amount!)} บาทมาพอดี และเงินเข้าก่อนเริ่มผลิต — ยกส่วนลดให้ ไม่ทวงส่วนต่าง`;
      order = withLog(reinstateEarlyPay(order, reinstateAt, "SlipOK"), "SlipOK", "คืนส่วนลดโอนไว", `${reason} · ได้ส่วนลด ${thb(disc)} บาท`);
      expected = expectedForPhase(order, phase);
      const m = matchSlipAmount(expected, verify.amount!, orderTotal(order), order.wht, 0);
      if (m.ok) verify = { ...verify, status: "pass", deduction: m.deduction, detail: `คืนส่วนลดโอนไวแล้ว — ${reason}` };
      else if (verify.status === "pass") verify = { ...verify, status: "fail", deduction: undefined, detail: `คืนส่วนลดโอนไวแล้ว แต่ยอดในสลิป ${thb(verify.amount!)} บาท ยังไม่ตรงยอดที่ต้องชำระ ${thb(expected)} บาท` };
    }
  }

  const now = new Date().toISOString();
  const pass = eligible && verify.status === "pass";
  /**
   * 💸 รับบางส่วน: SlipOK ยืนยันสลิปแท้ อ่านยอดได้ แต่ยอดขาดและไม่เข้าข่ายส่วนต่างที่รู้จัก
   * เงินเข้าบัญชีร้านจริงแล้ว → นับยอดนั้นไว้ แล้วให้ลูกค้าโอนส่วนที่เหลือ (ไม่ต้องรอแอดมินเทียบยอด)
   * ไม่รวมกรณีอ่านยอดไม่ได้ (amount ว่าง) หรือ SlipOK บอกว่าสลิปซ้ำ
   */
  const partialRaw =
    eligible && !pass && verify.status === "fail" && verify.genuine === true && !verify.duplicate && (verify.amount ?? 0) > 0 && (verify.amount ?? 0) < expected;
  /**
   * 📄 ลูกค้าโอน "ตรงตามใบ FlowAccount" แต่ยอดในระบบไม่ตรงใบ = ข้อมูลฝั่งเราเพี้ยน ไม่ใช่ลูกค้าโอนขาด
   * (OD-260911-5435 · 11 ก.ย. 69: ค่าส่ง ฿100 ในใบหายตอนเปลี่ยนวิธีส่งเป็น "มารับเอง" ยอดในระบบเลยต่ำกว่าบิล
   *  ลูกค้าโอนสุทธิตามใบ 4,688.32 ครบแล้ว แต่ระบบนับเป็นรับบางส่วนแล้วส่งไลน์ทวงอีก ฿30.38)
   * → ห้ามนับยอด ห้ามส่งไลน์ทวงส่วนต่าง · พักเป็น "รอตรวจสอบ" ให้แอดมินแก้ยอดให้ตรงใบ แล้วกดยืนยันเงินเข้าเอง
   * (SlipOK ยืนยันแล้วว่าสลิปแท้ + ยอดตรงใบ · อย่าบอกให้กด "ตรวจสลิปอีกครั้ง" — SlipOK จำสลิปที่ตรวจไปแล้ว
   *  รอบสองมักตอบ 1012 "สลิปซ้ำ" เสียเปล่า · ยืนยันเงินเข้าจะตั้ง paidTotal = ยอดเต็มตามบิลให้เอง ไม่เหลือค้างผี)
   */
  const billGap = flowAccountGap(order) ?? 0;
  const perBillDoc = partialRaw && billGap !== 0 && slipMatchesFlowAccountBill(order, verify.amount!);
  /**
   * 🧾 ชั้นที่ 2 — ไม่ต้องมีเอกสาร FlowAccount ให้เทียบ: ตัวเลขภาษีของใบนี้เองไม่ตรงเรต × ฐาน
   * (VAT/หัก ณ ที่จ่าย ค้างของฐานเก่า) แล้วลูกค้าโอน "ตรงยอดที่ควรจะเป็น" พอดี = ยอดในระบบผิด ไม่ใช่โอนขาด
   * (OD-260915-1705 · 15 ก.ย. 69: ใบเสนอราคาแก้ 12 → 5 ชิ้น รายการตามแต่ VAT ค้าง 7% ของ 12 ชิ้น
   *  ลูกค้าโอนสุทธิตามใบ 1,580.80 ครบ แต่ระบบหาว่าขาด 194.56 แล้วส่งไลน์ทวง)
   */
  const reconciled = partialRaw ? reconciledOrderAmounts(order) : [];
  const perBillTax = reconciled.some((n) => Math.abs(n - verify.amount!) <= 1);
  const paidPerBill = perBillDoc || perBillTax;
  const partial = partialRaw && !paidPerBill;
  if (paidPerBill)
    verify = {
      ...verify,
      detail: perBillDoc
        ? `⚠️ ยอดในระบบไม่ตรงกับใบ FlowAccount ${order.flowAccount?.docNo ?? ""} — ลูกค้าโอน ${thb(verify.amount!)} บาท ` +
          `ตรงตามใบ (ใบ ${thb(order.flowAccount?.grandTotal ?? 0)} บาท${order.flowAccount?.net ? ` · สุทธิ ${thb(order.flowAccount.net)} บาท` : ""}) ` +
          `แต่ยอดในระบบเป็น ${thb(orderBilledTotal(order))} บาท (ต่าง ${thb(Math.abs(billGap))} บาท) — ` +
          `แก้ยอดในระบบให้ตรงใบก่อน (ปุ่ม “🔄 เทียบกับเอกสารล่าสุด”) แล้วกดยืนยันเงินเข้าได้เลย — สลิปแท้และยอดตรงใบแล้ว ` +
          `(อย่ากด “ตรวจสลิปอีกครั้ง” SlipOK จำสลิปใบนี้ได้ รอบสองจะตอบว่าสลิปซ้ำ) · ยังไม่นับยอดและยังไม่แจ้งลูกค้า`
        : `⚠️ ภาษีในใบนี้ยังเป็นตัวเลขของยอดเก่า — ลูกค้าโอน ${thb(verify.amount!)} บาท ตรงกับยอดที่ถูกต้อง ` +
          `(คิด VAT/หัก ณ ที่จ่ายตามเรตกับรายการล่าสุดแล้วได้ ${reconciled.map(thb).join(" / ")} บาท) ` +
          `แต่ยอดในระบบเป็น ${thb(orderTotal(order))} บาท — แก้ VAT/หัก ณ ที่จ่ายในโซนยอดเงินให้ตรงบิลก่อน ` +
          `แล้วกดยืนยันเงินเข้าได้เลย — สลิปแท้และยอดตรงบิลแล้ว ` +
          `(อย่ากด “ตรวจสลิปอีกครั้ง” SlipOK จำสลิปใบนี้ได้ รอบสองจะตอบว่าสลิปซ้ำ) · ยังไม่นับยอดและยังไม่แจ้งลูกค้า`,
    };
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
    else if (verify.wrongReceiver) updated = withLog(updated, "SlipOK", `${rc}🚫 สลิปโอนเข้าบัญชีอื่น ไม่ใช่บัญชีร้าน — เงินไม่ได้เข้าร้าน`, verify.detail ?? "");
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
          status: waiting ? stageAfterPayment(updated) : updated.status,
          ...(waiting ? clearStageMemory : {}),
        };
        updated = withLog(updated, "SlipOK", `${rc}ยืนยันมัดจำ 50% อัตโนมัติ${paidBefore > 0 ? " (รวมยอดที่รับบางส่วนก่อนหน้า)" : ""}`, amountNote);
      } else {
        // มัดจำขาด → "รอตรวจสอบ" ให้แอดมินเปิดสลิปดูก่อน (เจ้าของร้านสั่ง 10 ก.ย. 69: SlipOK ไม่ผ่านทุกแบบต้องเข้ารอตรวจสอบ
        // — ยอดขาดอาจเป็นหัก ณ ที่จ่ายฐานที่สูตรเดาไม่ถูก ไม่ใช่ลูกค้าโอนไม่ครบจริง) · ลูกค้ายังเห็นยอดค้าง+แนบเพิ่มได้ (phase extra)
        updated = parkForSlipReview(updated);
        updated = withLog(updated, "SlipOK", `${rc}รับมัดจำบางส่วน ${thb(credit)} บาท — ยังขาดอีก ${thb(round2(depositDue - paidNow))} บาท (รอลูกค้าโอนเพิ่ม)`, amountNote);
      }
    } else if (updated.deposit && !updated.deposit.settledAt) {
      if (remain <= 0.5) {
        // งวดหลังครบ — สถานะงานเดินต่อตามเดิม · ใบที่ถูกพักไว้ "รอตรวจสอบ" เพราะสลิปก่อนหน้าตก (parkForSlipReview) กลับขั้นที่จำไว้
        confirmedFull = true;
        updated = {
          ...updated,
          paidTotal: Math.max(paidNow, total),
          deposit: { ...updated.deposit, settledAt: now },
          ...(waiting ? { status: stageAfterPayment(updated), ...clearStageMemory } : {}),
        };
        updated = withLog(updated, "SlipOK", `${rc}รับยอดคงเหลือครบแล้ว (อัตโนมัติ)`, amountNote);
      } else {
        // งวดหลังโอนขาด → พักใบไว้ "รอตรวจสอบ" (ยอดขาดอาจเป็นหัก ณ ที่จ่ายที่สูตรเดาไม่ถูก) · งานยังอยู่ขั้นเดิมผ่าน queueStageOf
        updated = parkForSlipReview(updated);
        updated = withLog(updated, "SlipOK", `${rc}รับยอดคงเหลือบางส่วน ${thb(credit)} บาท — ยังขาดอีก ${thb(remain)} บาท`, amountNote);
      }
    } else if (remain <= 0.5) {
      // ใบธรรมดาครบ (หรือใบมัดจำที่ครบสองงวดแล้วมียอดโตทีหลังและเพิ่งเก็บครบ)
      confirmedFull = true;
      // ผ่านการตรวจอัตโนมัติเท่านั้นถึงยืนยันให้เลย — งานที่ลูกค้าจัดวางลายบนเทมเพลตเองมาครบ ข้ามไป "อนุมัติแบบ" เลย
      // ใบที่ถูกเด้งกลับมารอชำระเงินเพราะยอดโต (reopenedFrom) → กลับไปขั้นเดิม ไม่ถอยไป "ชำระแล้ว" ให้ตรวจแบบซ้ำ
      // งานที่เดินหน้าไปแล้ว (ค่าบริการเพิ่ม/สั่งเพิ่มระหว่างผลิต) คงสถานะเดิม แค่ปลดล็อกยอดค้าง
      updated = { ...updated, status: waiting ? stageAfterPayment(updated) : updated.status, ...clearStageMemory };
      updated = withLog(
        updated,
        "SlipOK",
        `${rc}${paidBefore > 0 ? `รับยอดครบแล้ว (อัตโนมัติ) — รวมที่รับก่อนหน้า ${thb(paidBefore)} บาท` : "ยืนยันการชำระเงินอัตโนมัติ"}`,
        amountNote
      );
    } else {
      // รับบางส่วน — ยอดค้างที่เหลือโชว์ให้ลูกค้าโอนต่อ (phase extra) · ใบเข้า "รอตรวจสอบ" ทุกใบ รวมงานที่เดินไปแล้ว (จำขั้นเดิมไว้ · parkForSlipReview)
      // (เดิมกลับไป "รอชำระเงิน" — เจ้าของร้านสั่ง 10 ก.ย. 69 ว่า SlipOK ไม่ผ่านทุกแบบให้เข้ารอตรวจสอบ เพราะยอดขาดอาจเป็นหัก ณ ที่จ่ายที่สูตรไม่รู้จัก)
      updated = parkForSlipReview(updated);
      updated = withLog(updated, "SlipOK", `${rc}รับเงินบางส่วน ${thb(credit)} บาท — ยังค้างอีก ${thb(remain)} บาท (รอลูกค้าโอนเพิ่ม)`, amountNote);
    }
  } else {
    // ตรวจไม่ผ่านและนับยอดไม่ได้ (อ่านยอดไม่ได้ / ระบบล่ม / ซ้ำ) → รอแอดมินตรวจเอง
    // ⚠️ ทุก phase — เดิมตั้ง "รอตรวจสอบ" เฉพาะใบแรก สลิปงวดหลัง/ใบเพิ่มที่ตกได้แค่บรรทัดประวัติ ใบไม่โผล่ในชิปรอตรวจสอบของลิสต์
    // (OD-260911-8026 · 2 ต.ค. 69) → parkForSlipReview จำขั้นเดิมไว้ที่ reopenedFrom งานไม่หลุดคิว
    updated = parkForSlipReview(updated);
    if (paidPerBill)
      updated = withLog(updated, "SlipOK", perBillDoc ? `${rc}⚠️ ยอดในระบบไม่ตรงใบ FlowAccount — ลูกค้าโอนตรงตามใบแล้ว รอแอดมินแก้ยอดให้ตรงก่อน` : `${rc}⚠️ VAT/หัก ณ ที่จ่ายในใบยังเป็นตัวเลขของยอดเก่า — ลูกค้าโอนตรงยอดที่ถูกต้องแล้ว รอแอดมินแก้ยอดให้ตรงก่อน`, verify.detail ?? "");
    else if (verify.wrongReceiver)
      updated = withLog(updated, "SlipOK", `${rc}🚫 สลิป${phase === "balance" ? "ยอดคงเหลือ" : phase === "extra" ? "ใบเพิ่ม" : ""}โอนเข้าบัญชีอื่น ไม่ใช่บัญชีร้าน — เงินไม่ได้เข้าร้าน รอแอดมินติดต่อลูกค้า`, verify.detail ?? "");
    else if (verify.status === "fail")
      updated = withLog(updated, "SlipOK", `${rc}สลิป${phase === "balance" ? "ยอดคงเหลือ" : phase === "extra" ? "ใบเพิ่ม" : ""}ตรวจไม่ผ่าน — รอแอดมินตรวจเอง`, verify.detail ?? "");
    // ⚠️ ต้องลงทุก phase รวม "first" — เดิมข้ามใบแรก ออเดอร์ที่ SlipOK ไม่ตอบเลยไม่มีร่องรอยในประวัติสักบรรทัด (21 ก.ย. 69)
    else
      updated = withLog(
        updated,
        phase === "first" ? "SlipOK" : by,
        `แนบสลิป${phase === "balance" ? "ยอดคงเหลือ" : phase === "extra" ? "เพิ่ม" : ""} — ตรวจอัตโนมัติไม่ได้ รอแอดมินตรวจเอง`,
        verify.detail ?? "ตรวจอัตโนมัติไม่ได้"
      );
  }

  // 🤖 ผลอ่านรูปด้วย AI + คำเตือน — ลงประวัติให้เห็นว่าเตือนอะไร (กล่องเตือนบนสลิปอยู่ที่ verify ของใบนั้น)
  // วันที่แบบ พ.ศ. ให้ตรงกับที่ทีมคุยกัน (21/09/2569 09:09)
  const thTime = (o?: { date?: string; time?: string }) =>
    o?.date ? `${o.date.slice(8, 10)}/${o.date.slice(5, 7)}/${Number(o.date.slice(0, 4)) + 543}${o.time ? ` ${o.time}` : ""}` : "";
  if (verify.ocr)
    updated = withLog(
      updated,
      "AI อ่านสลิป",
      "🤖 อ่านรูปสลิปที่ไม่มี QR",
      [
        verify.ocr.amount ? `ยอด ${thb(verify.ocr.amount)} บาท` : "",
        thTime(verify.ocr) ? `โอน ${thTime(verify.ocr)}` : "",
        verify.ocr.ref ? `อ้างอิง ${verify.ocr.ref}` : "",
        verify.ocr.docRef ? `เลขเอกสาร ${verify.ocr.docRef}` : "",
        verify.ocr.payerName ? `ผู้โอน ${verify.ocr.payerName}` : "",
        "(AI อ่าน — เทียบกับรูปก่อนรับยอด)",
      ].filter(Boolean).join(" · ")
    );
  if (verify.lookalike?.length)
    updated = withLog(updated, "ระบบ", "⚠️ สลิปอาจซ้ำกับออเดอร์อื่น", verify.lookalike.map((l) => `${l.orderId}: ${l.why}`).join(" | "));
  if (verify.docMismatch) updated = withLog(updated, "ระบบ", "⚠️ เลขอ้างอิงในสลิปไม่ตรงบิล", verify.docMismatch);
  if (verify.ocrReceiverMismatch)
    updated = withLog(updated, "ระบบ", "⚠️ บัญชีผู้รับในสลิปอาจไม่ใช่บัญชีร้าน", `AI อ่านได้: ${[verify.ocr?.receiverName, verify.ocr?.receiverAccount].filter(Boolean).join(" ")}`);

  const { error: saveErr } = await updateOrder(sb, updated);
  if (saveErr) throw new Error(saveErr.message);

  // 📣 สลิปหน้าตาเหมือนใบในออเดอร์อื่น → การ์ดเข้าห้องเรื่องเงิน (เกิดน้อย ไม่เปลืองโควตา)
  if (verify.lookalike?.length) {
    const lk = verify.lookalike;
    inBackground(
      "slipLookalikeAlert",
      pushShopAlert(
        {
          tone: "#D97706",
          title: "⚠️ สลิปอาจซ้ำกับออเดอร์อื่น",
          headline: "ยอดและวันเวลาโอนตรงกับสลิปที่แนบไว้แล้ว — เปิดเทียบก่อนรับยอด",
          heroLabel: "ออเดอร์ที่แนบ",
          hero: updated.id,
          rows: [
            { label: "ลูกค้า", value: `${updated.customer} · ${updated.phone}` },
            { label: "อาจซ้ำกับ", value: lk.map((l) => l.orderId).join(", "), bold: true, color: "#B45309" },
          ],
          bullets: lk.map((l) => `${l.orderId}: ${l.why}`),
          button: { label: "เปิดออเดอร์", uri: `https://iduckystore.com/admin/orders/${encodeURIComponent(updated.id)}` },
          alt: `⚠️ สลิปอาจซ้ำ ${updated.id} ↔ ${lk.map((l) => l.orderId).join(", ")}`,
        },
        { money: true }
      )
    );
  }

  // ── 3) ผลข้างเคียงหลังบันทึก ──
  const link = orderLink(origin, updated);
  // เงินเข้าบัญชีจริง = ยอดในสลิป (น้อยกว่ายอดตั้งเมื่อโดนหัก ณ ที่จ่าย/ค่าธรรมเนียม) — ให้ msVerify กระทบยอดกับธนาคารตรง
  const received = verify.amount ?? credit;
  // ขอใบ 50 ทวิจากลูกค้าไปในข้อความยืนยันเลย — เคสหัก ณ ที่จ่าย
  const whtAsk = verify.deduction?.kind === "wht" ? `\nรับยอดหลัง${verify.deduction.label} — รบกวนส่งหนังสือรับรองหักภาษี ณ ที่จ่าย (50 ทวิ) ให้ทางร้านด้วยนะครับ` : "";
  /**
   * 🧷 เรคอร์ด msVerify ต้องเขียนให้เสร็จ "ก่อนตอบคำขอ" — ห้าม fire-and-forget
   * Netlify เป็น serverless: ตอบ response เสร็จมันแช่แข็งเครื่องทันที งานที่ยังค้างอยู่เบื้องหลังตายกลางทางได้
   * (พนักงานแจ้ง 14 ก.ย. 69: OD-260910-4381 + OD-260911-2116 ชำระแล้วแต่ไม่ขึ้นแท็บ 🛒 iDucky Store เลย)
   * reportPaidToTP กลืน error ในตัวเองอยู่แล้ว → รอได้ ไม่ทำให้การยืนยันเงินล้ม · ตาข่ายชั้นสอง = cron/tp-bridge-audit
   */
  const pendingTP: Promise<unknown>[] = [];
  // เรคอร์ด msVerify แยกใบ: ช่องแรก = doc id หลัก · งวดหลัง = -final · ใบเพิ่ม = -<paymentId> (กันชนกัน)
  const tp = (note: string) => {
    pendingTP.push(
      reportPaidToTP(updated, "SlipOK อัตโนมัติ", {
        received,
        noteSuffix: `${note}${dedNote}`,
        partial,
        ...(phase === "extra" ? { docSuffix: `-${paymentId}`, slipPath: path, extra: true } : phase === "balance" ? { docSuffix: "-final" } : {}),
      })
    );
  };
  // ครบงวดด้วยสลิปใบเพิ่ม → เรคอร์ดหลักที่เคยติดธง "รับบางส่วน" ต้องปลดธง (บอร์ด WIP ถึงจะขึ้นการ์ด)
  const completeViaExtra = phase === "extra" && (confirmedDeposit || confirmedFull) && paidSoFar(order) > 0;

  if (confirmedDeposit) {
    const remain = orderTotal(updated) - (updated.paidTotal ?? 0);
    // ➗ ลูกค้าหัก ณ ที่จ่าย: บอกเงินที่ต้องโอนจริงคู่ไปด้วย ไม่งั้นโอนตามยอดงวดแล้วเกิน (ตรงกับหน้าออเดอร์)
    const remainNet = balanceNetTransfer(updated, remain);
    const remainNote = remainNet ? ` (โอนจริง ${thb(remainNet.net)} บาท หลังหัก ณ ที่จ่าย${remainNet.rateTxt})` : "";
    inBackground("notifyCustomerLogged", notifyCustomerLogged(
      sb,
      updated,
      orderNotice(updated, link, {
        tone: "depositIn",
        head: "รับมัดจำแล้ว",
        headline: "รับมัดจำเรียบร้อย เริ่มงานให้เลยครับ",
        hero: { label: "ยอดคงเหลือ (ชำระก่อนจัดส่ง)", value: `${thb(remain)} บาท` },
        rows: [{ label: "ยอดรวมทั้งบิล", value: `${thb(orderTotal(updated))} บาท` }, { label: "รับแล้ว", value: `${thb(updated.paidTotal ?? 0)} บาท`, bold: true }],
        note: `${remainNet ? `โอนจริง ${thb(remainNet.net)} บาท หลังหัก ณ ที่จ่าย${remainNet.rateTxt}\n` : ""}โอนยอดคงเหลือแล้วแนบสลิปในหน้าออเดอร์ได้เลยครับ${whtAsk}`,
        alt: `✅ รับมัดจำออเดอร์ ${updated.id} แล้ว เริ่มงานให้เลยครับ\nยอดคงเหลือ ${thb(remain)} บาท ชำระก่อนจัดส่ง${remainNote}${whtAsk}\n${link}`,
      }),
      "ยืนยันรับมัดจำ"
    ));
    tp("มัดจำ 50% งวดแรก");
    inBackground("cutStockForOrder", cutStockForOrder(updated)); // มัดจำ = เริ่มงานแล้วก็ตัดสต๊อกเลย
    inBackground("bumpSoldForOrder", bumpSoldForOrder(updated.id));
  } else if (confirmedFull) {
    if (order.deposit) {
      inBackground("notifyCustomerLogged", notifyCustomerLogged(
        sb,
        updated,
        orderNotice(updated, link, {
          tone: "settled",
          head: "รับยอดคงเหลือครบแล้ว",
          headline: "รับยอดคงเหลือครบแล้ว ขอบคุณครับ 🦆",
          rows: [{ label: "ยอดรวมทั้งบิล", value: `${thb(orderTotal(updated))} บาท`, bold: true }],
          ...(whtAsk ? { note: whtAsk.trim() } : {}),
          alt: `✅ รับยอดคงเหลือออเดอร์ ${updated.id} ครบแล้ว ขอบคุณครับ${whtAsk}\n${link}`,
        }),
        "ยืนยันรับยอดคงเหลือครบ"
      ));
      tp(order.deposit.settledAt ? "เก็บยอดที่เพิ่มทีหลังครบแล้ว" : "ยอดคงเหลือ 50% หลัง (ครบแล้ว)");
    } else if (waiting) {
      inBackground("notifyCustomerLogged", notifyCustomerLogged(
        sb,
        updated,
        orderNotice(updated, link, {
          tone: "paidIn",
          head: "ยืนยันการชำระเงินแล้ว",
          headline: "ยืนยันการชำระเงินแล้ว กำลังเริ่มงานให้ครับ",
          rows: [{ label: "ยอดรวมทั้งบิล", value: `${thb(orderTotal(updated))} บาท`, bold: true }],
          ...(whtAsk ? { note: whtAsk.trim() } : {}),
          alt: `✅ ยืนยันการชำระเงินออเดอร์ ${updated.id} แล้ว กำลังเริ่มงานให้ครับ${whtAsk}\n${link}`,
        }),
        "ยืนยันการชำระเงิน"
      ));
      tp(paidSoFar(order) > 0 ? "รับยอดส่วนที่เหลือครบแล้ว" : "");
      inBackground("cutStockForOrder", cutStockForOrder(updated)); // ตัดสต๊อกวัสดุที่ผูกไว้
      inBackground("bumpSoldForOrder", bumpSoldForOrder(updated.id)); // ยอด "ขายแล้ว" หน้าเว็บ (กันซ้ำในตัวเอง)
    } else {
      // งานเดินอยู่แล้ว เพิ่งเก็บส่วนต่าง (สั่งเพิ่ม/ค่าบริการเพิ่ม) ครบ — ปลดล็อกยิงเลขพัสดุ ไม่ต้องเริ่มงานซ้ำ
      inBackground("notifyCustomerLogged", notifyCustomerLogged(
        sb,
        updated,
        orderNotice(updated, link, {
          tone: "diffIn",
          head: "รับยอดส่วนต่างครบแล้ว",
          headline: "รับยอดส่วนต่างครบแล้ว ขอบคุณครับ 🦆",
          rows: [{ label: "ยอดรวมทั้งบิล", value: `${thb(orderTotal(updated))} บาท`, bold: true }],
          ...(whtAsk ? { note: whtAsk.trim() } : {}),
          alt: `✅ รับยอดส่วนต่างออเดอร์ ${updated.id} ครบแล้ว ขอบคุณครับ${whtAsk}\n${link}`,
        }),
        "ยืนยันรับยอดส่วนต่างครบ"
      ));
      tp("ยอดส่วนต่างที่เก็บเพิ่ม (ครบแล้ว)");
    }
    // 🦆 แต้มสะสม — บวกเมื่อชำระ "ครบ" เท่านั้น (idempotent)
    inBackground("awardPointsForOrder", awardPointsForOrder(updated));
  } else if (partial) {
    const remain = round2(Math.max(0, (updated.deposit && !updated.deposit.firstPaidAt ? Math.min(orderTotal(updated), updated.deposit.amount) : orderTotal(updated)) - (updated.paidTotal ?? 0)));
    inBackground("notifyCustomerLogged", notifyCustomerLogged(
      sb,
      updated,
      orderNotice(updated, link, {
        tone: "partial",
        head: "รับเงินบางส่วนแล้ว",
        headline: `รับยอด ${thb(credit)} บาทแล้วครับ — ยังไม่ครบยอด`,
        hero: { label: "ยังขาดอีก", value: `${thb(remain)} บาท` },
        rows: [
          { label: "ยอดรวมทั้งบิล", value: `${thb(orderTotal(updated))} บาท` },
          { label: "รับแล้ว", value: `${thb(updated.paidTotal ?? 0)} บาท`, bold: true },
        ],
        note: "โอนส่วนที่เหลือแล้วแนบสลิปเพิ่มที่ลิงก์เดิมได้เลยครับ",
        alt: `💳 รับยอด ${thb(credit)} บาท ของออเดอร์ ${updated.id} แล้วครับ\nยังขาดอีก ${thb(remain)} บาท — โอนส่วนที่เหลือแล้วแนบสลิปเพิ่มที่ลิงก์เดิมได้เลย\n${link}`,
      }),
      `รับเงินบางส่วน ${thb(credit)} บาท (ค้าง ${thb(remain)})`
    ));
    tp(`รับบางส่วน ${thb(credit)} บาท · ค้าง ${thb(remain)} บาท`);
  }

  // partial = ยังค้างอยู่หลังนับใบนี้ (ถ้ารับบางส่วนแล้วครบงวดพอดี ถือว่ายืนยัน ไม่ใช่บางส่วน)
  if (completeViaExtra) pendingTP.push(syncPaidCompleteToTP(updated, "SlipOK อัตโนมัติ"));

  // ⏳ รอเรคอร์ด msVerify ให้ลงจริงก่อนตอบ (ดูเหตุผลที่ pendingTP) — ที่เหลือ (ไลน์/สต๊อก/แต้ม) ยังเป็นงานเบื้องหลังตามเดิม
  await settleTP(pendingTP);

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
  /**
   * 💸 ย้ายเงินโอนเกินมาจากออเดอร์อื่น (overpay transfer) — ไม่มีเงินเข้าบัญชีใหม่
   * ห้ามเขียนเรคอร์ด msVerify (เงินก้อนนี้ลงเรคอร์ดของใบต้นทางไปแล้ว ไม่งั้นนับเงินเข้าซ้ำ) · ใช้ข้อความประวัติแทนของเดิม
   */
  moved?: { fromOrderId: string };
}): Promise<Order> {
  const { sb, order, paymentId, who, origin, moved } = a;
  const amount = round2(Math.max(0, a.amount));
  const list = [...(order.payments ?? [])];
  const idx = list.findIndex((p) => p.id === paymentId);
  if (idx < 0) throw new Error("ไม่พบสลิปใบนี้ในออเดอร์");
  if ((list[idx].credited ?? 0) > 0) throw new Error("สลิปใบนี้นับยอดไปแล้ว");
  if (!(amount > 0)) throw new Error("ยอดต้องมากกว่า 0");

  const now = new Date().toISOString();
  const waiting = order.status === "รอชำระเงิน" || order.status === "รอตรวจสอบ";
  /**
   * 🧾 ลูกค้าหัก ณ ที่จ่าย: โอนมาเท่า "ยอดค้างหลังหักภาษี" พอดี = จ่ายครบงวด → นับเข้า paidTotal เป็นยอดตามบิล
   * (paidTotal เป็นยอดตามบิล — นับแค่เงินที่เข้า ภาษีส่วนนั้นจะค้างเป็นหนี้ปลอมตลอดไป · OD-261001-8513)
   */
  const balNow = orderBalance(order);
  const whtShare = moved ? 0 : balanceWhtShare(order, balNow);
  const credit = whtShare > 0 && Math.abs(amount - (balNow - whtShare)) <= 0.5 ? round2(balNow) : amount;
  list[idx] = { ...list[idx], credited: credit, accepted: { by: who, at: now } };
  const paidNow = round2(paidSoFar(order) + credit);
  let updated: Order = { ...order, payments: list, paidTotal: paidNow };
  const total = orderTotal(updated);
  const remain = round2(Math.max(0, total - paidNow));
  const head = moved ? `💸 รับเงินโอนเกินที่ย้ายมาจาก ${moved.fromOrderId}` : "รับยอดสลิปใบเพิ่มเอง";
  const amountNote = moved
    ? `ยอด ${thb(amount)} บาท · ย้ายเงินโอนเกินมาจาก ${moved.fromOrderId} (ลูกค้าโอนรวม — ไม่มีเงินเข้าใหม่)`
    : `ยอด ${thb(amount)} บาท · แอดมินเทียบยอดเอง${credit > amount ? ` · หัก ณ ที่จ่าย ${thb(round2(credit - amount))} บาท (นับยอดตามบิล ${thb(credit)} บาท — รอใบ 50 ทวิจากลูกค้า)` : ""}`;

  let confirmedDeposit = false;
  let confirmedFull = false;
  if (updated.deposit && !updated.deposit.firstPaidAt) {
    const depositDue = Math.min(total, Math.max(0, updated.deposit.amount));
    if (paidNow + 0.5 >= depositDue) {
      confirmedDeposit = true;
      updated = { ...updated, deposit: { ...updated.deposit, firstPaidAt: now }, status: waiting ? stageAfterPayment(updated) : updated.status, ...(waiting ? clearStageMemory : {}) };
      updated = withLog(updated, who, `${head} — ครบมัดจำ 50%`, amountNote);
    } else updated = withLog(updated, who, `${head} — มัดจำยังขาดอีก ${thb(round2(depositDue - paidNow))} บาท`, amountNote);
  } else if (updated.deposit && !updated.deposit.settledAt) {
    if (remain <= 0.5) {
      confirmedFull = true;
      // ใบที่ถูกพักไว้ "รอตรวจสอบ" เพราะสลิปตก (parkForSlipReview) → กลับขั้นที่จำไว้
      updated = {
        ...updated,
        paidTotal: Math.max(paidNow, total),
        deposit: { ...updated.deposit, settledAt: now },
        ...(waiting ? { status: stageAfterPayment(updated), ...clearStageMemory } : {}),
      };
      updated = withLog(updated, who, `${head} — ยอดคงเหลือครบแล้ว`, amountNote);
    } else updated = withLog(updated, who, `${head} — ยังขาดอีก ${thb(remain)} บาท`, amountNote);
  } else if (remain <= 0.5) {
    confirmedFull = true;
    updated = { ...updated, status: waiting ? stageAfterPayment(updated) : updated.status, ...clearStageMemory };
    updated = withLog(updated, who, `${head} — รับเงินครบแล้ว`, amountNote);
  } else updated = withLog(updated, who, `${head} — ยังค้างอีก ${thb(remain)} บาท`, amountNote);

  const { error } = await updateOrder(sb, updated);
  if (error) throw new Error(error.message);

  const link = orderLink(origin, updated);
  const adminName = `แอดมิน ${who}`;
  // 🧷 เรคอร์ด msVerify รอให้เสร็จก่อนตอบ (เหตุผลเดียวกับ pendingTP ใน applySlipVerification)
  const pendingTP: Promise<unknown>[] = [];
  const tp = (note: string) => {
    /*
     * 💸 เงินที่ย้ายมา: ยังต้องมีเรคอร์ด (บอร์ด WIP กราฟฟิกขึ้นการ์ดจากเรคอร์ดหลัก) แต่บอกชัดว่าไม่ใช่เงินก้อนใหม่
     * ใบที่ไม่เคยมีเงินเข้าเลย = เขียนเป็นเรคอร์ดหลัก (ไม่งั้นไม่มีการ์ด) · ใบที่มีเงินอยู่แล้ว = เรคอร์ดใบเพิ่มตามปกติ
     * ⚠️ msDaily จะหาแถวโอนยอดนี้ไม่เจอ (เงินจริงอยู่ในสลิปของใบต้นทาง) — note บอกให้แอดมินรู้
     */
    if (moved) {
      const movedNote = `💸 เงินโอนเกินย้ายมาจาก ${moved.fromOrderId} (สลิปเดียวกับใบนั้น ไม่มีเงินเข้าใหม่) · ${note}`;
      pendingTP.push(
        paidSoFar(order) > 0
          ? reportPaidToTP(updated, adminName, { received: amount, noteSuffix: movedNote, docSuffix: `-${paymentId}`, slipPath: list[idx].path, extra: true, partial: !confirmedDeposit && !confirmedFull })
          : reportPaidToTP(updated, adminName, { received: amount, noteSuffix: movedNote, slipPath: list[idx].path, partial: !confirmedDeposit && !confirmedFull })
      );
      return;
    }
    pendingTP.push(
      reportPaidToTP(updated, adminName, { received: amount, noteSuffix: note, docSuffix: `-${paymentId}`, slipPath: list[idx].path, extra: true, partial: !confirmedDeposit && !confirmedFull })
    );
  };
  if ((confirmedDeposit || confirmedFull) && paidSoFar(order) > 0) pendingTP.push(syncPaidCompleteToTP(updated, adminName));
  if (confirmedDeposit) {
    const rem = orderTotal(updated) - (updated.paidTotal ?? 0);
    inBackground("notifyCustomerLogged", notifyCustomerLogged(
      sb,
      updated,
      orderNotice(updated, link, {
        tone: "depositIn",
        head: "รับมัดจำแล้ว",
        headline: "รับมัดจำเรียบร้อย เริ่มงานให้เลยครับ",
        hero: { label: "ยอดคงเหลือ (ชำระก่อนจัดส่ง)", value: `${thb(rem)} บาท` },
        rows: [{ label: "ยอดรวมทั้งบิล", value: `${thb(orderTotal(updated))} บาท` }, { label: "รับแล้ว", value: `${thb(updated.paidTotal ?? 0)} บาท`, bold: true }],
        note: "โอนยอดคงเหลือแล้วแนบสลิปในหน้าออเดอร์ได้เลยครับ",
        alt: `✅ รับมัดจำออเดอร์ ${updated.id} แล้ว เริ่มงานให้เลยครับ\nยอดคงเหลือ ${thb(rem)} บาท ชำระก่อนจัดส่ง\n${link}`,
      }),
      "ยืนยันรับมัดจำ"
    ));
    tp("มัดจำ 50% งวดแรก (สลิปใบเพิ่ม)");
    inBackground("cutStockForOrder", cutStockForOrder(updated));
    inBackground("bumpSoldForOrder", bumpSoldForOrder(updated.id));
  } else if (confirmedFull) {
    inBackground("notifyCustomerLogged", notifyCustomerLogged(
      sb,
      updated,
      orderNotice(updated, link, {
        tone: "fullIn",
        head: "รับยอดครบแล้ว",
        headline: "รับยอดครบแล้ว ขอบคุณครับ 🦆",
        rows: [{ label: "ยอดรวมทั้งบิล", value: `${thb(orderTotal(updated))} บาท`, bold: true }],
        alt: `✅ รับยอดออเดอร์ ${updated.id} ครบแล้ว ขอบคุณครับ\n${link}`,
      }),
      "ยืนยันรับเงินครบ"
    ));
    tp(order.deposit ? "ยอดคงเหลือครบ (สลิปใบเพิ่ม)" : "รับครบ (สลิปใบเพิ่ม)");
    if (waiting && !order.deposit) {
      inBackground("cutStockForOrder", cutStockForOrder(updated));
      inBackground("bumpSoldForOrder", bumpSoldForOrder(updated.id));
    }
    inBackground("awardPointsForOrder", awardPointsForOrder(updated));
  } else {
    inBackground("notifyCustomerLogged", notifyCustomerLogged(
      sb,
      updated,
      orderNotice(updated, link, {
        tone: "partial",
        head: "รับเงินบางส่วนแล้ว",
        headline: `รับยอด ${thb(amount)} บาทแล้วครับ — ยังไม่ครบยอด`,
        hero: { label: "ยังขาดอีก", value: `${thb(remain)} บาท` },
        rows: [
          { label: "ยอดรวมทั้งบิล", value: `${thb(orderTotal(updated))} บาท` },
          { label: "รับแล้ว", value: `${thb(updated.paidTotal ?? 0)} บาท`, bold: true },
        ],
        note: "โอนส่วนที่เหลือแล้วแนบสลิปเพิ่มที่ลิงก์เดิมได้เลยครับ",
        alt: `💳 รับยอด ${thb(amount)} บาท ของออเดอร์ ${updated.id} แล้วครับ\nยังขาดอีก ${thb(remain)} บาท — โอนส่วนที่เหลือแล้วแนบสลิปเพิ่มที่ลิงก์เดิมได้เลย\n${link}`,
      }),
      `รับเงินบางส่วน ${thb(amount)} บาท`
    ));
    tp(`รับบางส่วน ${thb(amount)} บาท · ค้าง ${thb(remain)} บาท`);
  }
  await settleTP(pendingTP);
  return updated;
}

/**
 * 🩹 ใบที่ "เงินครบแล้วแต่สถานะยังค้างรอตรวจสอบ" → ปิดใบให้เองเหมือนแอดมินกดยืนยันเงินเข้า
 *
 * ทำไมต้องมี (OD-260915-1705 · เจ้าของร้านถาม 16 ก.ย. 69 "ทำไมสถานะไม่เปลี่ยนเป็นชำระแล้วให้เลย"):
 * SlipOK ตรวจสดตอนยอดในระบบยังไม่ตรงใบ FlowAccount → นับเป็นรับบางส่วน ค้างรอตรวจสอบ · สคริปต์ซ่อมยอด
 * (fix-flowaccount-total) แก้ยอด + ตั้ง slipVerify ผ่าน + paidTotal ครบ ได้ แต่เปลี่ยนสถานะไม่ได้ เพราะผลข้างเคียง
 * (msVerify/ตัดสต๊อก/ยอดขาย/แต้ม/แจ้งลูกค้า) อยู่ในโมดูล server-only — เลยฝากไว้ให้แอดมินกดเอง แล้วไม่มีใครกด
 * ตัวนี้เก็บตกให้: เรียกตอนเปิดหน้าออเดอร์ (GET) — เงื่อนไขแคบมาก ใบธรรมดา (ไม่ใช่มัดจำ) · สลิปช่องแรกผ่าน · paidTotal ≥ ยอดบิล
 * คืน null = ไม่เข้าเงื่อนไข ไม่แตะอะไร
 */
export function creditedOrderSettleable(order: Order): boolean {
  const waiting = order.status === "รอชำระเงิน" || order.status === "รอตรวจสอบ";
  if (!waiting || order.deposit || order.claimOf || order.paidTotal == null) return false;
  // เงินต้องมาจากทางที่ "ตรวจแล้ว" เท่านั้น: SlipOK ผ่าน · SlipOK แท้แต่นับบางส่วน (credited) · แอดมินรับยอดสลิปใบเพิ่มเอง
  // (paidTotal ที่ระบบเก่าตั้งล่วงหน้าตอนแจ้งโอนถูก paidSoFar ตัดออกอยู่แล้ว)
  const v = order.slipVerify;
  const verified = v?.status === "pass" || (v?.credited ?? 0) > 0 || (order.payments ?? []).some((p) => (p.credited ?? 0) > 0);
  if (!verified) return false;
  const total = orderTotal(order);
  return total > 0 && paidSoFar(order) + 0.5 >= total;
}

export async function settleCreditedOrder(a: { sb: SupabaseClient; order: Order; origin: string }): Promise<Order | null> {
  const { sb, order, origin } = a;
  if (!creditedOrderSettleable(order)) return null;
  const total = orderTotal(order);
  const paid = paidSoFar(order);

  const who = "ระบบ (ยอดครบตามสลิปแล้ว)";
  let updated: Order = { ...order, status: stageAfterPayment(order), ...clearStageMemory };
  // สลิปช่องแรกเคยถูกนับ "รับบางส่วน" (ยอดในระบบผิดตอนตรวจสด) แล้วแอดมินแก้ยอดจนครบ → ป้ายผลตรวจต้องเป็นผ่าน ไม่ใช่ "โอนขาด" ค้างอยู่
  const v = order.slipVerify;
  if (v && v.status !== "pass" && (v.credited ?? 0) > 0)
    updated = {
      ...updated,
      slipVerify: { ...v, status: "pass", credited: undefined, detail: `ยอดในสลิป ${thb(v.amount ?? v.credited ?? 0)} บาท ครบตามยอดบิลที่แก้แล้ว ${thb(total)} บาท (ตอนตรวจสดยอดในระบบยังไม่ตรง จึงนับเป็นรับบางส่วน)` },
    };
  updated = withLog(
    updated,
    who,
    "ยืนยันการชำระเงินอัตโนมัติ (เก็บตก)",
    `เงินที่ตรวจแล้ว ${thb(paid)} บาท ครบยอดบิล ${thb(total)} — ใบค้าง "${order.status}" เพราะยอดครบทีหลังจากการแก้ยอด ไม่ใช่ตอนตรวจสลิปสด ระบบปิดใบให้เอง`
  );
  const { error } = await updateOrder(sb, updated);
  if (error) throw new Error(error.message);

  const link = orderLink(origin, updated);
  const whtAsk = order.slipVerify?.deduction?.kind === "wht" ? `\nรับยอดหลัง${order.slipVerify.deduction.label} — รบกวนส่งหนังสือรับรองหักภาษี ณ ที่จ่าย (50 ทวิ) ให้ทางร้านด้วยนะครับ` : "";
  inBackground("notifyCustomerLogged", notifyCustomerLogged(
    sb,
    updated,
    orderNotice(updated, link, {
      tone: "paidIn",
      head: "ยืนยันการชำระเงินแล้ว",
      headline: "ยืนยันการชำระเงินแล้ว กำลังเริ่มงานให้ครับ",
      rows: [{ label: "ยอดรวมทั้งบิล", value: `${thb(orderTotal(updated))} บาท`, bold: true }],
      ...(whtAsk ? { note: whtAsk.trim() } : {}),
      alt: `✅ ยืนยันการชำระเงินออเดอร์ ${updated.id} แล้ว กำลังเริ่มงานให้ครับ${whtAsk}\n${link}`,
    }),
    "ยืนยันการชำระเงิน"
  ));
  // เรคอร์ด msVerify idempotent (สลิปผ่านทางสดถูกส่งไปแล้ว / สคริปต์ซ่อมปลดธงแล้ว) — รอให้เสร็จก่อนตอบเหมือนทางอื่น
  await settleTP([reportPaidToTP(updated, who, { received: order.slipVerify?.amount ?? paid })]);
  inBackground("cutStockForOrder", cutStockForOrder(updated));
  inBackground("bumpSoldForOrder", bumpSoldForOrder(updated.id));
  inBackground("awardPointsForOrder", awardPointsForOrder(updated));
  return updated;
}

/** 🧹 กวาดทุกใบที่ค้างรอเงินแล้วเข้าเกณฑ์ settleCreditedOrder — ใช้จาก cron (ไม่ต้องรอใครเปิดหน้าออเดอร์) */
export async function sweepCreditedOrders(sb: SupabaseClient, origin: string, dry = false): Promise<{ scanned: number; settled: { id: string; status: string; error?: string }[] }> {
  const { data, error } = await sb.from("orders").select("data").in("data->>status", ["รอตรวจสอบ", "รอชำระเงิน"]);
  if (error) throw new Error(error.message);
  const orders = (data ?? []).map((r) => r.data as Order).filter(creditedOrderSettleable);
  const settled: { id: string; status: string; error?: string }[] = [];
  for (const o of orders) {
    if (dry) {
      settled.push({ id: o.id, status: `${o.status} → ${stageAfterPayment(o)} (dry)` });
      continue;
    }
    try {
      const u = await settleCreditedOrder({ sb, order: o, origin });
      settled.push({ id: o.id, status: u?.status ?? o.status });
    } catch (e) {
      settled.push({ id: o.id, status: o.status, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { scanned: data?.length ?? 0, settled };
}
