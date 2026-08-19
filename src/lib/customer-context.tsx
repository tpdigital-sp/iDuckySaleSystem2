"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getCachedCustomer, getCustomer, getAccessToken, onAuthChange, type Customer } from "./customer-auth";
import { clearMyOrders } from "./my-orders";

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
  const [customer, setCustomerState] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const lastRef = useRef<string>("null");
  /** id ของบัญชีที่รู้จักล่าสุด — undefined = ยังไม่รู้ว่าใคร (เพิ่งเปิดหน้า) */
  const lastIdRef = useRef<string | null | undefined>(undefined);

  /**
   * ตั้งค่าลูกค้าแบบ "เหมือนเดิมไม่ต้องเปลี่ยน" — กัน re-render/ยิง API ซ้ำ
   * (เซสชันในเครื่องกับที่เซิร์ฟเวอร์ยืนยันมักได้ค่าเดียวกัน ถ้าสร้างอ็อบเจกต์ใหม่ทุกครั้ง
   *  useEffect ที่ผูกกับ customer ของทุกหน้าจะทำงานสองรอบ)
   */
  const setCustomer = (c: Customer | null) => {
    const key = JSON.stringify(c);
    if (key === lastRef.current) return;
    lastRef.current = key;
    setCustomerState(c);
  };

  useEffect(() => {
    let alive = true;
    // 1) เซสชันในเครื่องก่อน — ได้ทันที หน้าจึงเริ่มวาด/เริ่มโหลดข้อมูลได้เลย ไม่ต้องรอ Supabase ตอบ
    getCachedCustomer().then((c) => {
      if (!alive || !c) return;
      if (lastIdRef.current === undefined) lastIdRef.current = c.id;
      setCustomer(c);
      setLoading(false);
    });
    // 2) แล้วค่อยยืนยันกับเซิร์ฟเวอร์ (token หมดอายุ/ถูกถอน = เคลียร์ทิ้ง)
    getCustomer().then((c) => {
      if (!alive) return;
      if (lastIdRef.current === undefined) lastIdRef.current = c?.id ?? null;
      setCustomer(c);
      setLoading(false);
      if (c) claimWelcomeCoupon();
    });
    const off = onAuthChange((c) => {
      // เปลี่ยน "คน" จริงๆ (สลับบัญชี/ออกจากระบบ) เท่านั้น ถึงทิ้งข้อมูลที่เก็บไว้ในเครื่อง
      // ⚠️ ห้ามทิ้งตอนเพิ่งเปิดหน้า (lastIdRef ยังเป็น undefined) ไม่งั้นสำเนาที่เก็บไว้จะถูกลบ
      //    ก่อนที่หน้าจะได้อ่านไปใช้ — หน้าจะกลับไปโล่งรอ API ทุกครั้งเหมือนเดิม
      const nextId = c?.id ?? null;
      if (lastIdRef.current !== undefined && lastIdRef.current !== nextId) clearMyOrders();
      lastIdRef.current = nextId;
      setCustomer(c);
      if (c) claimWelcomeCoupon();
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const refresh = () => getCustomer().then(setCustomer);

  return <Ctx.Provider value={{ customer, loading, refresh }}>{children}</Ctx.Provider>;
}

export const useCustomer = () => useContext(Ctx);
