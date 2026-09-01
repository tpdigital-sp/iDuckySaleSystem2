import { NextResponse } from "next/server";
import { buildChatContext, getKbTitleCandidates } from "@/lib/server/chat-context";
import {
  answerFromContext,
  askBackMessage,
  isGreeting,
  isPricingQuestion,
  needsHuman,
  parseCustomerMessage,
  writePriceReply,
} from "@/lib/server/chat-parse";
import { SITE_URL } from "@/lib/shop-info";
import { isMinQtyIntent, isSpecIntent, parseQty, searchMinQty, searchPrice, searchSpec } from "@/lib/server/price-answer";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * แชทลูกค้าหน้าเว็บ → ต่อเข้า "สมองเดียวกัน" กับหน้าแชทของ AdminBuddy (chat.html)
 *
 * ทำไมต้องผ่าน API route ไม่ยิงตรงจากเบราว์เซอร์:
 *  - หน้า chat.html เป็นไฟล์สแตติกในเครื่อง (localhost:8765) ลูกค้าเรียกไม่ได้
 *    ตัวที่ตอบจริงคือ n8n webhook ที่ chat.html เรียกอยู่ → เว็บร้านคุยกับ webhook ตัวเดียวกัน
 *  - ซ่อน URL/คีย์ไม่ให้โผล่ฝั่งลูกค้า + กันสแปมได้ + ไม่ติด CORS
 *
 * ตั้งค่าได้ด้วย env CHAT_WEBHOOK_URL (ถ้าไม่ตั้ง ใช้ตัวเดียวกับ chat.html)
 */
const WEBHOOK = process.env.CHAT_WEBHOOK_URL || "https://n8n.iduckybot.com/webhook/knowledge-chat";

/**
 * บุคลิกผู้ช่วยของ "หน้าเว็บ" — workflow ของ n8n เปิดช่อง body.personaPrompt ไว้ให้ทับได้
 * ไม่ส่ง = ใช้ persona ดีฟอลต์ของ LINE OA ซึ่งลงท้าย "ค่ะ" แล้วชนกับคำทักทายบนเว็บที่เป็น "ครับ"
 * (ดู GREETING ใน lib/shop-chat) ลูกค้าคนเดียวจึงเคยเห็นผู้ช่วยเปลี่ยนคำลงท้ายกลางบทสนทนา
 */
const PERSONA =
  "คุณคือ 'ผู้ช่วย iDucky' แอดมินผู้ชายของร้าน iDucky Prints Studio (รับพิมพ์/ผลิตสินค้าตามสั่ง) " +
  "กำลังตอบลูกค้าทางแชทหน้าเว็บร้าน ตอบสุภาพ เป็นกันเอง กระชับ ลงท้ายด้วย 'ครับ' เสมอ " +
  "ห้ามลงท้ายด้วย 'ค่ะ/นะคะ' ตอบจากข้อมูลจริงของร้านเท่านั้น ห้ามเดาราคาที่ไม่มีในข้อมูล";

/**
 * ข้อความ "เกริ่นนำ" ที่ยังไม่ได้ถามอะไรจริง — สวัสดี / สอบถามหน่อย / รบกวนถามหน่อย
 *
 * ⚠️ ต้องกันไว้ตั้งแต่ต้นทาง: พอเราส่งประวัติบทสนทนาให้ชั้นวิเคราะห์ มันจะเติมบริบทจากที่คุยค้างไว้
 * ให้ทุกข้อความ ลูกค้าพิมพ์แค่ "สอบถามหน่อย" หลังเคยถามราคาพวงกุญแจ จึงถูกตีความเป็น
 * "ถามราคาพวงกุญแจ" แล้วเทตารางราคากลับไปทั้งชุด (ลูกค้าเจอจริง) — ทั้งที่เขายังไม่ได้ถามอะไรเลย
 * ข้อความแบบนี้ต้องปล่อยให้ตอบแบบคุยกันปกติ ไม่เข้าเส้นทางราคา/สเปก/ขั้นต่ำ
 */
