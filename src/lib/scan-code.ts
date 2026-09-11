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
