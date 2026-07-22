import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client ฝั่งเซิร์ฟเวอร์ด้วย service_role key (ข้าม RLS)
 * ใช้ใน API route เขียนสินค้า หลังตรวจ session แอดมินแล้วเท่านั้น
 */
let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  if (!cached) cached = createClient(url, serviceKey, { auth: { persistSession: false } });
  return cached;
}
