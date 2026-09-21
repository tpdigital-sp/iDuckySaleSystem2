import { reconcileOrderTax, withLog, type Order, type OrderItem } from "@/lib/admin-data";
import { syncOrderEarlyPay } from "./order-early-pay";
import { syncItemsToTP } from "./tp-report";
import { closeClaimsForDeliveredRedo } from "./claims-db";
import { alertNeedsPurchase, stampNeedsPurchaseAlert } from "./needs-purchase";
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

/**
 * ➕ ประทับเวลาให้ "รายการที่เพิ่มเข้าออเดอร์เดิมทีหลัง" (OrderItem.addedAt)
 *
 * ทำไม (เจ้าของร้าน/กราฟฟิกแจ้ง 15 ก.ย. 69 · OD-260910-1379):
 * การ์ดกราฟฟิกบนบอร์ด WIP ถูกสร้างครั้งเดียวตอนเงินก้อนแรกเข้า — ลูกค้าสั่งเพิ่มในออเดอร์เดิม
 * หลังกราฟฟิกทำแบบรอบแรกจบไปแล้ว เงินก้อนใหม่เข้าช่อง "สลิปใบเพิ่ม" ซึ่งบอร์ดข้ามทุกใบ
 * → ไม่มีการ์ดของงานที่เพิ่ม งานหายเงียบ · เวลานี้คือสิ่งที่บอร์ดเอาไปเทียบกับเวลาที่สร้างโฟลเดอร์
 *
 * จับคู่รายการเก่า-ใหม่แบบ multiset ด้วย productId|ชื่อ เท่านั้น — แก้จำนวน/ตัวเลือก/ราคาของบรรทัดเดิม
 * ไม่ถือว่าเป็นของใหม่ (ไม่ใช่งานแบบเพิ่ม) · บรรทัดที่เกินมาจากของเดิม = ของที่เพิ่ม
 * ใบใหม่ (ไม่มี prev) ไม่ประทับ — ของที่สั่งพร้อมกันตอนเปิดใบอยู่ในการ์ดแรกอยู่แล้ว
 */
function stampAddedItems(prev: Order | null | undefined, next: Order, at: string): Order {
  const before = prev?.items ?? [];
  if (!before.length) return next;
  const key = (i: OrderItem) => `${i.productId}|${i.name}`;
  const pool = new Map<string, OrderItem[]>();
  for (const i of before) {
    const k = key(i);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k)!.push(i);
  }
  let changed = false;
  const items = next.items.map((i) => {
    const old = pool.get(key(i))?.shift();   // จับคู่ก่อนเสมอ (ของเดิมตัวหนึ่งจับคู่ได้ครั้งเดียว)
    if (i.addedAt) return i;
    // บรรทัดเดิม — คงเวลาเดิมไว้ (หน้าจอเก่าที่ส่งก้อนไม่มีฟิลด์นี้มา ต้องไม่ทำให้เวลาที่ประทับไว้หาย)
    if (old && !old.addedAt) return i;
    changed = true;
    return { ...i, addedAt: old?.addedAt ?? at };
  });
  return changed ? { ...next, items } : next;
}

/**
 * 🕒 ประทับ "เซิร์ฟเวอร์เขียนใบนี้ล่าสุดเมื่อไหร่" ทุกครั้งที่เขียนฐาน
 *
 * ทำไม (OD-260915-6742 · 15 ก.ย. 69): เดิมมีแต่ PATCH /api/admin/orders ที่ประทับ savedAt
 * เงินเข้าจาก SlipOK · เก็บเพิ่ม · cron · แนบสลิป ไม่ขยับ savedAt เลย → หน้าจอที่เปิดค้างยังถือ
 * savedAt ตัวเดิม "ดูทันสมัย" ทั้งที่พลาดเรื่องเงินไปแล้ว ด่านกันหน้าจอค้าง (ดู reconcileFullEdit)
 * จึงมองไม่เห็นว่าหน้าจอนั้นเก่า — ลูกค้าโอนครบ แต่บันทึกจากหน้าจอค้างทับจนเงินหายทั้งใบ
 */
function stampSaved(o: Order): Order {
  return { ...o, savedAt: new Date().toISOString() };
}

