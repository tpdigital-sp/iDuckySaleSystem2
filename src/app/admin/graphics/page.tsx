"use client";

/* eslint-disable @next/next/no-img-element */

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
  type OrderItem,
  type OrderStatus,
  type Proof,
} from "@/lib/admin-data";
import { badge, card, faint, h1, muted } from "@/lib/admin-ui";
import { orderMatches, useGraphicsOrders } from "./data";

/**
 * 🎨 ออเดอร์กราฟฟิก — งานของฝ่ายกราฟฟิก 2 มุม
 *
 * 1) คิวรอทำแบบ — ตารางเดียวกับหน้าคำสั่งซื้อ กรองเหลือ "ชำระแล้ว" กับ "รอตรวจสอบ"
 *    (เงินเข้าแล้ว หรือกำลังยืนยันเงินเข้า = ใบที่ยังไม่มีใครทำแบบ)
 * 2) แบบที่ส่งแล้ว — รูปแบบงานที่กราฟฟิกอัปไปแล้ว ยังรอลูกค้ากดอนุมัติ หรือลูกค้าขอแก้กลับมา
 *
 * (ภาพที่ลูกค้าจัดวางลายเองอยู่คนละเมนู — "ลายจากลูกค้า")
 */
const QUEUE: OrderStatus[] = ["ชำระแล้ว", "รอตรวจสอบ"];

type View = "queue" | "sent";
/** ผลตรวจของลูกค้าต่อแบบ 1 รูป */
type SentState = "รอลูกค้าตรวจ" | "ขอแก้ไข";

/** แบบ 1 รูปที่ส่งให้ลูกค้าแล้ว ยังไม่จบเรื่อง */
interface Sent {
  order: Order;
  item: OrderItem;
  proof: Proof;
  /** รูปที่เท่าไหร่ของรายการนั้น (เริ่มที่ 1) */
  no: number;
  state: SentState;
}

const qtyOf = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);
const dayOf = (d: string) => d.split(" ").slice(0, 3).join(" ");

/**
 * แบบที่กราฟฟิกส่งไปแล้วและยัง "ค้างอยู่ที่ลูกค้า"
 * ตัดออก: ลายที่ลูกค้าจัดวางเอง (ไม่ใช่ฝีมือเรา) · รูปที่ลูกค้าอนุมัติแล้ว · ออเดอร์ที่ยกเลิก
 */
function sentProofs(orders: Order[]): Sent[] {
  const rows: Sent[] = [];
  for (const order of orders) {
    if (order.status === "ยกเลิก") continue;
    for (const item of order.items) {
      if (isSelfDesigned(item) || item.proofStatus === "อนุมัติ") continue;
      proofsOf(item).forEach((proof, i) => {
        if (proof.review === "อนุมัติ") return;
        /**
         * รูปที่ลูกค้ากดขอแก้ตรง ๆ = แก้แน่นอน
         * ส่วนรูปที่ยังไม่ได้ตรวจ ถ้าทั้งรายการอยู่สถานะ "ขอแก้ไข" ก็นับว่ารอแก้ด้วย
         * (ลูกค้าบางคนพิมพ์รวมทีเดียวว่าจะแก้รูปไหน ระบบเก็บเป็นคอมเมนต์ของทั้งรายการ)
         */
        const redo = proof.review === "ขอแก้ไข" || item.proofStatus === "ขอแก้ไข";
        rows.push({ order, item, proof, no: i + 1, state: redo ? "ขอแก้ไข" : "รอลูกค้าตรวจ" });
      });
    }
  }
  // ใบใหม่สุดขึ้นก่อน แต่ "ขอแก้ไข" แซงขึ้นบนสุดเสมอ — ลูกค้ารออยู่
  return rows.reverse().sort((a, b) => Number(b.state === "ขอแก้ไข") - Number(a.state === "ขอแก้ไข"));
}

