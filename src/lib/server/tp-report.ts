import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/server/firebase-admin";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderTotal, proofsOf, type Order } from "@/lib/admin-data";
import { SITE_URL } from "@/lib/shop-info";

/**
 * ส่งออเดอร์ที่ "ชำระแล้ว" ไปหน้าตรวจหลักฐานการชำระของระบบ Admin (msVerify)
 * — เขียนลง Firestore (โปรเจกต์ tpdigital-iducky, db tp-fixflow) collection iduckyPaidOrders
 * หน้า msVerify subscribe collection นี้แล้วแสดงใน subtab "iDucky Store"
 *
 * Fire-and-forget: พังเงียบ (log ไว้) — ห้ามทำให้ flow ยืนยันเงินของร้านล้ม
 * Idempotent: doc id = เลขออเดอร์ + .create() → ยิงซ้ำกี่ครั้งก็มีเรคอร์ดเดียว
 */
export const TP_PAID_COLLECTION = "iduckyPaidOrders";

/** bucket สลิปส่วนตัว — ต้องเซ็น URL ก่อนถึงจะเปิดดูได้ */
const SLIP_BUCKET = "payment-slips-private";
/** อายุลิงก์สลิปที่ส่งไปให้ msVerify — ยาว 1 ปี เพราะฝั่งนั้นเก็บไว้ดูย้อนหลัง (เซ็นสั้น = รูปเสียตอนเปิดดูทีหลัง) */
const SLIP_URL_TTL_SEC = 365 * 24 * 60 * 60;

/**
 * ลิงก์สลิปสำหรับส่งข้ามระบบ — งวดแรกใช้ order.slipPath · งวดหลัง (มัดจำ 50%) ใช้ deposit.balanceSlipPath
 * ออเดอร์เก่าที่เก็บเป็น public URL ถาวร (slipUrl) ส่งไปตรงๆ ได้เลย
 */
async function slipLinkFor(order: Order, isFinal: boolean, override?: string): Promise<{ slipUrl: string; slipPath: string }> {
  // สลิปใบเพิ่ม (order.payments[]) ระบุ path มาเอง — ไม่ใช่ช่องหลักทั้งสอง
  const path = override ?? (isFinal ? order.deposit?.balanceSlipPath : order.slipPath);
  if (!path) return { slipUrl: !isFinal && order.slipUrl ? order.slipUrl : "", slipPath: "" };
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return { slipUrl: "", slipPath: path };
    const { data } = await sb.storage.from(SLIP_BUCKET).createSignedUrl(path, SLIP_URL_TTL_SEC);
    return { slipUrl: data?.signedUrl ?? "", slipPath: path };
  } catch {
    return { slipUrl: "", slipPath: path };
  }
}

/**
 * ยอดที่เข้าบัญชีจริงตามที่ SlipOK อ่านจากสลิป — ลูกค้าบางคนโอน "ยอดเต็ม" ไม่หักส่วนลดโอนไว ฿5/฿10
 * (เช่น OD-260908-3989 ออเดอร์ 3,740 แต่โอน 3,750) ถ้าส่งยอดออเดอร์ไป msVerify จะจับคู่กับธนาคารไม่เจอ
 */
function slipVerifiedAmount(order: Order, isFinal: boolean): number | undefined {
  const v = isFinal ? order.deposit?.balanceVerify : order.slipVerify;
  return v?.status === "pass" && typeof v.amount === "number" && v.amount > 0 ? v.amount : undefined;
}

