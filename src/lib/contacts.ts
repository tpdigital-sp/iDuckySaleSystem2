/**
 * ผู้ติดต่อ (ลูกค้า/ตัวแทน) — คลังรายชื่อที่นำเข้าจากระบบหลังบ้านเดิม (backoffice.casedesign2u.com)
 * และเพิ่มใหม่ได้จากหลังบ้านระบบนี้
 *
 * เก็บใน Supabase ตาราง contacts: id + data (jsonb) — ไฟล์นี้เป็น "ภาษากลาง" ที่ทั้งหน้าจอกับ API ใช้ร่วมกัน
 */

export type ContactOrigin = "legacy" | "member" | "admin-order" | "guest-order";

export const ORIGIN_LABEL: Record<ContactOrigin, string> = {
  legacy: "จากระบบเดิม",
  member: "สมัครเองจากเว็บ",
  "admin-order": "แอดมินกรอกตอนสั่ง",
  "guest-order": "สั่งแบบไม่สมัคร",
};

export type Contact = {
  /** รหัสผู้ติดต่อ — ตัวเลขต่อเนื่องจากระบบเดิม เช่น "28473" */
  id: string;
  name: string;
  phone: string;
  address: string;
  email?: string;
  /** แต้มสะสมจากระบบเดิม */
  point: number;
  /** ระดับสมาชิก (ชื่อไฟล์รูป rank จากระบบเดิม เช่น "silver" — "" = ไม่มี) */
  rank?: string;
  /** ข้อความคอลัมน์ "สถานะ Rank" จากระบบเดิม */
  rankStatus?: string;
  /** ข้อความคอลัมน์ "วันหมดอายุ" จากระบบเดิม เช่น "เหลือ 364 วัน" / "หมดอายุแล้ว (2023-07-11)" */
  rankExpiry?: string;
  /** ระบบเดิม "คำนวณคะแนนสะสม" ให้รายนี้ไหม (ป้ายเขียว) — ไม่มี = ไม่คำนวณ (ป้ายแดง) */
  pointActive?: boolean;
  /** ลูกค้า / ตัวแทนจำหน่าย */
  customerType?: "customer" | "dealer";
  note?: string;
  /** ที่มา — "casedesign2u-backoffice" = นำเข้าจากระบบเดิม · "admin" = เพิ่มในระบบนี้ · "sync" = ระบบสร้างให้เองจากสมาชิก/ออเดอร์ */
  source?: string;
  /**
   * ที่มาทั้งหมดของรายนี้ (คนเดียวมีได้หลายทาง เช่น อยู่ในระบบเดิม + มาสมัครสมาชิกเว็บ)
   *   legacy = ระบบเดิม · member = สมัครสมาชิกเองจากเว็บ · admin-order = แอดมินกรอกตอนสั่งแทน · guest-order = สั่งเองแบบไม่สมัคร
   * ใช้เป็นตัวกรองแท็บในหน้าผู้ติดต่อ (jsonb contains)
   */
  origins?: ContactOrigin[];
  /** บัญชีสมาชิกเว็บ (Supabase Auth uid) — มี = คนนี้สมัครสมาชิกแล้ว */
  memberId?: string;
  /** ช่องทางสมัคร line / email */
  channel?: "line" | "email";
  picture?: string;
  memberSince?: string;
  /** สรุปออเดอร์ในระบบนี้ (ซิงก์อัตโนมัติ) */
  orders?: { count: number; lastAt?: string; lastId?: string; firstAt?: string; placedBy?: string };
  syncedAt?: string;
  /**
   * ── สถานะระดับสมาชิกแบบ status-lock (ดูกติกาใน lib/tiers.ts) ──
   * ระดับล็อกไว้ทั้งรอบปี · ทบทวนตอนครบรอบ (cron) · ส่วนลดคิดจาก tierLevel นี้
   */
  tierLevel?: string;        // id ระดับที่ล็อกอยู่ เช่น "gold"
  tierAnchor?: string;       // วันเริ่มรอบปีปัจจุบัน (ISO)
  tierCycleSpend?: number;   // ยอดสะสม (บาท) เฉพาะรอบนี้ ใช้ตัดสินขึ้น/รักษาระดับ
  importedAt?: string;
  updatedAt?: string;
  updatedBy?: string;
};

