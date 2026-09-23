import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";

export const runtime = "nodejs";

/**
 * 📄 ดึงใบจาก "ระบบเก่า" (backoffice ของ casedesign2u) มาใช้เปิดเคลม
 *
 * ทำไมต้องมี: ออเดอร์ก่อนย้ายระบบไม่มีในตาราง orders ของเรา ทีมงานเคยต้องพิมพ์ชื่อ/เบอร์/รายการเองทุกช่อง
 * หน้า /review-order?d=<base64 เลขใบ> ของระบบนั้นเป็นหน้าให้ลูกค้าเปิดดู — เรียกได้โดยไม่ต้องล็อกอิน
 * (ยืนยันแล้ว 23 ก.ย. 69: เปิดในเบราว์เซอร์ที่ไม่มีคุกกี้เลยก็ยังได้ข้อมูลครบ)
 *
 * เรียกจากเซิร์ฟเวอร์ ไม่ใช่จากเบราว์เซอร์ เพราะเป็นคนละโดเมน (CORS ฝั่งเขาไม่ได้เปิดให้)
 * ⚠️ โฮสต์ปลายทางตรึงไว้ในโค้ด/ENV เท่านั้น — ห้ามรับ URL จากผู้ใช้มายิงตรง (กันใช้เซิร์ฟเวอร์เราไปยิงที่อื่น)
 */

const HOST = (process.env.LEGACY_BACKOFFICE_URL || "https://backoffice.casedesign2u.com").replace(/\/+$/, "");
const TIMEOUT_MS = 12_000;

type Row = { name?: unknown; detail?: unknown; unit?: unknown; price?: unknown };

export async function GET(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  const id = (new URL(req.url).searchParams.get("id") ?? "").replace(/\D/g, "").slice(0, 12);
  if (!id) return NextResponse.json({ error: "ต้องมีเลขใบของระบบเก่า (ตัวเลขล้วน)" }, { status: 400 });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  type Payload = { status?: string; items?: Record<string, unknown> };
  let payload: Payload | null = null;
  try {
    const res = await fetch(`${HOST}/api/user/get-review-order-info`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      // ระบบเก่ารับเลขใบเป็น base64 ไม่ใส่ = ท้าย (ท่าเดียวกับที่หน้าเว็บเขายิงเอง)
      body: new URLSearchParams({ base64_orders_id: Buffer.from(id, "utf8").toString("base64").replace(/=+$/, "") }).toString(),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) return NextResponse.json({ error: `ระบบเก่าตอบกลับ ${res.status} — ลองใหม่อีกครั้ง` }, { status: 502 });
    payload = (await res.json()) as Payload;
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "ระบบเก่าตอบช้าเกิน 12 วินาที" : "ต่อระบบเก่าไม่ได้";
    return NextResponse.json({ error: `${msg} — กรอกเองหรือลองใหม่อีกครั้ง` }, { status: 504 });
  } finally {
    clearTimeout(timer);
  }

  const it = payload?.items;
  if (payload?.status !== "success" || !it) return NextResponse.json({ error: `ไม่พบใบ #${id} ในระบบเก่า` }, { status: 404 });

  const info = (it.order_info ?? {}) as Record<string, unknown>;
  const cust = (it.customer_info ?? {}) as Record<string, unknown>;

  // ที่อยู่ของระบบเก่าเก็บเบอร์ไว้บรรทัดท้ายก้อนเดียวกัน ("…จ.กระบี่ 81150\nโทร. 064-5058240")
  const rawAddress = String(cust.address ?? info.customer_address ?? "");
  const phone = (rawAddress.match(/โทร[.\s:]*([\d\s-]{8,})/) ?? [])[1]?.replace(/[\s-]/g, "") ?? "";
  const address = rawAddress
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^โทร/.test(l))
    .join(" ");

  const items = (Array.isArray(it.order_detail_info) ? (it.order_detail_info as Row[]) : [])
    .slice(0, 50)
    .map((d, i) => ({
      index: i,
      name: String(d?.name ?? "").trim().slice(0, 300),
      detail: String(d?.detail ?? "").trim().slice(0, 1200) || undefined,
      /** unit ของระบบเก่าเป็นทศนิยม ("12.00") — จำนวนชิ้นที่สั่ง */
      qty: Math.max(1, Math.round(Number(d?.unit) || 1)),
    }))
    .filter((x) => !!x.name);

  const date = [info.orders_date, info.orders_time].filter(Boolean).join(" ").trim();

  return NextResponse.json({
    order: {
      id,
      customer: String(cust.business_name || cust.contact_name || info.customer_name || "").trim(),
      phone,
      address,
      status: String(info.orders_status_name ?? "").trim(),
      tracking: String(info.tracking ?? "").trim(),
      shipBy: String(info.express_type_name ?? "").trim(),
      date,
      items,
    },
  });
}
