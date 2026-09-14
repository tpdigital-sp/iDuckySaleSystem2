import "server-only";
import { orderBalance, paidSoFar, type Order } from "@/lib/admin-data";
import { getFirestoreAdmin } from "@/lib/server/firebase-admin";
import { reportPaidToTP, TP_PAID_COLLECTION } from "@/lib/server/tp-report";
import type { getSupabaseAdmin } from "./supabase-admin";

type SB = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * 🩹 ตัวเฝ้าระวัง "ออเดอร์ชำระแล้วแต่ไม่โผล่ในแท็บ 🛒 iDucky Store ของ msVerify"
 *
 * ทำไมต้องมี (พนักงานแจ้ง 14 ก.ย. 69 — OD-260910-4381 ชำระ 10 ก.ย. ไม่ขึ้นเลย):
 * เรคอร์ดสะพานเคยถูกยิงแบบ fire-and-forget หลังตอบ HTTP กลับไปแล้ว · Netlify เป็น serverless
 * พอตอบ response เสร็จมันแช่แข็งเครื่องทันที งานที่ยังค้างอยู่เบื้องหลังจึง "ตายกลางทาง" ได้
 * (วัดจากฐานจริง: ใบที่ SlipOK ยืนยันเอง 130 ใบ มี 17 ใบที่ธง soldCounted ไม่ถูกเขียน = งานหลังตอบถูกตัด
 *  และ 2 ใบที่เรคอร์ด msVerify หายก็อยู่ในกลุ่มนั้นด้วย) → [[iducky-msverify-bridge]]
 *
 * ชั้นกันหลักคือ "await ให้เขียนเสร็จก่อนตอบ" ที่ทุกจุดยิงเรคอร์ด · ตัวนี้เป็นตาข่ายชั้นสอง
 * ดูผลจริงในฐาน (ออเดอร์ที่รับเงินแล้ว ↔ doc ใน iduckyPaidOrders) จึงจับได้แม้พังด้วยเหตุอื่น เช่น Firestore ล่ม
 *
 * ⚠️ ดูย้อนหลังแค่ N วันตามที่ cron สั่ง — เรคอร์ดใบทดสอบเก่าที่ฝั่ง Admin "ตั้งใจลบทิ้ง"
 * (_delete-iducky-test-*.js) จะได้ไม่ถูกสร้างกลับมา
 */

/** เรคอร์ดหนึ่งใบที่ "ควรมี" ในสะพาน — ใบหลัก / งวดหลังมัดจำ / สลิปใบเพิ่ม */
export interface TPBridgeRecord {
  /** doc id ใน iduckyPaidOrders */
  docId: string;
  orderId: string;
  customer: string;
  kind: "first" | "final" | "extra";
  /** เวลารับเงินจริงของงวดนี้ (ISO) — ใช้ประทับวัน/เวลาบนเรคอร์ดตอนเติมย้อนหลัง */
  at: string;
  /** ใครยืนยันเงินเข้า (ข้อความเดียวกับตอนยิงสด) */
  verifiedBy: string;
  /** ยอดเงินเข้าจริงของงวด (เฉพาะสลิปใบเพิ่ม — ใบหลัก/งวดหลังปล่อยให้สูตรคิดเอง) */
  received?: number;
  noteSuffix?: string;
  slipPath?: string;
  extra?: boolean;
  partial?: boolean;
}

const iso = (...v: (string | undefined)[]): string => v.find((x) => !!x) ?? new Date().toISOString();

/** ใครยืนยันเงินเข้าของงวดนี้ — SlipOK ผ่านเอง หรือแอดมินเทียบยอดเอง */
const byOf = (pass: boolean, admin?: string): string => (pass ? "SlipOK อัตโนมัติ" : admin ? `แอดมิน ${admin}` : "แอดมิน (เติมย้อนหลัง)");

/**
 * เรคอร์ดทั้งหมดที่ออเดอร์ใบนี้ "ควรมี" ในสะพาน — ว่าง = ยังไม่มีเงินเข้า/ถูกยกเลิก
 * กติกาเดียวกับจุดที่ยิงสด: ใบหลัก = เงินเข้าช่องแรก · -final = เก็บยอดคงเหลือครบ · -<paymentId> = สลิปใบเพิ่มที่นับยอดแล้ว
 */
