"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/products";
import {
  MOCK_ORDERS,
  ORDER_STATUSES,
  orderTotal,
  proofsOf,
  STATUS_STYLES,
  type Order,
  type OrderStatus,
} from "@/lib/admin-data";
import { fetchOrdersAdmin } from "@/lib/order-repo";
import { usePolling } from "@/lib/use-polling";
import StepDots from "@/components/StepDots";
import { h1, muted } from "@/lib/admin-ui";
import { useCan } from "@/lib/perm-context";
import { PACKING_QUEUE_STATUSES } from "@/lib/permissions";

/** แบ่งสถานะตามแผนกที่รับผิดชอบ — แต่ละแผนกเห็นเฉพาะงานของตัวเอง */
const DEPARTMENTS: { key: string; label: string; emoji: string; statuses: OrderStatus[] }[] = [
  { key: "all", label: "ทั้งหมด", emoji: "📋", statuses: [...ORDER_STATUSES] },
  { key: "sales", label: "คำสั่งซื้อ", emoji: "🧾", statuses: ["รอชำระเงิน", "รอตรวจสอบ", "ชำระแล้ว", "ยกเลิก"] },
  { key: "design", label: "ทำแบบ", emoji: "🎨", statuses: ["รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ"] },
  { key: "pack", label: "แพ็คของ", emoji: "📦", statuses: ["กำลังผลิต", "จัดส่งแล้ว", "เสร็จสิ้น"] },
];

/** ฝ่ายแพ็คเห็นเฉพาะออเดอร์ที่ถึงคิวแพ็คแล้ว — จอสะอาด หยิบผิดใบยาก */
const visibleTo = (list: Order[], seesAll: boolean) =>
  seesAll ? list : list.filter((o) => PACKING_QUEUE_STATUSES.includes(o.status));

