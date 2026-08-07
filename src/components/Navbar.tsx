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

/**
 * ไอคอนเส้นบาง ๆ ชุดเดียวกันทั้งเมนูบัญชี (เดิมใช้อีโมจิคนละสไตล์ 🏠🧾👤🚪 ดูไม่เป็นชุดเดียวกัน)
 * ใช้ currentColor เพื่อให้เปลี่ยนสีตามสถานะ hover ได้
 */
const ICON = {
  home: "M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5M9.5 20v-6h5v6",
  receipt: "M6 3h12v18l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.6V3Zm3 5h6M9 12h6M9 16h4",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  logout: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h11",
} as const;

/** เมนูในดรอปดาวน์บัญชี */
const ACCOUNT_MENU = [
  { href: "/account", label: "บัญชีของฉัน", icon: ICON.home, hint: "ภาพรวม · คูปองของฉัน" },
  { href: "/account/orders", label: "ประวัติการสั่งซื้อ", icon: ICON.receipt, hint: "ติดตามงาน · สั่งซ้ำ" },
  { href: "/account/profile", label: "ข้อมูลส่วนตัว", icon: ICON.user, hint: "ชื่อ · เบอร์ · ที่อยู่" },
];

/** ไอคอนเส้นขนาดเดียวกันทุกอัน */
function LineIcon({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
      strokeLinejoin="round" className={`h-[18px] w-[18px] ${className}`} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/**
 * ป้ายบอกวิธีเข้าสู่ระบบ — บัญชีที่ล็อกอินด้วย LINE จะได้อีเมลปลอมยาว ๆ (line_u039af…)
 * โชว์ให้ลูกค้าเห็นก็ไม่มีประโยชน์ เลยแปลงเป็นข้อความที่อ่านรู้เรื่องแทน
 */
function loginLabel(email: string): { text: string; line: boolean } {
  const e = (email || "").trim();
  const viaLine = /^line[_-]/i.test(e) || !e.includes("@");
  return viaLine ? { text: "เข้าสู่ระบบด้วย LINE", line: true } : { text: e, line: false };
}

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
                  <div role="menu" className="acct-pop">
                    {/* หัวการ์ด: ตัวอักษรแรกของชื่อ + ชื่อ + ป้ายบอกว่าล็อกอินมาทางไหน */}
                    <div className="acct-head">
                      <span className="acct-ava">{(customer.name || "ส").trim().charAt(0).toUpperCase()}</span>
                      <span className="acct-who">
                        <span className="acct-name">{customer.name || "สมาชิก"}</span>
                        {(() => {
                          const l = loginLabel(customer.email);
                          return (
                            <span className={`acct-chip${l.line ? " line" : ""}`} title={customer.email}>
                              {l.line && <span className="dot" />}
                              {l.text}
                            </span>
                          );
                        })()}
                      </span>
                    </div>

                    <div className="acct-sep" />
                    <div className="acct-list">
                      {ACCOUNT_MENU.map((m) => (
                        <Link key={m.href} href={m.href} role="menuitem" className="acct-item">
                          <span className="acct-ico">
                            <LineIcon d={m.icon} />
                          </span>
                          <span className="acct-txt">
                            <span className="acct-lb">{m.label}</span>
                            <span className="acct-hint">{m.hint}</span>
                          </span>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                            strokeLinecap="round" strokeLinejoin="round" className="acct-arrow" aria-hidden="true">
                            <path d="m9 6 6 6-6 6" />
                          </svg>
                        </Link>
                      ))}
                    </div>

                    <div className="acct-sep" />
                    <div className="acct-list">
                      <button type="button" onClick={logout} role="menuitem" className="acct-item out">
                        <span className="acct-ico">
                          <LineIcon d={ICON.logout} />
                        </span>
                        <span className="acct-txt">
                          <span className="acct-lb">ออกจากระบบ</span>
                        </span>
                      </button>
                    </div>
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
          <div className="catbar-row">
            <MegaBar groups={mega} pathname={pathname} align="center" />
          </div>
        )}
      </div>
    </header>
  );
}
