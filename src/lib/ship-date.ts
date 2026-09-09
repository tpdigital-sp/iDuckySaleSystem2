/**
 * 📅 คำนวณ "วันที่จัดส่ง (จาก–ถึง)" ให้เองจากวันที่ลูกค้าต้องใช้งาน
 *
 * กติกาของร้าน:
 *  - ของต้องถึงมือลูกค้าก่อนวันใช้งาน 1–2 วัน (ไม่ส่งวันใช้งานเอง)
 *  - บริษัทส่งของเฉพาะวันทำการ จันทร์–ศุกร์ · เสาร์-อาทิตย์และวันหยุดนักขัตฤกษ์ไม่ส่ง
 *  → "ถึง" = วันทำการสุดท้ายก่อนวันใช้งาน · "จาก" = วันทำการก่อนหน้านั้นอีก 1 วัน
 *    เช่น ใช้งานจันทร์ 14 ก.ย. 69 → ส่ง พฤ 10 – ศ 11 ก.ย. (อาทิตย์ 13 / เสาร์ 12 ข้าม)
 *
 * ทำงานกับข้อความ YYYY-MM-DD ล้วน ๆ (ไม่แตะ Date ฝั่ง local) ให้ผลเท่ากันทั้งเบราว์เซอร์และเซิร์ฟเวอร์ UTC
 */
import { bkkParts } from "@/lib/bangkok-time";

/**
 * วันหยุดนักขัตฤกษ์ไทย (ตามประกาศวันหยุดธนาคาร ธปท.) — รวมวันหยุดชดเชยแล้ว
 * ⚠️ ต้องเติมปีใหม่ทุกปลายปี (วันพระใหญ่เลื่อนตามจันทรคติ + ครม.ประกาศวันหยุดพิเศษเพิ่มได้)
 * ถ้าปีไหนยังไม่มีในตาราง ระบบเว้นแค่เสาร์-อาทิตย์ แอดมินแก้ช่องวันที่เองได้เสมอ
 */
export const THAI_HOLIDAYS: Record<string, string> = {
  // ─── 2569 (2026) ───
  "2026-01-01": "วันขึ้นปีใหม่",
  "2026-01-02": "วันหยุดพิเศษ (ครม.)",
  "2026-03-03": "วันมาฆบูชา",
  "2026-04-06": "วันจักรี",
  "2026-04-13": "วันสงกรานต์",
  "2026-04-14": "วันสงกรานต์",
  "2026-04-15": "วันสงกรานต์",
  "2026-05-01": "วันแรงงานแห่งชาติ",
  "2026-05-04": "วันฉัตรมงคล",
  "2026-06-01": "ชดเชยวันวิสาขบูชา (31 พ.ค.)",
  "2026-06-03": "วันเฉลิมพระชนมพรรษา สมเด็จพระราชินี",
  "2026-07-28": "วันเฉลิมพระชนมพรรษา ร.10",
  "2026-07-29": "วันอาสาฬหบูชา",
  "2026-08-12": "วันแม่แห่งชาติ",
  "2026-10-13": "วันนวมินทรมหาราช",
  "2026-10-23": "วันปิยมหาราช",
  "2026-12-07": "ชดเชยวันพ่อแห่งชาติ (5 ธ.ค.)",
  "2026-12-10": "วันรัฐธรรมนูญ",
  "2026-12-31": "วันสิ้นปี",
  // ─── 2570 (2027) ───
  "2027-01-01": "วันขึ้นปีใหม่",
  "2027-02-22": "ชดเชยวันมาฆบูชา (20 ก.พ.)",
  "2027-04-06": "วันจักรี",
  "2027-04-13": "วันสงกรานต์",
  "2027-04-14": "วันสงกรานต์",
  "2027-04-15": "วันสงกรานต์",
  "2027-05-03": "ชดเชยวันแรงงานแห่งชาติ (1 พ.ค.)",
  "2027-05-04": "วันฉัตรมงคล",
  "2027-05-20": "วันวิสาขบูชา",
  "2027-06-03": "วันเฉลิมพระชนมพรรษา สมเด็จพระราชินี",
  "2027-07-19": "ชดเชยวันอาสาฬหบูชา (18 ก.ค.)",
  "2027-07-28": "วันเฉลิมพระชนมพรรษา ร.10",
  "2027-08-12": "วันแม่แห่งชาติ",
  "2027-10-13": "วันนวมินทรมหาราช",
  "2027-10-25": "ชดเชยวันปิยมหาราช (23 ต.ค.)",
  "2027-12-06": "ชดเชยวันพ่อแห่งชาติ (5 ธ.ค.)",
  "2027-12-10": "วันรัฐธรรมนูญ",
  "2027-12-31": "วันสิ้นปี",
};

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD → เลขวันแบบ UTC (ใช้บวกลบวันโดยไม่โดนโซนเวลา/DST) · null = รูปแบบผิด */
function toUtc(ymd: string): number | null {
  const m = YMD.exec(ymd ?? "");
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
}

