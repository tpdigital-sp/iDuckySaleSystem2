import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * บริบทที่ส่งไปให้ n8n พร้อมคำถามลูกค้า — ให้ตอบได้เหมือนหน้าแชทของ AdminBuddy (chat.html)
 *
 * ทำไมต้องมี: chat.html ไม่ได้ส่งแค่ข้อความดิบ แต่แนบ 3 อย่างไปด้วยทุกครั้ง
 *   systemMessage    = แค็ตตาล็อกสินค้า + ลิงก์ราคาที่เกี่ยวข้อง + เทคนิคการขาย
 *   knowledgeContext = คลังความรู้ (KB) เฉพาะข้อที่เกี่ยวกับคำถาม
 *   userId
 * เว็บร้านเดิมส่งแค่ message → n8n ได้ context น้อยกว่ามาก คำตอบเลยคนละคุณภาพ
 *
 * แหล่งข้อมูล: Firestore โปรเจกต์ tpdigital-iducky database "ordersure"
 * (คนละ database กับ employees2 ที่อยู่ใน "tp-fixflow" แต่ service account เดียวกัน)
 *   settings/product_catalog · settings/price_links · settings/sales_tips · knowledge-base
 *
 * ⚠️ ไม่ได้ทำขั้น parseCustomerMessage ของ chat.html (ใช้ Gemini แยกวิเคราะห์คำถามก่อนส่ง)
 *    เพราะเว็บร้านยังไม่มี GEMINI_API_KEY — ที่นี่ใช้การจับคู่คำแทน
 */

/** database ของ AdminBuddy (ไม่ใช่ tp-fixflow ที่ใช้ตรวจล็อกอิน) */
const ORDERSURE_DB = process.env.ADMINBUDDY_DATABASE_ID || "ordersure";

/** อ่านซ้ำทุกข้อความสิ้นเปลือง — ข้อมูลพวกนี้แอดมินแก้นาน ๆ ครั้ง */
const TTL_MS = 5 * 60_000;

/** เพดานขนาด กัน payload บวมจนน8n/แลมบ์ดารับไม่ไหว */
const MAX_LINKS = 3;
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

interface Snapshot {
  catalog: CatalogItem[];
  links: PriceLink[];
  tips: SalesTip[];
  kb: KbItem[];
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

const EMPTY: Snapshot = { catalog: [], links: [], tips: [], kb: [], at: 0 };

async function load(): Promise<Snapshot> {
  const store = db();
  if (!store) return { ...EMPTY, at: Date.now() };
  // อ่านพร้อมกัน · เจ๊งทีละก้อนได้ ไม่ล้มทั้งชุด (ไม่มี KB ก็ยังตอบด้วยแค็ตตาล็อกได้)
  const [catalog, links, tips, kb] = await Promise.all([
    store
      .doc("settings/product_catalog")
      .get()
      .then((s) => (s.data()?.items as CatalogItem[]) ?? [])
      .catch(() => []),
    store
      .doc("settings/price_links")
      .get()
      .then((s) => (s.data()?.items as PriceLink[]) ?? [])
      .catch(() => []),
    store
      .doc("settings/sales_tips")
      .get()
      .then((s) => (s.data()?.items as SalesTip[]) ?? [])
      .catch(() => []),
    store
      .collection("knowledge-base")
      .get()
      .then((s) => s.docs.map((d) => d.data() as KbItem))
      .catch(() => []),
  ]);
  return { catalog, links, tips, kb, at: Date.now() };
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
  for (const term of hay.split(/[\s,()/|·、，]+/)) {
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

export interface ChatContext {
  systemMessage?: string;
  knowledgeContext?: string;
  /** ไว้ log ว่าประกอบ context ได้แค่ไหน */
  stats: { catalog: number; links: number; tips: number; kb: number };
}

/** ประกอบบริบทสำหรับคำถามหนึ่งข้อ — ล้อโครงเดียวกับที่ chat.html ส่งไป n8n */
export async function buildChatContext(message: string): Promise<ChatContext> {
  let snap: Snapshot;
  try {
    snap = await snapshot();
  } catch {
    return { stats: { catalog: 0, links: 0, tips: 0, kb: 0 } };
  }

  const msgLower = message.toLowerCase();
  const msgWords = msgLower.split(/[\s,+]+/).filter((w) => w.length >= 2);

  let sys = "";

  // แค็ตตาล็อกสินค้า — chat.html ส่งทั้งชุด (เป็นฐานราคา/รายละเอียดหลักที่ AI ใช้ตอบ)
  if (snap.catalog.length) {
    sys += "\n[แค็ตตาล็อกสินค้า - ใช้ข้อมูลนี้ประกอบการตอบ ทั้งราคา วิธีการ และรายละเอียดสินค้า]\n";
    snap.catalog.forEach((p, i) => {
      if (p.name) sys += `${i + 1}. ${p.name}:\n${(p.details ?? "").trim()}\n\n`;
    });
  }

  // ลิงก์ราคา — คัดเฉพาะที่ตรงกับคำถาม (ส่งทั้ง 65 ลิงก์ AI จะแปะลิงก์มั่ว)
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

  // คลังความรู้ — 1,100+ ข้อ ส่งทั้งหมดไม่ได้ ต้องคัดเฉพาะที่เกี่ยวข้อง
  const kbHits = topBy(snap.kb, (k) => `${k.title ?? ""} ${k.content ?? ""}`, msgLower, msgWords, MAX_KB);
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
    stats: { catalog: snap.catalog.length, links: links.length, tips: snap.tips.length, kb: kbHits.length },
  };
}
