import "server-only";
import type { getSupabaseAdmin } from "./supabase-admin";
import { cleanSender } from "@/lib/order-sender";
import type { OrderSender } from "@/lib/admin-data";

type SB = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * 📮 "ผู้ส่งประจำ" ของตัวแทนจำหน่าย — ชื่อร้าน/เบอร์/ที่อยู่ที่จะพิมพ์บนกล่องแทนชื่อร้านเรา
 *
 * ตัวแทนตั้งเองได้ที่หน้า /dealer → ออเดอร์ใหม่ที่เขาล็อกอินสั่งจะติดไปให้เอง (ดู POST /api/orders)
 *
 * เก็บที่ไหน: `user_metadata.dealerSender` ของบัญชีเขาเอง
 *  - ตาราง products (แถว __dealers__) อ่าน public ได้ → ห้ามเก็บเบอร์/ที่อยู่ที่นั่น [[dealers.ts]]
 *  - ตาราง profiles ไม่มีช่อง jsonb (ต้อง migrate) · ข้อมูลชุดนี้เป็น "ข้อมูลของเจ้าตัว" ไม่ใช่สิทธิ์
 *    ต่อให้เจ้าตัวไปแก้ metadata เองก็แค่เปลี่ยนชื่อร้านตัวเอง (ต่างจากสถานะตัวแทนที่ห้ามอยู่ใน metadata)
 * ⚠️ อ่านออกมาต้อง cleanSender เสมอ (ค่าที่เจ้าตัวเขียนเองได้ = ไม่เชื่อความยาว/ชนิด)
 */
const META_KEY = "dealerSender";

/** ผู้ส่งประจำของบัญชีนี้ (ไม่เคยตั้ง = undefined) */
export async function loadDealerSender(sb: SB, uid: string): Promise<OrderSender | undefined> {
  if (!uid) return undefined;
  const { data, error } = await sb.auth.admin.getUserById(uid);
  if (error || !data.user) return undefined;
  const raw = (data.user.user_metadata ?? {})[META_KEY] as OrderSender | undefined;
  return cleanSender(raw);
}

/** ตั้ง/ล้างผู้ส่งประจำ — ผู้เรียกต้องยืนยันแล้วว่า uid นี้เป็นตัวแทนจริง (isDealerUid) */
export async function saveDealerSender(sb: SB, uid: string, sender: OrderSender | undefined): Promise<{ error?: string }> {
  const { data, error } = await sb.auth.admin.getUserById(uid);
  if (error || !data.user) return { error: error?.message ?? "ไม่พบบัญชีนี้" };
  const meta = { ...(data.user.user_metadata ?? {}) };
  if (sender) meta[META_KEY] = sender;
  else delete meta[META_KEY];
  const { error: e2 } = await sb.auth.admin.updateUserById(uid, { user_metadata: meta });
  return e2 ? { error: e2.message } : {};
}
