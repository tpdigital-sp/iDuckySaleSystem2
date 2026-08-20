"use client";

/**
 * ตัวแบ่งหน้าในโซน /account — ออเดอร์เยอะแค่ไหนหน้าก็ไม่ยืดยาว
 * ใช้คู่กัน: usePager หั่นรายการเป็นหน้าๆ + <Pager/> ปุ่ม ก่อนหน้า/เลขหน้า/ถัดไป
 * แบ่งฝั่ง client เพราะ /api/orders/mine ส่งออเดอร์มาครบชุดอยู่แล้ว (แคชร่วมทั้งโซน)
 */

import { useEffect, useMemo, useState } from "react";

export function usePager<T>(items: T[], perPage: number, resetKey: unknown = null) {
  const [page, setPage] = useState(1);

  // เปลี่ยนตัวกรอง/แท็บ → กลับไปหน้าแรกเสมอ จะได้ไม่ค้างอยู่หน้าที่ไม่มีของ
  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const cur = Math.min(page, pages); // รายการหด (เช่นออเดอร์เปลี่ยนสถานะ) → หนีบไม่ให้เกินหน้าสุดท้าย
  const slice = useMemo(() => items.slice((cur - 1) * perPage, cur * perPage), [items, cur, perPage]);

  function goto(p: number) {
    setPage(Math.min(Math.max(1, p), pages));
    // ขึ้นหน้าใหม่ให้เห็นตั้งแต่การ์ดแรก ไม่ค้างอยู่ท้ายลิสต์
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return { slice, cur, pages, total: items.length, goto };
}

/** เลขหน้าที่โชว์ — หน้าน้อยโชว์หมด · หน้าเยอะโชว์ 1 … รอบๆ หน้าปัจจุบัน … หน้าสุดท้าย */
function pageNumbers(cur: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const around = [cur - 1, cur, cur + 1].filter((p) => p > 1 && p < pages);
  const out: (number | "…")[] = [1];
  if (around[0] && around[0] > 2) out.push("…");
  out.push(...around);
  if (around.length && around[around.length - 1] < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

export function Pager({ cur, pages, total, unit = "ออเดอร์", goto }: { cur: number; pages: number; total: number; unit?: string; goto: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav className="acd-pager" aria-label="แบ่งหน้า">
      <button type="button" className="acd-pager-nav" disabled={cur <= 1} onClick={() => goto(cur - 1)}>
        ‹ ก่อนหน้า
      </button>
      <div className="acd-pager-nums">
        {pageNumbers(cur, pages).map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="acd-pager-gap">
              …
            </span>
          ) : (
            <button key={p} type="button" className={`acd-pager-num${p === cur ? " on" : ""}`} aria-current={p === cur ? "page" : undefined} onClick={() => goto(p)}>
              {p}
            </button>
          ),
        )}
      </div>
      <button type="button" className="acd-pager-nav" disabled={cur >= pages} onClick={() => goto(cur + 1)}>
        ถัดไป ›
      </button>
      <span className="acd-pager-info">
        หน้า {cur}/{pages} · ทั้งหมด {total} {unit}
      </span>
    </nav>
  );
}
