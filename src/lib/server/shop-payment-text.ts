import "server-only";
import { getSupabaseAdmin } from "./supabase-admin";
import type { BankAccount } from "@/lib/shop-settings";
import { BANK_CARD, digitsOnly } from "@/lib/bank-card";
import { SITE_URL } from "@/lib/shop-info";

/**
 * 🏦 บัญชีรับโอนของร้านสำหรับบอท (เจ้าของร้าน 12 ต.ค. 69 "บอทส่งเลขบัญชีธนาคารได้เลย เพราะใส่ไว้ในระบบแล้ว")
 *   อ่านสดจากหลังบ้าน /admin/payment (products.__shop_payment__.banks/promptpay) แคช 5 นาที — แก้บัญชีที่หลังบ้านที่เดียว บอทตามเอง
 *   ใช้ 2 ที่: บอท LINE (ต่อท้าย customer-profile) + แชทเว็บ (systemMessage)
 *   กันมิจฉาชีพ: กำชับให้บอทให้เฉพาะบัญชีในรายการนี้ และชวนโอนผ่านหน้าออเดอร์ (QR ยอดตรง + แนบสลิปที่นั่น) เมื่อมีออเดอร์แล้ว
 */
let cache: { at: number; text: string; cardOk: boolean } | null = null;

/** ภาพบัญชีส่งลูกค้าได้ไหม (เลขในตั้งค่าตรงกับเลขในภาพ) → URL เต็มของภาพ JPG · ไม่ตรง = null (ภาพเก่า ห้ามส่ง) */
export async function bankCardUrl(): Promise<string | null> {
  await shopPaymentText();
  return cache?.cardOk ? `${SITE_URL}${BANK_CARD.jpg}` : null;
}

export async function shopPaymentText(): Promise<string> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.text;
  const sb = getSupabaseAdmin();
  if (!sb) return "";
  try {
    const { data } = await sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle();
    const d = ((data as { data?: { banks?: BankAccount[]; promptpay?: string; promptpayName?: string } } | null)?.data ?? {}) as {
      banks?: BankAccount[];
      promptpay?: string;
      promptpayName?: string;
    };
    const banks = (d.banks ?? []).filter((b) => b?.accountNo);
    const cardOk = banks.some((b) => digitsOnly(b.accountNo) === BANK_CARD.accountNo);
    const parts = banks.map((b) => `ธนาคาร${String(b.bank).replace(/^ธนาคาร/, "")} เลขที่ ${b.accountNo} ชื่อบัญชี ${b.accountName}`);
    if (d.promptpay) parts.push(`พร้อมเพย์ ${d.promptpay}${d.promptpayName ? ` (${d.promptpayName})` : ""}`);
    const text = parts.length
      ? `🏦 บัญชีรับโอนของร้าน (ข้อมูลจริงจากระบบ): ${parts.join(" · ")} · ลูกค้าถามเลขบัญชีให้ตอบตามนี้ได้เลย ห้ามให้บัญชีอื่น${cardOk ? ` · แนบลิงก์ภาพบัญชีท้ายข้อความด้วย: ${SITE_URL}${BANK_CARD.jpg}` : ""} · ถ้ามีออเดอร์แล้ว แนะนำโอนผ่านหน้าออเดอร์ (มี QR ยอดตรง) และแนบสลิปที่หน้าออเดอร์`
      : "";
    cache = { at: Date.now(), text, cardOk };
    return text;
  } catch {
    return cache?.text ?? "";
  }
}
