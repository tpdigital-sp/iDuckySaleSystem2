import { cleanNeedsPurchaseItems, orderTotal, type Order } from "@/lib/admin-data";
import { SITE_URL } from "@/lib/shop-info";
import { getFirestoreAdmin } from "./firebase-admin";
import type { getSupabaseAdmin } from "./supabase-admin";
import { orderOwner, pushNeedsPurchaseToTP, tpOrderDb, tpRequestId } from "./tp-order-bridge";

/**
 * ⏰ ลูกค้าโอนแล้ว + ติ๊ก "รอของเข้า" แต่แอดมินยังไม่ใส่ "ของที่ต้องสั่ง" → คำขอยังไม่เข้า TP (tp-order-bridge.ts)
 *
 * เจ้าของร้านเลือก 7 ต.ค. 69 (ก + ข):
 *   ก. เตือนกลุ่มไลน์ร้านซ้ำทุก 2 ชม. (เฉพาะเวลาทำงาน 09:00–18:00) จนกว่าจะมีคนใส่
 *   ข. ครบ 4 ชม. นับจากลูกค้าโอนแล้วยังไม่ใส่ → ส่งเข้า TP แทนด้วยชื่อสินค้า + ป้าย
 *      "⚠️ แอดมินไม่ได้ระบุวัสดุ — ถาม {แอดมินที่รับผิดชอบ} ก่อนสั่ง" (ส่งแล้วหยุดเตือน)
 * แอดมินใส่วัสดุทีหลังเมื่อไหร่ ข้อความคำขอใน TP เปลี่ยนเป็นวัสดุจริงเอง (syncTPRequest)
 *
 * รันจาก cron ทุก 5 นาที (/api/cron/tp-order-sync) · สถานะการเตือนเก็บใน tp-fixflow/shopNeedsPurchaseWatch
 * (ไม่เขียนลงออเดอร์ — การบันทึกออเดอร์ผ่านประตูคิดกฎทั้งใบ ไม่ควรเกิดทุก 2 ชม. เพื่อแค่จำเวลาเตือน)
 */

const REMIND_MS = 2 * 60 * 60 * 1000;
const FALLBACK_MS = 4 * 60 * 60 * 1000;
const WATCH = "shopNeedsPurchaseWatch";
const NOT_ACTIVE = new Set(["รอชำระเงิน", "รอตรวจสอบ", "ยกเลิก", "จัดส่งแล้ว", "เสร็จสิ้น"]);
/**
 * ⛔ นับเฉพาะใบที่ลูกค้าโอน "หลังเปิดระบบนี้" — ใบเก่า (ก่อน 7 ต.ค. 69) เคยแจ้งกลุ่มร้านแล้วและสั่งของกันเองด้วยมือ
 * ไม่มีเส้นนี้ = วันแรกที่ขึ้นระบบจะส่งใบค้างเก่า 7 ใบ (15–29 ก.ย.) เข้า TP + แจ้งไลน์รัวพร้อมกัน
 */
const BRIDGE_START = Date.parse(process.env.TP_BRIDGE_START || "2026-10-07T00:00:00+07:00");

