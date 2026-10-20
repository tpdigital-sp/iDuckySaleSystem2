import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withQuoteLog, type Quote } from "@/lib/quotes";
import { orderIdIn, type OrderItem } from "@/lib/admin-data";
import { getProductServer, withUnitYield } from "@/lib/products-server";
import { lotRepriceNote, repriceOrderLot } from "@/lib/order-lot-reprice";
import type { Order } from "@/lib/admin-data";

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

  let body: {
    id?: string;
    items?: OrderItem[];
    /** 🛠 บรรทัดเดิมที่ของใหม่มาแทน (ปุ่ม "แก้ตัวเลือก (หน้าร้าน)") — หน้าใบเสนอราคาจะถอดออกทีหลัง */
    replacing?: { index?: number; productId?: string; name?: string; qty?: number };
  };
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
    // ♻️ ใช้ไฟล์เก่า — รับเฉพาะเลขออเดอร์/ข้อความสั้น ใครติ๊ก/เมื่อไหร่ให้เซิร์ฟเวอร์ตั้งเอง
    ...(it.reuseArt && typeof it.reuseArt === "object"
      ? (() => {
          const r = it.reuseArt as { fromOrderId?: unknown; note?: unknown };
          const fromOrderId = typeof r.fromOrderId === "string" ? orderIdIn(r.fromOrderId) : undefined;
          const note = typeof r.note === "string" ? r.note.trim().slice(0, 200) : "";
          return { reuseArt: { ...(fromOrderId ? { fromOrderId } : {}), ...(note ? { note } : {}), by: "ลูกค้า", at: new Date().toISOString() } };
        })()
      : {}),
  }));

  // 📐 แช่ "สั่ง 1 หน่วย ได้กี่ชิ้น" ตั้งแต่อยู่ในใบเสนอราคา — ใบ/ออเดอร์ที่แปลงจากใบนี้จะโชว์จำนวนชิ้นจริงได้
  const clean = await withUnitYield(cleanRaw);

  /**
   * 🧮 ราคาต่อชิ้นเท่ากันทั้งใบ (กติกาเดียวกับลูกค้าสั่งเพิ่มในออเดอร์ · 20 ต.ค. 69)
   * ตะกร้าโหมดใบเสนอราคาคิดราคาจากของในตะกร้าอย่างเดียว ไม่รู้จักรายการในใบ → ของใหม่ได้ราคาเดี่ยว ๆ และบรรทัดเดิมไม่ลดตาม
   * → คิดทั้งใบเป็นล็อตเดียว ลดบรรทัดเดิม+ของใหม่ลงมาที่ราคาล็อต (ลดอย่างเดียว · ดู repriceOrderLot)
   * บรรทัดที่กำลังถูกแทน (แก้ตัวเลือก) ไม่ร่วมล็อตและไม่ถูกแตะราคา — หน้าใบเสนอราคาจับคู่ถอดด้วยราคาเดิม
   */
  const rp = body.replacing;
  const rIdx = typeof rp?.index === "number" ? rp.index : -1;
  const rOld = rIdx >= 0 && rIdx < quote.items.length ? quote.items[rIdx] : null;
  const skipIdx = rOld && rOld.productId === rp?.productId && rOld.name === rp?.name && rOld.qty === rp?.qty ? rIdx : -1;
  const lotBase = skipIdx >= 0 ? quote.items.filter((_, i) => i !== skipIdx) : quote.items;
  const lotMerged = [...lotBase, ...clean];
  const lotRes = await repriceOrderLot(
    { id, items: lotMerged } as unknown as Order,
    getProductServer,
    lotMerged.map((_, i) => i).filter((i) => i >= lotBase.length)
  );
  const lotItems = lotRes.order.items;
  const merged = skipIdx >= 0 ? [...lotItems.slice(0, skipIdx), quote.items[skipIdx], ...lotItems.slice(skipIdx)] : lotItems;

  const by = gate.actor.name?.trim() || gate.actor.username;
  let next = withQuoteLog(
    { ...quote, items: merged },
    by,
    "เพิ่มรายการจากหน้าร้าน",
    clean.map((i) => `${i.name} ×${i.qty}`).join(" · ")
  );
  if (lotRes.changed.length)
    next = withQuoteLog(next, "ระบบ", "ปรับราคาต่อชิ้นให้เท่ากันทั้งบิล", `ยอดรวมทั้งใบเข้าเรทส่ง · ${lotRepriceNote(lotRes.changed)}`);

  const { error } = await sb.from("quotes").update({ data: next }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, added: clean.length });
}
