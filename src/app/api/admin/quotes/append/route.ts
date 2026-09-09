import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withQuoteLog, type Quote } from "@/lib/quotes";
import type { OrderItem } from "@/lib/admin-data";
import { withUnitYield } from "@/lib/products-server";

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
  const cleanRaw: OrderItem[] = items.map((it) => ({
    productId: String(it.productId ?? "special-item"),
    name: String(it.name ?? "").slice(0, 200),
    selections: typeof it.selections === "string" ? it.selections : "",
    // ตัวเลือกแบบมีโครงสร้าง — ไว้อ่านจำนวนชิ้นต่อหน่วย/สั่งซ้ำ (รับเฉพาะคู่ข้อความ)
    ...(it.sel && typeof it.sel === "object"
      ? (() => {
          const sel = Object.fromEntries(
            Object.entries(it.sel as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [string, string][]
          );
          return Object.keys(sel).length ? { sel } : {};
        })()
      : {}),
    qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
    unitPrice: Math.max(0, Number(it.unitPrice) || 0),
    ...(Array.isArray(it.artworkUrls) && it.artworkUrls.length ? { artworkUrls: it.artworkUrls.slice(0, 10) } : {}),
    // 🔢 จำนวนต่อลาย (key=url) — รับเฉพาะเลขบวกของ url ที่แนบมาจริง
    ...(it.artworkQty && typeof it.artworkQty === "object" && Array.isArray(it.artworkUrls)
      ? (() => {
          const urls = it.artworkUrls as string[];
          const q = Object.fromEntries(
            Object.entries(it.artworkQty as Record<string, unknown>)
              .filter(([u, n]) => urls.includes(u) && Number(n) > 0)
              .map(([u, n]) => [u, Math.min(99999, Math.floor(Number(n)))]),
          );
          return Object.keys(q).length ? { artworkQty: q } : {};
        })()
      : {}),
    // 📐 ขนาดต่อลาย (key=url) — รับเฉพาะ {w,h} บวกของ url ที่แนบมาจริง
    ...(it.artworkSize && typeof it.artworkSize === "object" && Array.isArray(it.artworkUrls)
      ? (() => {
          const urls = it.artworkUrls as string[];
          const q = Object.fromEntries(
            Object.entries(it.artworkSize as Record<string, { w?: unknown; h?: unknown }>)
              .filter(([u, s]) => urls.includes(u) && s && Number(s.w) > 0 && Number(s.h) > 0)
              .map(([u, s]) => [u, { w: Math.min(9999, Number(s.w)), h: Math.min(9999, Number(s.h)) }]),
          );
          return Object.keys(q).length ? { artworkSize: q } : {};
        })()
      : {}),
    // งาน 2 ด้าน — url ชุดด้านหลัง (ส่วนย่อยของ artworkUrls) ไว้ติดป้ายในใบเสนอราคา
    ...(Array.isArray(it.artworkBackUrls) && it.artworkBackUrls.length
      ? { artworkBackUrls: it.artworkBackUrls.filter((u: unknown) => typeof u === "string").slice(0, 10) }
      : {}),
  }));

  // 📐 แช่ "สั่ง 1 หน่วย ได้กี่ชิ้น" ตั้งแต่อยู่ในใบเสนอราคา — ใบ/ออเดอร์ที่แปลงจากใบนี้จะโชว์จำนวนชิ้นจริงได้
  const clean = await withUnitYield(cleanRaw);

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
