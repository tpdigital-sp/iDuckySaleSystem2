import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { classifyRoom } from "@/lib/server/chat-urgency";

export const runtime = "nodejs";

/** 🤖 ปุ่ม "ประเมินใหม่" ในแผง ℹ️ — ให้ AI ประเมินห้องนี้ทันที (ทับป้ายระดับเดิมได้ เพราะแอดมินกดเอง) */
export async function POST(req: Request) {
  const gate = await requirePerm("chat.reply");
  if (gate.res) return gate.res;
  const b = (await req.json().catch(() => ({}))) as { id?: string };
  const id = String(b.id ?? "");
  if (!/^U[0-9a-f]{32}$/.test(id)) return NextResponse.json({ error: "รหัสห้องไม่ถูกต้อง" }, { status: 400 });
  const r = await classifyRoom(id, { force: true, respectAdmin: false });
  if (!r.key) return NextResponse.json({ error: r.skipped === "no-customer-message" ? "ห้องนี้ยังไม่มีข้อความลูกค้า" : `ประเมินไม่ได้ (${r.skipped})` }, { status: 422 });
  return NextResponse.json({ ok: true, ...r });
}
