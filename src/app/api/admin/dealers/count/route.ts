import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";
import { loadDealersDoc } from "@/lib/server/dealers";

export const runtime = "nodejs";

/**
 * 🤝 ตัวเลขป้ายข้างเมนู "ตัวแทนจำหน่าย" — ใบสมัครที่ยังรออนุมัติ
 *
 * เดิมใบสมัครจากหน้า /dealer เข้ามาเงียบ ๆ รู้ได้ทางเดียวคือบังเอิญเปิดหน้า /admin/dealers
 * (เจ้าของร้านสั่ง 15 ก.ย. 69) — ตัวเลขตรงกับหัวข้อ "📥 รออนุมัติ (N ใบ)" ในหน้านั้นเป๊ะ ๆ
 *
 * ⚠️ ไม่เรียก auth.admin.listUsers เหมือน GET /api/admin/dealers — ป้ายนี้ถามทุก 90 วินาที
 *    ดึงบัญชีมาทั้ง 1000 คนเพื่อนับใบสมัครไม่คุ้ม (แถว __dealers__ แถวเดียวพอ + cache 10 วิในไลบรารี)
 *
 * GET → { n, ok }  (ตอบ n: 0 เสมอเมื่อถามฐานไม่ได้ ไม่ให้ป้ายค้างตัวเลขผิด)
 */
export async function GET() {
  const gate = await requirePerm("dealers.manage");
  if (gate.res) return gate.res;

  const doc = await loadDealersDoc();
  return NextResponse.json({ n: Object.keys(doc.applications).length, ok: true });
}
