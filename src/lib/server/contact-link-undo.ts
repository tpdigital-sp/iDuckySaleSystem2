import "server-only";
import type { Contact } from "@/lib/contacts";
import type { getSupabaseAdmin } from "./supabase-admin";

type SB = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * ↩️ สำเนา "ก่อนผูกบัญชีสมาชิก" ไว้ย้อนกลับ — เจ้าของร้านสั่ง 23 ก.ย. 69 ("พนักงานอาจผูกผิดคน")
 *
 * การผูกบัญชี (api/admin/contacts/link) ยุบการ์ดใบหนึ่งเข้าอีกใบแล้ว "ลบใบที่ถูกยุบ" ทิ้ง
 * ถ้าผูกผิดคนแล้วกู้ไม่ได้ = ข้อมูลลูกค้าหายถาวร จึงต้องถ่ายสำเนาไว้ก่อนเขียนทุกครั้ง
 *
 * เก็บเป็นแถวพิเศษในตาราง products (แบบเดียวกับ __promo_banners__ / __shop_payment__)
 * เก็บแค่ 60 ครั้งล่าสุด — พอสำหรับ "เพิ่งกดผิด" ซึ่งเป็นเคสเดียวที่ต้องย้อน
 */

export const LINK_UNDO_ROW = "__contact_link_undo__";
const KEEP = 60;

export type LinkUndo = {
  /** เวลาที่กดผูก (ISO) */
  at: string;
  /** คนที่กดผูก */
  by: string;
  /** การ์ดปลายทาง */
  targetId: string;
  /** บัญชีสมาชิกที่ถูกผูกเข้าไป */
  memberId: string;
  /** การ์ดปลายทาง "ก่อน" ถูกแก้ */
  targetBefore: Contact;
  /** การ์ดที่ถูกยุบแล้วลบทิ้ง (ยกมาทั้งใบ) */
  sources: Contact[];
};

async function readAll(sb: SB): Promise<LinkUndo[]> {
  const { data } = await sb.from("products").select("data").eq("id", LINK_UNDO_ROW).maybeSingle();
  const list = (data?.data as { undos?: LinkUndo[] } | undefined)?.undos;
  return Array.isArray(list) ? list : [];
}

async function writeAll(sb: SB, undos: LinkUndo[]): Promise<void> {
  await sb.from("products").upsert(
    { id: LINK_UNDO_ROW, name: "(ระบบ — สำเนาก่อนผูกบัญชีสมาชิก)", category: "__settings__", price: 0, data: { undos: undos.slice(0, KEEP) } },
    { onConflict: "id" }
  );
}

/** บันทึกสำเนาก่อนผูก — ล้มเหลวไม่ควรทำให้การผูกล้ม แต่ต้องบอกผู้เรียกว่าย้อนกลับไม่ได้ */
export async function pushLinkUndo(sb: SB, undo: LinkUndo): Promise<boolean> {
  try {
    const all = await readAll(sb);
    // การ์ดใบเดียวผูกซ้ำหลายรอบ → เก็บครั้งล่าสุดไว้บนสุด ของเก่ายังอยู่ (ย้อนทีละชั้นได้)
    await writeAll(sb, [undo, ...all]);
    return true;
  } catch {
    return false;
  }
}

/** สำเนาล่าสุดของการ์ดใบนี้ (ไม่ลบออก) */
export async function peekLinkUndo(sb: SB, targetId: string): Promise<LinkUndo | null> {
  const all = await readAll(sb);
  return all.find((u) => u.targetId === targetId) ?? null;
}

/** ดึงสำเนาล่าสุดของการ์ดใบนี้ออกมาใช้ (ตัดออกจากรายการ) */
export async function takeLinkUndo(sb: SB, targetId: string): Promise<LinkUndo | null> {
  const all = await readAll(sb);
  const i = all.findIndex((u) => u.targetId === targetId);
  if (i < 0) return null;
  const [hit] = all.splice(i, 1);
  await writeAll(sb, all);
  return hit;
}

/** คำนำหน้า id ประวัติคะแนนที่ถูกย้ายมาตอนยุบการ์ด (ใช้หาและย้ายกลับ) */
export const movedLogPrefix = (targetId: string) => `${targetId}:moved:`;
