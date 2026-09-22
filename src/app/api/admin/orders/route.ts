import { NextResponse } from "next/server";
import { withArtQtyMap } from "@/lib/edit-selections";
import { bkkYmd, thaiDateTime } from "@/lib/bangkok-time";
import { randomBytes } from "node:crypto";
import { currentActor, requirePerm } from "@/lib/server/require-perm";
import { can, canPack, PACK_SCAN_HEADER, ROLE_ADMINISTRATOR } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { insertOrder, itemsChanged, updateOrder } from "@/lib/server/order-write";
import { syncOrderEarlyPay } from "@/lib/server/order-early-pay";
import { needsPurchaseStamp, notifyStockArrived } from "@/lib/server/needs-purchase";
import { keepServerMoney } from "@/lib/server/order-money-guard";
import { applyChangedKeys, CHANGED_KEYS_HEADER, customerInfoChanges, keepCustomerVerdict, parseChangedKeys, scheduleChanges } from "@/lib/server/order-merge";
import { syncOrderMemberTier } from "@/lib/server/order-member-tier";
import { KEY_STATUSES, notifyCustomer, notifyCustomerLogged, orderLink, orderNotice, statusFlex, statusMessage } from "@/lib/server/notify";
import { reconcileFollowupsForOrder, reportPaidToTP, syncAmountsToTP, syncArrivalToTP, syncCustomerToTP, syncRushToTP, syncStockWaitToTP } from "@/lib/server/tp-report";
import { settleCreditedOrder } from "@/lib/server/slip-apply";
import { amountsForRecord } from "@/lib/tp-amounts";
import { signPaymentUrls, stripPaymentUrls } from "@/lib/server/slip-sign";
import { isPickupOrder } from "@/lib/ship-label";
import { planBalanceQueue } from "@/lib/balance-notify";
import { isShipMain, isShipRider, riderNotReady, shipMainIdOf, shipRiderIdsOf } from "@/lib/ship-with";
import { bumpSoldForOrder, unbumpSoldForOrder } from "@/lib/server/sold";
import { cutStockForOrder, restoreStockForOrder } from "@/lib/server/stock";
import { awardPointsForOrder, revokePointsForOrder } from "@/lib/server/contact-points";
import {
  adminDiscountAmount,
  hasUnpaidBalance,
  orderBalance,
  orderTotal,
  orderVatAmount,
  reconcileOrderTax,
  whtCoversBalance,
  orderWhtAmount,
  uncreditedReceived,
  lockEarlyPay,
  orderAwaitingStock,
  packGate,
  partialGate,
  planPendingReason,
  roundSel,
  proofsOf,
  shipmentQty,
  shipToText,
  withLog,
  type LogEntry,
  type Order,
  type OrderItem,
  type OrderStatus,
  type PackGate,
  type Proof,
  type Shipment,
} from "@/lib/admin-data";

