"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import StepDots from "@/components/StepDots";
import {
  daysToUseBy,
  graphicTodoItems,
  isSelfDesigned,
  proofsOf,
  STATUS_STYLES,
  type Order,
  type OrderStatus,
} from "@/lib/admin-data";
import { h1, muted } from "@/lib/admin-ui";
import { orderMatches, useGraphicsOrders } from "./data";

/**
 * 🎨 ออเดอร์กราฟฟิก — ตารางเดียวกับหน้าคำสั่งซื้อ แต่กรองเหลือเฉพาะใบที่ "รอทำแบบ"
 *
 * ทำไมมีแค่ 2 สถานะ: เงินเข้าแล้ว (ชำระแล้ว) หรือกำลังตรวจสลิป (รอตรวจสอบ) = ใบที่ยังไม่มีใครทำแบบ
 * เลยขั้นนี้ไปแล้วแบบส่งให้ลูกค้าตรวจเรียบร้อย ไม่ใช่คิวเริ่มงานอีกต่อไป
 * (ภาพที่ลูกค้าจัดวางเองอยู่คนละเมนู — "ลายจากลูกค้า")
 */
const QUEUE: OrderStatus[] = ["ชำระแล้ว", "รอตรวจสอบ"];

const qtyOf = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);
const dayOf = (d: string) => d.split(" ").slice(0, 3).join(" ");

