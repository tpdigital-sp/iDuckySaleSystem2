import type { Order, Proof, ProofStatus } from "@/lib/admin-data";
import { shortThaiDay } from "@/lib/ship-date";

/** ชื่อ header ที่หน้าออเดอร์ส่งรายชื่อช่องที่แก้จริงมาด้วย (ดู changedOrderKeys ใน order-repo.ts) */
export const CHANGED_KEYS_HEADER = "x-changed-keys";

/** อ่าน header → Set ของช่องที่แก้ · ไม่มี/อ่านพัง = null (เซิร์ฟเวอร์ทำแบบเดิม: ก้อนจากหน้าจอเป็นหลัก) */
export function parseChangedKeys(raw: string | null | undefined): Set<string> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as unknown;
    return Array.isArray(v) ? new Set(v.filter((k): k is string => typeof k === "string")) : null;
  } catch {
    return null;
  }
}

/**
 * 🧭 รวม 3 ทาง: ช่องที่หน้าจอ "ไม่ได้แก้" เอาจากฐานเสมอ · ช่องที่แก้เอาจากหน้าจอ
 *
 * ทำไม (16 ก.ย. 69 ต่อจาก OD-260915-6742): หน้าออเดอร์ส่งออเดอร์ทั้งก้อนจาก state ของตัวเอง เซิร์ฟเวอร์ไม่มีทางรู้ว่า
 * แอดมินตั้งใจแก้ช่องไหน → หน้าจอที่เปิดค้าง (โพลหยุดตอนเคอร์เซอร์อยู่ในช่องกรอก) ทับสิ่งที่ทางอื่นเพิ่งเขียนได้หมด:
 * รายการที่ลูกค้าสั่งเพิ่ม · คำขอแก้ไข · ผูกไลน์ · โยนโฟลเดอร์ผลิต · ปริ้นใบงาน · เงินเข้า (อันหลังมีด่านแยก order-money-guard)
 * ด่านเดิมกันได้แค่ฟิลด์ที่มีประทับเวลา (ติ๊ก/แบบงาน) — อันนี้กันทุกช่องระดับบนสุด
 *
 * หน้าจอส่ง header x-changed-keys = ช่องที่ต่างจากก้อนล่าสุดที่ได้จากเซิร์ฟเวอร์ (base) → ช่องนอกลิสต์คงค่าในฐาน
 * (รวมถึง "ในฐานไม่มี" = ลบออก · "ในฐานมีแต่หน้าจอไม่มี" = เติมกลับ)
 * ไม่มี header = null → คืน incoming ตามเดิม (หน้าจออื่น/เวอร์ชันเก่ายังทำงานได้)
 * ⚠️ ผู้เรียกต้องจัดการ items เอง (ต้องผ่าน reconcileItem ต่อรายการเมื่อแก้) — ตัวนี้ทับ items ทั้งชุดจากฐานเฉพาะเมื่อไม่ได้แก้
 */
/** ช่องที่เซิร์ฟเวอร์เป็นเจ้าของ/รวมเองอยู่แล้ว — คงจากฐานเงียบ ๆ ไม่ต้องรายงานว่า "กัน" (ไม่งั้น log รกทุกครั้งที่มีคนอื่นบันทึกก่อน) */
const SILENT = new Set(["id", "savedAt", "log"]);

export function applyChangedKeys(existing: Order, incoming: Order, changed: Set<string> | null): { order: Order; restored: string[] } {
  if (!changed) return { order: incoming, restored: [] };
  const out = { ...incoming } as unknown as Record<string, unknown>;
  const ex = existing as unknown as Record<string, unknown>;
  const inc = incoming as unknown as Record<string, unknown>;
  const restored: string[] = [];
  for (const k of new Set([...Object.keys(ex), ...Object.keys(inc)])) {
    if (k === "id" || changed.has(k)) continue;
    if (JSON.stringify(ex[k] ?? null) === JSON.stringify(inc[k] ?? null)) continue;
    if (k in ex) out[k] = ex[k];
    else delete out[k];
    if (!SILENT.has(k)) restored.push(k);
  }
  return { order: out as unknown as Order, restored };
}

