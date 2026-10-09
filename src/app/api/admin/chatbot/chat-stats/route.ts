import { NextResponse } from "next/server";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { requirePerm } from "@/lib/server/require-perm";
import { EMPLOYEE_COLLECTION, getChatFirestore, getFirestoreAdmin } from "@/lib/server/firebase-admin";
import { WORK_STATUS_ACTIVE } from "@/lib/permissions";
import { cycleKey, cycleRange, feedConversation, finalizeSender, newAcc, type OaSummary, type SenderAcc, type SenderStats } from "@/lib/chat-stats";

export const runtime = "nodejs";
export const maxDuration = 26;

/**
 * 📊 สถิติตอบแชทต่อพนักงาน ต่อรอบบิล 26→25 (เจ้าของร้าน 9 ต.ค. 69 21:20)
 *
 * GET  ?start=YYYY-MM-DD&end=YYYY-MM-DD → { web: SenderStats[] (จาก log ห้องแชทที่ตอบผ่านหน้า /admin/chatbot/chats · mode "web"),
 *        saved: doc รอบนี้ (ถ้าเคยบันทึก), alias: ชื่อใน OA → พนักงาน (doc เดียวกับหน้าค่าคอมเดิม), staff: ชื่อพนักงานที่ยังทำงาน }
 * POST { action:"save", start, end, oa?: OaSummary }  → บันทึก chatReplyStats/{รอบ} (เว็บ+OA) และเขียน storeChatCommissionChats/{รอบ}
 *        ในทรงที่ pages/commissionStoreChat.js (Admin_MyWebApp) อ่านอยู่ — senders = ผู้ส่งจาก OA + พนักงานที่ตอบบนเว็บ (source "web")
 *        จึงเอาไปคิดค่าคอมได้โดยไม่ต้องแก้หน้าเดิม · ไม่มี oa = เขียนเฉพาะฝั่งเว็บ (ยังไม่อัปโหลด zip)
 * POST { action:"alias", chatName, staffName }        → customer-tasks-config/store-chat-commission.chatAlias (""= ไม่ใช่พนักงาน · null = ลบ)
 *
 * ⚠️ ข้อความที่ส่งจากหน้าแชทของเราออกทาง Messaging API → ใน export ของ LINE ขึ้นเป็นผู้ส่ง "Unknown" (รวมกับบอท) ไม่เข้าใคร
 *    ดังนั้นสถิติฝั่งเว็บต้องนับจาก log ของเราเอง และไม่ซ้ำกับฝั่ง OA (Unknown ถูกตัดเป็นระบบอยู่แล้ว)
 */
const ROOMS = "line-conversations";
const STATS_COL = "chatReplyStats";
const OLD_COL = "storeChatCommissionChats";
const CONFIG = { col: "customer-tasks-config", doc: "store-chat-commission" };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type LogRow = { role?: string; mode?: string; by?: string; text?: string; at?: { toDate?: () => Date } | Date | string };
const toMs = (v: LogRow["at"]): number => {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") return new Date(v).getTime() || 0;
  return v.toDate?.()?.getTime() ?? 0;
};

/** พนักงานที่ยังทำงาน (employees2 ฐาน tp-fixflow) — ชื่อแสดง = ค่าเดียวกับที่ reply route เขียนลง log (by) */
async function activeStaffNames(): Promise<string[]> {
  const db = getFirestoreAdmin();
  if (!db) return [];
  const rows = await db.collection(EMPLOYEE_COLLECTION).get();
  const out = new Set<string>();
  for (const d of rows.docs) {
    const e = d.data() as { name?: string; username?: string; isSuspended?: boolean; iduckySuspended?: boolean; workStatus?: string };
    if (e.isSuspended === true || e.iduckySuspended === true || e.workStatus !== WORK_STATUS_ACTIVE) continue;
    const n = String(e.name ?? e.username ?? "").trim();
    if (n) out.add(n);
  }
  return [...out].sort((a, b) => a.localeCompare(b, "th"));
}

