import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Contact } from "@/lib/contacts";

export const runtime = "nodejs";

/**
 * ค้นหา "สมาชิกเว็บ" ไว้เจาะจงคูปอง — คืนเฉพาะคนที่มีบัญชีจริง (มี memberId = uuid ของ Supabase Auth)
 *
 * มีเพื่อให้แอดมินพิมพ์ชื่อลูกค้าแทนการไปคัดลอก uuid จาก Supabase Dashboard
 * (เจาะจงคูปองด้วยชื่อ/เบอร์ไม่ได้ ระบบเทียบกับ uuid เท่านั้น — ดู validateCoupon)
 */

const tableMissing = (msg = "", code?: string) =>
  code === "42P01" || code === "PGRST205" || /schema cache|find the table|relation .*does not exist/i.test(msg);

/** ตัดอักขระที่ PostgREST ใช้เป็นตัวคั่นใน .or() ออก — กันคำค้นทำ filter พัง */
const cleanQuery = (q: string) => q.replace(/[,()"'\\%*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

export async function GET(req: Request) {
  const gate = await requirePerm("coupons.manage");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ members: [] });

  const q = cleanQuery(new URL(req.url).searchParams.get("q") ?? "");

  let query = sb.from("contacts").select("id,data").not("data->>memberId", "is", null).limit(20);
  if (q) {
    const like = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    const parts = [`data->>name.ilike.${like}`, `data->>email.ilike.${like}`];
    parts.push(digits ? `data->>phone.ilike.%${digits}%` : `data->>phone.ilike.${like}`);
    query = query.or(parts.join(","));
  }

  const { data, error } = await query;
  if (error) {
    if (tableMissing(error.message, error.code)) return NextResponse.json({ members: [] });
    return NextResponse.json({ error: error.message, members: [] }, { status: 500 });
  }

  const members = (data ?? [])
    .map((r) => r.data as Contact)
    .filter((c) => c.memberId)
    .map((c) => ({
      memberId: c.memberId!,
      name: (c.name ?? "").trim() || "ไม่มีชื่อ",
      phone: c.phone ?? "",
      email: c.email ?? "",
      channel: c.channel ?? null,
      orders: c.orders?.count ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));

  return NextResponse.json({ members });
}
