import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * กันสลิปซ้ำ — สลิปใบเดียวถูกใช้แจ้งโอนได้ครั้งเดียว
 *
 * จำสลิป 2 ชั้น:
 *   1. ลายนิ้วมือไฟล์ (SHA-256 ของ bytes) → เก็บที่ order.slipHash / deposit.balanceSlipHash
 *      จับ "ไฟล์เดิมเป๊ะ" ที่ส่งซ้ำ (กดสองรอบ / เอาไฟล์เก่ามาแนบออเดอร์ใหม่) ก่อนยิง SlipOK เสียโควตา
 *   2. เลขอ้างอิงธุรกรรม (transRef) ที่ SlipOK อ่านจาก QR → เก็บที่ slipVerify.transRef / deposit.balanceVerify.transRef
 *      จับ "ธุรกรรมเดิม" แม้ไฟล์ต่างกัน (แคปหน้าจอใหม่ / บีบรูป / ครอป)
 *
 * ทั้งสองชั้นเช็คข้ามออเดอร์ และเช็คข้ามงวดในออเดอร์เดียวกัน
 * (สลิปมัดจำงวดแรกเอามาแนบเป็นสลิปยอดคงเหลืออีกรอบ = ซ้ำ)
 *
 * ออเดอร์เก่าก่อน 8 ก.ย. 69 ไม่มี slipHash — ยังกันได้ด้วย transRef ที่ SlipOK เคยอ่านไว้ (ชั้นที่ 2)
 */

export type SlipPhase = "first" | "balance";

export interface SlipOwner {
  orderId: string;
  phase: SlipPhase;
}

export const slipHashOf = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** แถวออเดอร์ที่ดึงมาเช็ค — อ่านเฉพาะฟิลด์ที่ต้องใช้ */
interface Row {
  id: string;
  data: {
    slipHash?: string;
    slipVerify?: { transRef?: string };
    deposit?: { balanceSlipHash?: string; balanceVerify?: { transRef?: string } };
  } | null;
}

/** ค่าที่จะเอาไปค้นต้องเป็นตัวอักษร/ตัวเลขล้วน — กันหลุดเข้า filter ของ PostgREST */
const safeToken = (s: string | undefined): string | null => (s && /^[A-Za-z0-9._-]{4,128}$/.test(s) ? s : null);

/**
 * หาว่าสลิป (ตามลายนิ้วมือไฟล์ และ/หรือ เลขอ้างอิง) เคยถูกใช้กับออเดอร์/งวดไหนแล้วบ้าง
 * ไม่รวม "ออเดอร์+งวดเดียวกัน" กับที่กำลังแนบ (แนบทับใบเดิมของตัวเองไม่ถือว่าซ้ำ — ให้ปลายทางตัดสินเอง)
 */
export async function findSlipOwners(sb: SupabaseClient, q: { hash?: string; transRef?: string }, self: SlipOwner): Promise<SlipOwner[]> {
  const hash = safeToken(q.hash);
  const ref = safeToken(q.transRef);
  if (!hash && !ref) return [];

  const clauses: string[] = [];
  if (hash) clauses.push(`data->>slipHash.eq.${hash}`, `data->deposit->>balanceSlipHash.eq.${hash}`);
  if (ref) clauses.push(`data->slipVerify->>transRef.eq.${ref}`, `data->deposit->balanceVerify->>transRef.eq.${ref}`);

  const { data, error } = await sb.from("orders").select("id,data").or(clauses.join(",")).limit(20);
  // ค้นไม่ได้ (เช่น DB ล่ม) = ไม่ตีตกสลิปลูกค้า — ปล่อยผ่านไปตรวจตามปกติ ชั้นถัดไป (SlipOK log) ยังกันอยู่
  if (error || !data) return [];

  const owners: SlipOwner[] = [];
  for (const row of data as Row[]) {
    const d = row.data ?? {};
    const firstHit = (!!hash && d.slipHash === hash) || (!!ref && d.slipVerify?.transRef === ref);
    const balanceHit = (!!hash && d.deposit?.balanceSlipHash === hash) || (!!ref && d.deposit?.balanceVerify?.transRef === ref);
    if (firstHit && !(row.id === self.orderId && self.phase === "first")) owners.push({ orderId: row.id, phase: "first" });
    if (balanceHit && !(row.id === self.orderId && self.phase === "balance")) owners.push({ orderId: row.id, phase: "balance" });
  }
  return owners;
}

/** ข้อความบอกว่าซ้ำกับที่ไหน — ใช้ทั้งฝั่งลูกค้าและแอดมิน */
export function describeSlipOwner(o: SlipOwner, self: SlipOwner): string {
  if (o.orderId === self.orderId) return o.phase === "first" ? "สลิปงวดแรก (มัดจำ) ของออเดอร์นี้" : "สลิปยอดคงเหลือของออเดอร์นี้";
  return `ออเดอร์ ${o.orderId}${o.phase === "balance" ? " (งวดยอดคงเหลือ)" : ""}`;
}

/** โยนเมื่อสลิปซ้ำ — เส้น API จับไปตอบ 409 พร้อมรายชื่อออเดอร์ที่ใช้สลิปนี้อยู่ */
export class SlipDuplicateError extends Error {
  readonly status = 409;
  constructor(
    public readonly owners: SlipOwner[],
    public readonly self: SlipOwner
  ) {
    super(
      `สลิปใบนี้ถูกใช้แจ้งโอนกับ${owners.map((o) => describeSlipOwner(o, self)).join(", ")} ไปแล้ว — ใช้ซ้ำไม่ได้ครับ · ถ้าโอนรวมหลายออเดอร์ในครั้งเดียว กรุณาส่งสลิปพร้อมเลขออเดอร์ทั้งหมดให้แอดมินทางไลน์`
    );
    this.name = "SlipDuplicateError";
  }
}

/** ค้นแล้วโยน SlipDuplicateError ถ้าเจอที่อื่นใช้สลิปนี้อยู่ */
export async function assertSlipNotDuplicate(sb: SupabaseClient, q: { hash?: string; transRef?: string }, self: SlipOwner): Promise<void> {
  const owners = await findSlipOwners(sb, q, self);
  if (owners.length) throw new SlipDuplicateError(owners, self);
}

/**
 * ล็อกต่อออเดอร์ในโปรเซสเดียว — กันกดแจ้งโอนรัว ๆ แล้วสองคำขอวิ่งพร้อมกัน
 * (ต่างคนต่างอ่านออเดอร์เวอร์ชันเดิม → ยิง SlipOK สองรอบ แจ้ง LINE/ตัดสต๊อกสองรอบ)
 * Netlify อาจกระจายคนละ instance ได้ แต่คลิกซ้ำติด ๆ กันจากเบราว์เซอร์เดียวมักตกโปรเซสเดียวกัน
 */
const inFlight = new Set<string>();
export function acquireSlipLock(orderId: string): (() => void) | null {
  if (inFlight.has(orderId)) return null;
  inFlight.add(orderId);
  return () => inFlight.delete(orderId);
}
