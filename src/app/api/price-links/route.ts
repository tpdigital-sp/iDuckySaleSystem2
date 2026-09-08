import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import {
  newPriceLinkCode,
  priceLinkItems,
  PRICE_LINK_DAYS,
  PRICE_LINK_MAX_ITEMS,
  type PriceLink,
  type PriceLinkItem,
  type PriceLinkPieces,
} from "@/lib/price-links";

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
 * 🧺 รวมหลายใบเป็นใบเดียว — ลูกค้าคนเดียวสั่งหลายอย่างในงานเดียวกัน (สติ๊กเกอร์ + กล่อง + ป้าย)
 *
 * ทำไมรวมจาก "ใบที่มีอยู่แล้ว" แทนที่จะให้ติ๊กหลายสินค้าในหน้าเดียว:
 * สเปค/ราคาของแต่ละสินค้าคิดที่หน้าสินค้าของตัวเองเท่านั้น (สูตรราคาอยู่ที่นั่นที่เดียว)
 * แอดมินจึงทำใบเดี่ยวเหมือนเดิมทุกใบ แล้วค่อยมัดรวมทีหลัง — ราคาที่แช่ไว้เป็นชุดเดิมเป๊ะ ไม่คิดใหม่
 *
 * ใบต้นทางไม่ถูกปิดให้เอง — บางใบส่งไปหาลูกค้าแล้ว แอดมินตัดสินใจเองว่าจะปิดใบไหน
 */
async function mergeLinks(
  sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  codes: string[],
  actor: string,
  days: number,
  note?: string
): Promise<NextResponse> {
  const want = [...new Set(codes.map((c) => String(c).trim().toUpperCase()).filter(Boolean))];
  if (want.length < 2) return NextResponse.json({ error: "เลือกอย่างน้อย 2 ใบถึงจะรวมได้" }, { status: 400 });

  const { data, error } = await sb.from(TABLE).select("data").in("code", want);
  if (error) {
    if (needsSetup(error.message)) return NextResponse.json({ error: "ยังไม่ได้สร้างตาราง", needsSetup: true }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const found = new Map((data ?? []).map((r) => [(r.data as PriceLink).code, r.data as PriceLink]));
  const missing = want.filter((c) => !found.has(c));
  if (missing.length) return NextResponse.json({ error: `ไม่พบใบ ${missing.join(", ")}` }, { status: 404 });

  // รวมใบที่เป็นชุดอยู่แล้วก็ได้ — คลี่รายการข้างในออกมาต่อกัน ไม่ซ้อนชุดในชุด
  const items: PriceLinkItem[] = want.flatMap((c) => priceLinkItems(found.get(c)!));
  if (items.length > PRICE_LINK_MAX_ITEMS)
    return NextResponse.json(
      { error: `ใบเดียวใส่ได้ไม่เกิน ${PRICE_LINK_MAX_ITEMS} รายการ (เลือกมา ${items.length})` },
      { status: 400 }
    );

  const now = new Date();
  const [first] = items;
  const link: PriceLink = {
    ...first,
    code: newPriceLinkCode(),
    items,
    // ยอดของ "ทั้งใบ" — ตัวอ่านเก่าที่ไม่รู้จัก items ยังโชว์ยอดถูก (รายการที่รอตีราคานับเป็น 0)
    total: items.reduce((s, i) => s + (i.askPrice ? 0 : i.total), 0),
    ...(items.some((i) => i.askPrice) ? { askPrice: true } : { askPrice: undefined }),
    ...(note?.trim() ? { note: note.trim().slice(0, 300) } : {}),
    createdBy: actor,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
    closed: false,
    opened: 0,
  };
  if (!link.askPrice) delete link.askPrice;

  for (let tries = 0; tries < 5; tries++) {
    const { error: insErr } = await sb.from(TABLE).insert({ code: link.code, data: link });
    if (!insErr) return NextResponse.json({ link });
    if (!/duplicate key/i.test(insErr.message)) return NextResponse.json({ error: insErr.message }, { status: 500 });
    link.code = newPriceLinkCode();
  }
  return NextResponse.json({ error: "สร้างลิงก์ไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
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

  let body: Partial<PriceLink> & { days?: number; merge?: string[] };
  try {
    body = (await req.json()) as Partial<PriceLink> & { days?: number; merge?: string[] };
  } catch {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const mergeDays =
    Number.isFinite(Number(body.days)) && Number(body.days) > 0 ? Math.floor(Number(body.days)) : PRICE_LINK_DAYS;
  // 🧺 รวมใบที่มีอยู่แล้วเป็นใบเดียว (หน้า /admin/price-links) — ไม่ใช่การสร้างใบใหม่จากหน้าสินค้า
  if (Array.isArray(body.merge))
    return mergeLinks(sb, body.merge, gate.actor.name?.trim() || gate.actor.username, mergeDays, body.note);
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
        /**
         * ⚠️ ใบรวมห้ามถูกส่งกลับมาเป็น "ใบเดิม" ของสเปคเดี่ยว
         * ใบรวมเก็บรายการแรกไว้ที่ฟิลด์บน (productId/spec/qty) ให้ตัวอ่านเก่าอ่านออก —
         * ถ้าไม่กันตรงนี้ แอดมินกดคัดลอกลิงก์สินค้าตัวนั้นซ้ำ จะได้ลิงก์ใบรวมทั้งใบไปส่งลูกค้า
         * (ลูกค้ากดสั่งแล้วได้ของเกินมาทั้งชุด) — เจอตอนเทสต์จริง 8 ก.ย. 69
         */
        !l.items?.length &&
        !l.closed &&
        new Date(l.expiresAt).getTime() > Date.now() &&
        l.qty === Math.max(1, Number(body.qty) || 1) &&
        JSON.stringify(l.spec) === specKey
    );
  if (same) return NextResponse.json({ link: same, reused: true });

  const days = Number.isFinite(Number(body.days)) && Number(body.days) > 0 ? Math.floor(Number(body.days)) : PRICE_LINK_DAYS;
  const now = new Date();
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  // 📐 จำนวนชิ้นที่ได้ (งานแบ่งแผ่น/เซ็ต) — หน้าสินค้าคิดมาให้ รับเฉพาะที่เป็นตัวเลขจริง
  const rawPieces = body.pieces as { n?: unknown; word?: unknown; approx?: unknown; size?: unknown } | undefined;
  const pieces: PriceLinkPieces | undefined =
    rawPieces && num(rawPieces.n) > 0
      ? {
          n: Math.round(num(rawPieces.n)),
          word: String(rawPieces.word || "ชิ้น").slice(0, 20),
          ...(rawPieces.approx ? { approx: true } : {}),
          ...(typeof rawPieces.size === "string" && rawPieces.size.trim() ? { size: rawPieces.size.trim().slice(0, 80) } : {}),
        }
      : undefined;

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
    ...(pieces ? { pieces } : {}),
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