/** สิ่งที่ลูกค้าเป็นเจ้าของบนรายการ/ของแถม 1 ตัว — ผลตรวจต่อรูป + ผลตรวจทั้งรายการ */
export interface VerdictHolder {
  proofs?: Proof[];
  proofStatus?: ProofStatus;
  proofNote?: string;
  proofReviewedAt?: string;
}

/** ผลตรวจที่ลูกค้าตัดสินแล้ว — "รอตรวจ" ไม่ใช่ผลตรวจ แค่สถานะเริ่มต้นตอนส่งแบบ */
const isVerdict = (s: ProofStatus | undefined): s is "อนุมัติ" | "ขอแก้ไข" => s === "อนุมัติ" || s === "ขอแก้ไข";

/**
 * 🧑‍⚖️ ผลตรวจแบบของลูกค้าเป็นของลูกค้า — หน้าจอแอดมิน/กราฟฟิกที่เปิดค้างทับไม่ได้
 *
 * เคสจริง (OD-260915-5892 · 16 ก.ย. 69): ลูกค้ากดอนุมัติแบบ 12:31 → ฐานมี proofs[].review="อนุมัติ" + proofStatus="อนุมัติ" + ออเดอร์ "อนุมัติแบบ"
 * 13 นาทีต่อมาพนักงานติ๊ก "มีงานตัวอย่าง" จากหน้าจอที่โหลดไว้ก่อนลูกค้ากด → ติ๊กอยู่ใน items จึงส่ง items ทั้งชุดจากหน้าจอเก่า:
 * proofStatus กลับเป็น "รอตรวจ" และ review หาย · applyChangedKeys คงได้แค่ status (ช่องบนสุดที่หน้าจอไม่ได้แก้)
 * → หน้าออเดอร์ขึ้น "อนุมัติแบบ" แต่บอร์ดลาย/รายงานแบบงาน (อ่านจากรายการ) ขึ้น "ยังไม่ยืนยัน"
 *
 * กติกา (ใช้กับ inc ที่ผ่าน reconcileProofs มาแล้ว — รูปจับคู่กันด้วย url):
 *   · ต่อรูป: รูปเดิมที่ในฐานมี review แต่หน้าจอส่งมาไม่มี = หน้าจอไม่เคยเห็น (ไม่มีทางไหนของแอดมินที่ "ล้าง" review ของรูปเดิม —
 *     อัปรูปใหม่คือเพิ่มรูป · ลบรูปคือรูปหาย · อนุมัติแทน (ลายลูกค้าจัดวางเอง) คือใส่ review) → คงของฐาน
 *     ทั้งคู่มีแต่ต่างกัน: ของฐานใหม่กว่าที่หน้าจอเห็น (reviewAt > savedAt ของหน้าจอ) → คงของฐาน
 *   · ทั้งรายการ: ฐานมีคำตัดสิน (อนุมัติ/ขอแก้ไข) แต่หน้าจอส่ง "รอตรวจ" มาโดยไม่มีรูปใหม่ = ไม่ใช่การส่งแบบรอบใหม่ → คงคำตัดสิน+คอมเมนต์
 *     (อัปรูปใหม่ → มี url ใหม่ → รีเซ็ตเป็น "รอตรวจ" ได้ตามเดิม · ลบรูปหมด → proofStatus ว่างได้ตามเดิม)
 *     คำตัดสินในฐานที่เกิดหลังหน้าจอเห็น (proofReviewedAt > savedAt) → คงของฐาน แม้หน้าจอส่งคำตัดสินอื่นมา (ตราบใดที่ชุดรูปไม่เปลี่ยน)
 */
