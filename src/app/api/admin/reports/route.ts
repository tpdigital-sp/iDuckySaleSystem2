import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { reportInputs } from "@/lib/server/report-inputs";
import { bkkParts } from "@/lib/bangkok-time";
import { buildReport, previousRange, shiftDay } from "@/lib/reports";

export const runtime = "nodejs";

/** YYYY-MM-DD หรือไม่ */
const isYmd = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * ⚠️ วันที่ที่ใช้จัดกลุ่มคือ "วันที่บนใบ" (ข้อความไทยใน data.date) ซึ่งกรองใน SQL ไม่ได้
 *    จึงกรองหยาบ ๆ ด้วย created_at (UTC) แล้วค่อยคัดจริงในหน่วยความจำ
 *    เผื่อขอบไว้ 10 วัน — กันใบที่ถูกบันทึกคนละวันกับวันที่บนใบ (เปิดใบข้ามเที่ยงคืน · ใบที่แอดมินคีย์ย้อนหลัง)
 */
const EDGE_DAYS = 10;
/**
 * 📅 ใบชำระแล้วเข้าช่วงตาม "วันเงินเข้า" (paidAt) ซึ่งช้ากว่าวันเปิดใบได้หลายสัปดาห์ (ใบบริษัทวางบิล)
 * → ขอบด้านหลังต้องกว้างกว่า (วัด 7 ต.ค. 69: ใบลงวันที่ ก.ย. ที่โอน ต.ค. 27 ใบ) · กรองจริงด้วย reportDayKey ในหน่วยความจำ
 */
const EDGE_DAYS_BACK = 45;
/** ตัดสต๊อกตอน "เงินเข้า" ซึ่งห่างจากวันเปิดใบได้หลายวัน (ใบมัดจำ/ใบที่ลูกค้าโอนช้า) → เปิดหน้าต่างกว้างกว่ามาก */
const COST_EDGE_DAYS = 60;
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
  const t0 = Date.now();
  const gate = await requirePerm("reports.view");
  if (gate.res) return gate.res;
  const tGate = Date.now() - t0;
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
  const wideFrom = `${shiftDay(prev.from, -EDGE_DAYS_BACK)}T00:00:00+07:00`;
  const wideTo = `${shiftDay(to, EDGE_DAYS)}T23:59:59+07:00`;

  // 🪶 ดึงแบบเบา (orders-lite.ts) — ของเดิม select("data") ขนทั้ง log/ลาย 9 MB ต่อการเปิดหน้า 1 ครั้ง = 5–7 วิ
  // 🪶 วัตถุดิบมาจากความจำ (60 วิสด · 15 นาที stale-while-revalidate) — ดู report-inputs.ts · ?fresh=1 ข้ามความจำ
  const inputs = await reportInputs(
    sb,
    {
      wideFrom,
      wideTo,
      costFrom: `${shiftDay(prev.from, -COST_EDGE_DAYS)}T00:00:00+07:00`,
      costTo: `${shiftDay(to, COST_EDGE_DAYS)}T23:59:59+07:00`,
    },
    { fresh: url.searchParams.get("fresh") === "1" }
  );
  if (inputs.needsSetup) return NextResponse.json({ needsSetup: true }, { status: 200 });
  if (inputs.error) return NextResponse.json({ error: inputs.error }, { status: 500 });

  const report = buildReport({ orders: inputs.orders, quotes: inputs.quotes, costs: inputs.costs, from, to });
  const took = { gate: tGate, ...inputs.took, total: Date.now() - t0 };
  if (!inputs.fromCache) console.log(`[reports] ${from}→${to} ${inputs.orders.length} ใบ ผ่าน ${inputs.via}`, took);
  return NextResponse.json({
    ok: true,
    report,
    today,
    /** "view" = วิว orders_lite ทำงาน · "pick" = ยังหยิบจากตาราง orders ตรง ๆ (ช้ากว่า 3–4 เท่า) */
    via: inputs.via,
    /** เวลาที่ชุดข้อมูลนี้ถูกดึงจากฐาน (ISO) — หน้าจอโชว์ "ดึงเมื่อ" จากค่านี้ ไม่ใช่เวลาที่กด */
    cachedAt: new Date(inputs.at).toISOString(),
    fromCache: inputs.fromCache,
    took,
  });
}
