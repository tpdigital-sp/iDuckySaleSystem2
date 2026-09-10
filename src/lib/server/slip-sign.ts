import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order } from "@/lib/admin-data";

const BUCKET = "payment-slips-private";
const TTL = 3600;

/**
 * เซ็นลิงก์สลิปทุกใบของออเดอร์ให้ดูรูปได้ (ชั่วคราว 1 ชม. — ห้ามเก็บลงฐาน)
 * ช่องแรก → slipUrl · งวดหลัง → deposit.balanceSlipUrl · ใบเพิ่ม → payments[].url
 * ยิงขนานกันทั้งหมด — ใช้ทั้ง GET ?id= ของแอดมิน · SSR หน้าออเดอร์ · /api/orders/view ของลูกค้า · หลังแนบ/ตรวจซ้ำ
 */
export async function signPaymentUrls(sb: SupabaseClient, order: Order): Promise<Order> {
  const jobs: Promise<void>[] = [];
  const out: Order = { ...order };
  const sign = (path: string) => sb.storage.from(BUCKET).createSignedUrl(path, TTL).then((r) => r.data?.signedUrl ?? undefined).catch(() => undefined);

  if (order.slipPath) jobs.push(sign(order.slipPath).then((u) => void (u && (out.slipUrl = u))));
  if (order.deposit?.balanceSlipPath)
    jobs.push(sign(order.deposit.balanceSlipPath).then((u) => void (u && (out.deposit = { ...out.deposit!, balanceSlipUrl: u }))));
  if (order.payments?.length) {
    const list = order.payments.map((p) => ({ ...p }));
    out.payments = list;
    list.forEach((p, i) => jobs.push(sign(p.path).then((u) => void (u && (list[i] = { ...list[i], url: u })))));
  }
  await Promise.all(jobs);
  return out;
}

/** ล้าง signed URL ชั่วคราวออกก่อนบันทึกลงฐาน (หน้าจอส่งก้อนที่มี url ติดมา) */
export function stripPaymentUrls(order: Order): Order {
  let o = order;
  if (o.slipPath && o.slipUrl) o = { ...o, slipUrl: undefined };
  if (o.deposit?.balanceSlipUrl) o = { ...o, deposit: { ...o.deposit, balanceSlipUrl: undefined } };
  if (o.payments?.some((p) => p.url)) o = { ...o, payments: o.payments.map((p) => (p.url ? { ...p, url: undefined } : p)) };
  return o;
}
