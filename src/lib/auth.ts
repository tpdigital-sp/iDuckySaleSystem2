"use client";

/**
 * ล็อกอินแอดมินฝั่ง client — เรียกผ่าน API route (ตรวจกับ Firebase employees2 ฝั่งเซิร์ฟเวอร์)
 * โหมดเดโม (ยังไม่ตั้งค่า Firebase) → เข้าหลังบ้านได้เลย
 */

import type { Perm } from "@/lib/permissions";

export async function signInAdmin(
  username: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) clearSessionCache(); // สถานะล็อกอินใหม่ต้องเห็นทันที
    return res.ok ? { ok: true } : { ok: false, error: data.error ?? "เข้าสู่ระบบไม่สำเร็จ" };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}

export async function signOut(): Promise<void> {
  try {
    await fetch("/api/admin/logout", { method: "POST" });
  } catch {
    // ข้าม
  } finally {
    clearSessionCache();
  }
}

interface SessionInfo {
  configured: boolean;
  loggedIn: boolean;
  name: string | null;
  /** ชื่อตำแหน่งไว้แสดง เช่น "พนักงาน · แพ็คของ" */
  role?: string;
  /** สิทธิ์ที่ใช้ซ่อน/แสดงเมนูและปุ่ม (ของจริงบังคับที่ API) */
  perms?: Perm[];
  /** เป็นผู้ดูแลระบบไหม — ใช้ซ่อนของที่อ่อนไหว (บัญชีร้าน · บทบาท · เชื่อม Google) */
  isAdministrator?: boolean;
}

const EMPTY: SessionInfo = { configured: false, loggedIn: false, name: null, role: "", perms: [], isAdministrator: false };

/**
 * แคชผลตรวจ session ไว้ 60 วิ — AdminShell เรียกทุกครั้งที่เปลี่ยนหน้า
 * ถ้าไม่แคช ทุกคลิกในหลังบ้านต้องรอ round-trip ตรวจสิทธิ์ก่อนแสดงหน้า (หน่วงทั้งระบบ)
 */
let sessionCache: { at: number; value: SessionInfo } | null = null;

/** ล้างแคช session — เรียกหลังล็อกอิน/ล็อกเอาต์ ให้สถานะใหม่มีผลทันที */
export function clearSessionCache() {
  sessionCache = null;
}

/** คำขอที่กำลังวิ่งอยู่ — หลายส่วนของหน้าเดียวกันถามพร้อมกัน ให้ยิงจริงครั้งเดียวแล้วแชร์ผล */
let inFlight: Promise<SessionInfo> | null = null;

export async function getAdminSession(): Promise<SessionInfo> {
  if (sessionCache && Date.now() - sessionCache.at < 60_000) return sessionCache.value;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch("/api/admin/session", { cache: "no-store" });
      if (!res.ok) return EMPTY;
      const value = (await res.json()) as SessionInfo;
      // แคชเฉพาะผลที่ล็อกอินแล้ว/โหมดเดโม — สถานะ "ไม่ผ่าน" ไม่แคช (ล็อกอินเสร็จจะได้เข้าได้ทันที)
      if (!value.configured || value.loggedIn) sessionCache = { at: Date.now(), value };
      return value;
    } catch {
      return EMPTY;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** เข้าหลังบ้านได้ไหม: โหมดเดโม (ยังไม่ตั้งค่า) → ได้เลย, โหมดจริง → ต้องล็อกอิน */
export async function canAccessAdmin(): Promise<boolean> {
  const s = await getAdminSession();
  return !s.configured || s.loggedIn;
}
