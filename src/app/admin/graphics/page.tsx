"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  graphicTodoItems,
  graphicWaitingItems,
  proofsOf,
  STATUS_STYLES,
  type Order,
  type OrderItem,
} from "@/lib/admin-data";
import { badge, card, faint, h1, muted } from "@/lib/admin-ui";
import { GRAPHIC_QUEUE_STATUSES } from "@/lib/permissions";
import { dayOf, orderMatches, useGraphicsOrders } from "./data";

/**
 * 🎨 ออเดอร์กราฟฟิก — คิวงานทำแบบของฝ่ายกราฟฟิกโดยเฉพาะ
 *
 * หน้าคำสั่งซื้อรวมงานทุกแผนก กราฟฟิกต้องไล่หาเองว่าใบไหนถึงคิวตัวเอง
 * หน้านี้กรองไว้ 2 ชั้น: สถานะต้องอยู่ในช่วงงานแบบ และในใบต้องมีรายการที่กราฟฟิกต้องแตะจริง ๆ
 * (ภาพลายที่ลูกค้าจัดวางเองอยู่คนละเมนู — "ลายจากลูกค้า")
 */

type Queue = "todo" | "waiting";

const QUEUES: { key: Queue; label: string; emoji: string; hint: string; tone: string }[] = [
  {
    key: "todo",
    label: "ต้องทำแบบ",
    emoji: "✏️",
    hint: "ยังไม่มีแบบ หรือลูกค้าขอแก้ — งานอยู่ที่เรา",
    tone: "bg-rose-50 text-rose-700 ring-rose-200/70",
  },
  {
    key: "waiting",
    label: "รอลูกค้าตรวจ",
    emoji: "⏳",
    hint: "ส่งแบบไปแล้ว รอลูกค้ากดอนุมัติ",
    tone: "bg-violet-50 text-violet-700 ring-violet-200/70",
  },
];

/** อยู่ในช่วงงานของกราฟฟิกไหม (เลย "อนุมัติแบบ" ไปแล้ว = จบงานฝ่ายนี้) */
const inGraphicStage = (o: Order) => GRAPHIC_QUEUE_STATUSES.includes(o.status);

