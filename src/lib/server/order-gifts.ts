import { giftSummary, giftsFor, giftsToOrder, type GiftPromo, type OrderGift } from "@/lib/gifts";
import type { Order } from "@/lib/admin-data";
import type { getSupabaseAdmin } from "./supabase-admin";

type Sb = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

// id เรคอร์ดตั้งค่าร้าน (ตรงกับ SETTINGS_ID ใน shop-settings ซึ่งเป็น "use client")
const SETTINGS_ROW = "__shop_payment__";

export interface GiftSyncChange {
  name: string;
  from: number;
  to: number;
  /** สรุปหลังปรับ เช่น "แพ็กเกจรองหลัง (7 × 7 cm) ×96 + ซองใส-หลังขาว ×4" */
  note: string;
}

/**
 * 🎁 ของแถมฟรีตามจำนวนชิ้น ต้องคิดจาก "รายการทั้งใบ" ไม่ใช่เฉพาะรอบที่สั่งครั้งแรก
 *
 * เจอจริง 8 ต.ค. 69 (OD-261006-8507): พวงกุญแจ 80 ชิ้น ได้แพ็กเกจรองหลัง 80 (พิมพ์ 72 + ซองใส 8)
 * ลูกค้ากด "สั่งเพิ่มในออเดอร์นี้" อีก 20 ชิ้น → ของแถมยังค้าง 80 เพราะ /api/orders/append ไม่ได้คิดของแถมซ้ำ
 * (คิดครั้งเดียวที่ /api/orders ตอนสั่งครั้งแรก) ทั้งที่ 100 ชิ้นต้องได้ 100 (พิมพ์ 96 + ซองใส 4)
 *
 * กติกา:
 * - คิดด้วยสมองเดียวกับตอนสั่งครั้งแรก (giftsFor + giftsToOrder) จากรายการสินค้าทั้งใบ
 * - โปรเดิมที่มีอยู่ในใบ: ปรับเฉพาะ "จำนวน" (qty/printedQty/fallbackQty) — ขนาดที่เลือก · ลายที่แนบ · แบบที่ส่งตรวจ ·
 *   ผลอนุมัติ คงไว้ทั้งหมด (ลายเดิม แค่พิมพ์เพิ่ม ไม่ต้องให้ลูกค้าอนุมัติใหม่)
 * - **เพิ่มอย่างเดียว ไม่ลด** — ของแถมที่แจ้งลูกค้าไปแล้วห้ามหายเอง (ใบที่ของถูกลบให้แอดมินดูเอง)
 * - โปรที่เพิ่งเข้าเงื่อนไขเพราะยอดรวมถึง → เพิ่มเป็นรายการใหม่ (ขนาดตัวแรกของโปร ยังไม่มีลาย)
 * - ตัวแทนจำหน่าย/ใบเคลม ไม่ได้ของแถม (กติกาเดียวกับ /api/orders)
 */
export async function syncOrderGifts(sb: Sb, order: Order): Promise<{ order: Order; changed: GiftSyncChange[] }> {
  if (order.dealer || order.claimOf) return { order, changed: [] };
  const items = (order.items ?? []).filter((it) => !!it.productId && !it.productId.includes("#") && it.qty > 0);
  if (!items.length) return { order, changed: [] };

  const ids = [...new Set(items.map((i) => i.productId))];
  const [settRes, prodRes] = await Promise.all([
    sb.from("products").select("data").eq("id", SETTINGS_ROW).maybeSingle(),
    sb.from("products").select("id,category").in("id", ids),
  ]);
  const promos = ((settRes.data?.data as { gifts?: GiftPromo[] } | undefined)?.gifts ?? []).filter((g) => g?.id);
  if (!promos.length) return { order, changed: [] };
  const cat = new Map(((prodRes.data ?? []) as { id: string; category: string | null }[]).map((r) => [String(r.id), String(r.category ?? "")]));

  const cur = [...(order.gifts ?? [])];
  const chosen: Record<string, string> = {};
  const art: Record<string, string[]> = {};
  for (const g of cur) {
    if (g.size) chosen[g.promoId] = g.size;
    if (g.artworkUrls?.length) art[g.promoId] = g.artworkUrls;
  }
  const fresh = giftsToOrder(
    giftsFor(
      items.map((i) => ({ productId: i.productId, qty: i.qty, selections: i.sel })),
      (id) => cat.get(id),
      promos
    ),
    chosen,
    art
  );

  const changed: GiftSyncChange[] = [];
  for (const g of fresh) {
    const k = cur.findIndex((x) => x.promoId === g.promoId);
    if (k < 0) {
      cur.push(g);
      changed.push({ name: g.name, from: 0, to: g.qty, note: giftSummary([g]) });
      continue;
    }
    const old = cur[k];
    if (g.qty <= old.qty) continue; // เพิ่มอย่างเดียว
    // คงทุกอย่างของเดิม (ลาย/แบบ/ผลตรวจ/ขนาด) เปลี่ยนเฉพาะจำนวน — ช่องเศษแผ่นถอดออกถ้ารอบนี้ลงตัวพอดี
    const { printedQty: _p, fallbackQty: _f, fallbackName: _n, ...keep } = old;
    void _p;
    void _f;
    void _n;
    const next: OrderGift = {
      ...keep,
      qty: g.qty,
      ...(g.fallbackQty ? { printedQty: g.printedQty, fallbackQty: g.fallbackQty, fallbackName: g.fallbackName } : {}),
    };
    cur[k] = next;
    changed.push({ name: g.name, from: old.qty, to: g.qty, note: giftSummary([next]) });
  }
  return changed.length ? { order: { ...order, gifts: cur }, changed } : { order, changed: [] };
}

/** สรุปสั้น ๆ ไว้เขียน log — "แพ็กเกจรองหลัง 80 → 100 ชุด (แพ็กเกจรองหลัง (7 × 7 cm) ×96 + ซองใส-หลังขาว ×4)" */
export function giftSyncNote(changed: GiftSyncChange[]): string {
  return changed.map((c) => `${c.name} ${c.from.toLocaleString()} → ${c.to.toLocaleString()} ชุด (${c.note})`).join(" · ");
}
