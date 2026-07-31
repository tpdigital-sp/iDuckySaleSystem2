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
}

export const slipokConfigured = (): boolean => !!(process.env.SLIPOK_API_KEY && process.env.SLIPOK_BRANCH_ID);

export async function verifySlipWithSlipOK(
  bytes: Uint8Array,
  contentType: string,
  expectedAmount: number
): Promise<SlipVerifyResult> {
  const key = process.env.SLIPOK_API_KEY;
  const branch = process.env.SLIPOK_BRANCH_ID;
  if (!key || !branch) return { status: "skip", detail: "ยังไม่ได้ตั้งค่า SlipOK" };

  try {
    const fd = new FormData();
    const ext = contentType.split("/")[1] || "jpg";
    fd.append("files", new Blob([bytes as BlobPart], { type: contentType }), `slip.${ext}`);
    // ให้ SlipOK เทียบยอดกับที่ต้องโอน — ยอดไม่ตรง = ไม่ผ่าน
    if (expectedAmount > 0) fd.append("amount", String(expectedAmount));
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
      return {
        status: "pass",
        amount: Number(j.data?.amount) || undefined,
        transRef: j.data?.transRef,
        detail: j.data?.receiver?.displayName ? `ผู้รับ: ${j.data.receiver.displayName}` : undefined,
      };
    }
    // ปัญหาฝั่งร้าน (คีย์/สาขาผิด, แพ็กเกจ/โควตาหมด — SlipOK code 1000-1005) ไม่ใช่สลิปลูกค้า → ตกไปตรวจมือเงียบ ๆ
    const code = Number(j?.code);
    if (res.status === 401 || res.status === 403 || (code >= 1000 && code <= 1005))
      return { status: "skip", detail: `SlipOK ตั้งค่าไม่ถูกต้อง/ใช้งานไม่ได้ (${j?.message ?? res.status})` };
    // เก็บคำตอบดิบย่อ ๆ ไว้ในเหตุผล — วินิจฉัยเคสแปลก ๆ ได้จากหลังบ้านเลย
    const msg = j?.data?.message || j?.message || `ตรวจไม่ผ่าน`;
    const raw = JSON.stringify(j ?? {}).slice(0, 160);
    return { status: "fail", detail: `${String(msg).slice(0, 120)} (HTTP ${res.status} · ${raw})` };
  } catch {
    return { status: "skip", detail: "เชื่อมต่อ SlipOK ไม่ได้" };
  }
}