/** ฟิลด์ที่แก้ไขได้จากหน้าจอ */
export type ContactInput = Pick<Contact, "name" | "phone" | "address" | "email" | "note" | "customerType"> & {
  point?: number;
};

/** เบอร์ไทย 9-10 หลักขึ้นต้น 0 จากข้อความใด ๆ — เผื่อคั่นด้วยขีด/เว้นวรรค เช่น 093-398-1155 */
export function phoneFrom(text: string | undefined | null): string {
  const m = String(text ?? "")
    .replace(/-/g, "")
    .match(/0\d{8,9}/);
  return m ? m[0] : "";
}

/** ทำเบอร์ให้เหลือแต่ตัวเลข (ตัด "โทร", ขีด, เว้นวรรค) — ถ้าหาเลขไม่เจอคืนข้อความเดิมที่ตัดช่องว่างแล้ว */
export function normalizePhone(raw: string | undefined | null): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return phoneFrom(s) || s.replace(/^โทร\s*:?\s*/i, "").replace(/\s+/g, " ");
}

/** แสดงเบอร์แบบ 08x-xxx-xxxx */
export function formatPhone(p: string | undefined): string {
  const d = String(p ?? "").replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return String(p ?? "");
}

/** แปลงแถวดิบ (จากไฟล์นำเข้า/ฟอร์ม) เป็น Contact ที่สะอาด — ใช้ทั้งฝั่งหน้าจอ (พรีวิว) และ API (บันทึกจริง) */
export function normalizeContact(r: Record<string, unknown>, extra?: Partial<Contact>): Contact | null {
  const id = String(r.id ?? "").trim();
  if (!id) return null;
  const name = String(r.name ?? "").trim();
  const address = String(r.address ?? "").trim();
  const phone = normalizePhone(String(r.phone ?? "")) || phoneFrom(name + " " + address);
  const c: Contact = {
    id,
    name,
    phone,
    address,
    point: Number(String(r.point ?? "0").replace(/,/g, "")) || 0,
  };
  const email = String(r.email ?? "").trim();
  if (email) c.email = email;
  const rank = String(r.rank ?? "").trim();
  if (rank && rank !== "0") c.rank = rank;
  const rankStatus = String(r.rankStatus ?? "").trim();
  if (rankStatus && rankStatus !== "-") c.rankStatus = rankStatus;
  const rankExpiry = String(r.rankExpiry ?? "").trim();
  if (rankExpiry) c.rankExpiry = rankExpiry;
  if (r.customerType === "dealer" || r.customerType === "customer") c.customerType = r.customerType;
  if (r.pointActive === true || r.pointActive === "true" || r.pointActive === "Y") c.pointActive = true;
  const note = String(r.note ?? "").trim();
  if (note) c.note = note;
  // ฟิลด์ที่ระบบซิงก์ให้ — ส่งผ่านตามเดิม (ฟอร์มแก้ไขไม่ยุ่ง แต่ต้องไม่หาย)
  if (Array.isArray(r.origins)) c.origins = r.origins.filter((o): o is ContactOrigin => typeof o === "string" && o in ORIGIN_LABEL);
  for (const k of ["memberId", "channel", "picture", "memberSince", "syncedAt", "source", "importedAt", "updatedAt", "updatedBy", "tierLevel", "tierAnchor"] as const) {
    const v = r[k];
    if (typeof v === "string" && v) (c as Record<string, unknown>)[k] = v;
  }
  if (typeof r.tierCycleSpend === "number") c.tierCycleSpend = r.tierCycleSpend;
  if (r.orders && typeof r.orders === "object") c.orders = r.orders as Contact["orders"];
  return { ...c, ...extra };
}

/** รายการในประวัติคะแนนสะสม (ตาราง contact_points) */
export type PointLog = {
  id: string;
  contactId: string;
  /** วันเวลาในระบบเดิม เช่น "2026-05-19 14:59:11" */
  at: string;
  /** เพิ่มคะแนนสะสม · ลบคะแนนสะสม · Fixed Point · หมายเหตุ */
  action: string;
  point: number;
  orderId?: string;
  note?: string;
};
