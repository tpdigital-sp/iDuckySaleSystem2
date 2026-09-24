"use client";

import { useEffect, useRef } from "react";

/**
 * เรียกฟังก์ชันซ้ำเป็นระยะ เพื่อให้หน้าอัปเดตเองโดยไม่ต้องรีเฟรช
 *
 * ประหยัดทรัพยากร:
 * - หยุดถามเมื่อผู้ใช้สลับแท็บไป (Page Visibility) — ไม่กินเน็ต/แบตเปล่า
 * - กลับมาที่แท็บ → ถามทันที 1 ครั้ง แล้วเดินต่อ (ไม่ต้องรอครบรอบ)
 * - กลับมาที่หน้าต่างเบราว์เซอร์ (window focus) ก็ถามเหมือนกัน — บางเครื่อง/บางระบบไม่ยิง
 *   visibilitychange ตอนหน้าต่างถูกบัง หรือตอนเครื่องตื่นจาก sleep แล้วนาฬิกาเดินค้างไป
 *   ทำให้ตัวเลขบนจอค้างของเก่าอยู่นานทั้งที่คนกลับมานั่งหน้าจอแล้ว
 * - ทั้งสองทางเว้นอย่างน้อย 10 วิจากครั้งก่อน — สลับแท็บกลับไปกลับมาถี่ ๆ จึงไม่ยิงรัว
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

  // เวลาที่ถามครั้งล่าสุด — ใช้กันยิงซ้ำตอนสลับแท็บ/สลับหน้าต่างถี่ ๆ
  const last = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    last.current = Date.now();

    const tick = () => {
      last.current = Date.now();
      void cb.current();
    };
    /** กลับมาดูจอ = ต้องเห็นของใหม่ทันที แต่ไม่ถามซ้ำถ้าเพิ่งถามไปไม่ถึง 10 วิ */
    const gap = Math.min(intervalMs, 10_000);
    const tickIfStale = () => {
      if (Date.now() - last.current >= gap) tick();
    };

    const start = () => {
      if (timer === null) timer = setInterval(tick, intervalMs);
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
        tickIfStale();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", tickIfStale);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", tickIfStale);
    };
  }, [enabled, intervalMs]);
}
