"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { useCustomer } from "@/lib/customer-context";

const LINKS = [
  { href: "/", label: "หน้าแรก" },
  { href: "/products", label: "สินค้าทั้งหมด" },
  { href: "/how-to-order", label: "วิธีสั่งซื้อ" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { totalQty } = useCart();
  const { customer } = useCustomer();
  const [open, setOpen] = useState(false);

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
          <Link
            href={customer ? "/account" : "/account/login"}
            className="flex h-11 items-center gap-1.5 rounded-2xl bg-amber-100 px-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-200"
            aria-label={customer ? "บัญชีของฉัน" : "เข้าสู่ระบบ"}
          >
            <span className="text-lg">{customer ? "👤" : "🔑"}</span>
            <span className="hidden max-w-24 truncate sm:inline">{customer ? customer.name || "บัญชี" : "เข้าสู่ระบบ"}</span>
          </Link>
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
