import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { CLAIM_TABLE, isMissingTable, loadClaim, saveClaim, withSignedPhotos } from "@/lib/server/claims-db";
import { notifyCustomer } from "@/lib/server/notify";
import { CLAIM_STATUSES, type Claim, type ClaimResolution, type ClaimStatus } from "@/lib/claims";
import type { Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/** เคลมทั้งหมด (หลังบ้าน) — ใหม่สุดก่อน */
export async function GET() {
  const gate = await requirePerm("orders.view");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ claims: [] });

  const { data, error } = await sb.from(CLAIM_TABLE).select("data").order("created_at", { ascending: false }).limit(300);
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ claims: [], needsSetup: true });
    return NextResponse.json({ error: error.message, claims: [] }, { status: 500 });
  }
  const claims = await Promise.all((data ?? []).map((r) => withSignedPhotos(sb, r.data as Claim)));
  return NextResponse.json({ claims });
}

/**
 * อัปเดตเคลม — เปลี่ยนสถานะ / บันทึกแนวทางชดเชย / ตอบข้อความลูกค้า
 * เปลี่ยนสถานะแล้วแจ้งลูกค้าทาง LINE ผ่านช่องทางของออเดอร์นั้น (ใช้ notify เดิม)
 */
export async function PATCH(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    status?: ClaimStatus;
    resolution?: ClaimResolution;
    message?: string;
  } | null;
  if (!body?.id) return NextResponse.json({ error: "ไม่รู้ว่าเคลมไหน" }, { status: 400 });

  const claim = await loadClaim(sb, body.id);
  if (!claim) return NextResponse.json({ error: "ไม่พบเคลมนี้" }, { status: 404 });

  const now = new Date().toISOString();
  const by = gate.actor.name || gate.actor.username;
  const statusChanged = !!body.status && CLAIM_STATUSES.includes(body.status) && body.status !== claim.status;

  if (statusChanged) {
    claim.log = [...(claim.log ?? []), { at: now, by, action: `สถานะ ${claim.status} → ${body.status}` }];
    claim.status = body.status!;
  }
  if (body.resolution) {
    claim.resolution = { ...claim.resolution, ...body.resolution };
    claim.log = [...(claim.log ?? []), { at: now, by, action: "บันทึกแนวทางชดเชย" }];
  }
  const message = (body.message ?? "").trim().slice(0, 2000);
  if (message) claim.messages = [...(claim.messages ?? []), { by: "admin", name: by, text: message, at: now }];

  const { error } = await saveClaim(sb, claim);
  if (error) return NextResponse.json({ error }, { status: 500 });

  // 🔔 แจ้งลูกค้า — เฉพาะตอนสถานะเปลี่ยนหรือมีข้อความใหม่จากร้าน
  if (statusChanged || message) {
    const { data: row } = await sb.from("orders").select("data").eq("id", claim.orderId).maybeSingle();
    const order = row?.data as Order | undefined;
    if (order) {
      const lines = [
        `🧰 อัปเดตเคลม ${claim.id} (ออเดอร์ ${claim.orderId})`,
        statusChanged ? `สถานะ: ${claim.status}` : null,
        claim.status === "อนุมัติเคลม" && claim.resolution?.action ? `แนวทาง: ${claim.resolution.action}` : null,
        message ? `ข้อความจากร้าน: ${message}` : null,
        `ดูรายละเอียดที่หน้า บัญชีของฉัน › แจ้งปัญหา/เคลมสินค้า`,
      ].filter(Boolean);
      void notifyCustomer(sb, order, lines.join("\n"));
    }
  }

  return NextResponse.json({ ok: true, claim: await withSignedPhotos(sb, claim) });
}
