import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Contact } from "@/lib/contacts";

export const runtime = "nodejs";

/**
 * 🔗 รายชื่อ "บัญชีสมาชิกเว็บ" ไว้เลือกผูกกับการ์ดผู้ติดต่อเดิม (ดู ./link/route.ts)
 *
 * อ่านจาก Supabase Auth โดยตรง ไม่ใช่จากตาราง contacts — เพราะเคสที่ต้องใช้คือ
 * "ลูกค้าเก่าเพิ่งล็อกอิน LINE ครั้งแรกเมื่อกี้" ซึ่งการ์ดของบัญชีนั้นอาจยังไม่ถูกซิงก์เข้าคลัง
 * (ซิงก์ห่างกันอย่างน้อย 2 นาที — ดู lib/server/contacts-sync.ts) แล้วจะหาไม่เจอทั้งที่บัญชีมีจริง
 *
 * คืนพร้อมข้อมูลว่า "ตอนนี้บัญชีนี้ผูกอยู่กับการ์ดใบไหน" เพื่อให้เห็นก่อนกดว่ากำลังย้ายมาจากใบไหน
 */

type Member = {
  memberId: string;
  name: string;
  email: string;
  phone: string;
  channel: "line" | "email";
  picture?: string;
  memberSince?: string;
  /** การ์ดผู้ติดต่อที่ถือ memberId นี้อยู่ตอนนี้ (ถ้ามี) */
  boundTo?: { id: string; name: string; point: number; orders: number };
};

const clean = (s: string) => s.trim().toLowerCase();

export async function GET(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ members: [] });

  const q = clean(new URL(req.url).searchParams.get("q") ?? "").slice(0, 80);
  const digits = q.replace(/\D/g, "");

  // ร้านมีบัญชีลูกค้าหลักสิบราย — อ่านทีเดียวจบ (เผื่อโตไว้ 5 หน้า = 5,000 บัญชี)
  const members: Member[] = [];
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return NextResponse.json({ error: error.message, members: [] }, { status: 500 });
    for (const u of data.users) {
      const email = (u.email ?? "").toLowerCase();
      if (email.endsWith("@staff.iducky.local")) continue; // บัญชีพนักงาน ไม่ใช่ลูกค้า
      const m = (u.user_metadata ?? {}) as { name?: string; phone?: string; picture?: string; line_user_id?: string };
      members.push({
        memberId: u.id,
        name: (m.name ?? "").trim(),
        // อีเมลสังเคราะห์ของบัญชี LINE (line_<userId>@line.iducky.local) ไม่ใช่อีเมลจริง ไม่ต้องโชว์
        email: email.endsWith("@line.iducky.local") ? "" : email,
        phone: (m.phone ?? "").trim(),
        channel: m.line_user_id ? "line" : "email",
        picture: m.picture || undefined,
        memberSince: u.created_at,
      });
    }
    if (data.users.length < 1000) break;
  }

  const hits = q
    ? members.filter((m) => {
        const hay = `${m.name} ${m.email}`.toLowerCase();
        return hay.includes(q) || (!!digits && m.phone.replace(/\D/g, "").includes(digits));
      })
    : members;

  // เรียง: บัญชีที่ยังไม่มีการ์ดชัดเจน (สมัครล่าสุด) ขึ้นก่อน — เคสที่ใช้จริงคือคนที่เพิ่งสมัครเมื่อกี้
  hits.sort((a, b) => (b.memberSince ?? "").localeCompare(a.memberSince ?? ""));
  const top = hits.slice(0, 30);

  // การ์ดที่ถือ memberId เหล่านี้อยู่
  if (top.length) {
    const { data } = await sb
      .from("contacts")
      .select("id,data")
      .in("data->>memberId", top.map((m) => m.memberId));
    const byMember = new Map<string, Contact>();
    for (const r of data ?? []) {
      const c = { ...(r.data as Contact), id: r.id as string };
      if (c.memberId) byMember.set(c.memberId, c);
    }
    for (const m of top) {
      const c = byMember.get(m.memberId);
      if (c) m.boundTo = { id: c.id, name: (c.name ?? "").trim() || "(ไม่มีชื่อ)", point: c.point ?? 0, orders: c.orders?.count ?? 0 };
    }
  }

  return NextResponse.json({ members: top, total: hits.length });
}
