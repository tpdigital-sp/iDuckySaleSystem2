import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { updateOrder } from "@/lib/server/order-write";
import { closeFollowUpClaim, openFollowUpClaim } from "@/lib/server/claims-db";
import { CLAIM_FAULTS, type ClaimFault } from "@/lib/claims";
import { isPickupOrder } from "@/lib/ship-label";
import { canOpenFollowUp, followUpQty, openFollowUp, proofsOf, withLog, type FollowUpRound, type Order } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * 📦 รอบ "ส่งตามให้" — ใบปิดไปแล้วแต่ของในกล่องไม่ครบ ต้องส่งของที่ตกค้างตามไปอีกกล่อง
 * (พนักงานแจ้ง 24 ก.ย. 69 · ดู FollowUpRound ใน admin-data.ts ว่าทำไมไม่ใช้แบ่งส่ง/กล่องที่ 2/ใบเคลมใหม่)
 *
 * ประตูเดียวที่เขียน Order.followUp ได้ — PATCH /api/admin/orders คงค่าในฐานไว้เสมอ
 * (ยกเว้นตอน "ปิดรอบให้เอง" เมื่อยิงกล่องเพิ่ม ซึ่งเซิร์ฟเวอร์เป็นคนเขียนเอง ไม่ใช่ก้อนจากหน้าจอ)
 *
 *   open   เปิดรอบ  = ติ๊กของที่ตกค้าง + สาเหตุ + ความผิดของใคร → เปิดเคสในสมุดเคลมคู่กันเสมอ (กติกาข้อ 2)
 *   cancel ยกเลิกรอบที่ยังไม่ได้ส่ง (กดผิดใบ)
 *   ship   ปิดรอบสำหรับใบ "มารับเอง" (ไม่มีเลขพัสดุให้ยิง) — ใบส่งพัสดุปิดเองตอนยิงกล่องเพิ่ม
 *
 * ⚠️ ไม่แตะสถานะใบเด็ดขาด — ใบยังเป็นจัดส่งแล้ว/เสร็จสิ้นเหมือนเดิม (เคส OD-260914-5746 ใบค้าง "กำลังผลิต" 5 วัน)
 * ⚠️ ไม่ยิงไลน์ตอนเปิดรอบ (กติกาข้อ 4) — ลูกค้าได้ข้อความตอนกล่องออกจริงเท่านั้น
 */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: {
    orderId?: string;
    action?: "open" | "cancel" | "ship";
    items?: { item?: number; proof?: number; url?: string; qty?: number; unit?: string }[];
    reason?: string;
    fault?: string;
    note?: string;
    /** ลูกค้าแจ้งมาทางไหน (ลงในเคสเคลม) */
    channel?: string;
    /** ค่าส่งกล่องนี้ที่ร้านออกเอง — เก็บไว้รวมยอดความเสียหายทีหลัง */
    cost?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const orderId = String(body.orderId ?? "").trim();
  if (!orderId) return NextResponse.json({ error: "ไม่ได้ระบุออเดอร์" }, { status: 400 });
  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", orderId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });

  const order = row.data as Order;
  const by = gate.actor.name?.trim() || gate.actor.username;
  const now = new Date().toISOString();
  const action = body.action ?? "open";

  // ── ยกเลิกรอบที่ยังไม่ได้ส่ง (เปิดผิดใบ/ลูกค้าเจอของแล้ว) ──
  if (action === "cancel") {
    const open = openFollowUp(order);
    if (!open) return NextResponse.json({ error: "ใบนี้ไม่มีรอบส่งตามที่ค้างอยู่" }, { status: 409 });
    const rounds = (order.followUp ?? []).filter((_, i) => i !== open.index);
    const next = withLog(
      { ...order, followUp: rounds.length ? rounds : undefined },
      by,
      `📦 ยกเลิกรอบส่งตามที่ ${open.no}`,
      `${followUpQty(open.round).toLocaleString("th-TH")} ชิ้น · ${open.round.reason}${open.round.claimId ? ` · เคส ${open.round.claimId} ยังเปิดอยู่ ให้ปิดเองในหน้าเคลม` : ""}`,
    );
    const written = await updateOrder(sb, next, { prev: order, by: `แอดมิน ${by}` });
    if (written.error) return NextResponse.json({ error: written.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, order: written.order });
  }

  // ── ปิดรอบของใบ "มารับเอง" (ไม่มีเลขพัสดุให้ยิง — ใบส่งพัสดุปิดเองตอนยิงกล่องเพิ่ม) ──
  if (action === "ship") {
    const open = openFollowUp(order);
    if (!open) return NextResponse.json({ error: "ใบนี้ไม่มีรอบส่งตามที่ค้างอยู่" }, { status: 409 });
    if (!isPickupOrder(order))
      return NextResponse.json(
        { error: "ใบส่งพัสดุให้ยิงเลขกล่องส่งตามที่ช่องเลขพัสดุ (เลือก ＋ เพิ่มเป็นกล่องที่ N) ระบบจะปิดรอบให้เอง" },
        { status: 409 },
      );
    const rounds = [...(order.followUp ?? [])];
    rounds[open.index] = { ...open.round, pickup: true, shippedAt: now, shippedBy: by };
    const next = withLog(
      { ...order, followUp: rounds },
      by,
      `📦 ของที่ตกค้างพร้อมให้มารับแล้ว — รอบส่งตามที่ ${open.no}`,
      `${followUpQty(open.round).toLocaleString("th-TH")} ชิ้น`,
    );
    const written = await updateOrder(sb, next, { prev: order, by: `แอดมิน ${by}` });
    if (written.error) return NextResponse.json({ error: written.error.message }, { status: 500 });
    if (open.round.claimId) await closeFollowUpClaim(sb, open.round.claimId, by, `ส่งของที่ตกค้างให้แล้ว (มารับเองที่ร้าน) — ออเดอร์ ${order.id}`);
    return NextResponse.json({ ok: true, order: written.order });
  }

  // ── เปิดรอบใหม่ ──
  const may = canOpenFollowUp(order);
  if (!may.ok) return NextResponse.json({ error: may.reason }, { status: 409 });

  const reason = String(body.reason ?? "").trim();
  if (!reason) return NextResponse.json({ error: "ต้องระบุสาเหตุที่ของไม่ได้ไปกับกล่องแรก" }, { status: 400 });
  const fault = (CLAIM_FAULTS as readonly string[]).includes(String(body.fault)) ? (body.fault as ClaimFault) : "ไม่ทราบ";

  const items: FollowUpRound["items"] = [];
  for (const raw of Array.isArray(body.items) ? body.items : []) {
    const idx = Math.floor(Number(raw?.item));
    const it = order.items[idx];
    if (!it) continue;
    const qty = Math.max(1, Math.floor(Number(raw?.qty) || 0));
    const pi = Number.isInteger(raw?.proof) ? Math.floor(Number(raw?.proof)) : undefined;
    const proof = pi !== undefined ? proofsOf(it)[pi] : undefined;
    items.push({
      item: idx,
      ...(proof ? { proof: pi, ...(proof.url ? { url: proof.url } : {}) } : {}),
      qty,
      unit: String(raw?.unit ?? proof?.unit ?? "ชิ้น"),
      itemName: it.name,
    });
  }
  if (!items.length) return NextResponse.json({ error: "ยังไม่ได้เลือกของที่ตกค้าง" }, { status: 400 });

  const round: FollowUpRound = {
    items,
    reason,
    fault,
    ...(body.note?.trim() ? { note: body.note.trim() } : {}),
    ...(Number(body.cost) > 0 ? { cost: Math.round(Number(body.cost)) } : {}),
    by,
    at: now,
  };

  // 🧰 เข้าสมุดเคลมทุกครั้ง (กติกาข้อ 2) — ผูกพลาดไม่ล้มการเปิดรอบ ส่ง warn กลับให้หน้าจอบอก
  const { claimId, warn } = await openFollowUpClaim(sb, order, round, by, body.channel);
  if (claimId) round.claimId = claimId;

  const no = (order.followUp ?? []).length + 1;
  const next = withLog(
    { ...order, followUp: [...(order.followUp ?? []), round] },
    by,
    `📦 เปิดรอบส่งตามที่ ${no} — ส่งของไม่ครบ`,
    [
      `${followUpQty(round).toLocaleString("th-TH")} ชิ้น: ${items.map((i) => `${i.itemName} ×${i.qty}`).join(" · ")}`,
      `สาเหตุ: ${reason} · ความผิด: ${fault}`,
      claimId ? `เคส ${claimId}` : "",
      "ยังไม่แจ้งลูกค้า — ไลน์จะออกตอนยิงเลขกล่องส่งตาม",
    ]
      .filter(Boolean)
      .join(" · "),
  );
  const written = await updateOrder(sb, next, { prev: order, by: `แอดมิน ${by}` });
  if (written.error) return NextResponse.json({ error: written.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, order: written.order, claimId, claimWarn: warn });
}
