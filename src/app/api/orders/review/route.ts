import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { proofsOf, withLog, type Order, type OrderStatus } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * ลูกค้าตรวจแบบงาน — อนุมัติ หรือ ขอแก้ไข (public แต่ต้องมี key ลับ)
 * POST { orderId, key, itemIndex, action: "approve" | "request", note?, proofIndex? }
 * หรือแบบ "ของแถม": POST { orderId, key, giftId: <promoId>, action, note? } — ตรวจเหมาทั้งชุด
 *
 * มี proofIndex → ตรวจ "เฉพาะรูปนั้น" (per-image) · รายการเป็น "อนุมัติ" เมื่อครบทุกรูป
 * ไม่มี proofIndex → เหมาทั้งรายการ (ปุ่มอนุมัติทุกภาพที่เหลือ / ขอแก้ไขทั้งรายการ)
 * ทุกรายการ+ของแถมที่มีแบบอนุมัติครบ → ออเดอร์ = "อนุมัติแบบ" · ขอแก้ไข → ออเดอร์ = "แก้ไขแบบ"
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: {
    orderId?: string;
    key?: string;
    itemIndex?: number;
    giftId?: string;
    action?: string;
    note?: string;
    proofIndex?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const orderId = (body.orderId ?? "").trim();
  const giftId = (body.giftId ?? "").trim();
  const itemIndex = Number(body.itemIndex);
  const proofIndex = body.proofIndex === undefined ? null : Number(body.proofIndex);
  const action = body.action;
  const note = (body.note ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  if (!giftId && (!Number.isInteger(itemIndex) || itemIndex < 0))
    return NextResponse.json({ error: "ไม่ได้ระบุรายการสินค้า" }, { status: 400 });
  if (action !== "approve" && action !== "request")
    return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
  if (action === "request" && !note)
    return NextResponse.json({ error: "กรุณาระบุสิ่งที่ต้องการให้แก้ไข" }, { status: 400 });

  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const order = row.data as Order;
  if (order.key && order.key !== (body.key ?? ""))
    return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" }, { status: 403 });

  // ── ตรวจแบบ "ของแถม" — เหมาทั้งชุด (อนุมัติ/ขอแก้) แล้วคิดสถานะออเดอร์รวมกับรายการสินค้า ──
  if (giftId) {
    const gift = (order.gifts ?? []).find((g) => g.promoId === giftId);
    if (!gift) return NextResponse.json({ error: "ไม่พบของแถมนี้ในออเดอร์" }, { status: 404 });
    if (!(gift.proofs ?? []).length) return NextResponse.json({ error: "ของแถมนี้ยังไม่มีแบบให้ตรวจ" }, { status: 409 });
    const now = new Date().toISOString();
    const gifts = (order.gifts ?? []).map((g) =>
      g.promoId === giftId
        ? {
            ...g,
            proofs: (g.proofs ?? []).map((p) =>
              action === "approve"
                ? { ...p, review: "อนุมัติ" as const, reviewNote: undefined }
                : { ...p, review: "ขอแก้ไข" as const, reviewNote: note }
            ),
            proofStatus: (action === "approve" ? "อนุมัติ" : "ขอแก้ไข") as "อนุมัติ" | "ขอแก้ไข",
            proofNote: action === "approve" ? undefined : note,
            proofUpdatedAt: now,
          }
        : g
    );
    // สถานะออเดอร์: ขอแก้ = "แก้ไขแบบ" ทันที · อนุมัติ = ต้องครบทั้งสินค้าและของแถมถึงเป็น "อนุมัติแบบ"
    const withProof = order.items.filter((it) => proofsOf(it).length);
    const itemsOk = withProof.every((it) => it.proofStatus === "อนุมัติ");
    const giftsOk = gifts.filter((g) => (g.proofs ?? []).length).every((g) => g.proofStatus === "อนุมัติ");
    const status: OrderStatus =
      action === "request" ? "แก้ไขแบบ" : itemsOk && giftsOk && (withProof.length > 0 || gifts.some((g) => (g.proofs ?? []).length)) ? "อนุมัติแบบ" : "รอตรวจแบบ";
    const updated = withLog(
      { ...order, gifts, status },
      "ลูกค้า",
      action === "approve" ? "อนุมัติแบบของแถม" : "ขอแก้ไขแบบของแถม",
      action === "approve" ? `🎁 ${gift.name}` : `🎁 ${gift.name} — ${note}`
    );
    const { error: saveGiftErr } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
    if (saveGiftErr) return NextResponse.json({ error: saveGiftErr.message }, { status: 500 });
    const { key: _s, ...safeGift } = updated;
    void _s;
    return NextResponse.json({ ok: true, order: safeGift });
  }

  const item = order.items?.[itemIndex];
  if (!item) return NextResponse.json({ error: "ไม่พบรายการสินค้านี้" }, { status: 404 });
  const itemProofs = proofsOf(item);
  if (!itemProofs.length) return NextResponse.json({ error: "รายการนี้ยังไม่มีแบบให้ตรวจ" }, { status: 409 });
  if (proofIndex !== null && (!Number.isInteger(proofIndex) || proofIndex < 0 || proofIndex >= itemProofs.length))
    return NextResponse.json({ error: "ไม่พบรูปแบบงานนี้" }, { status: 404 });

  // อัปเดตผลตรวจ "ต่อรูป" — มี proofIndex = เฉพาะรูปนั้น · ไม่มี = เหมาทุกรูป
  const proofs = itemProofs.map((p, j) => {
    if (proofIndex !== null && j !== proofIndex) return p;
    return action === "approve"
      ? { ...p, review: "อนุมัติ" as const, reviewNote: undefined }
      : { ...p, review: "ขอแก้ไข" as const, reviewNote: note };
  });

  // สถานะรายการ (สรุปจากทุกรูป): มีขอแก้ → ขอแก้ไข · ครบทุกรูปอนุมัติ → อนุมัติ · ที่เหลือ → รอตรวจ
  const anyEdit = proofs.some((p) => p.review === "ขอแก้ไข");
  const allOk = proofs.every((p) => p.review === "อนุมัติ");
  const editNotes = proofs
    .map((p, j) => (p.review === "ขอแก้ไข" && p.reviewNote ? `รูปที่ ${j + 1}: ${p.reviewNote}` : ""))
    .filter(Boolean)
    .join(" · ");
  const items = order.items.map((it, i) =>
    i === itemIndex
      ? {
          ...it,
          proofs,
          proofStatus: (anyEdit ? "ขอแก้ไข" : allOk ? "อนุมัติ" : "รอตรวจ") as "ขอแก้ไข" | "อนุมัติ" | "รอตรวจ",
          proofNote: anyEdit ? editNotes || note : undefined,
        }
      : it
  );

  // ทุกรายการที่มีแบบ ถูกอนุมัติครบแล้วหรือยัง — นับแบบของแถมด้วย ไม่งั้นออเดอร์เด้งเป็น "อนุมัติแบบ" ทั้งที่ของแถมยังรอตรวจ
  const withProof = items.filter((it) => proofsOf(it).length);
  const giftsApproved = (order.gifts ?? []).filter((g) => (g.proofs ?? []).length).every((g) => g.proofStatus === "อนุมัติ");
  const allApproved = withProof.length > 0 && withProof.every((it) => it.proofStatus === "อนุมัติ") && giftsApproved;
  const status: OrderStatus = action === "request" ? "แก้ไขแบบ" : allApproved ? "อนุมัติแบบ" : "รอตรวจแบบ";

  const where = proofIndex !== null ? `${item.name} รูปที่ ${proofIndex + 1}/${itemProofs.length}` : item.name;
  const updated = withLog(
    { ...order, items, status },
    "ลูกค้า",
    action === "approve" ? "อนุมัติแบบ" : "ขอแก้ไขแบบ",
    action === "approve" ? where : `${where} — ${note}`
  );

  const { error: saveErr } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 });

  const { key: _secret, ...safe } = updated;
  void _secret;
  return NextResponse.json({ ok: true, order: safe });
}
