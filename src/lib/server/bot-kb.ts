import "server-only";
import { randomUUID } from "node:crypto";
import { getStorage } from "firebase-admin/storage";
import type { Firestore } from "firebase-admin/firestore";
import { getChatFirestore } from "@/lib/server/firebase-admin";
import { callGemini, geminiText } from "@/lib/server/ai-usage";
import type { AiFeature } from "@/lib/ai-cost";
import { modelFor, noThinking } from "@/lib/ai-models";

/**
 * 🤖 ข้อมูลของบอทแชท (ย้ายจาก AdminBuddy 3 ต.ค. 69) — ใช้ร่วม 3 หน้าในหมวด Chatbot
 *   · knowledge-base   คลังความรู้ (Q&A) ที่ n8n ดึงไปตอบลูกค้า → /admin/chatbot/knowledge
 *   · pricing          ตารางราคาข้อความ (quote-engine-n8n / invoice-inspector อ่านตรง) → /admin/chatbot/pricing
 *   · settings/price_links  ลิงก์ราคา + รูปตอบลูกค้า — หน้าแก้ไขเอาออกแล้ว (3 ต.ค. 69) · ยังอ่านอยู่: บอท (chat-context) + ช่องผูกลิงก์ราคาในคลังความรู้ (GET /api/admin/chatbot/price-links)
 *
 * ทั้งหมดอยู่ Firestore ฐาน "ordersure" (โปรเจกต์ tpdigital-iducky) ชุดเดียวกับที่ AdminBuddy เขียน — ห้ามเปลี่ยนทรงข้อมูล
 * ระบบอื่นอ่านอยู่ (n8n quote-engine ต้องการ name/content เป็น string · บรรทัดราคา "ชื่อ: 1-10=245, ...")
 *
 * ต่างจากหน้าเดิม: คีย์ Gemini/Firebase อยู่ฝั่งเซิร์ฟเวอร์ · ผ่านด่านสิทธิ์ของระบบขาย · บันทึกลิงก์ราคาทีละรายการด้วย transaction
 * (หน้าเดิม setDoc ทั้งอาร์เรย์ทับ — สองคนแก้พร้อมกันงานหาย)
 */

export const KB_COL = "knowledge-base";
export const PRICING_COL = "pricing";
export const PRICE_LINKS_DOC = { col: "settings", id: "price_links" };
/** ปลายทางส่งความรู้เข้า Pinecone (n8n) — ตัวเดียวกับค่าเริ่มต้นของ AdminBuddy */
export const KNOWLEDGE_WEBHOOK = process.env.KNOWLEDGE_WEBHOOK_URL || "https://n8n.iduckybot.com/webhook/knowledge-ingest";
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "tpdigital-iducky.firebasestorage.app";

export function db(): Firestore {
  const d = getChatFirestore();
  if (!d) throw new Error("ยังไม่ได้ตั้งค่า FIREBASE_SERVICE_ACCOUNT_B64");
  return d;
}

/** Timestamp ของ Firestore / Date / string → ISO (ส่งให้หน้าจอ) */
export function iso(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  const t = v as { toDate?: () => Date; _seconds?: number };
  if (typeof t.toDate === "function") return t.toDate().toISOString();
  if (typeof t._seconds === "number") return new Date(t._seconds * 1000).toISOString();
  return "";
}

/* ── Pinecone (ผ่าน n8n) ─────────────────────────────── */

export type KbPush = { question: string; answer: string; type: string; action?: "delete"; docId?: string };

