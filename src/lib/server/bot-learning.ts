import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { KB_COL, pushKnowledge } from "@/lib/server/bot-kb";

/**
 * 🎓 บอทเรียนรู้ (เจ้าของร้าน 14 ต.ค. 69: "ปุ่มทิ้งขอเป็นการเข้าสู่เรียนรู้ เพื่อให้แอดมินตอบจะดีกว่า")
 *
 * ร่างของบอทที่แอดมินไม่ส่ง (ปุ่ม "ไม่ส่ง · ให้บอทเรียนรู้" ในหน้าแชท) → ทิ้งร่าง + เปิดเรื่องใน `bot-learning` (Firestore ordersure)
 *   { uid, customerName, question (ข้อความลูกค้าก่อนร่าง), botAnswer (ร่างที่ไม่ได้ส่ง), draftAt, logId, status: open|learned|skipped }
 * หน้า /admin/chatbot/learning: เห็นคำถาม + ร่างบอท + คำตอบที่แอดมินตอบลูกค้าจริงหลังจากนั้น (ดึงจาก log ห้อง)
 *   → แก้แล้วกด "บันทึกให้บอทเรียนรู้" = เพิ่มเข้าคลังความรู้ (knowledge-base) + ส่งเข้า n8n เหมือนหน้า 📚 คลังความรู้
 */
export const LEARN_COL = "bot-learning";
const CHAT_COL = "line-conversations";

