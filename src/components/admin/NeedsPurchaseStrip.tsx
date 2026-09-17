"use client";

/**
 * 🛒 แถบ "รอของเข้า — ห้ามส่งเข้าผลิต" บนหน้าออเดอร์ (Order.needsPurchase)
 *
 * เจ้าของร้านสั่ง 17 ก.ย. 69: กราฟฟิกต้องเห็นง่าย ๆ ว่าใบนี้ต้องรอของเข้าก่อนถึงจะเอาเข้าฝั่งผลิต
 * - ยังรอของ = แถบเต็มความกว้างสีคอรัล ขอบซ้ายหนา (เด่นกว่าทุกอย่างรองจากแถบ "ต้องทำต่อ")
 * - ของเข้าแล้ว = บรรทัดเขียวเล็ก ๆ (งานจบแล้วต้องเงียบกว่างานค้าง) เก็บไว้ให้กราฟฟิกรู้ว่าปลดล็อกแล้ว
 * สิทธิ์: แอดมิน (orders.edit) ติ๊ก/แก้โน้ต/ยกเลิก · แอดมินหรือฝ่ายแพ็ค-ผลิต กด "ของเข้าแล้ว" · กราฟฟิกเห็นอย่างเดียว
 */

import { useState } from "react";
import { thaiDateTime } from "@/lib/bangkok-time";
import type { Order } from "@/lib/admin-data";

export default function NeedsPurchaseStrip({
  value,
  paid,
  canManage,
  canArrive,
  onArrived,
  onUndoArrived,
  onNote,
}: {
  value: NonNullable<Order["needsPurchase"]>;
  /** เงินเข้าแล้ว = ถึงคิว "สั่งของได้เลย" · ยังไม่จ่าย = "รอลูกค้าโอนก่อนค่อยสั่ง" */
  paid: boolean;
  canManage: boolean;
  canArrive: boolean;
  onArrived: () => void;
  onUndoArrived: () => void;
  onNote: (note: string) => void;
}) {
  const [note, setNote] = useState(value.note ?? "");

  if (value.arrivedAt) {
    return (
      <div
        className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3.5 py-2 text-[12.5px] font-semibold"
        style={{ background: "var(--dk-mint-wash)", color: "var(--dk-mint-ink)" }}
      >
        <span>
          ✓ ของเข้าแล้ว — ส่งเข้าผลิตได้ · {value.arrivedBy} · {thaiDateTime(new Date(value.arrivedAt))}
          {value.note ? ` · ${value.note}` : ""}
        </span>
        {canManage && (
          <button type="button" onClick={onUndoArrived} className="underline underline-offset-2 opacity-80 hover:opacity-100">
            กดผิด — ของยังไม่เข้า
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="dkb-g mb-4 p-4"
      role="alert"
      style={{ background: "var(--dk-coral-wash)", borderLeft: "6px solid var(--dk-coral-ink)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[1.05rem] font-extrabold leading-snug" style={{ color: "var(--dk-coral-ink)" }}>
            🛒 รอของเข้า — ยังห้ามส่งเข้าผลิต
          </p>
          <p className="mt-0.5 text-[13px] font-semibold leading-relaxed" style={{ color: "var(--dk-navy)" }}>
            {paid
              ? "ลูกค้าโอนแล้ว → สั่งของได้เลย · กราฟฟิกทำแบบ/ให้ลูกค้าตรวจได้ตามปกติ แต่รอของเข้าก่อนค่อยส่งเข้าผลิต"
              : "ลูกค้ายังไม่โอน — โอนเมื่อไหร่ระบบจะแจ้งเตือนเข้ากลุ่มไลน์ร้านให้สั่งของ"}
          </p>
        </div>
        {canArrive && (
          <button type="button" onClick={onArrived} className="dkb-btn dkb-btn-yolk min-h-[44px] shrink-0">
            ✓ ของเข้าแล้ว
          </button>
        )}
      </div>

      {canManage ? (
        <div className="mt-2.5">
          <p className="mb-1 text-[11px] font-bold" style={{ color: "var(--dk-coral-ink)" }}>
            ต้องสั่งอะไร
          </p>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note.trim() !== (value.note ?? "") && onNote(note.trim())}
            maxLength={200}
            placeholder="เช่น แก้วเก็บความเย็น 20 oz สีดำ 50 ใบ · สั่งร้านไหน · ของเข้าประมาณวันไหน"
            className="w-full rounded-lg border border-rose-200 bg-white px-2.5 py-2 text-[13px] text-slate-800 focus:border-rose-400 focus:outline-none"
          />
        </div>
      ) : (
        value.note && (
          <p className="mt-2 text-[13.5px] font-bold" style={{ color: "var(--dk-navy)" }}>
            ต้องสั่ง: {value.note}
          </p>
        )
      )}

      <p className="mt-2 text-[11px] font-semibold text-slate-500">
        ติ๊กโดย {value.by} · {thaiDateTime(new Date(value.at))}
        {value.alertedAt ? ` · แจ้งกลุ่มไลน์ร้านแล้ว ${thaiDateTime(new Date(value.alertedAt))}` : ""}
      </p>
    </div>
  );
}
