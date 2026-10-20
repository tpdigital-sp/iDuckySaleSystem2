import "server-only";
import { callGemini } from "@/lib/server/ai-usage";
import { modelFor, noThinking } from "@/lib/ai-models";

/**
 * 🌏 ตอบเป็นภาษาที่ลูกค้าพิมพ์มา (เจ้าของร้าน 20 ต.ค. 69 "ฉันอยากให้ตอบเป็นภาษาที่ลูกค้าพิมพ์มา")
 *   เคสจริง Paron: "Plastic. 400 units. … What price can you offer for 400 units?" → ร่างบอทเป็นไทยล้วน
 *   ("ขอถามเพิ่ม 1 ข้อ … ขนาด เลือกแบบไหนดีคะ") เพราะคำตอบราคาเป็นแม่แบบภาษาไทยใน price-answer.ts
 * → ดูภาษาจากข้อความลูกค้า ไม่ใช่ไทย = แปลคำตอบที่ประกอบเสร็จแล้วทั้งก้อน (ตัวเลข/ราคา/โครงบรรทัดคงเดิม)
 *   การ์ด Flex ใน n8n แยกบรรทัดด้วย • — 【】 อยู่แล้ว จึงต้องคงเครื่องหมายเหล่านี้ไว้ตรงตำแหน่งเดิม
 */

export type ReplyLang = { code: string; name: string };

const THAI = /[฀-๿]/g;
const LATIN = /[A-Za-z]/g;

/** ภาษาของข้อความลูกค้า — "th" เมื่อมีตัวไทยพอสมควร หรือข้อความสั้นจนบอกไม่ได้ (ok / 400 / 👍) */
export function detectLang(text: string): ReplyLang {
  const t = String(text ?? "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\d\s.,:;!?()[\]"'/\\@#%&*+=_~<>|-]+/g, " ");
  const th = (t.match(THAI) ?? []).length;
  const latin = (t.match(LATIN) ?? []).length;
  const kana = (t.match(/[぀-ヿ]/g) ?? []).length;
  const hangul = (t.match(/[가-힯]/g) ?? []).length;
  const han = (t.match(/[一-鿿]/g) ?? []).length;
  if (th >= 2 && th >= (latin + han + kana + hangul) * 0.25) return { code: "th", name: "Thai" };
  if (kana >= 2) return { code: "ja", name: "Japanese" };
  if (hangul >= 2) return { code: "ko", name: "Korean" };
  if (han >= 2) return { code: "zh", name: "Chinese" };
  // คำอังกฤษสั้น ๆ คำเดียว ("ok" "yes" "A3") ในแชทไทย ไม่นับ — ต้องเป็นประโยคพอสมควร
  if (latin >= 8 && /[A-Za-z]{2,}\s+[A-Za-z]{2,}|[A-Za-z]{6,}/.test(t)) return { code: "en", name: "English" };
  return { code: "th", name: "Thai" };
}

const cache = new Map<string, { at: number; v: { answer: string; askNext: string | null } }>();

/**
 * แปลคำตอบราคา (answer + askNext) เป็นภาษาของลูกค้า — ล้ม/ช้า = คืนของเดิม (ไทย) ไม่ให้ลูกค้าได้ความเงียบ
 */
export async function translateReply(
  input: { answer: string; askNext: string | null; customerText: string },
  lang: ReplyLang,
): Promise<{ answer: string; askNext: string | null; translated: boolean }> {
  const { answer, askNext } = input;
  if (lang.code === "th" || (!answer.trim() && !askNext?.trim())) return { answer, askNext, translated: false };
  const key = `${lang.code}\n${answer}\n${askNext ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return { ...hit.v, translated: true };
  const prompt = `You translate replies from a Thai print & merchandise shop (iDuckyShop) to the customer's language.
Customer's message (reply in THIS language — ${lang.name}):
"""${input.customerText.slice(0, 600)}"""

Translate both fields below from Thai into ${lang.name}. Rules:
- Keep the exact same lines in the same order (same number of line breaks). Do not add, merge, drop or reorder lines.
- Keep these symbols exactly where they are: • 【 】 — · ✨ 🥰 💕 📐 and other emoji, ฿ prices, every number, sizes like 12.8 × 15.8, URLs.
- Translate units naturally: แผ่น A3 → A3 sheet(s), ตร.ม. → sq.m., ชิ้น/อัน/ใบ/ตัว/ผืน → pc(s), ดวง → sticker(s)/pc(s), เซ็ต/ชุด → set(s), ลาย → design(s), ซม. → cm.
- Product and option names: translate to clear natural ${lang.name} (e.g. พัดพลาสติกใส → Clear plastic fan, ไดคัท 50% → Die-cut 50% (kiss cut), ไดคัท 100% → Die-cut 100% (cut through)).
- Tone: warm, polite shop admin. No Thai politeness particles (ค่ะ/คะ/นะคะ/น้า). Keep it as short as the original.
- "พิมพ์ตัวเลขหรือชื่อแบบตอบมาได้เลยค่ะ" means "Just reply with the number or the option name".
Return JSON only: {"answer": "...", "askNext": "..."} (askNext = "" if empty).

answer:
"""${answer}"""

askNext:
"""${askNext ?? ""}"""`;
  try {
    const model = modelFor("price_translate");
    const r = await callGemini({
      feature: "price_translate",
      model,
      body: {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { ...noThinking(model), temperature: 0.2, maxOutputTokens: 2000, responseMimeType: "application/json" },
      },
      timeoutMs: 9_000,
    });
    if (!r.ok) return { answer, askNext, translated: false };
    const raw = String(r.json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").replace(/```json\s*|```/g, "").trim();
    const j = JSON.parse(raw) as { answer?: unknown; askNext?: unknown };
    const a = typeof j.answer === "string" ? j.answer.trim() : "";
    const n = typeof j.askNext === "string" ? j.askNext.trim() : "";
    // 🛡 แปลแล้วโครงพัง (จำนวนบรรทัดต่างมาก / ตัวเลขราคาหาย) = ใช้ของเดิม — ราคาผิดแย่กว่าตอบเป็นไทย
    const prices = (s: string) => (s.match(/฿\s?[\d,]+(\.\d+)?/g) ?? []).map((x) => x.replace(/\s/g, "")).sort().join("|");
    const lines = (s: string) => s.split("\n").filter((l) => l.trim()).length;
    if (!a && answer.trim()) return { answer, askNext, translated: false };
    if (prices(a) !== prices(answer) || Math.abs(lines(a) - lines(answer)) > 1) return { answer, askNext, translated: false };
    if (askNext && (!n || prices(n) !== prices(askNext))) return { answer, askNext, translated: false };
    const v = { answer: a || answer, askNext: askNext ? n : askNext };
    cache.set(key, { at: Date.now(), v });
    return { ...v, translated: true };
  } catch {
    return { answer, askNext, translated: false };
  }
}
