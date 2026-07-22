import "server-only";
import { createHash } from "node:crypto";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Firebase Admin SDK (ฝั่งเซิร์ฟเวอร์เท่านั้น) — ใช้ตรวจล็อกอินแอดมินกับ Firestore
 * ตั้งค่า FIREBASE_SERVICE_ACCOUNT_B64 ใน .env.local (base64 ของ service account JSON)
 *
 * หมายเหตุ: employees2 อยู่ใน "named database" ชื่อ tp-fixflow (ไม่ใช่ (default))
 * ในโปรเจกต์ tpdigital-iducky — ต้องระบุ FIREBASE_DATABASE_ID
 */
let cached: Firestore | null = null;

/** database ที่เก็บ employees2 (named database ไม่ใช่ default) */
export const FIREBASE_DATABASE_ID = process.env.FIREBASE_DATABASE_ID || "tp-fixflow";

export function getFirestoreAdmin(): Firestore | null {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!b64) return null;
  if (cached) return cached;
  try {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    const app: App = getApps()[0] ?? initializeApp({ credential: cert(json) });
    cached = getFirestore(app, FIREBASE_DATABASE_ID);
    return cached;
  } catch {
    return null;
  }
}

export const EMPLOYEE_COLLECTION = process.env.ADMIN_EMPLOYEE_COLLECTION || "employees2";
export const ADMIN_ROLE_VALUE = process.env.ADMIN_ROLE_VALUE || "Administrator";
export const isFirebaseAdminConfigured = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_B64);

/**
 * ทำชื่อผู้ใช้ให้เป็นรูปแบบ login (ต้องตรงกับระบบ TP เดิม)
 * trim → พิมพ์เล็ก → เว้นวรรค→จุด → ตัดอักขระที่ไม่ใช่ [a-z0-9._-] → ตัดตัวคั่นหัว/ท้าย
 */
export function normalizeUsername(u: string): string {
  return u
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "");
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * เทียบรหัสผ่านกับค่าที่ TP เก็บ — รองรับปนกัน:
 *   hex 64 ตัว = SHA-256 hash → เทียบแบบแฮช, อื่นๆ = ข้อความธรรมดา
 */
export function verifyPassword(input: string, stored: string): boolean {
  if (!stored) return false;
  const isHash = /^[0-9a-f]{64}$/i.test(stored);
  return isHash ? sha256Hex(input) === stored.toLowerCase() : input === stored;
}
