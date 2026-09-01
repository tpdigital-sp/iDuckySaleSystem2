/**
 * ระบบสิทธิ์ตามตำแหน่งงาน (ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ)
 *
 * ⚠️ การซ่อนเมนู/ปุ่มในหน้าจอเป็นแค่ความสะดวก ไม่ใช่ความปลอดภัย
 *    ทุก API route ต้องเรียก requirePerm() ฝั่งเซิร์ฟเวอร์เสมอ
 */

/** ค่าที่เก็บใน Firestore employees2 */
export const ROLE_ADMINISTRATOR = "Administrator";
export const ROLE_STAFF = "พนักงาน";
/**
 * บทบาท "หัวหน้า" ของระบบ TP — คิดสิทธิ์ตามแผนกเหมือนพนักงาน
 * (ก่อน 1 ก.ย. 69 บทบาทนี้ตกทุกด่านเพราะโค้ดรับแค่ Administrator/พนักงาน → ล็อกอินหลังบ้านไม่ได้)
 */
export const ROLE_LEADER = "หัวหน้า";
export const DEPT_ADMIN = "แอดมิน";
export const DEPT_PACKING = "แพ็คของ";
/** แผนกคอนเทนต์ — ดูแลหน้าเว็บ/สินค้า/ราคา (ใน Firebase พิมพ์ "คอนเทนต์" หรือ "content" ก็ได้) */
export const DEPT_CONTENT = "คอนเทนต์";
/** แผนกกราฟฟิก — ทำแบบงานให้ลูกค้าตรวจ (ไม่เห็นเรื่องเงิน) */
export const DEPT_GRAPHIC = "กราฟฟิก";
/** แผนกหัวหน้า/ผู้บริหาร (ค่าใน Firestore เขียนเป็นอังกฤษ "Leadership") */
export const DEPT_LEADERSHIP = "Leadership";
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
  | "settings.manage"
  /** จัดการคูปอง — สร้าง/แจก/ดูสถานะ */
  | "coupons.manage"
  /** กำหนดบทบาท/แผนก/สถานะให้พนักงาน (ตั้งหรือแก้ระดับ Administrator ได้เฉพาะผู้ดูแลระบบ) */
  | "staff.manage";

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
  "coupons.manage",
  "staff.manage",
  // เปิดหน้า "ตั้งค่าระบบ" ให้ฝ่ายแอดมิน (14 ส.ค. 69) — แท็บอ่อนไหว (บัญชีรับเงิน/บทบาท/Google) ยังล็อกเฉพาะผู้ดูแลระบบในหน้า
  "settings.manage",
];

/** สิทธิ์ของพนักงานฝ่ายแพ็คของ (หน้างาน — ตรวจนับ ยิงเลขพัสดุ) */
const STAFF_PACKING: Perm[] = ["admin.access", "orders.view", "pack.check", "pack.ship"];

/** สิทธิ์ของพนักงานฝ่ายคอนเทนต์ (ดูแลหน้าเว็บ — เพิ่ม/แก้สินค้า ราคา ตัวเลือก นำเข้าจาก URL) */
const STAFF_CONTENT: Perm[] = [
  "admin.access",
  "products.view",
  "products.manage",
  "products.import",
  "presets.manage",
];

/**
 * สิทธิ์ของพนักงานฝ่ายกราฟฟิก (ทำแบบงาน — อัปโหลดแบบให้ลูกค้าตรวจ)
 * ไม่มี orders.money → ไม่เห็นราคา/สลิป · ไม่มี orders.edit → เปลี่ยนสถานะ/ที่อยู่ไม่ได้
 */
const STAFF_GRAPHIC: Perm[] = [
  "admin.access",
  "orders.view",
  "orders.viewAll",
  "proof.manage",
  "products.view",
];

/**
 * สิทธิ์ของหัวหน้า/ผู้บริหาร (แผนก Leadership) — เท่าฝ่ายแอดมิน
 * เท่ากับชุดที่ฝ่ายแอดมินใช้จริงอยู่ตอนนี้ (STAFF_ADMIN + สิทธิ์สินค้า/คลังตัวเลือกที่เพิ่มไว้ในหน้าตั้งค่า)
 * ปรับทีหลังได้ที่ ตั้งค่าระบบ → แท็บบทบาท เหมือนแผนกอื่น
 */
const STAFF_LEADERSHIP: Perm[] = [
  ...STAFF_ADMIN,
  "products.manage",
  "products.importOverwrite",
  "presets.manage",
];

/** ชุดสิทธิ์ต่อแผนก — แก้/เพิ่มบทบาทได้ที่ ตั้งค่าระบบ → แท็บบทบาท (เก็บใน DB, ตัวนี้คือค่าเริ่มต้น) */
export type RolePermsMap = Record<string, Perm[]>;
export const DEFAULT_ROLE_PERMS: RolePermsMap = {
  [DEPT_ADMIN]: STAFF_ADMIN,
  [DEPT_PACKING]: STAFF_PACKING,
  [DEPT_CONTENT]: STAFF_CONTENT,
  [DEPT_GRAPHIC]: STAFF_GRAPHIC,
  [DEPT_LEADERSHIP]: STAFF_LEADERSHIP,
};

/** กรองค่าจาก DB ให้เหลือเฉพาะสิทธิ์ที่ระบบรู้จัก (กันข้อมูลเก่า/พิมพ์ผิด) */
const sanitizePerms = (ps: unknown): Perm[] =>
  (Array.isArray(ps) ? ps : []).filter((p): p is Perm => ALL_PERMS.includes(p as Perm));

