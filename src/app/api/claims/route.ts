import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { bearerUser, isMissingTable } from "@/lib/server/claims-db";
import { CLAIM_TYPES, CLAIM_WINDOW_DAYS, isOpenClaim, type Claim } from "@/lib/claims";
import type { Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * ลูกค้ายื่นเคลมสินค้า — ยืนยันตัวด้วย Bearer token (บัญชีเดียวกับที่สั่งซื้อ)
 * เงื่อนไข: ออเดอร์ต้อง "จัดส่งแล้ว/เสร็จสิ้น" และไม่เกิน CLAIM_WINDOW_DAYS วันหลังจัดส่ง
 * (หาเวลาจัดส่งจาก log ของออเดอร์ — ถ้าไม่เจอก็ไม่ปิดกั้น ให้แอดมินใช้ดุลยพินิจ)
 */

const claimId = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const ymd = `${String(d.getFullYear() + 543).slice(-2)}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  return `CL-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`;
};

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

/** path รูปต้องเป็นของ bucket เคลมที่เราเซ็นให้เอง — กันยัด path มั่วมาให้เซิร์ฟเวอร์เซ็น */
const PHOTO_PATH_RE = /^claims\/\d{4}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

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
  const photoPaths = (body?.photoPaths ?? []).filter((p) => PHOTO_PATH_RE.test(p)).slice(0, 6);
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
  const { data: existing, error: listErr } = await sb.from("claims").select("data").eq("data->>orderId", orderId);
  if (listErr) {
    if (isMissingTable(listErr)) return NextResponse.json({ error: "ระบบเคลมยังไม่พร้อม — ผู้ดูแลต้องรัน supabase/claims.sql ก่อน" }, { status: 503 });
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }
  if ((existing ?? []).some((r) => isOpenClaim(r.data as Claim)))
    return NextResponse.json({ error: "ออเดอร์นี้มีเคลมที่กำลังดำเนินการอยู่แล้ว — ติดตาม/ตอบเพิ่มในเคลมเดิมได้เลย" }, { status: 400 });

  const now = new Date().toISOString();
  const claim: Claim = {
    id: claimId(),
    orderId,
    customerId: user.id,
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

  // id ชนกัน (โอกาสน้อยมาก) → สุ่มใหม่อีกรอบ
  let { error } = await sb.from("claims").insert({ id: claim.id, data: claim });
  if (error && /duplicate|unique/i.test(error.message)) {
    claim.id = claimId();
    ({ error } = await sb.from("claims").insert({ id: claim.id, data: claim }));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 🔔 แจ้งทีมงานทาง LINE ทันที (fire-and-forget — แจ้งไม่ได้ก็ไม่ขวางการยื่น)
  const to = process.env.LINE_ADMIN_ALERT_TO || process.env.LINE_STOCK_ALERT_TO;
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (to && token) {
    void fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        to,
        messages: [
          {
            type: "text",
            text: `🧰 เคลมใหม่ ${claim.id}\nออเดอร์ ${orderId} · ${order.customer} · ${order.phone}\nประเภท: ${type}\n${claim.detail.slice(0, 300)}\n\nเปิดดู: /admin/claims`,
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, claim });
}