const msOf = (v: unknown): number => {
  if (!v) return NaN;
  if (v instanceof Date) return v.getTime();
  const t = (v as { toDate?: () => Date }).toDate?.();
  if (t) return t.getTime();
  return Date.parse(String(v));
};
const isoOf = (v: unknown): string => {
  const t = msOf(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
};

/** ข้อความลูกค้าที่ร่างนี้ตอบ = ข้อความ role user ต่อเนื่องก่อนร่าง (ถอยจนเจอคำตอบร้าน) */
async function questionBefore(db: FirebaseFirestore.Firestore, uid: string, at: Date): Promise<string> {
  const snap = await db.collection(CHAT_COL).doc(uid).collection("log").where("at", "<=", at).orderBy("at", "desc").limit(30).get();
  const out: string[] = [];
  for (const d of snap.docs) {
    const role = String(d.get("role") ?? "");
    if (role === "draft" || role === "system") continue; // การ์ดระบบแทรกกลางคำถามได้ ไม่ใช่คำตอบร้าน
    if (role !== "user") {
      if (out.length) break;
      continue;
    }
    const type = String(d.get("type") ?? "");
    const text = String(d.get("text") ?? "").trim();
    out.push(type === "image" ? "[ลูกค้าส่งรูป]" : type === "file" ? `[ลูกค้าส่งไฟล์] ${String(d.get("fileName") ?? "")}`.trim() : text);
    if (out.length >= 8) break;
  }
  return out.reverse().filter(Boolean).join("\n").slice(0, 2000);
}

/** ✋ ไม่ส่งร่าง → เปิดเรื่องให้บอทเรียนรู้ (เรียกหลัง discardBotDraft สำเร็จ) */
export async function openLearningFromDraft(db: FirebaseFirestore.Firestore, uid: string, logId: string, who: string): Promise<string | null> {
  const room = db.collection(CHAT_COL).doc(uid);
  const [d, r] = await Promise.all([room.collection("log").doc(logId).get(), room.get()]);
  if (!d.exists) return null;
  const at = (d.get("at") as { toDate?: () => Date })?.toDate?.() ?? new Date();
  const question = await questionBefore(db, uid, at).catch(() => "");
  const ref = db.collection(LEARN_COL).doc(`${uid}_${logId}`);
  await ref.set({
    uid,
    logId,
    customerName: String(r.get("adminAlias") || r.get("displayName") || ""),
    pictureUrl: String(r.get("pictureUrl") ?? ""),
    question,
    botAnswer: String(d.get("text") ?? ""),
    draftAt: at,
    status: "open",
    openedBy: who,
    openedAt: new Date(),
  });
  return ref.id;
}

export type LearningItem = {
  id: string;
  uid: string;
  customerName: string;
  pictureUrl: string;
  question: string;
  botAnswer: string;
  draftAt: string;
  status: string;
  openedBy: string;
  /** คำตอบที่แอดมินพิมพ์ตอบลูกค้าจริงหลังร่างนี้ (หน้าแชท · ภายใน 24 ชม.) — ใช้เป็นคำตอบตั้งต้น */
  adminReplies: { text: string; by: string; at: string }[];
  learnedBy?: string;
  learnedAt?: string;
  kbId?: string;
  kbTitle?: string;
  kbContent?: string;
};

async function adminRepliesAfter(db: FirebaseFirestore.Firestore, uid: string, at: number): Promise<LearningItem["adminReplies"]> {
  if (!Number.isFinite(at)) return [];
  const snap = await db
    .collection(CHAT_COL)
    .doc(uid)
    .collection("log")
    .where("at", ">", new Date(at))
    .where("at", "<", new Date(at + 24 * 3600_000))
    .orderBy("at", "asc")
    .limit(40)
    .get();
  return snap.docs
    .filter((d) => d.get("role") === "admin" || (d.get("role") === "assistant" && d.get("approvedBy")))
    .map((d) => ({ text: String(d.get("text") ?? ""), by: String(d.get("by") ?? d.get("approvedBy") ?? ""), at: isoOf(d.get("at")) }))
    .filter((x) => x.text && !/^\((ส่งรูป|ส่งการ์ดสินค้า|ส่งไฟล์)/.test(x.text))
    .slice(0, 4);
}

export async function listLearning(db: FirebaseFirestore.Firestore, status: "open" | "done"): Promise<{ items: LearningItem[]; openCount: number }> {
  const col = db.collection(LEARN_COL);
  const [snap, openSnap] = await Promise.all([
    status === "open" ? col.where("status", "==", "open").get() : col.where("status", "in", ["learned", "skipped"]).get(),
    col.where("status", "==", "open").count().get(),
  ]);
  const docs = snap.docs.sort((a, b) => msOf(b.get("draftAt")) - msOf(a.get("draftAt"))).slice(0, status === "open" ? 80 : 60);
  const items = await Promise.all(
    docs.map(async (d) => {
      const x = d.data();
      return {
        id: d.id,
        uid: String(x.uid ?? ""),
        customerName: String(x.customerName ?? ""),
        pictureUrl: String(x.pictureUrl ?? ""),
        question: String(x.question ?? ""),
        botAnswer: String(x.botAnswer ?? ""),
        draftAt: isoOf(x.draftAt),
        status: String(x.status ?? ""),
        openedBy: String(x.openedBy ?? ""),
        adminReplies: status === "open" ? await adminRepliesAfter(db, String(x.uid ?? ""), msOf(x.draftAt)).catch(() => []) : [],
        learnedBy: x.learnedBy ? String(x.learnedBy) : undefined,
        learnedAt: x.learnedAt ? isoOf(x.learnedAt) : undefined,
        kbId: x.kbId ? String(x.kbId) : undefined,
        kbTitle: x.kbTitle ? String(x.kbTitle) : undefined,
        kbContent: x.kbContent ? String(x.kbContent) : undefined,
      } satisfies LearningItem;
    }),
  );
  return { items, openCount: openSnap.data().count };
}

/** 🎓 สอนบอท: เพิ่มเข้าคลังความรู้ + ส่ง n8n + ปิดเรื่อง */
export async function teachFromLearning(
  db: FirebaseFirestore.Firestore,
  id: string,
  input: { title: string; content: string; who: { user: string; name: string } },
): Promise<{ ok: true; kbId: string; pushed: boolean } | { ok: false; status: number; error: string }> {
  const ref = db.collection(LEARN_COL).doc(id);
  const d = await ref.get();
  if (!d.exists) return { ok: false, status: 404, error: "ไม่พบเรื่องนี้" };
  if (d.get("status") === "learned") return { ok: false, status: 409, error: "เรื่องนี้สอนบอทไปแล้ว" };
  const title = input.title.trim().slice(0, 500);
  const content = input.content.trim().slice(0, 8000);
  if (!title || !content) return { ok: false, status: 400, error: "ต้องมีทั้งคำถามและคำตอบที่ถูก" };
  const kb = await db.collection(KB_COL).add({
    title,
    content,
    type: "chat-experience",
    source: "bot-learning",
    learningId: id,
    createdBy: input.who.user,
    createdByName: input.who.name,
    createdAt: FieldValue.serverTimestamp(),
    timestamp: FieldValue.serverTimestamp(),
  });
  const pushed = await pushKnowledge({ question: title, answer: content, type: "chat-experience" });
  await ref.update({ status: "learned", learnedBy: input.who.name, learnedAt: new Date(), kbId: kb.id, kbTitle: title, kbContent: content, pushed });
  return { ok: true, kbId: kb.id, pushed };
}

export async function skipLearning(db: FirebaseFirestore.Firestore, id: string, who: string): Promise<boolean> {
  const ref = db.collection(LEARN_COL).doc(id);
  const d = await ref.get();
  if (!d.exists || d.get("status") !== "open") return false;
  await ref.update({ status: "skipped", learnedBy: who, learnedAt: new Date() });
  return true;
}