export default function GraphicsOrdersPage() {
  const router = useRouter();
  const { orders, demo } = useGraphicsOrders();
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [q, setQ] = useState("");

  /** คิวของฝ่ายกราฟฟิก — ใบเก่าขึ้นก่อน ค้างนานสุดต้องรีบสุด */
  const queue = useMemo(
    () => orders.filter((o) => QUEUE.includes(o.status)).sort((a, b) => a.id.localeCompare(b.id)),
    [orders],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: queue.length };
    for (const s of QUEUE) c[s] = queue.filter((o) => o.status === s).length;
    return c;
  }, [queue]);

  /** ลายที่ต้องลงมือทำจริง ๆ (ตัดลายที่ลูกค้าจัดวางเองออก) */
  const todoCount = useMemo(() => queue.reduce((s, o) => s + graphicTodoItems(o).length, 0), [queue]);

  const shown = queue.filter((o) => (filter === "all" ? true : o.status === filter)).filter((o) => orderMatches(o, q));

  return (
    <div className="mx-auto max-w-7xl">
      {/* ── หัวหน้า ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={h1}>🎨 ออเดอร์กราฟฟิก</h1>
          <p className={`mt-1 text-sm ${muted}`}>
            เฉพาะใบที่รอทำแบบ — สถานะ <strong>ชำระแล้ว</strong> กับ <strong>รอตรวจสอบ</strong> ·{" "}
            {demo ? (
              <span className="text-slate-400">ยังไม่มีออเดอร์จริง — แสดงตัวอย่างไว้ก่อน</span>
            ) : (
              <span className="font-semibold text-green-600">● ออเดอร์จริง</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/graphics/designs"
            className="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700"
          >
            🖼 ลายจากลูกค้า
          </Link>
          <label className="flex min-w-[240px] items-center gap-2 rounded-full border-2 border-amber-200 bg-white px-4 py-2.5 focus-within:border-amber-400">
            <span className="text-sm text-amber-500">🔍</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นเลขออเดอร์ / ชื่อลูกค้า"
              className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
          </label>
        </div>
      </div>

      {/* ── การ์ดสรุป ── */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        <Tile label="ใบรอทำแบบ" value={queue.length.toString()} tone="warn" />
        <Tile label="ลายที่ต้องทำ" value={todoCount.toString()} />
        <Tile label="รอตรวจสลิป" value={(counts["รอตรวจสอบ"] ?? 0).toString()} />
      </div>

      {/* ── ชิปสถานะ ── */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip active={filter === "all"} onClick={() => setFilter("all")} label="ทุกสถานะ" count={counts.all} />
        {QUEUE.map((s) => (
          <Chip key={s} active={filter === s} onClick={() => setFilter(s)} label={s} count={counts[s] ?? 0} status={s} />
        ))}
      </div>

      {/* ── ตาราง ── */}
      {shown.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <span className="text-4xl">🎉</span>
          <p className="mt-3 font-semibold text-slate-600">
            {q.trim() ? `ไม่พบออเดอร์ที่ตรงกับ "${q}"` : "ไม่มีใบรอทำแบบ"}
          </p>
          {!q.trim() && <p className="mt-1 text-sm text-slate-400">เคลียร์หมดแล้ว</p>}
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="bg-amber-500 text-white">
                  <Th>ออเดอร์</Th>
                  <Th>ลูกค้า</Th>
                  <Th className="w-[210px]">ความคืบหน้า</Th>
                  <Th>สถานะ</Th>
                  <Th className="w-[130px] text-right">ลายที่ต้องทำ</Th>
                  <Th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {shown.map((o, i) => {
                  const todo = graphicTodoItems(o).length;
                  const selfMade = o.items.filter(isSelfDesigned).length;
                  const done = o.items.filter((it) => !isSelfDesigned(it) && proofsOf(it).length > 0).length;
                  return (
                    <tr
                      key={o.id}
                      onClick={() => router.push(`/admin/orders/${encodeURIComponent(o.id)}`)}
                      className={`cursor-pointer border-b border-slate-100 transition last:border-b-0 hover:bg-amber-100/60 ${
                        i % 2 === 1 ? "bg-amber-50/70" : ""
                      }`}
                    >
                      <td className={`px-4 py-3.5 align-middle ${o.rush ? "border-l-4 border-l-rose-500" : ""}`}>
                        <p className="flex flex-wrap items-center gap-1.5 font-bold tabular-nums text-slate-900">
                          {o.id}
                          {o.rush && (
                            <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white" title="งานเร่ง">
                              🔥 เร่ง
                            </span>
                          )}
                          {o.claimOf && (
                            <span
                              className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200"
                              title={`งานเคลมจาก ${o.claimOf}${o.claimReason ? ` — ${o.claimReason}` : ""}`}
                            >
                              ♻️ เคลม
                            </span>
                          )}
                          {o.reorderOf && (
                            <span
                              className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 ring-1 ring-sky-200"
                              title={`สั่งซ้ำจาก ${o.reorderOf}`}
                            >
                              🔁 สั่งซ้ำ
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400">
                          {dayOf(o.date)}
                          {(() => {
                            const d = o.useByDate ? daysToUseBy(o) : null;
                            if (d == null) return null;
                            const tone = d < 0 ? "text-rose-600" : d <= 3 ? "text-orange-600" : "text-slate-400";
                            return (
                              <span className={`ml-1 font-bold ${tone}`} title="วันที่ลูกค้าต้องใช้งาน">
                                · ⏱ {d < 0 ? `เลย ${Math.abs(d)} วัน` : d === 0 ? "ใช้งานวันนี้" : `อีก ${d} วัน`}
                              </span>
                            );
                          })()}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <p className="text-slate-700">{o.customer}</p>
                        <p className="text-xs text-slate-400">
                          {qtyOf(o)} ชิ้น
                          {selfMade > 0 && (
                            <span className="ml-1 font-semibold text-emerald-600" title="ลูกค้าจัดวางลายเองมาแล้ว — ไม่ต้องทำแบบ">
                              · 🖼 ลูกค้าทำเอง {selfMade}
                            </span>
                          )}
                          {done > 0 && (
                            <span className="ml-1 font-semibold text-violet-600" title="ทำแบบไปแล้วกี่รายการในใบนี้">
                              · ✅ ทำแล้ว {done}
                            </span>
                          )}
                          {o.items.some((it) => !it.artworkUrls?.length && !isSelfDesigned(it)) && (
                            <span className="ml-1 font-semibold text-orange-600" title="มีรายการที่ลูกค้าไม่ได้แนบไฟล์ลายมา">
                              · ⚠️ ไม่มีไฟล์ลาย
                            </span>
                          )}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <StepDots status={o.status} />
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${STATUS_STYLES[o.status]}`}>
                          {o.status}
                        </span>
                        {o.status === "รอตรวจสอบ" && (
                          <span className="mt-1 block">
                            <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
                              ⏳ รอยืนยันเงินเข้า
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right align-middle">
                        <span
                          className={`font-bold tabular-nums ${todo > 0 ? "text-slate-900" : "text-emerald-600"}`}
                          title="รายการที่กราฟฟิกต้องทำแบบในใบนี้"
                        >
                          {todo > 0 ? `${todo} รายการ` : "ครบแล้ว"}
                        </span>
                      </td>
                      <td className="pr-4 align-middle text-slate-300">›</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider ${className}`}>{children}</th>;
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  const box = tone === "warn" ? "border-ducky bg-ducky/15" : "border-slate-200 bg-white";
  const val = tone === "warn" ? "text-yellow-700" : "text-slate-900";
  return (
    <div className={`rounded-2xl border p-4 ${box}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-2xl font-bold tracking-tight ${val}`}>{value}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
  status,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  status?: OrderStatus;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? status
            ? `ring-1 ${STATUS_STYLES[status]}`
            : "bg-slate-900 text-white"
          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label} <span className={active && !status ? "opacity-70" : "text-slate-400"}>{count}</span>
    </button>
  );
}
