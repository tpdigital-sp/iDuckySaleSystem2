import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order } from "@/lib/admin-data";
import type { Quote } from "@/lib/quotes";

/**
 * 🪶 ดึงออเดอร์/ใบเสนอราคาแบบ "เบา" — หยิบเฉพาะคีย์ใน jsonb ที่หน้านั้นใช้จริง
 *
 * ต้นตอหน้ารายงานช้า (7 ต.ค. 69): `select("data")` ขนก้อน jsonb ทั้งใบ — วัดจริง 828 ใบ = 9.3 MB / 4.8 วิ
 * ทั้งที่ 57% เป็น `log` (ประวัติการแก้) 29% เป็น `items` (ในนั้น proofs/ลาย 1.2 MB) ซึ่งรายงานไม่แตะเลย
 *
 * PostgREST หยิบคีย์ใน jsonb ได้ตรง ๆ ด้วย `alias:data->key` → ได้แถวเป็น { key: value } เหมือน Order ตัดคีย์ที่ไม่ขอ
 * (ไม่ต้องรัน SQL อะไรเพิ่ม) · ถ้ามีวิว orders_lite (supabase/orders-lite.sql) จะตัด proofs/ลายในรายการให้ด้วย = เบากว่าอีก 3 เท่า
 *
 * ⚠️ เพิ่มคีย์ใหม่ที่ buildReport/orderTotal/จอ WIP ต้องใช้ → ต้องเติมในรายการด้านล่างด้วย ไม่งั้นค่านั้นจะเป็น undefined เงียบ ๆ
 *    มีสคริปต์เทียบผลเต็ม↔เบาไว้ที่ scripts/check-orders-lite.mts (รันก่อน deploy เมื่อแตะไฟล์นี้)
 */

/** คอลัมน์ select ของ PostgREST — `k:data->k` คืนค่าเป็น json ตามชนิดจริง (string/number/object) */
export const pickKeys = (keys: readonly string[]): string => keys.map((k) => `${k}:data->${k}`).join(",");

/**
 * 📈 หน้ารายงาน (lib/reports.ts + ฟังก์ชันยอดรวมใน admin-data: orderTotal/paidSoFar/earlyPayState …)
 * ไม่มี `log` — paidTotalEverConfirmed อ่าน log เฉพาะใบ "รอตรวจสอบ" ที่เลขใบก่อน 10 ก.ย. 69 (ใบหลังจากนั้นตัดสินจากเลขใบ)
 */
export const REPORT_ORDER_KEYS = [
  "id",
  "customer",
  "phone",
  "date",
  "status",
  "items",
  "customerId",
  "contactId",
  "shippingCost",
  "quoteOf",
  "placedBy",
  "discount",
  "dealer",
  "vat",
  "charges",
  "earlyPay",
  "adminDiscount",
  "paidTotal",
  "deposit",
  "slipVerify",
  "payments",
  "reopenedFrom",
  /** paidStateOf → orderFullyPaid → hasUnpaidBalance อ่าน claimOf (ใบเคลมไม่มียอดค้าง) */
  "claimOf",
] as const;

/** รายการสินค้าในรายงานใช้แค่ชื่อ/จำนวน/ราคา/ส่วนลดต่อบรรทัด (วิว orders_lite ตัดเหลือเท่านี้) */
export const REPORT_ITEM_KEYS = ["productId", "name", "qty", "unitPrice", "discount", "discountPct"] as const;

/** 🗂 รายงานงานค้าง (api/admin/orders/wip) — ฟิลด์ที่ route หยิบไปส่ง + ที่ orderTotal ต้องใช้ */
export const WIP_ORDER_KEYS = [
  "id",
  "customer",
  "phone",
  "date",
  "status",
  "reopenedFrom",
  "shipping",
  "shippingLabel",
  "shipDate",
  "useByDate",
  "rush",
  "printedAt",
  "readyToShip",
  "deposit",
  "needsPurchase",
  "items",
  "shippingCost",
  "discount",
  "adminDiscount",
  "earlyPay",
  "vat",
  "charges",
  "paidTotal",
  "slipVerify",
  "payments",
] as const;

/** 📄 ใบเสนอราคาแบบรายการ — ทุกคีย์ยกเว้น `log` (หน้ารายการ/รายงานไม่โชว์ประวัติ · หน้ารายละเอียดยังขอเต็ม) */
export const QUOTE_LIST_KEYS = [
  "id",
  "key",
  "customer",
  "phone",
  "address",
  "email",
  "contactId",
  "date",
  "items",
  "shippingCost",
  "shippingLabel",
  "shippingAuto",
  "discount",
  "discountNote",
  "memberTier",
  "memberTierOff",
  "note",
  "status",
  "expiresAt",
  "orderId",
  "declineReason",
  "createdBy",
] as const;