export default function GraphicsOrdersPage() {
  const router = useRouter();
  const { orders, demo } = useGraphicsOrders();
  const [view, setView] = useState<View>("queue");
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [sentFilter, setSentFilter] = useState<SentState | "all">("all");
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

  const sent = useMemo(() => sentProofs(orders), [orders]);
  const redoCount = sent.filter((s) => s.state === "ขอแก้ไข").length;
  const shownSent = sent
    .filter((s) => (sentFilter === "all" ? true : s.state === sentFilter))
    .filter((s) => orderMatches(s.order, q));

  const shown = queue.filter((o) => (filter === "all" ? true : o.status === filter)).filter((o) => orderMatches(o, q));

  return (
    <div className="mx-auto max-w-7xl">
      {/* ── หัวหน้า ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={h1}>🎨 ออเดอร์กราฟฟิก</h1>
          <p className={`mt-1 text-sm ${muted}`}>
            {view === "queue" ? (
              <>
                เฉพาะใบที่รอทำแบบ — สถานะ <strong>ชำระแล้ว</strong> กับ <strong>รอตรวจสอบ</strong>
              </>
            ) : (
              <>แบบที่ส่งให้ลูกค้าแล้ว — รอลูกค้ากดอนุมัติ หรือลูกค้าขอแก้กลับมา</>
            )}{" "}
            ·{" "}
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
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="ใบรอทำแบบ" value={queue.length.toString()} tone="warn" />
        <Tile label="ลายที่ต้องทำ" value={todoCount.toString()} />
        <Tile label="ส่งแล้ว รอลูกค้าตรวจ" value={(sent.length - redoCount).toString()} />
        <Tile label="ลูกค้าขอแก้" value={redoCount.toString()} tone={redoCount ? "alert" : undefined} />
      </div>

      {/* ── สลับมุมมอง: คิวรอทำแบบ / แบบที่ส่งไปแล้ว ── */}
      <div className="mt-5 flex flex-wrap gap-2">
        <ViewTab on={view === "queue"} onClick={() => setView("queue")} label="📋 คิวรอทำแบบ" count={queue.length} />
        <ViewTab on={view === "sent"} onClick={() => setView("sent")} label="🖼 แบบที่ส่งแล้ว" count={sent.length} />
      </div>

      {view === "sent" ? (
        <>
          {/* ── ชิปผลตรวจของลูกค้า ── */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Chip active={sentFilter === "all"} onClick={() => setSentFilter("all")} label="ทั้งหมด" count={sent.length} />
            <Chip
              active={sentFilter === "ขอแก้ไข"}
              onClick={() => setSentFilter("ขอแก้ไข")}
              label="🔁 ลูกค้าขอแก้"
              count={redoCount}
              status="แก้ไขแบบ"
            />
            <Chip
              active={sentFilter === "รอลูกค้าตรวจ"}
              onClick={() => setSentFilter("รอลูกค้าตรวจ")}
              label="⏳ รอลูกค้าตรวจ"
              count={sent.length - redoCount}
              status="รอตรวจแบบ"
            />
          </div>

          {shownSent.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-12 text-center">
              <span className="text-4xl">🎉</span>
              <p className="mt-3 font-semibold text-slate-600">
                {q.trim() ? `ไม่พบแบบที่ตรงกับ "${q}"` : "ไม่มีแบบค้างอยู่ที่ลูกค้า"}
              </p>
              {!q.trim() && <p className="mt-1 text-sm text-slate-400">ลูกค้าตรวจครบหมดแล้ว</p>}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {shownSent.map((s, i) => (
                <SentCard key={`${s.order.id}-${s.proof.url}-${i}`} sent={s} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider ${className}`}>{children}</th>;
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "warn" | "alert" }) {
  const box =
    tone === "warn" ? "border-ducky bg-ducky/15" : tone === "alert" ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white";
  const val = tone === "warn" ? "text-yellow-700" : tone === "alert" ? "text-rose-600" : "text-slate-900";
  return (
    <div className={`rounded-2xl border p-4 ${box}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-2xl font-bold tracking-tight ${val}`}>{value}</div>
    </div>
  );
}

function ViewTab({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        on ? "bg-amber-500 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:text-slate-900"
      }`}
    >
      {label} <span className={on ? "opacity-80" : "text-slate-400"}>{count}</span>
    </button>
  );
}

/** แบบ 1 รูปที่ส่งไปแล้ว — เห็นรูป ผลตรวจ และคอมเมนต์ที่ลูกค้าขอแก้ในใบเดียว */
function SentCard({ sent }: { sent: Sent }) {
  const { order, item, proof, no, state } = sent;
  const redo = state === "ขอแก้ไข";
  /** คอมเมนต์รายรูปมาก่อน · ไม่มีค่อยใช้ของทั้งรายการ (บอกให้ชัดว่าไม่ใช่ของรูปนี้รูปเดียว) */
  const note = proof.reviewNote || (redo ? item.proofNote : "");
  const noteWhole = !proof.reviewNote && !!note;
  return (
    <figure className={`${card} overflow-hidden ${redo ? "ring-1 ring-rose-200" : ""}`}>
      <a href={proof.url} target="_blank" rel="noreferrer" className="block bg-slate-50" title="เปิดรูปเต็ม">
        <img
          src={proof.url}
          alt={`แบบรูปที่ ${no} ของ ${order.id}`}
          loading="lazy"
          decoding="async"
          className="aspect-square w-full object-contain"
        />
      </a>
      <figcaption className="space-y-1.5 p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`${badge} ${
              redo ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200/70" : "bg-violet-50 text-violet-700 ring-1 ring-violet-200/70"
            }`}
          >
            {redo ? "🔁 ขอแก้ไข" : "⏳ รอลูกค้าตรวจ"}
          </span>
          {proof.revisedAt && <span className={`${badge} bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70`}>แก้ให้แล้ว</span>}
        </div>
        <Link
          href={`/admin/orders/${encodeURIComponent(order.id)}`}
          className="block font-mono text-xs font-bold text-slate-900 hover:underline"
        >
          {order.id}
        </Link>
        <p className="truncate text-xs font-semibold text-slate-700" title={item.name}>
          {item.name}
        </p>
        <p className={`text-[11px] ${faint}`}>
          รูปที่ {no}
          {proof.qty ? ` · ${proof.qty} ชิ้น` : ""} · {order.customer}
        </p>
        {note && (
          <p className="rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] leading-relaxed text-rose-700 ring-1 ring-rose-100">
            💬 {noteWhole && <span className="font-semibold">คอมเมนต์ของทั้งรายการ: </span>}
            {note}
          </p>
        )}
        <Link
          href={`/admin/orders/${encodeURIComponent(order.id)}`}
          className="inline-flex text-[11px] font-semibold text-sky-700 hover:underline"
        >
          {redo ? "แก้แบบใบนี้ →" : "เปิดออเดอร์ →"}
        </Link>
      </figcaption>
    </figure>
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
