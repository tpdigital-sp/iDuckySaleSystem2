/**
 * 🧾 ใบหัก ณ ที่จ่าย (50 ทวิ) ต่อใบกำกับภาษี FlowAccount — หน้า /admin/wht (เมนูงานขาย · พนักงานบัญชีขอ 6 ต.ค. 69)
 *
 * ต้นทาง: FlowAccount Open API (server/flowaccount-api.ts) — cron wht-sync ดึงเดือนนี้+เดือนก่อนทุก 5 นาที · 1 แถว = ใบกำกับภาษี INV… 1 ใบ
 * (6 ต.ค. 69 เลิกนำเข้าไฟล์ Excel แล้ว — เจ้าของร้านสั่ง)
 *   (ยังไม่มี Open API · ได้รหัสเมื่อไหร่ค่อยเปลี่ยนเป็นดึงเอง — โครงข้อมูลชุดนี้ใช้ต่อได้เลย)
 * ไฟล์ไม่มีคอลัมน์หัก ณ ที่จ่าย → หัก/ไม่หัก เดาจากออเดอร์ที่จับคู่ได้ (Order.wht) แล้วพนักงานแก้เองได้
 * ยอดหัก = 3% ของมูลค่าก่อน VAT (เจ้าของร้านยืนยัน "ตามปกติ")
 *
 * เก็บในตาราง wht_certs (supabase/wht-certs.sql) · id = เลข INV · ไฟล์ใบหัก/สลิปอยู่ bucket ส่วนตัว wht-docs
 */

export const WHT_RATE_DEFAULT = 3;

/** ผู้จ่ายหัก ณ ที่จ่ายต้องออกใบ 50 ทวิในนามนี้ (ตามหัวไฟล์ SalesReport ของร้าน) */
export const WHT_PAYEE = { name: "บริษัท ทีพีดิจิตอล จำกัด", taxId: "0105560002924" } as const;

export interface WhtCert {
  /** เลขใบกำกับภาษี เช่น INV007654 */
  id: string;
  /** YYYY-MM ของวันที่ในใบ */
  month: string;
  /** YYYY-MM-DD */
  date: string;
  company: string;
  taxId?: string;
  branch?: string;
  /** มูลค่าก่อน VAT (ฐานคิดหัก ณ ที่จ่าย) */
  base: number;
  vat: number;
  total: number;
  /** เอกสารอ้างอิงในระบบ FlowAccount (QT/BL ที่แปลงมาเป็น INV) */
  refDoc?: string;
  /** เอกสารอ้างอิงรับมัดจำ */
  depositRef?: string;
  /** สถานะในแอป FlowAccount เช่น รอเก็บเงิน · เก็บเงินแล้ว · ยกเลิก */
  faStatus?: string;

  /** ออเดอร์ในระบบเราที่เป็นใบงานของ INV นี้ */
  orderIds: string[];
  matchedBy?: "ref" | "taxId" | "name" | "manual";
  /** ออเดอร์ที่ใช้ส่งไลน์หาลูกค้า (ใบเดียวกับข้างบน หรือใบเก่าของลูกค้าเลขผู้เสียภาษีเดียวกัน) */
  lineOrderId?: string;
  /** ส่งไลน์ได้ไหม (ตอนจับคู่ล่าสุด) */
  hasLine?: boolean;
  /**
   * 💬 LINE ที่การ์ดทวงจะไปถึงจริง (lineTargetOf ของใบงาน) — โชว์ในแถวให้พนักงานเห็นก่อนกดทวง
   * via: bound = พนักงานผูกที่ใบงาน · inherited = จำจากออเดอร์เก่า · login = บัญชีที่ล็อกอินตอนสั่ง
   * แคชไว้ (at) เช็คใหม่ทุก 24 ชม. หรือเมื่อ LINE ที่ผูกในใบงานเปลี่ยน
   */
  lineTo?: { id: string; name?: string; picture?: string; via: "bound" | "inherited" | "login"; at: string };
  /** กลุ่มลูกค้าเดียวกัน — ใช้รวมใบเวลาโชว์/ทวง (LINE userId ถ้ารู้ ไม่งั้นเลขผู้เสียภาษี) */
  groupKey?: string;

