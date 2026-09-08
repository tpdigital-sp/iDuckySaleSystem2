"use client";

/**
 * 🆕 กล่อง "เริ่มใบใหม่" — ถามชื่อลูกค้าก่อน แล้วค่อยสร้างของจริง
 *
 * ทำไมต้องมี: เดิมกดปุ่ม “สร้างออเดอร์งานพิเศษ” / “ใบเสนอราคาใหม่” = ยิงสร้างแถวในฐานทันที
 * แค่กดดูเล่น กดพลาด หรือเปลี่ยนใจปิดหน้าไป ก็เหลือใบเปล่า “ยังไม่ระบุชื่อ” ค้างในระบบ
 * ซึ่งไปโผล่ในรายการ/ตัวนับ/ยอดค้าง ทั้งที่ไม่ใช่งานจริง แล้วต้องมาไล่ลบทีหลัง
 *
 * กติกาใหม่: ยังไม่พิมพ์ชื่อ (หรือเบอร์) = ยังไม่สร้างอะไรทั้งนั้น — กดยกเลิกแล้วไม่มีร่องรอยเหลือไว้
 * ช่องชื่อเป็นตัวเดียวกับหน้าออเดอร์ (ค้นคลังผู้ติดต่อ ~28,000 ราย) เลือกแล้วได้เบอร์/ที่อยู่/แต้มมาครบตั้งแต่ต้น
 */

import { useEffect, useState } from "react";
import { CustomerContactInput } from "./CustomerContactInput";
import { formatPhone } from "@/lib/contacts";

export interface NewCustomerDraft {
  customer: string;
  phone: string;
  address: string;
  contactId?: string;
}

const INP =
  "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 focus:border-amber-300 focus:outline-none";
const MINI = "mb-1 text-[10.5px] font-bold text-slate-400";

export default function NewCustomerDialog({
  icon = "🆕",
  title,
  detail,
  confirmLabel,
  busy,
  error,
  onCancel,
  onCreate,
}: {
  icon?: string;
  title: string;
  /** อธิบายว่าอะไรจะถูกสร้าง (และอะไรที่ยังไม่ถูกสร้างถ้ากดยกเลิก) */
  detail?: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onCreate: (d: NewCustomerDraft) => void;
}) {
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [contactId, setContactId] = useState<string | undefined>(undefined);

  // มีชื่อหรือเบอร์อย่างน้อยหนึ่งอย่างถึงจะสร้างได้ — เว้นว่างทั้งคู่คือ "ยังไม่ได้พิมพ์อะไร"
  const ready = customer.trim().length > 0 || phone.trim().length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function submit() {
    if (!ready || busy) return;
    onCreate({ customer: customer.trim(), phone: phone.trim(), address: address.trim(), contactId });
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        /* ไม่ใส่ overflow-hidden — รายชื่อผู้ติดต่อที่เด้งลงมาต้องล้นออกนอกกล่องได้ ไม่งั้นโดนตัดครึ่ง */
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="rounded-t-2xl bg-amber-50 px-5 pb-4 pt-5 text-center ring-1 ring-inset ring-amber-100">
          <span className="text-3xl">{icon}</span>
          <p className="mt-1.5 text-base font-extrabold leading-snug text-slate-900">{title}</p>
          {detail && <p className="mt-1 whitespace-pre-line text-left text-xs leading-relaxed text-slate-600">{detail}</p>}
        </div>

        <div className="space-y-3 p-4">
          {/* ⚠️ ชื่อ/เบอร์ ต้องอยู่กริด [1fr 7rem] gap-2 เหมือนหน้าออเดอร์ — รายชื่อที่เด้งลงมายืดคลุมช่องเบอร์ด้วย
              (right-[-7.5rem]) ถ้าให้ช่องชื่อเต็มความกว้าง รายชื่อจะยื่นเลยขอบกล่องออกไป */}
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
            <div className="min-w-0">
              <p className={MINI}>ชื่อลูกค้า</p>
              <CustomerContactInput
                value={customer}
                onChange={(v) => {
                  setCustomer(v);
                  // พิมพ์ชื่อใหม่ทับหลังเลือกผู้ติดต่อ = ไม่ใช่คนเดิมแล้ว ต้องปลดการผูกแต้มออก
                  setContactId(undefined);
                }}
                onBlur={() => {}}
                onPick={(c) => {
                  setCustomer(c.name || customer);
                  if (c.phone) setPhone(c.phone);
                  if (c.address) setAddress(c.address);
                  setContactId(c.id);
                }}
              />
            </div>

            <div className="min-w-0">
              <p className={MINI}>เบอร์โทร</p>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="08x-xxx-xxxx"
                inputMode="tel"
                className={INP}
              />
            </div>
          </div>

          {(contactId || phone.trim()) && (
            <p className="-mt-1 text-[10.5px] font-semibold text-slate-400">
              {contactId ? (
                <span style={{ color: "var(--dk-mint-ink)" }}>✓ ผูกกับผู้ติดต่อในคลังแล้ว — แต้มเข้าคนนี้ตั้งแต่ใบแรก</span>
              ) : (
                formatPhone(phone.trim())
              )}
            </p>
          )}

          <div>
            <p className={MINI}>ที่อยู่จัดส่ง (ไม่ใส่ตอนนี้ก็ได้)</p>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              placeholder="กรอกทีหลังในหน้ารายละเอียดก็ได้"
              className={`${INP} resize-y`}
            />
          </div>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!ready || busy}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {busy ? "กำลังสร้าง…" : confirmLabel}
            </button>
          </div>
          {!ready && <p className="text-center text-[11px] text-slate-400">พิมพ์ชื่อหรือเบอร์ลูกค้าก่อน ถึงจะสร้างได้</p>}
        </div>
      </div>
    </div>
  );
}
