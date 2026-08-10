"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  graphicTodoItems,
  graphicWaitingItems,
  isSelfDesigned,
  MOCK_ORDERS,
  proofsOf,
  STATUS_STYLES,
  type Order,
  type OrderItem,
  type Proof,
} from "@/lib/admin-data";
import { fetchOrdersAdmin } from "@/lib/order-repo";
import { usePolling } from "@/lib/use-polling";
import { badge, card, faint, h1, muted, pillActive, pillIdle } from "@/lib/admin-ui";
import { GRAPHIC_QUEUE_STATUSES } from "@/lib/permissions";

/**
 * 🎨 งานกราฟฟิก — หน้ารวมงานของฝ่ายกราฟฟิกโดยเฉพาะ
 *
 * ทำไมต้องแยกหน้า: หน้าคำสั่งซื้อรวมทุกงานของทุกแผนก กราฟฟิกต้องไล่หาเองว่าใบไหนถึงคิวตัวเอง
 * หน้านี้กรองให้เหลือ "เฉพาะออเดอร์ที่กราฟฟิกต้องลงมือ" และแยกกองงานให้ชัด
 *
 * 3 กอง:
 *  1) ต้องทำแบบ      — ยังไม่มีแบบ หรือลูกค้าขอแก้ (งานอยู่ที่เรา)
 *  2) รอลูกค้าตรวจ   — ส่งแบบไปแล้ว รออีกฝั่งกด (ไม่ต้องทำอะไร แต่ต้องรู้ว่าค้างอยู่)
 *  3) ลูกค้าจัดวางเอง — ภาพที่ลูกค้าวางลายบนเทมเพลตมาเอง (กราฟฟิกไม่ต้องทำแบบ แค่ดูว่าลายใช้ได้)
 */

type TabKey = "todo" | "waiting" | "self";

const TABS: { key: TabKey; label: string; emoji: string; hint: string }[] = [
  { key: "todo", label: "ต้องทำแบบ", emoji: "✏️", hint: "ยังไม่มีแบบ หรือลูกค้าขอแก้ — งานอยู่ที่กราฟฟิก" },
  { key: "waiting", label: "รอลูกค้าตรวจ", emoji: "⏳", hint: "ส่งแบบให้ลูกค้าแล้ว รอลูกค้ากดอนุมัติ" },
  { key: "self", label: "ลูกค้าจัดวางเอง", emoji: "🖼", hint: "ภาพที่ลูกค้าวางลายบนเทมเพลตมาเอง — กราฟฟิกไม่ต้องทำแบบ" },
];

/** เป็นออเดอร์ที่อยู่ในช่วงงานของกราฟฟิกไหม (เลยอนุมัติแบบไปแล้ว = จบงานฝ่ายนี้) */
const inGraphicStage = (o: Order) => GRAPHIC_QUEUE_STATUSES.includes(o.status);

/** 1 ภาพในแกลเลอรี "ลูกค้าจัดวางเอง" */
interface SelfShot {
  order: Order;
  item: OrderItem;
  proof: Proof;
  index: number;
}

const dayOf = (d: string) => d.split(" ").slice(0, 3).join(" ");

