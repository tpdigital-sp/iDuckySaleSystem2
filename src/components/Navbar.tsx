"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart-context";
import { useCustomer } from "@/lib/customer-context";
import { signOut } from "@/lib/customer-auth";
import { fetchSiteNav, visibleMenu, visibleMega, DEFAULT_SITE_NAV, type MegaGroup, type NavLink } from "@/lib/home-nav";
/* eslint-disable @next/next/no-img-element */
import { MegaBar, MegaMobile } from "@/components/MegaMenu";

/** เมนูในดรอปดาวน์บัญชี */
const ACCOUNT_MENU = [
  { href: "/account", label: "บัญชีของฉัน", icon: "🏠" },
  { href: "/account/orders", label: "ประวัติการสั่งซื้อ", icon: "🧾" },
  { href: "/account/profile", label: "ข้อมูลส่วนตัว", icon: "👤" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { items } = useCart();
  const itemCount = items.length; // ป้ายตะกร้านับ "รายการ" ไม่ใช่จำนวนชิ้น (สั่งแก้ว 100 ใบ = 1 รายการ ไม่ใช่ 99+)
  const { customer } = useCustomer();
  const [open, setOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const acctRef = useRef<HTMLDivElement>(null);
  // ลิงก์เมนูที่แอดมินตั้งไว้ (แสดงค่าเริ่มต้นไปก่อน แล้วสลับเมื่อโหลดเสร็จ — ไม่มีจังหวะเมนูหาย)
  const [links, setLinks] = useState<NavLink[]>(visibleMenu(DEFAULT_SITE_NAV));
  const [mega, setMega] = useState<MegaGroup[]>(visibleMega(DEFAULT_SITE_NAV));
  const [logo, setLogo] = useState<string>("");
  useEffect(() => {
    fetchSiteNav().then((n) => {
      setLinks(visibleMenu(n));
      setMega(visibleMega(n));
      setLogo(n.logo ?? "");
    });
  }, []);

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
      {/* เลย์เอาต์แบบเว็บต้นแบบ: โลโก้ใหญ่ซ้ายคร่อมสองแถว · ขวาบนเมนู+บัญชี+ตะกร้า · เส้นคั่น · แถวหมวดชิดขวา */}
      <nav className="mx-auto flex max-w-7xl items-center gap-3 px-4 md:gap-8">
        <Link href="/" className="flex shrink-0 items-center gap-2 py-2" onClick={() => setOpen(false)}>
          {logo ? (
            <img
              src={logo}
              alt="iDucky Prints Studio"
              className="h-12 w-auto max-w-[220px] object-contain md:h-[4.5rem] md:max-w-[280px]"
            />
          ) : (
            <>
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ducky text-2xl shadow-sm md:h-12 md:w-12 md:text-3xl">
                🦆
              </span>
              <span className="leading-tight">
                <span className="block text-base font-bold text-amber-900 md:text-lg">iDucky Prints</span>
                <span className="block text-[11px] font-medium tracking-wide text-amber-500">
                  STUDIO • พิมพ์ตามสั่ง
                </span>
              </span>
            </>
          )}
        </Link>

        {/* คอลัมน์ขวา: แถวบน (เมนู+บัญชี+ตะกร้า) · เส้นคั่นเริ่มหลังโลโก้ · แถวหมวด (เดสก์ท็อป) */}
        <div className="flex min-w-0 flex-1 flex-col self-stretch justify-center">
        <div className="flex items-center justify-end gap-2 py-2">
          <div className="hidden min-w-0 items-center gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.id}
                href={l.href}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                  pathname === l.href
                    ? "bg-amber-100 text-amber-900"
                    : "text-stone-600 hover:bg-amber-50 hover:text-amber-800"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <span className="mx-1.5 hidden h-6 w-px bg-amber-100 md:block" aria-hidden />
          </div>
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
            aria-label={`ตะกร้าสินค้า มี ${itemCount} รายการ`}
          >
            🛒
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">
                {itemCount > 99 ? "99+" : itemCount}
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

        {/* แถวหมวดสินค้า (เดสก์ท็อป) — ชิดขวา · เส้นคั่นเริ่มหลังโลโก้แบบเว็บต้นแบบ */}
        {mega.length > 0 && (
          <div className="hidden justify-end border-t border-amber-100/70 md:flex">
            <MegaBar groups={mega} pathname={pathname} align="end" />
          </div>
        )}
        </div>
      </nav>

      {open && (
        <div className="border-t border-amber-100 bg-white px-4 py-2 md:hidden">
          {links.map((l) => (
            <Link
              key={l.id}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`block rounded-xl px-4 py-3 text-sm font-semibold ${
                pathname === l.href ? "bg-amber-100 text-amber-900" : "text-stone-600"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <MegaMobile groups={mega} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </header>
  );
}
