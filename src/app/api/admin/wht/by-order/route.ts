import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { WHT_TABLE } from "@/lib/server/wht-db";
import { WHT_STATUS_LABEL, whtAmountOf, whtStatusOf, type WhtCert } from "@/lib/wht";

export const runtime = "nodejs";

export interface OrderInvoiceRow {
  id: string;
  date: string;
  total: number;
  faStatus?: string;
  status: string;
  /** สถานะใบหัก (เฉพาะใบที่ลูกค้าหัก) */
  wht?: { amount: number; label: string; done: boolean };
  /** จับคู่จากเลขอ้างอิง/ผูกเอง = แน่นอน · เดาจากเลขผู้เสียภาษี/ชื่อ+ยอด = อาจผิด */
  guessed: boolean;
}

/**
 * 🧾 ใบกำกับภาษี/ใบเสร็จรับเงิน (INV) ที่ออกใน FlowAccount แล้วของออเดอร์นี้ — กล่อง FlowAccount หน้าออเดอร์
 * ข้อมูลมาจากตาราง wht_certs ที่ cron wht-sync ดึงจาก FlowAccount ทุก 5 นาที (จับคู่ INV → ใบงานด้วยเลข QT/BL อ้างอิง)
 * ?orderId=OD-…
 */
export async function GET(req: Request) {
  const gate = await requirePerm("orders.money");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ invoices: [] });
  const orderId = new URL(req.url).searchParams.get("orderId")?.trim();
  if (!orderId) return NextResponse.json({ error: "ไม่รู้ว่าออเดอร์ไหน" }, { status: 400 });
  // ⚠️ jsonb contains ต้องยิงที่คอลัมน์ data ทั้งก้อน (ดู slip-dedupe)
  const { data, error } = await sb.from(WHT_TABLE).select("data").contains("data", { orderIds: [orderId] }).limit(20);
  if (error) return NextResponse.json({ invoices: [], error: error.message });
  const invoices: OrderInvoiceRow[] = (data ?? [])
    .map((r) => r.data as WhtCert)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => {
      const st = whtStatusOf(c);
      return {
        id: c.id,
        date: c.date,
        total: c.total,
        faStatus: c.faStatus,
        status: st,
        ...(c.mode === "wht" || c.retro ? { wht: { amount: c.retro?.amount ?? whtAmountOf(c), label: WHT_STATUS_LABEL[st], done: st === "received" || st === "refunded" } } : {}),
        guessed: c.matchedBy === "taxId" || c.matchedBy === "name",
      };
    });
  return NextResponse.json({ invoices });
}
