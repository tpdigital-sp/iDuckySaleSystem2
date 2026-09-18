import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderAwaitingStock, orderTotal, withLog, type Order, type OrderStatus } from "@/lib/admin-data";
import { updateOrder } from "@/lib/server/order-write";
import { notifyStockArrived } from "@/lib/server/needs-purchase";
import { syncStockWaitToTP } from "@/lib/server/tp-report";

export const runtime = "nodejs";

/**
 * 🛒 รอของเข้า — เมนู /admin/stock-wait (กลุ่มกราฟฟิก) + ตัวเลขป้ายข้างเมนู (เจ้าของร้านสั่ง 17 ก.ย. 69)
 *
 * รวมทุกใบที่แอดมินติ๊ก "รอของเข้า / ต้องสั่งของ" (Order.needsPurchase) ไว้ที่เดียว แบ่ง 3 กอง:
 *   ready   = ของเข้าแล้ว แต่ยังไม่ได้ส่งเข้าผลิต ← ป้ายเมนูนับกองนี้ ("มีของเข้าแล้ว กราฟฟิกส่งผลิตได้")
 *   waiting = ยังรอของเข้า (paid = ลูกค้าโอนแล้ว ต้องสั่งของ)
 *   done    = ของเข้าแล้วและเข้าไลน์ผลิต/ส่งของไปแล้ว (ดูย้อนหลัง)
 * ป้ายหายเองเมื่อใบถูกติ๊ก 🏭 ส่งเข้าผลิต หรือสถานะไปถึง กำลังผลิต/จัดส่งแล้ว/เสร็จสิ้น
 *
 * 💸 เมนู /admin/stock-buy (กลุ่มงานขาย · เจ้าของร้านขอ 18 ก.ย. 69) ใช้ API เดียวกัน — โชว์เฉพาะกอง waiting ที่ paid
 *   ป้ายเมนูนั้นนับ `paid` = ลูกค้าโอนแล้ว ยังรอของเข้า (งานของฝ่ายขาย: ต้องสั่งของ/ตามของ)
 *
 * GET  → { n, paid, rows }   (?count=1 = เอาแค่ n + paid ไว้ให้ป้ายเมนู)
 * POST { id } → กด "ของเข้าแล้ว" จากหน้ารายการ — เขียนฝั่งเซิร์ฟเวอร์ ไม่ต้องส่งออเดอร์ทั้งก้อน (กันทับงานคนอื่น)
 */

export type StockWaitRow = {
  id: string;
  customer: string;
  status: OrderStatus;
  group: "ready" | "waiting" | "done";
  /** ลูกค้าโอนแล้ว (พ้น รอชำระเงิน/รอตรวจสอบ) */
  paid: boolean;
  /** ยอดรวมของใบ — ฝ่ายขายดูว่าเงินก้อนไหนเข้ามาแล้วแต่งานยังไม่เดิน */
  total: number;
  /** เวลาที่ระบบแจ้งกลุ่มไลน์ "ลูกค้าโอนแล้ว — ต้องสั่งของ" (≈ เวลาที่เงินเข้า) */
  paidAlertAt?: string;
  rush?: boolean;
  useByDate?: string;
  items: string[];
  note?: string;
  by: string;
  at: string;
  arrivedAt?: string;
  arrivedBy?: string;
  productionSent?: boolean;
};

const IN_PRODUCTION: OrderStatus[] = ["กำลังผลิต", "จัดส่งแล้ว", "เสร็จสิ้น"];

function groupOf(o: Order): StockWaitRow["group"] | null {
  if (!o.needsPurchase || o.status === "ยกเลิก") return null;
  if (orderAwaitingStock(o)) return IN_PRODUCTION.includes(o.status) && o.status !== "กำลังผลิต" ? "done" : "waiting";
  return o.productionSent || IN_PRODUCTION.includes(o.status) ? "done" : "ready";
}

