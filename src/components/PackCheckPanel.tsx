"use client";

import { useState } from "react";
import { shortTime } from "@/lib/admin-ui";
import type { Proof } from "@/lib/admin-data";

/**
 * ปุ่มยืนยันการตรวจนับ — แสดงใต้ภาพขยายในไลต์บ็อกซ์
 * พนักงานแพ็คต้องกดทุกรูปก่อน ระบบถึงจะยอมให้ยิงเลขพัสดุ
 */
export default function PackCheckPanel({
  proof,
  onConfirm,
}: {
  proof?: Proof;
  onConfirm: (status: "ครบ" | "ไม่ครบ", got?: number) => void;
}) {
  const [shortMode, setShortMode] = useState(false);
  const [got, setGot] = useState("");

  if (!proof) return null;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-2xl">
      <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-slate-400">ตรวจนับของตามภาพนี้</p>
      <p className="mt-0.5 text-sm font-bold text-slate-800">
        {proof.qty ? `ต้องได้ ${proof.qty} ชิ้น` : "ไม่ได้ระบุจำนวน"}
        {proof.note ? ` · ${proof.note}` : ""}
      </p>

      {proof.pack && (
        <p className={`mt-1 text-[11px] ${proof.pack.status === "ครบ" ? "text-green-700" : "font-bold text-rose-600"}`}>
          ตรวจแล้ว: {proof.pack.status === "ครบ" ? "ครบ" : `ไม่ครบ — นับได้ ${proof.pack.got ?? 0} ชิ้น`} · {proof.pack.by} ·{" "}
          {shortTime(proof.pack.at)}
        </p>
      )}

      {!shortMode ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onConfirm("ครบ")}
            className="rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-green-700"
          >
            ✅ ครบ
          </button>
          <button
            type="button"
            onClick={() => {
              setGot(proof.pack?.got != null ? String(proof.pack.got) : "");
              setShortMode(true);
            }}
            className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-rose-700"
          >
            ⚠️ ยังไม่ครบ
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <label htmlFor="got" className="text-xs font-bold text-slate-600">
            นับได้จริงกี่ชิ้น{proof.qty ? ` (จาก ${proof.qty})` : ""}
          </label>
          <input
            id="got"
            type="number"
            min={0}
            autoFocus
            value={got}
            onChange={(e) => setGot(e.target.value)}
            placeholder="เช่น 3"
            className="mt-1 w-full rounded-xl border-2 border-rose-300 px-3 py-2 text-lg font-bold focus:border-rose-500 focus:outline-none"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setShortMode(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              ย้อนกลับ
            </button>
            <button
              type="button"
              disabled={got === ""}
              onClick={() => onConfirm("ไม่ครบ", Number(got) || 0)}
              className="flex-1 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              บันทึกว่าไม่ครบ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
