import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { loadCert, saveCert, uploadWhtFile, withFileUrls } from "@/lib/server/wht-db";

export const runtime = "nodejs";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/**
 * 📎 แนบไฟล์ — kind=cert ใบหัก ณ ที่จ่าย (แนบแล้ว = ได้รับใบหักแล้วให้เอง) · kind=slip สลิปโอนคืน (แนบแล้ว = โอนคืนแล้ว)
 * รูปย่อฝั่งเบราว์เซอร์ก่อนส่ง (Netlify รับ body ~4.5MB)
 */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.money");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const id = String(form?.get("id") ?? "");
  const kind = form?.get("kind") === "slip" ? "slip" : "cert";
  if (!(file instanceof File)) return NextResponse.json({ error: "ไม่มีไฟล์" }, { status: 400 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "รองรับเฉพาะรูป JPG/PNG/WEBP หรือ PDF" }, { status: 400 });
  if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 4MB" }, { status: 400 });
  const cur = await loadCert(sb, id);
  if (!cur) return NextResponse.json({ error: `ไม่พบใบ ${id}` }, { status: 404 });
  if (kind === "slip" && !cur.retro) return NextResponse.json({ error: "ตั้งหักย้อนหลังก่อนแนบสลิปโอนคืน" }, { status: 400 });

  const up = await uploadWhtFile(sb, cur.id, new Uint8Array(await file.arrayBuffer()), file.type, ext);
  if ("error" in up) return NextResponse.json({ error: up.error }, { status: 500 });

  const by = gate.actor.name || gate.actor.username;
  const now = new Date().toISOString();
  const c = { ...cur };
  if (kind === "cert") {
    c.certFiles = [...(c.certFiles ?? []), up.path];
    // หักตอนจ่าย = ได้รับใบหักแล้ว · หักย้อนหลัง = แนบใบหักประกอบการโอนคืน (สถานะดูที่ retro)
    if (!c.retro) {
      c.received ??= { at: now, by };
      if (!c.mode) Object.assign(c, { mode: "wht", modeBy: by });
    }
  } else {
    c.refundSlips = [...(c.refundSlips ?? []), up.path];
    c.retro = { ...c.retro!, refundedAt: c.retro!.refundedAt ?? now, refundedBy: c.retro!.refundedBy ?? by };
  }
  const err = await saveCert(sb, c);
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  const [view] = await withFileUrls(sb, [c]);
  return NextResponse.json({ cert: view });
}
