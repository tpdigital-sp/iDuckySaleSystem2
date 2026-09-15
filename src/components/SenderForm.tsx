"use client";

/**
 * 📮 ฟอร์ม "ชื่อผู้ส่งบนกล่อง" ฝั่งลูกค้า — ใช้ 2 ที่ ข้อความ/กติกาจึงอยู่ที่เดียว
 *   1) หน้า /dealer — ผู้ส่งประจำของตัวแทน (ออเดอร์ใหม่ติดไปเอง)
 *   2) หน้าออเดอร์ของลูกค้า — ตั้งเฉพาะใบนั้น (ได้จนกว่าร้านจะปริ้นใบงาน)
 *
 * เว้นว่างทุกช่อง = กลับไปใช้ชื่อร้าน iDucky · กรอกที่อยู่ต้องมีเบอร์ (เซิร์ฟเวอร์เช็กซ้ำ)
 */

import { useState } from "react";
import type { OrderSender } from "@/lib/admin-data";

const CLS = {
  shop: {
    input: "w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-stone-700 ring-1 ring-amber-200 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-teal-300",
    save: "flex-1 rounded-full bg-teal-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-700 disabled:opacity-40",
    ghost: "rounded-full bg-white px-4 py-2.5 text-xs font-bold text-stone-500 ring-1 ring-stone-200 transition hover:ring-teal-300",
    note: "text-[11px] leading-relaxed text-stone-500",
    err: "text-xs font-semibold text-rose-600",
  },
  account: {
    input: "acd-input",
    save: "btn btn-primary",
    ghost: "btn btn-ghost",
    note: "acd-field-hint",
    err: "acd-field-hint",
  },
  order: {
    input: "ord-input",
    save: "ord-btn yolk flex-1",
    ghost: "ord-btn quiet",
    note: "text-[11px] leading-relaxed t-faint",
    err: "ord-note danger px-3 py-2 text-xs",
  },
} as const;

export default function SenderForm({
  initial,
  variant = "shop",
  busy,
  error,
  showRemember,
  saveLabel = "💾 บันทึกชื่อผู้ส่ง",
  onSave,
  onCancel,
}: {
  initial?: OrderSender;
  variant?: "shop" | "account" | "order";
  busy?: boolean;
  error?: string;
  /** ให้ติ๊ก "ใช้กับออเดอร์ครั้งต่อไปด้วย" (เฉพาะตอนแก้รายใบ) */
  showRemember?: boolean;
  saveLabel?: string;
  onSave: (sender: OrderSender, remember: boolean) => void;
  onCancel?: () => void;
}) {
  const c = CLS[variant];
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [remember, setRemember] = useState(true);

  return (
    <div className="space-y-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อร้าน/ผู้ส่งที่จะขึ้นบนกล่อง" className={c.input} />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value.replace(/[^\d\-+ ]/g, ""))}
        inputMode="tel"
        placeholder="เบอร์ผู้ส่ง (ขนส่งใช้ติดต่อ)"
        className={c.input}
      />
      <textarea
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        rows={3}
        placeholder="ที่อยู่ผู้ส่ง — เว้นว่าง = ใช้ที่อยู่ร้าน iDucky (ของตีกลับมาที่ร้าน แล้วร้านติดต่อคุณ)"
        className={c.input}
      />
      <p className={c.note}>
        ⚠️ ที่อยู่ที่กรอกคือ<b>ที่อยู่ที่พัสดุตีกลับไปหา</b> · ช่องไหนเว้นว่าง = ใช้ข้อมูลร้าน iDucky ช่องนั้น ·
        ใบเสร็จ/ใบกำกับภาษียังเป็นชื่อร้าน iDucky ตามกฎหมาย (ร้านไม่ใส่ลงกล่องงานฝากส่ง)
      </p>
      {showRemember && (
        <label className={`flex items-center gap-2 ${c.note}`}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-teal-600" />
          จำไว้ใช้กับออเดอร์ครั้งต่อไปด้วย
        </label>
      )}
      {error && <p className={c.err}>{error}</p>}
      <div className="flex gap-2 pt-0.5">
        <button type="button" disabled={busy} onClick={() => onSave({ name, phone, address }, remember)} className={c.save}>
          {busy ? "กำลังบันทึก…" : saveLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={c.ghost}>
            ยกเลิก
          </button>
        )}
      </div>
    </div>
  );
}
