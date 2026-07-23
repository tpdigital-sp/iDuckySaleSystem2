"use client";

import { useEffect, useRef } from "react";

/**
 * เรียกฟังก์ชันซ้ำเป็นระยะ เพื่อให้หน้าอัปเดตเองโดยไม่ต้องรีเฟรช
 *
 * ประหยัดทรัพยากร:
 * - หยุดถามเมื่อผู้ใช้สลับแท็บไป (Page Visibility) — ไม่กินเน็ต/แบตเปล่า
 * - กลับมาที่แท็บ → ถามทันที 1 ครั้ง แล้วเดินต่อ (ไม่ต้องรอครบรอบ)
 * - ปิดได้ด้วย enabled เมื่อไม่มีอะไรต้องรอแล้ว
 */
export function usePolling(
  onTick: () => void | Promise<void>,
  opts?: { intervalMs?: number; enabled?: boolean }
) {
  const { intervalMs = 15000, enabled = true } = opts ?? {};
  // เก็บ callback ล่าสุดไว้ใน ref เพื่อไม่ให้ interval ถูกตั้งใหม่ทุก render
  const cb = useRef(onTick);
  useEffect(() => {
    cb.current = onTick;
  }, [onTick]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) timer = setInterval(() => void cb.current(), intervalMs);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        void cb.current();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs]);
}
