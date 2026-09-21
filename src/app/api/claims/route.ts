import { NextResponse } from "next/server";
import { pushShopAlert } from "@/lib/server/line-alert";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { bearerUser, CLAIM_PHOTO_PATH_RE, findOpenClaimByOrder, insertClaim, isMissingTable, newClaimId } from "@/lib/server/claims-db";
import { CLAIM_TYPES, CLAIM_WINDOW_DAYS, type Claim } from "@/lib/claims";
import type { Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * ลูกค้ายื่นเคลมสินค้า — ยืนยันตัวด้วย Bearer token (บัญชีเดียวกับที่สั่งซื้อ)
 * เงื่อนไข: ออเดอร์ต้อง "จัดส่งแล้ว/เสร็จสิ้น" และไม่เกิน CLAIM_WINDOW_DAYS วันหลังจัดส่ง
 * (หาเวลาจัดส่งจาก log ของออเดอร์ — ถ้าไม่เจอก็ไม่ปิดกั้น ให้แอดมินใช้ดุลยพินิจ)
 */

/** เวลาออเดอร์เปลี่ยนเป็น "จัดส่งแล้ว" จาก log (null = หาไม่เจอ) */
function shippedAtOf(order: Order): number | null {
  for (const e of [...(order.log ?? [])].reverse()) {
    if (`${e.action} ${e.detail ?? ""}`.includes("จัดส่งแล้ว")) {
      const t = Date.parse(e.at);
      if (isFinite(t)) return t;
    }
  }
  return null;
}

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const user = await bearerUser(sb, req);
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบก่อนยื่นเคลม" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    orderId?: string;
    itemNames?: string[];
    type?: string;
    detail?: string;
    photoPaths?: string[];
  } | null;

  const orderId = (body?.orderId ?? "").trim();
  const type = (body?.type ?? "").trim();
  const detail = (body?.detail ?? "").trim();
  if (!orderId || !type || !detail) return NextResponse.json({ error: "กรอกข้อมูลไม่ครบ (ออเดอร์ / ประเภทปัญหา / รายละเอียด)" }, { status: 400 });
  if (!(CLAIM_TYPES as readonly string[]).includes(type)) return NextResponse.json({ error: "ประเภทปัญหาไม่ถูกต้อง" }, { status: 400 });
  const photoPaths = (body?.photoPaths ?? []).filter((p) => CLAIM_PHOTO_PATH_RE.test(p)).slice(0, 6);
  const itemNames = (body?.itemNames ?? []).map((s) => String(s).slice(0, 200)).slice(0, 30);

  // ── ตรวจออเดอร์: เป็นของบัญชีนี้ + สถานะ/กรอบเวลาเข้าเงื่อนไข ──
  const { data: row } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  const order = row?.data as Order | undefined;
  if (!order || order.customerId !== user.id) return NextResponse.json({ error: "ไม่พบออเดอร์นี้ในบัญชีของคุณ" }, { status: 404 });
  if (!["จัดส่งแล้ว", "เสร็จสิ้น"].includes(order.status))
    return NextResponse.json({ error: "ยื่นเคลมได้เมื่อออเดอร์จัดส่งแล้ว — ถ้างานยังไม่ถึงมือแต่มีปัญหา ทักแอดมินทาง LINE ได้เลย" }, { status: 400 });
  const shippedAt = shippedAtOf(order);
  if (shippedAt && Date.now() - shippedAt > CLAIM_WINDOW_DAYS * 86400_000)
    return NextResponse.json(
      { error: `ออเดอร์นี้จัดส่งเกิน ${CLAIM_WINDOW_DAYS} วันแล้ว — ยื่นเคลมในระบบไม่ได้ แต่ทักแอดมินทาง LINE ให้ช่วยดูได้ครับ` },
      { status: 400 },
    );

  // กันยื่นซ้ำ — ออเดอร์เดียวมีเคลมที่ยังเดินเรื่องได้ทีละใบ
  const { claim: existing, error: listErr } = await findOpenClaimByOrder(sb, orderId);
  if (listErr) {
    if (isMissingTable(listErr)) return NextResponse.json({ error: "ระบบเคลมยังไม่พร้อม — ผู้ดูแลต้องรัน supabase/claims.sql ก่อน" }, { status: 503 });
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }
  if (existing)
    return NextResponse.json({ error: "ออเดอร์นี้มีเคลมที่กำลังดำเนินการอยู่แล้ว — ติดตาม/ตอบเพิ่มในเคลมเดิมได้เลย" }, { status: 400 });

  const now = new Date().toISOString();
  const claim: Claim = {
    id: newClaimId(),
    orderId,
    customerId: user.id,
    source: "web",
    customer: order.customer,
    phone: order.phone,
    ...(itemNames.length ? { itemNames } : {}),
    type,
    detail: detail.slice(0, 2000),
    photoPaths,
    status: "ใหม่",
    messages: [],
    createdAt: now,
    log: [{ at: now, by: order.customer || "ลูกค้า", action: "ยื่นเคลม" }],
  };

  const { error } = await insertClaim(sb, claim);
  if (error) return NextResponse.json({ error }, { status: 500 });

  // 🔔 แจ้งทีมงานทาง LINE ทันที (fire-and-forget — แจ้งไม่ได้ก็ไม่ขวางการยื่น)
  // ⚠️ await ไม่ใช่ void — Netlify แช่ฟังก์ชันตอนตอบกลับ งานค้างอาจไม่ได้ทำ (ตัวส่ง timeout 10 วิ ไม่ throw)
  await pushShopAlert(
    {
      tone: "#E11D48",
      title: "🧰 เคลมใหม่",
      headline: "ลูกค้าแจ้งปัญหาเข้ามา รีบดูก่อนเรื่องบานปลาย",
      heroLabel: "เลขเคลม",
      hero: claim.id,
      rows: [
        { label: "ออเดอร์", value: orderId },
        { label: "ลูกค้า", value: `${order.customer} · ${order.phone}` },
        { label: "ประเภท", value: type, bold: true, color: "#BE123C" },
      ],
      note: claim.detail.slice(0, 300),
      button: { label: "เปิดหน้าเคลม", uri: "https://iduckystore.com/admin/claims" },
      alt: `🧰 เคลมใหม่ ${claim.id} · ${order.customer}`,
    },
    { money: true },
  );

  return NextResponse.json({ ok: true, claim });
}
