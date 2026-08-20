/**
 * ระบบแจ้งปัญหา / เคลมสินค้า — ชนิดข้อมูลและค่าคงที่ที่ใช้ร่วมกันทั้งฝั่งลูกค้า/หลังบ้าน/เซิร์ฟเวอร์
 * ตัวเคลมเก็บในตาราง claims (id + data jsonb) — ดู supabase/claims.sql
 */

export type ClaimStatus = "ใหม่" | "กำลังตรวจสอบ" | "อนุมัติเคลม" | "ปฏิเสธ" | "เสร็จสิ้น";

export const CLAIM_STATUSES: ClaimStatus[] = ["ใหม่", "กำลังตรวจสอบ", "อนุมัติเคลม", "ปฏิเสธ", "เสร็จสิ้น"];

export const CLAIM_TYPES = ["สินค้าเสียหาย / แตกหัก", "สี / สเปคไม่ตรงที่สั่ง", "ได้รับสินค้าผิด", "จำนวนไม่ครบ", "อื่นๆ"] as const;

/** ยื่นเคลมได้ภายในกี่วันหลังจัดส่ง (ตกลงกับทางร้าน 20 ส.ค. 2569) — เกินแล้วให้ทักแอดมินทาง LINE แทน */
export const CLAIM_WINDOW_DAYS = 7;

export interface ClaimMessage {
  by: "customer" | "admin";
  /** ชื่อคนตอบฝั่งร้าน (ฝั่งลูกค้าไม่ต้องมี) */
  name?: string;
  text: string;
  at: string;
}

export interface ClaimResolution {
  action?: "ผลิตใหม่" | "คืนเงิน" | "ส่วนลด/ชดเชย" | "อื่นๆ";
  note?: string;
  /** ออเดอร์ผลิตซ่อมที่เปิดให้ (ผูกกับระบบ redo เดิมของหลังบ้าน) */
  redoOrderId?: string;
}

export interface Claim {
  id: string;
  orderId: string;
  customerId: string;
  /** สแนปช็อตไว้ให้แอดมินติดต่อ ไม่ต้องไล่เปิดออเดอร์ */
  customer?: string;
  phone?: string;
  /** รายการสินค้าที่เคลม (ชื่อ ณ ตอนยื่น) — ว่าง = ทั้งออเดอร์ */
  itemNames?: string[];
  type: string;
  detail: string;
  /** path ใน bucket ส่วนตัว claim-photos — URL เซ็นสดตอนอ่าน ไม่เก็บลงฐาน */
  photoPaths: string[];
  /** เติมโดย API ตอนอ่าน (อายุ 1 ชม.) */
  photoUrls?: string[];
  status: ClaimStatus;
  resolution?: ClaimResolution;
  messages: ClaimMessage[];
  createdAt: string;
  updatedAt?: string;
  log?: { at: string; by: string; action: string }[];
}

/** สีป้ายสถานะฝั่งหลังบ้าน (Tailwind) */
export const CLAIM_STATUS_STYLES: Record<ClaimStatus, string> = {
  ใหม่: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  กำลังตรวจสอบ: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  อนุมัติเคลม: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  ปฏิเสธ: "bg-rose-50 text-rose-600 ring-1 ring-rose-200",
  เสร็จสิ้น: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
};

/** เคลมที่ยังเดินเรื่องอยู่ (ไว้ขึ้น badge) */
export const isOpenClaim = (c: Claim) => c.status === "ใหม่" || c.status === "กำลังตรวจสอบ" || c.status === "อนุมัติเคลม";