/** นับจาก log ห้องแชท: ห้องที่แอดมินเคยตอบตั้งแต่ต้นรอบ → อ่านข้อความในรอบ เรียงเวลา → ป้อนตัวสะสม (กติกาเดียวกับ CSV) */
async function webStats(db: Firestore, start: string, end: string): Promise<{ senders: SenderStats[]; rooms: number; customerMsgs: number }> {
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
        } else msgs.push({ who: "sys", at, text }); // บอท (assistant) / แอดมินที่ไม่ใช่ทางเว็บ = ลูกค้าได้คำตอบแล้ว แต่ไม่นับให้ใคร
      }
      if (!hasWeb) return;
      roomsWithWeb++;
      customerMsgs += feedConversation(acc, r.id, msgs).customerMsgs;
    })
  );
  const senders = [...acc.values()].map((a) => finalizeSender(a, "web")).sort((a, b) => b.replies - a.replies);
  return { senders, rooms: roomsWithWeb, customerMsgs };
}

export async function GET(req: Request) {
  const gate = await requirePerm(["reports.view", "chat.reply"]);
  if (gate.res) return gate.res;
  const db = getChatFirestore();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firestore" }, { status: 503 });
  const u = new URL(req.url);
  const start = u.searchParams.get("start") ?? "";
  const end = u.searchParams.get("end") ?? "";
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || end < start) return NextResponse.json({ error: "รอบบิลไม่ถูกต้อง" }, { status: 400 });
  const key = cycleKey({ start, end });
  const [web, savedSnap, cfgSnap, staff, oldSnap] = await Promise.all([
    webStats(db, start, end),
    db.collection(STATS_COL).doc(key).get(),
    db.collection(CONFIG.col).doc(CONFIG.doc).get(),
    activeStaffNames(),
    db.collection(OLD_COL).doc(key).get(),
  ]);
  const saved = savedSnap.exists ? (savedSnap.data() as Record<string, unknown>) : null;
  const old = oldSnap.exists ? (oldSnap.data() as Record<string, unknown>) : null;
  const ts = (v: unknown) => (v && typeof v === "object" && "toDate" in (v as object) ? (v as { toDate: () => Date }).toDate().toISOString() : null);
  return NextResponse.json(
    {
      cycle: { start, end, key },
      web,
      staff,
      alias: ((cfgSnap.data() as { chatAlias?: Record<string, string> } | undefined)?.chatAlias ?? {}) as Record<string, string>,
      saved: saved ? { savedAt: ts(saved.savedAt), savedBy: saved.savedBy ?? "", oa: (saved.oa as OaSummary | null) ?? null, web: (saved.web as SenderStats[]) ?? [] } : null,
      // หน้าค่าคอมเดิมเคยบันทึกรอบนี้จาก zip เองไหม (ถ้าเราเขียนทับจะบอกก่อน)
      old: old ? { uploadedAt: ts(old.uploadedAt), uploadedBy: old.uploadedBy ?? "", version: old.version ?? "", senders: Array.isArray(old.senders) ? old.senders.length : 0 } : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

type SaveBody = { action?: string; start?: string; end?: string; oa?: OaSummary | null; chatName?: string; staffName?: string | null };

const cleanSender = (s: SenderStats): SenderStats => ({
  name: String(s.name ?? "").slice(0, 80),
  replies: Math.max(0, Math.round(Number(s.replies) || 0)),
  chats: Math.max(0, Math.round(Number(s.chats) || 0)),
  respN: Math.max(0, Math.round(Number(s.respN) || 0)),
  respMedian: s.respMedian === null || s.respMedian === undefined ? null : Number(s.respMedian) || 0,
  respP90: s.respP90 === null || s.respP90 === undefined ? null : Number(s.respP90) || 0,
  within10: s.within10 === null || s.within10 === undefined ? null : Number(s.within10) || 0,
  polite: Number(s.polite) || 0,
  avgLen: Number(s.avgLen) || 0,
  apology: Number(s.apology) || 0,
  nudges: Number(s.nudges) || 0,
  source: s.source === "web" ? "web" : "oa",
});

export async function POST(req: Request) {
  const gate = await requirePerm("settings.manage");
  if (gate.res) return gate.res;
  const db = getChatFirestore();
  if (!db) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Firestore" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as SaveBody;
  const who = gate.actor.name || gate.actor.username;

  if (b.action === "alias") {
    const chatName = String(b.chatName ?? "").trim().slice(0, 120);
    if (!chatName) return NextResponse.json({ error: "ไม่มีชื่อ" }, { status: 400 });
    const staffName = b.staffName === null || b.staffName === undefined ? null : String(b.staffName).trim().slice(0, 80);
    // ชื่อใน OA มีจุด/วงเล็บ/อีโมจิ (".zzsomp.") → set({merge}) แปลงคีย์เป็น field path แล้วพัง · ต้อง update ด้วย FieldPath เป็นช่วง ๆ
    const ref = db.collection(CONFIG.col).doc(CONFIG.doc);
    try {
      await ref.set({}, { merge: true });
      await ref.update(new FieldPath("chatAlias", chatName), staffName === null ? FieldValue.delete() : staffName, "aliasUpdatedAt", new Date(), "aliasUpdatedBy", who);
    } catch (e) {
      return NextResponse.json({ error: `บันทึกการจับคู่ชื่อไม่ได้: ${(e as Error).message}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (b.action !== "save") return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
  const start = String(b.start ?? "");
  const end = String(b.end ?? "");
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || end < start) return NextResponse.json({ error: "รอบบิลไม่ถูกต้อง" }, { status: 400 });
  const key = cycleKey({ start, end });
  const web = await webStats(db, start, end);
  const oaIn = b.oa && typeof b.oa === "object" ? b.oa : null;
  const oa: OaSummary | null = oaIn
    ? {
        fileName: String(oaIn.fileName ?? "").slice(0, 200),
        fileSize: Number(oaIn.fileSize) || 0,
        coverStart: String(oaIn.coverStart ?? "").slice(0, 8),
        coverEnd: String(oaIn.coverEnd ?? "").slice(0, 8),
        partial: oaIn.partial === true,
        filesTotal: Number(oaIn.filesTotal) || 0,
        filesRead: Number(oaIn.filesRead) || 0,
        rowsRead: Number(oaIn.rowsRead) || 0,
        chats: Number(oaIn.chats) || 0,
        customerMsgs: Number(oaIn.customerMsgs) || 0,
        autoReplies: Number(oaIn.autoReplies) || 0,
        senders: (Array.isArray(oaIn.senders) ? oaIn.senders : []).map((s) => cleanSender({ ...s, source: "oa" })).filter((s) => s.name).slice(0, 500),
      }
    : null;
  const now = new Date();
  // เขียนทับเฉพาะฝั่งที่มีข้อมูลใหม่ — ไม่มี zip รอบนี้ก็เก็บ OA เดิมไว้
  const prev = await db.collection(STATS_COL).doc(key).get();
  const prevOa = prev.exists ? ((prev.data() as { oa?: OaSummary | null }).oa ?? null) : null;
  const oaFinal = oa ?? prevOa;
  await db.collection(STATS_COL).doc(key).set({ start, end, web: web.senders, webRooms: web.rooms, webCustomerMsgs: web.customerMsgs, oa: oaFinal, savedAt: now, savedBy: who }, { merge: false });
  // ทรงของหน้าค่าคอมเดิม (merge:false เหมือนที่หน้านั้นเขียนเอง) — senders รวมเว็บ · subcollection samples ของเดิม (ถ้ามี) ไม่ถูกแตะ
  const senders = [...(oaFinal?.senders ?? []), ...web.senders];
  await db
    .collection(OLD_COL)
    .doc(key)
    .set(
      {
        startStr: start,
        endStr: end,
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
        senders,
        uploadedAt: now,
        uploadedBy: who,
        version: "iducky-admin-chat-stats",
        webIncluded: true,
        webRooms: web.rooms,
        samplesCount: 0,
      },
      { merge: false }
    );
  return NextResponse.json({ ok: true, key, web: web.senders, oa: oaFinal, savedAt: now.toISOString(), savedBy: who });
}
