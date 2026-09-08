"use client";

/**
 * 🆕 กล่อง "สร้างใบใหม่" ของออเดอร์งานพิเศษ / ใบเสนอราคา — ถามลูกค้าก่อนค่อยสร้างจริง
 *
 * เดิมกดปุ่ม "สร้าง" ปุ๊บระบบเขียนเรคอร์ดเปล่าลงฐานทันที (ชื่อ "ยังไม่ระบุชื่อ" · 0 รายการ)
 * แอดมินกดเปิดดูเฉย ๆ แล้วปิดไป ก็เหลือใบว่างค้างในรายการทีละใบ ต้องมาไล่ลบ
 * → ตอนนี้ต้องพิมพ์ชื่อหรือเบอร์ลูกค้าก่อนถึงจะสร้าง ยังไม่พิมพ์อะไร = ยังไม่มีอะไรถูกสร้าง
 *
 * ค้นคลังผู้ติดต่อได้จากช่องชื่อ (ชุดเดียวกับหน้าออเดอร์/ใบเสนอราคา) เลือกแล้วเติมเบอร์/ที่อยู่ให้ทั้งชุด
 */

import { useEffect, useState } from "react";
import { CustomerContactInput } from "@/components/admin/CustomerContactInput";
import "@/components/admin/dashboard.css";

export interface NewCustomerDocInput {
  customer: string;
  phone: string;
  address: string;
  contactId?: string;
  email?: string;
}

const INP =
  "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 focus:border-amber-300 focus:outline-none";
const MINI = "mb-1 text-[10.5px] font-bold text-slate-400";

export default function NewCustomerDocDialog({
  eyebrow,
  title,
  hint,
  submitLabel,
  onClose,
  onSubmit,
}: {
  eyebrow: string;
  title: string;
  /** ประโยคสั้น ๆ ใต้หัวข้อ — บอกว่าสร้างแล้วไปทำอะไรต่อ */
  hint: string;
  submitLabel: string;
  onClose: () => void;
  /** สร้างจริง — โยน Error ออกมาถ้าไม่สำเร็จ (กล่องจะโชว์ข้อความให้) */
  onSubmit: (input: NewCustomerDocInput) => Promise<void>;
}) {
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [contactId, setContactId] = useState<string | undefined>(undefined);
  const [email, setEmail] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  // ต้องมีชื่อหรือเบอร์อย่างน้อยหนึ่งอย่าง — พอให้รู้ว่าใบนี้ของใคร
  const ready = customer.trim().length > 0 || phone.replace(/\D/g, "").length >= 9;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setErr("");
    try {
      await onSubmit({
        customer: customer.trim(),
        phone: phone.trim(),
        address: address.trim(),
        ...(contactId ? { contactId } : {}),
        ...(email ? { email } : {}),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "สร้างไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" role="dialog" aria-modal aria-labelledby="new-doc-title">
      <button
        type="button"
        aria-label="ปิด"
        onClick={() => !busy && onClose()}
        className="absolute inset-0"
        style={{ background: "rgba(23,58,107,.28)", backdropFilter: "blur(2px)" }}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="relative w-full max-w-[440px] rounded-2xl p-5 shadow-2xl"
        style={{ background: "rgba(255,255,255,0.98)", color: "var(--dk-navy)" }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="dkb-eyebrow" style={{ color: "var(--dk-faint)" }}>
              {eyebrow}
            </p>
            <h2 id="new-doc-title" className="dkb-display mt-0.5 text-[1.35rem] leading-tight">
              {title}
            </h2>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
              {hint}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="dkb-btn dkb-btn-ghost dkb-btn-sm" aria-label="ปิด">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <p className={MINI}>ชื่อลูกค้า</p>
            <CustomerContactInput
              value={customer}
              onChange={setCustomer}
              onBlur={() => {}}
              onPick={(c) => {
                setCustomer(c.name || customer);
                if (c.phone) setPhone(c.phone);
                if (c.address) setAddress(c.address);
                setContactId(c.id);
                setEmail(c.email || undefined);
              }}
            />
            <p className="mt-1 text-[11px]" style={{ color: "var(--dk-faint)" }}>
              💡 พิมพ์ชื่อหรือเบอร์เพื่อค้นคลังผู้ติดต่อ — เลือกแล้วเติมเบอร์/ที่อยู่ให้เอง
            </p>
          </div>
          <div>
            <p className={MINI}>เบอร์โทร</p>
            <input
              className={`${INP} tabular-nums`}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setContactId(undefined);
              }}
              placeholder="08x-xxx-xxxx"
              inputMode="tel"
            />
          </div>
          <div>
            <p className={MINI}>ที่อยู่จัดส่ง (ใส่ทีหลังได้)</p>
            <textarea
              className={`${INP} min-h-[64px] resize-y`}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
            />
          </div>
        </div>

        {err && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-600" role="alert">
            {err}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="dkb-btn dkb-btn-ghost">
            ยกเลิก
          </button>
          <button type="submit" disabled={!ready || busy} className="dkb-btn dkb-btn-yolk" title={ready ? undefined : "พิมพ์ชื่อหรือเบอร์ลูกค้าก่อน"}>
            {busy ? "กำลังสร้าง…" : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
