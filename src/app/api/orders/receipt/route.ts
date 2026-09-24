import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderFullyPaid, type Order } from "@/lib/admin-data";
import { customerSafeOrder } from "@/lib/customer-order";
import { getProductServer } from "@/lib/products-server";
import { SETTINGS_ID, shippingOf, shopInfoOf } from "@/lib/settings-shared"; // ⚠️ ห้ามเรียกจาก shop-settings ("use client") — เซิร์ฟเวอร์พัง 500 ตัวเปล่า
import type { Product } from "@/lib/products";
import type { ShopPayment } from "@/lib/shop-settings"; // ชนิดข้อมูลอย่างเดียว (ไม่ได้เรียกฟังก์ชันจากไฟล์ "use client")
import { buildReceiptPdf, receiptFileName } from "@/lib/server/receipt-pdf";

export const runtime = "nodejs";

/**
 * 🧾 ใบเสร็จเป็นไฟล์ PDF — GET /api/orders/receipt?id=OD-xxx&key=xxx
 *
 * มีไว้เพราะ "บันทึก PDF" ของเบราว์เซอร์ (window.print) ใช้ไม่ได้ในแอป LINE/Facebook
 * ที่ลูกค้าเกือบทุกคนเปิดลิงก์ออเดอร์ — กดแล้วเงียบ เซฟไม่ได้ (พนักงานแจ้ง 24 ก.ย. 69)
 *
 * สิทธิ์: key ลับในลิงก์ (เหมือน /api/orders/view) · ออกได้เฉพาะใบที่ชำระครบ 100%
 * (กติกาเดียวกับหน้า /order/[id]/receipt ห้ามหย่อนกว่ากัน)
 *
 * ?dl=1 = สั่งให้เบราว์เซอร์ดาวน์โหลดเป็นไฟล์ · ไม่ใส่ = เปิดดูในหน้าจอก่อน (มือถือจะได้
 * กดปุ่มแชร์/บันทึกของเครื่องเอง — iPhone ในแอป LINE ดาวน์โหลดตรง ๆ ไม่ได้)
 */
export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const url = new URL(req.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  const key = url.searchParams.get("key") ?? "";
  if (!id) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });

  const { data: row, error } = await sb.from("orders").select("data").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });

  const raw = row.data as Order;
  if (raw.key && raw.key !== key) return NextResponse.json({ error: "ลิงก์ไม่ถูกต้องหรือหมดอายุ" }, { status: 403 });
  if (!orderFullyPaid(raw)) return NextResponse.json({ error: "ยังออกใบเสร็จไม่ได้ — ชำระเงินยังไม่ครบจำนวน" }, { status: 409 });

  const order = customerSafeOrder(raw) as Order;

  // ตั้งค่าร้าน (ชื่อ/ที่อยู่/เลขผู้เสียภาษี + ชื่อวิธีส่ง) — แถวเดียวกับที่หน้าเว็บใช้
  const { data: settRow } = await sb.from("products").select("data").eq("id", SETTINGS_ID).maybeSingle();
  const sett = (settRow?.data ?? null) as ShopPayment | null;

  // สินค้าของแต่ละรายการ — เอาไว้เติมขนาดงานตายตัว + จำนวนชิ้นของใบเก่าที่ยังไม่มี unitYield
  const ids = [...new Set(order.items.map((i) => i.productId).filter(Boolean))];
  const productById: Record<string, Product> = {};
  await Promise.all(
    ids.map(async (pid) => {
      try {
        const p = await getProductServer(pid);
        if (p) productById[pid] = p;
      } catch {
        /* สินค้าถูกลบ/อ่านไม่ได้ → ใบเสร็จยังออกได้ แค่ไม่มีขนาดงานเติมให้ */
      }
    }),
  );

  let pdf: Uint8Array;
  try {
    pdf = await buildReceiptPdf({ order, shop: shopInfoOf(sett), shipMethods: shippingOf(sett), productById });
  } catch (e) {
    return NextResponse.json({ error: `สร้างไฟล์ใบเสร็จไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 });
  }

  const name = receiptFileName(order);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": `${url.searchParams.get("dl") ? "attachment" : "inline"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      // ใบเสร็จเป็นของส่วนตัว — ห้ามให้ CDN เก็บไว้แจกซ้ำ
      "Cache-Control": "private, no-store",
    },
  });
}
