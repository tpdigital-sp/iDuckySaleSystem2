import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { CHAT_COLLECTION, getChatFirestore } from "@/lib/server/firebase-admin";

export const runtime = "nodejs";

/**
 * ค้นหาลูกค้าจาก "คลังแชท LINE" ของร้าน (Firestore: ordersure/line-conversations)
 * ไว้ให้พนักงานผูก LINE กับออเดอร์ได้ในหน้าออเดอร์เลย ไม่ต้องสลับไปเปิดระบบแชทแล้วค๊อป userId
 *
 * ค้นจาก nameLower (ชื่อ LINE พิมพ์เล็ก) แบบขึ้นต้นด้วย — ตรงกับที่หน้าคลังแชทใช้
 * ถ้าพิมพ์เป็น userId (U…) ก็ดึงตรงจาก doc id ให้เลย
 */
const LIMIT = 8;

export async function GET(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  const db = getChatFirestore();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firebase" }, { status: 503 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ customers: [] });

  type Row = { userId: string; name: string; picture?: string; lastSeen?: string };
  const out: Row[] = [];
  try {
    // พิมพ์ userId มาตรง ๆ → ดึงใบเดียว
    if (/^U[0-9a-f]{32}$/i.test(q)) {
      const d = await db.collection(CHAT_COLLECTION).doc(q).get();
      if (d.exists)
        out.push({ userId: d.id, name: (d.get("displayName") as string) || "(ไม่มีชื่อ)", picture: d.get("pictureUrl") as string });
    } else {
      const lower = q.toLowerCase();
      const snap = await db
        .collection(CHAT_COLLECTION)
        .orderBy("nameLower")
        .startAt(lower)
        .endAt(lower + "\uf8ff") // \uf8ff = อักขระสูงสุด → ได้ทุกชื่อที่ "ขึ้นต้นด้วย" คำค้น
        .limit(LIMIT)
        .get();
      snap.forEach((d) => {
        const ls = d.get("lastSeen") as { _seconds?: number; toDate?: () => Date } | undefined;
        const at = ls?.toDate ? ls.toDate().toISOString() : ls?._seconds ? new Date(ls._seconds * 1000).toISOString() : undefined;
        out.push({
          userId: (d.get("userId") as string) || d.id,
          name: (d.get("displayName") as string) || "(ไม่มีชื่อ)",
          picture: d.get("pictureUrl") as string,
          lastSeen: at,
        });
      });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ customers: out });
}