export async function reportPaidToTP(
  order: Order,
  verifiedBy: string,
  opts?: {
    /** ต่อท้าย doc id — ใช้กับงวดที่สองของออเดอร์มัดจำ (กันชนกับเรคอร์ดงวดแรก) */
    docSuffix?: string;
    /** ยอดของงวดนี้ (ไม่ระบุ = paidTotal/ยอดออเดอร์) */
    amount?: number;
    /** ข้อความต่อท้าย note เช่น "มัดจำ 50% งวดแรก" */
    noteSuffix?: string;
    /** path สลิปใบที่รายงานนี้พูดถึง — สลิปใบเพิ่ม (order.payments[]) ที่ไม่ได้อยู่ช่องหลัก */
    slipPath?: string;
    /**
     * 💸 เรคอร์ดนี้เป็น "สลิปใบเพิ่ม" (docSuffix -p…) — msVerify เอาไปจับคู่กับแถวโอนของธนาคารเป็นรายใบ
     * บอร์ด WIP กราฟฟิกต้องข้าม (ไม่ใช่งานใหม่ · การ์ดมีจากเรคอร์ดหลักแล้ว)
     */
    extra?: boolean;
    /** 💸 สลิปแท้แต่โอนขาด — นับยอดบางส่วน ยังไม่ครบงวด (บอร์ด WIP ยังไม่ขึ้นการ์ดจนกว่าจะครบ → syncPaidCompleteToTP) */
    partial?: boolean;
  }
): Promise<void> {
  try {
    const db = getFirestoreAdmin();
    if (!db) return; // ยังไม่ตั้งค่า Firebase — ข้ามเงียบ
    const now = new Date();
    // วันเวลาแบบไทย (Asia/Bangkok) ให้ตรงรูปแบบที่ msVerify ใช้ (date=YYYY-MM-DD, time=HH:MM)
    const th = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const part = (t: string) => th.find((p) => p.type === t)?.value ?? "";
    const isFinal = opts?.docSuffix === "-final";
    const slip = await slipLinkFor(order, isFinal, opts?.slipPath);
    const itemSummary = order.items
      .map((i) => `${i.name} ×${i.qty}`)
      .join(", ")
      .slice(0, 120);

    await db
      .collection(TP_PAID_COLLECTION)
      .doc(`${order.id}${opts?.docSuffix ?? ""}`)
      .create({
        id: `iducky-${order.id}${opts?.docSuffix ?? ""}`,
        orderId: order.id,
        date: `${part("year")}-${part("month")}-${part("day")}`,
        time: `${part("hour")}:${part("minute")}`,
        customerName: order.customer,
        phone: order.phone || "",
        // ยอดสลิป = งวดที่ผู้เรียกระบุ > ยอดที่ SlipOK อ่านได้จริง > ยอดที่จ่าย/ยอดออเดอร์
        slipAmount: opts?.amount ?? slipVerifiedAmount(order, isFinal) ?? order.paidTotal ?? orderTotal(order),
        // ยอดตามออเดอร์ (หลังส่วนลด) + ส่วนลดโอนไว — msVerify ใช้เทียบ และยอมส่วนต่าง 5/10 ตอนจับคู่กับธนาคาร
        // งวดหลัง/ใบเพิ่ม/รับบางส่วน = ยอดของ "ใบนี้" ไม่ใช่ทั้งบิล (ไม่งั้น msVerify ขึ้น "⚠ ต่าง" ทุกใบที่ไม่ใช่ใบเดียวจบ)
        orderTotal: isFinal || opts?.extra || opts?.partial ? opts?.amount ?? 0 : orderTotal(order),
        // 💸 ชนิดเรคอร์ด: first = ใบหลัก · final = งวดหลังมัดจำ · extra = สลิปใบเพิ่ม (บอร์ด WIP ข้าม) · partial = ยังไม่ครบงวด
        installment: isFinal ? "final" : opts?.extra ? "extra" : "first",
        partial: !!opts?.partial,
        earlyPay: order.earlyPay?.amount ?? 0,
        bank: "iDucky Store",
        orderLink: `${SITE_URL}/admin/orders/${encodeURIComponent(order.id)}`,
        note: opts?.noteSuffix ? `${opts.noteSuffix} · ${itemSummary}`.slice(0, 120) : itemSummary,
        // 📦 รายการสินค้าแบบโครงสร้าง — msVerify/msDaily เอาไปใส่คอลัมน์ "รายการสินค้า" (note ถูกตัด 120 ตัวอักษร ใช้ parse ไม่ครบ)
        items: order.items.map((i) => ({ name: i.name, qty: i.qty })),
        // ข้อความหมายเหตุล้วน ๆ (ไม่ปนรายการสินค้า) เช่น "มัดจำ 50% งวดแรก" — ว่างได้
        noteText: opts?.noteSuffix ?? "",
        // สลิปโอน — msVerify เอาไปโชว์เป็นรูปย่อในตาราง (ลิงก์เซ็นอายุ 1 ปี · เก็บ path ไว้เซ็นใหม่ได้)
        slipUrl: slip.slipUrl,
        slipPath: slip.slipPath,
        slipSignedAt: now.toISOString(),
        verifiedBy,
        // 🔥 งานเร่ง + วันที่ลูกค้าต้องใช้งาน — บอร์ด WIP กราฟฟิกเอาไปติดป้ายแดง/จัดคิว (แก้ทีหลังผ่าน syncRushToTP)
        rush: !!order.rush,
        useByDate: order.useByDate || "",
        // 📦 ช่วงวันจัดส่ง (จาก–ถึง) — บอร์ด WIP โชว์คู่กับวันใช้งานบนป้ายงานเร่ง
        shipDate: tpShipDate(order),
        paymentStatus: "ชำระแล้ว",
        origin: "iducky",
        createdAt: now.toISOString(),
      });
  } catch (e) {
    // already-exists (ยิงซ้ำ) = ปกติ · อย่างอื่น log ไว้ดู
    const code = (e as { code?: number | string })?.code;
    if (code !== 6 && code !== "already-exists")
      console.error("[tp-report] ส่งออเดอร์ไป msVerify ไม่สำเร็จ:", (e as Error)?.message);
  }
}