/** ส่ง 1 รายการเข้า n8n knowledge-ingest — คืน true/false ไม่ throw (ฝั่ง Firestore บันทึกไปแล้ว ไม่ย้อน) */
export async function pushKnowledge(body: KbPush): Promise<boolean> {
  try {
    const res = await fetch(KNOWLEDGE_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ── Gemini ───────────────────────────────────────────── */

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
export type GeminiTurn = { role?: "user" | "model"; parts: GeminiPart[] };

/** เรียก Gemini แล้วคืนข้อความ — โยน Error พร้อมข้อความที่แสดงให้แอดมินได้ */
export async function gemini(opts: {
  model?: string;
  system?: string;
  contents: GeminiTurn[];
  generationConfig?: Record<string, unknown>;
  timeoutMs?: number;
  /** ชื่องานในบัญชีค่าใช้จ่าย (/admin/chatbot/costs) · ค่าเริ่มต้น = งาน AI คลังความรู้/ตารางราคา */
  feature?: AiFeature;
}): Promise<string> {
  const feature = opts.feature ?? "kb_ai";
  const model = opts.model ?? modelFor(feature === "n8n_chat" || feature === "n8n_pricing" ? "kb_ai" : feature);
  // 💸 ผ่าน callGemini ให้ลงบัญชีค่าใช้จ่ายเอง (8 ต.ค. 69) · ไม่มีคีย์ = โยน Error ข้อความไทยเหมือนเดิม
  const r = await callGemini({
    feature,
    model,
    body: {
      contents: opts.contents,
      ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
      // 8 ต.ค. 69 kb_ai = 3.8 Flash ซึ่งคิดเองถ้าไม่สั่ง → กิน maxOutputTokens (คัดซ้ำตั้งไว้ 100) จนคำตอบขาด · ผู้เรียกตั้ง thinkingConfig เองได้
      generationConfig: { ...noThinking(model), ...(opts.generationConfig ?? {}) },
    },
    // Netlify ตัดฟังก์ชันที่ 30 วิ — กันท้ายไว้ให้ตอบ error ทัน
    timeoutMs: opts.timeoutMs ?? 26_000,
  });
  if (!r.ok) throw new Error(`AI ขัดข้อง: ${r.json?.error?.message || `HTTP ${r.status}`}`);
  const text = geminiText(r.json);
  if (!text) throw new Error("AI ไม่ตอบ — ลองใหม่อีกครั้ง");
  return text;
}

/** ตัด ```json … ``` ออกแล้ว JSON.parse */
export function parseAiJson<T>(text: string): T {
  return JSON.parse(text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()) as T;
}

/** data:image/...;base64,xxx → inlineData */
export function inlineImage(dataUrl: string): GeminiPart | null {
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl);
  return m ? { inlineData: { mimeType: m[1], data: m[2] } } : null;
}

/** รูปที่อยู่ใน Storage แล้ว (url) → inlineData ให้ AI อ่าน */
export async function urlToInline(url: string): Promise<GeminiPart | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return { inlineData: { mimeType: res.headers.get("content-type") || "image/jpeg", data: buf.toString("base64") } };
  } catch {
    return null;
  }
}

/* ── อ่านหน้าเว็บ ─────────────────────────────────────── */

/**
 * ข้อความล้วนจากหน้าเว็บ — ลำดับเดียวกับ fetchPageText ของ AdminBuddy แต่ฝั่งเซิร์ฟเวอร์ไม่ติด CORS
 * จึงไม่ต้องวนพร็อกซีสาธารณะ 4 ตัว: Jina Reader (อ่านหน้า JS ได้) → ดึงตรงแล้วลอก HTML เอง
 */
export async function fetchPageText(url: string): Promise<string | null> {
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: "text/plain" }, signal: AbortSignal.timeout(15_000) });
    if (r.ok) {
      const t = (await r.text()).trim();
      if (t.length > 50) return t;
    }
  } catch {
    /* ไปทางถัดไป */
  }
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { "User-Agent": "Mozilla/5.0 iDuckyAdmin" } });
    if (!r.ok) return null;
    const html = await r.text();
    return (
      html
        .replace(/<(script|style|nav|footer|header|iframe|noscript)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim() || null
    );
  } catch {
    return null;
  }
}

/* ── รูป (Firebase Storage ถังเดียวกับ AdminBuddy) ──────── */

export type StoredImage = { url: string; storagePath: string };

/**
 * อัปไฟล์ขึ้น Storage แล้วคืน URL แบบมี token (ทรงเดียวกับ getDownloadURL ของหน้าเดิม — เปิดได้โดยไม่ต้องล็อกอิน)
 * path: price-link-images/{linkId}/... (ลิงก์ราคา) · price-link-images/kb-{docId}/... (คลังความรู้) ตามของเดิม
 */
export async function uploadImage(folder: string, fileName: string, buf: Buffer, contentType: string): Promise<StoredImage> {
  db(); // ให้ initializeApp ทำงานก่อน
  const safeFolder = folder.replace(/[^\w\-ก-๙]/g, "_").slice(0, 60);
  const safeName = fileName.replace(/[/\\?#%]/g, "_").slice(0, 100);
  const storagePath = `price-link-images/${safeFolder}/${Date.now()}_${safeName}`;
  const token = randomUUID();
  await getStorage()
    .bucket(BUCKET)
    .file(storagePath)
    .save(buf, { contentType, metadata: { metadata: { firebaseStorageDownloadTokens: token } }, resumable: false });
  const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
  return { url, storagePath };
}
