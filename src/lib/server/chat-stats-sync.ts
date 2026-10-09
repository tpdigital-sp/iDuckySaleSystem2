import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { cycleKey, cycleOf, cycleRange, feedConversation, finalizeSender, type OaSummary, type SenderAcc, type SenderStats } from "@/lib/chat-stats";

/**
 * 📊 ซิงก์สถิติตอบแชทของรอบบิล (26→25) ลง Firestore ordersure — ใช้ 2 ทาง
 *   1. หน้า /admin/chatbot/chat-stats กด 💾 (พร้อมผล zip จาก OA Manager)
 *   2. 🔄 อัตโนมัติหลังแอดมินตอบจากหน้าแชททุกครั้ง (reply route · inBackground) — เจ้าของร้าน 9 ต.ค. 69 22:05 "ไม่ต้องกด 💾 บันทึกรอบนี้ ได้ไหม"
 *      หน้าค่าคอมเดิม (Admin_MyWebApp commissionStoreChat.js) ฟัง doc นี้ด้วย onSnapshot อยู่แล้ว → ตัวเลขขยับบนจอเองหลังตอบไม่กี่วิ
 *
 * เขียน 2 เอกสาร: chatReplyStats/{key} (ของเรา) + storeChatCommissionChats/{key} (ทรงของหน้าเดิม senders = OA + เว็บ source "web")
 * ⚠️ ผล OA ห้ามหาย: ไม่มี oa ใหม่ → ใช้ของ chatReplyStats เดิม → ไม่มีอีกก็หยิบจาก doc หน้าเดิม (กรณีเจ้าของร้านโยน zip ที่หน้าเดิมเอง)
 */
export const STATS_COL = "chatReplyStats";
export const OLD_COL = "storeChatCommissionChats";
const ROOMS = "line-conversations";

type LogRow = { role?: string; mode?: string; by?: string; text?: string; at?: { toDate?: () => Date } | Date | string };
const toMs = (v: LogRow["at"]): number => {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") return new Date(v).getTime() || 0;
  return v.toDate?.()?.getTime() ?? 0;
};

export type WebStats = { senders: SenderStats[]; rooms: number; customerMsgs: number };

/** นับจาก log ห้องแชท: ห้องที่แอดมินเคยตอบตั้งแต่ต้นรอบ → ข้อความในรอบเรียงเวลา → กติกาเดียวกับ CSV (feedConversation) */
export async function webStats(db: Firestore, start: string, end: string): Promise<WebStats> {
  const { from, to } = cycleRange({ start, end });
  const rooms = await db.collection(ROOMS).where("lastAdminAt", ">=", from).get();
  const acc = new Map<string, SenderAcc>();
  let customerMsgs = 0;
  let roomsWithWeb = 0;
  await Promise.all(
    rooms.docs.map(async (r) => {
      const q = await r.ref.collection("log").where("at", ">=", from).where("at", "<=", to).orderBy("at", "asc").get();
      const msgs: { who: string; at: number; text: string }[] = [];
      let hasWeb = false;
      for (const d of q.docs) {
        const x = d.data() as LogRow;
        const at = toMs(x.at);
        const text = String(x.text ?? "");
        if (x.role === "user") msgs.push({ who: "cust", at, text });
        else if (x.role === "admin" && x.mode === "web" && x.by) {
          msgs.push({ who: String(x.by), at, text });
          hasWeb = true;
        } else msgs.push({ who: "sys", at, text }); // บอท/แอดมินทางอื่น = ลูกค้าได้คำตอบแล้ว แต่ไม่นับให้ใคร
      }
      if (!hasWeb) return;
      roomsWithWeb++;
      customerMsgs += feedConversation(acc, r.id, msgs).customerMsgs;
    })
  );
  const senders = [...acc.values()].map((a) => finalizeSender(a, "web")).sort((a, b) => b.replies - a.replies);
  return { senders, rooms: roomsWithWeb, customerMsgs };
}

