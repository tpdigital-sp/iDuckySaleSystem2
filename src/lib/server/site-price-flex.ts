import "server-only";
import { productBubble, productFlex } from "@/lib/server/product-card";
import type { ProductRef } from "@/lib/server/price-answer";
import type { LineMsg } from "@/lib/server/bot-drafts";

/**
 * 🌐 คำตอบจากเครื่องคิดราคา (/api/pricing/search) → ชุดข้อความ LINE แบบเดียวกับที่บอท n8n ส่ง (20 ต.ค. 69)
 *
 * พอร์ตมาจากโหนด "Site Price Flex (iduckystore)" + ท่อนท้าย "Format Reply" ใน LINE OA Bot (7v7dy4PvnVnGzlYg)
 * ใช้ตอนหน้าแชทกด ↻ / 🤖 แล้วเว็บร่างเอง (bot-drafts · requestRedraft) ไม่ต้องวิ่งไป n8n — ร่างต้องหน้าตาเหมือนร่างจาก n8n
 *   · ถามราคา → การ์ดราคา (hero = รูปสินค้าบนเว็บ · แถวราคา · ปุ่มหน้าสินค้า) + ประโยคถามต่อ (askNext จากเว็บ)
 *   · ไม่มีของ/สเปก/คละลาย/ขั้นต่ำ/ข้อมูล → ข้อความจากเว็บ + การ์ดสินค้า
 *   · ถามคิวผลิต/วันส่งปนมา → ต่อท้ายว่าแอดมินจะเช็กคิวจริง (เหมือน Format Reply)
 * ⚠️ แก้สีหรือทรงการ์ดที่นี่ ต้องแก้ในโหนด n8n ด้วย (ไม่งั้นร่างจาก 2 ทางหน้าตาต่างกัน)
 */
const SITE = "https://iduckystore.com";
const BRAND_DARK = "#1F5F5A";
const BRAND = "#2D7C76";
const BRAND_LIGHT = "#F0FBFA";
const BRAND_BORDER = "#C7E8E4";
const HL_BG = "#FFF8E1";
const HL_FG = "#B86E00";
const PLACEHOLDER_IMG = SITE + "/og-default.jpg";

/** ถามราคา = แทนข้อความด้วยการ์ดราคา (regex เดียวกับ n8n) */
const ASK_PRICE = /ราคา|เท่าไหร่|เท่าไร|กี่บาท|ก็บาท|กีบาท|กี้บาท|คิดเงิน|กี่ตังค์|เรท|quote|price|cost|ขั้นต่ำ|ขั้นตำ่|\d[\d,]*\s*(?:ชิ้น|ใบ|อัน|แผ่น|ตัว|ผืน|เซ็ต|เซต|ชุด|เล่ม|คู่|ดวง|ม้วน|กล่อง|pcs)/i;
/** คำถามความรู้ทั่วไปที่เว็บตอบได้แค่กว้าง ๆ (intent info) → ให้ agent+คลังความรู้ตอบ (Build AI Request · KNOWLEDGE_RE) */
export const KNOWLEDGE_RE = /กี่วัน|ส่งของ|จัดส่ง|ค่าส่ง|ชำระ|โอนเงิน|มัดจำ|ผลิตนาน|ใช้เวลา|ไฟล์|วิธีสั่ง|นโยบาย|รับประกัน|เปลี่ยน|คืนเงิน/;
/** ถามคิวผลิต/วันส่ง (Format Reply · _deadline) */
const DEADLINE_RE =
  /ทัน.{0,25}(ไหม|มั้ย|มั๊ย|หรือเปล่า|รึเปล่า|ป่าว)|ทันไหม|ทันมั้ย|ทันมั๊ย|ส่งทัน|ผลิตทัน|ทันส่ง|ทันรอบ|ทันงาน|ทันวัน|กำหนดส่ง|เดดไลน์|deadline|ผลิตกี่วัน|ใช้เวลากี่วัน|ใช้เวลาผลิต|กี่วันเสร็จ|เสร็จเมื่อไหร่|เสร็จทัน|ได้ของวันไหน|ได้รับของวันไหน/;
const QUEUE_NOTE = "ส่วนเรื่องคิวผลิต/วันส่ง เดี๋ยวแอดมินเช็กคิวจริงแล้วรีบแจ้งในแชทนี้ให้น้า 🥰";
/** คำที่แปลว่าบอทตอบไม่ได้เต็มที่ → ติดป้ายรอแอดมิน (Format Reply · escalationPatterns) */
const ESCALATION = ["ขอตรวจสอบ", "ขอเช็ก", "ขอตรวจ", "ตรวจสอบให้", "เช็กให้ก่อน", "ติดต่อกลับ", "รบกวนรอ", "รอสักครู่", "จะมีแอดมิน", "ฝ่ายผลิต", "รีบเช็ก", "ไม่ทราบ", "ไม่มีระบุ", "ไม่มีรายละเอียด", "แอดมินเข้ามาตอบ"];