  /** ใบงานอื่นของลูกค้าเดียวกันเคยหัก ณ ที่จ่าย — แนะนำ "หัก 3%" ตอนยังไม่ระบุ (ไม่ตั้งให้เอง) */
  hintWht?: boolean;
  /**
   * 🔌 หัก ณ ที่จ่ายตามที่บันทึกใน FlowAccount (ดึงผ่าน API) — sure = จากการรับชำระจริง → ตั้ง mode ให้เอง ทับการเดา
   * ยอดหักใช้ตัวเลขนี้แทน 3% ของฐาน · ไม่มี = ยังไม่รู้ (ใบที่นำเข้าจาก Excel รุ่นแรก)
   */
  faWht?: { amount: number; rate: number; sure: boolean; at: string };
  /** wht = ลูกค้าหัก ณ ที่จ่าย · none = ไม่หัก · ไม่มีค่า = ยังไม่รู้ (พนักงานต้องเลือก) */
  mode?: "wht" | "none";
  /** พนักงานเลือกเอง หรือ "FlowAccount" (จากการรับชำระ) — ดึงซ้ำจะไม่เดาทับ (แต่ข้อมูลรับชำระจาก FlowAccount ทับได้) */
  modeBy?: string;
  rate: number;

  /** ได้รับใบหักแล้ว */
  received?: { at: string; by: string };
  /** path ไฟล์ใบหัก (bucket wht-docs) */
  certFiles?: string[];

  /** ลูกค้าไม่ได้หักตอนจ่าย แล้วขอหักย้อนหลัง → ร้านโอนคืนส่วนต่าง */
  retro?: {
    at: string;
    by: string;
    amount: number;
    bank?: string;
    account?: string;
    accountName?: string;
    refundedAt?: string;
    refundedBy?: string;
  };
  refundSlips?: string[];

  /** ประวัติการทวงทางไลน์ */
  /** ประวัติการทวงทางไลน์ · to = ชื่อ LINE ของผู้รับ (ข้อความจาก API ไม่โผล่ในห้องแชท OA Manager — ใช้ยืนยันว่าส่งถึงใคร) */
  reminders?: { at: string; by: string; ok: boolean; reason?: string; to?: string }[];
  note?: string;
  importedAt: string;
  updatedAt: string;
}

/** ส่งให้หน้าเว็บ — path ไฟล์ถูกเซ็นเป็น URL ชั่วคราว */
export interface WhtCertView extends WhtCert {
  files?: Record<string, string>;
}

export type WhtStatus = "todo" | "pending" | "received" | "retro" | "refunded" | "none" | "void";

export const WHT_STATUS_LABEL: Record<WhtStatus, string> = {
  todo: "ยังไม่ระบุ หัก/ไม่หัก",
  pending: "หัก · ยังไม่ส่งใบหัก",
  received: "หัก · ได้รับใบหักแล้ว",
  retro: "หักย้อนหลัง · รอโอนคืน",
  refunded: "หักย้อนหลัง · โอนคืนแล้ว",
  none: "ไม่หัก",
  void: "ยกเลิกใน FlowAccount",
};

export function whtStatusOf(c: WhtCert): WhtStatus {
  if (/ยกเลิก/.test(c.faStatus ?? "")) return "void";
  if (c.retro) return c.retro.refundedAt ? "refunded" : "retro";
  if (!c.mode) return "todo";
  if (c.mode === "none") return "none";
  return c.received ? "received" : "pending";
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** ยอดหัก ณ ที่จ่ายของใบนี้ (3% ของมูลค่าก่อน VAT) */
export function whtAmountOf(c: Pick<WhtCert, "base" | "rate" | "faWht">): number {
  if (c.faWht && c.faWht.amount > 0) return r2(c.faWht.amount);
  return r2((c.base * (c.rate || WHT_RATE_DEFAULT)) / 100);
}

/** ปุ่มทวงกดได้ไหม — เฉพาะใบที่หักแล้วยังไม่ส่งใบหัก + ใบงานมีไลน์ลูกค้า */
export function canRemind(c: WhtCert): boolean {
  return whtStatusOf(c) === "pending" && !!c.lineOrderId && !!c.hasLine;
}

/** ชื่อบริษัทแบบตัดคำนำหน้า/ช่องว่าง — ใช้เทียบชื่อจากไฟล์ FlowAccount กับชื่อในออเดอร์ */
export function normCompany(s: string | undefined): string {
  return (s ?? "")
    .replace(/\s+/g, "")
    .replace(/ํา/g, "ำ")
    .replace(/^(บริษัท|บจก\.?|หจก\.?|ห้างหุ้นส่วนจำกัด)/, "")
    .replace(/(จำกัด|\(มหาชน\)|มหาชน)/g, "")
    .toLowerCase();
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TH_MONTHS_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

/** "2026-09-30" → "30 ก.ย. 69" */
export function thShortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m) return ymd;
  return `${d ?? ""} ${TH_MONTHS[m - 1]} ${String(y + 543).slice(-2)}`.trim();
}

/** "2026-09" → "กันยายน 2569" */
export function thMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `${TH_MONTHS_FULL[m - 1]} ${y + 543}`;
}
