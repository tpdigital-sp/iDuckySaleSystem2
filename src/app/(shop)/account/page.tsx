"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/products";
import { orderBalance, orderTotal, STATUS_STYLES, type Order } from "@/lib/admin-data";
import { fetchShopPayment, tiersConfigOf } from "@/lib/shop-settings";
import { nextTier, paidSpend, tierColor, tierForSpend, type Tier } from "@/lib/tiers";
import { useCustomer } from "@/lib/customer-context";
import { getAccessToken, signOut } from "@/lib/customer-auth";
import MyCoupons from "@/components/MyCoupons";

/** ลิงก์เปิดหน้าเช็คออเดอร์ (ต้องมี key ถึงเปิดได้) */
const orderHref = (o: Order) => `/order/${encodeURIComponent(o.id)}${o.key ? `?key=${encodeURIComponent(o.key)}` : ""}`;

export default function AccountPage() {
  const router = useRouter();
  const { customer, loading } = useCustomer();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [tierList, setTierList] = useState<Tier[] | null>(null);

  useEffect(() => {
    if (!loading && !customer) router.replace("/account/login");
  }, [loading, customer, router]);

  useEffect(() => {
    if (!customer) return;
    (async () => {
      const token = await getAccessToken();
      const [res, sett] = await Promise.all([
        fetch("/api/orders/mine", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetchShopPayment(),
      ]);
      setOrders(res.orders ?? []);
      setTierList(tiersConfigOf(sett));
    })();
  }, [customer]);

  if (loading || !customer) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-stone-400">กำลังโหลด…</div>;
  }

  async function logout() {
    await signOut();
    router.push("/products");
  }

  const latest = orders?.[0];
  const displayName = customer.name || "สมาชิก";

  // ── ระดับสมาชิก ──
  const spend = orders ? paidSpend(orders) : 0;
  const tier = orders && tierList ? tierForSpend(spend, tierList) : null;
  const next = orders && tierList ? nextTier(spend, tierList) : null;
  const progressPct = next && next.minSpend > 0 ? Math.min(100, Math.round((spend / next.minSpend) * 100)) : 100;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* ── หัว: โปรไฟล์ ── */}
      <div className="flex items-center gap-3">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-xl font-bold text-amber-700">
          {(customer.name || customer.email).slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold text-amber-950">{displayName}</h1>
          <p className="truncate text-xs text-stone-500">{customer.email}</p>
        </div>
      </div>

      {/* ── สรุป: ระดับสมาชิก + ออเดอร์ล่าสุด (2 คอลัมน์บนจอกว้าง) ── */}
      <div className="mt-6 grid items-start gap-4 md:grid-cols-2">
      {/* ── ระดับสมาชิก — สีเฉพาะตามระดับ (อิงโลหะ/อัญมณี) ── */}
      {tier &&
        (() => {
          const { gradient, pill } = tierColor(tier, tierList?.findIndex((t) => t.id === tier.id) ?? 0);
          return (
            <div className="rounded-2xl p-4 text-white shadow-sm" style={{ background: gradient }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/80">ระดับสมาชิก</p>
                  <p className="mt-0.5 text-lg font-extrabold">
                    {tier.icon} {tier.name}
                    {tier.discountPct > 0 && (
                      <span
                        className="ml-1.5 inline-block rounded-full bg-white/95 px-2 py-0.5 align-middle text-xs font-bold"
                        style={{ color: pill }}
                      >
                        ลด {tier.discountPct}%
                      </span>
                    )}
                  </p>
                </div>
                <p className="text-right text-[11px] text-white/80">
                  ยอดสะสม
                  <span className="block text-base font-extrabold text-white">{formatPrice(spend)}</span>
                </p>
              </div>
              {next ? (
                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-white/25">
                    <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progressPct}%` }} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-white/90">
                    อีก <strong>{formatPrice(Math.max(0, next.minSpend - spend))}</strong> ขึ้นระดับ {next.icon} {next.name} (ลด {next.discountPct}%)
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-[11px] font-bold text-white/90">🎉 คุณอยู่ระดับสูงสุดแล้ว!</p>
              )}
            </div>
          );
        })()}

      {/* ── ออเดอร์ล่าสุด (ไฮไลต์) ── */}
      {orders === null ? (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-stone-400 ring-1 ring-amber-100">กำลังโหลด…</div>
      ) : latest ? (
        <Link
          href={orderHref(latest)}
          className="block rounded-2xl bg-white p-4 ring-1 ring-amber-100 transition hover:ring-amber-300"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-stone-400">ออเดอร์ล่าสุด</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold text-stone-800">{latest.id}</p>
              <p className="truncate text-xs text-stone-400">{latest.date} · {latest.items.length} รายการ</p>
            </div>
            <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLES[latest.status]}`}>
              {latest.status}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-amber-50 pt-2">
            <span className="text-xs text-stone-400">{latest.tracking ? `พัสดุ: ${latest.tracking}` : "แตะเพื่อดู/อนุมัติแบบ"}</span>
            {orderBalance(latest) > 0 ? (
              <span className="text-sm font-bold text-rose-600">ค้างชำระ {formatPrice(orderBalance(latest))}</span>
            ) : (
              <span className="text-sm font-bold text-stone-900">{formatPrice(orderTotal(latest))}</span>
            )}
          </div>
        </Link>
      ) : (
        <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-amber-100">
          <span className="text-3xl">🧾</span>
          <p className="mt-2 text-sm text-stone-500">ยังไม่มีคำสั่งซื้อ</p>
          <Link href="/products" className="mt-3 inline-block rounded-full bg-amber-400 px-5 py-2 text-xs font-bold text-white transition hover:bg-amber-500">
            🛍️ ไปเลือกสินค้า
          </Link>
        </div>
      )}
      </div>

      {/* ── คูปองของฉัน ── */}
      <div className="mt-8">
        <MyCoupons />
      </div>

      {/* ── เมนู ── */}
      <div className="mt-6 divide-y divide-amber-50 overflow-hidden rounded-2xl bg-white ring-1 ring-amber-100">
        <MenuRow href="/account/orders" icon="🧾" label="ประวัติการสั่งซื้อ" hint={orders ? `${orders.length} ออเดอร์` : ""} />
        <MenuRow href="/account/profile" icon="👤" label="ข้อมูลส่วนตัว" hint="ชื่อ · เบอร์ · ที่อยู่" />
        <MenuRow href="/how-to-order" icon="❓" label="วิธีสั่งซื้อ" />
      </div>

      <button
        type="button"
        onClick={logout}
        className="mt-4 w-full rounded-full px-6 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
      >
        🚪 ออกจากระบบ
      </button>
    </div>
  );
}

function MenuRow({ href, icon, label, hint }: { href: string; icon: string; label: string; hint?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-4 transition hover:bg-amber-50/50">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-lg">{icon}</span>
      <span className="flex-1 text-sm font-bold text-stone-700">{label}</span>
      {hint && <span className="text-xs text-stone-400">{hint}</span>}
      <span className="text-stone-300">›</span>
    </Link>
  );
}
