"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/* eslint-disable @next/next/no-img-element */

/**
 * แถบเมนูล่างสไตล์แอป (มือถือ/แท็บเล็ต ≤1000px) — ต้นแบบ MEGAMENU_03
 *
 * แทนที่ปุ่ม ☰ มุมขวาบน (ซ่อนไปแล้วใน landing.css) เพราะนิ้วโป้งเอื้อมถึงแถบล่างง่ายกว่า
 * ปุ่มขวาสุดคือตัวกางเมนูลิงก์เดิม — สถานะเปิด/ปิดใช้ร่วมกับ Navbar จึงต้องรับ props มา
 * (บนเดสก์ท็อป CSS ซ่อนทั้งแถบ ปุ่ม ☰ กับ "ช้อปเลย" กลับมาทำงานตามเดิม)
 */

/** จุดหมายของแต่ละปุ่ม — key ใช้ชี้ว่าปุ่มไหนกำลัง active */
const ITEMS = [
  { key: "top", label: "หน้าแรก", href: "/", icon: "/landing/bn-top.png" },
  { key: "categories", label: "หมวดหมู่", href: "/#categories", icon: "/landing/bn-categories.png" },
  { key: "bestseller", label: "ขายดี", href: "/#bestseller", icon: "/landing/bn-bestseller.png" },
] as const;

/** ปุ่มไหนควรสว่างเมื่ออยู่หน้านี้ (ลิงก์ที่เป็น #hash เดาไม่ได้ ต้องรอให้กดเอง) */
function defaultActive(pathname: string): string | null {
  if (pathname === "/") return "top";
  if (pathname.startsWith("/cart")) return "cart";
  return null;
}

export default function BottomNav({
  menuOpen,
  onToggleMenu,
  itemCount,
}: {
  menuOpen: boolean;
  onToggleMenu: () => void;
  /** จำนวน "รายการ" ในตะกร้า (ชุดเดียวกับป้ายบนแถบเมนู) */
  itemCount: number;
}) {
  const pathname = usePathname();
  const [tapped, setTapped] = useState<string | null>(null);
  // เปลี่ยนหน้าเมื่อไหร่ก็ทิ้งปุ่มที่กดค้างไว้ กลับไปดูจาก path จริงแทน
  useEffect(() => setTapped(null), [pathname]);

  const active = menuOpen ? "more" : (tapped ?? defaultActive(pathname));

  return (
    <nav className="bottom-nav" aria-label="เมนูหลัก (มือถือ)">
      {ITEMS.map((it) => (
        <Link
          key={it.key}
          className={`bn-item${active === it.key ? " active" : ""}`}
          href={it.href}
          onClick={() => {
            setTapped(it.key);
            if (menuOpen) onToggleMenu();
          }}
        >
          <span className="bn-ico">
            <img src={it.icon} alt="" width={120} height={120} />
          </span>
          {it.label}
          <span className="bn-dot" />
        </Link>
      ))}

      <Link
        className={`bn-item bn-cart-badge${active === "cart" ? " active" : ""}`}
        href="/cart"
        onClick={() => {
          setTapped("cart");
          if (menuOpen) onToggleMenu();
        }}
      >
        <span className="bn-ico">
          <img src="/landing/bn-cart.png" alt="" width={120} height={120} />
          {itemCount > 0 && <span className="bn-count">{itemCount > 99 ? "99+" : itemCount}</span>}
        </span>
        ตะกร้า
        <span className="bn-dot" />
      </Link>

      <button
        type="button"
        className={`bn-item${menuOpen ? " active" : ""}`}
        aria-expanded={menuOpen}
        onClick={() => {
          onToggleMenu();
          // เลื่อนขึ้นบนสุดให้เห็นแผงเมนูที่กางออกใต้แถบเมนู (แผงเกาะหัวเว็บ ไม่ได้ลอยขึ้นมาหาปุ่ม)
          if (!menuOpen) window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        <span className="bn-ico">
          <img src="/landing/bn-more.png" alt="" width={120} height={120} />
        </span>
        เมนู
        <span className="bn-dot" />
      </button>
    </nav>
  );
}
