/**
 * 🆔 รหัสห้องแชท LINE — ใช้ร่วมหน้าเว็บ/API (21 ต.ค. 69 เจ้าของร้าน "รองรับกลุ่มที่ขึ้นต้นด้วย C ได้ไหม")
 *
 *   · U + hex 32 = คนเดียว (userId)         → ห้องลูกค้า: บอทตอบ/ร่าง/ผูกออเดอร์/คูปอง/โปรไฟล์ ได้ครบ
 *   · C + hex 32 = ไลน์กลุ่ม (groupId)       → ห้องกลุ่ม: เก็บแชท + แอดมินตอบจากเว็บได้ (push รับ groupId) · บอทไม่ตอบ · ไม่ผูกออเดอร์
 *   · R + hex 32 = ห้องรวมหลายคน (roomId)    → เหมือนกลุ่ม แต่ LINE ไม่มีชื่อ/รูปห้องให้
 *
 * ที่ไหนรับเฉพาะ "ลูกค้าเดี่ยว" ให้เช็ค isLineUserId · ที่ไหนรับ "ห้องไหนก็ได้" ให้เช็ค isLineRoomId
 */
export const LINE_USER_RE = /^U[0-9a-f]{32}$/;
export const LINE_ROOM_RE = /^[UCR][0-9a-f]{32}$/;

export type LineRoomKind = "user" | "group" | "room";

export const isLineUserId = (s: string): boolean => LINE_USER_RE.test(s);
export const isLineRoomId = (s: string): boolean => LINE_ROOM_RE.test(s);
/** กลุ่ม (C…) หรือห้องรวม (R…) — ไม่ใช่ลูกค้าเดี่ยว */
export const isLineGroupId = (s: string): boolean => /^[CR][0-9a-f]{32}$/.test(s);

export function lineRoomKind(id: string): LineRoomKind | null {
  if (!LINE_ROOM_RE.test(id)) return null;
  return id[0] === "U" ? "user" : id[0] === "C" ? "group" : "room";
}
