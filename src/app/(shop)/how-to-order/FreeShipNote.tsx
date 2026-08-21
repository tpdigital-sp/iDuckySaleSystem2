"use client";

import { useEffect, useState } from "react";
import { fetchShopPayment, freeShippingMinOf } from "@/lib/shop-settings";
import { formatPrice } from "@/lib/products";

/**
 * ยอดส่งฟรี — ดึงจากค่าที่ร้านตั้งไว้จริง
 * (เดิมหน้านี้พิมพ์เลขไว้ตายตัว พอร้านเปลี่ยนยอดแล้วลืมแก้ ลูกค้าเลยได้ข้อมูลผิด)
 */
export default function FreeShipNote() {
  const [min, setMin] = useState<number | null>(null);
  useEffect(() => {
    void fetchShopPayment().then((p) => setMin(freeShippingMinOf(p)));
  }, []);

  if (min === null) return <>ส่งฟรีเมื่อซื้อครบตามยอดที่กำหนด</>;
  if (min <= 0) return <>คิดค่าจัดส่งตามวิธีที่เลือก</>;
  return (
    <>
      {/* ใช้สีเขียวมิ้นต์ของแบรนด์ ไม่ใช้คลาสสี Tailwind (หน้านี้อยู่ในระบบดีไซน์ .dl) */}
      ส่งฟรีเมื่อซื้อครบ <strong style={{ color: "#12876A", fontWeight: 600 }}>{formatPrice(min)}</strong>
    </>
  );
}
