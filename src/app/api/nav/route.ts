import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { requirePerm } from "@/lib/server/require-perm";
import { DEFAULT_SITE_NAV, NAV_ROW_ID, siteNavOf, type SiteNav } from "@/lib/home-nav";

export const runtime = "nodejs";

/** หน้าร้านอ่านเมนู (public — Navbar กับหน้าแรกต้องใช้) */
export async function GET() {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ nav: DEFAULT_SITE_NAV });

  const { data, error } = await sb.from("products").select("data").eq("id", NAV_ROW_ID).maybeSingle();
  if (error || !data) return NextResponse.json({ nav: DEFAULT_SITE_NAV });

  return NextResponse.json({ nav: siteNavOf((data.data as { nav?: Partial<SiteNav> })?.nav) });
}

/** แอดมินบันทึกเมนู (ต้องมีสิทธิ์ตั้งค่าระบบ) */
export async function POST(req: Request) {
  const gate = await requirePerm("settings.manage");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { nav?: Partial<SiteNav> };
  try {
    body = (await req.json()) as { nav?: Partial<SiteNav> };
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const nav = siteNavOf(body.nav);

  // id ห้ามซ้ำ — ใช้เป็น key ตอนวาดรายการ ถ้าซ้ำแล้วลบ/เลื่อนจะสลับผิดตัว
  for (const [what, list] of [
    ["เมนูด้านบน", nav.menu],
    ["การ์ดนำทาง", nav.tiles],
  ] as const) {
    const seen = new Set<string>();
    for (const it of list) {
      if (seen.has(it.id)) return NextResponse.json({ error: `รหัสซ้ำใน${what}: ${it.id}` }, { status: 400 });
      seen.add(it.id);
    }
  }

  const { error } = await sb
    .from("products")
    .upsert(
      { id: NAV_ROW_ID, name: "(ตั้งค่าร้าน — เมนูนำทาง)", category: "__settings__", price: 0, data: { nav } },
      { onConflict: "id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, nav });
}
