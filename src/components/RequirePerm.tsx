"use client";

import Link from "next/link";
import { useCan } from "@/lib/perm-context";
import type { Perm } from "@/lib/permissions";

/**
 * กันทั้งหน้าไว้สำหรับคนที่ไม่มีสิทธิ์ — กันคนพิมพ์ URL เข้าตรง ๆ
 * (ซ่อนเมนูอย่างเดียวไม่พอ) · ของจริงยังบังคับซ้ำที่ API เสมอ
 */
export default function RequirePerm({ perm, children }: { perm: Perm; children: React.ReactNode }) {
  const can = useCan();
  if (can(perm)) return <>{children}</>;

  return (
    <div className="py-20 text-center">
      <span className="text-4xl">🔒</span>
      <p className="mt-3 font-bold text-slate-700">หน้านี้ไม่ได้เปิดให้ตำแหน่งของคุณ</p>
      <p className="mt-1 text-sm text-slate-500">ถ้าต้องใช้งาน กรุณาแจ้งผู้ดูแลระบบ</p>
      <Link href="/admin" className="mt-4 inline-block text-sm font-semibold text-amber-600 hover:underline">
        ← กลับหน้าภาพรวม
      </Link>
    </div>
  );
}
