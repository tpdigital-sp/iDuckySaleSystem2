import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { WHT_TABLE, remindCerts, withFileUrls } from "@/lib/server/wht-db";
import type { WhtCert } from "@/lib/wht";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 📣 ทวงใบหักทางไลน์ — { ids: ["INV…"] } · รวมเป็นข้อความเดียวต่อไลน์ลูกค้า */
export async function POST(req: Request) {
  const gate = await requirePerm("orders.money");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { ids?: string[] } | null;
  const ids = [...new Set((body?.ids ?? []).filter((x) => typeof x === "string"))].slice(0, 150);
  if (!ids.length) return NextResponse.json({ error: "ยังไม่ได้เลือกใบ" }, { status: 400 });
  const { data, error } = await sb.from(WHT_TABLE).select("data").in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const r = await remindCerts(sb, (data ?? []).map((d) => d.data as WhtCert), gate.actor.name || gate.actor.username);
  return NextResponse.json({ ok: true, sent: r.sent, sentTo: r.sentTo, failed: r.failed, certs: await withFileUrls(sb, r.updated) });
}