/** ผล OA ที่หน้าเดิมบันทึกเองจาก zip (ไม่มี source) → แปลงเป็น OaSummary ของเรา เพื่อไม่ให้หายตอนเราเขียนทับ */
function oaFromOldDoc(old: Record<string, unknown> | null): OaSummary | null {
  if (!old || !Array.isArray(old.senders)) return null;
  const senders = (old.senders as SenderStats[]).filter((s) => s && s.source !== "web");
  if (!senders.length && !old.fileName) return null;
  const n = (v: unknown) => Number(v) || 0;
  return {
    fileName: String(old.fileName ?? ""),
    fileSize: n(old.fileSize),
    coverStart: String(old.coverStart ?? ""),
    coverEnd: String(old.coverEnd ?? ""),
    partial: old.partial === true,
    filesTotal: n(old.filesTotal),
    filesRead: n(old.filesRead),
    rowsRead: n(old.rowsRead),
    // doc ที่เราเขียนเองรวมห้องเว็บไว้ใน chats แล้ว → ถอดออกด้วย webRooms ที่จดไว้
    chats: Math.max(0, n(old.chats) - (old.webIncluded ? n(old.webRooms) : 0)),
    customerMsgs: Math.max(0, n(old.customerMsgs) - (old.webIncluded ? n(old.webCustomerMsgs) : 0)),
    autoReplies: n(old.autoReplies),
    senders: senders.map((s) => ({ ...s, source: "oa" as const })),
  };
}

export type SyncResult = { key: string; web: WebStats; oa: OaSummary | null; savedAt: string; savedBy: string };

/** นับฝั่งเว็บใหม่ + เขียน 2 เอกสาร · oa = ผล zip ใหม่ (ไม่ส่ง = คงของเดิม) */
export async function syncChatStatsCycle(db: Firestore, cycle: { start: string; end: string }, who: string, oa: OaSummary | null = null): Promise<SyncResult> {
  const key = cycleKey(cycle);
  const [web, prevSnap, oldSnap] = await Promise.all([webStats(db, cycle.start, cycle.end), db.collection(STATS_COL).doc(key).get(), db.collection(OLD_COL).doc(key).get()]);
  const prevOa = prevSnap.exists ? ((prevSnap.data() as { oa?: OaSummary | null }).oa ?? null) : null;
  const old = oldSnap.exists ? (oldSnap.data() as Record<string, unknown>) : null;
  const oaFinal = oa ?? prevOa ?? oaFromOldDoc(old);
  const now = new Date();
  await db.collection(STATS_COL).doc(key).set({ start: cycle.start, end: cycle.end, web: web.senders, webRooms: web.rooms, webCustomerMsgs: web.customerMsgs, oa: oaFinal, savedAt: now, savedBy: who }, { merge: false });
  // ทรงของหน้าค่าคอมเดิม (merge:false เหมือนที่หน้านั้นเขียนเอง) — subcollection samples/aiRuns ของเดิมไม่ถูกแตะ
  await db
    .collection(OLD_COL)
    .doc(key)
    .set(
      {
        startStr: cycle.start,
        endStr: cycle.end,
        fileName: oaFinal?.fileName ?? "",
        fileSize: oaFinal?.fileSize ?? 0,
        coverStart: oaFinal?.coverStart ?? "",
        coverEnd: oaFinal?.coverEnd ?? "",
        partial: oaFinal?.partial ?? false,
        filesTotal: oaFinal?.filesTotal ?? 0,
        filesRead: oaFinal?.filesRead ?? 0,
        rowsRead: oaFinal?.rowsRead ?? 0,
        chats: (oaFinal?.chats ?? 0) + web.rooms,
        customerMsgs: (oaFinal?.customerMsgs ?? 0) + web.customerMsgs,
        autoReplies: oaFinal?.autoReplies ?? 0,
        senders: [...(oaFinal?.senders ?? []), ...web.senders],
        uploadedAt: (old?.uploadedAt as Date | undefined) && !oa ? old!.uploadedAt : now, // เวลาอัปโหลด zip ของเดิมคงไว้ถ้ารอบนี้ไม่มี zip ใหม่
        uploadedBy: oa ? who : String(old?.uploadedBy ?? who),
        version: "iducky-admin-chat-stats",
        webIncluded: true,
        webRooms: web.rooms,
        webCustomerMsgs: web.customerMsgs,
        webSyncedAt: now,
        webSyncedBy: who,
        samplesCount: Number(old?.samplesCount) || 0,
      },
      { merge: false }
    );
  return { key, web, oa: oaFinal, savedAt: now.toISOString(), savedBy: who };
}

/** 🔄 หลังแอดมินตอบจากเว็บ: ซิงก์รอบปัจจุบัน (รวมคำขอที่ซ้อนกันบนอินสแตนซ์เดียวให้เหลือรอบเดียว + รอบตามอีกครั้งถ้ามีคนขอระหว่างวิ่ง) */
let inflight: Promise<unknown> | null = null;
let again = false;
export function syncCurrentCycleSoon(db: Firestore): Promise<unknown> {
  if (inflight) {
    again = true;
    return inflight;
  }
  inflight = (async () => {
    do {
      again = false;
      await syncChatStatsCycle(db, cycleOf(), "auto");
    } while (again);
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
