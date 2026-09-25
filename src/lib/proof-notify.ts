import { proofsOf, type Order } from "@/lib/admin-data";

/**
 * 📣 แจ้งลูกค้า "ครั้งเดียว" ว่ามีแบบงานให้ตรวจ — ใช้ร่วมกันทั้งหน้าจอ (แถบเตือน) / API ปุ่มกด / cron
 *
 * เดิม API อัปโหลดยิงไลน์ทุกไฟล์ → อัป 10 รูป ลูกค้าโดน 10 ข้อความ
 * ตอนนี้อัปโหลดเงียบ แล้วนับรูปที่ "อัป/แก้หลัง order.proofNotifiedAt" เป็นรูปค้างแจ้ง
 * กราฟฟิกกดปุ่ม 📣 ทีเดียว · ไม่กดภายใน PROOF_AUTO_NOTIFY_MINUTES นาที cron แจ้งให้เอง
 */

/** รูปที่อัปก่อนเวลานี้ = ยุคเก่าที่ยิงไลน์ต่อไฟล์ไปแล้ว ไม่ต้องนับเป็นค้างแจ้ง (กัน cron ยิงย้อนหลังทุกใบตอนขึ้นระบบ) */
export const PROOF_NOTIFY_SINCE = "2026-09-09T10:30:00+07:00";

/** ค้างแจ้งเกินกี่นาทีให้ระบบแจ้งเอง */
export const PROOF_AUTO_NOTIFY_MINUTES = 30;

export interface PendingProofs {
  /** แบบใหม่ (อัปเพิ่ม/เปลี่ยนรูปที่ลูกค้ายังไม่ได้ขอแก้) */
  added: number;
  /** รูปที่แก้ตามคำขอลูกค้า (revisedAt) */
  revised: number;
  /** รวมทั้งหมด */
  total: number;
  /** เวลารูปค้างแจ้งที่เก่าสุด (ISO) — ใช้ตัดสิน "ค้างเกิน 30 นาที" */
  oldestAt?: string;
  /** จำนวนค้างแจ้งแยกตามลำดับรายการสินค้า (index → จำนวน) */
  perItem: Record<number, number>;
}

/** นับรูปแบบงานที่ยังไม่ได้แจ้งลูกค้า — รูปที่ลูกค้าอนุมัติแล้วไม่นับ (เช่นชุดที่ระบบอนุมัติให้เองจากเทมเพลต) */
export function pendingProofs(order: Order): PendingProofs {
  const since = Math.max(Date.parse(order.proofNotifiedAt ?? "") || 0, Date.parse(PROOF_NOTIFY_SINCE));
  const out: PendingProofs = { added: 0, revised: 0, total: 0, perItem: {} };
  let oldest = Infinity;
  order.items?.forEach((it, i) => {
    for (const p of proofsOf(it)) {
      if (p.review === "อนุมัติ") continue;
      const rev = Date.parse(p.revisedAt ?? "") || 0;
      const at = Date.parse(p.at) || 0;
      const t = Math.max(rev, at);
      if (t <= since) continue;
      if (rev > since) out.revised++;
      else out.added++;
      out.total++;
      out.perItem[i] = (out.perItem[i] ?? 0) + 1;
      if (t < oldest) oldest = t;
    }
  });
  if (out.total) out.oldestAt = new Date(oldest).toISOString();
  return out;
}

/** ค้างแจ้งนานเกินกำหนดแล้ว → cron ต้องแจ้งให้ */
export function proofNotifyOverdue(order: Order, now = Date.now()): boolean {
  const p = pendingProofs(order);
  return !!p.oldestAt && now - Date.parse(p.oldestAt) >= PROOF_AUTO_NOTIFY_MINUTES * 60_000;
}

/** ข้อความสรุปสำหรับแถบเตือนในหน้าออเดอร์ */
export function pendingProofsLabel(p: PendingProofs): string {
  if (p.added && p.revised) return `แบบใหม่ ${p.added} รูป + แก้ตามที่ขอ ${p.revised} รูป`;
  if (p.revised) return `แก้รูปตามที่ลูกค้าขอ ${p.revised} รูป`;
  return `แบบใหม่ ${p.added} รูป`;
}

/** ผลการแจ้งแบบงานครั้งล่าสุด — อ่านจากประวัติออเดอร์ (บรรทัด "แจ้งลูกค้าทางไลน์…" ที่รายละเอียดขึ้นต้น "แบบงาน") */
export interface LastProofNotify {
  ok: boolean;
  at: string;
  /** เหตุผลตอนไม่ถึง เช่น "ยังไม่ได้ผูก LINE ของลูกค้ากับออเดอร์นี้" */
  reason?: string;
  /** ไม่ถึงเพราะใบยังไม่ได้ผูก LINE — ผูกเมื่อไหร่ระบบส่งย้อนหลังให้เอง ไม่ต้องกดซ้ำ */
  unbound: boolean;
}

/**
 * ⚠️ order.proofNotifiedAt ปักเวลาแม้ส่ง "ไม่ถึง" (กันเตือน/ยิงซ้ำทุก 10 นาที) — กล่องใต้แบบงานเคยอ่านค่านี้แล้วขึ้น
 * "แจ้งลูกค้าแล้ว · 10:57" ทั้งที่ประวัติบอกไม่สำเร็จ (เจ้าของร้านถาม 25 ก.ย. 69 "ปุ่มนี้กดแล้วแจ้งเตือนไหม")
 * ตัวนี้ตอบตามจริง: หาบรรทัดแบบงานล่าสุด · ถ้าล้มแต่มี "ส่งย้อนหลังหลังผูก LINE" ตามหลัง = ถึงแล้ว
 */
export function lastProofNotify(order: Order): LastProofNotify | null {
  const log = order.log ?? [];
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (!e.action?.startsWith("แจ้งลูกค้าทางไลน์")) continue;
    const d = e.detail ?? "";
    if (e.action === "แจ้งลูกค้าทางไลน์แล้ว" && d.includes("ส่งย้อนหลังหลังผูก LINE")) return { ok: true, at: e.at, unbound: false };
    if (!d.startsWith("แบบงาน")) continue;
    if (e.action === "แจ้งลูกค้าทางไลน์แล้ว") return { ok: true, at: e.at, unbound: false };
    const reason = d.split(" · ").slice(-1)[0];
    return { ok: false, at: e.at, reason, unbound: reason.includes("ยังไม่ได้ผูก LINE") };
  }
  return null;
}
