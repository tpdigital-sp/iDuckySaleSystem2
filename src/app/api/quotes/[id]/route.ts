import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { quoteExpired, withQuoteLog, type Quote } from "@/lib/quotes";

export const runtime = "nodejs";

/** ลูกค้าเปิดดูใบเสนอราคาของตัวเอง (ต้องมี key ตรง) */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const key = new URL(req.url).searchParams.get("key") ?? "";

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่าระบบ" }, { status: 503 });

  const { data, error } = await sb.from("quotes").select("data").eq("id", decodeURIComponent(id)).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "ไม่พบใบเสนอราคานี้" }, { status: 404 });

  const quote = data.data as Quote;
  if (!quote.key || quote.key !== key) return NextResponse.json({ error: "ลิงก์ไม่ถูกต้อง" }, { status: 403 });

  return NextResponse.json({ quote });
}

/** ลูกค้ากด "ตกลงตามใบนี้" เอง → แจ้งร้าน (ร้านกดแปลงเป็นออเดอร์อีกที) */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const key = new URL(req.url).searchParams.get("key") ?? "";

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่าระบบ" }, { status: 503 });

  const { data } = await sb.from("quotes").select("data").eq("id", decodeURIComponent(id)).maybeSingle();
  const quote = data?.data as Quote | undefined;
  if (!quote) return NextResponse.json({ error: "ไม่พบใบเสนอราคานี้" }, { status: 404 });
  if (quote.key !== key) return NextResponse.json({ error: "ลิงก์ไม่ถูกต้อง" }, { status: 403 });
  if (quote.orderId) return NextResponse.json({ ok: true, already: true });
  if (quote.status === "ลูกค้าตกลง") return NextResponse.json({ ok: true, already: true });
  // ใบที่ร้านปิดไปแล้ว (ลูกค้าเลือกใบอื่น/ยกเลิก) ลิงก์เก่ายังอยู่ในแชทลูกค้า — ต้องกันไม่ให้กดตกลงย้อนหลัง
  if (quote.status === "ไม่รับ")
    return NextResponse.json(
      { error: "ใบเสนอราคานี้ปิดไปแล้ว (อาจเลือกใบอื่นไปแล้ว) — รบกวนทักร้านเพื่อขอใบใหม่" },
      { status: 400 }
    );
  if (quoteExpired(quote)) return NextResponse.json({ error: "ใบเสนอราคานี้หมดอายุแล้ว — รบกวนทักร้านเพื่อขอใบใหม่" }, { status: 400 });

  const next = withQuoteLog({ ...quote, status: "ลูกค้าตกลง" }, "ลูกค้า", "ลูกค้ากดตกลงจากลิงก์");
  await sb.from("quotes").update({ data: next }).eq("id", quote.id);
  return NextResponse.json({ ok: true });
}
