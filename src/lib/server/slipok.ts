import "server-only";
import { parseSlipTransAt } from "@/lib/slip-time";

/**
 * ตรวจสลิปโอนเงินอัตโนมัติผ่าน SlipOK (slipok.com)
 * ตั้งค่า 2 ตัวใน env: SLIPOK_API_KEY + SLIPOK_BRANCH_ID (จากหน้า Dashboard ของ SlipOK)
 *
 * หลักการ fail-safe: ตรวจ "ผ่าน" เท่านั้นที่ยืนยันการชำระเงินอัตโนมัติ
 * ตรวจไม่ผ่าน/ระบบล่ม/ยังไม่ตั้งค่า → ออเดอร์ค้างที่ "รอตรวจสอบ" ให้แอดมินตรวจเองตามปกติ (ไม่มีทางจ่ายผ่านทั้งที่ยอดผิด)
 */
export interface SlipVerifyResult {
  status: "pass" | "fail" | "skip";
  /** เหตุผล/รายละเอียด (โชว์ให้แอดมิน) */
  detail?: string;
  /** ยอดเงินที่อ่านได้จากสลิป */
  amount?: number;
  /** เลขอ้างอิงธุรกรรม — กันสลิปซ้ำ */
  transRef?: string;
  /**
   * 🕰️ เวลาโอนจริงบนสลิป (ISO) — SlipOK ส่ง transTimestamp (หรือ transDate+transTime เวลาไทย) มาด้วย
   * ใช้ตัดสินส่วนลดโอนไวกรณี "โอนทันแต่แนบสลิปช้า" (slip-apply) · ไม่มี = ธนาคารนั้นไม่ส่ง/อ่านไม่ได้
   */
  transAt?: string;
  /** SlipOK บอกว่าสลิปใบนี้เคยถูกตรวจกับร้านไปแล้ว (log=true) — ใบเดิมถูกเวียนมาใช้ซ้ำ */
  duplicate?: boolean;
  /**
   * ตรวจซ้ำไม่ช่วย — ตัวรูปสลิปเองตรวจอัตโนมัติไม่ได้ (เช่น 1007 ไม่มี QR Code: สลิป K BIZ/บัญชีนิติบุคคล ภาพครอป/แคปหน้าจอ)
   * หลังบ้านซ่อนปุ่ม "ตรวจสลิปอีกครั้ง" + คำแนะนำ "รอ 2 นาที" แล้วบอกให้เทียบยอดเองเลย
   */
  noRetry?: boolean;
  /** ส่วนต่างที่ระบบรู้จัก (หัก ณ ที่จ่าย 1%/3% หรือค่าธรรมเนียมโอน) — มีค่า = โอนน้อยกว่ายอดแต่ถือว่าจ่ายครบ */
  deduction?: SlipDeduction;
  /**
   * SlipOK ยืนยันแล้วว่า "สลิปแท้ เงินเข้าบัญชีร้านจริง" (แม้ยอดจะไม่ตรง) — fail ที่มีธงนี้ + amount
   * = โอนขาด → ระบบนับยอดที่เข้าจริงเป็น "รับบางส่วน" ได้ (ดู slip-apply.ts) · ไม่มีธง = ตรวจไม่ได้/ระบบล่ม ห้ามนับ
   */
  genuine?: boolean;
  /**
   * 🕰️ SlipOK ตอบว่า "สลิปซ้ำ" (1012) แต่ส่งข้อมูลสลิปมาครบ — นี่คือผลตัดสินตามกติกาปกติของข้อมูลชุดนั้น
   * ใช้กับเคสรอบก่อน "ตอบช้าจนเราตัดสาย" แล้ว SlipOK ตรวจเสร็จทีหลังและจำสลิปไว้ (log=true)
   * ฝั่ง slip-apply จะเช็คก่อนว่าเลขอ้างอิงนี้ไม่มีออเดอร์/ใบอื่นถือครอง (= ซ้ำกับตัวเอง ไม่ใช่ลูกค้าเวียนสลิป)
   * แล้วจึงใช้ผลนี้แทน — ไม่งั้นกด "ตรวจสลิปอีกครั้ง" กี่รอบก็ตัน
   */
  selfJudged?: SlipVerifyResult;
  /** 🏦 ผู้รับเงินบนสลิปที่ SlipOK อ่านได้ (ชื่อมักถูกตัดสั้น เช่น "บจก. ท") — เก็บไว้ตรวจย้อนหลัง */
  receiver?: string;
  /** 🏦 เลขบัญชี/พร้อมเพย์ผู้รับแบบปิดบางส่วน (เช่น xxx-x-x5332-x) — ตัวที่ใช้เทียบกับบัญชีร้านจริง */
  receiverAccount?: string;
  /**
   * 🚫 สลิปโอนเข้าบัญชีที่ "ไม่ใช่ของร้าน" — เงินไม่ได้เข้าร้านเลย ห้ามนับยอด/ยืนยัน/รับบางส่วน (จงใจไม่ใส่ genuine)
   * เคสต้นเรื่อง OD-260922-2240 (22 ก.ย. 69) ดู matchSlipReceiver
   */
  wrongReceiver?: boolean;
}

