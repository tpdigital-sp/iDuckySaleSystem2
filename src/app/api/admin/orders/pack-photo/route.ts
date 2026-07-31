import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { currentActor } from "@/lib/server/require-perm";
import { can } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type Order, type PackPhoto } from "@/lib/admin-data";

export const runtime = "nodejs";

// เก็บรวมกับ bucket รูปแบบงาน (public) — ภาพกล่องไม่ใช่ข้อมูลอ่อนไหว
const BUCKET = "order-proofs";
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** ฝ่ายแพ็ค (pack.check) หรือแอดมิน (orders.edit) เท่านั้น */
async function packActor() {
  const actor = await currentActor();
  if (!actor) return { res: NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 }) };
  const perms = await loadRolePerms();
  if (!can(actor, "pack.check", perms) && !can(actor, "orders.edit", perms))
    return { res: NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์งานแพ็ค" }, { status: 403 }) };
  return { actor };
}

/** อัปโหลด "ภาพของในกล่องก่อนปิด" — packGate บังคับอย่างน้อย 1 รูปก่อนยิงเลขพัสดุ */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const g = await packActor();
  if (g.res) return g.res;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น multipart)" }, { status: 400 });
  }
  const orderId = String(form.get("orderId") ?? "").trim();
  const file = form.get("file");
  if (!orderId) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "ไม่มีไฟล์รูป" }, { status: 400 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "รองรับเฉพาะ PNG / JPG / WEBP" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 10MB" }, { status: 400 });

  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบเลขออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;

  const safeId = orderId.replace(/[^a-z0-9_-]/gi, "") || "misc";
  const path = `pack/${safeId}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const upload = () => sb.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
  let { error: upErr } = await upload();
  if (upErr && /bucket not found/i.test(upErr.message)) {
    await sb.storage.createBucket(BUCKET, { public: true, fileSizeLimit: "10MB" });
    ({ error: upErr } = await upload());
  }
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const by = g.actor!.name?.trim() || g.actor!.username;
  const photo: PackPhoto = { url: pub.publicUrl, path, by, at: new Date().toISOString() };
  const photos = [...(order.packPhotos ?? []), photo];
  const updated = withLog({ ...order, packPhotos: photos }, by, "📸 แนบภาพก่อนปิดกล่อง", `รูปที่ ${photos.length}`);

  const { error } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, order: updated });
}

/** ลบภาพก่อนปิดกล่อง (ถ่ายผิด/ซ้ำ) — สิทธิ์เดียวกับตอนอัป · ลบไฟล์จริงใน storage ด้วย */
export async function DELETE(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const g = await packActor();
  if (g.res) return g.res;

  let body: { orderId?: string; index?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const orderId = (body.orderId ?? "").trim();
  const index = Number(body.index);
  if (!orderId || !Number.isInteger(index) || index < 0)
    return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบเลขออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  const target = order.packPhotos?.[index];
  if (!target) return NextResponse.json({ error: "ไม่พบภาพรูปนี้" }, { status: 404 });

  if (target.path) await sb.storage.from(BUCKET).remove([target.path]); // best-effort
  const photos = (order.packPhotos ?? []).filter((_, i) => i !== index);
  const by = g.actor!.name?.trim() || g.actor!.username;
  const updated = withLog(
    { ...order, packPhotos: photos.length ? photos : undefined },
    by,
    "ลบภาพก่อนปิดกล่อง",
    `เหลือ ${photos.length} รูป`
  );
  const { error } = await sb.from("orders").update({ data: updated }).eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, order: updated });
}
