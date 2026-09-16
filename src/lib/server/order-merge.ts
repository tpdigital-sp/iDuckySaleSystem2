import type { Order } from "@/lib/admin-data";

/** ชื่อ header ที่หน้าออเดอร์ส่งรายชื่อช่องที่แก้จริงมาด้วย (ดู changedOrderKeys ใน order-repo.ts) */
export const CHANGED_KEYS_HEADER = "x-changed-keys";

/** อ่าน header → Set ของช่องที่แก้ · ไม่มี/อ่านพัง = null (เซิร์ฟเวอร์ทำแบบเดิม: ก้อนจากหน้าจอเป็นหลัก) */
export function parseChangedKeys(raw: string | null | undefined): Set<string> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as unknown;
    return Array.isArray(v) ? new Set(v.filter((k): k is string => typeof k === "string")) : null;
  } catch {
    return null;
  }
}

/**
 * 🧭 รวม 3 ทาง: ช่องที่หน้าจอ "ไม่ได้แก้" เอาจากฐานเสมอ · ช่องที่แก้เอาจากหน้าจอ
 *
 * ทำไม (16 ก.ย. 69 ต่อจาก OD-260915-6742): หน้าออเดอร์ส่งออเดอร์ทั้งก้อนจาก state ของตัวเอง เซิร์ฟเวอร์ไม่มีทางรู้ว่า
 * แอดมินตั้งใจแก้ช่องไหน → หน้าจอที่เปิดค้าง (โพลหยุดตอนเคอร์เซอร์อยู่ในช่องกรอก) ทับสิ่งที่ทางอื่นเพิ่งเขียนได้หมด:
 * รายการที่ลูกค้าสั่งเพิ่ม · คำขอแก้ไข · ผูกไลน์ · โยนโฟลเดอร์ผลิต · ปริ้นใบงาน · เงินเข้า (อันหลังมีด่านแยก order-money-guard)
 * ด่านเดิมกันได้แค่ฟิลด์ที่มีประทับเวลา (ติ๊ก/แบบงาน) — อันนี้กันทุกช่องระดับบนสุด
 *
 * หน้าจอส่ง header x-changed-keys = ช่องที่ต่างจากก้อนล่าสุดที่ได้จากเซิร์ฟเวอร์ (base) → ช่องนอกลิสต์คงค่าในฐาน
 * (รวมถึง "ในฐานไม่มี" = ลบออก · "ในฐานมีแต่หน้าจอไม่มี" = เติมกลับ)
 * ไม่มี header = null → คืน incoming ตามเดิม (หน้าจออื่น/เวอร์ชันเก่ายังทำงานได้)
 * ⚠️ ผู้เรียกต้องจัดการ items เอง (ต้องผ่าน reconcileItem ต่อรายการเมื่อแก้) — ตัวนี้ทับ items ทั้งชุดจากฐานเฉพาะเมื่อไม่ได้แก้
 */
/** ช่องที่เซิร์ฟเวอร์เป็นเจ้าของ/รวมเองอยู่แล้ว — คงจากฐานเงียบ ๆ ไม่ต้องรายงานว่า "กัน" (ไม่งั้น log รกทุกครั้งที่มีคนอื่นบันทึกก่อน) */
const SILENT = new Set(["id", "savedAt", "log"]);

export function applyChangedKeys(existing: Order, incoming: Order, changed: Set<string> | null): { order: Order; restored: string[] } {
  if (!changed) return { order: incoming, restored: [] };
  const out = { ...incoming } as unknown as Record<string, unknown>;
  const ex = existing as unknown as Record<string, unknown>;
  const inc = incoming as unknown as Record<string, unknown>;
  const restored: string[] = [];
  for (const k of new Set([...Object.keys(ex), ...Object.keys(inc)])) {
    if (k === "id" || changed.has(k)) continue;
    if (JSON.stringify(ex[k] ?? null) === JSON.stringify(inc[k] ?? null)) continue;
    if (k in ex) out[k] = ex[k];
    else delete out[k];
    if (!SILENT.has(k)) restored.push(k);
  }
  return { order: out as unknown as Order, restored };
}
