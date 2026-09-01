import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { newPriceLinkCode, PRICE_LINK_DAYS, type PriceLink } from "@/lib/price-links";

export const runtime = "nodejs";

const TABLE = "price_links";

/** ตารางยังไม่ถูกสร้าง → บอกให้ไปรัน supabase/price-links.sql แทนที่จะโยน error ดิบ */
const needsSetup = (msg?: string) =>
  !!msg &&
  (/relation .* does not exist/i.test(msg) || /schema cache/i.test(msg) || /could not find the table/i.test(msg));

/** ลิงก์ราคาทั้งหมด (ใหม่ → เก่า) — หน้า /admin/price-links */
export async function GET() {
  const gate = await requirePerm("admin.access");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ links: [] });

  const { data, error } = await sb
    .from(TABLE)
    .select("data")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    if (needsSetup(error.message)) return NextResponse.json({ links: [], needsSetup: true });
    return NextResponse.json({ error: error.message, links: [] }, { status: 500 });
  }
  return NextResponse.json({ links: (data ?? []).map((r) => r.data as PriceLink) });
}

/**
 * สร้างลิงก์ราคาใหม่จากสเปคที่แอดมินกำลังดูอยู่ที่หน้าสินค้า
 * ราคาถูก "แช่" ไว้ตรงนี้ — ร้านปรับตารางราคาทีหลังแล้วลิงก์เก่ายังยืนราคาเดิม
 */
export async function POST(req: Request) {
  const gate = await requirePerm("admin.access");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: Partial<PriceLink> & { days?: number };
  try {
    body = (await req.json()) as Partial<PriceLink> & { days?: number };
  } catch {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!body.productId || !body.spec) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });

  /**
   * สเปคเดิม + คนเดิม + ยังไม่หมดอายุ = ส่งใบเดิมกลับ ไม่สร้างใหม่
   * (แอดมินรีเฟรชหน้าแล้วกดคัดลอกซ้ำเพื่อส่งย้ำลูกค้า — ถ้าสร้างใบใหม่ทุกครั้ง
   *  ลิสต์หลังบ้านจะเต็มไปด้วยใบซ้ำ และตัวเลข "ลูกค้ายังไม่เปิด" จะพองเกินจริง)
   */
  const specKey = JSON.stringify(body.spec);
  const { data: mine } = await sb
    .from(TABLE)
    .select("data")
    .eq("data->>productId", String(body.productId))
    .order("created_at", { ascending: false })
    .limit(50);
  const same = (mine ?? [])
    .map((r) => r.data as PriceLink)
    .find(
      (l) =>
        !l.closed &&
        new Date(l.expiresAt).getTime() > Date.now() &&
        l.qty === Math.max(1, Number(body.qty) || 1) &&
        JSON.stringify(l.spec) === specKey
    );
  if (same) return NextResponse.json({ link: same, reused: true });

  const days = Number.isFinite(Number(body.days)) && Number(body.days) > 0 ? Math.floor(Number(body.days)) : PRICE_LINK_DAYS;
  const now = new Date();
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  const link: PriceLink = {
    code: newPriceLinkCode(),
    productId: String(body.productId),
    productPath: String(body.productPath || `/products/${body.productId}`),
    productName: String(body.productName || body.productId),
    ...(body.imageSrc ? { imageSrc: String(body.imageSrc) } : {}),
    spec: body.spec,
    lines: Array.isArray(body.lines) ? body.lines.slice(0, 40) : [],
    qty: Math.max(1, num(body.qty) || 1),
    unit: String(body.unit || "ชิ้น"),
    unitPrice: num(body.unitPrice),
    total: num(body.total),
    ...(body.askPrice ? { askPrice: true } : {}),
    ...(body.note?.trim() ? { note: body.note.trim().slice(0, 300) } : {}),
    createdBy: gate.actor.name?.trim() || gate.actor.username,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
    opened: 0,
  };

  // โค้ดชนกันแทบเป็นไปไม่ได้ (27^7) แต่ถ้าชนจริงต้องได้โค้ดใหม่ ไม่ใช่ทับใบเก่าของลูกค้าคนอื่น
  for (let tries = 0; tries < 5; tries++) {
    const { error } = await sb.from(TABLE).insert({ code: link.code, data: link });
    if (!error) return NextResponse.json({ link });
    if (needsSetup(error.message)) return NextResponse.json({ error: "ยังไม่ได้สร้างตาราง", needsSetup: true }, { status: 503 });
    if (!/duplicate key/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 500 });
    link.code = newPriceLinkCode();
  }
  return NextResponse.json({ error: "สร้างลิงก์ไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
}

/** ปิดลิงก์ / เปิดกลับ / ต่ออายุ — หน้า /admin/price-links */
export async function PATCH(req: Request) {
  const gate = await requirePerm("admin.access");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { code?: string; action?: "close" | "reopen" | "extend"; days?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!body.code) return NextResponse.json({ error: "ไม่ได้ระบุลิงก์" }, { status: 400 });

  const { data } = await sb.from(TABLE).select("data").eq("code", body.code).maybeSingle();
  const link = data?.data as PriceLink | undefined;
  if (!link) return NextResponse.json({ error: "ไม่พบลิงก์นี้" }, { status: 404 });

  const days = Number.isFinite(Number(body.days)) && Number(body.days) > 0 ? Math.floor(Number(body.days)) : PRICE_LINK_DAYS;
  const next: PriceLink =
    body.action === "close"
      ? { ...link, closed: true }
      : body.action === "reopen"
        ? { ...link, closed: false }
        : // ต่ออายุ: นับจากวันนี้เสมอ (ใบที่หมดอายุไปแล้วต่อจากของเดิมก็ยังหมดอายุอยู่ดี)
          { ...link, closed: false, expiresAt: new Date(Date.now() + days * 86_400_000).toISOString() };

  const { error } = await sb.from(TABLE).update({ data: next }).eq("code", link.code);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ link: next });
}
