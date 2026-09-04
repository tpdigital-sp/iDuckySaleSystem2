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

/**
 * รายชื่อพนักงานแผนกกราฟฟิกจาก employees2 (คนที่ยังทำงานอยู่) — ตัวตั้งของชิปกรอง "คนทำแบบ"
 * โหลดไม่ได้/ยังไม่ได้ตั้งค่า Firebase → คืนลิสต์ว่าง แล้วชิปจะใช้ชื่อที่พบในแบบงานแทน
 */
export function useGraphicStaff(): string[] {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/staff/graphics")
      .then((r) => (r.ok ? r.json() : { staff: [] }))
      .then((d: { staff?: { name: string }[] }) => {
        if (alive) setNames((d.staff ?? []).map((s) => s.name).filter(Boolean));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return names;
}

/**
 * นับงานของกราฟฟิกแต่ละคน สำหรับชิปกรอง "คนทำแบบ"
 * @param names ชื่อคนทำของแบบแต่ละรูป · @param roster รายชื่อแผนกกราฟฟิกใน employees2
 *
 * ชิปมาจากรายชื่อแผนกเป็นหลัก (คนที่ยังไม่มีงานค้างก็ขึ้น ชิปจะจางไว้) แล้วบวกชื่ออื่นที่โผล่ในงานจริง
 * — คนที่ลาออกไปแล้ว หรือแอดมินที่อัปแบบแทน จะได้ไม่หายไปจากตัวกรอง
 * ชื่อว่าง ("") = แบบเก่าที่ยังไม่ได้บันทึกชื่อคนทำ — ดันไปท้ายสุดเสมอ
 */
export function staffTally(names: string[], roster: string[] = []): { name: string; n: number }[] {
  const tally = new Map<string, number>();
  for (const name of roster) tally.set(name.trim(), 0);
  for (const raw of names) {
    const name = raw.trim();
    tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  return [...tally]
    .map(([name, n]) => ({ name, n }))
    .filter((p) => p.name || p.n > 0) // ช่อง "ไม่ระบุคนทำ" ขึ้นเฉพาะตอนมีของจริง
    .sort((a, b) => {
      if (!a.name !== !b.name) return a.name ? -1 : 1;
      return b.n - a.n || a.name.localeCompare(b.name, "th");
    });
}

export const dayOf = (d: string) => d.split(" ").slice(0, 3).join(" ");