const qtyOf = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);
const dayOf = (d: string) => d.split(" ").slice(0, 3).join(" ");
/** งานแบบที่ยังไม่จบ (ยังไม่มีแบบ หรือ ลูกค้าขอแก้) */
const openProofs = (o: Order) => o.items.filter((i) => !proofsOf(i).length || i.proofStatus === "ขอแก้ไข").length;
/** งานที่ต้องให้ทีมงานลงมือตอนนี้ (ไม่ใช่รอลูกค้า) */
const NEEDS_US: OrderStatus[] = ["รอตรวจสอบ", "ชำระแล้ว", "แก้ไขแบบ", "อนุมัติแบบ"];

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [dept, setDept] = useState("all");
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [q, setQ] = useState("");
  const [demo, setDemo] = useState(false);

  const can = useCan();
  const seesAll = can("orders.viewAll"); // ฝ่ายแพ็คเห็นเฉพาะคิวของตัวเอง
  const seesMoney = can("orders.money");

  useEffect(() => {
    const deepLink = new URLSearchParams(window.location.search).get("order");
    if (deepLink) {
      router.replace(`/admin/orders/${encodeURIComponent(deepLink)}`);
      return;
    }
    fetchOrdersAdmin().then((r) => {
      if (r.orders.length > 0) setOrders(visibleTo(r.orders, seesAll));
      else {
        setOrders(visibleTo(MOCK_ORDERS, seesAll));
        setDemo(true);
      }
    });
  }, [router, seesAll]);

  const refresh = useCallback(async () => {
    const r = await fetchOrdersAdmin();
    if (r.orders.length === 0) return;
    const next = visibleTo(r.orders, seesAll);
    setOrders((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
  }, [seesAll]);
  usePolling(refresh, { enabled: !demo });

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const s of ORDER_STATUSES) c[s] = orders.filter((o) => o.status === s).length;
    return c;
  }, [orders]);

  const activeDept = DEPARTMENTS.find((d) => d.key === dept) ?? DEPARTMENTS[0];
  const deptCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of DEPARTMENTS) c[d.key] = orders.filter((o) => d.statuses.includes(o.status)).length;
    return c;
  }, [orders]);

  const stats = useMemo(() => {
    const today = orders[0] ? dayOf(orders[0].date) : "";
    const active = orders.filter((o) => o.status !== "ยกเลิก");
    return {
      total: orders.length,
      needUs: orders.filter((o) => NEEDS_US.includes(o.status)).length,
      waitCustomer: orders.filter((o) => o.status === "รอชำระเงิน" || o.status === "รอตรวจแบบ").length,
      making: orders.filter((o) => o.status === "กำลังผลิต").length,
      todaySales: active.filter((o) => dayOf(o.date) === today).reduce((s, o) => s + orderTotal(o), 0),
    };
  }, [orders]);

  function pickDept(key: string) {
    setDept(key);
    setFilter("all");
  }

  // เบอร์ไหนมีออเดอร์ค้างมากกว่า 1 ใบ → ติดป้ายเตือนในแถว (อาจต้องรวมส่ง)
  const openByPhone = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of orders) {
      if (o.status === "เสร็จสิ้น" || o.status === "ยกเลิก") continue;
      const k = (o.phone ?? "").replace(/\D/g, "");
      if (k.length >= 8) m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [orders]);

  const kw = q.trim().toLowerCase();
  const shown = orders
    .filter((o) => activeDept.statuses.includes(o.status))
    .filter((o) => (filter === "all" ? true : o.status === filter))
    .filter((o) => (kw ? o.id.toLowerCase().includes(kw) || o.customer.toLowerCase().includes(kw) : true));

  return (
    <div className="mx-auto max-w-7xl">
      {/* ── หัวหน้า ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={h1}>🦆 คำสั่งซื้อ</h1>
          <p className={`mt-1 text-sm ${muted}`}>
            {orders.length} ออเดอร์ ·{" "}
            {demo ? (
              <span className="text-slate-400">ยังไม่มีออเดอร์จริง — แสดงตัวอย่างไว้ก่อน</span>
            ) : (
              <span className="font-semibold text-green-600">● ออเดอร์จริง</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can("orders.edit") && <NewOrderButton onCreated={(id) => router.push(`/admin/orders/${id}`)} />}
          <Link
            href="/admin/orders/scan"
            className="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700"
          >
            📮 ยิงเลขพัสดุ
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
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="ทั้งหมด" value={stats.total.toString()} />
        <Tile label="ต้องทำตอนนี้" value={stats.needUs.toString()} tone="warn" />
        <Tile label="รอลูกค้า" value={stats.waitCustomer.toString()} />
        <Tile label="กำลังผลิต" value={stats.making.toString()} />
        {seesMoney && <Tile label="ยอดขายวันนี้" value={formatPrice(stats.todaySales)} tone="brand" />}
      </div>

      {/* ── แท็บแผนก ── */}
      <div className="mt-5 flex flex-wrap gap-2">
        {DEPARTMENTS.map((d) => {
          const on = d.key === dept;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => pickDept(d.key)}
              aria-pressed={on}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                on
                  ? "bg-amber-500 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:text-slate-900"
              }`}
            >
              {d.emoji} {d.label}{" "}
              <span className={on ? "opacity-80" : "text-slate-400"}>{deptCounts[d.key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* ── ชิปสถานะย่อยของแผนกนั้น ── */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip active={filter === "all"} onClick={() => setFilter("all")} label="ทุกสถานะ" count={deptCounts[activeDept.key] ?? 0} />
        {activeDept.statuses.map((s) => (
          <Chip key={s} active={filter === s} onClick={() => setFilter(s)} label={s} count={counts[s]} status={s} />
        ))}
      </div>

      {/* ── ตาราง ── */}
      {shown.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <span className="text-4xl">🗒️</span>
          <p className="mt-3 font-semibold text-slate-600">
            {kw ? `ไม่พบออเดอร์ที่ตรงกับ "${q}"` : filter === "all" ? `ไม่มีงานในแผนก${activeDept.label}` : `ไม่มีออเดอร์สถานะ "${filter}"`}
          </p>
          {!kw && <p className="mt-1 text-sm text-slate-400">ว่างแล้ว 🎉</p>}
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
                  <Th className="w-[110px] text-right">{seesMoney ? "ยอด" : "จำนวน"}</Th>
                  <Th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {shown.map((o, i) => {
                  const open = openProofs(o);
                  return (
                    <tr
                      key={o.id}
                      onClick={() => router.push(`/admin/orders/${encodeURIComponent(o.id)}`)}
                      className={`cursor-pointer border-b border-slate-100 transition last:border-b-0 hover:bg-amber-100/60 ${
                        i % 2 === 1 ? "bg-amber-50/70" : ""
                      }`}
                    >
                      <td className="px-4 py-3.5 align-middle">
                        <p className="font-bold tabular-nums text-slate-900">{o.id}</p>
                        <p className="text-xs text-slate-400">{o.date}</p>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <p className="text-slate-700">{o.customer}</p>
                        <p className="text-xs text-slate-400">
                          {qtyOf(o)} ชิ้น
                          {o.slipUrl && <span className="ml-1 font-semibold text-orange-600">· 📎</span>}
                          {open > 0 && <span className="ml-1 font-semibold text-violet-600">· 🎨 {open}</span>}
                        {(openByPhone[(o.phone ?? "").replace(/\D/g, "")] ?? 0) > 1 && (
                          <span className="ml-1 font-semibold text-orange-600">· ⚠️ ออเดอร์ซ้ำ</span>
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
                      </td>
                      <td className="px-4 py-3.5 text-right align-middle font-bold tabular-nums text-slate-900">
                        {seesMoney ? formatPrice(orderTotal(o)) : `${qtyOf(o)} ชิ้น`}
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
  return (
    <th className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider ${className}`}>{children}</th>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "warn" | "brand" }) {
  const box =
    tone === "warn"
      ? "border-ducky bg-ducky/15"
      : tone === "brand"
        ? "border-amber-200 bg-amber-50"
        : "border-slate-200 bg-white";
  const val = tone === "warn" ? "text-yellow-700" : tone === "brand" ? "text-amber-600" : "text-slate-900";
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

/** ปุ่ม + ฟอร์มสร้างออเดอร์ใหม่จากหลังบ้าน (งานพิเศษ/สั่งแทนลูกค้า — ไม่ต้องผ่านหน้าร้าน) */
function NewOrderButton({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [shipCost, setShipCost] = useState("0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!name.trim() || !phone.trim() || !address.trim()) return setErr("กรอกชื่อ เบอร์ และที่อยู่ลูกค้าให้ครบ");
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerName: name, phone, address, shippingCost: Number(shipCost) || 0 }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "สร้างออเดอร์ไม่สำเร็จ");
    onCreated(j.id);
  }

  const inp =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-amber-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-600"
      >
        ＋ สร้างออเดอร์ใหม่
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-bold text-slate-800">＋ สร้างออเดอร์ใหม่ (งานพิเศษ / สั่งแทนลูกค้า)</p>
            <p className="mt-1 text-xs text-slate-500">
              สร้างเสร็จจะพาเข้าหน้าออเดอร์ — กด “เพิ่มรายการพิเศษ” ใส่งานต่อได้เลย · ถ้าสินค้ามีบนเว็บ แนะนำสั่งผ่านหน้าร้านโหมด
              🧑‍💼 สั่งแทนลูกค้า (ได้ตัวเลือก/ราคาอัตโนมัติ)
            </p>
            <div className="mt-3 space-y-2.5">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="ชื่อลูกค้า" />
              <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\-+ ]/g, ""))} inputMode="tel" className={inp} placeholder="เบอร์โทรลูกค้า" />
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} className={`${inp} resize-y`} placeholder="ที่อยู่จัดส่ง" />
              <label className="block text-xs font-semibold text-slate-500">
                ค่าจัดส่ง (บาท)
                <input type="number" min={0} value={shipCost} onChange={(e) => setShipCost(e.target.value)} className={`${inp} mt-1`} />
              </label>
            </div>
            {err && <p className="mt-2 text-xs font-semibold text-rose-600">{err}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">
                ยกเลิก
              </button>
              <button type="button" onClick={submit} disabled={busy} className="rounded-full bg-amber-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-amber-600 disabled:opacity-50">
                {busy ? "กำลังสร้าง…" : "สร้างออเดอร์"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
