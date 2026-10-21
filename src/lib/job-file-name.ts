import { bkkParts } from "@/lib/bangkok-time";

/**
 * 🗂 ชื่อไฟล์งานตอนโหลดจากหน้าออเดอร์ (เจ้าของร้านสั่ง 21 ต.ค. 69):
 *   "<ชื่อสินค้า>-<รหัสออเดอร์ 4 ตัวท้าย>-<วันเดือนปี>-<เลขสุ่ม 3 ตัว>.<นามสกุล>"
 *   เช่น  ปฏิทินตั้งโต๊ะ 2570-7135-211026-482.ai
 *
 * เดิมปุ่ม ⬇ ใช้ attribute download บนลิงก์ข้ามโดเมน (Supabase) → เบราว์เซอร์ไม่สนชื่อที่ตั้ง
 * ได้ชื่อ UUID ของที่เก็บแทน (b9f90791-….ai) หาไฟล์ในเครื่องไม่เจอว่าเป็นงานไหน
 * - วันเดือนปี = วันที่กดโหลด ตามเวลาไทย ddMMyy (ปี ค.ศ. 2 หลัก ตรงกับเลขใน OD-YYMMDD)
 * - เลขสุ่ม 3 ตัว (000–999) กันชื่อชนตอนโหลดไฟล์เดียวกันซ้ำ
 * - หลายลายในรายการเดียว ต่อท้าย "-ลายN" ก่อนเลขสุ่ม ไม่งั้นแยกไม่ออก
 * - ตัวอักษรที่ระบบไฟล์ห้าม (/ \ : * ? " < > |) → เว้นวรรค · ชื่อสินค้ายาวตัดที่ 60 ตัวอักษร
 */
export function jobFileName(
  productName: string,
  orderId: string,
  ext: string,
  opts: { design?: number; now?: Date; rand?: number } = {},
): string {
  const name =
    (productName || "งาน")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60)
      .trim() || "งาน";
  // รหัสออเดอร์ OD-261021-7135 → 7135 (ตัวเลข/ตัวอักษรท้ายสุด 4 ตัว ไม่นับขีด)
  const tail = orderId.replace(/[^0-9A-Za-z]/g, "").slice(-4) || orderId;
  const p = bkkParts(opts.now ?? new Date());
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${pad(p.d)}${pad(p.m)}${String(p.y).slice(-2)}`;
  const rand = String(Math.min(999, Math.max(0, Math.floor(opts.rand ?? Math.random() * 1000)))).padStart(3, "0");
  const design = opts.design && opts.design > 0 ? `-ลาย${opts.design}` : "";
  return `${name}-${tail}-${date}${design}-${rand}.${ext.replace(/^\./, "")}`;
}