export function keepCustomerVerdict<T extends VerdictHolder>(cur: T | undefined, inc: T, clientSavedAt: string): T {
  if (!cur) return inc;
  const out: T = { ...inc };
  const curByUrl = new Map((cur.proofs ?? []).map((p) => [p.url, p]));
  if (Array.isArray(inc.proofs)) {
    out.proofs = inc.proofs.map((p) => {
      const c = curByUrl.get(p.url);
      if (!c?.review) return p;
      const unseen = !p.review || (!!c.reviewAt && c.reviewAt > clientSavedAt);
      return unseen && (p.review !== c.review || p.reviewNote !== c.reviewNote)
        ? { ...p, review: c.review, reviewNote: c.reviewNote, ...(c.reviewAt ? { reviewAt: c.reviewAt } : {}) }
        : p;
    });
  }
  if (isVerdict(cur.proofStatus) && inc.proofStatus !== cur.proofStatus) {
    const newer = !!cur.proofReviewedAt && cur.proofReviewedAt > clientSavedAt;
    const incProofs = out.proofs ?? [];
    // ชุดรูปไม่เปลี่ยน (ไม่มี url ใหม่ · ไม่ได้ลบหมด) — อัปรูปใหม่/ลบหมดคือรอบใหม่ของกราฟฟิก ต้องรีเซ็ตได้แม้หน้าจอจะค้าง
    const sameSet = incProofs.length > 0 && incProofs.every((p) => curByUrl.has(p.url));
    if (sameSet && (newer || inc.proofStatus === "รอตรวจ")) {
      out.proofStatus = cur.proofStatus;
      out.proofNote = cur.proofNote;
      if (cur.proofReviewedAt) out.proofReviewedAt = cur.proofReviewedAt;
    }
  }
  return out;
}

/** 👤 บรรยายว่าชื่อ/เบอร์/ที่อยู่ลูกค้าเปลี่ยนจากอะไรเป็นอะไร (ไม่เปลี่ยน = undefined) — ไว้ลง log ให้ตามย้อนหลังได้ */
export function customerInfoChanges(before: Order, after: Order): string | undefined {
  const fields: Array<["customer" | "phone" | "address", string]> = [
    ["customer", "ชื่อลูกค้า"],
    ["phone", "เบอร์โทร"],
    ["address", "ที่อยู่จัดส่ง"],
  ];
  const show = (v: string | undefined) => {
    const t = (v ?? "").replace(/\s+/g, " ").trim();
    return t ? (t.length > 120 ? `${t.slice(0, 120)}…` : t) : "(ว่าง)";
  };
  const parts = fields
    .filter(([k]) => (before[k] ?? "").trim() !== (after[k] ?? "").trim())
    .map(([k, label]) => `${label}: ${show(before[k])} → ${show(after[k])}`);
  return parts.length ? parts.join(" · ") : undefined;
}

/**
 * 📅 บรรยายว่าวันใช้งาน/วันจัดส่ง/ธงงานเร่งเปลี่ยนจากอะไรเป็นอะไร (ไม่เปลี่ยน = undefined)
 *
 * ทำไม (พนักงานถาม 21 ก.ย. 69 · OD-260918-8582 "วันใช้งานนี้ใครใส่ ตรวจได้ไหม"):
 * ช่องพวกนี้บันทึกทันทีที่จิ้มปฏิทิน ไม่มีร่องรอยเลยว่าใครใส่/ใครลบเมื่อไหร่ — ตอบพนักงานไม่ได้
 * ค่าว่างก็ต้องจด "ลบวันใช้งาน" คือเหตุการณ์ที่ต้องเห็นพอ ๆ กับการใส่
 */
export function scheduleChanges(before: Order, after: Order): string | undefined {
  const day = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? shortThaiDay(v) : "(ไม่ระบุ)");
  const ship = (o: Order) => {
    const from = o.shipDate?.from || "";
    const to = o.shipDate?.to || "";
    if (!from && !to) return "(ไม่ระบุ)";
    return !to || to === from ? day(from || to) : `${day(from)}–${day(to)}`;
  };
  const parts: string[] = [];
  if ((before.useByDate ?? "") !== (after.useByDate ?? ""))
    parts.push(`วันที่ลูกค้าต้องใช้งาน: ${day(before.useByDate)} → ${day(after.useByDate)}`);
  if (ship(before) !== ship(after)) parts.push(`วันที่จัดส่ง: ${ship(before)} → ${ship(after)}`);
  if (!!before.rush !== !!after.rush) parts.push(after.rush ? "🔥 ตั้งเป็นงานเร่ง" : "ยกเลิกงานเร่ง");
  return parts.length ? parts.join(" · ") : undefined;
}
