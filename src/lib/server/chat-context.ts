import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { createClient } from "@supabase/supabase-js";
import { productPath } from "@/lib/products";
import { SITE_URL } from "@/lib/shop-info";
import {
  buildParsedHint,
  isHowToQuestion,
  isPricingQuestion,
  parsedProduct,
  parsedTerms,
  type ParsedMessage,
} from "./chat-parse";

/**
 * บริบทที่ส่งไปให้ n8n พร้อมคำถามลูกค้า — ให้ตอบได้เหมือนหน้าแชทของ AdminBuddy (chat.html)
 *
 * ทำไมต้องมี: chat.html ไม่ได้ส่งแค่ข้อความดิบ แต่แนบ 3 อย่างไปด้วยทุกครั้ง
 *   systemMessage    = ผลวิเคราะห์คำถาม + ลิงก์สินค้า/ราคา + แค็ตตาล็อก + เทคนิคการขาย
 *   knowledgeContext = คลังความรู้ (KB) เฉพาะข้อที่เกี่ยวกับคำถาม
 *   userId
 * เว็บร้านเดิมส่งแค่ message → n8n ได้ context น้อยกว่ามาก คำตอบเลยคนละคุณภาพ
 *
 * แหล่งข้อมูล:
 *  - Firestore โปรเจกต์ tpdigital-iducky database "ordersure" (ของ AdminBuddy)
 *    settings/product_catalog · settings/price_links · settings/sales_tips · knowledge-base
 *  - Supabase ตาราง products ของเว็บร้านเอง → ลิงก์หน้าสินค้าจริงให้บอทส่งลูกค้ากดสั่งได้เลย
 *
 * ขั้น parseCustomerMessage (วิเคราะห์คำถามด้วย Gemini ก่อน) อยู่ที่ chat-parse.ts
 * — มี GEMINI_API_KEY เมื่อไหร่ฉลาดเท่า chat.html · ไม่มีก็ fallback จับคู่คำแบบเดิม
 */

/** database ของ AdminBuddy (ไม่ใช่ tp-fixflow ที่ใช้ตรวจล็อกอิน) */
const ORDERSURE_DB = process.env.ADMINBUDDY_DATABASE_ID || "ordersure";

/** อ่านซ้ำทุกข้อความสิ้นเปลือง — ข้อมูลพวกนี้แอดมินแก้นาน ๆ ครั้ง */
const TTL_MS = 5 * 60_000;

/**
 * เพดานขนาด กัน payload บวม — chat.html ส่งแค็ตตาล็อกทั้ง 220 รายการ (~44KB) ได้เพราะไม่มีเพดานเวลา
 * แต่เว็บมีเพดานฟังก์ชัน 30 วิ: context ใหญ่ทำให้ agent ฝั่ง n8n คิดช้าลงมากจน timeout
 * (วัดจริง: คำถามค่าส่ง ส่งเปล่า 6 วิ · ส่งพร้อม catalog ทั้งก้อน 27 วิ) จึงคัดเฉพาะที่เกี่ยวข้อง
 */
const MAX_LINKS = 3;
const MAX_PRODUCT_LINKS = 4;
const MAX_CATALOG = 15;
const MAX_KB = 6;
const MAX_KB_CHARS = 700;
const MAX_CONTEXT_CHARS = 60_000;

interface CatalogItem {
  name?: string;
  details?: string;
}
interface PriceLink {
  url?: string;
  description?: string;
  keywords?: string;
}
interface SalesTip {
  title?: string;
  content?: string;
}
interface KbItem {
  title?: string;
  content?: string;
}
/** สินค้าบนเว็บร้าน (คัดเฉพาะฟิลด์เบา ๆ — ไม่เอา imageSrc/ตารางราคาที่หนักมาก) */
interface ShopProduct {
  id: string;
  slug?: string;
  name?: string;
  category?: string;
  price?: number;
  priceMin?: number;
  priceMax?: number;
  desc?: string;
}

