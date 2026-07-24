/**
 * ระบบสิทธิ์ตามตำแหน่งงาน (ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ)
 *
 * ⚠️ การซ่อนเมนู/ปุ่มในหน้าจอเป็นแค่ความสะดวก ไม่ใช่ความปลอดภัย
 *    ทุก API route ต้องเรียก requirePerm() ฝั่งเซิร์ฟเวอร์เสมอ
 */

/** ค่าที่เก็บใน Firestore employees2 */
export const ROLE_ADMINISTRATOR = "Administrator";
export const ROLE_STAFF = "พนักงาน";
export const DEPT_ADMIN = "แอดมิน";
export const DEPT_PACKING = "แพ็คของ";
/** พนักงานที่ยังทำงานอยู่เท่านั้นถึงล็อกอินได้ (allowlist — สถานะอื่นปิดไว้ก่อน) */
export const WORK_STATUS_ACTIVE = "working";

/** ผู้ใช้ที่ล็อกอินอยู่ */
export interface Actor {
  username: string;
  name?: string;
  role: string;
  department?: string;
}

export type Perm =
  /** เปิดหลังบ้านได้ */
  | "admin.access"
  /** ดูรายการออเดอร์ */
  | "orders.view"
  /** ดูออเดอร์ทุกสถานะ (ไม่มีสิทธิ์นี้ = เห็นเฉพาะคิวแพ็ค) */
  | "orders.viewAll"
  /** เห็นราคา ยอดเงิน สลิปโอน และกดยืนยันการชำระเงิน */
  | "orders.money"
  /** แก้ที่อยู่/เบอร์/สถานะออเดอร์ */
  | "orders.edit"
  /** ยกเลิกออเดอร์ */
  | "orders.cancel"
  /** อัปโหลด/ลบภาพแบบงาน */
  | "proof.manage"
  /** ตรวจนับของ + ยืนยันอ่านรายละเอียด */
  | "pack.check"
  /** ยิงเลขพัสดุเข้าระบบ */
  | "pack.ship"
  /** ดูรายการสินค้า */
  | "products.view"
  /** แก้ราคา / เพิ่ม / ลบสินค้า */
  | "products.manage"
  /** ดึงสินค้าจาก URL และบันทึกเป็นสินค้าใหม่ */
  | "products.import"
  /** บันทึกทับสินค้าที่มีอยู่แล้ว (ทับราคา/ตัวเลือกเดิม) */
  | "products.importOverwrite"
  /** คลังตัวเลือกกลาง */
  | "presets.manage"
  /** ตั้งค่าระบบ — เลขบัญชีร้าน ค่าส่ง */
  | "settings.manage";

/** สิทธิ์ของพนักงานฝ่ายแอดมิน (ออฟฟิศ — ดูแลลูกค้า/ออเดอร์/งานแบบ) */
const STAFF_ADMIN: Perm[] = [
  "admin.access",
  "orders.view",
  "orders.viewAll",
  "orders.money",
  "orders.edit",
  "proof.manage",
  "pack.check",
  "pack.ship",
  "products.view",
  "products.import",
];

/** สิทธิ์ของพนักงานฝ่ายแพ็คของ (หน้างาน — ตรวจนับ ยิงเลขพัสดุ) */
const STAFF_PACKING: Perm[] = ["admin.access", "orders.view", "pack.check", "pack.ship"];

/** คืนรายการสิทธิ์ทั้งหมดของผู้ใช้คนนี้ */
export function permsOf(actor: Actor | null | undefined): Perm[] {
  if (!actor) return [];
  if (actor.role === ROLE_ADMINISTRATOR) return ALL_PERMS;
  if (actor.role !== ROLE_STAFF) return [];
  if (actor.department === DEPT_ADMIN) return STAFF_ADMIN;
  if (actor.department === DEPT_PACKING) return STAFF_PACKING;
  // แผนกอื่นที่ยังไม่ได้กำหนดสิทธิ์ → ไม่ให้เข้า (ปิดไว้ก่อนปลอดภัยกว่า)
  return [];
}

export const ALL_PERMS: Perm[] = [
  "admin.access",
  "orders.view",
  "orders.viewAll",
  "orders.money",
  "orders.edit",
  "orders.cancel",
  "proof.manage",
  "pack.check",
  "pack.ship",
  "products.view",
  "products.manage",
  "products.import",
  "products.importOverwrite",
  "presets.manage",
  "settings.manage",
];

/** ผู้ใช้คนนี้ทำสิ่งนี้ได้ไหม */
export function can(actor: Actor | null | undefined, perm: Perm): boolean {
  return permsOf(actor).includes(perm);
}

/** ชื่อตำแหน่งไว้แสดงในหน้าจอ เช่น "พนักงาน · แพ็คของ" */
export function roleLabel(actor: Actor | null | undefined): string {
  if (!actor) return "";
  if (actor.role === ROLE_ADMINISTRATOR) return "ผู้ดูแลระบบ";
  return actor.department ? `${actor.role} · ${actor.department}` : actor.role;
}

/**
 * สถานะออเดอร์ที่ฝ่ายแพ็คของเห็น — เฉพาะคิวที่ถึงมือเขาแล้ว
 * (ไม่มีสิทธิ์ orders.viewAll → กรองด้วยรายการนี้)
 */
export const PACKING_QUEUE_STATUSES = ["อนุมัติแบบ", "กำลังผลิต", "จัดส่งแล้ว"];
