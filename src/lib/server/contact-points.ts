import "server-only";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderTotal, type Order } from "@/lib/admin-data";
import { applyEarn, applyRenewal, applyRevoke, lockedTier, seedTierStatus, tiersOf, type Tier, type TierStatus } from "@/lib/tiers";
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
    // อัปเดตสถานะระดับ (status-lock): บวกยอดเข้ารอบ + เช็คขึ้นระดับ
    const tiers = await loadTiers(sb);
    const seeded = ensureSeeded(contact, tiers);
    const next = applyEarn(seeded, amount, tiers);
    await sb.from("contacts").update({ data: { ...contact, point, pointActive: true, tierLevel: next.levelId, tierAnchor: next.anchor, tierCycleSpend: next.cycleSpend } }).eq("id", hit.id);
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
    const tiers = await loadTiers(sb);
    const seeded = ensureSeeded(contact, tiers);
    const next = applyRevoke(seeded, amount, tiers);
    await sb.from("contacts").update({ data: { ...contact, point, tierLevel: next.levelId, tierAnchor: next.anchor, tierCycleSpend: next.cycleSpend } }).eq("id", hit.id);
  } catch {
    /* fire-and-forget */
  }
}


/* ── สถานะระดับสมาชิก (status-lock) ─────────────────────────────
 * ดูกติกาเต็มใน lib/tiers.ts · ที่นี่คือส่วนที่ "เขียนสถานะลงฐาน"
 *   - award/revoke: อัปเดต tierLevel/tierAnchor/tierCycleSpend ตอนออเดอร์จ่าย/ยกเลิก (ข้างบน)
 *   - runRenewals: cron รายวัน ทบทวนคนที่ครบรอบปี → ต่ออายุ/ลด 1 ขั้น
 */

const SETTINGS_ROW = "__shop_payment__";

/** โหลดระดับสมาชิกที่ตั้งไว้ในหน้า /admin/settings (เก็บใน products row __settings__) */
async function loadTiers(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>): Promise<Tier[]> {
  try {
    const { data } = await sb.from("products").select("data").eq("id", SETTINGS_ROW).maybeSingle();
    const list = ((data?.data as { tiers?: Tier[] } | undefined)?.tiers ?? []).filter((t) => t.name?.trim());
    return tiersOf(list.length ? list : null);
  } catch {
    return tiersOf(null);
  }
}

/** อ่านสถานะระดับปัจจุบันของ contact — ยังไม่มี = สร้างตั้งต้นจากยอดสะสมเดิม (ยกยอดลูกค้าเก่า) */
function ensureSeeded(contact: Contact, tiers: Tier[]): TierStatus {
  if (contact.tierLevel) return { levelId: contact.tierLevel, anchor: contact.tierAnchor, cycleSpend: contact.tierCycleSpend };
  return seedTierStatus(Number(contact.point) || 0, contact.importedAt, tiers);
}

/**
 * cron รายวัน — ทบทวนระดับลูกค้าที่ครบรอบปี (ต่ออายุ หรือ ลด 1 ขั้น)
 * ครอบเฉพาะคนที่มีสถานะระดับหรือมีแต้ม (ไม่ต้องไล่ทั้ง 28,000 ราย)
 */
export async function runTierRenewals(sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>): Promise<{ scanned: number; renewed: number; dropped: number; seeded: number }> {
  const tiers = await loadTiers(sb);
  let scanned = 0, renewed = 0, dropped = 0, seeded = 0;
  let from = 0;
  const PAGE = 500;
  for (;;) {
    const { data, error } = await sb
      .from("contacts")
      .select("id,data")
      .or("data->point.gt.0,data->>tierLevel.not.is.null")
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const row of data) {
      scanned++;
      const contact = row.data as Contact;
      let status: TierStatus;
      if (!contact.tierLevel) {
        status = seedTierStatus(Number(contact.point) || 0, contact.importedAt, tiers);
        seeded++;
      } else {
        status = { levelId: contact.tierLevel, anchor: contact.tierAnchor, cycleSpend: contact.tierCycleSpend };
      }
      const r = applyRenewal(status, tiers);
      const finalStatus = r.status;
      if (r.changed) dropped++;
      else if (r.renewed) renewed++;
      // เขียนกลับเมื่อมีอะไรเปลี่ยน (เพิ่งซีด / ต่ออายุ / ลดระดับ)
      if (!contact.tierLevel || r.changed || r.renewed) {
        await sb.from("contacts").update({ data: { ...contact, tierLevel: finalStatus.levelId, tierAnchor: finalStatus.anchor, tierCycleSpend: finalStatus.cycleSpend } }).eq("id", row.id as string);
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { scanned, renewed, dropped, seeded };
}

/** ระดับที่ล็อกอยู่ของ contact (เผื่อยังไม่ซีด ใช้ยอดสะสมเดิมประเมิน) — ไว้ให้ API อื่นเรียก */
export function contactTier(contact: Contact, tiers: Tier[]) {
  return lockedTier(ensureSeeded(contact, tiers), tiers);
}
