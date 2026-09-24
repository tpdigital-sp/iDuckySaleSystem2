import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Order } from "@/lib/admin-data";
import { paidSpend, seedTierStatus, tiersOf, type Tier, type TierStatus } from "@/lib/tiers";
import { hideInternalStockNote } from "@/lib/customer-order";

export const runtime = "nodejs";

/** ประวัติออเดอร์ของลูกค้าที่ล็อกอิน — ยืนยันตัวตนด้วย access token ใน Authorization header */
export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ orders: [] });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });

  const { data: u, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !u.user) return NextResponse.json({ error: "เซสชันหมดอายุ" }, { status: 401 });

  // กรองที่ฐานข้อมูล (data->>customerId) + เรียงใหม่สุดก่อน — เดิมดึงทั้งตารางมากรองในนี้
  // ทำให้ยิ่งมีออเดอร์เยอะยิ่งช้า และ orders[0] ("ออเดอร์ล่าสุด") ก็ไม่ได้การันตีว่าใหม่สุด
  const { data, error } = await sb
    .from("orders")
    .select("data")
    .eq("data->>customerId", u.user.id)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message))
      return NextResponse.json({ orders: [], needsSetup: true });
    return NextResponse.json({ error: error.message, orders: [] }, { status: 500 });
  }
  const mine = (data ?? []).map((r) => hideInternalStockNote(r.data as Order));

  // สถานะระดับสมาชิก (status-lock) — อ่านจาก contact ที่ผูก memberId ไว้
  // ยังไม่มี contact/สถานะ → ประเมินจากยอดที่จ่ายจริง (ยกยอดลูกค้าเก่า) เพื่อให้หน้า account โชว์ระดับได้
  let tier: TierStatus | undefined;
  /**
   * ยอดสะสมทั้งหมด (บาท · 1 บาท = 1 แต้ม) = ช่อง Point ของการ์ดผู้ติดต่อ — ตัวเลขเดียวกับที่หลังบ้านเห็น
   * ทำไมต้องส่งมาด้วย: ลูกค้าเก่าที่ยกยอดมาจากระบบเดิมมีแต้มเป็นแสน แต่ออเดอร์ "ในระบบนี้" เพิ่งไม่กี่ใบ
   * ถ้าหน้า /account บวกเองจากออเดอร์ที่ตัวเองเห็น จะโชว์น้อยกว่าหลังบ้านคนละโลก (พนักงานแจ้ง 24 ก.ย. 69)
   */
  let spend: number | undefined;
  try {
    const [{ data: c }, { data: sett }] = await Promise.all([
      sb.from("contacts").select("data").eq("data->>memberId", u.user.id).limit(1).maybeSingle(),
      sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle(),
    ]);
    const contact = c?.data as { tierLevel?: string; tierAnchor?: string; tierCycleSpend?: number; point?: number; importedAt?: string } | undefined;
    const tiers: Tier[] = tiersOf((((sett?.data as { tiers?: Tier[] } | undefined)?.tiers) ?? []).filter((t) => t.name?.trim()) || null);
    // ไม่มีการ์ดผู้ติดต่อ (ยังไม่ผูก memberId) → ใช้ยอดที่จ่ายจริงในระบบนี้ไปก่อน
    spend = contact?.point != null ? Number(contact.point) || 0 : paidSpend(mine);
    if (contact?.tierLevel) tier = { levelId: contact.tierLevel, anchor: contact.tierAnchor, cycleSpend: contact.tierCycleSpend };
    else tier = seedTierStatus(spend, contact?.importedAt, tiers);
  } catch {
    /* ไม่มีตาราง contacts ก็ข้าม — ระดับจะไม่โชว์ */
  }
  return NextResponse.json({ orders: mine, tier, spend });
}
