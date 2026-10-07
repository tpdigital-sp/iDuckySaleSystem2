import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order } from "@/lib/admin-data";
import type { Quote } from "@/lib/quotes";
import { fetchReportOrders, fetchReportQuotes, retryLiteViewNow } from "@/lib/server/orders-lite";
import { orderCostsInRange } from "@/lib/server/stock";
import { inBackground } from "@/lib/server/background";

/**
 * 📈 วัตถุดิบของรายงานยอดขาย (ออเดอร์+ใบเสนอราคาในช่วงกว้าง + ต้นทุนจาก ledger) พร้อมความจำแบบ stale-while-revalidate
 *
 * ทำไมต้องมี (7 ต.ค. 69): ดึงออเดอร์ 33 วัน (~830 ใบ) จาก Supabase ใช้ 1.5–4 วิ แกว่งตามเน็ตร้าน
 * (ต่อให้หยิบเฉพาะคีย์แล้ว Postgres ยังต้องคลายบีบอัด jsonb ทุกใบ — ดู orders-lite.ts) และหน้ารายงานยิงซ้ำทุกครั้งที่สลับช่วง
 * → จำผลไว้ต่อช่วงกว้าง: ใน 60 วิ ตอบจากความจำทันที · เกิน 60 วิแต่ไม่ถึง 15 นาที ตอบของเก่าก่อนแล้วไปโหลดใหม่เบื้องหลัง
 *   (ผู้ใช้เห็นช้าเฉพาะครั้งแรกหลังเซิร์ฟเวอร์ตื่น) · `fresh` = ข้ามความจำ (ปุ่มรีเฟรช)
 * ⚠️ บน Netlify เครื่องอยู่ไม่นาน ความจำช่วยได้น้อย — ทางแก้จริงคือรัน supabase/orders-lite.sql
 */
export interface ReportWindow {
  /** ช่วง created_at ของออเดอร์/ใบเสนอราคา (ISO) */
  wideFrom: string;
  wideTo: string;
  /** ช่วงเดินสต๊อก (กว้างกว่า — ตัดสต๊อกตอนเงินเข้า) */
  costFrom: string;
  costTo: string;
}

export interface ReportInputs {
  /** เวลาที่ดึงชุดนี้มา (ms) */
  at: number;
  orders: Order[];
  quotes: Quote[];
  costs: Map<string, number>;
  via: "view" | "pick";
  needsSetup?: boolean;
  error?: string;
  /** เวลาแต่ละส่วน (ms) — ไว้ไล่ว่าช้าตรงไหน */
  took: Record<string, number>;
}

const FRESH_MS = 60_000;
const STALE_MS = 15 * 60_000;
/** เก็บได้กี่ช่วง (ชุดละ ~10 MB ในหน่วยความจำ) — เกินแล้วทิ้งของเก่าสุด */
const MAX_SNAPS = 6;

const snaps = new Map<string, ReportInputs>();
const inflight = new Map<string, Promise<ReportInputs>>();

async function load(sb: SupabaseClient, key: string, w: ReportWindow): Promise<ReportInputs> {
  const t0 = Date.now();
  const took: Record<string, number> = {};
  const [ordersRes, quotesRes, costs] = await Promise.all([
    fetchReportOrders(sb, w.wideFrom, w.wideTo).then((r) => ((took.orders = Date.now() - t0), r)),
    fetchReportQuotes(sb, w.wideFrom, w.wideTo).then((r) => ((took.quotes = Date.now() - t0), r)),
    orderCostsInRange(w.costFrom, w.costTo).then((r) => ((took.costs = Date.now() - t0), r)),
  ]);
  took.load = Date.now() - t0;
  const snap: ReportInputs = {
    at: Date.now(),
    orders: ordersRes.rows,
    quotes: quotesRes.rows,
    costs,
    via: ordersRes.via,
    ...(ordersRes.needsSetup ? { needsSetup: true } : {}),
    ...(ordersRes.error ? { error: ordersRes.error } : {}),
    took,
  };
  // จำเฉพาะชุดที่โหลดสำเร็จ — ของพังไม่ควรถูกเสิร์ฟซ้ำ 15 นาที
  if (!snap.error && !snap.needsSetup) {
    snaps.delete(key);
    snaps.set(key, snap);
    while (snaps.size > MAX_SNAPS) {
      const oldest = snaps.keys().next().value;
      if (oldest === undefined) break;
      snaps.delete(oldest);
    }
  }
  return snap;
}

/** โหลดครั้งเดียวต่อช่วงแม้มีคนขอพร้อมกัน (หน้ารายงานใน dev ยิงซ้ำ 2 ครั้งจาก StrictMode) */
function loadOnce(sb: SupabaseClient, key: string, w: ReportWindow): Promise<ReportInputs> {
  let p = inflight.get(key);
  if (!p) {
    p = load(sb, key, w).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

export async function reportInputs(
  sb: SupabaseClient,
  w: ReportWindow,
  opts: { fresh?: boolean } = {}
): Promise<ReportInputs & { fromCache: boolean }> {
  const key = `${w.wideFrom}|${w.wideTo}`;
  const s = snaps.get(key);
  const age = s ? Date.now() - s.at : Infinity;
  // ขอสด = ให้ลองวิว orders_lite ใหม่ด้วย (ตัวจำ "วิวไม่มี" ค้าง 10 นาทีหลังเพิ่งรัน SQL)
  if (opts.fresh) retryLiteViewNow();
  if (!opts.fresh && s && age < FRESH_MS) return { ...s, fromCache: true };
  if (!opts.fresh && s && age < STALE_MS) {
    inBackground(`report refresh ${key}`, loadOnce(sb, key, w));
    return { ...s, fromCache: true };
  }
  return { ...(await loadOnce(sb, key, w)), fromCache: false };
}
