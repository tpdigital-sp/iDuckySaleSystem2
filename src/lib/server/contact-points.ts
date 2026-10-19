import "server-only";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderTotal, type Order } from "@/lib/admin-data";
import { applyEarn, applyRenewal, applyRevoke, lockedTier, seedTierStatus, tiersOf, type Tier, type TierStatus } from "@/lib/tiers";
import { normalizePhone, type Contact } from "@/lib/contacts";
import { syncContacts } from "@/lib/server/contacts-sync";

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
type Sb = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/** การ์ดที่ผูกบัญชีสมาชิกนี้ไว้ (memberId) — ใบเดียวกับที่หน้า /account อ่าน "ยอดสะสมทั้งหมด" */
async function memberContact(sb: Sb, memberId: string): Promise<ContactRow | null> {
  const { data } = await sb.from("contacts").select("id,data").eq("data->>memberId", memberId).limit(1).maybeSingle();
  return (data as ContactRow | null) ?? null;
}

/**
 * หาผู้ติดต่อของออเดอร์:
 *   1) ผูกไว้ (contactId) ใช้ตัวนั้น
 *   2) ลูกค้าล็อกอินสั่งเอง (customerId) → การ์ดที่ถือ memberId ของบัญชีนั้น
 *      ยังไม่มีการ์ด (สมัครแล้วจ่ายก่อนหลังบ้านซิงก์) → ซิงก์ให้มีการ์ดก่อนแล้วหาใหม่
 *      เดิมข้อนี้ไม่มี — ใบสมาชิกไปจับคู่จากเบอร์อย่างเดียว ไม่เจอ/เจอหลายใบ = แต้มหายเงียบ
 *      ต่อมาซิงก์สร้างการ์ดสมาชิกแต้ม 0 → หน้า /account โชว์ยอดสะสม ฿0 ทั้งที่จ่ายแล้ว (พนักงานแจ้ง 19 ต.ค. 69 · OD-261001-2510)
 *   3) จับคู่จากเบอร์โทร ต้องเจอ "คนเดียวเท่านั้น" ถึงใช้ (เจอหลายคน = ไม่เดา กันแต้มเข้าผิดคน)
 */
async function contactForOrder(sb: Sb, order: Order): Promise<ContactRow | null> {
  if (order.contactId) {
    const { data } = await sb.from("contacts").select("id,data").eq("id", order.contactId).maybeSingle();
    return (data as ContactRow | null) ?? null;
  }
  if (order.customerId) {
    const mine = await memberContact(sb, order.customerId);
    if (mine) return mine;
    try {
      await syncContacts(sb, { force: true });
      const synced = await memberContact(sb, order.customerId);
      if (synced) return synced;
    } catch {
      /* ซิงก์พัง — ลองจับคู่จากเบอร์ต่อ */
    }
  }
  const phone = normalizePhone(order.phone);
  if (!/^0\d{8,9}$/.test(phone)) return null;
  const { data } = await sb.from("contacts").select("id,data").eq("data->>phone", phone).limit(5);
  // การ์ดนำเข้าที่ไม่มีชื่อจริง (เช่น ".") ไม่มีแต้ม ไม่นับเป็น "อีกคน" — เดิมเบอร์ที่มีการ์ดแบบนี้ซ้อนอยู่ไม่ได้แต้มเลย (#357/#7940 · OD-261014-3893)
  // ใบของสมาชิก: การ์ดที่ผูกบัญชีสมาชิก "คนอื่น" ไว้แล้วไม่ใช่ของใบนี้ (ใบ guest ยังเข้าการ์ดสมาชิกได้ตามเดิม)
  const rows = ((data ?? []) as ContactRow[]).filter(
    (r) =>
      (/[ก-๙A-Za-z0-9]{2,}/.test(r.data?.name ?? "") || Number(r.data?.point) > 0) &&
      !(order.customerId && r.data?.memberId && r.data.memberId !== order.customerId)
  );
  return rows.length === 1 ? rows[0] : null;
}

type AwardRow = { id: string; contact_id: string; point: number };

/**
 * แถว "บวกแต้ม" ของออเดอร์นี้ที่ยังไม่ถูกคืน (ทุกการ์ด) — id รูปแบบ `<contactId>:od:<orderId>` หรือ `…:<n>` (บวกซ้ำหลังย้ายกลับ)
 * แถวคืนแต้มคือ `<award id>:คืน`
 */
