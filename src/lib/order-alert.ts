/**
 * 🔔 แจ้งเตือนเด้ง (Order.alertNote) — กติกาล้วน ไม่แตะ DB (เทส: npm run check:order-alert)
 * route /api/admin/orders/alert เรียก applyOrderAlert · PATCH ทั้งก้อนเรียก keepServerAlert
 */
import { withLog, type Order } from "@/lib/admin-data";

export type OrderAlertAction = { text?: string; dismiss?: boolean; reopen?: boolean };

/** ผลของคำสั่ง — null = ไม่ต้องเขียน (ค่าตรงกับที่ขออยู่แล้ว) */
export function applyOrderAlert(o: Order, act: OrderAlertAction, by: string, now: string): Order | null {
  const cur = o.alertNote;
  if (act.dismiss) {
    if (!cur || cur.dismissedAt) return null;
    return withLog({ ...o, alertNote: { ...cur, dismissedAt: now, dismissedBy: by } }, by, "🔔 ปิดแจ้งเตือน", cur.text);
  }
  if (act.reopen) {
    if (!cur) return null;
    const { dismissedAt: _d, dismissedBy: _b, ...rest } = cur;
    void _d;
    void _b;
    return withLog({ ...o, alertNote: { ...rest, at: now } }, by, "🔔 เปิดแจ้งเตือนอีกครั้ง", cur.text);
  }
  const text = (act.text ?? "").trim().slice(0, 1000);
  if (!text) {
    if (!cur) return null;
    const { alertNote: _a, ...rest } = o;
    void _a;
    return withLog(rest as Order, by, "🔔 ลบแจ้งเตือน", cur.text);
  }
  if (cur && cur.text === text && !cur.dismissedAt) return null;
  return withLog({ ...o, alertNote: { text, by, at: now } }, by, cur ? "🔔 แก้แจ้งเตือน" : "🔔 ตั้งแจ้งเตือน", text);
}

/** PATCH ทั้งก้อน: alertNote เป็นของเซิร์ฟเวอร์ — ยึดค่าใน DB เสมอ หน้าจอที่ถือสำเนาเก่าห้ามลบ/ทับ */
export function keepServerAlert(existing: Order, toSave: Order): Order {
  if (existing.alertNote) return { ...toSave, alertNote: existing.alertNote };
  if (!toSave.alertNote) return toSave;
  const { alertNote: _an, ...rest } = toSave;
  void _an;
  return rest as Order;
}
