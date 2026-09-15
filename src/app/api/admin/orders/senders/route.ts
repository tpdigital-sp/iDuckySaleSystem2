import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Order, OrderSender } from "@/lib/admin-data";
import { cleanSender, senderKey } from "@/lib/order-sender";

export const runtime = "nodejs";

/**
 * 📮 คลัง "ผู้ส่งที่เคยใช้" — ตัวแทนจำหน่ายฝากเราส่งของให้ลูกค้าปลายทาง กล่องต้องเป็นชื่อร้านตัวแทน
 *
 * ตั้งใจไม่ทำทะเบียนผู้ส่งแยก: ชื่อ/เบอร์/ที่อยู่ของตัวแทนเป็นข้อมูลส่วนตัว ห้ามลงแถว __dealers__
 * (อยู่ในตาราง products ที่อ่าน public ได้) — ตาราง orders เป็น service-role ล้วน จึงเก็บบนออเดอร์
 * แล้วอ่านย้อนจากใบก่อน ๆ เป็น "จำไว้ใช้ครั้งหน้า" แทน
 *
 * GET ?order=OD-… → { recent: [...], match? }
 *   recent = ผู้ส่งที่เคยใช้ล่าสุด (ไม่ซ้ำ) ให้แอดมินกดเลือก
 *   match  = ผู้ส่งของ "ลูกค้าคนเดียวกัน" จากใบก่อนหน้า (จับคู่ผู้ติดต่อ/บัญชีสมาชิก/LINE/เบอร์) → กดปุ่มเดียวเติมให้
 */

export interface SenderRow extends OrderSender {
  /** ใบล่าสุดที่ใช้ผู้ส่งนี้ (ไว้ให้แอดมินกดดูย้อน) */
  from: string;
  /** วันที่ของใบนั้น */
  date?: string;
  /** เคยใช้กี่ใบ */
  uses: number;
}

/** ใบสองใบนี้ "ลูกค้าคนเดียวกัน" ไหม — ผู้ติดต่อ/บัญชีสมาชิก/LINE ก่อน แล้วค่อยเบอร์โทร */
function sameBuyer(a: Order, b: Order): boolean {
  const digits = (v?: string) => (v ?? "").replace(/\D/g, "");
  if (a.contactId && a.contactId === b.contactId) return true;
  if (a.customerId && a.customerId === b.customerId) return true;
  if (a.lineUserId && a.lineUserId === b.lineUserId) return true;
  const pa = digits(a.phone);
  return pa.length >= 9 && pa === digits(b.phone);
}

export async function GET(req: Request) {
  const gate = await requirePerm("orders.view");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ recent: [], ok: false, reason: "ยังไม่ได้ตั้งค่า Supabase" });

  const id = (new URL(req.url).searchParams.get("order") ?? "").trim();

  // ให้ Postgres กรองเฉพาะใบที่ตั้งผู้ส่งเองไว้ (ส่วนใหญ่ของตารางไม่มี) — ไม่ต้องลากออเดอร์ทั้งร้านมา
  const { data, error } = await sb
    .from("orders")
    .select("data")
    .not("data->sender", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    console.error("[orders/senders] ถามฐานไม่สำเร็จ:", error.message);
    return NextResponse.json({ recent: [], ok: false, reason: error.message });
  }

  const orders = (data ?? []).map((r) => r.data as Order);

  // ใบเป้าหมาย (ถ้าส่งมา) — ไว้จับคู่ "ลูกค้าคนเดียวกัน"
  let target: Order | null = null;
  if (id) {
    const { data: row } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
    target = (row?.data as Order | undefined) ?? null;
  }

  const byKey = new Map<string, SenderRow>();
  let match: SenderRow | undefined;
  for (const o of orders) {
    const s = cleanSender(o.sender);
    if (!s) continue;
    const k = senderKey(s);
    const cur = byKey.get(k);
    // เรียงมาจากใหม่→เก่า ตัวแรกที่เจอคือใบล่าสุดของผู้ส่งนี้
    if (cur) cur.uses += 1;
    else byKey.set(k, { ...s, from: o.id, date: o.date, uses: 1 });
    if (!match && target && o.id !== target.id && sameBuyer(target, o)) match = byKey.get(k);
  }

  return NextResponse.json({ recent: [...byKey.values()].slice(0, 12), ...(match ? { match } : {}), ok: true });
}
