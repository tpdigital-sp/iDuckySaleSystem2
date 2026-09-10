"use client";

import Link from "next/link";
import { fallbackToOriginal, imgProps } from "@/lib/img";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart-context";
import { useCustomer } from "@/lib/customer-context";
import NotifBell from "@/components/NotifBell";
import { signOut, type Customer } from "@/lib/customer-auth";
import { fetchSiteNav, visibleMenu, visibleMega, DEFAULT_SITE_NAV, type MegaGroup, type NavLink } from "@/lib/home-nav";
/* eslint-disable @next/next/no-img-element */
import { MegaBar } from "@/components/MegaMenu";
import NavCatMenu from "@/components/NavCatMenu";
import BottomNav from "@/components/BottomNav";
import NavSearchBar from "@/components/NavSearchBar";
import MobileNav from "@/components/MobileNav";
import MobileSearch from "@/components/MobileSearch";

/**
 * แถบเมนูหัวเว็บ — ดีไซน์ตามไฟล์ต้นแบบ LADNDING PAGE.html (9 ก.ย. 69)
 *
 * เดสก์ท็อป (≥1001px) สองแถวในการ์ดกระจกเดียว:
 *   แถวบน   โลโก้ · แถบค้นหา "AI Mode" (พิมพ์แล้วมี dropdown ผลลัพธ์) · โปรไฟล์ → กระดิ่ง → ตะกร้า → ช้อปเลย
 *   แถวล่าง ชิป "สินค้าและบริการ" (เมกะเมนูหมวด) ชิดซ้าย · ลิงก์เมนูจากหลังบ้านชิดขวา
 * แท็บเล็ต/มือถือ: โลโก้ · แถบค้นหา (กดแล้วเปิดค้นหาเต็มจอ) · ไอคอน · ☰ เปิดเมนูหมวดเต็มจอ + แถบเมนูล่างสไตล์แอป
 *
 * เมนูลิงก์ + โลโก้ ตั้งได้จากหลังบ้าน (/admin/nav → products row __site_nav__) — ค่าเริ่มต้นใน home-nav.ts
 */

/** ไอคอนเส้นบางชุดเดียวกับต้นแบบ (.nav-icon-svg) */
function UserIcon() {
  return (
    <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20c0-3.6 3.2-5.8 7.2-5.8s7.2 2.2 7.2 5.8" />
    </svg>
  );
}
function CartIcon() {
  return (
    <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.2 4h2.1l2 10.2h9.9l1.9-7.4H6.1" />
      <circle cx="9.6" cy="19" r="1.5" />
      <circle cx="16.6" cy="19" r="1.5" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <line x1="16" y1="16" x2="20.5" y2="20.5" />
    </svg>
  );
}

