"use client";

import Portal from "@/components/Portal";

/**
 * 🔗 หน้าต่างจับคู่ "แบบของแถม (รองหลัง) ↔ แบบสินค้า" — ใช้ร่วมหน้าออเดอร์หลังบ้าน + หน้าออเดอร์ลูกค้า
 *    เลือกด้วยรูปใหญ่ ไม่ใช่เลข "รูปที่ 1/2" (เลขอย่างเดียวจับผิดง่าย) · บอกว่ารูปไหนคู่กับรองหลังอื่นไปแล้ว
 *    แขวนที่ <body> ผ่าน Portal — เดิมวางในหน้าแล้วโดนกรอบซ้อนตัดหัว ไม่อยู่กลางจอ (OD-261002-9236 · 7 ต.ค. 69)
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
  current?: string;
  /** รูปสินค้านี้ถูกจับคู่กับแบบของแถมรูปอื่นไปแล้ว → index ของรูปนั้น (-1 = ยังว่าง) */
  usedBy: (url: string) => number;
  busy?: boolean;
  onPick: (url: string) => void;
  onClose: () => void;
}) {
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
          <p className="mt-0.5 text-[11px] text-slate-500">แตะรูปสินค้าที่ใส่คู่กับแบบนี้ — ร้านจะแพ็คคู่กันตามที่เลือก</p>
          <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="shrink-0 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proofUrl} alt={`แบบของแถม ${proofIndex + 1}`} className="mx-auto h-36 w-36 rounded-xl bg-slate-50 object-contain ring-2 ring-violet-300" />
              <p className="mt-1 text-[11px] font-bold text-violet-700">🎁 {giftName} รูปที่ {proofIndex + 1}</p>
            </div>
            <div className="grid w-full flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
              {options.map((o) => {
                const on = current === o.url;
                const other = usedBy(o.url);
                return (
                  <button
                    key={o.url}
                    type="button"
                    disabled={busy}
                    onClick={() => onPick(o.url)}
                    className={`rounded-xl p-1.5 text-center transition disabled:opacity-60 ${
                      on ? "bg-violet-50 ring-2 ring-violet-600" : "ring-1 ring-slate-200 hover:ring-2 hover:ring-violet-400"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={o.url} alt={o.label} className="mx-auto h-24 w-full rounded-lg bg-slate-50 object-contain" />
                    <span className="mt-1 block text-[11px] font-bold text-slate-800">
                      {on ? "✓ " : ""}
                      {o.label}
                      {o.qty ? ` ×${o.qty}` : ""}
                    </span>
                    {other >= 0 && <span className="block text-[10px] font-semibold text-amber-600">คู่กับรูปที่ {other + 1} แล้ว</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            {current && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick("")}
                className="rounded-lg px-3 py-1.5 text-xs font-bold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50"
              >
                ยกเลิกคู่
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200">
              ปิด
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
