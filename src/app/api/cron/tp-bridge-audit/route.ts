import { NextResponse } from "next/server";
import { pushShopAlert } from "@/lib/server/line-alert";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { healTPBridgeGaps, scanTPBridgeGaps } from "@/lib/server/tp-bridge-audit";
import { SITE_URL } from "@/lib/shop-info";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 🩹 ตรวจ "ออเดอร์ชำระแล้วแต่ไม่ขึ้นแท็บ 🛒 iDucky Store ของ msVerify" — รันจาก netlify/functions/tp-bridge-audit.mjs
 *
 * ทำไม (พนักงานแจ้ง 14 ก.ย. 69 — OD-260910-4381 ชำระ 10 ก.ย. ไม่โผล่เลย):
 * เรคอร์ดถูกยิงหลังตอบ HTTP กลับไปแล้ว · Netlify แช่แข็งเครื่องทันทีที่ตอบเสร็จ → งานเบื้องหลังตายกลางทางได้
 * แก้ที่ต้นทางแล้ว (await ให้เสร็จก่อนตอบทุกจุด) ตัวนี้เป็นตาข่ายชั้นสอง — ดูผลจริงในฐานแล้ว "เติมให้เอง"
 * พร้อมยิงเข้าไลน์ร้าน เพื่อให้รู้ว่ายังมีหลุดอยู่ (ถ้าเงียบ = ชั้นแรกเอาอยู่)
 *
 * ?key= (CRON_SECRET) · ?days=3 ย้อนหลังกี่วัน · ?dry=1 ดูเฉย ๆ ไม่เติม/ไม่ยิงไลน์
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (!secret || url.searchParams.get("key") !== secret) return NextResponse.json({ error: "ไม่มีสิทธิ์เรียก" }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const dry = url.searchParams.get("dry") === "1";
  // ย้อนหลังได้ไกลสุด 30 วัน — ไกลกว่านั้นเสี่ยงไปสร้างเรคอร์ดใบทดสอบเก่าที่ฝั่ง Admin ตั้งใจลบทิ้ง
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days")) || 3));
  const { checked, expected, missing, skipped, skipRegistryDown } = await scanTPBridgeGaps(sb, days);

  const healed = dry ? [] : await healTPBridgeGaps(sb, missing);

  if (healed.length) {
    await pushShopAlert({
      tone: "#0EA5E9",
      title: "🩹 เติมออเดอร์เข้า msVerify ย้อนหลัง",
      headline: "ใบพวกนี้ชำระแล้วแต่ไม่ขึ้นแท็บ 🛒 iDucky Store — ระบบเติมให้แล้ว (ประทับวัน/เวลาที่รับเงินจริง)",
      heroLabel: "ใบที่เติม",
      hero: `${healed.length} ใบ`,
      rows: [
        { label: "ตรวจย้อนหลัง", value: `${days} วัน (${checked} ใบที่มีเงินเข้า · ${expected} เรคอร์ด)` },
        { label: "ต้องทำต่อ", value: "จับคู่ยอดในหน้ารายการวันนี้ตามปกติ" },
      ],
      bullets: missing.slice(0, 12).map((m) => `${m.docId} · ${m.customer} — รับเงิน ${m.at.slice(0, 16).replace("T", " ")}`),
      button: { label: "เปิดรายการออเดอร์", uri: `${SITE_URL}/admin/orders` },
      alt: `🩹 เติมออเดอร์เข้า msVerify ${healed.length} ใบ`,
    });
  }

  return NextResponse.json({ ok: true, dry, days, checked, expected, missing, skipped, skipRegistryDown, healed });
}
