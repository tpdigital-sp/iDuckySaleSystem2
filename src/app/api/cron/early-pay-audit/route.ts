import { NextResponse } from "next/server";
import { pushShopAlert } from "@/lib/server/line-alert";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { scanEarlyPayMisses } from "@/lib/server/early-pay-audit";
import { SITE_URL } from "@/lib/shop-info";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 🔍 ตรวจ "ส่วนลดโอนไวหาย" ทุกเช้า — รันจาก netlify/functions/early-pay-audit.mjs
 *
 * ทำไม (เจ้าของร้านถาม 14 ก.ย. 69 "จะทำยังไงไม่ให้กลับมาอีก"): กฎย้ายมาอยู่ที่ประตูเขียนออเดอร์แล้ว
 * แต่ชั้นกันแบบนั้นกันได้เฉพาะความผิดพลาดแบบที่เรานึกออก · ตัวนี้ดู "ผลจริงในฐาน" จึงจับได้แม้พังด้วยเหตุอื่น
 * เจอ = ยิงเข้าไลน์ร้านพร้อมเลข OD ให้แอดมินเติมส่วนลดเอง (ไม่แก้ให้อัตโนมัติ — เงินของลูกค้า ให้คนตัดสิน)
 *
 * ?key= (CRON_SECRET) · ?days=3 ย้อนหลังกี่วัน · ?dry=1 ดูเฉย ๆ ไม่ยิงไลน์
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret)
    return NextResponse.json({ error: "ไม่มีสิทธิ์เรียก" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const dry = url.searchParams.get("dry") === "1";
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days")) || 3));
  const { checked, misses } = await scanEarlyPayMisses(sb, days);

  let alerted = false;
  if (misses.length && !dry) {
    const baht = misses.reduce((s, m) => s + m.due, 0);
    alerted = (
      await pushShopAlert({
        tone: "#D97706",
        title: "⚡ ส่วนลดโอนไวหาย",
        headline: "ใบพวกนี้เข้าเงื่อนไขแต่ระบบไม่ได้ลดให้ — เช็คว่ากติกาตรงไหนหลุด",
        heroLabel: "ใบที่ตกหล่น",
        hero: `${misses.length} ใบ`,
        rows: [
          { label: "รวมส่วนลดที่ควรได้", value: `฿${baht.toLocaleString("th-TH")}`, bold: true },
          { label: "ตรวจย้อนหลัง", value: `${days} วัน (${checked} ใบที่เข้าเกณฑ์)` },
        ],
        bullets: misses.slice(0, 12).map((m) => `${m.id} · ${m.customer} — ควรลด ฿${m.due} (มาจาก${m.via})`),
        button: { label: "เปิดรายการออเดอร์", uri: `${SITE_URL}/admin/orders` },
        alt: `⚡ ส่วนลดโอนไวหาย ${misses.length} ใบ`,
      })
    ).ok;
  }

  return NextResponse.json({ ok: true, dry, days, checked, misses, alerted });
}
