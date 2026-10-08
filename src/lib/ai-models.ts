import type { AiFeature } from "@/lib/ai-cost";

/**
 * 🧠 โมเดล Gemini ที่แต่ละงานใช้ "ตอนนี้" — ที่เดียวทั้งระบบ (8 ต.ค. 69)
 *
 * เดิมชื่อโมเดลกระจายเป็นสตริงอยู่ใน 6 ไฟล์ จะเปลี่ยนรุ่นต้องไล่แก้ทีละจุด และหน้าแดชบอร์ดค่าใช้จ่ายบอกไม่ได้ว่า
 * "งานไหนตั้งโมเดลอะไรอยู่" จนกว่าจะมีคำขอเข้ามา → รวมไว้ที่นี่ แดชบอร์ดอ่านตรงจากตารางนี้
 *
 * 8 ต.ค. 69 ย้ายจาก 2.5 (Google ขึ้นป้าย legacy) มารุ่นปัจจุบัน 3.x — เทียบ regression ชั้นเว็บ 22 เคสแล้ว:
 * - 3.5 Flash-Lite แทนทั้ง 2.5 Flash-Lite และชั้นเข้าใจคำถาม (2.5 Flash) → ผลเท่า/ดีกว่า เร็วกว่า ~0.3 วิ
 *   (3.8 Flash ก็ถูกแต่ช้ากว่า ~1 วิต่อข้อความ — ชั้นเข้าใจคำถามโดนเรียกทุกข้อความ เลยไม่ใช้)
 * - 3.8 Flash สำหรับงานที่ต้องการความแม่น ไม่ต้องเร็ว (คลังความรู้ · อ่านสลิป) — ปิด thinking (noThinking)
 *   ⚠️ ราคาโปรฯ 3.8 Flash ขึ้น 2 เท่า 1 ม.ค. 2027 (lib/ai-cost.ts) ถึงตอนนั้นค่อยเทียบใหม่
 *
 * env ที่ทับได้: UNDERSTAND_MODEL (ชั้นเข้าใจคำถามราคา — มีมาก่อน 1 ต.ค. 69)
 */
export const AI_MODEL_BY_FEATURE: Record<Exclude<AiFeature, "n8n_chat" | "n8n_pricing">, string> = {
  chat_parse: "gemini-3.5-flash-lite",
  chat_answer: "gemini-3.5-flash-lite",
  chat_price_reply: "gemini-3.5-flash-lite",
  price_understand: "gemini-3.5-flash-lite",
  price_pick: "gemini-3.5-flash-lite",
  price_info: "gemini-3.5-flash-lite",
  kb_ai: "gemini-3.8-flash",
  slip_ocr: "gemini-3.8-flash",
  customer_profile: "gemini-3.5-flash-lite",
};

/** โมเดลสำรองของชั้นเข้าใจคำถามราคา เมื่อตัวหลักล้ม/ช้าเกิน */
export const PRICE_UNDERSTAND_FALLBACK = "gemini-3.1-flash-lite";

/**
 * โมเดลที่ตั้งไว้ใน n8n (ไม่ได้เรียกจากเว็บ — แก้ใน n8n แล้วต้องมาแก้ตรงนี้ด้วยให้แดชบอร์ดตรง)
 * n8n_chat = AI Agent1 ของ workflow ChatBot (knowledge-chat) · เปลี่ยนจาก Gemini 2.5 Flash 8 ต.ค. 69 (เทียบ 10 โมเดล Sonnet 5.5 ดีสุด)
 */
export const N8N_MODEL_BY_FEATURE: Partial<Record<Extract<AiFeature, "n8n_chat" | "n8n_pricing">, string>> = {
  n8n_chat: "claude-sonnet-5-5",
};

/** โมเดลที่ใช้จริงของงานนั้น (รวม env override) */
export function modelFor(feature: keyof typeof AI_MODEL_BY_FEATURE): string {
  if (feature === "price_understand") return (process.env.UNDERSTAND_MODEL || AI_MODEL_BY_FEATURE.price_understand).trim();
  return AI_MODEL_BY_FEATURE[feature];
}

/**
 * ปิด thinking ให้ตอบเร็ว — แต่ละรุ่นรับไม่เหมือนกัน (ทดสอบ 8 ต.ค. 69):
 * Flash 2.5/3.x ไม่ใส่ = คิดเอง (3.8 Flash กิน maxOutputTokens จนคำตอบขาด) → ต้องส่ง thinkingBudget 0
 * Flash-Lite 2.5/3.x ไม่คิดอยู่แล้ว และ 3.5 Flash-Lite ส่ง thinkingBudget 0 = HTTP 400 → ไม่ส่งอะไร
 */
export function noThinking(model: string): { thinkingConfig?: { thinkingBudget: number } } {
  return /flash(?!-lite)/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {};
}
