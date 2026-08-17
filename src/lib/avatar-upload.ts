"use client";

import { getAccessToken } from "./customer-auth";

/**
 * รูปโปรไฟล์ลูกค้า — ใช้ร่วมกันระหว่างหน้า /account (แดชบอร์ด) และ /account/profile
 * ย่อรูปฝั่งเว็บก่อนส่ง (จัตุรัสกลางภาพ 512px · JPEG) แล้ว POST /api/auth/avatar → เขียน user_metadata.picture
 */
export const AVATAR_MAX_INPUT = 8 * 1024 * 1024;

export function shrinkImage(file: File, size = 512): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const s = Math.min(img.width, img.height);
      const sx = (img.width - s) / 2;
      const sy = (img.height - s) / 2;
      const c = document.createElement("canvas");
      c.width = c.height = Math.min(size, s);
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("เบราว์เซอร์ไม่รองรับ"));
      ctx.drawImage(img, sx, sy, s, s, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("แปลงรูปไม่สำเร็จ"))), "image/jpeg", 0.88);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("อ่านไฟล์รูปไม่สำเร็จ"));
    };
    img.src = url;
  });
}

/** อัปโหลดรูปโปรไฟล์ — คืน url ใหม่ หรือข้อความผิดพลาดภาษาไทย */
export async function uploadAvatar(file: File): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!file.type.startsWith("image/")) return { ok: false, error: "อัปโหลดได้เฉพาะไฟล์รูปภาพเท่านั้น" };
  if (file.size > AVATAR_MAX_INPUT) return { ok: false, error: "ไฟล์ใหญ่เกินไป — เลือกรูปที่ไม่เกิน 8MB" };
  try {
    const blob = await shrinkImage(file, 512);
    const token = await getAccessToken();
    const fd = new FormData();
    fd.append("file", blob, "avatar.jpg");
    const res = await fetch("/api/auth/avatar", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j.error || "อัปโหลดไม่สำเร็จ" };
    return { ok: true, url: j.url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ" };
  }
}

/** ลบรูปโปรไฟล์ (กลับไปใช้ตัวอักษรแรกของชื่อ) */
export async function removeAvatar(): Promise<{ ok: boolean; error?: string }> {
  const token = await getAccessToken();
  const res = await fetch("/api/auth/avatar", { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} }).catch(() => null);
  if (!res) return { ok: false, error: "เชื่อมต่อไม่ได้" };
  const j = await res.json().catch(() => ({}));
  return res.ok ? { ok: true } : { ok: false, error: j.error || "ลบไม่สำเร็จ" };
}
