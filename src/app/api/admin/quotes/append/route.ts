import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withQuoteLog, type Quote } from "@/lib/quotes";
import type { OrderItem } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * 🛍️ โยนสินค้าที่หยิบจากหน้าร้าน เข้าใบเสนอราคาที่กำลังทำอยู่
 * ใช้ตอนแอดมินกด "หยิบจากหน้าร้าน" ในหน้าใบเสนอราคา — ได้ตัวเลือก/ราคาขั้นบันไดจริงจากหน้าร้าน
 */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { id?: string; items?: OrderItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!id) return NextResponse.json({ error: "ไม่ได้ระบุเลขใบเสนอราคา" }, { status: 400 });
  if (!items.length) return NextResponse.json({ error: "ไม่มีรายการที่จะเพิ่ม" }, { status: 400 });

  const { data: row } = await sb.from("quotes").select("data").eq("id", id).maybeSingle();
  const quote = row?.data as Quote | undefined;
  if (!quote) return NextResponse.json({ error: "ไม่พบใบเสนอราคานี้" }, { status: 404 });
  if (quote.orderId) return NextResponse.json({ error: `ใบนี้แปลงเป็นออเดอร์ ${quote.orderId} แล้ว แก้ไม่ได้` }, { status: 400 });

  // กรองเอาเฉพาะฟิลด์ที่ใบเสนอราคาต้องใช้ (ตัดของฝั่งตะกร้า เช่น key/ภาพชั่วคราว)
  const clean: OrderItem[] = items.map((it) => ({
    productId: String(it.productId ?? "special-item"),
    name: String(it.name ?? "").slice(0, 200),
    selections: typeof it.selections === "string" ? it.selections : "",
    qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
    unitPrice: Math.max(0, Number(it.unitPrice) || 0),
    ...(Array.isArray(it.artworkUrls) && it.artworkUrls.length ? { artworkUrls: it.artworkUrls.slice(0, 5) } : {}),
  }));

  const by = gate.actor.name?.trim() || gate.actor.username;
  const next = withQuoteLog(
    { ...quote, items: [...quote.items, ...clean] },
    by,
    "เพิ่มรายการจากหน้าร้าน",
    clean.map((i) => `${i.name} ×${i.qty}`).join(" · ")
  );

  const { error } = await sb.from("quotes").update({ data: next }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, added: clean.length });
}
