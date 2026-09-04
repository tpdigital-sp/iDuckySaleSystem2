import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { proofsOf, withLog, type Order, type OrderItem } from "@/lib/admin-data";

export const runtime = "nodejs";

/**
 * ♻️ ทำงานใหม่จากออเดอร์เดิม — 2 แบบ
 *
 *  claim (เคลม)  : งานเสีย/พิมพ์ผิด/ส่งผิด → ทำส่งใหม่ให้ลูกค้าฟรี
 *                  ราคาทุกรายการ = 0 · ค่าส่ง = 0 · เริ่มที่สถานะ "ชำระแล้ว" (ไม่ต้องรอเงิน)
 *  reorder (สั่งซ้ำ): ลูกค้าอยากได้อีก → คิดเงินตามปกติ เริ่มที่ "รอชำระเงิน"
 *
 * ทั้งสองแบบคัดลอกลูกค้า/ที่อยู่/สเปคงาน/ลายที่ลูกค้าแนบมาให้ (ทีมงานทำต่อได้เลย)
 * แบบงานเก่า "ไม่" คัดลอก เพราะต้องทำใหม่/ตรวจใหม่อยู่ดี — แต่มีลิงก์ให้ย้อนดูออเดอร์เดิมเสมอ
 */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { fromId?: string; mode?: "claim" | "reorder"; picks?: { index: number; qty?: number }[]; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const fromId = String(body.fromId ?? "").trim();
  const mode = body.mode === "claim" ? "claim" : "reorder";
  const reason = String(body.reason ?? "").trim();
  if (!fromId) return NextResponse.json({ error: "ไม่ได้ระบุออเดอร์ต้นทาง" }, { status: 400 });
  if (mode === "claim" && !reason) return NextResponse.json({ error: "งานเคลมต้องระบุเหตุผล" }, { status: 400 });

  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", fromId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์ต้นทาง" }, { status: 404 });
  const src = row.data as Order;

  // เลือกเฉพาะรายการที่ติ๊กมา (ไม่ส่ง picks = ทำใหม่ทั้งออเดอร์)
  const picks: { index: number; qty?: number }[] =
    Array.isArray(body.picks) && body.picks.length ? body.picks : src.items.map((_, i) => ({ index: i }));
  const items: OrderItem[] = [];
  for (const p of picks) {
    const it = src.items[p.index];
    if (!it) continue;
    const qty = Math.max(1, Math.floor(Number(p.qty) || it.qty));
    items.push({
      productId: it.productId,
      name: it.name,
      selections: it.selections,
      ...(it.sel ? { sel: { ...it.sel } } : {}),
      ...(it.unitYield ? { unitYield: { ...it.unitYield } } : {}), // 1 หน่วย = กี่ชิ้น ต้องตามไปด้วย ไม่งั้นใบใหม่เทียบจำนวนแบบงานผิด
      qty,
      unitPrice: mode === "claim" ? 0 : it.unitPrice, // เคลม = ไม่คิดเงิน
      ...(it.artworkUrls?.length ? { artworkUrls: [...it.artworkUrls] } : {}),
      ...(it.sampleRequired ? { sampleRequired: it.sampleRequired } : {}),
    });
  }
  if (!items.length) return NextResponse.json({ error: "ไม่ได้เลือกรายการที่จะทำใหม่" }, { status: 400 });

  const now = new Date();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const id = `OD-${String(now.getFullYear()).slice(2)}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${Math.floor(1000 + Math.random() * 9000)}`;
  const by = gate.actor.name?.trim() || gate.actor.username;

  let order: Order = {
    id,
    key: randomBytes(24).toString("base64url"),
    customer: src.customer,
    phone: src.phone,
    address: src.address,
    date: now.toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    payment: src.payment,
    shipping: src.shipping,
    ...(src.shippingLabel ? { shippingLabel: src.shippingLabel } : {}), // ชื่อวิธีส่งจริง (EMS ฯลฯ) ต้องติดไปด้วย ไม่งั้นใบปะหน้าขึ้นผิด
    shippingCost: mode === "claim" ? 0 : src.shippingCost, // เคลม = ร้านออกค่าส่งเอง
    status: mode === "claim" ? "ชำระแล้ว" : "รอชำระเงิน",
    items,
    placedBy: by,
    ...(mode === "claim" ? { claimOf: fromId, claimReason: reason } : { reorderOf: fromId }),
    ...(src.email ? { email: src.email } : {}),
    ...(src.customerId ? { customerId: src.customerId } : {}),
  };

  order = withLog(
    order,
    by,
    mode === "claim" ? "สร้างงานเคลม (ไม่คิดเงิน)" : "สั่งซ้ำจากออเดอร์เดิม",
    `จาก ${fromId} · ${items.length} รายการ${mode === "claim" ? ` · เหตุผล: ${reason}` : ""}`
  );

  const { error: insErr } = await sb.from("orders").insert({ id, data: order });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // จดไว้ที่ออเดอร์ต้นทางด้วย — เปิดดูงานที่ทำใหม่ได้จากทั้งสองฝั่ง
  const srcNext = withLog(
    { ...src, redoOrders: [...(src.redoOrders ?? []), id] },
    by,
    mode === "claim" ? "เปิดงานเคลมจากออเดอร์นี้" : "สั่งซ้ำจากออเดอร์นี้",
    `${id}${reason ? ` · ${reason}` : ""} · ${items.length} รายการ`
  );
  await sb.from("orders").update({ data: srcNext }).eq("id", fromId);

  // สำหรับงานเคลมมี proofs ของเดิมไหม (ไว้บอกใน UI ว่าต้องทำแบบใหม่)
  const hadProofs = src.items.some((it) => proofsOf(it).length > 0);

  return NextResponse.json({ ok: true, id, mode, hadProofs });
}
