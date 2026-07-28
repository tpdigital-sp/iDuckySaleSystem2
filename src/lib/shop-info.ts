/**
 * ข้อมูลร้าน (ใช้ในเอกสารพิมพ์: ใบงาน / ใบปะหน้าพัสดุ / ใบเสร็จ และท้ายเว็บ)
 * แก้ที่เดียว มีผลทุกที่
 */
export const SHOP = {
  name: "iDucky Prints Studio",
  legalName: "บริษัท ทีพีดิจิตอล",
  addressLines: ["663/8 ซอยฉลองกรุง1", "แขวง/เขตลาดกระบัง กทม 10520"],
  phone: "096-569-9414",
  hours: "จันทร์-ศุกร์ 09.00 - 18.00 น.",
  /** เลขประจำตัวผู้เสียภาษี — ใส่เมื่อต้องการให้ขึ้นบนใบเสร็จ (เว้นว่าง = ไม่แสดง) */
  taxId: "",
} as const;

/** ที่อยู่ร้านแบบบรรทัดเดียว (ใช้บนใบปะหน้าพัสดุ) */
export const shopAddressOneLine = [SHOP.legalName, ...SHOP.addressLines].join(" ");

/** ที่อยู่เว็บจริง — ตั้ง NEXT_PUBLIC_SITE_URL ทับได้ถ้าย้ายโดเมน */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://iduckystore.netlify.app").replace(/\/+$/, "");

/** ที่อยู่ในเครือข่ายส่วนตัว — คนอื่น/มือถือ เข้าไม่ได้ */
const PRIVATE_HOST = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i;

/**
 * ฐาน URL สำหรับลิงก์ที่ "คนอื่นหรือเครื่องอื่น" ต้องเปิดได้
 * (QR บนใบงานสำหรับมือถือ · ลิงก์ออเดอร์ที่ส่งให้ลูกค้า)
 *
 * เปิดจากเว็บจริง → ใช้โดเมนที่กำลังใช้อยู่ (ย้ายโดเมนแล้วยังถูก)
 * เปิดจาก localhost → ใช้ SITE_URL แทน ไม่งั้นมือถือสแกนแล้วเปิดไม่ได้
 */
export function publicOrigin(): string {
  if (typeof window !== "undefined") {
    const o = window.location.origin;
    if (o && !PRIVATE_HOST.test(o)) return o;
  }
  return SITE_URL;
}