function fromUtc(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/** เลื่อนวัน (บวก/ลบ) บนข้อความ YYYY-MM-DD */
export function addDays(ymd: string, n: number): string {
  const t = toUtc(ymd);
  return t == null ? ymd : fromUtc(t + n * 86400000);
}

/** 0 = อาทิตย์ … 6 = เสาร์ */
export function weekdayOf(ymd: string): number {
  const t = toUtc(ymd);
  return t == null ? -1 : new Date(t).getUTCDay();
}

/** ชื่อวันหยุดนักขัตฤกษ์ (ถ้าเป็น) */
export function holidayName(ymd: string): string | undefined {
  return THAI_HOLIDAYS[ymd];
}

/** เหตุผลที่วันนี้ส่งของไม่ได้ · undefined = เป็นวันทำการ ส่งได้ */
export function nonWorkingReason(ymd: string): string | undefined {
  const wd = weekdayOf(ymd);
  if (wd === 0) return "วันอาทิตย์";
  if (wd === 6) return "วันเสาร์";
  const h = holidayName(ymd);
  return h ? `วันหยุด ${h}` : undefined;
}

export function isWorkingDay(ymd: string): boolean {
  return weekdayOf(ymd) >= 0 && !nonWorkingReason(ymd);
}

/** วันทำการล่าสุดที่ "ก่อน" วันนี้ (ไม่รวมตัวเอง) */
export function prevWorkingDay(ymd: string): string {
  let d = addDays(ymd, -1);
  for (let i = 0; i < 30 && !isWorkingDay(d); i++) d = addDays(d, -1);
  return d;
}

export interface ShipWindow {
  from: string;
  to: string;
  /** วันที่ถูกข้ามระหว่างวันใช้งานกับวัน "ถึง" (เสาร์/อาทิตย์/วันหยุด) พร้อมเหตุผล — ไว้บอกแอดมินว่าทำไมถอยมาหลายวัน */
  skipped: { date: string; reason: string }[];
}

/**
 * ช่วงวันส่งที่ควรเป็น สำหรับวันใช้งานที่ระบุ · null = วันใช้งานรูปแบบผิด
 * @param today YYYY-MM-DD ของวันนี้ (ถ้าให้มา) — "จาก" จะไม่ถอยไปก่อนวันนี้ถ้า "ถึง" ยังไม่เลย
 */
export function shipWindowForUseBy(useByDate: string, today?: string): ShipWindow | null {
  if (toUtc(useByDate) == null) return null;
  const skipped: ShipWindow["skipped"] = [];
  let to = addDays(useByDate, -1);
  for (let i = 0; i < 30; i++) {
    const r = nonWorkingReason(to);
    if (!r) break;
    skipped.push({ date: to, reason: r });
    to = addDays(to, -1);
  }
  let from = prevWorkingDay(to);
  if (today && toUtc(today) != null && from < today && today <= to) from = today;
  return { from, to, skipped };
}

/** ข้อความสั้นอธิบายกติกา (โชว์ใต้ช่องวันที่) */
export const SHIP_WINDOW_RULE = "ส่งถึงก่อนวันใช้งาน 1–2 วันทำการ · เว้นเสาร์-อาทิตย์และวันหยุดนักขัตฤกษ์";

/** "พฤ 10 ก.ย." สำหรับป้ายสั้น ๆ */
export function shortThaiDay(ymd: string): string {
  const t = toUtc(ymd);
  if (t == null) return ymd;
  return new Date(t).toLocaleDateString("th-TH", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
}

/**
 * ตรวจช่วงวันส่งที่กรอกอยู่เทียบกับกติกา → รายการคำเตือน (ว่าง = โอเค)
 * ไม่ล็อกอะไร แค่บอก — แอดมินตั้งใจส่งวันไหนก็ได้
 */
export function shipWindowWarnings(ship: { from?: string; to?: string } | undefined, useByDate?: string): string[] {
  const out: string[] = [];
  for (const [k, label] of [["from", "วันเริ่มส่ง"], ["to", "วันส่งถึง"]] as const) {
    const v = ship?.[k];
    if (!v || toUtc(v) == null) continue;
    const r = nonWorkingReason(v);
    if (r) out.push(`${label} ${shortThaiDay(v)} เป็น${r} บริษัทไม่ส่งของ`);
  }
  if (ship?.from && ship?.to && toUtc(ship.from) != null && toUtc(ship.to) != null && ship.from > ship.to)
    out.push("วันเริ่มส่งอยู่หลังวันส่งถึง");
  if (useByDate && ship?.to && toUtc(ship.to) != null && toUtc(useByDate) != null && ship.to >= useByDate)
    out.push(`วันส่งถึง ${shortThaiDay(ship.to)} ไม่ก่อนวันใช้งาน ${shortThaiDay(useByDate)} — ของอาจถึงไม่ทัน`);
  return out;
}

/** วันนี้ตามเวลาไทย YYYY-MM-DD (เซิร์ฟเวอร์ UTC ก็ได้เลขวันถูก) */
export function todayBkkYmd(): string {
  const p = bkkParts();
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/**
 * ตอนสร้างออเดอร์: ลูกค้า/แอดมินระบุวันใช้งาน → ช่วงวันส่งอัตโนมัติ (ฟิลด์ shipDate พร้อม spread ลง Order)
 * แอดมินแก้ทับได้ทีหลังที่หน้าออเดอร์
 */
export function autoShipDate(useByDate: string | undefined): { shipDate?: { from: string; to: string } } {
  if (!useByDate) return {};
  const w = shipWindowForUseBy(useByDate, todayBkkYmd());
  return w ? { shipDate: { from: w.from, to: w.to } } : {};
}