async function activeAwards(sb: Sb, orderId: string): Promise<AwardRow[]> {
  const { data } = await sb.from("contact_points").select("id,contact_id,data").like("id", `%:od:${orderId}%`);
  const rows = (data ?? []) as { id: string; contact_id: string; data: { point?: number; orderId?: string } }[];
  const revoked = new Set(rows.filter((r) => r.id.endsWith(":คืน")).map((r) => r.id.slice(0, -":คืน".length)));
  return rows
    .filter((r) => !r.id.endsWith(":คืน") && !revoked.has(r.id) && (r.data?.orderId ?? orderId) === orderId)
    .map((r) => ({ id: r.id, contact_id: String(r.contact_id), point: Number(r.data?.point) || 0 }));
}

/** ถอนแต้มของแถวบวกแต้มหนึ่งแถว (ลงแถว `:คืน` + ลด point/ระดับของการ์ดนั้น) */
async function revokeAward(sb: Sb, award: AwardRow, orderId: string, note: string): Promise<void> {
  if (award.point <= 0) return;
  const { error: insErr } = await sb.from("contact_points").insert({
    id: `${award.id}:คืน`,
    contact_id: award.contact_id,
    data: { at: nowThai(), action: "ลบคะแนนสะสม", point: -award.point, orderId, note },
  });
  if (insErr) return; // คืนไปแล้ว (แข่งกันเข้า)
  const { data } = await sb.from("contacts").select("id,data").eq("id", award.contact_id).maybeSingle();
  const contact = (data as ContactRow | null)?.data;
  if (!contact) return;
  const point = round2(Math.max(0, (Number(contact.point) || 0) - award.point));
  const tiers = await loadTiers(sb);
  const next = applyRevoke(ensureSeeded(contact, tiers), award.point, tiers);
  await sb.from("contacts").update({ data: { ...contact, point, tierLevel: next.levelId, tierAnchor: next.anchor, tierCycleSpend: next.cycleSpend } }).eq("id", award.contact_id);
}

/**
 * ออเดอร์ชำระครบ → บวกแต้มให้ผู้ติดต่อ (idempotent ต่อออเดอร์) — fire-and-forget
 *
 * 🔁 ใบที่เคยบวกแต้มให้ "การ์ดอื่น" ไปแล้ว:
 *   - ใบผูก contactId ไว้ (แอดมินเลือกเอง/เปลี่ยนผู้ติดต่อ) → ย้ายแต้มจากการ์ดเดิมมาการ์ดนี้
 *     (OD-261002-6439 · 14 ต.ค. 69: ใบสร้างโดยเลือกการ์ด ฐิติมา ไว้ แล้วพิมพ์ชื่อ/เบอร์ลูกค้าคนใหม่ทับ → แต้ม 820 เข้าผิดคน
 *      มาเปลี่ยนผู้ติดต่อทีหลังก็ไม่ย้าย เพราะเดิมเจอแถวของการ์ดอื่นแล้วข้ามเงียบ)
 *   - ใบไม่ผูก (จับคู่จากเบอร์เอา) → ไม่แตะ ไม่เดาย้ายเอง
 */
export async function awardPointsForOrder(order: Order): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return;
    const total = orderTotal(order);
    const amount = round2(total / BAHT_PER_POINT);
    if (amount <= 0) return;
    const hit = await contactForOrder(sb, order);
    if (!hit) return;

    const active = await activeAwards(sb, order.id);
    if (active.some((a) => a.contact_id === hit.id)) return; // การ์ดนี้ได้ไปแล้ว
    if (active.length) {
      if (!order.contactId) return;
      for (const a of active) await revokeAward(sb, a, order.id, `ย้ายแต้มไปผู้ติดต่อ #${hit.id} (เปลี่ยนผู้ติดต่อของออเดอร์)`);
    }

    // id ตายตัวต่อออเดอร์ = กันบวกซ้ำตอน SlipOK + แอดมินกดพร้อมกัน · เคยบวกแล้วถูกคืน (ย้ายออกแล้วย้ายกลับ) → ต่อท้ายเลข
    let logId = `${hit.id}:od:${order.id}`;
    const { data: used } = await sb.from("contact_points").select("id").like("id", `${logId}%`);
    const taken = new Set(((used ?? []) as { id: string }[]).map((r) => r.id));
    if (taken.has(logId)) {
      let n = 2;
      while (taken.has(`${logId}:${n}`)) n++;
      logId = `${logId}:${n}`;
    }
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

/**
 * ออเดอร์ถูกยกเลิก → คืนแต้มที่เคยบวกจากออเดอร์นี้ (idempotent) — fire-and-forget
 * หาจากแถวที่บวกไว้จริง ไม่ใช่จากผู้ติดต่อปัจจุบัน — ผูกการ์ดเปลี่ยนไปหลังบวกแล้ว ก็ยังคืนถูกการ์ด
 */
export async function revokePointsForOrder(order: Order): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return;
    for (const a of await activeAwards(sb, order.id)) await revokeAward(sb, a, order.id, "ยกเลิกออเดอร์ — คืนแต้มที่บวกไว้");
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
