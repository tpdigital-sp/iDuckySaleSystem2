import type { Order } from "@/lib/admin-data";
import { syncOrderEarlyPay } from "./order-early-pay";
import type { getSupabaseAdmin } from "./supabase-admin";

type SB = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * 🚪 ประตูเดียวสำหรับเขียนตาราง orders — ทุก route/lib ต้องผ่านตัวนี้
 *
 * ทำไม (เจ้าของร้านทัก 14 ก.ย. 69 "ส่วนลดในชม. ขึ้นบ้างไม่ขึ้นบ้าง"):
 * เดิมมี 37 จุดในโค้ดที่ยิง sb.from("orders").insert/update เองคนละที่ กติกาที่ต้องคิดตอนบันทึก
 * (ส่วนลดโอนไว) เลยถูกเขียนไว้แค่ 2 จุด ทางเข้าอื่นที่สร้าง/แก้รายการได้ก็เงียบไป — และทุกครั้งที่มี
 * ทางเข้าใหม่ คนเขียนต้องจำเองว่าต้องเติมกฎ ไม่มีอะไรเตือน (หายไปแล้ว 2 รอบ: 10 ก.ย. และ 14 ก.ย.)
 *
 * ตัวนี้บังคับให้กฎ "คิดตอนบันทึก" อยู่ที่เดียว ทางเข้าใหม่ได้ไปด้วยอัตโนมัติ
 * มีสคริปต์ scripts/check-order-writes.mjs กันคนเผลอกลับไปยิงตรง (รันอัตโนมัติตอน build)
 *
 * ⚠️ ผู้เรียกต้องใช้ออเดอร์ที่ "คืนกลับมา" ไปตอบลูกค้า/แจ้งไลน์ต่อ — ไม่ใช่ก้อนที่ส่งเข้ามา
 *    เพราะกฎที่คิดตอนบันทึกอาจเปลี่ยนยอดบิล (ดู syncOrderEarlyPay)
 */
export interface WriteOrderResult {
  /** ก้อนที่บันทึกลงฐานจริง (ผ่านกฎกลางแล้ว) */
  order: Order;
  /** ข้อผิดพลาดจากฐาน (คงรูปเดิมของ Supabase ไว้ — บางที่เช็ค error.code ว่าตารางยังไม่ถูกสร้าง) */
  error?: { message: string; code?: string } | null;
}

/**
 * items/ราคาเปลี่ยนไหมเทียบกับก้อนก่อนหน้า — ใช้ตัดสินว่าต้องคิดกฎ "ตอนบันทึก" ใหม่หรือไม่
 * (บันทึกเรื่องอื่น เช่น ผูกไลน์ · ปริ้นใบงาน · cron ต้องไม่ไปสตาร์ทนาฬิกาส่วนลดใหม่ให้ใบเก่า)
 */
export function itemsChanged(prev: Order | null | undefined, next: Order): boolean {
  return itemsFingerprint(prev) !== itemsFingerprint(next);
}

function itemsFingerprint(o: Order | null | undefined): string {
  return (o?.items ?? [])
    .map((i) => `${i.productId}|${i.qty}|${i.unitPrice}|${i.discount ?? 0}|${i.discountPct ?? 0}`)
    .join("¦");
}

/** สร้างออเดอร์ใหม่ (insert) — ใบใหม่ = รายการเปลี่ยนเสมอ จึงคิดกฎตอนบันทึกให้ทุกครั้ง */
export async function insertOrder(sb: SB, order: Order, by = "ระบบ"): Promise<WriteOrderResult> {
  const final = await syncOrderEarlyPay(sb, order, by);
  const { error } = await sb.from("orders").insert({ id: final.id, data: final });
  return { order: final, error };
}

/**
 * บันทึกทับออเดอร์เดิม (update)
 * prev = ก้อนก่อนหน้าที่ผู้เรียกอ่านมาแล้ว (ไม่ส่งมา = ตัวนี้อ่านให้เอง เสียอีก 1 query แต่ไม่พลาดกฎ)
 */
export async function updateOrder(sb: SB, order: Order, opts?: { prev?: Order | null; by?: string }): Promise<WriteOrderResult> {
  let prev = opts?.prev;
  if (prev === undefined) {
    const { data } = await sb.from("orders").select("data").eq("id", order.id).maybeSingle();
    prev = (data?.data as Order | undefined) ?? null;
  }
  const changed = itemsChanged(prev, order);
  const final = changed ? await syncOrderEarlyPay(sb, order, opts?.by ?? "ระบบ") : order;
  const { error } = await sb.from("orders").update({ data: final }).eq("id", final.id);
  return { order: final, error };
}
