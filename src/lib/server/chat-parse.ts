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

export interface ParsedMessage {
  product?: string;
  product_category?: string;
  ambiguous?: boolean;
  ambiguous_options?: string[];
  products?: string[];
  corrected_query?: string;
  material?: string;
  options?: string[];
  search_terms?: string[];
  quantity?: string;
  question_type?: string;
  /** ดัชนีหัวข้อคลังความรู้ (ตามลำดับที่ส่งไปให้เลือก) ที่ AI เห็นว่าเกี่ยวกับคำถาม */
  relevant_kb?: number[];
}

/** วิเคราะห์นานกว่านี้ไม่คุ้ม — ปล่อยผ่านไปตอบแบบไม่มี hint ดีกว่าให้ลูกค้ารอ */
const PARSE_TIMEOUT_MS = 6_000;

const MODEL = "gemini-2.5-flash-lite";

const SYSTEM_PROMPT =
  "คุณเป็นแอดมินมืออาชีพของร้านพิมพ์/ผลิตตามสั่ง (Print-on-Demand) ช่วยวิเคราะห์คำถามลูกค้า ให้ตอบเป็น JSON เท่านั้น";

function buildPrompt(msg: string, kbTitles: { index: number; title: string }[]): string {
  let kbTitlesList = "";
  if (kbTitles.length) {
    kbTitlesList = "\n\nคลังความรู้ของร้าน (เลือกหัวข้อที่เกี่ยวข้องกับคำถาม ใช้หมายเลขตามที่แสดง):\n";
    kbTitles.forEach((t) => {
      kbTitlesList += `${t.index}. ${t.title}\n`;
    });
    kbTitlesList +=
      "\nจากรายการด้านบน เลือกหมายเลขหัวข้อที่ตรงกับคำถามลูกค้ามากที่สุด (เลือก 1-8 หัวข้อ ถ้าถามหลายสินค้าให้เลือกหัวข้อที่ตรงกับทุกสินค้า) ใส่ใน relevant_kb";
  }

  return `คำถาม: "${msg}"

สิ่งที่ต้องทำ:
1. **วิเคราะห์ intent** — ลูกค้าต้องการรู้เรื่องอะไรจริงๆ คิดเหมือนแอดมินที่เข้าใจลูกค้า
   - "ผ้าเหมาะทำปลอกหมอน" → ลูกค้าถามเรื่อง "เนื้อผ้า/วัสดุ" ไม่ใช่ "ปลอกหมอน"
   - "ราคาปลอกหมอน" → ลูกค้าถามเรื่อง "ราคา" ของ "ปลอกหมอน"
2. **แก้คำผิด/คำสะกดผิด/คำทับศัพท์/คำย่อ** — เดาจากเสียงอ่าน ตัวอักษรใกล้เคียง บริบทร้าน
3. **⚠️ วิเคราะห์ประเภทสินค้าให้ชัดเจน (สำคัญมาก)** — ชื่อวัสดุเดียวกันอาจมีหลายสินค้า ต้องดูบริบททั้งหมด:
   - ดูหน่วยนับ: "A3/แผ่น" = งานพิมพ์กระดาษ, "ชิ้น/เซ็ต" อาจเป็น Photocard หรือสินค้าอื่น
   - ดูคำระบุสินค้า: "Photocard/โฟโต้การ์ด" = Photocard, ไม่มีคำนี้ + มี "A3" = กระดาษ
   - ใส่ใน product_category เช่น "กระดาษพิมพ์A3", "photocard", "สติ๊กเกอร์", "พวงกุญแจอะคริลิค", "สแตนดี้" ฯลฯ
   - ⚠️ ถ้าถามราคาแต่ไม่แน่ใจว่าสินค้าอะไร → ใส่ ambiguous = true ระบบจะถามลูกค้ากลับ
   - ⚠️ ถ้าเป็นคำถามทั่วไป (ไม่ใช่ราคา) เช่น มีXXXไหม, รับทำXXXไหม, นโยบาย, วิธีส่งไฟล์ → ใส่ ambiguous = false เสมอ ตอบตรงๆ ได้
4. แยกสินค้า ตัวเลือก จำนวน:
   - **ถ้าลูกค้าสั่งสินค้าเดียวกัน (ชื่อ+วัสดุ+ออปชันเหมือนกัน) แต่แยกจำนวนหลายครั้ง → ต้องรวมจำนวนเป็นตัวเลขเดียว**
   - ถ้าวัสดุ/ออปชันต่างกัน → products = หลายรายการ แยกจำนวน
5. เพิ่มคำค้นหาทั้งไทย+อังกฤษ+คำพ้อง — เฉพาะของสิ่งที่ลูกค้าพูดถึงจริงเท่านั้น สูงสุด 6 คำ ห้ามแตกเป็นชื่อสินค้าอื่นที่ลูกค้าไม่ได้พูดถึง
6. **เลือกหัวข้อจากคลังความรู้** ที่ตรงกับ product_category + intent ลูกค้า
7. **วิเคราะห์วัสดุ** — ถ้าลูกค้าระบุวัสดุ (เช่น "อาร์ตมัน", "PVC", "PET") ต้องใส่ใน material ให้ชัดเจน ห้ามเดาวัสดุเอง

สินค้าของร้าน: โฟโต้การ์ด, สติกเกอร์, พวงกุญแจอะคริลิค, สแตนดี้อะคริลิค, ป้ายไฟ, เคส/ที่กันกระแทกโทรศัพท์, กระจก, แม็กเน็ต, ปลอกหมอน, โปสเตอร์, โปสการ์ด, การ์ดน้ำหอม, ผ้าอาร์มิต/Hermit, อาร์มปัก, สายคล้องคอ, เข็มกลัด, ถุงผ้า, เสื้อ, แฟ้มใส, สมุดโน้ต, ที่รองแก้ว, ที่คั่นหนังสือ, โฟโต้บุ๊ค, ปฏิทิน, กรอบรูป, ธง, แบนเนอร์

วัสดุ: ผ้าอาร์มิต/Hermit, ผ้าซาติน/Satin, ผ้าแคนวาส/Canvas, อาร์ตการ์ด/อาร์ตมัน, PVC, PET, อะคริลิค, โฮโลแกรม, เคลือบด้าน/Matte, เคลือบเงา/Glossy, เคลือบกลิตเตอร์/Glitter, ไดคัท, UV${kbTitlesList}

ตอบเป็น JSON:
{
  "product": "สินค้าหลัก (แก้คำผิดแล้ว)",
  "product_category": "ประเภทสินค้าที่แน่ชัด",
  "ambiguous": false,
  "ambiguous_options": [],
  "products": ["สินค้าที่ 1", "สินค้าที่ 2"],
  "corrected_query": "คำถามที่แก้คำผิดแล้ว",
  "material": "วัสดุ (ถ้ามี)",
  "options": ["ตัวเลือกเพิ่มเติม เช่น พิมพ์ 2 ด้าน, เคลือบ"],
  "search_terms": ["คำค้นหา ไทย+อังกฤษ+คำพ้อง"],
  "quantity": "จำนวนรวมทั้งหมด (ถ้ามี)",
  "question_type": "ถามราคา/ถามวิธีการ-ขั้นตอน/ถามข้อมูล-อธิบาย/ถามประเภท/ถามเปรียบเทียบ/ถามแนะนำ/ถามทั่วไป-FAQ/อื่นๆ",
  "relevant_kb": [0, 3, 7]
}

**ambiguous**: true ถ้าไม่แน่ใจว่าลูกค้าหมายถึงสินค้าอะไร (เช่น "อาร์ตมัน" อาจเป็น Photocard หรือ กระดาษ)
**ambiguous_options**: ถ้า ambiguous=true ให้ใส่ตัวเลือกที่เป็นไปได้ เช่น ["Photocard กระดาษอาร์ตมัน", "กระดาษพิมพ์ A3 อาร์ตมัน"]
**quantity**: ถ้าลูกค้าบอกหลายจำนวนของสินค้าเดียวกัน ให้รวมเป็นตัวเลขเดียว เช่น "120 ชิ้น + 30 ชิ้น" → "150"
**relevant_kb สำคัญมาก**: เลือกเฉพาะหัวข้อที่ตรงกับ intent ลูกค้า (สูงสุด 8 หัวข้อ) ถ้าไม่มีหัวข้อเกี่ยวข้องเลยใส่ []
ตอบเฉพาะ JSON เท่านั้น`;
}

