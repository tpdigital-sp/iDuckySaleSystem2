import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { couponMaxUses, couponUsesLeft, isRefundCredit, type Coupon } from "@/lib/coupons";
import { SITE_URL } from "@/lib/shop-info";

export const runtime = "nodejs";

/**
 * 🎟 คูปองที่ส่งให้ลูกค้าห้องแชทนี้ได้ (แท็บ คูปอง ในหน้าต่าง ⊕ เลือกคอนเทนต์ · หน้า /admin/chatbot/chats · 14 ต.ค. 69)
 *   GET ?id=U… → { member, coupons[] }
 *   member = บัญชีเว็บของลูกค้า (Supabase Auth ที่ล็อกอินด้วย LINE: user_metadata.line_user_id = userId ห้องแชท) — ไม่มี = null
 *   coupons = ใบที่ยังใช้ได้ (active · ไม่หมดอายุ · เหลือสิทธิ์) และ "ไม่ได้เจาะจงคนอื่น"
 *             (เจาะจงคนนี้ = forThisCustomer · ไม่เจาะจง = ใครก็ใช้ได้)
 * อ่านอย่างเดียว — สร้างคูปองยังทำที่ /admin/coupons (สิทธิ์ coupons.manage)
 * ⚠️ คูปองตัดสิทธิ์ตอนสั่งด้วย customerId เท่านั้น → ลูกค้าต้องล็อกอินก่อนสั่ง (ข้อความที่ส่งบอกลูกค้าไว้)
 */

type UserLite = { id: string; name: string };
let usersCache: { at: number; byLine: Map<string, UserLite> } | null = null;
const USERS_TTL = 5 * 60_000;

/** LINE userId → บัญชีเว็บ (บัญชีมีไม่กี่สิบ ไล่ listUsers แล้วแคช 5 นาที) */
async function memberOfLine(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>, lineId: string): Promise<UserLite | null> {
  if (!usersCache || Date.now() - usersCache.at > USERS_TTL) {
    const byLine = new Map<string, UserLite>();
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) break;
      for (const u of data.users) {
        const m = (u.user_metadata ?? {}) as { line_user_id?: string; name?: string; full_name?: string };
        if (m.line_user_id) byLine.set(m.line_user_id, { id: u.id, name: String(m.name || m.full_name || u.email || "") });
      }
      if (data.users.length < 1000) break;
    }
    usersCache = { at: Date.now(), byLine };
  }
  return usersCache.byLine.get(lineId) ?? null;
}

export async function GET(req: Request) {
  const gate = await requirePerm(["chat.reply", "coupons.manage"]);
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const id = String(new URL(req.url).searchParams.get("id") ?? "").trim();
  if (!/^U[0-9a-f]{32}$/.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });

  const [member, rows] = await Promise.all([memberOfLine(sb, id), sb.from("coupons").select("data").order("created_at", { ascending: false })]);
  if (rows.error) return NextResponse.json({ error: rows.error.message }, { status: 500 });

  const now = Date.now();
  const coupons = (rows.data ?? [])
    .map((r) => r.data as Coupon)
    .filter((c) => c.status === "active" && couponUsesLeft(c) > 0 && (!c.expiresAt || new Date(c.expiresAt).getTime() > now))
    .filter((c) => !c.assignedTo || (member && c.assignedTo === member.id))
    // 💸 RF- = เงินคืนจากยอดโอนเกินของลูกค้ารายอื่น (ส่วนใหญ่ไม่ได้เจาะจงบัญชี) — ห้ามโผล่ให้ส่งคนอื่น
    .filter((c) => !isRefundCredit(c) || (member && c.assignedTo === member.id))
    // ผู้ใช้ครั้งเดียวต่อคนที่คนนี้ใช้ไปแล้ว = ไม่ต้องโชว์
    .filter((c) => !(c.oncePerCustomer && member && (c.redemptions ?? []).some((x) => x.customerId === member.id)))
    .map((c) => ({
      code: c.code,
      type: c.type,
      value: c.value,
      minSpend: c.minSpend ?? null,
      maxDiscount: c.maxDiscount ?? null,
      expiresAt: c.expiresAt ?? null,
      note: c.note ?? "",
      usesLeft: couponUsesLeft(c),
      maxUses: couponMaxUses(c),
      forThisCustomer: !!c.assignedTo,
      hasExclusions: !!c.excludeProducts?.length,
      link: `${SITE_URL}/coupon/${encodeURIComponent(c.code)}`,
    }))
    // ของคนนี้ขึ้นก่อน
    .sort((a, b) => Number(b.forThisCustomer) - Number(a.forThisCustomer));

  return NextResponse.json({ member, coupons }, { headers: { "Cache-Control": "no-store" } });
}