/** บัญชีรับเงินของร้าน (ตั้งใน /admin/payment · แถว __shop_payment__) ที่สลิปต้องโอนเข้า */
export interface ShopReceiverAccounts {
  banks?: { bank?: string; accountNo?: string; accountName?: string }[];
  promptpay?: string;
  promptpayName?: string;
  /** อ่านตั้งค่าร้านจากฐานไม่ได้ — เทียบผู้รับไม่ได้ ต้องตกไปตรวจมือ (fail-safe) ไม่ใช่ปล่อยผ่านเหมือนไม่ได้ตั้ง */
  unavailable?: boolean;
}

/** ผู้รับเงินที่ SlipOK อ่านจากสลิป — เลขบัญชีปิดบางส่วนตามรูปแบบสลิปธนาคาร (xxx-x-x5332-x) · พร้อมเพย์อยู่ที่ proxy (086xxx0000) */
export interface SlipReceiver {
  displayName?: string;
  name?: string;
  account?: { type?: string; value?: string };
  proxy?: { type?: string; value?: string };
}

const digitsOf = (s: string) => s.replace(/\D/g, "");

/**
 * ทาบเลขปิดบางส่วนจากสลิป (xxx-x-x5332-x · 086xxx0000) กับเลขเต็มของร้าน (027-8-75332-8)
 * ความยาวเท่ากัน = เทียบตำแหน่งต่อตำแหน่ง (x = อะไรก็ได้) · ความยาวต่างกัน (ธนาคารต่างรูปแบบ/ตัดหลักหน้า)
 * = ทุกช่วงตัวเลขที่มองเห็นต้องอยู่ในเลขจริง และต้องมีอย่างน้อยหนึ่งช่วงยาว ≥ 3 หลัก (กันช่วงสั้น ๆ บังเอิญตรง)
 */
export function maskedNumberMatches(masked: string, full: string): boolean {
  const m = masked.replace(/[^0-9xX]/g, "").toLowerCase();
  const f = digitsOf(full);
  if (!m || !f || !/\d/.test(m)) return false;
  if (m.length === f.length) return [...m].every((c, i) => c === "x" || c === f[i]);
  const runs = m.split(/x+/).filter(Boolean);
  return runs.some((r) => r.length >= 3) && runs.every((r) => f.includes(r));
}

