"use client";

/**
 * ปุ่มตะกร้าลอยมุมขวา (เดสก์ท็อป) — เจ้าของร้านสั่ง 21 ก.ย. 69
 *
 * ลูกค้าบ่นว่าตะกร้าบนแถบเมนูเล็กและอยู่ไกลสายตาตอนเลื่อนอ่านหน้าสินค้ายาว ๆ
 * ตัวนี้เลยลอยติดจออยู่ในกองปุ่มมุมขวาล่าง (แอดมิน → LINE → บอท → ตะกร้า)
 *
 * รอบล่าสุด (21 ก.ย. 69 รอบ 4) — เจ้าของร้านส่ง "ภาพป้ายตะกร้า" มาให้ใช้ทั้งใบ
 * จึงเลิกวาดแคปซูลด้วย CSS ทีละชิ้น (ขอบฟ้า · วงไอคอน · เส้นคั่น · ลูกศร · เป็ดเกาะขอบ)
 * ทั้งปุ่มตอนนี้คือรูปเดียว /landing/cart-shop-badge.webp — ใบเดียวกับป้ายลอยบนหน้าแรก
 *
 * ⚠️ ในรูปมีคำว่า "ตะกร้า" ตายตัว เขียนยอดเงินทับไม่ได้ ตอนมีของจึงลอย "ป้ายยอด"
 *    (ยอดรวม + จำนวนรายการ) ไว้เหนือปุ่มแทน — เจ้าของร้านเลือกตำแหน่งนี้เอง 21 ก.ย. 69 รอบ 5
 *
 * มือถือไม่ขึ้น — แถบเมนูล่างมีปุ่มตะกร้าอยู่แล้ว (ดู BottomNav)
 * สไตล์: ชุด .fabx ท้าย landing.css — ชุดเดียวกับปุ่ม LINE / แชทบอท / เข้าหลังบ้าน
 */

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/cart-context";

/** หน้าที่เห็นตะกร้าเต็ม ๆ อยู่แล้ว ไม่ต้องมีปุ่มลอยซ้ำ */
const HIDE_ON = [/^\/cart/, /^\/checkout/];

export default function CartFloat() {
  const pathname = usePathname() ?? "";
  const { items, subtotal } = useCart();
  if (HIDE_ON.some((re) => re.test(pathname))) return null;

  // นับ "รายการ" เหมือนป้ายบนแถบเมนู (สั่งแก้ว 100 ใบ = 1 รายการ)
  const lines = items.length;
  const has = lines > 0;
  const baht = subtotal.toLocaleString("th-TH");

  return (
    <Link
      href="/cart"
      className="fabx fabx-cart"
      aria-label={has ? `ตะกร้าสินค้า มี ${lines} รายการ รวม ${baht} บาท` : "ตะกร้าสินค้า (ยังไม่มีสินค้า)"}
      title={has ? "ไปที่ตะกร้าสินค้า" : "ยังไม่มีสินค้าในตะกร้า"}
    >
      <img
        className="fabx-cart-art"
        src="/landing/cart-shop-badge.webp"
        alt=""
        width={900}
        height={295}
        aria-hidden="true"
      />
      {has && (
        <span className="fabx-cart-sum" aria-hidden="true">
          <b>฿{baht}</b>
          <span>· {lines > 99 ? "99+" : lines} รายการ</span>
        </span>
      )}
    </Link>
  );
}