interface Snapshot {
  catalog: CatalogItem[];
  links: PriceLink[];
  tips: SalesTip[];
  kb: KbItem[];
  products: ShopProduct[];
  at: number;
}

let cache: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null;

function db(): Firestore | null {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!b64) return null;
  try {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    const app: App = getApps()[0] ?? initializeApp({ credential: cert(json) });
    return getFirestore(app, ORDERSURE_DB);
  } catch {
    return null;
  }
}

/** สินค้าเว็บอ่านผ่าน anon key (RLS อ่านสาธารณะ) — แบบเดียวกับ products-server */
function supa() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

/** ดึงรายชื่อสินค้าจริงบนเว็บ — เอาเฉพาะที่ลูกค้าเห็นได้ (ไม่ซ่อน + ไม่ใช่แถวพิเศษ __presets__ ฯลฯ) */
async function loadShopProducts(): Promise<ShopProduct[]> {
  const sb = supa();
  if (!sb) return [];
  try {
    const { data } = await sb
      .from("products")
      .select(
        "id, category, name:data->>name, slug:data->>slug, hidden:data->>hidden, price:data->>price, priceMin:data->>priceMin, priceMax:data->>priceMax, desc:data->>description",
      );
    return (data ?? [])
      .filter((r) => r.id && r.name && !String(r.category ?? "").startsWith("__") && r.hidden !== "true")
      .map((r) => ({
        id: String(r.id),
        slug: r.slug ?? undefined,
        name: r.name ?? undefined,
        category: r.category ?? undefined,
        price: r.price ? Number(r.price) : undefined,
        priceMin: r.priceMin ? Number(r.priceMin) : undefined,
        priceMax: r.priceMax ? Number(r.priceMax) : undefined,
        desc: (r.desc ?? "").slice(0, 300) || undefined,
      }));
  } catch {
    return [];
  }
}

const EMPTY: Snapshot = { catalog: [], links: [], tips: [], kb: [], products: [], at: 0 };

async function load(): Promise<Snapshot> {
  const store = db();
  // อ่านพร้อมกัน · เจ๊งทีละก้อนได้ ไม่ล้มทั้งชุด (ไม่มี KB ก็ยังตอบด้วยแค็ตตาล็อกได้)
  const [catalog, links, tips, kb, products] = await Promise.all([
    store
      ? store
          .doc("settings/product_catalog")
          .get()
          .then((s) => (s.data()?.items as CatalogItem[]) ?? [])
          .catch(() => [])
      : Promise.resolve([]),
    store
      ? store
          .doc("settings/price_links")
          .get()
          .then((s) => (s.data()?.items as PriceLink[]) ?? [])
          .catch(() => [])
      : Promise.resolve([]),
    store
      ? store
          .doc("settings/sales_tips")
          .get()
          .then((s) => (s.data()?.items as SalesTip[]) ?? [])
          .catch(() => [])
      : Promise.resolve([]),
    store
      ? store
          .collection("knowledge-base")
          .get()
          .then((s) => s.docs.map((d) => d.data() as KbItem))
          .catch(() => [])
      : Promise.resolve([]),
    loadShopProducts(),
  ]);
  return { catalog, links, tips, kb, products, at: Date.now() };
}

async function snapshot(): Promise<Snapshot> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  // มีคนกำลังโหลดอยู่ → รอคนนั้น ไม่ยิง Firestore ซ้ำซ้อนตอนคนถามพร้อมกัน
  inflight ??= load()
    .then((s) => {
      cache = s;
      return s;
    })
    .catch(() => cache ?? { ...EMPTY, at: Date.now() })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * หัวข้อคลังความรู้ "ที่เข้าเค้ากับคำถาม" สำหรับให้ Gemini เลือกตอน parse
 * — ทั้งคลังมี 1,100+ หัวข้อ ส่งหมดทำให้ parse ช้า/เปลืองมาก จึงคัดหยาบ ๆ ด้วยการจับคู่คำก่อน
 * คืนพร้อม index จริงในคลัง เพื่อให้ relevant_kb ที่ AI ตอบกลับชี้ตำแหน่งถูกตัว
 */
