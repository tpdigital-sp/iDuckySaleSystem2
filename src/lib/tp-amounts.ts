import { depositInstallments, orderCashReceived, orderTotal, orderWhtAmount, type Order } from "@/lib/admin-data";

/**
 * 💰 ยอดของ "เรคอร์ดสะพาน iDucky → msVerify" หนึ่งใบ — แยกออกมาจาก server/tp-report.ts
 * เพราะเป็นสูตรล้วน ๆ (ไม่แตะ Firestore) สคริปต์ซ่อมข้อมูลถึงจะ import ได้ ("server-only" กันไว้)
 * ดู [[iducky-msverify-bridge]] · [[iducky-deposit-wht-split]]
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * ยอดที่เข้าบัญชีจริงตามที่ SlipOK อ่านจากสลิป — ลูกค้าบางคนโอน "ยอดเต็ม" ไม่หักส่วนลดโอนไว ฿5/฿10
 * (เช่น OD-260908-3989 ออเดอร์ 3,740 แต่โอน 3,750) ถ้าส่งยอดออเดอร์ไป msVerify จะจับคู่กับธนาคารไม่เจอ
 */
export function slipVerifiedAmount(order: Order, isFinal: boolean): number | undefined {
  const v = isFinal ? order.deposit?.balanceVerify : order.slipVerify;
  return v?.status === "pass" && typeof v.amount === "number" && v.amount > 0 ? v.amount : undefined;
}

/** ยอด 4 ตัวของเรคอร์ดสะพาน 1 ใบ (ชุดเดียวกันเสมอ — bill − wht − fee = received) */
export interface TPRecordAmounts {
  bill: number;
  wht: number;
  received: number;
  fee: number;
}

/**
 * 💰 ยอดสามตัวของเรคอร์ดสะพาน 1 ใบ — ต้องเป็นชุดเดียวกันเสมอ ไม่งั้น msVerify กระทบยอดกับธนาคารไม่ลง
 *   bill     = ยอดบิล "ของงวดนี้" ก่อนหัก ณ ที่จ่าย (ทั้งใบ · งวดมัดจำ · งวดคงเหลือ · สลิปใบเพิ่ม = ยอดใบนั้น)
 *   wht      = หัก ณ ที่จ่ายที่ลูกค้านิติบุคคลหักไว้ "ของงวดนี้" (แบ่งตามสัดส่วนงวดด้วย depositInstallments)
 *   received = เงินที่เข้าบัญชีจริง · fee = ค่าธรรมเนียมที่ธนาคารหักจากยอดโอน (bill − wht − received)
 *
 * ⚠️ 14 ก.ย. 69 เจ้าของร้านทัก "ยอดที่ดึงไปต้องตรงกับยอดที่ฉันได้รับ" — ของเดิมส่งยอดบิลไปเป็นยอดสลิป
 * เคสที่เพี้ยน: ลูกค้าหัก ณ ที่จ่ายแล้วแอดมินกดยืนยันเองโดยไม่มี SlipOK (OD-260910-1945 บิล 1,294.70 เข้าจริง 1,258.40)
 * งวดแรกของออเดอร์มัดจำที่เคยส่ง "ยอดทั้งบิล" เป็น orderTotal (OD-260911-6656 บิล 34,347 แต่งวดนี้ 17,173.50)
 * และธนาคารหักค่าธรรมเนียมจากยอดที่เข้า (OD-260914-9922 โอน 5,304 เข้าจริง 5,296 — SMART TTB หัก ฿8)
 */
export function amountsForRecord(
  order: Order,
  isFinal: boolean,
  opts?: { received?: number; extra?: boolean; partial?: boolean }
): TPRecordAmounts {
  const dep = depositInstallments(order);
  // สลิปใบเพิ่ม/รับบางส่วน = เงินก้อนที่โอนมาจริง ไม่มีบิลของตัวเอง และไม่มีการหัก ณ ที่จ่ายซ้อน
  const loose = !!opts?.extra || !!opts?.partial;
  const wht = loose ? 0 : isFinal ? dep?.secondWht ?? 0 : dep ? dep.firstWht : orderWhtAmount(order);
  const bill = loose
    ? r2(opts?.received ?? 0)
    : isFinal
      ? r2(dep?.second ?? opts?.received ?? 0)
      : dep
        ? dep.first
        : orderTotal(order);
  // 💵 เงินเข้าจริง: แอดมินกรอกจากรายการเดินบัญชี > ผู้เรียกบอกมา (SlipOK) > ยอดที่ SlipOK อ่านไว้ในออเดอร์ > บิลของงวดนี้หักภาษี
  //    cashReceived ชนะทุกตัวเพราะสลิปบอก "ยอดที่ลูกค้าโอน" ส่วนธนาคารหักค่าธรรมเนียมก่อนเข้าบัญชี
  //    ใช้กับใบเดียวจบเท่านั้น — งวดมัดจำ/ใบเพิ่มมียอดของตัวเอง
  const manual = loose || isFinal || dep ? 0 : orderCashReceived(order);
  // ใบเดียวจบที่แอดมินยืนยันเอง ใช้ paidTotal เป็นฐาน (ออเดอร์ที่รับมาไม่ครบบิลจะได้ไม่รายงานเกิน)
  const base = loose || isFinal || dep ? bill : order.paidTotal ?? bill;
  const received = r2(manual || (opts?.received ?? slipVerifiedAmount(order, isFinal) ?? Math.max(0, base - wht)));
  // 💸 ค่าธรรมเนียมธนาคารของงวดนี้ — msVerify เอาไปบอกว่า "ยอดตรง" แทนที่จะขึ้น "⚠ ต่าง"
  const fee = r2(Math.max(0, bill - wht - received));
  return { bill, wht: r2(wht), received, fee };
}

