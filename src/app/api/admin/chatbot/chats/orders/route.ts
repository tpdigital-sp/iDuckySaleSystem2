import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { pickKeys, REPORT_ORDER_KEYS } from "@/lib/server/orders-lite";
import { orderBalance, orderStatusLabel, orderTotal, type Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * 📦 ออเดอร์ของห้องแชท LINE — แผงข้างห้องใน /admin/chatbot/chats (ขั้น 2 · 14 ต.ค. 69)
 *
 * GET ?uid=U…           → ใบที่ผูก LINE คนนี้ (lineUserId) + ใบที่สั่งโดยล็อกอิน LINE คนนี้ (loginLine.userId) ใหม่→เก่า 15 ใบ
 * GET ?uid=U…&q=OD-…    → หาใบเดียวไว้ "ผูกกับห้องนี้" — บอกด้วยว่าใบนั้นผูก LINE คนอื่นอยู่ไหม (หน้าเว็บต้องถามก่อนผูกทับ)
 *
 * ⚠️ ไม่เดาจากเบอร์โทร (เบอร์เดียวกันคนละ LINE มีจริง — ดู inheritedFromPastOrders ใน notify.ts) · ผูกจริงผ่าน /api/admin/orders/line-bind ตัวเดิม
 * ไม่หยิบก้อน data เต็ม (log/proofs หนัก) — เอาเฉพาะคีย์ที่คิดยอด/ป้ายสถานะได้ (pickKeys)
 */
const KEYS = [...REPORT_ORDER_KEYS, "shipping", "shippingLabel", "lineUserId", "lineProfile", "loginLine", "tracking"] as const;
const SELECT = `created_at,${pickKeys(KEYS)}`;
const UID = /^[A-Za-z][0-9a-f]{32}$/;

type ChatOrderRow = {
  id: string;
  date: string;
  customer: string;
  status: string;
  statusLabel: string;
  total: number;
  balance: number;
  tracking?: string;
  /** ผูกกับห้องนี้ = bound · สั่งตอนล็อกอิน LINE นี้แต่ยังไม่ผูก = login · ผูกคนอื่น = other */
  link: "bound" | "login" | "other" | "none";
  otherName?: string;
};

function toRow(o: Order, uid: string): ChatOrderRow {
  const link: ChatOrderRow["link"] = o.lineUserId
    ? o.lineUserId === uid
      ? "bound"
      : "other"
    : o.loginLine?.userId === uid
      ? "login"
      : "none";
  let total = 0;
  let balance = 0;
  try {
    total = orderTotal(o);
    balance = orderBalance(o);
  } catch {
    /* คีย์ไม่ครบก็โชว์ 0 ดีกว่าพังทั้งแผง */
  }
  return {
    id: o.id,
    date: o.date,
    customer: o.customer,
    status: o.status,
    statusLabel: orderStatusLabel(o),
    total,
    balance,
    tracking: o.tracking || undefined,
    link,
    otherName: link === "other" ? o.lineProfile?.name || `${(o.lineUserId ?? "").slice(0, 10)}…` : undefined,
  };
}

export async function GET(req: Request) {
  const gate = await requirePerm(["orders.view", "chat.reply"]);
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const url = new URL(req.url);
  const uid = (url.searchParams.get("uid") ?? "").trim();
  if (!UID.test(uid)) return NextResponse.json({ error: "รหัสห้องแชทไม่ถูกต้อง" }, { status: 400 });

  const q = (url.searchParams.get("q") ?? "").trim().toUpperCase();
  if (q) {
    const id = /^\d{6}-\d{4}$/.test(q) ? `OD-${q}` : q;
    if (!/^[A-Z]{2,4}-\d{6}-\d{3,6}$/.test(id)) return NextResponse.json({ error: "พิมพ์เลขออเดอร์เต็ม เช่น OD-261014-5697" }, { status: 400 });
    const { data, error } = await sb.from("orders").select(SELECT).eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: `ไม่พบ ${id}` }, { status: 404 });
    return NextResponse.json({ order: toRow(data as unknown as Order, uid) }, { headers: { "Cache-Control": "no-store" } });
  }

  // ดัชนี orders_line_user_idx (supabase/orders-io-indexes.sql) ช่วยให้ไม่ต้องสแกนทั้งตาราง — ไม่มีก็ยังทำงาน แค่ช้ากว่า
  const { data, error } = await sb
    .from("orders")
    .select(SELECT)
    .or(`data->>lineUserId.eq.${uid},data->loginLine->>userId.eq.${uid}`)
    .order("created_at", { ascending: false })
    .limit(15);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const orders = ((data ?? []) as unknown as Order[]).map((o) => toRow(o, uid));
  return NextResponse.json({ orders }, { headers: { "Cache-Control": "no-store" } });
}
