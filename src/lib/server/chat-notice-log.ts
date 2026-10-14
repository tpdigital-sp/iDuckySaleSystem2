import "server-only";
import { getChatFirestore } from "@/lib/server/firebase-admin";

/**
 * 🎴→💬 การ์ด/ข้อความแจ้งลูกค้าที่ระบบส่งเอง (notify.ts) → จดลงห้องแชท line-conversations/{uid}/log (14 ต.ค. 69)
 *
 * เดิม notifyCustomer ยิง push ตรงแล้วจบ — หน้า /admin/chatbot/chats ไม่เห็นว่าระบบเพิ่งส่ง "ยืนยันชำระเงินแล้ว"
 * แอดมินพิมพ์ซ้ำ/ขัดกับการ์ด · บอท (โหมดร่าง) ร่าง "รอตรวจสลิปนะคะ" ทั้งที่การ์ดบอกเงินเข้าแล้ว
 *
 * กติกา:
 *   · role "system" type "notice" — ไม่ใช่คำตอบแอดมิน: ไม่พักบอท · ไม่แตะ needsHumanFollowup/lastAdminAt · ไม่นับค่าคอมแชท (chat-stats-sync ข้าม)
 *   · ไม่แตะเอกสารห้อง (lastSeen) — การ์ดระบบไม่ควรดันห้องขึ้นบนสุดของรายการ
 *   · ความจำบอท (room.messages) เติมบรรทัดสั้น ๆ role assistant ติดธง notice — เฉพาะห้องที่มีความจำอยู่แล้ว ไม่สร้างห้องใหม่
 *     (fixMemory ใน bot-drafts ข้ามบรรทัดที่มีธงนี้ ไม่งั้นจับคู่ผิดกับร่างที่เวลาใกล้กัน)
 *   · ล้มเงียบ — จดไม่ได้ต้องไม่ทำให้การส่งไลน์พัง
 */
const COL = "line-conversations";
/** ความจำบอทเก็บไม่เกินนี้ (เท่ากับที่ n8n Save Memory ตัดไว้) */
const MEMORY_MAX = 12;

type Msg = { type: string; text?: string; altText?: string; contents?: unknown };

/** หัวการ์ด Flex ของเรา (statusFlex/noticeFlex): header.backgroundColor + บรรทัดใหญ่บรรทัดที่ 2 */
export function headOf(contents: unknown): { title: string; color: string } | null {
  const h = (contents as { header?: { backgroundColor?: unknown; contents?: { text?: unknown }[] } } | null)?.header;
  if (!h) return null;
  const texts = Array.isArray(h.contents) ? h.contents.map((c) => String(c?.text ?? "")).filter(Boolean) : [];
  const title = texts[texts.length - 1] ?? "";
  const color = typeof h.backgroundColor === "string" ? h.backgroundColor : "";
  return title ? { title, color } : null;
}

export async function logChatNotice(
  uid: string,
  orderId: string,
  messages: Msg[],
  /** การ์ดถูก LINE ตีกลับ (400) แล้วส่งเป็นข้อความล้วนแทน */
  asText = false
): Promise<void> {
  if (!/^[A-Za-z][0-9a-f]{32}$/.test(uid)) return;
  const db = getChatFirestore();
  if (!db) return;
  const flex = messages.find((m) => m.type === "flex");
  const head = flex ? headOf(flex.contents) : null;
  const text = messages
    .map((m) => (m.type === "flex" ? m.altText ?? "" : m.text ?? ""))
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);
  if (!text) return;
  const now = new Date();
  const ref = db.collection(COL).doc(uid);
  await ref.collection("log").add({
    role: "system",
    type: "notice",
    text,
    at: now,
    by: "ระบบ",
    mode: "notify",
    notice: {
      orderId,
      title: head?.title ?? "",
      color: head?.color ?? "",
      ...(asText ? { asText: true } : {}),
    },
  });

  // 🧠 ความจำบอท — บอกบอทสั้น ๆ ว่าร้านแจ้งอะไรไป (เลข OD + หัวการ์ด/ประโยคแรก)
  const memo = `[ระบบแจ้งลูกค้า · ${orderId}] ${head?.title || text.split("\n")[0]}`.slice(0, 300);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const list = snap.get("messages");
    if (!Array.isArray(list)) return;
    const next = [...list, { role: "assistant", text: memo, at: now.toISOString(), notice: true }].slice(-MEMORY_MAX);
    tx.update(ref, { messages: next, messageCount: next.length });
  });
}