export default function AdminGraphicsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<TabKey>("todo");
  const [q, setQ] = useState("");
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    fetchOrdersAdmin().then((r) => {
      if (r.orders.length > 0) setOrders(r.orders);
      else {
        setOrders(MOCK_ORDERS);
        setDemo(true);
      }
    });
  }, []);

  const refresh = useCallback(async () => {
    const r = await fetchOrdersAdmin();
    if (r.orders.length === 0) return;
    setOrders((cur) => (JSON.stringify(cur) === JSON.stringify(r.orders) ? cur : r.orders));
  }, []);
  usePolling(refresh, { enabled: !demo });

  /** กองงาน "ต้องทำแบบ" — เก่าสุดขึ้นก่อน (ค้างนานสุดต้องรีบ) */
  const todo = useMemo(
    () =>
      orders
        .filter((o) => inGraphicStage(o) && graphicTodoItems(o).length > 0)
        .sort((a, b) => a.id.localeCompare(b.id)),
    [orders],
  );

  const waiting = useMemo(
    () => orders.filter((o) => inGraphicStage(o) && graphicWaitingItems(o).length > 0),
    [orders],
  );

  /** แกลเลอรีภาพที่ลูกค้าจัดวางเอง — ใบใหม่สุดขึ้นก่อน */
  const selfShots = useMemo(() => {
    const rows: SelfShot[] = [];
    for (const o of orders) {
      if (o.status === "ยกเลิก") continue;
      for (const item of o.items) {
        if (!isSelfDesigned(item)) continue;
        proofsOf(item).forEach((proof, index) => rows.push({ order: o, item, proof, index }));
      }
    }
    return rows.reverse();
  }, [orders]);

  /** ค้นหาด้วยเลขออเดอร์ · ชื่อลูกค้า · ชื่อสินค้า */
  const match = useCallback(
    (o: Order) => {
      const s = q.trim().toLowerCase();
      if (!s) return true;
      return (
        o.id.toLowerCase().includes(s) ||
        o.customer.toLowerCase().includes(s) ||
        o.items.some((i) => i.name.toLowerCase().includes(s))
      );
    },
    [q],
  );

  const counts: Record<TabKey, number> = {
    todo: todo.length,
    waiting: waiting.length,
    self: selfShots.length,
  };

  const list = (tab === "todo" ? todo : waiting).filter(match);
  const shots = selfShots.filter((s) => match(s.order));
  const activeTab = TABS.find((t) => t.key === tab)!;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div>
        <h1 className={h1}>🎨 งานกราฟฟิก</h1>
        <p className={`mt-1 text-sm ${muted}`}>
          เฉพาะออเดอร์ที่เป็นงานของฝ่ายกราฟฟิก — ใบที่เลยขั้น &quot;อนุมัติแบบ&quot; ไปแล้วจะไม่อยู่ในหน้านี้
        </p>
      </div>

      {demo && (
        <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-amber-100">
          โหมดตัวอย่าง — ยังไม่ได้ตั้งค่าฐานข้อมูล ข้อมูลที่เห็นเป็นออเดอร์สมมติ
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            title={t.hint}
            className={tab === t.key ? pillActive : pillIdle}
          >
            {t.emoji} {t.label}
            <span className={`ml-1.5 text-xs ${tab === t.key ? "text-white/70" : "text-slate-400"}`}>
              {counts[t.key]}
            </span>
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา เลขออเดอร์ / ชื่อลูกค้า / ชื่อสินค้า"
          className="ml-auto w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-slate-300 sm:w-72"
        />
      </div>

      <p className={`text-xs ${faint}`}>{activeTab.hint}</p>

      {tab === "self" ? <SelfGallery shots={shots} /> : <OrderQueue orders={list} tab={tab} />}
    </div>
  );
}