/** ยอดที่เก็บไว้ในเรคอร์ดฝั่ง Firestore (ชื่อฟิลด์ของ msVerify) */
export interface StoredTPAmounts {
  orderTotal?: unknown;
  wht?: unknown;
  slipAmount?: unknown;
  fee?: unknown;
  installment?: unknown;
  partial?: unknown;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/**
 * 🔧 ยอดที่ควรเป็นของเรคอร์ดที่ "สร้างไปแล้ว" เทียบกับที่เก็บอยู่ — คืน null เมื่อไม่ต้องแก้/ห้ามแก้
 *
 * ⚠️ เรคอร์ดถูก .create() ครั้งเดียวตอนสถานะกลายเป็น "ชำระแล้ว" → ออเดอร์ที่เปิดโหมดมัดจำ 50% **ทีหลัง**
 * จะค้างยอดทั้งบิลไว้ทั้งที่ลูกค้าโอนมาแค่งวดแรก → msDaily จับคู่กับแถวโอนของธนาคารไม่เจอ
 * ("มัดจำไม่จับคู่" 14 ก.ย. 69 — OD-260911-8026 บิล 21,946.24 เรคอร์ดส่ง 21,330.92 แต่โอนงวดแรก 10,665.46)
 *
 * ซ่อมแค่ 2 อาการที่ "ยอดในเรคอร์ดไม่ใช่ยอดของงวดนี้" เท่านั้น:
 *   1) เรคอร์ดของออเดอร์มัดจำถือ "ยอดทั้งบิล" แทนยอดงวด (เปิดโหมดมัดจำหลังยืนยันเงิน / แก้ยอดมัดจำทีหลัง)
 *   2) แอดมินกรอก "เงินเข้าบัญชีจริง" ทีหลัง — บิลของงวดเท่าเดิม เปลี่ยนแค่ยอดเข้า/ค่าธรรมเนียม
 *
 * ❌ ไม่แตะเคส "ออเดอร์ถูกแก้ยอดหลังชำระ" (ลูกค้าสั่งเพิ่ม/ลด · แก้ค่าส่ง) — เรคอร์ดต้องคงยอดที่ลูกค้าโอนจริง
 *    วันนั้นไว้ ไม่งั้นแถวที่จับคู่กับธนาคารไปแล้วเพี้ยน (ยอดใหม่ไปโผล่เป็น "ค่าธรรมเนียม" ก้อนโต)
 * ❌ ไม่แตะสลิปใบเพิ่ม (extra) และใบรับบางส่วน (partial) — ยอดของใบพวกนั้นไม่ได้มาจากบิล คิดใหม่ไม่ได้
 */
export function tpAmountsFix(order: Order, isFinal: boolean, stored: StoredTPAmounts): TPRecordAmounts | null {
  if (stored.installment === "extra" || stored.partial === true) return null;
  const had = { bill: num(stored.orderTotal), wht: num(stored.wht), received: num(stored.slipAmount), fee: num(stored.fee) };
  // doc เก่าที่ยังไม่มียอดเลย → ไม่รู้ว่าเคยรายงานอะไรไป อย่าเดา
  if (had.bill <= 0 && had.received <= 0) return null;
  const money = amountsForRecord(order, isFinal);
  const billSame = Math.abs(had.bill - money.bill) < 0.01 && Math.abs(had.wht - money.wht) < 0.01;
  // 1) ยอดในเรคอร์ด = ยอดทั้งบิล ทั้งที่ออเดอร์นี้แบ่งจ่ายเป็นงวด
  const wholeBillOnInstallment =
    !!depositInstallments(order) && !billSame && Math.abs(had.bill - orderTotal(order)) < 0.01;
  // 2) เงินเข้าบัญชีจริงที่แอดมินกรอกเอง (ใบเดียวจบ) — บิลของงวดไม่เปลี่ยน
  const manualReceived = billSame && !isFinal && !order.deposit && orderCashReceived(order) > 0;
  if (!wholeBillOnInstallment && !manualReceived) return null;
  const same = (a: number, b: number) => Math.abs(a - b) < 0.01;
  if (same(had.bill, money.bill) && same(had.wht, money.wht) && same(had.received, money.received) && same(had.fee, money.fee)) return null;
  return money;
}
