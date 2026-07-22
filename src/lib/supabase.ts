"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * ตัวเชื่อม Supabase ฝั่งเบราว์เซอร์ (ใช้ anon key + RLS)
 * - ถ้ายังไม่ตั้งค่า env → คืน null แล้วระบบทำงานโหมดเดโม (localStorage) เหมือนเดิม
 * - ตั้งค่าใน .env.local (ดู .env.example)
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!cached) {
    cached = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return cached;
}

/** ตั้งค่า Supabase ครบหรือยัง (ใช้สลับระหว่างโหมด DB จริง กับโหมดเดโม) */
export const isSupabaseConfigured = Boolean(url && anonKey);
