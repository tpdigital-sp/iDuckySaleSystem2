"use client";

import { useEffect, useMemo, useState } from "react";
import { formatPrice } from "@/lib/products";
import {
  MOCK_ORDERS,
  ORDER_STATUSES,
  orderTotal,
  STATUS_STYLES,
  type Order,
  type OrderStatus,
} from "@/lib/admin-data";
import { fetchOrdersAdmin, saveOrderAdmin } from "@/lib/order-repo";
import { card, faint, h1, muted } from "@/lib/admin-ui";

const qtyOf = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);
const dayOf = (d: string) => d.split(" ").slice(0, 3).join(" "); // "20 ก.ค. 2569"

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [demo, setDemo] = useState(false); // true = ยังไม่มีออเดอร์จริง (โชว์ตัวอย่าง)

  useEffect(() => {
    // ลิงก์ลึกจากลูกค้า: /admin/orders?order=<id> → เปิดออเดอร์นั้นให้อัตโนมัติ
    const deepLink = new URLSearchParams(window.location.search).get("order");
    fetchOrdersAdmin().then((r) => {
      const list = r.orders.length > 0 ? r.orders : MOCK_ORDERS;
      if (r.orders.length > 0) setOrders(r.orders);
      else {
        setOrders(MOCK_ORDERS); // ยังไม่มีออเดอร์จริง → โชว์ตัวอย่างไว้ก่อน
        setDemo(true);
      }
      if (deepLink && list.some((o) => o.id === deepLink)) setSelectedId(deepLink);
    });
  }, []);

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  function updateStatus(id: string, status: OrderStatus) {
    let updated: Order | undefined;
    setOrders((os) =>
      os.map((o) => {
        if (o.id !== id) return o;
        updated = { ...o, status };
        return updated;
      })
    );
    if (updated && !demo) void saveOrderAdmin(updated); // บันทึกออเดอร์จริง (ข้ามถ้าเป็นตัวอย่าง)
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const s of ORDER_STATUSES) c[s] = orders.filter((o) => o.status === s).length;
    return c;
  }, [orders]);

  const stats = useMemo(() => {
    const today = orders[0] ? dayOf(orders[0].date) : ""; // ออเดอร์เรียงใหม่→เก่า ตัวแรกคือวันล่าสุด
    const active = orders.filter((o) => o.status !== "ยกเลิก");
    return {
      total: orders.length,
      awaitPay: orders.filter((o) => o.status === "รอชำระเงิน").length,
      toVerify: orders.filter((o) => o.status === "รอตรวจสอบ").length,
      toShip: orders.filter((o) => o.status === "ชำระแล้ว" || o.status === "กำลังผลิต").length,
      shipped: orders.filter((o) => o.status === "จัดส่งแล้ว").length,
      todaySales: active.filter((o) => dayOf(o.date) === today).reduce((s, o) => s + orderTotal(o), 0),
      revenue: active.reduce((s, o) => s + orderTotal(o), 0),
    };
  }, [orders]);

  const shown = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className={h1}>
        คำสั่งซื้อ <span className="font-medium text-slate-400">({orders.length})</span>
      </h1>
      <p className={`mt-1 ${muted}`}>
        ภาพรวมยอด + สถานะออเดอร์ · คลิกเพื่อดูรายละเอียด/เปลี่ยนสถานะ{" "}
        {demo ? (
          <span className={faint}>(ยังไม่มีออเดอร์จริง — แสดงตัวอย่างไว้ก่อน)</span>
        ) : (
          <span className="font-semibold text-emerald-600">● ออเดอร์จริง</span>
        )}
      </p>

      {/* แดชบอร์ดสรุป */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
        <StatTile label="ออเดอร์ทั้งหมด" value={stats.total.toString()} />
        <StatTile label="รอชำระ" value={stats.awaitPay.toString()} accent="amber" />
        <StatTile label="รอตรวจสอบ" value={stats.toVerify.toString()} accent="orange" />
        <StatTile label="รอจัดส่ง" value={stats.toShip.toString()} accent="violet" />
        <StatTile label="จัดส่งแล้ว" value={stats.shipped.toString()} accent="sky" />
        <StatTile label="ยอดขายวันนี้" value={formatPrice(stats.todaySales)} accent="emerald" />
        <StatTile label="ยอดขายรวม" value={formatPrice(stats.revenue)} />
      </div>

      {/* กรองตามสถานะ */}
      <div className="mt-5 flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip active={filter === "all"} onClick={() => setFilter("all")} label="ทั้งหมด" count={counts.all} />
        {ORDER_STATUSES.map((s) => (
          <Chip key={s} active={filter === s} onClick={() => setFilter(s)} label={s} count={counts[s]} status={s} />
        ))}
      </div>

      {/* รายการออเดอร์ */}
      {shown.length === 0 ? (
        <div className={`mt-4 ${card} p-12 text-center`}>
          <span className="text-4xl">🗒️</span>
          <p className="mt-3 font-semibold text-slate-600">ไม่มีออเดอร์ในสถานะนี้</p>
        </div>
      ) : (
        <div className={`mt-4 overflow-hidden ${card}`}>
          <ul className="divide-y divide-slate-100">
            {shown.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(o.id)}
                  className="flex w-full flex-wrap items-center gap-3 p-4 text-left transition hover:bg-slate-50/70"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">
                      {o.id}
                      <span className="ml-2 font-normal text-slate-500">{o.customer}</span>
                    </p>
                    <p className={`mt-0.5 truncate text-xs ${faint}`}>
                      {o.date} · {qtyOf(o)} ชิ้น · {o.payment} · {o.shipping}
                      {o.slipUrl && <span className="ml-1 font-semibold text-orange-600">· 📎 มีสลิป</span>}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{formatPrice(orderTotal(o))}</span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLES[o.status]}`}>
                    {o.status}
                  </span>
                  <span className="text-slate-300">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected && <OrderDrawer order={selected} onClose={() => setSelectedId(null)} onStatus={updateStatus} />}
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "amber" | "orange" | "sky" | "violet" | "emerald";
}) {
  const color =
    accent === "amber"
      ? "text-amber-600"
      : accent === "orange"
        ? "text-orange-600"
        : accent === "sky"
          ? "text-sky-600"
          : accent === "violet"
            ? "text-violet-600"
            : accent === "emerald"
              ? "text-emerald-600"
              : "text-slate-900";
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200/70">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-xl font-bold sm:text-2xl ${color}`}>{value}</div>
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

/* ── ลิ้นชักรายละเอียดออเดอร์ (สไลด์จากขวา) ── */
function OrderDrawer({
  order,
  onClose,
  onStatus,
}: {
  order: Order;
  onClose: () => void;
  onStatus: (id: string, status: OrderStatus) => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={`รายละเอียดออเดอร์ ${order.id}`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div>
            <p className="text-base font-bold text-slate-900">{order.id}</p>
            <p className="text-xs text-slate-500">{order.date}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
            aria-label="ปิด"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">สถานะออเดอร์</h3>
            <select
              value={order.status}
              onChange={(e) => onStatus(order.id, e.target.value as OrderStatus)}
              className={`w-full rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 focus:outline-none focus:ring-2 focus:ring-amber-300 ${STATUS_STYLES[order.status]}`}
            >
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">ลูกค้า / จัดส่ง</h3>
            <p className="text-sm leading-relaxed text-slate-600">
              <span className="font-semibold text-slate-800">{order.customer}</span> · {order.phone}
              <br />
              {order.address}
            </p>
            <p className={`mt-1 text-xs ${faint}`}>
              ชำระ: {order.payment} · จัดส่ง: {order.shipping}
            </p>
          </div>

          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              รายการสินค้า ({order.items.length})
            </h3>
            <ul className="space-y-2">
              {order.items.map((it) => (
                <li key={`${it.productId}-${it.selections}`} className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-3">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-semibold text-slate-700">{it.name}</span>
                    <span className="shrink-0 font-semibold text-slate-900">
                      {it.qty} × {formatPrice(it.unitPrice)}
                    </span>
                  </div>
                  {it.selections && <p className={`mt-0.5 text-xs ${faint}`}>{it.selections}</p>}
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>ค่าจัดส่ง</span>
                <span>{order.shippingCost === 0 ? "ฟรี" : formatPrice(order.shippingCost)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900">
                <span>ยอดรวม</span>
                <span>{formatPrice(orderTotal(order))}</span>
              </div>
            </div>
          </div>

          {order.slipUrl && (
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                หลักฐานการโอน {order.status === "รอตรวจสอบ" && <span className="ml-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">รอตรวจ</span>}
              </h3>
              <a href={order.slipUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl ring-1 ring-slate-200 transition hover:ring-amber-300">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={order.slipUrl} alt="สลิปการโอน" className="max-h-72 w-full bg-slate-50 object-contain" />
              </a>
              {order.paidReportedAt && (
                <p className={`mt-1 text-xs ${faint}`}>
                  ลูกค้าแจ้งโอน: {new Date(order.paidReportedAt).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · แตะรูปเพื่อดูเต็ม
                </p>
              )}
            </div>
          )}

          {order.tracking && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">เลขพัสดุ</h3>
              <p className="select-all font-mono text-sm font-semibold text-slate-700">{order.tracking}</p>
            </div>
          )}
          {order.note && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">หมายเหตุ</h3>
              <p className="rounded-xl bg-amber-50/60 p-3 text-sm text-slate-600 ring-1 ring-amber-100">{order.note}</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
