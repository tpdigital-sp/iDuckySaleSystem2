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

  type Row = { userId: string; name: string; picture?: string; lastSeen?: string };
  const out: Row[] = [];
  try {
    // ยังไม่พิมพ์อะไร → โชว์ "คนที่คุยล่าสุด" ให้เลือกเลย (ส่วนใหญ่คนที่เพิ่งคุยคือคนที่กำลังจะผูก)
    if (q.length < 2) {
      const snap = await db.collection(CHAT_COLLECTION).orderBy("lastSeen", "desc").limit(LIMIT).get();
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
      return NextResponse.json({ customers: out, recent: true });
    }
    // พิมพ์ userId มาตรง ๆ → ดึงใบเดียว
    if (/^U[0-9a-f]{32}$/i.test(q)) {
      const d = await db.collection(CHAT_COLLECTION).doc(q).get();
      if (d.exists)
        out.push({ userId: d.id, name: (d.get("displayName") as string) || "(ไม่มีชื่อ)", picture: d.get("pictureUrl") as string });
    } else {
      const lower = q.toLowerCase();
      // 1) ขึ้นต้นด้วยคำค้น — ใช้ดัชนีของ Firestore เร็ว
      const pre = await db.collection(CHAT_COLLECTION).orderBy("nameLower").startAt(lower).endAt(lower + "\uf8ff").limit(LIMIT).get();
      const seen = new Set<string>();
      const push = (d: FirebaseFirestore.QueryDocumentSnapshot) => {
        const id = (d.get("userId") as string) || d.id;
        if (seen.has(id)) return;
        seen.add(id);
        const ls = d.get("lastSeen") as { _seconds?: number; toDate?: () => Date } | undefined;
        const at = ls?.toDate ? ls.toDate().toISOString() : ls?._seconds ? new Date(ls._seconds * 1000).toISOString() : undefined;
        out.push({ userId: id, name: (d.get("displayName") as string) || "(ไม่มีชื่อ)", picture: d.get("pictureUrl") as string, lastSeen: at });
      };
      pre.forEach(push);
      // 2) ยังไม่ครบ → หา "มีคำค้นอยู่ตรงไหนก็ได้ในชื่อ" (อีโมจิ/ชื่อเล่นมักอยู่ท้ายชื่อ)
      //    Firestore ทำ contains ไม่ได้ → สแกนแค่ 2 ฟิลด์เบา ๆ ในหน่วยความจำ แล้วเรียงตามคุยล่าสุด
      if (out.length < LIMIT) {
        const all = await db.collection(CHAT_COLLECTION).select("userId", "displayName", "pictureUrl", "nameLower", "lastSeen").get();
        const rest = all.docs
          .filter((d) => {
            const n = ((d.get("nameLower") as string) || (d.get("displayName") as string) || "").toLowerCase();
            const id = (d.get("userId") as string) || d.id;
            return !seen.has(id) && n.includes(lower);
          })
          .sort((a, b) => {
            const ta = (a.get("lastSeen") as { _seconds?: number } | undefined)?._seconds ?? 0;
            const tb = (b.get("lastSeen") as { _seconds?: number } | undefined)?._seconds ?? 0;
            return tb - ta;
          })
          .slice(0, LIMIT - out.length);
        rest.forEach(push);
      }
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  return NextResponse.json({ customers: out });
}
