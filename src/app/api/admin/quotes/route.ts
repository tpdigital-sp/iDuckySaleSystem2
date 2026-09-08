import { NextResponse } from "next/server";
import { bkkYmd, thaiDateTime } from "@/lib/bangkok-time";
import { randomBytes } from "node:crypto";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withQuoteLog, type Quote } from "@/lib/quotes";
import { syncQuoteMemberTier } from "@/lib/server/quote-member-tier";

export const runtime = "nodejs";

const TABLE = "quotes";
/** ตารางยังไม่ถูกสร้าง → บอกให้ไปรัน supabase/quotes.sql แทนที่จะโยน error ดิบ */
const needsSetup = (msg?: string) =>
  !!msg && (/relation .* does not exist/i.test(msg) || /schema cache/i.test(msg) || /could not find the table/i.test(msg));

/** รายการใบเสนอราคาทั้งหมด (ใหม่ → เก่า) */
export async function GET() {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ quotes: [] });

  const { data, error } = await sb.from(TABLE).select("data").order("created_at", { ascending: false });
  if (error) {
    if (needsSetup(error.message)) return NextResponse.json({ quotes: [], needsSetup: true });
    return NextResponse.json({ error: error.message, quotes: [] }, { status: 500 });
  }
  return NextResponse.json({ quotes: (data ?? []).map((r) => r.data as Quote) });
}

/** สร้างใบเสนอราคาใหม่ (ว่าง ๆ แล้วไปกรอกในหน้ารายละเอียด) */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: {
    customer?: string;
    phone?: string;
    address?: string;
    /** ผู้ติดต่อที่เลือกจากคลังตอนกรอกชื่อ — ผูกไว้ตั้งแต่ใบแรก แต้มจะได้เข้าคนถูกตอนแปลงเป็นออเดอร์ */
    contactId?: string;
    validDays?: number;
    copyFrom?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* สร้างเปล่าได้ */
  }

  const now = new Date();
  const id = `QT-${bkkYmd(now)}-${Math.floor(1000 + Math.random() * 9000)}`;
  const by = gate.actor.name?.trim() || gate.actor.username;
  const validDays = Number.isFinite(Number(body.validDays)) && Number(body.validDays) > 0 ? Math.floor(Number(body.validDays)) : 7;

  // ก๊อปจากใบเดิม (เสนอหลายแบบให้ลูกค้าคนเดียวกัน — แก้ราคา/สเปคทีหลังได้)
  let base: Partial<Quote> = {};
  if (body.copyFrom) {
    const { data: src } = await sb.from(TABLE).select("data").eq("id", body.copyFrom).maybeSingle();
    const q = src?.data as Quote | undefined;
    if (q)
      base = {
        customer: q.customer,
        phone: q.phone,
        address: q.address,
        contactId: q.contactId,
        email: q.email,
        items: q.items.map((it) => ({ ...it })),
        shippingCost: q.shippingCost,
        note: q.note,
      };
  }

  let quote: Quote = {
    id,
    key: randomBytes(24).toString("base64url"),
    customer: body.customer?.trim() || base.customer || "ยังไม่ระบุชื่อ",
    phone: body.phone?.trim() || base.phone || "",
    address: body.address?.trim() || base.address || "",
    ...(body.contactId?.trim() || base.contactId ? { contactId: body.contactId?.trim() || base.contactId } : {}),
    email: base.email,
    date: thaiDateTime(now),
    items: base.items ?? [],
    shippingCost: base.shippingCost ?? 0,
    note: base.note,
    status: "ร่าง",
    expiresAt: new Date(now.getTime() + validDays * 86400_000).toISOString(),
    createdBy: by,
  };
  quote = withQuoteLog(quote, by, body.copyFrom ? "สร้างใบเสนอราคา (ก๊อปจากใบเดิม)" : "สร้างใบเสนอราคา", body.copyFrom ?? undefined);
  // ผูกผู้ติดต่อมาตั้งแต่สร้าง → เติมส่วนลดระดับสมาชิกให้เลย
  quote = await syncQuoteMemberTier(sb, quote);

  const { error } = await sb.from(TABLE).insert({ id, data: quote });
  if (error) {
    if (needsSetup(error.message)) return NextResponse.json({ error: "ยังไม่ได้สร้างตาราง quotes — รัน supabase/quotes.sql ก่อน", needsSetup: true }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id });
}

/** บันทึกใบเสนอราคา (แก้ลูกค้า/รายการ/ราคา/สถานะ) */
export async function PATCH(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let quote: Quote;
  try {
    quote = (await req.json()) as Quote;
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!quote?.id) return NextResponse.json({ error: "ไม่มีเลขใบเสนอราคา" }, { status: 400 });

  // ส่วนลดระดับสมาชิกเป็นของเซิร์ฟเวอร์ — คิดจากผู้ติดต่อที่ผูกอยู่ทุกครั้งที่บันทึก (หน้าจอส่งค่ามาก็ไม่เชื่อ)
  quote = await syncQuoteMemberTier(sb, quote);

  const { error } = await sb.from(TABLE).update({ data: quote }).eq("id", quote.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, quote });
}

/** ลบใบเสนอราคา (เฉพาะใบร่าง/ไม่รับ — ใบที่กลายเป็นออเดอร์แล้วลบไม่ได้) */
export async function DELETE(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ไม่ได้ระบุเลขใบ" }, { status: 400 });

  const { data } = await sb.from(TABLE).select("data").eq("id", id).maybeSingle();
  const q = data?.data as Quote | undefined;
  if (q?.orderId) return NextResponse.json({ error: `ใบนี้กลายเป็นออเดอร์ ${q.orderId} แล้ว ลบไม่ได้` }, { status: 400 });

  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
