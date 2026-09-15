import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type Order, type OrderStatus, type OrderSender } from "@/lib/admin-data";
import { updateOrder } from "@/lib/server/order-write";
import { cleanSender, senderKey } from "@/lib/order-sender";
import { isDealerUid } from "@/lib/server/dealers";
import { saveDealerSender } from "@/lib/server/dealer-sender";

export const runtime = "nodejs";

// สถานะที่ล็อกแน่นอน (ส่งของไปแล้ว/จบ/ยกเลิก) — นอกเหนือจากเช็ค printedAt
const LOCKED_STATUS: OrderStatus[] = ["จัดส่งแล้ว", "เสร็จสิ้น", "ยกเลิก"];

/**
 * 📮 ตัวแทนตั้ง "ชื่อผู้ส่งบนกล่อง" ของออเดอร์ตัวเอง (public แต่ต้องมี key ลับของใบนั้น)
 * POST { orderId, key, name?, phone?, address?, remember? }
 *
 * กติกาเดียวกับแก้ที่อยู่จัดส่ง: แก้ได้จนกว่าร้านจะปริ้นใบงาน (printedAt) — บังคับฝั่งเซิร์ฟเวอร์
 * ⚠️ เปิดเฉพาะใบที่เป็นออเดอร์ตัวแทน (order.dealer) — ลูกค้าทั่วไปตั้งชื่อผู้ส่งเป็นชื่อร้านคนอื่นไม่ได้
 * remember = เก็บเป็นผู้ส่งประจำของบัญชีด้วย (ต้องล็อกอิน + อยู่ในทะเบียนตัวแทน ยืนยันจาก token)
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: (OrderSender & { orderId?: string; key?: string; remember?: boolean }) | null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const orderId = (body?.orderId ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const sender = cleanSender(body);
  if (sender?.address && !sender.phone)
    return NextResponse.json({ error: "กรอกที่อยู่ผู้ส่งแล้วต้องมีเบอร์ผู้ส่งด้วย (ขนส่งใช้ติดต่อตอนของตีกลับ)" }, { status: 400 });

  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const order = row.data as Order;
  if (order.key && order.key !== (body?.key ?? ""))
    return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" }, { status: 403 });
  if (!order.dealer)
    return NextResponse.json({ error: "ใบนี้ไม่ใช่ออเดอร์ตัวแทนจำหน่าย — ตั้งชื่อผู้ส่งเองไม่ได้ ติดต่อร้านได้ทางไลน์" }, { status: 403 });

  // ── ล็อก: ปริ้นใบงานแล้ว หรือส่งของแล้ว → แก้ไม่ได้ (สติกเกอร์ออกจากเครื่องพิมพ์ไปแล้ว) ──
  if (order.printedAt)
    return NextResponse.json(
      { error: "ทางร้านปริ้นใบงานแล้ว ชื่อผู้ส่งถูกล็อก — หากต้องแก้ไข กรุณาติดต่อร้านทางไลน์", locked: true },
      { status: 409 }
    );
  if (LOCKED_STATUS.includes(order.status))
    return NextResponse.json({ error: `ออเดอร์อยู่ในขั้น “${order.status}” แล้ว แก้ไขไม่ได้ — ติดต่อร้าน`, locked: true }, { status: 409 });

  if (senderKey(sender ?? {}) === senderKey(order.sender ?? {}))
    return NextResponse.json({ ok: true, sender: order.sender, unchanged: true });

  const updated = withLog(
    { ...order, sender },
    "ตัวแทน",
    sender ? "ตั้งชื่อผู้ส่งบนใบปะหน้า" : "ใช้ชื่อร้านเป็นผู้ส่ง",
    sender ? [sender.name, sender.phone, sender.address].filter(Boolean).join(" · ") : undefined
  );
  const { error: saveErr } = await updateOrder(sb, updated, { prev: order });
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  // 💾 "จำไว้ใช้ครั้งหน้า" — เก็บเป็นผู้ส่งประจำของบัญชี (เฉพาะคนที่ล็อกอินและอยู่ในทะเบียนตัวแทนจริง)
  let remembered = false;
  if (body?.remember) {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (token) {
      const { data: u } = await sb.auth.getUser(token);
      if (u.user && (await isDealerUid(u.user.id))) {
        const { error } = await saveDealerSender(sb, u.user.id, sender);
        remembered = !error;
      }
    }
  }

  return NextResponse.json({ ok: true, ...(sender ? { sender } : {}), remembered });
}
