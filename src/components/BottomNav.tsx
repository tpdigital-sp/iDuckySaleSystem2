"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCustomer } from "@/lib/customer-context";

/* eslint-disable @next/next/no-img-element */

/**
 * แถบเมนูล่างสไตล์แอป (มือถือ/แท็บเล็ต ≤1000px) — ตามไฟล์ต้นแบบ LADNDING PAGE.html
 * 5 ปุ่ม: หน้าแรก · หมวดหมู่ · ขายดี · ตะกร้า (ป้ายจำนวน) · บัญชี
 * นิ้วโป้งเอื้อมถึงแถบล่างง่ายกว่ามุมขวาบน · เมนูหมวดเต็มจอเปิดจากปุ่ม ☰ บนแถบเมนูตามเดิม
 * (บนเดสก์ท็อป CSS ซ่อนทั้งแถบ)
 */

const ITEMS = [
  { key: "top", label: "หน้าแรก", href: "/", icon: "/landing/bn-top.png" },
  { key: "categories", label: "หมวดหมู่", href: "/#categories", icon: "/landing/bn-categories.png" },
  { key: "bestseller", label: "ขายดี", href: "/#bestseller", icon: "/landing/bn-bestseller.png" },
] as const;

/** ปุ่มไหนควรสว่างเมื่ออยู่หน้านี้ (ลิงก์ที่เป็น #hash เดาไม่ได้ ต้องรอให้กดเอง) */
function defaultActive(pathname: string): string | null {
  if (pathname === "/") return "top";
  if (pathname.startsWith("/cart")) return "cart";
  if (pathname.startsWith("/account")) return "account";
  return null;
}

export default function BottomNav({ itemCount }: { /** จำนวน "รายการ" ในตะกร้า (ชุดเดียวกับป้ายบนแถบเมนู) */ itemCount: number }) {
  const pathname = usePathname();
  const { customer } = useCustomer();
  const [tapped, setTapped] = useState<string | null>(null);
  // เปลี่ยนหน้าเมื่อไหร่ก็ทิ้งปุ่มที่กดค้างไว้ กลับไปดูจาก path จริงแทน
  useEffect(() => setTapped(null), [pathname]);
  const active = tapped ?? defaultActive(pathname);

  return (
    <nav className="bottom-nav" id="bottomNav" aria-label="เมนูหลัก (มือถือ)">
      {ITEMS.map((it) => (
        <Link key={it.key} className={`bn-item${active === it.key ? " active" : ""}`} href={it.href} data-bn={it.key} onClick={() => setTapped(it.key)}>
          <span className="bn-ico">
            <img src={it.icon} alt="" width={120} height={120} />
          </span>
          {it.label}
          <span className="bn-dot" />
        </Link>
      ))}

      <Link className={`bn-item bn-cart-badge${active === "cart" ? " active" : ""}`} href="/cart" data-bn="cart" onClick={() => setTapped("cart")}>
        <span className="bn-ico">
          <img src="/landing/bn-cart.png" alt="" width={120} height={120} />
          {itemCount > 0 && <span className="bn-count">{itemCount > 99 ? "99+" : itemCount}</span>}
        </span>
        ตะกร้า
        <span className="bn-dot" />
      </Link>

      <Link
        className={`bn-item${active === "account" ? " active" : ""}`}
        href={customer ? "/account" : "/account/login"}
        data-bn="account"
        onClick={() => setTapped("account")}
      >
        <span className="bn-ico">
          <img src="/landing/bn-more.png" alt="" width={120} height={120} />
        </span>
        บัญชี
        <span className="bn-dot" />
      </Link>
    </nav>
  );
}
