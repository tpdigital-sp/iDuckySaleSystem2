import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import {
  CLAIM_PHOTO_PATH_RE,
  CLAIM_TABLE,
  claimsOfOrder,
  findOpenClaimByOrder,
  insertClaim,
  isMissingTable,
  loadClaim,
  newClaimId,
  notifyClaimOpened,
  saveClaim,
  withSignedPhotos,
} from "@/lib/server/claims-db";
import { noticeFlex, notifyCustomer } from "@/lib/server/notify";
import { SITE_URL } from "@/lib/shop-info";
import {
  CLAIM_FAULTS,
  CLAIM_STATUSES,
  CLAIM_TYPES,
  type Claim,
  type ClaimFault,
  type ClaimResolution,
  type ClaimStatus,
} from "@/lib/claims";
import type { Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * เคลมทั้งหมด (หลังบ้าน) — ใหม่สุดก่อน
 * ?orderId=OD-… → เฉพาะเคสที่เกี่ยวกับออเดอร์นั้น (ทั้งที่เคลมออเดอร์นี้ และที่ออเดอร์นี้เป็นงานผลิตใหม่ของเคส) ไม่เซ็นรูป — ไว้ขึ้นป้ายในหน้าออเดอร์
 */
export async function GET(req: Request) {
  const gate = await requirePerm("orders.view");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ claims: [] });

  const orderId = new URL(req.url).searchParams.get("orderId")?.trim();
  if (orderId) return NextResponse.json({ claims: await claimsOfOrder(sb, orderId) });

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
    fault?: ClaimFault;
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
  if (body.fault && CLAIM_FAULTS.includes(body.fault) && body.fault !== claim.fault) {
    claim.log = [...(claim.log ?? []), { at: now, by, action: `ความผิดอยู่ที่: ${claim.fault ?? "ยังไม่ระบุ"} → ${body.fault}` }];
    claim.fault = body.fault;
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
      void notifyCustomer(
        sb,
        order,
        noticeFlex({
          tone: "claimUpdate",
          head: "อัปเดตเรื่องเคลม",
          headline: statusChanged ? `สถานะล่าสุด: ${claim.status}` : "มีข้อความใหม่จากทางร้านค่ะ",
          id: claim.id,
          rows: [
            { label: "ออเดอร์", value: claim.orderId, bold: true },
            ...(statusChanged ? [{ label: "สถานะ", value: claim.status, bold: true }] : []),
            ...(claim.status === "อนุมัติเคลม" && claim.resolution?.action ? [{ label: "แนวทาง", value: claim.resolution.action }] : []),
          ],
          ...(message ? { note: `ข้อความจากร้าน: ${message}` } : {}),
          button: { label: "ดูเรื่องที่แจ้งไว้", uri: `${SITE_URL}/account/claims` },
          alt: lines.join("\n"),
        })
      );
    }
  }

  return NextResponse.json({ ok: true, claim: await withSignedPhotos(sb, claim) });
}

/**
 * ➕ ทีมงานบันทึกเคลมเอง (ลูกค้าแจ้งทาง LINE/โทร/หน้าร้าน — ออเดอร์ส่วนใหญ่สั่งโดยไม่ล็อกอิน ลูกค้ายื่นเองจากหน้าบัญชีไม่ได้)
 * ไม่บังคับกรอบ 7 วัน / สถานะจัดส่งแล้ว / บัญชีลูกค้า — แต่ออเดอร์เดียวมีเคสเปิดได้ทีละใบ (ตอบ 409 พร้อมเลขเคสเดิม)
 * notify (ค่าเริ่มต้น true) → แจ้งลูกค้าทาง LINE ว่ารับเรื่องแล้ว ผลลง log ของเคส
 */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as {
    orderId?: string;
    items?: { index: number; qty?: number }[];
    type?: string;
    fault?: ClaimFault;
    channel?: string;
    detail?: string;
    photoPaths?: string[];
    notify?: boolean;
  } | null;

  const orderId = (body?.orderId ?? "").trim();
  const type = (body?.type ?? "").trim();
  const detail = (body?.detail ?? "").trim();
  if (!orderId || !type || !detail) return NextResponse.json({ error: "กรอกข้อมูลไม่ครบ (ออเดอร์ / ประเภทปัญหา / รายละเอียด)" }, { status: 400 });
  if (!(CLAIM_TYPES as readonly string[]).includes(type)) return NextResponse.json({ error: "ประเภทปัญหาไม่ถูกต้อง" }, { status: 400 });
  const fault = body?.fault && CLAIM_FAULTS.includes(body.fault) ? body.fault : undefined;
  const channel = String(body?.channel ?? "").trim().slice(0, 40) || undefined;
  const photoPaths = (body?.photoPaths ?? []).filter((p) => CLAIM_PHOTO_PATH_RE.test(p)).slice(0, 10);

  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  const order = row?.data as Order | undefined;
  if (!order) return NextResponse.json({ error: `ไม่พบออเดอร์ ${orderId}` }, { status: 404 });

  const { claim: existing, error: listErr } = await findOpenClaimByOrder(sb, orderId);
  if (listErr) {
    if (isMissingTable(listErr)) return NextResponse.json({ error: "ยังไม่มีตาราง claims — รัน supabase/claims.sql ก่อน" }, { status: 503 });
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }
  if (existing)
    return NextResponse.json({ error: `ออเดอร์นี้มีเคส ${existing.id} ที่ยังเดินเรื่องอยู่ — ตามต่อในเคสเดิม`, existingId: existing.id }, { status: 409 });

  // รายการที่เคลม — index ต้องมีจริงในออเดอร์ · ไม่ส่ง = ทั้งออเดอร์
  const items = (Array.isArray(body?.items) ? body!.items! : [])
    .map((p) => {
      const it = order.items[Number(p.index)];
      if (!it) return null;
      const qty = Math.max(1, Math.min(Math.floor(Number(p.qty) || it.qty), it.qty));
      return { index: Number(p.index), name: it.name, qty };
    })
    .filter((x): x is { index: number; name: string; qty: number } => !!x);

  const by = gate.actor.name || gate.actor.username;
  const at = new Date().toISOString();
  const claim: Claim = {
    id: newClaimId(),
    orderId,
    ...(order.customerId ? { customerId: order.customerId } : {}),
    source: "admin",
    createdBy: by,
    ...(channel ? { channel } : {}),
    ...(fault ? { fault } : {}),
    customer: order.customer,
    phone: order.phone,
    ...(items.length ? { items, itemNames: items.map((i) => i.name) } : {}),
    type,
    detail: detail.slice(0, 2000),
    photoPaths,
    status: "กำลังตรวจสอบ",
    messages: [],
    createdAt: at,
    log: [{ at, by, action: `ทีมงานบันทึกเคลม${channel ? ` (แจ้งทาง ${channel})` : ""}` }],
  };

  if (body?.notify !== false) await notifyClaimOpened(sb, order, claim, by);

  const { error } = await insertClaim(sb, claim);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true, claim: await withSignedPhotos(sb, claim) });
}