export default function GraphicsQueuePage() {
  const { orders, demo } = useGraphicsOrders();
  const [queue, setQueue] = useState<Queue>("todo");
  const [q, setQ] = useState("");

  /** ใบเก่าขึ้นก่อน — ค้างนานสุดต้องรีบที่สุด */
  const todo = useMemo(
    () => orders.filter((o) => inGraphicStage(o) && graphicTodoItems(o).length > 0).sort((a, b) => a.id.localeCompare(b.id)),
    [orders],
  );
  const waiting = useMemo(
    () => orders.filter((o) => inGraphicStage(o) && graphicWaitingItems(o).length > 0),
    [orders],
  );

  /** ลายที่ลูกค้าขอแก้ = ด่วนที่สุด ลูกค้ารออยู่ */
  const redoCount = useMemo(
    () => todo.reduce((s, o) => s + graphicTodoItems(o).filter((i) => i.proofStatus === "ขอแก้ไข").length, 0),
    [todo],
  );
  const todoItemCount = useMemo(() => todo.reduce((s, o) => s + graphicTodoItems(o).length, 0), [todo]);

  const list = (queue === "todo" ? todo : waiting).filter((o) => orderMatches(o, q));
  const active = QUEUES.find((x) => x.key === queue)!;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className={h1}>🎨 ออเดอร์กราฟฟิก</h1>
        <p className={`mt-1 text-sm ${muted}`}>
          เฉพาะใบที่ฝ่ายกราฟฟิกต้องลงมือ — ใบที่เลยขั้น &quot;อนุมัติแบบ&quot; ไปแล้วจะไม่อยู่ในหน้านี้
        </p>
      </div>

      {demo && (
        <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-amber-100">
          โหมดตัวอย่าง — ยังไม่ได้ตั้งค่าฐานข้อมูล ข้อมูลที่เห็นเป็นออเดอร์สมมติ
        </p>
      )}

      {/* สรุปหัวหน้าจอ — เหลืองานเท่าไหร่ ด่วนกี่ชิ้น */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="ใบที่ต้องทำแบบ" value={todo.length} unit="ใบ" tone="text-rose-600" />
        <Stat label="ลายที่ต้องทำ" value={todoItemCount} unit="รายการ" tone="text-slate-800" />
        <Stat label="ลูกค้าขอแก้" value={redoCount} unit="รายการ" tone={redoCount ? "text-rose-600" : "text-slate-400"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {QUEUES.map((t) => {
          const n = t.key === "todo" ? todo.length : waiting.length;
          const on = queue === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setQueue(t.key)}
              title={t.hint}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                on ? "bg-slate-900 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>{t.emoji}</span>
              {t.label}
              <span
                className={`rounded-full px-1.5 text-xs font-bold ${
                  on ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา เลขออเดอร์ / ชื่อลูกค้า / ชื่อสินค้า"
          className="ml-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-slate-300 sm:w-72"
        />
      </div>

      <p className={`text-xs ${faint}`}>{active.hint}</p>

      {!list.length ? (
        <div className={`${card} grid place-items-center gap-1 px-4 py-16 text-center`}>
          <span className="text-3xl">🎉</span>
          <p className="text-sm font-semibold text-slate-700">ไม่มีงานค้างในกองนี้</p>
          <p className={`text-xs ${faint}`}>เคลียร์หมดแล้ว</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((o) => (
            <OrderCard key={o.id} order={o} items={queue === "todo" ? graphicTodoItems(o) : graphicWaitingItems(o)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, unit, tone }: { label: string; value: number; unit: string; tone: string }) {
  return (
    <div className={`${card} px-4 py-3`}>
      <p className={`text-[11px] font-medium ${faint}`}>{label}</p>
      <p className="mt-0.5">
        <span className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</span>
        <span className={`ml-1 text-xs ${faint}`}>{unit}</span>
      </p>
    </div>
  );
}

/** 1 ออเดอร์ 1 การ์ด — เห็นลายที่ลูกค้าส่งมาได้เลย ไม่ต้องเปิดเข้าไปดูก่อนว่าทำอะไร */
function OrderCard({ order, items }: { order: Order; items: OrderItem[] }) {
  const redo = items.filter((i) => i.proofStatus === "ขอแก้ไข").length;
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <Link
          href={`/admin/orders/${encodeURIComponent(order.id)}`}
          className="font-mono text-sm font-bold text-slate-900 hover:underline"
        >
          {order.id}
        </Link>
        <span className={`${badge} ring-1 ${STATUS_STYLES[order.status]}`}>{order.status}</span>
        {redo > 0 && (
          <span className={`${badge} bg-rose-100 text-rose-700 ring-1 ring-rose-200`}>🔁 ลูกค้าขอแก้ {redo}</span>
        )}
        <span className={`text-xs ${muted}`}>· {order.customer}</span>
        <span className={`ml-auto text-xs ${faint}`}>{dayOf(order.date)}</span>
        <Link
          href={`/admin/orders/${encodeURIComponent(order.id)}`}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
        >
          เปิดทำแบบ →
        </Link>
      </div>

      <ul className="divide-y divide-slate-100">
        {items.map((it, i) => {
          const art = it.artworkUrls ?? [];
          const shots = proofsOf(it);
          return (
            <li key={i} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <span className={`mt-0.5 text-xs tabular-nums ${faint}`}>{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">{it.name}</p>
                <p className={`mt-0.5 text-xs ${muted}`}>
                  {it.qty} ชิ้น
                  {shots.length > 0 && ` · ทำแบบไปแล้ว ${shots.length} รูป`}
                  {art.length === 0 && " · ⚠️ ลูกค้าไม่ได้แนบไฟล์ลาย"}
                </p>
                {it.proofNote && (
                  <p className="mt-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700 ring-1 ring-rose-100">
                    💬 ลูกค้าขอแก้: {it.proofNote}
                  </p>
                )}
              </div>
              {art.length > 0 && (
                <div className="flex shrink-0 gap-1.5">
                  {art.slice(0, 4).map((u, k) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer" title="เปิดไฟล์ลายเต็ม">
                      <img
                        src={u}
                        alt={`ลายจากลูกค้า ${k + 1}`}
                        loading="lazy"
                        decoding="async"
                        className="h-14 w-14 rounded-lg border border-slate-200 bg-slate-50 object-cover transition hover:border-slate-400"
                      />
                    </a>
                  ))}
                  {art.length > 4 && (
                    <span className={`grid h-14 w-14 place-items-center rounded-lg bg-slate-100 text-xs ${faint}`}>
                      +{art.length - 4}
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