export function expectedBridgeRecords(o: Order): TPBridgeRecord[] {
  if (o.status === "ยกเลิก") return [];
  const dep = o.deposit;
  if (!(paidSoFar(o) > 0 || dep?.firstPaidAt)) return []; // ยังไม่มีเงินเข้า
  const out: TPBridgeRecord[] = [];
  const customer = o.customer || "ไม่ระบุชื่อ";

  /**
   * ⚠️ เงินเข้าทาง "ช่องไหน" เป็นตัวตัดสินว่าควรมีเรคอร์ดใบไหน — ห้ามดูแค่ยอดรวม
   * เคส OD-260910-9903: สลิปใบแรก SlipOK ตรวจไม่ได้ (K BIZ ไม่มี QR) แอดมินแนบใบเพิ่มแล้วผ่านเต็มจำนวน
   * → เงินทั้งก้อนอยู่บนเรคอร์ด -<paymentId> ใบเดียว **ไม่มีใบหลัก** · เผลอเติมใบหลักให้ = ยอดซ้ำใน msVerify
   */
  const extraPaid = (o.payments ?? []).some((p) => (p.credited ?? 0) > 0);
  const firstSlot = o.slipVerify?.status === "pass" || (o.slipVerify?.credited ?? 0) > 0;
  const balanceSlot = dep?.balanceVerify?.status === "pass" || (dep?.balanceVerify?.credited ?? 0) > 0;

  // ใบหลัก — ใบธรรมดา = ทั้งบิล · ใบมัดจำ = งวดแรก (เงินเข้าช่องแรก หรือแอดมินยืนยันเองโดยไม่มีใบเพิ่มมาเกี่ยว)
  if (firstSlot || !extraPaid)
    out.push({
      docId: o.id,
      orderId: o.id,
      customer,
      kind: "first",
      at: iso(o.slipVerify?.at, dep?.firstPaidAt, o.paidReportedAt, o.savedAt),
      verifiedBy: byOf(o.slipVerify?.status === "pass"),
      noteSuffix: dep ? "มัดจำ 50% งวดแรก" : undefined,
      // ยังเก็บไม่ครบและงานยังไม่เริ่ม = เรคอร์ด "รับบางส่วน" (บอร์ด WIP ยังไม่ขึ้นการ์ด)
      // ⚠️ ใบที่เดินงานไปแล้วแต่ยอดโตทีหลัง (สั่งเพิ่ม/ค่าบริการ) ไม่ใช่รับบางส่วน — ไม่งั้นการ์ดกราฟฟิกหาย
      partial: !dep && orderBalance(o) > 0.5 && (o.status === "รอชำระเงิน" || o.status === "รอตรวจสอบ"),
    });

  // งวดหลังของมัดจำ 50% — เก็บครบผ่านช่องยอดคงเหลือ (ถ้าครบด้วยใบเพิ่ม เรคอร์ดไปอยู่ที่ใบเพิ่มแทน)
  if (dep?.settledAt && (balanceSlot || !extraPaid))
    out.push({
      docId: `${o.id}-final`,
      orderId: o.id,
      customer,
      kind: "final",
      at: iso(dep.balanceVerify?.at, dep.balanceReportedAt, dep.settledAt),
      verifiedBy: byOf(dep.balanceVerify?.status === "pass"),
      noteSuffix: "ยอดคงเหลือ 50% หลัง (ครบแล้ว)",
    });

  // สลิปใบเพิ่มที่นับยอดเข้า paidTotal แล้ว (โอนขาดแล้วโอนตาม · จ่ายส่วนต่างที่สั่งเพิ่ม)
  for (const p of o.payments ?? []) {
    const credited = p.credited ?? 0;
    if (credited <= 0) continue;
    out.push({
      docId: `${o.id}-${p.id}`,
      orderId: o.id,
      customer,
      kind: "extra",
      at: iso(p.verify?.at, p.accepted?.at, p.at),
      verifiedBy: byOf(p.verify?.status === "pass", p.accepted?.by),
      received: credited,
      noteSuffix: `โอนเพิ่ม ${credited.toLocaleString("th-TH")} บาท`,
      slipPath: p.path,
      extra: true,
    });
  }
  return out;
}

/**
 * 🚫 ทะเบียน "เรคอร์ดที่ตั้งใจลบทิ้ง" — doc id เดียวกับใน iduckyPaidOrders (ข้างในว่างก็ได้)
 * ลบเรคอร์ดจาก msVerify เองแล้วไม่จดไว้ที่นี่ = ตัวเติมสร้างกลับมาให้ทุก 3 ชม. (แถวซอมบี้)
 * เทียบเคียงกับ monthlySheetMeta/iduckyMirrorSkip ฝั่ง Admin ที่ทำหน้าที่เดียวกันกับ "สำเนา"
 */
