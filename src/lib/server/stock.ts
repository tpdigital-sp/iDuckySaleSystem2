import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/server/firebase-admin";
import type { Order } from "@/lib/admin-data";
import type { OptionPreset } from "@/lib/option-presets";
import type { ProductOption } from "@/lib/products";
import { planStockCuts } from "@/lib/stock-cut";

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
  /** รหัสสั้นอ่านออก (THREAD-1803, CASE-15PM-MS) — ติดป้ายชั้นวาง/พูดกันได้ · ไม่เปลี่ยนแม้ชื่อเปลี่ยน */
  code?: string;
  /**
   * ชื่ออื่นที่คนเคยเรียกของตัวนี้ — ใช้ค้นหาให้เจอโดยไม่ต้องบังคับให้ทุกคนพิมพ์เหมือนกัน
   * (พนักงานพิมพ์ "Gtดำ" หรือ "GT ดำ" ก็ต้องเจอ SKU ตัวเดียวกัน)
   */
  aliases?: string[];
  /** ตระกูลที่ SKU นี้อยู่ (กล่อง, เคสมือถือ, สีไหม) — ไว้จัดกลุ่มในหน้าแอดมิน */
  family?: string;
  /** ระบบสร้างเองจากชื่อที่พนักงานพิมพ์ ยังไม่มีคนตรวจ */
  autoCreated?: boolean;
  needsReview?: boolean;
  /** อาจซ้ำกับ SKU รหัสนี้ — ระบบเตือนไว้ ไม่ยุบให้เอง (ยุบผิดย้อนกลับไม่ได้) */
  maybeDuplicateOf?: string;
  /** หน่วยนับ เช่น ชิ้น, แผ่น, กล่อง */
  unit: string;
  category?: string;
  /** ยอดคงเหลือ (ดูแลผ่าน transaction เท่านั้น) */
  balance: number;
  /** เหลือ ≤ เท่านี้ = ถึงจุดต้องสั่งของ (ใช้แจ้งเตือน LINE) */
  reorderPoint?: number;
  /** สั่งแล้วกี่วันของถึง (ไว้คำนวณจุดสั่งแนะนำ) */
  leadTimeDays?: number;
  /**
   * 💰 ราคาทุนต่อหน่วย (บาท) — ของที่ซื้อเข้ามาชิ้นนี้จ่ายไปเท่าไหร่
   * ใช้ 2 อย่าง: มูลค่าของในคลัง (คงเหลือ × ทุน) และต้นทุนวัสดุต่อออเดอร์ในหน้ารายงาน
   * ⚠️ แก้ตัวนี้แล้ว "ไม่" ย้อนไปเปลี่ยนต้นทุนของที่ขายไปแล้ว — ทุกครั้งที่เดินสต๊อกจะแช่ทุน ณ ตอนนั้นไว้ในแถว ledger
   *    (ของขึ้นราคาแล้วกำไรเดือนก่อนต้องไม่ขยับตาม)
   */
  unitCost?: number;
  /** productId ของสินค้า iDucky ที่ตัดสต๊อกตัวนี้ตอนขาย (คั่นได้หลายตัว) */
  productIds?: string[];
  /**
   * ชนิดของ เช่น "กรอบรูป" / "แผ่นจิ๊กซอว์" — หน้าคลังแบ่งกลุ่มย่อยในสินค้าตามค่านี้
   * (รับเข้า/เบิก/สั่งของทำเป็นชุดตามชนิด: สั่งแต่แผ่นจิ๊กซอว์เพราะกรอบยังมี)
   */
  part?: string;
  /**
   * 🔩 วัสดุแฝง — ของที่ทุกชิ้นของสินค้าใช้ แต่ไม่มีในตัวเลือก (ขาตั้ง หมุด ถุง) · { productId: จำนวนต่อสินค้า 1 ชิ้น }
   * แยกจาก productIds (= ตัวสินค้าเอง 1 ต่อ 1) เพราะปุ่ม "แยกตามตัวเลือก" ถอด productIds ทิ้ง แต่วัสดุแฝงต้องอยู่ต่อ
   * ใช้ร่วมหลายสินค้าได้ (หมุดตัวเดียวใส่หลายสินค้า) · ตั้งจากปุ่ม "＋ วัสดุแฝง" หน้า /admin/stock
   */
  bomFor?: Record<string, number>;
  /** 🖼 รูปวัสดุที่ตั้งเอง (URL) — ไม่ตั้งระบบเดารูปจากตัวเลือก/สินค้าที่ผูกให้ (ดู /api/admin/stock/images) */
  imageUrl?: string;
  active: boolean;
  /**
   * 🚫 ไม่ต้องมีสต๊อก — ของสั่งผลิตตามออเดอร์/ไม่เก็บของไว้ที่ร้าน · ยังอยู่ในคลัง (กู้กลับได้) แต่
   * ไม่เตือนต้องสั่ง ไม่นับมูลค่า ไม่ถูกตัดยอดตอนขาย (ไม่งั้นยอดติดลบไปเรื่อย ๆ โดยไม่มีความหมาย)
   */
  noStock?: boolean;
  /** ลบ = ปิดการใช้งาน (active=false) เก็บเอกสารไว้ให้ ledger ยังอ้างถึงได้ · เวลาที่กดลบ */
  deletedAt?: string;
  deletedBy?: string;
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
  /** ทุนต่อหน่วยของ SKU ณ วินาทีที่เดินสต๊อก (แช่ไว้ — แก้ทุนทีหลังไม่กระทบแถวเก่า) */
  unitCost?: number;
  /** มูลค่าของแถวนี้ = qty × unitCost (ติดลบ = ของออกจากคลัง) · ไม่มี = ตอนนั้นยังไม่ได้ใส่ทุนให้ SKU */
  cost?: number;
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

