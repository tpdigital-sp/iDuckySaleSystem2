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
 * มือถือ/แท็บเล็ต (21 ก.ย. 69 รอบ 6) — เจ้าของร้านสั่งให้ขึ้นด้วย จากเดิมซ่อนทั้งใบ
 * ภาพป้ายยาวใส่ในกองปุ่มวงกลมไม่ลง จึงหดเป็น "วงกลมไอคอนตะกร้า + ป้ายจำนวน"
 * วางต่อจากปุ่มบอท (LINE → บอท → ตะกร้า) · แถบเมนูล่างก็ยังมีปุ่มตะกร้าตามเดิม (ดู BottomNav)
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
      {/* มือถือ: ไอคอนเส้น + ป้ายจำนวน (กฎสลับอยู่ท้าย landing.css — จอคอมซ่อนสองชิ้นนี้ ใช้ภาพแทน) */}
      <i className="fabx-ico fabx-cart-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.2 4h2.1l2 10.2h9.9l1.9-7.4H6.1" />
          <circle cx="9.6" cy="19" r="1.5" />
          <circle cx="16.6" cy="19" r="1.5" />
        </svg>
      </i>
      {has && (
        <span className="fabx-cart-count" aria-hidden="true">
          {lines > 99 ? "99+" : lines}
        </span>
      )}
      {has && (
        <span className="fabx-cart-sum" aria-hidden="true">
          <b>฿{baht}</b>
          <span>· {lines > 99 ? "99+" : lines} รายการ</span>
        </span>
      )}
    </Link>
  );
}