type SB = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/** เวลาทำงานร้าน (ไทย) — นอกเวลาไม่เตือน (ไม่ปลุกกลุ่มตอนดึก) แต่ยังส่งแทนตามเวลาได้ */
function workingHours(now: Date): boolean {
  const h = Number(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok", hour: "numeric", hour12: false }));
  return h >= 9 && h < 18;
}

export type RemindResult = { id: string; action: "remind" | "fallback" | "wait"; detail?: string };

export async function sweepMissingMaterials(sb: SB, dry = false): Promise<RemindResult[]> {
  const fx = getFirestoreAdmin();
  const col = tpOrderDb();
  if (!fx || !col) return [];
  const { data } = await sb.from("orders").select("data").not("data->needsPurchase", "is", null).order("created_at", { ascending: false }).limit(300);
  const now = new Date();
  const out: RemindResult[] = [];
  for (const r of (data ?? []) as { data: Order }[]) {
    const o = r.data;
    const np = o.needsPurchase;
    if (!np?.alertedAt || np.arrivedAt || NOT_ACTIVE.has(o.status)) continue;
    if (Date.parse(np.alertedAt) < BRIDGE_START) continue; // ใบเก่าก่อนเปิดระบบ
    if (cleanNeedsPurchaseItems(np.items).length) continue; // ใส่ของแล้ว — ทางปกติจัดการแล้ว
    const id = tpRequestId(o);
    if (!id) continue;
    if ((await col.doc(id).get()).exists) continue; // ส่งแทนไปแล้ว (หรือสร้างจากทางอื่น) — หยุดเตือน
    const watchRef = fx.collection(WATCH).doc(id);
    const w = (await watchRef.get()).data() ?? {};
    const since = now.getTime() - Date.parse(np.alertedAt);
    const owner = orderOwner(o);

    // ข. ครบ 4 ชม. → ส่งเข้า TP แทน
    if (since >= FALLBACK_MS) {
      if (dry) { out.push({ id: o.id, action: "fallback", detail: owner }); continue; }
      const sent = await pushNeedsPurchaseToTP(o, { fallback: true });
      await watchRef.set({ orderId: o.id, fallbackAt: now.toISOString(), owner }, { merge: true });
      if (sent) await alertFallback(o, owner);
      out.push({ id: o.id, action: "fallback", detail: owner });
      continue;
    }

    // ก. เตือนซ้ำทุก 2 ชม. ในเวลาทำงาน
    const last = Date.parse(String(w.remindedAt || np.alertedAt));
    if (workingHours(now) && now.getTime() - last >= REMIND_MS) {
      if (dry) { out.push({ id: o.id, action: "remind", detail: owner }); continue; }
      const fallbackAt = new Date(Date.parse(np.alertedAt) + FALLBACK_MS);
      await alertReminder(o, owner, Math.floor(since / 3_600_000), fallbackAt);
      await watchRef.set({ orderId: o.id, remindedAt: now.toISOString(), reminders: (Number(w.reminders) || 0) + 1, owner }, { merge: true });
      out.push({ id: o.id, action: "remind", detail: owner });
    } else out.push({ id: o.id, action: "wait" });
  }
  return out;
}

const timeTH = (d: Date) => d.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
const prodsOf = (o: Order) => o.items.map((i) => `${i.name} ×${i.qty.toLocaleString("th-TH")}`);

/** ⏰ การ์ดเตือนซ้ำในกลุ่มไลน์ร้าน — บอกชื่อแอดมินที่ต้องลงมือ + เวลาที่ระบบจะส่งแทน */
async function alertReminder(o: Order, owner: string, hours: number, fallbackAt: Date): Promise<void> {
  const { pushShopAlert } = await import("./line-alert");
  await pushShopAlert({
    tone: "#D97706",
    title: "⏰ ยังไม่ได้ใส่ “ของที่ต้องสั่ง”",
    headline: `${owner} — ลูกค้าโอนมา ${hours} ชม. แล้ว ใส่วัสดุที่ต้องสั่งในกล่อง 🛒 หน้าออเดอร์ ระบบถึงจะส่งเข้าระบบสั่งของ TP`,
    heroLabel: "เลขออเดอร์",
    hero: o.id,
    rows: [
      { label: "แอดมินที่รับผิดชอบ", value: owner, bold: true },
      { label: "ลูกค้า", value: o.customer || "ยังไม่ระบุชื่อ" },
      { label: "ยอดบิล", value: `${orderTotal(o).toLocaleString("th-TH")} บาท` },
      ...(o.useByDate ? [{ label: "วันใช้งาน", value: o.useByDate, bold: true }] : []),
    ],
    bullets: prodsOf(o),
    note: `ไม่ใส่ภายใน ${timeTH(fallbackAt)} น. ระบบจะส่งชื่อสินค้าเข้า TP แทน พร้อมป้าย "ถาม ${owner} ก่อนสั่ง"`,
    button: { label: "เปิดออเดอร์ ใส่ของที่ต้องสั่ง", uri: `${SITE_URL}/admin/orders/${encodeURIComponent(o.id)}` },
    alt: `⏰ ${o.id} ยังไม่ได้ใส่ของที่ต้องสั่ง — ${owner}`,
  });
}

/** 📤 ส่งแทนแล้ว — บอกกลุ่มร้านว่าเข้า TP ด้วยชื่อสินค้า + ฝ่ายจัดซื้อจะถามใคร */
async function alertFallback(o: Order, owner: string): Promise<void> {
  const { pushShopAlert } = await import("./line-alert");
  await pushShopAlert({
    tone: "#B45309",
    title: "📤 ส่งเข้า TP แทนแล้ว (ยังไม่มีวัสดุ)",
    headline: `ครบ 4 ชม. ยังไม่มีคนใส่ของที่ต้องสั่ง — ส่งชื่อสินค้าเข้าระบบสั่งของ TP แทนแล้ว ฝ่ายจัดซื้อจะถาม ${owner} ก่อนสั่ง`,
    heroLabel: "เลขออเดอร์",
    hero: o.id,
    rows: [{ label: "แอดมินที่รับผิดชอบ", value: owner, bold: true }],
    bullets: prodsOf(o),
    note: "ใส่วัสดุในกล่อง 🛒 หน้าออเดอร์ได้ตลอด — ข้อความคำขอใน TP จะเปลี่ยนเป็นวัสดุจริงให้เอง",
    button: { label: "เปิดออเดอร์", uri: `${SITE_URL}/admin/orders/${encodeURIComponent(o.id)}` },
    alt: `📤 ${o.id} ส่งเข้า TP แทนแล้ว — ถาม ${owner} ก่อนสั่ง`,
  });
}

