import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { randomCode, type Coupon } from "@/lib/coupons";

export const runtime = "nodejs";

const tableMissing = (msg: string, code?: string) =>
  code === "42P01" || code === "PGRST205" || /schema cache|find the table|relation .*does not exist/i.test(msg);

/** แอดมินดูคูปองทั้งหมด (ใหม่→เก่า) */
export async function GET() {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ coupons: [] });
  const gate = await requirePerm("coupons.manage");
  if (gate.res) return gate.res;

  const { data, error } = await sb.from("coupons").select("data").order("created_at", { ascending: false });
  if (error) {
    if (tableMissing(error.message, error.code)) return NextResponse.json({ coupons: [], needsSetup: true });
    return NextResponse.json({ error: error.message, coupons: [] }, { status: 500 });
  }
  return NextResponse.json({ coupons: (data ?? []).map((r) => r.data as Coupon) });
}

/** สร้างคูปอง (สร้างได้ทีละหลายใบ) */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("coupons.manage");
  if (gate.res) return gate.res;

  let body: {
    type?: "percent" | "fixed";
    value?: number;
    minSpend?: number;
    maxDiscount?: number;
    expiresAt?: string;
    assignedTo?: string;
    excludeProducts?: string[];
    note?: string;
    count?: number;
    codePrefix?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const type = body.type === "fixed" ? "fixed" : "percent";
  const value = Math.max(0, Number(body.value) || 0);
  if (value <= 0) return NextResponse.json({ error: "ใส่มูลค่าส่วนลดให้มากกว่า 0" }, { status: 400 });
  if (type === "percent" && value > 100) return NextResponse.json({ error: "ส่วนลด % ต้องไม่เกิน 100" }, { status: 400 });
  const count = Math.min(500, Math.max(1, Math.floor(Number(body.count) || 1)));
  const prefix = (body.codePrefix ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  // สินค้าไม่ร่วมรายการ (product id) — จำกัดจำนวนกัน payload บวม
  const excludeProducts = (Array.isArray(body.excludeProducts) ? body.excludeProducts : [])
    .map((p) => String(p).trim())
    .filter(Boolean)
    .slice(0, 300);
  const now = new Date().toISOString();

  const rows = Array.from({ length: count }, () => {
    const code = (prefix ? prefix + "-" : "") + randomCode(8);
    const coupon: Coupon = {
      code,
      type,
      value,
      ...(body.minSpend ? { minSpend: Math.max(0, Number(body.minSpend) || 0) } : {}),
      ...(type === "percent" && body.maxDiscount ? { maxDiscount: Math.max(0, Number(body.maxDiscount) || 0) } : {}),
      ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
      ...(body.assignedTo?.trim() ? { assignedTo: body.assignedTo.trim() } : {}),
      ...(excludeProducts.length ? { excludeProducts } : {}),
      ...(body.note?.trim() ? { note: body.note.trim() } : {}),
      status: "active",
      createdAt: now,
    };
    return { code, data: coupon };
  });

  const { error } = await sb.from("coupons").insert(rows);
  if (error) {
    if (tableMissing(error.message, error.code))
      return NextResponse.json({ error: "ยังไม่มีตาราง coupons — รัน supabase/coupons.sql ก่อน" }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, codes: rows.map((r) => r.code) });
}

/** ยกเลิกคูปอง (void) — ยังไม่ถูกใช้เท่านั้น */
export async function DELETE(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("coupons.manage");
  if (gate.res) return gate.res;

  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.json({ error: "ไม่มีโค้ด" }, { status: 400 });

  const { data: row } = await sb.from("coupons").select("data").eq("code", code).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบคูปอง" }, { status: 404 });
  const c = row.data as Coupon;
  if (c.status === "redeemed") return NextResponse.json({ error: "คูปองถูกใช้ไปแล้ว ยกเลิกไม่ได้" }, { status: 409 });

  const { error } = await sb.from("coupons").update({ data: { ...c, status: "void" } }).eq("code", code);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
