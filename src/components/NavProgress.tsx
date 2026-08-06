"use client";

/**
 * แถบสถานะ "กำลังเปิดหน้า…" ด้านบนจอ
 *
 * ทำไมต้องมี: Next.js App Router จะคาหน้าเดิมไว้จนกว่าหน้าใหม่จะพร้อม
 * ถ้าหน้าใหม่ช้า (เช่นโหมด dev ต้อง compile ก่อน ~5-10 วิ) จอจะนิ่งสนิทเหมือนคลิกไม่ติด
 * → ผู้ใช้กดซ้ำหลายครั้ง · แถบนี้ตอบสนองทันทีที่คลิก จะได้รู้ว่าระบบรับคำสั่งแล้ว
 */

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function NavProgress() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  // คลิกลิงก์ภายในเว็บ = เริ่มโหลดหน้าใหม่
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || a.target === "_blank" || a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(a.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setPending(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // หน้าใหม่มาถึงแล้ว → ปิดแถบ
  useEffect(() => setPending(false), [pathname]);

  // กันค้าง: ถ้าเกิน 20 วิยังไม่เปลี่ยนหน้า (โหลดล้มเหลว/ผู้ใช้กดยกเลิก) ให้เก็บแถบเอง
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(false), 20000);
    return () => clearTimeout(t);
  }, [pending]);

  if (!pending) return null;
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-amber-100">
        <div className="nav-progress-bar h-full w-1/3 rounded-r-full bg-amber-500" />
      </div>
      <div className="pointer-events-none fixed left-1/2 top-3 z-[100] -translate-x-1/2 rounded-full bg-slate-900/85 px-3.5 py-1.5 text-xs font-bold text-white shadow-lg">
        ⏳ กำลังเปิดหน้า…
      </div>
    </>
  );
}
