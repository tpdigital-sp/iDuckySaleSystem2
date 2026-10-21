"use client";

import { useState } from "react";
import Portal from "@/components/Portal";
import { giftPairLabel, giftPairQty } from "@/lib/gifts";

/**
 * 🔗 หน้าต่างจับคู่ "แบบของแถม (รองหลัง) ↔ แบบสินค้า" — ใช้ร่วมหน้าออเดอร์หลังบ้าน + หน้าออเดอร์ลูกค้า
 *    เลือกด้วยรูปใหญ่ ไม่ใช่เลข "รูปที่ 1/2" (เลขอย่างเดียวจับผิดง่าย) · บอกว่ารูปไหนคู่กับรองหลังอื่นไปแล้ว
 *    แขวนที่ <body> ผ่าน Portal — เดิมวางในหน้าแล้วโดนกรอบซ้อนตัดหัว ไม่อยู่กลางจอ (OD-261002-9236 · 7 ต.ค. 69)
 *    🔢 เลือกได้หลายรูป — รองหลัง 1 ลายใส่กับสินค้าหลายแบบ (OD-261012-9950 · 21 ต.ค. 69: MagSafe 4 แบบ/พวงกุญแจ 8 แบบ ใช้รองหลังลายเดียว
 *       เดิมแตะรูปแล้วบันทึกทันที = เลือกได้รูปเดียว แตะรูปถัดไปทับคู่เก่า) → ติ๊กสะสมแล้วกด "บันทึกคู่" ทีเดียว
 */
export default function GiftPairPicker({
  giftName,
  proofUrl,
  proofIndex,
  options,
  current,
  usedBy,
  busy,
  onPick,
  onClose,
}: {
  giftName: string;
  proofUrl: string;
  proofIndex: number;
  options: { url: string; label: string; qty?: number }[];
  /** คู่ที่จับไว้แล้ว (หลายรูปได้) */
  current?: string[];
  /** รูปสินค้านี้ถูกจับคู่กับแบบของแถมรูปอื่นไปแล้ว → index ของรูปนั้น (-1 = ยังว่าง) */
  usedBy: (url: string) => number;
  busy?: boolean;
  /** บันทึกชุดคู่ทั้งหมด (ว่าง = ยกเลิกคู่) */
  onPick: (urls: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(() => (current ?? []).filter((u) => options.some((o) => o.url === u)));
  const toggle = (url: string) => setPicked((l) => (l.includes(url) ? l.filter((u) => u !== url) : [...l, url]));
  const chosen = options.filter((o) => picked.includes(o.url));
  const sum = giftPairQty(chosen);
  const changed = picked.join("\n") !== (current ?? []).join("\n");
  return (
    <Portal>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 text-slate-900 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm font-extrabold">🔗 {giftName} รูปที่ {proofIndex + 1} ใส่คู่กับชิ้นไหน?</p>
          <p className="mt-0.5 text-[11px] text-slate-500">แตะรูปสินค้าที่ใส่คู่กับแบบนี้ — เลือกได้หลายรูป แล้วกด “บันทึกคู่” · ร้านจะแพ็คคู่กันตามที่เลือก</p>
          <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="shrink-0 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proofUrl} alt={`แบบของแถม ${proofIndex + 1}`} className="mx-auto h-36 w-36 rounded-xl bg-slate-50 object-contain ring-2 ring-violet-300" />
              <p className="mt-1 text-[11px] font-bold text-violet-700">🎁 {giftName} รูปที่ {proofIndex + 1}</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-600">
                {chosen.length ? `เลือกแล้ว ${chosen.length} รูป${sum ? ` · รวม ×${sum}` : ""}` : "ยังไม่ได้เลือก"}
              </p>
            </div>
            <div className="grid w-full flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
              {options.map((o) => {
                const on = picked.includes(o.url);
                const other = usedBy(o.url);
                return (
                  <button
                    key={o.url}
                    type="button"
                    disabled={busy}
                    aria-pressed={on}
                    onClick={() => toggle(o.url)}
                    className={`relative rounded-xl p-1.5 text-center transition disabled:opacity-60 ${
                      on ? "bg-violet-50 ring-2 ring-violet-600" : "ring-1 ring-slate-200 hover:ring-2 hover:ring-violet-400"
                    }`}
                  >
                    <span
                      className={`absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full text-[11px] font-black ${
                        on ? "bg-violet-600 text-white" : "bg-white text-transparent ring-1 ring-slate-300"
                      }`}
                    >
                      ✓
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={o.url} alt={o.label} className="mx-auto h-24 w-full rounded-lg bg-slate-50 object-contain" />
                    <span className="mt-1 block text-[11px] font-bold text-slate-800">
                      {o.label}
                      {o.qty ? ` ×${o.qty}` : ""}
                    </span>
                    {other >= 0 && <span className="block text-[10px] font-semibold text-amber-600">คู่กับรูปที่ {other + 1} แล้ว</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {chosen.length > 0 && <span className="mr-auto text-[11px] text-slate-500">↔ {giftPairLabel(chosen)}</span>}
            {(current ?? []).length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick([])}
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-60"
              >
                ยกเลิกคู่ทั้งหมด
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200">
              ปิด
            </button>
            <button
              type="button"
              disabled={busy || !changed}
              onClick={() => onPick(picked)}
              className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {busy ? "กำลังบันทึก…" : `บันทึกคู่${chosen.length ? ` (${chosen.length})` : ""}`}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
