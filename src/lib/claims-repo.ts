"use client";

/** ตัวกลางเรียก API ระบบเคลมฝั่งลูกค้า — แนบ Bearer token ให้ทุกคำขอ */

import { getAccessToken } from "./customer-auth";
import { getSupabase } from "./supabase";
import { checkArtworkFile } from "./artwork-upload";
import type { Claim } from "./claims";

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export async function fetchMyClaims(): Promise<{ claims: Claim[]; needsSetup?: boolean }> {
  try {
    const res = await fetch("/api/claims/mine", { headers: await authHeaders(), cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    return { claims: j.claims ?? [], needsSetup: j.needsSetup };
  } catch {
    return { claims: [] };
  }
}

export async function createClaim(input: {
  orderId: string;
  itemNames?: string[];
  type: string;
  detail: string;
  photoPaths?: string[];
}): Promise<{ ok: boolean; claim?: Claim; error?: string }> {
  try {
    const res = await fetch("/api/claims", { method: "POST", headers: await authHeaders(), body: JSON.stringify(input) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, claim: j.claim } : { ok: false, error: j.error ?? "ยื่นเคลมไม่สำเร็จ" };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}

export async function sendClaimMessage(claimId: string, text: string): Promise<{ ok: boolean; claim?: Claim; error?: string }> {
  try {
    const res = await fetch("/api/claims/message", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ claimId, text }) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, claim: j.claim } : { ok: false, error: j.error ?? "ส่งข้อความไม่สำเร็จ" };
  } catch {
    return { ok: false, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" };
  }
}

/**
 * อัปโหลดรูปประกอบเคลม 1 ไฟล์ → คืน path ใน bucket ส่วนตัว (ไม่ใช่ URL — รูปเคลมไม่ public)
 * ยิงตรงเข้า Supabase ด้วยตั๋วอัปโหลด (Netlify รับผ่าน API ได้แค่ ~4.5MB จึงไม่มีทางสำรองผ่าน proxy)
 */
export async function uploadClaimPhoto(file: File): Promise<string> {
  const bad = checkArtworkFile(file); // กติกาไฟล์เดียวกับภาพลาย (JPG/PNG/WEBP ≤15MB + คำอธิบาย HEIC)
  if (bad) throw new Error(bad);
  const sb = getSupabase();
  if (!sb) throw new Error("ระบบอัปโหลดยังไม่พร้อม ลองใหม่อีกครั้ง");

  const res = await fetch("/api/claims/sign", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ type: file.type, size: file.size }),
  });
  const sign = (await res.json().catch(() => null)) as { bucket?: string; path?: string; token?: string; error?: string } | null;
  if (!res.ok || !sign?.token || !sign.path || !sign.bucket) throw new Error(sign?.error ?? "ขอตั๋วอัปโหลดไม่สำเร็จ");

  const { error } = await sb.storage.from(sign.bucket).uploadToSignedUrl(sign.path, sign.token, file, { contentType: file.type });
  if (error) throw new Error("อัปโหลดไม่สำเร็จ — สัญญาณเน็ตหลุดระหว่างส่งไฟล์ ลองใหม่อีกครั้ง");
  return sign.path;
}
