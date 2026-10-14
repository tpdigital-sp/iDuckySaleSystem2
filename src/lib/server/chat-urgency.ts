import "server-only";
import { getChatFirestore, CHAT_COLLECTION } from "@/lib/server/firebase-admin";
import { callGemini, geminiText } from "@/lib/server/ai-usage";
import { modelFor, noThinking } from "@/lib/ai-models";
import { patchChatRow } from "@/lib/server/line-chat";

/**
 * 🤖🏷 AI ติดป้ายความเร่งด่วนให้ห้องแชท LINE เอง (เจ้าของร้าน 14 ต.ค. 69 — "อยากให้ AI ประมวลผลว่าลูกค้าอยากให้เร่งตอบด่วนหรือตอบปกติ แล้วติด tag ให้อัตโนมัติ")
 *
 * - ป้ายที่ AI ใช้ = 3 ป้ายระดับ (key urgent/rush/normal จาก DEFAULT_TAGS — ชื่อที่ร้านเปลี่ยนเองตามหน้า ⚙️ จัดการป้าย ไม่กระทบ)
 *   ใส่ระดับเดียวไว้หน้าสุดของ adminTags · ป้ายอื่น (รอไฟล์ ฯลฯ) คงเดิม
 * - เก็บเหตุผลที่ `aiTag` { key, reason, at, msgAt } — หน้าแชทโชว์ "🤖 AI: …"
 * - ⛔ ไม่ทับแอดมิน: แอดมินติดป้ายเองหลังข้อความลูกค้าล่าสุด = เคารพ ไม่แตะ จนกว่าลูกค้าจะพิมพ์มาใหม่
 * - ข้อความลูกค้าล่าสุดเดิมกับที่เคยประเมินแล้ว = ข้าม (ไม่เรียก AI ซ้ำ)
 * รันจาก cron /api/cron/chat-urgency (ทุก 5 นาที) + ปุ่ม 🤖 ประเมินใหม่ ในแผง ℹ️ (force)
 */
export const URGENCY_KEYS = ["urgent", "rush", "normal"] as const;
export type UrgencyKey = (typeof URGENCY_KEYS)[number];
const AI_BY = "AI";

export type UrgencyResult = { uid: string; key?: UrgencyKey; reason?: string; skipped?: string; prev?: string; dry?: boolean };

type LogRow = { role: string; text: string; at: number };
const ms = (v: unknown): number => {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const t = (v as { toDate?: () => Date }).toDate?.();
  if (t) return t.getTime();
  const n = Date.parse(String(v));
  return Number.isFinite(n) ? n : 0;
};

const thaiNow = () =>
  new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok", weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function promptOf(lines: string): string {
  return `คุณช่วยแอดมินร้านพิมพ์/ผลิตของพรีเมียม iDucky จัดลำดับว่าห้องแชท LINE ไหนควรตอบก่อน
ตอนนี้: ${thaiNow()}

แชทล่าสุด (เก่า→ใหม่):
${lines}

ประเมิน "ความเร่งด่วนที่ร้านควรตอบ/ดำเนินการ ตอนนี้" จากข้อความล่าสุดของลูกค้าเป็นหลัก เลือก 1 ระดับ:
- "urgent" = เร่งตอบด่วน: ลูกค้ารอคำตอบเรื่องเร่ง — ต้องใช้ของวันนี้/พรุ่งนี้/ภายใน 2-3 วัน · ทวงถาม ถามซ้ำ หรือรอนาน · ไม่พอใจ/ร้องเรียน/ของเสียหาย/ส่งผิด · ปัญหาโอนเงิน/สลิป · ขอแก้งานที่กำลังผลิต
- "rush" = เร่งดำเนินการ: ลูกค้าพร้อมสั่ง/ส่งไฟล์แล้ว/ขอใบเสนอราคา/ถามราคาจริงจัง (ระบุจำนวน ขนาด) · อนุมัติแบบ/คอนเฟิร์มงานแล้ว (ร้านต้องทำต่อ) · ถามสถานะงานหรือการจัดส่ง · มีวันต้องใช้ภายในราว 1 สัปดาห์
- "normal" = ตอบปกติ: ทักทาย ขอบคุณ รับทราบ ถามข้อมูลทั่วไป ดูไอเดีย ไม่มีกำหนดเวลา หรือร้านตอบครบแล้วและลูกค้าไม่ได้ถามอะไรต่อ

ตอบ JSON เท่านั้น: {"level":"urgent|rush|normal","reason":"เหตุผลภาษาไทยสั้น ๆ ไม่เกิน 60 ตัวอักษร อ้างสิ่งที่ลูกค้าพูด"}
ห้ามเดาสิ่งที่ไม่มีในแชท`;
}

