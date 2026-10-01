import "server-only";
import { getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { CHAT_COLLECTION, getChatFirestore } from "./firebase-admin";
import { getSupabaseAdmin } from "./supabase-admin";
import { memberTierOfContact } from "./quote-member-tier";
import { orderTotal, type Order } from "@/lib/admin-data";
import type { Contact } from "@/lib/contacts";

/**
 * 🧠 ความจำต่อลูกค้า (ข้อ 2 ของแผน "ฉลาดเหมือน Claude/ChatGPT" · 1 ต.ค. 69)
 *
 * บอทเคยรู้แค่บทสนทนารอบปัจจุบัน — ลูกค้าเก่าทักมาใหม่ บอทไม่รู้ว่าเคยสั่งอะไร สนใจอะไรค้างอยู่ เป็นร้านค้าหรือตัวแทน
 * ตัวนี้รวม 3 แหล่งเป็นข้อความสั้น ๆ ไว้ใส่หัวพรอมป์ตทุกครั้งที่ลูกค้าทักมา:
 *   1. ออเดอร์จริง (Supabase orders ที่ผูก lineUserId/customerId) · ระดับสมาชิก/ตัวแทนจากการ์ดผู้ติดต่อ
 *   2. สรุปแชทก่อนหน้า (LLM สรุปจาก line-conversations ≤ 60 ข้อความ) — แคชไว้ในห้องแชท field `profile` ไม่สรุปใหม่ทุกข้อความ
 *   3. ชื่อ LINE / จำนวนข้อความ
 * ผลเป็น `text` ≤ ~700 ตัวอักษร ให้ n8n (Build AI Request) แปะหัว conversationHistory และส่งต่อให้ /api/pricing/search (profile)
 */
export interface CustomerProfile {
  userId: string;
  name: string;
  /** ข้อความสั้นสำหรับพรอมป์ต */
  text: string;
  summary: string;
  orders: { id: string; date: string; status: string; items: string; total: number }[];
  tier?: { name: string; pct: number };
  dealer: boolean;
  messageCount: number;
  /** สรุปแชทถูกคำนวณใหม่รอบนี้ไหม (ดีบัก/ดูค่าใช้จ่าย) */
  refreshed: boolean;
}

interface CachedSummary {
  summary?: string;
  updatedAt?: string;
  msgCount?: number;
}

const SUMMARY_TTL_MS = 24 * 3600_000;
/** ข้อความใหม่เกินเท่านี้นับจากที่สรุปครั้งก่อน = สรุปใหม่ */
const SUMMARY_NEW_MSGS = 6;

/** ยืนยัน Firebase ID token ของบัญชีบอท (n8n Debounce Buffer ล็อกอินได้ token นี้อยู่แล้ว) — ไม่ต้องฝัง secret ในโค้ด n8n */
export async function verifyBotToken(authorization: string | null): Promise<boolean> {
  const m = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
  if (!m) return false;
  if (!getChatFirestore()) return false; // ให้ app ถูก init ก่อน
  const app = getApps()[0];
  if (!app) return false;
  try {
    const decoded = await getAuth(app).verifyIdToken(m[1]);
    return !!decoded.uid;
  } catch {
    return false;
  }
}

type Turn = { role: string; text: string; at: string };

function thDate(iso: string): string {
  const d = new Date(iso);
  // Order.date เป็นสตริงไทยอยู่แล้ว ("1 ต.ค. 2569") → ใช้ตามนั้น (เคยตัดเหลือ "1 ต.ค. 256")
  if (Number.isNaN(d.getTime())) return iso.trim().slice(0, 16);
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const bkk = new Date(d.getTime() + 7 * 3600_000);
  return `${bkk.getUTCDate()} ${months[bkk.getUTCMonth()]}`;
}

function itemsText(o: Order): string {
  const items = (o.items ?? []).slice(0, 3).map((it) => `${it.name}${it.qty ? ` ×${it.qty}` : ""}`);
  const more = (o.items ?? []).length > 3 ? ` +อีก ${(o.items ?? []).length - 3}` : "";
  return items.join(", ") + more;
}

async function summarizeChat(name: string, turns: Turn[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || turns.length < 2) return "";
  const lines = turns
    .slice(-60)
    .map((t) => `${t.role === "user" ? "ลูกค้า" : "แอดมิน"} (${t.at.slice(0, 10)}): ${t.text.replace(/\s+/g, " ").slice(0, 220)}`)
    .join("\n");
  const prompt = `สรุป "โปรไฟล์ลูกค้า" จากแชทของร้านพิมพ์/ผลิตของพรีเมียม iDucky เพื่อให้แอดมินคนต่อไปรู้จักลูกค้าคนนี้ทันที

ชื่อ LINE: ${name || "-"}
แชท (เก่า→ใหม่):
${lines}

เขียนภาษาไทย 2-4 บรรทัด ไม่เกิน 350 ตัวอักษร ไม่ใช้ markdown ครอบคลุม: สินค้า/งานที่สนใจหรือเคยถาม (ชื่อสินค้า จำนวน ขนาด วัสดุ ถ้ามี) · ลักษณะลูกค้า (บุคคล/ร้านค้า/องค์กร ถ้าบอกได้) · เรื่องที่ค้างคาหรือรอคำตอบ · ข้อควรระวัง (เคยไม่พอใจ/เร่งด่วน)
ห้ามเดา ห้ามใส่สิ่งที่ไม่มีในแชท ถ้าแชทมีแต่ทักทาย ให้ตอบ "ยังไม่มีข้อมูลสำคัญ"`;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 300, temperature: 0.2 } }),
      signal: AbortSignal.timeout(9_000),
    });
    if (!res.ok) return "";
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return (json.candidates?.[0]?.content?.parts?.[0]?.text ?? "").replace(/\*\*?/g, "").trim().slice(0, 400);
  } catch {
    return "";
  }
}

