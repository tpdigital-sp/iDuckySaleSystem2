/**
 * ตีความสิ่งที่สแกน/ยิงเข้ามา (เครื่องยิง USB หรือกล้องมือถือ)
 * รองรับทั้งโค้ดล้วน (OD-260722-8143) และลิงก์เต็ม (QR บนใบงานเป็น URL หน้าออเดอร์ ?pack=1)
 */
export function extractOrderId(raw: string): string {
  const v = raw.trim();
  const m = v.match(/OD-\d{6}-\d{4}/i);
  if (m) return m[0].toUpperCase();
  if (/^https?:\/\//i.test(v)) {
    const tail = v.split(/[?#]/)[0].split("/").filter(Boolean).pop();
    if (tail) return decodeURIComponent(tail);
  }
  return v;
}

/** ข้อความที่สแกนมาเป็นเลขออเดอร์ของระบบนี้ไหม (OD-YYMMDD-NNNN หรือลิงก์ที่ลงท้ายด้วยเลขนั้น) */
export function looksLikeOrderId(raw: string): boolean {
  return /^OD-\d{6}-\d{4}$/i.test(extractOrderId(raw));
}

/**
 * 🚫 ค่าที่ยิงมาเป็นเลขพัสดุไม่ได้ — คืนข้อความบอกเหตุ (null = ใช้ได้)
 * เคสจริง 25 ก.ย. 69 OD-260921-3212: คนแพ็คจ่อกล้องผิดจุด สแกน QR ใบงาน (ลิงก์ /admin/orders/…?pack=1)
 * ลงช่องเลขพัสดุรอบแบ่งส่ง → ลูกค้าได้การ์ดไลน์ "รอบที่ 2" ที่กล่องคัดลอกเป็นลิงก์หลังบ้านแทนเลขพัสดุ
 * ใช้ทั้งฝั่งจอ (ช่องหลัก/กล่องเพิ่ม/รอบแบ่งส่ง/หน้ายิง QR) และฝั่ง API (กันเครื่องยิง USB + ทุกทางเขียน)
 */
export function trackingScanProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (looksLikeOrderId(v)) return `นี่คือ QR ใบงาน/เลขออเดอร์ (${extractOrderId(v)}) ไม่ใช่เลขพัสดุ — จ่อบาร์โค้ดบนใบปะหน้าพัสดุ`;
  if (/^https?:\/\//i.test(v) || /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(v)) return "ที่สแกนเป็นลิงก์เว็บ ไม่ใช่เลขพัสดุ — จ่อบาร์โค้ดบนใบปะหน้าพัสดุ";
  // 📮 เจ้าของร้านสั่ง 28 ก.ย. 69: เลขพัสดุต้อง 13 หลัก ลงท้าย TH (ไปรษณีย์ไทย — เลขจริงทั้งร้าน 107/107 เป็นแบบนี้)
  if (!THAI_POST_TRACKING.test(v)) return `เลขพัสดุต้องเป็น 13 หลัก ลงท้ายด้วย TH เช่น EQ226634655TH — ที่ได้มา: ${v.length > 30 ? `${v.slice(0, 30)}…` : v}`;
  return null;
}

/** รูปแบบเลขพัสดุไปรษณีย์ไทย: ตัวอักษร 2 + ตัวเลข 9 + TH (13 ตัว) */
export const THAI_POST_TRACKING = /^[A-Z]{2}\d{9}TH$/i;
