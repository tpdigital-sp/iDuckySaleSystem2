import { orderTotal, type Order } from "@/lib/admin-data";
import { earlyPayAmount, earlyPayOf, type EarlyPayDiscount } from "@/lib/early-pay";
import { earlyPayBaseOf, earlyPaySkipReason } from "./order-early-pay";
import type { getSupabaseAdmin } from "./supabase-admin";

type SB = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * 🔍 ตัวเฝ้าระวัง "ส่วนลดโอนไวหาย" — สแกนออเดอร์จริงหาใบที่เข้าเงื่อนไขทุกอย่างแต่ไม่ได้ส่วนลด
 *
 * ทำไมต้องมีทั้งที่แก้กติกาแล้ว (เจ้าของร้านถาม 14 ก.ย. 69 "จะกลับมาอีกมั้ย"):
 * ชั้นกันของชั้นอื่น (ประตูเขียนออเดอร์ + ด่านตอน build) กันได้เฉพาะความผิดพลาดแบบที่เรานึกออกแล้ว
 * ตัวนี้ดูที่ "ผลลัพธ์จริงในฐาน" จึงจับได้แม้กติกาจะพังด้วยเหตุที่ยังคิดไม่ถึง
 * ถ้ามีตัวนี้ตั้งแต่ 10 ก.ย. จะรู้เรื่องใบ ItemAdder ตั้งแต่ใบแรก แทนที่จะรอเจ้าของร้านสังเกตเอง 4 วันให้หลัง
 */
export interface EarlyPayMiss {
  id: string;
  customer: string;
  /** ส่วนลดที่ควรได้ (บาท) */
  due: number;
  total: number;
  status: string;
  /** ใบนี้เกิดจากทางไหน — ไว้ไล่ว่าทางเข้าไหนยังไม่ผ่านกฎกลาง */
  via: string;
}

/** ใบนี้เกิดจากทางไหน (อ่านจาก log) — ชื่อเดียวกับที่ใช้ตอนวิเคราะห์ปัญหา 14 ก.ย. 69 */
export function orderSource(o: Order): string {
  if (o.flowAccount) return "FlowAccount";
  if (o.quoteOf) return "ใบเสนอราคา";
  const logs = (o.log ?? []).map((l) => `${l.action ?? ""} ${l.detail ?? ""}`);
  if (logs.some((a) => /สั่งเพิ่มในออเดอร์เดิม/.test(a))) return "ลูกค้าใส่ของเองทางลิงก์";
  if (logs.some((a) => /สร้างออเดอร์จากหลังบ้าน/.test(a))) return "แอดมินใส่ของให้";
  return "checkout เว็บ";
}

/**
 * สแกนออเดอร์ที่สร้างใน N วันหลัง หาใบที่ "ควรได้ส่วนลดแต่ไม่ได้"
 * ใช้กติกาตัวเดียวกับตอนคิดจริง (earlyPaySkipReason + earlyPayBaseOf) — ไม่มีกฎก๊อปมาไว้ที่นี่
 */
export async function scanEarlyPayMisses(sb: SB, days = 3): Promise<{ checked: number; misses: EarlyPayMiss[] }> {
  const since = new Date(Date.now() - days * 86_400_000);
  const { data: settRow } = await sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle();
  const cfg = earlyPayOf(settRow?.data as { earlyPay?: EarlyPayDiscount } | undefined);

  const { data } = await sb.from("orders").select("data").gte("created_at", since.toISOString());
  const orders = (data ?? []).map((r) => r.data as Order).filter(Boolean);

  const misses: EarlyPayMiss[] = [];
  let checked = 0;
  for (const o of orders) {
    if (o.earlyPay) continue; // ได้แล้ว (ยอดถูกผิดเป็นอีกเรื่อง — ใบที่ได้แล้วกฎกลางดูแลตอนบันทึก)
    if (earlyPaySkipReason(o)) continue; // ไม่เข้าเกณฑ์ตามกติกา (เรทส่ง/ตัวแทน/FlowAccount/ใบเสนอราคา ฯลฯ)
    checked++;
    const due = earlyPayAmount(await earlyPayBaseOf(o), cfg);
    if (due > 0) misses.push({ id: o.id, customer: o.customer || "ไม่ระบุชื่อ", due, total: orderTotal(o), status: o.status, via: orderSource(o) });
  }
  return { checked, misses };
}