/** PostgREST คืนสูงสุด 1000 แถวต่อครั้ง — ต้องวนหน้า ไม่งั้นยอดขายขาดแบบเงียบ ๆ */
const PAGE = 1000;
const MAX_PAGES = 40;

export interface LiteRangeResult<T> {
  rows: T[];
  /** ตาราง/วิวยังไม่ถูกสร้าง */
  needsSetup?: boolean;
  error?: string;
}

const isMissingRelation = (e: { code?: string; message?: string }) =>
  e.code === "42P01" || e.code === "PGRST205" || e.code === "42703" || /schema cache|does not exist/i.test(e.message ?? "");

/**
 * ดึงทั้งช่วง created_at แบบแบ่งหน้า จากตารางหรือวิวที่ระบุ
 * @param select คอลัมน์ PostgREST — "data" (ก้อนเต็ม) หรือผลจาก pickKeys() · วิว orders_lite ใช้ "data:data_report"
 */
export async function fetchLiteRange<T>(
  sb: SupabaseClient,
  relation: string,
  select: string,
  fromIso: string,
  toIso: string
): Promise<LiteRangeResult<T>> {
  const rows: T[] = [];
  const picked = select !== "data" && !select.startsWith("data:");
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await sb
      .from(relation)
      .select(select)
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) {
      if (isMissingRelation(error)) return { rows: [], needsSetup: true };
      return { rows: [], error: error.message };
    }
    const chunk = (data ?? []) as unknown[];
    for (const r of chunk) {
      const v = picked ? r : (r as { data: T }).data;
      if (v) rows.push(v as T);
    }
    if (chunk.length < PAGE) break;
  }
  return { rows };
}

/** วิว orders_lite ยังไม่มี → จำไว้ ไม่ต้องลองใหม่ทุกคำขอ (ลองซ้ำทุก 10 นาที เผื่อเพิ่งรัน SQL) */
let liteViewMissingUntil = 0;
const LITE_RETRY_MS = 10 * 60_000;

/**
 * 📈 ออเดอร์สำหรับหน้ารายงาน — ลองวิว orders_lite (data_report: ตัด log + ลาย/proofs ในรายการ) ก่อน
 * ไม่มีวิว → หยิบคีย์จากตาราง orders ตรง ๆ (ยังตัด log ได้ แต่ items มาเต็ม)
 */
export async function fetchReportOrders(sb: SupabaseClient, fromIso: string, toIso: string): Promise<LiteRangeResult<Order> & { via: "view" | "pick" }> {
  if (Date.now() >= liteViewMissingUntil) {
    const r = await fetchLiteRange<Order>(sb, "orders_lite", "data:data_report", fromIso, toIso);
    if (!r.needsSetup) return { ...r, via: "view" };
    liteViewMissingUntil = Date.now() + LITE_RETRY_MS;
  }
  const r = await fetchLiteRange<Order>(sb, "orders", pickKeys(REPORT_ORDER_KEYS), fromIso, toIso);
  return { ...r, via: "pick" };
}

/**
 * 🗂 ออเดอร์ที่อยู่ในสถานะที่ขอ (รายงานงานค้าง) — ลองวิว orders_lite (คอลัมน์ status + data ตัด log/รูป) ก่อน
 * ไม่มีวิว → หยิบคีย์จากตาราง orders · ทั้งสองทางยังใช้ดัชนี orders_status_idx (data->>'status')
 */
export async function fetchOrdersByStatus(sb: SupabaseClient, statuses: readonly string[]): Promise<LiteRangeResult<Order> & { via: "view" | "pick" }> {
  if (Date.now() >= liteViewMissingUntil) {
    const { data, error } = await sb.from("orders_lite").select("data").in("status", [...statuses]).order("created_at", { ascending: false });
    if (!error) return { rows: (data ?? []).map((r) => (r as { data: Order }).data).filter(Boolean), via: "view" };
    if (!isMissingRelation(error)) return { rows: [], error: error.message, via: "view" };
    liteViewMissingUntil = Date.now() + LITE_RETRY_MS;
  }
  const { data, error } = await sb
    .from("orders")
    .select(pickKeys(WIP_ORDER_KEYS))
    .in("data->>status", [...statuses])
    .order("created_at", { ascending: false });
  if (error) return { rows: [], error: error.message, via: "pick" };
  return { rows: (data ?? []) as unknown as Order[], via: "pick" };
}

/** 📄 ใบเสนอราคาในช่วง (ไม่เอา log) */
export const fetchReportQuotes = (sb: SupabaseClient, fromIso: string, toIso: string) =>
  fetchLiteRange<Quote>(sb, "quotes", pickKeys(QUOTE_LIST_KEYS), fromIso, toIso);
