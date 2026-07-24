"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCustomer } from "@/lib/customer-context";
import { updateProfile } from "@/lib/customer-auth";

export default function ProfilePage() {
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

  const inputCls = "w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-stone-700 ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300";

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Link href="/account" className="text-sm font-semibold text-stone-400 hover:text-stone-600">← บัญชีของฉัน</Link>
      <h1 className="mt-1 text-2xl font-extrabold text-amber-950">ข้อมูลส่วนตัว</h1>
      <p className="mt-1 text-xs text-stone-400">ใช้เติมอัตโนมัติตอนสั่งซื้อครั้งต่อไป</p>

      <div className="mt-5 space-y-3">
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
    </div>
  );
}
