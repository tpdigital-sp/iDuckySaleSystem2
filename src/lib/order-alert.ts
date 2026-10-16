/**
 * 🔔 แจ้งเตือนเด้ง (Order.alertNote) — กติกาล้วน ไม่แตะ DB (เทส: npm run check:order-alert)
 * route /api/admin/orders/alert เรียก applyOrderAlert · PATCH ทั้งก้อนเรียก keepServerAlert
 *
 * ใครปิดได้ (พนักงานขอ 16 ต.ค. 69 — "มีคนปิดแจ้งเตือนก่อนจะไปถึงห้องแพ็ค"):
 *   ปิด/ลบ = คนตั้งเอง (byUser) หรือผู้ดูแลระบบ · คนอื่นกด "รับทราบ" ได้อย่างเดียว (บันทึกชื่อไว้ให้คนตั้งดู)
 *   หยุดเด้งเองเมื่อสถานะ เสร็จสิ้น/ยกเลิก (orderAlertActive)
 */
import { orderAlertActive, withLog, type Order, type OrderAlertNote } from "@/lib/admin-data";

export type OrderAlertAction = { text?: string; dismiss?: boolean; reopen?: boolean; ack?: boolean };

/** ตัวตนคนที่กำลังกด — username ว่าง = หน้าจอยังไม่รู้ (โหมดตัวอย่าง) */
export type AlertWho = { username: string; name: string; isAdministrator?: boolean };

/** เป็นคนตั้งแจ้งเตือนนี้ไหม — ใบใหม่เทียบ username · ใบเก่า (ไม่มี byUser) เทียบชื่อที่แสดง */
export function isAlertOwner(a: Pick<OrderAlertNote, "by" | "byUser"> | null | undefined, who: AlertWho): boolean {
  if (!a) return false;
  if (a.byUser) return !!who.username && a.byUser === who.username;
  return !!who.name.trim() && a.by.trim() === who.name.trim();
}

/** ปิด/ลบแจ้งเตือนได้ไหม — คนตั้ง หรือผู้ดูแลระบบ (เจ้าของร้าน) เท่านั้น */
export function mayDismissAlert(a: Pick<OrderAlertNote, "by" | "byUser"> | null | undefined, who: AlertWho): boolean {
  if (!a) return false;
  return !!who.isAdministrator || isAlertOwner(a, who);
}

/** ข้อความบอกว่าทำไมปิดไม่ได้ (ไว้โชว์ที่ปุ่ม/ตอบ 403) */
export const alertDismissDenied = (a: Pick<OrderAlertNote, "by">) => `ปิดแจ้งเตือนได้เฉพาะ ${a.by} ที่ตั้งไว้ — หยุดเด้งเองเมื่อใบเสร็จสิ้น`;

/** ผลของคำสั่ง — null = ไม่ต้องเขียน (ค่าตรงกับที่ขออยู่แล้ว) · byUser = username คนกด (ลง byUser/acks.user) */
export function applyOrderAlert(o: Order, act: OrderAlertAction, by: string, now: string, byUser?: string): Order | null {
  const cur = o.alertNote;
  if (act.ack) {
    if (!cur || !orderAlertActive(o)) return null;
    const same = (x: { by: string; user?: string }) => (byUser && x.user ? x.user === byUser : x.by === by);
    if ((cur.acks ?? []).some(same)) return null;
    const acks = [...(cur.acks ?? []), { by, ...(byUser ? { user: byUser } : {}), at: now }].slice(-50);
    return withLog({ ...o, alertNote: { ...cur, acks } }, by, "👀 รับทราบแจ้งเตือน", cur.text);
  }
  if (act.dismiss) {
    if (!cur || cur.dismissedAt) return null;
    return withLog({ ...o, alertNote: { ...cur, dismissedAt: now, dismissedBy: by } }, by, "🔔 ปิดแจ้งเตือน", cur.text);
  }
  if (act.reopen) {
    if (!cur) return null;
    const { dismissedAt: _d, dismissedBy: _b, acks: _k, ...rest } = cur;
    void _d;
    void _b;
    void _k;
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
  return withLog(
    { ...o, alertNote: { text, by, ...(byUser ? { byUser } : {}), at: now } },
    by,
    cur ? "🔔 แก้แจ้งเตือน" : "🔔 ตั้งแจ้งเตือน",
    text
  );
}

/** PATCH ทั้งก้อน: alertNote เป็นของเซิร์ฟเวอร์ — ยึดค่าใน DB เสมอ หน้าจอที่ถือสำเนาเก่าห้ามลบ/ทับ */
export function keepServerAlert(existing: Order, toSave: Order): Order {
  if (existing.alertNote) return { ...toSave, alertNote: existing.alertNote };
  if (!toSave.alertNote) return toSave;
  const { alertNote: _an, ...rest } = toSave;
  void _an;
  return rest as Order;
}
