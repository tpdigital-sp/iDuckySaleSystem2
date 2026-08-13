"use client";

/** ระบบสมาชิกลูกค้า (Supabase Auth — อีเมล + รหัสผ่าน) · โปรไฟล์เก็บใน user_metadata */
import { getSupabase } from "./supabase";
import type { User } from "@supabase/supabase-js";

export interface Customer {
  id: string;
  email: string;
  name: string;
  phone: string;
  address: string;
}

export interface Profile {
  name: string;
  phone: string;
  address: string;
}

function toCustomer(user: User | null | undefined): Customer | null {
  if (!user) return null;
  const m = (user.user_metadata ?? {}) as Partial<Profile>;
  return {
    id: user.id,
    email: user.email ?? "",
    name: m.name ?? "",
    phone: m.phone ?? "",
    address: m.address ?? "",
  };
}

function mapErr(msg: string): string {
  if (/already registered|already exists|user already/i.test(msg)) return "This email is already registered";
  if (/invalid login|invalid credentials/i.test(msg)) return "Incorrect email or password";
  if (/at least 6|password should be/i.test(msg)) return "Password must be at least 6 characters";
  if (/email.*invalid|invalid.*email/i.test(msg)) return "That email address looks invalid";
  return msg;
}

export async function getCustomer(): Promise<Customer | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return toCustomer(data.user);
}

export async function signUp(
  email: string,
  password: string,
  profile: Profile
): Promise<{ ok: boolean; needsConfirm?: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Service is not ready yet (Supabase not configured)" };
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: profile } });
  if (error) return { ok: false, error: mapErr(error.message) };
  return { ok: true, needsConfirm: !data.session }; // ไม่มี session = ต้องยืนยันอีเมลก่อน
}

export async function signIn(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Service is not ready yet" };
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return error ? { ok: false, error: mapErr(error.message) } : { ok: true };
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut();
}

export async function updateProfile(profile: Profile): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Service is not ready yet" };
  const { error } = await sb.auth.updateUser({ data: profile });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** ส่งอีเมลลิงก์รีเซ็ตรหัสผ่าน — คลิกแล้วเด้งมาที่ /account/reset เพื่อตั้งรหัสใหม่ */
export async function requestPasswordReset(email: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Service is not ready yet" };
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/account/reset` : undefined;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
  return error ? { ok: false, error: mapErr(error.message) } : { ok: true };
}

/** ตั้งรหัสผ่านใหม่ (ใช้ตอนอยู่ในเซสชัน recovery จากลิงก์อีเมล) */
export async function updatePassword(password: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Service is not ready yet" };
  const { error } = await sb.auth.updateUser({ password });
  return error ? { ok: false, error: mapErr(error.message) } : { ok: true };
}

/** token สำหรับยิง API ที่ต้องยืนยันตัวตนลูกค้า (เช่น ประวัติออเดอร์) */
export async function getAccessToken(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

export function onAuthChange(cb: (c: Customer | null) => void): () => void {
  const sb = getSupabase();
  if (!sb) {
    cb(null);
    return () => {};
  }
  const { data } = sb.auth.onAuthStateChange((_e, session) => cb(toCustomer(session?.user)));
  return () => data.subscription.unsubscribe();
}
