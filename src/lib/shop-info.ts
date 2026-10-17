/**
 * ข้อมูลร้าน (ใช้ในเอกสารพิมพ์: ใบงาน / ใบปะหน้าพัสดุ / ใบเสร็จ และท้ายเว็บ)
 * แก้ที่เดียว มีผลทุกที่
 */
export const SHOP = {
  name: "iDuckyOfficial",
  legalName: "บริษัท ทีพีดิจิตอล",
  addressLines: ["663/8 ซอยฉลองกรุง1", "แขวง/เขตลาดกระบัง กทม 10520"],
  phone: "096-569-9414",
  hours: "จันทร์-ศุกร์ 09.00 - 18.00 น.",
  /** เลขประจำตัวผู้เสียภาษี — ใส่เมื่อต้องการให้ขึ้นบนใบเสร็จ (เว้นว่าง = ไม่แสดง) */
  taxId: "",
} as const;

/** ที่อยู่ร้านแบบบรรทัดเดียว (ใช้บนใบปะหน้าพัสดุ) */
export const shopAddressOneLine = [SHOP.legalName, ...SHOP.addressLines].join(" ");

/** อีเมลร้าน (รับไฟล์งานด้วย) — ตรงกับหน้าเกี่ยวกับเรา/LegalPage */
export const SHOP_EMAIL = "iduckyshop03@gmail.com";

/** ลิงก์ Google Maps ของร้าน (ค้นจากที่อยู่ แบบเดียวกับหน้าเกี่ยวกับเรา) */
export const SHOP_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shopAddressOneLine)}`;

/**
 * 📇 ข้อมูลติดต่อ/ช่องทางที่บอทตอบลูกค้าได้เลย (เจ้าของร้าน 12 ต.ค. 69 ชุด 3)
 * ใช้ทั้งแชทเว็บ (chat-answer) และบอท LINE (customer-profile) — แก้ที่นี่ที่เดียว
 */
export function shopContactText(): string {
  return [
    `📇 ข้อมูลติดต่อร้าน (ตอบลูกค้าได้เลย): โทร ${SHOP.phone} · อีเมล ${SHOP_EMAIL} · ที่อยู่ ${shopAddressOneLine} · แผนที่ ${SHOP_MAPS_URL}`,
    `ส่งไฟล์งาน: แชร์ลิงก์ Google Drive ในแชท หรือส่งอีเมล ${SHOP_EMAIL} ได้ทั้ง 2 ทาง (.AI .PSD .PNG พื้นหลังใส) · ทำเส้นไดคัทมาเองหรือให้ร้านทำก็ได้ · ใช้ฟอนต์ของลูกค้าได้`,
    "สั่งซื้อ: ให้สั่งบนเว็บ iduckystore.com ก่อน แล้วแจ้งเลขออเดอร์ในแชท · ไม่มีค่าบล็อก (งานพิมพ์ดิจิทัล) · ร้านเริ่มทำแบบหลังสั่งซื้อและโอนเงินแล้ว",
    "ตัวแทนจำหน่าย: ตัวแทนจากระบบเก่าต้องสมัครใหม่ที่ iduckystore.com/dealer (ล็อกอินก่อน รอร้านอนุมัติ)",
  ].join("\n");
}

/** ที่อยู่เว็บจริง — ตั้ง NEXT_PUBLIC_SITE_URL ทับได้ถ้าย้ายโดเมน */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://iduckystore.com").replace(/\/+$/, "");

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

/**
 * ฝั่งเซิร์ฟเวอร์: origin ของคำขอ → ฐาน URL ที่ลูกค้าเปิดได้
 * พนักงานกดยืนยันจาก dev (localhost:3016) เคยได้ลิงก์ localhost ในการ์ดไลน์ลูกค้า (OD-260929-2180 · 3 ต.ค. 69)
 */
export function customerOrigin(origin: string | null | undefined): string {
  const o = (origin || "").replace(/\/+$/, "");
  return o && !PRIVATE_HOST.test(o) ? o : SITE_URL;
}
