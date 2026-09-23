import { NextResponse } from "next/server";
import { bkkYmd, thaiDateTime } from "@/lib/bangkok-time";
import { randomBytes } from "node:crypto";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { proofsOf, withLog, type Order, type OrderItem } from "@/lib/admin-data";
import { insertOrder, updateOrder } from "@/lib/server/order-write";
import { reportPaidToTP } from "@/lib/server/tp-report";
import { findOpenClaimByOrder, insertClaim, loadClaim, newClaimId, notifyClaimOpened, saveClaim, withSignedPhotos } from "@/lib/server/claims-db";
import { claimTypeFromReason, type Claim } from "@/lib/claims";

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
 *
 * 🧰 งานเคลมผูกกับสมุดเคลม (/admin/claims) เสมอ:
 *   - ส่ง claimId มา (กดจากหน้าเคลม) หรือออเดอร์นี้มีเคสที่เปิดอยู่ → เติม redoOrderId + แนวทาง "ผลิตใหม่" ให้เคสนั้น
 *   - ไม่มีเคส (กดจากหน้าออเดอร์ตอนคุย LINE) → เปิดเคสใหม่ให้เอง source "admin" สถานะ "อนุมัติเคลม"
 *   เดิมงานเคลมจากปุ่มนี้ไม่ทิ้งร่องรอยในหน้าเคลมเลย — สถิติเคลมนับต่ำกว่าจริง (เจ้าของร้านถาม 16 ก.ย. 69)
 *   ผูกเคสพลาดไม่ทำให้การสร้างออเดอร์ล้ม (ออเดอร์เขียนไปแล้ว) แต่ส่ง claimWarn กลับให้หน้าจอบอก
 *   notify ≠ false → แจ้งลูกค้าทาง LINE ว่ารับเรื่องแล้ว กำลังผลิตใหม่ให้ (ผลลง log ของเคส) — เดิมเคสเปิดเงียบ ลูกค้าไม่รู้
 */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: {
    fromId?: string;
    /** 📄 เคสของใบนอกระบบ (ระบบเก่า) — ไม่มีใบต้นทางให้ก๊อป สร้างใบ ฿0 จากข้อมูลในเคสแทน */
    fromClaimId?: string;
    mode?: "claim" | "reorder";
    picks?: { index: number; qty?: number }[];
    reason?: string;
    claimId?: string;
    /** แจ้งลูกค้าทาง LINE ว่ารับเรื่องเคลม/กำลังผลิตใหม่ (ค่าเริ่มต้น true — ปิดได้ถ้าคุยกับลูกค้าไปแล้ว) */
    notify?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const fromId = String(body.fromId ?? "").trim();
  const fromClaimId = String(body.fromClaimId ?? "").trim();
  const mode = body.mode === "claim" ? "claim" : "reorder";
  const reason = String(body.reason ?? "").trim();
  if (fromClaimId) return legacyRedo(sb, fromClaimId, reason, gate.actor.name?.trim() || gate.actor.username, body.picks);
  if (!fromId) return NextResponse.json({ error: "ไม่ได้ระบุออเดอร์ต้นทาง" }, { status: 400 });
  if (mode === "claim" && !reason) return NextResponse.json({ error: "งานเคลมต้องระบุเหตุผล" }, { status: 400 });

  const { data: row, error: readErr } = await sb.from("orders").select("data").eq("id", fromId).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์ต้นทาง" }, { status: 404 });
  const src = row.data as Order;
  const by = gate.actor.name?.trim() || gate.actor.username;

  // เลือกเฉพาะรายการที่ติ๊กมา (ไม่ส่ง picks = ทำใหม่ทั้งออเดอร์)
  const picks: { index: number; qty?: number }[] =
    Array.isArray(body.picks) && body.picks.length ? body.picks : src.items.map((_, i) => ({ index: i }));
  const items: OrderItem[] = [];
  /** ตำแหน่งใน src.items ของแต่ละรายการที่หยิบมา (เรียงตรงกับ items — picks ที่ชี้ตำแหน่งไม่มีจะถูกข้าม) */
  const pickedIndex: number[] = [];
  for (const p of picks) {
    const it = src.items[p.index];
    if (!it) continue;
    const qty = Math.max(1, Math.floor(Number(p.qty) || it.qty));
    pickedIndex.push(p.index);
    items.push({
      productId: it.productId,
      name: it.name,
      selections: it.selections,
      ...(it.sel ? { sel: { ...it.sel } } : {}),
      ...(it.unitYield ? { unitYield: { ...it.unitYield } } : {}), // 1 หน่วย = กี่ชิ้น ต้องตามไปด้วย ไม่งั้นใบใหม่เทียบจำนวนแบบงานผิด
      qty,
      unitPrice: mode === "claim" ? 0 : it.unitPrice, // เคลม = ไม่คิดเงิน
      ...(it.artworkUrls?.length ? { artworkUrls: [...it.artworkUrls] } : {}),
      ...(it.artworkQty ? { artworkQty: { ...it.artworkQty } } : {}), // จำนวนต่อลายตามไปด้วย
      ...(it.artworkSize ? { artworkSize: { ...it.artworkSize } } : {}), // ขนาดต่อลาย (คละหลายขนาด) ตามไปด้วย
      ...(it.artworkBackUrls?.length ? { artworkBackUrls: [...it.artworkBackUrls] } : {}), // ป้ายหน้า/หลังของลายต้องตามไปด้วย
      ...(it.sampleRequired ? { sampleRequired: it.sampleRequired } : {}),
      // ♻️ ใบเดิมมีลาย/แบบอยู่แล้ว → ปักป้าย "ใช้ไฟล์เก่า" ชี้กลับใบเดิม กราฟฟิกจะได้หยิบแบบที่อนุมัติแล้วมาใช้ต่อ
      ...(it.artworkUrls?.length || proofsOf(it).length
        ? { reuseArt: { fromOrderId: fromId, note: mode === "claim" ? "งานเคลม — ไฟล์เดิมจากใบที่เคลม" : "สั่งซ้ำ — ไฟล์เดิมจากใบก่อน", by, at: new Date().toISOString() } }
        : {}),
    });
  }
  if (!items.length) return NextResponse.json({ error: "ไม่ได้เลือกรายการที่จะทำใหม่" }, { status: 400 });

  const now = new Date();
  const id = `OD-${bkkYmd(now)}-${Math.floor(1000 + Math.random() * 9000)}`;

  let order: Order = {
    id,
    key: randomBytes(24).toString("base64url"),
    customer: src.customer,
    phone: src.phone,
    address: src.address,
    date: thaiDateTime(now),
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

  const { error: insErr } = await insertOrder(sb, order, by);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  /* 🧰➡️🎨 งานเคลมต้องขึ้นบอร์ด WIP กราฟฟิกเหมือนออเดอร์ที่ชำระแล้วทั่วไป (เจ้าของร้านแจ้ง 21 ก.ย. 69 · OD-260921-6979)
     ใบเคลมเกิดมาพร้อมสถานะ "ชำระแล้ว" ตรงนี้เลย ไม่ได้ผ่าน PATCH เปลี่ยนสถานะและไม่มีสลิปให้ตรวจ
     → ไม่มีใครยิงเรคอร์ดสะพาน (iduckyPaidOrders) ให้ = กราฟฟิกไม่เห็นงานเลย ต้องมาบอกกันปากเปล่า
     ยอดเป็น 0 ทั้งใบ — ฝั่ง msVerify ไม่ดึงใบยอด 0 เข้าระบบบัญชี (จับคู่ยอดธนาคารไม่ได้) จึงไม่รบกวนงานเคลียยอด
     ⏳ await: Netlify แช่เครื่องทันทีที่ตอบ response — fire-and-forget ตายกลางทางได้ (ดู tp-bridge-audit) */
  if (mode === "claim") await reportPaidToTP(order, by, { noteSuffix: `งานเคลม ไม่คิดเงิน · จาก ${fromId}` });

  // จดไว้ที่ออเดอร์ต้นทางด้วย — เปิดดูงานที่ทำใหม่ได้จากทั้งสองฝั่ง
  const srcNext = withLog(
    { ...src, redoOrders: [...(src.redoOrders ?? []), id] },
    by,
    mode === "claim" ? "เปิดงานเคลมจากออเดอร์นี้" : "สั่งซ้ำจากออเดอร์นี้",
    `${id}${reason ? ` · ${reason}` : ""} · ${items.length} รายการ`
  );
  await updateOrder(sb, srcNext);

  // สำหรับงานเคลมมี proofs ของเดิมไหม (ไว้บอกใน UI ว่าต้องทำแบบใหม่)
  const hadProofs = src.items.some((it) => proofsOf(it).length > 0);

  // 🧰 ผูกงานเคลมกับสมุดเคลม — เคสเดิมถ้ามี ไม่มีก็เปิดให้
  let claim: Claim | null = null;
  let claimCreated = false;
  let claimWarn: string | undefined;
  if (mode === "claim") {
    try {
      const wanted = String(body.claimId ?? "").trim();
      let found: Claim | null = wanted ? await loadClaim(sb, wanted) : null;
      if (found && found.orderId !== fromId) found = null; // เคสที่ส่งมาเป็นของออเดอร์อื่น — ไม่ผูกมั่ว
      if (!found) {
        const r = await findOpenClaimByOrder(sb, fromId);
        if (r.error) throw new Error(r.error.message);
        found = r.claim;
      }
      const at = new Date().toISOString();
      const claimItems = items.map((it, k) => ({ index: pickedIndex[k], name: it.name, qty: it.qty }));
      if (found) {
        found.resolution = { ...found.resolution, action: "ผลิตใหม่", redoOrderId: id };
        if (found.status === "ใหม่" || found.status === "กำลังตรวจสอบ") {
          found.log = [...(found.log ?? []), { at, by, action: `สถานะ ${found.status} → อนุมัติเคลม` }];
          found.status = "อนุมัติเคลม";
        }
        if (!found.items?.length) found.items = claimItems;
        found.log = [...(found.log ?? []), { at, by, action: `สร้างงานผลิตใหม่ ${id}` }];
        if (body.notify !== false) await notifyClaimOpened(sb, src, found, by);
        const { error } = await saveClaim(sb, found);
        if (error) throw new Error(error);
        claim = found;
      } else {
        claim = {
          id: newClaimId(),
          orderId: fromId,
          ...(src.customerId ? { customerId: src.customerId } : {}),
          source: "admin",
          createdBy: by,
          customer: src.customer,
          phone: src.phone,
          itemNames: items.map((it) => it.name),
          items: claimItems,
          type: claimTypeFromReason(reason),
          detail: reason.slice(0, 2000),
          photoPaths: [],
          status: "อนุมัติเคลม",
          resolution: { action: "ผลิตใหม่", redoOrderId: id },
          messages: [],
          createdAt: at,
          log: [
            { at, by, action: "เปิดเคสจากปุ่ม ♻️ ทำใหม่/เคลม ในหน้าออเดอร์" },
            { at, by, action: `สร้างงานผลิตใหม่ ${id}` },
          ],
        };
        if (body.notify !== false) await notifyClaimOpened(sb, src, claim, by);
        const { error } = await insertClaim(sb, claim);
        if (error) throw new Error(error);
        claimCreated = true;
      }
    } catch (e) {
      claimWarn = `สร้างออเดอร์เคลมแล้ว แต่ผูกกับสมุดเคลมไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`;
      console.error("[orders/redo] ผูกเคสเคลมไม่สำเร็จ:", claimWarn);
      claim = null;
    }
  }

  return NextResponse.json({
    ok: true,
    id,
    mode,
    hadProofs,
    ...(claim ? { claimId: claim.id, claimCreated, claim: await withSignedPhotos(sb, claim) } : {}),
    ...(claimWarn ? { claimWarn } : {}),
  });
}

/**
 * 📄♻️ งานผลิตใหม่ของ "ใบนอกระบบ" — ไม่มีใบต้นทางในตาราง orders ให้ก๊อป
 *
 * ต่างจากทางปกติตรงไหน: ชื่อ/เบอร์/ที่อยู่/รายการ มาจากตัวเคสเอง (ที่ดึงมาจาก backoffice ตอนเปิดเคส)
 * · ไม่มี productId/selections/ไฟล์ลาย — กราฟฟิกต้องไปโหลดจากลิงก์ใบเก่า จึงแปะลิงก์ไว้ในหมายเหตุใบงาน
 * · ไม่ยิง LINE (ใบเก่าไม่มีช่องทางของลูกค้า) · ไม่มีใบต้นทางให้ไปจด redoOrders กลับ
 * เหมือนทางปกติ: ราคาทุกรายการ 0 · ค่าส่ง 0 · เริ่มที่ "ชำระแล้ว" · ยิงสะพาน TP ให้ขึ้นบอร์ด WIP กราฟฟิก
 */
async function legacyRedo(
  sb: ReturnType<typeof getSupabaseAdmin>,
  claimId: string,
  reason: string,
  by: string,
  picks?: { index: number; qty?: number }[]
) {
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const claim = await loadClaim(sb, claimId);
  if (!claim) return NextResponse.json({ error: `ไม่พบเคส ${claimId}` }, { status: 404 });
  if (!claim.legacy) return NextResponse.json({ error: "เคสนี้มีใบในระบบอยู่แล้ว — ใช้ปุ่มสร้างงานผลิตใหม่ตามปกติ" }, { status: 400 });
  if (claim.resolution?.redoOrderId)
    return NextResponse.json({ error: `เคสนี้เปิดงานผลิตใหม่ไปแล้ว (${claim.resolution.redoOrderId})` }, { status: 409 });
  if (!claim.customer?.trim()) return NextResponse.json({ error: "เคสนี้ไม่มีชื่อลูกค้า — เติมในเคสก่อน" }, { status: 400 });

  const src: { index: number; name: string; qty: number }[] = claim.items?.length
    ? claim.items
    : (claim.itemNames ?? []).map((name, i) => ({ index: i, name, qty: 1 }));
  const wanted: { index: number; qty?: number }[] = Array.isArray(picks) && picks.length ? picks : src.map((_, i) => ({ index: i }));
  const items: OrderItem[] = [];
  for (const p of wanted) {
    const it = src[p.index];
    if (!it?.name) continue;
    items.push({
      productId: "",
      name: it.name,
      selections: "",
      qty: Math.max(1, Math.floor(Number(p.qty) || it.qty || 1)),
      unitPrice: 0,
    });
  }
  if (!items.length) return NextResponse.json({ error: "เคสนี้ไม่มีรายการให้ทำใหม่" }, { status: 400 });

  const now = new Date();
  const id = `OD-${bkkYmd(now)}-${Math.floor(1000 + Math.random() * 9000)}`;
  const link = claim.legacyUrl ? ` · ไฟล์ลายอยู่ในใบเก่า: ${claim.legacyUrl}` : "";

  let order: Order = {
    id,
    key: randomBytes(24).toString("base64url"),
    customer: claim.customer,
    phone: claim.phone ?? "",
    address: claim.legacyAddress ?? "",
    date: thaiDateTime(now),
    payment: "โอนธนาคาร",
    shipping: "ส่งธรรมดา",
    shippingCost: 0,
    status: "ชำระแล้ว",
    items,
    placedBy: by,
    claimOf: claim.orderId,
    claimReason: reason || `งานเคลมจากเคส ${claim.id} (ใบนอกระบบ ${claim.orderId})`,
    note: `📄 งานเคลมของใบนอกระบบ ${claim.orderId} · เคส ${claim.id}${link}`,
  };

  order = withLog(order, by, "สร้างงานเคลมใบนอกระบบ (ไม่คิดเงิน)", `จากเคส ${claim.id} · ใบเก่า ${claim.orderId} · ${items.length} รายการ`);

  const { error: insErr } = await insertOrder(sb, order, by);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // ขึ้นบอร์ด WIP กราฟฟิกเหมือนใบเคลมปกติ (ใบเกิดมาพร้อม "ชำระแล้ว" ไม่ได้ผ่าน PATCH จึงไม่มีใครยิงสะพานให้)
  await reportPaidToTP(order, by, { noteSuffix: `งานเคลมใบนอกระบบ ไม่คิดเงิน · จากเคส ${claim.id}` });

  let claimWarn: string | undefined;
  try {
    const at = new Date().toISOString();
    claim.resolution = { ...claim.resolution, action: "ผลิตใหม่", redoOrderId: id };
    if (claim.status === "ใหม่" || claim.status === "กำลังตรวจสอบ") {
      claim.log = [...(claim.log ?? []), { at, by, action: `สถานะ ${claim.status} → อนุมัติเคลม` }];
      claim.status = "อนุมัติเคลม";
    }
    claim.log = [...(claim.log ?? []), { at, by, action: `สร้างงานผลิตใหม่ ${id}` }];
    const { error } = await saveClaim(sb, claim);
    if (error) throw new Error(error);
  } catch (e) {
    claimWarn = `สร้างใบ ${id} แล้ว แต่บันทึกกลับเข้าเคสไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`;
    console.error("[orders/redo] legacy:", claimWarn);
  }

  return NextResponse.json({
    ok: true,
    id,
    mode: "claim",
    hadProofs: false,
    claimId: claim.id,
    claimCreated: false,
    claim: await withSignedPhotos(sb, claim),
    ...(claimWarn ? { claimWarn } : {}),
  });
}