/** ตัดคำนำหน้านิติบุคคล/ช่องว่าง/เครื่องหมาย ให้เหลือแต่ตัวชื่อ — "บจก. ทีพีดิจิตอล" → "ทีพีดิจิตอล" */
const normName = (s: string) =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/ห้างหุ้นส่วนจำกัด|บริษัท|หจก|บจก|จำกัด|มหาชน/g, "")
    .replace(/\b(company|limited|partnership|ltd|part|co|inc)\b/g, "")
    .replace(/[\s.,()'"\-]/g, "");

/**
 * ทางสำรองตอนไม่มีเลขบัญชีให้เทียบ: ชื่อบนสลิปมักถูกตัดสั้น ("บจก. ท" · "TPDIGITAL C") จึงเทียบแบบ "ขึ้นต้นเหมือนกัน"
 * ⚠️ อ่อนกว่าเลขบัญชีมาก — ห้ามใช้เป็นด่านหลัก
 */
export function receiverNameMatches(slipName: string | undefined, shopName: string | undefined): boolean {
  const a = normName(slipName ?? "");
  const b = normName(shopName ?? "");
  return !!a && !!b && (b.startsWith(a) || a.startsWith(b));
}

/** ข้อความผู้รับไว้โชว์/บันทึก — "บจก. ท xxx-x-x5332-x" */
export function receiverLabel(r?: SlipReceiver): string {
  const name = (r?.displayName || r?.name || "").trim();
  const acct = (r?.account?.value || r?.proxy?.value || "").trim();
  return [name, acct].filter(Boolean).join(" ");
}

/**
 * 🏦 สลิปใบนี้โอนเข้า "บัญชีร้าน" จริงไหม
 *
 * เคสต้นเรื่อง OD-260922-2240 (22 ก.ย. 69): ลูกค้าแนบสลิปที่โอนให้ หจก. เอดีมีเดีย (xxx-x-x8919-x · memo "มัดจำงาน ad media")
 * SlipOK ตอบว่าสลิปแท้ ยอด 1,300 ≥ 750 → ระบบผ่านให้อัตโนมัติ ยืนยันเงินเข้า ปริ้นใบงาน แพ็ค ทั้งที่เงินไม่ได้เข้าร้านเลย
 * เพราะ judge() เทียบแต่ยอด — ชื่อผู้รับที่ SlipOK ส่งมาถูกเก็บเป็นข้อความโชว์เฉย ๆ ไม่เคยเอามาตัดสิน
 *
 * เทียบด้วย "เลขบัญชี" เป็นหลัก (receiver.account.value / proxy.value) ทาบกับบัญชี/พร้อมเพย์ร้านทุกบัญชี
 * ⚠️ ห้ามใช้ชื่อเป็นหลัก — SlipOK ตัดชื่อสั้นจนใช้ไม่ได้ ("บจก. ท" 256 ใบ · "TPDIGITAL C" 27 ใบ จากการสแกน 24 ก.ย. 69)
 *    ใช้ชื่อเป็นทางสำรองเฉพาะตอน SlipOK ไม่ส่งเลขบัญชี/พร้อมเพย์มาเลย
 *
 *   match        = โอนเข้าบัญชีร้าน
 *   mismatch     = โอนเข้าบัญชีอื่น (หรือบัญชีใหม่ของร้านที่ยังไม่ได้เพิ่มใน /admin/payment)
 *   noReceiver   = SlipOK ไม่ส่งข้อมูลผู้รับมา — ตัดสินไม่ได้ ต้องตรวจมือ
 *   unconfigured = ร้านยังไม่ตั้งบัญชีไว้ให้เทียบ — ข้ามด่านนี้ (กติกาเดิม)
 */
export function matchSlipReceiver(
  receiver: SlipReceiver | undefined,
  shop: ShopReceiverAccounts | undefined
): "match" | "mismatch" | "noReceiver" | "unconfigured" {
  if (shop?.unavailable) return "noReceiver";
  const banks = (shop?.banks ?? []).filter((b) => digitsOf(b.accountNo ?? "").length >= 4);
  const pp = digitsOf(shop?.promptpay ?? "");
  if (!banks.length && !pp) return "unconfigured";
  const acct = (receiver?.account?.value ?? "").trim();
  const proxy = (receiver?.proxy?.value ?? "").trim();
  const numbers = [acct, proxy].filter((v) => /\d/.test(v));
  if (numbers.length) {
    const ok = numbers.some((v) => banks.some((b) => maskedNumberMatches(v, b.accountNo!)) || (!!pp && maskedNumberMatches(v, pp)));
    return ok ? "match" : "mismatch";
  }
  const names = [receiver?.displayName, receiver?.name].filter((n): n is string => !!n?.trim());
  if (names.length) {
    const ok = names.some((n) => banks.some((b) => receiverNameMatches(n, b.accountName)) || receiverNameMatches(n, shop?.promptpayName));
    return ok ? "match" : "mismatch";
  }
  return "noReceiver";
}

/** "กสิกร 027-8-75332-8" — ไว้บอกแอดมินว่าบัญชีร้านที่ระบบรู้จักคืออะไร */
function shopAccountsLabel(shop: ShopReceiverAccounts | undefined): string {
  const parts = (shop?.banks ?? []).filter((b) => b.accountNo?.trim()).map((b) => [b.bank, b.accountNo].filter(Boolean).join(" "));
  if (shop?.promptpay?.trim()) parts.push(`พร้อมเพย์ ${shop.promptpay.trim()}`);
  return parts.join(" / ");
}

/** ส่วนต่างระหว่างยอดที่ต้องโอนกับยอดในสลิป ที่ระบบยอมรับได้ */
export interface SlipDeduction {
  /** wht = หัก ณ ที่จ่าย (ลูกค้านิติบุคคล — ต้องตามใบ 50 ทวิ) · bankFee = ธนาคารหักค่าธรรมเนียมโอน · earlyPay = ส่วนลดโอนไวของร้าน */
  kind: "wht" | "bankFee" | "earlyPay";
  /** อัตราหัก ณ ที่จ่าย (1 หรือ 3) — เฉพาะ kind = wht */
  rate?: number;
  /** จำนวนเงินที่หายไป (ยอดที่ต้องโอน − ยอดในสลิป) */
  amount: number;
  /** คำอธิบายสำหรับประวัติ/หน้าแอดมิน เช่น "หัก ณ ที่จ่าย 3% ของยอดทั้งออเดอร์" */
  label: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** ค่าธรรมเนียมโอนที่ธนาคารไทยหักจริง (โอนต่างธนาคารผ่านสาขา/ATM/บริการพิเศษ) */
const BANK_FEES = [5, 8, 10, 15, 20, 25, 30, 35];

/**
 * ⏱️ เพดานเวลารอ SlipOK ตอบ
 *
 * 21 ก.ย. 69: SlipOK ตอบช้าผิดปกติทั้งวัน (ปกติ 3 วินาที วันนั้น 16-22 วินาที) เพดานเดิม 20 วินาทีเลยตัดสายทิ้ง
 * 4 ใบ (OD-260921-5265 · OD-260918-6523 · OD-260921-1147 · OD-260921-7358 — วัดได้ 20.1 / 21.8 / 20.1 วินาทีเป๊ะ)
 * ทั้งที่ SlipOK ตรวจเสร็จจริงทีหลัง ออเดอร์เลยค้าง "รอตรวจสอบ" แบบไม่มีร่องรอยอะไรเลย
 *
 * ⚠️ ห้ามตั้งสูงกว่านี้มาก: serverless function มีเพดานเวลาของมันเอง — เกินแล้วฟังก์ชันถูกฆ่ากลางทาง
 * ไฟล์ขึ้นบัคเก็ตไปแล้วแต่ออเดอร์ไม่ถูกบันทึก (แย่กว่าเดิม) · ตาข่ายจริงของเคสช้าคือปุ่ม "🔄 ตรวจสลิปอีกครั้ง"
 * ที่กู้ผลจากคำตอบ "สลิปซ้ำ" ของรอบก่อนได้ (ดู selfJudged)
 */
const SLIPOK_TIMEOUT_MS = 30_000;

/**
 * เทียบยอดในสลิปกับยอดที่ต้องโอน แบบรู้เรื่องภาษี/ค่าธรรมเนียม:
 *   1. ตรงเป๊ะ (หรือโอนเกิน) → ผ่าน
 *   2. ขาดเท่ากับหัก ณ ที่จ่าย 1% / 3% → ผ่าน (คิดทั้งฐานยอดงวดนี้, ยอดทั้งออเดอร์ และฐานก่อน VAT 7%)
 *      — ลูกค้าบริษัทบางเจ้าหักภาษีของทั้งบิลตั้งแต่งวดมัดจำ เลยต้องเช็คฐานยอดรวมด้วย
 *   3. ขาดเท่ากับค่าธรรมเนียมโอนของธนาคาร (5–35 บาท) → ผ่าน
 * นอกเหนือจากนี้ = ยอดไม่ตรง ให้ตกไปตรวจมือ
 */
export function matchSlipAmount(
  expected: number,
  actual: number,
  orderTotal?: number,
  /** ยอดหัก ณ ที่จ่ายที่แอดมินตั้งไว้ในออเดอร์ (order.wht) — แอดมินแก้ตัวเลขตามใบ 50 ทวิได้ เลยต้องยอมรับยอดนี้ตรง ๆ ด้วย */
  adminWht?: { rate: number; amount: number },
  /**
   * ⚡ ส่วนลดโอนไวที่ออเดอร์นี้ "ยังไม่ได้หัก" (บาท) — 0/ไม่ส่ง = ไม่ยอมรับส่วนต่างนี้
   * ออเดอร์ใหม่หักให้ตั้งแต่หน้า checkout แล้ว (ยอดที่ต้องโอนลดไปแล้ว) เลยต้องส่ง 0 มา
   * ไม่งั้นลูกค้าหักซ้ำได้อีกรอบ · ที่ยังต้องมีทางนี้เพราะออเดอร์เก่า/ลูกค้าที่รู้โปรจากไลน์แล้วโอนน้อยกว่ายอดในเว็บ
   */
  earlyPayAllowed?: number
): { ok: boolean; deduction?: SlipDeduction } {
  if (!(expected > 0)) return { ok: true };
  if (!(actual > 0)) return { ok: false };
  const diff = round2(expected - actual);
  // จ่ายครบ/จ่ายเกิน (เผื่อเศษสตางค์จากการปัด)
  if (diff <= 0.5) return { ok: true };

  // ── ขาดเท่ายอดหักที่แอดมินตั้งไว้ (เผื่อ ±1 บาท) — ครอบคลุมฐานพิเศษที่สูตรมาตรฐานเดาไม่ถูก ──
  if (adminWht && adminWht.amount > 0 && Math.abs(diff - adminWht.amount) <= 1)
    return {
      ok: true,
      deduction: { kind: "wht", rate: adminWht.rate, amount: diff, label: `หัก ณ ที่จ่าย ${adminWht.rate}% (ตามที่ตั้งไว้ในออเดอร์)` },
    };

  // ── ส่วนลดโอนไวของร้าน (5/10 บาท) — ต้องตรงเป๊ะ ──
  // เช็คก่อนหัก ณ ที่จ่ายและค่าธรรมเนียมโอน เพราะ 5/10 ไปตรงกับทั้งสองอย่างพอดี
  // (ค่าธรรมเนียมโอน 5/10 บาท และ 1% ของบิล 500/1,000) — ลูกค้าทั่วไปคือ "โอนไว" ไม่ใช่สองอันนั้น
  // ลูกค้านิติบุคคลที่หักภาษีจริงจะมี order.wht ตั้งไว้ ซึ่งถูกจับไปตั้งแต่ด่านบนแล้ว
  if (earlyPayAllowed && earlyPayAllowed > 0 && Math.abs(diff - earlyPayAllowed) <= 0.01)
    return { ok: true, deduction: { kind: "earlyPay", amount: diff, label: "ส่วนลดโอนไวของร้าน" } };

  // ── หัก ณ ที่จ่าย — นักบัญชีมักปัดเป็นบาทถ้วน เผื่อคลาดเคลื่อน ±1 บาท ──
  const bases: { amount: number; suffix: string }[] = [{ amount: expected, suffix: "ของยอดงวดนี้" }];
  if (orderTotal && orderTotal > expected + 0.5) bases.push({ amount: orderTotal, suffix: "ของยอดทั้งออเดอร์" });
  let best: { deduction: SlipDeduction; gap: number } | null = null;
  for (const rate of [3, 1]) {
    for (const base of bases) {
      for (const [whtBase, vatNote] of [
        [base.amount, ""],
        [base.amount / 1.07, " (ฐานก่อน VAT)"],
      ] as [number, string][]) {
        const wht = round2((whtBase * rate) / 100);
        const gap = Math.abs(diff - wht);
        if (gap <= 1 && (!best || gap < best.gap))
          best = {
            gap,
            deduction: { kind: "wht", rate, amount: diff, label: `หัก ณ ที่จ่าย ${rate}% ${base.suffix}${vatNote}` },
          };
      }
    }
  }
  if (best) return { ok: true, deduction: best.deduction };

  // ── ค่าธรรมเนียมโอนของธนาคาร — ต้องตรงกับค่าธรรมเนียมจริงเท่านั้น (กันโอนขาดมั่ว ๆ แล้วหลุดผ่าน) ──
  if (BANK_FEES.some((fee) => Math.abs(diff - fee) <= 0.01))
    return { ok: true, deduction: { kind: "bankFee", amount: diff, label: "ธนาคารหักค่าธรรมเนียมการโอน" } };

  return { ok: false };
}

export const slipokConfigured = (): boolean => !!(process.env.SLIPOK_API_KEY && process.env.SLIPOK_BRANCH_ID);

export async function verifySlipWithSlipOK(
  bytes: Uint8Array,
  contentType: string,
  expectedAmount: number,
  /** ยอดรวมทั้งออเดอร์ — ใช้เช็คหัก ณ ที่จ่ายที่ลูกค้าคิดจากทั้งบิลตั้งแต่งวดมัดจำ */
  orderTotalAmount?: number,
  /** ยอดหัก ณ ที่จ่ายที่แอดมินตั้งไว้ในออเดอร์ (order.wht) */
  adminWht?: { rate: number; amount: number },
  /** ⚡ ส่วนลดโอนไวที่ออเดอร์นี้ยังไม่ได้หัก (บาท) — ดู matchSlipAmount */
  earlyPayAllowed?: number,
  /** 🏦 บัญชีร้านสำหรับเทียบผู้รับบนสลิป — ไม่ส่ง/ยังไม่ตั้ง = ข้ามด่านผู้รับ (ดู matchSlipReceiver) */
  shop?: ShopReceiverAccounts
): Promise<SlipVerifyResult> {
  const key = process.env.SLIPOK_API_KEY;
  const branch = process.env.SLIPOK_BRANCH_ID;
  if (!key || !branch) return { status: "skip", detail: "ยังไม่ได้ตั้งค่า SlipOK" };

  // ตัดสินจากผู้รับ + ยอดในสลิป (ใช้ทั้งเส้นทางจริงและโหมดทดสอบ — กติกาเดียวกันเป๊ะ)
  const judge = (slipAmount: number | undefined, transRef: string | undefined, receiver: SlipReceiver | undefined, transAt?: string): SlipVerifyResult => {
    const rl = receiverLabel(receiver);
    const who = {
      transRef,
      transAt,
      ...(receiver?.displayName || receiver?.name ? { receiver: (receiver.displayName || receiver.name)!.trim() } : {}),
      ...(receiver?.account?.value || receiver?.proxy?.value ? { receiverAccount: (receiver.account?.value || receiver.proxy?.value)!.trim() } : {}),
    };
    /**
     * 🏦 ด่านแรก: เงินต้องเข้า "บัญชีร้าน" — ก่อนจะคุยเรื่องยอด (OD-260922-2240: สลิปโอนให้ หจก. เอดีมีเดีย ผ่านเพราะยอดพอ)
     * โอนเข้าบัญชีอื่น = ไม่ใส่ genuine → slip-apply จะไม่นับบางส่วน/ไม่คิดภาษีใหม่/ไม่คืนส่วนลดให้ · noRetry เพราะตรวจซ้ำก็ผู้รับเดิม
     */
    const where = matchSlipReceiver(receiver, shop);
    if (where === "mismatch")
      return {
        status: "fail",
        ...who,
        amount: slipAmount,
        wrongReceiver: true,
        noRetry: true,
        detail: `สลิปนี้โอนเข้าบัญชี "${rl || "ไม่ทราบชื่อ"}" ไม่ใช่บัญชีร้าน (${shopAccountsLabel(shop) || "ยังไม่ตั้งบัญชีร้าน"}) — เงินไม่ได้เข้าร้าน ห้ามยืนยันเงินเข้า · ถ้าร้านเพิ่งเปิดบัญชีใหม่ ให้เพิ่มใน 🏦 บัญชี/ชำระเงิน ก่อนแล้วให้ลูกค้าแนบสลิปใหม่`,
      };
    if (where === "noReceiver")
      return {
        status: "fail",
        ...who,
        amount: slipAmount,
        detail: shop?.unavailable
          ? "อ่านบัญชีร้านจากฐานไม่ได้ จึงเทียบผู้รับบนสลิปไม่ได้ — กรุณาเปิดสลิปเทียบผู้รับ ยอด และวันเวลาโอนเอง"
          : "SlipOK ไม่ส่งข้อมูลผู้รับมา จึงยืนยันไม่ได้ว่าโอนเข้าบัญชีร้าน — กรุณาเปิดสลิปเทียบผู้รับ ยอด และวันเวลาโอนเอง",
      };
    const receiverText = rl ? `ผู้รับ: ${rl}` : undefined;
    if (expectedAmount > 0) {
      if (!slipAmount) return { status: "fail", ...who, genuine: true, detail: "สลิปแท้แต่อ่านยอดเงินไม่ได้ — รอแอดมินเทียบยอดเอง" };
      const m = matchSlipAmount(expectedAmount, slipAmount, orderTotalAmount, adminWht, earlyPayAllowed);
      if (!m.ok)
        return {
          status: "fail",
          amount: slipAmount,
          ...who,
          genuine: true,
          detail: `ยอดในสลิป ${slipAmount.toLocaleString("th-TH")} บาท ไม่ตรงกับยอดที่ต้องชำระ ${expectedAmount.toLocaleString("th-TH")} บาท (ขาด ${(expectedAmount - slipAmount).toLocaleString("th-TH")} บาท)`,
        };
      return { status: "pass", amount: slipAmount, ...who, genuine: true, detail: receiverText, deduction: m.deduction };
    }
    return { status: "pass", amount: slipAmount, ...who, genuine: true, detail: receiverText };
  };

  // ── โหมดทดสอบ (dev เท่านั้น): ตั้ง SLIPOK_MOCK=1 + ไฟล์สลิปที่ฝังข้อความ "MOCKSLIP:<ยอด>" ──
  // จำลองว่า SlipOK ตอบ "สลิปแท้" แล้วให้กติกาเทียบยอดของเราตัดสินตามจริง — ไม่ยิง API จริง
  // production ปลอดภัยสองชั้น: Netlify ไม่ตั้ง SLIPOK_MOCK และ NODE_ENV เป็น production
  // "MOCKSLIP:<ยอด>:<REF>" = กำหนดเลขอ้างอิงเอง (ทดสอบกันสลิปซ้ำข้ามออเดอร์ที่ไฟล์ต่างกันแต่ธุรกรรมเดียวกัน)
  // "MOCKSLIP:<ยอด>:<REF>:<ISO เวลาโอน>" = จำลองเวลาโอนบนสลิป (ทดสอบโอนทันแต่แนบช้า)
  if (process.env.SLIPOK_MOCK === "1" && process.env.NODE_ENV !== "production") {
    const marker = /MOCKSLIP:([0-9.]+)(?::([A-Z0-9-]{4,40}))?(?::(\d{4}-\d{2}-\d{2}T[0-9:.]+Z))?/.exec(new TextDecoder().decode(bytes.subarray(0, 2048)));
    // ผู้รับจำลอง = บัญชีแรกของร้าน (ให้ด่านผู้รับผ่าน) · "MOCKSLIP:…:WRONGACCT" ท้ายสุด = จำลองโอนเข้าบัญชีคนอื่น
    const wrongAcct = /MOCKSLIP:[^\s]*:WRONGACCT/.test(new TextDecoder().decode(bytes.subarray(0, 2048)));
    const mockReceiver: SlipReceiver = wrongAcct
      ? { displayName: "บัญชีคนอื่น (SLIPOK_MOCK)", account: { type: "BANKAC", value: "xxx-x-x0000-x" } }
      : { displayName: "บัญชีทดสอบ (SLIPOK_MOCK)", account: { type: "BANKAC", value: shop?.banks?.[0]?.accountNo ?? "" } };
    if (marker)
      return judge(Number(marker[1]) || undefined, marker[2] || `MOCK-${Date.now().toString(36).toUpperCase()}`, mockReceiver, marker[3] || undefined);
  }

  try {
    const fd = new FormData();
    const ext = contentType.split("/")[1] || "jpg";
    fd.append("files", new Blob([bytes as BlobPart], { type: contentType }), `slip.${ext}`);
    // ⚠️ ไม่ส่ง amount ให้ SlipOK เทียบแล้ว — SlipOK เทียบได้แต่ตรงเป๊ะ
    // เราอ่านยอดจากสลิปมาเทียบเองด้วย matchSlipAmount (รู้เรื่องหัก ณ ที่จ่าย 1%/3% + ค่าธรรมเนียมโอน)
    // log=true ให้ SlipOK จำสลิปไว้ — เจอสลิปใบเดิมซ้ำจะตีตก (กันเอาสลิปเก่ามาเวียน)
    fd.append("log", "true");

    const res = await fetch(`https://api.slipok.com/api/line/apikey/${branch}`, {
      method: "POST",
      headers: { "x-authorization": key },
      body: fd,
      signal: AbortSignal.timeout(SLIPOK_TIMEOUT_MS),
    });
    const j = (await res.json().catch(() => null)) as
      | {
          success?: boolean;
          message?: string;
          code?: number;
          data?: {
            success?: boolean;
            message?: string;
            amount?: number;
            transRef?: string;
            transTimestamp?: string;
            transDate?: string;
            transTime?: string;
            receiver?: SlipReceiver;
          };
        }
      | null;

    // ผ่าน = HTTP 2xx และไม่มีธง success เป็น false ที่ชั้นไหนเลย
    // (SlipOK บางเวอร์ชันไม่ส่ง j.success ระดับบน — อย่าตีตกเพราะฟิลด์ที่ไม่มี)
    if (res.ok && j && j.success !== false && j.data?.success !== false) {
      // ── สลิปแท้แล้ว — เทียบยอดเองต่อ (ยอดต้องเข้าเงื่อนไขด้วย) ──
      return judge(Number(j.data?.amount) || undefined, j.data?.transRef, j.data?.receiver, parseSlipTransAt(j.data));
    }
    // ปัญหาฝั่งร้าน (คีย์/สาขาผิด, แพ็กเกจ/โควตาหมด — SlipOK code 1000-1005) ไม่ใช่สลิปลูกค้า → ตกไปตรวจมือเงียบ ๆ
    const code = Number(j?.code);
    if (res.status === 401 || res.status === 403 || (code >= 1000 && code <= 1005))
      return { status: "skip", detail: `SlipOK ตั้งค่าไม่ถูกต้อง/ใช้งานไม่ได้ (${j?.message ?? res.status})` };
    // ── code 1010: SlipOK ตรวจกับธนาคารไม่ได้ (เจอกับทุกธนาคาร ไม่ใช่แค่ SCB — 8 ก.ย. 69 กรุงเทพ→กสิกร ก็โดน) ──
    //    แอดมินกด "ตรวจสลิปอีกครั้ง" ยิงไฟล์เดิมซ้ำได้ที่ /api/admin/orders/slip/recheck
    // ⚠️ ข้อความจาก SlipOK เขียนว่า "กรุณารอประมาณ 2 นาที" ซึ่งจริงแค่ครึ่งเดียว
    //    เจอทั้งกรณีเพิ่งโอนไม่ถึง 2 นาที และกรณี "สลิปเก่า" ที่ SCB ไม่ให้ตรวจย้อนหลังแล้ว
    //    (OD-260904-5811 · 4 ก.ย. 69 แนบสลิปลงวันที่ 8 มิ.ย. 69 — ยิงซ้ำอีก 3 เดือนให้หลังก็ยังได้ 1010)
    //    ถ้าปล่อยข้อความเดิมไปขึ้นหลังบ้าน แอดมินจะเข้าใจว่า "รอแป๊บเดียวเดี๋ยวผ่านเอง" แล้วทิ้งออเดอร์ค้าง
    //    จึงเขียนเหตุผลใหม่ให้บอกทั้งสองทาง + สั่งงานชัดว่าให้ตรวจยอดกับวันเวลาในสลิปเอง
    if (code === 1010)
      return {
        status: "fail",
        detail:
          "ธนาคารยังไม่ส่งข้อมูลรายการนี้มาให้ตรวจ — มักเพราะลูกค้าแนบสลิปเร็วกว่า 2 นาทีหลังโอน (รอสักครู่แล้วกด \"ตรวจสลิปอีกครั้ง\") หรือเป็นสลิปเก่าที่เลยกรอบเวลาให้ตรวจย้อนหลัง · ถ้ายังไม่ผ่านกรุณาเปิดสลิปเทียบยอดและวันเวลาโอนเอง",
      };
    // ── code 1007: รูปไม่มี QR Code — SlipOK อ่านสลิปจาก QR เท่านั้น ตรวจซ้ำกี่รอบก็ไม่ผ่าน ──
    //    เจอบ่อยกับสลิป K BIZ (บัญชีนิติบุคคลกสิกร — ไม่มี QR มาแต่แรก · OD-260910-4407 ลูกค้าหัก ณ ที่จ่าย 3% โอน 3,182.40 ตรงยอดโอนจริง
    //    แต่แอดมินเข้าใจว่าตกเพราะหัก ณ ที่จ่าย) รวมถึงภาพครอปตัด QR ทิ้ง/แคปหน้าจอไม่ครบ
    //    → บอกเหตุผลจริง + ยอดที่ต้องเทียบเอง (คิดหัก ณ ที่จ่ายของแอดมินให้แล้ว) และธง noRetry ให้หลังบ้านซ่อนปุ่มตรวจซ้ำ
    if (code === 1007) {
      const netExpected = adminWht && adminWht.amount > 0 ? Math.max(0, expectedAmount - adminWht.amount) : expectedAmount;
      const cmp =
        expectedAmount > 0
          ? ` · ยอดที่ต้องเห็นในสลิป ${netExpected.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท${
              adminWht && adminWht.amount > 0 ? ` (หัก ณ ที่จ่าย ${adminWht.rate}% แล้ว — ตามใบ 50 ทวิ)` : ""
            }`
          : "";
      return {
        status: "fail",
        noRetry: true,
        detail: `รูปสลิปไม่มี QR Code ให้ตรวจ (สลิป K BIZ/บัญชีนิติบุคคล หรือภาพครอป/แคปหน้าจอ) — SlipOK ตรวจไม่ได้ กดตรวจซ้ำไม่ช่วย กรุณาเปิดสลิปเทียบยอด ผู้รับ และวันเวลาโอนเอง${cmp}`,
      };
    }
    // ── สลิปซ้ำ: SlipOK จำสลิปที่เคยตรวจไว้ (log=true) — เจอใบเดิมอีกรอบจะตอบว่าซ้ำ ──
    // (ชั้นแรกของเรากันด้วยลายนิ้วมือไฟล์/เลขอ้างอิงในฐานข้อมูลก่อนแล้ว — มาถึงตรงนี้ได้คือสลิปที่เคยตรวจ
    //  ก่อนมีระบบจำ หรือถูกลบออกจากออเดอร์ไปแล้ว) · code 1012 = "สลิปซ้ำ" ตามเอกสาร SlipOK
    const rawMsg = String(j?.data?.message || j?.message || "");
    if (code === 1012 || /ซ้ำ|duplicate|already/i.test(rawMsg))
      return {
        status: "fail",
        duplicate: true,
        transRef: j?.data?.transRef,
        detail: "สลิปใบนี้เคยถูกใช้แจ้งโอนกับทางร้านไปแล้ว (SlipOK จำได้) — ห้ามยืนยันจนกว่าจะหาออเดอร์ที่ใช้สลิปนี้ก่อนเจอ",
        /**
         * คำตอบ "สลิปซ้ำ" ของ SlipOK แนบข้อมูลสลิปมาครบ (ยอด/เลขอ้างอิง/เวลาโอน/ผู้รับ) — ตัดสินตามกติกาปกติไว้เลย
         * ให้ slip-apply เอาไปใช้ได้ "เฉพาะเมื่อ" เช็คแล้วว่าเลขอ้างอิงนี้ไม่มีออเดอร์/ใบอื่นถือครอง = ซ้ำกับตัวเอง
         * (รอบก่อนของใบนี้เองที่ SlipOK ตอบช้าจนเราตัดสาย แล้วมันตรวจเสร็จทีหลัง)
         */
        selfJudged: j?.data?.amount
          ? judge(Number(j.data.amount) || undefined, j.data.transRef, j.data.receiver, parseSlipTransAt(j.data))
          : undefined,
      };
    // เก็บคำตอบดิบย่อ ๆ ไว้ในเหตุผล — วินิจฉัยเคสแปลก ๆ ได้จากหลังบ้านเลย
    const msg = rawMsg || `ตรวจไม่ผ่าน`;
    const raw = JSON.stringify(j ?? {}).slice(0, 160);
    return { status: "fail", detail: `${String(msg).slice(0, 120)} (HTTP ${res.status} · ${raw})` };
  } catch (e) {
    /**
     * ⏱️ ตัดสายเพราะรอนานเกินเพดาน ≠ "ต่อไม่ติด" — SlipOK มักรับงานไปแล้วและตรวจเสร็จทีหลัง (จำสลิปไว้ด้วย log=true)
     * ต้องเขียนเหตุผลให้ต่างกัน ไม่งั้นแอดมินอ่านว่า "ระบบล่ม" แล้วไม่กดตรวจซ้ำ ทั้งที่ตรวจซ้ำได้ผลจริง (21 ก.ย. 69)
     */
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      status: "skip",
      detail: timedOut
        ? `SlipOK ไม่ตอบภายใน ${SLIPOK_TIMEOUT_MS / 1000} วินาที ระบบจึงตัดสาย — สลิปอาจถูกตรวจฝั่ง SlipOK ไปแล้ว กด "ตรวจสลิปอีกครั้ง" เพื่อดึงผลมาได้`
        : "เชื่อมต่อ SlipOK ไม่ได้",
    };
  }
}
