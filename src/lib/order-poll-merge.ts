import type { Order } from "@/lib/admin-data";

/**
 * ✍️ ช่องข้อมูลลูกค้าในหน้าออเดอร์ที่ "พิมพ์แล้วบันทึกตอน blur" — ระหว่างพิมพ์ยังไม่ถึงฐาน
 *
 * ทำไม (18 ก.ย. 69 · OD-260917-6834 "ที่อยู่หายไปไหน"): หน้าออเดอร์โพลทุก 15 วิ แล้ว setOrder(ก้อนจากเซิร์ฟเวอร์) ทั้งก้อน
 * เช็ค "กำลังพิมพ์อยู่ไหม" เฉพาะก่อนยิงคำขอ — ถ้าพนักงานคลิกเข้าช่องที่อยู่แล้ววางข้อความระหว่างรอคำตอบ
 * ก้อนที่ตอบกลับทับ state → ที่อยู่ที่เพิ่งวางหายจากจอ · blur ต่อมาบันทึกช่องว่าง (เท่ากับฐาน = ไม่มี log) → ฐานไม่เคยได้ที่อยู่
 */
export type TypedField = "customer" | "phone" | "address";

/** กำลังพิมพ์ในช่องกรอก/หมายเหตุ (contentEditable) อยู่ไหม — ตอนนั้นห้ามเอาก้อนจากเซิร์ฟเวอร์มาทับจอ */
export function isTypingIn(el: Element | null): boolean {
  if (!el) return false;
  if (typeof HTMLInputElement !== "undefined" && el instanceof HTMLInputElement) return true;
  if (typeof HTMLTextAreaElement !== "undefined" && el instanceof HTMLTextAreaElement) return true;
  if (typeof HTMLSelectElement !== "undefined" && el instanceof HTMLSelectElement) return true;
  return !!(el as HTMLElement).isContentEditable;
}

/**
 * รับก้อนใหม่จากโพล แต่คงช่องที่พิมพ์ค้างไว้ (dirty) จากจอ — ตอน blur จะเห็นว่าต่างจาก base แล้วส่งไปบันทึกเอง
 * ช่อง dirty ที่ค่าเท่ากับก้อนใหม่อยู่แล้ว = ไม่ต้องคง (คนอื่นบันทึกค่าเดียวกันไว้ก่อน) · คนละใบ/ยังไม่มี state = รับก้อนใหม่ทั้งก้อน
 */
export function keepUnsavedTyped(cur: Order | null, found: Order, dirty: ReadonlySet<TypedField>): Order {
  if (!cur || cur.id !== found.id) return found;
  const keep = [...dirty].filter((k) => (cur[k] ?? "") !== (found[k] ?? ""));
  if (!keep.length) return found;
  return { ...found, ...Object.fromEntries(keep.map((k) => [k, cur[k]])) };
}
