"use client";

import { useCallback, useEffect, useState } from "react";
import { MOCK_ORDERS, type Order } from "@/lib/admin-data";
import { fetchOrdersAdmin } from "@/lib/order-repo";
import { usePolling } from "@/lib/use-polling";

/**
 * ดึงออเดอร์ทั้งหมดมาให้หน้าฝ่ายกราฟฟิกใช้ร่วมกัน (คิวงาน + คลังลายลูกค้า)
 * ยังไม่ได้ตั้งค่าฐานข้อมูล → ใช้ออเดอร์ตัวอย่าง แล้วปิด polling
 */
export function useGraphicsOrders(): { orders: Order[]; demo: boolean } {
  const [orders, setOrders] = useState<Order[]>([]);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    fetchOrdersAdmin().then((r) => {
      if (r.orders.length > 0) setOrders(r.orders);
      else {
        setOrders(MOCK_ORDERS);
        setDemo(true);
      }
    });
  }, []);

  const refresh = useCallback(async () => {
    const r = await fetchOrdersAdmin();
    if (r.orders.length === 0) return;
    setOrders((cur) => (JSON.stringify(cur) === JSON.stringify(r.orders) ? cur : r.orders));
  }, []);
  usePolling(refresh, { enabled: !demo });

  return { orders, demo };
}

/** ค้นหาด้วยเลขออเดอร์ · ชื่อลูกค้า · ชื่อสินค้า */
export function orderMatches(o: Order, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    o.id.toLowerCase().includes(s) ||
    o.customer.toLowerCase().includes(s) ||
    o.items.some((i) => i.name.toLowerCase().includes(s))
  );
}

export const dayOf = (d: string) => d.split(" ").slice(0, 3).join(" ");
