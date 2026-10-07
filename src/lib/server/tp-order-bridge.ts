import { getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "./firebase-admin";
import { cleanNeedsPurchaseItems, needsPurchaseItemText, type Order } from "@/lib/admin-data";

/**
 * 🛒 → 📦 สะพาน "รอของเข้า" ร้าน → ระบบสั่งของ TP (order-request.html · Firestore tpdigitalreciept/order)
 *
 * เจ้าของร้านขอ 7 ต.ค. 69: แอดมินพิมพ์ "ต้องสั่งอะไร" ในหน้าออเดอร์ + ลูกค้าโอนแล้ว
 *   → ขึ้นเป็นคำขอในแท็บ "จัดการคำสั่งซื้อ" ของ TP เอง + แจ้งไลน์กลุ่ม OrderTP (n8n line-order ตัวเดียวกับหน้าสั่งของ)
 *   → พอ TP เปลี่ยนเป็น "ของเข้าแล้ว" ฝั่งร้านติ๊กของเข้าให้เอง (ดู tp-order-arrived.ts)
 *
 * จังหวะสร้างคำขอ = จังหวะเดียวกับการ์ด "🛒 ลูกค้าโอนแล้ว — ต้องสั่งของ" ในกลุ่มร้าน (needs-purchase.ts · due ครั้งเดียวต่อการติ๊ก)
 * เลขคำขอผูกกับ "การติ๊กครั้งนั้น" (needsPurchase.at) → ยิงซ้ำกี่รอบก็ได้ใบเดียว (create ชนเลขเดิม = ข้าม)
 *
 * ⚠️ ทุกฟังก์ชันไม่ throw — คำขอ TP สร้างไม่ได้ต้องไม่ทำให้การบันทึกออเดอร์ล้ม · ผู้เรียกต้อง await (Netlify แช่เครื่องทันทีที่ตอบ)
 */

const ORDER_DB = "tpdigitalreciept";
const ORDER_COLLECTION = "order";
/** n8n ตัวเดียวกับปุ่ม "ส่งคำสั่งซื้อ" ในหน้า order-request.html → ไลน์กลุ่ม OrderTP */
const TP_ORDER_WEBHOOK = process.env.TP_ORDER_WEBHOOK_URL || "https://iduckyshop.app.n8n.cloud/webhook/line-order";
const TP_ORDER_LINE_GROUP = process.env.TP_ORDER_LINE_GROUP || "C141bda40c4045ec322d60bc5cbaebe46";
export const TP_ORIGIN = "iducky-shop";

export function tpOrderDb() {
  if (!getFirestoreAdmin()) return null; // ตั้งแอป firebase-admin ให้ก่อน (ไม่มี service account = ข้ามเงียบ)
  return getFirestore(getApps()[0]!, ORDER_DB).collection(ORDER_COLLECTION);
}

/** เลขคำขอ TP ของ "การติ๊กครั้งนี้" — ยกเลิกติ๊กแล้วติ๊กใหม่ = at ใหม่ = คำขอใหม่ */
export function tpRequestId(o: Pick<Order, "id" | "needsPurchase">): string | null {
  const at = o.needsPurchase?.at;
  if (!at) return null;
  const t = Date.parse(at);
  return `shop-${o.id}-${Number.isFinite(t) ? t : at.replace(/\D/g, "")}`.replace(/[^A-Za-z0-9_-]/g, "-");
}

/** สินค้าในออเดอร์ทีละบรรทัด: "หมวกแก๊ป (สี: ดำ · ขนาด: L) ×2" — ตัวเลือกบอกคนสั่งซื้อว่าต้องสั่งรุ่นไหน */
function itemLines(o: Order): string[] {
  return o.items.map((i) => `${i.name}${i.selections?.trim() ? ` (${i.selections.trim()})` : ""} ×${i.qty.toLocaleString("th-TH")}`);
}

/**
 * 👤 แอดมินที่รับผิดชอบใบนี้ — คนที่ติ๊ก "รอของเข้า" (รู้ว่าต้องสั่งอะไร) ก่อน · ไม่มี = คนที่สร้างออเดอร์แทนลูกค้า
 * ออเดอร์ไม่มีช่อง "ผู้รับผิดชอบ" แยก จึงใช้สองช่องนี้ (เจ้าของร้านขอ 7 ต.ค. 69: ป้ายส่งแทนต้องบอกว่าถามใคร)
 */
export function orderOwner(o: Order): string {
  const by = o.needsPurchase?.by?.trim();
  return (by && by !== "ระบบ" ? by : "") || o.placedBy?.trim() || by || "แอดมินเจ้าของออเดอร์";
}

/** ของที่พนักงานระบุว่าต้องสั่ง (วัสดุจริง) — ว่าง = ยังไม่ได้ระบุ */
export function materialLines(o: Order): string[] {
  return cleanNeedsPurchaseItems(o.needsPurchase?.items).map(needsPurchaseItemText);
}

/**
 * ข้อความคำขอในแท็บ "จัดการคำสั่งซื้อ" (บรรทัดแรก = ที่หน้า TP โชว์ในรายการ)
 * เจ้าของร้านขอ 7 ต.ค. 69: ต้องบอก "ของที่ต้องสั่ง" ตามที่พนักงานระบุ (ปลอกหมอนอิง → ซิป 16") ไม่ใช่ชื่อสินค้า
 * พนักงานยังไม่ได้ระบุ = ใช้ชื่อสินค้าในออเดอร์แทน (คนสั่งซื้อยังรู้ว่าเป็นงานอะไร)
 */
function requestText(o: Order): string {
  const mats = materialLines(o);
  const note = o.needsPurchase?.note?.trim();
  // ส่งแทน (ครบเวลาแล้วแอดมินยังไม่ใส่วัสดุ) → ขึ้นต้นด้วยป้ายเตือน + ชื่อแอดมินที่ต้องถาม
  const head = mats.length
    ? mats.join(", ")
    : `⚠️ แอดมินไม่ได้ระบุวัสดุ — ถาม ${orderOwner(o)} ก่อนสั่ง · สินค้า: ${itemLines(o).join(", ") || "ของสำหรับออเดอร์นี้"}`;
  return `${head.slice(0, 400)}${note ? ` · ${note}` : ""} — ออเดอร์ร้าน ${o.id}${o.useByDate ? ` (วันใช้งาน ${o.useByDate})` : ""}`;
}

/** ข้อความไลน์กลุ่ม OrderTP — ของที่ต้องสั่งทีละบรรทัด (ตัวหลัก) · สินค้าของลูกค้าเป็นข้อมูลอ้างอิง */
export function orderTPMessage(o: Order, urgent: boolean): string {
  const np = o.needsPurchase!;
  const mats = materialLines(o);
  const prods = itemLines(o);
  const note = np.note?.trim();
  return (
    `📦 คำสั่งซื้อใหม่ (จากร้าน iDucky · ลูกค้าโอนแล้ว) จาก ${np.by}\n` +
    `ออเดอร์ร้าน ${o.id}${o.useByDate ? ` · วันใช้งาน ${o.useByDate}` : ""}${urgent ? " · ⚡ เร่งสั่ง" : ""}\n` +
    `——————————\n` +
    (mats.length
      ? `🛒 ของที่ต้องสั่ง (${mats.length} รายการ):\n${mats.map((l, i) => `${i + 1}. ${l}`).join("\n")}\n`
      : `⚠️ แอดมินไม่ได้ระบุวัสดุ — ถาม ${orderOwner(o)} ก่อนสั่ง\n(ส่งแทนอัตโนมัติ เพราะเกินเวลาที่กำหนดแล้วยังไม่มีคนใส่)\n`) +
    (note ? `📝 หมายเหตุ: ${note}\n` : "") +
    `——————————\n` +
    `📋 สำหรับสินค้า: ${prods.length ? prods.join(", ") : "—"}`
  );
}

/**
 * ลูกค้าโอนแล้ว + ติ๊กรอของเข้า → สร้างคำขอใน TP + แจ้งไลน์กลุ่ม OrderTP
 * เรียกจากประตูเขียนออเดอร์ (order-write.ts) ตอน stampNeedsPurchaseAlert บอก due=true เท่านั้น
 */
export async function pushNeedsPurchaseToTP(o: Order, opts: { fallback?: boolean } = {}): Promise<boolean> {
  const np = o.needsPurchase;
  const id = tpRequestId(o);
  const col = tpOrderDb();
  if (!np || !id || !col) return false;
  // ⛔ บังคับระบุ "ของที่ต้องสั่ง" (เจ้าของร้านสั่ง 7 ต.ค. 69) — ยังไม่ระบุ = ยังไม่ส่งเข้า TP
  //    การ์ดกลุ่มร้านเตือนให้แอดมินกรอก · กรอกเมื่อไหร่ syncTPRequest สร้างคำขอ + แจ้ง OrderTP ให้เอง
  //    ครบเวลาแล้วยังไม่ใส่ → cron ส่งแทนด้วย fallback: true (tp-order-remind.ts) พร้อมป้าย "ถามแอดมิน …"
  const missing = !materialLines(o).length;
  if (missing && !opts.fallback) return false;
  const text = requestText(o);
  const urgent = !!o.rush;
  try {
    await col.doc(id).create({
      // ข้อความสไตล์เดียวกับปุ่มเดิม: แท็กท้ายบรรทัด + "— ขอโดย" บรรทัดถัดไป (หน้า TP ตัดแท็กออกตอนแสดงเอง)
      rawText: `${text}${urgent ? " (เร่งสั่ง)" : ""} (โอนแล้ว)\n— ขอโดย: ${np.by} (ร้าน iDucky)`,
      status: "รอสั่งซื้อ",
      timestamp: FieldValue.serverTimestamp(),
      isUrgent: urgent,
      urgency: urgent ? "เร่งสั่ง" : "ปกติ",
      isPaid: true,
      paymentStatus: "ลูกค้าโอนแล้ว",
      requestedBy: { id: TP_ORIGIN, name: np.by, department: "ร้าน iDucky" },
      // source เดียวกับคำขอจากหน้า TP — หน้า order-request ดึงด้วย where source == 'TP-Achieve'
      source: "TP-Achieve",
      origin: TP_ORIGIN,
      shopOrderId: o.id,
      shopNeedsAt: np.at,
      ...(missing ? { materialsMissing: true, responsibleAdmin: orderOwner(o) } : {}),
    });
  } catch (e) {
    const code = (e as { code?: number | string })?.code;
    if (code === 6 || code === "already-exists") return false; // เคยสร้างแล้ว (ยิงซ้ำ) — ไม่แจ้งไลน์ซ้ำ
    console.error("[tp-order-bridge] สร้างคำขอใน TP ไม่สำเร็จ:", (e as Error)?.message);
    return false;
  }
  await notifyOrderTP(id, np.by, text, urgent, orderTPMessage(o, urgent));
  return true;
}

/** แจ้งไลน์กลุ่ม OrderTP ผ่าน n8n ตัวเดียวกับหน้า order-request.html (payload ชุดเดียวกับ notifyN8n) */
async function notifyOrderTP(id: string, by: string, text: string, urgent: boolean, message: string): Promise<void> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetch(TP_ORDER_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctl.signal,
      body: JSON.stringify({
        event: "order_request",
        to: TP_ORDER_LINE_GROUP,
        requester: { id: TP_ORIGIN, name: by, department: "ร้าน iDucky" },
        totalItems: 1,
        urgentCount: urgent ? 1 : 0,
        paidCount: 1,
        items: [{ orderId: id, text, isUrgent: urgent, urgency: urgent ? "เร่งสั่ง" : "ปกติ", isPaid: true, paymentStatus: "ลูกค้าโอนแล้ว" }],
        message,
        submittedAt: new Date().toISOString(),
        source: "TP-Achieve",
      }),
    });
    if (!res.ok) console.error("[tp-order-bridge] แจ้งไลน์ OrderTP ไม่สำเร็จ:", res.status);
  } catch (e) {
    console.error("[tp-order-bridge] แจ้งไลน์ OrderTP ไม่สำเร็จ:", (e as Error)?.message);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * แอดมินแก้ใบหลังคำขอถูกสร้างแล้ว → คำขอใน TP ต้องตาม (เฉพาะใบที่ยัง "รอสั่งซื้อ" — สั่งไปแล้วไม่ไปแตะ)
 * - ยกเลิกติ๊ก / ติ๊กใหม่ (at เปลี่ยน) → คำขอเดิมเป็น "ไม่สั่งซื้อ"
 * - แก้ "ต้องสั่งอะไร" → แก้ข้อความคำขอ
 * ใบที่ยังไม่เคยสร้างคำขอ (ยังไม่โอน / ติ๊กก่อนมีสะพานนี้) = ไม่มีเอกสาร → ข้ามเงียบ
 */
export async function syncTPRequest(prev: Order | null | undefined, next: Order): Promise<void> {
  const old = prev?.needsPurchase;
  if (!old?.alertedAt) return; // คำขอถูกสร้างตอนแจ้ง (alertedAt) เท่านั้น
  const cur = next.needsPurchase;
  const sameTick = !!cur && cur.at === old.at;
  // แก้ "หมายเหตุ" หรือ "ของที่ต้องสั่ง" ทีหลัง → ข้อความคำขอใน TP ตาม
  const noteChanged = sameTick && (
    (cur!.note ?? "") !== (old.note ?? "") ||
    JSON.stringify(cleanNeedsPurchaseItems(cur!.items)) !== JSON.stringify(cleanNeedsPurchaseItems(old.items))
  );
  if (sameTick && !noteChanged) return;
  const id = tpRequestId(prev!);
  const col = tpOrderDb();
  if (!id || !col) return;
  try {
    const ref = col.doc(id);
    const snap = await ref.get();
    // ลูกค้าโอนไปแล้วตอนยังไม่ได้ระบุของ (คำขอถูกพักไว้) → แอดมินเพิ่งกรอก = ส่งเข้า TP + แจ้ง OrderTP ตอนนี้
    if (!snap.exists) {
      if (sameTick && materialLines(next).length) await pushNeedsPurchaseToTP(next);
      return;
    }
    if (snap.data()?.status !== "รอสั่งซื้อ") return;
    if (!sameTick) {
      await ref.update({ status: "ไม่สั่งซื้อ", note: "ร้านยกเลิกติ๊ก \"รอของเข้า\" ในหน้าออเดอร์แล้ว", shopCancelledAt: new Date().toISOString() });
    } else {
      const urgent = !!next.rush;
      await ref.update({
        rawText: `${requestText(next)}${urgent ? " (เร่งสั่ง)" : ""} (โอนแล้ว)\n— ขอโดย: ${cur!.by} (ร้าน iDucky)`,
        materialsMissing: !materialLines(next).length,
      });
    }
  } catch (e) {
    console.error("[tp-order-bridge] อัปเดตคำขอใน TP ไม่สำเร็จ:", (e as Error)?.message);
  }
}
