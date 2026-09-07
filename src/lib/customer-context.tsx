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
  /**
   * 🤝 บัญชีนี้เป็นตัวแทนจำหน่ายไหม (จากทะเบียน __dealers__ ฝั่งเซิร์ฟเวอร์ — ไม่ใช่ user_metadata)
   * ⚠️ ต้องอ่านคู่กับ dealerReady เสมอ: ตอนเช็คยังไม่จบ isDealer เป็น false ชั่วคราว
   * ห้ามเอาช่วงนั้นไปตัดสินใจถาวร (เช่น ล้างเรทตัวแทนออกจากตะกร้า) ไม่งั้นตัวแทนจริงโดนล้างทุกครั้งที่เปิดหน้า
   */
  isDealer: boolean;
  /** การเช็คสถานะตัวแทนจบแล้ว (ทั้งกรณีเป็น/ไม่เป็น/ไม่ได้ล็อกอิน) */
  dealerReady: boolean;
  refresh: () => void;
}

const Ctx = createContext<CustomerCtx>({
  customer: null,
  loading: true,
  isDealer: false,
  dealerReady: false,
  refresh: () => {},
});

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomerState] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDealer, setIsDealer] = useState(false);
  const [dealerReady, setDealerReady] = useState(false);
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
    });
    const off = onAuthChange((c) => {
      // เปลี่ยน "คน" จริงๆ (สลับบัญชี/ออกจากระบบ) เท่านั้น ถึงทิ้งข้อมูลที่เก็บไว้ในเครื่อง
      // ⚠️ ห้ามทิ้งตอนเพิ่งเปิดหน้า (lastIdRef ยังเป็น undefined) ไม่งั้นสำเนาที่เก็บไว้จะถูกลบ
      //    ก่อนที่หน้าจะได้อ่านไปใช้ — หน้าจะกลับไปโล่งรอ API ทุกครั้งเหมือนเดิม
      const nextId = c?.id ?? null;
      if (lastIdRef.current !== undefined && lastIdRef.current !== nextId) clearMyOrders();
      lastIdRef.current = nextId;
      setCustomer(c);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  /**
   * เช็คสถานะตัวแทนจำหน่ายของบัญชีที่ล็อกอิน — แคช sessionStorage ต่อ uid ให้ขึ้นทันที
   * แล้วค่อยยืนยันกับ /api/dealers/me (token-verified) · คูปองต้อนรับย้ายมาขอที่นี่
   * หลังรู้สถานะแล้ว (ตัวแทนไม่ต้องขอ — ตัวแทนใช้คูปองไม่ได้อยู่แล้ว)
   */
  useEffect(() => {
    let alive = true;
    const uid = customer?.id;
    if (!uid) {
      // ไม่ได้ล็อกอิน = ไม่ใช่ตัวแทนแน่ ๆ แต่ต้องรอให้รู้ก่อนว่า "ไม่ได้ล็อกอินจริง" (loading จบ)
      setIsDealer(false);
      setDealerReady(!loading);
      return;
    }
    let cached: string | null = null;
    try {
      cached = sessionStorage.getItem(`ducky_dealer_${uid}`);
    } catch {
      /* private mode — ไม่มีแคชก็รอเซิร์ฟเวอร์ */
    }
    if (cached !== null) {
      setIsDealer(cached === "1");
      setDealerReady(true);
    } else {
      setDealerReady(false);
    }
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          if (alive) {
            setIsDealer(false);
            setDealerReady(true);
          }
          return;
        }
        const res = await fetch("/api/dealers/me", { headers: { Authorization: `Bearer ${token}` } });
        const j = (await res.json()) as { dealer?: boolean };
        const d = !!j.dealer;
        try {
          sessionStorage.setItem(`ducky_dealer_${uid}`, d ? "1" : "0");
        } catch {
          /* ไม่เป็นไร */
        }
        if (!alive) return;
        setIsDealer(d);
        setDealerReady(true);
        if (!d) claimWelcomeCoupon();
      } catch {
        // เน็ตสะดุด — ใช้ค่าแคชถ้ามี ไม่มีก็ถือว่าไม่ใช่ตัวแทนไปก่อน (ปลอดภัยกว่าแจกราคาตัวแทนมั่ว)
        if (!alive) return;
        if (cached === null) setIsDealer(false);
        setDealerReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [customer?.id, loading]);

  const refresh = () => getCustomer().then(setCustomer);

  return <Ctx.Provider value={{ customer, loading, isDealer, dealerReady, refresh }}>{children}</Ctx.Provider>;
}

export const useCustomer = () => useContext(Ctx);
