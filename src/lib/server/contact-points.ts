import "server-only";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderTotal, type Order } from "@/lib/admin-data";
import { TIER_WINDOW_DAYS } from "@/lib/tiers";
import type { Contact } from "@/lib/contacts";

/**
 * 🦆 แต้มสะสมลูกค้า — ลูกค้าเริ่มสะสมแต้มตั้งแต่ออเดอร์แรกที่ชำระครบ
 *
 * บวกเข้า point ของผู้ติดต่อ (ตาราง contacts) + ลงประวัติในตาราง contact_points
 * เรียกจาก: แอดมินกดยืนยัน "ชำระแล้ว" · SlipOK ตรวจผ่านอัตโนมัติ · มัดจำเก็บยอดคงเหลือครบ
 * ยกเลิกออเดอร์ → คืนแต้มที่เคยบวก (revokePointsForOrder)
 *
 * กันบวกซ้ำด้วย id ประวัติที่ตายตัวต่อออเดอร์ (`<contactId>:od:<orderId>`) —
 * SlipOK กับแอดมินกดพร้อมกันก็บวกได้แค่ครั้งเดียว (แบบเดียวกับ cutStockForOrder)
 */

/** กติกาแต้ม: ยอดชำระ 1 บาท = 1 แต้ม — แต้มมีไว้เลื่อนระดับ + รับส่วนลด % เท่านั้น (แลกไม่ได้) แก้เรทที่บรรทัดนี้ที่เดียว */
export const BAHT_PER_POINT = 1;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** เวลาไทยรูปแบบเดียวกับประวัติที่นำเข้าจากระบบเดิม เช่น "2026-09-07 14:59:11" */
function nowThai(): string {
  const d = new Date(Date.now() + 7 * 3600_000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

type ContactRow = { id: string; data: Contact };

/**
 * หาผู้ติดต่อของออเดอร์ — ผูกไว้ (contactId) ใช้ตัวนั้น
 * ไม่ผูก → จับคู่จากเบอร์โทร ต้องเจอ "คนเดียวเท่านั้น" ถึงใช้ (เจอหลายคน = ไม่เดา กันแต้มเข้าผิดคน)
 */
async function contactForOrder(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>, order: Order): Promise<ContactRow | null> {
  if (order.contactId) {
    const { data } = await sb.from("contacts").select("id,data").eq("id", order.contactId).maybeSingle();
    return (data as ContactRow | null) ?? null;
  }
  const digits = String(order.phone ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  const { data } = await sb.from("contacts").select("id,data").eq("data->>phone", digits).limit(2);
  const rows = (data ?? []) as ContactRow[];
  return rows.length === 1 ? rows[0] : null;
}

/** ออเดอร์ชำระครบ → บวกแต้มให้ผู้ติดต่อ (idempotent ต่อออเดอร์) — fire-and-forget */
export async function awardPointsForOrder(order: Order): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return;
    const total = orderTotal(order);
    const amount = round2(total / BAHT_PER_POINT);
    if (amount <= 0) return;
    const hit = await contactForOrder(sb, order);
    if (!hit) return;

    const logId = `${hit.id}:od:${order.id}`;
    // เคยบวกออเดอร์นี้แล้ว → ข้าม (SlipOK + แอดมินกดเปลี่ยนสถานะ ยิงมาซ้ำได้)
    const { data: dup } = await sb.from("contact_points").select("id").eq("id", logId).maybeSingle();
    if (dup) return;
    const { error: insErr } = await sb.from("contact_points").insert({
      id: logId,
      contact_id: hit.id,
      data: {
        at: nowThai(),
        action: "เพิ่มคะแนนสะสม",
        point: amount,
        orderId: order.id,
        note: `ชำระครบ ${total.toLocaleString("th-TH")} บาท (${BAHT_PER_POINT} บาท = 1 แต้ม)`,
      },
    });
    if (insErr) return; // แถวซ้ำ (แข่งกันเข้า) หรือตารางยังไม่ถูกสร้าง — ไม่บวกยอด

    const contact = hit.data;
    const point = round2((Number(contact.point) || 0) + amount);
    // เริ่มสะสมตั้งแต่ออเดอร์แรก — ติดธง pointActive ให้เลย
    await sb.from("contacts").update({ data: { ...contact, point, pointActive: true } }).eq("id", hit.id);
    await recomputeTier(sb, hit.id); // อัปเดตแต้มนับระดับ (หมุน 12 เดือน) ให้ทันที
  } catch {
    /* fire-and-forget — แต้มพลาดไม่ควรล้มการบันทึกออเดอร์ */
  }
}

/** ออเดอร์ถูกยกเลิก → คืนแต้มที่เคยบวกจากออเดอร์นี้ (idempotent) — fire-and-forget */
export async function revokePointsForOrder(order: Order): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return;
    const hit = await contactForOrder(sb, order);
    if (!hit) return;

    const awardId = `${hit.id}:od:${order.id}`;
    const revokeId = `${awardId}:คืน`;
    const [{ data: award }, { data: revoked }] = await Promise.all([
      sb.from("contact_points").select("data").eq("id", awardId).maybeSingle(),
      sb.from("contact_points").select("id").eq("id", revokeId).maybeSingle(),
    ]);
    if (!award || revoked) return; // ไม่เคยบวก หรือคืนไปแล้ว
    const amount = Number((award.data as { point?: number }).point) || 0;
    if (amount <= 0) return;

    const { error: insErr } = await sb.from("contact_points").insert({
      id: revokeId,
      contact_id: hit.id,
      data: { at: nowThai(), action: "ลบคะแนนสะสม", point: -amount, orderId: order.id, note: "ยกเลิกออเดอร์ — คืนแต้มที่บวกไว้" },
    });
    if (insErr) return;

    const contact = hit.data;
    const point = round2(Math.max(0, (Number(contact.point) || 0) - amount));
    await sb.from("contacts").update({ data: { ...contact, point } }).eq("id", hit.id);
    await recomputeTier(sb, hit.id);
  } catch {
    /* fire-and-forget */
  }
}


