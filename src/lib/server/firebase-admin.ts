import "server-only";
import { createHash, pbkdf2, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
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

/**
 * Firestore อีกฐานหนึ่งในโปรเจกต์เดียวกัน — "ordersure" เก็บคลังแชท LINE ของร้าน
 * (collection line-conversations · หน้า AdminBuddy ใช้ฐานนี้) ใช้ค้นหาลูกค้าตอนผูก LINE กับออเดอร์
 */
let cachedChat: Firestore | null = null;
export const CHAT_DATABASE_ID = process.env.FIREBASE_CHAT_DATABASE_ID || "ordersure";
export const CHAT_COLLECTION = process.env.LINE_CHAT_COLLECTION || "line-conversations";

export function getChatFirestore(): Firestore | null {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!b64) return null;
  if (cachedChat) return cachedChat;
  try {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    const app: App = getApps()[0] ?? initializeApp({ credential: cert(json) });
    cachedChat = getFirestore(app, CHAT_DATABASE_ID);
    return cachedChat;
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
 *
 * ⚠️ ชื่อที่ไม่มีตัวอักษรอังกฤษเลย (ไทยล้วน/อีโมจิล้วน เช่น "น้องเซฟ" "🍩โดนัท") จะเหลือ ""
 *    → ห้ามใช้ตัวนี้จับคู่ตอนล็อกอินตรงๆ (ทุกคนจะกลายเป็นชื่อเดียวกัน) ให้ใช้ loginKey()
 */
export function normalizeUsername(u: string): string {
  return u
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "");
}

/**
 * กุญแจจับคู่ชื่อผู้ใช้ตอนล็อกอิน
 * ปกติใช้รูปแบบ TP (normalizeUsername) แต่ถ้าชื่อเป็นไทย/อีโมจิล้วนจะเหลือ ""
 * → ถอยไปใช้ชื่อดิบ (trim + พิมพ์เล็ก) แทน เพื่อให้ยังล็อกอินได้และไม่ชนกับคนอื่น
 */
export function loginKey(u: string): string {
  return normalizeUsername(u) || u.trim().toLowerCase();
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** ค่ารหัสผ่านที่ TP เก็บใน employees2 */
export interface StoredPassword {
  password?: string;
  /** มีเมื่อ TP อัปเป็น PBKDF2 แล้ว (10 ส.ค. 2026) */
  passwordSalt?: string;
  /** เช่น "pbkdf2-sha256-210000" */
  passwordAlgo?: string;
}

const PBKDF2_ITERATIONS = 210000;
const pbkdf2Async = promisify(pbkdf2);

/**
 * PBKDF2 แบบเดียวกับ TP-Setting (shared/security-utils.js) — ต้องตรงเป๊ะ
 *   stored = PBKDF2-HMAC-SHA256( SHA256(รหัสจริง) , passwordSalt , 210000 รอบ , 256 bit )
 * ⚠️ ทั้ง key และ salt ป้อนเป็น "ข้อความ hex" (UTF-8 bytes ของตัวอักษร hex) ไม่ใช่ไบต์ที่ถอดจาก hex
 */
async function derivePassword(sha256HexStr: string, saltHex: string, iterations: number): Promise<string> {
  const bits = await pbkdf2Async(sha256HexStr, saltHex, iterations, 32, "sha256");
  return bits.toString("hex");
}

const sameHex = (a: string, b: string): boolean => {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/**
 * เทียบรหัสผ่านกับค่าที่ TP เก็บ — รองรับปนกัน 3 แบบ:
 *   1) PBKDF2 (มี passwordSalt / passwordAlgo ขึ้นต้น pbkdf2) — แบบใหม่ของ TP
 *   2) hex 64 ตัวเปล่าๆ = SHA-256 (ของเดิม ยังไม่ได้ migrate)
 *   3) อื่นๆ = ข้อความธรรมดา
 */
export async function verifyPassword(input: string, emp: StoredPassword): Promise<boolean> {
  const stored = (emp.password ?? "").trim().toLowerCase();
  if (!stored) return false;

  const salt = (emp.passwordSalt ?? "").trim();
  const algo = (emp.passwordAlgo ?? "").toLowerCase();
  if (salt || algo.startsWith("pbkdf2")) {
    if (!salt) return false; // บอกว่าเป็น pbkdf2 แต่ไม่มี salt → เทียบไม่ได้
    const iterations = Number(algo.match(/(\d+)$/)?.[1]) || PBKDF2_ITERATIONS;
    return sameHex(await derivePassword(sha256Hex(input), salt, iterations), stored);
  }

  const isHash = /^[0-9a-f]{64}$/i.test(stored);
  return isHash ? sameHex(sha256Hex(input), stored) : input === (emp.password ?? "");
}