/**
 * วิเคราะห์คำถามลูกค้าด้วย Gemini — คืน null เมื่อไม่มีคีย์/ล้มเหลว (ระบบทำงานต่อแบบไม่มี hint)
 */
export async function parseCustomerMessage(
  msg: string,
  kbTitles: { index: number; title: string }[],
): Promise<ParsedMessage | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  // ข้อความสั้นมาก/คำทักทาย ไม่ต้องเสียเวลาวิเคราะห์ — ให้ n8n ตอบเลย
  const trimmed = msg.trim();
  if (trimmed.length < 6) return null;
  if (/^(สวัสดี|หวัดดี|ดีจ้า|ดีครับ|ดีค่ะ|hello|hi|ทดสอบ|เทส)[\sครับค่ะคะจ้า!.~]*$/i.test(trimmed)) return null;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${buildPrompt(msg, kbTitles)}` }] }],
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

คำถามลูกค้า: "${message}"`;

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
  const q = (parsed?.question_type ?? "").toLowerCase();
  return q.includes("ราคา") || q.includes("เท่าไหร่") || q.includes("cost") || q.includes("price");
}

export function isHowToQuestion(parsed: ParsedMessage | null): boolean {
  const q = (parsed?.question_type ?? "").toLowerCase();
  return q.includes("วิธี") || q.includes("ขั้นตอน") || q.includes("how") || q.includes("ข้อมูล") || q.includes("อธิบาย");
}

