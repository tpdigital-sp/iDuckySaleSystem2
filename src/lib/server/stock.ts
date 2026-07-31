import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/server/firebase-admin";
import type { Order } from "@/lib/admin-data";

/**
 * คลังสต๊อกวัสดุ (ระบบกลาง 3 ระบบใช้ร่วม):
 *  - iDucky ขาย → ตัดอัตโนมัติตอน "ชำระแล้ว" · ยกเลิก → คืน
 *  - TP-Leader (พอร์ต 8080) subtab "เบิกวัสดุผลิต" → ฝั่งผลิตเบิก/เบิกทำเสีย ตัดทันที
 *  - หน้า /admin/stock → นำเข้า / นับจริง / สถิติ
 *
 * เก็บใน Firestore โปรเจกต์ tpdigital-iducky database "tp-fixflow" (ตัวเดียวกับที่หน้า TP-Leader ใช้)
 * หลักการ: ยอดคงเหลือแก้ผ่าน transaction + ทุกการเปลี่ยนมีแถวใน stockMoves (ledger) เสมอ
 */

export const STOCK_ITEMS = "stockItems";
export const STOCK_MOVES = "stockMoves";

export interface StockItem {
  id: string;
  name: string;
  /** หน่วยนับ เช่น ชิ้น, แผ่น, กล่อง */
  unit: string;
  category?: string;
  /** ยอดคงเหลือ (ดูแลผ่าน transaction เท่านั้น) */
  balance: number;
  /** เหลือ ≤ เท่านี้ = ถึงจุดต้องสั่งของ (ใช้แจ้งเตือน LINE) */
  reorderPoint?: number;
  /** สั่งแล้วกี่วันของถึง (ไว้คำนวณจุดสั่งแนะนำ) */
  leadTimeDays?: number;
  /** productId ของสินค้า iDucky ที่ตัดสต๊อกตัวนี้ตอนขาย (คั่นได้หลายตัว) */
  productIds?: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type StockReason = "นำเข้า" | "ขาย" | "คืน-ยกเลิก" | "เบิกผลิต" | "เบิกทำเสีย" | "ปรับยอดนับจริง" | "อื่นๆ";

export interface StockMove {
  itemId: string;
  itemName: string;
  /** + เพิ่ม / − ลด */
  qty: number;
  reason: StockReason;
  note?: string;
  refOrderId?: string;
  by: string;
  source: "iducky" | "tp-withdraw";
  at: string;
  balanceAfter: number;
}

/** db เดียวกับหน้า TP-Leader (tpdigital-iducky / database "tp-fixflow") — subtab เบิกของคุยตรงได้ */
export function getStockDb(): Firestore | null {
  return getFirestoreAdmin();
}

export async function listStock(): Promise<{ items: StockItem[]; moves: (StockMove & { id: string })[] }> {
  const db = getStockDb();
  if (!db) return { items: [], moves: [] };
  const [itemsSnap, movesSnap] = await Promise.all([
    db.collection(STOCK_ITEMS).get(),
    db.collection(STOCK_MOVES).orderBy("at", "desc").limit(400).get(),
  ]);
  const items = itemsSnap.docs
    .map((d) => d.data() as StockItem)
    .filter((i) => i.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
  const moves = movesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as StockMove) }));
  return { items, moves };
}