function isOpener(text: string): boolean {
  const t = text.trim();

  /**
   * ⚠️ ต้องดัก "ข้อความที่ไม่มีเนื้อหาของตัวเอง" ให้หมด ไม่ใช่แค่คำเกริ่นที่รู้จัก
   * ลูกค้าพิมพ์แค่ "." หลังเคยถามราคาพวงกุญแจ แล้วระบบเติมบริบทให้กลายเป็น "ถามราคาพวงกุญแจ"
   * เทเมนูสินค้ากลับไปทั้งชุด (เจอจริง) — เดิมดักด้วยรายการคำ ซึ่งครอบคลุมไม่พอโดยธรรมชาติ
   * เกณฑ์ที่ใช้แทน: นับเฉพาะ "ตัวอักษรจริง" (ไทย/อังกฤษ) ถ้าน้อยกว่า 2 ตัว = ยังไม่ได้ถามอะไร
   */
  const letters = t.replace(/[^\u0E00-\u0E7Fa-zA-Z]/g, "");
  if (letters.length < 2) return true;

  // คำรับ/คำขอบคุณ/หัวเราะ เดี่ยว ๆ ก็ไม่ใช่คำถาม
  if (/^(ครับ|ค่ะ|คะ|จ้า|โอเค|โอเคครับ|โอเคค่ะ|ok|okay|ได้|ขอบคุณ|ขอบคุณครับ|ขอบคุณค่ะ|thx|thanks|5+)[\s!.~]*$/i.test(t))
    return true;

  if (t.length > 24 || /\d/.test(t)) return false;
  if (/ราคา|เท่าไห|กี่|บาท|เรท|ขั้นต่ำ|ขนาด|สี|วัสดุ|เนื้อ|ทรง|ลด/.test(t)) return false;
  // คำทักทายเดี่ยว ๆ ก็นับ (เดิมบังคับว่าต้องมีคำว่า "สอบถาม" ตามหลัง "สวัสดีครับ" เลยหลุดไป n8n)
  if (/^(สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|hello|hi|hey)/i.test(t)) return true;
  return /^(ขอ)?\s*(สอบถาม|ถามหน่อย|ขอถาม|อยากถาม|อยากสอบถาม|รบกวน|ทัก)/i.test(t);
}

/** ประวัติบทสนทนาที่ส่งมาจากหน้าจอ → ข้อความบรรทัดเดียวแบบที่ workflow ของ n8n อ่าน */
function historyText(turns: { role?: string; text?: string }[] | undefined): string {
  const lines = (turns ?? [])
    .filter((t) => typeof t?.text === "string" && t.text.trim())
    .slice(-8)
    .map((t) => `${t.role === "shop" ? "ผู้ช่วย" : "ลูกค้า"}: ${String(t.text).trim().slice(0, 500)}`);
  return lines.join("\n");
}

/** เผื่อ n8n คิดนาน — ยาวกว่านี้ฟังก์ชันบน Netlify จะโดนตัดก่อน */
const TIMEOUT_MS = 25_000;

/** กันสแปมแบบง่าย ๆ ในหน่วยความจำ (ต่อ instance) — 20 ข้อความ/5 นาที ต่อ IP */
const RATE_MAX = 20;
const RATE_WINDOW_MS = 5 * 60_000;
const hits = new Map<string, number[]>();

function tooMany(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k);
  return list.length > RATE_MAX;
}

/** n8n ตอบมาได้หลายทรง — ดึงข้อความออกมาให้ได้ทุกแบบ (ล้อตาม chat.html) */
function pickReply(data: unknown): string {
  if (typeof data === "string") return data.trim();
  if (Array.isArray(data)) {
    for (const item of data) {
      const t = pickReply(item);
      if (t) return t;
    }
    return "";
  }
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const k of ["output", "text", "response", "message", "answer", "reply"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    if (o.data) return pickReply(o.data);
  }
  return "";
}