/** สร้างออเดอร์ใหม่ (insert) — ใบใหม่ = รายการเปลี่ยนเสมอ จึงคิดกฎตอนบันทึกให้ทุกครั้ง */
export async function insertOrder(sb: SB, order: Order, by = "ระบบ"): Promise<WriteOrderResult> {
  // 🛒 ใบที่ติ๊ก "รอของเข้า" แล้วเกิดมาแบบจ่ายแล้วเลย (เช่น FlowAccount ที่ชำระแล้ว) → แจ้งให้สั่งของตั้งแต่ตอนสร้าง
  const np = stampNeedsPurchaseAlert(null, await syncOrderEarlyPay(sb, order, by));
  const final = stampSaved(np.order);
  const { error } = await sb.from("orders").insert({ id: final.id, data: final });
  if (!error && np.due) await alertNeedsPurchase(final);
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
  const by = opts?.by ?? "ระบบ";
  let final = changed ? await syncOrderEarlyPay(sb, order, by) : order;
  // ➕ ของที่เพิ่มเข้าใบเดิมทีหลัง — ประทับเวลาก่อนบันทึก (บอร์ด WIP กราฟฟิกใช้รู้ว่ามีงานเพิ่ม)
  final = stampAddedItems(prev, final, new Date().toISOString());
  /**
   * 🧾 ฐานภาษีขยับ (แก้รายการ/ค่าส่ง/ส่วนลด) → VAT กับหัก ณ ที่จ่ายต้องขยับตาม ไม่ใช่ค้างเลขของฐานเก่า
   * กติกาอยู่ใน reconcileOrderTax (admin-data.ts) — วางไว้ตรงนี้ที่เดียว ทางเข้าใหม่ได้ไปด้วยอัตโนมัติ
   */
  const tax = reconcileOrderTax(prev, final);
  if (tax) final = withLog(tax.order, by, "คิดภาษีใหม่ตามยอดที่แก้", `${tax.note} (ยอดรวมต้องตรงบิลที่ออกให้ลูกค้า)`);
  /**
   * 🛒 ใบ "รอของเข้า" เงินเข้าแล้ว (หรือเพิ่งติ๊กบนใบที่จ่ายแล้ว) → แจ้งกลุ่มไลน์ร้านให้สั่งของ ครั้งเดียวต่อการติ๊ก
   * วางที่ประตูเพราะเงินเข้าได้หลายทาง (SlipOK · แอดมินยืนยัน · สลิปใบเพิ่ม · เก็บตก) — ดู needs-purchase.ts
   */
  const np = stampNeedsPurchaseAlert(prev, final);
  final = np.order;
  // 🕒 ประทับเวลาบันทึกที่ประตู — ทางเข้าใหม่ได้ไปด้วยเอง ไม่ต้องจำว่าต้องเซ็ต savedAt เอง
  final = stampSaved(final);
  const { error } = await sb.from("orders").update({ data: final }).eq("id", final.id);
  if (!error && np.due) await alertNeedsPurchase(final);
  /**
   * 🏭 รายการเปลี่ยน → เรคอร์ดสะพาน (msVerify / การ์ดบอร์ด WIP กราฟฟิก) ต้องเห็นรายการชุดใหม่
   * ไม่งั้นการ์ดของออเดอร์ค้างโชว์รายการชุดแรก กราฟฟิกไม่รู้ว่าลูกค้าสั่งเพิ่มอะไรมา
   * fire-and-forget แบบเดียวกับ sync ตัวอื่นใน tp-report (พังเงียบ ไม่ทำให้บันทึกออเดอร์ล้ม)
   */
  if (!error && changed) await syncItemsToTP(final);
  /**
   * ✅ ใบงานเคลม "จัดส่งแล้ว/เสร็จสิ้น" → ปิดเคสในสมุดเคลมให้เอง (เจ้าของร้านสั่ง 21 ก.ย. 69)
   * เดิมต้องกดปิดเองที่หน้าเคลม ซึ่งไม่มีใครกลับไปกด → เคสค้าง "อนุมัติเคลม" ตลอดกาล ป้ายจำนวนไม่มีวันเป็น 0
   * ยิงเฉพาะตอน "สถานะเพิ่งเปลี่ยน" ในคำขอนี้ — บันทึกเรื่องอื่นบนใบเดิมจะได้ไม่ไปแตะเคสซ้ำ
   * ⏳ await: Netlify แช่เครื่องทันทีที่ตอบ · ตัวมันกลืน error เองอยู่แล้ว ไม่ทำให้บันทึกออเดอร์ล้ม
   */
  if (!error && final.claimOf && prev?.status !== final.status) await closeClaimsForDeliveredRedo(sb, final, by);
  return { order: final, error };
}
