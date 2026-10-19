/**
 * 📝 ร่างคำตอบบอทยัง "รอส่ง" อยู่จริงไหม — ใช้ร่วมกันทั้งเซิร์ฟเวอร์ (ป้าย/ตัวนับ/ด่านกดส่ง) และหน้าแชท (การ์ดร่าง)
 *
 * ต้นเรื่อง 19 ต.ค. 69 (เจ้าของร้าน "ยังไม่ได้เปิดร่าง แต่ทำไมขึ้น tag ร่างรอส่ง"):
 *   โหมดร่างทั้งร้านเปิดช่วง 14–15 ต.ค. 69 (champ ปิด 15 ต.ค. 17:35) → บอทร่างให้ทุกห้องที่ทักมา
 *   แต่แอดมินตอบลูกค้าใน LINE OA Manager ไม่ใช่หน้าเว็บ → closePendingDrafts ไม่เคยทำงาน · ปิดโหมดก็ไม่ล้างร่าง
 *   → draftPendingAt ค้างถาวร ป้าย "ร่างรอส่ง" ขึ้น ~390 ห้อง + การ์ดร่างยังกด "ส่งให้ลูกค้า" คำตอบอายุ 4 วันได้
 * กติกา: ร่างหมดอายุเมื่อ (1) เกิน 24 ชม. หรือ (2) ร้านตอบลูกค้าไปแล้วหลังร่างนั้น (lastAdminAt ใหม่กว่า — รวมที่ดึงจาก OA)
 */
export const DRAFT_TTL_MS = 24 * 3600_000;

const ms = (v: string | number | undefined | null): number => {
  if (v === undefined || v === null || v === "") return NaN;
  return typeof v === "number" ? v : new Date(v).getTime();
};

export function isDraftLive(draftAt: string | number | undefined | null, lastShopReplyAt?: string | number | null, now = Date.now()): boolean {
  const at = ms(draftAt);
  if (!Number.isFinite(at)) return false;
  if (now - at > DRAFT_TTL_MS) return false;
  const shop = ms(lastShopReplyAt);
  return !(Number.isFinite(shop) && shop > at);
}
