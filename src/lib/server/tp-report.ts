import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/server/firebase-admin";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { orderEarlyPayAmount, orderTotal, proofsOf, type Order } from "@/lib/admin-data";
import { amountsForRecord, tpAmountsFix } from "@/lib/tp-amounts";
import { SITE_URL } from "@/lib/shop-info";
import { itemQtyText, itemUnitYield } from "@/lib/item-yield";
import { getProductServer } from "@/lib/products-server";

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
 * 🎯 เลขอ้างอิงธุรกรรมที่ SlipOK อ่านได้ของ "สลิปใบที่รายงานนี้พูดถึง" — msVerify ใช้แยกสลิปคนละธุรกรรมที่ยอดเท่ากัน
 * (11 ก.ย. 69: สลิป Gift ฿300 11:53 ถูกบล็อกเพราะชนเรคอร์ด Kaew ฿300 ที่ SlipOK ผ่าน 11:51 — เรคอร์ดไม่มีเลขอ้างอิงให้เทียบ)
 * ใบเพิ่ม (slipPath) → payments[].verify · งวดหลังมัดจำ → deposit.balanceVerify · ใบหลัก → slipVerify
 */
function slipRefNoFor(order: Order, isFinal: boolean, slipPath?: string): string {
  if (slipPath) {
    const p = (order.payments ?? []).find((x) => x.path === slipPath);
    return p?.verify?.transRef?.trim() ?? "";
  }
  const v = isFinal ? order.deposit?.balanceVerify : order.slipVerify;
  return v?.transRef?.trim() ?? "";
}

/** สูตรยอดของเรคอร์ด (bill / wht / received / fee) ย้ายไป @/lib/tp-amounts — ส่งออกต่อให้ที่เดิมยังเรียกได้ */
export { amountsForRecord } from "@/lib/tp-amounts";

