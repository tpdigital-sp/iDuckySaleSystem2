import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { CLAIM_TABLE, isMissingTable } from "@/lib/server/claims-db";
import { isOpenClaim, type Claim } from "@/lib/claims";

export const runtime = "nodejs";

/**
 * 🧰 ตัวเลขป้ายข้างเมนู "เคลมสินค้า" — เคสที่ยังเดินเรื่องอยู่และ "ยังไม่มีใครตอบลูกค้าเลย"
 *
 * เดิมเคลมที่เข้ามารู้ได้ทางเดียวคือไลน์แจ้งกลุ่มร้าน เลื่อนผ่านแล้วเคสเงียบยาว (เจ้าของร้านสั่ง 15 ก.ย. 69)
 * นับเงื่อนไขเดียวกับตัวเลข "ยังไม่ตอบลูกค้า" ในหน้า /admin/claims เป๊ะ ๆ (ลิมิต 300 แถวเท่ากัน)
 * เลยไม่มีวันขัดกันเอง — กดตอบแล้วตัวเลขลด ไม่ใช่ป้าย "ยังไม่ได้เปิดดู"
 *
 * GET → { n, open, oldestDays, ok }  (ตอบ n: 0 เสมอเมื่อถามฐานไม่ได้ ไม่ให้ป้ายค้างตัวเลขผิด)
 */

/** เปิดเคสมากี่วันแล้ว — ตรงกับ ageOf ในหน้า /admin/claims */
function ageOf(iso: string): number {
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return 0;
  const mid = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.max(0, Math.floor((mid(new Date()) - mid(d)) / 86400000));
}

export async function GET() {
  const gate = await requirePerm("orders.view");
  if (gate.res) return gate.res;
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ n: 0, open: 0, oldestDays: 0, ok: false, reason: "ยังไม่ได้ตั้งค่า Supabase" });

  const { data, error } = await sb.from(CLAIM_TABLE).select("data").order("created_at", { ascending: false }).limit(300);
  if (error) {
    // ยังไม่ได้รัน supabase/claims.sql = ยังไม่มีระบบเคลม ไม่ใช่ความผิดพลาดที่ต้องขึ้น log ทุก 90 วิ
    if (!isMissingTable(error)) console.error("[admin/claims/count] ถามฐานไม่สำเร็จ:", error.message);
    return NextResponse.json({ n: 0, open: 0, oldestDays: 0, ok: false, reason: error.message });
  }

  const claims = (data ?? []).map((r) => r.data as Claim).filter((c) => !!c?.id);
  const open = claims.filter(isOpenClaim);
  const noReply = open.filter((c) => !(c.messages ?? []).some((m) => m.by === "admin"));
  const oldestDays = open.length ? Math.max(...open.map((c) => ageOf(c.createdAt))) : 0;
  return NextResponse.json({ n: noReply.length, open: open.length, oldestDays, ok: true });
}
