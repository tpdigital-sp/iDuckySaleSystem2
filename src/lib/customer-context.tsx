"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getCustomer, getAccessToken, onAuthChange, type Customer } from "./customer-auth";

/** ขอคูปองต้อนรับให้สมาชิกใหม่ (idempotent ฝั่งเซิร์ฟเวอร์) — ทำครั้งเดียวต่อเซสชัน */
async function claimWelcomeCoupon() {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem("ducky_welcome_checked")) return;
  sessionStorage.setItem("ducky_welcome_checked", "1");
  try {
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch("/api/coupons/welcome", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const j = await res.json();
    // เก็บโค้ดไว้ให้ตะกร้าใส่ส่วนลดอัตโนมัติ (ไม่ทับคูปองที่ลูกค้าใส่เองไว้)
    if (j.code && !localStorage.getItem("ducky_coupon")) localStorage.setItem("ducky_coupon", j.code);
  } catch {
    /* ไม่เป็นไร — คูปองต้อนรับเป็นของแถม ไม่ควรบล็อกการล็อกอิน */
  }
}

interface CustomerCtx {
  customer: Customer | null;
  loading: boolean;
  refresh: () => void;
}

const Ctx = createContext<CustomerCtx>({ customer: null, loading: true, refresh: () => {} });

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCustomer().then((c) => {
      setCustomer(c);
      setLoading(false);
      if (c) claimWelcomeCoupon();
    });
    return onAuthChange((c) => {
      setCustomer(c);
      if (c) claimWelcomeCoupon();
    });
  }, []);

  const refresh = () => getCustomer().then(setCustomer);

  return <Ctx.Provider value={{ customer, loading, refresh }}>{children}</Ctx.Provider>;
}

export const useCustomer = () => useContext(Ctx);
