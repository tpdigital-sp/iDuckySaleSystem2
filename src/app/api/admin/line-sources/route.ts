import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { clearLineSources, loadLineSources } from "@/lib/server/line-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** เลขห้องแชท LINE ที่ /api/line/webhook จดไว้ — หน้า /admin/line-groups เรียกใช้ */
export async function GET() {
  const gate = await requirePerm("settings.manage");
  if (gate.res) return gate.res;
  return NextResponse.json({
    sources: await loadLineSources(),
    /** ตั้ง env ครบหรือยัง (ไม่ส่งค่าจริงออกไป แค่บอกว่าตั้งแล้ว/ยัง) */
    env: {
      channelSecret: !!process.env.LINE_MESSAGING_CHANNEL_SECRET,
      accessToken: !!process.env.LINE_MESSAGING_ACCESS_TOKEN,
      /** ส่งต่อให้บอท n8n ทำงานเสมอ (ค่าตั้งต้นฝังในโค้ด) — env มีไว้ทับตอนย้าย workflow */
      forward: true,
      alertTo: (process.env.LINE_STOCK_ALERT_TO ?? "").slice(0, 1) || "",
    },
  });
}

/** คัดลอกเลขไปใส่ Netlify แล้ว — ล้างทิ้งได้ */
export async function DELETE() {
  const gate = await requirePerm("settings.manage");
  if (gate.res) return gate.res;
  await clearLineSources();
  return NextResponse.json({ ok: true });
}
