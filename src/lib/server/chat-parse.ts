import "server-only";

/**
 * ขั้น "วิเคราะห์คำถามลูกค้าก่อนตอบ" (Smart Preprocessing) — พอร์ตมาจาก parseCustomerMessage ของ
 * AdminBuddy chat.html ให้ทำงานฝั่งเซิร์ฟเวอร์ของเว็บร้าน
 *
 * ทำไมต้องมี: chat.html ฉลาดกว่าเว็บเพราะก่อนส่งไป n8n มันใช้ AI แยกคำถามก่อนว่า
 * ลูกค้าถามสินค้าอะไร วัสดุอะไร กี่ชิ้น ถามราคาหรือถามวิธี แล้วฝังผลวิเคราะห์เป็น hint
 * ให้ AI ตัวตอบค้นข้อมูลถูกจุด — เว็บร้านเดิมส่งข้อความดิบ คำตอบเลยคนละคุณภาพ
 *
 * ใช้ Gemini Flash Lite (ตัวเดียวกับ chat.html) ผ่าน env GEMINI_API_KEY
 * ไม่มีคีย์/ล้มเหลว/ช้าเกิน → คืน null แล้วระบบ fallback เป็นการจับคู่คำแบบเดิม (ไม่พังทั้งแชท)
 */

/**
 * ผลวิเคราะห์ข้อความลูกค้า — โครงตามพรอมป์ตที่ร้านกำหนด (intent + slots)
 * `relevant_kb` เป็นส่วนที่เว็บขอเพิ่มจากโครงเดิม ใช้เลือกหัวข้อคลังความรู้ 1,100+ ข้อ
 * ให้ตรงคำถาม ถ้าถอดออกระบบจะกลับไปเลือกด้วยการจับคู่คำซึ่งแม่นน้อยกว่ามาก
 */
export interface ParsedMessage {
  intent?: string;
  slots?: {
    product?: string | null;
    material?: string | null;
    size?: string | null;
    quantity?: string | null;
    lamination?: string | null;
    deadline?: string | null;
  };
  missing_slots?: string[];
  search_query?: string;
  is_ambiguous?: boolean;
  escalate?: boolean;
  escalate_reason?: string | null;
  /** ดัชนีหัวข้อคลังความรู้ (ตามลำดับที่ส่งไปให้เลือก) ที่ AI เห็นว่าเกี่ยวกับคำถาม */
  relevant_kb?: number[];
}

/** ค่าที่ลูกค้าระบุมาแล้ว รวมเป็นชุดคำสำหรับค้นหา/จับคู่สินค้า */
export function parsedTerms(parsed: ParsedMessage | null): string[] {
  const s = parsed?.slots;
  return [s?.product, s?.material, s?.size, s?.lamination, parsed?.search_query]
    .filter((t): t is string => typeof t === "string" && !!t.trim());
}

/** ชื่อสินค้าที่ลูกค้าพูดถึง (ถ้ามี) */
export function parsedProduct(parsed: ParsedMessage | null): string {
  return parsed?.slots?.product?.trim() || "";
}

/** วิเคราะห์นานกว่านี้ไม่คุ้ม — ปล่อยผ่านไปตอบแบบไม่มี hint ดีกว่าให้ลูกค้ารอ */
const PARSE_TIMEOUT_MS = 6_000;

const MODEL = "gemini-2.5-flash-lite";

const SYSTEM_PROMPT =
  "คุณคือตัวช่วยวิเคราะห์ข้อความลูกค้าของร้านพิมพ์ iDucky\n" +
  "หน้าที่: อ่านข้อความล่าสุด + ประวัติแชท แล้วแปลงเป็น JSON เท่านั้น ห้ามมีข้อความอื่นนำหน้าหรือปิดท้าย ห้ามใส่ ```";

