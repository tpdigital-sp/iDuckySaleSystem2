import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { CHAT_COLLECTION, getChatFirestore } from "@/lib/server/firebase-admin";

export const runtime = "nodejs";

/**
 * ค้นหาลูกค้าจาก "คลังแชท LINE" ของร้าน (Firestore: ordersure/line-conversations)
 * ไว้ให้พนักงานผูก LINE กับออเดอร์ได้ในหน้าออเดอร์เลย ไม่ต้องสลับไปเปิดระบบแชทแล้วค๊อป userId
 *
 * ค้นแบบ "มีคำนี้อยู่ตรงไหนของชื่อก็ได้" — ชื่อ LINE มักเอาอีโมจิ/ชื่อเล่นไว้ท้ายชื่อ
 * ไม่พิมพ์อะไร = โชว์คนที่คุยกับร้านล่าสุด · พิมพ์ userId (U…) = ดึงคนนั้นตรง ๆ
 */
const LIMIT = 12;
/** อายุแคชรายชื่อในหน่วยความจำ — กันอ่าน Firestore ทั้งคอลเลกชันทุกครั้งที่พิมพ์ */
const CACHE_MS = 5 * 60 * 1000;

type Row = { userId: string; name: string; picture?: string; lastSeen?: string };
let cache: { at: number; rows: (Row & { key: string })[] } | null = null;

/**
 * ทำข้อความให้เทียบกันได้จริง ก่อนเอาไปหา
 *  - NFC: รวมตัวอักษรที่เขียนได้หลายแบบให้เป็นแบบเดียว (ภาษาไทย/ยุโรปที่มีวรรณยุกต์)
 *  - ตัด variation selector (U+FE0E/U+FE0F): "❤️" ที่คีย์บอร์ดพิมพ์ ≠ "❤" ที่บางคนใช้ตั้งชื่อ
 *    ไม่ตัด = พิมพ์ ❤️ แล้วหาคนที่ใช้ ❤ ไม่เจอ (วัดจริงกับคลังแชท: พลาด 7 คน)
 *  - ตัดโทนสีผิว (U+1F3FB–U+1F3FF): พิมพ์ 🫰 ให้เจอ 🫰🏻 ด้วย
 *  - lowercase: อังกฤษพิมพ์เล็ก/ใหญ่ก็เจอ
 */
function norm(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[︎️]/g, "")
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "");
}

/** อ่านรายชื่อทั้งคลังแชทมาทำดัชนีในหน่วยความจำ (มีแคช) */
async function loadIndex(db: FirebaseFirestore.Firestore, fresh: boolean) {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const snap = await db.collection(CHAT_COLLECTION).select("userId", "displayName", "pictureUrl", "lastSeen").get();
  const rows = snap.docs.map((d) => {
    const ls = d.get("lastSeen") as { _seconds?: number; toDate?: () => Date } | undefined;
    const at = ls?.toDate ? ls.toDate().toISOString() : ls?._seconds ? new Date(ls._seconds * 1000).toISOString() : undefined;
    const name = (d.get("displayName") as string) || "(ไม่มีชื่อ)";
    return { userId: (d.get("userId") as string) || d.id, name, picture: d.get("pictureUrl") as string, lastSeen: at, key: norm(name) };
  });
  // เรียงคนคุยล่าสุดไว้บนสุดตั้งแต่ตอนทำดัชนี — ผลค้นหาจะได้เรียงมาให้เลย
  rows.sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
  cache = { at: Date.now(), rows };
  return rows;
}

export async function GET(req: Request) {
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  const db = getChatFirestore();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firebase" }, { status: 503 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const fresh = url.searchParams.get("fresh") === "1"; // เพิ่งทักลูกค้าในแชท → ดึงใหม่ ไม่เอาแคช

  try {
    // พิมพ์ userId มาตรง ๆ → ดึงใบเดียว (ไม่ต้องใช้ดัชนี)
    if (/^U[0-9a-f]{32}$/i.test(q)) {
      const d = await db.collection(CHAT_COLLECTION).doc(q).get();
      const customers: Row[] = d.exists
        ? [{ userId: d.id, name: (d.get("displayName") as string) || "(ไม่มีชื่อ)", picture: d.get("pictureUrl") as string }]
        : [];
      return NextResponse.json({ customers, total: customers.length });
    }

    const rows = await loadIndex(db, fresh);
    // ไม่พิมพ์อะไร → คนที่คุยล่าสุด · พิมพ์แล้ว → หาจากทุกตำแหน่งของชื่อ
    const hits = q.length < 1 ? rows : rows.filter((r) => r.key.includes(norm(q)));
    return NextResponse.json({
      customers: hits.slice(0, LIMIT).map(({ key: _k, ...rest }) => rest),
      total: hits.length, // เจอทั้งหมดกี่คน (โชว์แค่ LIMIT) — หน้าเว็บเอาไปบอกให้พิมพ์แคบลง
      recent: q.length < 1,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
