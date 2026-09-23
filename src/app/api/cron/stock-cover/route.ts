import { NextResponse } from "next/server";
import { coverStockForProducts } from "@/lib/server/stock-cover";

export const runtime = "nodejs";

/**
 * 📦 กวาดสินค้าที่ยังไม่มีสต๊อก แล้วสร้าง SKU ให้ — ถูกเรียกทุกเช้าโดย Netlify scheduled function
 * ตาข่ายชั้นสอง: สินค้าที่สร้างจากสคริปต์/เขียนลงฐานตรง ๆ ไม่ผ่าน /api/admin/products จึงไม่มีใครสร้าง SKU ให้
 * ป้องกันคนนอกเรียกด้วย ?key= (CRON_SECRET) · เรียกมือก็ได้ถ้าอยากให้ขึ้นทันที
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || new URL(req.url).searchParams.get("key") !== secret)
    return NextResponse.json({ error: "ไม่มีสิทธิ์เรียก" }, { status: 401 });
  try {
    const r = await coverStockForProducts();
    return NextResponse.json({ ok: true, checked: r.checked, made: r.made.length, tied: r.tied.length, items: [...r.made, ...r.tied].slice(0, 30) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
