import "server-only";
import { getChatFirestore } from "@/lib/server/firebase-admin";
import { DEFAULT_TAGS, sanitizeTags, type ChatTag } from "@/lib/chat-tags";

/** 🏷 รายการป้ายลูกค้าแบบกำหนดเอง — Firestore ordersure `settings/chat-tags` { items } · ไม่มี = DEFAULT_TAGS (3 ป้ายเดิม) */
export const CHAT_TAGS_DOC = { col: "settings", id: "chat-tags" };

export async function loadChatTags(): Promise<ChatTag[]> {
  const db = getChatFirestore();
  if (!db) return DEFAULT_TAGS;
  try {
    const d = await db.collection(CHAT_TAGS_DOC.col).doc(CHAT_TAGS_DOC.id).get();
    const items = sanitizeTags(d.data()?.items);
    return d.exists && items.length ? items : DEFAULT_TAGS;
  } catch {
    return DEFAULT_TAGS;
  }
}
