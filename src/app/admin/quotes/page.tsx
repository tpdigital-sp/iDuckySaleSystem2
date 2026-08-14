"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RequirePerm from "@/components/RequirePerm";
import { formatPrice } from "@/lib/products";
import { QUOTE_STATUSES, QUOTE_STYLES, daysToExpire, quoteStatusOf, quoteTotal, type Quote, type QuoteStatus } from "@/lib/quotes";
import { card, h1, muted } from "@/lib/admin-ui";

/**
 * 📄 ใบเสนอราคา — แยกจากคิวงานจริง
 * เสนอลูกค้าได้หลายใบ (หลายแบบ/หลายงบ) โดยไม่ไปโผล่ในคิวกราฟฟิก
 * พอลูกค้าตกลงใบไหน ค่อยกดแปลงเป็นออเดอร์ แล้วระบบปิดใบอื่นของลูกค้ารายนั้นให้อัตโนมัติ
 */
function QuotesPageInner() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [filter, setFilter] = useState<QuoteStatus | "all" | "open">("open");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/quotes", { cache: "no-store" });
    const j = await res.json();
    setNeedsSetup(Boolean(j.needsSetup));
    setQuotes(j.quotes ?? []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function createQuote(copyFrom?: string) {
    setCreating(true);
    const res = await fetch("/api/admin/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(copyFrom ? { copyFrom } : {}),
    });
    const j = await res.json();
    setCreating(false);
    if (j.ok) router.push(`/admin/quotes/${j.id}`);
    else alert(j.error ?? "สร้างไม่สำเร็จ");
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: quotes.length, open: 0 };
    for (const s of QUOTE_STATUSES) c[s] = 0;
    for (const qt of quotes) {
      const st = quoteStatusOf(qt);
      c[st] = (c[st] ?? 0) + 1;
      if (st === "ร่าง" || st === "ส่งให้ลูกค้าแล้ว") c.open += 1;
    }
    return c;
  }, [quotes]);

  const kw = q.trim().toLowerCase();
  const shown = quotes
    .filter((qt) => {
      const st = quoteStatusOf(qt);
      if (filter === "all") return true;
      if (filter === "open") return st === "ร่าง" || st === "ส่งให้ลูกค้าแล้ว";
      return st === filter;
    })
    .filter((qt) => (kw ? qt.id.toLowerCase().includes(kw) || qt.customer.toLowerCase().includes(kw) : true));

  // ลูกค้ารายไหนมีใบค้างหลายใบ — เตือนให้เลือกใบเดียว
  const openByPhone = useMemo(() => {
    const m: Record<string, number> = {};
    for (const qt of quotes) {
      const st = quoteStatusOf(qt);
      if (st !== "ร่าง" && st !== "ส่งให้ลูกค้าแล้ว") continue;
      const k = (qt.phone ?? "").replace(/\D/g, "");
      if (k.length >= 8) m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [quotes]);

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={h1}>📄 ใบเสนอราคา</h1>
          <p className={`mt-1 text-sm ${muted}`}>
            เสนอราคาได้หลายใบต่อลูกค้า 1 ราย — ใบเสนอราคา<strong className="text-slate-600">ไม่เข้าคิวกราฟฟิก</strong> จนกว่าลูกค้าจะตกลง
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void createQuote()}
            disabled={creating}
            className="rounded-full bg-amber-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-600 disabled:opacity-40"
          >
            {creating ? "กำลังสร้าง…" : "＋ ใบเสนอราคาใหม่"}
          </button>
          <label className="flex min-w-[220px] items-center gap-2 rounded-full border-2 border-amber-200 bg-white px-4 py-2.5 focus-within:border-amber-400">
            <span className="text-sm text-amber-500">🔍</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นเลขใบ / ชื่อลูกค้า"
              className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
          </label>
        </div>
      </div>

      {needsSetup && (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm ring-1 ring-amber-200">
          <p className="font-bold text-amber-900">⚠️ ยังไม่ได้สร้างตารางใบเสนอราคา</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            เปิด Supabase → SQL Editor แล้วรันไฟล์ <code className="rounded bg-white px-1 font-mono">supabase/quotes.sql</code> ในโปรเจกต์นี้ครั้งเดียว
            จากนั้นรีเฟรชหน้านี้
          </p>
        </div>
      )}

      {/* ตัวกรองสถานะ */}
      <div className="mt-5 flex flex-wrap gap-2">
        {(
          [
            ["open", `⏳ ที่ยังรอลูกค้า (${counts.open})`],
            ["all", `ทั้งหมด (${counts.all})`],
            ["ลูกค้าตกลง", `✅ ตกลง (${counts["ลูกค้าตกลง"] ?? 0})`],
            ["ไม่รับ", `✕ ไม่รับ (${counts["ไม่รับ"] ?? 0})`],
            ["หมดอายุ", `⌛ หมดอายุ (${counts["หมดอายุ"] ?? 0})`],
          ] as [QuoteStatus | "all" | "open", string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              filter === k ? "bg-amber-500 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:border-amber-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={`mt-4 overflow-hidden ${card}`}>
        {loading ? (
          <p className="p-10 text-center text-sm text-slate-400">กำลังโหลด…</p>
        ) : shown.length === 0 ? (
          <div className="p-10 text-center">
            <span className="text-4xl">📄</span>
            <p className="mt-2 text-sm font-semibold text-slate-600">ยังไม่มีใบเสนอราคาในหมวดนี้</p>
            <button
              type="button"
              onClick={() => void createQuote()}
              className="mt-3 rounded-full bg-amber-500 px-5 py-2 text-xs font-bold text-white hover:bg-amber-600"
            >
              ＋ สร้างใบแรก
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {shown.map((qt) => {
              const st = quoteStatusOf(qt);
              const left = daysToExpire(qt);
              const dup = (openByPhone[(qt.phone ?? "").replace(/\D/g, "")] ?? 0) > 1;
              return (
                <Link
                  key={qt.id}
                  href={`/admin/quotes/${encodeURIComponent(qt.id)}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-amber-50/50"
                >
                  <span className="min-w-40 flex-1">
                    <span className="block font-bold tabular-nums text-slate-900">{qt.id}</span>
                    <span className="block text-xs text-slate-400">{qt.date}</span>
                  </span>
                  <span className="min-w-40 flex-1">
                    <span className="block text-sm text-slate-700">{qt.customer}</span>
                    <span className="block text-xs text-slate-400">
                      {qt.items.length} รายการ
                      {dup && (st === "ร่าง" || st === "ส่งให้ลูกค้าแล้ว") && (
                        <span className="ml-1 font-bold text-orange-600">· ⚠️ ลูกค้ารายนี้มีใบค้างหลายใบ</span>
                      )}
                    </span>
                  </span>
                  <span className="w-28 text-right text-sm font-bold text-slate-900">{formatPrice(quoteTotal(qt))}</span>
                  <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${QUOTE_STYLES[st]}`}>{st}</span>
                  <span className="w-28 text-right text-[11px] text-slate-400">
                    {qt.orderId ? (
                      <span className="font-bold text-emerald-600">→ {qt.orderId}</span>
                    ) : left !== null && (st === "ร่าง" || st === "ส่งให้ลูกค้าแล้ว") ? (
                      left < 0 ? (
                        <span className="font-bold text-amber-600">หมดอายุแล้ว</span>
                      ) : (
                        `ยืนราคาอีก ${left} วัน`
                      )
                    ) : (
                      ""
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminQuotesPage() {
  return (
    <RequirePerm perm="orders.edit">
      <QuotesPageInner />
    </RequirePerm>
  );
}