/** รหัสลูกค้าแบบอ่านง่าย — ตัดจาก id จริงของบัญชี (ชุดเดียวกับหน้าบัญชี) */
function customerCode(id: string): string {
  const hex = id.replace(/[^0-9a-f]/gi, "").toUpperCase();
  return `IDK-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

/** ระดับสมาชิกที่หน้าบัญชีจดไว้ในเครื่อง (ducky_acc_tier) — ใช้ทำกรอบรูป/ป้ายระดับ โดยไม่ต้องยิง API เพิ่ม */
const RINGS = new Set(["bronze", "silver", "gold", "platinum", "diamond"]);
function readTier(cid: string): { id: string; name: string; icon: string } | null {
  try {
    const h = JSON.parse(localStorage.getItem("ducky_acc_tier") || "null") as { cid: string; id: string; name: string; icon: string } | null;
    return h && h.cid === cid ? h : null;
  } catch {
    return null;
  }
}

/** เมนูในดรอปดาวน์บัญชี (ตามต้นแบบ) */
const USER_LINKS = [
  { href: "/account/orders", ico: "📦", label: "คำสั่งซื้อของฉัน" },
  { href: "/account/profile", ico: "📍", label: "ที่อยู่จัดส่ง" },
  { href: "/account", ico: "💛", label: "บัญชีของฉัน" },
  { href: "/dealer", ico: "🤝", label: "สมัครตัวแทนจำหน่าย" },
  { href: "/how-to-order", ico: "❓", label: "วิธีสั่งซื้อ & ช่วยเหลือ" },
];

/** รูปโปรไฟล์ในกรอบสีตามระดับ — ไม่มีรูป = วงกลมตัวอักษรแรกของชื่อ */
function UserPic({ customer, ring, lg }: { customer: Customer; ring?: string; lg?: boolean }) {
  const initial = (customer.name || "ส").trim().charAt(0).toUpperCase();
  return (
    <span className={`nav-user-pic${lg ? " lg" : ""}`} data-ring={ring} aria-hidden="true">
      {customer.picture ? (
        <span className="nav-user-photo" style={{ backgroundImage: `url(${customer.picture})` }} />
      ) : (
        <span className="nav-user-photo txt">{initial}</span>
      )}
    </span>
  );
}

/** เมนูโปรไฟล์ (เดสก์ท็อป) — ปุ่มไอคอนคน / รูปโปรไฟล์ในกรอบสีระดับ + ดรอปดาวน์สถานะยังไม่ล็อกอิน/ล็อกอินแล้ว */
function NavUserMenu() {
  const { customer } = useCustomer();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tier, setTier] = useState<{ id: string; name: string; icon: string } | null>(null);
  useEffect(() => {
    setTier(customer ? readTier(customer.id) : null);
  }, [customer, pathname]);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ring = tier && RINGS.has(tier.id) ? tier.id : undefined;
  async function logout() {
    setOpen(false);
    await signOut();
    router.push("/products");
  }

  return (
    <div ref={wrapRef} className={`nav-user-wrap${customer ? " is-signed-in" : ""}`} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="icon-btn nav-account-icon"
        aria-label={customer ? `บัญชีของ ${customer.name || "สมาชิก"}` : "บัญชีของฉัน"}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {customer && <UserPic customer={customer} ring={ring} />}
        <UserIcon />
      </button>
      <div className={`nav-user-drop${open ? " open" : ""}`} role="menu">
        <div className="nav-user-guest">
          <div className="nav-user-head">
            <span className="nav-user-avatar">🐣</span>
            <div>
              <b>ยังไม่ได้เข้าสู่ระบบ</b>
              <span>เข้าสู่ระบบเพื่อติดตามออเดอร์และเก็บที่อยู่</span>
            </div>
          </div>
          <div className="nav-user-actions">
            <Link className="nav-user-btn primary" href="/account/login">
              เข้าสู่ระบบ
            </Link>
            <Link className="nav-user-btn ghost" href="/account/login">
              สมัครสมาชิก
            </Link>
          </div>
        </div>
        {customer && (
          <div className="nav-user-signed">
            <div className="nav-user-head">
              <UserPic customer={customer} ring={ring} lg />
              <div>
                <b>{customer.name || "สมาชิก"}</b>
                {tier && (
                  <span className="nav-tier-tag" data-ring={ring}>
                    {tier.icon} {tier.name}
                  </span>
                )}
                <span className="nav-user-cid">รหัสลูกค้า {customerCode(customer.id)}</span>
              </div>
            </div>
          </div>
        )}
        <div className="nav-user-links">
          {USER_LINKS.map((l) => (
            <Link key={l.href + l.label} href={l.href} role="menuitem" onClick={() => setOpen(false)}>
              <i>{l.ico}</i>
              {l.label}
            </Link>
          ))}
        </div>
        <div className="nav-user-foot">
          <button type="button" className="nav-user-signout" role="menuitem" onClick={logout}>
            <i>↪</i>ออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const { items } = useCart();
  const itemCount = items.length; // ป้ายตะกร้านับ "รายการ" ไม่ใช่จำนวนชิ้น (สั่งแก้ว 100 ใบ = 1 รายการ ไม่ใช่ 99+)
  const [mnavOpen, setMnavOpen] = useState(false);
  const [msearchOpen, setMsearchOpen] = useState(false);
  /** เลื่อนหน้าลงแล้วแถบเมนูหดลง (คลาส .small ตามดีไซน์) */
  const [small, setSmall] = useState(false);
  // ลิงก์เมนูที่แอดมินตั้งไว้ (แสดงค่าเริ่มต้นไปก่อน แล้วสลับเมื่อโหลดเสร็จ — ไม่มีจังหวะเมนูหาย)
  const [links, setLinks] = useState<NavLink[]>(visibleMenu(DEFAULT_SITE_NAV));
  // เมกะเมนูจากหลังบ้านเริ่มจากว่าง — ผู้ใช้ลบทิ้งแล้ว (2 ก.ย. 69) ถ้าแอดมินสร้างใหม่ใน /admin/nav ค่อยโผล่ตามข้อมูล
  // (ห้าม seed จาก DEFAULT_SITE_NAV ไม่งั้นแถบที่ลบไปแล้ววูบขึ้นมาก่อน /api/nav ตอบ)
  const [mega, setMega] = useState<MegaGroup[]>([]);
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

  // เปลี่ยนหน้าเมื่อไหร่ก็ปิด overlay ทิ้ง
  useEffect(() => {
    setMnavOpen(false);
    setMsearchOpen(false);
  }, [pathname]);

  const catLink = links.find((l) => /#categories$/.test(l.href));
  const menuLinks = links.filter((l) => l !== catLink);

  return (
    <>
      <header className={`nav${small ? " small" : ""}`} id="nav">
        <div className="wrap">
          <nav className="nav-in">
            <div className="nav-row nav-row-top">
              <Link href="/" className="logo">
                {logo ? (
                  <img {...imgProps(logo, "210px", 384)} onError={fallbackToOriginal(logo)} alt="iDucky Prints Studio" className="logo-img" />
                ) : (
                  <img className="logo-img" src="/landing/logo-ducky.png" alt="iDucky Prints Studio" width={722} height={243} />
                )}
              </Link>

              <NavSearchBar
                onOpenMobile={() => {
                  setMnavOpen(false);
                  setMsearchOpen(true);
                }}
              />

              <div className="nav-cta">
                <NavUserMenu />

                <Link href="/cart" className="icon-btn nav-cart-icon" aria-label={`ตะกร้าสินค้า มี ${itemCount} รายการ`} title="ตะกร้าสินค้า">
                  <CartIcon />
                  {itemCount > 0 && <span className="nav-cart-count">{itemCount > 99 ? "99+" : itemCount}</span>}
                </Link>

                {/* มือถือ: ตะกร้าย้ายลงแถบเมนูล่างแล้ว ช่องนี้สลับเป็นปุ่มค้นหาเต็มจอแทน */}
                <button
                  type="button"
                  className="icon-btn nav-search-mobile"
                  aria-label="ค้นหาสินค้า"
                  onClick={() => {
                    setMnavOpen(false);
                    setMsearchOpen((v) => !v);
                  }}
                >
                  <SearchIcon />
                </button>

                {/* กระดิ่งแจ้งเตือน (เฉพาะสมาชิก) — ค้างชำระ / แบบรอตรวจ / จัดส่งแล้ว */}
                <NotifBell />

                <Link href="/products" className="btn btn-yolk">
                  ช้อปเลย <span className="dot">→</span>
                </Link>

                <button
                  type="button"
                  className="icon-btn burger"
                  aria-label="เปิดเมนู"
                  aria-expanded={mnavOpen}
                  onClick={() => {
                    setMsearchOpen(false);
                    setMnavOpen((v) => !v);
                  }}
                >
                  ☰
                </button>
              </div>
            </div>

            <div className="nav-row nav-row-bottom">
              {/* ชิป "สินค้าและบริการ" — เมกะเมนูหมวดสินค้า (เดสก์ท็อป · มือถือใช้เมนู ☰ แทน) */}
              {catLink && <NavCatMenu label={catLink.label} href={catLink.href} />}
              <div className="menu" id="menu">
                {menuLinks.map((l) => (
                  <Link key={l.id} href={l.href} className={pathname === l.href ? "on" : undefined}>
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          </nav>

          {/* แถบหมวดสินค้า (เดสก์ท็อป) — เมกะเมนูจากหลังบ้าน ถ้าแอดมินตั้งไว้ */}
          {mega.length > 0 && (
            <div className="catbar-row">
              <MegaBar groups={mega} pathname={pathname} align="center" />
            </div>
          )}
        </div>
      </header>

      {/* เมนูหมวดหมู่เต็มจอ + ค้นหาเต็มจอ (มือถือ/แท็บเล็ต) */}
      <MobileNav open={mnavOpen} onClose={() => setMnavOpen(false)} logo={logo} />
      <MobileSearch open={msearchOpen} onClose={() => setMsearchOpen(false)} logo={logo} />

      {/* แถบเมนูล่างสไตล์แอป (มือถือ) */}
      <BottomNav itemCount={itemCount} />
    </>
  );
}