/** รายการ SKU อย่างเดียว ไม่ลากประวัติ 400 บรรทัดมาด้วย — ใช้กับงานที่สนแค่ "มี SKU อะไรบ้าง" */
export async function listStockItems(): Promise<StockItem[]> {
  const db = getStockDb();
  if (!db) return [];
  const snap = await db.collection(STOCK_ITEMS).get();
  return snap.docs.map((d) => d.data() as StockItem).filter((i) => i.active !== false);
}

/**
 * ชื่อที่เคยเรียก — เปลี่ยนชื่อ SKU แล้วเก็บชื่อเดิมไว้ให้เอง (คนยังจำชื่อเก่าอยู่ พิมพ์ค้นต้องเจอ · ตัวจับคู่ตัวเลือกก็ยังเห็น)
 */
function aliasesOf(input: Partial<StockItem> & { name: string }, cur: StockItem | undefined): string[] | undefined {
  const base = input.aliases ?? cur?.aliases ?? [];
  const oldName = cur?.name?.trim();
  const renamed = !!oldName && oldName !== input.name.trim();
  const out = renamed && !base.some((a) => a.trim() === oldName) ? [...base, oldName] : base;
  return out.length ? out : undefined;
}

/**
 * รหัสถัดไปของชุด prefix — "P-PHOTOFRAME-3-B" → P-PHOTOFRAME-3-B1, B2, … · "M" → M-0001, M-0002, …
 * นับจากรหัสที่มีอยู่จริง (รวมตัวที่ลบแล้ว กันออกรหัสซ้ำกับของเก่าในประวัติ)
 */
