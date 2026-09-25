import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { requirePerm } from "@/lib/server/require-perm";
import { DEFAULT_SPOTLIGHT, SPOTLIGHT_ROW_ID, spotlightOf, type Spotlight } from "@/lib/spotlight";

export const runtime = "nodejs";

/**
 * 🎯 ส่วนเชียร์ขายบนหน้าแรก — GET public แคช 1 นาที (แบบเดียวกับ /api/promo-banners)
 * ยังไม่เคยบันทึก = ชุดเริ่มต้น "เสื้อ" ใน lib/spotlight.ts
 */
const CACHE = { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" };

export async function GET() {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ spotlight: DEFAULT_SPOTLIGHT }, { headers: CACHE });

  const { data, error } = await sb.from("products").select("data").eq("id", SPOTLIGHT_ROW_ID).maybeSingle();
  if (error || !data) return NextResponse.json({ spotlight: DEFAULT_SPOTLIGHT }, { headers: CACHE });

  return NextResponse.json({ spotlight: spotlightOf((data.data as { spotlight?: Partial<Spotlight> })?.spotlight) }, { headers: CACHE });
}

/** แอดมินบันทึก (ต้องมีสิทธิ์ตั้งค่าระบบ) */
export async function POST(req: Request) {
  const gate = await requirePerm("settings.manage");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { spotlight?: Partial<Spotlight> };
  try {
    body = (await req.json()) as { spotlight?: Partial<Spotlight> };
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const spotlight = spotlightOf(body.spotlight);
  if (spotlight.on && !spotlight.title1 && !spotlight.title2) {
    return NextResponse.json({ error: "ยังไม่มีหัวข้อ — พิมพ์หัวข้ออย่างน้อย 1 บรรทัด หรือปิดสวิตช์แสดงผลแทน" }, { status: 400 });
  }

  const { error } = await sb
    .from("products")
    .upsert(
      { id: SPOTLIGHT_ROW_ID, name: "(ตั้งค่าร้าน — จุดเชียร์ขายหน้าแรก)", category: "__settings__", price: 0, data: { spotlight } },
      { onConflict: "id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, spotlight });
}
