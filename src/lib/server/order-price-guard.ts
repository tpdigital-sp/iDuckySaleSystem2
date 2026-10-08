import type { OrderItem } from "@/lib/admin-data";
import { repriceCartGroups, type Product } from "@/lib/products";
import { shippingOf, type ShippingMethod } from "@/lib/settings-shared";

/**
 * 🚧 ด่านตรวจ "เงิน" ของรายการที่ลูกค้าส่งมาเอง (/api/orders · /api/orders/append)
 *
 * ทำไมต้องมี (ตรวจความปลอดภัย 8 ต.ค. 69): เดิม unitPrice / qty / discount / shippingCost เชื่อค่าจากเบราว์เซอร์ทั้งหมด
 * ใครก็ยิง fetch("/api/orders") ด้วยราคาต่อชิ้น ฿1 หรือ discount ฿9,999 ได้ → ออเดอร์เกิดจริง ยอดรวมผิด
 * แล้วแนบสลิป ฿1 ผ่าน SlipOK ได้ตามยอดนั้น — ร้านรู้อีกทีตอนผลิตเสร็จ
 *
 * กติกา (ไม่แตะโหมดพนักงานสั่งแทน staffOrder — พนักงานตั้งราคาพิเศษได้ตามสิทธิ์):
 *   1. ตัวเลขต้องเป็นตัวเลขจริง: qty จำนวนเต็ม > 0 · unitPrice ≥ 0 — ติดลบ/NaN/Infinity ปฏิเสธ
 *   2. ฟิลด์ที่ "แอดมินเท่านั้น" ใส่ได้ (discount · discountPct · quoteNote · adminNote) ถูกตัดทิ้งเงียบ ๆ
 *   3. บรรทัดที่คิดราคาจากตารางสินค้าได้ (มี sel · productId ไม่ใช่ #designfee/#boxfee) ต้องไม่ต่ำกว่า
 *      ราคาที่ "สมองเดียวกับตะกร้า" (repriceCartGroups) คิดได้จากสินค้าฉบับปัจจุบันในฐาน
 *      — คิดทั้งล็อตพร้อมของเดิมในใบ (โหมดสั่งเพิ่ม) เหมือนที่ตะกร้าทำ จึงได้เลขเดียวกันเป๊ะ
 *      — ราคาคิดได้ 0 (งานรอตีราคา/custom chat) = ไม่ตรวจ · ส่งมาสูงกว่า = ปล่อย (ไม่ใช่ความเสียหายของร้าน)
 *   4. ค่าคละลาย/Add on ที่ตะกร้าแยกบรรทัด #designfee ต้องรวมแล้วไม่ต่ำกว่าที่สินค้าคิดได้
 *   5. ค่าส่ง: ไม่ติดลบ และถ้าเลือกวิธีส่งที่มีราคา (ไม่ใช่มารับเอง) + ยอดยังไม่ถึงส่งฟรี → ต้องไม่ต่ำกว่าราคาวิธีนั้น
 *
 * ⚠️ ไม่ "เขียนทับ" ราคาให้เอง — ปฏิเสธด้วย 400 ให้ลูกค้ารีเฟรชตะกร้า (ราคาที่ร้านเพิ่งขยับจะได้ไม่เข้าใบเงียบ ๆ)
 */

/** ส่วนต่างที่ยอมได้ (ปัดเศษสตางค์) */
const TOLERANCE = 0.5;
const MAX_QTY = 1_000_000;
const MAX_PRICE = 10_000_000;
/** ยอดส่งฟรีเริ่มต้น — ต้องเท่ากับ DEFAULT_FREE_SHIPPING_MIN ใน shop-settings.ts ("use client" import ตรงจาก API ไม่ได้) */
const DEFAULT_FREE_SHIPPING_MIN = 999;

/** ฟิลด์เรื่องเงิน/หมายเหตุภายในที่ลูกค้าไม่มีสิทธิ์ส่ง — ตัดทิ้งก่อนบันทึก */
const ADMIN_ONLY_FIELDS = ["discount", "discountPct", "quoteNote", "adminNote"] as const;

export interface CleanItemsResult {
  items: OrderItem[];
  error?: string;
}

/** ตรวจรูปทรง + ตัวเลขของรายการที่ลูกค้าส่งมา (ขั้นที่ 1-2) */
export function cleanCustomerItems(raw: unknown): CleanItemsResult {
  if (!Array.isArray(raw) || raw.length === 0) return { items: [], error: "ไม่มีรายการสินค้า" };
  if (raw.length > 200) return { items: [], error: "รายการสินค้ามากเกินไป" };
  const items: OrderItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") return { items: [], error: "รูปแบบรายการไม่ถูกต้อง" };
    const it = { ...(r as Record<string, unknown>) };
    for (const k of ADMIN_ONLY_FIELDS) delete it[k];
    const productId = typeof it.productId === "string" ? it.productId.trim().slice(0, 200) : "";
    const name = typeof it.name === "string" ? it.name.slice(0, 300) : "";
    if (!productId || !name) return { items: [], error: "รายการสินค้าไม่มีรหัส/ชื่อ" };
    const qty = Number(it.qty);
    if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY) return { items: [], error: `จำนวนของ "${name}" ไม่ถูกต้อง` };
    const unitPrice = Number(it.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > MAX_PRICE)
      return { items: [], error: `ราคาของ "${name}" ไม่ถูกต้อง` };
    const sel = it.sel && typeof it.sel === "object" && !Array.isArray(it.sel) ? (it.sel as Record<string, string>) : undefined;
    items.push({
      ...(it as unknown as OrderItem),
      productId,
      name,
      qty,
      unitPrice: Math.round(unitPrice * 100) / 100,
      selections: typeof it.selections === "string" ? it.selections : "",
      ...(sel ? { sel } : {}),
    });
  }
  return { items };
}

