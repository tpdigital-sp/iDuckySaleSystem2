import type { Contact } from "@/lib/contacts";
import type { Quote } from "@/lib/quotes";
import { lockedTier, seedTierStatus, tiersOf, type Tier, type TierStatus } from "@/lib/tiers";
import type { getSupabaseAdmin } from "./supabase-admin";

type SB = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
const SETTINGS_ROW = "__shop_payment__";

/**
 * 🏅 ส่วนลดระดับสมาชิกบนใบเสนอราคา
 *
 * ทำไมต้องมี: ใบเสนอราคาเคยมีแค่ช่อง "ส่วนลด" ให้แอดมินกรอกเอง ลูกค้าระดับ Diamond เปิดลิงก์แล้วไม่เห็น 12% ของตัวเอง
 * (QT-260908-8047, 8 ก.ย. 69) ทั้งที่สั่งเองจากเว็บได้ลดทุกครั้ง → เก็บ % ของระดับลงใบตอนผูกผู้ติดต่อ
 * กติกาเดียวกับ /api/orders: อ่านระดับที่ล็อกอยู่ (tierLevel) · ยังไม่ซีดประเมินจากแต้มเดิม · ตัวแทนจำหน่ายไม่ได้
 */
export async function memberTierOfContact(sb: SB, contactId: string): Promise<Quote["memberTier"] | undefined> {
  const [settRes, contactRes] = await Promise.all([
    sb.from("products").select("data").eq("id", SETTINGS_ROW).maybeSingle(),
    sb.from("contacts").select("data").eq("id", contactId).maybeSingle(),
  ]);
  const contact = contactRes.data?.data as Contact | undefined;
  if (!contact || contact.customerType === "dealer") return undefined;
  const configured = ((settRes.data?.data as { tiers?: Tier[] } | undefined)?.tiers ?? []).filter((t) => t.name?.trim());
  const tiers = tiersOf(configured.length ? configured : null);
  const status: TierStatus = contact.tierLevel
    ? { levelId: contact.tierLevel, anchor: contact.tierAnchor, cycleSpend: contact.tierCycleSpend }
    : seedTierStatus(Number(contact.point) || 0, contact.importedAt, tiers);
  const tier = lockedTier(status, tiers);
  if (!(tier.discountPct > 0)) return undefined;
  return { id: tier.id, name: tier.name, icon: tier.icon, pct: tier.discountPct };
}

/**
 * เติม/ล้าง memberTier ให้ตรงกับผู้ติดต่อที่ผูกอยู่ — เรียกทุกครั้งที่บันทึกหรือเปิดใบที่ยังไม่เป็นออเดอร์
 * ไม่มี contactId → ล้างทิ้ง (ยกเลิกผูกแล้วส่วนลดต้องหายตาม) · อ่านฐานพลาด → คงค่าเดิมไว้ ไม่ทำใบพัง
 */
export async function syncQuoteMemberTier(sb: SB, quote: Quote): Promise<Quote> {
  if (quote.orderId) return quote;
  if (!quote.contactId) {
    if (!quote.memberTier) return quote;
    const { memberTier: _drop, ...rest } = quote;
    void _drop;
    return rest;
  }
  try {
    const tier = await memberTierOfContact(sb, quote.contactId);
    if (!tier) {
      if (!quote.memberTier) return quote;
      const { memberTier: _drop, ...rest } = quote;
      void _drop;
      return rest;
    }
    return { ...quote, memberTier: tier };
  } catch {
    return quote;
  }
}
