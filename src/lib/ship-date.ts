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

/**
 * 🗓 วันหยุดของร้านจากปฏิทิน TP-Leader (calendar.html → Firestore `holidays`) — เจ้าของร้านสั่ง 17 ก.ย. 69
 * "ร้านหยุดเสาร์ อาทิตย์ และวันหยุดตามปฏิทิน" → ปฏิทินร้านคือตัวจริง ตาราง THAI_HOLIDAYS ข้างบนเป็นแค่ตัวสำรอง
 * ตอนยังโหลดปฏิทินไม่ได้/Firestore ล่ม · ฝั่งเซิร์ฟเวอร์เติมด้วย loadShopHolidays() (lib/server/shop-holidays.ts)
 * ฝั่งเบราว์เซอร์เติมด้วย useShopHolidays() (lib/use-shop-holidays.ts)
 */
let shopHolidays: Record<string, string> | null = null;
export function setShopHolidays(map: Record<string, string> | null): void {
  shopHolidays = map;
}

/** ชื่อวันหยุด (ถ้าเป็น) — ปฏิทินร้านก่อน ไม่มีค่อยใช้ตารางสำรอง */
export function holidayName(ymd: string): string | undefined {
  return (shopHolidays ?? THAI_HOLIDAYS)[ymd];
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

/** วันทำการแรกที่ "หลัง" วันนี้ (ไม่รวมตัวเอง) */
export function nextWorkingDay(ymd: string): string {
  let d = addDays(ymd, 1);
  for (let i = 0; i < 30 && !isWorkingDay(d); i++) d = addDays(d, 1);
  return d;
}

/**
 * 🏭 วันส่งเร็วสุดของออเดอร์ที่สั่งวันนี้ — "สั่งวันไหน ส่งวันนั้นไม่ได้" (ไม่มีรอบคิวผลิตในวันเดียวกัน)
 * พนักงานแจ้ง 17 ก.ย. 69 · OD-260917-5550 ลูกค้าสั่งตี 4 ใช้งานพรุ่งนี้ ระบบเติมวันส่ง = วันนี้ให้เอง
 *  - งานเข้าคิวผลิตวันทำการแรกนับจากวันสั่ง (สั่งเสาร์/อาทิตย์/วันหยุด = เข้าคิววันทำการถัดไป)
 *  - ส่งได้เร็วสุด = วันทำการถัดจากวันเข้าคิว · สั่ง พฤ → ส่ง ศ · สั่ง ศ → ส่ง จ · สั่ง ส/อา → เข้าคิว จ ส่ง อ
 */
export function earliestShipDate(orderDate: string): string {
  if (toUtc(orderDate) == null) return orderDate;
  const queueDay = isWorkingDay(orderDate) ? orderDate : nextWorkingDay(orderDate);
  return nextWorkingDay(queueDay);
}

/** วันใช้งานเร็วสุดที่ลูกค้าระบุได้ตอนสั่งวันนี้ — ของต้องออกก่อนวันใช้งานอย่างน้อย 1 วัน */
export function earliestUseBy(orderDate: string): string {
  return addDays(earliestShipDate(orderDate), 1);
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/**
 * วันที่สั่งของออเดอร์ → YYYY-MM-DD · อ่านจาก Order.date ("17 ก.ย. 2569 04:12" เวลาไทย) ก่อน
 * แกะไม่ได้ค่อยใช้เลขใบ OD-YYMMDD-xxxx · "" = ไม่รู้วันสั่ง
 */
export function orderDateYmd(o: { date?: string; id?: string }): string {
  const p = (o.date ?? "").replace(/,/g, " ").trim().split(/\s+/);
  const day = Number(p[0]);
  const month = TH_MONTHS.indexOf(p[1] ?? "");
  const year = Number(p[2]);
  if (day && month >= 0 && year) {
    const y = year > 2400 ? year - 543 : year;
    return `${y}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const m = /^[A-Z]+-(\d{2})(\d{2})(\d{2})-/.exec(o.id ?? "");
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : "";
}

export interface ShipWindow {
  from: string;
  to: string;
  /** วันที่ถูกข้ามระหว่างวันใช้งานกับวัน "ถึง" (เสาร์/อาทิตย์/วันหยุด) พร้อมเหตุผล — ไว้บอกแอดมินว่าทำไมถอยมาหลายวัน */
  skipped: { date: string; reason: string }[];
  /** วันใช้งานกระชั้นเกินคิวผลิต — วันส่งเร็วสุดยังไม่ก่อนวันใช้งาน (from/to ถูกดันมาที่วันส่งเร็วสุด) */
  tight?: boolean;
}

/**
 * ช่วงวันส่งที่ควรเป็น สำหรับวันใช้งานที่ระบุ · null = วันใช้งานรูปแบบผิด
 * @param today YYYY-MM-DD ของวันนี้ (ถ้าให้มา) — "จาก" จะไม่ถอยไปก่อนวันนี้ถ้า "ถึง" ยังไม่เลย
 * @param orderDate YYYY-MM-DD วันที่สั่ง (ถ้าให้มา) — วันส่งไม่ตกวันที่สั่ง/ก่อนมีรอบคิวผลิต (earliestShipDate)
 *                  วันใช้งานกระชั้นจนวันส่งเร็วสุดเลยช่วงไปแล้ว → from = to = วันส่งเร็วสุด + tight
 */
export function shipWindowForUseBy(useByDate: string, today?: string, orderDate?: string): ShipWindow | null {
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
  if (orderDate && toUtc(orderDate) != null) {
    const floor = earliestShipDate(orderDate);
    if (floor > to) return { from: floor, to: floor, skipped, tight: true };
    if (from < floor) from = floor;
  }
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
 * ตรวจวันส่งที่กรอกอยู่เทียบกับกติกา → รายการคำเตือน (ว่าง = โอเค)
 * ไม่ล็อกอะไร แค่บอก — แอดมินตั้งใจส่งวันไหนก็ได้
 * หน้าออเดอร์เก็บวันเดียว (from = to, 11 ก.ย. 69) → ตรวจครั้งเดียวใช้ป้าย "วันที่จัดส่ง" · ใบเก่าที่ยังเป็นช่วงตรวจแยกจาก/ถึงเหมือนเดิม
 */
export function shipWindowWarnings(
  ship: { from?: string; to?: string } | undefined,
  useByDate?: string,
  /** วันที่สั่ง YYYY-MM-DD (ถ้ารู้) — เตือนเมื่อนัดส่งก่อนมีรอบคิวผลิต */
  orderDate?: string,
): string[] {
  const out: string[] = [];
  const first = ship?.from || ship?.to;
  if (orderDate && first && toUtc(first) != null && toUtc(orderDate) != null && first >= orderDate) {
    const floor = earliestShipDate(orderDate);
    if (first < floor)
      out.push(
        first === orderDate
          ? `วันที่จัดส่ง ${shortThaiDay(first)} เป็นวันเดียวกับวันที่สั่ง — ไม่มีรอบคิวผลิตส่งในวัน · ส่งได้เร็วสุด ${shortThaiDay(floor)}`
          : `สั่ง ${shortThaiDay(orderDate)} งานเข้าคิวผลิต ${shortThaiDay(prevWorkingDay(floor))} — ส่งได้เร็วสุด ${shortThaiDay(floor)}`,
      );
  }
  const single = !!ship?.from && (!ship?.to || ship.to === ship.from);
  const checks: readonly (readonly ["from" | "to", string])[] = single
    ? [["from", "วันที่จัดส่ง"]]
    : [["from", "วันเริ่มส่ง"], ["to", "วันส่งถึง"]];
  for (const [k, label] of checks) {
    const v = ship?.[k];
    if (!v || toUtc(v) == null) continue;
    const r = nonWorkingReason(v);
    if (r) out.push(`${label} ${shortThaiDay(v)} เป็น${r} บริษัทไม่ส่งของ`);
  }
  if (!single && ship?.from && ship?.to && toUtc(ship.from) != null && toUtc(ship.to) != null && ship.from > ship.to)
    out.push("วันเริ่มส่งอยู่หลังวันส่งถึง");
  const last = ship?.to || ship?.from;
  if (useByDate && last && toUtc(last) != null && toUtc(useByDate) != null && last >= useByDate)
    out.push(`${single ? "วันที่จัดส่ง" : "วันส่งถึง"} ${shortThaiDay(last)} ไม่ก่อนวันใช้งาน ${shortThaiDay(useByDate)} — ของอาจถึงไม่ทัน`);
  return out;
}

/** วันนี้ตามเวลาไทย YYYY-MM-DD (เซิร์ฟเวอร์ UTC ก็ได้เลขวันถูก) */
export function todayBkkYmd(): string {
  const p = bkkParts();
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/**
 * ตอนสร้างออเดอร์: ลูกค้า/แอดมินระบุวันใช้งาน → วันส่งอัตโนมัติ (ฟิลด์ shipDate พร้อม spread ลง Order)
 * เก็บวันเดียว from = to (= วันแรกของช่วงที่ควรส่ง ให้มีเวลาเผื่อ) ตามหน้าออเดอร์ที่เหลือช่องเดียว 11 ก.ย. 69
 * แอดมินแก้ทับได้ทีหลังที่หน้าออเดอร์
 */
export function autoShipDate(useByDate: string | undefined): { shipDate?: { from: string; to: string } } {
  if (!useByDate) return {};
  const today = todayBkkYmd();
  const w = shipWindowForUseBy(useByDate, today, today);
  return w ? { shipDate: { from: w.from, to: w.from } } : {};
}
