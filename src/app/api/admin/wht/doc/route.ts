import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { loadCert, saveCert } from "@/lib/server/wht-db";
import { findTaxInvoiceId, shareTaxInvoice } from "@/lib/server/flowaccount-api";

export const runtime = "nodejs";

/**
 * 🔗 เปิดใบกำกับภาษี/ใบเสร็จรับเงินใน FlowAccount — ?id=INV007665 → redirect ไปลิงก์แชร์ share.flowaccount.com
 * ครั้งแรกขอลิงก์จาก API (/tax-invoices/sharedocument) แล้วจำไว้ที่ WhtCert.faShareUrl · ครั้งต่อไปเปิดทันที
 * ใช้เป็น <a target="_blank"> ได้ตรง ๆ (คุกกี้แอดมินติดไปเอง) — ไม่ต้องเปิดหน้าต่างเปล่ารอ fetch
 */
export async function GET(req: Request) {
  const gate = await requirePerm("orders.money");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const id = (new URL(req.url).searchParams.get("id") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2,4}\d{3,}$/.test(id)) return NextResponse.json({ error: "เลขเอกสารไม่ถูกต้อง" }, { status: 400 });
  const c = await loadCert(sb, id);
  if (!c) return NextResponse.json({ error: `ไม่พบใบ ${id}` }, { status: 404 });
  if (c.faShareUrl) return NextResponse.redirect(c.faShareUrl, 302);
  try {
    const recordId = c.faId ?? (await findTaxInvoiceId(id));
    if (!recordId) return NextResponse.json({ error: `ไม่พบ ${id} ใน FlowAccount` }, { status: 404 });
    const url = await shareTaxInvoice(recordId);
    await saveCert(sb, { ...c, faId: recordId, faShareUrl: url });
    return NextResponse.redirect(url, 302);
  } catch (e) {
    return new NextResponse(`เปิดเอกสาร ${id} ไม่ได้: ${(e as Error).message}`, { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