export async function POST(req: Request) {
  const t0 = Date.now();
  let body: {
    message?: string;
    sessionId?: string;
    debug?: boolean;
    history?: { role?: string; text?: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const message = (body.message ?? "").trim().slice(0, 1000);
  const sessionId = (body.sessionId ?? "").trim().slice(0, 80) || `web-${Date.now()}`;
  if (!message) return NextResponse.json({ error: "ยังไม่ได้พิมพ์ข้อความ" }, { status: 400 });

  // ประวัติบทสนทนาจากหน้าจอ — n8n จำเองได้ 5 ตาจาก sessionId แต่ชั้นวิเคราะห์/ตอบสำรองของเว็บ
  // ไม่เคยเห็นเลย คำถามต่อเนื่องอย่าง "แล้ว 300 ชิ้นล่ะ" จึงกลายเป็นคำถามลอย ๆ ทุกครั้ง
  const convo = historyText(body.history);

  const ip = (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();
  if (tooMany(ip))
    return NextResponse.json(
      { error: "ส่งข้อความถี่เกินไปครับ พักสักครู่แล้วลองใหม่ หรือทักไลน์ร้านได้เลย" },
      { status: 429 },
    );

  // ขั้นวิเคราะห์คำถามด้วย Gemini ก่อน (Smart Preprocessing แบบ chat.html)
  // — แยกสินค้า/วัสดุ/จำนวน/ประเภทคำถาม + เลือกหัวข้อ KB · ล้มเหลว = null แล้วใช้จับคู่คำแทน
  const kbTitles = await getKbTitleCandidates(message).catch(() => []);
  const parsed = await parseCustomerMessage(message, kbTitles, convo);
  /** ยังไม่ได้ถามอะไรจริง — ห้ามเดาว่าถามเรื่องเดิมต่อ (ดู isOpener) */
  const opener = isOpener(message) || isGreeting(parsed);

  /**
   * ข้อความที่ยังไม่ได้ถามอะไร → ตอบเองสั้น ๆ ทันที ไม่ส่งไป n8n
   *
   * ส่งไปแล้วเสียเปล่า 2 ทาง: (1) รอ 16-24 วิ เพื่อได้คำทักทายกลับมา
   * (2) agent มีความจำ 5 เทิร์นของตัวเอง มันจะเดาต่อจากที่คุยค้างไว้เอง — ลูกค้าพิมพ์ "." แล้วได้
   * ราคาพวงกุญแจดุ๊กดิ๊ก พิมพ์ "555" ได้คำอธิบายกระเป๋า Candy Bag (เจอจริงตอนทดสอบ)
   */
  if (opener) {
    const t = message.trim();
    const reply = /^(ครับ|ค่ะ|คะ|จ้า|โอเค|ได้|ขอบคุณ|thx|thanks|ok|okay)/i.test(t)
      ? "ยินดีครับ 😊 มีอะไรให้ช่วยอีกบอกได้เลยครับ"
      : /^(สวัสดี|หวัดดี|hello|hi|hey)/i.test(t)
        ? "สวัสดีครับ 👋 สนใจสินค้าตัวไหน หรืออยากถามเรื่องอะไร พิมพ์มาได้เลยครับ"
        : "ได้เลยครับ 😊 บอกชื่อสินค้ากับจำนวนที่สนใจมาได้เลย เดี๋ยวเช็คราคาให้ หรือจะถามเรื่องวัสดุ/ขนาด/ระยะเวลาก็ได้ครับ";
    return NextResponse.json({ reply, ...(body.debug ? { debug: { parsed, via: "opener" } } : {}) }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  // 🚨 ลูกค้าขอคุยคน / ไม่พอใจ / เคลมงาน / ตามออเดอร์ → ส่งต่อแอดมินทันที ไม่ต้องให้บอทดันต่อ
  // (เกณฑ์มาจากชั้นวิเคราะห์: escalate + เหตุผล) เรื่องพวกนี้บอทตอบเองแล้วยิ่งทำให้ลูกค้าหงุดหงิด
  const hardHandoff = /ขอคุยแอดมิน|เคลม|ติดตามออเดอร์/.test(parsed?.intent ?? "");
  if (needsHuman(parsed) && hardHandoff) {
    return NextResponse.json(
      {
        reply:
          "เรื่องนี้ขอให้แอดมินตัวจริงดูแลต่อนะครับ จะได้เช็คให้ตรงเคสที่สุด\n" +
          `ทักไลน์ร้านได้เลยครับ 👉 ${SITE_URL}/line\n` +
          "รบกวนแจ้งเลขออเดอร์หรือรูปงานมาด้วยจะเร็วขึ้นมากครับ",
        ...(body.debug ? { debug: { parsed, via: "handoff" } } : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // ถามราคาแต่ AI ไม่แน่ใจว่าสินค้าอะไร → ถามลูกค้ากลับเลย ไม่เดาราคามั่ว (เหมือน chat.html)
  const askBack = askBackMessage(parsed);
  if (askBack) return NextResponse.json({ reply: askBack }, { headers: { "Cache-Control": "no-store" } });

  // แนบบริบทชุดเดียวกับที่หน้าแชท AdminBuddy (chat.html) ส่ง
  // — ผลวิเคราะห์ + ลิงก์สินค้าบนเว็บ + แค็ตตาล็อก/ลิงก์ราคา/คลังความรู้
  // ล้มก็ยังถามต่อได้ แค่ได้คำตอบกว้างกว่าเดิม จึงไม่ให้ throw ออกมา
  // เกริ่นนำเฉย ๆ → ไม่ต้องแนบสินค้า/hint ค้นราคา ไม่งั้น agent จะพูดถึงสินค้าที่คุยค้างไว้
  // ทั้งที่ลูกค้ายังไม่ได้ถาม
  const ctx = await buildChatContext(message, opener ? null : parsed).catch(() => null);

  // 💰 คำถามราคา → เอาตัวเลขจาก "เครื่องคิดเงินตัวเดียวกับตะกร้า" ยัดเป็นข้อมูลที่เชื่อถือได้ที่สุด
  // (ดู lib/server/price-answer.ts) ไม่งั้น agent จะไปหยิบราคาจากสมองราคาอีกชุดของ n8n ซึ่งเป็น
  // คนละตารางกับที่เว็บคิดเงินจริง — ลูกค้าเคยได้ราคาที่กดสั่งบนเว็บแล้วไม่ตรง
  let priceFacts = "";
  /** ตารางราคาดิบที่เว็บคิดเอง — ใช้ตอบลูกค้าตรง ๆ โดยไม่ต้องพึ่ง agent */
  let priceText = "";
  if (!opener && (isPricingQuestion(parsed) || !parsed)) {
    const found = await searchPrice(`${message} ${parsed?.search_query ?? ""}`.trim(), {
      // ⚠️ จำนวนต้องเอาจาก slots หรือข้อความ "ต้นฉบับ" — search_query ที่ชั้นวิเคราะห์เรียบเรียงใหม่
      // มักตัดจำนวนทิ้ง พอไม่มีจำนวนระบบจะกางขั้นบันไดทั้งตารางแทนที่จะตอบยอดรวมของจำนวนที่สั่ง
      qty: Number(String(parsed?.slots?.quantity ?? "").replace(/[^\d]/g, "")) || parseQty(message),
      // สมองเดิมของ n8n จะถูกถามอีกทีโดย agent อยู่แล้ว ตรงนี้เอาเฉพาะที่เว็บตอบเองได้
      allowFallback: false,
    }).catch(() => null);
    if (found?.answer) {
      priceText = found.answer;
      priceFacts =
        "\n[ราคาจริงจากระบบเว็บร้าน - ตัวเลขชุดนี้คือราคาที่ลูกค้าจะจ่ายจริงตอนกดสั่งบนเว็บ " +
        "ให้ยึดชุดนี้ก่อนผลจาก search_pricing เสมอ ห้ามแก้ตัวเลข ห้ามย่อรายการทิ้ง]\n" +
        `${found.answer}\n`;
    }
  }

  // 📦 ถามขั้นต่ำ → ตอบจาก minQty จริงในเรทราคาของเว็บ
  // เดิมปล่อยให้ n8n ตอบ แล้วมันตอบว่า "ส่วนใหญ่ไม่มีขั้นต่ำ สั่ง 1 ชิ้นได้" ซึ่งตรงข้ามกับของจริง
  // (143 จาก 213 รายการมีขั้นต่ำ ส่วนใหญ่ 11 ชิ้น) — ลูกค้าเชื่อแล้วมาสั่งจะเจอปัญหาหน้างาน
  let minText = "";
  if (!priceText && !opener && isMinQtyIntent(message)) {
    const found = await searchMinQty(`${message} ${parsed?.search_query ?? ""}`.trim()).catch(() => null);
    if (found?.answer) minText = found.answer;
  }

  // 📐 ถามสเปก (ขนาด/สี/วัสดุ/ทรง) → ตอบจาก "ตัวเลือกจริงของสินค้า" บนเว็บ
  // ลูกค้าเจอจริง: ถาม "สแตนดี้โยกเยก มีขนาดเท่าไหร่" แล้วบอทตอบ "ไม่มีขนาดระบุไว้ในข้อมูล"
  // ทั้งที่หน้าสินค้ามีให้เลือกครบ — เพราะเราส่งให้บอทแค่ตารางราคากับลิงก์ ไม่เคยส่งตัวเลือกเลย
  let specText = "";
  if (!priceText && !minText && !opener && isSpecIntent(message)) {
    const found = await searchSpec(`${message} ${parsed?.search_query ?? ""}`.trim()).catch(() => null);
    if (found?.answer) specText = found.answer;
  }

  // 🔗 แนบลิงก์หน้าสินค้าบนเว็บต่อท้ายคำตอบ — agent ของ n8n ไม่ยอมใส่ลิงก์เองแม้ป้อนให้ใน context
  // (system prompt ของ workflow คุมรูปแบบคำตอบไว้) เว็บเลยแนบเองจากผลค้นหาสินค้าในระบบ
  // ใส่เฉพาะเมื่อค้นเจอสินค้าที่ตรงจริง และคำตอบยังไม่มีลิงก์เว็บร้านอยู่แล้ว
  /** escalate แบบไม่ด่วน (งานจำนวนมาก/นอกแคตตาล็อก/ถามซ้ำ) — ตอบให้ก่อน แล้วชวนคุยแอดมินต่อท้าย */
  const adminNote =
    needsHuman(parsed) && !hardHandoff
      ? `\n\nเคสนี้แอดมินช่วยดูให้ละเอียดกว่าได้ครับ ทักไลน์ร้านได้เลย 👉 ${SITE_URL}/line`
      : "";

  const withProductLinks = (reply: string): string => {
    const linksToAttach = (ctx?.productLinks ?? []).slice(0, 2);
    if (!linksToAttach.length || /https?:\/\//.test(reply)) return reply;
    const lines = linksToAttach.map((l) => `• ${l.name}${l.price ? ` (${l.price})` : ""}\n${l.url}`);
    return `${reply}\n\n🛒 กดดูรายละเอียด/สั่งซื้อบนเว็บได้เลย:\n${lines.join("\n")}`;
  };

  // ⚡ เส้นทางเร็วสำหรับคำถามราคา — ตอบเองเลย ไม่ผ่าน agent ของ n8n
  //
  // ทดสอบแล้ว: agent เมินราคาที่เว็บส่งเข้าไปทั้งใน message และ systemMessage แล้วไปหยิบตัวเลข
  // จาก tool ตัวเองซึ่งเป็นคนละตารางกับที่ตะกร้าคิดเงินจริง (system prompt 14k ของมันทับหมด)
  // เส้นนี้จึงตอบจากเครื่องคิดเงินของเว็บโดยตรง แล้วให้ Gemini เรียบเรียงถ้อยคำอย่างเดียว
  // ได้ครบสามอย่าง: ตัวเลขตรงกับที่ลูกค้าจ่ายจริง · ใช้เวลาไม่ถึง 2 วิ · โทนตรงกับหน้าเว็บ
  // คำถามที่ไม่ใช่ราคา (วิธีสั่ง/นโยบาย/ค่าส่ง) ยังเดินเส้นเดิมผ่าน n8n เหมือนเคย
  const direct = priceText || minText || specText;
  if (direct) {
    const written = await writePriceReply(message, direct, convo).catch(() => null);
    return NextResponse.json(
      {
        reply: withProductLinks(written || direct) + adminNote,
        ...(body.debug ? { debug: { parsed, stats: ctx?.stats, links: ctx?.productLinks, priceFacts, via: priceText ? "web-price-engine" : minText ? "web-minqty" : "web-spec", ms: Date.now() - t0 } } : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  let reply = "";
  try {
    const res = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // ฝัง "คำแนะนำระบบ" ต่อท้ายข้อความ (สั่งให้ค้นราคา/จับวัสดุ/แปลงเซ็ต) แบบเดียวกับ chat.html
        // priceFacts ต้องอยู่ใน message ไม่ใช่แค่ systemMessage — agent ของ n8n ให้น้ำหนัก message
        // มากกว่ามาก (ยัดไว้ใน systemMessage อย่างเดียว มันเมินแล้วไปหยิบราคาจาก tool ตัวเองแทน)
        message: message + priceFacts + (ctx?.messageHint ?? ""),
        sessionId,
        userId: `web-${sessionId}`,
        source: "website",
        personaPrompt: PERSONA,
        // ⚠️ workflow ไม่ได้อ่าน knowledgeContext ที่ไหนเลย (ตรวจจาก system message ของ AI Agent1 แล้ว)
        // คลังความรู้ที่คัดมาจึงต้องต่อท้าย systemMessage ไม่งั้นส่งไปแล้วถูกทิ้งทั้งก้อน
        systemMessage:
          `${priceFacts}${ctx?.systemMessage ?? ""}${ctx?.knowledgeContext ? `\n${ctx.knowledgeContext}` : ""}` ||
          undefined,
        conversationHistory: convo || undefined,
        knowledgeContext: ctx?.knowledgeContext,
      }),
      // งบเวลารวมของฟังก์ชันมี 30 วิ (Netlify) — หักที่ใช้ไปแล้ว และกันท้ายไว้ ~7 วิ ให้ fallback ตอบเอง
      // (agent ฝั่ง n8n ใช้เวลา 6-20+ วิ แล้วแต่คำถาม — เกินโควตาเมื่อไหร่ตัดไปใช้ fallback ดีกว่าปล่อย error)
      signal: AbortSignal.timeout(Math.max(8_000, Math.min(TIMEOUT_MS, 22_000 - (Date.now() - t0)))),
    });

    if (res.ok) {
      const raw = await res.text();
      let data: unknown = raw;
      try {
        data = JSON.parse(raw);
      } catch {
        /* บาง workflow ตอบเป็นข้อความเปล่า ๆ */
      }
      const picked = pickReply(data);
      if (picked && !/error in workflow|internal error/i.test(picked)) reply = picked;
    }
  } catch {
    /* n8n ช้าเกิน/ล่ม → ไปใช้ fallback ข้างล่าง */
  }

  // 🛟 n8n ไม่ตอบ/ตอบไม่ได้ → ตอบเองด้วย Gemini จาก context ที่ประกอบไว้ (แบบเดียวกับ fallback ของ chat.html)
  // ลูกค้าได้คำตอบจากข้อมูลร้านจริงเสมอ ดีกว่าข้อความ "ผู้ช่วยตอบช้า" เปล่า ๆ
  if (!reply) {
    const direct = await answerFromContext(message, `${priceFacts}${ctx?.systemMessage ?? ""}`, ctx?.knowledgeContext, convo);
    if (direct) reply = direct;
  }

  if (!reply) {
    return NextResponse.json({ error: "ตอนนี้ผู้ช่วยตอบไม่ได้ครับ ทักไลน์ร้านได้เลย เดี๋ยวแอดมินช่วยดูให้" }, { status: 502 });
  }

  return NextResponse.json(
    {
      reply: withProductLinks(reply) + adminNote,
      // โหมดดีบัก (ส่ง debug:true มากับคำถาม) — ดูผลวิเคราะห์/ลิงก์ที่ระบบจับได้ ไว้ไล่ปัญหาคำตอบเพี้ยน ไม่มีข้อมูลลับ
      ...(body.debug ? { debug: { parsed, stats: ctx?.stats, links: ctx?.productLinks, priceFacts } } : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
