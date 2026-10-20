/**
 * 🧾 เลขประจำตัวผู้เสียภาษี (13 หลัก) — ล้างรูปแบบ + ตรวจความถูกต้อง
 *
 * ทำไม (พนักงานแจ้ง 20 ต.ค. 69 · OD-261020-1777): ช่องเลขผู้เสียภาษีในฟอร์มใบกำกับเป็นข้อความอิสระ ไม่ตรวจอะไรเลย
 * → พิมพ์เกิน/ขาดหลักก็บันทึกได้ · ลอกจากนามบัตร "099-4-00086751-4" ติดขีดมาด้วย → ไปโผล่ในใบเสร็จ/FlowAccount แบบนั้น
 */

/** เหลือแต่ตัวเลข: ตัดขีด/ช่องว่าง/จุด ทิ้ง · เลขไทย ๐-๙ แปลงเป็นอารบิก */
export function cleanTaxId(raw: string | undefined | null): string {
  return String(raw ?? "")
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
    .replace(/\D/g, "");
}

/** หลักสุดท้ายตามสูตรกรมสรรพากร (ถ่วงน้ำหนัก 13→2 แล้ว mod 11) */
function checkDigitOk(id: string): boolean {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

export type TaxIdCheck =
  | { ok: true; level: "empty" | "ok" }
  /** error = ห้ามบันทึก (จำนวนหลักไม่ใช่ 13) · warn = 13 หลักแต่หลักตรวจไม่ผ่าน (น่าจะพิมพ์ผิด 1 ตัว) ให้บันทึกได้ */
  | { ok: false; level: "error" | "warn"; message: string };

/** ตรวจเลขที่ล้างแล้ว (ใส่ค่าดิบมาก็ได้ — ล้างให้ก่อน) · ว่าง = ผ่าน (ช่องนี้ไม่บังคับ) */
export function checkTaxId(raw: string | undefined | null): TaxIdCheck {
  const id = cleanTaxId(raw);
  if (!id) return { ok: true, level: "empty" };
  if (id.length !== 13) {
    return {
      ok: false,
      level: "error",
      message: `เลขผู้เสียภาษีต้องมี 13 หลัก — ตอนนี้ ${id.length} หลัก (${id.length > 13 ? `เกิน ${id.length - 13}` : `ขาด ${13 - id.length}`}) ตรวจสอบอีกที`,
    };
  }
  if (!checkDigitOk(id)) {
    return { ok: false, level: "warn", message: "ครบ 13 หลักแต่หลักสุดท้ายไม่ตรงสูตร — อาจพิมพ์ผิด ตรวจกับเอกสารลูกค้าอีกที" };
  }
  return { ok: true, level: "ok" };
}
