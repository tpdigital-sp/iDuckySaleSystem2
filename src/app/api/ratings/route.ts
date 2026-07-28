import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Order } from "@/lib/admin-data";
import { currentMonth, RATING_TAGS } from "@/lib/ratings";

export const runtime = "nodejs";

const tableMissing = (msg = "", code?: string) =>
  code === "42P01" || code === "PGRST205" || /schema cache|find the table|relation .*does not exist/i.test(msg);

/**
 * ลูกค้าส่งแบบประเมินความพึงพอใจ (นิรนาม) — public แต่ต้องมี key ของออเดอร์ที่ส่งแล้ว
 * POST { orderId, key, score 1-5, tags[], comment? }
 *
 * หลักนิรนาม (ห้ามละเมิด):
 *  - แถวใน ratings ไม่มี orderId/ชื่อ/customerId/เวลาละเอียด (มีแค่เดือน)
 *  - ฝั่งออเดอร์ตั้ง rated=true เท่านั้น (ไม่เก็บคะแนน, ไม่ลง log กันเทียบเวลา)
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { orderId?: string; key?: string; score?: number; tags?: string[]; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const orderId = (body.orderId ?? "").trim();
  const score = Number(body.score);
  const tags = (Array.isArray(body.tags) ? body.tags : []).filter((t) => RATING_TAGS.includes(t)).slice(0, RATING_TAGS.length);
  const comment = (body.comment ?? "").trim().slice(0, 500);
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  if (!Number.isInteger(score) || score < 1 || score > 5)
    return NextResponse.json({ error: "คะแนนไม่ถูกต้อง" }, { status: 400 });

  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const order = row.data as Order;
  if (order.key && order.key !== (body.key ?? ""))
    return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" }, { status: 403 });
  if (order.status !== "จัดส่งแล้ว" && order.status !== "เสร็จสิ้น")
    return NextResponse.json({ error: "ประเมินได้เมื่อได้รับสินค้าแล้ว" }, { status: 409 });
  if (order.rated) return NextResponse.json({ error: "ออเดอร์นี้ประเมินไปแล้ว ขอบคุณครับ" }, { status: 409 });

  // 1) เก็บคะแนนแบบนิรนาม — ไม่มีอะไรโยงถึงออเดอร์/ลูกค้า
  const month = currentMonth();
  const { error: insErr } = await sb.from("ratings").insert({
    month,
    data: { score, tags, ...(comment ? { comment } : {}), month },
  });
  if (insErr) {
    if (tableMissing(insErr.message, insErr.code))
      return NextResponse.json({ error: "ระบบประเมินยังไม่พร้อม (ผู้ดูแลต้องรัน supabase/ratings.sql)" }, { status: 503 });
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // 2) ติ๊กว่าออเดอร์นี้ประเมินแล้ว (ไม่ลง log — log มี timestamp จะย้อนเทียบเวลาได้)
  const { error: saveErr } = await sb.from("orders").update({ data: { ...order, rated: true } }).eq("id", orderId);
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
