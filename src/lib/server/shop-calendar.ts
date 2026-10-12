import "server-only";
import { SHOP } from "@/lib/shop-info";
import { addDays, isWorkingDay, nonWorkingReason, weekdayOf } from "@/lib/ship-date";
import { loadShopHolidays } from "./shop-holidays";

/**
 * 📅 วันหยุด + เวลาทำการของร้าน สำหรับบอท (เจ้าของร้าน 12 ต.ค. 69 "ต้องการให้ chatbot รู้วันหยุดของร้าน เวลาทำงาน")
 *   - วันหยุด = ปฏิทิน TP-Leader (TP-Setting/holiday-settings.html → Firestore tp-fixflow `holidays`) ชุดเดียวกับที่ระบบคำนวณวันส่ง · แก้ที่ปฏิทิน TP ที่เดียว บอทตามเอง
 *   - เวลาทำการ = SHOP.hours ใน lib/shop-info.ts (ข้อความเดียวกับท้ายเว็บ) · ร้านหยุดเสาร์-อาทิตย์ (กติกาเดียวกับ ship-date)
 *   ใช้ 2 ที่: บอท LINE (ต่อท้ายโปรไฟล์ลูกค้า /api/bot/customer-profile) + แชทหน้าเว็บ (chat-answer systemMessage)
 */
const TH_DOW = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const thDay = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${TH_DOW[weekdayOf(ymd)]} ${d} ${TH_MON[m - 1]} ${String(y + 543).slice(2)}`;
};

/** ชั่วโมงเปิด-ปิดจากข้อความ SHOP.hours ("จันทร์-ศุกร์ 09.00 - 18.00 น.") · อ่านไม่ออก = 9-18 */
function openHours(): { open: number; close: number; label: string } {
  const m = /(\d{1,2})[.:](\d{2})\s*[-–]\s*(\d{1,2})[.:](\d{2})/.exec(SHOP.hours);
  const open = m ? Number(m[1]) * 60 + Number(m[2]) : 9 * 60;
  const close = m ? Number(m[3]) * 60 + Number(m[4]) : 18 * 60;
  return { open, close, label: SHOP.hours };
}

/** ก้อนข้อความสั้นสำหรับพรอมป์ต (~5 บรรทัด) — เวลาไทยปัจจุบัน · วันนี้เปิด/ปิด · วันทำการถัดไป · วันหยุดใน 45 วัน */
export async function shopCalendarText(now = new Date()): Promise<string> {
  await loadShopHolidays().catch(() => null); // เสียบปฏิทิน TP เข้า ship-date (แคช 10 นาที) · อ่านไม่ได้ = ใช้ตารางสำรอง
  const { open, close, label } = openHours();
  const bkk = new Date(now.getTime() + 7 * 3600_000);
  const today = bkk.toISOString().slice(0, 10); // วันที่ไทยของเวลาที่ส่งมา (ไม่ใช้นาฬิกาเครื่อง — เทสย้อนเวลาได้)
  const mins = bkk.getUTCHours() * 60 + bkk.getUTCMinutes();
  const hhmm = `${String(bkk.getUTCHours()).padStart(2, "0")}:${String(bkk.getUTCMinutes()).padStart(2, "0")}`;
  const nextWorking = (from: string) => {
    let d = addDays(from, 1);
    for (let i = 0; i < 30 && !isWorkingDay(d); i++) d = addDays(d, 1);
    return d;
  };

  let todayLine: string;
  if (!isWorkingDay(today)) {
    todayLine = `วันนี้ ${thDay(today)} ร้านหยุด (${nonWorkingReason(today) ?? "วันหยุด"}) · เปิดทำการวันถัดไป ${thDay(nextWorking(today))}`;
  } else if (mins < open) {
    todayLine = `วันนี้ ${thDay(today)} เป็นวันทำการ · ตอนนี้ ${hhmm} น. ยังไม่ถึงเวลาเปิด`;
  } else if (mins >= close) {
    todayLine = `วันนี้ ${thDay(today)} เป็นวันทำการ · ตอนนี้ ${hhmm} น. เลยเวลาทำการแล้ว · เปิดอีกครั้ง ${thDay(nextWorking(today))}`;
  } else {
    todayLine = `วันนี้ ${thDay(today)} เป็นวันทำการ · ตอนนี้ ${hhmm} น. ร้านเปิดอยู่`;
  }

  // วันหยุดพิเศษ (ไม่ใช่เสาร์-อาทิตย์) ใน 45 วันข้างหน้า
  const upcoming: string[] = [];
  for (let i = 1; i <= 45 && upcoming.length < 6; i++) {
    const d = addDays(today, i);
    const wd = weekdayOf(d);
    if (wd === 0 || wd === 6) continue;
    if (!isWorkingDay(d)) upcoming.push(`${thDay(d)} (${nonWorkingReason(d) ?? "วันหยุด"})`);
  }

  return [
    `📅 ข้อมูลร้าน ณ ${hhmm} น.: เวลาทำการ ${label} · หยุดเสาร์-อาทิตย์และวันหยุดตามปฏิทินร้าน`,
    todayLine,
    upcoming.length ? `วันหยุดร้านที่จะถึง: ${upcoming.join(", ")}` : "45 วันข้างหน้าไม่มีวันหยุดพิเศษ (หยุดแค่เสาร์-อาทิตย์)",
    "ถ้าลูกค้าถามเวลาเปิด/วันหยุด/แอดมินตอบเมื่อไหร่/ส่งของวันไหน ให้ตอบตามข้อมูลนี้ · นอกเวลาทำการ แจ้งว่าแอดมินจะดูแลต่อในเวลาทำการ · ห้ามเดาวันหยุดเอง",
  ].join("\n");
}
