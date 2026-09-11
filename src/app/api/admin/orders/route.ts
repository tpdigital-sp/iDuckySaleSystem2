import { NextResponse } from "next/server";
import { withArtQtyMap } from "@/lib/edit-selections";
import { bkkYmd, thaiDateTime } from "@/lib/bangkok-time";
import { randomBytes } from "node:crypto";
import { currentActor, requirePerm } from "@/lib/server/require-perm";
import { can, canPack, PACK_SCAN_HEADER } from "@/lib/permissions";
import { loadRolePerms } from "@/lib/server/role-perms";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { KEY_STATUSES, notifyCustomer, notifyCustomerLogged, orderLink, statusFlex, statusMessage } from "@/lib/server/notify";
import { reportPaidToTP, syncArrivalToTP, syncCustomerToTP, syncRushToTP } from "@/lib/server/tp-report";
import { signPaymentUrls, stripPaymentUrls } from "@/lib/server/slip-sign";
import { bumpSoldForOrder, unbumpSoldForOrder } from "@/lib/server/sold";
import { cutStockForOrder, restoreStockForOrder } from "@/lib/server/stock";
import { awardPointsForOrder, revokePointsForOrder } from "@/lib/server/contact-points";
import {
  adminDiscountAmount,
  hasUnpaidBalance,
  orderBalance,
  orderTotal,
  orderVatAmount,
  lockEarlyPay,
  packGate,
  partialGate,
  proofsOf,
  shipmentQty,
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
  return inc.filter((s) => s && typeof s.tracking === "string" && s.tracking.trim() && !had.has(s.tracking.trim()) && Array.isArray(s.proofs));
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
  return out;
}

/** แอดมินสิทธิ์เต็ม: ก้อนที่ส่งมาคือของจริงทั้งใบ ยกเว้นติ๊ก/แบบงานที่หน้าจอนั้นยังไม่เคยเห็น (จับคู่รายการตามลำดับ+ชื่อ) */
function reconcileFullEdit(existing: Order, incoming: Order, clientSavedAt: string, now: string): Order {
  const items = (incoming.items ?? []).map((inc, i) => {
    const cur = existing.items?.[i];
    return cur && cur.name === inc.name ? reconcileItem(cur, inc, clientSavedAt, now) : inc;
  });
  // ฟิลด์ที่เซิร์ฟเวอร์เป็นเจ้าของ — หน้าจอแอดมินไม่รู้จัก ส่งก้อนกลับมาโดยไม่มี = ห้ามหาย
  return { ...incoming, items, balanceNotified: existing.balanceNotified };
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

  // เลขพัสดุ + เปลี่ยนสถานะเป็น "จัดส่งแล้ว" ทำได้เฉพาะคนที่มีสิทธิ์ยิงเลขพัสดุ
  if (mayShip && typeof incoming.tracking === "string") {
    merged.tracking = incoming.tracking;
    if (incoming.status === "จัดส่งแล้ว" && existing.status !== "เสร็จสิ้น") {
      merged.status = "จัดส่งแล้ว" as OrderStatus;
    }
  }
  // 🚚 แบ่งส่ง: รอบใหม่ต่อท้ายได้ (สิทธิ์ยิงเลขเดียวกัน) · รอบเดิมแตะไม่ได้ · สถานะใบไม่เปลี่ยน (ยังไม่ปิดจนกว่าจะยิงรอบสุดท้าย)
  if (mayShip && Array.isArray(incoming.shipments)) merged.shipments = appendShipments(existing, incoming);

  return merged; // log รวมกลางที่ PATCH (mergeLogs)
}

/**
 * ฝ่ายกราฟฟิก (proof.manage แต่ไม่มี orders.edit) บันทึกได้เฉพาะงานแบบ — เอาออเดอร์เดิมเป็นฐาน แล้วทับเฉพาะ:
 *   แบบงาน (items[].proofs ทั้งชุด — ลบ/แก้จำนวน/หน่วย/รายละเอียด/ใช้ลายเป็นแบบ) · สถานะแบบ (proofStatus/proofNote/proofUpdatedAt)
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
    return {
      ...g,
      proofs: reconcileProofs(g.proofs ?? [], inc.proofs, clientSavedAt, now),
      proofStatus: inc.proofStatus,
      proofNote: inc.proofNote,
      proofUpdatedAt: inc.proofUpdatedAt ?? g.proofUpdatedAt,
    };
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
 * ดึงด้วย jsonb projection ให้ Postgres ตัดฟิลด์ให้ตั้งแต่ต้นทาง (ไม่ใช่ดึงทั้งก้อนมาตัดทีหลัง)
 * วัดจริง 66 ใบ: ทั้งก้อน 137 KB / ~440 ms → เบา 16 KB / ~275 ms
 */
