"use client";

import { useEffect, useState } from "react";
import { fetchShopPayment, freeShippingMinOf } from "@/lib/shop-settings";
import { formatPrice } from "@/lib/products";

/**
 * ยอดส่งฟรีที่ท้ายเว็บ — ดึงจากค่าที่ร้านตั้งไว้ที่ /admin/settings
 * (เดิมพิมพ์ ฿999 ไว้ตายตัว พอร้านเปลี่ยนยอดในหลังบ้านแล้ว ท้ายเว็บยังโชว์เลขเก่า)
 * ใช้ตรรกะชุดเดียวกับ FreeShipNote ในหน้าวิธีสั่งซื้อ
 */
export default function FooterFreeShip() {
  const [min, setMin] = useState<number | null>(null);
  useEffect(() => {
    void fetchShopPayment().then((p) => setMin(freeShippingMinOf(p)));
  }, []);

  // ยังโหลดไม่เสร็จ — เลี่ยงโชว์ตัวเลขผิดชั่วขณะ
  if (min === null) return <>ส่งฟรีเมื่อครบยอดที่กำหนด ทั่วไทย · </>;
  // ร้านปิดโปรส่งฟรี
  if (min <= 0) return null;
  return <>ส่งฟรีเมื่อครบ {formatPrice(min)} ทั่วไทย · </>;
}
