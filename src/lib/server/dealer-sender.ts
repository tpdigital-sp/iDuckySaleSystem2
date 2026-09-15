import "server-only";
import type { getSupabaseAdmin } from "./supabase-admin";
import { cleanSender } from "@/lib/order-sender";
import type { Order, OrderSender } from "@/lib/admin-data";
import { loadDealers } from "./dealers";

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

/**
 * 🔎 ใบนี้เป็นของตัวแทนคนไหน — คืน uid ในทะเบียน __dealers__ (ไม่รู้ = "")
 *
 * ทำไมไม่ดู customerId อย่างเดียว (เจอจริง 15 ก.ย. 69 · OD-260915-3447):
 * ตัวแทนลืมล็อกอินแล้วสั่ง → ใบไม่มี customerId เลย แอดมินมากดปุ่ม 🤝 คิดราคาตัวแทนทีหลัง
 * ตัวตนที่ยังเหลืออยู่บนใบคือ LINE ที่พนักงานผูกไว้ / อีเมลผู้สั่ง → ไล่จับตามลำดับความแน่นอน
 * ⚠️ ห้ามจับด้วย order.phone — ใบตัวแทนส่งถึง "ลูกค้าปลายทางของตัวแทน" เบอร์ในใบจึงเป็นของผู้รับ ไม่ใช่คนสั่ง
 *    (เบอร์ผู้รับบังเอิญตรงกับเบอร์ตัวแทนอีกคน = ชื่อร้านคนอื่นไปโผล่บนกล่อง)
 */
export async function resolveDealerUid(sb: SB, order: Pick<Order, "customerId" | "lineUserId" | "email" | "phone">): Promise<string> {
  const users = await loadDealers();
  const uids = Object.keys(users);
  if (!uids.length) return "";
  if (order.customerId && order.customerId in users) return order.customerId;

  const line = (order.lineUserId ?? "").trim();
  const email = (order.email ?? "").trim().toLowerCase();
  if (!line && !email) return ""; // ไม่รู้ว่าใครสั่ง = ไม่เดา (แอดมินกรอกผู้ส่งเองในหน้าออเดอร์)

  for (const uid of uids) {
    const { data } = await sb.auth.admin.getUserById(uid);
    const u = data?.user;
    if (!u) continue;
    const meta = (u.user_metadata ?? {}) as { line_user_id?: string };
    if (line && meta.line_user_id === line) return uid;
    if (email && (u.email ?? "").toLowerCase() === email) return uid;
  }
  return "";
}

/** ผู้ส่งประจำของตัวแทนเจ้าของใบนี้ (ไม่ใช่ใบตัวแทน/หาเจ้าของไม่เจอ/ยังไม่ตั้ง = undefined) */
export async function dealerSenderForOrder(sb: SB, order: Pick<Order, "dealer" | "customerId" | "lineUserId" | "email" | "phone">): Promise<OrderSender | undefined> {
  if (!order.dealer) return undefined;
  const uid = await resolveDealerUid(sb, order);
  return uid ? loadDealerSender(sb, uid) : undefined;
}