export interface PriceShortfall {
  name: string;
  sent: number;
  expected: number;
}

/** บรรทัดที่คิดราคาจากตารางสินค้าได้ (สูตรเดียวกับ pricedIndexes ใน order-lot-reprice.ts) */
function priced(it: OrderItem): boolean {
  return !!it.productId && !it.productId.includes("#") && !!it.sel && Object.keys(it.sel).length > 0;
}

/**
 * ขั้นที่ 3-4: บรรทัดไหน "ถูกกว่าที่ร้านคิดได้" — ว่าง = ผ่าน
 * @param items    รายการใหม่ที่ลูกค้าส่งมา (ผ่าน cleanCustomerItems แล้ว)
 * @param load     ตัวโหลดสินค้าฉบับปัจจุบัน (getProductServer)
 * @param baseItems ของเดิมในใบ (โหมดสั่งเพิ่ม) — ร่วมล็อตคิดราคา แต่ไม่ถูกตรวจ
 */
export async function underpricedLines(
  items: OrderItem[],
  load: (id: string) => Promise<Product | undefined>,
  baseItems: OrderItem[] = []
): Promise<PriceShortfall[]> {
  const all = [...baseItems, ...items];
  const idxs = all.map((_, i) => i).filter((i) => priced(all[i]));
  if (!idxs.length) return [];

  const prods = new Map<string, Product>();
  for (const pid of [...new Set(idxs.map((i) => all[i].productId))]) {
    const p = await load(pid);
    if (p) prods.set(pid, p);
  }
  if (!prods.size) return [];
  const productOf = (id: string) => prods.get(id);

  const lines = idxs.map((i) => ({ productId: all[i].productId, selections: all[i].sel!, qty: all[i].qty }));
  const result = repriceCartGroups(lines, productOf);

  const out: PriceShortfall[] = [];
  let expectedFees = 0;
  idxs.forEach((idx, n) => {
    const it = all[idx];
    const r = result[n];
    if (!r || !prods.has(it.productId)) return;
    const isNew = idx >= baseItems.length;
    if (!isNew) return;
    expectedFees += r.extraFee ?? 0;
    const expected = r.unitPrice ?? 0;
    if (!(expected > 0)) return; // งานรอตีราคา / สเปคที่ตารางไม่มีราคา — ไม่ตรวจ
    if (it.unitPrice + TOLERANCE < expected) out.push({ name: it.name, sent: it.unitPrice, expected });
  });

  // ค่าคละลาย/Add on ที่ตะกร้าแยกเป็นบรรทัด #designfee — รวมแล้วต้องไม่ต่ำกว่าที่สินค้าคิดได้
  if (expectedFees > 0) {
    const sentFees = items
      .filter((i) => i.productId.endsWith("#designfee"))
      .reduce((s, i) => s + i.qty * i.unitPrice, 0);
    if (sentFees + TOLERANCE < expectedFees) out.push({ name: "ค่าคละลาย / Add on", sent: sentFees, expected: expectedFees });
  }
  return out;
}

/** ข้อความแจ้งลูกค้าเมื่อราคาไม่ตรง — ไม่บอกเลขละเอียด (ไม่ช่วยคนที่ตั้งใจยิง API) */
export function priceMismatchMessage(short: PriceShortfall[]): string {
  const names = [...new Set(short.map((s) => s.name))].slice(0, 3).join(" · ");
  return `ราคาของ ${names} ไม่ตรงกับราคาปัจจุบันของร้าน — กรุณารีเฟรชหน้าตะกร้าแล้วสั่งใหม่อีกครั้งครับ`;
}

/**
 * ขั้นที่ 5: ค่าส่งต่ำสุดที่ยอมรับได้ — null = ไม่ผ่าน (ติดลบ/ไม่ใช่ตัวเลข)
 * @param sent        ค่าส่งที่ลูกค้าส่งมา
 * @param methodName  ชื่อวิธีส่งที่เลือก (ตรงกับ ShippingMethod.name)
 * @param subtotal    ยอดสินค้า (ไว้เช็คส่งฟรี)
 * @param settings    ตั้งค่าร้าน (shipping + freeShippingMin)
 * @param waived      ใบที่ไม่คิดค่าส่งซ้ำอยู่แล้ว (สั่งเพิ่มในใบที่มีค่าส่งแล้ว) — เช็คแค่ไม่ติดลบ
 */
export function shippingFloorProblem(
  sent: unknown,
  methodName: string | undefined,
  subtotal: number,
  settings: { shipping?: ShippingMethod[]; freeShippingMin?: number } | null | undefined,
  waived = false
): string | null {
  const cost = Number(sent ?? 0);
  if (!Number.isFinite(cost) || cost < 0 || cost > MAX_PRICE) return "ค่าจัดส่งไม่ถูกต้อง";
  if (waived) return null;
  const name = (methodName ?? "").trim();
  if (!name) return null;
  const method = shippingOf(settings).find((m) => m.name.trim() === name);
  if (!method || !(method.price > 0)) return null; // มารับเอง/ส่งฟรี หรือชื่อวิธีที่ร้านเลิกใช้แล้ว — ไม่มีราคาให้เทียบ
  const freeMin = settings?.freeShippingMin ?? DEFAULT_FREE_SHIPPING_MIN;
  if (freeMin > 0 && subtotal >= freeMin) return null;
  if (cost + TOLERANCE < method.price) return "ค่าจัดส่งไม่ตรงกับวิธีส่งที่เลือก — กรุณารีเฟรชหน้าตะกร้าแล้วสั่งใหม่อีกครั้งครับ";
  return null;
}
