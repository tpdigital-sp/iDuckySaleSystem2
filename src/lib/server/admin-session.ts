import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Session แอดมินแบบคุกกี้เซ็นด้วย HMAC (ไม่พึ่ง DB) — payload + ลายเซ็น
 * ตั้ง ADMIN_SESSION_SECRET ใน .env.local
 */
export const SESSION_COOKIE = "ducky_admin_session";
const SECRET = process.env.ADMIN_SESSION_SECRET || "";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 วัน (ต่ออายุอัตโนมัติเมื่อยังใช้งาน = sliding)

export interface AdminSession {
  username: string;
  name?: string;
  role: string;
  exp: number; // unix seconds
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function createSessionToken(input: Omit<AdminSession, "exp">): string {
  const payload: AdminSession = { ...input, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined): AdminSession | null {
  if (!token || !SECRET) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AdminSession;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = MAX_AGE_SEC;

/** ตัวเลือกคุกกี้ session (ใช้ร่วมกันตอน login และตอนต่ออายุ) */
export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}
