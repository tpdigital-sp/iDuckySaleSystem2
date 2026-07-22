"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCustomer } from "@/lib/customer-context";
import { signOut, updateProfile } from "@/lib/customer-auth";

export default function AccountPage() {
  const router = useRouter();
  const { customer, loading, refresh } = useCustomer();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

      <Link
        href="/account/orders"
        className="mt-5 flex items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-amber-200 transition hover:bg-amber-50/50"
      >
        <span className="text-sm font-bold text-stone-700">🧾 ประวัติการสั่งซื้อ</span>
        <span className="text-stone-300">›</span>
      </Link>

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