const UI = {
  th: {
    note: "ราคาจากเว็บ iduckystore.com — กดปุ่มด้านล่างเลือกตัวเลือกครบทุกแบบ + สั่งได้ทันที",
    btnFull: "ดูราคาครบทุกแบบ / สั่งเลย",
    view: "ดูสินค้า",
    closeMenu: "สนใจแบบไหนดีคะคุณลูกค้า บอกชื่อกับจำนวนมาได้เลยน้า เดี๋ยวแอดมินคิดราคาให้ 🥰",
    closeQty: 'สะดวกสั่งตามนี้ไหมคะคุณลูกค้า 🥰 แจ้งแอดมินได้เลย เดี๋ยวสรุปยอดให้ หรือกด "สั่งเลย" ในการ์ดก็ได้น้า 💕',
    closeDefault: "สนใจกี่ชิ้นดีคะคุณลูกค้า บอกมาได้เลยน้า เดี๋ยวแอดมินคิดราคารวมให้ 🥰",
    alt: "ราคาสินค้า",
  },
  en: {
    note: "Prices from iduckystore.com — tap the button below to see every option and order right away",
    btnFull: "See all prices / Order",
    view: "View product",
    closeMenu: "Which one are you interested in? Just tell us the item and quantity and we will calculate the price for you 🥰",
    closeQty: 'Would you like to go ahead with this? 🥰 Just let us know and we will put the total together, or tap "Order" on the card 💕',
    closeDefault: "How many would you like? Let us know and we will calculate the total for you 🥰",
    alt: "Price",
  },
};

/** ผลจาก priceSearch() เฉพาะฟิลด์ที่ใช้ประกอบข้อความ */
export interface SiteAnswer {
  found?: boolean;
  intent?: string;
  answer?: string;
  text?: string;
  askNext?: string | null;
  lang?: string;
  understood?: { intent?: string } | null;
  product?: ProductRef;
  products?: ProductRef[];
}

const esc = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
/** ตัดที่ช่องว่าง/คำลงท้าย ไม่ใส่ … (การ์ดไม่มีปุ่มอ่านต่อ · 9 ต.ค. 69) */
function trunc(s: unknown, n: number): string {
  const t = esc(s);
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("ค่ะ") + 2, cut.lastIndexOf("นะคะ") + 4);
  return (sp > n * 0.5 ? cut.slice(0, sp) : cut).trim();
}

type FlexNode = Record<string, unknown>;
function linesToRows(answer: string): FlexNode[] {
  const rows: FlexNode[] = [];
  const lines = answer.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const raw of lines) {
    if (/^https?:\/\//i.test(raw)) continue;
    if (rows.length >= 14) break;
    if (/^【.+】/.test(raw)) {
      rows.push({ type: "text", text: trunc(raw.replace(/[【】]/g, ""), 120), size: "xs", weight: "bold", color: BRAND_DARK, wrap: true, margin: "md" });
      continue;
    }
    const m = raw.match(/^[•·-]\s*(.+?)\s*[—:]\s*(.+)$/);
    if (m) {
      rows.push({
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        margin: "xs",
        contents: [
          { type: "text", text: trunc(m[1], 400), size: "xs", color: "#555555", wrap: true, flex: 7 },
          { type: "text", text: trunc(m[2], 120), size: "xs", color: HL_FG, weight: "bold", wrap: true, flex: 5, align: "end" },
        ],
      });
      continue;
    }
    if (/^[•·-]/.test(raw)) {
      rows.push({ type: "text", text: trunc(raw, 400), size: "xs", color: "#555555", wrap: true });
      continue;
    }
    rows.push({ type: "text", text: trunc(raw, 400), size: "xxs", color: "#8A8A8A", wrap: true });
  }
  return rows;
}

function priceBubble(answer: string, product: ProductRef, ui: (typeof UI)["th"]): FlexNode {
  // หัวการ์ด = บรรทัดชื่อสินค้า ไม่ใช่บรรทัดข้อมูลเสริม "• สามารถเลือกทรง…" ที่เว็บแปะหัวคำตอบ
  const allLines = answer.split("\n");
  let hi = allLines.findIndex((l) => l.trim() && !/^[•·-]/.test(l.trim()) && !/^https?:/i.test(l.trim()));
  if (hi < 0) hi = 0;
  const header = allLines[hi] || product.name;
  const rows = linesToRows(allLines.filter((_, i) => i !== hi).join("\n"));
  return {
    type: "bubble",
    size: "mega",
    hero: { type: "image", url: product.image || PLACEHOLDER_IMG, size: "full", aspectRatio: "4:3", aspectMode: "cover", action: { type: "uri", label: ui.view, uri: product.url } },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      backgroundColor: "#FFFFFF",
      contents: [
        { type: "text", text: trunc(header, 160), weight: "bold", size: "md", color: BRAND_DARK, wrap: true },
        { type: "separator", margin: "md", color: BRAND_BORDER },
        ...rows,
        { type: "box", layout: "vertical", margin: "md", paddingAll: "8px", backgroundColor: HL_BG, cornerRadius: "8px", contents: [{ type: "text", text: ui.note, size: "xxs", color: HL_FG, wrap: true }] },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "12px",
      backgroundColor: BRAND_LIGHT,
      contents: [{ type: "button", style: "primary", color: BRAND, height: "sm", action: { type: "uri", label: ui.btnFull, uri: product.url } }],
    },
  };
}

