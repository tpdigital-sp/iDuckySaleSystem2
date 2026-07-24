"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/products";
import { orderBalance, orderTotal, STATUS_STYLES, type Order } from "@/lib/admin-data";
import { useCustomer } from "@/lib/customer-context";
import { getAccessToken, signOut, updateProfile } from "@/lib/customer-auth";

/** ลิงก์เปิดหน้าเช็คออเดอร์ (ต้องมี key ถึงเปิดได้) */
const orderHref = (o: Order) => `/order/${encodeURIComponent(o.id)}${o.key ? `?key=${encodeURIComponent(o.key)}` : ""}`;

export default function AccountPage() {
  const router = useRouter();
  const { customer, loading, refresh } = useCustomer();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [orders, setOrders] = useState<Order[] | null>(null); // null = กำลังโหลด

  useEffect(() => {
    if (customer) {
      setName(customer.name);
      setPhone(customer.phone);
      setAddress(customer.address);
    }
  }, [customer]);

  useEffect(() => {
    if (!loading && !customer) router.replace("/account/login");
  }, [loading, customer, router]);

  // ดึงประวัติออเดอร์มาโชว์พรีวิวล่าสุด
  useEffect(() => {
    if (!customer) return;
    (async () => {
      const token = await getAccessToken();
      const res = await fetch("/api/orders/mine", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      setOrders(data.orders ?? []);
    })();
  }, [customer]);

  if (loading || !customer) {
    return <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-stone-400">กำลังโหลด…</div>;
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    const res = await updateProfile({ name: name.trim(), phone: phone.trim(), address: address.trim() });
    setSaving(false);
    if (res.ok) {
      refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  async function logout() {
    await signOut();
    router.push("/products");
  }

  const inputCls = "w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-stone-700 ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300";

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-lg font-bold text-amber-700">
          {(customer.name || customer.email).slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold text-amber-950">{customer.name || "สมาชิก"}</h1>
          <p className="truncate text-xs text-stone-500">{customer.email}</p>
        </div>
      </div>

      {/* ── ประวัติการสั่งซื้อ (พรีวิวล่าสุด) ── */}
      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-sm font-bold text-stone-700">🧾 ประวัติการสั่งซื้อ</h2>
        {orders && orders.length > 0 && (
          <Link href="/account/orders" className="text-xs font-semibold text-amber-600 hover:underline">
            ดูทั้งหมด ({orders.length}) →
          </Link>
        )}
      </div>

      {orders === null ? (
        <div className="mt-2 rounded-2xl bg-white p-6 text-center text-sm text-stone-400 ring-1 ring-amber-100">กำลังโหลด…</div>
      ) : orders.length === 0 ? (
        <div className="mt-2 rounded-2xl bg-white p-6 text-center ring-1 ring-amber-100">
          <span className="text-3xl">🧾</span>
          <p className="mt-2 text-sm text-stone-500">ยังไม่มีคำสั่งซื้อ</p>
          <Link href="/products" className="mt-3 inline-block rounded-full bg-amber-400 px-5 py-2 text-xs font-bold text-white transition hover:bg-amber-500">
            🛍️ ไปเลือกสินค้า
          </Link>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {orders.slice(0, 3).map((o) => {
            const owed = orderBalance(o);
            return (
              <Link
                key={o.id}
                href={orderHref(o)}
                className="block rounded-2xl bg-white p-4 ring-1 ring-amber-100 transition hover:ring-amber-300"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-stone-800">{o.id}</p>
                    <p className="truncate text-xs text-stone-400">
                      {o.date} · {o.items.length} รายการ
                    </p>
                  </div>
                  <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLES[o.status]}`}>
                    {o.status}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-amber-50 pt-2">
                  <span className="text-xs text-stone-400">{o.tracking ? `พัสดุ: ${o.tracking}` : "แตะเพื่อดู/อนุมัติแบบ"}</span>
                  {owed > 0 ? (
                    <span className="text-sm font-bold text-rose-600">ค้างชำระ {formatPrice(owed)}</span>
                  ) : (
                    <span className="text-sm font-bold text-stone-900">{formatPrice(orderTotal(o))}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <h2 className="mt-6 text-sm font-bold text-stone-700">ข้อมูลของฉัน</h2>
      <div className="mt-2 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-stone-500">ชื่อ-นามสกุล</label>
          <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-stone-500">เบอร์โทร</label>
          <input value={phone} onChange={(e) => { setPhone(e.target.value.replace(/[^\d\-+ ]/g, "")); setSaved(false); }} inputMode="tel" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-stone-500">ที่อยู่จัดส่ง</label>
          <textarea value={address} onChange={(e) => { setAddress(e.target.value); setSaved(false); }} rows={3} className={`${inputCls} resize-y`} />
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className={`mt-4 w-full rounded-full px-6 py-3 text-sm font-bold text-white shadow transition disabled:opacity-50 ${saved ? "bg-emerald-500" : "bg-amber-400 hover:bg-amber-500"}`}
      >
        {saving ? "กำลังบันทึก…" : saved ? "✓ บันทึกแล้ว" : "💾 บันทึกข้อมูล"}
      </button>

      <button
        type="button"
        onClick={logout}
        className="mt-3 w-full rounded-full px-6 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
      >
        ออกจากระบบ
      </button>
    </div>
  );
}