export async function buildCustomerProfile(userId: string): Promise<CustomerProfile | null> {
  const db = getChatFirestore();
  const sb = getSupabaseAdmin();
  if (!db || !userId) return null;

  const snap = await db.collection(CHAT_COLLECTION).doc(userId).get();
  const doc = (snap.exists ? snap.data() : {}) as Record<string, unknown>;
  const name = String(doc.adminAlias ?? doc.displayName ?? "").trim();
  const rawMsgs = Array.isArray(doc.messages) ? (doc.messages as Record<string, unknown>[]) : [];
  const turns: Turn[] = rawMsgs
    .map((m) => {
      const at = m.at as { toDate?: () => Date } | string | undefined;
      const atIso = at && typeof at === "object" && typeof at.toDate === "function" ? at.toDate().toISOString() : String(at ?? "");
      return { role: String(m.role ?? "user"), text: String(m.text ?? "").trim(), at: atIso };
    })
    .filter((t) => t.text);
  const messageCount = turns.length;

  // 1) ออเดอร์จริง — ผูกด้วย lineUserId ตรง ๆ หรือบัญชีลูกค้า (customerId) ที่เคยอยู่ในออเดอร์เหล่านั้น
  let orders: Order[] = [];
  let tier: CustomerProfile["tier"];
  let dealer = false;
  if (sb) {
    const byLine = await sb
      .from("orders")
      .select("data")
      .eq("data->>lineUserId", userId)
      .order("created_at", { ascending: false })
      .limit(8);
    orders = (byLine.data ?? []).map((r) => r.data as Order);
    const customerId = orders.find((o) => o.customerId)?.customerId;
    if (customerId) {
      const byCust = await sb
        .from("orders")
        .select("data")
        .eq("data->>customerId", customerId)
        .order("created_at", { ascending: false })
        .limit(8);
      for (const r of byCust.data ?? []) {
        const o = r.data as Order;
        if (!orders.some((x) => x.id === o.id)) orders.push(o);
      }
    }
    orders.sort((a, b) => (a.date < b.date ? 1 : -1));
    const contactId = orders.find((o) => o.contactId)?.contactId;
    if (contactId) {
      const [t, c] = await Promise.all([
        memberTierOfContact(sb, contactId).catch(() => undefined),
        sb.from("contacts").select("data").eq("id", contactId).maybeSingle(),
      ]);
      if (t) tier = { name: t.name, pct: t.pct };
      dealer = (c.data?.data as Contact | undefined)?.customerType === "dealer";
    }
    if (!dealer) dealer = orders.some((o) => !!o.dealer);
  }
  const activeOrders = orders.filter((o) => !["เสร็จสิ้น", "ยกเลิก"].includes(o.status));

  // 2) สรุปแชท (แคชในห้องแชท)
  const cached = (doc.profile ?? {}) as CachedSummary;
  const cachedAge = cached.updatedAt ? Date.now() - Date.parse(cached.updatedAt) : Infinity;
  const stale = !cached.summary || cachedAge > SUMMARY_TTL_MS || messageCount - (cached.msgCount ?? 0) >= SUMMARY_NEW_MSGS;
  let summary = cached.summary ?? "";
  let refreshed = false;
  // แชทสั้นมาก (ทักทาย 1-2 คำ) สรุปไปก็ได้แต่ "ยังไม่มีข้อมูล" — ไม่เสียค่า LLM
  if (stale && messageCount >= 4) {
    const fresh = await summarizeChat(name, turns);
    if (fresh) {
      summary = fresh;
      refreshed = true;
      await db
        .collection(CHAT_COLLECTION)
        .doc(userId)
        .set({ profile: { summary, updatedAt: new Date().toISOString(), msgCount: messageCount } }, { merge: true })
        .catch(() => undefined);
    }
  }

  // 3) ข้อความสำหรับพรอมป์ต
  const head: string[] = [];
  if (name) head.push(`ชื่อ LINE: ${name}`);
  head.push(orders.length ? `ลูกค้าเก่า ${orders.length} ออเดอร์` : "ยังไม่เคยสั่งซื้อ (ตามข้อมูลที่ผูกไว้)");
  if (dealer) head.push("ตัวแทนจำหน่าย (ได้ราคาตัวแทน ไม่ได้ส่วนลด/ของแถมอื่น)");
  else if (tier) head.push(`ระดับสมาชิก ${tier.name} (ส่วนลด ${tier.pct}%)`);
  const lines = [head.join(" · ")];
  for (const o of orders.slice(0, 3)) {
    lines.push(`• ${o.id} (${thDate(o.date)}) ${itemsText(o)} — ${o.status} ฿${orderTotal(o).toLocaleString()}`);
  }
  if (activeOrders.length) lines.push(`มีออเดอร์ที่ยังไม่จบ ${activeOrders.length} ใบ: ${activeOrders.map((o) => `${o.id} ${o.status}`).join(", ")}`);
  // สรุปที่บอกแต่ว่า "ยังไม่มีข้อมูล…" ทุกประโยค = ไม่มีประโยชน์ ไม่แปะ
  const noInfoCount = (summary.match(/ไม่มีข้อมูล|ไม่ได้ระบุ|ไม่มีข้อควรระวัง/g) ?? []).length;
  const useful = !!summary && !/^ยังไม่มีข้อมูลสำคัญ/.test(summary) && noInfoCount < 2 && summary.length > 40;
  if (useful) lines.push(`จากแชทก่อนหน้า: ${summary}`);

  return {
    userId,
    name,
    text: lines.join("\n").slice(0, 900),
    summary,
    orders: orders.slice(0, 5).map((o) => ({ id: o.id, date: o.date, status: o.status, items: itemsText(o), total: orderTotal(o) })),
    tier,
    dealer,
    messageCount,
    refreshed,
  };
}
