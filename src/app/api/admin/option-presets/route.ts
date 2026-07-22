import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/server/admin-session";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { OptionPreset } from "@/lib/option-presets";

export const runtime = "nodejs";

async function requireAdmin() {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/** บันทึก/อัปเดตคลังตัวเลือก (เฉพาะแอดมินที่ล็อกอิน) */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  if (!(await requireAdmin())) return NextResponse.json({ error: "ต้องล็อกอินแอดมิน" }, { status: 401 });

  let preset: OptionPreset;
  try {
    preset = (await req.json()) as OptionPreset;
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!preset?.id || !preset?.label) {
    return NextResponse.json({ error: "ข้อมูลคลังไม่ครบ" }, { status: 400 });
  }

  const { error } = await sb.from("option_presets").upsert(
    { id: preset.id, label: preset.label, data: preset },
    { onConflict: "id" }
  );
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true });
}

/** ลบคลังตัวเลือก (เฉพาะแอดมิน) — /api/admin/option-presets?id=xxx */
export async function DELETE(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  if (!(await requireAdmin())) return NextResponse.json({ error: "ต้องล็อกอินแอดมิน" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ไม่มี id" }, { status: 400 });
  const { error } = await sb.from("option_presets").delete().eq("id", id);
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true });
}
