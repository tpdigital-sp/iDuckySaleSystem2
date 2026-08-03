import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { requirePerm } from "@/lib/server/require-perm";
import { categoriesOf, DEFAULT_CATEGORIES, type ShopCategory } from "@/lib/categories";

export const runtime = "nodejs";

const ROW_ID = "__categories__";

/** ลูกค้า/หลังบ้านอ่านหมวดหมู่ (public — หน้าร้านต้องใช้) */
export async function GET() {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ list: DEFAULT_CATEGORIES });

  const { data, error } = await sb.from("products").select("data").eq("id", ROW_ID).maybeSingle();
  if (error || !data) return NextResponse.json({ list: DEFAULT_CATEGORIES });

  const list = (data.data as { categories?: ShopCategory[] })?.categories;
  return NextResponse.json({ list: categoriesOf(list) });
}

/** แอดมินบันทึกหมวดหมู่ (ต้องมีสิทธิ์ตั้งค่าระบบ) */
export async function POST(req: Request) {
  const gate = await requirePerm("settings.manage");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { list?: ShopCategory[] };
  try {
    body = (await req.json()) as { list?: ShopCategory[] };
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const list = categoriesOf(body.list);
  if (!list.length) return NextResponse.json({ error: "ต้องมีอย่างน้อย 1 หมวด" }, { status: 400 });

  // id ห้ามซ้ำ (ใช้ผูกกับสินค้า)
  const seen = new Set<string>();
  for (const c of list) {
    if (seen.has(c.id)) return NextResponse.json({ error: `รหัสหมวดซ้ำ: ${c.id}` }, { status: 400 });
    seen.add(c.id);
  }

  const { error } = await sb
    .from("products")
    .upsert(
      { id: ROW_ID, name: "(ตั้งค่าร้าน — หมวดหมู่สินค้า)", category: "__settings__", price: 0, data: { categories: list } },
      { onConflict: "id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, list });
}