function toRow(o: Order, group: StockWaitRow["group"]): StockWaitRow {
  const np = o.needsPurchase!;
  return {
    id: o.id,
    customer: o.customer,
    status: o.status,
    group,
    paid: o.status !== "รอชำระเงิน" && o.status !== "รอตรวจสอบ",
    total: orderTotal(o),
    ...(np.alertedAt ? { paidAlertAt: np.alertedAt } : {}),
    ...(o.rush ? { rush: true } : {}),
    ...(o.useByDate ? { useByDate: o.useByDate } : {}),
    items: o.items.map((i) => `${i.name} ×${i.qty.toLocaleString("th-TH")}`),
    ...(np.note ? { note: np.note } : {}),
    by: np.by,
    at: np.at,
    ...(np.arrivedAt ? { arrivedAt: np.arrivedAt } : {}),
    ...(np.arrivedBy ? { arrivedBy: np.arrivedBy } : {}),
    ...(o.productionSent ? { productionSent: true } : {}),
  };
}

const VIEW_PERMS = ["proof.manage", "orders.view", "pack.check", "pack.ship"] as const;

export async function GET(req: Request) {
  const gate = await requirePerm([...VIEW_PERMS]);
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ n: 0, rows: [], ok: false, reason: "ยังไม่ได้ตั้งค่า Supabase" });

  // ให้ Postgres กรองเฉพาะใบที่เคยติ๊ก (ส่วนน้อยของตาราง) — ป้ายเมนูถามทุก 90 วิ ไม่ต้องลากออเดอร์ทั้งร้าน
  const { data, error } = await sb
    .from("orders")
    .select("data")
    .not("data->needsPurchase", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    console.error("[orders/stock-wait] ถามฐานไม่สำเร็จ:", error.message);
    return NextResponse.json({ n: 0, rows: [], ok: false, reason: error.message });
  }

  const rows: StockWaitRow[] = [];
  for (const r of data ?? []) {
    const o = r.data as Order;
    const g = groupOf(o);
    if (g) rows.push(toRow(o, g));
  }
  // ป้ายเมนูนับเฉพาะใบที่ลูกค้าโอนแล้ว — หน้า /admin/stock-wait โชว์แค่ใบที่โอนแล้ว ตัวเลขต้องตรงกับกองแรก (18 ก.ย. 69)
  const n = rows.filter((r) => r.group === "ready" && r.paid).length;
  const paid = rows.filter((r) => r.group === "waiting" && r.paid).length;
  if (new URL(req.url).searchParams.get("count") === "1") return NextResponse.json({ n, paid, ok: true });
  return NextResponse.json({ n, paid, rows, ok: true });
}

export async function POST(req: Request) {
  // สิทธิ์ตรงกับหน้าออเดอร์: แอดมิน หรือฝ่ายแพ็ค/ผลิต (คนรับของ) — กราฟฟิกเห็นอย่างเดียว
  const gate = await requirePerm(["orders.edit", "pack.check", "pack.ship"]);
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const id = body.id?.trim();
  if (!id) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { data } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
  const o = data?.data as Order | undefined;
  if (!o?.needsPurchase) return NextResponse.json({ error: "ใบนี้ไม่ได้ติ๊กรอของเข้า" }, { status: 404 });

  const by = gate.actor.name?.trim() || gate.actor.username;
  let next = o;
  if (!o.needsPurchase.arrivedAt) {
    next = withLog({ ...o, needsPurchase: { ...o.needsPurchase, arrivedAt: new Date().toISOString(), arrivedBy: by } }, by, "🛒 ของเข้าแล้ว — ส่งเข้าผลิตได้", o.needsPurchase.note);
    const { order: saved, error } = await updateOrder(sb, next, { prev: o, by });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    next = saved;
    // ⏳ รอให้ส่งเสร็จก่อนตอบ — Netlify แช่เครื่องทันทีที่ตอบ งานเบื้องหลังหายเงียบ
    await Promise.all([notifyStockArrived(sb, next, new URL(req.url).origin), syncStockWaitToTP(next)]);
  }
  return NextResponse.json({ ok: true, row: toRow(next, groupOf(next) ?? "done") });
}
