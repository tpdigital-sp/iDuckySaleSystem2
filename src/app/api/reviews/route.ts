import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { bearerUser } from "@/lib/server/claims-db";
import { fetchShownReviews, isMissingTable, statsOf, toPublic } from "@/lib/server/reviews-db";
import { abbrevName, type Review } from "@/lib/reviews";
import type { Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/** รีวิวสาธารณะของสินค้า 1 ตัว — เฉพาะที่แอดมินอนุมัติ "แสดง" แล้ว + สรุปคะแนน */
export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ reviews: [], stats: null });
  const productId = (new URL(req.url).searchParams.get("productId") ?? "").trim();
  if (!productId) return NextResponse.json({ error: "ไม่รู้ว่าสินค้าไหน" }, { status: 400 });

  const shown = await fetchShownReviews(sb, productId);
  if (shown === null) return NextResponse.json({ reviews: [], stats: null });
  return NextResponse.json({ reviews: shown.map(toPublic), stats: statsOf(shown) });
}

const reviewId = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `RV-${String(d.getFullYear() + 543).slice(-2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${Math.floor(1000 + Math.random() * 9000)}`;
};

/** URL รูปต้องเป็นของ storage เราเอง (bucket ภาพลาย) — กันแปะลิงก์รูปนอกมั่ว */
const PHOTO_URL_RE = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/customer-artwork\//;

/**
 * ลูกค้าเขียนรีวิว — Bearer token · ตรวจว่าซื้อจริง: ออเดอร์เป็นของบัญชีนี้ สถานะ "เสร็จสิ้น"
 * และมีสินค้าตัวนี้อยู่ในออเดอร์ · 1 รีวิว/สินค้า/ออเดอร์ · ขึ้นหน้าสินค้าหลังแอดมินตรวจ
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const user = await bearerUser(sb, req);
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อนรีวิว" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    orderId?: string;
    productId?: string;
    score?: number;
    text?: string;
    displayName?: string;
    photoUrls?: string[];
  } | null;

  const orderId = (body?.orderId ?? "").trim();
  const productId = (body?.productId ?? "").trim();
  const score = Number(body?.score);
  if (!orderId || !productId || !(score >= 1 && score <= 5))
    return NextResponse.json({ error: "ข้อมูลรีวิวไม่ครบ (ออเดอร์ / สินค้า / คะแนน 1-5)" }, { status: 400 });

  // ── ตรวจว่าซื้อจริง ──
  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  const order = row?.data as Order | undefined;
  if (!order || order.customerId !== user.id) return NextResponse.json({ error: "ไม่พบออเดอร์นี้ในบัญชีของคุณ" }, { status: 404 });
  if (order.status !== "เสร็จสิ้น") return NextResponse.json({ error: "รีวิวได้เมื่อออเดอร์เสร็จสิ้นแล้ว" }, { status: 400 });
  const item = order.items.find((it) => it.productId === productId);
  if (!item) return NextResponse.json({ error: "สินค้านี้ไม่อยู่ในออเดอร์ที่เลือก" }, { status: 400 });

  // ── 1 รีวิว / สินค้า / ออเดอร์ ──
  const { data: mineRows, error: listErr } = await sb.from("reviews").select("data").eq("data->>customerId", user.id);
  if (listErr) {
    if (isMissingTable(listErr)) return NextResponse.json({ error: "ระบบรีวิวยังไม่พร้อม — ผู้ดูแลต้องรัน supabase/reviews.sql ก่อน" }, { status: 503 });
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }
  if ((mineRows ?? []).some((r) => (r.data as Review).orderId === orderId && (r.data as Review).productId === productId))
    return NextResponse.json({ error: "คุณรีวิวสินค้านี้จากออเดอร์นี้ไปแล้ว" }, { status: 400 });

  const meta = user.user_metadata as { name?: string } | undefined;
  const displayName = (body?.displayName ?? "").trim().slice(0, 60) || abbrevName(meta?.name ?? order.customer ?? "");
  const photoUrls = (body?.photoUrls ?? []).filter((u) => PHOTO_URL_RE.test(u)).slice(0, 3);

  const review: Review = {
    id: reviewId(),
    productId,
    productName: item.name,
    orderId,
    customerId: user.id,
    displayName,
    score: score as Review["score"],
    ...(body?.text?.trim() ? { text: body.text.trim().slice(0, 1500) } : {}),
    ...(photoUrls.length ? { photoUrls } : {}),
    status: "รอตรวจ",
    createdAt: new Date().toISOString(),
  };

  let { error } = await sb.from("reviews").insert({ id: review.id, data: review });
  if (error && /duplicate|unique/i.test(error.message)) {
    review.id = reviewId();
    ({ error } = await sb.from("reviews").insert({ id: review.id, data: review }));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, review });
}
