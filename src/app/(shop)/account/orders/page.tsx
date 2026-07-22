"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/products";
import { orderTotal, STATUS_STYLES, type Order } from "@/lib/admin-data";
import { useCustomer } from "@/lib/customer-context";
import { getAccessToken } from "@/lib/customer-auth";

export default function MyOrdersPage() {
  const router = useRouter();
  const { customer, loading } = useCustomer();
  const [orders, setOrders] = useState<Order[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "setup">("loading");

  useEffect(() => {
    if (!loading && !customer) router.replace("/account/login");
  }, [loading, customer, router]);

  useEffect(() => {
    if (!customer) return;
    (async () => {
      const token = await getAccessToken();
      const res = await fetch("/api/orders/mine", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      setOrders(data.orders ?? []);
      setState(data.needsSetup ? "setup" : "ready");
    })();
  }, [customer]);

  if (loading || !customer) {
    return <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-stone-400">กำลังโหลด…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/account" className="text-sm font-semibold text-stone-400 hover:text-stone-600">← บัญชีของฉัน</Link>
      <h1 className="mt-1 text-2xl font-extrabold text-amber-950">ประวัติการสั่งซื้อ</h1>

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
      ) : (
        <div className="mt-5 space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-2xl bg-white p-4 ring-1 ring-amber-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-stone-800">{o.id}</p>
                  <p className="text-xs text-stone-400">{o.date}</p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLES[o.status]}`}>
                  {o.status}
                </span>
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-stone-500">
                {o.items.map((it, i) => (
                  <li key={i} className="truncate">
                    {it.name} ×{it.qty}
                  </li>
                ))}
              </ul>
              <p className="mt-2 border-t border-amber-50 pt-2 text-right text-sm font-bold text-stone-900">
                รวม {formatPrice(orderTotal(o))}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