async function nextStockCode(db: Firestore, prefix: string): Promise<string> {
  const snap = await db.collection(STOCK_ITEMS).get();
  const codes = new Set(snap.docs.map((d) => String((d.data() as StockItem).code ?? "")));
  const numbered = prefix === "M";
  const re = numbered ? /^M-(\d+)$/ : new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`);
  let n = 0;
  for (const c of codes) {
    const m = re.exec(c);
    if (m) n = Math.max(n, Number(m[1]));
  }
  let code = "";
  do code = numbered ? `M-${String(++n).padStart(4, "0")}` : `${prefix}${++n}`;
  while (codes.has(code));
  return code;
}

/**
 * รหัสทุกตัวที่เคยออก "รวมตัวที่ลบแล้ว" — ออกรหัสใหม่ต้องเลี่ยงของเก่าในประวัติด้วย
 * (เคยเกิด 19 ก.ย. 69: แยกสต๊อกกระจกถือรอบ 2 ได้ P-MIRROR-HAND-1 ซ้ำกับตัวที่ลบไปแล้ว เพราะนับจาก listStockItems ที่กรองตัวลบออก)
 */
export async function allStockCodes(): Promise<Set<string>> {
  const db = getStockDb();
  if (!db) return new Set();
  const snap = await db.collection(STOCK_ITEMS).get();
  return new Set(snap.docs.map((d) => String((d.data() as StockItem).code ?? "")).filter(Boolean));
}

/** ตัวอักษรที่ใช้ในรหัสได้ — productId "photoframe-3" → "PHOTOFRAME-3" */
export function codeSlug(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase().slice(0, 24);
}

/**
 * บันทึก SKU · ไม่มีรหัส = ออกให้อัตโนมัติ (codePrefix ถ้าส่งมา เช่น วัสดุแฝง "P-PHOTOFRAME-3-B" · ไม่ส่ง = M-0001)
 * รหัสใช้ติดป้ายชั้นวาง/ค้นหา — ของไม่มีรหัสหาบนชั้นยาก (เจ้าของร้านขอ 19 ก.ย. 69)
 */
export async function saveStockItem(input: Partial<StockItem> & { name: string; codePrefix?: string }): Promise<StockItem> {
  const db = getStockDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  const now = new Date().toISOString();
  const id = input.id || `sku-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const ref = db.collection(STOCK_ITEMS).doc(id);
  const cur = (await ref.get()).data() as StockItem | undefined;
  const autoCode = !(input.code ?? cur?.code) ? await nextStockCode(db, input.codePrefix || "M") : undefined;
  const item: StockItem = {
    id,
    name: input.name.trim(),
    ...(autoCode ? { code: autoCode } : {}),
    // ฟิลด์ที่หน้าแก้ไขยังไม่มีช่องกรอก — ต้องคงของเดิมไว้ ไม่งั้นกดบันทึกทีเดียวหายหมด
    ...(input.code ?? cur?.code ? { code: input.code ?? cur?.code } : {}),
    ...(aliasesOf(input, cur) ? { aliases: aliasesOf(input, cur) } : {}),
    ...(input.family ?? cur?.family ? { family: input.family ?? cur?.family } : {}),
    ...(cur?.autoCreated ? { autoCreated: true } : {}),
    // แอดมินกดบันทึก = ถือว่าตรวจแล้ว → ปลดธงรอตรวจ
    ...(input.needsReview ? { needsReview: true } : {}),
    ...(cur?.maybeDuplicateOf && input.needsReview ? { maybeDuplicateOf: cur.maybeDuplicateOf } : {}),
    unit: (input.unit ?? cur?.unit ?? "ชิ้น").trim() || "ชิ้น",
    category: input.category?.trim() || cur?.category,
    balance: cur?.balance ?? 0, // ยอดแก้ผ่าน move เท่านั้น
    reorderPoint: input.reorderPoint ?? cur?.reorderPoint,
    leadTimeDays: input.leadTimeDays ?? cur?.leadTimeDays,
    unitCost: input.unitCost ?? cur?.unitCost,
    productIds: input.productIds ?? cur?.productIds ?? [],
    ...(cur?.noStock ? { noStock: true } : {}),
    ...(cur?.bomFor && Object.keys(cur.bomFor).length ? { bomFor: cur.bomFor } : {}), // ตั้งจากเส้นทาง bom แยก — แก้ไข SKU ต้องไม่ล้าง
    // ส่ง "" มา = ล้างชนิดของ · undefined = ไม่แตะ
    ...(((input.part !== undefined ? input.part : cur?.part) ?? "").trim() ? { part: ((input.part !== undefined ? input.part : cur?.part) ?? "").trim() } : {}), // ตั้งจากปุ่มแยก (setNoStock) — การแก้ไขทั่วไปต้องไม่ล้างธงนี้
    // ล้างช่อง = ส่ง "" มาลบรูปออก (undefined = ไม่แตะ)
    ...((input.imageUrl ?? cur?.imageUrl) ? { imageUrl: input.imageUrl ?? cur?.imageUrl } : {}),
    active: input.active ?? cur?.active ?? true,
    createdAt: cur?.createdAt ?? now,
    updatedAt: now,
  };
  // Firestore ไม่รับค่า undefined (เช่น ไม่กรอกหมวด/จุดสั่ง) → ตัดคีย์ทิ้งก่อนเขียน ไม่งั้น "เพิ่มวัสดุ" ล้มทั้งใบ
  const clean = Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined)) as StockItem;
  await ref.set(clean);
  return clean;
}

