"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
  /**
   * ทางที่ "ควรทำ" มากกว่าปุ่มยืนยัน (เช่น "แนบสลิปตอนนี้" แทนการยืนยันทั้งที่ไม่มีสลิป)
   * ใส่แล้วปุ่มนี้จะเด่นเต็มความกว้างด้านบน · confirm() คืนค่า "alt"
   */
  altLabel?: string;
  /**
   * ✍️ ช่องข้อความ 1 ช่องในกล่องเดียวกัน (เช่น "เหตุผล") — ใช้ผ่าน confirmText() จะได้ข้อความกลับมาตรง ๆ
   * required = ปุ่มยืนยันกดไม่ได้จนกว่าจะพิมพ์ · Enter ในช่อง = ยืนยัน
   */
  input?: ConfirmInput;
  /** 🖼 รูปของสิ่งที่จะลบ/เปลี่ยน — โชว์ในกล่องให้เห็นว่ากดถูกรูป (ลบแบบ/ลายทีละรูป) */
  image?: string;
  /** 🧮 เนื้อหาเพิ่มใต้รายละเอียด (เช่นตารางราคาก่อน/หลังตอนลบรายการ) — กล่องขยายกว้างให้ */
  body?: ReactNode;
}

export interface ConfirmInput {
  label: string;
  placeholder?: string;
  required?: boolean;
  initial?: string;
  maxLength?: number;
}

/** false = ยกเลิก · true = กดปุ่มยืนยัน · "alt" = กดทางเลือกที่แนะนำ */
export type ConfirmResult = boolean | "alt";

interface Box extends Required<Omit<ConfirmOptions, "detail" | "altLabel" | "input" | "image" | "body">> {
  detail?: string;
  body?: ReactNode;
  altLabel?: string;
  input?: ConfirmInput;
  image?: string;
  resolve: (ok: ConfirmResult, text: string) => void;
}

export function useConfirm() {
  const [box, setBox] = useState<Box | null>(null);

  const open = useCallback(
    (o: ConfirmOptions, resolve: Box["resolve"]) =>
      setBox({
        icon: o.icon ?? "❓",
        title: o.title,
        detail: o.detail,
        confirmLabel: o.confirmLabel ?? "ยืนยัน",
        danger: o.danger ?? false,
        altLabel: o.altLabel,
        input: o.input,
        image: o.image,
        body: o.body,
        resolve,
      }),
    [],
  );
  const confirm = useCallback((o: ConfirmOptions) => new Promise<ConfirmResult>((resolve) => open(o, (ok) => resolve(ok))), [open]);
  /** กล่องยืนยันที่มีช่องข้อความ — คืนข้อความที่พิมพ์ (trim แล้ว) · null = ยกเลิก */
  const confirmText = useCallback(
    (o: ConfirmOptions & { input: ConfirmInput }) =>
      new Promise<string | null>((resolve) => open(o, (ok, text) => resolve(ok === true ? text.trim() : null))),
    [open],
  );

  const close = useCallback(
    (ok: ConfirmResult, text = "") => {
      box?.resolve(ok, text);
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
      altLabel={box.altLabel}
      input={box.input}
      image={box.image}
      body={box.body}
      onCancel={() => close(false)}
      onConfirm={(text) => close(true, text)}
      onAlt={() => close("alt")}
    />
  ) : null;

  return { confirm, confirmText, dialog };
}

export default function ConfirmDialog({
  icon,
  title,
  detail,
  confirmLabel,
  danger,
  altLabel,
  input,
  image,
  body,
  onCancel,
  onConfirm,
  onAlt,
}: {
  icon: string;
  title: string;
  detail?: string;
  confirmLabel: string;
  danger: boolean;
  altLabel?: string;
  input?: ConfirmInput;
  image?: string;
  body?: ReactNode;
  onCancel: () => void;
  /** ข้อความในช่อง (ว่างถ้าไม่มีช่อง) */
  onConfirm: (text: string) => void;
  onAlt?: () => void;
}) {
  const [text, setText] = useState(input?.initial ?? "");
  const canConfirm = !input?.required || text.trim().length > 0;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") {
        if (altLabel && onAlt) onAlt();
        else if (canConfirm) onConfirm(text);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm, onAlt, altLabel, canConfirm, text]);

  // 🪟 วางที่ <body> เสมอ — ถ้าอยู่ใต้การ์ดที่มี backdrop-filter/transform (เช่น .dkb-g หน้าออเดอร์)
  // `fixed` จะยึดกับการ์ดแทนจอ กล่องเลยไปโผล่กลางการ์ดสูงหลายพันพิกเซล หลุดขอบจอ (20 ต.ค. 69)
  const node = (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl ${body ? "max-w-md" : "max-w-sm"}`}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className={`px-5 pb-4 pt-5 text-center ring-1 ring-inset ${danger ? "bg-rose-50 ring-rose-100" : "bg-sky-50 ring-sky-100"}`}>
          <span className="text-3xl">{icon}</span>
          <p className="mt-1.5 text-base font-extrabold leading-snug text-slate-900">{title}</p>
          {image && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={image}
              alt=""
              className={`mx-auto mt-3 max-h-40 max-w-full rounded-xl bg-white object-contain p-1 shadow-sm ring-1 ${danger ? "ring-rose-200" : "ring-sky-200"}`}
            />
          )}
          {detail && <p className="mt-1 whitespace-pre-line text-left text-xs leading-relaxed text-slate-600">{detail}</p>}
        </div>
        {body && <div className="px-4 pt-4">{body}</div>}
        {/* ✍️ ช่องข้อความช่องเดียว (เหตุผล ฯลฯ) — บังคับได้ · โฟกัสให้เลยจะได้พิมพ์แล้วกด Enter */}
        {input && (
          <div className="px-4 pt-4">
            <label className="block text-[11px] font-bold text-slate-500">
              {input.label}
              {input.required && <span className="text-rose-500"> *</span>}
            </label>
            <input
              autoFocus
              value={text}
              maxLength={input.maxLength ?? 200}
              onChange={(e) => setText(e.target.value)}
              placeholder={input.placeholder}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
          </div>
        )}
        {/* มีทางเลือกที่แนะนำ → ปุ่มนั้นเด่นเต็มแถวบน ส่วนปุ่มยืนยันถอยเป็นปุ่มเงียบ */}
        {altLabel && onAlt ? (
          <div className="p-4">
            <button
              type="button"
              autoFocus
              onClick={onAlt}
              className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700"
            >
              {altLabel}
            </button>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => onConfirm(text)}
                disabled={!canConfirm}
                className={`flex-1 rounded-xl border py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  danger
                    ? "border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        ) : (
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
              autoFocus={!input}
              onClick={() => onConfirm(text)}
              disabled={!canConfirm}
              className={`flex-1 rounded-xl py-2.5 text-sm font-extrabold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                danger ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
