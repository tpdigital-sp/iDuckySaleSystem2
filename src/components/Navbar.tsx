"use client";

import Link from "next/link";
import { fallbackToOriginal, imgProps } from "@/lib/img";
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
  /** เลื่อนหน้าลงแล้วแถบเมนูหดลง (คลาส .small ตามดีไซน์) */
  const [small, setSmall] = useState(false);
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

  useEffect(() => {
    const onScroll = () => setSmall(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ปิดดรอปดาวน์เมื่อคลิกนอกพื้นที่ หรือเปลี่ยนหน้า
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcctOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  useEffect(() => {
    setAcctOpen(false);
    setOpen(false);
  }, [pathname]);

  async function logout() {
    setAcctOpen(false);
    await signOut();
    router.push("/products");
  }

  return (
    <header className={`nav${small ? " small" : ""}`} id="nav">
      <div className="wrap">
        <nav className="nav-in">
          <Link href="/" className="logo" onClick={() => setOpen(false)}>
            {logo ? (
              <img
                {...imgProps(logo, "210px", 384)}
                onError={fallbackToOriginal(logo)}
                alt="iDucky Prints Studio"
                className="h-11 w-auto max-w-[210px] object-contain"
              />
            ) : (
              <>
                <img className="duck-mini" src="/landing/logo-duck.webp" alt="" aria-hidden="true" />
                <span>
                  i<b>DUCKY</b>
                </span>
              </>
            )}
          </Link>

          <div className={`menu${open ? " open" : ""}`} id="menu" onClick={() => setOpen(false)}>
            {links.map((l) => (
              <Link key={l.id} href={l.href} className={pathname === l.href ? "on" : undefined}>
                {l.label}
              </Link>
            ))}
            {/* มือถือ: หมวดสินค้าทั้งหมดอยู่ในเมนูที่กางออก */}
            <div className="md:hidden">
              <MegaMobile groups={mega} onNavigate={() => setOpen(false)} />
            </div>
          </div>

          <div className="nav-cta">
            {customer ? (
              <div ref={acctRef} className="relative">
                <button
                  type="button"
                  onClick={() => setAcctOpen((v) => !v)}
                  className="icon-btn"
                  aria-haspopup="menu"
                  aria-expanded={acctOpen}
                  aria-label={`บัญชีของ ${customer.name || "สมาชิก"}`}
                  title={customer.name || "บัญชีของฉัน"}
                >
                  👤
                </button>
                {acctOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-sky-100"
                  >
                    <div className="border-b border-sky-50 px-4 py-2">
                      <p className="truncate text-sm font-bold text-[#173A6B]">{customer.name || "สมาชิก"}</p>
                      <p className="truncate text-[11px] text-[#4A6A96]">{customer.email}</p>
                    </div>
                    {ACCOUNT_MENU.map((m) => (
                      <Link
                        key={m.href}
                        href={m.href}
                        role="menuitem"
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[#4A6A96] transition hover:bg-sky-50"
                      >
                        <span className="text-base">{m.icon}</span> {m.label}
                      </Link>
                    ))}
                    <button
                      type="button"
                      onClick={logout}
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 border-t border-sky-50 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
                    >
                      <span className="text-base">🚪</span> ออกจากระบบ
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/account/login" className="icon-btn" aria-label="เข้าสู่ระบบ" title="เข้าสู่ระบบ">
                🔑
              </Link>
            )}

            <Link
              href="/cart"
              className="icon-btn relative"
              aria-label={`ตะกร้าสินค้า มี ${itemCount} รายการ`}
              title="ตะกร้าสินค้า"
            >
              🛒
              {itemCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </Link>

            <Link href="/products" className="btn btn-yolk hidden sm:inline-flex">
              ช้อปเลย <span className="dot">→</span>
            </Link>

            <button
              type="button"
              className="icon-btn burger"
              onClick={() => setOpen((v) => !v)}
              aria-label="เปิดเมนู"
              aria-expanded={open}
            >
              {open ? "✕" : "☰"}
            </button>
          </div>
        </nav>

        {/* แถวหมวดสินค้า (เดสก์ท็อป) — เมกะเมนูเดิม วางใต้แถบกระจก */}
        {mega.length > 0 && (
          <div className={`hidden justify-center transition-all duration-300 md:flex ${small ? "mt-1.5" : "mt-2.5"}`}>
            <div className="max-w-full rounded-full border border-white/70 bg-white/70 p-1 shadow-[0_8px_22px_rgba(44,129,196,.13)] backdrop-blur-[18px] backdrop-saturate-150">
              <MegaBar groups={mega} pathname={pathname} align="center" />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
