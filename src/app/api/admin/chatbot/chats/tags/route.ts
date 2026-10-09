import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getChatFirestore } from "@/lib/server/firebase-admin";
import { sanitizeTags } from "@/lib/chat-tags";
import { CHAT_TAGS_DOC, loadChatTags } from "@/lib/server/chat-tags-store";

/**
 * 🏷 รายการป้ายลูกค้าแบบกำหนดเอง — Firestore ordersure `settings/chat-tags` { items: ChatTag[] }
 * GET  → { items }  (ไม่มีเอกสาร = DEFAULT_TAGS 3 ป้ายเดิม)
 * POST { items } → บันทึกทั้งชุด (สิทธิ์ chat.reply) · ลบป้ายไม่ลบออกจากลูกค้า แค่ไม่แสดง
 */
export async function GET() {
  const gate = await requirePerm(["reports.view", "chat.reply"]);
  if (gate.res) return gate.res;
  return NextResponse.json({ items: await loadChatTags() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const gate = await requirePerm("chat.reply");
  if (gate.res) return gate.res;
  const db = getChatFirestore();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firestore" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { items?: unknown };
  const items = sanitizeTags(b.items);
  if (!items.length) return NextResponse.json({ error: "ต้องมีป้ายอย่างน้อย 1 อัน (ชื่อห้ามว่าง)" }, { status: 400 });
  await db.collection(CHAT_TAGS_DOC.col).doc(CHAT_TAGS_DOC.id).set({ items, updatedAt: new Date(), updatedBy: gate.actor.name || gate.actor.username }, { merge: true });
  return NextResponse.json({ ok: true, items, saved: `บันทึกป้าย ${items.length} อันแล้ว` });
}
