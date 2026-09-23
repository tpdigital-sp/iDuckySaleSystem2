import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Contact, PointLog } from "@/lib/contacts";
import { movedLogPrefix, peekLinkUndo, takeLinkUndo } from "@/lib/server/contact-link-undo";

export const runtime = "nodejs";

/**
 * ↩️ ย้อนการผูกบัญชีสมาชิก — พนักงานผูกผิดคน (เจ้าของร้านสั่ง 23 ก.ย. 69)
 *
 * GET ?id=<รหัสผู้ติดต่อ>  → บอกว่าย้อนได้ไหม และจะได้อะไรคืน (หน้าจอเอาไปเขียนในกล่องยืนยัน)
 * POST { contactId }       → ย้อนจริง
 *
 * ย้อนแบบ "คืนค่าเดิมทั้งใบ" จากสำเนาที่ถ่ายไว้ตอนกดผูก (lib/server/contact-link-undo.ts):
 *   ① ประวัติคะแนนที่ย้ายมา ย้ายกลับไปการ์ดเดิม  ② สร้างการ์ดที่ถูกยุบคืน  ③ เขียนการ์ดปลายทางกลับเป็นก่อนผูก
 * ไม่มีสำเนา (ผูกไว้ตั้งแต่ก่อนมีระบบนี้ / เก่าเกิน 60 ครั้ง) → ได้แค่ "ปลดบัญชีออกจากการ์ด" เฉย ๆ
 */

const tableMissing = (msg = "", code?: string) =>
  code === "42P01" || code === "PGRST205" || /schema cache|find the table|relation .*does not exist/i.test(msg);

type LogRow = { id: string; contact_id: string; data: Omit<PointLog, "id" | "contactId"> };

export async function GET(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ undo: null });
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "ไม่รู้ว่าการ์ดไหน" }, { status: 400 });

  const undo = await peekLinkUndo(sb, id);
  if (!undo) return NextResponse.json({ undo: null });
  // แก้การ์ดใบนี้ไปหลังผูกหรือยัง — ย้อนกลับ = ทับของที่แก้ไว้ด้วย ต้องเตือนก่อน
  const { data } = await sb.from("contacts").select("data").eq("id", id).maybeSingle();
  const cur = data?.data as Contact | undefined;
  return NextResponse.json({
    undo: {
      at: undo.at,
      by: undo.by,
      memberId: undo.memberId,
      pointBefore: undo.targetBefore.point ?? 0,
      nameBefore: (undo.targetBefore.name ?? "").trim(),
      sources: undo.sources.map((s) => ({ id: s.id, name: (s.name ?? "").trim(), point: s.point ?? 0 })),
      editedAfter: !!cur?.updatedAt && cur.updatedAt > undo.at,
    },
  });
}

export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { contactId?: string } | null;
  const contactId = String(body?.contactId ?? "").trim();
  if (!contactId) return NextResponse.json({ error: "ไม่รู้ว่าการ์ดไหน" }, { status: 400 });

  const { data: tRow, error: tErr } = await sb.from("contacts").select("id,data").eq("id", contactId).maybeSingle();
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!tRow) return NextResponse.json({ error: "ไม่พบผู้ติดต่อนี้" }, { status: 404 });
  const current: Contact = { ...(tRow.data as Contact), id: tRow.id as string };

  const undo = await takeLinkUndo(sb, contactId);

  // ── ไม่มีสำเนา → ปลดบัญชีออกเฉย ๆ (ข้อมูลอื่นในการ์ดคงไว้) ──
  if (!undo) {
    if (!current.memberId) return NextResponse.json({ error: "การ์ดใบนี้ไม่ได้ผูกบัญชีอยู่แล้ว" }, { status: 400 });
    const next: Contact = { ...current };
    delete next.memberId;
    delete next.channel;
    delete next.picture;
    delete next.memberSince;
    next.origins = (next.origins ?? []).filter((o) => o !== "member");
    next.updatedAt = new Date().toISOString();
    next.updatedBy = gate.actor.name || gate.actor.username;
    const { error } = await sb.from("contacts").upsert({ id: next.id, data: next }, { onConflict: "id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contact: next, mode: "detach" });
  }

  // ── ① ประวัติคะแนนที่ย้ายมาตอนยุบ → ย้ายกลับการ์ดเดิม ──
  let movedBack = 0;
  const prefix = movedLogPrefix(contactId);
  const { data: logs, error: logErr } = await sb.from("contact_points").select("id,contact_id,data").eq("contact_id", contactId).like("id", `${prefix}%`).limit(5000);
  if (logErr && !tableMissing(logErr.message, logErr.code)) return NextResponse.json({ error: logErr.message }, { status: 500 });
  const rows = (logs ?? []) as LogRow[];
  if (rows.length) {
    const back: { id: string; contact_id: string; data: LogRow["data"] }[] = [];
    for (const r of rows) {
      const oldId = r.id.slice(prefix.length);
      // เจ้าของเดิม = การ์ดที่ id ของประวัติขึ้นต้นด้วยรหัสนั้น (ทั้ง "<id>:od:<ออเดอร์>" และ "<id>:<ลำดับ>")
      const owner = undo.sources.find((s) => oldId.startsWith(`${s.id}:`)) ?? (undo.sources.length === 1 ? undo.sources[0] : null);
      if (!owner) continue; // หาเจ้าของไม่ได้ → ทิ้งไว้ที่เดิม ดีกว่าย้ายมั่ว
      back.push({ id: oldId, contact_id: owner.id, data: r.data });
    }
    if (back.length) {
      const { error: insErr } = await sb.from("contact_points").upsert(back, { onConflict: "id" });
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
      await sb.from("contact_points").delete().in("id", back.map((b) => `${prefix}${b.id}`));
      movedBack = back.length;
    }
  }

  // ── ② สร้างการ์ดที่ถูกยุบคืน ── (ถ้ามีใบอื่นมาใช้รหัสนั้นแล้วจะถูกเขียนทับ — รหัสผู้ติดต่อไม่ถูกใช้ซ้ำ)
  if (undo.sources.length) {
    const { error: srcErr } = await sb.from("contacts").upsert(
      undo.sources.map((s) => ({ id: s.id, data: s })),
      { onConflict: "id" }
    );
    if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 });
  }

  // ── ③ การ์ดปลายทางกลับเป็นก่อนผูก ──
  const restored: Contact = { ...undo.targetBefore, updatedAt: new Date().toISOString(), updatedBy: gate.actor.name || gate.actor.username };
  const { error: upErr } = await sb.from("contacts").upsert({ id: restored.id, data: restored }, { onConflict: "id" });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({
    contact: restored,
    mode: "restore",
    restoredCards: undo.sources.map((s) => ({ id: s.id, name: (s.name ?? "").trim() })),
    movedBack,
  });
}
