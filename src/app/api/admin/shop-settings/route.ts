import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { ROLE_ADMINISTRATOR } from "@/lib/permissions";
import type { ShopPayment } from "@/lib/shop-settings";
import { seoOf } from "@/lib/settings-shared";

export const runtime = "nodejs";
// id เดียวกับ SETTINGS_ID ใน shop-settings.ts — hardcode ไว้เพราะ shop-settings เป็น "use client"
// (ค่า const จากโมดูล client จะกลายเป็น stub เมื่อ import ฝั่ง server → id เป็น null)
const SHOP_PAYMENT_ID = "__shop_payment__";

/** บันทึกข้อมูลบัญชีร้าน (เฉพาะแอดมิน) — เก็บในตาราง option_presets ด้วย reserved id */
export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  const gate = await requirePerm("settings.manage");
  if (gate.res) return gate.res;

  let p: ShopPayment;
  try {
    p = (await req.json()) as ShopPayment;
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  /**
   * ของอ่อนไหว (บัญชีรับเงินของร้าน · โค้ดเชื่อม Google) แก้ได้เฉพาะผู้ดูแลระบบ
   * ตำแหน่งอื่นบันทึกแท็บอื่นได้ตามปกติ — ระบบคงค่าเดิมของ 2 ส่วนนี้ไว้ให้ (ไม่ใช่แค่ซ่อนช่องในหน้าจอ)
   */
  const { data: cur } = await sb.from("products").select("data").eq("id", SHOP_PAYMENT_ID).maybeSingle();
  const prev = (cur?.data as ShopPayment | undefined) ?? ({ banks: [] } as ShopPayment);
  if (gate.actor.role !== ROLE_ADMINISTRATOR) {
    p = {
      ...p,
      banks: prev.banks ?? [],
      promptpay: prev.promptpay,
      promptpayName: prev.promptpayName,
      note: prev.note,
      seo: prev.seo,
    };
  }

  // เก็บเป็นแถวพิเศษในตาราง products (category "__settings__" + id reserved กันชนสินค้าจริง)
  const { error } = await sb
    .from("products")
    .upsert(
      { id: SHOP_PAYMENT_ID, name: "(ตั้งค่าร้าน — บัญชีชำระเงิน)", category: "__settings__", price: 0, data: p },
      { onConflict: "id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /**
   * 🔄 ค่าเชื่อม Google (โค้ดยืนยัน Search Console · GA4 · GTM · noindex) อยู่ใน <head> ของ layout หน้าร้าน
   * ซึ่งหน้าแรก/หน้าสินค้าถูกแคชไว้ (Next ISR + Netlify Durable) → บันทึกแล้วเว็บจริงยังเป็นหน้าเก่า
   * (8 ต.ค. 69 วางโค้ด Search Console แล้วกดยืนยัน Google ตอบ "ไม่พบเมตาแท็ก" จนแคชหมดอายุเอง)
   * เปลี่ยนเฉพาะส่วน seo ค่อยล้างแคชทั้ง layout — แท็บอื่น (วิธีส่ง/ของแถม) ไม่ต้องทำให้ทั้งเว็บสร้างใหม่
   * ⚠️ jsonb เรียงคีย์ใหม่ ห้ามเทียบ JSON.stringify ตรง ๆ → เทียบทีละค่าหลังผ่าน seoOf (ค่าที่ใช้จริง)
   */
  const seoChanged = (() => {
    const a = seoOf(prev);
    const b = seoOf(p);
    return (Object.keys({ ...a, ...b }) as (keyof typeof a)[]).some((k) => a[k] !== b[k]);
  })();
  if (seoChanged) {
    try {
      revalidatePath("/", "layout");
    } catch {
      /* ล้างไม่ได้ก็ไม่ควรทำให้การบันทึกล้ม — อย่างช้าหน้าจะสดเองเมื่อแคชหมดอายุ */
    }
  }
  return NextResponse.json({ ok: true });
}
