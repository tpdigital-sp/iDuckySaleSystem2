"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import { daysToUseBy, orderFullyPaid, proofsOf, STATUS_STYLES, type Order } from "@/lib/admin-data";
import { fetchOrdersAdmin } from "@/lib/order-repo";
import { usePolling } from "@/lib/use-polling";
import { card, h1, muted } from "@/lib/admin-ui";

/**
 * 🖨 คิวปริ้น — ใบงานที่พร้อมปริ้นได้แล้ว
 *
 * เอาเฉพาะสถานะ "อนุมัติแบบ" เท่านั้น (ลูกค้าตรวจแบบผ่านแล้ว = แบบนิ่ง ปริ้นไปทำได้)
 * ก่อนหน้านั้นแบบยังเปลี่ยนได้ ปริ้นไปก็ต้องทิ้ง
 */

type Tab = "todo" | "done" | "all";

const qtyOf = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);
const printCountOf = (o: Order) => o.printCount ?? (o.printedAt ? 1 : 0);

/** ยิ่งเร่งยิ่งอยู่บน: งานเร่ง → ใกล้วันใช้งาน → ออเดอร์เก่ากว่า */
function urgency(o: Order): number {
  if (o.rush) return -1000;
  const d = daysToUseBy(o);
  return d ?? 999;
}

function PrintQueueInner() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("todo");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const r = await fetchOrdersAdmin();
    setOrders(r.orders);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  usePolling(load, { intervalMs: 20000 });

  /** เฉพาะที่แบบผ่านแล้ว — ที่เหลือยังปริ้นไม่ได้ */
  const ready = useMemo(() => orders.filter((o) => o.status === "อนุมัติแบบ"), [orders]);

  const counts = useMemo(
    () => ({
      todo: ready.filter((o) => printCountOf(o) === 0).length,
      done: ready.filter((o) => printCountOf(o) > 0).length,
      all: ready.length,
    }),
    [ready]
  );

  const kw = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      ready
        .filter((o) => (tab === "todo" ? printCountOf(o) === 0 : tab === "done" ? printCountOf(o) > 0 : true))
        .filter((o) => (kw ? o.id.toLowerCase().includes(kw) || o.customer.toLowerCase().includes(kw) : true))
        .sort((a, b) => urgency(a) - urgency(b) || a.id.localeCompare(b.id)),
    [ready, tab, kw]
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={h1}>🖨 คิวปริ้น</h1>
          <p className={`mt-1 text-sm ${muted}`}>
            เฉพาะออเดอร์ที่ <strong className="text-slate-600">ลูกค้าอนุมัติแบบแล้ว</strong> — แบบนิ่งแล้ว ปริ้นใบงานไปทำได้เลย
          </p>
        </div>
        <label className="flex min-w-[220px] items-center gap-2 rounded-full border-2 border-amber-200 bg-white px-4 py-2.5 focus-within:border-amber-400">
          <span className="text-sm text-amber-500">🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นเลขออเดอร์ / ชื่อลูกค้า"
            className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {(
          [
            ["todo", `🖨 ยังไม่ปริ้น (${counts.todo})`],
            ["done", `✓ ปริ้นแล้ว (${counts.done})`],
            ["all", `ทั้งหมด (${counts.all})`],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === k ? "bg-amber-500 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:border-amber-200"
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
            <span className="text-4xl">🖨</span>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              {tab === "todo" ? "ไม่มีใบงานรอปริ้น — เคลียร์หมดแล้ว 🎉" : "ไม่มีออเดอร์ในหมวดนี้"}
            </p>
            <p className="mt-1 text-xs text-slate-400">คิวนี้จะขึ้นเมื่อลูกค้ากดอนุมัติแบบเรียบร้อย</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {shown.map((o) => {
              const printed = printCountOf(o);
              const left = daysToUseBy(o);
              const paid = orderFullyPaid(o);
              const noProof = o.items.some((it) => proofsOf(it).length === 0);
              return (
                <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-amber-50/40">
                  <span className="min-w-36 flex-1">
                    <Link
                      href={`/admin/orders/${encodeURIComponent(o.id)}`}
                      className="block font-bold tabular-nums text-slate-900 hover:text-amber-600 hover:underline"
                    >
                      {o.id}
                    </Link>
                    <span className="block text-xs text-slate-400">
                      {o.date} · {o.items.length} รายการ · {qtyOf(o)} ชิ้น
                    </span>
                  </span>

                  <span className="min-w-32 flex-1 text-sm text-slate-700">{o.customer}</span>

                  {/* ความเร่ง */}
                  <span className="flex min-w-32 flex-wrap items-center gap-1.5">
                    {o.rush && (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600 ring-1 ring-rose-200">
                        🔥 งานเร่ง
                      </span>
                    )}
                    {left !== null && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${
                          left < 0
                            ? "bg-rose-50 text-rose-700 ring-rose-200"
                            : left <= 3
                              ? "bg-orange-50 text-orange-700 ring-orange-200"
                              : "bg-slate-50 text-slate-500 ring-slate-200"
                        }`}
                      >
                        {left < 0 ? `เลยกำหนด ${-left} วัน` : left === 0 ? "ใช้วันนี้" : `อีก ${left} วัน`}
                      </span>
                    )}
                  </span>

                  {/* สิ่งที่ต้องรู้ก่อนกดปริ้น */}
                  <span className="flex min-w-40 flex-wrap items-center gap-1.5">
                    {printed > 0 ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                        🖨 ปริ้นแล้ว {printed} ครั้ง
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
                        ยังไม่ปริ้น
                      </span>
                    )}
                    {!paid && (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600 ring-1 ring-rose-200">
                        🔒 ไม่มีใบปะหน้า
                      </span>
                    )}
                    {noProof && (
                      <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-bold text-orange-700 ring-1 ring-orange-200">
                        ⚠️ มีรายการยังไม่มีแบบ
                      </span>
                    )}
                  </span>

                  <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${STATUS_STYLES[o.status]}`}>
                    {o.status}
                  </span>

                  <Link
                    href={`/admin/orders/${encodeURIComponent(o.id)}/print`}
                    className={`shrink-0 rounded-lg px-4 py-2 text-xs font-bold shadow-sm transition ${
                      printed > 0
                        ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        : "bg-amber-500 text-white hover:bg-amber-600"
                    }`}
                  >
                    {printed > 0 ? "🖨 ปริ้นซ้ำ" : "🖨 ปริ้นใบงาน"}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        เรียงให้อัตโนมัติ: <strong className="text-slate-500">งานเร่ง</strong> ก่อน แล้วตามด้วยงานที่ใกล้วันใช้งานที่สุด ·
        กดปริ้นทุกครั้งระบบลงประวัติให้ว่าใครปริ้น ครั้งที่เท่าไร
      </p>
    </div>
  );
}

export default function AdminPrintQueuePage() {
  return (
    <RequirePerm perm="pack.ship">
      <PrintQueueInner />
    </RequirePerm>
  );
}