/** สรุปเหตุผลที่ด่านตรวจยังไม่ผ่าน (ไว้โชว์/ลง log) */
function gateReasons(g: PackGate): string {
  return [
    g.planPending ? planPendingReason(g.planPending) : "",
    g.uncounted.length ? `ตรวจนับอีก ${g.uncounted.length} รูป` : "",
    g.unread.length ? `ยืนยันอ่านอีก ${g.unread.length} รายการ` : "",
    g.short.length ? `ของไม่ครบ ${g.short.length} รายการ` : "",
    g.missing.length ? `ของยังไม่มา/ไม่ครบ ${g.missing.length} รายการ (${g.missing.map((m) => m.item).join(", ")})` : "",
    g.unsampled.length ? `ยังไม่ยืนยันใส่งานตัวอย่าง ${g.unsampled.length} รายการ` : "",
    g.noPhoto ? "ยังไม่ได้ถ่ายภาพก่อนปิดกล่อง" : "",
    g.unpaidBalance ? "ยังเก็บเงินไม่ครบ (ยอดคงเหลือมัดจำ / ส่วนต่างที่ตีราคาเพิ่ม)" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** 🚚 รอบแบ่งส่งที่เพิ่งยิงมาในคำขอนี้ (เลขพัสดุที่ยังไม่มีในใบเดิม) — ไว้เช็คด่าน/แจ้งลูกค้า */
function newShipmentsOf(existing: Order, incoming: Order): Shipment[] {
  const inc = Array.isArray(incoming.shipments) ? incoming.shipments : [];
  const had = new Set((existing.shipments ?? []).map((s) => s.tracking.trim()));
  // 🏪 รอบ "มารับเอง" (ไม่มีเลขพัสดุจริง) รับเฉพาะใบมารับเอง — ใบส่งพัสดุต้องมีเลขเสมอ
  const pickupOk = isPickupOrder(existing);
  return inc.filter(
    (s) => s && typeof s.tracking === "string" && s.tracking.trim() && !had.has(s.tracking.trim()) && Array.isArray(s.proofs) && (!s.pickup || pickupOk)
  );
}

/** รวมรอบแบ่งส่ง: ของเดิมคงไว้ทั้งหมด + รอบใหม่ต่อท้าย (ฝ่ายแพ็คลบ/แก้รอบเก่าไม่ได้) */
function appendShipments(existing: Order, incoming: Order): Shipment[] | undefined {
  const add = newShipmentsOf(existing, incoming);
  if (!add.length) return existing.shipments;
  return [...(existing.shipments ?? []), ...add];
}

export const runtime = "nodejs";

/**
 * 🕒 กันหน้าจอ "ค้าง" เขียนทับงานของคนอื่น
 * ทุกคำขอบันทึกส่งออเดอร์ "ทั้งก้อน" จากหน้าจอของตัวเอง — ถ้าหน้านั้นเปิดค้างไว้ (โพลลิงหยุดตอนเคอร์เซอร์อยู่ในช่องกรอก ·
 * เปิดใบเดียวกัน 2 หน้าต่าง · สถานีแพ็คที่ช่องยิง QR โฟกัสตลอด) ก้อนที่ส่งมาคือของเก่า → ติ๊กที่คนอื่นเพิ่งกด
 * (เช่น ✅ กราฟฟิกอ่านรายละเอียดแล้ว) หายเงียบ ๆ ทั้งที่ log ยังอยู่ (OD-260908-1902 / OD-260908-1744 · 9 ก.ย. 69)
 *
 * วิธีกัน: เซิร์ฟเวอร์ประทับ savedAt ทุกครั้งที่บันทึก · หน้าจอส่ง savedAt ที่ตัวเองถือกลับมา (= "เห็นข้อมูลถึงตอนไหน")
 *   · ฟิลด์ประทับเวลา (graphicAck/noProof/sampleRequired/samplePacked/noteAck/arrival) ที่ในฐานมี at ใหม่กว่า savedAt ของหน้าจอ
 *     = หน้าจอนั้นยังไม่เคยเห็น → คงของในฐาน (ติ๊ก/ยกเลิกทับไม่ได้จนกว่าจะได้ค่าล่าสุด — โพลลิง 15 วิ/รับค่ากลับหลังบันทึก)
 *   · ติ๊กที่เพิ่งเกิด ประทับ at ด้วยนาฬิกาเซิร์ฟเวอร์ (นาฬิกาเครื่องพนักงานเชื่อไม่ได้ เทียบกับ savedAt ไม่ตรง)
 *   · แบบงานที่อัปหลัง savedAt ของหน้าจอ แล้วไม่อยู่ในชุดที่ส่งมา = หน้าจอยังไม่เคยเห็น → เติมกลับ (ไม่ใช่การลบ)
 *   · log รวม 2 ฝั่งแบบไม่ซ้ำ ไม่มีใครทับประวัติของอีกฝ่าย
 * หน้าจอที่ไม่มี savedAt (ใบเก่า/หน้าที่ไม่ได้รับค่ากลับ) ถือว่าเห็นถึง "" = คงของในฐานทุกตัว
 */
type Stamp = { by: string; at: string };
// reuseArt (♻️ ใช้ไฟล์เก่า) มี by/at เหมือนกัน — แก้เลขใบเดิม/หมายเหตุ = ค่าต่าง → ประทับเวลาใหม่ตามกติกาเดียวกัน
const STAMPED = ["graphicAck", "noProof", "sampleRequired", "samplePacked", "noteAck", "arrival", "reuseArt"] as const;
type StampedKey = (typeof STAMPED)[number];
type Stamped = Record<StampedKey, Stamp | undefined>;

/** เทียบว่าเป็นติ๊กเดียวกันไหมโดยไม่ดู at (หน้าจอที่เพิ่งติ๊กยังถือ at นาฬิกาเครื่องตัวเอง ต่างจากที่เซิร์ฟเวอร์ประทับ) */
function sameStamp(a: Stamp, b: Stamp): boolean {
  return JSON.stringify({ ...a, at: 0 }) === JSON.stringify({ ...b, at: 0 });
}

function pickStamp<T extends Stamp>(cur: T | undefined, inc: T | undefined, clientSavedAt: string, now: string): T | undefined {
  if (cur && cur.at > clientSavedAt) return cur; // เกิดหลังจากที่หน้าจอนี้เห็นล่าสุด → หน้าจอนี้ยังไม่รู้ ห้ามทับ
  if (!inc) return undefined; // หน้าจอเห็นแล้วและตั้งใจยกเลิก
  if (cur && sameStamp(cur, inc)) return cur; // ยังติ๊กอยู่เหมือนเดิม → คงคน/เวลาที่ติ๊กครั้งแรก
  return { ...inc, at: now }; // ติ๊กใหม่/แก้ค่า → เวลาเซิร์ฟเวอร์
}

/** แบบงาน: รูปใหม่ที่หน้าจอส่งมาประทับเวลาเซิร์ฟเวอร์ · รูปในฐานที่อัปหลังหน้าจอเห็นล่าสุดแต่ไม่อยู่ในชุดที่ส่ง → เติมกลับ */
function reconcileProofs(cur: Proof[], inc: Proof[] | undefined, clientSavedAt: string, now: string): Proof[] | undefined {
  const known = new Set(cur.map((p) => p.url));
  const sent = new Set((inc ?? []).map((p) => p.url));
  const unseen = cur.filter((p) => !sent.has(p.url) && p.at > clientSavedAt);
  if (!inc && !unseen.length) return inc;
  const list = (inc ?? []).map((p) => (known.has(p.url) ? p : { ...p, at: now }));
  return unseen.length ? [...list, ...unseen] : list;
}

/** รายการเดียว: เอาค่าที่หน้าจอส่งมา (inc) เป็นหลัก แต่ติ๊ก/แบบงานที่หน้าจอยังไม่เคยเห็นต้องไม่หาย */
function reconcileItem(cur: OrderItem | undefined, inc: OrderItem, clientSavedAt: string, now: string): OrderItem {
  if (!cur) return inc;
  const out: OrderItem = { ...inc };
  const c = cur as unknown as Stamped;
  const i = inc as unknown as Stamped;
  const o = out as unknown as Stamped;
  for (const k of STAMPED) o[k] = pickStamp(c[k], i[k], clientSavedAt, now);
  const proofs = reconcileProofs(proofsOf(cur), inc.proofs, clientSavedAt, now);
  if (proofs) out.proofs = proofs;
  // 🧑‍⚖️ ผลตรวจของลูกค้า (review ต่อรูป · proofStatus ทั้งรายการ) ที่หน้าจอนี้ยังไม่เคยเห็น → คงของฐาน (OD-260915-5892)
  return keepCustomerVerdict(cur, out, clientSavedAt);
}

/**
 * รายการที่ส่งมาคือรายการเดิมในฐานไหม (จับคู่ตามลำดับ+ชื่อ) — แอดมินแก้ชื่อรายการในหน้าออเดอร์ได้ (11 ก.ย. 69)
 * หน้าจอส่งชื่อเดิมมาใน nameWas → ยังนับเป็นรายการเดิม ไม่งั้นติ๊ก/แบบงานที่คนอื่นเพิ่งทำจะหายเพราะถูกมองเป็นรายการใหม่
 */
function sameLine(cur: OrderItem | undefined, inc: OrderItem | undefined): cur is OrderItem {
  return !!cur && !!inc && (cur.name === inc.name || (typeof inc.nameWas === "string" && cur.name === inc.nameWas));
}

/** ลายนิ้วมือของรายการ — สิ่งที่ไม่เปลี่ยนตอนย้ายลำดับ (สินค้า + ตัวเลือก + ลายที่แนบ) ไว้แยกรายการชื่อซ้ำกัน */
const itemPrint = (it: OrderItem) => JSON.stringify([it.productId, it.selections ?? null, it.artworkUrls ?? null]);

/**
 * ↕️ หาว่ารายการที่ส่งมาแต่ละตัวคือรายการไหนในฐาน (18 ก.ย. 69 — หน้าออเดอร์ย้ายลำดับรายการได้แล้ว)
 * เดิมจับคู่ตามตำแหน่งอย่างเดียว → สลับรายการ "ชื่อเดียวกัน" 2 ตัว = ติ๊ก/แบบงานของอีกตัวถูกเอามาเทียบ แบบงานโดนประทับเวลาใหม่
 * รอบแรก: ชื่อตรง + ลายนิ้วมือตรง (ตำแหน่งเดิมก่อน แล้วค่อยหาตำแหน่งอื่น) · รอบสอง: ที่เหลือใช้ตำแหน่งเดิมตามกติกาเก่า (sameLine ตัดสินต่อ)
 */
function matchExistingItems(existing: OrderItem[], incoming: OrderItem[]): (OrderItem | undefined)[] {
  const used = new Set<number>();
  const out: (OrderItem | undefined)[] = incoming.map(() => undefined);
  const exact = (j: number, inc: OrderItem) => !used.has(j) && sameLine(existing[j], inc) && itemPrint(existing[j]) === itemPrint(inc);
  incoming.forEach((inc, i) => {
    const j = exact(i, inc) ? i : -1;
    if (j < 0) return;
    used.add(j);
    out[i] = existing[j];
  });
  incoming.forEach((inc, i) => {
    if (out[i]) return;
    const j = existing.findIndex((_, k) => exact(k, inc));
    if (j < 0) return;
    used.add(j);
    out[i] = existing[j];
  });
  incoming.forEach((_, i) => {
    if (!out[i] && !used.has(i)) out[i] = existing[i];
  });
  return out;
}

/**
 * แอดมินสิทธิ์เต็ม: ก้อนที่ส่งมาคือของจริงทั้งใบ ยกเว้น
 *   · ช่องที่หน้าจอ "ไม่ได้แก้" (header x-changed-keys) → เอาจากฐาน (ดู order-merge.ts) — หน้าจอค้างทับงานคนอื่นไม่ได้
 *   · ติ๊ก/แบบงานที่หน้าจอนั้นยังไม่เคยเห็น (จับคู่รายการตามลำดับ+ชื่อ/ชื่อเดิม) — ใช้เมื่อหน้าจอแก้ items เอง
 *   · เรื่องเงินที่ใหม่กว่าที่หน้าจอเห็น (order-money-guard) — ชั้นสองเผื่อหน้าจอบอกว่า "แก้" ทั้งที่ค้าง
 */
function reconcileFullEdit(existing: Order, incoming: Order, clientSavedAt: string, now: string, changed: Set<string> | null): { order: Order; keptMoney: string[]; restored: string[] } {
  // items: หน้าจอไม่ได้แตะ (มี header และไม่มี "items") → ชุดในฐานทั้งดุ้น รวมของที่ลูกค้าเพิ่ง append/กราฟฟิกเพิ่งอัป
  const itemsUntouched = !!changed && !changed.has("items");
  const curOf = itemsUntouched ? [] : matchExistingItems(existing.items ?? [], incoming.items ?? []);
  const items = itemsUntouched
    ? existing.items
    : (incoming.items ?? []).map((inc, i) => {
        const cur = curOf[i];
        const clean: OrderItem = { ...inc };
        delete clean.nameWas; // ชื่อเดิมใช้จับคู่ในคำขอนี้เท่านั้น — ไม่เก็บลงฐาน
        return sameLine(cur, inc) ? reconcileItem(cur, clean, clientSavedAt, now) : clean;
      });
  // ของแถม: ผลตรวจแบบของลูกค้าบนของแถมก็ทับไม่ได้เช่นกัน (จับคู่ตาม promoId) — ช่องอื่นของของแถมยังเป็นของหน้าจอ
  const gifts = Array.isArray(incoming.gifts)
    ? incoming.gifts.map((g) => keepCustomerVerdict(existing.gifts?.find((x) => x.promoId === g.promoId), g, clientSavedAt))
    : incoming.gifts;
  // ฟิลด์ที่เซิร์ฟเวอร์เป็นเจ้าของ — หน้าจอแอดมินไม่รู้จัก ส่งก้อนกลับมาโดยไม่มี = ห้ามหาย
  const withItems: Order = { ...incoming, items, ...(gifts ? { gifts } : {}), balanceNotified: existing.balanceNotified, balancePending: existing.balancePending };
  // 🧭 ช่องอื่นที่ไม่ได้แก้ → ของฐาน (items จัดการไปแล้วด้านบน จึงบอกว่า "แก้" เพื่อไม่ให้ทับซ้ำ)
  const { order: merged, restored } = applyChangedKeys(existing, withItems, changed ? new Set([...changed, "items"]) : null);
  // 💰 เงินเข้า/สลิปที่เกิดหลังจากหน้าจอนี้เห็นล่าสุด = หน้าจอยังไม่รู้ → คงของในฐาน (ดู keepServerMoney)
  const { order, kept } = keepServerMoney(existing, merged, clientSavedAt);
  return { order, keptMoney: kept, restored: itemsUntouched && JSON.stringify(existing.items) !== JSON.stringify(incoming.items) ? ["items", ...restored] : restored };
}

/** รวมประวัติ 2 ฝั่งแบบไม่ซ้ำ เรียงตามเวลา — หน้าจอค้างส่ง log สั้นกว่าก็ไม่ทับรายการที่คนอื่น/เซิร์ฟเวอร์เพิ่งลง */
function mergeLogs(...lists: (LogEntry[] | undefined)[]): LogEntry[] {
  const seen = new Set<string>();
  const out: LogEntry[] = [];
  for (const e of lists.flatMap((l) => l ?? [])) {
    const k = `${e.at}|${e.by}|${e.action}|${e.detail ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
}

/**
 * ฝ่ายแพ็คบันทึกได้เฉพาะงานแพ็ค — เอาออเดอร์เดิมจาก DB เป็นฐาน แล้วทับเฉพาะ:
 *   ผลตรวจนับ (proofs[].pack) · ยืนยันอ่าน (items[].noteAck) · ยืนยันใส่งานตัวอย่าง (items[].samplePacked)
 *   · ของยังไม่มา/ไม่ครบ (items[].arrival) · ยืนยันใส่ใบกำกับภาษี (taxInvoicePacked/taxInvoiceDelivery) · เลขพัสดุ + สถานะจัดส่ง · log
 * ฟิลด์อื่น (ราคา ที่อยู่ รายการ) ใช้ของเดิมทั้งหมด — กันแก้ทางอ้อม
 */
function mergePackFields(existing: Order, incoming: Order, mayShip: boolean): Order {
  const items = existing.items.map((it, i) => {
    const inc = incoming.items?.[i];
    if (!inc) return it;
    const proofs = proofsOf(it).map((p, j) => {
      const ip = (inc.proofs ?? [])[j];
      return ip?.pack ? { ...p, pack: ip.pack } : p;
    });
    return {
      ...it,
      proofs,
      noteAck: inc.noteAck ?? it.noteAck,
      samplePacked: inc.samplePacked ?? it.samplePacked,
      arrival: inc.arrival ?? it.arrival,
    };
  });

  const merged: Order = { ...existing, items };
  // 🏭 ติ๊ก "ส่งเข้าผลิตแล้ว" (คิวปริ้นแยกกอง) — ฝ่ายแพ็ค/น้องพิมพ์ติ๊กเองได้สำหรับใบที่ไม่ผ่านบอร์ดกราฟฟิก
  if ("productionSent" in incoming) merged.productionSent = incoming.productionSent;
  // 🧾 ยืนยันใส่ใบกำกับภาษีลงกล่อง + ทางส่งใบกำกับ (แนบกล่อง/อีเมล) — งานของโต๊ะแพ็ค
  if ("taxInvoicePacked" in incoming) merged.taxInvoicePacked = incoming.taxInvoicePacked;
  if ("taxInvoiceDelivery" in incoming) merged.taxInvoiceDelivery = incoming.taxInvoiceDelivery;
  // 🛒 รอของเข้า: ฝ่ายแพ็ค/ผลิตเป็นคนรับของ → กด "ของเข้าแล้ว" ได้อย่างเดียว (ติ๊ก/ยกเลิก/แก้โน้ต = งานแอดมิน)
  if (existing.needsPurchase && !existing.needsPurchase.arrivedAt && incoming.needsPurchase?.arrivedAt)
    merged.needsPurchase = { ...existing.needsPurchase, arrivedAt: incoming.needsPurchase.arrivedAt, arrivedBy: incoming.needsPurchase.arrivedBy };

  // เลขพัสดุ + เปลี่ยนสถานะเป็น "จัดส่งแล้ว" ทำได้เฉพาะคนที่มีสิทธิ์ยิงเลขพัสดุ
  if (mayShip && typeof incoming.tracking === "string") {
    merged.tracking = incoming.tracking;
    if (incoming.status === "จัดส่งแล้ว" && existing.status !== "เสร็จสิ้น") {
      merged.status = "จัดส่งแล้ว" as OrderStatus;
    }
  }
  // 🚚 แบ่งส่ง: รอบใหม่ต่อท้ายได้ (สิทธิ์ยิงเลขเดียวกัน) · รอบเดิมแตะไม่ได้ · สถานะใบไม่เปลี่ยน (ยังไม่ปิดจนกว่าจะยิงรอบสุดท้าย)
  if (mayShip && Array.isArray(incoming.shipments)) merged.shipments = appendShipments(existing, incoming);
  // 🏪 มารับเอง: กด "แพ็คเสร็จ" แทนยิงเลขพัสดุ → จดคน/เวลา + สถานะจัดส่งแล้ว (= พร้อมรับ) · สิทธิ์เดียวกับยิงเลข
  if (mayShip && incoming.packedAt && !existing.packedAt && isPickupOrder(existing)) {
    merged.packedAt = incoming.packedAt;
    if (incoming.status === "จัดส่งแล้ว" && existing.status !== "เสร็จสิ้น") merged.status = "จัดส่งแล้ว" as OrderStatus;
  }

  return merged; // log รวมกลางที่ PATCH (mergeLogs)
}

/**
 * ฝ่ายกราฟฟิก (proof.manage แต่ไม่มี orders.edit) บันทึกได้เฉพาะงานแบบ — เอาออเดอร์เดิมเป็นฐาน แล้วทับเฉพาะ:
 *   แบบงาน (items[].proofs ทั้งชุด — ลบ/แก้จำนวน/หน่วย/รายละเอียด/ใช้ลายเป็นแบบ) · สถานะแบบ (proofStatus/proofNote/proofMemo/proofUpdatedAt)
 *   · ติ๊กของกราฟฟิก (graphicAck · noProof · sampleRequired · samplePacked) · จำนวนต่อหน่วย (unitYield) · แบบของแถม (gifts[].proofs…) · log
 * ผลตรวจนับของฝ่ายแพ็ค (proofs[].pack) คงของเดิมไว้ตาม url — กราฟฟิกแตะไม่ได้
 * ฟิลด์อื่น (ราคา ที่อยู่ สถานะออเดอร์ เลขพัสดุ) ใช้ของเดิมทั้งหมด
 *
 * ⚠️ เดิมไม่มีทางนี้ — กราฟฟิกกด "ลบแบบ" แล้ว API ตอบ 403 เงียบ ๆ หน้าจอเหมือนลบได้ แต่รีเฟรช/อัปรูปใหม่รูปเดิมกลับมา
 */
function mergeProofFields(existing: Order, incoming: Order, clientSavedAt: string, now: string): Order {
  const items = existing.items.map((it, i) => {
    const inc = incoming.items?.[i];
    if (!inc) return it;
    const packByUrl = new Map(proofsOf(it).filter((p) => p.pack).map((p) => [p.url, p.pack]));
    const proofs = Array.isArray(inc.proofs)
      ? inc.proofs.map((p) => {
          const pack = packByUrl.get(p.url);
          return pack && !p.pack ? { ...p, pack } : p;
        })
      : it.proofs;
    const draft: OrderItem = {
      ...it,
      proofs,
      proofStatus: inc.proofStatus,
      proofNote: inc.proofNote,
      proofMemo: inc.proofMemo, // 📌 หมายเหตุถึงลูกค้า (โชว์ตอนลูกค้าเช็คแบบ) — กราฟฟิกพิมพ์เอง
      proofUpdatedAt: inc.proofUpdatedAt ?? it.proofUpdatedAt,
      graphicAck: inc.graphicAck,
      noProof: inc.noProof,
      sampleRequired: inc.sampleRequired,
      samplePacked: inc.samplePacked,
      reuseArt: inc.reuseArt, // ♻️ กราฟฟิกติ๊ก/ยกเลิก "ใช้ไฟล์เก่า" + เลขใบเดิมได้เอง
      unitYield: inc.unitYield ?? it.unitYield,
      // 🔢 จำนวนต่อลาย (ช่องใต้รูปในแผงลายจากลูกค้า 10 ก.ย. 69) — รับแผนที่ url→จำนวน แล้วสร้างข้อความ sel/selections เองจากฐาน
      // ไม่รับ sel/selections ทั้งก้อนจากกราฟฟิก (แก้ตัวเลือก/ราคาทางอ้อมไม่ได้) · แผนที่เท่าเดิม = ไม่แตะ
      ...(JSON.stringify(inc.artworkQty ?? null) !== JSON.stringify(it.artworkQty ?? null) ? withArtQtyMap(it, inc.artworkQty) : {}),
    };
    // ⚠️ หน้าจอกราฟฟิกที่ค้าง (เปิด 2 หน้าต่าง/เคอร์เซอร์ค้างในช่องกรอก) ส่ง graphicAck ว่าง = ติ๊กของอีกคนหาย → reconcileItem กันไว้
    return reconcileItem(it, draft, clientSavedAt, now);
  });

  const gifts = existing.gifts?.map((g) => {
    const inc = incoming.gifts?.find((x) => x.promoId === g.promoId);
    if (!inc) return g;
    return keepCustomerVerdict(
      g,
      {
        ...g,
        proofs: reconcileProofs(g.proofs ?? [], inc.proofs, clientSavedAt, now),
        proofStatus: inc.proofStatus,
        proofNote: inc.proofNote,
        proofUpdatedAt: inc.proofUpdatedAt ?? g.proofUpdatedAt,
      },
      clientSavedAt
    );
  });

  return {
    ...existing,
    items,
    ...(gifts ? { gifts } : {}),
    // 🏭 กราฟฟิกติ๊ก/ยกเลิก "ส่งเข้าผลิตแล้ว" เองได้ (ใบที่ไม่ผ่านบอร์ด TP)
    ...("productionSent" in incoming ? { productionSent: incoming.productionSent } : {}),
  }; // log รวมกลางที่ PATCH (mergeLogs)
}

/**
 * แอดมินดึงออเดอร์ (ใหม่→เก่า)
 *   /api/admin/orders          = ทั้งหมด (หน้ารายการ · หน้าสแกน · ใบงาน) — ไม่เซ็นลิงก์สลิป
 *   /api/admin/orders?id=XXXX  = ออเดอร์เดียว (หน้ารายละเอียด) — เซ็นลิงก์สลิปให้ดูรูปได้
 *   /api/admin/orders?lite=1   = ทั้งหมดแบบเบา (เฉพาะฟิลด์ที่หน้ารายละเอียดต้องใช้)
 *
 * เดิมเซ็นลิงก์สลิป "ทุกใบ" ทุกครั้งที่เรียก (หน้ารายการถามซ้ำทุก 15 วิ) = ยิง Storage ทีละใบ
 * วัดจริง 21 ออเดอร์: ดึงข้อมูลเปล่า ~300 ms แต่ผ่าน API ~890 ms — ส่วนต่างคือการเซ็นลิงก์
 * หน้ารายการใช้แค่ป้าย 📎 ซึ่งดูจาก slipPath ได้อยู่แล้ว จึงไม่ต้องเซ็น
 */
/**
 * ออเดอร์เวอร์ชันเบา — เฉพาะฟิลด์ที่หน้ารายละเอียดต้องใช้กับ "ออเดอร์ทั้งตาราง":
 * หาออเดอร์อื่นของลูกค้าคนเดียวกัน (id/status/phone) และเดาห้องแชท/LINE จากใบเก่า (lineChatOf/lineUserOf)
 * ตัด items/ประวัติ/ที่อยู่ ฯลฯ ทิ้ง — ก้อนใหญ่ที่หน้านั้นไม่ได้ใช้เลย
 *
 * ตัดจากก้อนในความจำ (21 ก.ย. 69) — เดิมสั่ง Postgres ตัดให้ด้วย jsonb projection (`data->>customer` ฯลฯ)
 * ซึ่งดูเหมือนเบาแต่ฐานต้องแกะ jsonb ทุกใบออกจาก TOAST มาอ่านทุกครั้ง = ตัวกิน Disk IO
 * ก้อนที่ส่งออกเท่าเดิม (วัดจริง 66 ใบ: ทั้งก้อน 137 KB → เบา 16 KB) แต่ฐานไม่ต้องทำงานเลย
 */
const liteOf = (o: Order) => ({
  id: o.id,
  customer: o.customer,
  phone: o.phone,
  email: o.email,
  customerId: o.customerId,
  status: o.status,
  date: o.date,
  lineChatUrl: o.lineChatUrl,
  lineUserId: o.lineUserId,
  lineProfile: o.lineProfile,
  items: [],
});

/** บรรทัด log ที่หน้ารายการยังต้องใช้ — ต้องตรงกับเงื่อนไขใน paidTotalEverConfirmed (admin-data.ts) ไม่งั้นยอดค้างใบเก่าเพี้ยน */
const listKeepsLog = (l: { action: string }) =>
  l.action === "เปลี่ยนสถานะ" || l.action.startsWith("นับว่าชำระครบ") || l.action.includes("ยืนยันการชำระเงิน");

/**
 * 🐢 ความจำออเดอร์ทั้งตารางต่อ instance (18 ก.ย. 69 · ขยายให้ทุกหน้าใช้ร่วมกัน 21 ก.ย. 69)
 *
 * เดิมมีเฉพาะหน้ารายการ ส่วนหน้าอื่น (ภาพรวม/คิวปริ้น/สแกน/บอร์ดกราฟฟิก/ตัวอย่าง/ใบงาน) ขนทุกใบจาก Supabase ใหม่ทุกครั้ง
 * = Postgres ต้องแกะ jsonb ทุกใบออกจาก TOAST ทุกรอบ → กิน Disk IO จน Supabase ส่งเมลเตือน (21 ก.ย. 69)
 *
 * ทางนี้ขอจากฐานแค่ 2 อย่าง: ใบที่ savedAt ใหม่กว่าเข็ม (ดัชนี orders_saved_at_idx) + เลขใบทุกใบ (ตัดใบที่ถูกลบ)
 * แล้วปะเข้าก้อนเดิม — ความถูกต้องเท่ากับโพล &since= ที่หน้ารายการใช้อยู่ก่อนแล้ว
 *
 * ⚠️ เก็บ log **ครบ** เสมอ (หน้าอื่นเอาไปบันทึกกลับ) การตัด log ให้หน้ารายการทำตอนตอบเท่านั้น
 * ⚠️ การเขียนที่ไม่ผ่านประตู (สคริปต์แก้ฐานตรง ๆ) ไม่ขยับ savedAt → ทุก ALL_MEMO_TTL โหลดเต็มใหม่ 1 ครั้งกันค้างยาว
 */
const ALL_MEMO_TTL = 3 * 60_000;
let allMemo: { orders: Order[]; at: string; fullAt: number; gen: number } | null = null;
/** เลขรุ่นของก้อน — ขยับทุกครั้งที่โหลดเต็มใหม่จากฐาน ใช้บอกหน้าเว็บว่า "ของที่ถืออยู่เทียบกันไม่ได้แล้ว ต้องรับก้อนใหม่" */
let allGen = 0;

type SB = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type LoadedOrders =
  | { orders: Order[]; at: string; gen: number; error?: never }
  | { orders?: never; at?: never; gen?: never; error: { code?: string; message: string } };

/** ออเดอร์ทุกใบ (ใหม่→เก่า · log ครบ) — ผ่านความจำก้อนข้างบน */
async function loadAllOrders(sb: SB): Promise<LoadedOrders> {
  const memo = allMemo;
  if (memo && Date.now() - memo.fullAt <= ALL_MEMO_TTL) {
    const at = new Date().toISOString();
    const sinceIso = new Date(Date.parse(memo.at) - 60_000).toISOString(); // ถอย 60 วิ กันนาฬิกาเหลื่อมระหว่าง instance
    const [delta, ids] = await Promise.all([
      sb.from("orders").select("data").gt("data->>savedAt", sinceIso),
      sb.from("orders").select("id").order("created_at", { ascending: false }),
    ]);
    if (!delta.error && !ids.error) {
      const byId = new Map(memo.orders.map((o) => [o.id, o]));
      for (const r of delta.data ?? []) {
        const o = r.data as Order;
        byId.set(o.id, o);
      }
      // เรียงตาม created_at ของฐาน (จากคิวรี ids) · ใบที่ไม่อยู่ใน ids = ถูกลบ · ใบใน ids ที่ไม่มีข้อมูล = ผิดคาด → โหลดเต็ม
      const orders: Order[] = [];
      let complete = true;
      for (const r of ids.data ?? []) {
        const o = byId.get(r.id as string);
        if (!o) {
          complete = false;
          break;
        }
        orders.push(o);
      }
      if (complete) {
        allMemo = { orders, at, fullAt: memo.fullAt, gen: memo.gen };
        return { orders, at, gen: memo.gen };
      }
    }
  }
  const at = new Date().toISOString();
  const { data, error } = await sb.from("orders").select("data").order("created_at", { ascending: false });
  if (error) return { error };
  const orders = (data ?? []).map((r) => r.data as Order);
  const gen = ++allGen;
  allMemo = { orders, at, fullAt: Date.now(), gen };
  return { orders, at, gen };
}

/** ตารางยังไม่ถูกสร้าง → บอกให้รัน SQL (ไม่ถือเป็น error ร้ายแรง) */
const isMissingTable = (e: { code?: string; message: string }) =>
  e.code === "42P01" || e.code === "PGRST205" || /schema cache|does not exist/i.test(e.message);

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ orders: [] });
  // 📱 มาจาก QR บนใบงาน → พนักงานที่ล็อกอินอยู่เปิดดูใบนี้ได้ แม้แผนกตัวเองไม่มีสิทธิ์ดูออเดอร์
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  const scanned = req.headers.get(PACK_SCAN_HEADER) === "1";
  if (!canPack(actor, "orders.view", await loadRolePerms(), scanned))
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้" }, { status: 403 });

  const url = new URL(req.url);
  const wantId = url.searchParams.get("id");
  const lite = url.searchParams.get("lite") === "1";

  // ── ขอทั้งตาราง (ทุกหน้ายกเว้นหน้ารายละเอียด) — ผ่านความจำก้อนเดียวกันหมด ──
  if (!wantId) {
    const got = await loadAllOrders(sb);
    if (got.error) {
      if (isMissingTable(got.error)) return NextResponse.json({ orders: [], needsSetup: true });
      return NextResponse.json({ error: got.error.message, orders: [] }, { status: 500 });
    }
    const all = got.orders;

    // โหมดเบา — หน้ารายละเอียดขอตารางทั้งหมดไว้ทำแค่ 2 อย่าง (ออเดอร์อื่นของลูกค้าคนเดียวกัน + เดาห้องแชท
    // LINE จากใบเก่า) ส่งทั้งก้อนไปเปลืองเปล่า ๆ · items:[] ใส่ไว้ให้โค้ดฝั่งหน้าเว็บที่วนรายการไม่พัง
    if (lite) return NextResponse.json({ orders: all.map(liteOf) });

    /**
     * 🐢 โหมดหน้ารายการ (?list=1 · 18 ก.ย. 69) — เดิมหน้า /admin/orders ขอทุกใบทั้งก้อน 4.2 MB ทุก 15 วิ
     *   · log ถูกตัดเหลือเฉพาะบรรทัดที่ paidTotalEverConfirmed อ่าน (log กิน ~44% ของก้อน ลิสต์ไม่ได้โชว์)
     *   · &since=ISO = เฉพาะใบที่ savedAt ใหม่กว่า (โพล 15 วิ) + ids ทุกใบไว้ให้หน้าเว็บตัดใบที่ถูกลบ
     *     savedAt ประทับที่ประตูเขียนออเดอร์ทุกทาง (order-write.ts) จึงใช้เป็นเข็มได้
     */
    if (url.searchParams.get("list") === "1") {
      const slimOf = (o: Order) => (o.log?.length ? { ...o, log: o.log.filter(listKeepsLog) } : o);
      const since = url.searchParams.get("since");
      if (since && Number.isFinite(Date.parse(since))) {
        const cut = new Date(since).toISOString();
        const changed = all.filter((o) => (o.savedAt ?? "") > cut);
        return NextResponse.json({ orders: changed.map(slimOf), at: got.at, ids: all.map((o) => o.id) });
      }
      return NextResponse.json({ orders: all.map(slimOf), at: got.at });
    }

    /**
     * 🪶 โพลแบบ "ถามก่อนว่าเปลี่ยนไหม" (21 ก.ย. 69) — หน้าที่เหลือ (ภาพรวม/คิวปริ้น/สแกน/บอร์ดกราฟฟิก/ตัวอย่าง)
     * ขอทั้งก้อน 4 MB ทุก 15-30 วิ ทั้งที่ส่วนใหญ่ไม่มีอะไรเปลี่ยน · หน้าเว็บส่งตราประทับที่ถืออยู่มาด้วย (?stamp=)
     * ไม่มีใบไหน savedAt ใหม่กว่า + จำนวนใบเท่าเดิม + รุ่นก้อนเดียวกัน → ตอบ unchanged ตัวเดียว หน้าเว็บใช้ของเดิมต่อ
     * (รุ่นก้อนขยับทุก 3 นาทีตอนโหลดเต็ม = การแก้ฐานตรง ๆ ที่ไม่ขยับ savedAt อย่างช้าก็ถึงจอใน 3 นาที)
     */
    const stamp = `${got.gen}@${got.at}`;
    const asked = url.searchParams.get("stamp");
    if (asked) {
      const [askedGen, askedAt] = asked.split("@");
      const same =
        Number(askedGen) === got.gen &&
        !!askedAt &&
        Number.isFinite(Date.parse(askedAt)) &&
        Number(url.searchParams.get("n")) === all.length &&
        !all.some((o) => (o.savedAt ?? "") > askedAt);
      if (same) return NextResponse.json({ unchanged: true, at: stamp });
    }
    return NextResponse.json({ orders: all, at: stamp });
  }

  // ── ออเดอร์เดียว (หน้ารายละเอียด) — คิวรีด้วย primary key ไม่ผ่านความจำก้อน ต้องสดเสมอ ──
  const { data, error } = await sb.from("orders").select("data").eq("id", wantId);
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ orders: [], needsSetup: true });
    return NextResponse.json({ error: error.message, orders: [] }, { status: 500 });
  }

  const orders = (data ?? []).map((r) => r.data as Order);
  // 🩹 เงินครบตามสลิปแล้วแต่ใบยังค้าง "รอตรวจสอบ" (ผลตรวจถูกลงย้อนหลังตอนซ่อมยอด) → ปิดใบให้เองตอนเปิดหน้าออเดอร์
  //    เงื่อนไขแคบมาก ดู settleCreditedOrder · ล้มก็แค่โชว์ใบเดิม (OD-260915-1705 · 16 ก.ย. 69)
  if (wantId && orders[0]) {
    try {
      const healed = await settleCreditedOrder({ sb, order: orders[0], origin: new URL(req.url).origin });
      if (healed) orders[0] = healed;
    } catch (e) {
      console.warn("[orders GET] settleCreditedOrder", e instanceof Error ? e.message : e);
    }
  }
  // เซ็น signed URL ชั่วคราวสำหรับสลิปใน bucket ส่วนตัว — เฉพาะตอนขอออเดอร์เดียว (หน้ารายละเอียด)
  // ⚠️ ทั้งสามงาน (เช็ค LINE ของบัญชีลูกค้า · เซ็นสลิปงวดแรก · เซ็นสลิปงวดหลัง) ไม่เกี่ยวกัน
  //    ทำขนานกันเสมอ — เดิมทำเรียงกันทำให้หน้ารายละเอียดรอนานโดยไม่จำเป็น
  if (wantId) {
    // สลิปทุกใบ (ใบแรก · งวดหลังของใบมัดจำ · ใบเพิ่ม payments[]) — เซ็นขนานกันใน signPaymentUrls · ชั่วคราว ไม่ persist
    const signSlip = async () => {
      await Promise.all(
        orders.map(async (o, i) => {
          orders[i] = await signPaymentUrls(sb, o);
        })
      );
    };
    const signBalance = async () => undefined;
    // LINE ของบัญชีที่ล็อกอินตอนสั่ง — ให้หน้าออเดอร์เทียบกับที่พนักงานผูก (ชั่วคราว ไม่ persist)
    const fillLoginLine = async () => {
      await Promise.all(
        orders
          .filter((o) => o.customerId)
          .map(async (o) => {
            try {
              const { data: u } = await sb.auth.admin.getUserById(o.customerId!);
              const meta = u?.user?.user_metadata as
                | { line_user_id?: string; full_name?: string; name?: string }
                | undefined;
              if (meta?.line_user_id) o.loginLine = { userId: meta.line_user_id, name: meta.full_name || meta.name };
            } catch {
              /* ไม่มีก็ข้าม */
            }
          })
      );
    };
    await Promise.all([fillLoginLine(), signSlip(), signBalance()]);
  }
  return NextResponse.json({ orders });
}

/** แอดมินสร้างออเดอร์ใหม่จากหลังบ้าน (ออเดอร์เปล่า — ไปกดเพิ่มรายการพิเศษต่อในหน้าออเดอร์) */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("orders.edit");
  if (gate.res) return gate.res;

  // หน้าเว็บถามชื่อ (หรือเบอร์) ลูกค้าก่อนเสมอ แล้วค่อยเรียกมาสร้าง — ที่เหลือ (รายการ/ที่อยู่) ไปเติมในหน้าออเดอร์
  let body: {
    customerName?: string;
    phone?: string;
    address?: string;
    /** ผู้ติดต่อที่เลือกจากคลังตอนกรอกชื่อ — ผูกตั้งแต่ออเดอร์แรก แต้มจะได้เข้าคนถูก */
    contactId?: string;
    shipping?: string;
    shippingCost?: number;
    /** 🛒 แอดมินติ๊ก "รอของเข้า / ต้องสั่งของ" มาตั้งแต่ตอนสร้าง */
    needsPurchase?: { note?: string } | null;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* ไม่ส่ง body มาก็ได้ */
  }

  const now = new Date();
  const id = `OD-${bkkYmd(now)}-${Math.floor(1000 + Math.random() * 9000)}`;
  const by = gate.actor.name?.trim() || gate.actor.username;
  let order: Order = {
    id,
    key: randomBytes(24).toString("base64url"),
    // ปล่อยว่างไว้ — หน้าจอทุกที่ fallback เป็น "ยังไม่ระบุชื่อ" ให้เอง (ช่องกรอกจะโชว์เป็นลายน้ำ ไม่ใช่ค่าจริง)
    customer: body.customerName?.trim() || "",
    phone: body.phone?.trim() || "",
    address: body.address?.trim() || "",
    date: thaiDateTime(now),
    payment: "โอนธนาคาร",
    shipping: body.shipping === "ส่งด่วน" ? "ส่งด่วน" : "ส่งธรรมดา",
    shippingCost: Math.max(0, Number(body.shippingCost) || 0),
    status: "รอชำระเงิน",
    items: [],
    placedBy: by,
    ...(body.contactId?.trim() ? { contactId: body.contactId.trim() } : {}),
    ...(body.needsPurchase ? { needsPurchase: needsPurchaseStamp(by, body.needsPurchase.note) } : {}),
  };
  order = withLog(order, by, "สร้างออเดอร์จากหลังบ้าน", "งานพิเศษ/สั่งแทนลูกค้า");
  if (order.needsPurchase) order = withLog(order, by, "🛒 ติ๊กรอของเข้า — ต้องสั่งของก่อนผลิต", order.needsPurchase.note);

  const { error } = await insertOrder(sb, order, by);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id });
}

/** แอดมินอัปเดตออเดอร์ (เปลี่ยนสถานะ ฯลฯ) — ส่ง Order เต็มมา */
export async function PATCH(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });

  // แอดมิน (orders.edit) → บันทึกได้เต็ม · ฝ่ายแพ็ค (pack.check/pack.ship) → บันทึกได้เฉพาะงานแพ็ค · กราฟฟิก (proof.manage) → เฉพาะงานแบบ
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "ต้องล็อกอินก่อน" }, { status: 401 });
  // ใช้ชุดสิทธิ์ที่แอดมินแก้เอง (ตั้งค่าระบบ → แท็บบทบาท) ให้ตรงกับที่หน้าจอเห็น
  const rolePerms = await loadRolePerms();
  // 📱 เปิดหน้าออเดอร์จาก QR บนใบงาน → ยืมสิทธิ์งานแพ็คให้พนักงานคนไหนก็ได้ที่ล็อกอินอยู่
  const scanned = req.headers.get(PACK_SCAN_HEADER) === "1";
  const mayEditFull = can(actor, "orders.edit", rolePerms);
  const mayPack = canPack(actor, "pack.check", rolePerms, scanned) || canPack(actor, "pack.ship", rolePerms, scanned);
  // ฝ่ายกราฟฟิก → บันทึกได้เฉพาะฟิลด์งานแบบ (ดู mergeProofFields)
  const mayProof = can(actor, "proof.manage", rolePerms);
  if (!mayEditFull && !mayPack && !mayProof) {
    return NextResponse.json({ error: "บัญชีนี้ไม่มีสิทธิ์แก้ไขออเดอร์" }, { status: 403 });
  }
  /**
   * 💰 ยืนยันเงินเข้า = สิทธิ์แยกต่างหาก (orders.markPaid)
   * ค่าเริ่มต้นมีแต่เจ้าของร้าน + พนักงานที่เปิดสิทธิ์ให้เป็นรายคนที่หน้า /admin/staff
   */
  const mayMarkPaid = can(actor, "orders.markPaid", rolePerms);

  let order: Order;
  try {
    order = (await req.json()) as Order;
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  if (!order?.id) return NextResponse.json({ error: "ไม่มีเลขออเดอร์" }, { status: 400 });
  const now = new Date().toISOString();
  // 🕒 หน้าจอเห็นข้อมูลถึงตอนไหน (savedAt ที่ถือมา) — ไม่มี = ถือว่าเก่าสุด ห้ามทับติ๊ก/แบบที่คนอื่นทำไว้
  const clientSavedAt = typeof order.savedAt === "string" ? order.savedAt : "";
  // 🧭 ช่องที่หน้าจอแก้จริง (หน้าออเดอร์ส่งมา) — ไม่มี = หน้าจอเก่า/หน้าอื่น ทำแบบเดิม
  const changedKeys = parseChangedKeys(req.headers.get(CHANGED_KEYS_HEADER));

  // ดึงออเดอร์เดิม — ฝ่ายแพ็คใช้เป็นฐาน merge · ทุกคนใช้เทียบสถานะเก่าเพื่อแจ้งเตือน
  const { data: row, error: gErr } = await sb.from("orders").select("data").eq("id", order.id).single();
  if (gErr || !row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const existing = row.data as Order;
  const oldStatus = existing.status;

  // มีการ "ยิงเลขพัสดุใหม่" ในคำขอนี้ไหม (ใช้ตัดสินเรื่องด่านตรวจ)
  const wantsTracking =
    typeof order.tracking === "string" && order.tracking.trim() !== "" && order.tracking.trim() !== (existing.tracking ?? "");
  // 🏪 มารับเอง: กด "แพ็คเสร็จ" ในคำขอนี้ — ต้องผ่านด่านตรวจเหมือนยิงเลขพัสดุ (ของยังไม่ครบก็ปิดกล่องไม่ได้)
  const wantsPickupDone = isPickupOrder(existing) && !!order.packedAt && !existing.packedAt;

  /**
   * 📦 ส่งรวมกล่อง (lib/ship-with.ts) — ใบตามยิงเลขเองไม่ได้ (ของอยู่ในกล่องใบหลัก ยิงที่ใบหลักแล้วเลขลงมาเอง)
   * ใบหลักจะยิงเลข → ของใบตามต้องพร้อมลงกล่องด้วย: ฝ่ายแพ็คข้ามไม่ได้ · แอดมินข้ามได้แต่ลง log (กติกาเดียวกับด่านแพ็ค)
   */
  if (wantsTracking && isShipRider(existing))
    return NextResponse.json(
      { error: `ใบนี้ส่งรวมกล่องกับ ${shipMainIdOf(existing)} — ยิงเลขพัสดุที่ ${shipMainIdOf(existing)} ใบเดียว เลขจะลงใบนี้ให้เอง` },
      { status: 409 }
    );
  let shipRiders: Order[] = [];
  if (wantsTracking && isShipMain(existing)) {
    const { data: rr } = await sb.from("orders").select("data").in("id", shipRiderIdsOf(existing));
    shipRiders = (rr ?? []).map((r) => r.data as Order).filter((r) => isShipRider(r) && shipMainIdOf(r) === existing.id);
  }
  const ridersNotReady = shipRiders.map((r) => ({ id: r.id, why: riderNotReady(r) })).filter((r) => r.why.length);
  if (ridersNotReady.length && !mayEditFull)
    return NextResponse.json(
      { error: `ยังยิงเลขพัสดุไม่ได้ — ของที่ส่งรวมกล่องยังไม่พร้อม: ${ridersNotReady.map((r) => `${r.id} (${r.why.join(" · ")})`).join(" / ")}` },
      { status: 409 }
    );

  let toSave: Order;
  if (mayEditFull) {
    // ก้อนจากหน้าจอแอดมินเป็นหลัก แต่ติ๊ก/แบบงานที่หน้าจอนั้นยังไม่เคยเห็น (คนอื่นเพิ่งทำ) ต้องไม่หาย
    const full = reconcileFullEdit(existing, order, clientSavedAt, now, changedKeys);
    toSave = full.order;
    // ช่องที่หน้าจอไม่ได้แก้แต่ค่าต่างจากฐาน (= ทางอื่นเขียนไประหว่างหน้าเปิดค้าง) ถูกคงไว้ — จดไว้ให้ตรวจย้อนหลังได้ว่ากันอะไรไป
    if (full.restored.length)
      toSave = withLog(toSave, actor.name || actor.username, "กันหน้าจอค้างทับข้อมูล", `ช่องที่หน้าจอนี้ไม่ได้แก้ คงค่าในฐานไว้: ${full.restored.join(" · ")}`);
    /**
     * 👤 ชื่อ/เบอร์/ที่อยู่ลูกค้าเปลี่ยน → จดลง log เสมอ (18 ก.ย. 69 · OD-260917-6834 "ที่อยู่หายไปไหน" — ตามย้อนหลังไม่ได้เลย
     * เพราะช่องพวกนี้บันทึกตอน blur เงียบ ๆ ไม่มีร่องรอยว่าใครแก้/ลบเมื่อไหร่) · ค่าว่างก็จด — "ลบที่อยู่" คือเหตุการณ์ที่ต้องเห็น
     */
    const customerDiff = customerInfoChanges(existing, toSave);
    if (customerDiff) toSave = withLog(toSave, actor.name || actor.username, "แก้ข้อมูลลูกค้า/ที่อยู่", customerDiff);
    /**
     * 📅 วันใช้งาน/วันจัดส่ง/งานเร่งเปลี่ยน → จดลง log เช่นกัน (21 ก.ย. 69 · OD-260918-8582
     * พนักงานถามว่า "วันใช้งานนี้ใครใส่" แล้วตอบไม่ได้ เพราะช่องปฏิทินบันทึกเงียบ ๆ ไม่มีร่องรอย)
     */
    const scheduleDiff = scheduleChanges(existing, toSave);
    if (scheduleDiff) toSave = withLog(toSave, actor.name || actor.username, "แก้วันใช้งาน/วันจัดส่ง", scheduleDiff);
    /**
     * บันทึกจากหน้าจอที่ยังไม่เห็นเงินก้อนล่าสุด — ของในฐานถูกคงไว้ ต้องบอกให้รู้ ไม่ใช่เงียบ
     * (หน้าจอรับก้อนจากเซิร์ฟเวอร์กลับไปแสดงผลอยู่แล้ว ดู applyOrderFromServer — กดซ้ำจากค่าล่าสุดได้เลย)
     */
    if (full.keptMoney.length)
      toSave = withLog(
        toSave,
        actor.name || actor.username,
        "กันหน้าจอค้างทับข้อมูลการเงิน",
        `หน้าจอนี้ยังไม่เห็นเงินก้อนล่าสุด — คงค่าในฐานไว้: ${full.keptMoney.join(" · ")}`
      );
    // แอดมินยิงเลขทั้งที่ด่านตรวจยังไม่ครบ = อนุญาต (ตัดสินใจเอง) แต่บันทึก log ฝั่งเซิร์ฟเวอร์เสมอ — ตรวจย้อนหลังได้ว่าใครข้าม
    if (wantsTracking || wantsPickupDone) {
      const g = packGate(existing);
      if (!g.ready) {
        toSave = withLog(toSave, actor.name || actor.username, wantsPickupDone ? "⚠️ ข้ามด่านตรวจ — แพ็คเสร็จ (มารับเอง)" : "⚠️ ข้ามด่านตรวจ — ยิงเลขพัสดุ", gateReasons(g));
      }
    }
    // 🚚 แอดมินยิงรอบแบ่งส่งทั้งที่รูปที่เลือกยังตรวจไม่ครบ = อนุญาต แต่ลง log เหมือนข้ามด่านปกติ
    for (const sh of newShipmentsOf(existing, order)) {
      const pg = partialGate(existing, roundSel(existing, sh.proofs));
      if (!pg.ready)
        toSave = withLog(toSave, actor.name || actor.username, "⚠️ ข้ามด่านตรวจ — ส่งบางส่วน", `${sh.tracking} · ${pg.reasons.join(" · ")}`);
    }
  } else {
    toSave = existing;
    if (mayPack) {
      // ฝ่ายแพ็ค: ห้ามข้ามเด็ดขาด — เช็คด่านจากข้อมูลล่าสุด (รวมผลตรวจที่เพิ่งส่งมาในคำขอนี้)
      const mergedNoShip = mergePackFields(existing, order, false);
      if ((wantsTracking || wantsPickupDone) && !packGate(mergedNoShip).ready) {
        return NextResponse.json(
          { error: `${wantsPickupDone ? "ยังยืนยันแพ็คเสร็จไม่ได้" : "ยังยิงเลขพัสดุไม่ได้"} — ${gateReasons(packGate(mergedNoShip))}` },
          { status: 409 }
        );
      }
      // 🚚 รอบแบ่งส่ง: ตรวจเฉพาะรูปที่เลือกไปรอบนี้ — ฝ่ายแพ็คข้ามไม่ได้เช่นกัน
      for (const sh of newShipmentsOf(existing, order)) {
        const pg = partialGate(mergedNoShip, roundSel(mergedNoShip, sh.proofs));
        if (!pg.ready) return NextResponse.json({ error: `ยังส่งบางส่วนไม่ได้ — ${pg.reasons.join(" · ")}` }, { status: 409 });
      }
      toSave = mergePackFields(existing, order, canPack(actor, "pack.ship", rolePerms, scanned));
    }
    // กราฟฟิก (มีหรือไม่มีสิทธิ์แพ็คร่วมด้วยก็ได้) → ทับฟิลด์งานแบบต่อจากผลแพ็ค
    if (mayProof) toSave = mergeProofFields(toSave, order, clientSavedAt, now);
  }

  // 📦 ส่งรวมกล่อง: shipWith เป็นของเซิร์ฟเวอร์ (เขียนผ่าน /ship-with เท่านั้น) — หน้าจอที่เปิดค้างก่อนผูกต้องทับไม่ได้
  if (existing.shipWith) toSave = { ...toSave, shipWith: existing.shipWith };
  else if (toSave.shipWith) {
    const { shipWith: _sw, ...rest } = toSave;
    void _sw;
    toSave = rest as Order;
  }
  if (ridersNotReady.length)
    toSave = withLog(
      toSave,
      actor.name || actor.username,
      "⚠️ ข้ามด่านตรวจ — ของส่งรวมกล่องยังไม่พร้อม",
      ridersNotReady.map((r) => `${r.id}: ${r.why.join(" · ")}`).join(" / ")
    );

  // 🛒 ติ๊กส่งเข้าผลิตทั้งที่ใบยังรอของเข้า = อนุญาต (หน้าจอถามยืนยันแล้ว) แต่ลง log ฝั่งเซิร์ฟเวอร์เสมอ — ตรวจย้อนหลังได้ว่าใครส่ง
  if (toSave.productionSent && !existing.productionSent && orderAwaitingStock(toSave))
    toSave = withLog(toSave, actor.name || actor.username, "⚠️ ส่งเข้าผลิตทั้งที่ยังรอของเข้า", toSave.needsPurchase?.note);

  /**
   * 🏅 ส่วนลดระดับสมาชิกจากผู้ติดต่อที่ผูกไว้ — เซิร์ฟเวอร์เป็นเจ้าของ คิดใหม่ทุกครั้งที่แอดมินบันทึก
   * (ผูก/ยกเลิกผูกผู้ติดต่อ · เพิ่ม-ลบรายการ · แก้ราคา → ส่วนลดตามทันเสมอ กติกาเดียวกับใบเสนอราคา)
   * หน้าจอไม่มีช่องนี้ให้แก้ จึงไม่ต้องกลัวทับของที่แอดมินตั้งใจ — ส่วนลดที่ไม่มีธง tierId ตัวช่วยไม่แตะอยู่แล้ว
   */
  if (mayEditFull) {
    const beforeTier = toSave.discount;
    toSave = await syncOrderMemberTier(sb, toSave);
    if ((beforeTier?.tierId ?? "") !== (toSave.discount?.tierId ?? "") || (beforeTier?.amount ?? 0) !== (toSave.discount?.amount ?? 0)) {
      const who = actor.name?.trim() || actor.username;
      toSave = toSave.discount?.tierId
        ? withLog(toSave, who, "คิดส่วนลดระดับสมาชิก", `${toSave.discount.label} −${toSave.discount.amount.toLocaleString("th-TH")} บาท`)
        : withLog(toSave, who, "เอาส่วนลดระดับสมาชิกออก", beforeTier ? `${beforeTier.label} −${beforeTier.amount.toLocaleString("th-TH")} บาท` : "ไม่ได้ผูกผู้ติดต่อแล้ว");
    }
  }

  /**
   * ⚡ ส่วนลดโอนไว — รายการ/ราคาเปลี่ยนในคำขอนี้ (เพิ่มรายการพิเศษ · ตีราคา · แก้จำนวน) ให้กฎกลางคิดใหม่
   * ⚠️ ต้องคิด "ก่อน" บล็อกแจ้งยอดค้างทางไลน์ด้านล่าง ไม่งั้นไลน์บอกยอดเก่าที่ยังไม่หักส่วนลด (ยอดไลน์ต้องตรงเว็บเสมอ)
   * ประตูเขียนออเดอร์ (updateOrder) เรียกซ้ำอีกชั้นอยู่แล้ว — ได้ผลเท่าเดิม ไม่เขียน log ซ้ำ
   */
  if (mayEditFull && itemsChanged(existing, toSave))
    toSave = await syncOrderEarlyPay(sb, toSave, `แอดมิน ${actor.name?.trim() || actor.username}`);

  /**
   * 🧾 ฐานภาษีขยับในคำขอนี้ (แก้รายการ/ค่าส่ง/ส่วนลด) → VAT + หัก ณ ที่จ่าย คิดใหม่ตามเรต
   * ⚠️ ต้องคิด "ก่อน" บล็อกยอดค้าง/แจ้งไลน์ด้านล่าง ไม่งั้นไลน์ทวงลูกค้าด้วยยอดที่ยังมีภาษีของฐานเก่าติดอยู่
   * (OD-260915-1705 · 15 ก.ย. 69 — ดู reconcileOrderTax) · ประตูเขียนออเดอร์เรียกซ้ำอีกชั้น ไม่ลง log ซ้ำ
   */
  {
    const tax = reconcileOrderTax(existing, toSave);
    if (tax) toSave = withLog(tax.order, `แอดมิน ${actor.name?.trim() || actor.username}`, "คิดภาษีใหม่ตามยอดที่แก้", `${tax.note} (ยอดรวมต้องตรงบิลที่ออกให้ลูกค้า)`);
  }

  /**
   * 💬 ตีราคา/แก้ราคาบนใบที่ลูกค้าโอนมาแล้ว → ยอดโตขึ้น ต้องตามเก็บส่วนต่าง
   * ดึงสถานะกลับไป "รอชำระเงิน" เพื่อเปิดหน้าแจ้งโอนให้ลูกค้าโอนเฉพาะส่วนต่าง
   * (กติกาเดียวกับตอนลูกค้าสั่งเพิ่มในออเดอร์เดิม — /api/orders/append)
   *
   * ทำเฉพาะ: แอดมินสิทธิ์เต็ม · คำขอนี้ไม่ได้ตั้งใจเปลี่ยนสถานะเอง (เคารพสิ่งที่แอดมินเลือก)
   * · ใบที่ยังไม่เข้าไลน์ผลิต (เข้าผลิตแล้วดึงกลับ = ป่วนคิวงาน — ใบพวกนั้นพึ่งป้าย "ค้าง"
   *   ในลิสต์ + ด่านยิงเลขพัสดุแทน) · ใบมัดจำ/เคลมมีเส้นทางเก็บเงินของตัวเอง (hasUnpaidBalance กันให้แล้ว)
   */
  /**
   * 💰 ยอดบิลโตในคำขอนี้ (เปิด VAT ทีหลัง · แก้ค่าส่ง · เพิ่มรายการ) บนใบที่แอดมินเคยยืนยันเงินเองโดยไม่มี paidTotal
   * → ถือว่ารับครบเท่าบิลเดิม ไม่งั้นระบบไม่รู้ว่าค้าง (hasUnpaidBalance ต้องมี paidTotal) · ใบมัดจำ/เคลมไม่เกี่ยว
   */
  /**
   * ☑️ ติ๊ก "ลูกค้าไม่รับส่วนลดโอนไว (คิดยอดเต็ม)" บนใบที่ลูกค้าโอนเต็มจำนวนมาแล้ว → นับเงินส่วนที่โอนเกินเข้ายอดชำระ
   *
   * ทำไมต้องมี (OD-260908-3989 · 14 ก.ย. 69): บิล 3,750 ลดโอนไว ฿10 → ลูกค้าโอนเต็ม 3,750 · SlipOK ผ่าน
   * แต่ระบบนับเข้า paidTotal แค่ "ยอดค้างตอนนั้น" 3,740 ส่วนเกิน ฿10 ค้างอยู่นอกบัญชี (over)
   * พอแอดมินติ๊กไม่รับส่วนลด ยอดรวมกลับเป็น 3,750 → โชว์ "ค้างชำระ ฿10" ทั้งที่เงินเข้าครบแล้ว
   * → ดึงเงินส่วนที่โอนเกินมานับเป็นยอดชำระ (ไม่เกินส่วนลดที่เอาออก) · ติ๊กออก = ถอยคืนเท่าที่เติมไว้ (waiveCredit)
   * เงินไม่ได้โอนเกินมาจริง = ไม่เติมให้ (ค้าง ฿5/฿10 ตามจริง ให้ตามเก็บ/ใส่ส่วนลดเอง)
   */
  const waivedBefore = !!existing.earlyPay?.waivedAt;
  const waivedNow = !!toSave.earlyPay?.waivedAt;
  if (mayEditFull && toSave.earlyPay && waivedNow !== waivedBefore && toSave.paidTotal != null) {
    const who = `แอดมิน ${actor.name?.trim() || actor.username}`;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    if (waivedNow) {
      const credit = Math.min(Math.max(0, toSave.earlyPay.amount), uncreditedReceived(existing));
      if (credit > 0) {
        toSave = {
          ...toSave,
          paidTotal: round2((toSave.paidTotal ?? 0) + credit),
          earlyPay: { ...toSave.earlyPay, waiveCredit: credit },
        };
        toSave = withLog(
          toSave,
          who,
          "นับเงินที่โอนเกินเข้ายอดชำระ (ไม่รับส่วนลดโอนไว)",
          `ลูกค้าโอนเกินยอดที่เรียกเก็บตอนนั้น ${credit.toLocaleString("th-TH")} บาท — นับเข้ายอดชำระแล้ว` +
            ` รับแล้ว ${(toSave.paidTotal ?? 0).toLocaleString("th-TH")} จาก ${orderTotal(toSave).toLocaleString("th-TH")} บาท`
        );
      }
    } else {
      const credit = existing.earlyPay?.waiveCredit ?? 0;
      toSave = {
        ...toSave,
        ...(credit > 0 ? { paidTotal: Math.max(0, round2((toSave.paidTotal ?? 0) - credit)) } : {}),
        earlyPay: { ...toSave.earlyPay, waiveCredit: undefined },
      };
      if (credit > 0)
        toSave = withLog(
          toSave,
          who,
          "ถอยเงินที่โอนเกินออกจากยอดชำระ (คืนส่วนลดโอนไว)",
          `ถอย ${credit.toLocaleString("th-TH")} บาทที่เติมไว้ตอนติ๊กไม่รับส่วนลด — รับแล้ว ${(toSave.paidTotal ?? 0).toLocaleString("th-TH")} จาก ${orderTotal(toSave).toLocaleString("th-TH")} บาท`
        );
    }
  }

  const paidStageBefore = !(["รอชำระเงิน", "รอตรวจสอบ", "ยกเลิก"] as OrderStatus[]).includes(existing.status);
  if (mayEditFull && !toSave.deposit && !toSave.claimOf && toSave.paidTotal == null && paidStageBefore && orderTotal(toSave) > orderTotal(existing) + 0.5)
    toSave = { ...toSave, paidTotal: orderTotal(existing) };

  /**
   * 💳 ลูกค้าโอนถึง "ยอดโอนจริงหลังหัก ณ ที่จ่าย" แล้ว = จ่ายครบเท่าที่ต้องจ่าย ส่วนที่เหลือมาเป็นใบ 50 ทวิ ไม่ใช่เงินโอน
   * → นับ paidTotal เป็นยอดเต็มตามบิล (แพตเทิร์นเดียวกับตอน SlipOK ตรวจผ่านแล้วเจอหัก ณ ที่จ่าย: credit = ยอดที่ต้องชำระเต็ม)
   *
   * ทำไมต้องมี (OD-260911-5435 · 14 ก.ย. 69): ใบที่ paidTotal ถูกบันทึกเป็น "เงินที่เข้าจริง" (มาจากทางรับบางส่วน/ใบเก่า)
   * พอแก้ยอดให้ตรงบิล เช่น เอาค่าส่งที่หายไปกลับมา จะเกิด "ยอดค้างผี" เท่ากับภาษีที่ลูกค้าหักไว้ แล้วระบบ
   *   1) ส่งไลน์ "ยอดที่ต้องโอนเพิ่ม" ไปทวงลูกค้าที่จ่ายครบแล้ว   2) ล็อกใบไว้ไม่ให้ยิงเลขพัสดุ (orderFullyPaid ไม่ผ่าน)
   * ทั้งที่เงินเข้าครบเท่าที่ลูกค้าต้องโอน · เงื่อนไขนี้ไม่กลบการโอนขาดจริง — โอนไม่ถึงยอดสุทธิยังค้าง/ยังทวงตามเดิม
   * ⚠️ ต้องอยู่ "ก่อน" บล็อกเด้งกลับรอชำระเงินด้านล่าง — ไม่งั้นใบที่นับครบแล้วยังโดนถอยสถานะ (OD-260914-7626 · 17 ก.ย. 69)
   */
  if (
    mayEditFull &&
    !toSave.deposit &&
    !toSave.claimOf &&
    toSave.status !== "ยกเลิก" &&
    // ยอดค้าง ≈ ภาษีที่หักทั้งก้อนเท่านั้น — ยอดเพิ่มจริงที่เล็กกว่าภาษี (ค่าส่งเพิ่ม ฿50) ห้ามโดนกลืน (ดู whtCoversBalance)
    whtCoversBalance(toSave)
  ) {
    const cash = toSave.paidTotal ?? 0;
    toSave = { ...toSave, paidTotal: orderTotal(toSave) };
    toSave = withLog(
      toSave,
      `แอดมิน ${actor.name?.trim() || actor.username}`,
      "นับว่าชำระครบ (หัก ณ ที่จ่าย)",
      `เงินเข้าจริง ${cash.toLocaleString("th-TH")} บาท = ยอดโอนจริงหลังหัก ณ ที่จ่าย ${orderWhtAmount(toSave).toLocaleString("th-TH")} บาท` +
        ` → นับยอดชำระเป็น ${orderTotal(toSave).toLocaleString("th-TH")} บาทตามบิล (ส่วนต่างรอใบ 50 ทวิ ไม่ต้องให้ลูกค้าโอนเพิ่ม)`
    );
  }

  // แอดมินเปลี่ยนสถานะเองในคำขอนี้ → ล้างสถานะที่จำไว้ก่อนเด้ง (ไม่ให้เด้งกลับไปทับสิ่งที่แอดมินตั้งใจ)
  if (mayEditFull && toSave.status !== existing.status && toSave.reopenedFrom) toSave = { ...toSave, reopenedFrom: undefined };

  const REOPEN_FOR_BALANCE: OrderStatus[] = ["รอตรวจสอบ", "ชำระแล้ว", "รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ"];
  const reopenedForBalance =
    mayEditFull &&
    !toSave.deposit &&
    toSave.status === existing.status &&
    REOPEN_FOR_BALANCE.includes(toSave.status) &&
    hasUnpaidBalance(toSave);
  if (reopenedForBalance)
    toSave = withLog(
      // จำสถานะเดิมไว้ — เก็บส่วนต่างครบแล้วกลับไปขั้นเดิม (ไม่ต้องตรวจแบบซ้ำ)
      { ...toSave, status: "รอชำระเงิน", reopenedFrom: existing.status },
      actor.name?.trim() || actor.username,
      "ยอดรวมเพิ่มขึ้น — กลับไปรอชำระเงิน",
      `ค้างอีก ${orderBalance(toSave).toLocaleString("th-TH")} บาท (จ่ายมาแล้ว ${(toSave.paidTotal ?? 0).toLocaleString("th-TH")} จาก ${orderTotal(toSave).toLocaleString("th-TH")})`
    );

  /**
   * ↩️ ใบที่เคยเด้งกลับ "รอชำระเงิน" เพราะยอดโต แล้วคำขอนี้ทำให้ยอดค้างหมด (แก้ยอดกลับ/ถอดรายการที่เพิ่ม · นับครบเพราะหัก ณ ที่จ่าย)
   * → กลับไปขั้นเดิมที่จำไว้เอง เงียบ ๆ ไม่แจ้งสถานะซ้ำ (ลูกค้าเคยได้ข่าวขั้นนั้นไปแล้ว · ยอดที่เคยแจ้งไว้ balanceShrank บอกให้เองว่าไม่ต้องโอนเพิ่ม)
   * (OD-260914-7626 · 17 ก.ย. 69: แก้ค่าส่ง 100 → 150 → 100 ใบค้าง "รอชำระเงิน" ทั้งที่ส่งเข้าผลิตแล้ว ต้องซ่อมด้วยสคริปต์)
   */
  const restoredFromReopen =
    mayEditFull &&
    !toSave.deposit &&
    !toSave.claimOf &&
    existing.status === "รอชำระเงิน" &&
    toSave.status === "รอชำระเงิน" &&
    !!toSave.reopenedFrom &&
    toSave.paidTotal != null &&
    hasUnpaidBalance(existing) &&
    !hasUnpaidBalance(toSave);
  if (restoredFromReopen)
    toSave = withLog(
      { ...toSave, status: toSave.reopenedFrom!, reopenedFrom: undefined },
      actor.name?.trim() || actor.username,
      "ยอดค้างหมดแล้ว — กลับไปขั้นเดิม",
      `รอชำระเงิน → ${toSave.reopenedFrom} (รับแล้ว ${(toSave.paidTotal ?? 0).toLocaleString("th-TH")} จาก ${orderTotal(toSave).toLocaleString("th-TH")} บาท)`
    );

  /** ตีราคางานสั่งทำครบในคำขอนี้ไหม — ใช้ทั้งกันแจ้งซ้ำและข้อความแจ้งราคาด้านล่าง */
  const quoteJustPriced =
    !toSave.claimOf && existing.items.some((i) => i.unitPrice <= 0) && toSave.items.length > 0 && toSave.items.every((i) => i.unitPrice > 0);

  /**
   * 🔒 ด่านยืนยันเงินเข้า — คนไม่มีสิทธิ์ทำ 3 อย่างนี้ไม่ได้ (บังคับที่นี่ ไม่ใช่แค่ซ่อนปุ่ม)
   *   1) ดันสถานะเป็น "ชำระแล้ว"   2) ยืนยันรับมัดจำงวดแรก   3) ยืนยันรับยอดคงเหลือครบ
   * ตรวจจากส่วนต่างกับข้อมูลเดิม → บันทึกอย่างอื่นบนออเดอร์ที่ชำระแล้วยังทำได้ตามปกติ
   */
  if (!mayMarkPaid) {
    const nowPaid = toSave.status === "ชำระแล้ว" && existing.status !== "ชำระแล้ว";
    const depositFirst = !!toSave.deposit?.firstPaidAt && !existing.deposit?.firstPaidAt;
    const depositSettled = !!toSave.deposit?.settledAt && !existing.deposit?.settledAt;
    if (nowPaid || depositFirst || depositSettled)
      return NextResponse.json(
        {
          error:
            "บัญชีนี้ยืนยันการรับเงินไม่ได้ — ให้เจ้าของร้าน หรือพนักงานที่เปิดสิทธิ์ “ยืนยันเงินเข้า” ไว้ เป็นคนกด",
        },
        { status: 403 }
      );
  }
  /**
   * ✅ อนุมัติส่งรอบตัวอย่างทั้งที่ยอดคงเหลือยังไม่ครบ = เจ้าของร้าน (Administrator) เท่านั้น (สั่ง 16 ก.ย. 69)
   * ตรวจจากส่วนต่าง: รอบไหนในแผนแบ่งส่งที่ sampleApproved โผล่ใหม่/เปลี่ยนคน ทั้งที่ของเดิมไม่มี → คนอื่นโดน 403
   */
  if (actor.role !== ROLE_ADMINISTRATOR) {
    const was = (existing.shipPlan ?? []).map((r) => r.sampleApproved?.at ?? "");
    const newlyApproved = (toSave.shipPlan ?? []).some((r, n) => !!r.sampleApproved && r.sampleApproved.at !== (was[n] ?? ""));
    if (newlyApproved)
      return NextResponse.json({ error: "อนุมัติส่งตัวอย่างก่อนเก็บยอดคงเหลือได้เฉพาะเจ้าของร้านเท่านั้น" }, { status: 403 });
    // 🔁 ล้างธง "พิมพ์ใบปะหน้ารอบตัวอย่างแล้ว" (= อนุญาตพิมพ์ซ้ำ) ก็เจ้าของร้านเท่านั้น
    const reprint = (existing.shipPlan ?? []).some((r, n) => !!r.samplePrintedAt && !toSave.shipPlan?.[n]?.samplePrintedAt && !!toSave.shipPlan?.[n]);
    if (reprint) return NextResponse.json({ error: "อนุญาตพิมพ์ใบปะหน้ารอบตัวอย่างซ้ำได้เฉพาะเจ้าของร้านเท่านั้น" }, { status: 403 });
  }

  // อย่าเก็บ signed URL ชั่วคราวลงฐาน — สลิปทุกใบ (ช่องหลัก/ใบเพิ่ม) ต้องเซ็นใหม่ทุกครั้งที่ดึง
  toSave = stripPaymentUrls(toSave);
  if (toSave.loginLine) toSave = { ...toSave, loginLine: undefined };
  /**
   * 💰 แอดมินยืนยันเงินเข้าเอง (เปลี่ยนเป็น "ชำระแล้ว" โดยไม่ผ่าน SlipOK) ทั้งที่ยังไม่มี paidTotal
   * → จำว่ารับครบเท่ายอดบิลตอนนี้ ไม่งั้นสั่งเพิ่ม/เก็บค่าบริการทีหลังจะไม่รู้ว่าค้าง (กับดัก 26 ส.ค. 69: 34 จาก 40 ใบไม่มี paidTotal)
   * ใบมัดจำมีเส้นทางของตัวเอง (confirmDepositFirst ตั้ง paidTotal อยู่แล้ว)
   */
  // ⏳ แอดมินยืนยันเงินเข้าเองทันเวลา → ล็อกส่วนลดโอนไวก่อนคิด paidTotal (เลยเวลาแล้ว = ส่วนลดหาย ใส่ส่วนลดทั้งบิลเองได้ถ้าตกลงกับลูกค้า)
  if (toSave.status === "ชำระแล้ว" && existing.status !== "ชำระแล้ว")
    toSave = lockEarlyPay(toSave, now, `แอดมิน ${actor.name?.trim() || actor.username}`);
  if (toSave.status === "ชำระแล้ว" && existing.status !== "ชำระแล้ว" && toSave.paidTotal == null && !toSave.deposit)
    toSave = { ...toSave, paidTotal: orderTotal(toSave) };

  // 🕒 ประวัติรวม 2 ฝั่ง + ประทับเวลาบันทึก (หน้าจอรับกลับไปถือ = รอบหน้าเซิร์ฟเวอร์รู้ว่าหน้านั้นเห็นถึงตอนนี้แล้ว)
  // (ฐาน + ที่หน้าจอส่งมา + ที่เซิร์ฟเวอร์เพิ่งต่อท้ายในคำขอนี้ — ทางแพ็ค/กราฟฟิก toSave ตั้งต้นจากฐาน log ของหน้าจอจึงต้องรวมตรงนี้)
  // 👤 จดชื่อ/เบอร์เดิมลงประวัติเมื่อแอดมินแก้ — หน้าจอไม่ได้ log ให้ ถ้าไม่จด จะไม่รู้ว่าโฟลเดอร์กราฟฟิก/การ์ด WIP ชื่อเก่ามาจากไหน
  if (mayEditFull) {
    const nameChanged = (toSave.customer || "").trim() !== (existing.customer || "").trim();
    const phoneChanged = (toSave.phone || "").trim() !== (existing.phone || "").trim();
    if (nameChanged || phoneChanged)
      toSave = withLog(
        toSave,
        actor.name?.trim() || actor.username,
        "แก้ไขชื่อผู้รับ/เบอร์",
        [
          nameChanged ? `ชื่อผู้รับ: ${existing.customer || "—"} → ${toSave.customer || "—"}` : "",
          phoneChanged ? `เบอร์: ${existing.phone || "—"} → ${toSave.phone || "—"}` : "",
        ]
          .filter(Boolean)
          .join(" · ")
      );
  }
  /**
   * 🧾 ยอดค้างโตในคำขอนี้ (เปิด VAT ทีหลังเพราะลูกค้าขอใบกำกับภาษี · แก้ค่าส่ง · เพิ่มรายการ)
   * → บอกลูกค้าว่าเพราะอะไร ค้างเท่าไร แนบสลิปที่ลิงก์เดิม (แทนข้อความสถานะ "รอชำระเงิน" ทั่วไปที่ไม่มียอด)
   * เก็บเพิ่ม (charges) แจ้งจาก /api/admin/orders/charge เองแล้ว · ลูกค้าสั่งเพิ่มแจ้งจาก /api/orders/append
   */
  const vatJustAdded = !!toSave.vat && !existing.vat && orderVatAmount(toSave) > 0;
  // ใบเดิมไม่มี paidTotal (เพิ่งตั้งให้ด้านบน) = ก่อนหน้านี้ถือว่าไม่ค้าง → เทียบกับ 0 ไม่ใช่ยอดเต็ม
  const balBefore = existing.paidTotal == null && paidStageBefore ? 0 : orderBalance(existing);
  const balanceGrew = mayEditFull && !quoteJustPriced && hasUnpaidBalance(toSave) && orderBalance(toSave) > balBefore + 0.5;
  /**
   * 💳 ยอดค้าง "ลดลง" ในคำขอนี้ทั้งที่เคยบอกลูกค้าไปแล้วว่าต้องโอนเพิ่มเท่าไร (ยังไม่มีเงินเข้าเพิ่ม)
   * → ต้องบอกยอดใหม่ ไม่งั้นลูกค้าถือยอดเก่าจากไลน์ไปโอน (11 ก.ย. 69 OD-260910-5763: แอดมินเพิ่ม Arm patch ×10 → ไลน์บอก 730
   *   แล้วค่อยใส่ส่วนลดทั้งบิล "มัดจำตีลาย" −50 ในการบันทึกถัดไป → เว็บค้าง 680 ไลน์ยังค้าง 730 เจ้าของร้านสั่งให้ตรงกัน)
   * เฉพาะ: แอดมินสิทธิ์เต็ม · เคยแจ้งยอดค้าง (balanceNotified) · paidTotal ไม่ขยับในคำขอนี้ (เงินเข้าใช้ทาง slip-apply ไม่ใช่ทางนี้)
   * · ยอดค้างลดจากรอบก่อนและต่างจากที่เคยแจ้ง · ไม่ใช่ใบมัดจำ/เคลม
   */
  const balNow = orderBalance(toSave);
  const notified = existing.balanceNotified;
  const balanceShrank =
    mayEditFull &&
    !balanceGrew &&
    !quoteJustPriced &&
    !toSave.deposit &&
    !toSave.claimOf &&
    toSave.status !== "ยกเลิก" &&
    !!notified &&
    existing.paidTotal != null &&
    (toSave.paidTotal ?? 0) === (existing.paidTotal ?? 0) &&
    balNow < balBefore - 0.5 &&
    Math.abs(balNow - notified.balance) > 0.5;
  /**
   * 🕐 ยอดค้างขยับ → "เข้าคิวแจ้ง" เงียบ ๆ แทนการยิงไลน์ทันที (พนักงานแจ้ง 22 ก.ย. 69)
   * เดิมเพิ่มรายการทีละชิ้นด้วยปุ่ม "เพิ่มเข้าออเดอร์" = ลูกค้าโดนไลน์ทุกชิ้น · เพิ่มผิดแล้วลบก็ยังได้อีกข้อความ
   *   • คิวใหม่: จำ from = ยอดค้างที่ลูกค้ารู้อยู่ก่อน (ไว้เทียบตอนแอดมินแก้กลับ)
   *   • แก้ต่อจนยอดกลับไปเท่า from (เพิ่มผิดแล้วลบทิ้ง) → คิวหายเงียบ ๆ ลูกค้าไม่ต้องรู้เรื่อง
   *   • แก้ต่อแล้วยอดยังต่าง → อัปเดตยอดในคิว + เริ่มนับเวลาใหม่ (แอดมินยังทำงานอยู่)
   * ส่งจริงตอนกดปุ่ม 📣 ในหน้าออเดอร์ หรือ cron แจ้งให้เองเมื่อค้างเกินกำหนด (ดู src/lib/balance-notify.ts)
   */
  const pendPrev = existing.balancePending;
  // ทางแพ็ค/กราฟฟิก (ไม่ใช่สิทธิ์แก้เต็ม) ไม่ยุ่งกับเรื่องเงิน — อย่าให้ไปเปิด/ปิดคิวแทนแอดมิน
  const plan = planBalanceQueue({ balBefore, balNow, pending: mayEditFull ? pendPrev : null, triggered: balanceGrew || balanceShrank });
  const balanceQueued = plan.action === "start" || plan.action === "refresh";
  if (plan.action === "start" || plan.action === "refresh") {
    // เหตุผลที่จะพิมพ์ในไลน์ — เปิด VAT / ใส่ส่วนลดทั้งบิล (นอกนั้นใช้ "ยอดรวมเปลี่ยนเป็น X บาท" ตอนส่ง)
    const discAdded = Math.round((adminDiscountAmount(toSave) - adminDiscountAmount(existing)) * 100) / 100;
    const why = vatJustAdded
      ? `ภาษีมูลค่าเพิ่ม ${toSave.vat!.rate}% ${orderVatAmount(toSave).toLocaleString("th-TH")} บาท (ออกใบกำกับภาษีตามที่ขอ)`
      : discAdded > 0
        ? `ส่วนลด${toSave.adminDiscount?.label?.trim() ? ` ${toSave.adminDiscount.label.trim()}` : ""} −${discAdded.toLocaleString("th-TH")} บาท`
        : pendPrev?.why;
    toSave = { ...toSave, balancePending: { at: now, from: plan.from, balance: plan.balance, why, by: actor.name?.trim() || actor.username } };
    if (plan.action === "start")
      toSave = withLog(
        toSave,
        `แอดมิน ${actor.name?.trim() || actor.username}`,
        "ยอดที่ต้องโอนเพิ่มรอแจ้งลูกค้า",
        `ค้าง ${balNow.toLocaleString("th-TH")} บาท (เดิม ${balBefore.toLocaleString("th-TH")}) — ยังไม่ส่งไลน์ กดปุ่ม 📣 แจ้งยอดในหน้าออเดอร์เมื่อแก้ครบ`
      );
  } else if (plan.action === "cancel") {
    toSave = withLog(
      { ...toSave, balancePending: undefined },
      `แอดมิน ${actor.name?.trim() || actor.username}`,
      "ยกเลิกคิวแจ้งยอดโอนเพิ่ม",
      `ยอดค้างกลับมาเท่าเดิม ${balNow.toLocaleString("th-TH")} บาท — ไม่ได้ส่งไลน์ให้ลูกค้า`
    );
  }

  toSave = { ...toSave, log: mergeLogs(existing.log, order.log, toSave.log), savedAt: now };

  /**
   * ⚡ บันทึกผ่าน "ประตูเดียว" — รายการ/ราคาที่เปลี่ยนในคำขอนี้ (เพิ่มรายการพิเศษ · ตีราคา · แก้จำนวน)
   * จะถูกคิดส่วนลดโอนไวให้เองที่นั่น กติกาเดียวกับที่ลูกค้าสั่งจากเว็บ (ดู server/order-early-pay.ts)
   * เดิมทางนี้ไม่เคยคิดให้ → ใบที่พนักงานเปิดให้ทางไลน์ไม่ได้ส่วนลด (OD-260914-4051 · เจ้าของร้านทัก 14 ก.ย. 69)
   */
  const written = await updateOrder(sb, toSave, { prev: existing, by: `แอดมิน ${actor.name?.trim() || actor.username}` });
  if (written.error) return NextResponse.json({ error: written.error.message }, { status: 500 });
  toSave = written.order;

  const adminName = `แอดมิน ${actor.name?.trim() || actor.username}`;

  /*
   * 💳📣 ยอดค้างที่ขยับในคำขอนี้ "ไม่ยิงไลน์ทันที" แล้ว — อยู่ในคิว toSave.balancePending
   * แอดมินกดปุ่ม 📣 แจ้งยอดในหน้าออเดอร์ (POST /api/admin/orders/balance/notify) เมื่อแก้ครบ
   * ไม่กด → /api/cron/balance-notify แจ้งให้เองหลังเงียบครบกำหนด (ดู src/lib/balance-notify.ts)
   */

  // 🔥 ติ๊ก/ยกเลิกงานเร่ง หรือแก้วันที่ลูกค้าต้องใช้งาน/ช่วงวันจัดส่ง → ส่งต่อให้บอร์ด WIP กราฟฟิก (เฉพาะใบที่ชำระแล้วมีเรคอร์ดอยู่ · ใบอื่น not-found ข้ามเงียบ)
  const shipKey = (o: Order) => `${o.shipDate?.from || ""}|${o.shipDate?.to || ""}`;
  if (mayEditFull && (!!toSave.rush !== !!existing.rush || (toSave.useByDate || "") !== (existing.useByDate || "") || shipKey(toSave) !== shipKey(existing)))
    void syncRushToTP(toSave);
  // 🛒 รอของเข้าเปลี่ยน (ติ๊ก/ยกเลิก/แก้โน้ต/ของเข้าแล้ว — แอดมินหรือฝ่ายแพ็ค) → ป้ายบนการ์ดบอร์ด WIP กราฟฟิกต้องตามทัน
  //    ⏳ await: Netlify แช่เครื่องทันทีที่ตอบ — ป้าย "ห้ามส่งผลิต" ที่ไปไม่ถึงบอร์ด = กราฟฟิกส่งผลิตทั้งที่ของยังไม่มา
  const swKey = (o: Order) => JSON.stringify([o.needsPurchase?.at ?? "", o.needsPurchase?.note ?? "", o.needsPurchase?.arrivedAt ?? ""]);
  if (swKey(toSave) !== swKey(existing)) await syncStockWaitToTP(toSave);
  // 👤 แอดมินแก้ชื่อผู้รับ/เบอร์ → อัปเดตการ์ดบอร์ด WIP ให้ตรงหน้าออเดอร์ (เก็บชื่อเก่าไว้ให้จับคู่โฟลเดอร์เดิมได้)
  if (mayEditFull) void syncCustomerToTP(existing, toSave);
  // ยอดของเรคอร์ดสะพานทั้งสองใบ (งวดแรก + งวดหลัง) — ต่างกันเมื่อไหร่แปลว่าต้องยิงอัปเดตไป msVerify
  const tpMoneyKey = (o: Order) => JSON.stringify([amountsForRecord(o, false), amountsForRecord(o, true)]);
  // 💵 ยอดที่ msVerify ต้องกระทบกับแถวโอนของธนาคารเปลี่ยนหลังส่งเรคอร์ดไปแล้ว → อัปเดตให้ตรง
  //    ("เงินเข้าบัญชีจริง"/ค่าธรรมเนียม · ยอดบิล/หัก ณ ที่จ่าย · เปิดโหมดมัดจำ 50% ทีหลัง — เรคอร์ดค้างยอดทั้งบิล)
  // ⏳ รอให้เสร็จก่อนตอบ — Netlify แช่แข็งเครื่องทันทีที่ตอบ response งานเบื้องหลังตายกลางทางได้
  //    (พนักงานแจ้ง 14 ก.ย. 69: ออเดอร์ชำระแล้วไม่ขึ้นแท็บ 🛒 iDucky Store · ดู lib/server/tp-bridge-audit.ts)
  if (mayEditFull && tpMoneyKey(existing) !== tpMoneyKey(toSave)) await syncAmountsToTP(toSave);
  // 📦 ฝ่ายแพ็คปักของยังไม่มา/มาไม่ครบ/มาครบ → ส่งไปหน้า "ติดตามของ iDucky" ในระบบ TP (ยิงเฉพาะรายการที่เปลี่ยน)
  //    ⏳ await: Netlify แช่เครื่องทันทีที่ตอบ — ใบที่ยิงไม่ทันมักเป็น "ใบปิดเรื่อง" พอดี เพราะฝ่ายแพ็คกดครบรูปสุดท้ายแล้วเดินไปแพ็คต่อ
  //    ผลคือการ์ดค้างหน้าติดตามของทั้งที่ส่งของไปแล้ว (พนักงานแจ้ง 22 ก.ย. 69 — OD-260916-1093 / OD-260916-4693)
  await syncArrivalToTP(existing, toSave);
  // 🩹 ใบเข้าสถานะปิดงาน (จัดส่งแล้ว/เสร็จสิ้น/ยกเลิก) → กวาดใบติดตามที่ยังค้างของออเดอร์นี้ให้ตรงกับความจริงอีกชั้น
  //    ของถึงมือลูกค้าแล้ว = ไม่มีเหตุให้ค้างในหน้าติดตามของอีก (ใบที่ยังปักค้างจริงและยังไม่ปิดงาน จะแค่อัปเดตสถานะออเดอร์บนการ์ด)
  if (toSave.status !== oldStatus && (["จัดส่งแล้ว", "เสร็จสิ้น", "ยกเลิก"] as OrderStatus[]).includes(toSave.status))
    await reconcileFollowupsForOrder(toSave);
  // 🛒 ของเข้าร้านแล้ว (กด "ของเข้าแล้ว" ในคำขอนี้) → บอกลูกค้าทางไลน์ตามที่หน้าออเดอร์สัญญาไว้ · ข่าวคืบหน้า = ระดับ extra
  if (toSave.needsPurchase?.arrivedAt && !existing.needsPurchase?.arrivedAt) void notifyStockArrived(sb, toSave, new URL(req.url).origin);
  // มัดจำงวดแรกเพิ่งยืนยัน (มือ) ในคำขอนี้ — ใช้แยกรูปแบบรายงาน msVerify
  const depositFirstNow = !!toSave.deposit?.firstPaidAt && !existing.deposit?.firstPaidAt;

  // แจ้งเตือนลูกค้าเมื่อสถานะเปลี่ยนไปขั้นสำคัญ (เงียบถ้ายังไม่ตั้งค่า LINE)
  // ⚠️ กลับไปรอชำระเงินเพราะยอดโต = เงียบไว้ก่อน ให้ข้อความ "ยอดที่ต้องโอนเพิ่ม" ในคิวเป็นคนบอก (ไม่งั้นลูกค้าได้ "รอชำระเงิน" ลอย ๆ ที่ไม่มียอด)
  if (toSave.status !== oldStatus && !quoteJustPriced && !(reopenedForBalance && (balanceGrew || balanceQueued)) && !restoredFromReopen) {
    const origin = new URL(req.url).origin;
    const link = orderLink(origin, toSave);
    // แจ้งลูกค้า "ทุกครั้งที่สถานะเปลี่ยน" — ข้อความต่อสถานะอยู่ใน statusMessage()
    if (statusMessage(toSave, link))
      void notifyCustomerLogged(
        sb,
        toSave,
        statusFlex(toSave, link),
        `แจ้งสถานะ "${toSave.status}"`,
        // เงิน/จัดส่ง/ยกเลิก = เรื่องสำคัญ ส่งแม้ลูกค้าเลือกรับเฉพาะสำคัญ · นอกนั้นเป็นข่าวคืบหน้า
        KEY_STATUSES.includes(toSave.status) ? "key" : "extra"
      );
    // ส่งเข้า msVerify ระบบ Admin — แยกว่าตรวจโดยแอดมิน (SlipOK ผ่านจะถูกส่งจาก slip route ไปแล้ว = idempotent)
    // ⏳ เรคอร์ด msVerify = ของที่ฝ่ายบัญชีต้องเห็น — รอให้เขียนเสร็จก่อนตอบ (ห้าม fire-and-forget)
    if (toSave.status === "ชำระแล้ว")
      await reportPaidToTP(
        toSave,
        adminName,
        // ยอดเงินเข้าจริงของงวดคิดใน amountsForRecord (งวด − หัก ณ ที่จ่ายของงวด) — ที่นี่บอกแค่ว่าเป็นงวดไหน
        depositFirstNow ? { noteSuffix: "มัดจำ 50% งวดแรก" } : undefined
      );
    // ตัดสต๊อกวัสดุอัตโนมัติ (idempotent ต่อออเดอร์) · ยกเลิก → คืนของที่เคยตัด
    if (toSave.status === "ชำระแล้ว") void cutStockForOrder(toSave);
    // ยอด "ขายแล้ว" บนหน้าเว็บ บวก/ถอนอัตโนมัติ (idempotent เช่นกัน)
    if (toSave.status === "ชำระแล้ว") void bumpSoldForOrder(toSave.id);
    if (toSave.status === "ยกเลิก") void unbumpSoldForOrder(toSave.id);
    if (toSave.status === "ยกเลิก") void restoreStockForOrder(toSave);
    // 🦆 แต้มสะสม — ชำระครบ = บวกให้ผู้ติดต่อที่ผูกไว้ (ออเดอร์มัดจำรอเก็บยอดคงเหลือครบก่อน — บวกที่บล็อก settledAt ด้านล่าง)
    if (toSave.status === "ชำระแล้ว" && !toSave.deposit) void awardPointsForOrder(toSave);
    if (toSave.status === "ยกเลิก") void revokePointsForOrder(toSave);

    // ออเดอร์มัดจำเข้าไลน์ผลิตแล้วแต่ยังค้างงวดหลัง → ทวงตั้งแต่ตอนนี้ ไม่ต้องรอของเสร็จค่อยรู้
    if (toSave.status === "กำลังผลิต" && toSave.deposit?.firstPaidAt && !toSave.deposit.settledAt) {
      const bal = Math.max(0, orderTotal(toSave) - (toSave.paidTotal ?? 0));
      void notifyCustomerLogged(
        sb,
        toSave,
        orderNotice(toSave, link, {
          tone: "dueLeft",
          head: "เหลือยอดค้างชำระ",
          headline: "ออเดอร์เข้าไลน์ผลิตแล้วครับ — เหลือยอดค้างอีกนิดหน่อย",
          hero: { label: "ยอดค้าง", value: `${bal.toLocaleString("th-TH")} บาท` },
          rows: [{ label: "ยอดรวมทั้งบิล", value: `${orderTotal(toSave).toLocaleString("th-TH")} บาท` }, { label: "รับแล้ว", value: `${(toSave.paidTotal ?? 0).toLocaleString("th-TH")} บาท`, bold: true }],
          note: "โอนแล้วแนบสลิปในหน้าออเดอร์ได้เลยครับ (ทางร้านจัดส่งได้หลังชำระครบ)",
          alt: `🛠️ ออเดอร์ ${toSave.id} เข้าไลน์ผลิตแล้วครับ\n💳 เหลือยอดค้าง ${bal.toLocaleString()} บาท — โอนแล้วแนบสลิปได้ที่ลิงก์นี้เลย (ทางร้านจัดส่งได้หลังชำระครบ)\n${link}`,
        }),
        "ทวงยอดคงเหลือ (เข้าไลน์ผลิต)"
      );
      toSave = { ...toSave, deposit: { ...toSave.deposit, balanceRemindedAt: new Date().toISOString() } };
      void updateOrder(sb, toSave, { prev: toSave });
    }
  }

  /**
   * 📦 ส่งรวมกล่อง: ยิง/แก้เลขพัสดุที่ใบหลัก → ลงเลขเดียวกัน + "จัดส่งแล้ว" ให้ใบตามทุกใบ (กันลืมยิงใบที่สอง)
   * ลูกค้าได้การ์ดแจ้งจัดส่งใบเดียวจากใบหลัก (บอกเลขใบที่รวมมาด้วย — ดู statusFlex) · ใบตามแจ้งแยกเฉพาะเมื่อผูก LINE คนละคน
   * ⏳ await — Netlify แช่เครื่องทันทีที่ตอบ ใบตามที่ไม่ได้เลข = ลูกค้าเปิดใบนั้นแล้วไม่เห็นว่าส่งแล้ว
   */
  const trackNow = (toSave.tracking ?? "").trim();
  const trackWas = (existing.tracking ?? "").trim();
  if (shipRiders.length && trackNow && trackNow !== trackWas) {
    const origin = new URL(req.url).origin;
    for (const r of shipRiders) {
      const rt = (r.tracking ?? "").trim();
      if (rt && rt !== trackWas) continue; // ใบตามมีเลขของตัวเองที่ไม่ได้มาจากใบหลัก — ไม่ทับ
      const nextRider = withLog(
        { ...r, tracking: trackNow, status: (r.status === "เสร็จสิ้น" ? r.status : "จัดส่งแล้ว") as OrderStatus },
        adminName,
        `บันทึกเลขพัสดุ (ส่งรวมกล่องกับ ${toSave.id})`,
        trackNow
      );
      const wr = await updateOrder(sb, nextRider, { prev: r, by: adminName });
      if (wr.error) {
        console.error(`[orders] ลงเลขพัสดุให้ใบส่งรวม ${r.id} ไม่สำเร็จ:`, wr.error.message);
        continue;
      }
      if (r.lineUserId && r.lineUserId !== toSave.lineUserId) {
        const link = orderLink(origin, wr.order);
        await notifyCustomerLogged(sb, wr.order, statusFlex(wr.order, link), `แจ้งสถานะ "จัดส่งแล้ว" (ส่งรวมกับ ${toSave.id})`, "key");
      }
    }
  }

  // 🚚 แบ่งส่ง: รอบใหม่ในคำขอนี้ → แจ้งลูกค้าเลขพัสดุของรอบนั้นทันที (ใบยังไม่ปิด ที่เหลือส่งรอบถัดไป)
  const shippedNow = newShipmentsOf(existing, toSave);
  if (shippedNow.length) {
    const origin = new URL(req.url).origin;
    const link = orderLink(origin, toSave);
    const base = (existing.shipments ?? []).length;
    shippedNow.forEach((sh, n) => {
      const round = base + n + 1;
      const qty = shipmentQty(sh);
      const lines = sh.proofs
        .map(
          (p) =>
            `• ${p.itemName ?? toSave.items[p.item]?.name ?? "รายการ"} รูปที่ ${p.proof + 1}${
              p.qty ? ` × ${p.qty.toLocaleString("th-TH")}${p.ofQty && p.ofQty > p.qty ? `/${p.ofQty.toLocaleString("th-TH")}` : ""} ${p.unit || "ชิ้น"}` : ""
            }`
        )
        .join("\n");
      const tail = `${qty ? `\nรอบนี้ ${qty.toLocaleString("th-TH")} ชิ้น` : ""}\n${lines}${sh.shipTo ? `\n📍 ส่งไปที่: ${shipToText(sh.shipTo)}` : ""}${sh.note ? `\n📝 ${sh.note}` : ""}`;
      // รายการของรอบนี้ — บรรทัดเดียวกับที่เคยส่งเป็นข้อความล้วน (ตัดจุดนำหน้าออก การ์ดใส่ให้เอง)
      const bullets = lines.split("\n").filter(Boolean).map((l) => l.replace(/^•\s*/, ""));
      const rows: { label: string; value: string; bold?: boolean }[] = [{ label: "รอบที่", value: String(round), bold: true }];
      if (qty) rows.push({ label: "จำนวนรอบนี้", value: `${qty.toLocaleString("th-TH")} ชิ้น`, bold: true });
      if (!sh.pickup && sh.tracking) rows.push({ label: "เลขพัสดุรอบนี้", value: sh.tracking, bold: true });
      if (sh.shipTo) rows.push({ label: "📍 ส่งไปที่", value: shipToText(sh.shipTo) });
      if (sh.note) rows.push({ label: "📝 หมายเหตุ", value: sh.note });
      void notifyCustomerLogged(
        sb,
        toSave,
        // 🏪 ใบมารับเอง: รอบนี้ไม่มีเลขพัสดุ — บอกให้มารับของรอบนี้ได้เลย ที่เหลือแจ้งอีกครั้ง
        orderNotice(toSave, link, {
          tone: sh.pickup ? "pickupRound" : "shipRound",
          head: sh.pickup ? `แพ็คเสร็จบางส่วน (รอบที่ ${round})` : `จัดส่งบางส่วน (รอบที่ ${round})`,
          headline: sh.pickup
            ? "ของรอบนี้แพ็คเสร็จแล้ว — มารับที่ร้านได้เลยครับ"
            : "ของรอบนี้จัดส่งแล้วครับ ตามเลขพัสดุด้านล่าง",
          rows,
          bullets,
          note: sh.pickup
            ? "ส่วนที่เหลือทางร้านจะแจ้งอีกครั้งเมื่อพร้อมให้มารับครับ"
            : "ส่วนที่เหลือจะจัดส่งในรอบถัดไป แล้วแจ้งเลขพัสดุอีกครั้งครับ",
          alt: sh.pickup
            ? `🏪 ออเดอร์ ${toSave.id} แพ็คเสร็จบางส่วนแล้วครับ (รอบที่ ${round}) — มารับที่ร้านได้เลย${tail}\nส่วนที่เหลือทางร้านจะแจ้งอีกครั้งเมื่อพร้อมให้มารับครับ\n${link}`
            : `🚚 ออเดอร์ ${toSave.id} จัดส่งบางส่วนแล้วครับ (รอบที่ ${round})\nเลขพัสดุ: ${sh.tracking}${tail}\nส่วนที่เหลือจะจัดส่งในรอบถัดไป แล้วแจ้งเลขพัสดุอีกครั้งครับ\n${link}`,
        }),
        sh.pickup ? `แจ้งแพ็คเสร็จบางส่วน (มารับเอง) รอบที่ ${round}` : `แจ้งส่งบางส่วน รอบที่ ${round} · ${sh.tracking}`,
        "key"
      );
    });
  }

  // 📦 แอดมินเพิ่งยืนยันสต๊อก/คิวผลิตของรายการที่สั่งจำนวนมาก → แจ้งลูกค้าทางไลน์ทันที
  const stockJustConfirmed = existing.items.filter(
    (old, i) => old.needStockCheck && !toSave.items[i]?.needStockCheck && sameLine(old, order.items?.[i])
  );
  if (stockJustConfirmed.length) {
    const origin = new URL(req.url).origin;
    const lines = stockJustConfirmed.map((i) => `• ${i.name} ×${i.qty.toLocaleString("th-TH")}`).join("\n");
    const ship = toSave.shipDate?.from
      ? `\nกำหนดส่ง: ${toSave.shipDate.from}${toSave.shipDate.to && toSave.shipDate.to !== toSave.shipDate.from ? ` – ${toSave.shipDate.to}` : ""}`
      : "";
    void notifyCustomer(
      sb,
      toSave,
      orderNotice(toSave, orderLink(origin, toSave), {
        tone: "stockOk",
        head: "เช็คสต๊อกเรียบร้อย",
        headline: "เช็คสต๊อกให้แล้วครับ — ผลิตได้ตามจำนวนที่สั่ง",
        bullets: stockJustConfirmed.map((i) => `${i.name} ×${i.qty.toLocaleString("th-TH")}`),
        ...(toSave.shipDate?.from
          ? {
              rows: [
                {
                  label: "กำหนดส่ง",
                  value: `${toSave.shipDate.from}${toSave.shipDate.to && toSave.shipDate.to !== toSave.shipDate.from ? ` – ${toSave.shipDate.to}` : ""}`,
                  bold: true,
                },
              ],
            }
          : {}),
        alt: `✅ เช็คสต๊อกเรียบร้อยแล้วครับ — ผลิตได้ตามจำนวนที่สั่ง\n${lines}${ship}\nออเดอร์ ${toSave.id}\n${orderLink(origin, toSave)}`,
      })
    );
  }

  // 💬 ตีราคาครบในคำขอนี้ → แจ้งลูกค้าทางไลน์ว่าเปิดหน้าแจ้งโอนได้แล้ว
  //    (งานสั่งทำเข้ามาที่ ฿0 · หน้าเช็คออเดอร์ล็อกปุ่มแจ้งโอนไว้จนกว่าทุกรายการมีราคา)
  //    งานเคลมตั้งใจให้ ฿0 อยู่แล้ว — ไม่ต้องแจ้ง
  if (quoteJustPriced) {
    const origin = new URL(req.url).origin;
    const total = orderTotal(toSave);
    const bal = Math.max(0, total - (toSave.paidTotal ?? 0));
    const quoted = existing.items
      .map((old, i) => ({ old, now: toSave.items[i], inc: order.items?.[i] }))
      .filter((p) => p.old.unitPrice <= 0 && p.now && sameLine(p.old, p.inc))
      .map((p) => {
        const line = `• ${p.now!.name} ×${p.now!.qty.toLocaleString("th-TH")} = ${(p.now!.qty * p.now!.unitPrice).toLocaleString("th-TH")} บาท`;
        // ที่มาของราคาที่แอดมินพิมพ์ไว้ (เช่น "230 + 10 + 50 = 290") — ลูกค้าจะได้ไม่ต้องทักถาม
        const why = (p.now!.quoteNote ?? "").trim();
        return why ? `${line}\n   ${why.replace(/\n+/g, " · ")}` : line;
      })
      .join("\n");
    void notifyCustomerLogged(
      sb,
      toSave,
      orderNotice(toSave, orderLink(origin, toSave), {
        tone: "quote",
        head: "ตีราคาให้แล้ว",
        headline: "ตีราคางานสั่งทำให้แล้วครับ — โอนแล้วแนบสลิปได้เลย",
        hero: { label: bal !== total ? "ยอดที่ต้องโอน" : "ยอดรวมทั้งบิล", value: `${bal.toLocaleString("th-TH")} บาท` },
        // บรรทัดราคาที่ตีให้ (พร้อมที่มาของราคาที่แอดมินพิมพ์ไว้) — ยุบเป็นบรรทัดเดียวต่อรายการบนการ์ด
        bullets: quoted.split("\n").filter(Boolean).reduce<string[]>((acc, l) => {
          if (l.startsWith("•")) acc.push(l.replace(/^•\s*/, ""));
          else if (acc.length) acc[acc.length - 1] += ` — ${l.trim()}`;
          return acc;
        }, []),
        ...(bal !== total ? { rows: [{ label: "ยอดรวมทั้งบิล", value: `${total.toLocaleString("th-TH")} บาท` }, { label: "รับแล้ว", value: `${(toSave.paidTotal ?? 0).toLocaleString("th-TH")} บาท`, bold: true }] } : {}),
        alt: `💬 ตีราคางานสั่งทำให้แล้วครับ — ออเดอร์ ${toSave.id}\n${quoted}\n\n💰 ยอดรวมทั้งบิล ${total.toLocaleString("th-TH")} บาท${
          bal !== total ? `\n💳 ยอดที่ต้องโอน ${bal.toLocaleString("th-TH")} บาท` : ""
        }\nโอนแล้วแนบสลิปที่ลิงก์นี้ได้เลยครับ\n${orderLink(origin, toSave)}`,
      }),
      `แจ้งราคาที่ตีให้ (ยอดรวม ${total.toLocaleString("th-TH")} บาท)`,
      "key" // เรื่องเงิน — ส่งแม้ลูกค้าเลือกรับเฉพาะเรื่องสำคัญ
    );
  }

  // มัดจำ: แอดมินยืนยันรับยอดคงเหลือครบในคำขอนี้ → แจ้งลูกค้า + ส่งเรคอร์ดงวดหลังเข้า msVerify
  if (toSave.deposit?.settledAt && !existing.deposit?.settledAt) {
    const origin = new URL(req.url).origin;
    void notifyCustomerLogged(
      sb,
      toSave,
      orderNotice(toSave, orderLink(origin, toSave), {
        tone: "settled",
        head: "รับยอดคงเหลือครบแล้ว",
        headline: "รับยอดคงเหลือครบแล้ว ขอบคุณครับ 🦆",
        rows: [{ label: "ยอดรวมทั้งบิล", value: `${orderTotal(toSave).toLocaleString("th-TH")} บาท`, bold: true }],
        alt: `✅ รับยอดคงเหลือออเดอร์ ${toSave.id} ครบแล้ว ขอบคุณครับ\n${orderLink(origin, toSave)}`,
      }),
      "ยืนยันรับยอดคงเหลือครบ"
    );
    await reportPaidToTP(toSave, adminName, { docSuffix: "-final", noteSuffix: "ยอดคงเหลือ 50% หลัง (ครบแล้ว)" });
    // 🦆 ออเดอร์มัดจำเพิ่งชำระครบ → บวกแต้มสะสม (idempotent)
    void awardPointsForOrder(toSave);
  }

  return NextResponse.json({ ok: true, order: toSave });
}
