"use client";

/**
 * โหลดออเดอร์ของฉันสำหรับหน้าในโซน /account — แพตเทิร์นเดียวกับหน้าประวัติการสั่งซื้อ:
 * ยังไม่ล็อกอิน → เด้งไปหน้าเข้าสู่ระบบ · วาดสำเนาในเครื่องก่อน แล้วค่อยทับด้วยของจริงจาก API
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCustomer } from "@/lib/customer-context";
import { fetchMyOrders, readStoredOrders, setOrdersOwner } from "@/lib/my-orders";
import type { Order } from "@/lib/admin-data";

export function useAccountOrders() {
  const router = useRouter();
  const { customer, loading } = useCustomer();
  /** null = ยังโหลดไม่เสร็จและไม่มีสำเนาในเครื่อง (หน้าใช้แยกโครงกระดูกกับ "ว่างจริง") */
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    if (!loading && !customer) router.replace("/account/login");
  }, [loading, customer, router]);

  useEffect(() => {
    if (!customer) return;
    setOrdersOwner(customer.id);
    const snap = readStoredOrders(customer.id);
    if (snap) setOrders(snap);
    (async () => {
      const data = await fetchMyOrders();
      setOrders(data.orders);
    })();
  }, [customer]);

  return { customer, loading, orders, setOrders };
}

/** ลิงก์เปิดหน้าออเดอร์สาธารณะ (ต้องแนบ key) — ใช้ซ้ำหลายหน้า */
export const orderHref = (o: Order, sub = "") => `/order/${encodeURIComponent(o.id)}${sub}${o.key ? `?key=${encodeURIComponent(o.key)}` : ""}`;
