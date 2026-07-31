import { NextResponse } from "next/server";
import { listStock } from "@/lib/server/stock";

export const runtime = "nodejs";

/**
 * 🛒 เช็คของถึงจุดต้องสั่ง แล้วแจ้ง LINE ร้าน — ถูกเรียกทุกเช้าโดย Netlify scheduled function
 * ป้องกันคนนอกเรียกด้วย ?key= (CRON_SECRET) · ผู้รับ = LINE_STOCK_ALERT_TO (LINE userId ของร้าน)
 * ยังไม่ตั้งผู้รับ → คืนรายการเฉย ๆ (เรียกดูเองได้)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret)
    return NextResponse.json({ error: "ไม่มีสิทธิ์เรียก" }, { status: 401 });

  const { items, moves } = await listStock();

  // ความเร็วใช้ 30 วันหลัง (ขาย + เบิกผลิต) → จุดสั่งซื้อ = ที่ตั้งไว้ หรือ ใช้/วัน × วันรอของ × 1.2
  const cutoff = Date.now() - 30 * 86400_000;
  const usage = new Map<string, number>();
  for (const m of moves) {
    if (m.qty >= 0 || (m.reason !== "ขาย" && m.reason !== "เบิกผลิต")) continue;
    if (new Date(m.at).getTime() < cutoff) continue;
    usage.set(m.itemId, (usage.get(m.itemId) ?? 0) + Math.abs(m.qty));
  }
  const need = items
    .map((it) => {
      const perDay = (usage.get(it.id) ?? 0) / 30;
      const suggest = perDay > 0 && it.leadTimeDays ? Math.ceil(perDay * it.leadTimeDays * 1.2) : null;
      const point = it.reorderPoint ?? suggest;
      const daysLeft = perDay > 0 ? Math.floor(Math.max(0, it.balance) / perDay) : null;
      return point != null && it.balance <= point ? { name: it.name, balance: it.balance, unit: it.unit, point, daysLeft } : null;
    })
    .filter(Boolean) as { name: string; balance: number; unit: string; point: number; daysLeft: number | null }[];

  let notified = false;
  const to = process.env.LINE_STOCK_ALERT_TO;
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (need.length > 0 && to && token) {
    const lines = need
      .map((n) => `• ${n.name} เหลือ ${n.balance.toLocaleString()} ${n.unit} (จุดสั่ง ≤${n.point.toLocaleString()}${n.daysLeft != null ? ` · ~${n.daysLeft} วันหมด` : ""})`)
      .join("\n");
    try {
      await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to,
          messages: [{ type: "text", text: `🛒 สต๊อกถึงจุดต้องสั่งของ ${need.length} รายการ\n${lines}\n\nดูรายละเอียด: https://iduckystore.com/admin/stock` }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      notified = true;
    } catch {
      /* แจ้งไม่ได้ก็ไม่พัง — เช้าถัดไปแจ้งใหม่ */
    }
  }
  return NextResponse.json({ ok: true, needOrder: need, notified });
}
