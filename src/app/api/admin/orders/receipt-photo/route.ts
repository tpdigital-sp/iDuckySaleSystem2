import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { currentActor } from "@/lib/server/require-perm";
import { can, canPack, PACK_SCAN_HEADER } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { receiptPhotoPending, taxInvoiceCountLabel, taxInvoiceDocsOf, withLog, type Order, type ReceiptPhoto } from "@/lib/admin-data";
import { updateOrder } from "@/lib/server/order-write";
import { judgeReceiptRead, readReceiptDocNos } from "@/lib/server/receipt-ocr";

export const runtime = "nodejs";

const BUCKET = "order-proofs";
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** สิทธิ์เดียวกับภาพก่อนปิดกล่อง (pack-photo) — ฝ่ายแพ็ค / แอดมิน / สแกน QR ใบงาน */
async function packActor(req: Request) {
  const actor = await currentActor();
  if (!actor) return { res: NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 }) };
  const perms = await loadRolePerms();
  const scanned = req.headers.get(PACK_SCAN_HEADER) === "1";
  if (!canPack(actor, "pack.check", perms, scanned) && !can(actor, "orders.edit", perms))
    return { res: NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์งานแพ็ค" }, { status: 403 }) };
  return { actor };
}

/** ครบทุกเลขที่แล้ว → ตั้ง taxInvoicePacked ให้เอง (ด่านยิงเลขพัสดุเดิมอ่านฟิลด์นี้) · ขาดใบไหน → ถอดออก */
function withPackedFlag(o: Order, by: string, at: string): Order {
  const done = receiptPhotoPending(o).length === 0;
  if (done && !o.taxInvoicePacked) return { ...o, taxInvoicePacked: { by, at } };
  if (!done && o.taxInvoicePacked) return { ...o, taxInvoicePacked: undefined };
  return o;
}

/**
 * 📷🧾 ภาพใบเสร็จที่ใส่กล่อง "ทีละใบ ตามเลขที่" — เจ้าของร้านสั่ง 9 ต.ค. 69
 * multipart { orderId, docNo, file } · ถ่ายเลขเดิมซ้ำ = แทนภาพเก่า
 * AI อ่านเลขในภาพ: เป็นเลขของอีกใบ/เลขที่ถ่ายไปแล้ว → 409 (ปริ้นใบเดิมซ้ำ 2 ชุด = ต้นเรื่อง)
 */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const g = await packActor(req);
  if (g.res) return g.res;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น multipart)" }, { status: 400 });
  }
  const orderId = String(form.get("orderId") ?? "").trim();
  const docNo = String(form.get("docNo") ?? "").trim();
  const file = form.get("file");
  if (!orderId || !docNo) return NextResponse.json({ error: "ข้อมูลไม่ครบ (เลขออเดอร์/เลขที่ใบเสร็จ)" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "ไม่มีไฟล์รูป" }, { status: 400 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "รองรับเฉพาะ PNG / JPG / WEBP" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 10MB" }, { status: 400 });

  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบเลขออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;

  const docs = taxInvoiceDocsOf(order).filter((d) => d.docNo);
  const target = docs.find((d) => d.docNo === docNo);
  if (!target) return NextResponse.json({ error: `ใบนี้ไม่มีเอกสารเลขที่ ${docNo} — รีเฟรชหน้าแล้วลองใหม่` }, { status: 409 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const read = await readReceiptDocNos(bytes, file.type);
  const others = docs.filter((d) => d !== target).flatMap((d) => [d.docNo!, ...(d.fromDoc ? [d.fromDoc] : [])]);
  const shot = (order.receiptPhotos ?? []).filter((p) => p.docNo !== docNo).flatMap((p) => [p.docNo, ...(p.read ? [p.read] : [])]);
  const verdict = judgeReceiptRead(read, docNo, target.fromDoc ? [target.fromDoc] : [], others, shot);
  if (!verdict.ok) return NextResponse.json({ error: verdict.error, read }, { status: 409 });

  const safeId = orderId.replace(/[^a-z0-9_-]/gi, "") || "misc";
  const path = `receipt/${safeId}/${randomUUID()}.${ext}`;
  const upload = () => sb.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
  let { error: upErr } = await upload();
  if (upErr && /bucket not found/i.test(upErr.message)) {
    await sb.storage.createBucket(BUCKET, { public: true, fileSizeLimit: "10MB" });
    ({ error: upErr } = await upload());
  }
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const by = g.actor!.name?.trim() || g.actor!.username;
  const at = new Date().toISOString();
  const old = (order.receiptPhotos ?? []).find((p) => p.docNo === docNo);
  if (old?.path) await sb.storage.from(BUCKET).remove([old.path]); // best-effort
  const photo: ReceiptPhoto = { docNo, url: pub.publicUrl, path, by, at, ...(verdict.read ? { read: verdict.read } : {}) };
  const photos = [...(order.receiptPhotos ?? []).filter((p) => p.docNo !== docNo), photo];
  const base = withPackedFlag({ ...order, receiptPhotos: photos }, by, at);
  const left = receiptPhotoPending(base);
  const updated = withLog(
    base,
    by,
    `📷🧾 ถ่ายภาพใบเสร็จ ${docNo} ใส่กล่อง${old ? " (ถ่ายใหม่แทนภาพเดิม)" : ""}`,
    [
      verdict.read ? (verdict.read === docNo || verdict.read === target.fromDoc ? `AI อ่านเลขตรง ${verdict.read}` : `⚠️ AI อ่านได้ ${verdict.read}`) : "AI อ่านเลขไม่ออก",
      left.length ? `ยังขาด ${left.join(", ")}` : `ครบ${taxInvoiceCountLabel(order)}แล้ว`,
    ].join(" · ")
  );

  const { error } = await updateOrder(sb, updated);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, order: updated, read });
}

/** ลบภาพใบเสร็จ (ถ่ายผิด) — { orderId, docNo } · ถ้าเคยครบแล้ว ธงใส่กล่องถูกถอดออกด้วย */
export async function DELETE(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const g = await packActor(req);
  if (g.res) return g.res;

  let body: { orderId?: string; docNo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const orderId = (body.orderId ?? "").trim();
  const docNo = (body.docNo ?? "").trim();
  if (!orderId || !docNo) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบเลขออเดอร์นี้" }, { status: 404 });
  const order = row.data as Order;
  const target = (order.receiptPhotos ?? []).find((p) => p.docNo === docNo);
  if (!target) return NextResponse.json({ error: "ไม่พบภาพใบนี้" }, { status: 404 });
  if (order.tracking?.trim()) return NextResponse.json({ error: "ยิงเลขพัสดุไปแล้ว — ภาพนี้เป็นหลักฐาน ลบไม่ได้" }, { status: 409 });

  if (target.path) await sb.storage.from(BUCKET).remove([target.path]); // best-effort
  const photos = (order.receiptPhotos ?? []).filter((p) => p.docNo !== docNo);
  const by = g.actor!.name?.trim() || g.actor!.username;
  const updated = withLog(
    withPackedFlag({ ...order, receiptPhotos: photos.length ? photos : undefined }, by, new Date().toISOString()),
    by,
    `ลบภาพใบเสร็จ ${docNo}`
  );
  const { error } = await updateOrder(sb, updated);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, order: updated });
}