export async function getKbTitleCandidates(message: string, limit = 80): Promise<{ index: number; title: string }[]> {
  try {
    const kb = (await snapshot()).kb;
    const msgLower = message.toLowerCase();
    const msgWords = msgLower.split(/[\s,+]+/).filter((w) => w.length >= 2);
    return kb
      .map((k, index) => ({ index, title: k.title ?? "", s: scoreOf(`${k.title ?? ""} ${k.content ?? ""}`, msgLower, msgWords) }))
      .filter((x) => x.s > 0 && x.title)
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map(({ index, title }) => ({ index, title }));
  } catch {
    return [];
  }
}

/**
 * คะแนนความเกี่ยวข้องกับคำถาม
 *
 * ภาษาไทยไม่มีช่องว่างระหว่างคำ ตัดคำเองไม่ได้ → จับสองทาง
 *   1) เอา "คำในข้อมูล" ไปหาในคำถาม (จับไทยได้ เช่นคำถามมีคำว่า "พวงกุญแจ")
 *   2) เอา "คำในคำถาม" ที่เว้นวรรคได้ ไปหาในข้อมูล (จับอังกฤษ/ตัวเลข เช่น MousePad 30x60)
 * คะแนน = ความยาวคำที่ตรง (คำยาวตรงกัน = มั่นใจกว่าคำสั้น)
 */
function scoreOf(haystack: string, msgLower: string, msgWords: string[]): number {
  const hay = haystack.toLowerCase();
  let score = 0;
  for (const term of hay.split(/[\s,()/|·、，-]+/)) {
    const t = term.trim();
    if (t.length >= 3 && msgLower.includes(t)) score += t.length;
  }
  for (const w of msgWords) if (hay.includes(w)) score += w.length;
  return score;
}

