"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * กล่องยืนยันของระบบเอง — ใช้แทน `confirm()` ของเบราว์เซอร์
 *
 * ทำไมไม่ใช้ของเบราว์เซอร์: หน้าตาหลุดจากหลังบ้าน · ขึ้นชื่อโดเมน "localhost:3001 บอกว่า" ดูน่ากลัว ·
 * ใส่รายละเอียด/สีเตือน/ชื่อปุ่มที่บอกว่าจะเกิดอะไรขึ้นไม่ได้ ทีมงานเลยกด "ตกลง" ทั้งที่ไม่ได้อ่าน
 *
 * วิธีใช้:
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm({ icon: "🗑", title: "ลบไหม?", detail: "...", confirmLabel: "ลบ", danger: true }))) return;
 *   …
 *   return (<>{…}{dialog}</>);
 */
export interface ConfirmOptions {
  icon?: string;
  title: string;
  /** อธิบายผลของการกด — ขึ้นบรรทัดใหม่ด้วย \n ได้ */
  detail?: string;
  confirmLabel?: string;
  /** งานที่ย้อนกลับไม่ได้ → ปุ่มแดง */
  danger?: boolean;
}

interface Box extends Required<Omit<ConfirmOptions, "detail">> {
  detail?: string;
  resolve: (ok: boolean) => void;
}

export function useConfirm() {
  const [box, setBox] = useState<Box | null>(null);

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) =>
        setBox({
          icon: o.icon ?? "❓",
          title: o.title,
          detail: o.detail,
          confirmLabel: o.confirmLabel ?? "ยืนยัน",
          danger: o.danger ?? false,
          resolve,
        }),
      ),
    [],
  );

  const close = useCallback(
    (ok: boolean) => {
      box?.resolve(ok);
      setBox(null);
    },
    [box],
  );

  const dialog = box ? (
    <ConfirmDialog
      icon={box.icon}
      title={box.title}
      detail={box.detail}
      confirmLabel={box.confirmLabel}
      danger={box.danger}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  ) : null;

  return { confirm, dialog };
}

export default function ConfirmDialog({
  icon,
  title,
  detail,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  icon: string;
  title: string;
  detail?: string;
  confirmLabel: string;
  danger: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className={`px-5 pb-4 pt-5 text-center ring-1 ring-inset ${danger ? "bg-rose-50 ring-rose-100" : "bg-sky-50 ring-sky-100"}`}>
          <span className="text-3xl">{icon}</span>
          <p className="mt-1.5 text-base font-extrabold leading-snug text-slate-900">{title}</p>
          {detail && <p className="mt-1 whitespace-pre-line text-left text-xs leading-relaxed text-slate-600">{detail}</p>}
        </div>
        <div className="flex gap-2 p-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={`flex-1 rounded-xl py-2.5 text-sm font-extrabold text-white shadow-sm transition ${
              danger ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
