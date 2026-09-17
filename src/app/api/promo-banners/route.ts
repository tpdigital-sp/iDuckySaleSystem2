import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { requirePerm } from "@/lib/server/require-perm";
import { BANNERS_ROW_ID, DEFAULT_BANNER_SET, bannerSetOf, type PromoBannerSet } from "@/lib/promo-banners";

export const runtime = "nodejs";

/**
 * หน้าแรกอ่านป้ายประชาสัมพันธ์ (public) — ให้เบราว์เซอร์/CDN แคช 1 นาทีแบบเดียวกับ /api/nav
 * (แก้ป้ายแล้วลูกค้าเห็นผลใน ~1 นาที)
 */
const CACHE = { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" };

export async function GET() {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ banners: DEFAULT_BANNER_SET }, { headers: CACHE });

  const { data, error } = await sb.from("products").select("data").eq("id", BANNERS_ROW_ID).maybeSingle();
  if (error || !data) return NextResponse.json({ banners: DEFAULT_BANNER_SET }, { headers: CACHE });

  return NextResponse.json(
    { banners: bannerSetOf((data.data as { banners?: Partial<PromoBannerSet> })?.banners) },
    { headers: CACHE }
  );
}

/** แอดมินบันทึกป้าย (ต้องมีสิทธิ์ตั้งค่าระบบ) */
export async function POST(req: Request) {
  const gate = await requirePerm("settings.manage");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { banners?: Partial<PromoBannerSet> };
  try {
    body = (await req.json()) as { banners?: Partial<PromoBannerSet> };
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const banners = bannerSetOf(body.banners);
  for (const b of banners.items) {
    if (b.startAt && b.endAt && b.startAt > b.endAt) {
      return NextResponse.json({ error: `ป้าย "${b.title || "ไม่มีชื่อ"}": วันเริ่มอยู่หลังวันสิ้นสุด` }, { status: 400 });
    }
  }

  const { error } = await sb
    .from("products")
    .upsert(
      { id: BANNERS_ROW_ID, name: "(ตั้งค่าร้าน — ป้ายประชาสัมพันธ์)", category: "__settings__", price: 0, data: { banners } },
      { onConflict: "id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, banners });
}
