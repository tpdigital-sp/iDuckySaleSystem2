import "server-only";
import { cookies, headers } from "next/headers";
import { canPack, PACK_SCAN_HEADER } from "@/lib/permissions";
import { currentActor } from "@/lib/server/require-perm";
import { loadRolePerms } from "@/lib/server/role-perms";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Order } from "@/lib/admin-data";
export { SSR_ORDER_SCRIPT_ID } from "@/lib/ssr-order-id";

/**
 * ออเดอร์ใบเดียวสำหรับ "แปะมากับ HTML" ของหน้ารายละเอียด (SSR)
 *
 * ทำไมต้องมี: บนเว็บจริง (Netlify serverless) ทุกคำขอ API เสียเวลาเรียก function ~0.6-0.8 วิ
 * แม้แต่คำขอที่ไม่แตะฐานข้อมูล · หน้ารายละเอียดจึงเคยเสีย 2 รอบ (HTML รอบหนึ่ง + เรียก API
 * ขอออเดอร์อีกรอบ) กว่าจะเห็นข้อมูล ~2 วินาที ทั้งที่ในเครื่อง (dev) เร็วกว่ามากเพราะไม่มีค่านี้
 * เอาข้อมูลใส่มากับ HTML รอบแรกเลย → เห็นข้อมูลทันทีที่ JS ทำงาน ไม่ต้องรออีกรอบ
 *
 * ⚠️ ตรวจสิทธิ์เหมือน GET /api/admin/orders ทุกอย่าง — ไม่มีสิทธิ์คืน null (หน้าเว็บจะไปขอทาง API
 * ตามปกติแล้วเจอ 401 เอง) · ไม่ดึง loginLine (ต้องเรียก Supabase Auth เพิ่มอีกรอบ = ถ่วง HTML)
 * ฝั่งหน้าเว็บขอ API ต่อเบื้องหลังอยู่แล้ว ข้อมูลส่วนนั้นจะตามมาเอง
 */
export async function orderForSsr(id: string): Promise<Order | null> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return null;
    const actor = await currentActor();
    if (!actor) return null;
    const scanned = (await headers()).get(PACK_SCAN_HEADER) === "1";
    if (!canPack(actor, "orders.view", await loadRolePerms(), scanned)) return null;
    void (await cookies()); // หน้าเป็น dynamic อยู่แล้ว (อ่านคุกกี้ตอนตรวจสิทธิ์) — ประกาศให้ชัด

    const { data, error } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
    if (error || !data) return null;
    const order = data.data as Order;

    // ลิงก์สลิปใน bucket ส่วนตัว — เซ็นสองงวดขนานกัน (เหมือน GET ?id=)
    const [first, balance] = await Promise.all([
      order.slipPath
        ? sb.storage.from("payment-slips-private").createSignedUrl(order.slipPath, 3600)
        : Promise.resolve(null),
      order.deposit?.balanceSlipPath
        ? sb.storage.from("payment-slips-private").createSignedUrl(order.deposit.balanceSlipPath, 3600)
        : Promise.resolve(null),
    ]);
    if (first?.data?.signedUrl) order.slipUrl = first.data.signedUrl;
    if (balance?.data?.signedUrl && order.deposit)
      order.deposit = { ...order.deposit, balanceSlipUrl: balance.data.signedUrl };
    return order;
  } catch {
    return null; // พังเมื่อไหร่ก็แค่กลับไปโหลดแบบเดิม (หน้าเว็บขอ API เอง)
  }
}