const stripUrls = (t: string) =>
  t
    .split("\n")
    .filter((l) => !/^\s*https?:\/\/\S+\s*$/.test(l))
    .join("\n")
    .replace(/\s*https?:\/\/(?:www\.)?iduckystore\.com\/\S+/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** เว็บตอบได้แบบที่บอท LINE ยอมใช้แทน agent (Build AI Request · mode "site") */
export function siteAnswerUsable(site: SiteAnswer, query: string): boolean {
  const intent = String(site.intent ?? "");
  const text = String(site.answer ?? site.text ?? "").trim();
  if (!site.found || !text) return false;
  if (intent === "info" && KNOWLEDGE_RE.test(query)) return false;
  return /^(price|spec|info|mix|min_qty|not_in_catalog|draft_product)/.test(intent);
}

/**
 * ประกอบข้อความ LINE จากคำตอบเว็บ — null = ประกอบไม่ได้ (ให้ไปทาง n8n)
 * คืน needsHumanFollowup ด้วย (คำตอบมีคำว่าขอเช็ก/ถามคิวผลิต) ให้ผู้เรียกเขียนป้ายรอแอดมินเหมือน Save Memory
 */
export function sitePriceMessages(site: SiteAnswer, userText: string): { messages: LineMsg[]; replyText: string; needsHumanFollowup: boolean } | null {
  if (!siteAnswerUsable(site, userText)) return null;
  const ui = site.lang && site.lang !== "th" ? UI.en : UI.th;
  const intent = String(site.intent ?? "");
  const answer = String(site.answer ?? site.text ?? "").trim();
  const products: ProductRef[] = site.products?.length ? site.products : site.product ? [site.product] : [];
  const deadline = DEADLINE_RE.test(userText.toLowerCase());
  const needsHumanFollowup = deadline || ESCALATION.some((p) => answer.includes(p));
  // ข้อความที่จะจดในความจำบอท (Format Reply · aiText = presetReply + บรรทัดคิวผลิต)
  const replyText = deadline ? `${answer.replace(/\s+$/, "")}\n\n${QUEUE_NOTE}` : answer;

  // 1) ถามราคา → การ์ดราคาแทนข้อความ
  const askPrice = ASK_PRICE.test(userText) || site.understood?.intent === "price";
  if (askPrice && products.length && /^price/.test(intent)) {
    const aLines = answer.split("\n");
    const hi = aLines.findIndex((l) => l.trim() && !/^[•·-]/.test(l.trim()) && !/^https?:/i.test(l.trim()));
    const extraNote = hi > 0 ? aLines.slice(0, hi).join("\n").trim() : "";
    const cardAnswer = extraNote ? aLines.slice(hi).join("\n") : answer;
    const menu = products.length > 1 && /_menu$/.test(intent);
    const contents = menu ? { type: "carousel", contents: products.slice(0, 8).map((p) => productBubble(p)) } : priceBubble(cardAnswer, products[0], ui);
    const altText = trunc(cardAnswer.split("\n")[0] || products[0].name, 380) || ui.alt;
    const askNext = String(site.askNext ?? "").trim();
    const closing = askNext || (menu || /_menu$/.test(intent) ? ui.closeMenu : intent === "price_qty" ? ui.closeQty : ui.closeDefault);
    const closeText = deadline ? `${closing}\n\n${QUEUE_NOTE}` : closing;
    const flexMsg: LineMsg = { type: "flex", altText, contents };
    // 💬 19 ต.ค. 69 "บอทตอบเกินมา 1 ข้อความ": มีข้อความนำ = รวมปิดท้ายเข้าข้อความนำ เหลือ 2 ฟอง · ไม่มี = การ์ด + ปิดท้าย
    return { messages: extraNote ? [{ type: "text", text: `${extraNote}\n\n${closeText}` }, flexMsg] : [flexMsg, { type: "text", text: closeText }], replyText, needsHumanFollowup };
  }

  // 1.5) ไม่มีของ/สเปก/คละลาย/ขั้นต่ำ/ข้อมูล → ข้อความเว็บ + การ์ดสินค้า
  // 2) ราคาที่ไม่เข้าเงื่อนไขการ์ด → ข้อความเว็บ (ตัดลิงก์ · การ์ดมีปุ่มแล้ว) + การ์ดสินค้า
  const text = stripUrls(replyText) || replyText;
  const messages: LineMsg[] = [{ type: "text", text }];
  if (products.length) messages.push(productFlex(products) as unknown as LineMsg);
  return { messages, replyText, needsHumanFollowup };
}
