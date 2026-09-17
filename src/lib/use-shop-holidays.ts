"use client";

import { useEffect, useState } from "react";
import { setShopHolidays } from "@/lib/ship-date";

/** โหลดครั้งเดียวต่อแท็บ — ทุกหน้าที่เรียก hook ใช้คำตอบเดียวกัน */
let loaded: Promise<boolean> | null = null;

/**
 * 🗓 เสียบวันหยุดร้าน (ปฏิทิน TP-Leader ผ่าน /api/shop-holidays) เข้า lib/ship-date ฝั่งเบราว์เซอร์
 * คืนเลข tick — เปลี่ยนเมื่อโหลดเสร็จ ให้คอมโพเนนต์วาดใหม่ด้วยวันหยุดชุดจริง (ก่อนโหลดเสร็จใช้ตารางสำรองในโค้ด)
 * โหลดพลาด = เงียบ ใช้ตารางสำรองต่อ
 */
export function useShopHolidays(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    loaded ??= fetch("/api/shop-holidays")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { holidays?: Record<string, string> | null } | null) => {
        if (!j?.holidays || Object.keys(j.holidays).length === 0) return false;
        setShopHolidays(j.holidays);
        return true;
      })
      .catch(() => false);
    void loaded.then((ok) => {
      if (ok && alive) setTick((t) => t + 1);
    });
    return () => {
      alive = false;
    };
  }, []);
  return tick;
}
