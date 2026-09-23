import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { mergeMemberIntoContact, type Contact, type MemberAccount, type PointLog } from "@/lib/contacts";
import { movedLogPrefix, pushLinkUndo } from "@/lib/server/contact-link-undo";

export const runtime = "nodejs";

/**
 * 🔗 ผูก "บัญชีสมาชิกเว็บ" เข้ากับการ์ดผู้ติดต่อเดิม (ลูกค้าเก่าเพิ่งมาล็อกอินครั้งแรก)
 *
 * ทำไม (เจ้าของร้านแจ้ง 23 ก.ย. 69 — ลูกค้าทัก "เลือกล็อกอินด้วยไอดีไลน์แล้วมันเป็นสมัครใหม่เลย
 * คือต้องสะสมระดับสมาชิกใหม่"): ลูกค้า 93% สั่งแบบไม่ล็อกอิน พอมาล็อกอิน LINE ครั้งแรกจึงไม่มีบัญชีเดิม
 * ให้รวม ระบบสร้างบัญชีใหม่ (ถูกแล้ว) แต่ **แต้ม/ระดับสมาชิกอยู่ที่การ์ดผู้ติดต่อ ไม่ได้อยู่ที่บัญชีล็อกอิน**
 * — หน้า /account กับตอนคิดส่วนลดอ่านระดับจากการ์ดที่ถือ memberId = uuid ของบัญชี
 * (api/orders/mine · api/orders) ดังนั้นแค่ "ย้าย memberId ไปไว้ที่การ์ดเดิม" ระดับกับแต้มก็กลับมาครบ
 *
 * ตัวนี้ทำให้จบในปุ่มเดียว: ย้าย memberId → ยุบการ์ดใบใหม่เข้ากับใบเดิม (แต้ม + ประวัติคะแนน +
 * สถิติออเดอร์ + ช่องที่ยังว่าง) → ลบใบซ้ำ เพื่อไม่ให้เหลือคนเดียวสองการ์ด
 * กติกาการรวมอยู่ใน mergeMemberIntoContact (lib/contacts.ts) มีเทส npm run check:contact-link
 *
 * body: { contactId, memberId }
 */

const tableMissing = (msg = "", code?: string) =>
  code === "42P01" || code === "PGRST205" || /schema cache|find the table|relation .*does not exist/i.test(msg);

type LogRow = { id: string; contact_id: string; data: Omit<PointLog, "id" | "contactId"> };

export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { contactId?: string; memberId?: string } | null;
  const contactId = String(body?.contactId ?? "").trim();
  const memberId = String(body?.memberId ?? "").trim();
  if (!contactId || !memberId) return NextResponse.json({ error: "ต้องบอกทั้งการ์ดผู้ติดต่อและบัญชีสมาชิก" }, { status: 400 });

  // ── บัญชีสมาชิกต้องมีจริง ──
  const { data: userRes, error: userErr } = await sb.auth.admin.getUserById(memberId);
  const user = userRes?.user;
  if (userErr || !user) return NextResponse.json({ error: "ไม่พบบัญชีสมาชิกนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const userEmail = (user.email ?? "").toLowerCase();
  if (userEmail.endsWith("@staff.iducky.local"))
    return NextResponse.json({ error: "นี่เป็นบัญชีพนักงาน ไม่ใช่บัญชีลูกค้า" }, { status: 400 });

  // ── การ์ดปลายทาง (ใบเดิมที่มีแต้ม/ประวัติ) ──
  const { data: tRow, error: tErr } = await sb.from("contacts").select("id,data").eq("id", contactId).maybeSingle();
  if (tErr) {
    if (tableMissing(tErr.message, tErr.code)) return NextResponse.json({ error: "ยังไม่มีตาราง contacts" }, { status: 409 });
    return NextResponse.json({ error: tErr.message }, { status: 500 });
  }
  if (!tRow) return NextResponse.json({ error: "ไม่พบผู้ติดต่อนี้" }, { status: 404 });
  const target: Contact = { ...(tRow.data as Contact), id: tRow.id as string };

  // ── การ์ดที่ถือบัญชีนี้อยู่ตอนนี้ (ใบที่ระบบสร้างให้ตอนสมัคร) ──
  const { data: sRows } = await sb.from("contacts").select("id,data").eq("data->>memberId", memberId);
  const sources = (sRows ?? []).map((r) => ({ ...(r.data as Contact), id: r.id as string })).filter((c) => c.id !== target.id);

  const meta = (user.user_metadata ?? {}) as { name?: string; picture?: string; line_user_id?: string };
  const member: MemberAccount = {
    id: memberId,
    name: meta.name,
    // อีเมลสังเคราะห์ของบัญชี LINE ไม่ใช่อีเมลติดต่อจริง อย่าเอาไปใส่การ์ด
    email: userEmail.endsWith("@line.iducky.local") ? "" : userEmail,
    picture: meta.picture,
    channel: meta.line_user_id ? "line" : "email",
    createdAt: user.created_at,
  };
  const hadOther = target.memberId && target.memberId !== memberId ? target.memberId : "";
  const by = gate.actor.name || gate.actor.username;
  const next = mergeMemberIntoContact(target, sources, member, { by });

  /**
   * ↩️ ถ่ายสำเนา "ก่อนผูก" ก่อนเขียนอะไรทั้งสิ้น — พนักงานผูกผิดคนต้องย้อนกลับได้
   * (เจ้าของร้านสั่ง 23 ก.ย. 69) · เก็บไม่สำเร็จ = ไม่ยอมผูกให้ ดีกว่าลบการ์ดแล้วกู้ไม่ได้
   */
  const saved = await pushLinkUndo(sb, { at: new Date().toISOString(), by, targetId: target.id, memberId, targetBefore: target, sources });
  if (!saved) return NextResponse.json({ error: "เก็บสำเนาสำหรับย้อนกลับไม่สำเร็จ — ยังไม่ได้ผูกให้ ลองใหม่อีกครั้ง" }, { status: 500 });

  // ── ประวัติคะแนนของใบที่จะถูกยุบ ต้องตามมาด้วย ไม่งั้นแต้มที่รวมเข้ามาจะอธิบายไม่ได้ ──
  let movedLogs = 0;
  for (const src of sources) {
    const { data: logs, error: logErr } = await sb.from("contact_points").select("id,contact_id,data").eq("contact_id", src.id).limit(2000);
    if (logErr) {
      if (tableMissing(logErr.message, logErr.code)) break; // ยังไม่มีตารางประวัติ — ผูกบัญชีต่อได้
      return NextResponse.json({ error: logErr.message }, { status: 500 });
    }
    const rows = (logs ?? []) as LogRow[];
    if (!rows.length) continue;
    const moved = rows.map((r) => ({ id: `${movedLogPrefix(next.id)}${r.id}`, contact_id: next.id, data: r.data }));
    const { error: insErr } = await sb.from("contact_points").upsert(moved, { onConflict: "id" });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    await sb.from("contact_points").delete().eq("contact_id", src.id);
    movedLogs += moved.length;
  }

  const { error: upErr } = await sb.from("contacts").upsert({ id: next.id, data: next }, { onConflict: "id" });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // ── ลบการ์ดซ้ำ (หลังบันทึกใบปลายทางสำเร็จแล้วเท่านั้น) ──
  for (const src of sources) await sb.from("contacts").delete().eq("id", src.id);

  return NextResponse.json({
    contact: next,
    movedFrom: sources.map((s) => ({ id: s.id, name: (s.name ?? "").trim(), point: s.point ?? 0 })),
    movedLogs,
    ...(hadOther ? { unlinked: hadOther } : {}),
  });
}