/**
 * ลบ SKU = ปิดการใช้งาน (soft delete) — ไม่ลบเอกสารทิ้ง เพราะ stockMoves/ต้นทุนในรายงานยังอ้าง itemId อยู่
 * listStock/cutStockForOrder กรอง active !== false อยู่แล้ว → หายจากทุกจอและไม่ถูกตัดขายอีก
 * คืน item ที่ปิดแล้ว (null = ไม่พบ)
 */
export async function deleteStockItem(id: string, by: string): Promise<StockItem | null> {
  const db = getStockDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  const ref = db.collection(STOCK_ITEMS).doc(id);
  const cur = (await ref.get()).data() as StockItem | undefined;
  if (!cur) return null;
  const now = new Date().toISOString();
  const next: StockItem = { ...cur, active: false, deletedAt: now, deletedBy: by, updatedAt: now };
  await ref.set(next);
  return next;
}

/** ตั้ง/ถอดวัสดุแฝงของสินค้า 1 ตัว — per = null/0 คือถอด · ใช้ FieldPath เพราะ productId เป็นคีย์ใน map */
export async function setBom(itemId: string, productId: string, per: number | null): Promise<StockItem | null> {
  const db = getStockDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  const { FieldPath, FieldValue } = await import("firebase-admin/firestore");
  const ref = db.collection(STOCK_ITEMS).doc(itemId);
  const cur = (await ref.get()).data() as StockItem | undefined;
  if (!cur || cur.active === false) return null;
  await ref.update(new FieldPath("bomFor", productId), per && per > 0 ? per : FieldValue.delete(), "updatedAt", new Date().toISOString());
  return (await ref.get()).data() as StockItem;
}

/** ตั้ง/ปลดธง "ไม่ต้องมีสต๊อก" ทีละหลายตัว (ปุ่มที่หัวกลุ่มสินค้ากดทีเดียวทั้งกลุ่ม) — คืนจำนวนที่เขียน */
export async function setNoStock(ids: string[], on: boolean): Promise<number> {
  const db = getStockDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  const { FieldValue } = await import("firebase-admin/firestore");
  const now = new Date().toISOString();
  let n = 0;
  // Firestore batch รับได้ 500 คำสั่ง — แบ่งก้อนเผื่อกลุ่มใหญ่
  for (let i = 0; i < ids.length; i += 400) {
    const batch = db.batch();
    for (const id of ids.slice(i, i + 400)) {
      batch.update(db.collection(STOCK_ITEMS).doc(id), { noStock: on ? true : FieldValue.delete(), updatedAt: now });
      n++;
    }
    await batch.commit();
  }
  return n;
}

/** ปลดป้าย "รอตรวจ" ทีละหลายตัว (ปุ่มตรวจแล้ว: รายแถว/ลิ้นชัก/ทั้งกลุ่มสินค้า) — คืนจำนวนที่เขียน */
export async function setReviewed(ids: string[], by: string): Promise<number> {
  const db = getStockDb();
  if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  const { FieldValue } = await import("firebase-admin/firestore");
  const now = new Date().toISOString();
  let n = 0;
  for (let i = 0; i < ids.length; i += 400) {
    const batch = db.batch();
    for (const id of ids.slice(i, i + 400)) {
      batch.update(db.collection(STOCK_ITEMS).doc(id), {
        needsReview: FieldValue.delete(),
        maybeDuplicateOf: FieldValue.delete(), // ตรวจแล้ว = ยืนยันว่าไม่ซ้ำ
        reviewedAt: now,
        reviewedBy: by,
        updatedAt: now,
      });
      n++;
    }
    await batch.commit();
  }
  return n;
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
    // 💰 แช่ทุน ณ ตอนนี้ลงแถว ledger — รายงานกำไรย้อนหลังต้องใช้ทุนของวันที่ขาย ไม่ใช่ทุนวันนี้
    const unitCost = Number.isFinite(item.unitCost) && (item.unitCost ?? 0) > 0 ? Number(item.unitCost) : undefined;
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
      ...(unitCost ? { unitCost, cost: Math.round(input.qty * unitCost * 100) / 100 } : {}),
    };
    tx.update(itemRef, { balance: balanceAfter, updatedAt: move.at });
    tx.set(moveRef, move);
    return { balanceAfter, itemName: item.name };
  });
}