/**
 * คำถามราคาที่ AI ไม่แน่ใจว่าสินค้าอะไร → ข้อความถามลูกค้ากลับ (ไม่ต้องส่งไป n8n)
 * เหมือน chat.html: ถามกลับเฉพาะคำถามราคา — คำถามทั่วไปตอบตรง ๆ ได้
 */
export function askBackMessage(parsed: ParsedMessage | null): string | null {
  if (!parsed?.ambiguous || !parsed.ambiguous_options?.length || !isPricingQuestion(parsed)) return null;
  const optionsList = parsed.ambiguous_options.map((opt, i) => `${i + 1}. ${opt}`).join("\n");
  return `ขออนุญาตสอบถามเพิ่มเติมนะครับ เพื่อจะได้แจ้งราคาที่ถูกต้อง\n\nลูกค้าต้องการสินค้าประเภทไหนครับ?\n${optionsList}\n\nรบกวนแจ้งด้วยนะครับ 🙏`;
}

/** สรุปผลวิเคราะห์เป็นข้อความ hint ใน systemMessage — ล้อ buildParsedHint ของ chat.html */
export function buildParsedHint(parsed: ParsedMessage | null): string {
  if (!parsed) return "";

  let hint = "\n[วิเคราะห์คำถามลูกค้า]\n";
  if (parsed.corrected_query) hint += `คำถามที่แก้ไขแล้ว: ${parsed.corrected_query}\n`;
  if (parsed.products?.length) hint += `สินค้าทั้งหมด: ${parsed.products.join(", ")}\n`;
  else if (parsed.product) hint += `สินค้า/หัวข้อ: ${parsed.product}\n`;
  if (parsed.material) hint += `วัสดุ: ${parsed.material}\n`;
  if (parsed.options?.length) hint += `ตัวเลือกเพิ่มเติม: ${parsed.options.join(", ")}\n`;
  if (parsed.search_terms?.length) hint += `คำค้นหาที่ต้องใช้: ${parsed.search_terms.join(", ")}\n`;
  if (parsed.quantity) hint += `จำนวน: ${parsed.quantity}\n`;
  if (parsed.question_type) hint += `ประเภทคำถาม: ${parsed.question_type}\n`;

  if (isHowToQuestion(parsed)) {
    hint +=
      '→ ⚠️ ลูกค้าถามเกี่ยวกับ "วิธีการ/ขั้นตอน/ข้อมูล" — ต้องตอบอธิบายวิธีการ/ขั้นตอนให้ละเอียดก่อน แล้วค่อยเสริมราคาเป็นข้อมูลเพิ่มเติมทีหลัง ห้ามเน้นราคาเป็นคำตอบหลัก\n';
  } else if (isPricingQuestion(parsed)) {
    hint += "→ ต้องค้นหาราคาและข้อมูลให้ครบทุกรายการข้างต้น ห้ามข้ามรายการใด ห้ามเดาราคา\n";
    hint +=
      '→ ⚠️ สำคัญมาก: ต้องจับคู่ "วัสดุ" ให้ตรงกับที่ลูกค้าระบุ เช่น ถ้าลูกค้าบอก "อาร์ตมัน/กระดาษอาร์ต" ห้ามใช้ราคา PVC, ถ้าลูกค้าบอก "PVC" ห้ามใช้ราคากระดาษ\n';
    hint +=
      "→ ⚠️ ถ้าลูกค้าสั่งสินค้าเดียวกันหลายจำนวน ต้องรวมจำนวนก่อนแล้วใช้เรทตามจำนวนรวม\n";
    hint +=
      '→ ⚠️ สินค้าบางชนิดขายเป็น "เซ็ต" — ต้องแปลงจำนวนชิ้นเป็นจำนวนเซ็ตก่อนค้นหาเรทราคา และต้องดูข้อมูลในระบบว่า 1 เซ็ตมีกี่ชิ้น\n';
    hint +=
      "→ ⚠️ ถ้ามีออปชันเพิ่ม (เช่น สกรีน 2 ด้าน, เคลือบ, ตัดรูปทรง) ต้องค้นหาราคาออปชันแยกแล้วบวกเพิ่ม ห้ามรวมในราคาฐาน\n";
  } else {
    hint += "→ ตอบให้ตรงประเด็นกับสิ่งที่ลูกค้าถาม ถ้าถามข้อมูลให้อธิบายข้อมูล ถ้าถามราคาให้ค้นหาราคา\n";
  }
  return hint;
}
