import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Order } from "@/lib/admin-data";

export const runtime = "nodejs";

function orderNo(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const ymd = `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  return `OD-${ymd}-${String(Math.floor(1000 + Math.random() * 9000))}`;
}

/** ลูกค้าสั่งซื้อ (guest) → บันทึกออเดอร์จริง */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let input: {
    customerName?: string;
    phone?: string;
    address?: string;
    email?: string;
    customerId?: string;
    shipping?: string;
    shippingCost?: number;
    items?: Order["items"];
    note?: string;
  };
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!input?.customerName?.trim() || !input?.phone?.trim() || !input?.address?.trim())
    return NextResponse.json({ error: "กรอกชื่อ เบอร์ และที่อยู่ให้ครบ" }, { status: 400 });
  if (!Array.isArray(input.items) || input.items.length === 0)
    return NextResponse.json({ error: "ไม่มีรายการสินค้า" }, { status: 400 });

  const now = new Date();
  const id = orderNo(now);
  const order: Order = {
    id,
    customer: input.customerName.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    date: now.toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    payment: "โอนธนาคาร",
    shipping: input.shipping === "ส่งด่วน" ? "ส่งด่วน" : "ส่งธรรมดา",
    shippingCost: Number(input.shippingCost) || 0,
    status: "รอชำระเงิน",
    note: input.note?.trim() || undefined,
    items: input.items,
    ...(input.customerId ? { customerId: input.customerId } : {}),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
  };

  const { error } = await sb.from("orders").insert({ id, data: order });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message))
      return NextResponse.json({ error: "ระบบยังไม่พร้อม — ผู้ดูแลต้องสร้างตาราง orders ก่อน (รัน supabase/orders.sql)" }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id });
}