export async function reportPaidToTP(
  order: Order,
  verifiedBy: string,
  opts?: {
    /** ต่อท้าย doc id — ใช้กับงวดที่สองของออเดอร์มัดจำ (กันชนกับเรคอร์ดงวดแรก) */
    docSuffix?: string;
    /**
     * 💵 เงินที่เข้าบัญชี **จริง** ของงวดนี้ (ยอดที่ SlipOK อ่านได้ / ยอดที่แอดมินรับจริง)
     * ไม่ระบุ = คิดให้เอง (ยอดบิลของงวด − หัก ณ ที่จ่ายของงวด − ค่าธรรมเนียม) ดู amountsForRecord
     * ⚠️ อย่าส่งยอดบิลก่อนหักมาที่นี่ — ตัวเลขนี้คือยอดที่ต้องตรงกับแถวโอนของธนาคาร
     */
    received?: number;
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
    /**
     * ⏱️ เวลารับเงินจริงของงวดนี้ (ISO) — ไม่ระบุ = เดี๋ยวนี้
     * ใช้ตอน "เติมเรคอร์ดที่หายย้อนหลัง" (tp-bridge-audit) เท่านั้น: msDaily จับคู่กับแถวโอนของธนาคาร "รายวัน"
     * ถ้าเติมวันนี้แล้วประทับวันนี้ เรคอร์ดจะไปโผล่ผิดวันจนจับคู่ไม่ได้
     */
    at?: string;
  }
): Promise<void> {
  try {
    const db = getFirestoreAdmin();
    if (!db) return; // ยังไม่ตั้งค่า Firebase — ข้ามเงียบ
    const healed = opts?.at ? new Date(opts.at) : null;
    const now = healed && !Number.isNaN(healed.getTime()) ? healed : new Date();
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
    const money = amountsForRecord(order, isFinal, opts);
    const slip = await slipLinkFor(order, isFinal, opts?.slipPath);
    /* 🔢 งานเซ็ต/แผ่น — "×17" อ่านเป็น 17 ชิ้น ทั้งที่เป็น 17 เซ็ต (= 102 ชิ้น) · ใช้ข้อความชุดเดียวกับหน้าออเดอร์ */
    const itemSummary = order.items
      .map((i) => `${i.name} ×${itemQtyText(i)}`)
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
        // 💵 เงินที่เข้าบัญชีจริงของงวดนี้ — ตัวเลขที่ต้องตรงกับแถวโอนของธนาคาร
        slipAmount: money.received,
        // ยอดบิลของงวดนี้ก่อนหัก ณ ที่จ่าย (หลังส่วนลด) — msVerify ใช้เทียบ ยอมส่วนต่าง = wht + fee / ส่วนลดโอนไว 5/10
        // งวดมัดจำ/งวดหลัง/ใบเพิ่ม/รับบางส่วน = ยอดของ "ใบนี้" ไม่ใช่ทั้งบิล (ไม่งั้น msVerify ขึ้น "⚠ ต่าง")
        orderTotal: money.bill,
        // 📋 หัก ณ ที่จ่ายของงวดนี้ — msVerify ถือว่ายอดตรงเมื่อ orderTotal − wht − fee = ยอดที่ธนาคารเข้า
        wht: money.wht,
        // 💸 ค่าธรรมเนียมที่ธนาคารหักจากยอดโอน (0 = ไม่มี) — SMART/ข้ามธนาคารเข้าน้อยกว่ายอดโอนไม่กี่บาท
        fee: money.fee,
        // 💸 ชนิดเรคอร์ด: first = ใบหลัก · final = งวดหลังมัดจำ · extra = สลิปใบเพิ่ม (บอร์ด WIP ข้าม) · partial = ยังไม่ครบงวด
        installment: isFinal ? "final" : opts?.extra ? "extra" : "first",
        partial: !!opts?.partial,
        earlyPay: orderEarlyPayAmount(order),
        bank: "iDucky Store",
        orderLink: `${SITE_URL}/admin/orders/${encodeURIComponent(order.id)}`,
        note: opts?.noteSuffix ? `${opts.noteSuffix} · ${itemSummary}`.slice(0, 120) : itemSummary,
        // 📦 รายการสินค้าแบบโครงสร้าง — msVerify/msDaily เอาไปใส่คอลัมน์ "รายการสินค้า" (note ถูกตัด 120 ตัวอักษร ใช้ parse ไม่ครบ)
        // qty = จำนวนที่ลูกค้าสั่ง (หน่วยขาย) · unit/pieces = หน่วยกับจำนวนชิ้นจริง (งานเซ็ต/แผ่น)
        items: order.items.map((i) => {
          const y = itemUnitYield(i);
          return {
            name: i.name,
            qty: i.qty,
            unit: y?.unit || "ชิ้น",
            pieces: i.qty * Math.max(1, y?.per ?? 1),
            piece: y?.piece || "ชิ้น",
          };
        }),
        // ข้อความหมายเหตุล้วน ๆ (ไม่ปนรายการสินค้า) เช่น "มัดจำ 50% งวดแรก" — ว่างได้
        noteText: opts?.noteSuffix ?? "",
        // สลิปโอน — msVerify เอาไปโชว์เป็นรูปย่อในตาราง (ลิงก์เซ็นอายุ 1 ปี · เก็บ path ไว้เซ็นใหม่ได้)
        slipUrl: slip.slipUrl,
        slipPath: slip.slipPath,
        // เวลาที่เซ็นลิงก์สลิป = "ตอนนี้จริง ๆ" เสมอ (อายุ 1 ปีนับจากตรงนี้) — ไม่ใช่เวลารับเงินของเรคอร์ดที่เติมย้อนหลัง
        slipSignedAt: new Date().toISOString(),
        // 🎯 เลขอ้างอิงธุรกรรม (SlipOK transRef) — msVerify เอาไปเทียบตอนตรวจสลิปซ้ำ ("" = ไม่มี เช่น แอดมินยืนยันเอง)
        slipRefNo: slipRefNoFor(order, isFinal, opts?.slipPath),
        verifiedBy,
        // 🔥 งานเร่ง + วันที่ลูกค้าต้องใช้งาน — บอร์ด WIP กราฟฟิกเอาไปติดป้ายแดง/จัดคิว (แก้ทีหลังผ่าน syncRushToTP)
        rush: !!order.rush,
        useByDate: order.useByDate || "",
        // 📦 ช่วงวันจัดส่ง (จาก–ถึง) — บอร์ด WIP โชว์คู่กับวันใช้งานบนป้ายงานเร่ง
        shipDate: tpShipDate(order),
        paymentStatus: "ชำระแล้ว",
        origin: "iducky",
        createdAt: now.toISOString(),
        // 🩹 เรคอร์ดที่เติมย้อนหลัง (ตอนยิงสดหลุดไป) — วัน/เวลาข้างบนคือเวลารับเงินจริง ไม่ใช่เวลาที่เติม
        ...(healed ? { healedAt: new Date().toISOString() } : {}),
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
      await reportPaidToTP(order, verifiedBy, { noteSuffix: note ?? "รับครบผ่านสลิปหลายใบ" });
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

/** 📐 ขนาดงานตายตัวของสินค้า (Product.workSize) — อ่านไม่ได้/ไม่ได้ตั้งไว้ = "" (ไม่ใช่เรื่องคอขาดบาดตาย) */
async function workSizeOf(productId?: string): Promise<string> {
  if (!productId || productId.includes("#") || productId === "special-item") return "";
  try {
    return (await getProductServer(productId))?.workSize?.trim() ?? "";
  } catch {
    return "";
  }
}

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
            // 🔢 ชิ้นจริงของรายการ (งานเซ็ต/แผ่น) + 📐 ขนาดงานตายตัว — ฝ่ายผลิตเช็คของได้โดยไม่ต้องเปิดออเดอร์
            pieces: it.qty * Math.max(1, itemUnitYield(it)?.per ?? 1),
            piece: itemUnitYield(it)?.piece || "ชิ้น",
            size: await workSizeOf(it.productId),
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

/**
 * 👤 ชื่อผู้รับ/เบอร์เปลี่ยนหลังชำระแล้ว (ลูกค้าแก้ที่อยู่เอง หรือแอดมินแก้) → อัปเดตการ์ดบอร์ด WIP ให้ตรงหน้าออเดอร์
 * — การ์ดถูก .create() ครั้งเดียวตอนชำระ ไม่งั้นชื่อบนการ์ด/โฟลเดอร์กราฟฟิกค้างเป็นชื่อเก่า (OD-260910-5703 ลูกค้าเปลี่ยนจากชื่อ LINE เป็นชื่อจริง 11 ก.ย. 69)
 * — เก็บชื่อเก่าไว้ใน customerNameWas[] ให้บอร์ดยังจับคู่โฟลเดอร์ที่ตั้งด้วยชื่อเดิมได้ + โชว์ "ชื่อเดิม" บนการ์ด
 * ใบที่ยังไม่มีเรคอร์ด (ยังไม่ชำระ) → not-found ข้ามเงียบ
 */
export async function syncCustomerToTP(before: Order, after: Order): Promise<void> {
  const oldName = (before.customer || "").trim();
  const newName = (after.customer || "").trim();
  const oldPhone = (before.phone || "").trim();
  const newPhone = (after.phone || "").trim();
  if (oldName === newName && oldPhone === newPhone) return;
  const db = getFirestoreAdmin();
  if (!db) return;
  const patch: Record<string, unknown> = {
    customerName: newName,
    phone: newPhone,
    customerUpdatedAt: new Date().toISOString(),
  };
  if (oldName && oldName !== newName) patch.customerNameWas = FieldValue.arrayUnion(oldName);
  for (const suffix of ["", "-final"]) {
    try {
      await db.collection(TP_PAID_COLLECTION).doc(`${after.id}${suffix}`).update(patch);
    } catch (e) {
      const code = (e as { code?: number | string })?.code;
      if (code !== 5 && code !== "not-found")
        console.error("[tp-report] อัปเดตชื่อลูกค้าไป WIP ไม่สำเร็จ:", (e as Error)?.message);
    }
  }
}

/**
 * 💵 ยอดของเรคอร์ดสะพานเปลี่ยนหลังถูกสร้างไปแล้ว → อัปเดตให้ตรงแถวโอนของธนาคาร
 * (เรคอร์ดสร้างด้วย .create() ครั้งเดียว ยิงซ้ำไม่ทับ — ต้อง update ตรง ๆ แบบเดียวกับ syncRushToTP)
 *
 * เหตุที่ยอดเปลี่ยนได้: แอดมินกรอก "เงินเข้าบัญชีจริง" (ค่าธรรมเนียมธนาคาร) · แก้ยอดบิล/หัก ณ ที่จ่าย
 * · **เปิดโหมดมัดจำ 50% ทีหลัง** — เรคอร์ดค้างยอดทั้งบิลทั้งที่ลูกค้าโอนมาแค่งวดแรก
 *   (OD-260911-8026 บิล 21,946.24 · เรคอร์ดส่ง 21,330.92 · โอนจริงงวดแรก 10,665.46 → msDaily จับคู่ไม่เจอ 14 ก.ย. 69)
 *
 * ยิงทั้งใบหลักและ -final · ใบที่ยังไม่มี (ยังไม่ชำระ) = not-found ข้ามเงียบ
 * ไม่แตะเรคอร์ดสลิปใบเพิ่ม/รับบางส่วน และไม่ทับยอดเข้าจริงที่ SlipOK อ่านไว้เมื่อบิลของงวดไม่เปลี่ยน (ดู tpAmountsFix)
 */
export async function syncAmountsToTP(order: Order): Promise<void> {
  const db = getFirestoreAdmin();
  if (!db) return;
  for (const suffix of ["", "-final"]) {
    const isFinal = suffix === "-final";
    const ref = db.collection(TP_PAID_COLLECTION).doc(`${order.id}${suffix}`);
    try {
      const snap = await ref.get();
      if (!snap.exists) continue;
      const money = tpAmountsFix(order, isFinal, snap.data() ?? {});
      if (!money) continue;
      const patch: Record<string, unknown> = {
        slipAmount: money.received,
        orderTotal: money.bill,
        wht: money.wht,
        fee: money.fee,
        receivedUpdatedAt: new Date().toISOString(),
      };
      // เปิดโหมดมัดจำทีหลัง → เรคอร์ดใบหลักยังไม่มีหมายเหตุว่าเป็นงวดแรก (msVerify โชว์คอลัมน์นี้)
      if (!isFinal && order.deposit && !snap.get("noteText")) {
        const noteSuffix = "มัดจำ 50% งวดแรก";
        patch.noteText = noteSuffix;
        patch.note = `${noteSuffix} · ${snap.get("note") ?? ""}`.slice(0, 120);
      }
      await ref.update(patch);
    } catch (e) {
      const code = (e as { code?: number | string })?.code;
      if (code !== 5 && code !== "not-found") console.error("[tp-report] อัปเดตยอดเรคอร์ดไป msVerify ไม่สำเร็จ:", (e as Error)?.message);
    }
  }
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

/* ===== 🏭 การ์ดกราฟฟิกของออเดอร์เว็บ (wip_graphic_folders "iducky-<OD>") — คิวปริ้นใช้แยกกอง "ส่งผลิตแล้ว/ยังไม่ส่ง" ===== */
export const TP_GRAPHIC_COLLECTION = "wip_graphic_folders";

/** ขั้นงานบนบอร์ดกราฟฟิก TP (DSTATUS ใน tp-wip/graphic-app.js) — ไม่มี dStatus = สร้างการ์ดแล้วยังไม่เริ่ม */
export type TPGraphicStage = "todo" | "doing" | "awaiting" | "approved";

export interface TPGraphicCard {
  orderId: string;
  /** ขั้นปัจจุบัน · undefined = การ์ดมีแต่ยังไม่เข้าขั้นออกแบบ (รอสร้าง/รอโยนโฟลเดอร์) */
  stage?: TPGraphicStage;
  folderName?: string;
  assignee?: string;
  /** กราฟฟิกกดส่งรออนุมัติ (ไฟล์เซ็ตเสร็จ) */
  submittedAt?: string;
  /** ✅ หัวหน้าอนุมัติ = ไฟล์ส่งเข้าฝั่งผลิตแล้ว */
  approvedAt?: string;
  approvedBy?: string;
  /** 🧹 เคลียร์การ์ดออกจากบอร์ด (งานจบฝั่งกราฟฟิก) — นับเป็นส่งผลิตแล้วเช่นกัน */
  cleared?: boolean;
  clearedAt?: string;
  clearedBy?: string;
}

/**
 * อ่านการ์ดกราฟฟิกของออเดอร์ที่ระบุ (getAll ทีละ ≤ 100 ใบ) — ใบที่ไม่มีการ์ดจะไม่อยู่ในผลลัพธ์
 * ไม่ตั้งค่า Firebase / อ่านพลาด → คืน null ให้หน้าจอรู้ว่า "ไม่ทราบ" (ต่างจาก {} = อ่านได้แต่ไม่มีการ์ด)
 */
export async function fetchGraphicCardsFromTP(orderIds: string[]): Promise<Record<string, TPGraphicCard> | null> {
  const db = getFirestoreAdmin();
  if (!db) return null;
  const ids = [...new Set(orderIds.map((x) => x.trim().toUpperCase()).filter((x) => /^OD-\d{6}-\d{3,}$/.test(x)))];
  const out: Record<string, TPGraphicCard> = {};
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const snaps = await db.getAll(...chunk.map((id) => db.collection(TP_GRAPHIC_COLLECTION).doc(`iducky-${id}`)));
      snaps.forEach((d, j) => {
        if (!d.exists) return;
        const x = d.data() as Record<string, unknown>;
        const str = (k: string) => (typeof x[k] === "string" && x[k] ? (x[k] as string) : undefined);
        const stage = str("dStatus");
        out[chunk[j]] = {
          orderId: chunk[j],
          stage: stage === "todo" || stage === "doing" || stage === "awaiting" || stage === "approved" ? stage : undefined,
          folderName: str("folderName"),
          assignee: str("dAssignee"),
          submittedAt: str("dSubmittedAt"),
          approvedAt: str("dApprovedAt"),
          approvedBy: str("dApprovedBy"),
          cleared: x.cleared === true,
          clearedAt: str("clearedAt"),
          clearedBy: str("clearedBy"),
        };
      });
    }
    return out;
  } catch (e) {
    console.error("[tp-report] อ่านการ์ดกราฟฟิกจาก TP ไม่สำเร็จ:", (e as Error)?.message);
    return null;
  }
}