/* ── ระดับสมาชิกแบบหมุน 12 เดือน ─────────────────────────────
 * "แต้มนับระดับ" (tierPoints) = ผลรวมแต้มในประวัติ (contact_points) ที่ได้ภายใน 365 วันล่าสุด
 * แต้มเก่ากว่านั้นหมดอายุเอง → ระดับลดลงเมื่อลูกค้าหยุดซื้อ · ไม่ต้องมีใครกดลด
 *
 * ลูกค้าที่ยกมาจากระบบเดิม: ประวัติเป็นวันเก่า (นอกช่วง 12 เดือน) จะหล่นระดับทันที
 * จึงให้ "เครดิตระดับ" = แต้มสะสมเดิม ค้ำระดับไว้ถึง importedAt + 365 วัน (ปีแรกไม่ตก) แล้วค่อยนับจากยอดจริง
 */

/** แปลงวันเวลาแบบไทยในประวัติ ("2026-05-19 14:59:11") เป็น ms */
function ledgerMs(at: string): number {
  const ms = Date.parse(String(at ?? "").replace(" ", "T"));
  return isNaN(ms) ? 0 : ms;
}

/** อ่านประวัติของผู้ติดต่อ แล้วคำนวณ tierPoints + วันที่จะลดระดับ (เครดิตหมด/แต้มเก่าก้อนถัดไปหมดอายุ) */
export async function recomputeTier(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>, contactId: string): Promise<void> {
  try {
    const [{ data: crow }, { data: logs }] = await Promise.all([
      sb.from("contacts").select("data").eq("id", contactId).maybeSingle(),
      sb.from("contact_points").select("data").eq("contact_id", contactId).limit(3000),
    ]);
    if (!crow) return;
    const contact = crow.data as Contact;
    const now = Date.now();
    const windowStart = now - TIER_WINDOW_DAYS * 86400_000;

    // แต้มในช่วง 12 เดือน (รวมรายการติดลบจากการยกเลิก/คืน)
    let rolling = 0;
    let nextExpire = Infinity; // ก้อนเก่าสุดที่ยังนับอยู่จะหมดอายุเมื่อไหร่
    for (const r of (logs ?? []) as { data: { at?: string; point?: number } }[]) {
      const ms = ledgerMs(r.data.at ?? "");
      const pt = Number(r.data.point) || 0;
      if (ms >= windowStart) {
        rolling += pt;
        if (pt > 0 && ms < nextExpire) nextExpire = ms;
      }
    }
    rolling = round2(Math.max(0, rolling));

    // เครดิตระดับสำหรับลูกค้าเดิม (ตั้งครั้งเดียว) — ค้ำระดับปีแรก
    let graceUntil = contact.tierGraceUntil ? Date.parse(contact.tierGraceUntil) : NaN;
    let gracePoints = Number(contact.tierGracePoints) || 0;
    if (isNaN(graceUntil) && (contact.origins ?? []).includes("legacy") && (Number(contact.point) || 0) > 0) {
      const anchor = Date.parse(contact.importedAt ?? "") || now;
      graceUntil = anchor + TIER_WINDOW_DAYS * 86400_000;
      gracePoints = round2(Number(contact.point) || 0);
    }
    const graceActive = !isNaN(graceUntil) && now < graceUntil ? gracePoints : 0;

    const tierPoints = Math.max(rolling, graceActive);
    // จะลดระดับเมื่อ: เครดิตหมด (ถ้าเครดิตค้ำอยู่) หรือแต้มก้อนเก่าสุดหมดอายุ
    const dropCandidates = [graceActive > rolling && !isNaN(graceUntil) ? graceUntil : Infinity, nextExpire === Infinity ? Infinity : nextExpire + TIER_WINDOW_DAYS * 86400_000].filter((n) => isFinite(n));
    const tierExpiresAt = dropCandidates.length ? new Date(Math.min(...dropCandidates)).toISOString() : undefined;

    const next: Contact = { ...contact, tierPoints, tierPointsAt: new Date(now).toISOString() };
    if (tierExpiresAt) next.tierExpiresAt = tierExpiresAt; else delete next.tierExpiresAt;
    if (!isNaN(graceUntil)) { next.tierGraceUntil = new Date(graceUntil).toISOString(); next.tierGracePoints = gracePoints; }
    await sb.from("contacts").update({ data: next }).eq("id", contactId);
  } catch {
    /* fire-and-forget */
  }
}

/** คำนวณระดับใหม่ให้ผู้ติดต่อทุกคนที่มีแต้ม/เครดิตระดับ — เรียกจาก cron รายวัน (จัดการเรื่องแต้มหมดอายุตามเวลา) */
export async function recomputeAllTiers(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>): Promise<{ scanned: number }> {
  let scanned = 0;
  let from = 0;
  const PAGE = 500;
  for (;;) {
    const { data, error } = await sb
      .from("contacts")
      .select("id")
      .or("data->point.gt.0,data->tierPoints.gt.0,data->>tierGraceUntil.not.is.null")
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data) {
      await recomputeTier(sb, r.id as string);
      scanned++;
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { scanned };
}