/**
 * 💸 รับครบผ่านสลิปหลายใบ — เรคอร์ดหลัก (doc id = เลขออเดอร์) ถูกสร้างตอน "รับบางส่วน" พร้อม partial:true
 * บอร์ด WIP กราฟฟิกข้ามการ์ดที่ partial อยู่ → พอครบงวด (สลิปใบเพิ่มผ่าน/แอดมินรับยอดเอง) ต้องปลดธงให้การ์ดขึ้น
 * ไม่มีเรคอร์ดหลัก (เช่น รับบางส่วนตอนระบบเก่า) → สร้างใหม่ด้วยยอดที่รับรวม
 */
export async function syncPaidCompleteToTP(order: Order, verifiedBy: string, note?: string): Promise<void> {
  try {
    const db = getFirestoreAdmin();
    if (!db) return;
    const ref = db.collection(TP_PAID_COLLECTION).doc(order.id);
    const snap = await ref.get();
    if (!snap.exists) {
      await reportPaidToTP(order, verifiedBy, { amount: order.paidTotal, noteSuffix: note ?? "รับครบผ่านสลิปหลายใบ" });
      return;
    }
    await ref.set({ partial: false, paymentStatus: "ชำระแล้ว", paidCompleteAt: new Date().toISOString(), paidCompleteBy: verifiedBy }, { merge: true });
  } catch (e) {
    console.error("[tp-report] ปลดธงรับบางส่วนไม่สำเร็จ:", (e as Error)?.message);
  }
}

/**
 * 📦 ติดตามของยังไม่มา/มาไม่ครบ → หน้า "ติดตามของ iDucky" ในระบบ TP-Leader (pack-followup.html)
 * เขียนลง tp-fixflow collection iduckyPackFollowups · doc id = <เลขออเดอร์>__<ลำดับรายการ>
 * ยิงเฉพาะรายการที่ arrival "เปลี่ยน" ในคำขอนี้ (เทียบก่อน/หลัง) · merge:true เพื่อไม่ทับฟิลด์ที่ฝั่ง TP เขียน (tp*)
 * "มาครบ" = open:false + resolvedAt — เก็บไว้เป็นประวัติ ฝั่ง TP โชว์ในแท็บปิดแล้ว
 * Fire-and-forget เหมือน reportPaidToTP
 */
export const TP_FOLLOWUP_COLLECTION = "iduckyPackFollowups";

export async function syncArrivalToTP(before: Order, after: Order): Promise<void> {
  const db = getFirestoreAdmin();
  if (!db) return;
  const now = new Date().toISOString();
  for (let i = 0; i < after.items.length; i++) {
    const it = after.items[i];
    const a = it.arrival;
    if (!a) continue;
    const b = before.items[i]?.arrival;
    if (b && JSON.stringify(a) === JSON.stringify(b)) continue; // ไม่เปลี่ยน — ไม่ยิง
    const open = a.status !== "มาครบ";
    const proofs = proofsOf(it);
    // เริ่ม "รอบใหม่" (เดิมไม่เคยปัก หรือมาครบไปแล้ว → ปักยังไม่มา/มาไม่ครบอีกครั้ง) → ล้างคำตอบฝ่ายผลิตของรอบก่อนทิ้ง
    // ไม่งั้นการ์ดใน TP โชว์ "รับเรื่องแล้ว ส่งได้ <วันเก่า>" ทั้งที่เป็นเรื่องใหม่ (เจอตอนทดสอบ 9 ก.ย. 69) · tpHistory คงไว้เป็นประวัติ
    const newRound = open && (!b || b.status === "มาครบ");
    const clearReply = newRound
      ? { tpStatus: FieldValue.delete(), tpEta: FieldValue.delete(), tpNote: FieldValue.delete(), tpBy: FieldValue.delete(), tpAt: FieldValue.delete() }
      : {};
    try {
      await db
        .collection(TP_FOLLOWUP_COLLECTION)
        .doc(`${after.id}__${i}`)
        .set(
          {
            id: `iducky-${after.id}__${i}`,
            orderId: after.id,
            itemIndex: i,
            itemName: it.name,
            qty: it.qty,
            unit: it.unitYield?.unit || "ชิ้น",
            customerName: after.customer || "",
            phone: after.phone || "",
            orderLink: `${SITE_URL}/admin/orders/${encodeURIComponent(after.id)}`,
            proofUrl: proofs[0]?.url || "",
            status: a.status,
            got: a.status === "มาไม่ครบ" ? a.got ?? 0 : null,
            expectedAt: open ? a.expectedAt || "" : "",
            note: open ? a.note || "" : "",
            by: a.by,
            at: a.at,
            since: a.since || a.at,
            open,
            resolvedAt: open ? null : a.at,
            rush: !!after.rush,
            useByDate: after.useByDate || "",
            orderStatus: after.status,
            origin: "iducky",
            updatedAt: now,
            ...clearReply,
          },
          { merge: true }
        );
    } catch (e) {
      console.error("[tp-report] ส่งของยังไม่มาไป TP ไม่สำเร็จ:", (e as Error)?.message);
    }
  }
}