/**
 * คืนรายการสิทธิ์ทั้งหมดของผู้ใช้คนนี้
 * @param rolePerms ชุดสิทธิ์ที่แอดมินแก้เอง (จาก DB) — ไม่ส่ง = ใช้ค่าเริ่มต้น
 */
export function permsOf(actor: Actor | null | undefined, rolePerms?: RolePermsMap): Perm[] {
  if (!actor) return [];
  if (actor.role === ROLE_ADMINISTRATOR) return ALL_PERMS; // ผู้ดูแลระบบได้ทุกสิทธิ์เสมอ (แก้ไม่ได้ กันล็อกตัวเองออก)
  // พนักงาน + หัวหน้า คิดสิทธิ์ตามแผนกเหมือนกัน (บทบาทอื่นที่ระบบไม่รู้จัก → ปิดไว้ก่อน)
  if (actor.role !== ROLE_STAFF && actor.role !== ROLE_LEADER) return [];
  const map = rolePerms ?? DEFAULT_ROLE_PERMS;
  const dept = (actor.department ?? "").trim();
  if (map[dept]) return sanitizePerms(map[dept]);
  // คอนเทนต์: รับทั้งภาษาไทยและอังกฤษ (กันพิมพ์ใน Firebase คนละแบบ)
  const dl = dept.toLowerCase();
  if (dl === DEPT_CONTENT.toLowerCase() || dl === "content") return sanitizePerms(map[DEPT_CONTENT] ?? []);
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
  "coupons.manage",
  "staff.manage",
];

/** คำอธิบายสิทธิ์แต่ละตัว (ไว้แสดงหน้าตั้งค่า → แท็บบทบาท) — จัดกลุ่มเพื่ออ่านง่าย */
export const PERM_INFO: { group: string; perms: { perm: Perm; label: string }[] }[] = [
  {
    group: "📦 ออเดอร์",
    perms: [
      { perm: "admin.access", label: "เข้าหลังบ้านได้" },
      { perm: "orders.view", label: "ดูรายการออเดอร์" },
      { perm: "orders.viewAll", label: "เห็นออเดอร์ทุกสถานะ + ผลประเมินความพึงพอใจ (ไม่มี = เห็นเฉพาะคิวแพ็ค)" },
      { perm: "orders.money", label: "เห็นราคา ยอดเงิน สลิปโอน และกดยืนยันการชำระเงิน" },
      { perm: "orders.edit", label: "แก้ที่อยู่/สถานะออเดอร์ · หมายเหตุใบงาน · ข้ามด่านตรวจได้ (มีบันทึก log)" },
      { perm: "orders.cancel", label: "ยกเลิกออเดอร์" },
    ],
  },
  {
    group: "🎨 งานแบบ & แพ็ค",
    perms: [
      { perm: "proof.manage", label: "อัปโหลด/ลบภาพแบบงาน + ติ๊กงานตัวอย่าง (งานกราฟฟิก)" },
      { perm: "pack.check", label: "ตรวจนับของ · ยืนยันอ่านรายละเอียด · ยืนยันใส่งานตัวอย่าง" },
      { perm: "pack.ship", label: "ยิงเลขพัสดุเข้าระบบ (ต้องผ่านด่านตรวจครบ ข้ามเองไม่ได้)" },
    ],
  },
  {
    group: "🏷️ สินค้า",
    perms: [
      { perm: "products.view", label: "ดูรายการสินค้า" },
      { perm: "products.manage", label: "เพิ่ม/แก้/ลบสินค้า และแก้ราคา" },
      { perm: "products.import", label: "ดึงสินค้าจาก URL มาเป็นสินค้าใหม่" },
      { perm: "products.importOverwrite", label: "นำเข้าแบบทับสินค้าเดิม (ทับราคา/ตัวเลือกเดิม)" },
    ],
  },
  {
    group: "⚙️ ระบบ",
    perms: [
      { perm: "presets.manage", label: "จัดการคลังตัวเลือกกลาง" },
      { perm: "coupons.manage", label: "สร้าง/แจก/ยกเลิกคูปองส่วนลด" },
      { perm: "settings.manage", label: "ตั้งค่าระบบ — ข้อมูลร้าน บัญชี ค่าส่ง ระดับสมาชิก คูปองต้อนรับ" },
      { perm: "staff.manage", label: "กำหนดบทบาท/แผนกให้พนักงาน (ตั้งระดับผู้ดูแลระบบได้เฉพาะผู้ดูแลระบบ)" },
    ],
  },
];

/** ผู้ใช้คนนี้ทำสิ่งนี้ได้ไหม */
export function can(actor: Actor | null | undefined, perm: Perm, rolePerms?: RolePermsMap): boolean {
  return permsOf(actor, rolePerms).includes(perm);
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

/**
 * สถานะออเดอร์ที่ "เป็นงานของกราฟฟิก" — ตั้งแต่เงินเข้าจนลูกค้าอนุมัติแบบ
 * เลย "อนุมัติแบบ" ไปแล้วถือว่างานแบบจบ ส่งต่อฝ่ายผลิต/แพ็ค
 */
export const GRAPHIC_QUEUE_STATUSES = ["ชำระแล้ว", "รอตรวจแบบ", "แก้ไขแบบ"];
