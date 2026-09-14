"use client";

import { useCallback, useEffect, useState } from "react";
import Dashboard from "@/components/admin/Dashboard";
import { MOCK_ORDERS, type Order } from "@/lib/admin-data";
import { fetchOrdersAdmin } from "@/lib/order-repo";
import { PACKING_QUEUE_STATUSES } from "@/lib/permissions";
import { useCan } from "@/lib/perm-context";
import { usePolling } from "@/lib/use-polling";

/** ฝ่ายแพ็คเห็นเฉพาะออเดอร์ที่ถึงคิวแพ็คแล้ว — เหมือนหน้าคำสั่งซื้อ */
const visibleTo = (list: Order[], seesAll: boolean) =>
  seesAll ? list : list.filter((o) => PACKING_QUEUE_STATUSES.includes(o.status));

export default function AdminDashboardPage() {
  const can = useCan();
  const seesAll = can("orders.viewAll");
  const seesMoney = can("orders.money"); // ฝ่ายแพ็คไม่เห็นตัวเลขยอดขาย

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [stale, setStale] = useState(false);
  const [staleErr, setStaleErr] = useState(""); // ข้อความจากเซิร์ฟเวอร์ตอนดึงไม่ได้ (เช่น เกินโควตา Supabase)
  const [updatedAt, setUpdatedAt] = useState<Date | undefined>();

  const load = useCallback(
    async (first: boolean) => {
      const r = await fetchOrdersAdmin();
      if (!r.ok) {
        // เน็ตหลุด/ฐานข้อมูลไม่ตอบ — คงตัวเลขเดิมไว้แล้วบอกว่าที่เห็นเป็นของเก่า ดีกว่าโชว์ 0
        // ⚠️ ไม่ตกไปโหมดตัวอย่าง (เดิมโหลดครั้งแรกไม่ได้ = โชว์ MOCK + ป้าย "ยังไม่ได้ต่อฐานข้อมูล" ชวนเข้าใจผิดว่าของหาย)
        //    demo คงเป็น false ให้โพลเดินต่อ → เซิร์ฟเวอร์กลับมาเมื่อไรตัวเลขจริงขึ้นเอง
        setStale(true);
        setStaleErr(r.error ?? "");
        return;
      }
      setStaleErr("");
      setStale(false);
      if (r.orders.length > 0) {
        setOrders(visibleTo(r.orders, seesAll));
        setDemo(false);
      } else if (first) {
        // ยังไม่ได้ต่อฐานข้อมูล/ยังไม่มีออเดอร์ → โชว์ชุดตัวอย่างพร้อมป้ายกำกับ
        setOrders(visibleTo(MOCK_ORDERS, seesAll));
        setDemo(true);
      }
      setUpdatedAt(new Date());
    },
    [seesAll]
  );

  useEffect(() => {
    void load(true).finally(() => setLoading(false));
  }, [load]);

  usePolling(() => load(false), { enabled: !demo, intervalMs: 30000 });

  return (
    <Dashboard orders={orders} loading={loading} demo={demo} stale={stale} staleErr={staleErr} updatedAt={updatedAt} seesMoney={seesMoney} />
  );
}
