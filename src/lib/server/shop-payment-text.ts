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

/**
 * 🎁 โปรของแถมที่เปิดอยู่ สำหรับบอท (เจ้าของร้าน 12 ต.ค. 69 "ของแถมจะตามภาพ" = หน้า ตั้งค่า › ของแถมฟรี)
 *   อ่านสด __shop_payment__.gifts (active) + ชื่อสินค้าที่เข้าโปร แคช 5 นาที — แก้โปรในหลังบ้านที่เดียว บอทตามเอง
 */
type GiftCfg = {
  name?: string; note?: string; active?: boolean; minQty?: number; step?: number; giveQty?: number; maxPerOrder?: number; value?: number;
  condition?: string; sizeLabel?: string; productIds?: string[]; categories?: string[];
  sizes?: { label?: string; perSheet?: number; note?: string }[]; partial?: { name?: string; minFill?: number };
};
let giftCache: { at: number; text: string } | null = null;

export async function shopGiftText(): Promise<string> {
  if (giftCache && Date.now() - giftCache.at < 5 * 60_000) return giftCache.text;
  const sb = getSupabaseAdmin();
  if (!sb) return "";
  try {
    const { data } = await sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle();
    const gifts = ((((data as { data?: { gifts?: GiftCfg[] } } | null)?.data ?? {}).gifts ?? []) as GiftCfg[]).filter((g) => g?.active && g.name);
    if (!gifts.length) {
      giftCache = { at: Date.now(), text: "" };
      return "";
    }
    const ids = [...new Set(gifts.flatMap((g) => g.productIds ?? []))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: rows } = await sb.from("products").select("id,data").in("id", ids);
      for (const r of rows ?? []) names.set(String(r.id), String((r.data as { name?: string }).name ?? r.id).trim());
    }
    const parts = gifts.map((g) => {
      const products = (g.productIds ?? []).map((id) => names.get(id)).filter(Boolean);
      const min = Math.max(1, Number(g.minQty) || 1);
      const step = Math.max(1, Number(g.step) || min);
      const give = Math.max(1, Number(g.giveQty) || 1);
      const rule = min === 1 && step === 1 ? `ทุก 1 ชิ้นได้ ${give} ชุด` : `สั่งครบ ${min} ชิ้นได้ ${give} ชุด และทุก ${step} ชิ้นถัดไปได้เพิ่มอีก ${give}`;
      const cap = Number(g.maxPerOrder) > 0 ? ` (สูงสุด ${g.maxPerOrder} ชุด/ออเดอร์)` : " ไม่จำกัด";
      const sizes = (g.sizes ?? []).filter((s) => s.label).map((s, i) => `${s.label}${s.perSheet ? ` (${s.perSheet} ใบ/แผ่น A3)` : ""}${i === 0 ? " ค่าเริ่มต้น" : ""}`);
      const fill = Number(g.partial?.minFill) >= 1 ? "ไม่เต็มแผ่น" : "ไม่ถึงครึ่งแผ่น";
      return [
        `${g.name}${g.note ? ` (${g.note})` : ""}${Number(g.value) > 0 ? ` มูลค่า ฿${g.value}/ชุด` : ""}`,
        products.length ? `สินค้าที่ร่วม: ${products.join(", ")}` : g.categories?.length ? `หมวดที่ร่วม: ${g.categories.join(", ")}` : "",
        `${rule}${cap}`,
        g.condition ? `เงื่อนไข: ${g.condition}` : "",
        sizes.length ? `เลือก${g.sizeLabel || "ขนาด"}ในตะกร้าได้: ${sizes.join(" · ")} (ของแถมมีแค่ ${sizes.length} ขนาดนี้เท่านั้น — ไม่ใช่ขนาดของสินค้าที่ขายแยก)` : "",
        g.partial?.name && sizes.length ? `ของแถมพิมพ์เป็นแผ่น A3 ชิ้นที่เหลือ${fill}ได้ "${g.partial.name}" แทน` : "",
      ].filter(Boolean).join(" · ");
    });
    const text = `🎁 โปรของแถมที่เปิดอยู่ (ข้อมูลจริงจากระบบ · ระบบใส่ของแถมให้เองในตะกร้า): ${parts.join(" || ")} · ลูกค้าถามเรื่องของแถม/โปร ตอบตามนี้ ห้ามสัญญาของแถมอื่น`;
    giftCache = { at: Date.now(), text };
    return text;
  } catch {
    return giftCache?.text ?? "";
  }
}
