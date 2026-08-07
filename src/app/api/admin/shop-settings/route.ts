import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { ROLE_ADMINISTRATOR } from "@/lib/permissions";
import type { ShopPayment } from "@/lib/shop-settings";

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
  if (gate.actor.role !== ROLE_ADMINISTRATOR) {
    const { data: cur } = await sb.from("products").select("data").eq("id", SHOP_PAYMENT_ID).maybeSingle();
    const prev = (cur?.data as ShopPayment | undefined) ?? ({ banks: [] } as ShopPayment);
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
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true });
}
