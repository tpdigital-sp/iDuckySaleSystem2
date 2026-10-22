import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/server/require-perm";

export const runtime = "nodejs";

/**
 * 🐳 ที่อยู่โปรแกรมตัดพื้นหลังบนเซิร์ฟเวอร์ (Hugging Face Space) + รหัสเข้าใช้ — 22 ต.ค. 69
 * พนักงานไม่ต้องติดตั้ง Python ในเครื่อง · แท็บ /admin/diecut?tab=bg ลองเครื่องร้าน (localhost:8777) ก่อน ไม่เปิดค่อยใช้ตัวนี้
 * ตั้งใน Netlify env: CUTOUT_SPACE_URL (เช่น https://ชื่อผู้ใช้-iducky-cutout.hf.space) + CUTOUT_SPACE_KEY (= Secret CUTOUT_KEY ของ Space)
 * รหัสอยู่ฝั่งเซิร์ฟเวอร์ ส่งให้เฉพาะคนที่มีสิทธิ์จัดการสินค้า (สิทธิ์เดียวกับหน้าไดคัท) ไม่ฝังในโค้ดหน้าเว็บ
 */
export async function GET() {
  const gate = await requirePerm("products.manage");
  if (gate.res) return gate.res;
  const url = (process.env.CUTOUT_SPACE_URL || "").trim().replace(/\/+$/, "");
  const key = (process.env.CUTOUT_SPACE_KEY || "").trim();
  return NextResponse.json({ url: /^https:\/\//.test(url) ? url : "", key }, { headers: { "Cache-Control": "no-store" } });
}
