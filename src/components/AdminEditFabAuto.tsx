"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { canAccessAdmin } from "@/lib/auth";
import AdminEditFab from "./AdminEditFab";

/**
 * ปุ่มลัด "เข้าหลังบ้าน" ที่ขึ้นเองทุกหน้าร้าน — เห็นเฉพาะทีมงานที่ล็อกอินหลังบ้านอยู่
 *
 * เดิมต้องไปแปะ <AdminEditFab> ทีละหน้า จึงมีแค่ 3 หน้า (หน้าแรก · หน้าสินค้า · หน้าออเดอร์)
 * หน้าที่เหลือ (ตะกร้า · checkout · บทความ · คูปอง · บัญชีลูกค้า …) ไม่มีปุ่มเลย
 * ย้ายมาเสียบที่ ShopLayout ที่เดียว แล้วเดาปลายทางจาก URL — หน้าใหม่ที่เพิ่มทีหลังได้ปุ่มฟรี
 *
 * เส้นทางที่ยังไม่ได้จับคู่ไว้จะพาไปหน้ารวมหลังบ้าน (/admin) — ขอให้มีปุ่มทุกหน้าไว้ก่อน
 */

/** ปลายทางหลังบ้านของแต่ละหน้าร้าน — คืน null เมื่อไม่อยากให้ปุ่มขึ้น */
function adminTargetOf(path: string): { href: string; title: string; label?: string } | null {
  // ตัด / ท้าย + query ออกก่อน แล้วหั่นเป็นส่วน ๆ
  const seg = path.split("?")[0].split("/").filter(Boolean);
  const at = (i: number) => seg[i] ?? "";

  if (seg.length === 0) return { href: "/admin/nav", title: "เปิดหน้าแก้ไขเมนูและหน้าแรกในระบบหลังบ้าน" };

  switch (at(0)) {
    case "products":
      // /products/<slug> → /admin/products/<slug> (หน้าแก้ไขค้นด้วย id ก่อน ไม่เจอค่อยค้นด้วย slug)
      return seg[1]
        ? { href: `/admin/products/${seg[1]}`, title: "เปิดหน้าแก้ไขสินค้านี้ในระบบหลังบ้าน" }
        : { href: "/admin/products", title: "เปิดรายการสินค้าในระบบหลังบ้าน" };
    case "preview":
      // หน้าพรีวิวสินค้าฉบับร่าง — พาไปหน้าแก้ไขตัวเดียวกัน
      return seg[1] ? { href: `/admin/products/${seg[1]}`, title: "เปิดหน้าแก้ไขสินค้านี้ในระบบหลังบ้าน" } : null;
    case "order":
      return seg[1]
        ? { href: `/admin/orders/${seg[1]}`, title: "เปิดออเดอร์นี้ในระบบหลังบ้าน", label: "เปิดในหลังบ้าน" }
        : { href: "/admin/orders", title: "เปิดรายการออเดอร์ในระบบหลังบ้าน", label: "เปิดในหลังบ้าน" };
    case "quote":
      return seg[1]
        ? { href: `/admin/quotes/${seg[1]}`, title: "เปิดใบเสนอราคานี้ในระบบหลังบ้าน", label: "เปิดในหลังบ้าน" }
        : { href: "/admin/quotes", title: "เปิดรายการใบเสนอราคาในระบบหลังบ้าน", label: "เปิดในหลังบ้าน" };
    case "p":
      return { href: "/admin/price-links", title: "เปิดรายการลิงก์ราคาในระบบหลังบ้าน" };
    case "articles":
      return { href: "/admin/articles", title: "เปิดหน้าแก้ไขบทความในระบบหลังบ้าน" };
    case "coupon":
      return { href: "/admin/coupons", title: "เปิดหน้าแก้ไขคูปองในระบบหลังบ้าน" };
    case "cart":
    case "checkout":
      // ของที่แก้ได้จริงในสองหน้านี้คือบัญชีรับเงิน · ค่าส่ง · ยอดส่งฟรี — อยู่ที่หน้าตั้งค่าระบบ
      return { href: "/admin/settings", title: "เปิดหน้าตั้งค่าระบบ (บัญชีรับเงิน · ค่าส่ง) ในระบบหลังบ้าน" };
    case "account":
      // หน้าบัญชีของลูกค้า — ไม่มีของให้แก้ พาไปรายการออเดอร์แทน
      return { href: "/admin/orders", title: "เปิดรายการออเดอร์ในระบบหลังบ้าน", label: "เปิดในหลังบ้าน" };
    default:
      return { href: "/admin", title: "เปิดระบบหลังบ้าน" };
  }
}

export default function AdminEditFabAuto() {
  const path = usePathname() || "/";
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    void canAccessAdmin().then(setIsStaff);
  }, []);

  if (!isStaff) return null;
  const t = adminTargetOf(path);
  if (!t) return null;
  return <AdminEditFab href={t.href} title={t.title} label={t.label} />;
}
