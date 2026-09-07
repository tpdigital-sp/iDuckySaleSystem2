import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { normalizeContact, type Contact } from "@/lib/contacts";

export const runtime = "nodejs";

const tableMissing = (msg: string, code?: string) =>
  code === "42P01" || code === "PGRST205" || /schema cache|find the table|relation .*does not exist/i.test(msg);

/**
 * นำเข้าผู้ติดต่อเป็นชุด (หน้าจอส่งมาเป็นก้อนละ ≤ 2,000 ราย) — upsert ตาม id
 * body: { rows: [{ id, name, phone, address, point, rank, rankStatus, rankExpiry, ... }], source?: string }
 *
 * รายที่มีอยู่แล้ว: ทับข้อมูลจากระบบเดิม แต่คง note / email / customerType ที่แก้ในระบบนี้ไว้
 */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { rows?: unknown[]; source?: string } | null;
  const rows = Array.isArray(body?.rows) ? body!.rows : null;
  if (!rows) return NextResponse.json({ error: "ต้องส่ง rows เป็นอาร์เรย์" }, { status: 400 });
  if (rows.length > 2000) return NextResponse.json({ error: "ส่งได้ครั้งละไม่เกิน 2,000 ราย" }, { status: 400 });

  const now = new Date().toISOString();
  const source = String(body?.source ?? "casedesign2u-backoffice").slice(0, 60);
  const seen = new Set<string>();
  const records: { id: string; data: Contact }[] = [];
  let skipped = 0;
  for (const r of rows) {
    if (!r || typeof r !== "object") {
      skipped++;
      continue;
    }
    const c = normalizeContact(r as Record<string, unknown>, { source, importedAt: now, origins: ["legacy"] });
    if (!c || seen.has(c.id)) {
      skipped++; // ไม่มีรหัส หรือรหัสซ้ำในชุดเดียวกัน (ระบบเดิมมีรายการซ้ำอยู่บ้าง)
      continue;
    }
    seen.add(c.id);
    records.push({ id: c.id, data: c });
  }

  // คงข้อมูลที่แก้ในระบบนี้ไว้ (note/email/customerType) — ระบบเดิมไม่มีฟิลด์พวกนี้ ห้ามให้การนำเข้าซ้ำล้างทิ้ง
  // ค้นทีละ 200 รหัส — .in() ส่งเป็น query string ถ้ายาวเกินไป (2,000 รหัส) fetch จะล้ม
  const prevById = new Map<string, Contact>();
  const ids = records.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data: existing, error: readErr } = await sb.from("contacts").select("id,data").in("id", ids.slice(i, i + 200));
    if (readErr) {
      if (tableMissing(readErr.message, readErr.code)) return NextResponse.json({ error: "ยังไม่มีตาราง contacts — รัน supabase/contacts.sql ก่อน", needsSetup: true }, { status: 409 });
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }
    for (const r of existing ?? []) prevById.set(r.id as string, r.data as Contact);
  }
  let updated = 0;
  for (const rec of records) {
    const prev = prevById.get(rec.id);
    if (!prev) continue;
    updated++;
    if (prev.note && !rec.data.note) rec.data.note = prev.note;
    if (prev.email && !rec.data.email) rec.data.email = prev.email;
    if (prev.customerType && !rec.data.customerType) rec.data.customerType = prev.customerType;
    if (prev.updatedAt) rec.data.updatedAt = prev.updatedAt;
    if (prev.updatedBy) rec.data.updatedBy = prev.updatedBy;
    // ของที่ระบบซิงก์ให้ (สมาชิก/ออเดอร์) ต้องคงไว้ — ระบบเดิมไม่รู้จัก
    for (const k of ["memberId", "channel", "picture", "memberSince", "orders", "pointActive", "syncedAt"] as const) {
      if (prev[k] !== undefined && rec.data[k] === undefined) (rec.data as Record<string, unknown>)[k] = prev[k];
    }
    rec.data.origins = [...new Set([...(prev.origins ?? []), "legacy" as const])];
  }

  const BATCH = 500;
  for (let i = 0; i < records.length; i += BATCH) {
    const { error } = await sb.from("contacts").upsert(records.slice(i, i + BATCH), { onConflict: "id" });
    if (error) return NextResponse.json({ error: `บันทึกชุดที่ ${i / BATCH + 1} ไม่สำเร็จ: ${error.message}`, imported: i }, { status: 500 });
  }

  return NextResponse.json({ imported: records.length, inserted: records.length - updated, updated, skipped });
}