function buildPrompt(msg: string, kbTitles: { index: number; title: string }[], history: string): string {
  // คลังความรู้มี 1,100+ หัวข้อ ส่งหมดไม่ไหว — คัดหยาบด้วยการจับคู่คำมาก่อนแล้วให้ AI เลือกต่อ
  let kbBlock = "";
  if (kbTitles.length) {
    kbBlock =
      "\n\nคลังความรู้ของร้าน (เลือกหมายเลขหัวข้อที่ตรงกับคำถามมากที่สุด 1-8 หัวข้อ ใส่ใน relevant_kb ไม่มีที่เกี่ยวข้องใส่ []):\n" +
      kbTitles.map((t) => `${t.index}. ${t.title}`).join("\n");
  }

  return `ประวัติแชท 6 ข้อความล่าสุด:
${history || "(ยังไม่มี — นี่คือข้อความแรก)"}

ข้อความล่าสุดจากลูกค้า:
${msg}

หลักการวิเคราะห์:
1. ลูกค้าไทยพิมพ์สั้นมาก คำเดียวก็มี ให้เดา intent จากบริบทประวัติแชทเสมอ ห้ามมองข้อความล่าสุดเดี่ยวๆ
2. คำที่ลูกค้าใช้ ไม่ตรงกับคำในระบบ ให้แปลงเป็นคำมาตรฐานใน search_query เช่น
   - "ตัดตามรูป" / "ตัดตามแบบ" / "ไดคัด" → ไดคัท (die-cut)
   - "สติกเกอร์กันน้ำ" / "แบบมันๆ" → สติกเกอร์ PVC
   - "เคสมือถือ" + ชื่อรุ่น → เคสโทรศัพท์ + รุ่น
   - "เคลือบด้าน/เคลือบเงา" → ลามิเนต
3. ถ้าข้อความเป็นการตอบคำถามที่บอทเพิ่งถามไป (เช่น "500 ค่ะ") ให้เติม slot นั้นและคง intent เดิมไว้
4. ห้ามเดาข้อมูลที่ลูกค้าไม่ได้พูด ให้ใส่ null${kbBlock}

ตอบเป็น JSON โครงนี้:
{
  "intent": "ถามราคา | ถามสเปค | ถามระยะเวลา | สั่งซื้อ | ส่งไฟล์งาน | ติดตามออเดอร์ | เคลมงาน | ขอคุยแอดมิน | ทักทาย | อื่นๆ",
  "slots": {
    "product": null,
    "material": null,
    "size": null,
    "quantity": null,
    "lamination": null,
    "deadline": null
  },
  "missing_slots": ["ชื่อ slot ที่จำเป็นต่อการตอบแต่ยังไม่มี"],
  "search_query": "ประโยคค้นหาแบบเต็มความ ใช้ศัพท์มาตรฐานของร้าน",
  "is_ambiguous": true/false,
  "escalate": true/false,
  "escalate_reason": null,
  "relevant_kb": []
}

เกณฑ์ escalate = true:
- ลูกค้าขอคุยคน หรือพิมพ์ว่า "แอดมิน"
- ลูกค้าไม่พอใจ ต่อว่า หรือทวงงาน
- เป็นการเคลม งานเสีย งานผิด
- ถามราคาที่ต้องคิดเป็นกรณีพิเศษ เช่น งานจำนวนมาก งานที่ไม่มีในแคตตาล็อก
- ลูกค้าถามเรื่องเดิมซ้ำเป็นครั้งที่ 3 ขึ้นไป`;
}

export async function parseCustomerMessage(
  msg: string,
  kbTitles: { index: number; title: string }[],
  history = "",
): Promise<ParsedMessage | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  // ข้อความสั้นมาก/คำทักทาย ไม่ต้องเสียเวลาวิเคราะห์ — ให้ n8n ตอบเลย
  const trimmed = msg.trim();
  // สั้นมากแต่มีบทสนทนาก่อนหน้า = คำถามต่อเนื่อง ("แล้ว 300 ล่ะ") ต้องวิเคราะห์ ไม่ใช่ปล่อยผ่าน
  if (trimmed.length < 6 && !history) return null;
  if (/^(สวัสดี|หวัดดี|ดีจ้า|ดีครับ|ดีค่ะ|hello|hi|ทดสอบ|เทส)[\sครับค่ะคะจ้า!.~]*$/i.test(trimmed)) return null;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${buildPrompt(msg, kbTitles, history)}` }] }],
          generationConfig: { maxOutputTokens: 500, temperature: 0 },
        }),
        signal: AbortSignal.timeout(PARSE_TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;
    const result = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = (result.candidates?.[0]?.content?.parts?.[0]?.text ?? "")
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    if (!text) return null;
    const parsed = JSON.parse(text) as ParsedMessage;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * ตอบเองจาก context ที่ประกอบไว้ (ไม่ผ่าน n8n) — ใช้เป็นทางหนีทีไล่ตอน n8n ช้าเกิน/ล่ม
 * แบบเดียวกับ chat.html ที่มี Gemini-direct fallback · คืน null เมื่อไม่มีคีย์/ล้มเหลว
 */
export async function answerFromContext(
  message: string,
  systemMessage: string | undefined,
  knowledgeContext: string | undefined,
  history = "",
  timeoutMs = 6_000,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || (!systemMessage && !knowledgeContext)) return null;

  const prompt = `คุณคือ "ผู้ช่วย iDucky" แอดมินร้าน iDucky Prints Studio (รับพิมพ์/ผลิตสินค้าตามสั่ง เช่น อะคริลิค พวงกุญแจ สติกเกอร์ ของพรีเมียม) กำลังตอบลูกค้าทางแชทหน้าเว็บ
