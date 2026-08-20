"use client";

import { useEffect, useState } from "react";
import { fetchProductReviews } from "@/lib/reviews-repo";
import { starsOf, type PublicReview, type ReviewStats } from "@/lib/reviews";

/**
 * รีวิวจากลูกค้า — ท้ายหน้าสินค้า (โชว์เฉพาะรีวิวที่แอดมินอนุมัติ "แสดง")
 * ทุกรีวิวยืนยันจากออเดอร์จริง จึงติดป้าย "ซื้อจริง" ได้เต็มปาก
 * ไม่มีรีวิว = ไม่เรนเดอร์อะไรเลย (หน้าสินค้าไม่รก)
 */
export default function ProductReviews({ productId }: { productId: string }) {
  const [data, setData] = useState<{ reviews: PublicReview[]; stats: ReviewStats | null } | null>(null);
  const [expand, setExpand] = useState(false);

  useEffect(() => {
    let live = true;
    fetchProductReviews(productId).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [productId]);

  if (!data || data.reviews.length === 0 || !data.stats) return null;
  const { reviews, stats } = data;
  const shown = expand ? reviews : reviews.slice(0, 4);

  const thDate = (iso: string) => {
    const d = new Date(iso);
    return isFinite(d.getTime()) ? d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "";
  };

  return (
    <section className="mx-auto max-w-6xl px-4 pb-10 pt-2" aria-label="รีวิวจากลูกค้า">
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-100 sm:p-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h2 className="text-lg font-extrabold text-stone-800">รีวิวจากลูกค้า</h2>
          <span className="text-xl leading-none text-amber-500" aria-label={`คะแนนเฉลี่ย ${stats.avg} จาก 5`}>
            {starsOf(Math.round(stats.avg))}
          </span>
          <span className="text-sm font-bold text-stone-700 tabular-nums">{stats.avg.toFixed(1)}</span>
          <span className="text-sm text-stone-400">จาก {stats.count} รีวิว · ยืนยันการซื้อจริงทุกรีวิว</span>
        </div>

        <ul className="mt-5 space-y-5">
          {shown.map((r) => (
            <li key={r.id} className="border-t border-stone-100 pt-4 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <b className="text-sm text-stone-800">{r.displayName}</b>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                  ✓ ซื้อจริง
                </span>
                <span className="text-sm text-amber-500" aria-label={`ให้ ${r.score} จาก 5 ดาว`}>
                  {starsOf(r.score)}
                </span>
                <span className="text-xs text-stone-400">{thDate(r.createdAt)}</span>
              </div>
              {r.text && <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-stone-700">{r.text}</p>}
              {(r.photoUrls?.length ?? 0) > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.photoUrls!.map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noreferrer" className="block h-20 w-20 overflow-hidden rounded-xl ring-1 ring-stone-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt={`รูปรีวิวจาก ${r.displayName}`} className="h-full w-full object-cover" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
              {r.reply && (
                <p className="mt-2 rounded-xl bg-stone-50 px-3.5 py-2.5 text-sm text-stone-600">
                  <b className="text-stone-700">💬 ร้านตอบ:</b> {r.reply.text}
                </p>
              )}
            </li>
          ))}
        </ul>

        {reviews.length > 4 && (
          <button
            type="button"
            className="mt-5 rounded-full border border-stone-200 bg-white px-5 py-2 text-sm font-bold text-stone-600 transition hover:bg-stone-50"
            onClick={() => setExpand((v) => !v)}
          >
            {expand ? "ย่อรีวิว ▴" : `ดูรีวิวทั้งหมด (${reviews.length}) ▾`}
          </button>
        )}
      </div>
    </section>
  );
}
