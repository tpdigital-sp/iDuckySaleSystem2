"use client";

/**
 * ปุ่ม "ใบก่อนหน้า / ใบถัดไป" บนหน้ารายละเอียด (ออเดอร์ · ใบเสนอราคา)
 * ไล่ตามลำดับเดียวกับหน้ารายการ (ใหม่ → เก่า) — ซ้าย = ใบใหม่กว่า · ขวา = ใบเก่ากว่า
 * คีย์ลัด ← → ใช้ได้เมื่อไม่ได้พิมพ์อยู่ในช่องกรอก
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PrevNextNav({
  ids,
  current,
  hrefOf,
}: {
  /** ลำดับใบทั้งหมดตามที่หน้ารายการเรียง (ใหม่ → เก่า) */
  ids: string[];
  current: string;
  hrefOf: (id: string) => string;
}) {
  const router = useRouter();
  const at = ids.indexOf(current);
  const prev = at > 0 ? ids[at - 1] : null; // ใบใหม่กว่า
  const next = at >= 0 && at < ids.length - 1 ? ids[at + 1] : null; // ใบเก่ากว่า

  useEffect(() => {
    if (at < 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el?.isContentEditable) return;
      if (e.key === "ArrowLeft" && prev) router.push(hrefOf(prev));
      if (e.key === "ArrowRight" && next) router.push(hrefOf(next));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, prev, next, hrefOf, router]);

  if (at < 0 || ids.length < 2) return null;
  const btn = "rounded-full border px-2.5 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-35";
  return (
    <div className="flex items-center gap-1.5" title="คีย์ลัด ← → เลื่อนใบ">
      <button
        type="button"
        disabled={!prev}
        onClick={() => prev && router.push(hrefOf(prev))}
        className={btn}
        style={{ borderColor: "var(--dk-hair)", color: "var(--dk-ink)", background: "#fff" }}
        title={prev ? `ใบใหม่กว่า · ${prev}` : "ใบนี้ใหม่สุดแล้ว"}
      >
        ← ก่อนหน้า
      </button>
      <span className="dkb-num text-[11px]" style={{ color: "var(--dk-faint)" }}>
        {at + 1} / {ids.length}
      </span>
      <button
        type="button"
        disabled={!next}
        onClick={() => next && router.push(hrefOf(next))}
        className={btn}
        style={{ borderColor: "var(--dk-hair)", color: "var(--dk-ink)", background: "#fff" }}
        title={next ? `ใบเก่ากว่า · ${next}` : "ใบนี้เก่าสุดแล้ว"}
      >
        ถัดไป →
      </button>
    </div>
  );
}
