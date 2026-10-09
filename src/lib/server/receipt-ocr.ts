import "server-only";
import { callGemini } from "@/lib/server/ai-usage";
import { modelFor, noThinking } from "@/lib/ai-models";

/**
 * 📷🧾 อ่าน "เลขที่เอกสาร" จากภาพใบเสร็จที่ฝ่ายแพ็คถ่ายก่อนใส่กล่อง (9 ต.ค. 69)
 *
 * ทำไม: ใบที่มี 2 บิล พนักงานปริ้นใบเสร็จใบเดียวกันซ้ำ 2 ชุด คนแพ็คนับได้ 2 ใบเลยส่งไป
 * อ่านเลขจากภาพแล้วเทียบกับเลขที่ต้องใส่กล่อง — ถ่ายใบที่เลขซ้ำ/เป็นเลขของอีกใบ = ไม่รับ
 * อ่านไม่ออก/ไม่มีคีย์/ช้าเกิน = null (ไม่ทำให้การแนบภาพพัง — ภาพยังเป็นหลักฐานให้คนดูย้อนหลังได้)
 */

const MODEL = modelFor("receipt_ocr");
const OCR_TIMEOUT_MS = 12_000;

const PROMPT = `รูปนี้คือเอกสารการขายของร้าน (ใบกำกับภาษี/ใบเสร็จรับเงิน/ใบเสนอราคา/ใบวางบิล จาก FlowAccount)
อ่าน "เลขที่เอกสาร" ของเอกสารหลักในรูป แล้วตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น:
{"docNos":[string]}
กติกา:
- เลขที่เอกสาร เช่น INV007703 / QT010852 / BL002095 / RE000123 (ตัวอักษรนำหน้าตามด้วยตัวเลข) ไม่มีช่องว่าง ไม่มีขีด
- ถ้าในรูปมีเอกสารหลายใบ ใส่ทุกเลข · เลขที่ "อ้างอิง" (Reference) ของเอกสารอื่นที่พิมพ์อยู่ในใบ ห้ามใส่
- ห้ามใส่เลขผู้เสียภาษี เลขบัญชี เบอร์โทร หรือเลขออเดอร์ OD-…
- อ่านไม่ออก/ไม่ใช่เอกสาร = {"docNos":[]}`;

/** เลขเอกสาร FlowAccount ปกติ — ตัวอักษร 2-4 ตัว + ตัวเลข 4 หลักขึ้นไป */
export const normDocNo = (s: string) => s.replace(/[\s\-_/]/g, "").toUpperCase();
const DOC_RE = /^[A-Z]{2,4}\d{4,}$/;

export async function readReceiptDocNos(bytes: Uint8Array, contentType: string): Promise<string[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || bytes.length > 7 * 1024 * 1024) return null;
  try {
    const r = await callGemini({
      feature: "receipt_ocr",
      model: MODEL,
      apiKey,
      body: {
        contents: [{ parts: [{ inline_data: { mime_type: contentType, data: Buffer.from(bytes).toString("base64") } }, { text: PROMPT }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 200, responseMimeType: "application/json", ...noThinking(MODEL) },
      },
      timeoutMs: OCR_TIMEOUT_MS,
    });
    if (!r.ok) {
      console.error("[receipt-ocr] Gemini ตอบ", r.status, r.errorText.slice(0, 200));
      return null;
    }
    const text = (r.json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").replace(/```json\n?|```/g, "").trim();
    if (!text) return null;
    const parsed = JSON.parse(text) as { docNos?: unknown };
    const list = Array.isArray(parsed?.docNos) ? parsed.docNos : [];
    return Array.from(new Set(list.filter((x): x is string => typeof x === "string").map(normDocNo).filter((x) => DOC_RE.test(x)))).slice(0, 6);
  } catch (e) {
    console.error("[receipt-ocr] อ่านรูปไม่สำเร็จ:", (e as Error)?.message);
    return null;
  }
}

/**
 * ตัดสินภาพที่ถ่ายมาสำหรับเลขที่ `want`:
 *  - อ่านเจอ `want` (หรือเลขบิลต้นทางของมัน) = ผ่าน
 *  - อ่านเจอแต่เลขของ "อีกใบในออเดอร์เดียวกัน" / เลขที่ถ่ายไปแล้ว = ไม่รับ (ต้นเหตุเคส 9 ต.ค. 69: ปริ้นใบเดิมซ้ำ)
 *  - อ่านไม่ออก / เป็นเลขอื่นที่ไม่รู้จัก = รับไว้ (AI อ่านพลาดได้ ห้ามกันงาน) แต่จดเลขที่อ่านได้ให้คนตรวจย้อนเห็น
 */
export function judgeReceiptRead(
  read: string[] | null,
  want: string,
  wantAliases: string[],
  otherDocs: string[],
  alreadyShot: string[]
): { ok: true; read?: string } | { ok: false; error: string } {
  if (!read || !read.length) return { ok: true };
  const mine = new Set([want, ...wantAliases].map(normDocNo));
  const hit = read.find((n) => mine.has(n));
  if (hit) return { ok: true, read: hit };
  const dupShot = read.find((n) => alreadyShot.map(normDocNo).includes(n));
  if (dupShot)
    return { ok: false, error: `ภาพนี้เป็นใบเลขที่ ${dupShot} ซึ่งถ่ายไปแล้ว — ต้องเป็นใบเลขที่ ${want} (คนละใบ คนละเลขที่ ห้ามปริ้นใบเดิมซ้ำ)` };
  const other = read.find((n) => otherDocs.map(normDocNo).includes(n));
  if (other) return { ok: false, error: `ภาพนี้เป็นใบเลขที่ ${other} ไม่ใช่ ${want} — ถ่ายให้ตรงช่อง หรือปริ้นใบเลขที่ ${want} มาเพิ่ม` };
  return { ok: true, read: read[0] };
}
