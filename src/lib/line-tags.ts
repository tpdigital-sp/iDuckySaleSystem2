/**
 * 🏷 ป้ายความเร่งด่วนของลูกค้า LINE — ติดได้คนละ 1 ป้าย (ไม่ติดก็ได้)
 *
 * เจ้าของร้านสั่ง 15 ก.ย. 69: เริ่มจาก 3 ป้ายนี้ก่อน
 * เพิ่มป้ายใหม่ = เติมในตารางนี้ที่เดียว หน้าจอ/ตัวกรอง/ด่านตรวจฝั่งเซิร์ฟเวอร์ตามให้เอง
 *
 * ⚠️ สีต้องอ้าง token ของหลังบ้าน (--dk-*) ห้ามเขียน hex ตรง ๆ
 *    ป้ายต้องแยกออกจากกันด้วย "อีโมจิ + คำ" ด้วย ไม่ใช่สีอย่างเดียว (คนตาบอดสี/จอกลางแดด)
 */
export const CUSTOMER_TAGS = [
  {
    key: "urgent",
    label: "ด่วนมาก",
    dot: "🔴",
    /** สีแถบซ้ายของแถว */
    tone: "var(--dk-coral-deep)",
    wash: "var(--dk-coral-wash)",
    ink: "var(--dk-coral-ink)",
  },
  {
    key: "rush",
    label: "เร่งดำเนินการ",
    dot: "🟡",
    tone: "var(--dk-yolk-deep)",
    wash: "var(--dk-yolk-wash)",
    ink: "var(--dk-yolk-ink)",
  },
  {
    key: "normal",
    label: "งานปกติ",
    dot: "🟢",
    tone: "var(--dk-mint)",
    wash: "var(--dk-mint-wash)",
    ink: "var(--dk-mint-ink)",
  },
] as const;

export type CustomerTag = (typeof CUSTOMER_TAGS)[number]["key"];

export const TAG_KEYS: CustomerTag[] = CUSTOMER_TAGS.map((t) => t.key);

/** ค่าที่อ่านจากฐาน/รับจากหน้าเว็บ → ป้ายที่ระบบรู้จัก (อย่างอื่นถือว่าไม่ติดป้าย) */
export function toCustomerTag(v: unknown): CustomerTag | null {
  const s = typeof v === "string" ? v.trim() : "";
  return (TAG_KEYS as string[]).includes(s) ? (s as CustomerTag) : null;
}

export const tagInfo = (k: CustomerTag) => CUSTOMER_TAGS.find((t) => t.key === k)!;