/**
 * โหลดผัง "ตัวเลือกไหน → ตัด SKU ตัวไหน" ของสินค้าที่อยู่ในออเดอร์
 * คีย์เป็น `productId|label|ชื่อตัวเลือก` เพราะสินค้าคนละตัวใช้ label ซ้ำกันได้แต่ผูกคนละ SKU
 *
 * ตัวเลือกที่ลิงก์คลังกลาง (presetId) ถูกคลี่ด้วย resolveOptions ก่อน — ผูกที่คลังครั้งเดียว
 * ทุกสินค้าที่ลิงก์คลังนั้นจึงตัดสต๊อกตามไปเองโดยไม่ต้องแก้รายตัว
 */
async function loadOptionStockMap(productIds: string[]): Promise<Map<string, ProductOption[]>> {
  const out = new Map<string, ProductOption[]>();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !productIds.length) return out;
  const { createClient } = await import("@supabase/supabase-js");
  const { resolveOptions } = await import("@/lib/option-presets");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const [prods, presetRows] = await Promise.all([
    sb.from("products").select("id,data").in("id", productIds),
    sb.from("products").select("data").eq("category", "__presets__"),
  ]);
  const presets = (presetRows.data ?? []).map((r) => r.data as OptionPreset).filter((p) => p?.id);
  // คืนตัวเลือกที่คลี่คลังกลางแล้วทั้งชุด — planStockCuts ต้องเห็นชื่อตัวเลือกทุกค่าเพื่อแยก "A + B" ให้ถูก
  for (const row of prods.data ?? []) out.set(row.id, resolveOptions((row.data as { options?: ProductOption[] } | null)?.options ?? [], presets));
  return out;
}


/** ค่าที่ติ๊กได้หลายอย่างถูกเก็บรวมเป็นข้อความเดียวคั่นด้วย " + " — ต้องแยกก่อนไปหา SKU */

