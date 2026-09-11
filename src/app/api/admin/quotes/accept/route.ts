import { NextResponse } from "next/server";
import { bkkYmd, thaiDateTime } from "@/lib/bangkok-time";
import { randomBytes } from "node:crypto";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { withLog, type Order } from "@/lib/admin-data";
import { quoteMemberDiscount, quoteMemberLabel, quoteTotal, withQuoteLog, type Quote } from "@/lib/quotes";
import { syncQuoteMemberTier } from "@/lib/server/quote-member-tier";
import { withUnitYield } from "@/lib/products-server";
import type { ShopPayment } from "@/lib/shop-settings";
import { shippingOf } from "@/lib/settings-shared"; // ⚠️ ห้ามเรียก shippingOf จาก shop-settings ("use client") ในเซิร์ฟเวอร์ — เคยพัง 500 ตัวเปล่า
import { normalizeShipLabel } from "@/lib/ship-label";

export const runtime = "nodejs";

/**
 * ✅ ลูกค้าตกลงใบไหน → แปลงใบนั้นเป็นออเดอร์จริง (เข้าคิวงานตามปกติ)
 *
 * closeOthers = true → ปิดใบเสนอราคาใบอื่นของลูกค้ารายเดียวกันที่ยังค้างอยู่เป็น "ไม่รับ"
 * นี่คือหัวใจที่แก้ปัญหากราฟฟิกสับสน — เหลือใบเดียวที่ยัง "มีชีวิต" เสมอ
 */
export async function POST(req: Request) {
  try {
    return await acceptQuote(req);
  } catch (e) {
    // ห้ามหลุดเป็น 500 ตัวเปล่า — หน้าใบเสนอราคาเคยค้าง "กำลังสร้างออเดอร์…" ไม่จบ เพราะอ่าน JSON จากคำตอบว่างไม่ได้ (11 ก.ย. 69)
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[quotes/accept] ล้มเหลว:", e);
    return NextResponse.json({ error: `สร้างออเดอร์ไม่สำเร็จ: ${msg}` }, { status: 500 });
  }
}

