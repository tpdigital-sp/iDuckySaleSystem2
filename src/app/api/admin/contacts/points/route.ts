import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { Contact, PointLog } from "@/lib/contacts";

export const runtime = "nodejs";

const tableMissing = (msg: string, code?: string) =>
  code === "42P01" || code === "PGRST205" || /schema cache|find the table|relation .*does not exist/i.test(msg);

/** ประวัติคะแนนของผู้ติดต่อคนเดียว ?id= — ใหม่สุดก่อน */
export async function GET(req: Request) {
  const gate = await requirePerm("orders.viewAll");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ logs: [] });
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "ไม่รู้ว่ารายไหน" }, { status: 400 });
  const { data, error } = await sb.from("contact_points").select("id,contact_id,data").eq("contact_id", id).limit(2000);
  if (error) {
    if (tableMissing(error.message, error.code)) return NextResponse.json({ logs: [], needsSetup: true });
    return NextResponse.json({ error: error.message, logs: [] }, { status: 500 });
  }
  const logs: PointLog[] = (data ?? [])
    .map((r) => ({ id: r.id as string, contactId: r.contact_id as string, ...(r.data as Omit<PointLog, "id" | "contactId">) }))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return NextResponse.json({ logs });
}

/**
 * นำเข้าคะแนน (จากสคริปต์ export-contact-points-console.js) — ส่งเป็นก้อน
 * body: { flags?: [{ id, pointActive }], history?: [{ contactId, at, action, point, orderId, note }] }
 *   flags   → ติดธง pointActive ให้ผู้ติดต่อที่ระบบเดิม "คำนวณคะแนนสะสม" (อ่าน data เดิมมาเติม ไม่ทับฟิลด์อื่น)
 *   history → แทนที่ประวัติทั้งชุดของผู้ติดต่อที่อยู่ในก้อนนี้ (ลบของเดิมก่อน กันซ้ำเมื่อนำเข้าซ้ำ)
 */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { flags?: { id: string; pointActive?: boolean }[]; history?: Record<string, unknown>[] } | null;
  if (!body) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const flags = Array.isArray(body.flags) ? body.flags.slice(0, 2000) : [];
  const history = Array.isArray(body.history) ? body.history.slice(0, 5000) : [];

  let flagged = 0;
  for (let i = 0; i < flags.length; i += 200) {
    const chunk = flags.slice(i, i + 200);
    const ids = chunk.map((f) => String(f.id));
    const { data, error } = await sb.from("contacts").select("id,data").in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const want = new Map(chunk.map((f) => [String(f.id), !!f.pointActive]));
    const updates = (data ?? [])
      .map((r) => {
        const c = r.data as Contact;
        const on = want.get(r.id as string);
        if (!!c.pointActive === on) return null;
        const next = { ...c };
        if (on) next.pointActive = true;
        else delete next.pointActive;
        return { id: r.id as string, data: next };
      })
      .filter(Boolean) as { id: string; data: Contact }[];
    if (updates.length) {
      const { error: upErr } = await sb.from("contacts").upsert(updates, { onConflict: "id" });
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
      flagged += updates.length;
    }
  }

  // ประวัติ — จัดกลุ่มตามผู้ติดต่อ ลบชุดเก่าแล้วใส่ใหม่
  const byContact = new Map<string, Record<string, unknown>[]>();
  for (const h of history) {
    const cid = String(h.contactId ?? "").trim();
    if (!cid) continue;
    if (!byContact.has(cid)) byContact.set(cid, []);
    byContact.get(cid)!.push(h);
  }
  const rows: { id: string; contact_id: string; data: Omit<PointLog, "id" | "contactId"> }[] = [];
  for (const [cid, list] of byContact) {
    list.forEach((h, i) => {
      const orderId = String(h.orderId ?? "").trim();
      const note = String(h.note ?? "").trim();
      rows.push({
        id: `${cid}:${i + 1}`,
        contact_id: cid,
        data: {
          at: String(h.at ?? "").trim(),
          action: String(h.action ?? "").trim(),
          point: Number(String(h.point ?? "0").replace(/[^\d.-]/g, "")) || 0,
          ...(orderId ? { orderId } : {}),
          ...(note ? { note } : {}),
        },
      });
    });
  }
  const cids = [...byContact.keys()];
  for (let i = 0; i < cids.length; i += 200) {
    const { error } = await sb.from("contact_points").delete().in("contact_id", cids.slice(i, i + 200));
    if (error) {
      if (tableMissing(error.message, error.code)) return NextResponse.json({ error: "ยังไม่มีตาราง contact_points — รัน supabase/contacts.sql ก่อน", needsSetup: true }, { status: 409 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("contact_points").upsert(rows.slice(i, i + 500), { onConflict: "id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ flagged, contacts: cids.length, logs: rows.length });
}