/** ประเมิน 1 ห้อง · force = ข้ามด่าน "ประเมินแล้ว" (ปุ่มกดเอง) แต่ยังเคารพแอดมินถ้า respectAdmin */
export async function classifyRoom(uid: string, o: { force?: boolean; dry?: boolean; respectAdmin?: boolean } = {}): Promise<UrgencyResult> {
  const db = getChatFirestore();
  if (!db) return { uid, skipped: "no-firestore" };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { uid, skipped: "no-gemini-key" };
  const ref = db.collection(CHAT_COLLECTION).doc(uid);
  const [room, snap] = await Promise.all([ref.get(), ref.collection("log").orderBy("at", "desc").limit(30).get()]);
  if (!room.exists) return { uid, skipped: "no-room" };
  const x = room.data() as Record<string, unknown>;

  const log: LogRow[] = snap.docs
    .map((d) => ({ role: String(d.get("role") ?? ""), text: String(d.get("text") ?? "").replace(/\s+/g, " ").trim(), at: ms(d.get("at")) }))
    .filter((r) => r.text && r.role !== "draft")
    .reverse();
  const lastCust = [...log].reverse().find((r) => r.role === "user");
  if (!lastCust) return { uid, skipped: "no-customer-message" };

  const tags = Array.isArray(x.adminTags) ? (x.adminTags as unknown[]).map(String) : x.adminTag ? [String(x.adminTag)] : [];
  const prev = tags.find((t) => (URGENCY_KEYS as readonly string[]).includes(t));
  const ai = (x.aiTag ?? null) as { key?: string; msgAt?: number } | null;
  if (!o.force && ai?.msgAt === lastCust.at) return { uid, skipped: "already", prev };
  // แอดมินติดป้ายเองหลังข้อความลูกค้าล่าสุด → ไม่ทับ
  const manualAt = x.adminTagBy && x.adminTagBy !== AI_BY ? ms(x.adminTagAt) : 0;
  if ((o.respectAdmin ?? true) && manualAt > lastCust.at && prev) return { uid, skipped: "admin-set", prev };

  const who = (r: LogRow) => (r.role === "user" ? "ลูกค้า" : r.role === "system" ? "ระบบแจ้งลูกค้า" : "ร้าน");
  const lines = log
    .slice(-20)
    .map((r) => `${who(r)} (${new Date(r.at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}): ${r.text.slice(0, 300)}`)
    .join("\n");
  const model = modelFor("chat_urgency");
  const r = await callGemini({
    feature: "chat_urgency",
    model,
    apiKey,
    body: {
      contents: [{ parts: [{ text: promptOf(lines) }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 400, responseMimeType: "application/json", ...noThinking(model) },
    },
    timeoutMs: 12_000,
  });
  if (!r.ok) return { uid, skipped: `ai-${r.status}`, prev };
  let level: UrgencyKey | undefined;
  let reason = "";
  const raw = geminiText(r.json);
  try {
    // บางทีโมเดลห่อมาเป็นอาเรย์ [{…}] — หยิบตัวแรก
    const parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim()) as unknown;
    const j = (Array.isArray(parsed) ? parsed[0] : parsed) as { level?: string; reason?: string } | null;
    if ((URGENCY_KEYS as readonly string[]).includes(String(j?.level))) level = j!.level as UrgencyKey;
    reason = String(j?.reason ?? "").slice(0, 80);
  } catch {
    /* JSON ขาดท้าย (เหตุผลยาวจนชนเพดาน) — หยิบจากข้อความดิบข้างล่าง */
  }
  if (!level) {
    // ระดับมาก่อนเหตุผลเสมอ — แม้ JSON ขาดท้ายก็หยิบได้
    const m = /"level"\s*:\s*"(urgent|rush|normal)"/.exec(raw);
    if (m) level = m[1] as UrgencyKey;
    reason ||= (/"reason"\s*:\s*"([^"]*)/.exec(raw)?.[1] ?? "").slice(0, 80);
  }
  if (!level) return { uid, skipped: `ai-bad-json: ${raw.slice(0, 80) || r.json?.candidates?.[0]?.finishReason || "ว่าง"}`, prev };
  if (o.dry) return { uid, key: level, reason, prev, dry: true };

  const next = [level, ...tags.filter((t) => !(URGENCY_KEYS as readonly string[]).includes(t))].slice(0, 10);
  const now = new Date();
  const changed = prev !== level || tags[0] !== level;
  await ref.set(
    {
      aiTag: { key: level, reason, at: now.toISOString(), msgAt: lastCust.at, model },
      ...(changed ? { adminTags: next, adminTag: level, adminTagBy: AI_BY, adminTagAt: now.toISOString() } : {}),
    },
    { merge: true }
  );
  if (changed) patchChatRow(uid, { tag: level });
  return { uid, key: level, reason, prev };
}

/** ห้องที่มีความเคลื่อนไหวใน N นาทีล่าสุด → ประเมินทีละห้อง (สูงสุด limit ห้อง/รอบ) */
export async function classifyRecentRooms(o: { minutes?: number; limit?: number; dry?: boolean } = {}): Promise<UrgencyResult[]> {
  const db = getChatFirestore();
  if (!db) return [];
  const since = new Date(Date.now() - (o.minutes ?? 15) * 60_000);
  const snap = await db.collection(CHAT_COLLECTION).where("lastSeen", ">=", since).orderBy("lastSeen", "desc").limit(o.limit ?? 25).get();
  const out: UrgencyResult[] = [];
  for (const d of snap.docs) {
    if (!/^U[0-9a-f]{32}$/.test(d.id)) continue; // ห้องกลุ่ม (C…) ไม่ใช่ลูกค้าเดี่ยว
    try {
      out.push(await classifyRoom(d.id, { dry: o.dry }));
    } catch (e) {
      out.push({ uid: d.id, skipped: `error: ${(e as Error).message.slice(0, 80)}` });
    }
  }
  return out;
}
