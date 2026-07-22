"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAdminSession, signOut } from "@/lib/auth";

const MENU = [
  { href: "/admin", label: "ภาพรวม", emoji: "📊" },
  { href: "/admin/orders", label: "คำสั่งซื้อ", emoji: "📦" },
  { href: "/admin/products", label: "สินค้า", emoji: "🏷️" },
  { href: "/admin/options", label: "คลังตัวเลือก", emoji: "🎛️" },
  { href: "/admin/import", label: "นำเข้าสินค้า", emoji: "📥" },
  { href: "/admin/payment", label: "บัญชี/ชำระเงิน", emoji: "🏦" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // สถานะสิทธิ์: null = กำลังตรวจ, true/false = ผลลัพธ์
  const [allowed, setAllowed] = useState<boolean | null>(null);
  // ตั้งค่า Firebase auth แล้วหรือยัง (โหมดจริง vs เดโม)
  const [configured, setConfigured] = useState(false);

  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) return;
    let active = true;
    getAdminSession().then((s) => {
      if (!active) return;
      setConfigured(s.configured);
      const ok = !s.configured || s.loggedIn;
      setAllowed(ok);
      // เก็บปลายทางเดิม (เช่น ลิงก์ลึก ?order=) ไว้ใน ?next= เพื่อพากลับหลังล็อกอิน
      if (!ok) router.replace(`/admin/login?next=${encodeURIComponent(pathname + window.location.search)}`);
    });
    return () => {
      active = false;
    };
  }, [isLoginPage, pathname, router]);

  async function handleSignOut() {
    await signOut();
    router.replace("/admin/login");
  }

  // หน้าล็อกอิน: แสดงเต็มจอไม่มี sidebar/guard
  if (isLoginPage) return <>{children}</>;

  // กำลังตรวจสิทธิ์ (เฉพาะโหมด Supabase) หรือไม่มีสิทธิ์ → กันเนื้อหาไว้ก่อน
  if (allowed === null && configured) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-stone-400">
        กำลังตรวจสอบสิทธิ์…
      </div>
    );
  }
  if (allowed === false) return null;

  const nav = (
    <nav className="space-y-0.5">
      {MENU.map((m) => {
        const active = pathname === m.href;
        return (
          <Link
            key={m.href}
            href={m.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-amber-500 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span className={`text-base ${active ? "" : "opacity-80"}`}>{m.emoji}</span> {m.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      {/* แถบข้าง (เดสก์ท็อป) */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-3 md:flex">
        <Link href="/admin" className="mb-5 flex items-center gap-2.5 px-2 py-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ducky text-xl shadow-sm">🦆</span>
          <span className="leading-tight">
            <span className="block text-sm font-bold text-slate-900">iDucky Admin</span>
            <span className="block text-[11px] text-slate-400">ระบบหลังบ้าน</span>
          </span>
        </Link>
        {nav}
        <div className="mt-auto space-y-0.5 border-t border-slate-100 pt-2">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <span className="text-base opacity-80">🏪</span> กลับหน้าร้าน
          </Link>
          {configured && (
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
            >
              <span className="text-base opacity-80">🚪</span> ออกจากระบบ
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* แถบบน (มือถือ) */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:hidden">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ducky text-lg">🦆</span>
            <span className="text-sm font-bold text-slate-900">iDucky Admin</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-lg text-slate-600"
            aria-label="เปิดเมนูแอดมิน"
            aria-expanded={open}
          >
            {open ? "✕" : "☰"}
          </button>
        </header>
        {open && (
          <div className="border-b border-slate-200 bg-white p-3 md:hidden">
            {nav}
            <div className="mt-1 border-t border-slate-100 pt-1">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600"
              >
                <span className="text-base opacity-80">🏪</span> กลับหน้าร้าน
              </Link>
              {configured && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600"
                >
                  <span className="text-base opacity-80">🚪</span> ออกจากระบบ
                </button>
              )}
            </div>
          </div>
        )}

        {configured ? (
          <div className="flex items-center justify-center gap-1.5 border-b border-emerald-100 bg-emerald-50/60 px-4 py-1.5 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> เชื่อมต่อจริง — Firebase + Supabase · การแก้ไขบันทึกลงฐานข้อมูล
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 border-b border-amber-100 bg-amber-50/60 px-4 py-1.5 text-xs font-medium text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> โหมดตัวอย่าง (Demo) — ยังไม่ได้ตั้งค่าฐานข้อมูล การแก้ไขเก็บในเบราว์เซอร์นี้
          </div>
        )}

        {/* ความกว้างคุมจากแต่ละหน้าเอง (หน้าแก้ไขสินค้าใช้เต็มจอ) */}
        <main className="w-full flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