กติกา:
- ตอบภาษาไทย สุภาพ เป็นกันเอง กระชับ อ่านง่าย ใช้บูลเล็ต • เมื่อเหมาะ
- ใช้ "เฉพาะข้อมูลร้านด้านล่างนี้" ตอบ ห้ามเดาราคา/ข้อมูลที่ไม่มี
- ถ้าข้อมูลไม่พอ ให้บอกตรง ๆ แล้วชวนลูกค้าทักไลน์ร้านเพื่อคุยกับแอดมิน
- แนบลิงก์เฉพาะอันที่ตรงกับสิ่งที่ลูกค้าถาม "จริง ๆ" เท่านั้น (ไม่เกิน 2 ลิงก์) — ไม่ตรงห้ามแนบ
- ลิงก์ให้พิมพ์เป็น URL เต็มในบรรทัดของตัวเอง ห้ามใช้รูปแบบ [ชื่อ](ลิงก์)
- ห้ามพูดถึงระบบภายใน/ชื่อไฟล์/คำว่า context

[ข้อมูลร้าน]
${systemMessage ?? ""}

${knowledgeContext ?? ""}

${history ? `[บทสนทนาก่อนหน้า]\n${history}\n\n` : ""}คำถามลูกค้า: "${message}"`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1000, temperature: 0.4 },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    if (!res.ok) return null;
    const result = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = (result.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
    return text || null;
  } catch {
    return null;
  }
}

export function isPricingQuestion(parsed: ParsedMessage | null): boolean {
  return (parsed?.intent ?? "").includes("ถามราคา");
}

/** คำถามที่ต้องอธิบายก่อน ไม่ใช่โยนราคาใส่ — สเปค/ระยะเวลา/วิธีส่งไฟล์ */
export function isHowToQuestion(parsed: ParsedMessage | null): boolean {
  const i = parsed?.intent ?? "";
  return i.includes("ถามสเปค") || i.includes("ถามระยะเวลา") || i.includes("ส่งไฟล์");
}

/** ลูกค้าขอคุยคน/ไม่พอใจ/เคลม → ต้องส่งต่อแอดมิน ไม่ใช่ให้บอทดันต่อ */
export function needsHuman(parsed: ParsedMessage | null): boolean {
  return !!parsed?.escalate;
}

/** ทักทายเฉย ๆ ยังไม่ได้ถามอะไร */
export function isGreeting(parsed: ParsedMessage | null): boolean {
  return (parsed?.intent ?? "").includes("ทักทาย");
}

/**
 * ถามราคาแต่ยังไม่รู้ว่าสินค้าอะไร → ถามกลับ ไม่เดาราคามั่ว
 * ถาม slot ที่ขาดตามที่ชั้นวิเคราะห์ระบุมา จะได้ถามตรงจุดแทนที่จะถามกว้าง ๆ
 */
export function askBackMessage(parsed: ParsedMessage | null): string | null {
  if (!parsed?.is_ambiguous || !isPricingQuestion(parsed) || parsedProduct(parsed)) return null;
  const missing = (parsed.missing_slots ?? []).map(slotLabel).filter(Boolean);
  const ask = missing.length ? missing.join(" / ") : "สินค้าที่สนใจ";
  return `ขออนุญาตสอบถามเพิ่มเติมนะครับ เพื่อจะได้แจ้งราคาที่ถูกต้อง\nรบกวนแจ้ง ${ask} ด้วยครับ 🙏`;
}

function slotLabel(slot: string): string {
  const map: Record<string, string> = {
    product: "สินค้าที่สนใจ",
    material: "วัสดุ/เนื้องาน",
    size: "ขนาด",
    quantity: "จำนวน",
    lamination: "การเคลือบ",
    deadline: "กำหนดรับงาน",
  };
  return map[slot] ?? slot;
}

/** สรุปผลวิเคราะห์เป็นข้อความ hint ให้ AI ตัวตอบค้นข้อมูลถูกจุด */
export function buildParsedHint(parsed: ParsedMessage | null): string {
  if (!parsed) return "";
  const s = parsed.slots ?? {};

  let hint = "\n[วิเคราะห์คำถามลูกค้า]\n";
  if (parsed.intent) hint += `ประเภทคำถาม: ${parsed.intent}\n`;
  if (parsed.search_query) hint += `คำถามที่ตีความแล้ว: ${parsed.search_query}\n`;
  if (s.product) hint += `สินค้า: ${s.product}\n`;
  if (s.material) hint += `วัสดุ: ${s.material}\n`;
  if (s.size) hint += `ขนาด: ${s.size}\n`;
  if (s.quantity) hint += `จำนวน: ${s.quantity}\n`;
  if (s.lamination) hint += `การเคลือบ: ${s.lamination}\n`;
  if (s.deadline) hint += `กำหนดรับงาน: ${s.deadline}\n`;
  if (parsed.missing_slots?.length)
    hint += `ยังไม่รู้: ${parsed.missing_slots.map(slotLabel).join(", ")} — ถามกลับก่อนถ้าจำเป็นต่อการตอบ\n`;

  if (isHowToQuestion(parsed)) {
    hint +=
      '→ ⚠️ ลูกค้าถามเรื่อง "สเปค/ขั้นตอน/ระยะเวลา" — ต้องอธิบายให้ละเอียดก่อน แล้วค่อยเสริมราคาทีหลัง ห้ามเน้นราคาเป็นคำตอบหลัก\n';
  } else if (isPricingQuestion(parsed)) {
    hint += "→ ต้องค้นหาราคาให้ครบทุกรายการ ห้ามข้าม ห้ามเดาราคา\n";
    hint +=
      '→ ⚠️ ต้องจับคู่ "วัสดุ" ให้ตรงกับที่ลูกค้าระบุ เช่นลูกค้าบอก "อาร์ตมัน" ห้ามใช้ราคา PVC\n';
    hint += "→ ⚠️ สินค้าที่ขายเป็นเซ็ต ต้องแปลงจำนวนชิ้นเป็นเซ็ตก่อนค้นเรทราคา\n";
    hint += "→ ⚠️ ออปชันเพิ่ม (สกรีน 2 ด้าน เคลือบ ตัดรูปทรง) ต้องค้นราคาแยกแล้วบวกเพิ่ม ห้ามรวมในราคาฐาน\n";
  }
  if (parsed.escalate) hint += `→ 🚨 เคสนี้ควรให้แอดมินตัวจริงดูแลต่อ (${parsed.escalate_reason ?? "ลูกค้าต้องการคุยกับคน"})\n`;
  return hint;
}

export async function writePriceReply(message: string, priceText: string, history = ""): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !priceText.trim()) return null;

  const prompt = `คุณคือ "ผู้ช่วย iDucky" แอดมินผู้ชายของร้าน iDucky Prints Studio ตอบลูกค้าทางแชทหน้าเว็บ
