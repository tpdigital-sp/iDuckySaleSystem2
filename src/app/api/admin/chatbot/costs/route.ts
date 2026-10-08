import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getChatFirestore } from "@/lib/server/firebase-admin";
import { readAiDashboard, writeAiSettings, type AiCostSettings } from "@/lib/server/ai-usage";
import { shopQuota, type LineQuota } from "@/lib/server/line-quota";

export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * 💸 หลังบ้านของหน้า /admin/chatbot/costs — แดชบอร์ดค่าใช้จ่าย AI แบบสด
 *
 * GET  ?days=31&feed=40  → ยอดรายวัน (เวลาไทย) + คำขอล่าสุด + ตั้งค่า + โควตา LINE OA ของร้าน
 *      หน้าจอยิงทุก 10 วิ — อ่านแค่ ≤ 31 เอกสารรายวัน + 40 เรคอร์ดล่าสุด (ไม่กวาดเรคอร์ดดิบทั้งเดือน)
 * POST {thbPerUsd, monthlyBudgetThb, fixedCosts[]} → บันทึกตั้งค่า (สิทธิ์ตั้งค่าระบบ)
 *
 * สิทธิ์ดู = reports.view (ตัวเลขเงินของร้าน ชุดเดียวกับรายงานยอดขาย) ไม่ใช่ orders.edit ของหน้าอื่นในหมวด
 */
export async function GET(req: Request) {
  const gate = await requirePerm("reports.view");
  if (gate.res) return gate.res;
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? 31) || 31;
  const feed = Number(url.searchParams.get("feed") ?? 40) || 40;
  try {
    const [dash, line] = await Promise.all([
      readAiDashboard({ days, feed }),
      // โควตา LINE แคช 5 นาทีในตัวอยู่แล้ว — ยิงทุก 10 วิไม่เปลืองคำขอ LINE
      shopQuota().catch((): LineQuota | null => null),
    ]);
    return NextResponse.json({ ...dash, line }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: `โหลดบัญชีค่าใช้จ่ายไม่ได้: ${(e as Error).message}` }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const gate = await requirePerm("settings.manage");
  if (gate.res) return gate.res;
  const db = getChatFirestore();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firebase (FIREBASE_SERVICE_ACCOUNT_B64)" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Partial<AiCostSettings> | null;
  if (!body) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v));
  const thbPerUsd = num(body.thbPerUsd);
  const budget = num(body.monthlyBudgetThb);
  if (!(thbPerUsd > 0 && thbPerUsd < 1000)) return NextResponse.json({ error: "อัตราแลกเปลี่ยนต้องเป็นตัวเลขบาทต่อ 1 ดอลลาร์ (เช่น 33)" }, { status: 400 });
  if (!(budget >= 0)) return NextResponse.json({ error: "งบต่อเดือนต้องเป็น 0 หรือมากกว่า" }, { status: 400 });
  const fixedCosts = (Array.isArray(body.fixedCosts) ? body.fixedCosts : [])
    .map((f) => ({ name: String((f as { name?: unknown })?.name ?? "").trim().slice(0, 60), thb: Math.max(0, num((f as { thb?: unknown })?.thb) || 0) }))
    .filter((f) => f.name)
    .slice(0, 20);
  const s: AiCostSettings = { thbPerUsd: Math.round(thbPerUsd * 100) / 100, monthlyBudgetThb: Math.round(budget), fixedCosts };
  try {
    await writeAiSettings(db, s);
    return NextResponse.json({ ok: true, settings: s });
  } catch (e) {
    return NextResponse.json({ error: `บันทึกไม่ได้: ${(e as Error).message}` }, { status: 502 });
  }
}
