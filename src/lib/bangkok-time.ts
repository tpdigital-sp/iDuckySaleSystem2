/**
 * เวลาไทยฝั่งเซิร์ฟเวอร์ — Netlify/serverless รันเป็น UTC · ข้อความวันที่ที่ "แช่" ลงออเดอร์/ใบเสนอราคา
 * และเลขเอกสาร OD-YYMMDD ต้องคิดจากโซนเวลาไทยเสมอ ไม่งั้นช้าไป 7 ชม. (และเลขวันผิดช่วงเที่ยงคืน-ตี 7)
 */
export const BKK_TZ = "Asia/Bangkok";

/** "8 ก.ย. 2569 15:44" ตามเวลาไทย (ใช้ทั้งเซิร์ฟเวอร์และเบราว์เซอร์ได้ผลเท่ากัน) */
export function thaiDateTime(d: Date = new Date()): string {
  return d.toLocaleString("th-TH", {
    timeZone: BKK_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** ปี/เดือน/วัน (ค.ศ.) ตามเวลาไทย — ไว้ประกอบเลขเอกสาร */
export function bkkParts(d: Date = new Date()): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: BKK_TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d)
    .reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

/** "YYMMDD" ค.ศ. 2 หลัก ตามเวลาไทย (OD-/QT-) · buddhist=true → พ.ศ. 2 หลัก (CL-/RV-) */
export function bkkYmd(d: Date = new Date(), buddhist = false): string {
  const p = bkkParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(p.y + (buddhist ? 543 : 0)).slice(-2)}${pad(p.m)}${pad(p.d)}`;
}
