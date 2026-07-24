"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart-context";
import { useCustomer } from "@/lib/customer-context";
import { signOut } from "@/lib/customer-auth";

const LINKS = [
  { href: "/", label: "หน้าแรก" },
  { href: "/products", label: "สินค้าทั้งหมด" },
  { href: "/how-to-order", label: "วิธีสั่งซื้อ" },
];

/** เมนูในดรอปดาวน์บัญชี */
const ACCOUNT_MENU = [
  { href: "/account", label: "บัญชีของฉัน", icon: "🏠" },
  { href: "/account/orders", label: "ประวัติการสั่งซื้อ", icon: "🧾" },
  { href: "/account/profile", label: "ข้อมูลส่วนตัว", icon: "👤" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { totalQty } = useCart();
  const { customer } = useCustomer();
  const [open, setOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const acctRef = useRef<HTMLDivElement>(null);

  // ปิดดรอปดาวน์เมื่อคลิกนอกพื้นที่ หรือเปลี่ยนหน้า
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcctOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  useEffect(() => setAcctOpen(false), [pathname]);

  async function logout() {
    setAcctOpen(false);
    await signOut();
    router.push("/products");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-amber-100 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ducky text-2xl shadow-sm">
            🦆
          </span>
          <span className="leading-tight">
            <span className="block text-base font-bold text-amber-900">iDucky Prints</span>
            <span className="block text-[11px] font-medium tracking-wide text-amber-500">
              STUDIO • พิมพ์ตามสั่ง
            </span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                pathname === l.href
                  ? "bg-amber-100 text-amber-900"
                  : "text-stone-600 hover:bg-amber-50 hover:text-amber-800"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {customer ? (
            <div ref={acctRef} className="relative">
              <button
                type="button"
                onClick={() => setAcctOpen((v) => !v)}
                className="flex h-11 items-center gap-1.5 rounded-2xl bg-amber-100 px-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-200"
                aria-haspopup="menu"
                aria-expanded={acctOpen}
              >
                <span className="text-lg">👤</span>
                <span className="hidden max-w-24 truncate sm:inline">{customer.name || "บัญชี"}</span>
                <span className={`text-xs transition ${acctOpen ? "rotate-180" : ""}`}>▾</span>
              </button>
              {acctOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-amber-100 bg-white py-1 shadow-xl"
                >
                  <div className="border-b border-amber-50 px-4 py-2">
                    <p className="truncate text-sm font-bold text-amber-950">{customer.name || "สมาชิก"}</p>
                    <p className="truncate text-[11px] text-stone-400">{customer.email}</p>
                  </div>
                  {ACCOUNT_MENU.map((m) => (
                    <Link
                      key={m.href}
                      href={m.href}
                      role="menuitem"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-amber-50"
                    >
                      <span className="text-base">{m.icon}</span> {m.label}
                    </Link>
                  ))}
                  <button
                    type="button"
                    onClick={logout}
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 border-t border-amber-50 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                  >
                    <span className="text-base">🚪</span> ออกจากระบบ
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/account/login"
              className="flex h-11 items-center gap-1.5 rounded-2xl bg-amber-100 px-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-200"
              aria-label="เข้าสู่ระบบ"
            >
              <span className="text-lg">🔑</span>
              <span className="hidden sm:inline">เข้าสู่ระบบ</span>
            </Link>
          )}
          <Link
            href="/cart"
            className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-xl transition hover:bg-amber-200"
            aria-label={`ตะกร้าสินค้า มี ${totalQty} ชิ้น`}
          >
            🛒
            {totalQty > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">
                {totalQty > 99 ? "99+" : totalQty}
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-xl md:hidden"
            aria-label="เปิดเมนู"
            aria-expanded={open}
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-amber-100 bg-white px-4 py-2 md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`block rounded-xl px-4 py-3 text-sm font-semibold ${
                pathname === l.href ? "bg-amber-100 text-amber-900" : "text-stone-600"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
