import "server-only";

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
  /** ส่วนต่างที่ระบบรู้จัก (หัก ณ ที่จ่าย 1%/3% หรือค่าธรรมเนียมโอน) — มีค่า = โอนน้อยกว่ายอดแต่ถือว่าจ่ายครบ */
  deduction?: SlipDeduction;
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
  earlyPayAllowed?: number
): Promise<SlipVerifyResult> {
  const key = process.env.SLIPOK_API_KEY;
  const branch = process.env.SLIPOK_BRANCH_ID;
  if (!key || !branch) return { status: "skip", detail: "ยังไม่ได้ตั้งค่า SlipOK" };

  // ตัดสินจากยอดในสลิป (ใช้ทั้งเส้นทางจริงและโหมดทดสอบ — กติกาเดียวกันเป๊ะ)
  const judge = (slipAmount: number | undefined, transRef: string | undefined, receiver?: string): SlipVerifyResult => {
    if (expectedAmount > 0) {
      if (!slipAmount) return { status: "fail", transRef, detail: "สลิปแท้แต่อ่านยอดเงินไม่ได้ — รอแอดมินเทียบยอดเอง" };
      const m = matchSlipAmount(expectedAmount, slipAmount, orderTotalAmount, adminWht, earlyPayAllowed);
      if (!m.ok)
        return {
          status: "fail",
          amount: slipAmount,
          transRef,
          detail: `ยอดในสลิป ${slipAmount.toLocaleString("th-TH")} บาท ไม่ตรงกับยอดที่ต้องชำระ ${expectedAmount.toLocaleString("th-TH")} บาท (ขาด ${(expectedAmount - slipAmount).toLocaleString("th-TH")} บาท)`,
        };
      return { status: "pass", amount: slipAmount, transRef, detail: receiver, deduction: m.deduction };
    }
    return { status: "pass", amount: slipAmount, transRef, detail: receiver };
  };

  // ── โหมดทดสอบ (dev เท่านั้น): ตั้ง SLIPOK_MOCK=1 + ไฟล์สลิปที่ฝังข้อความ "MOCKSLIP:<ยอด>" ──
  // จำลองว่า SlipOK ตอบ "สลิปแท้" แล้วให้กติกาเทียบยอดของเราตัดสินตามจริง — ไม่ยิง API จริง
  // production ปลอดภัยสองชั้น: Netlify ไม่ตั้ง SLIPOK_MOCK และ NODE_ENV เป็น production
  if (process.env.SLIPOK_MOCK === "1" && process.env.NODE_ENV !== "production") {
    const marker = /MOCKSLIP:([0-9.]+)/.exec(new TextDecoder().decode(bytes.subarray(0, 2048)));
    if (marker)
      return judge(Number(marker[1]) || undefined, `MOCK-${Date.now().toString(36).toUpperCase()}`, "ผู้รับ: บัญชีทดสอบ (SLIPOK_MOCK)");
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
      signal: AbortSignal.timeout(20_000),
    });
    const j = (await res.json().catch(() => null)) as
      | { success?: boolean; message?: string; code?: number; data?: { success?: boolean; message?: string; amount?: number; transRef?: string; receiver?: { displayName?: string } } }
      | null;

    // ผ่าน = HTTP 2xx และไม่มีธง success เป็น false ที่ชั้นไหนเลย
    // (SlipOK บางเวอร์ชันไม่ส่ง j.success ระดับบน — อย่าตีตกเพราะฟิลด์ที่ไม่มี)
    if (res.ok && j && j.success !== false && j.data?.success !== false) {
      // ── สลิปแท้แล้ว — เทียบยอดเองต่อ (ยอดต้องเข้าเงื่อนไขด้วย) ──
      return judge(
        Number(j.data?.amount) || undefined,
        j.data?.transRef,
        j.data?.receiver?.displayName ? `ผู้รับ: ${j.data.receiver.displayName}` : undefined
      );
    }
    // ปัญหาฝั่งร้าน (คีย์/สาขาผิด, แพ็กเกจ/โควตาหมด — SlipOK code 1000-1005) ไม่ใช่สลิปลูกค้า → ตกไปตรวจมือเงียบ ๆ
    const code = Number(j?.code);
    if (res.status === 401 || res.status === 403 || (code >= 1000 && code <= 1005))
      return { status: "skip", detail: `SlipOK ตั้งค่าไม่ถูกต้อง/ใช้งานไม่ได้ (${j?.message ?? res.status})` };
    // ── code 1010: สลิป SCB ที่ SlipOK ตรวจกับธนาคารไม่ได้ ──
    // ⚠️ ข้อความจาก SlipOK เขียนว่า "กรุณารอประมาณ 2 นาที" ซึ่งจริงแค่ครึ่งเดียว
    //    เจอทั้งกรณีเพิ่งโอนไม่ถึง 2 นาที และกรณี "สลิปเก่า" ที่ SCB ไม่ให้ตรวจย้อนหลังแล้ว
    //    (OD-260904-5811 · 4 ก.ย. 69 แนบสลิปลงวันที่ 8 มิ.ย. 69 — ยิงซ้ำอีก 3 เดือนให้หลังก็ยังได้ 1010)
    //    ถ้าปล่อยข้อความเดิมไปขึ้นหลังบ้าน แอดมินจะเข้าใจว่า "รอแป๊บเดียวเดี๋ยวผ่านเอง" แล้วทิ้งออเดอร์ค้าง
    //    จึงเขียนเหตุผลใหม่ให้บอกทั้งสองทาง + สั่งงานชัดว่าให้ตรวจยอดกับวันเวลาในสลิปเอง
    if (code === 1010)
      return {
        status: "fail",
        detail:
          "ตรวจกับธนาคารไทยพาณิชย์ไม่สำเร็จ — สลิปเพิ่งโอนไม่ถึง 2 นาที หรือเป็นสลิปเก่าที่เลยกรอบเวลาที่ SCB ให้ตรวจย้อนหลัง · กรุณาเปิดสลิปเทียบยอดและวันเวลาโอนเอง",
      };
    // เก็บคำตอบดิบย่อ ๆ ไว้ในเหตุผล — วินิจฉัยเคสแปลก ๆ ได้จากหลังบ้านเลย
    const msg = j?.data?.message || j?.message || `ตรวจไม่ผ่าน`;
    const raw = JSON.stringify(j ?? {}).slice(0, 160);
    return { status: "fail", detail: `${String(msg).slice(0, 120)} (HTTP ${res.status} · ${raw})` };
  } catch {
    return { status: "skip", detail: "เชื่อมต่อ SlipOK ไม่ได้" };
  }
}
