"use client";

/**
 * ปุ่มตะกร้าลอยมุมขวา (เดสก์ท็อป) — เจ้าของร้านสั่ง 21 ก.ย. 69
 *
 * ลูกค้าบ่นว่าตะกร้าบนแถบเมนูเล็กและอยู่ไกลสายตาตอนเลื่อนอ่านหน้าสินค้ายาว ๆ
 * ตัวนี้เลยลอยติดจออยู่ในกองปุ่มมุมขวาล่าง (แอดมิน → LINE → บอท → ตะกร้า)
 *
 * รอบออกแบบล่าสุด (21 ก.ย. 69 รอบ 3) — เจ้าของร้านเอาของจริงไปเทียบภาพต้นแบบแล้วสั่งให้
 * "เหมือนต้นแบบ" จึงยกเลิกชุดรอบ 2 (ว่าง = เงียบจาง / มีของ = พื้นเหลือง) ทิ้ง
 *   ว่าง  = "ตะกร้า" คำเดียว ตัวโต ตามภาพต้นแบบเป๊ะ
 *   มีของ = ทรง/สีเดียวกันทุกอย่าง สลับข้อความเป็นยอดเงิน + จำนวนรายการ
 * เลิกใช้จุดแดงนับจำนวนแล้ว เพราะจำนวนอยู่ในบรรทัดล่างของปุ่มอยู่แล้ว (ซ้ำ = รก)
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

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.2 4h2.1l2 10.2h9.9l1.9-7.4H6.1" />
      <circle cx="9.6" cy="19" r="1.5" />
      <circle cx="16.6" cy="19" r="1.5" />
    </svg>
  );
}

/** ลูกศรท้ายปุ่ม — ชุดปุ่มลอยใช้ตัวเดียวกันทุกใบ */
function ChevronIcon() {
  return (
    <svg className="fabx-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

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
      className={`fabx fabx-cart${has ? " has" : ""}`}
      aria-label={has ? `ตะกร้าสินค้า มี ${lines} รายการ รวม ${baht} บาท` : "ตะกร้าสินค้า (ยังไม่มีสินค้า)"}
      title={has ? "ไปที่ตะกร้าสินค้า" : "ยังไม่มีสินค้าในตะกร้า"}
    >
      {/* เป็ดโผล่หลังปุ่ม — ตามภาพต้นแบบ (เดสก์ท็อปเท่านั้น) */}
      <img className="fabx-duck" src="/landing/fab-duck-peek.webp?v=3" alt="" width={377} height={229} aria-hidden="true" />
      <i className="fabx-ico">
        <CartIcon />
      </i>
      {/* ตอนมีของ ยอดเงินคือข้อมูลที่ลูกค้าอยากรู้จริง จึงเป็นบรรทัดบน (ตัวโต)
          ส่วนคำว่า "ตะกร้า" ย้ายลงบรรทัดล่างคู่กับจำนวนรายการ */}
      <span className="fabx-label">
        {has ? (
          <>
            <b className="fabx-sum">฿{baht}</b>
            <small>ตะกร้า · {lines > 99 ? "99+" : lines} รายการ</small>
          </>
        ) : (
          // ว่าง = คำว่า "ตะกร้า" คำเดียว ตามภาพต้นแบบเป๊ะ (เจ้าของร้านสั่ง 21 ก.ย. 69 รอบ 3)
          // เลิกใส่บรรทัด "ยังไม่มีสินค้า" — ยังบอกผ่าน title/aria-label อยู่
          "ตะกร้า"
        )}
      </span>
      <ChevronIcon />
    </Link>
  );
}