export async function saveStockItem(input: Partial<StockItem> & { name: string }): Promise<StockItem> {
  const db = getStockDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  const now = new Date().toISOString();
  const id = input.id || `sku-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const ref = db.collection(STOCK_ITEMS).doc(id);
  const cur = (await ref.get()).data() as StockItem | undefined;
  const item: StockItem = {
    id,
    name: input.name.trim(),
    unit: (input.unit ?? cur?.unit ?? "ชิ้น").trim() || "ชิ้น",
    category: input.category?.trim() || cur?.category,
    balance: cur?.balance ?? 0, // ยอดแก้ผ่าน move เท่านั้น
    reorderPoint: input.reorderPoint ?? cur?.reorderPoint,
    leadTimeDays: input.leadTimeDays ?? cur?.leadTimeDays,
    productIds: input.productIds ?? cur?.productIds ?? [],
    active: input.active ?? cur?.active ?? true,
    createdAt: cur?.createdAt ?? now,
    updatedAt: now,
  };
  await ref.set(item);
  return item;
}

/** เดินสต๊อก 1 รายการแบบ atomic — คืนยอดหลังเดิน */
export async function addStockMove(input: {
  itemId: string;
  qty: number;
  reason: StockReason;
  note?: string;
  refOrderId?: string;
  by: string;
  source: StockMove["source"];
}): Promise<{ balanceAfter: number; itemName: string }> {
  const db = getStockDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  if (!Number.isFinite(input.qty) || input.qty === 0) throw new Error("จำนวนไม่ถูกต้อง");
  const itemRef = db.collection(STOCK_ITEMS).doc(input.itemId);
  const moveRef = db.collection(STOCK_MOVES).doc();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists) throw new Error("ไม่พบรายการสต๊อกนี้");
    const item = snap.data() as StockItem;
    const balanceAfter = (item.balance ?? 0) + input.qty;
    const move: StockMove = {
      itemId: input.itemId,
      itemName: item.name,
      qty: input.qty,
      reason: input.reason,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      ...(input.refOrderId ? { refOrderId: input.refOrderId } : {}),
      by: input.by,
      source: input.source,
      at: new Date().toISOString(),
      balanceAfter,
    };
    tx.update(itemRef, { balance: balanceAfter, updatedAt: move.at });
    tx.set(moveRef, move);
    return { balanceAfter, itemName: item.name };
  });
}

/** ออเดอร์ชำระแล้ว → ตัดสต๊อกรายการที่ถูกผูกไว้ (idempotent ต่อออเดอร์) — fire-and-forget */
export async function cutStockForOrder(order: Order): Promise<void> {
  try {
    const db = getStockDb();
    if (!db) return;
    // เคยตัดออเดอร์นี้แล้ว → ข้าม (กันยิงซ้ำจาก SlipOK + แอดมินกดเปลี่ยนสถานะ)
    const dup = await db.collection(STOCK_MOVES).where("refOrderId", "==", order.id).where("reason", "==", "ขาย").limit(1).get();
    if (!dup.empty) return;
    const itemsSnap = await db.collection(STOCK_ITEMS).get();
    const stockItems = itemsSnap.docs.map((d) => d.data() as StockItem).filter((i) => i.active !== false);
    for (const oi of order.items) {
      const hit = stockItems.find((si) => (si.productIds ?? []).includes(oi.productId));
      if (!hit) continue; // สินค้าที่ไม่ได้ผูกสต๊อก — ไม่ตัด
      await addStockMove({
        itemId: hit.id,
        qty: -Math.abs(oi.qty),
        reason: "ขาย",
        note: oi.name,
        refOrderId: order.id,
        by: "ระบบ (ขายอัตโนมัติ)",
        source: "iducky",
      });
    }
  } catch (e) {
    console.error("[stock] ตัดสต๊อกออเดอร์ไม่สำเร็จ:", (e as Error)?.message);
  }
}

/** ออเดอร์ถูกยกเลิก → คืนสต๊อกที่เคยตัดไว้ (idempotent) — fire-and-forget */
export async function restoreStockForOrder(order: Order): Promise<void> {
  try {
    const db = getStockDb();
    if (!db) return;
    const [cuts, restores] = await Promise.all([
      db.collection(STOCK_MOVES).where("refOrderId", "==", order.id).where("reason", "==", "ขาย").get(),
      db.collection(STOCK_MOVES).where("refOrderId", "==", order.id).where("reason", "==", "คืน-ยกเลิก").limit(1).get(),
    ]);
    if (cuts.empty || !restores.empty) return;
    for (const d of cuts.docs) {
      const m = d.data() as StockMove;
      await addStockMove({
        itemId: m.itemId,
        qty: Math.abs(m.qty),
        reason: "คืน-ยกเลิก",
        note: m.note,
        refOrderId: order.id,
        by: "ระบบ (คืนจากยกเลิก)",
        source: "iducky",
      });
    }
  } catch (e) {
    console.error("[stock] คืนสต๊อกออเดอร์ไม่สำเร็จ:", (e as Error)?.message);
  }
}
