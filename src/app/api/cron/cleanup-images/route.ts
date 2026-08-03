import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { imageCleanupOf, type ImageCleanupConfig } from "@/lib/image-cleanup";
import { proofsOf, withLog, type Order } from "@/lib/admin-data";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 🧹 ล้างรูปของออเดอร์เก่าอัตโนมัติ (รันวันละครั้งจาก netlify/functions/cleanup-images.mjs)
 *
 * ทำไมต้องล้าง: ไฟล์แบบงาน/ลายลูกค้าเป็นก้อนใหญ่ที่สุดของระบบ (หลาย MB ต่อรูป)
 * เก็บไว้ทุกออเดอร์ตลอดไป = ค่าที่เก็บโตเรื่อย ๆ และหน้าที่โหลดรูปเยอะจะอืด
 * ออเดอร์ที่ปิดงานไปนานแล้วแทบไม่มีใครเปิดดูรูปอีก จึงล้างทิ้งได้
 *
 * ล้างแล้วไม่ลบออเดอร์ — เก็บชื่อ/ราคา/ประวัติไว้ครบ แค่เอา URL รูปออก
 * และปั๊ม imagesPurgedAt ไว้ให้หน้าเว็บขึ้นข้อความแทนรูปแตก
 *
 * ?dry=1 → ดูว่าจะลบอะไรบ้าง โดยยังไม่ลบจริง (ปุ่ม "ลองดูก่อน" ในหน้าตั้งค่า)
 */
const BUCKET_OF: Record<string, string> = {
  "order-proofs": "order-proofs",
  proofs: "proofs",
  "customer-artwork": "customer-artwork",
  "pack-photos": "pack-photos",
  slips: "slips",
};

/** ดึง {bucket, path} จาก public URL ของ Supabase Storage */
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  const m = url.match(/\/storage\/v1\/object\/(?:public\/)?([^/]+)\/(.+)$/);
  if (!m) return null;
  const bucket = m[1];
  if (!BUCKET_OF[bucket]) return null;
  return { bucket, path: decodeURIComponent(m[2].split("?")[0]) };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret)
    return NextResponse.json({ error: "ไม่มีสิทธิ์เรียก" }, { status: 401 });

  const dry = url.searchParams.get("dry") === "1";
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  // ── นโยบายจากหน้าตั้งค่าร้าน ──
  const { data: setRow } = await sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle();
  const cfg = imageCleanupOf((setRow?.data ?? null) as { imageCleanup?: ImageCleanupConfig } | null);
  const forceDays = Number(url.searchParams.get("days"));
  const days = Number.isFinite(forceDays) && forceDays > 0 ? Math.floor(forceDays) : cfg.days;
  if (!cfg.enabled && !dry)
    return NextResponse.json({ ok: true, skipped: "ปิดการล้างรูปอัตโนมัติอยู่", cfg });

  const cutoff = Date.now() - days * 86400_000;
  const { data: rows, error } = await sb.from("orders").select("id,data,created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const CLOSED = new Set(["เสร็จสิ้น", "ยกเลิก"]);
  const plan: { id: string; status: string; files: number; buckets: Record<string, string[]> }[] = [];

  for (const row of rows ?? []) {
    const order = row.data as Order;
    if (!order?.id) continue;
    if ((order as Order & { imagesPurgedAt?: string }).imagesPurgedAt) continue; // ล้างไปแล้ว
    const created = new Date(row.created_at ?? order.date ?? 0).getTime();
    if (!created || created > cutoff) continue; // ยังไม่ครบอายุ
    if (cfg.onlyClosed && !CLOSED.has(order.status)) continue;

    const urls: string[] = [];
    if (cfg.targets.proofs) for (const it of order.items ?? []) urls.push(...proofsOf(it).map((p) => p.url));
    if (cfg.targets.artwork) for (const it of order.items ?? []) urls.push(...(it.artworkUrls ?? []));
    if (cfg.targets.packPhotos) urls.push(...(order.packPhotos ?? []).map((p) => p.url));
    if (cfg.targets.slips && order.slipPath) urls.push(`/storage/v1/object/slips/${order.slipPath}`);

    const buckets: Record<string, string[]> = {};
    for (const u of urls) {
      const hit = parseStorageUrl(u);
      if (!hit) continue;
      (buckets[hit.bucket] ||= []).push(hit.path);
    }
    const files = Object.values(buckets).reduce((n, a) => n + a.length, 0);
    if (!files) continue;
    plan.push({ id: order.id, status: order.status, files, buckets });
  }

  if (dry)
    return NextResponse.json({
      ok: true,
      dry: true,
      days,
      onlyClosed: cfg.onlyClosed,
      orders: plan.length,
      files: plan.reduce((n, p) => n + p.files, 0),
      list: plan.slice(0, 50).map((p) => ({ id: p.id, status: p.status, files: p.files })),
    });

  // ── ลบจริง ──
  let deleted = 0;
  const failed: string[] = [];
  for (const p of plan) {
    for (const [bucket, paths] of Object.entries(p.buckets)) {
      const { error: rmErr } = await sb.storage.from(bucket).remove(paths);
      if (rmErr) failed.push(`${p.id}/${bucket}: ${rmErr.message}`);
      else deleted += paths.length;
    }
    // เอา URL ออกจากออเดอร์ + ปั๊มว่าล้างแล้ว (ข้อมูลออเดอร์อื่นคงเดิมทั้งหมด)
    const { data: fresh } = await sb.from("orders").select("data").eq("id", p.id).maybeSingle();
    const order = (fresh?.data ?? null) as Order | null;
    if (!order) continue;
    const items = (order.items ?? []).map((it) => ({
      ...it,
      ...(cfg.targets.proofs ? { proofs: [], proofUrl: undefined } : {}),
      ...(cfg.targets.artwork ? { artworkUrls: undefined } : {}),
    }));
    let next: Order & { imagesPurgedAt?: string } = {
      ...order,
      items,
      ...(cfg.targets.packPhotos ? { packPhotos: [] } : {}),
      ...(cfg.targets.slips ? { slipUrl: undefined, slipPath: undefined } : {}),
      imagesPurgedAt: new Date().toISOString(),
    };
    next = withLog(next, "ระบบ", "ล้างรูปตามนโยบาย", `อายุเกิน ${days} วัน · ลบ ${p.files} ไฟล์`) as typeof next;
    await sb.from("orders").update({ data: next }).eq("id", p.id);
  }

  // จดผลการรันล่าสุดไว้ให้หน้าตั้งค่าแสดง
  const current = (setRow?.data ?? {}) as { imageCleanup?: ImageCleanupConfig };
  await sb
    .from("products")
    .update({
      data: {
        ...current,
        imageCleanup: { ...imageCleanupOf(current), lastRunAt: new Date().toISOString(), lastDeleted: deleted },
      },
    })
    .eq("id", "__shop_payment__");

  return NextResponse.json({ ok: true, days, orders: plan.length, deleted, failed: failed.slice(0, 10) });
}
