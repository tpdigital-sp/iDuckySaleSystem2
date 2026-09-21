/**
 * 📅 "วันที่ลูกค้าต้องใช้งาน" ที่ค้างอยู่ในเครื่อง — ตะกร้าเขียน / checkout อ่านไปแนบกับออเดอร์
 *
 * ⚠️ ทำไมต้องมีไฟล์นี้ (พนักงานถาม 21 ก.ย. 69 · OD-260918-8582 "ลูกค้าไม่ได้ระบุ แต่มีวันขึ้นมา"):
 * เดิมค่านี้เก็บใน localStorage แล้ว "ไม่เคยถูกล้างหลังสั่งสำเร็จ" — ใบถัดไปที่สั่งจากเบราว์เซอร์เดียวกัน
 * จะติดวันของใบเก่าไปเงียบ ๆ (หน้า checkout ไม่ได้โชว์ช่องนี้ให้เห็นก่อนกดสั่ง)
 * หนักสุดคือเครื่องของร้าน: พนักงานสั่งแทนลูกค้าวันละหลายใบจากเบราว์เซอร์เดียว
 * วันของลูกค้าคนหนึ่งจึงไหลไปติดใบของลูกค้าคนต่อ ๆ ไป
 *
 * กติกาที่ไฟล์นี้ถือไว้ที่เดียว:
 *  - อ่าน = ทิ้งวันที่เลยรอบคิวผลิตไปแล้วเสมอ (วันค้างข้ามวัน/ข้ามสัปดาห์ใช้ไม่ได้อยู่แล้ว)
 *  - สั่งสำเร็จ = ล้างทิ้งทันที ทั้งใบที่มีวันใช้งานและใบที่ไม่มี
 */
import { earliestUseBy, todayBkkYmd } from "./ship-date";

export const USE_BY_KEY = "ducky-use-by-date";

/** วันใช้งานที่ค้างอยู่ในเครื่อง — คืน "" ถ้าไม่มีหรือกระชั้นเกินรอบคิวผลิตแล้ว */
export function readUseByDate(today = todayBkkYmd()): string {
  try {
    const v = localStorage.getItem(USE_BY_KEY) ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
    return v >= earliestUseBy(today) ? v : "";
  } catch {
    return "";
  }
}

export function saveUseByDate(v: string): void {
  try {
    if (v) localStorage.setItem(USE_BY_KEY, v);
    else localStorage.removeItem(USE_BY_KEY);
  } catch {
    /* ข้าม — เบราว์เซอร์ที่ปิด storage ยังสั่งของได้ตามปกติ */
  }
}

/** 🧹 สั่งสำเร็จแล้วต้องเรียกเสมอ — กันวันของใบนี้ไหลไปติดใบถัดไปในเครื่องเดียวกัน */
export function clearUseByDate(): void {
  saveUseByDate("");
}
