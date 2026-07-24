import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Order } from "@/lib/admin-data";
import { paidSpend, tierForSpend, tierDiscountAmount, tiersOf, type Tier } from "@/lib/tiers";

// id เรคอร์ดตั้งค่าร้าน (ตรงกับ SETTINGS_ID ใน shop-settings ซึ่งเป็น "use client")
const SETTINGS_ROW = "__shop_payment__";

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

  // ── ส่วนลดระดับสมาชิก — คิดฝั่งเซิร์ฟเวอร์เท่านั้น (กันแก้ราคาผ่านเบราว์เซอร์) ──
  let discount: Order["discount"] | undefined;
  if (input.customerId) {
    const [settRes, ordRes] = await Promise.all([
      sb.from("products").select("data").eq("id", SETTINGS_ROW).maybeSingle(),
      sb.from("orders").select("data"),
    ]);
    const configuredTiers = ((settRes.data?.data as { tiers?: Tier[] } | undefined)?.tiers ?? []).filter((t) => t.name?.trim());
    const tiers = tiersOf(configuredTiers.length ? configuredTiers : null);
    const myPaid = (ordRes.data ?? []).map((r) => r.data as Order).filter((o) => o.customerId === input.customerId);
    const tier = tierForSpend(paidSpend(myPaid), tiers);
    const subtotal = input.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    const amount = tierDiscountAmount(subtotal, tier.discountPct);
    if (amount > 0) discount = { label: `สมาชิก ${tier.name} (${tier.discountPct}%)`, amount };
  }

  const now = new Date();
  const id = orderNo(now);
  const key = randomBytes(24).toString("base64url"); // กุญแจลับต่อออเดอร์ (~32 ตัว, เดาไม่ได้)
  const order: Order = {
    id,
    key,
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
    ...(discount ? { discount } : {}),
  };

  const { error } = await sb.from("orders").insert({ id, data: order });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message))
      return NextResponse.json({ error: "ระบบยังไม่พร้อม — ผู้ดูแลต้องสร้างตาราง orders ก่อน (รัน supabase/orders.sql)" }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id, key });
}
