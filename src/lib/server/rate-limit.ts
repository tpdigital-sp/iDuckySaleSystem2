import "server-only";
import { createHash } from "node:crypto";
import { getFirestoreAdmin } from "@/lib/server/firebase-admin";

/**
 * 🚦 ตัวนับกันยิงรัว "ข้ามอินสแตนซ์" — เก็บใน Firestore (ฐานเดียวกับ employees2)
 *
 * ทำไม (ตรวจความปลอดภัยรอบ 2 · 8 ต.ค. 69): ทุกเส้นสาธารณะเคยนับใน Map ของหน่วยความจำ
 * บน Netlify แต่ละคำขอตกคนละอินสแตนซ์ ตัวนับไม่เคยถึงเพดาน (ทดสอบ /api/admin/login ยิงผิด 20 ครั้งได้ 401 ทุกครั้ง)
 * = ด่านที่มีอยู่ทั้งหมด (หาออเดอร์ · ตั๋วอัปโหลด · แชท AI · เช็คอีเมล · สมัครตัวแทน) ไม่ทำงานจริงเลย
 *
 * วิธีใช้:
 *   if (await rateLimited(`chat:${ip}`, 20, 5 * 60_000)) return 429
 *   — นับทุกครั้งที่เรียก · เกิน max ในช่วง windowMs = true
 *   rateCount / rateReset — สำหรับด่านที่นับเฉพาะ "ครั้งที่ผิด" (ล็อกอิน) แล้วล้างเมื่อสำเร็จ
 *
 * กติกา: Firestore ล่ม/ไม่ได้ตั้งค่า = ไม่ขวาง (คืน false) — ด่านนี้ห้ามทำให้ลูกค้าสั่งของไม่ได้
 * คีย์เอกสาร = sha256 ของคีย์ (IP/อีเมล/เบอร์ มีอักขระที่ Firestore ไม่รับ และไม่อยากเก็บค่าดิบ)
 */
const COLLECTION = "iducky_rate_limit";

type Doc = { n: number; until: number; key: string };

function ref(key: string) {
  const db = getFirestoreAdmin();
  if (!db) return null;
  return db.collection(COLLECTION).doc(createHash("sha256").update(key).digest("hex").slice(0, 40));
}

/** นับ 1 ครั้งแล้วบอกว่าเกินเพดานไหม (true = เกิน ให้ตอบ 429) */
export async function rateLimited(key: string, max: number, windowMs: number): Promise<boolean> {
  const n = await rateHit(key, windowMs);
  return n > max;
}

/** นับ 1 ครั้ง คืนจำนวนครั้งในช่วงปัจจุบัน (0 = นับไม่ได้) */
export async function rateHit(key: string, windowMs: number): Promise<number> {
  const r = ref(key);
  if (!r) return 0;
  try {
    const db = getFirestoreAdmin()!;
    return await db.runTransaction(async (tx) => {
      const d = (await tx.get(r)).data() as Doc | undefined;
      const now = Date.now();
      if (!d || d.until < now) {
        tx.set(r, { n: 1, until: now + windowMs, key: key.slice(0, 80) });
        return 1;
      }
      tx.update(r, { n: (d.n ?? 0) + 1 });
      return (d.n ?? 0) + 1;
    });
  } catch {
    return 0;
  }
}

/** จำนวนครั้งในช่วงปัจจุบันโดยไม่นับเพิ่ม (0 = ไม่มี/อ่านไม่ได้) */
export async function rateCount(key: string): Promise<number> {
  const r = ref(key);
  if (!r) return 0;
  try {
    const d = (await r.get()).data() as Doc | undefined;
    return d && d.until > Date.now() ? d.n : 0;
  } catch {
    return 0;
  }
}

/** ล้างตัวนับ (เช่น ล็อกอินสำเร็จ) */
export async function rateReset(key: string): Promise<void> {
  const r = ref(key);
  if (!r) return;
  await r.delete().catch(() => undefined);
}

/** IP ของผู้เรียก — Netlify ใส่ x-nf-client-connection-ip ให้ (เชื่อได้) · นอกนั้นใช้ x-forwarded-for ตัวแรก */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