async function acceptQuote(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  let body: { id?: string; closeOthers?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ไม่ได้ระบุเลขใบเสนอราคา" }, { status: 400 });

  const { data: row, error: readErr } = await sb.from("quotes").select("data").eq("id", id).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "ไม่พบใบเสนอราคานี้" }, { status: 404 });

  let quote = row.data as Quote;
  if (quote.orderId) return NextResponse.json({ error: `ใบนี้แปลงเป็นออเดอร์ ${quote.orderId} ไปแล้ว` }, { status: 400 });
  if (!quote.items.length) return NextResponse.json({ error: "ใบนี้ยังไม่มีรายการสินค้า" }, { status: 400 });
  // ระดับสมาชิกคิดสด ณ วันตกลง (ระหว่างรอลูกค้าตอบ ระดับอาจขึ้น/ตกได้) — กติกาเดียวกับสั่งเองจากเว็บ
  quote = await syncQuoteMemberTier(sb, quote);
  const memberAmount = quoteMemberDiscount(quote);

  const by = gate.actor.name?.trim() || gate.actor.username;
  const now = new Date();
  // วิธีส่ง: ใบที่แอดมินกรอกตัวเลขค่าส่งเอง (ไม่ได้เลือกจากเมนู) ไม่มีชื่อวิธีส่ง → จับคู่ราคากับวิธีส่งของร้าน (50 → EMS (50))
  // ไม่งั้นออเดอร์ตกไปใช้ค่าเก่า "ส่งธรรมดา" แล้วใบปะหน้าขึ้นผิด (OD-260909-8171 · 10 ก.ย. 69)
  const { data: settRow } = await sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle();
  const shipLabel = normalizeShipLabel(quote.shippingLabel, quote.shippingCost || 0, shippingOf((settRow?.data as ShopPayment | null) ?? null));
  const orderId = `OD-${bkkYmd(now)}-${Math.floor(1000 + Math.random() * 9000)}`;

  let order: Order = {
    id: orderId,
    key: randomBytes(24).toString("base64url"),
    customer: quote.customer,
    phone: quote.phone,
    address: quote.address ?? "",
    date: thaiDateTime(now),
    payment: "โอนธนาคาร",
    // วิธีส่งที่เลือกไว้ในใบเสนอราคา (ชุดเดียวกับหน้าออเดอร์) — ไม่ได้เลือก = ส่งธรรมดา
    shipping: (shipLabel.includes("ด่วน") ? "ส่งด่วน" : "ส่งธรรมดา") as Order["shipping"],
    ...(shipLabel ? { shippingLabel: shipLabel } : {}),
    shippingCost: quote.shippingCost || 0,
    status: "รอชำระเงิน",
    // 📐 ใบเก่าที่ยังไม่ได้แช่จำนวนชิ้นต่อหน่วย เติมให้ตอนกลายเป็นออเดอร์ (มีอยู่แล้วไม่ทับ)
    items: await withUnitYield(quote.items.map((it) => ({ ...it }))),
    placedBy: by,
    ...(quote.email ? { email: quote.email } : {}),
    // ผู้ติดต่อที่ผูกไว้ตอนทำใบเสนอราคา ต้องติดไปกับออเดอร์ด้วย ไม่งั้นแต้มไม่เข้าใคร
    ...(quote.contactId ? { contactId: quote.contactId } : {}),
    ...(memberAmount > 0 ? { discount: { label: quoteMemberLabel(quote), amount: memberAmount } } : {}),
    ...(quote.discount ? { adminDiscount: { amount: quote.discount, label: quote.discountNote } } : {}),
    ...(quote.note ? { billNote: quote.note } : {}),
    quoteOf: quote.id,
  };
  order = withLog(order, by, "สร้างจากใบเสนอราคา", `${quote.id} · ยอด ${quoteTotal(quote)} บาท`);

  const { error: insErr } = await sb.from("orders").insert({ id: orderId, data: order });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // ปิดใบนี้เป็น "สร้างออเดอร์แล้ว" + ผูกเลขออเดอร์
  // (ไม่ใช่ "ลูกค้าตกลง" — สถานะนั้นแปลว่า "ลูกค้าตอบตกลงแล้ว แต่ยังไม่มีใครเปิดงาน" ซึ่งเป็นตัวนับป้ายเตือนข้างเมนู
  //  ถ้าไม่เปลี่ยน ใบที่เปิดงานไปแล้วจะค้างเป็นงานเตือนตลอดไป)
  const accepted = withQuoteLog(
    { ...quote, status: "สร้างออเดอร์แล้ว", orderId },
    by,
    "ลูกค้าตกลง — แปลงเป็นออเดอร์",
    orderId
  );
  await sb.from("quotes").update({ data: accepted }).eq("id", id);

  // ปิดใบอื่นของลูกค้ารายเดียวกันที่ยังค้าง (กันกราฟฟิกหยิบผิดใบ)
  let closed = 0;
  if (body.closeOthers !== false) {
    const phoneKey = (quote.phone ?? "").replace(/\D/g, "");
    const { data: all } = await sb.from("quotes").select("data");
    for (const r of all ?? []) {
      const q = r.data as Quote;
      if (q.id === id || q.orderId) continue;
      // ปิดรวมถึงใบที่ลูกค้าเผลอกดตกลงไว้หลายใบ (ยังไม่ได้แปลงเป็นออเดอร์) — กันแอดมินแปลงซ้ำเป็น 2 ออเดอร์
      if (q.status === "ไม่รับ") continue;
      const same = phoneKey && (q.phone ?? "").replace(/\D/g, "") === phoneKey;
      if (!same) continue;
      const closedQ = withQuoteLog(
        { ...q, status: "ไม่รับ", declineReason: `ลูกค้าเลือกใบ ${id} แทน` },
        by,
        "ปิดอัตโนมัติ — ลูกค้าเลือกใบอื่น",
        id
      );
      await sb.from("quotes").update({ data: closedQ }).eq("id", q.id);
      closed += 1;
    }
  }

  return NextResponse.json({ ok: true, orderId, closedOthers: closed });
}
