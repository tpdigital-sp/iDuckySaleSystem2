import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { amountDueNow, withLog, type Order } from "@/lib/admin-data";
import { notifyCustomerLogged, orderLink, statusFlex } from "@/lib/server/notify";
import { SITE_URL } from "@/lib/shop-info";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 💳 ตามเก็บ "ยอดคงเหลือ" ของออเดอร์มัดจำ — รันทุกเช้าจาก netlify/functions/balance-due.mjs
 *
 * ทำไมต้องมี: เดิมระบบบอกยอดคงเหลือกับลูกค้าครั้งเดียวตอนรับมัดจำ หลังจากนั้นเงียบ
 * ลูกค้าลืมโอน = ของทำเสร็จแล้วส่งไม่ได้ ค้างอยู่หน้าร้าน กว่าจะรู้ก็ตอนจะแพ็ค
 *
 * ทำ 2 อย่าง: ทวงลูกค้าทาง LINE (เว้นระยะ ?days วัน ไม่ทวงรัว) + สรุปยอดค้างทั้งหมดส่ง LINE ร้าน
 * ป้องกันคนนอกเรียกด้วย ?key= (CRON_SECRET) · ?dry=1 = ดูรายการเฉย ๆ ไม่ส่งจริง
 */
const DEFAULT_GAP_DAYS = 3;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret)
    return NextResponse.json({ error: "ไม่มีสิทธิ์เรียก" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const dry = url.searchParams.get("dry") === "1";
  const gapDays = Math.max(1, Number(url.searchParams.get("days")) || DEFAULT_GAP_DAYS);
  const gapCutoff = Date.now() - gapDays * 86_400_000;

  const { data, error } = await sb.from("orders").select("id,data");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ออเดอร์มัดจำที่รับงวดแรกแล้วแต่ยังไม่ครบ 100% (ยกเลิกแล้วไม่ต้องตาม)
  const due = (data ?? [])
    .map((r) => r.data as Order)
    .filter((o) => o.deposit?.firstPaidAt && !o.deposit.settledAt && o.status !== "ยกเลิก")
    .map((o) => ({
      id: o.id,
      customer: o.customer,
      status: o.status,
      balance: amountDueNow(o),
      remindedAt: o.deposit!.balanceRemindedAt ?? null,
      hasSlip: !!o.deposit!.balanceSlipPath, // แนบสลิปมาแล้วแต่แอดมินยังไม่กดยืนยัน
      order: o,
    }))
    .sort((a, b) => b.balance - a.balance);

  // ── ทวงลูกค้า (เฉพาะรายที่ยังไม่ส่งสลิปมา และเว้นระยะจากครั้งก่อนแล้ว) ──
  const remind = due.filter((d) => !d.hasSlip && (!d.remindedAt || new Date(d.remindedAt).getTime() < gapCutoff));
  let reminded = 0;
  const failed: { id: string; reason: string }[] = [];
  if (!dry) {
    for (const d of remind) {
      const link = orderLink(SITE_URL, d.order);
      // ตัวนี้ลง log ผลการส่งให้แล้ว (สำเร็จ/ถูกบล็อก/ไม่รู้ LINE ของลูกค้า)
      const sent = await notifyCustomerLogged(sb, d.order, statusFlex(d.order, link), `ทวงยอดคงเหลือ ${d.balance.toLocaleString()} บาท`);
      if (!sent.ok) failed.push({ id: d.id, reason: sent.reason ?? "ส่งไม่สำเร็จ" });
      // ส่งไม่ถึงก็ไม่ต้องนับว่าทวงแล้ว — รอบหน้าจะได้ลองใหม่ ไม่ใช่เงียบไป 3 วัน
      if (!sent.ok) continue;
      // อ่านสด ๆ ก่อนเขียน — notifyCustomerLogged เพิ่ง append log ลงไป อย่าทับของเขา
      const { data: fresh } = await sb.from("orders").select("data").eq("id", d.id).maybeSingle();
      const base = (fresh?.data as Order | undefined) ?? d.order;
      const next = withLog(
        { ...base, deposit: { ...base.deposit!, balanceRemindedAt: new Date().toISOString() } },
        "ระบบ",
        "ทวงยอดคงเหลืออัตโนมัติ",
        `คงเหลือ ${d.balance} บาท`
      );
      await sb.from("orders").update({ data: next }).eq("id", d.id);
      reminded += 1;
    }
  }

  // ── สรุปให้ร้านรู้ว่ามีเงินค้างอยู่เท่าไร (ส่งครั้งเดียวต่อวัน) ──
  const total = due.reduce((s, d) => s + d.balance, 0);
  const to = process.env.LINE_ADMIN_ALERT_TO || process.env.LINE_STOCK_ALERT_TO;
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  let notifiedShop = false;
  if (!dry && due.length > 0 && to && token) {
    const lines = due
      .slice(0, 15)
      .map((d) => `• ${d.id} · ${d.customer} — ค้าง ${d.balance.toLocaleString()} บาท${d.hasSlip ? " (มีสลิปรอตรวจ)" : ""}`)
      .join("\n");
    try {
      await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to,
          messages: [
            {
              type: "text",
              text: `💳 ยอดค้างเก็บ (มัดจำ 50%) ${due.length} ออเดอร์ รวม ${total.toLocaleString()} บาท\n${lines}${
                due.length > 15 ? `\n…และอีก ${due.length - 15} ออเดอร์` : ""
              }\n\nดูทั้งหมด: ${SITE_URL}/admin/orders`,
            },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      notifiedShop = true;
    } catch {
      /* แจ้งไม่ได้ก็ไม่พัง — เช้าถัดไปแจ้งใหม่ */
    }
  }

  return NextResponse.json({
    ok: true,
    dry,
    due: due.map(({ order: _o, ...rest }) => rest),
    totalBalance: total,
    willRemind: remind.map((d) => d.id),
    reminded,
    failed, // ส่งไม่ถึงใครบ้าง + เพราะอะไร (ลูกค้าบล็อก / ไม่รู้ LINE / โควตาหมด)
    notifiedShop,
  });
}
