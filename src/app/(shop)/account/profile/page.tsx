"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCustomer } from "@/lib/customer-context";
import { updateProfile } from "@/lib/customer-auth";
import { removeAvatar, uploadAvatar } from "@/lib/avatar-upload";

export default function ProfilePage() {
  const router = useRouter();
  const { customer, loading, refresh } = useCustomer();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avaBusy, setAvaBusy] = useState(false);
  const [avaMsg, setAvaMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvaBusy(true);
    setAvaMsg(null);
    const r = await uploadAvatar(file);
    setAvaBusy(false);
    if (r.ok) {
      refresh();
      setAvaMsg({ ok: true, text: "เปลี่ยนรูปโปรไฟล์แล้ว ✓" });
    } else setAvaMsg({ ok: false, text: r.error });
  }
  async function onRemoveAvatar() {
    setAvaBusy(true);
    setAvaMsg(null);
    const r = await removeAvatar();
    setAvaBusy(false);
    if (r.ok) {
      refresh();
      setAvaMsg({ ok: true, text: "ลบรูปโปรไฟล์แล้ว" });
    } else setAvaMsg({ ok: false, text: r.error || "ลบไม่สำเร็จ" });
  }

  const inputCls = "w-full rounded-2xl bg-white px-4 py-3 text-sm text-stone-700 ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/account" className="text-sm font-semibold text-stone-400 hover:text-stone-600">← บัญชีของฉัน</Link>
      <h1 className="mt-1 text-2xl font-extrabold text-amber-950 sm:text-3xl">ข้อมูลส่วนตัว</h1>
      <p className="mt-1 text-sm text-stone-400">ใช้เติมอัตโนมัติตอนสั่งซื้อครั้งต่อไป — กรอกครั้งเดียว ไม่ต้องพิมพ์ซ้ำทุกออเดอร์</p>

      <div className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-amber-100 sm:p-8">
        {/* รูปโปรไฟล์ — ช่องเดียวกับหน้าบัญชี (user_metadata.picture) · LINE login เติมรูปมาให้ก่อน */}
        <div className="mb-6 flex items-center gap-4 rounded-2xl bg-amber-50/60 px-4 py-4 ring-1 ring-amber-100">
          <label
            className={`group relative grid h-20 w-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full bg-gradient-to-br from-sky-100 to-sky-200 ring-4 ring-white shadow ${avaBusy ? "opacity-70" : ""}`}
            title="เปลี่ยนรูปโปรไฟล์"
          >
            {customer.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={customer.picture} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl font-extrabold text-sky-700">{(customer.name || customer.email || "ส").trim().charAt(0).toUpperCase()}</span>
            )}
            <span className="absolute inset-0 grid place-items-center bg-amber-950/45 text-lg text-white opacity-0 transition group-hover:opacity-100">
              {avaBusy ? "⏳" : "📷"}
            </span>
            <input type="file" accept="image/*" onChange={onPickAvatar} disabled={avaBusy} className="absolute inset-0 cursor-pointer opacity-0" aria-label="อัปโหลดรูปโปรไฟล์" />
          </label>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">รูปโปรไฟล์</p>
            <p className="text-xs text-stone-500">JPG / PNG ไม่เกิน 8MB — ระบบตัดเป็นวงกลมและย่อให้เอง</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className={`cursor-pointer rounded-full bg-amber-400 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-amber-500 ${avaBusy ? "pointer-events-none opacity-50" : ""}`}>
                {avaBusy ? "กำลังอัปโหลด…" : customer.picture ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
                <input type="file" accept="image/*" onChange={onPickAvatar} disabled={avaBusy} className="hidden" />
              </label>
              {customer.picture && (
                <button type="button" onClick={onRemoveAvatar} disabled={avaBusy} className="rounded-full px-3 py-1.5 text-xs font-semibold text-stone-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50">
                  ลบรูป
                </button>
              )}
              {avaMsg && <span className={`text-xs font-semibold ${avaMsg.ok ? "text-emerald-600" : "text-rose-500"}`}>{avaMsg.text}</span>}
            </div>
          </div>
        </div>

        {/* บัญชีเข้าสู่ระบบ (แก้ไม่ได้) — LINE จะไม่โชว์อีเมลสังเคราะห์ */}
        {customer.email &&
          (() => {
            const isLine = /@line\.iducky\.local$/i.test(customer.email);
            return (
              <div
                className={`mb-6 flex items-center gap-3 rounded-2xl px-4 py-3 ring-1 ${
                  isLine ? "bg-[#06C755]/5 ring-[#06C755]/25" : "bg-amber-50/60 ring-amber-100"
                }`}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg ${
                    isLine ? "bg-[#06C755]/15" : "bg-amber-100"
                  }`}
                >
                  {isLine ? "💬" : "📧"}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">บัญชีเข้าสู่ระบบ</p>
                  {isLine ? (
                    <p className="text-sm font-bold text-[#06C755]">เข้าสู่ระบบผ่าน LINE</p>
                  ) : (
                    <p className="truncate text-sm font-bold text-stone-700">{customer.email}</p>
                  )}
                </div>
              </div>
            );
          })()}

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-500">ชื่อ-นามสกุล</label>
            <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} className={inputCls} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-stone-500">เบอร์โทร</label>
            <input value={phone} onChange={(e) => { setPhone(e.target.value.replace(/[^\d\-+ ]/g, "")); setSaved(false); }} inputMode="tel" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-stone-500">ที่อยู่จัดส่ง</label>
            <textarea value={address} onChange={(e) => { setAddress(e.target.value); setSaved(false); }} rows={4} placeholder="บ้านเลขที่ · ถนน · ตำบล/อำเภอ · จังหวัด · รหัสไปรษณีย์" className={`${inputCls} resize-y`} />
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/account/reset" className="text-center text-sm font-semibold text-stone-400 hover:text-stone-600">
            🔒 เปลี่ยนรหัสผ่าน
          </Link>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className={`rounded-full px-8 py-3 text-sm font-bold text-white shadow transition disabled:opacity-50 sm:min-w-48 ${saved ? "bg-emerald-500" : "bg-amber-400 hover:bg-amber-500"}`}
          >
            {saving ? "กำลังบันทึก…" : saved ? "✓ บันทึกแล้ว" : "💾 บันทึกข้อมูล"}
          </button>
        </div>
      </div>
    </div>
  );
}