function topBy<T>(items: T[], text: (t: T) => string, msgLower: string, msgWords: string[], limit: number): T[] {
  return items
    .map((it) => ({ it, s: scoreOf(text(it), msgLower, msgWords) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.it);
}

/** ช่วงราคาสั้น ๆ ของสินค้า (จาก priceMin/priceMax ที่เซิร์ฟเวอร์คำนวณไว้ตอนบันทึก) */
function priceText(p: ShopProduct): string {
  const min = p.priceMin ?? p.price;
  const max = p.priceMax;
  if (min && max && max > min) return `ราคา ${min.toLocaleString()}-${max.toLocaleString()} บาท`;
  if (min) return `ราคาเริ่มต้น ${min.toLocaleString()} บาท`;
  return "";
}

export interface ChatContext {
  systemMessage?: string;
  knowledgeContext?: string;
  /** ข้อความ hint ต่อท้าย message (คำแนะนำระบบให้ AI ค้นราคา/ตอบวิธีการ) — ล้อ chat.html */
  messageHint: string;
  /**
   * ลิงก์หน้าสินค้าบนเว็บที่ตรงกับคำถาม (เรียงตามความมั่นใจ)
   * — agent ใน n8n มี system prompt ของตัวเองที่ไม่ยอมใส่ลิงก์ในคำตอบ
   *   route จึงใช้รายการนี้ "แนบต่อท้ายคำตอบเอง" ให้ลูกค้ากดเข้าไปสั่งได้แน่นอน
   */
  productLinks: { name: string; url: string; price: string }[];
  /** ไว้ log ว่าประกอบ context ได้แค่ไหน */
  stats: { catalog: number; links: number; tips: number; kb: number; products: number };
}

/** ประกอบบริบทสำหรับคำถามหนึ่งข้อ — ล้อโครงเดียวกับที่ chat.html ส่งไป n8n */
export async function buildChatContext(message: string, parsed: ParsedMessage | null = null): Promise<ChatContext> {
  let snap: Snapshot;
  try {
    snap = await snapshot();
  } catch {
    return { messageHint: "", productLinks: [], stats: { catalog: 0, links: 0, tips: 0, kb: 0, products: 0 } };
  }

  // คำที่ใช้จับคู่ — รวมผลวิเคราะห์จาก Gemini (คำที่แก้แล้ว/คำพ้อง) ถ้ามี ให้จับได้แม่นขึ้นมาก
  const terms = parsedTerms(parsed).map((t) => t.toLowerCase());
  const msgLower = [message.toLowerCase(), ...terms].join(" ");
  const msgWords = [...new Set([...message.toLowerCase().split(/[\s,+]+/), ...terms.flatMap((t) => t.split(/[\s,+]+/))])]
    .filter((w) => w.length >= 2);

  let sys = buildParsedHint(parsed);

  // 🔗 สินค้าบนเว็บร้านที่ตรงกับคำถาม — ลิงก์จริงที่ลูกค้ากดเข้าไปเลือกตัวเลือก/สั่งซื้อได้เลย
  // แนบเฉพาะเมื่อลูกค้า "ถามหาสินค้า" จริง (parse แล้วเจอชื่อสินค้า) — คำถามบริการ/นโยบาย เช่น
  // "ช่วยออกแบบให้ไหม" เคยโดนคำว่า "ออกแบบ" ใน description ลากลิงก์กรอบรูปมาแนบมั่ว
  const wantsProduct = !parsed || !!parsedProduct(parsed);
  // จับคู่ลิงก์จาก "ข้อความลูกค้า + ชื่อสินค้าที่ AI สรุป" เท่านั้น — ห้ามใช้ search_terms
  // (Gemini ชอบแตกคำค้นเป็นชื่อสินค้าอื่น เช่นถาม "ออกแบบ" ได้ "ออกแบบกรอบรูป/ออกแบบธง" แล้วลิงก์มั่ว)
  const linkTerms = [parsedProduct(parsed), parsed?.slots?.material ?? ""]
    .filter((t) => !!t.trim())
    .map((t) => t.toLowerCase());
  const linkMsgLower = [message.toLowerCase(), ...linkTerms].join(" ");
  const linkMsgWords = [...new Set([...message.toLowerCase().split(/[\s,+]+/), ...linkTerms.flatMap((t) => t.split(/[\s,+]+/))])]
    .filter((w) => w.length >= 2);
  const productHits = !wantsProduct
    ? []
    : snap.products
        .map((p) => {
          // ชื่อสินค้าต้องตรงด้วยเสมอ — description มีคำกลาง ๆ (ออกแบบ/สกรีน/จัดส่ง) เยอะ จับมั่วง่าย
          const nameScore = scoreOf(`${p.name ?? ""} ${(p.slug ?? "").replace(/-/g, " ")}`, linkMsgLower, linkMsgWords);
          return { p, s: nameScore * 2 + (nameScore > 0 ? scoreOf(p.desc ?? "", linkMsgLower, linkMsgWords) : 0) };
        })
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s);
  // อันดับ 1 นำห่างมาก = มั่นใจ → ส่งลิงก์เดียวพอ ไม่งั้นเอาหลายตัวให้ AI เลือก
  const topScore = productHits[0]?.s ?? 0;
  const qualified = productHits.filter((x) => x.s >= Math.max(8, topScore * 0.5));
  const products =
    qualified.length > 1 && qualified[0].s > qualified[1].s * 1.5
      ? [qualified[0].p]
      : qualified.slice(0, MAX_PRODUCT_LINKS).map((x) => x.p);
  if (products.length) {
    sys +=
      "\n[ลิงก์หน้าสินค้าบนเว็บร้านที่ตรงกับคำถาม - แนบลิงก์ให้ลูกค้ากดเข้าไปดูรายละเอียด เลือกตัวเลือก และสั่งซื้อได้เลย ใส่เฉพาะลิงก์ที่ตรงกับสินค้าที่ลูกค้าถามเท่านั้น ห้ามใส่ลิงก์ที่ไม่เกี่ยวข้อง ห้ามแก้ไขหรือแต่ง URL ขึ้นเอง วางลิงก์เต็ม ๆ ในบรรทัดของตัวเอง]\n";
    products.forEach((p, i) => {
      const price = priceText(p);
      sys += `${i + 1}. ${p.name}${price ? ` (${price})` : ""}\n   ลิงก์: ${SITE_URL}${productPath(p)}\n`;
    });
  }

  // ลิงก์ราคา (ของ AdminBuddy) — คัดเฉพาะที่ตรงกับคำถาม (ส่งทั้ง 65 ลิงก์ AI จะแปะลิงก์มั่ว)
  const links = topBy(snap.links, (l) => `${l.description ?? ""} ${l.keywords ?? ""} ${l.url ?? ""}`, msgLower, msgWords, MAX_LINKS);
  if (links.length) {
    sys += "\n[ลิงก์ราคาสินค้าที่เกี่ยวข้อง - ใส่เฉพาะลิงก์ที่ตรงกับสินค้าที่ลูกค้าถามเท่านั้น ห้ามใส่ลิงก์ที่ไม่เกี่ยวข้อง]\n";
    links.forEach((l, i) => {
      sys += `${i + 1}. สินค้า: ${l.description ?? ""}`;
      if (l.keywords) sys += ` | คีย์เวิร์ด: ${l.keywords}`;
      sys += `\n   ลิงก์: ${l.url ?? ""}\n`;
    });
  }

  if (snap.tips.length) {
    sys += "\n[เทคนิคการขาย]\n";
    snap.tips.forEach((t, i) => {
      sys += `${i + 1}. ${t.title ?? ""}: ${t.content ?? ""}\n`;
    });
  }

  // แค็ตตาล็อกสินค้า — คัดเฉพาะรายการที่เกี่ยวกับคำถาม (ส่งทั้งชุดแล้ว agent ช้าจน timeout — ดูคอมเมนต์บน)
  // รายการที่ไม่ติดมา agent ยังค้นเองได้ผ่าน get_master_pricing (hint ใน message สั่งให้ค้นก่อนตอบเสมอ)
  const catalogHits = topBy(snap.catalog, (p) => `${p.name ?? ""} ${p.details ?? ""}`, msgLower, msgWords, MAX_CATALOG);
  if (catalogHits.length) {
    sys += "\n[แค็ตตาล็อกสินค้า - ใช้ข้อมูลนี้ประกอบการตอบ ทั้งราคา วิธีการ และรายละเอียดสินค้า]\n";
    catalogHits.forEach((p, i) => {
      if (p.name) sys += `${i + 1}. ${p.name}:\n${(p.details ?? "").trim()}\n\n`;
    });
  }

  // คลังความรู้ — 1,100+ ข้อ ส่งทั้งหมดไม่ได้
  // วิธีหลัก: ใช้หัวข้อที่ Gemini เลือกตอน parse (relevant_kb) · fallback: จับคู่คำ
  let kbHits: KbItem[] = [];
  if (parsed?.relevant_kb?.length) {
    kbHits = parsed.relevant_kb
      .filter((i): i is number => typeof i === "number" && i >= 0 && i < snap.kb.length)
      .slice(0, MAX_KB + 2)
      .map((i) => snap.kb[i]);
  }
  if (!kbHits.length) kbHits = topBy(snap.kb, (k) => `${k.title ?? ""} ${k.content ?? ""}`, msgLower, msgWords, MAX_KB);
  let kbText = "";
  if (kbHits.length) {
    kbText = "[คลังความรู้ที่เกี่ยวข้องกับคำถาม]\n";
    kbHits.forEach((k, i) => {
      kbText += `${i + 1}. ${k.title ?? ""}\n${(k.content ?? "").slice(0, MAX_KB_CHARS)}\n\n`;
    });
  }

  if (sys.length > MAX_CONTEXT_CHARS) sys = `${sys.slice(0, MAX_CONTEXT_CHARS)}\n…(ตัดเพราะยาวเกิน)`;

  return {
    systemMessage: sys || undefined,
    knowledgeContext: kbText || undefined,
    messageHint: buildMessageHint(parsed, snap.kb),
    productLinks: products.map((p) => ({
      name: p.name ?? "",
      url: `${SITE_URL}${productPath(p)}`,
      price: priceText(p),
    })),
    stats: { catalog: catalogHits.length, links: links.length, tips: snap.tips.length, kb: kbHits.length, products: products.length },
  };
}

/**
 * hint ที่ "ฝังต่อท้ายข้อความลูกค้า" ก่อนส่งไป n8n — ล้อ chat.html เป๊ะ
 * (n8n agent อ่าน message เป็นหลัก การสั่งงานในนี้ได้ผลกว่าใน systemMessage)
 */
function buildMessageHint(parsed: ParsedMessage | null, kb: KbItem[]): string {
  const product = parsedProduct(parsed);
  const query = parsed?.search_query?.trim() || product;
  if (!query) return "";

  if (isHowToQuestion(parsed)) {
    return `\n[คำแนะนำระบบ: ลูกค้าถามเรื่อง "สเปค/ขั้นตอน/ระยะเวลา" ของ "${query}" — ตอบอธิบายให้ละเอียดก่อนเป็นหลัก แล้วเสริมราคาสั้น ๆ ทีหลัง กรุณาค้นหาข้อมูลจาก knowledge base ก่อน]`;
  }

  // hint "สั่งให้ค้นราคา" ใส่เฉพาะคำถามราคาจริง ๆ — เคยใส่ทุกคำถามแล้วเจอ agent
  // เอาคำทักทาย/คำถามทั่วไปไปค้นราคาจนตอบราคาสินค้ามั่ว ๆ กลับมา (เช่นทัก "สวัสดี" ได้ราคารองแก้ว)
  if (!isPricingQuestion(parsed)) return "";

  const s = parsed?.slots ?? {};
  const materialHint = s.material ? ` วัสดุ: ${s.material}` : "";
  const quantityHint = s.quantity ? ` จำนวน: ${s.quantity}` : "";
  const sizeHint = s.size ? ` ขนาด: ${s.size}` : "";

  // ค้นข้อมูล "เซ็ต/หน่วยนับ" จาก KB แล้วฝังเข้า hint ตรง ๆ (กัน AI คิดเรทผิดเพราะนับหน่วยผิด)
  let setInfoHint = "";
  if (product && kb.length) {
    const productLower = product.toLowerCase();
    const setKeywords = ["เซ็ต", "set", "ชุด", "หน่วย", "กี่ชิ้น", "กี่ใบ"];
    const matched = kb.filter((k) => {
      const title = (k.title ?? "").toLowerCase();
      const content = (k.content ?? "").toLowerCase();
      const hasProduct = title.includes(productLower) || content.includes(productLower);
      const hasSetWord = setKeywords.some((sw) => title.includes(sw) || content.includes(sw));
      return hasProduct && hasSetWord;
    });
    if (matched.length) {
      setInfoHint = "\n📦 ข้อมูลจากคลังความรู้เรื่องหน่วยนับ:\n";
      matched.slice(0, 3).forEach((k) => {
        setInfoHint += `- ${k.title}: ${(k.content ?? "").slice(0, 200)}\n`;
      });
      setInfoHint += "ใช้ข้อมูลนี้แปลงจำนวนชิ้นเป็นเซ็ตก่อนค้นเรทราคา!\n";
    }
  }

  return `\n[คำแนะนำระบบ: ลูกค้าถามเกี่ยวกับ "${product || query}"${materialHint}${sizeHint}${quantityHint}${setInfoHint}
กรุณาใช้ get_master_pricing ค้นหาคำว่า "${query}" เพื่อหาราคา${
    materialHint
      ? `
สำคัญ: ลูกค้าระบุวัสดุเป็น "${s.material}" ต้องค้นหาราคาที่ตรงกับวัสดุนี้เท่านั้น ห้ามใช้ราคาวัสดุอื่น`
      : ""
  }
ถ้าราคาเป็น "เซ็ต" แต่ลูกค้าบอก "ชิ้น" → ต้องแปลงจำนวนก่อนค้นเรท
ห้ามตอบว่าไม่มีข้อมูลโดยไม่ค้นหาก่อน]`;
}
