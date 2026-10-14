import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { pickKeys, REPORT_ORDER_KEYS } from "@/lib/server/orders-lite";
import { CHAT_COLLECTION, getChatFirestore } from "@/lib/server/firebase-admin";
import { orderBalance, orderStatusLabel, orderTotal, type Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * 📦 ออเดอร์ของห้องแชท LINE — แผงข้างห้องใน /admin/chatbot/chats (ขั้น 2 · 14 ต.ค. 69)
 *
 * GET ?uid=U…           → ใบที่ผูก LINE คนนี้ (lineUserId) + ใบที่สั่งโดยล็อกอิน LINE คนนี้ (loginLine.userId) ใหม่→เก่า 15 ใบ
 * GET ?uid=U…&q=OD-…    → หาใบเดียวไว้ "ผูกกับห้องนี้" — บอกด้วยว่าใบนั้นผูก LINE คนอื่นอยู่ไหม (หน้าเว็บต้องถามก่อนผูกทับ)
 * GET ?uid=U…&suggest=1 → ✨ ใบที่น่าจะเป็นของห้องนี้ (ยังไม่ผูกกับห้องนี้) ให้กดผูกได้เลยไม่ต้องพิมพ์เลข:
 *     · เลข OD ที่ลูกค้าพิมพ์/วางในแชท · เบอร์โทรในแชทตรงกับเบอร์ในใบ (หลักฐานจากห้องนี้เอง)
 *     · recent = ใบใหม่ 2 วันที่ยังไม่ผูก LINE ใคร (ไว้เลือกเองเมื่อไม่เจออะไรในแชท)
 *
 * ⚠️ ไม่เดาจากเบอร์โทร (เบอร์เดียวกันคนละ LINE มีจริง — ดู inheritedFromPastOrders ใน notify.ts) · ผูกจริงผ่าน /api/admin/orders/line-bind ตัวเดิม
 * ไม่หยิบก้อน data เต็ม (log/proofs หนัก) — เอาเฉพาะคีย์ที่คิดยอด/ป้ายสถานะได้ (pickKeys)
 */
const KEYS = [...REPORT_ORDER_KEYS, "shipping", "shippingLabel", "lineUserId", "lineProfile", "loginLine", "tracking", "claimOf"] as const;
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
  /** ✨ เหตุผลที่เสนอใบนี้ (โหมด suggest) */
  why?: string;
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

/** ข้อความในห้อง (ล่าสุด 300 รายการ) แยก ลูกค้าพิมพ์ / ร้านตอบ (บอท·ร่าง·แอดมิน) — ไว้หาเลข OD/เบอร์โทร */
async function roomTexts(uid: string): Promise<{ cust: string; shop: string }> {
  const db = getChatFirestore();
  if (!db) return { cust: "", shop: "" };
  try {
    const snap = await db.collection(CHAT_COLLECTION).doc(uid).collection("log").orderBy("at", "desc").limit(300).get();
    const cust: string[] = [];
    const shop: string[] = [];
    for (const d of snap.docs) {
      const role = String(d.get("role") ?? "");
      const text = String(d.get("text") ?? "");
      if (!text || role === "system") continue; // การ์ดระบบ = ใบที่ผูกห้องนี้อยู่แล้ว
      (role === "user" ? cust : shop).push(text);
    }
    return { cust: cust.join("\n"), shop: shop.join("\n") };
  } catch {
    return { cust: "", shop: "" };
  }
}

/** เลข OD ในข้อความ: "OD-261014-5697" · "OD 2610145697" · เลขล้วน "261014-5697" */
function odIds(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(/(?<!\d)(?:OD[\s-]*)?(\d{6})[\s-]?(\d{4})(?!\d)/gi)) {
    const yy = Number(m[1].slice(0, 2));
    const mm = Number(m[1].slice(2, 4));
    // OD-YYMMDD (ค.ศ. 2 หลัก) — กันเลขอื่น 10 หลักที่บังเอิญหน้าตาเหมือน
    if (yy >= 24 && yy <= 40 && mm >= 1 && mm <= 12) ids.add(`OD-${m[1]}-${m[2]}`);
  }
  return [...ids];
}

async function suggest(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>, uid: string) {
  const { cust, shop } = await roomTexts(uid);
  const custIds = odIds(cust);
  const shopIds = odIds(shop).filter((x) => !custIds.includes(x));
  // เบอร์มือถือไทย 10 หลัก (มีขีด/เว้นวรรคได้) จากที่ลูกค้าพิมพ์เท่านั้น — ใช้เทียบกับเบอร์ในใบ
  const phones = new Set<string>();
  for (const m of cust.matchAll(/(?<!\d)0[689](?:[\s-]?\d){8}(?!\d)/g)) phones.add(m[0].replace(/\D/g, ""));

  const out = new Map<string, ChatOrderRow>();
  const add = (rows: unknown[] | null, why: string) => {
    for (const r of (rows ?? []) as Order[]) {
      const row = toRow(r, uid);
      if (row.link === "bound" || out.has(row.id) || r.status === "ยกเลิก") continue;
      out.set(row.id, { ...row, why });
    }
  };
  const idList = [...custIds, ...shopIds].slice(0, 20);
  const phoneList = [...phones].slice(0, 5);
  const [byId, byPhone, recent] = await Promise.all([
    idList.length ? sb.from("orders").select(SELECT).in("id", idList) : Promise.resolve({ data: [] }),
    phoneList.length
      ? sb.from("orders").select(SELECT).in("data->>phone", phoneList).order("created_at", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
    sb
      .from("orders")
      .select(SELECT)
      .is("data->>lineUserId", null)
      .gte("created_at", new Date(Date.now() - 2 * 86400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(12),
  ]);
  const ided = (byId.data ?? []) as unknown as Order[];
  add(ided.filter((o) => custIds.includes(o.id)), "ลูกค้าพิมพ์เลขใบนี้ในแชท");
  add(ided.filter((o) => shopIds.includes(o.id)), "ร้าน/บอทพูดถึงใบนี้ในแชท");
  add(byPhone.data as unknown[], "เบอร์ในแชทตรงกับใบนี้");
  const matched = [...out.values()];
  const recentRows = ((recent.data ?? []) as unknown as Order[])
    .filter((o) => o.status !== "ยกเลิก" && !out.has(o.id) && !o.claimOf)
    .map((o) => toRow(o, uid))
    .filter((r) => r.link === "none" || r.link === "login");
  return { matched, recent: recentRows };
}

export async function GET(req: Request) {
  const gate = await requirePerm(["orders.view", "chat.reply"]);
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const url = new URL(req.url);
  const uid = (url.searchParams.get("uid") ?? "").trim();
  if (!UID.test(uid)) return NextResponse.json({ error: "รหัสห้องแชทไม่ถูกต้อง" }, { status: 400 });

  if (url.searchParams.get("suggest")) {
    try {
      return NextResponse.json(await suggest(sb, uid), { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

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
