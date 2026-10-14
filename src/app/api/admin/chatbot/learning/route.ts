import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getChatFirestore } from "@/lib/server/firebase-admin";
import { listLearning, skipLearning, teachFromLearning } from "@/lib/server/bot-learning";

export const runtime = "nodejs";

/**
 * 🎓 บอทเรียนรู้ (หน้า /admin/chatbot/learning · 14 ต.ค. 69)
 *   GET ?status=open|done          → เรื่องที่รอสอน (พร้อมคำตอบที่แอดมินตอบลูกค้าจริง) / ที่สอนแล้ว-ข้าม
 *   POST { action: "teach", id, title, content } → เพิ่มเข้าคลังความรู้ + ส่งเข้า n8n + ปิดเรื่อง
 *   POST { action: "skip", id }                   → ไม่ต้องสอน (เช่น เป็นเรื่องเฉพาะลูกค้ารายนั้น)
 * สิทธิ์: ตอบลูกค้า LINE (chat.reply) หรือแก้ออเดอร์ (orders.edit — สิทธิ์เดียวกับหน้า 📚 คลังความรู้)
 */
const PERMS = ["chat.reply", "orders.edit"] as const;

export async function GET(req: Request) {
  const gate = await requirePerm([...PERMS]);
  if (gate.res) return gate.res;
  const db = getChatFirestore();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firestore" }, { status: 503 });
  const status = new URL(req.url).searchParams.get("status") === "done" ? "done" : "open";
  const r = await listLearning(db, status);
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const gate = await requirePerm([...PERMS]);
  if (gate.res) return gate.res;
  const db = getChatFirestore();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firestore" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string; title?: string; content?: string };
  const id = String(b.id ?? "").trim();
  if (!/^U[0-9a-f]{32}_[A-Za-z0-9]{10,40}$/.test(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const who = { user: gate.actor.username, name: gate.actor.name || gate.actor.username };
  if (b.action === "teach") {
    const r = await teachFromLearning(db, id, { title: String(b.title ?? ""), content: String(b.content ?? ""), who });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, kbId: r.kbId, saved: r.pushed ? "บอทเรียนรู้แล้ว — เพิ่มเข้าคลังความรู้เรียบร้อย" : "บันทึกเข้าคลังความรู้แล้ว แต่ส่งเข้าบอทไม่สำเร็จ — เปิดความรู้นี้ในหน้า 📚 คลังความรู้แล้วกดบันทึกซ้ำ" });
  }
  if (b.action === "skip") {
    const ok = await skipLearning(db, id, who.name);
    return ok ? NextResponse.json({ ok: true, saved: "ข้ามเรื่องนี้แล้ว" }) : NextResponse.json({ error: "เรื่องนี้ปิดไปแล้ว" }, { status: 409 });
  }
  return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
}
