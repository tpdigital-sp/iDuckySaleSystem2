"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SCORE_FACES, type Rating } from "@/lib/ratings";
import { formatPrice, PRODUCTS } from "@/lib/products";
import { MOCK_ORDERS, orderTotal, STATUS_STYLES } from "@/lib/admin-data";
import { badge, card, cardPad, faint, h1, h2, muted } from "@/lib/admin-ui";
import { useCan } from "@/lib/perm-context";

export default function AdminDashboard() {
  const seesMoney = useCan()("orders.money"); // ฝ่ายแพ็คไม่เห็นตัวเลขยอดขาย
  const todaySales = MOCK_ORDERS.filter(
    (o) => o.date.startsWith("20 ก.ค.") && o.status !== "ยกเลิก"
  ).reduce((s, o) => s + orderTotal(o), 0);
  const waiting = MOCK_ORDERS.filter(
    (o) => o.status === "รอชำระเงิน" || o.status === "ชำระแล้ว"
  ).length;
  const producing = MOCK_ORDERS.filter((o) => o.status === "กำลังผลิต").length;

  const stats = [
    ...(seesMoney ? [{ emoji: "💰", tint: "bg-emerald-50 text-emerald-600", label: "ยอดขายวันนี้", value: formatPrice(todaySales), sub: "จากออเดอร์ที่ไม่ถูกยกเลิก" }] : []),
    { emoji: "🧾", tint: "bg-sky-50 text-sky-600", label: "ออเดอร์ใหม่", value: `${waiting}`, sub: "รอชำระ / รอเริ่มผลิต" },
    { emoji: "🖨️", tint: "bg-violet-50 text-violet-600", label: "กำลังผลิต", value: `${producing}`, sub: "อยู่ในคิวพิมพ์" },
    { emoji: "🏷️", tint: "bg-amber-50 text-amber-600", label: "สินค้าในร้าน", value: `${PRODUCTS.length}`, sub: "5 หมวดหมู่" },
  ];

  const bestSellers = [...PRODUCTS].sort((a, b) => b.sold - a.sold).slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className={h1}>ภาพรวมร้าน</h1>
      <p className={`mt-1 ${muted}`}>สรุปความเคลื่อนไหวของร้านวันนี้</p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={cardPad}>
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ${s.tint}`}>{s.emoji}</span>
            <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{s.value}</p>
            <p className="mt-0.5 text-[13px] font-medium text-slate-600">{s.label}</p>
            <p className={`mt-0.5 text-[11px] ${faint}`}>{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* ออเดอร์ล่าสุด */}
        <section className={cardPad}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className={h2}>ออเดอร์ล่าสุด</h2>
            <Link href="/admin/orders" className="text-xs font-semibold text-amber-600 hover:text-amber-700">
              ดูทั้งหมด →
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {MOCK_ORDERS.slice(0, 5).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{o.id}</p>
                  <p className={`truncate text-xs ${faint}`}>
                    {o.customer} · {o.date}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {seesMoney && <span className="text-sm font-semibold text-slate-900">{formatPrice(orderTotal(o))}</span>}
                  <span className={`${badge} ${STATUS_STYLES[o.status]}`}>{o.status}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* สินค้าขายดี */}
        <section className={`h-fit ${cardPad}`}>
          <h2 className={`mb-3 ${h2}`}>ขายดี 5 อันดับ</h2>
          <ol className="space-y-2.5">
            {bestSellers.map((p, i) => (
              <li key={p.id} className="flex items-center gap-3">
                <span className="w-4 text-center text-sm font-bold text-slate-300">{i + 1}</span>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${p.gradient} text-lg`}>
                  {p.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-700">{p.name}</p>
                  <p className={`text-[11px] ${faint}`}>ขายแล้ว {p.sold.toLocaleString("th-TH")} ชิ้น</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* ผลประเมินความพึงพอใจ (นิรนาม) */}
      <RatingsSummary />

      <p className={`mt-6 text-center text-xs ${faint}`}>
        ยอดสรุปคำนวณจากออเดอร์จำลอง — เมื่อต่อฐานข้อมูลจริง ตัวเลขจะอัปเดตอัตโนมัติ
      </p>
    </div>
  );
}

/** สรุปผลประเมินความพึงพอใจ — ข้อมูลนิรนาม (ระบบไม่รู้ว่าใครประเมิน) */
function RatingsSummary() {
  const [ratings, setRatings] = useState<Rating[] | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    fetch("/api/admin/ratings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setRatings(j.ratings ?? []);
        setNeedsSetup(!!j.needsSetup);
      })
      .catch(() => setRatings([]));
  }, []);

  if (ratings === null) return null;

  const count = ratings.length;
  const avg = count ? ratings.reduce((s, r) => s + r.score, 0) / count : 0;
  const dist = [5, 4, 3, 2, 1].map((s) => ({ s, n: ratings.filter((r) => r.score === s).length }));
  const tagCount = new Map<string, number>();
  ratings.forEach((r) => (r.tags ?? []).forEach((t) => tagCount.set(t, (tagCount.get(t) ?? 0) + 1)));
  const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const comments = ratings.filter((r) => r.comment).slice(0, 4);
  const face = (s: number) => SCORE_FACES.find((f) => f.score === s)?.emoji ?? "⭐";

  return (
    <section className={`mt-6 ${cardPad}`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className={h2}>💬 ความพึงพอใจลูกค้า</h2>
        <span className={`text-[11px] ${faint}`}>ประเมินแบบนิรนาม — ระบบไม่บันทึกว่าใครประเมิน</span>
      </div>

      {needsSetup ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          ยังไม่มีตาราง <code className="font-mono">ratings</code> — รัน <code className="font-mono">supabase/ratings.sql</code> ใน
          Supabase SQL Editor หนึ่งครั้ง
        </p>
      ) : count === 0 ? (
        <p className={`rounded-xl bg-slate-50 px-4 py-6 text-center text-sm ${muted}`}>
          ยังไม่มีการประเมิน — ลูกค้าจะเห็นแบบประเมินในหน้าออเดอร์เมื่อได้รับสินค้าแล้ว
        </p>
      ) : (
        <div className="grid gap-5 md:grid-cols-[180px_1fr_1fr]">
          <div className="text-center md:border-r md:border-slate-100 md:pr-5">
            <p className="text-4xl">{face(Math.round(avg))}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{avg.toFixed(1)}</p>
            <p className={`text-xs ${faint}`}>จาก 5 · ทั้งหมด {count} ครั้ง</p>
          </div>

          <div className="space-y-1.5">
            {dist.map(({ s, n }) => (
              <div key={s} className="flex items-center gap-2 text-xs">
                <span className="w-5 text-center">{face(s)}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: count ? `${(n / count) * 100}%` : 0 }} />
                </div>
                <span className={`w-6 text-right tabular-nums ${faint}`}>{n}</span>
              </div>
            ))}
            {topTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {topTags.map(([t, n]) => (
                  <span key={t} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {t} · {n}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-500">คอมเมนต์ล่าสุด</p>
            {comments.length === 0 ? (
              <p className={`text-xs ${faint}`}>ยังไม่มีคอมเมนต์</p>
            ) : (
              <ul className="space-y-2">
                {comments.map((r, i) => (
                  <li key={i} className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <span className="mr-1">{face(r.score)}</span>
                    “{r.comment}”
                    <span className={`ml-1 ${faint}`}>· {r.month}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