/** กองงานแบบตาราง — 1 ออเดอร์ 1 การ์ด พร้อมรายการที่ต้องทำในใบนั้น */
function OrderQueue({ orders, tab }: { orders: Order[]; tab: TabKey }) {
  if (!orders.length)
    return (
      <div className={`${card} grid place-items-center gap-1 px-4 py-14 text-center`}>
        <span className="text-3xl">🎉</span>
        <p className="text-sm font-semibold text-slate-700">ไม่มีงานค้างในกองนี้</p>
        <p className={`text-xs ${faint}`}>เคลียร์หมดแล้ว</p>
      </div>
    );

  return (
    <div className="space-y-3">
      {orders.map((o) => {
        const items = tab === "todo" ? graphicTodoItems(o) : graphicWaitingItems(o);
        const redo = items.filter((i) => i.proofStatus === "ขอแก้ไข").length;
        return (
          <Link
            key={o.id}
            href={`/admin/orders/${encodeURIComponent(o.id)}`}
            className={`${card} block p-4 transition hover:border-slate-300 hover:shadow-sm`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-slate-900">{o.id}</span>
              <span className={`${badge} ring-1 ${STATUS_STYLES[o.status]}`}>{o.status}</span>
              {redo > 0 && (
                <span className={`${badge} bg-rose-50 text-rose-700 ring-1 ring-rose-200/70`}>
                  🔁 ลูกค้าขอแก้ {redo} รายการ
                </span>
              )}
              <span className={`ml-auto text-xs ${faint}`}>{dayOf(o.date)}</span>
            </div>
            <p className={`mt-1 text-xs ${muted}`}>ลูกค้า: {o.customer}</p>

            <ul className="mt-2.5 space-y-1.5">
              {items.map((it, i) => {
                const shots = proofsOf(it);
                return (
                  <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="text-slate-400">{i + 1}.</span>
                    <span className="font-medium text-slate-800">{it.name}</span>
                    <span className={`text-xs ${faint}`}>× {it.qty} ชิ้น</span>
                    {it.artworkUrls?.length ? (
                      <span className={`${badge} bg-sky-50 text-sky-700 ring-1 ring-sky-200/70`}>
                        📎 มีไฟล์ลายแนบ {it.artworkUrls.length}
                      </span>
                    ) : (
                      <span className={`${badge} bg-slate-100 text-slate-500`}>ไม่มีไฟล์ลายแนบ</span>
                    )}
                    {shots.length > 0 && (
                      <span className={`${badge} bg-violet-50 text-violet-700 ring-1 ring-violet-200/70`}>
                        แบบแล้ว {shots.length} รูป
                      </span>
                    )}
                    {it.proofNote && <span className="w-full text-xs text-rose-600">💬 {it.proofNote}</span>}
                  </li>
                );
              })}
            </ul>
          </Link>
        );
      })}
    </div>
  );
}

/** แกลเลอรีภาพที่ลูกค้าจัดวางเอง — ดูรูปได้เลยโดยไม่ต้องเปิดทีละใบ */
function SelfGallery({ shots }: { shots: SelfShot[] }) {
  if (!shots.length)
    return (
      <div className={`${card} grid place-items-center gap-1 px-4 py-14 text-center`}>
        <span className="text-3xl">🖼</span>
        <p className="text-sm font-semibold text-slate-700">ยังไม่มีลูกค้าจัดวางลายเองเข้ามา</p>
        <p className={`text-xs ${faint}`}>ภาพจะขึ้นที่นี่เมื่อลูกค้าสั่งสินค้าที่มีเทมเพลตแล้ววางลายเองในเว็บ</p>
      </div>
    );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {shots.map((s, i) => (
        <div key={`${s.order.id}-${i}`} className={`${card} overflow-hidden`}>
          <a href={s.proof.url} target="_blank" rel="noreferrer" className="block bg-slate-50" title="เปิดรูปเต็ม">
            <img
              src={s.proof.url}
              alt={`ลายที่ ${s.index + 1} ของ ${s.order.id}`}
              loading="lazy"
              decoding="async"
              className="aspect-square w-full object-contain"
            />
          </a>
          <div className="space-y-1 p-2.5">
            <div className="flex items-center gap-1.5">
              <Link
                href={`/admin/orders/${encodeURIComponent(s.order.id)}`}
                className="font-mono text-xs font-bold text-slate-900 hover:underline"
              >
                {s.order.id}
              </Link>
              <span className={`${badge} ring-1 ${STATUS_STYLES[s.order.status]}`}>{s.order.status}</span>
            </div>
            <p className="truncate text-xs font-medium text-slate-700" title={s.item.name}>
              {s.item.name}
            </p>
            <p className={`text-[11px] ${faint}`}>
              ลายที่ {s.index + 1}
              {s.proof.qty ? ` · ${s.proof.qty} ชิ้น` : ""} · {s.order.customer}
            </p>
            <a
              href={s.proof.url}
              download
              className="inline-flex text-[11px] font-semibold text-sky-700 hover:underline"
            >
              ⬇️ ดาวน์โหลด
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