export const TP_SKIP_COLLECTION = "iduckyBridgeSkip";

export interface TPBridgeScan {
  /** ออเดอร์ที่ตรวจ (มีเงินเข้าแล้วในกรอบวันที่ดู) */
  checked: number;
  /** เรคอร์ดที่ควรมีทั้งหมด */
  expected: number;
  /** เรคอร์ดที่หายไปจาก Firestore (ตัดใบที่ขึ้นทะเบียนลบถาวรออกแล้ว) */
  missing: TPBridgeRecord[];
  /** เรคอร์ดที่หายเพราะ "ตั้งใจลบ" — ไม่เติมกลับ */
  skipped: string[];
  /** อ่านทะเบียนลบไม่ได้ → ไม่เติมรอบนี้ (กันของที่ลบแล้วเด้งกลับ) */
  skipRegistryDown?: boolean;
}

/**
 * สแกนออเดอร์ที่สร้างใน N วันหลัง เทียบกับ doc จริงใน iduckyPaidOrders
 * อ่าน Firestore ด้วย getAll ทีละ ≤ 100 ใบ (ไม่ดึงทั้ง collection)
 */
export async function scanTPBridgeGaps(sb: SB, days = 3): Promise<TPBridgeScan> {
  const db = getFirestoreAdmin();
  if (!db) return { checked: 0, expected: 0, missing: [], skipped: [] };
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await sb.from("orders").select("data").gte("created_at", since);
  const orders = (data ?? []).map((r) => r.data as Order).filter(Boolean);

  let checked = 0;
  const want: TPBridgeRecord[] = [];
  for (const o of orders) {
    const recs = expectedBridgeRecords(o);
    if (!recs.length) continue;
    checked++;
    want.push(...recs);
  }

  const gone: TPBridgeRecord[] = [];
  for (let i = 0; i < want.length; i += 100) {
    const chunk = want.slice(i, i + 100);
    const snaps = await db.getAll(...chunk.map((r) => db.collection(TP_PAID_COLLECTION).doc(r.docId)));
    snaps.forEach((s, j) => {
      if (!s.exists) gone.push(chunk[j]);
    });
  }
  if (!gone.length) return { checked, expected: want.length, missing: [], skipped: [] };

  // ใบที่ "ตั้งใจลบ" ต้องไม่ถูกสร้างกลับ — อ่านทะเบียนไม่ได้ = ไม่เติมรอบนี้ (กันแถวซอมบี้)
  try {
    const marks = await db.getAll(...gone.map((r) => db.collection(TP_SKIP_COLLECTION).doc(r.docId)));
    const skipped = gone.filter((_, i) => marks[i].exists).map((r) => r.docId);
    return { checked, expected: want.length, missing: gone.filter((r) => !skipped.includes(r.docId)), skipped };
  } catch (e) {
    console.error("[tp-bridge-audit] อ่านทะเบียนเรคอร์ดที่ลบถาวรไม่ได้:", (e as Error)?.message);
    return { checked, expected: want.length, missing: [], skipped: [], skipRegistryDown: true };
  }
}

/**
 * เติมเรคอร์ดที่หายกลับเข้าสะพาน — ประทับ "วัน/เวลาที่รับเงินจริง" ไม่ใช่เวลาที่เติม
 * (msDaily จับคู่กับแถวโอนของธนาคารเป็นรายวัน · ประทับวันนี้ = ไปโผล่ผิดวันจนจับคู่ไม่ได้)
 * reportPaidToTP ใช้ .create() อยู่แล้ว → ยิงซ้ำไม่ทับของเดิม
 */
export async function healTPBridgeGaps(sb: SB, missing: TPBridgeRecord[]): Promise<string[]> {
  const done: string[] = [];
  for (const m of missing) {
    const { data } = await sb.from("orders").select("data").eq("id", m.orderId).maybeSingle();
    const order = data?.data as Order | undefined;
    if (!order) continue;
    await reportPaidToTP(order, m.verifiedBy, {
      at: m.at,
      docSuffix: m.docId === m.orderId ? undefined : m.docId.slice(m.orderId.length),
      received: m.received,
      noteSuffix: m.noteSuffix,
      slipPath: m.slipPath,
      extra: m.extra,
      partial: m.partial,
    });
    done.push(m.docId);
  }
  return done;
}