เรียบเรียงข้อมูลราคาด้านล่างให้เป็นคำตอบที่อ่านง่าย
กติกา (ห้ามฝ่าฝืน):
- ⚠️ ตัวเลขทุกตัว ช่วงจำนวนทุกช่วง และชื่อตัวเลือกทุกอัน ต้องคงไว้ครบเป๊ะ ห้ามปัด ห้ามตัดทิ้ง ห้ามสรุปรวบ
- ห้ามเพิ่มราคา/เงื่อนไข/ของแถม ที่ไม่มีในข้อมูล
- ภาษาไทย สุภาพ เป็นกันเอง ลงท้าย "ครับ" เสมอ (ห้ามใช้ ค่ะ/นะคะ)
- ใช้บูลเล็ต • ขึ้นต้นบรรทัด ห้ามใช้มาร์กดาวน์อื่น (ห้าม **, ห้าม *, ห้าม #) กล่องแชทแสดงไม่ได้\n- ⚠️ 1 ตัวเลือก = 1 บรรทัด ให้ช่วงจำนวนทั้งหมดของตัวเลือกนั้นอยู่บรรทัดเดียวกัน คั่นด้วย " · " ห้ามแตกแต่ละช่วงเป็นบรรทัดใหม่
- ⚠️ ถ้าข้อมูลมีหลายเรท (บรรทัดในวงเล็บเหลี่ยม 【...】) ต้องคงหัวข้อเรทไว้เป็นบรรทัดนำหน้ากลุ่มของมัน พร้อมขั้นต่ำถ้ามี — ห้ามยุบรวมทุกเรทเป็นลิสต์เดียว ลูกค้าจะแยกไม่ออกว่าราคาไหนของเรทไหน\n- ห้ามขึ้นต้นด้วยคำทักทาย เข้าเรื่องเลย
- คงลิงก์ที่ให้มาไว้ท้ายคำตอบ วางเป็น URL เต็มในบรรทัดของตัวเอง ห้ามแก้ URL
- ถ้าลูกค้ายังไม่บอกจำนวน ปิดท้ายด้วยคำถามสั้น ๆ ถามจำนวน/ขนาดที่สนใจ 1 บรรทัด
- ห้ามเติมประโยคปิดท้ายลอย ๆ เช่น "มีอะไรให้ช่วยเพิ่มไหม"
${history ? `\n[บทสนทนาก่อนหน้า]\n${history}\n` : ""}
[คำถามลูกค้า]
${message}

[ราคาจริงจากระบบ - แหล่งเดียวที่เชื่อได้]
${priceText}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1200, temperature: 0.3 },
        }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) return null;
    const result = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = (result.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
    return text || null;
  } catch {
    return null;
  }
}
