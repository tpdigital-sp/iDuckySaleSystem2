"use client";

import RequirePerm from "@/components/RequirePerm";
import { useEffect, useState } from "react";
import { cardPad, faint, h1, h2, muted } from "@/lib/admin-ui";
import { markRatingsSeen, SCORE_FACES, type RatingRow } from "@/lib/ratings";

/** หน้าสรุปผลประเมินความพึงพอใจ (ข้อมูลนิรนาม — ระบบไม่รู้ว่าใครประเมิน) */
function RatingsPageInner() {
  const [ratings, setRatings] = useState<RatingRow[] | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    fetch("/api/admin/ratings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const rows = (j.ratings ?? []) as RatingRow[];
        setRatings(rows);
        setNeedsSetup(!!j.needsSetup);
        markRatingsSeen(rows.map((r) => r.id)); // เปิดหน้านี้ = เห็นครบแล้ว (เคลียร์ badge)
      })
      .catch(() => setRatings([]));
  }, []);

  const face = (s: number) => SCORE_FACES.find((f) => f.score === s)?.emoji ?? "⭐";

  if (ratings === null) {
    return <p className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</p>;
  }

  const count = ratings.length;
  const avg = count ? ratings.reduce((s, r) => s + r.score, 0) / count : 0;
  const dist = [5, 4, 3, 2, 1].map((s) => ({ s, n: ratings.filter((r) => r.score === s).length }));
  const tagCount = new Map<string, number>();
  ratings.forEach((r) => (r.tags ?? []).forEach((t) => tagCount.set(t, (tagCount.get(t) ?? 0) + 1)));
  const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]);
  const comments = ratings.filter((r) => r.comment);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className={h1}>💬 ความพึงพอใจลูกค้า</h1>
      <p className={`mt-1 ${muted}`}>ประเมินแบบนิรนาม — ระบบไม่บันทึกว่าใครประเมิน (เก็บเวลาแค่ระดับเดือน)</p>

      {needsSetup ? (
        <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          ยังไม่มีตาราง <code className="font-mono">ratings</code> — รัน <code className="font-mono">supabase/ratings.sql</code> ใน
          Supabase SQL Editor หนึ่งครั้ง
        </p>
      ) : count === 0 ? (
        <div className={`mt-5 p-10 text-center ${cardPad}`}>
          <span className="text-4xl">💬</span>
          <p className={`mt-3 text-sm ${muted}`}>ยังไม่มีการประเมิน — ลูกค้าจะเห็นแบบประเมินในหน้าออเดอร์เมื่อได้รับสินค้าแล้ว</p>
        </div>
      ) : (
        <>
          {/* สรุปรวม */}
          <div className="mt-5 grid gap-4 sm:grid-cols-[200px_1fr]">
            <div className={`text-center ${cardPad}`}>
              <p className="text-5xl">{face(Math.round(avg))}</p>
              <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900">{avg.toFixed(1)}</p>
              <p className={`mt-1 text-xs ${faint}`}>จาก 5 · ทั้งหมด {count} ครั้ง</p>
            </div>
            <div className={cardPad}>
              <div className="space-y-2">
                {dist.map(({ s, n }) => (
                  <div key={s} className="flex items-center gap-2.5 text-sm">
                    <span className="w-6 text-center">{face(s)}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: count ? `${(n / count) * 100}%` : 0 }} />
                    </div>
                    <span className={`w-8 text-right tabular-nums ${faint}`}>{n}</span>
                  </div>
                ))}
              </div>
              {topTags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                  {topTags.map(([t, n]) => (
                    <span key={t} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      {t} · {n}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* คอมเมนต์ทั้งหมด */}
          <section className={`mt-4 ${cardPad}`}>
            <h2 className={`mb-3 ${h2}`}>คอมเมนต์จากลูกค้า ({comments.length})</h2>
            {comments.length === 0 ? (
              <p className={`text-sm ${faint}`}>ยังไม่มีคอมเมนต์ — ลูกค้าให้คะแนนอย่างเดียวก็ได้</p>
            ) : (
              <ul className="grid gap-2.5 lg:grid-cols-2">
                {comments.map((r) => (
                  <li key={r.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-100">
                    <span className="mr-1.5 text-base">{face(r.score)}</span>
                    “{r.comment}”
                    <span className={`ml-2 text-xs ${faint}`}>
                      {(r.tags ?? []).join(" · ")}
                      {r.tags?.length ? " · " : ""}
                      {r.month}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** กันคนที่ไม่มีสิทธิ์ (เช่น ฝ่ายแพ็ค) พิมพ์ URL เข้าตรง ๆ */
export default function RatingsPage() {
  return (
    <RequirePerm perm="orders.viewAll">
      <RatingsPageInner />
    </RequirePerm>
  );
}
