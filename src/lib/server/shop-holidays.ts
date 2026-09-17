import "server-only";
import { getFirestoreAdmin } from "@/lib/server/firebase-admin";
import { setShopHolidays } from "@/lib/ship-date";

/**
 * 🗓 วันหยุดของร้านจากปฏิทิน TP-Leader (calendar.html) — Firestore tp-fixflow collection `holidays`
 * เอกสาร: { name, date: "YYYY-MM-DD", type: "annual" | "special", isRecurring }
 * isRecurring = หยุดวัน-เดือนเดียวกันทุกปี (กติกาเดียวกับ calendar.html) → กางออกให้ครบปีที่แล้ว…อีก 2 ปีข้างหน้า
 * เจ้าของร้านสั่ง 17 ก.ย. 69: "ร้านหยุดเสาร์ อาทิตย์ และวันหยุดตามปฏิทิน" — แก้วันหยุดที่ปฏิทิน TP ที่เดียว ระบบขายตามเอง
 */
const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; map: Record<string, string> } | null = null;
let inflight: Promise<Record<string, string> | null> | null = null;

async function fetchHolidays(): Promise<Record<string, string> | null> {
  const db = getFirestoreAdmin();
  if (!db) return null;
  const snap = await db.collection("holidays").get();
  const thisYear = new Date().getUTCFullYear();
  const map: Record<string, string> = {};
  for (const d of snap.docs) {
    const h = d.data() as { name?: string; date?: string; isRecurring?: boolean };
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(h.date ?? "");
    if (!m) continue;
    const name = (h.name ?? "").trim() || "วันหยุดร้าน";
    map[h.date!] ??= name;
    if (h.isRecurring) for (let y = thisYear - 1; y <= thisYear + 2; y++) map[`${y}-${m[2]}-${m[3]}`] ??= name;
  }
  return map;
}

/**
 * โหลดวันหยุดร้าน (แคช 10 นาทีต่อ instance) แล้วเสียบเข้า ship-date ให้ isWorkingDay/autoShipDate ใช้
 * คืน null = อ่านปฏิทินไม่ได้ (ship-date ถอยไปใช้ตารางสำรอง THAI_HOLIDAYS เอง) · เรียกก่อนคำนวณวันส่งฝั่งเซิร์ฟเวอร์ทุกครั้ง
 */
export async function loadShopHolidays(): Promise<Record<string, string> | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  inflight ??= fetchHolidays()
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  const map = await inflight;
  // ปฏิทินว่างเปล่า = น่าจะอ่านผิดฐาน/โดนลบ — อย่าเอามาทับตารางสำรอง
  if (map && Object.keys(map).length > 0) {
    cache = { at: Date.now(), map };
    setShopHolidays(map);
    return map;
  }
  return cache?.map ?? null;
}
