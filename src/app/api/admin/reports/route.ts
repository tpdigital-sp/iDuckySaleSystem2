import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderCostsInRange } from "@/lib/server/stock";
import { bkkParts } from "@/lib/bangkok-time";
import { buildReport, previousRange, shiftDay } from "@/lib/reports";
import type { Order } from "@/lib/admin-data";
import type { Quote } from "@/lib/quotes";

export const runtime = "nodejs";

/** YYYY-MM-DD หรือไม่ */
const isYmd = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * ⚠️ วันที่ที่ใช้จัดกลุ่มคือ "วันที่บนใบ" (ข้อความไทยใน data.date) ซึ่งกรองใน SQL ไม่ได้
 *    จึงกรองหยาบ ๆ ด้วย created_at (UTC) แล้วค่อยคัดจริงในหน่วยความจำ
 *    เผื่อขอบไว้ 10 วัน — กันใบที่ถูกบันทึกคนละวันกับวันที่บนใบ (เปิดใบข้ามเที่ยงคืน · ใบที่แอดมินคีย์ย้อนหลัง)
 */
const EDGE_DAYS = 10;
/** ตัดสต๊อกตอน "เงินเข้า" ซึ่งห่างจากวันเปิดใบได้หลายวัน (ใบมัดจำ/ใบที่ลูกค้าโอนช้า) → เปิดหน้าต่างกว้างกว่ามาก */
const COST_EDGE_DAYS = 60;
const PAGE = 1000;

/** ดึงทั้งตารางแบบแบ่งหน้า — PostgREST คืนสูงสุด 1000 แถวต่อครั้ง ถ้าไม่วนจะได้ยอดขายขาดแบบเงียบ ๆ */
async function fetchRange<T>(
  sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  table: string,
  fromIso: string,
  toIso: string
): Promise<{ rows: T[]; needsSetup?: boolean; error?: string }> {
  const rows: T[] = [];
  for (let page = 0; page < 40; page++) {
    const { data, error } = await sb
      .from(table)
      .select("data")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message))
        return { rows: [], needsSetup: true };
      return { rows: [], error: error.message };
    }
    const chunk = (data ?? []).map((r) => (r as { data: T }).data).filter(Boolean);
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return { rows };
}

/** วันนี้ตามเวลาไทยเป็น YYYY-MM-DD (เซิร์ฟเวอร์รันเป็น UTC — ห้ามใช้ toISOString ตรง ๆ) */
function todayBkk(): string {
  const p = bkkParts();
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/**
 * 📈 รายงานยอดขาย/กำไร — คิดฝั่งเซิร์ฟเวอร์แล้วส่งแต่ผลสรุป
 * GET /api/admin/reports?from=2026-09-01&to=2026-09-15
 */
export async function GET(req: Request) {
  const gate = await requirePerm("reports.view");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  const url = new URL(req.url);
  const qFrom = url.searchParams.get("from");
  const qTo = url.searchParams.get("to");
  const today = todayBkk();
  const to = isYmd(qTo) ? qTo : today;
  const from = isYmd(qFrom) ? qFrom : `${to.slice(0, 7)}-01`;
  if (from > to) return NextResponse.json({ error: "วันเริ่มต้นอยู่หลังวันสิ้นสุด" }, { status: 400 });

  // ต้องดึงช่วงก่อนหน้ามาด้วย — ทุกตัวเลขในหน้ารายงานมีตัวเทียบเสมอ
  const prev = previousRange(from, to);
  const wideFrom = `${shiftDay(prev.from, -EDGE_DAYS)}T00:00:00+07:00`;
  const wideTo = `${shiftDay(to, EDGE_DAYS)}T23:59:59+07:00`;

  const [ordersRes, quotesRes, costs] = await Promise.all([
    fetchRange<Order>(sb, "orders", wideFrom, wideTo),
    fetchRange<Quote>(sb, "quotes", wideFrom, wideTo),
    orderCostsInRange(`${shiftDay(prev.from, -COST_EDGE_DAYS)}T00:00:00+07:00`, `${shiftDay(to, COST_EDGE_DAYS)}T23:59:59+07:00`),
  ]);

  if (ordersRes.needsSetup) return NextResponse.json({ needsSetup: true }, { status: 200 });
  if (ordersRes.error) return NextResponse.json({ error: ordersRes.error }, { status: 500 });

  const report = buildReport({
    orders: ordersRes.rows,
    quotes: quotesRes.rows,
    costs,
    from,
    to,
  });
  return NextResponse.json({ ok: true, report, today });
}