const LITE_SELECT = [
  "id:data->>id",
  "customer:data->>customer",
  "phone:data->>phone",
  "email:data->>email",
  "customerId:data->>customerId",
  "status:data->>status",
  "date:data->>date",
  "lineChatUrl:data->>lineChatUrl",
  "lineUserId:data->>lineUserId",
  "lineProfile:data->lineProfile",
].join(",");

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

  // โหมดเบา — หน้ารายละเอียดขอตารางทั้งหมดไว้ทำแค่ 2 อย่าง (ออเดอร์อื่นของลูกค้าคนเดียวกัน + เดาห้องแชท
  // LINE จากใบเก่า) ส่งทั้งก้อนไปเปลืองเปล่า ๆ · items:[] ใส่ไว้ให้โค้ดฝั่งหน้าเว็บที่วนรายการไม่พัง
  if (lite && !wantId) {
    const { data: rows, error: liteErr } = await sb
      .from("orders")
      .select(LITE_SELECT)
      .order("created_at", { ascending: false });
    if (liteErr) {
      if (liteErr.code === "42P01" || liteErr.code === "PGRST205" || /schema cache|does not exist/i.test(liteErr.message))
        return NextResponse.json({ orders: [], needsSetup: true });
      return NextResponse.json({ error: liteErr.message, orders: [] }, { status: 500 });
    }
    const liteRows = (rows ?? []) as unknown as Record<string, unknown>[];
    return NextResponse.json({ orders: liteRows.map((r) => ({ ...r, items: [] })) });
  }
  let q = sb.from("orders").select("data").order("created_at", { ascending: false });
  if (wantId) q = q.eq("id", wantId);
  const { data, error } = await q;
  if (error) {
    // ตารางยังไม่ถูกสร้าง → บอกให้รัน SQL (ไม่ถือเป็น error ร้ายแรง)
    if (error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message))
      return NextResponse.json({ orders: [], needsSetup: true });
    return NextResponse.json({ error: error.message, orders: [] }, { status: 500 });
  }

  const orders = (data ?? []).map((r) => r.data as Order);
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
  };
  order = withLog(order, by, "สร้างออเดอร์จากหลังบ้าน", "งานพิเศษ/สั่งแทนลูกค้า");

  const { error } = await sb.from("orders").insert({ id, data: order });
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

  // ดึงออเดอร์เดิม — ฝ่ายแพ็คใช้เป็นฐาน merge · ทุกคนใช้เทียบสถานะเก่าเพื่อแจ้งเตือน
  const { data: row, error: gErr } = await sb.from("orders").select("data").eq("id", order.id).single();
  if (gErr || !row) return NextResponse.json({ error: "ไม่พบออเดอร์นี้" }, { status: 404 });
  const existing = row.data as Order;
  const oldStatus = existing.status;

  // มีการ "ยิงเลขพัสดุใหม่" ในคำขอนี้ไหม (ใช้ตัดสินเรื่องด่านตรวจ)
  const wantsTracking =
    typeof order.tracking === "string" && order.tracking.trim() !== "" && order.tracking.trim() !== (existing.tracking ?? "");

  let toSave: Order;
  if (mayEditFull) {
    // ก้อนจากหน้าจอแอดมินเป็นหลัก แต่ติ๊ก/แบบงานที่หน้าจอนั้นยังไม่เคยเห็น (คนอื่นเพิ่งทำ) ต้องไม่หาย
    toSave = reconcileFullEdit(existing, order, clientSavedAt, now);
    // แอดมินยิงเลขทั้งที่ด่านตรวจยังไม่ครบ = อนุญาต (ตัดสินใจเอง) แต่บันทึก log ฝั่งเซิร์ฟเวอร์เสมอ — ตรวจย้อนหลังได้ว่าใครข้าม
    if (wantsTracking) {
      const g = packGate(existing);
      if (!g.ready) {
        toSave = withLog(toSave, actor.name || actor.username, "⚠️ ข้ามด่านตรวจ — ยิงเลขพัสดุ", gateReasons(g));
      }
    }
    // 🚚 แอดมินยิงรอบแบ่งส่งทั้งที่รูปที่เลือกยังตรวจไม่ครบ = อนุญาต แต่ลง log เหมือนข้ามด่านปกติ
    for (const sh of newShipmentsOf(existing, order)) {
      const pg = partialGate(existing, sh.proofs.map((p) => `${p.item}:${p.proof}`));
      if (!pg.ready)
        toSave = withLog(toSave, actor.name || actor.username, "⚠️ ข้ามด่านตรวจ — ส่งบางส่วน", `${sh.tracking} · ${pg.reasons.join(" · ")}`);
    }
  } else {
    toSave = existing;
    if (mayPack) {
      // ฝ่ายแพ็ค: ห้ามข้ามเด็ดขาด — เช็คด่านจากข้อมูลล่าสุด (รวมผลตรวจที่เพิ่งส่งมาในคำขอนี้)
      const mergedNoShip = mergePackFields(existing, order, false);
      if (wantsTracking && !packGate(mergedNoShip).ready) {
        return NextResponse.json(
          { error: `ยังยิงเลขพัสดุไม่ได้ — ${gateReasons(packGate(mergedNoShip))}` },
          { status: 409 }
        );
      }
      // 🚚 รอบแบ่งส่ง: ตรวจเฉพาะรูปที่เลือกไปรอบนี้ — ฝ่ายแพ็คข้ามไม่ได้เช่นกัน
      for (const sh of newShipmentsOf(existing, order)) {
        const pg = partialGate(mergedNoShip, sh.proofs.map((p) => `${p.item}:${p.proof}`));
        if (!pg.ready) return NextResponse.json({ error: `ยังส่งบางส่วนไม่ได้ — ${pg.reasons.join(" · ")}` }, { status: 409 });
      }
      toSave = mergePackFields(existing, order, canPack(actor, "pack.ship", rolePerms, scanned));
    }
    // กราฟฟิก (มีหรือไม่มีสิทธิ์แพ็คร่วมด้วยก็ได้) → ทับฟิลด์งานแบบต่อจากผลแพ็ค
    if (mayProof) toSave = mergeProofFields(toSave, order, clientSavedAt, now);
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
  const paidStageBefore = !(["รอชำระเงิน", "รอตรวจสอบ", "ยกเลิก"] as OrderStatus[]).includes(existing.status);
  if (mayEditFull && !toSave.deposit && !toSave.claimOf && toSave.paidTotal == null && paidStageBefore && orderTotal(toSave) > orderTotal(existing) + 0.5)
    toSave = { ...toSave, paidTotal: orderTotal(existing) };

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
  // จำยอดที่กำลังบอกลูกค้า (ทั้งขึ้นและลง) — รอบหน้าจะได้รู้ว่าลูกค้าถือเลขไหนอยู่ · ลดจนเหลือ 0 ไม่เปลี่ยนสถานะให้ (แอดมินตั้งเอง กันซ้ำ side effect ของ "ชำระแล้ว")
  if (balanceGrew || balanceShrank) toSave = { ...toSave, balanceNotified: { at: now, balance: balNow } };

  toSave = { ...toSave, log: mergeLogs(existing.log, order.log, toSave.log), savedAt: now };

  const { error } = await sb.from("orders").update({ data: toSave }).eq("id", toSave.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const adminName = `แอดมิน ${actor.name?.trim() || actor.username}`;

  if (balanceGrew) {
    const origin = new URL(req.url).origin;
    const total = orderTotal(toSave);
    const bal = balNow;
    const why = vatJustAdded
      ? `ภาษีมูลค่าเพิ่ม ${toSave.vat!.rate}% ${orderVatAmount(toSave).toLocaleString("th-TH")} บาท (ออกใบกำกับภาษีตามที่ขอ)`
      : `ยอดรวมเปลี่ยนเป็น ${total.toLocaleString("th-TH")} บาท`;
    void notifyCustomerLogged(
      sb,
      toSave,
      `🧾 ออเดอร์ ${toSave.id} มียอดเพิ่ม: ${why}\n💰 ยอดรวมทั้งบิล ${total.toLocaleString("th-TH")} บาท · รับแล้ว ${(toSave.paidTotal ?? 0).toLocaleString("th-TH")} บาท\n💳 ยอดที่ต้องโอนเพิ่ม ${bal.toLocaleString("th-TH")} บาท\nโอนแล้วแนบสลิปที่ลิงก์นี้ได้เลยครับ\n${orderLink(origin, toSave)}`,
      `แจ้งยอดค้างเพิ่ม ${bal.toLocaleString("th-TH")} บาท${vatJustAdded ? " (เปิด VAT)" : ""}`,
      "key"
    );
  } else if (balanceShrank) {
    const origin = new URL(req.url).origin;
    const total = orderTotal(toSave);
    const thb = (n: number) => n.toLocaleString("th-TH");
    // บอกว่าลดเพราะอะไร — ส่วนลดทั้งบิลที่เพิ่งใส่/เพิ่ม (กรณีที่เจอจริง) · นอกนั้นบอกยอดรวมใหม่
    const discDiff = Math.round((adminDiscountAmount(toSave) - adminDiscountAmount(existing)) * 100) / 100;
    const why =
      discDiff > 0
        ? `ส่วนลด${toSave.adminDiscount?.label?.trim() ? ` ${toSave.adminDiscount.label.trim()}` : ""} −${thb(discDiff)} บาท`
        : `ยอดรวมเปลี่ยนเป็น ${thb(total)} บาท`;
    const prev = thb(notified!.balance);
    void notifyCustomerLogged(
      sb,
      toSave,
      balNow > 0
        ? `🧾 ออเดอร์ ${toSave.id} ปรับยอดใหม่: ${why}\n💰 ยอดรวมทั้งบิล ${thb(total)} บาท · รับแล้ว ${thb(toSave.paidTotal ?? 0)} บาท\n💳 ยอดที่ต้องโอนเพิ่ม ${thb(balNow)} บาท (แทนยอด ${prev} บาทที่แจ้งไว้ก่อนหน้า)\nโอนแล้วแนบสลิปที่ลิงก์นี้ได้เลยครับ\n${orderLink(origin, toSave)}`
        : `🧾 ออเดอร์ ${toSave.id} ปรับยอดใหม่: ${why}\n💰 ยอดรวมทั้งบิล ${thb(total)} บาท · รับแล้ว ${thb(toSave.paidTotal ?? 0)} บาท\n✅ ไม่ต้องโอนเพิ่มแล้วครับ (ยกเลิกยอด ${prev} บาทที่แจ้งไว้ก่อนหน้า)\n${orderLink(origin, toSave)}`,
      balNow > 0 ? `แจ้งยอดค้างใหม่ ${thb(balNow)} บาท (เดิมแจ้ง ${prev})` : `แจ้งว่าไม่ต้องโอนเพิ่มแล้ว (เดิมแจ้ง ${prev} บาท)`,
      "key"
    );
  }

  // 🔥 ติ๊ก/ยกเลิกงานเร่ง หรือแก้วันที่ลูกค้าต้องใช้งาน/ช่วงวันจัดส่ง → ส่งต่อให้บอร์ด WIP กราฟฟิก (เฉพาะใบที่ชำระแล้วมีเรคอร์ดอยู่ · ใบอื่น not-found ข้ามเงียบ)
  const shipKey = (o: Order) => `${o.shipDate?.from || ""}|${o.shipDate?.to || ""}`;
  if (mayEditFull && (!!toSave.rush !== !!existing.rush || (toSave.useByDate || "") !== (existing.useByDate || "") || shipKey(toSave) !== shipKey(existing)))
    void syncRushToTP(toSave);
  // 👤 แอดมินแก้ชื่อผู้รับ/เบอร์ → อัปเดตการ์ดบอร์ด WIP ให้ตรงหน้าออเดอร์ (เก็บชื่อเก่าไว้ให้จับคู่โฟลเดอร์เดิมได้)
  if (mayEditFull) void syncCustomerToTP(existing, toSave);
  // 📦 ฝ่ายแพ็คปักของยังไม่มา/มาไม่ครบ/มาครบ → ส่งไปหน้า "ติดตามของ iDucky" ในระบบ TP (ยิงเฉพาะรายการที่เปลี่ยน)
  void syncArrivalToTP(existing, toSave);
  // มัดจำงวดแรกเพิ่งยืนยัน (มือ) ในคำขอนี้ — ใช้แยกรูปแบบรายงาน msVerify
  const depositFirstNow = !!toSave.deposit?.firstPaidAt && !existing.deposit?.firstPaidAt;

  // แจ้งเตือนลูกค้าเมื่อสถานะเปลี่ยนไปขั้นสำคัญ (เงียบถ้ายังไม่ตั้งค่า LINE) — กลับไปรอชำระเงินเพราะยอดโต แจ้งด้วยข้อความยอดค้างด้านบนแล้ว
  if (toSave.status !== oldStatus && !quoteJustPriced && !(reopenedForBalance && balanceGrew)) {
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
    if (toSave.status === "ชำระแล้ว")
      void reportPaidToTP(
        toSave,
        adminName,
        depositFirstNow ? { amount: toSave.deposit!.amount, noteSuffix: "มัดจำ 50% งวดแรก" } : undefined
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
        `🛠️ ออเดอร์ ${toSave.id} เข้าไลน์ผลิตแล้วครับ\n💳 เหลือยอดค้าง ${bal.toLocaleString()} บาท — โอนแล้วแนบสลิปได้ที่ลิงก์นี้เลย (ทางร้านจัดส่งได้หลังชำระครบ)\n${link}`,
        "ทวงยอดคงเหลือ (เข้าไลน์ผลิต)"
      );
      toSave = { ...toSave, deposit: { ...toSave.deposit, balanceRemindedAt: new Date().toISOString() } };
      void sb.from("orders").update({ data: toSave }).eq("id", toSave.id);
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
        .map((p) => `• ${p.itemName ?? toSave.items[p.item]?.name ?? "รายการ"} รูปที่ ${p.proof + 1}${p.qty ? ` × ${p.qty.toLocaleString("th-TH")} ${p.unit || "ชิ้น"}` : ""}`)
        .join("\n");
      void notifyCustomerLogged(
        sb,
        toSave,
        `🚚 ออเดอร์ ${toSave.id} จัดส่งบางส่วนแล้วครับ (รอบที่ ${round})\nเลขพัสดุ: ${sh.tracking}${qty ? `\nรอบนี้ ${qty.toLocaleString("th-TH")} ชิ้น` : ""}\n${lines}${sh.note ? `\n📝 ${sh.note}` : ""}\nส่วนที่เหลือจะจัดส่งในรอบถัดไป แล้วแจ้งเลขพัสดุอีกครั้งครับ\n${link}`,
        `แจ้งส่งบางส่วน รอบที่ ${round} · ${sh.tracking}`,
        "key"
      );
    });
  }

  // 📦 แอดมินเพิ่งยืนยันสต๊อก/คิวผลิตของรายการที่สั่งจำนวนมาก → แจ้งลูกค้าทางไลน์ทันที
  const stockJustConfirmed = existing.items.filter(
    (old, i) => old.needStockCheck && !toSave.items[i]?.needStockCheck && old.name === toSave.items[i]?.name
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
      `✅ เช็คสต๊อกเรียบร้อยแล้วครับ — ผลิตได้ตามจำนวนที่สั่ง\n${lines}${ship}\nออเดอร์ ${toSave.id}\n${orderLink(origin, toSave)}`
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
      .map((old, i) => ({ old, now: toSave.items[i] }))
      .filter((p) => p.old.unitPrice <= 0 && p.now && p.now.name === p.old.name)
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
      `💬 ตีราคางานสั่งทำให้แล้วครับ — ออเดอร์ ${toSave.id}\n${quoted}\n\n💰 ยอดรวมทั้งบิล ${total.toLocaleString("th-TH")} บาท${
        bal !== total ? `\n💳 ยอดที่ต้องโอน ${bal.toLocaleString("th-TH")} บาท` : ""
      }\nโอนแล้วแนบสลิปที่ลิงก์นี้ได้เลยครับ\n${orderLink(origin, toSave)}`,
      `แจ้งราคาที่ตีให้ (ยอดรวม ${total.toLocaleString("th-TH")} บาท)`,
      "key" // เรื่องเงิน — ส่งแม้ลูกค้าเลือกรับเฉพาะเรื่องสำคัญ
    );
  }

  // มัดจำ: แอดมินยืนยันรับยอดคงเหลือครบในคำขอนี้ → แจ้งลูกค้า + ส่งเรคอร์ดงวดหลังเข้า msVerify
  if (toSave.deposit?.settledAt && !existing.deposit?.settledAt) {
    const origin = new URL(req.url).origin;
    const bal = Math.max(0, orderTotal(toSave) - (existing.paidTotal ?? toSave.deposit.amount));
    void notifyCustomerLogged(sb, toSave, `✅ รับยอดคงเหลือออเดอร์ ${toSave.id} ครบแล้ว ขอบคุณครับ\n${orderLink(origin, toSave)}`, "ยืนยันรับยอดคงเหลือครบ");
    void reportPaidToTP(toSave, adminName, { docSuffix: "-final", amount: bal, noteSuffix: "ยอดคงเหลือ 50% หลัง (ครบแล้ว)" });
    // 🦆 ออเดอร์มัดจำเพิ่งชำระครบ → บวกแต้มสะสม (idempotent)
    void awardPointsForOrder(toSave);
  }

  return NextResponse.json({ ok: true, order: toSave });
}