/** ออเดอร์ชำระแล้ว → ตัดสต๊อกรายการที่ถูกผูกไว้ (idempotent ต่อออเดอร์) — fire-and-forget */
export async function cutStockForOrder(order: Order): Promise<void> {
  try {
    const db = getStockDb();
    if (!db) return;
    // เคยตัดออเดอร์นี้แล้ว → ข้าม (กันยิงซ้ำจาก SlipOK + แอดมินกดเปลี่ยนสถานะ)
    const dup = await db.collection(STOCK_MOVES).where("refOrderId", "==", order.id).where("reason", "==", "ขาย").limit(1).get();
    if (!dup.empty) return;
    const itemsSnap = await db.collection(STOCK_ITEMS).get();
    const allItems = itemsSnap.docs.map((d) => d.data() as StockItem);
    const stockItems = allItems.filter((i) => i.active !== false && !i.noStock);
    /** SKU ที่ตั้ง "ไม่ต้องมีสต๊อก" — ลิงก์จากตัวเลือกยังอยู่ แต่ไม่ตัดยอด */
    const skip = new Set(allItems.filter((i) => i.noStock || i.active === false).map((i) => i.id));
    const optionMap = await loadOptionStockMap([...new Set(order.items.map((i) => i.productId))]);
    for (const oi of order.items) {
      // 1) SKU ที่ผูกกับตัวสินค้าโดยตรง — ตัดทุกตัวที่ผูก (เดิม .find ตัดแค่ตัวแรก ผูก 2 ตัวอีกตัวไม่เคยขยับ)
      for (const hit of stockItems.filter((si) => (si.productIds ?? []).includes(oi.productId))) {
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
      // 1b) วัสดุแฝง (ขาตั้ง/หมุด) — ทุกชิ้นของสินค้านี้ × จำนวนต่อชิ้น
      for (const si of stockItems) {
        const per = si.bomFor?.[oi.productId];
        if (!per || per <= 0) continue;
        const qty = Math.abs(oi.qty) * per;
        if (!qty) continue;
        await addStockMove({
          itemId: si.id,
          qty: -qty,
          reason: "ขาย",
          note: `${oi.name} · วัสดุแฝง`,
          refOrderId: order.id,
          by: "ระบบ (ขายอัตโนมัติ)",
          source: "iducky",
        });
      }
      // 2) SKU ที่ผูกกับ "ตัวเลือกที่ลูกค้าเลือก" (สีไหม/ตะขอ/ขนาด + ของที่มีเงื่อนไขข้ามกลุ่ม) — กติกาอยู่ที่ planStockCuts
      //    ออเดอร์เก่าไม่มี sel (มีแต่ selections ที่เป็นข้อความ) → ข้ามไปเงียบ ๆ
      for (const cut of planStockCuts(optionMap.get(oi.productId) ?? [], oi.sel, oi.qty)) {
        if (skip.has(cut.itemId) || !cut.qty) continue;
        await addStockMove({
          itemId: cut.itemId,
          qty: -cut.qty,
          reason: "ขาย",
          note: `${oi.name} · ${cut.via}`,
          refOrderId: order.id,
          by: "ระบบ (ขายอัตโนมัติ)",
          source: "iducky",
        });
      }
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

/**
 * 💰 ต้นทุนวัสดุที่ตัดไปแล้ว แยกตามออเดอร์ — วัตถุดิบของหน้ารายงานกำไร
 *
 * อ่านจาก ledger (ไม่ใช่คิดสดจากทุนวันนี้) เพราะแต่ละแถวแช่ทุน ณ วันที่ตัดไว้แล้ว
 * → ของขึ้นราคาเดือนนี้ กำไรเดือนก่อนต้องไม่ขยับตาม
 *
 * ⚠️ ได้เฉพาะ SKU ที่ "ผูกกับสินค้า/ตัวเลือก" และ "ใส่ราคาทุนไว้" เท่านั้น
 *    ใบที่ไม่มีแถวเลย = คิดต้นทุนไม่ได้ (ไม่ใช่ต้นทุน 0) — หน้ารายงานต้องบอกว่าครอบคลุมกี่ใบ
 *
 * @param fromIso/toIso ช่วงเวลาที่ "เดินสต๊อก" (ISO) — กว้างกว่าช่วงวันที่ของออเดอร์ เพราะตัดสต๊อกตอนเงินเข้า
 *                      ซึ่งอาจห่างจากวันเปิดใบหลายวัน
 */
export async function orderCostsInRange(fromIso: string, toIso: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const db = getStockDb();
  if (!db) return out;
  try {
    const LIMIT = 8000;
    const snap = await db.collection(STOCK_MOVES).where("at", ">=", fromIso).where("at", "<=", toIso).limit(LIMIT).get();
    // ชนเพดาน = ต้นทุนที่ได้ไม่ครบช่วง (ใบเก่าสุดหาย) — ขึ้น log ไว้ ไม่ใช่เงียบ ๆ แล้วให้คนอ่านกำไรผิด
    if (snap.size === LIMIT) console.warn(`[stock] ledger ในช่วง ${fromIso}–${toIso} เกิน ${LIMIT} แถว ต้นทุนอาจไม่ครบ`);
    for (const d of snap.docs) {
      const m = d.data() as StockMove;
      if (!m.refOrderId || !Number.isFinite(m.cost)) continue;
      // ledger ติดลบ = ของออกจากคลัง → ต้นทุนเป็นบวก · คืนของตอนยกเลิกหักกลับเอง
      out.set(m.refOrderId, Math.round(((out.get(m.refOrderId) ?? 0) - (m.cost as number)) * 100) / 100);
    }
  } catch (e) {
    console.error("[stock] อ่านต้นทุนจาก ledger ไม่สำเร็จ:", (e as Error)?.message);
  }
  return out;
}

/** มูลค่าของที่ค้างในคลังตอนนี้ (คงเหลือ × ทุน) — นับเฉพาะ SKU ที่ใส่ทุนไว้ */
export function stockValueOf(items: StockItem[]): { value: number; priced: number; total: number } {
  let value = 0;
  let priced = 0;
  for (const i of items) {
    if (!i.unitCost || i.unitCost <= 0) continue;
    priced += 1;
    value += Math.max(0, i.balance ?? 0) * i.unitCost;
  }
  return { value: Math.round(value * 100) / 100, priced, total: items.length };
}
