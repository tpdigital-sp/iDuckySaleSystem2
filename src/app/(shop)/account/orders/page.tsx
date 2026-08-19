"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/products";
import { orderBalance, orderTotal, STATUS_STYLES, type Order, type OrderStatus } from "@/lib/admin-data";
import StepDots from "@/components/StepDots";
import { useCustomer } from "@/lib/customer-context";
import { useCart } from "@/lib/cart-context";
import { fetchMyOrders } from "@/lib/my-orders";

/** กลุ่มกรอง — รวมสถานะที่ลูกค้าเข้าใจง่าย */
const FILTERS: { key: string; label: string; match: (s: OrderStatus) => boolean }[] = [
  { key: "all", label: "ทั้งหมด", match: () => true },
  { key: "active", label: "กำลังดำเนินการ", match: (s) => !["จัดส่งแล้ว", "เสร็จสิ้น", "ยกเลิก"].includes(s) },
  { key: "shipped", label: "จัดส่งแล้ว", match: (s) => s === "จัดส่งแล้ว" || s === "เสร็จสิ้น" },
  { key: "cancelled", label: "ยกเลิก", match: (s) => s === "ยกเลิก" },
];

export default function MyOrdersPage() {
  const router = useRouter();
  const { customer, loading } = useCustomer();
  const { addItem, productOf } = useCart();
  const [orders, setOrders] = useState<Order[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "setup">("loading");
  const [filter, setFilter] = useState("all");
  const [reordered, setReordered] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !customer) router.replace("/account/login");
  }, [loading, customer, router]);

  useEffect(() => {
    if (!customer) return;
    (async () => {
      const data = await fetchMyOrders();
      setOrders(data.orders);
      setState(data.needsSetup ? "setup" : "ready");
    })();
  }, [customer]);

  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const shown = useMemo(() => orders.filter((o) => active.match(o.status)), [orders, active]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of FILTERS) c[f.key] = orders.filter((o) => f.match(o.status)).length;
    return c;
  }, [orders]);

  /** สั่งซ้ำ — ดึงรายการเดิมเข้าตะกร้า (ใช้ตัวเลือกเดิมถ้ามี) แล้วไปตะกร้า */
  function reorder(o: Order) {
    let added = 0;
    for (const it of o.items) {
      if (!productOf(it.productId)) continue; // สินค้าถูกลบไปแล้ว → ข้าม
      addItem(it.productId, it.sel ?? {}, it.qty);
      added++;
    }
    if (added === 0) {
      setReordered(o.id + ":none");
      return;
    }
    router.push("/cart");
  }

  if (loading || !customer) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-stone-400">กำลังโหลด…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/account" className="text-sm font-semibold text-stone-400 hover:text-stone-600">← บัญชีของฉัน</Link>
      <h1 className="mt-1 text-2xl font-extrabold text-amber-950 sm:text-3xl">ประวัติการสั่งซื้อ</h1>
      {orders.length > 0 && <p className="mt-1 text-sm text-stone-400">ทั้งหมด {orders.length} ออเดอร์ · กดสั่งซ้ำหรือดูรายละเอียดได้เลย</p>}

      {/* ตัวกรอง */}
      {orders.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                filter === f.key ? "bg-amber-400 text-white" : "bg-white text-stone-500 ring-1 ring-amber-200 hover:bg-amber-50"
              }`}
            >
              {f.label} ({counts[f.key]})
            </button>
          ))}
        </div>
      )}

      {state === "loading" ? (
        <p className="mt-8 text-center text-sm text-stone-400">กำลังโหลด…</p>
      ) : orders.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-white p-10 text-center ring-1 ring-amber-100">
          <span className="text-5xl">🧾</span>
          <p className="mt-3 text-sm text-stone-500">ยังไม่มีคำสั่งซื้อ</p>
          <Link href="/products" className="mt-4 inline-block rounded-full bg-amber-400 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-amber-500">
            🛍️ ไปเลือกสินค้า
          </Link>
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-8 text-center text-sm text-stone-400">ไม่มีออเดอร์ในกลุ่มนี้</p>
      ) : (
        <div className="mt-6 space-y-4">
          {shown.map((o) => {
            const owed = orderBalance(o);
            const href = `/order/${encodeURIComponent(o.id)}${o.key ? `?key=${encodeURIComponent(o.key)}` : ""}`;
            const canReorder = o.items.some((it) => productOf(it.productId));
            return (
              <div
                key={o.id}
                className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-100 transition hover:shadow-md sm:flex sm:items-stretch sm:gap-6 sm:p-6"
              >
                {/* ── รายละเอียดออเดอร์ ── */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-base font-bold text-stone-800">{o.id}</p>
                      <p className="text-xs text-stone-400">{o.date}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${STATUS_STYLES[o.status]}`}>
                      {o.status}
                    </span>
                  </div>

                  {/* แถบความคืบหน้า */}
                  {o.status !== "ยกเลิก" && (
                    <div className="mt-4">
                      <StepDots status={o.status} />
                    </div>
                  )}

                  <ul className="mt-4 space-y-0.5 text-sm text-stone-500">
                    {o.items.map((it, i) => (
                      <li key={i} className="truncate">
                        {it.name} <span className="text-stone-400">×{it.qty}</span>
                      </li>
                    ))}
                  </ul>

                  {o.tracking && (
                    <p className="mt-3 inline-block rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                      🚚 เลขพัสดุ: <span className="font-mono">{o.tracking}</span>
                    </p>
                  )}
                </div>

                {/* ── ยอด + ปุ่ม (ขวาบนจอกว้าง / ล่างบนมือถือ) ── */}
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-amber-50 pt-4 sm:mt-0 sm:w-44 sm:flex-col sm:items-end sm:justify-center sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 sm:text-right">
                  <div className="sm:order-first">
                    {owed > 0 ? (
                      <>
                        <p className="text-xs text-stone-400">ค้างชำระ</p>
                        <p className="text-lg font-extrabold text-rose-600">{formatPrice(owed)}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-stone-400">ยอดรวม</p>
                        <p className="text-lg font-extrabold text-stone-900">{formatPrice(orderTotal(o))}</p>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2 sm:w-full sm:flex-col">
                    {canReorder && (
                      <button
                        type="button"
                        onClick={() => reorder(o)}
                        className="rounded-full bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-100"
                      >
                        🔁 สั่งซ้ำ
                      </button>
                    )}
                    <Link
                      href={href}
                      className="rounded-full bg-amber-400 px-4 py-2 text-center text-xs font-bold text-white transition hover:bg-amber-500"
                    >
                      ดูรายละเอียด →
                    </Link>
                  </div>
                </div>
                {reordered === o.id + ":none" && (
                  <p className="mt-2 text-xs text-rose-500 sm:hidden">สินค้าในออเดอร์นี้ไม่มีขายแล้ว สั่งซ้ำไม่ได้</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