/** ฝั่ง TP ตอบกลับอะไรบ้าง (tp* ที่หน้า pack-followup.html เขียน) — สถานีแพ็คเอาไปโชว์ใต้รายการ */
export interface TPFollowupReply {
  id: string;
  orderId: string;
  itemIndex: number;
  open: boolean;
  tpStatus?: string;
  tpNote?: string;
  tpEta?: string;
  tpBy?: string;
  tpAt?: string;
}

/** อ่านรายการติดตามที่ยังเปิดอยู่ทั้งหมด (ฝ่ายผลิตตอบว่าอะไร) — ไม่ตั้งค่า Firebase = คืนว่าง */
export async function fetchOpenFollowupsFromTP(): Promise<TPFollowupReply[]> {
  const db = getFirestoreAdmin();
  if (!db) return [];
  try {
    const snap = await db.collection(TP_FOLLOWUP_COLLECTION).where("open", "==", true).get();
    return snap.docs.map((d) => {
      const x = d.data() as Record<string, unknown>;
      const str = (k: string) => (typeof x[k] === "string" ? (x[k] as string) : undefined);
      return {
        id: d.id,
        orderId: String(x.orderId ?? ""),
        itemIndex: Number(x.itemIndex ?? 0),
        open: true,
        tpStatus: str("tpStatus"),
        tpNote: str("tpNote"),
        tpEta: str("tpEta"),
        tpBy: str("tpBy"),
        tpAt: str("tpAt"),
      };
    });
  } catch (e) {
    console.error("[tp-report] อ่านรายการติดตามจาก TP ไม่สำเร็จ:", (e as Error)?.message);
    return [];
  }
}

/**
 * แอดมินติ๊ก/ยกเลิก "งานเร่ง" หรือแก้วันที่ลูกค้าต้องใช้งาน หลังออเดอร์ชำระแล้ว → อัปเดตเรคอร์ดสะพานให้บอร์ด WIP เห็นตาม
 * เรคอร์ดมีได้ 2 ใบ (งวดแรก + งวดหลัง -final ของมัดจำ 50%) → ยิงทั้งคู่ · ใบที่ยังไม่มี (ยังไม่ชำระ) = not-found ข้ามเงียบ
 * Fire-and-forget เหมือน reportPaidToTP
 */
/** ช่วงวันจัดส่งในรูปที่บอร์ด WIP อ่าน — ไม่มีทั้งคู่ = null (ฝั่งบอร์ดจะประมาณเองจากวันใช้งาน) */
function tpShipDate(order: Order): { from: string; to: string } | null {
  const from = order.shipDate?.from || "";
  const to = order.shipDate?.to || "";
  return from || to ? { from, to } : null;
}

export async function syncRushToTP(order: Order): Promise<void> {
  const db = getFirestoreAdmin();
  if (!db) return;
  const patch = { rush: !!order.rush, useByDate: order.useByDate || "", shipDate: tpShipDate(order), rushUpdatedAt: new Date().toISOString() };
  for (const suffix of ["", "-final"]) {
    try {
      await db.collection(TP_PAID_COLLECTION).doc(`${order.id}${suffix}`).update(patch);
    } catch (e) {
      const code = (e as { code?: number | string })?.code;
      if (code !== 5 && code !== "not-found")
        console.error("[tp-report] อัปเดตงานเร่งไป WIP ไม่สำเร็จ:", (e as Error)?.message);
    }
  }
}
